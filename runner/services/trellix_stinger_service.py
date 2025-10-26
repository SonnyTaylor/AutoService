"""Trellix Stinger antivirus scan service.

Executes Trellix Stinger (stinger64.exe) with configurable command-line options,
captures results, and parses the generated HTML log file for structured output.

Task schema (dict expected):
  type: "trellix_stinger_scan"
  executable_path: str (required) - path to stinger64.exe or folder containing it
  action: str (optional, default "delete") - "report" or "delete"
  include_pups: bool (optional, default False) - detect potentially unwanted programs
  logs_dir: str (optional) - directory for HTML log output (defaults to data/logs/Stinger/)
  scan_path: str (optional) - specific folder to scan (defaults to all local drives)
  scan_subdirectories: bool (optional, default True) - scan subdirectories when scan_path is specified
  additional_args: List[str] (optional) - extra raw args appended as-is

Return dict structure:
  {
    task_type: "trellix_stinger_scan",
    status: "success" | "failure",
    summary: {
      intent: { action, include_pups, scan_path, scan_subdirectories, ... },
      version: str | None,
      engine_version: str | None,
      virus_data_version: str | None,
      virus_count: int | None,
      scan_start_time: str | None,
      scan_end_time: str | None,
      total_files: int | None,
      clean_files: int | None,
      not_scanned: int | None,
      infected_files: int | None,
      infections: [ { file_path, md5, threat_name } ],
      log_file: str | None,
      exit_code: int,
      stdout_excerpt: str,
      stderr_excerpt: str,
    },
    command: [ ... executed command ... ]
  }
"""

import os
import re
import logging
import subprocess
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _resolve_stinger_path(executable_path: Optional[str]) -> Optional[str]:
    """Resolve the path to Stinger executable.

    Accepts either the direct path to stinger64.exe/stinger.exe or a directory
    containing it. Returns None if not found.
    """
    if not executable_path:
        return None
    path = str(executable_path)

    # If it's a directory, look for stinger64.exe or stinger.exe
    if os.path.isdir(path):
        for candidate_name in ["stinger64.exe", "stinger.exe"]:
            candidate = os.path.join(path, candidate_name)
            if os.path.exists(candidate):
                return candidate
        return None

    # If it's a file, verify it exists
    if os.path.isfile(path):
        return path

    return None


def _build_stinger_command(task: Dict[str, Any]) -> Dict[str, Any]:
    """Build the Stinger command list and normalized summary of intent.

    Returns { command: List[str], intent: Dict[str, Any], exec_path: str, report_dir: str }
    or { error: str }.
    """
    exec_path = _resolve_stinger_path(task.get("executable_path"))
    if not exec_path:
        return {"error": "'executable_path' invalid or Stinger executable not found"}

    # Parse parameters
    action = str(task.get("action", "delete")).lower()
    include_pups = bool(task.get("include_pups", False))
    logs_dir = task.get("logs_dir")
    scan_path = task.get("scan_path")
    additional_args: List[str] = task.get("additional_args", [])

    # Validate action
    if action not in ("delete", "report"):
        return {"error": f"Invalid action '{action}'. Must be 'delete' or 'report'"}

    cmd: List[str] = [exec_path]
    intent: Dict[str, Any] = {}

    # Always add --GO for CLI mode (required)
    cmd.append("--GO")

    # Always add --SILENT to prevent UI windows and ensure no user intervention needed
    cmd.append("--SILENT")
    intent["silent"] = True

    # Determine logs directory (where HTML reports will be written)
    if logs_dir:
        logs_dir_path = str(logs_dir)
        # Create logs directory if it doesn't exist
        os.makedirs(logs_dir_path, exist_ok=True)
        cmd.append(f'--REPORTPATH="{logs_dir_path}"')
        intent["logs_dir"] = logs_dir_path
    else:
        # Fallback to Stinger's directory (not recommended)
        logs_dir_path = os.path.dirname(exec_path)
        intent["logs_dir"] = logs_dir_path

    # Scan scope
    if scan_path:
        scan_path_str = str(scan_path)
        cmd.append(f'--SCANPATH="{scan_path_str}"')
        intent["scan_path"] = scan_path_str

        # Disable system-wide scans when scanning specific path
        # Note: --NOROOTKIT disables rootkit scanning (enabled by default)
        # For folder scans, we disable it for better performance
        cmd.extend(
            ["--NOBOOT", "--NOPROCESS", "--NOREGISTRY", "--NOROOTKIT", "--NOWMI"]
        )
        intent["folder_scan_only"] = True

        # Optionally disable subdirectory scanning for faster results
        scan_subdirectories = task.get("scan_subdirectories", True)
        if not scan_subdirectories:
            cmd.append("--NOSUB")
            intent["scan_subdirectories"] = False
    else:
        # Default: scan all local drives
        cmd.append("--ADL")
        intent["scan_scope"] = "all_local_drives"

    # Action on threats
    if action == "delete":
        cmd.append("--DELETE")
        intent["action"] = "delete"
    else:
        cmd.append("--REPORTONLY")
        intent["action"] = "report"

    # PUP detection
    if include_pups:
        cmd.append("--PROGRAM")
        intent["include_pups"] = True

    # Additional arguments
    if additional_args and isinstance(additional_args, list):
        cmd += [str(a) for a in additional_args]
        intent["additional_args"] = [str(a) for a in additional_args]

    return {
        "command": cmd,
        "intent": intent,
        "exec_path": exec_path,
        "logs_dir": logs_dir_path,
    }


def _find_latest_stinger_log(report_dir: str) -> Optional[str]:
    """Find the newest Stinger HTML log file in a given directory.

    Stinger logs are named: Stinger_DDMMYYYY_HHMMSS.html
    """
    log_path = Path(report_dir)
    if not log_path.exists():
        return None

    logs = sorted(
        log_path.glob("Stinger_*.html"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return str(logs[0]) if logs else None


# Regex patterns for parsing HTML log
_RE_STINGER_VERSION = re.compile(
    r"Trellix Stinger.*?Version\s+([\d.]+)\s+built on", re.IGNORECASE
)
_RE_ENGINE_VERSION = re.compile(
    r"AV Engine version\s+(v[\d.]+)\s+for Windows", re.IGNORECASE
)
_RE_VIRUS_DATA = re.compile(
    r"Virus data file\s+(v[\d.]+)\s+created on.*?Ready to scan for\s+(\d+)\s+viruses",
    re.IGNORECASE | re.DOTALL,
)
_RE_SCAN_START = re.compile(
    r"(?:Custom )?[Ss]can initiated on\s+(.+?)$", re.IGNORECASE | re.MULTILINE
)
_RE_SCAN_END = re.compile(r"Scan completed on\s+(.+?)$", re.IGNORECASE | re.MULTILINE)
_RE_INFECTION = re.compile(
    r"^(.+?)\s+\[MD5:([a-f0-9]{32})\]\s+is infected with\s+(.+?)$",
    re.IGNORECASE | re.MULTILINE,
)
_RE_SUMMARY_COUNTS = {
    "total_files": re.compile(r"TotalFiles:\.*\s*(\d+)", re.IGNORECASE),
    "clean": re.compile(r"Clean:\.*\s*(\d+)", re.IGNORECASE),
    "not_scanned": re.compile(r"Not Scanned:\.*\s*(\d+)", re.IGNORECASE),
    "possibly_infected": re.compile(r"Possibly Infected:\.*\s*(\d+)", re.IGNORECASE),
}


def parse_stinger_log(log_path: str) -> Dict[str, Any]:
    """Parse Stinger HTML log file and return structured data.

    Extracts version info, scan times, infection details, and summary statistics.
    """
    summary = {
        "version": None,
        "engine_version": None,
        "virus_data_version": None,
        "virus_count": None,
        "scan_start_time": None,
        "scan_end_time": None,
        "total_files": None,
        "clean_files": None,
        "not_scanned": None,
        "infected_files": None,
        "infections": [],
    }

    try:
        with open(log_path, encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        logger.error(f"Failed to read log file '{log_path}': {e}")
        return summary

    # Extract version information
    m_ver = _RE_STINGER_VERSION.search(content)
    if m_ver:
        summary["version"] = m_ver.group(1)

    m_eng = _RE_ENGINE_VERSION.search(content)
    if m_eng:
        summary["engine_version"] = m_eng.group(1)

    m_vir = _RE_VIRUS_DATA.search(content)
    if m_vir:
        summary["virus_data_version"] = m_vir.group(1)
        try:
            summary["virus_count"] = int(m_vir.group(2))
        except (ValueError, IndexError):
            pass

    # Extract scan times
    m_start = _RE_SCAN_START.search(content)
    if m_start:
        summary["scan_start_time"] = m_start.group(1).strip()

    m_end = _RE_SCAN_END.search(content)
    if m_end:
        summary["scan_end_time"] = m_end.group(1).strip()

    # Extract infection details
    infections = []
    for m_inf in _RE_INFECTION.finditer(content):
        file_path = m_inf.group(1).strip()
        md5 = m_inf.group(2).strip()
        threat_name = m_inf.group(3).strip()
        infections.append(
            {
                "file_path": file_path,
                "md5": md5,
                "threat_name": threat_name,
            }
        )
    summary["infections"] = infections

    # Extract summary counts
    for key, pattern in _RE_SUMMARY_COUNTS.items():
        m_count = pattern.search(content)
        if m_count:
            try:
                summary[key] = int(m_count.group(1))
            except (ValueError, IndexError):
                pass

    # Map "possibly_infected" to "infected_files" for consistency
    if "possibly_infected" in summary:
        summary["infected_files"] = summary.pop("possibly_infected")
    # If not found but we have infections list, use its count
    elif summary["infected_files"] is None and infections:
        summary["infected_files"] = len(infections)

    # Rename clean to clean_files for consistency
    if "clean" in summary:
        summary["clean_files"] = summary.pop("clean")

    return summary


def run_trellix_stinger_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute Trellix Stinger scan according to task configuration and parse results."""
    add_breadcrumb(
        "Starting Trellix Stinger antivirus scan",
        category="task",
        level="info",
        data={
            "action": task.get("action", "delete"),
            "include_pups": task.get("include_pups", False),
        },
    )

    logger.info("Starting Trellix Stinger scan task.")

    # Build command
    build = _build_stinger_command(task)
    if "error" in build:
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {"error": build["error"]},
        }

    command: List[str] = build["command"]
    intent: Dict[str, Any] = build.get("intent", {})
    exec_path: str = build.get("exec_path", "")
    logs_dir: str = build.get("logs_dir", "")

    logger.info(f"Executing command: {' '.join(command)}")
    logger.info(f"Logs will be saved to: {logs_dir}")

    # Delete Stinger.opt file if it exists (prevents issues from previous runs)
    stinger_dir = os.path.dirname(exec_path)
    stinger_opt_path = os.path.join(stinger_dir, "Stinger.opt")
    if os.path.exists(stinger_opt_path):
        try:
            # Remove read-only attribute if present (Windows)
            if os.name == "nt":
                os.chmod(stinger_opt_path, 0o666)
            os.remove(stinger_opt_path)
            logger.info(f"Deleted Stinger.opt file: {stinger_opt_path}")
            add_breadcrumb(
                "Deleted Stinger.opt file to prevent configuration conflicts",
                category="filesystem",
                level="info",
            )
        except Exception as e:
            logger.warning(f"Failed to delete Stinger.opt: {e}")
            add_breadcrumb(
                f"Could not delete Stinger.opt: {e}",
                category="filesystem",
                level="warning",
            )

    add_breadcrumb(
        "Executing Trellix Stinger (may take several minutes)",
        category="subprocess",
        level="info",
    )

    # Execute Stinger
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            cwd=os.path.dirname(exec_path) or None,
        )
    except FileNotFoundError:
        logger.error(f"Stinger executable not found at '{exec_path}'.")
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:
        logger.error(f"Unexpected error running Stinger: {e}")
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {str(e)}"},
        }

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # Locate the latest log file
    latest_log = _find_latest_stinger_log(logs_dir)
    if not latest_log:
        logger.error(f"No Stinger log file found in {logs_dir}")
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": f"No log file was generated in {logs_dir}",
                "exit_code": proc.returncode,
                "stdout_excerpt": stdout[-1200:],
                "stderr_excerpt": stderr[-1200:],
            },
        }

    # Parse the log file
    parsed = parse_stinger_log(latest_log)

    # Build comprehensive summary
    result_summary: Dict[str, Any] = {
        "intent": intent,
        **parsed,
        "log_file": latest_log,
        "exit_code": proc.returncode,
        "stdout_excerpt": stdout[-1200:],
        "stderr_excerpt": stderr[-1200:],
    }

    # Determine status based on exit code
    # Stinger typically returns 0 on success (even if threats found and removed)
    status = "success" if proc.returncode == 0 else "failure"

    infection_count = len(parsed.get("infections", []))
    add_breadcrumb(
        f"Trellix Stinger scan completed: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "infected_files": parsed.get("infected_files", 0),
            "infection_count": infection_count,
            "exit_code": proc.returncode,
        },
    )

    logger.info(f"Trellix Stinger scan completed with status: {status}")
    if infection_count > 0:
        logger.info(f"Found {infection_count} infection(s)")

    return {
        "task_type": "trellix_stinger_scan",
        "status": status,
        "summary": result_summary,
        "command": command,
    }


__all__ = ["run_trellix_stinger_scan", "parse_stinger_log"]
