"""System File Checker (SFC) scan service.

Runs `sfc /scannow` and parses output into a concise, structured summary.
Handles UTF-16LE/UTF-8 stdout decoding quirks present on Windows.
"""

import subprocess
import logging
import sys
import re
from typing import Dict, Any, List, Tuple, Optional

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def parse_sfc_output(output: str) -> Dict[str, Any]:
    """Parse the output from `sfc /scannow` into structured data.

    Captures whether integrity violations were found and if repairs succeeded.
    """
    integrity_violations: Optional[bool] = (
        None  # None = unknown, False = none, True = found
    )
    repairs_attempted = False
    repairs_successful: Optional[bool] = None
    message_lines: List[str] = []
    verification_complete = False
    pending_reboot = False
    access_denied = False
    winsxs_repair_pending = False

    # Normalize common control characters that appear when output is encoded
    # as UTF-16LE (null bytes between characters). Remove stray nulls and
    # collapse repeated whitespace to make pattern matching robust.
    clean = output.replace("\x00", "")
    # Normalize Windows CRLF to LF and strip leading/trailing whitespace
    clean = clean.replace("\r\n", "\n").strip()

    for line in clean.splitlines():
        l = line.strip()
        if not l:
            continue
        message_lines.append(l)
        low = l.lower()

        # Check for completion
        if re.search(r"verification\s+\d+%\s+complete", low):
            if "100" in l:
                verification_complete = True

        # Check for access/privilege issues
        if "access" in low and "denied" in low:
            access_denied = True
        if "must be an administrator" in low or "requires elevation" in low:
            access_denied = True

        # Main status patterns
        if "did not find any integrity violations" in low:
            integrity_violations = False
            repairs_attempted = False
            repairs_successful = None
        elif "found corrupt files and successfully repaired them" in low:
            integrity_violations = True
            repairs_attempted = True
            repairs_successful = True
        elif "found corrupt files but was unable to fix some of them" in low:
            integrity_violations = True
            repairs_attempted = True
            repairs_successful = False
        elif "found corrupt files" in low and "unable" not in low:
            # Generic "found corrupt files" without repair status
            integrity_violations = True
            repairs_attempted = True  # SFC always attempts repairs when it finds issues
            # repairs_successful left as None until we know more
        elif "could not perform the requested operation" in low:
            # Operation failed before determining full status
            integrity_violations = None
            repairs_attempted = False
            repairs_successful = False
        elif "there is a system repair pending" in low or "pending.xml" in low:
            pending_reboot = True
        elif "details are included in the cbs.log" in low:
            # This typically follows a repair message
            if integrity_violations is None:
                integrity_violations = True

        # Check for Windows component store issues
        if "component store" in low and ("corrupt" in low or "inconsistent" in low):
            winsxs_repair_pending = True

    return {
        "integrity_violations": integrity_violations,
        "repairs_attempted": repairs_attempted,
        "repairs_successful": repairs_successful,
        "verification_complete": verification_complete,
        "pending_reboot": pending_reboot,
        "access_denied": access_denied,
        "winsxs_repair_pending": winsxs_repair_pending,
        "message": "\n".join(message_lines[-15:]),  # last few lines (most relevant)
    }


def run_sfc_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run `sfc /scannow` and return structured JSON-style result.

    Task schema:
      type: "sfc_scan"
      (no additional fields currently)
    """
    add_breadcrumb("Starting SFC scan", category="task", level="info")

    command = ["sfc", "/scannow"]
    logger.info("Running SFC scan: %s", " ".join(command))
    sys.stderr.flush()

    add_breadcrumb(
        "Executing SFC command (may take several minutes)",
        category="subprocess",
        level="info",
    )

    try:
        # Capture raw bytes so we can detect and decode UTF-16LE (sfc often
        # emits output containing null bytes when run on Windows). We'll
        # decode explicitly below.
        proc = subprocess.run(
            command,
            capture_output=True,
            text=False,
            check=False,
            timeout=3600,  # 1 hour timeout for SFC scan
        )
    except FileNotFoundError:
        return {
            "task_type": "sfc_scan",
            "status": "error",
            "summary": {"error": "sfc command not found in system PATH"},
        }
    except subprocess.TimeoutExpired:
        return {
            "task_type": "sfc_scan",
            "status": "error",
            "summary": {"error": "SFC scan timed out after 1 hour"},
        }
    except Exception as e:  # noqa: BLE001
        logger.error(f"Exception running SFC: {e}")
        return {
            "task_type": "sfc_scan",
            "status": "error",
            "summary": {"error": f"Unexpected exception: {str(e)}"},
        }

    # proc.stdout/proc.stderr are bytes when text=False
    def _decode_bytes(b: bytes) -> str:
        if b is None or len(b) == 0:
            return ""
        # If there are null bytes it's likely UTF-16-LE
        try:
            if b.find(b"\x00") != -1:
                # Try utf-16-le first
                decoded = b.decode("utf-16-le", errors="replace")
                # Remove BOM if present
                if decoded.startswith("\ufeff"):
                    decoded = decoded[1:]
                return decoded.strip()
        except Exception:
            pass
        # Fallback attempts
        for enc in ("utf-8", "utf-8-sig", "utf-16", "cp1252", "latin-1"):
            try:
                decoded = b.decode(enc, errors="replace")
                return decoded.strip()
            except Exception:
                continue
        # Last resort
        return b.decode("latin-1", errors="replace").strip()

    stdout_text = _decode_bytes(proc.stdout or b"")
    stderr_text = _decode_bytes(proc.stderr or b"")

    add_breadcrumb(
        "Parsing SFC output",
        category="task",
        level="info",
        data={"return_code": proc.returncode},
    )

    parsed = parse_sfc_output(stdout_text)
    parsed["return_code"] = proc.returncode

    # Determine status with improved logic
    if parsed.get("access_denied"):
        status = "error"
        parsed["error"] = "Access denied. SFC requires administrator privileges."
    elif parsed.get("pending_reboot"):
        status = "warning"
        parsed["warning"] = (
            "System repair is pending. Reboot required before SFC can run."
        )
    elif parsed.get("winsxs_repair_pending"):
        status = "warning"
        parsed["warning"] = (
            "Component store corruption detected. Run DISM /RestoreHealth first."
        )
    elif not parsed.get("verification_complete") and proc.returncode != 0:
        status = "error"
        parsed["error"] = (
            f"SFC scan did not complete successfully. Exit code: {proc.returncode}"
        )
    elif parsed.get("integrity_violations") is False:
        status = "success"
        parsed["verdict"] = "No integrity violations found. System files are healthy."
    elif parsed.get("repairs_successful") is True:
        status = "success"
        parsed["verdict"] = "Corrupt files were found and successfully repaired."
    elif parsed.get("repairs_successful") is False:
        status = "warning"
        parsed["warning"] = (
            "Corrupt files found but some could not be repaired. Check CBS.log for details."
        )
    elif parsed.get("integrity_violations") is True and parsed.get("repairs_attempted"):
        # Found issues, attempted repairs, but success status unclear
        if proc.returncode == 0:
            status = "success"
            parsed["verdict"] = "System file repairs completed."
        else:
            status = "warning"
            parsed["warning"] = (
                "System file issues detected. Check CBS.log for details."
            )
    elif proc.returncode == 0:
        status = "success"
        parsed["verdict"] = "SFC scan completed successfully."
    else:
        status = "error"
        parsed["error"] = f"SFC scan failed with exit code {proc.returncode}."

    add_breadcrumb(
        f"SFC scan completed with status: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "warning"
        else "error",
        data={
            "integrity_violations": parsed.get("integrity_violations"),
            "repairs_successful": parsed.get("repairs_successful"),
            "verification_complete": parsed.get("verification_complete"),
        },
    )

    result: Dict[str, Any] = {
        "task_type": "sfc_scan",
        "status": status,
        "summary": parsed,
    }

    # Include decoded stderr for diagnostics if present
    if stderr_text:
        result["summary"]["stderr"] = stderr_text

    # Include output preview for debugging (last 20 lines)
    if stdout_text:
        preview_lines = stdout_text.splitlines()[-20:]
        result["summary"]["raw_output_preview"] = "\n".join(preview_lines)

    return result


__all__ = ["run_sfc_scan", "parse_sfc_output"]
