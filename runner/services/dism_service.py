"""DISM health check/repair service.

Provides helpers to run common DISM image health actions and parse their
console output into a structured summary usable by the UI and reports.
"""

import subprocess
import logging
from typing import Dict, Any, List, Callable, Optional, TypedDict

logger = logging.getLogger(__name__)


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
    health_state: str | None = None
    repair_attempted = False
    repair_success: bool | None = None
    error_code: str | None = None

    for l in lines:
        low = l.lower()
        if (
            "component store corruption repaired" in low
            or "corruption was repaired" in low
        ):
            health_state = "repaired"
            repair_attempted = True
            repair_success = True
        elif "component store is repairable" in low:
            health_state = "repairable"
        elif "operation completed successfully" in low:
            if repair_attempted:
                repair_success = True if repair_success is not False else False
        elif "no component store corruption detected" in low:
            health_state = "healthy"
        elif "error:" in low and not error_code:
            # Capture something like: Error: 0x800f081f
            parts = l.split()
            for i, p in enumerate(parts):
                if p.lower().startswith("error") and i + 1 < len(parts):
                    error_code = parts[i + 1]
                    break

        if "restorehealth" in low:
            repair_attempted = True

    return {
        "health_state": health_state,
        "repair_attempted": repair_attempted,
        "repair_success": repair_success,
        "error_code": error_code,
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

    aggregate: Dict[str, Any] = {"steps": []}
    overall_success = True
    last_parsed: Dict[str, Any] | None = None

    for action in run_sequence:
        # DISM prefers specific casing on switches; normalize here.
        cmd = [
            "dism",
            "/Online",
            "/Cleanup-Image",
            f"/{action.capitalize()}"
            if action.lower() == "checkhealth"
            else f"/{action}",
        ]
        # DISM uses /CheckHealth, /ScanHealth, /RestoreHealth casing.
        cmd[-1] = {
            "checkhealth": "/CheckHealth",
            "scanhealth": "/ScanHealth",
            "restorehealth": "/RestoreHealth",
        }[action.lower()]

        logger.info("Running DISM step: %s", " ".join(cmd))
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except FileNotFoundError:
            return {
                "task_type": "dism_health_check",
                "status": "failure",
                "summary": {"error": "'dism' command not found"},
            }
        except Exception as e:  # noqa: BLE001
            return {
                "task_type": "dism_health_check",
                "status": "failure",
                "summary": {"error": f"Unexpected exception: {e}"},
            }

        parsed = parse_dism_output(proc.stdout)
        step_success = proc.returncode == 0 and (
            parsed.get("repair_success") is not False
        )
        if not step_success:
            overall_success = False
        aggregate["steps"].append(
            {
                "action": action,
                "return_code": proc.returncode,
                "parsed": parsed,
                "stderr": proc.stderr.strip(),
                "command": cmd,
            }
        )
        last_parsed = parsed

    summary: Dict[str, Any] = aggregate
    if last_parsed is not None:
        summary.update({k: v for k, v in last_parsed.items() if k not in summary})

    return {
        "task_type": "dism_health_check",
        "status": "success" if overall_success else "failure",
        "summary": summary,
    }


__all__ = ["run_dism_health_check", "parse_dism_output"]
