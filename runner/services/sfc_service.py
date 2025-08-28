import subprocess
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def parse_sfc_output(output: str) -> Dict[str, Any]:
    """Parse the output from `sfc /scannow` into structured data.

    Captures whether integrity violations were found and if repairs succeeded.
    """
    integrity_violations = None  # None = unknown, False = none, True = found
    repairs_attempted = False
    repairs_successful: bool | None = None
    message_lines: List[str] = []

    for line in output.splitlines():
        l = line.strip()
        if not l:
            continue
        message_lines.append(l)
        if "did not find any integrity violations" in l:
            integrity_violations = False
            repairs_attempted = False
            repairs_successful = None
        elif "found corrupt files and successfully repaired them" in l:
            integrity_violations = True
            repairs_attempted = True
            repairs_successful = True
        elif "found corrupt files but was unable to fix some of them" in l:
            integrity_violations = True
            repairs_attempted = True
            repairs_successful = False
        elif "could not perform the requested operation" in l:
            # Operation failed before determining full status
            integrity_violations = None
            repairs_attempted = False
            repairs_successful = False

    return {
        "integrity_violations": integrity_violations,
        "repairs_attempted": repairs_attempted,
        "repairs_successful": repairs_successful,
        "message": "\n".join(message_lines[-15:]),  # last few lines (most relevant)
    }


def run_sfc_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run `sfc /scannow` and return structured JSON-style result.

    Task schema:
      type: "sfc_scan"
      (no additional fields currently)
    """
    command = ["sfc", "/scannow"]
    logger.info("Running SFC scan: %s", " ".join(command))
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
            "task_type": "sfc_scan",
            "status": "failure",
            "summary": {"error": "'sfc' command not found in PATH"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "sfc_scan",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    parsed = parse_sfc_output(proc.stdout)

    success = proc.returncode == 0 or parsed["repairs_successful"] is not False

    result: Dict[str, Any] = {
        "task_type": "sfc_scan",
        "status": "success" if success else "failure",
        "summary": parsed,
        "return_code": proc.returncode,
    }
    if proc.returncode != 0:
        result["summary"]["stderr"] = proc.stderr.strip()
    return result


__all__ = ["run_sfc_scan", "parse_sfc_output"]
