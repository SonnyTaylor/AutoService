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
import sys
from typing import Dict, Any, Optional

# Import subprocess utility with skip checking
try:
    from subprocess_utils import run_with_skip_check
except ImportError:
    # Fallback if utility not available
    run_with_skip_check = subprocess.run

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
    summary["errors_found"] = bool(
        re.search(
            r"Windows found errors|Errors found|CHKDSK cannot continue",
            output,
            re.IGNORECASE,
        )
    )
    summary["volume_in_use"] = bool(
        re.search(
            r"volume is in use by another process|cannot lock|cannot run because.*in use",
            output,
            re.IGNORECASE,
        )
    )
    summary["prompted_schedule_or_dismount"] = bool(
        re.search(
            r"Would you like to (schedule|force a dismount)", output, re.IGNORECASE
        )
    )
    summary["made_corrections"] = bool(
        re.search(r"made corrections to the file system", output, re.IGNORECASE)
    )
    summary["access_denied"] = bool(
        re.search(r"Access (is )?denied|insufficient privileges", output, re.IGNORECASE)
    )
    summary["invalid_drive"] = bool(
        re.search(
            r"cannot find the drive specified|invalid drive", output, re.IGNORECASE
        )
    )

    # Extract filesystem type
    fs_match = re.search(r"The type of the file system is (\w+)", output, re.IGNORECASE)
    if fs_match:
        summary["filesystem_type"] = fs_match.group(1)

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

    add_breadcrumb(
        "Starting CHKDSK scan",
        category="task",
        level="info",
        data={"drive": drive, "mode": mode, "schedule_if_busy": schedule_if_busy},
    )

    if mode not in {"read_only", "fix_errors", "comprehensive"}:
        return {
            "task_type": "chkdsk_scan",
            "status": "error",
            "summary": {
                "error": f"Invalid mode: {mode}. Must be 'read_only', 'fix_errors', or 'comprehensive'."
            },
        }

    command = _build_chkdsk_command(drive, mode)
    logger.info("Executing CHKDSK command: %s", " ".join(command))
    sys.stderr.flush()

    add_breadcrumb(
        f"Executing CHKDSK on {drive}",
        category="subprocess",
        level="info",
        data={"mode": mode},
    )

    started = time.time()
    try:
        proc = run_with_skip_check(
            command,
            input=("Y\n" if schedule_if_busy else None),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=3600,  # 1 hour timeout for comprehensive scans
        )
    except FileNotFoundError:
        return {
            "task_type": "chkdsk_scan",
            "status": "error",
            "summary": {"error": "chkdsk command not found in system PATH"},
        }
    except subprocess.TimeoutExpired:
        return {
            "task_type": "chkdsk_scan",
            "status": "error",
            "summary": {
                "error": "CHKDSK operation timed out after 1 hour",
                "drive": drive,
                "mode": mode,
            },
        }
    except Exception as e:
        logger.error(f"Exception running CHKDSK: {e}")
        return {
            "task_type": "chkdsk_scan",
            "status": "error",
            "summary": {
                "error": f"Unexpected exception: {str(e)}",
                "drive": drive,
                "mode": mode,
            },
        }

    ended = time.time()
    output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    parsed = parse_chkdsk_output(output)
    parsed["return_code"] = proc.returncode

    add_breadcrumb(
        "CHKDSK execution completed",
        category="task",
        level="info",
        data={
            "return_code": proc.returncode,
            "duration_seconds": round(ended - started, 2),
            "errors_found": parsed.get("errors_found"),
            "made_corrections": parsed.get("made_corrections"),
        },
    )
    parsed["drive"] = drive
    parsed["mode"] = mode
    parsed.setdefault("duration_seconds", round(ended - started, 3))

    # Store output preview for debugging (last 1000 chars)
    if output:
        parsed["output_preview"] = output[-1000:] if len(output) > 1000 else output

    # Determine status with improved logic
    if parsed.get("access_denied"):
        status = "error"
        parsed["error"] = (
            "Access denied. CHKDSK requires administrator privileges for this operation."
        )
    elif parsed.get("invalid_drive"):
        status = "error"
        parsed["error"] = f"Drive {drive} not found or invalid."
    elif parsed.get("volume_in_use"):
        if parsed.get("prompted_schedule_or_dismount") and schedule_if_busy:
            status = "success"
            parsed["scheduled"] = True
            parsed["note"] = f"CHKDSK scheduled for {drive} on next boot"
        elif mode != "read_only":
            status = "warning"
            parsed["warning"] = (
                f"Volume {drive} is in use. Set schedule_if_busy=true to schedule for next boot."
            )
        else:
            # Read-only mode can still provide useful info even if volume is busy
            status = "success" if proc.returncode == 0 else "warning"
    elif parsed.get("errors_found") and mode == "read_only":
        status = "warning"
        parsed["warning"] = (
            "Errors detected. Run with fix_errors or comprehensive mode to repair."
        )
    elif parsed.get("found_no_problems"):
        status = "success"
        parsed["verdict"] = "No problems found. File system is healthy."
    elif parsed.get("made_corrections"):
        status = "success"
        parsed["verdict"] = "File system errors were successfully repaired."
    elif proc.returncode == 0:
        status = "success"
        parsed["verdict"] = "CHKDSK completed successfully."
    elif proc.returncode == 2:
        # Exit code 2: disk cleanup required or errors found
        if mode == "read_only":
            status = "warning"
            parsed["warning"] = "Errors found. Disk requires repair with /f option."
        else:
            status = "error"
            parsed["error"] = "CHKDSK could not complete repairs. Exit code 2."
    elif proc.returncode == 3:
        status = "error"
        parsed["error"] = (
            "CHKDSK encountered errors and could not be scheduled. Exit code 3."
        )
    else:
        status = "error"
        parsed["error"] = f"CHKDSK failed with exit code {proc.returncode}."

    add_breadcrumb(
        f"CHKDSK scan finished with status: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "warning"
        else "error",
        data={
            "drive": drive,
            "mode": mode,
            "scheduled": parsed.get("scheduled", False),
            "volume_in_use": parsed.get("volume_in_use", False),
        },
    )

    return {
        "task_type": "chkdsk_scan",
        "status": status,
        "summary": parsed,
    }
