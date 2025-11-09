"""DISM health check/repair service.

Provides helpers to run common DISM image health actions and parse their
console output into a structured summary usable by the UI and reports.
"""

import subprocess
import logging
import sys
import re
from typing import Dict, Any, List, Callable, Optional, TypedDict

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


# Light type aliases to document intent.
Task = Dict[str, Any]
TaskResult = Dict[str, Any]


def parse_dism_output(output: str) -> Dict[str, Any]:
    """Parse DISM output for component store health and repair status.

    Looks for key phrases such as:
      - "The component store is repairable"
      - "The component store corruption was repaired"
      - "The restore operation completed successfully"
      - Progress and error codes.
    """
    lines = [l.strip() for l in output.splitlines() if l.strip()]
    health_state: Optional[str] = None
    repair_attempted = False
    repair_success: Optional[bool] = None
    error_code: Optional[str] = None
    access_denied = False
    source_files_missing = False
    operation_complete = False
    corruption_detected = False

    for l in lines:
        low = l.lower()

        # Check for completion
        if (
            "operation completed successfully" in low
            or "the operation completed successfully" in low
        ):
            operation_complete = True
            if repair_attempted and repair_success is None:
                repair_success = True

        # Check for access/privilege issues
        if "access" in low and "denied" in low:
            access_denied = True
        if "error: 5" in low:  # Windows error 5 = Access Denied
            access_denied = True

        # Health state detection
        if (
            "component store corruption repaired" in low
            or "corruption was repaired" in low
        ):
            health_state = "repaired"
            repair_attempted = True
            repair_success = True
            corruption_detected = True
        elif "component store is repairable" in low:
            health_state = "repairable"
            corruption_detected = True
        elif "no component store corruption detected" in low:
            health_state = "healthy"
        elif "component store corruption" in low and "detected" in low:
            corruption_detected = True
            if health_state is None:
                health_state = "corrupted"

        # Check for source file issues
        if "source files could not be found" in low or "0x800f081f" in low:
            source_files_missing = True
            error_code = "0x800f081f"
        elif "source files could not be downloaded" in low:
            source_files_missing = True

        # Generic error code extraction
        if "error:" in low and not error_code:
            # Capture patterns like "Error: 0x800f081f" or "Error: 87"
            error_match = re.search(r"error:\s*(0x[0-9a-f]+|\d+)", low)
            if error_match:
                error_code = error_match.group(1)
            else:
                # Fallback to word-based extraction
                parts = l.split()
                for i, p in enumerate(parts):
                    if p.lower().startswith("error") and i + 1 < len(parts):
                        potential_code = parts[i + 1].rstrip(".,;")
                        if potential_code.startswith("0x") or potential_code.isdigit():
                            error_code = potential_code
                            break

        # Check if this is a restore operation
        if "restorehealth" in low or "restore-health" in low:
            repair_attempted = True

    return {
        "health_state": health_state,
        "repair_attempted": repair_attempted,
        "repair_success": repair_success,
        "error_code": error_code,
        "access_denied": access_denied,
        "source_files_missing": source_files_missing,
        "operation_complete": operation_complete,
        "corruption_detected": corruption_detected,
        "message": "\n".join(lines[-20:]),
    }


def run_dism_health_check(task: Task) -> TaskResult:
    """Run DISM health check and optional restore.

    Task schema:
      type: "dism_health_check"
      actions: list[str] optional sequence among: checkhealth, scanhealth, restorehealth.
               Default: ["checkhealth"]
    """
    actions: List[str] = task.get("actions") or ["checkhealth"]
    valid = {"checkhealth", "scanhealth", "restorehealth"}
    run_sequence: List[str] = [a for a in actions if a.lower() in valid]
    if not run_sequence:
        run_sequence = ["checkhealth"]

    add_breadcrumb(
        "Starting DISM health check",
        category="task",
        level="info",
        data={"actions": run_sequence},
    )

    aggregate: Dict[str, Any] = {"steps": []}
    overall_success = True
    last_parsed: Optional[Dict[str, Any]] = None
    had_corruption = False
    corruption_repaired = False

    for action in run_sequence:
        # DISM uses /CheckHealth, /ScanHealth, /RestoreHealth casing.
        action_lower = action.lower()
        action_flag = {
            "checkhealth": "/CheckHealth",
            "scanhealth": "/ScanHealth",
            "restorehealth": "/RestoreHealth",
        }.get(action_lower, "/CheckHealth")

        cmd = [
            "dism",
            "/Online",
            "/Cleanup-Image",
            action_flag,
        ]

        logger.info("Running DISM step: %s", " ".join(cmd))
        sys.stderr.flush()

        add_breadcrumb(
            f"Executing DISM {action}",
            category="subprocess",
            level="info",
            data={"action": action},
        )

        try:
            # RestoreHealth can take a long time
            timeout = 7200 if action_lower == "restorehealth" else 3600
            proc = run_with_skip_check(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                timeout=timeout,
            )
        except FileNotFoundError:
            return {
                "task_type": "dism_health_check",
                "status": "error",
                "summary": {"error": "dism command not found in system PATH"},
            }
        except subprocess.TimeoutExpired:
            return {
                "task_type": "dism_health_check",
                "status": "error",
                "summary": {
                    "error": f"DISM {action} operation timed out",
                    "action": action,
                },
            }
        except Exception as e:  # noqa: BLE001
            logger.error(f"Exception running DISM {action}: {e}")
            return {
                "task_type": "dism_health_check",
                "status": "error",
                "summary": {
                    "error": f"Unexpected exception: {str(e)}",
                    "action": action,
                },
            }

        parsed = parse_dism_output(proc.stdout)
        parsed["return_code"] = proc.returncode

        add_breadcrumb(
            f"DISM {action} completed",
            category="task",
            level="info",
            data={
                "return_code": proc.returncode,
                "health_state": parsed.get("health_state"),
                "corruption_detected": parsed.get("corruption_detected"),
            },
        )

        # Track corruption status across steps
        if parsed.get("corruption_detected"):
            had_corruption = True
        if parsed.get("health_state") == "repaired":
            corruption_repaired = True

        # Determine step success
        step_success = True
        if parsed.get("access_denied"):
            step_success = False
            parsed["error"] = "Access denied. DISM requires administrator privileges."
        elif parsed.get("source_files_missing"):
            step_success = False
            parsed["error"] = (
                "Source files not available. Check Windows Update or specify /Source."
            )
        elif proc.returncode != 0:
            if parsed.get("error_code"):
                parsed["error"] = f"DISM failed with error code {parsed['error_code']}"
            else:
                parsed["error"] = f"DISM failed with exit code {proc.returncode}"
            step_success = False
        elif not parsed.get("operation_complete"):
            # For some actions, operation_complete might not be explicitly stated
            # but return code 0 is still success
            if proc.returncode == 0:
                step_success = True
            else:
                step_success = False

        if not step_success:
            overall_success = False

        aggregate["steps"].append(
            {
                "action": action,
                "return_code": proc.returncode,
                "parsed": parsed,
                "stderr": proc.stderr.strip() if proc.stderr else "",
                "command": cmd,
                "success": step_success,
            }
        )
        last_parsed = parsed

    # Build final summary
    summary: Dict[str, Any] = aggregate
    if last_parsed is not None:
        # Merge last parsed data into summary (avoiding key conflicts)
        for k, v in last_parsed.items():
            if k not in summary:
                summary[k] = v

    # Determine overall status with improved logic
    if not overall_success:
        # Check if any step had access denied
        if any(
            step.get("parsed", {}).get("access_denied") for step in aggregate["steps"]
        ):
            status = "error"
            summary["error"] = "Access denied. DISM requires administrator privileges."
        elif any(
            step.get("parsed", {}).get("source_files_missing")
            for step in aggregate["steps"]
        ):
            status = "warning"
            summary["warning"] = (
                "Source files not available for repair. Component store may still have issues."
            )
        else:
            status = "error"
            summary["error"] = "One or more DISM operations failed."
    elif corruption_repaired:
        status = "success"
        summary["verdict"] = "Component store corruption was successfully repaired."
    elif had_corruption and not corruption_repaired:
        status = "warning"
        summary["warning"] = (
            "Component store corruption detected but not fully repaired. Consider running DISM /RestoreHealth."
        )
    elif last_parsed and last_parsed.get("health_state") == "healthy":
        status = "success"
        summary["verdict"] = "Component store is healthy. No corruption detected."
    elif last_parsed and last_parsed.get("health_state") == "repairable":
        status = "warning"
        summary["warning"] = (
            "Component store is repairable. Run DISM /RestoreHealth to fix."
        )
    else:
        status = "success"
        summary["verdict"] = "DISM health check completed successfully."

    add_breadcrumb(
        f"DISM health check finished with status: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "warning"
        else "error",
        data={
            "had_corruption": had_corruption,
            "corruption_repaired": corruption_repaired,
            "steps_completed": len(aggregate["steps"]),
        },
    )

    return {
        "task_type": "dism_health_check",
        "status": status,
        "summary": summary,
    }


__all__ = ["run_dism_health_check", "parse_dism_output"]
