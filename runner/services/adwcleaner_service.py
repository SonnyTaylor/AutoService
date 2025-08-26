import os
import re
import glob
import json
import logging
import subprocess
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)


LOG_FILE_PATTERN = "AdwCleaner*.txt"


def _find_latest_log(logs_dir: str) -> str | None:
    """Return the path to the most recently modified AdwCleaner log file, or None."""
    pattern = os.path.join(logs_dir, LOG_FILE_PATTERN)
    candidates = glob.glob(pattern)
    if not candidates:
        return None
    # Pick most recently modified file
    candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return candidates[0]


def _parse_sections(lines: List[str]) -> Dict[str, List[str]]:
    """Parse the per-section deleted entries from an AdwCleaner log.

    Sections are denoted by lines like: ***** [ Folders ] *****
    Deleted entries start with 'Deleted'. We collect the text after 'Deleted'.
    """
    sections: Dict[str, List[str]] = {}
    current: str | None = None
    section_header_re = re.compile(r"\*{5} \[ (.+?) \] \*{5}")
    deleted_prefix = "Deleted"

    for line in lines:
        line_strip = line.strip()
        header_match = section_header_re.match(line_strip)
        if header_match:
            header_name = header_match.group(1)
            if header_name not in sections:
                sections[header_name] = []
            current = header_name
            continue
        if current and line_strip.startswith(deleted_prefix):
            # Normalize spacing, remove leading 'Deleted'
            parts = line_strip.split(None, 1)
            if len(parts) == 2:
                sections[current].append(parts[1].strip())
    # Drop empty sections to reduce noise
    return {k: v for k, v in sections.items() if v}


def parse_adwcleaner_log(content: str) -> Dict[str, Any]:
    """Parse an AdwCleaner log file into structured data.

    Extracts: cleaned, failed, total_objects_scanned, nothing_to_clean (bool),
    threats_found (derived), sections (dict), notes (list of notable lines).
    """
    cleaned = failed = total_scanned = 0
    nothing_to_clean = False
    threats_found = 0
    notes: List[str] = []

    cleaned_re = re.compile(r"#\s*Cleaned:\s*(\d+)")
    failed_re = re.compile(r"#\s*Failed:\s*(\d+)")
    scanned_re = re.compile(r"(\d+)\s+total objects scanned\.")

    lines = content.splitlines()
    for line in lines:
        if m := cleaned_re.search(line):
            cleaned = int(m.group(1))
        elif m := failed_re.search(line):
            failed = int(m.group(1))
        elif m := scanned_re.search(line):
            total_scanned = int(m.group(1))
        elif "Nothing to clean" in line:
            nothing_to_clean = True
        elif "No preinstalled software or threat items found" in line:
            notes.append(line.strip())
        elif "threat" in line.lower():  # capture any threat-related info
            notes.append(line.strip())

    # Derive threats_found: if cleaned > 0, treat as cleaned items; else 0.
    threats_found = cleaned
    sections = _parse_sections(lines)

    return {
        "cleaned": cleaned,
        "failed": failed,
        "total_objects_scanned": total_scanned,
        "nothing_to_clean": nothing_to_clean,
        "threats_found": threats_found,
        "sections": sections,
        "notes": notes,
    }


def _build_powershell_command(executable: str, working_path: str) -> List[str]:
    """Create a PowerShell command list ensuring elevation (RunAs)."""
    # Escape quotes for PowerShell
    exe = executable.replace('"', '"')
    log_path = working_path.replace('"', '"')
    # Build the Start-Process expression. We rely on -Verb RunAs for elevation.
    ps_expression = (
        f"Start-Process -FilePath \"{exe}\" -ArgumentList '/clean','/noreboot','/path',\"{log_path}\" "
        "-Wait -Verb RunAs -WindowStyle Hidden"
    )
    return [
        "powershell",
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        ps_expression,
    ]


def run_adwcleaner_clean(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute AdwCleaner with /clean and parse the resulting latest log.

    Expected task keys:
      - executable_path: path to adwcleaner.exe
      - working_path: root path supplied to /path (where AdwCleaner/Logs is created)
      - timeout_seconds (optional): max seconds to wait (default 900)
      - skip_elevation (optional, bool): for testing without UAC prompt
    """
    exec_path: str | None = task.get("executable_path")
    working_path: str | None = task.get("working_path") or task.get("log_root_path")
    timeout = int(task.get("timeout_seconds", 900))
    skip_elevation = bool(task.get("skip_elevation", False))

    if not exec_path:
        logger.error("AdwCleaner task failed: 'executable_path' not provided.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": "Executable path was missing."},
        }
    if not working_path:
        logger.error("AdwCleaner task failed: 'working_path' not provided.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": "Working path was missing."},
        }

    if not os.path.exists(exec_path):
        logger.error(f"AdwCleaner executable not found at '{exec_path}'.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }

    logger.info("Starting AdwCleaner task.")
    logger.info(f"Executable: {exec_path}")
    logger.info(f"Working path: {working_path}")

    if skip_elevation:
        command = [exec_path, "/clean", "/noreboot", "/path", working_path]
    else:
        command = _build_powershell_command(exec_path, working_path)

    logger.info(f"Executing command: {' '.join(command)}")

    # Attempt to run the command. If we hit a Windows elevation error (WinError 740)
    # try retrying using an elevated PowerShell Start-Process invocation.
    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        logger.error("AdwCleaner process timed out.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"Timed out after {timeout} seconds."},
        }
    except FileNotFoundError:
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"Executable not found: {exec_path}"},
        }
    except OSError as ose:  # handle WinError cases (e.g., requires elevation)
        winerr = getattr(ose, "winerror", None)
        if winerr == 740:
            logger.warning(
                "AdwCleaner execution requires elevation (WinError 740). Retrying via PowerShell Start-Process -Verb RunAs."
            )
            ps_cmd = _build_powershell_command(exec_path, working_path)
            logger.info(f"Retrying with elevated command: {' '.join(ps_cmd)}")
            try:
                process = subprocess.run(
                    ps_cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                    timeout=timeout,
                )
            except subprocess.TimeoutExpired:
                logger.error("AdwCleaner elevated process timed out.")
                return {
                    "task_type": "adwcleaner_clean",
                    "status": "failure",
                    "summary": {
                        "error": f"Timed out after {timeout} seconds (elevated run)."
                    },
                }
            except Exception as e2:  # noqa: BLE001
                logger.exception("Elevated PowerShell retry failed.")
                return {
                    "task_type": "adwcleaner_clean",
                    "status": "failure",
                    "summary": {"error": f"Elevated retry failed: {e2}"},
                }
        else:
            logger.exception("Unexpected OSError while running AdwCleaner.")
            return {
                "task_type": "adwcleaner_clean",
                "status": "failure",
                "summary": {"error": f"Unexpected OSError: {ose}"},
            }
    except Exception as e:  # noqa: BLE001
        logger.exception("Unexpected exception while running AdwCleaner.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    if process.returncode != 0:
        logger.error(
            f"AdwCleaner exited with non-zero code {process.returncode}. StdErr: {process.stderr.strip()}"
        )
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {
                "error": f"Process exited with code {process.returncode}.",
                "stderr": process.stderr.strip(),
            },
        }

    # Locate latest log file
    logs_dir = os.path.join(working_path, "AdwCleaner", "Logs")
    latest_log = _find_latest_log(logs_dir) if os.path.isdir(logs_dir) else None
    if not latest_log:
        logger.warning("No AdwCleaner log file found after execution.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "success",  # Process succeeded, but no log found
            "summary": {
                "warning": "No log file located.",
                "process_stdout": process.stdout.strip()[:2000],
            },
        }

    try:
        with open(latest_log, "r", encoding="utf-8", errors="replace") as f:
            log_content = f.read()
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed reading log file '{latest_log}': {e}")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"Failed reading log file: {e}"},
        }

    parsed = parse_adwcleaner_log(log_content)
    parsed.update(
        {
            "log_file": latest_log,
            "log_size_bytes": len(log_content.encode("utf-8", "replace")),
        }
    )

    logger.info("AdwCleaner task completed successfully.")
    return {
        "task_type": "adwcleaner_clean",
        "status": "success",
        "summary": parsed,
    }
