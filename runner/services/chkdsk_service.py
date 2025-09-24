"""CHKDSK service: run filesystem checks with various modes and parse output.

Supports three modes:
- read_only:    chkdsk <drive>
- fix_errors:   chkdsk <drive> /f
- comprehensive: chkdsk <drive> /f /r

If the volume is in use, the service can optionally auto-respond "Y" to schedule
the check for next boot (system drive) or to force dismount (non-system drives)
by setting `schedule_if_busy: true` in the task payload.
"""

from __future__ import annotations

import subprocess
import logging
import re
import time
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def _normalize_drive(drive: str) -> str:
    d = (drive or "C:").strip().replace("/", "\\")
    # Accept forms like "C", "C:", "C:\\", "C:\\path" (we only keep the root)
    if len(d) == 1:
        d = f"{d}:"
    if len(d) >= 2 and d[1] != ":":
        d = f"{d[0]}:"
    return d[:2]  # e.g. "C:"


def _build_chkdsk_command(drive: str, mode: str) -> list[str]:
    args = ["chkdsk", drive]
    if mode == "fix_errors":
        args += ["/f"]
    elif mode == "comprehensive":
        args += ["/f", "/r"]
    # read_only has no extra args
    return args


def _parse_duration_ms(text: str) -> Optional[int]:
    # Example: Total duration: 4.16 minutes (250086 ms).
    m = re.search(r"Total duration:\s*[^()]*\((\d+)\s*ms\)\.", text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None


def _int_from_kb_line(pattern: str, text: str) -> Optional[int]:
    # pattern example: r"(\d+)\s+KB total disk space\."
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None


def parse_chkdsk_output(output: str) -> Dict[str, Any]:
    """Extract useful facts from CHKDSK console output."""
    summary: Dict[str, Any] = {}

    # Simple boolean signals
    summary["found_no_problems"] = bool(
        re.search(
            r"found no problems|No further action is required", output, re.IGNORECASE
        )
    )
    summary["volume_in_use"] = bool(
        re.search(r"volume is in use by another process", output, re.IGNORECASE)
    )
    summary["prompted_schedule_or_dismount"] = bool(
        re.search(
            r"Would you like to (schedule|force a dismount)", output, re.IGNORECASE
        )
    )
    summary["made_corrections"] = bool(
        re.search(r"made corrections to the file system", output, re.IGNORECASE)
    )

    # Numbers (as available)
    summary["total_disk_kb"] = _int_from_kb_line(
        r"(\d+)\s+KB total disk space\.", output
    )
    summary["in_files_kb"] = _int_from_kb_line(r"(\d+)\s+KB in \d+ files\.", output)
    summary["in_indexes_kb"] = _int_from_kb_line(r"(\d+)\s+KB in \d+ indexes\.", output)
    summary["bad_sectors_kb"] = _int_from_kb_line(
        r"(\d+)\s+KB in bad sectors\.", output
    )
    summary["system_use_kb"] = _int_from_kb_line(
        r"(\d+)\s+KB in use by the system\.", output
    )
    summary["available_kb"] = _int_from_kb_line(
        r"(\d+)\s+KB available on disk\.", output
    )

    ms = _parse_duration_ms(output)
    if ms is not None:
        summary["duration_seconds"] = round(ms / 1000.0, 3)

    return summary


def run_chkdsk_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run CHKDSK with requested mode.

    Expected task fields:
    - type: "chkdsk_scan"
    - drive: string (e.g., "C:"), default "C:"
    - mode: "read_only" | "fix_errors" | "comprehensive" (default: "read_only")
    - schedule_if_busy: bool (default: False) – auto-answer 'Y' to prompts
    """
    drive = _normalize_drive(task.get("drive", "C:"))
    mode = task.get("mode", "read_only")
    schedule_if_busy = bool(task.get("schedule_if_busy", False))

    if mode not in {"read_only", "fix_errors", "comprehensive"}:
        return {
            "task_type": "chkdsk_scan",
            "status": "failure",
            "summary": {"reason": f"Invalid mode: {mode}"},
        }

    command = _build_chkdsk_command(drive, mode)
    logger.info("Executing CHKDSK command: %s", " ".join(command))

    started = time.time()
    try:
        proc = subprocess.run(
            command,
            input=("Y\n" if schedule_if_busy else None),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return {
            "task_type": "chkdsk_scan",
            "status": "failure",
            "summary": {"reason": "chkdsk not found in PATH"},
        }
    except Exception as e:
        return {
            "task_type": "chkdsk_scan",
            "status": "failure",
            "summary": {"reason": f"Exception starting chkdsk: {e}"},
        }

    ended = time.time()
    output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    parsed = parse_chkdsk_output(output)
    parsed["return_code"] = proc.returncode
    parsed["output"] = output
    parsed["drive"] = drive
    parsed["mode"] = mode
    parsed.setdefault("duration_seconds", round(ended - started, 3))

    # Determine status heuristically
    scheduled = (
        parsed.get("volume_in_use")
        and parsed.get("prompted_schedule_or_dismount")
        and schedule_if_busy
    )
    if scheduled:
        status = "success"
        parsed["scheduled"] = True
        parsed["note"] = "CHKDSK scheduled due to busy volume"
    else:
        if parsed.get("volume_in_use") and not schedule_if_busy and mode != "read_only":
            status = "skipped"
            parsed["reason"] = "Volume busy; set schedule_if_busy to true to schedule"
        else:
            # For read-only, any exit code is acceptable; for fix/comprehensive prefer 0 or 1
            if mode == "read_only":
                status = "success"
            else:
                status = (
                    "success" if proc.returncode in (0, 1) else "completed_with_errors"
                )

    return {
        "task_type": "chkdsk_scan",
        "status": status,
        "summary": parsed,
    }
