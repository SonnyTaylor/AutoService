"""WinSAT disk benchmark service.

Runs Windows System Assessment Tool disk benchmarks to measure storage performance.

Task schema (dict expected):
  type: "winsat_disk"
  drive: str (required) - drive letter (e.g., "C:", "D:")
  test_mode: str (optional) - "full" (default) | "random_read" | "sequential_read" | "sequential_write" | "flush"

Return dict structure:
  {
    task_type: "winsat_disk",
    status: "success" | "failure",
    summary: {
      drive: str,
      test_mode: str,
      duration_seconds: float,
      results: {
        random_read_mbps: float,
        random_read_score: float,
        sequential_read_mbps: float,
        sequential_read_score: float,
        sequential_write_mbps: float,
        sequential_write_score: float,
        avg_read_time_seq_writes_ms: float,
        avg_read_time_seq_writes_score: float,
        latency_95th_percentile_ms: float,
        latency_95th_percentile_score: float,
        latency_max_ms: float,
        latency_max_score: float,
        avg_read_time_random_writes_ms: float,
        avg_read_time_random_writes_score: float,
      },
      human_readable: {
        verdict: str,
        notes: list[str],
        score: float,  # overall score 0-100
        rating_stars: int  # 1-5 stars
      },
      command: list[str],
      exit_code: int,
      stdout_excerpt: str,
      stderr_excerpt: str,
    }
  }
"""

from __future__ import annotations

import subprocess
import logging
import re
import time
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _normalize_drive(drive: str) -> str:
    """Normalize drive letter to format: 'C'."""
    d = (drive or "C:").strip().replace("/", "\\")
    # Accept forms like "C", "C:", "C:\\"
    if len(d) >= 1:
        return d[0].upper()
    return "C"


def _parse_winsat_output(output: str) -> Dict[str, Any]:
    """Parse WinSAT disk output and extract performance metrics.

    Example patterns:
    > Disk  Random 16.0 Read                       737.13 MB/s          8.5
    > Disk  Sequential 64.0 Read                   1660.40 MB/s         8.9
    > Disk  Sequential 64.0 Write                  1655.60 MB/s         8.9
    > Average Read Time with Sequential Writes     0.076 ms             8.8
    > Latency: 95th Percentile                     0.210 ms             8.9
    > Latency: Maximum                             3.091 ms             8.7
    > Average Read Time with Random Writes         0.077 ms             8.9
    """
    results: Dict[str, Any] = {}

    # Random Read: Disk  Random 16.0 Read                       737.13 MB/s          8.5
    m = re.search(
        r"Disk\s+Random\s+[\d.]+\s+Read\s+([\d.]+)\s+MB/s\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["random_read_mbps"] = float(m.group(1))
            results["random_read_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Sequential Read: Disk  Sequential 64.0 Read                   1660.40 MB/s          8.9
    m = re.search(
        r"Disk\s+Sequential\s+[\d.]+\s+Read\s+([\d.]+)\s+MB/s\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["sequential_read_mbps"] = float(m.group(1))
            results["sequential_read_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Sequential Write: Disk  Sequential 64.0 Write                  1655.60 MB/s          8.9
    m = re.search(
        r"Disk\s+Sequential\s+[\d.]+\s+Write\s+([\d.]+)\s+MB/s\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["sequential_write_mbps"] = float(m.group(1))
            results["sequential_write_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Average Read Time with Sequential Writes: 0.076 ms          8.8
    m = re.search(
        r"Average Read Time with Sequential Writes\s+([\d.]+)\s+ms\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["avg_read_time_seq_writes_ms"] = float(m.group(1))
            results["avg_read_time_seq_writes_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Latency: 95th Percentile: 0.210 ms          8.9
    m = re.search(
        r"Latency:\s+95th Percentile\s+([\d.]+)\s+ms\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["latency_95th_percentile_ms"] = float(m.group(1))
            results["latency_95th_percentile_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Latency: Maximum: 3.091 ms          8.7
    m = re.search(
        r"Latency:\s+Maximum\s+([\d.]+)\s+ms\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["latency_max_ms"] = float(m.group(1))
            results["latency_max_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Average Read Time with Random Writes: 0.077 ms             8.9
    m = re.search(
        r"Average Read Time with Random Writes\s+([\d.]+)\s+ms\s+([\d.]+)",
        output,
        re.IGNORECASE,
    )
    if m:
        try:
            results["avg_read_time_random_writes_ms"] = float(m.group(1))
            results["avg_read_time_random_writes_score"] = float(m.group(2))
        except Exception:  # noqa: BLE001
            pass

    # Extract runtime: > Total Run Time 00:00:04.88
    m = re.search(r"Total Run Time\s+(\d+):(\d+):([\d.]+)", output, re.IGNORECASE)
    if m:
        try:
            hours = int(m.group(1))
            minutes = int(m.group(2))
            seconds = float(m.group(3))
            results["total_run_time_seconds"] = hours * 3600 + minutes * 60 + seconds
        except Exception:  # noqa: BLE001
            pass

    return results


def _calculate_verdict(results: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate human-readable verdict from WinSAT results."""
    notes: List[str] = []
    score = 0.0
    count = 0

    # Use WinSAT scores (out of ~9.9) to calculate overall score
    score_fields = [
        ("random_read_score", "Random Read"),
        ("sequential_read_score", "Sequential Read"),
        ("sequential_write_score", "Sequential Write"),
        ("avg_read_time_seq_writes_score", "Read w/ Seq Writes"),
        ("latency_95th_percentile_score", "95th Percentile Latency"),
        ("latency_max_score", "Max Latency"),
        ("avg_read_time_random_writes_score", "Read w/ Random Writes"),
    ]

    for field, label in score_fields:
        val = results.get(field)
        if val is not None and isinstance(val, (int, float)):
            score += float(val)
            count += 1

            # Add notes for exceptionally good or poor performance
            if float(val) >= 9.0:
                notes.append(f"Excellent {label}")
            elif float(val) < 5.0:
                notes.append(f"Poor {label}")

    # Average score and normalize to 0-100 scale (assume max WinSAT score is ~9.9)
    if count > 0:
        avg_score = score / count
        normalized_score = (avg_score / 9.9) * 100.0
        score = max(0.0, min(100.0, normalized_score))
    else:
        score = 0.0

    # Check for performance concerns
    seq_read = results.get("sequential_read_mbps")
    if seq_read is not None and isinstance(seq_read, (int, float)):
        if float(seq_read) < 100:
            notes.append("Slow sequential read (HDD-like)")
        elif float(seq_read) > 3000:
            notes.append("Excellent NVMe performance")

    seq_write = results.get("sequential_write_mbps")
    if seq_write is not None and isinstance(seq_write, (int, float)):
        if float(seq_write) < 50:
            notes.append("Very slow write speed")

    latency_95th = results.get("latency_95th_percentile_ms")
    if latency_95th is not None and isinstance(latency_95th, (int, float)):
        if float(latency_95th) > 10.0:
            notes.append("High latency detected")

    # Determine verdict
    verdict = (
        "excellent"
        if score >= 85
        else "good"
        if score >= 70
        else "fair"
        if score >= 50
        else "poor"
    )

    # Star rating 1-5
    if score >= 85:
        rating_stars = 5
    elif score >= 70:
        rating_stars = 4
    elif score >= 50:
        rating_stars = 3
    elif score >= 30:
        rating_stars = 2
    else:
        rating_stars = 1

    return {
        "verdict": verdict,
        "notes": notes,
        "score": round(score, 1),
        "rating_stars": rating_stars,
    }


def run_winsat_disk(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute WinSAT disk benchmark.

    Expected task fields:
    - type: "winsat_disk"
    - drive: string (e.g., "C:", "D:"), default "C:"
    - test_mode: "full" | "random_read" | "sequential_read" | "sequential_write" | "flush"
    """
    drive = _normalize_drive(task.get("drive", "C:"))
    test_mode = task.get("test_mode", "full")

    add_breadcrumb(
        "Starting WinSAT disk benchmark",
        category="task",
        level="info",
        data={"drive": drive, "test_mode": test_mode},
    )

    # Build command based on test mode
    # winsat disk <-seq|-ran> <-read|-write> -drive <letter>
    # or: winsat disk -drive <letter> (runs all tests)

    if test_mode == "full":
        # Run all tests (no mode specified)
        command = ["winsat", "disk", "-drive", drive]
    elif test_mode == "random_read":
        command = ["winsat", "disk", "-ran", "-read", "-drive", drive]
    elif test_mode == "sequential_read":
        command = ["winsat", "disk", "-seq", "-read", "-drive", drive]
    elif test_mode == "sequential_write":
        command = ["winsat", "disk", "-seq", "-write", "-drive", drive]
    elif test_mode == "flush":
        command = ["winsat", "disk", "flush", "-drive", drive]
    else:
        return {
            "task_type": "winsat_disk",
            "status": "failure",
            "summary": {
                "reason": f"Invalid test_mode: {test_mode}. Must be one of: full, random_read, sequential_read, sequential_write, flush",
            },
        }

    logger.info("Executing WinSAT disk command: %s", " ".join(command))

    add_breadcrumb(
        "Executing WinSAT disk benchmark",
        category="subprocess",
        level="info",
        data={"test_mode": test_mode},
    )

    started = time.time()
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
            "task_type": "winsat_disk",
            "status": "failure",
            "summary": {
                "reason": "winsat.exe not found. WinSAT is only available on Windows.",
            },
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "winsat_disk",
            "status": "failure",
            "summary": {
                "reason": f"Exception starting winsat: {e}",
            },
        }

    ended = time.time()
    duration = round(ended - started, 2)

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    output = stdout + "\n" + stderr

    # Parse results
    results = _parse_winsat_output(output)

    # Calculate human-readable verdict
    human_readable = _calculate_verdict(results)

    # Determine status
    if proc.returncode == 0 and results:
        status = "success"
    elif proc.returncode == 0:
        status = "success"
        human_readable["notes"].append("Benchmark completed but no metrics extracted")
    else:
        status = "failure"

    add_breadcrumb(
        f"WinSAT benchmark completed: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "drive": drive,
            "score": human_readable.get("score"),
            "verdict": human_readable.get("verdict"),
            "duration_seconds": duration,
        },
    )

    summary = {
        "drive": drive + ":",
        "test_mode": test_mode,
        "duration_seconds": duration,
        "results": results,
        "human_readable": human_readable,
        "command": command,
        "exit_code": proc.returncode,
        "stdout_excerpt": stdout[:2000] if stdout else "",
        "stderr_excerpt": stderr[:1000] if stderr else "",
    }

    return {
        "task_type": "winsat_disk",
        "status": status,
        "summary": summary,
    }


__all__ = ["run_winsat_disk"]
