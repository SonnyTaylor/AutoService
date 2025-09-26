"""iperf3 network stability test service.

Runs iperf3 client against a specified server for a long duration to assess
throughput stability and packet loss over time. Supports TCP (default) and UDP
tests, forward or reverse direction, multiple streams, JSON parsing, and
periodic interval summaries.

Task schema (dict expected):
  type: 'iperf_test'
  executable_path: str (optional) path to iperf3 executable; default 'iperf3'
  server: str (required) server hostname or IP for '-c'
  port: int (optional) server port, default 5201
  duration_minutes: int (required) total minutes to run (converted to seconds)
  protocol: 'tcp' | 'udp' (optional, default 'tcp')
  reverse: bool (optional, default False) use '-R' to download from server
  parallel_streams: int (optional, default 1) '-P'
  omit_seconds: int (optional, default 0) seconds to omit at start '--omit'
  interval_seconds: int (optional, default 1) reporting interval '-i'
  bandwidth: str (optional, UDP only) target rate like '10M', passed as '-b'
  extra_args: List[str] (optional) additional args to pass through

  output controls (optional):
  include_intervals: bool (default False) include per-interval list in summary
  include_raw: bool (default False) include full iperf JSON in summary
  stability_threshold_bps: int (optional) count intervals below this bps

Return dict structure:
  {
    task_type: 'iperf_test',
    status: 'success' | 'failure',
    summary: {
      server, port, protocol, reverse, duration_seconds, parallel_streams,
      aggregates: { bits_per_second, retransmits (TCP), jitter_ms/packet_loss (UDP) ... },
      interval_stats: { samples, mean_bps, median_bps, min_bps, max_bps, stdev_bps, cov, p10_bps, p90_bps, zero_throughput_intervals, below_threshold_intervals? },
      intervals: [ trimmed per-interval summaries ] (only if include_intervals True),
      raw: { parsed iperf3 JSON (on success) } (only if include_raw True),
      error: str (on failure)
    },
    command: [ ... executed command ... ]
  }
"""

from __future__ import annotations

import subprocess
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


def _build_iperf_command(task: Dict[str, Any]) -> Dict[str, Any]:
    exec_path = task.get("executable_path") or "iperf3"
    server = task.get("server")
    port = task.get("port", 5201)
    duration_minutes = task.get("duration_minutes")
    protocol = (task.get("protocol") or "tcp").lower()
    reverse = bool(task.get("reverse", False))
    parallel_streams = int(task.get("parallel_streams", 1) or 1)
    omit_seconds = int(task.get("omit_seconds", 0) or 0)
    interval_seconds = int(task.get("interval_seconds", 1) or 1)
    bandwidth = task.get("bandwidth")
    extra_args: List[str] = task.get("extra_args", []) or []
    include_intervals = bool(task.get("include_intervals", False))
    include_raw = bool(task.get("include_raw", False))
    stability_threshold_bps = task.get("stability_threshold_bps") or task.get(
        "stability_threshold_mbps"
    )
    # allow Mbps convenience
    if isinstance(
        stability_threshold_bps, str
    ) and stability_threshold_bps.lower().endswith("mbps"):
        try:
            stability_threshold_bps = int(
                float(stability_threshold_bps[:-4]) * 1_000_000
            )
        except Exception:
            stability_threshold_bps = None

    if not server:
        return {"error": "'server' is required"}
    try:
        duration_minutes = int(duration_minutes)
    except Exception:
        return {"error": "'duration_minutes' must be an integer"}
    if duration_minutes <= 0:
        return {"error": "'duration_minutes' must be > 0"}

    duration_seconds = duration_minutes * 60
    cmd: List[str] = [exec_path, "-c", str(server), "-p", str(port), "--json"]

    # Always include interval for regular reporting in iperf output
    if interval_seconds and interval_seconds > 0:
        cmd += ["-i", str(interval_seconds)]

    # Duration
    cmd += ["-t", str(duration_seconds)]

    # Parallel streams
    if parallel_streams and parallel_streams > 1:
        cmd += ["-P", str(parallel_streams)]

    # Omit initial seconds
    if omit_seconds and omit_seconds > 0:
        cmd += ["--omit", str(omit_seconds)]

    # Protocol specifics
    if protocol == "udp":
        cmd.append("-u")
        if bandwidth:
            cmd += ["-b", str(bandwidth)]
    elif protocol != "tcp":
        return {"error": "'protocol' must be 'tcp' or 'udp'"}

    # Direction
    if reverse:
        cmd.append("-R")

    # Append user-provided extra args last
    if extra_args:
        # Ensure list of strings
        try:
            cmd += [str(a) for a in extra_args]
        except Exception:
            return {"error": "'extra_args' must be a list of strings"}

    summary: Dict[str, Any] = {
        "server": server,
        "port": port,
        "protocol": protocol,
        "reverse": reverse,
        "duration_seconds": duration_seconds,
        "parallel_streams": parallel_streams,
        "omit_seconds": omit_seconds,
        "interval_seconds": interval_seconds,
        "bandwidth": bandwidth if protocol == "udp" else None,
        "include_intervals": include_intervals,
        "include_raw": include_raw,
        **(
            {"stability_threshold_bps": stability_threshold_bps}
            if stability_threshold_bps
            else {}
        ),
    }

    return {"command": cmd, "summary": summary}


def _summarize_iperf_json(
    data: Dict[str, Any],
    include_intervals: bool,
    stability_threshold_bps: Optional[int],
) -> Dict[str, Any]:
    """Extract a concise, stable summary from iperf3 JSON output.

    Handles both TCP and UDP result structures.
    """
    summary: Dict[str, Any] = {"aggregates": {}}

    try:
        # End section typically contains overall aggregates
        end = data.get("end") or {}
        intervals = data.get("intervals") or []

        # TCP aggregates
        sum_sent = end.get("sum_sent") or {}
        sum_received = end.get("sum_received") or {}
        sender_bps = sum_sent.get("bits_per_second")
        receiver_bps = sum_received.get("bits_per_second")
        retransmits = None
        # iperf3 may include retransmits count under 'sum_sent' for TCP
        if isinstance(sum_sent, dict):
            retransmits = sum_sent.get("retransmits")

        # UDP aggregates
        cpu = end.get("cpu_utilization_percent") or {}
        streams = end.get("streams") or []
        udp_jitter_ms = None
        udp_loss_percent = None
        # If UDP, the receiver section typically includes jitter and lost_percent
        if isinstance(streams, list) and streams:
            try:
                first = streams[0]
                receiver = first.get("receiver") or {}
                if receiver:
                    udp_jitter_ms = receiver.get("jitter_ms")
                    udp_loss_percent = receiver.get("lost_percent")
            except Exception:
                pass

        aggregates: Dict[str, Any] = {}
        if sender_bps is not None or receiver_bps is not None:
            aggregates["bits_per_second_sender"] = sender_bps
            aggregates["bits_per_second_receiver"] = receiver_bps
        if retransmits is not None:
            aggregates["retransmits"] = retransmits
        if udp_jitter_ms is not None:
            aggregates["jitter_ms"] = udp_jitter_ms
        if udp_loss_percent is not None:
            aggregates["packet_loss_percent"] = udp_loss_percent
        if cpu:
            aggregates["cpu_utilization_percent"] = cpu

        summary["aggregates"] = aggregates

        # Build interval stats for stability view
        bps_values: List[float] = []
        zero_intervals = 0
        below_threshold = 0
        trimmed_intervals: List[Dict[str, Any]] = []
        for iv in intervals:
            s = iv.get("sum") or {}
            if not isinstance(s, dict):
                continue
            bps = s.get("bits_per_second")
            if isinstance(bps, (int, float)):
                bps_values.append(float(bps))
                if bps == 0:
                    zero_intervals += 1
                if (
                    stability_threshold_bps is not None
                    and bps < stability_threshold_bps
                ):
                    below_threshold += 1
            if include_intervals:
                trimmed_intervals.append(
                    {
                        "start": s.get("start"),
                        "end": s.get("end"),
                        "seconds": s.get("seconds"),
                        "bytes": s.get("bytes"),
                        "bits_per_second": bps,
                        "omitted": s.get("omitted"),
                        "sender": s.get("sender"),
                    }
                )

        # Compute concise stats
        def _percentile(sorted_vals: List[float], pct: float) -> Optional[float]:
            if not sorted_vals:
                return None
            k = (len(sorted_vals) - 1) * pct
            f = int(k)
            c = min(f + 1, len(sorted_vals) - 1)
            if f == c:
                return sorted_vals[f]
            return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)

        stats: Dict[str, Any] = {"samples": len(bps_values)}
        if bps_values:
            vals = sorted(bps_values)
            n = len(vals)
            mean = sum(vals) / n
            median = _percentile(vals, 0.5)
            min_v = vals[0]
            max_v = vals[-1]
            # simple population stdev
            var = sum((v - mean) ** 2 for v in vals) / n
            stdev = var**0.5
            cov = stdev / mean if mean else None
            p10 = _percentile(vals, 0.1)
            p90 = _percentile(vals, 0.9)
            stats.update(
                {
                    "mean_bps": mean,
                    "median_bps": median,
                    "min_bps": min_v,
                    "max_bps": max_v,
                    "stdev_bps": stdev,
                    "cov": cov,
                    "p10_bps": p10,
                    "p90_bps": p90,
                    "zero_throughput_intervals": zero_intervals,
                }
            )
            if stability_threshold_bps is not None:
                stats["below_threshold_intervals"] = below_threshold

        summary["interval_stats"] = stats
        if include_intervals:
            summary["intervals"] = trimmed_intervals
    except Exception as e:  # noqa: BLE001
        summary["parse_warning"] = f"Failed to summarize iperf JSON: {e}"

    return summary


def run_iperf_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute an iperf3 client test for long-term stability assessment."""
    build = _build_iperf_command(task)
    if "error" in build:
        return {
            "task_type": "iperf_test",
            "status": "failure",
            "summary": {"error": build["error"]},
        }

    command: List[str] = build["command"]
    summary_base = build["summary"]

    logger.info("Running iperf3: %s", " ".join(command))

    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return {
            "task_type": "iperf_test",
            "status": "failure",
            "summary": {"error": f"File not found: {command[0]}"},
            "command": command,
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "iperf_test",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
            "command": command,
        }

    stdout_text = proc.stdout or ""
    stderr_text = proc.stderr or ""

    # iperf3 uses non-zero exit codes for certain network issues; we still
    # attempt to parse JSON to give meaningful data to the user.
    parsed_json: Optional[Dict[str, Any]] = None
    try:
        parsed_json = json.loads(stdout_text)
    except json.JSONDecodeError:
        # If JSON failed, include excerpts to aid debugging
        return {
            "task_type": "iperf_test",
            "status": "failure",
            "summary": {
                **summary_base,
                "error": "Failed to parse iperf3 JSON output",
                "reason": "Failed to parse iperf3 JSON output",
                "stdout_excerpt": stdout_text[:1000],
                "stderr_excerpt": stderr_text[:1000],
                "exit_code": proc.returncode,
            },
            "command": command,
        }

    summarized = _summarize_iperf_json(
        parsed_json,
        include_intervals=bool(summary_base.get("include_intervals")),
        stability_threshold_bps=summary_base.get("stability_threshold_bps"),
    )

    # Surface iperf3-reported error (top-level field in JSON) when present
    iperf_error: Optional[str] = None
    try:
        if isinstance(parsed_json, dict):
            err = parsed_json.get("error")
            if isinstance(err, str) and err.strip():
                iperf_error = err.strip()
    except Exception:  # noqa: BLE001
        iperf_error = None

    # Treat any iperf3-reported error as a failure regardless of exit code
    status = "success" if (proc.returncode == 0 and not iperf_error) else "failure"
    # For stability testing, even with non-zero exit, provide completed data but
    # mark as failure so the UI can highlight issues.

    final_summary: Dict[str, Any] = {
        **{
            k: v
            for k, v in summary_base.items()
            if k not in ("include_raw", "include_intervals")
        },
        **summarized,
        **({"raw": parsed_json} if summary_base.get("include_raw") else {}),
        "exit_code": proc.returncode,
        "stderr_excerpt": stderr_text[:1000],
    }

    # Provide human-readable reason and include stdout excerpt on failures
    if status == "failure":
        if iperf_error:
            final_summary["error"] = iperf_error
            final_summary["reason"] = iperf_error
        else:
            final_summary["reason"] = f"iperf3 exited with code {proc.returncode}"
        final_summary["stdout_excerpt"] = stdout_text[:1000]

    return {
        "task_type": "iperf_test",
        "status": status,
        "summary": final_summary,
        "command": command,
    }


__all__ = ["run_iperf_test"]
