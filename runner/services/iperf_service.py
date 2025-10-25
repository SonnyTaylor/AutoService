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
      human_readable: { direction, throughput (Mbps stats), stability_score 0-100, verdict, notes, udp_quality? },
      raw: { parsed iperf3 JSON (on success) } (only if include_raw True),
      error: str (on failure),
      reason: str (on failure)
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

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _to_mbps(bits_per_second: Optional[float]) -> Optional[float]:
    if bits_per_second is None:
        return None
    try:
        return float(bits_per_second) / 1_000_000.0
    except Exception:
        return None


def _build_human_readable_summary(
    base: Dict[str, Any], summarized: Dict[str, Any]
) -> Dict[str, Any]:
    protocol = base.get("protocol")
    reverse = bool(base.get("reverse"))
    direction = "download" if reverse else "upload"

    aggregates: Dict[str, Any] = summarized.get("aggregates", {}) or {}
    interval_stats: Dict[str, Any] = summarized.get("interval_stats", {}) or {}

    mean_bps = interval_stats.get("mean_bps")
    median_bps = interval_stats.get("median_bps")
    p10_bps = interval_stats.get("p10_bps")
    p90_bps = interval_stats.get("p90_bps")
    min_bps = interval_stats.get("min_bps")
    max_bps = interval_stats.get("max_bps")
    stdev_bps = interval_stats.get("stdev_bps")
    cov = interval_stats.get("cov")
    zero_intervals = interval_stats.get("zero_throughput_intervals", 0) or 0
    samples = interval_stats.get("samples", 0) or 0

    mean_mbps = _to_mbps(mean_bps)
    median_mbps = _to_mbps(median_bps)
    p10_mbps = _to_mbps(p10_bps)
    p90_mbps = _to_mbps(p90_bps)
    min_mbps = _to_mbps(min_bps)
    max_mbps = _to_mbps(max_bps)
    stdev_mbps = _to_mbps(stdev_bps)
    cov_percent = (
        (float(cov) * 100.0)
        if isinstance(cov, (int, float)) and cov is not None
        else None
    )

    retransmits = aggregates.get("retransmits")
    jitter_ms = aggregates.get("jitter_ms")
    loss_percent = aggregates.get("packet_loss_percent")

    # Stability score 0-100 based on variability and errors
    score = 100.0
    notes: List[str] = []
    if cov_percent is not None:
        score -= min(50.0, max(0.0, cov_percent * 1.5))
        if cov_percent <= 5:
            notes.append("very low variability")
        elif cov_percent <= 10:
            notes.append("low variability")
        elif cov_percent <= 20:
            notes.append("moderate variability")
        else:
            notes.append("high variability")

    if zero_intervals > 0:
        score -= 30.0
        notes.append(f"{zero_intervals} zero-throughput intervals")

    if isinstance(retransmits, (int, float)):
        if retransmits > 0:
            score -= min(20.0, 2.0 + (float(retransmits) ** 0.5))
            notes.append(f"retransmits: {int(retransmits)}")

    if isinstance(loss_percent, (int, float)):
        loss = float(loss_percent)
        if loss >= 5.0:
            score -= 60.0
            notes.append(f"high UDP loss: {loss:.2f}%")
        elif loss >= 1.0:
            score -= 30.0
            notes.append(f"elevated UDP loss: {loss:.2f}%")
        elif loss > 0.0:
            score -= 10.0
            notes.append(f"some UDP loss: {loss:.2f}%")

    score = max(0.0, min(100.0, score))
    if score >= 85:
        verdict = "excellent"
    elif score >= 70:
        verdict = "good"
    elif score >= 50:
        verdict = "fair"
    else:
        verdict = "poor"

    # Helpful range visualization data
    throughput = {
        "unit": "Mbps",
        "mean": mean_mbps,
        "median": median_mbps,
        "p10": p10_mbps,
        "p90": p90_mbps,
        "min": min_mbps,
        "max": max_mbps,
        "stdev": stdev_mbps,
        "cov_percent": cov_percent,
        "samples": samples,
    }

    stability_threshold_bps = base.get("stability_threshold_bps")
    below_threshold = interval_stats.get("below_threshold_intervals")
    if (
        isinstance(stability_threshold_bps, (int, float))
        and isinstance(below_threshold, int)
        and samples
    ):
        throughput["below_threshold_percent"] = round(
            100.0 * below_threshold / samples, 2
        )
        throughput["threshold_mbps"] = _to_mbps(stability_threshold_bps)

    hr: Dict[str, Any] = {
        "protocol": protocol,
        "direction": direction,
        "throughput": throughput,
        "stability_score": round(score, 1),
        "verdict": verdict,
        "notes": notes,
    }

    if protocol == "udp":
        hr["udp_quality"] = {
            "jitter_ms": jitter_ms,
            "loss_percent": loss_percent,
        }

    return hr


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
        if bps_values:
            summary["throughput_over_time_mbps"] = [_to_mbps(v) for v in bps_values]
        if include_intervals:
            summary["intervals"] = trimmed_intervals
    except Exception as e:  # noqa: BLE001
        summary["parse_warning"] = f"Failed to summarize iperf JSON: {e}"

    return summary


def run_iperf_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute an iperf3 client test for long-term stability assessment."""
    add_breadcrumb(
        "Starting iperf3 network test",
        category="task",
        level="info",
        data={
            "server": task.get("server"),
            "duration_minutes": task.get("duration_minutes"),
            "protocol": task.get("protocol", "tcp"),
        },
    )

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

    add_breadcrumb(
        "Executing iperf3 (long-running test)",
        category="subprocess",
        level="info",
        data={"duration_seconds": summary_base.get("duration_seconds")},
    )

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

    # Add human-readable helper section for quick interpretation
    try:
        final_summary["human_readable"] = _build_human_readable_summary(
            summary_base, summarized
        )
    except Exception as _hr_err:  # noqa: BLE001
        final_summary["human_readable_error"] = (
            f"Failed to build human summary: {_hr_err}"
        )

    # Provide human-readable reason and include stdout excerpt on failures
    if status == "failure":
        if iperf_error:
            final_summary["error"] = iperf_error
            final_summary["reason"] = iperf_error
        else:
            final_summary["reason"] = f"iperf3 exited with code {proc.returncode}"
        final_summary["stdout_excerpt"] = stdout_text[:1000]

    add_breadcrumb(
        f"iperf3 test completed: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "protocol": summary_base.get("protocol"),
            "stability_score": final_summary.get("human_readable", {}).get(
                "stability_score"
            ),
        },
    )

    return {
        "task_type": "iperf_test",
        "status": status,
        "summary": final_summary,
        "command": command,
    }


__all__ = ["run_iperf_test"]
