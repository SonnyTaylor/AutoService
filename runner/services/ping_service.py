"""Ping test service.

Runs system `ping` to test connectivity and latency to a specified host.

Task schema (dict expected):
  type: "ping_test"
  host: str (required) - the host to ping, e.g., "8.8.8.8" or "example.com"
  count: int (optional, default 4) - number of echo requests to send
  timeout_ms: int (optional) - per-request timeout; Windows uses ms, Linux seconds
  size_bytes: int (optional) - payload size; Windows `-l`, Linux `-s`

Return dict structure:
  {
    task_type: "ping_test",
    status: "success" | "failure",
    summary: {
      host, count,
      packets: { sent, received, lost, loss_percent },
      latency_ms: { min, avg, max, mdev? },
      interval_stats: { samples, mean, median, p10, p90, stdev },
      human_readable: { stability_score 0-100, verdict, notes },
      message: str (tail of stdout),
      // compatibility:
      packet_loss_percent, average_latency_ms,
      exit_code, stdout_excerpt, stderr_excerpt
    },
    command: [ ... executed command ... ],
  }
"""

import subprocess
import re
import logging
import os
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


def parse_ping_output(output: str) -> Dict[str, Any]:
    """Parse `ping` stdout into structured data for Windows and Linux.

    Extracts per-reply times, packet stats, and min/avg/max summaries.
    """
    message_lines: List[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        message_lines.append(line)

    # Per-reply times: match both Windows and Linux (time=23ms or time=23.4 ms)
    times_ms: List[float] = []
    for l in message_lines:
        m = re.search(r"time=\s*([\d.]+)\s*ms", l, re.IGNORECASE)
        if m:
            try:
                times_ms.append(float(m.group(1)))
            except Exception:
                pass

    # Packet stats
    sent = received = lost = None
    loss_percent: Optional[float] = None

    # Windows: Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)
    for l in message_lines:
        m = re.search(
            r"Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+),\s*Lost\s*=\s*(\d+)\s*\((\d+)% loss\)",
            l,
            re.IGNORECASE,
        )
        if m:
            sent = int(m.group(1))
            received = int(m.group(2))
            lost = int(m.group(3))
            loss_percent = float(m.group(4))
            break

    # Linux: 4 packets transmitted, 4 received, 0% packet loss, time 3004ms
    if loss_percent is None:
        for l in message_lines:
            m = re.search(
                r"(\d+)\s+packets transmitted,\s*(\d+)\s+received,.*?(\d+)%\s+packet loss",
                l,
                re.IGNORECASE,
            )
            if m:
                sent = int(m.group(1))
                received = int(m.group(2))
                loss_percent = float(m.group(3))
                try:
                    lost = sent - received
                except Exception:
                    lost = None
                break

    # Latency summary
    min_ms = avg_ms = max_ms = mdev_ms = None
    # Windows: Minimum = 10ms, Maximum = 50ms, Average = 30ms
    for l in message_lines:
        m = re.search(
            r"Minimum\s*=\s*([\d.]+)ms,\s*Maximum\s*=\s*([\d.]+)ms,\s*Average\s*=\s*([\d.]+)ms",
            l,
            re.IGNORECASE,
        )
        if m:
            try:
                min_ms = float(m.group(1))
                max_ms = float(m.group(2))
                avg_ms = float(m.group(3))
            except Exception:
                pass
            break

    # Linux: rtt min/avg/max/mdev = 37.000/40.000/44.000/2.500 ms
    if avg_ms is None:
        for l in message_lines:
            m = re.search(
                r"rtt\s+min/avg/max/(?:mdev|stddev)\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)\s*ms",
                l,
                re.IGNORECASE,
            )
            if m:
                try:
                    min_ms = float(m.group(1))
                    avg_ms = float(m.group(2))
                    max_ms = float(m.group(3))
                    mdev_ms = float(m.group(4))
                except Exception:
                    pass
                break

    # Derive interval stats from per-reply times if available
    samples = len(times_ms)
    mean = median = p10 = p90 = stdev = None
    if samples:
        vals = sorted(times_ms)
        n = len(vals)
        mean = sum(vals) / n
        # simple population stdev
        stdev = (sum((v - mean) ** 2 for v in vals) / n) ** 0.5

        def pct(sorted_vals: List[float], q: float) -> Optional[float]:
            if not sorted_vals:
                return None
            k = (len(sorted_vals) - 1) * q
            f = int(k)
            c = min(f + 1, len(sorted_vals) - 1)
            if f == c:
                return sorted_vals[f]
            return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)

        median = pct(vals, 0.5)
        p10 = pct(vals, 0.1)
        p90 = pct(vals, 0.9)

    success = False
    if loss_percent is not None:
        success = loss_percent < 100.0 and (received or 0) > 0
    elif samples:
        success = True

    # Back-compat convenience fields
    average_latency_ms = avg_ms if avg_ms is not None else mean

    return {
        "packets": {
            "sent": sent,
            "received": received,
            "lost": lost,
            "loss_percent": loss_percent,
        },
        "latency_ms": {
            "min": min_ms,
            "avg": average_latency_ms,
            "max": max_ms,
            "mdev": mdev_ms,
        },
        "interval_stats": {
            "samples": samples,
            "mean": mean,
            "median": median,
            "p10": p10,
            "p90": p90,
            "stdev": stdev,
        },
        "success": success,
        "message": "\n".join(message_lines[-5:]),
        # compatibility keys
        "packet_loss_percent": loss_percent,
        "average_latency_ms": average_latency_ms,
    }


def run_ping_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the ping test task and return structured result.

    Task schema:
      type: "ping_test"
      host: str (required) - the host to ping, e.g., "google.com"
      count: int (optional) - number of ping packets, default 4
      timeout_ms: int (optional) - per-request timeout
      size_bytes: int (optional) - payload size
    """
    host = task.get("host")
    count = task.get("count", 4)

    add_breadcrumb(
        "Starting ping test",
        category="task",
        level="info",
        data={"host": host, "count": count},
    )
    try:
        count = int(count)
    except Exception:
        count = 4
    timeout_ms = task.get("timeout_ms")
    size_bytes = task.get("size_bytes")

    if not host:
        logger.error("Ping task failed: 'host' not provided.")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": "Host was not specified."},
        }

    # Build command cross-platform
    if os.name != "nt":
        command: List[str] = ["ping", "-c", str(count)]
        # Linux timeout per-probe: -W seconds; prefer rounding up from ms
        if isinstance(timeout_ms, (int, float)):
            try:
                sec = max(1, int((float(timeout_ms) + 999) // 1000))
                command += ["-W", str(sec)]
            except Exception:
                pass
        if isinstance(size_bytes, (int, float)):
            try:
                command += ["-s", str(int(size_bytes))]
            except Exception:
                pass
        command.append(str(host))
    else:
        command = ["ping", "-n", str(count)]
        if isinstance(timeout_ms, (int, float)):
            try:
                command += ["-w", str(int(timeout_ms))]
            except Exception:
                pass
        if isinstance(size_bytes, (int, float)):
            try:
                command += ["-l", str(int(size_bytes))]
            except Exception:
                pass
        command.append(str(host))
    logger.info(f"Executing ping command: {' '.join(command)}")

    add_breadcrumb(
        "Executing ping command",
        category="subprocess",
        level="info",
        data={"host": host, "count": count},
    )

    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )

        if process.returncode != 0:
            logger.warning(f"Ping process exited with code {process.returncode}.")
            # Ping might still have useful output even with non-zero exit

        logger.info("Ping test completed.")
        parsed = parse_ping_output(process.stdout or "")

        add_breadcrumb(
            "Ping output parsed",
            category="task",
            level="info",
            data={
                "success": parsed.get("success"),
                "loss_percent": parsed.get("packets", {}).get("loss_percent"),
            },
        )

        # Build human-readable verdict
        packets = parsed.get("packets") or {}
        loss_pct = packets.get("loss_percent")
        interval = parsed.get("interval_stats") or {}
        mean = interval.get("mean")
        stdev = interval.get("stdev")

        score = 100.0
        notes: List[str] = []
        if isinstance(loss_pct, (int, float)):
            loss = float(loss_pct)
            score -= min(80.0, loss * 1.2)
            if loss >= 10:
                notes.append(f"loss {loss:.1f}%")
            elif loss > 0:
                notes.append(f"loss {loss:.1f}%")
        if isinstance(mean, (int, float)):
            m = float(mean)
            if m > 200:
                score -= 25.0
                notes.append(f"high latency {m:.0f} ms")
            elif m > 100:
                score -= 12.0
                notes.append(f"latency {m:.0f} ms")
        if isinstance(stdev, (int, float)) and isinstance(mean, (int, float)) and mean:
            cov = float(stdev) / float(mean)
            if cov > 0.5:
                score -= 20.0
                notes.append("very unstable")
            elif cov > 0.25:
                score -= 10.0
                notes.append("unstable")

        score = max(0.0, min(100.0, score))
        verdict = (
            "excellent"
            if score >= 85
            else "good"
            if score >= 70
            else "fair"
            if score >= 50
            else "poor"
        )

        human = {
            "stability_score": round(score, 1),
            "verdict": verdict,
            "notes": notes,
        }

        summary = {
            "host": host,
            "count": count,
            **parsed,
            "human_readable": human,
            "exit_code": process.returncode,
            "stdout_excerpt": (process.stdout or "")[:1000],
            "stderr_excerpt": (process.stderr or "")[:1000],
        }

        status = "success" if parsed.get("success") else "failure"

        add_breadcrumb(
            f"Ping test {status}",
            category="task",
            level="info" if status == "success" else "warning",
            data={
                "stability_score": human.get("stability_score"),
                "verdict": human.get("verdict"),
                "average_latency_ms": parsed.get("average_latency_ms"),
            },
        )

        return {
            "task_type": "ping_test",
            "status": status,
            "summary": summary,
            "command": command,
        }

    except FileNotFoundError:
        logger.error("Ping command not found in PATH.")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": "Ping command not found in PATH"},
        }
    except Exception as e:  # noqa: BLE001
        logger.error(f"An unexpected error occurred while running ping: {e}")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": f"An unexpected exception occurred: {str(e)}"},
        }
