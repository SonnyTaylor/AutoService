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
        elif "could not perform the requested operation" in low:
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
        # Capture raw bytes so we can detect and decode UTF-16LE (sfc often
        # emits output containing null bytes when run on Windows). We'll
        # decode explicitly below.
        proc = subprocess.run(
            command,
            capture_output=True,
            text=False,
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

    # proc.stdout/proc.stderr are bytes when text=False
    def _decode_bytes(b: bytes) -> str:
        if b is None:
            return ""
        # If there are null bytes it's likely UTF-16-LE
        try:
            if b.find(b"\x00") != -1:
                # Try utf-16-le first
                return b.decode("utf-16-le", errors="replace").strip()
        except Exception:
            pass
        # Fallback attempts
        for enc in ("utf-8", "utf-8-sig", "utf-16", "latin-1"):
            try:
                return b.decode(enc, errors="replace").strip()
            except Exception:
                continue
        # Last resort
        return b.decode("latin-1", errors="replace").strip()

    stdout_text = _decode_bytes(proc.stdout or b"")
    stderr_text = _decode_bytes(proc.stderr or b"")

    parsed = parse_sfc_output(stdout_text)

    success = proc.returncode == 0 or parsed.get("repairs_successful") is not False

    result: Dict[str, Any] = {
        "task_type": "sfc_scan",
        "status": "success" if success else "failure",
        "summary": parsed,
        "return_code": proc.returncode,
    }
    # Include decoded stderr for diagnostics if present
    if stderr_text:
        result["summary"]["stderr"] = stderr_text
    # Also include a small excerpt of the raw decoded output to help debugging
    result["summary"]["raw_output_preview"] = "\n".join(stdout_text.splitlines()[-10:])
    return result


__all__ = ["run_sfc_scan", "parse_sfc_output"]
