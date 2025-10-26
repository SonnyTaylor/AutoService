"""Trellix Stinger antivirus scan service.

Executes Trellix Stinger (stinger64.exe) with configurable command-line options,
captures results, and parses the generated HTML log file for structured output.

Features health monitoring during execution to detect hangs and ensure progress.

Task schema (dict expected):
  type: "trellix_stinger_scan"
  executable_path: str (required) - path to stinger64.exe or folder containing it
  action: str (optional, default "delete") - "report" or "delete"
  include_pups: bool (optional, default False) - detect potentially unwanted programs
  logs_dir: str (optional) - directory for HTML log output (defaults to data/logs/Stinger/)
  scan_path: str (optional) - specific folder to scan (defaults to all local drives)
  scan_subdirectories: bool (optional, default True) - scan subdirectories when scan_path is specified
  timeout_minutes: int (optional, default 30) - maximum scan duration before timeout
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
      timed_out: bool,
      scan_duration_seconds: float,
      health_check_status: str,
      error_hint: str | None,
    },
    command: [ ... executed command ... ]
  }

Health Monitoring:
  The service monitors the Stinger process during execution by:
  - Checking process health every 5-10 seconds
  - Monitoring log file modification times to verify progress
  - Enforcing timeout limits to prevent indefinite hangs
  - Gracefully terminating hung processes

Timeout Scenarios:
  - If scan exceeds timeout_minutes, process is terminated
  - Partial results are still captured and returned
  - Status will be "failure" with timed_out=True in summary
"""

import os
import re
import logging
import subprocess
import time
from subprocess import Popen, PIPE
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs and error tracking
try:
    from sentry_config import (
        add_breadcrumb,
        capture_task_exception,
        capture_task_failure,
    )

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass

    def capture_task_exception(*args, **kwargs):
        return None

    def capture_task_failure(*args, **kwargs):
        return None


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
    or { error: str, error_hint: str }.
    """
    exec_path = _resolve_stinger_path(task.get("executable_path"))
    if not exec_path:
        return {
            "error": "'executable_path' invalid or Stinger executable not found",
            "error_hint": "Ensure the path points to stinger64.exe or a folder containing it",
        }

    # Validate executable exists and is accessible
    if not os.path.isfile(exec_path):
        return {
            "error": f"Stinger executable not found at: {exec_path}",
            "error_hint": "Check if the file was deleted or moved",
        }

    try:
        # Check if file is accessible (basic permission check)
        if not os.access(exec_path, os.R_OK | os.X_OK):
            return {
                "error": f"Stinger executable is not accessible: {exec_path}",
                "error_hint": "Check file permissions or try running as administrator",
            }
    except OSError as e:
        logger.warning(f"Failed to check executable permissions: {e}")

    # Parse parameters
    action = str(task.get("action", "delete")).lower()
    include_pups = bool(task.get("include_pups", False))
    logs_dir = task.get("logs_dir")
    scan_path = task.get("scan_path")
    additional_args = task.get("additional_args", [])

    # Validate action
    if action not in ("delete", "report"):
        return {
            "error": f"Invalid action '{action}'. Must be 'delete' or 'report'",
            "error_hint": "Use 'delete' to remove threats or 'report' for scan-only mode",
        }

    # Validate additional_args type
    if additional_args is not None:
        if not isinstance(additional_args, list):
            return {
                "error": "additional_args must be a list of strings",
                "error_hint": "Example: additional_args: ['--VERBOSE']",
            }
        # Convert all to strings safely
        additional_args = [str(arg) for arg in additional_args]
    else:
        additional_args = []

    # Validate scan_path if provided
    if scan_path:
        scan_path_str = str(scan_path)
        if not os.path.exists(scan_path_str):
            return {
                "error": f"Scan path does not exist: {scan_path_str}",
                "error_hint": "Verify the path is correct and accessible",
            }
        if not os.path.isdir(scan_path_str):
            return {
                "error": f"Scan path is not a directory: {scan_path_str}",
                "error_hint": "scan_path must point to a folder, not a file",
            }

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
        try:
            os.makedirs(logs_dir_path, exist_ok=True)
            logger.info(f"Logs directory ready: {logs_dir_path}")
            add_breadcrumb(
                f"Created/verified logs directory: {logs_dir_path}",
                category="filesystem",
                level="info",
            )
        except PermissionError as e:
            logger.error(
                f"Permission denied creating logs directory '{logs_dir_path}': {e}"
            )
            add_breadcrumb(
                f"Permission error creating logs directory: {logs_dir_path}",
                category="filesystem",
                level="error",
                data={"error": str(e)},
            )
            return {
                "error": f"Permission denied creating logs directory: {logs_dir_path}",
                "error_hint": "Try running as administrator or choose a different directory",
            }
        except OSError as e:
            logger.error(f"Failed to create logs directory '{logs_dir_path}': {e}")
            add_breadcrumb(
                f"Failed to create logs directory: {logs_dir_path}",
                category="filesystem",
                level="error",
                data={"error": str(e), "error_type": type(e).__name__},
            )
            return {
                "error": f"Could not create logs directory: {logs_dir_path} - {str(e)}",
                "error_hint": "Check if the path is valid and accessible",
            }
        cmd.append(f"--REPORTPATH={logs_dir_path}")
        intent["logs_dir"] = logs_dir_path
    else:
        # Fallback to Stinger's directory (not recommended)
        logs_dir_path = os.path.dirname(exec_path)
        intent["logs_dir"] = logs_dir_path

    # Scan scope
    if scan_path:
        scan_path_str = str(scan_path)
        cmd.append(f"--SCANPATH={scan_path_str}")
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
        # Default: Smart Scan (Stinger's default behavior without --ADL)
        # Smart Scan targets common infection areas (faster than --ADL)
        intent["scan_scope"] = "smart_scan"

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
    Returns partial data if parsing encounters errors.
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
        "parse_errors": [],
    }

    # Validate log file exists
    if not os.path.exists(log_path):
        error_msg = f"Log file does not exist: {log_path}"
        logger.error(error_msg)
        summary["parse_errors"].append(error_msg)
        return summary

    # Check if file is empty
    try:
        file_size = os.path.getsize(log_path)
        if file_size == 0:
            error_msg = f"Log file is empty: {log_path}"
            logger.warning(error_msg)
            summary["parse_errors"].append(error_msg)
            return summary
    except OSError as e:
        error_msg = f"Failed to check log file size: {e}"
        logger.error(error_msg)
        summary["parse_errors"].append(error_msg)
        return summary

    # Read log file with robust encoding handling
    content = None
    for encoding in ["utf-8", "utf-16", "latin-1", "cp1252"]:
        try:
            with open(log_path, encoding=encoding, errors="replace") as f:
                content = f.read()
            logger.debug(f"Successfully read log file with {encoding} encoding")
            break
        except (UnicodeDecodeError, OSError) as e:
            logger.debug(f"Failed to read with {encoding} encoding: {e}")
            continue

    if content is None:
        error_msg = f"Failed to read log file with any encoding: {log_path}"
        logger.error(error_msg)
        summary["parse_errors"].append(error_msg)
        return summary

    if not content.strip():
        error_msg = f"Log file contains no readable content: {log_path}"
        logger.warning(error_msg)
        summary["parse_errors"].append(error_msg)
        return summary

    # Extract version information with error handling
    try:
        m_ver = _RE_STINGER_VERSION.search(content)
        if m_ver:
            summary["version"] = m_ver.group(1)
    except (IndexError, AttributeError) as e:
        logger.debug(f"Failed to extract Stinger version: {e}")
        summary["parse_errors"].append("version extraction failed")

    try:
        m_eng = _RE_ENGINE_VERSION.search(content)
        if m_eng:
            summary["engine_version"] = m_eng.group(1)
    except (IndexError, AttributeError) as e:
        logger.debug(f"Failed to extract engine version: {e}")
        summary["parse_errors"].append("engine_version extraction failed")

    try:
        m_vir = _RE_VIRUS_DATA.search(content)
        if m_vir:
            summary["virus_data_version"] = m_vir.group(1)
            try:
                summary["virus_count"] = int(m_vir.group(2))
            except (ValueError, IndexError) as e:
                logger.debug(f"Failed to parse virus count: {e}")
    except (IndexError, AttributeError) as e:
        logger.debug(f"Failed to extract virus data: {e}")
        summary["parse_errors"].append("virus_data extraction failed")

    # Extract scan times with error handling
    try:
        m_start = _RE_SCAN_START.search(content)
        if m_start:
            summary["scan_start_time"] = m_start.group(1).strip()
    except (IndexError, AttributeError) as e:
        logger.debug(f"Failed to extract scan start time: {e}")
        summary["parse_errors"].append("scan_start_time extraction failed")

    try:
        m_end = _RE_SCAN_END.search(content)
        if m_end:
            summary["scan_end_time"] = m_end.group(1).strip()
    except (IndexError, AttributeError) as e:
        logger.debug(f"Failed to extract scan end time: {e}")
        summary["parse_errors"].append("scan_end_time extraction failed")

    # Extract infection details with error handling
    infections = []
    try:
        for m_inf in _RE_INFECTION.finditer(content):
            try:
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
            except (IndexError, AttributeError) as e:
                logger.debug(f"Failed to parse individual infection entry: {e}")
                continue
        summary["infections"] = infections
    except Exception as e:
        logger.warning(f"Failed to extract infection details: {e}")
        summary["parse_errors"].append("infection extraction failed")
        summary["infections"] = []

    # Extract summary counts with error handling
    for key, pattern in _RE_SUMMARY_COUNTS.items():
        try:
            m_count = pattern.search(content)
            if m_count:
                try:
                    summary[key] = int(m_count.group(1))
                except (ValueError, IndexError) as e:
                    logger.debug(f"Failed to parse count for {key}: {e}")
        except Exception as e:
            logger.debug(f"Failed to extract {key}: {e}")
            summary["parse_errors"].append(f"{key} extraction failed")

    # Map "possibly_infected" to "infected_files" for consistency
    try:
        if "possibly_infected" in summary:
            summary["infected_files"] = summary.pop("possibly_infected")
        # If not found but we have infections list, use its count
        elif summary["infected_files"] is None and infections:
            summary["infected_files"] = len(infections)
    except Exception as e:
        logger.debug(f"Failed to map infected_files: {e}")

    # Rename clean to clean_files for consistency
    try:
        if "clean" in summary:
            summary["clean_files"] = summary.pop("clean")
    except Exception as e:
        logger.debug(f"Failed to map clean_files: {e}")

    # Remove parse_errors if empty for cleaner output
    if not summary["parse_errors"]:
        del summary["parse_errors"]

    return summary


def _monitor_stinger_process(
    process: Popen,
    timeout_seconds: float,
    logs_dir: str,
    exec_path: str,
) -> Tuple[int, str, str, Dict[str, Any]]:
    """Monitor Stinger process execution with health checks and timeout enforcement.

    Polls the process periodically to ensure it's making progress by checking:
    - Process is still running
    - Log file is being updated (indicating activity)
    - Total elapsed time hasn't exceeded timeout

    Args:
        process: The Popen process object for Stinger
        timeout_seconds: Maximum allowed execution time in seconds
        logs_dir: Directory where Stinger writes log files
        exec_path: Path to Stinger executable for context

    Returns:
        Tuple of (exit_code, stdout, stderr, health_status_dict)
        health_status_dict contains:
            - timed_out: bool
            - elapsed_seconds: float
            - checks_performed: int
            - last_log_activity: float (seconds since last log modification)
            - termination_reason: str
    """
    start_time = time.time()
    check_interval = 10  # Check every 10 seconds
    checks_performed = 0
    last_log_mtime = None
    max_idle_seconds = 300  # 5 minutes without log activity suggests hang

    health_status = {
        "timed_out": False,
        "elapsed_seconds": 0.0,
        "checks_performed": 0,
        "last_log_activity": None,
        "termination_reason": "completed_normally",
    }

    logger.info(f"Starting health monitoring for Stinger (timeout: {timeout_seconds}s)")
    add_breadcrumb(
        "Beginning Stinger process health monitoring",
        category="subprocess",
        level="info",
        data={"timeout_seconds": timeout_seconds, "check_interval": check_interval},
    )

    try:
        while True:
            elapsed = time.time() - start_time
            health_status["elapsed_seconds"] = elapsed

            # Check if process has completed
            exit_code = process.poll()
            if exit_code is not None:
                # Process finished
                stdout, stderr = process.communicate(timeout=5)
                health_status["termination_reason"] = "completed_normally"
                logger.info(
                    f"Stinger process completed after {elapsed:.1f}s with exit code {exit_code}"
                )
                add_breadcrumb(
                    f"Stinger completed normally after {elapsed:.1f}s",
                    category="subprocess",
                    level="info",
                    data={"exit_code": exit_code, "elapsed_seconds": elapsed},
                )
                return exit_code, stdout or "", stderr or "", health_status

            # Check if timeout exceeded
            if elapsed > timeout_seconds:
                health_status["timed_out"] = True
                health_status["termination_reason"] = "timeout_exceeded"
                logger.error(
                    f"Stinger process exceeded timeout ({timeout_seconds}s), terminating..."
                )
                add_breadcrumb(
                    f"Stinger timeout exceeded ({timeout_seconds}s), terminating process",
                    category="subprocess",
                    level="error",
                    data={"elapsed_seconds": elapsed},
                )

                # Attempt graceful termination
                try:
                    process.terminate()
                    # Give it 10 seconds to terminate gracefully
                    try:
                        stdout, stderr = process.communicate(timeout=10)
                    except subprocess.TimeoutExpired:
                        # Force kill if it doesn't terminate
                        logger.warning(
                            "Stinger did not terminate gracefully, force killing"
                        )
                        process.kill()
                        stdout, stderr = process.communicate(timeout=5)
                except Exception as e:
                    logger.error(f"Error terminating Stinger process: {e}")
                    stdout, stderr = "", ""

                return -1, stdout or "", stderr or "", health_status

            # Perform health check - look for log file activity
            checks_performed += 1
            health_status["checks_performed"] = checks_performed

            try:
                latest_log = _find_latest_stinger_log(logs_dir)
                if latest_log:
                    current_mtime = os.path.getmtime(latest_log)
                    if last_log_mtime is None:
                        last_log_mtime = current_mtime
                        logger.debug(f"Detected Stinger log file: {latest_log}")
                        add_breadcrumb(
                            "Stinger log file detected",
                            category="filesystem",
                            level="info",
                            data={"log_file": latest_log},
                        )
                    else:
                        idle_time = elapsed - (current_mtime - start_time)
                        health_status["last_log_activity"] = idle_time

                        if current_mtime > last_log_mtime:
                            # Log file was updated - process is active
                            last_log_mtime = current_mtime
                            logger.debug(
                                f"Stinger log updated at {elapsed:.1f}s - process is active"
                            )
                        elif idle_time > max_idle_seconds:
                            # No log activity for too long - possible hang
                            logger.warning(
                                f"Stinger log hasn't been updated for {idle_time:.0f}s - possible hang"
                            )
                            add_breadcrumb(
                                f"No log activity for {idle_time:.0f}s - possible hang",
                                category="subprocess",
                                level="warning",
                                data={"idle_seconds": idle_time},
                            )
            except Exception as e:
                logger.debug(f"Error checking log file activity: {e}")

            # Log progress periodically
            if checks_performed % 6 == 0:  # Every minute
                logger.info(
                    f"Stinger still running... ({elapsed:.0f}s elapsed, "
                    f"{(elapsed / timeout_seconds * 100):.0f}% of timeout)"
                )
                add_breadcrumb(
                    f"Stinger progress check: {elapsed:.0f}s elapsed",
                    category="subprocess",
                    level="info",
                    data={
                        "elapsed_seconds": elapsed,
                        "timeout_progress_percent": int(
                            elapsed / timeout_seconds * 100
                        ),
                    },
                )

            # Wait before next check
            time.sleep(check_interval)

    except KeyboardInterrupt:
        # Handle manual interruption
        health_status["termination_reason"] = "user_interrupted"
        logger.info("Stinger monitoring interrupted by user")
        try:
            process.terminate()
            stdout, stderr = process.communicate(timeout=5)
        except Exception:
            process.kill()
            stdout, stderr = "", ""
        return -2, stdout or "", stderr or "", health_status

    except Exception as e:
        # Unexpected error during monitoring
        health_status["termination_reason"] = f"monitoring_error: {str(e)}"
        logger.error(f"Unexpected error monitoring Stinger process: {e}")
        capture_task_exception(
            e,
            "trellix_stinger_scan",
            extra_context={"stage": "process_monitoring"},
        )
        try:
            stdout, stderr = process.communicate(timeout=5)
            exit_code = process.returncode if process.returncode is not None else -3
        except Exception:
            stdout, stderr = "", ""
            exit_code = -3
        return exit_code, stdout or "", stderr or "", health_status


def run_trellix_stinger_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute Trellix Stinger scan according to task configuration and parse results.

    Includes health monitoring, timeout enforcement, and comprehensive error handling.
    """
    start_time = time.time()

    add_breadcrumb(
        "Starting Trellix Stinger antivirus scan",
        category="task",
        level="info",
        data={
            "action": task.get("action", "delete"),
            "include_pups": task.get("include_pups", False),
            "timeout_minutes": task.get("timeout_minutes", 30),
        },
    )

    logger.info("Starting Trellix Stinger scan task.")

    # Validate and parse timeout parameter
    timeout_minutes = task.get("timeout_minutes", 30)
    try:
        timeout_minutes = int(timeout_minutes)
        if timeout_minutes <= 0:
            return {
                "task_type": "trellix_stinger_scan",
                "status": "failure",
                "summary": {
                    "error": f"Invalid timeout_minutes: {timeout_minutes}",
                    "error_hint": "timeout_minutes must be a positive integer",
                },
            }
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid timeout_minutes parameter: {e}")
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": f"Invalid timeout_minutes value: {task.get('timeout_minutes')}",
                "error_hint": "timeout_minutes must be a positive integer",
            },
        }

    timeout_seconds = timeout_minutes * 60
    logger.info(
        f"Scan timeout set to {timeout_minutes} minutes ({timeout_seconds} seconds)"
    )

    # Build command
    build = _build_stinger_command(task)
    if "error" in build:
        error_msg = build["error"]
        error_hint = build.get("error_hint")
        logger.error(f"Command build failed: {error_msg}")

        # Report failure to Sentry
        capture_task_failure(
            "trellix_stinger_scan",
            error_msg,
            task_data=task,
            extra_context={"stage": "command_build", "error_hint": error_hint},
        )

        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "error_hint": error_hint,
            },
        }

    command: List[str] = build["command"]
    intent: Dict[str, Any] = build.get("intent", {})
    exec_path: str = build.get("exec_path", "")
    logs_dir: str = build.get("logs_dir", "")

    logger.info(f"Executing command: {' '.join(command)}")
    logger.info(f"Logs will be saved to: {logs_dir}")

    add_breadcrumb(
        "Command built successfully",
        category="task",
        level="info",
        data={"command_length": len(command), "logs_dir": logs_dir},
    )

    # Delete Stinger.opt file if it exists (prevents issues from previous runs)
    stinger_dir = os.path.dirname(exec_path)
    stinger_opt_path = os.path.join(stinger_dir, "Stinger.opt")
    if os.path.exists(stinger_opt_path):
        add_breadcrumb(
            "Attempting to delete Stinger.opt file to prevent configuration conflicts",
            category="filesystem",
            level="info",
            data={"opt_file_path": stinger_opt_path},
        )
        try:
            # Remove read-only attribute if present (Windows)
            if os.name == "nt":
                os.chmod(stinger_opt_path, 0o666)
            os.remove(stinger_opt_path)
            logger.info(f"Deleted Stinger.opt file: {stinger_opt_path}")
            add_breadcrumb(
                "Successfully deleted Stinger.opt file",
                category="filesystem",
                level="info",
            )
        except PermissionError as e:
            logger.warning(f"Permission denied deleting Stinger.opt: {e}")
            add_breadcrumb(
                f"Permission denied deleting Stinger.opt: {e}",
                category="filesystem",
                level="warning",
            )
        except OSError as e:
            logger.warning(f"Failed to delete Stinger.opt: {e}")
            add_breadcrumb(
                f"Could not delete Stinger.opt: {e}",
                category="filesystem",
                level="warning",
                data={"error_type": type(e).__name__},
            )

    add_breadcrumb(
        "Starting Trellix Stinger process with health monitoring",
        category="subprocess",
        level="info",
        data={"timeout_minutes": timeout_minutes},
    )

    # Execute Stinger with health monitoring
    health_status = {}
    try:
        # Start the process
        process = Popen(
            command,
            stdout=PIPE,
            stderr=PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=os.path.dirname(exec_path) or None,
        )

        logger.info(f"Stinger process started (PID: {process.pid})")
        add_breadcrumb(
            f"Stinger process started with PID {process.pid}",
            category="subprocess",
            level="info",
            data={"pid": process.pid},
        )

        # Monitor the process with health checks
        exit_code, stdout, stderr, health_status = _monitor_stinger_process(
            process, timeout_seconds, logs_dir, exec_path
        )

    except FileNotFoundError as e:
        error_msg = f"Stinger executable not found at '{exec_path}'"
        logger.error(error_msg)
        capture_task_exception(
            e,
            "trellix_stinger_scan",
            task_data=task,
            extra_context={"stage": "process_start", "exec_path": exec_path},
        )
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "error_hint": "Verify the Stinger executable exists and hasn't been moved or deleted",
            },
            "command": command,
        }
    except PermissionError as e:
        error_msg = f"Permission denied executing Stinger at '{exec_path}'"
        logger.error(f"{error_msg}: {e}")
        capture_task_exception(
            e,
            "trellix_stinger_scan",
            task_data=task,
            extra_context={"stage": "process_start", "exec_path": exec_path},
        )
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "error_hint": "Try running as administrator or check file permissions",
            },
            "command": command,
        }
    except OSError as e:
        error_msg = f"OS error starting Stinger process: {str(e)}"
        logger.error(error_msg)
        capture_task_exception(
            e,
            "trellix_stinger_scan",
            task_data=task,
            extra_context={"stage": "process_start", "exec_path": exec_path},
        )
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "error_hint": "Check system resources and file accessibility",
            },
            "command": command,
        }
    except Exception as e:
        error_msg = f"Unexpected error running Stinger: {str(e)}"
        logger.error(error_msg)
        capture_task_exception(
            e,
            "trellix_stinger_scan",
            task_data=task,
            extra_context={"stage": "process_execution"},
        )
        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "error_hint": "Check logs for detailed error information",
            },
            "command": command,
        }

    stdout = stdout or ""
    stderr = stderr or ""
    scan_duration = time.time() - start_time

    # Handle timeout scenario
    if health_status.get("timed_out", False):
        logger.error(f"Stinger scan timed out after {scan_duration:.1f} seconds")
        error_msg = f"Scan timed out after {timeout_minutes} minutes"

        capture_task_failure(
            "trellix_stinger_scan",
            error_msg,
            task_data=task,
            extra_context={
                "scan_duration_seconds": scan_duration,
                "timeout_seconds": timeout_seconds,
                "health_status": health_status,
            },
        )

        # Try to get partial results from log if available
        latest_log = _find_latest_stinger_log(logs_dir)
        parsed = parse_stinger_log(latest_log) if latest_log else {}

        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "intent": intent,
                **parsed,
                "error": error_msg,
                "error_hint": f"Consider increasing timeout_minutes (currently {timeout_minutes}) or scanning smaller areas",
                "log_file": latest_log,
                "exit_code": exit_code,
                "stdout_excerpt": stdout[-1200:],
                "stderr_excerpt": stderr[-1200:],
                "timed_out": True,
                "scan_duration_seconds": scan_duration,
                "health_check_status": health_status.get(
                    "termination_reason", "timeout"
                ),
            },
            "command": command,
        }

    # Locate the latest log file
    latest_log = _find_latest_stinger_log(logs_dir)
    if not latest_log:
        error_msg = f"No log file was generated in {logs_dir}"
        logger.error(error_msg)

        capture_task_failure(
            "trellix_stinger_scan",
            error_msg,
            task_data=task,
            extra_context={
                "exit_code": exit_code,
                "logs_dir": logs_dir,
                "health_status": health_status,
            },
        )

        return {
            "task_type": "trellix_stinger_scan",
            "status": "failure",
            "summary": {
                "intent": intent,
                "error": error_msg,
                "error_hint": "Stinger may have crashed or failed to initialize properly. Check if the executable is compatible with your system.",
                "exit_code": exit_code,
                "stdout_excerpt": stdout[-1200:],
                "stderr_excerpt": stderr[-1200:],
                "timed_out": False,
                "scan_duration_seconds": scan_duration,
                "health_check_status": health_status.get(
                    "termination_reason", "no_log_file"
                ),
            },
            "command": command,
        }

    logger.info(f"Found Stinger log file: {latest_log}")
    add_breadcrumb(
        "Stinger log file found, beginning parse",
        category="filesystem",
        level="info",
        data={"log_file": latest_log},
    )

    # Parse the log file
    parsed = parse_stinger_log(latest_log)

    # Check if parsing encountered errors
    if "parse_errors" in parsed and parsed["parse_errors"]:
        logger.warning(f"Log parsing encountered {len(parsed['parse_errors'])} errors")
        add_breadcrumb(
            "Log parsing encountered errors",
            category="parsing",
            level="warning",
            data={"error_count": len(parsed["parse_errors"])},
        )

    # Build comprehensive summary
    result_summary: Dict[str, Any] = {
        "intent": intent,
        **parsed,
        "log_file": latest_log,
        "exit_code": exit_code,
        "stdout_excerpt": stdout[-1200:] if stdout else "",
        "stderr_excerpt": stderr[-1200:] if stderr else "",
        "timed_out": False,
        "scan_duration_seconds": round(scan_duration, 2),
        "health_check_status": health_status.get("termination_reason", "completed"),
    }

    # Determine status based on exit code
    # Stinger typically returns 0 on success (even if threats found and removed)
    # Non-zero exit codes indicate errors or failures
    if exit_code == 0:
        status = "success"
    else:
        status = "failure"
        error_hint = None

        # Provide helpful hints for common exit codes
        if exit_code == 1:
            error_hint = "Exit code 1: General error. Check if Stinger has necessary permissions."
        elif exit_code == 5:
            error_hint = "Exit code 5: Access denied. Try running as administrator."
        elif exit_code == -1:
            error_hint = "Process was terminated due to timeout."

        result_summary["error_hint"] = error_hint

        # Report non-zero exit to Sentry
        capture_task_failure(
            "trellix_stinger_scan",
            f"Stinger exited with code {exit_code}",
            task_data=task,
            extra_context={
                "exit_code": exit_code,
                "scan_duration_seconds": scan_duration,
                "health_status": health_status,
            },
        )

    infection_count = len(parsed.get("infections", []))
    infected_files = parsed.get("infected_files", 0)

    # Log completion with details
    logger.info(
        f"Trellix Stinger scan completed with status: {status} "
        f"(duration: {scan_duration:.1f}s, exit code: {exit_code})"
    )
    if infection_count > 0:
        logger.info(f"Found {infection_count} infection(s) in {infected_files} file(s)")

    add_breadcrumb(
        f"Trellix Stinger scan completed: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "infected_files": infected_files,
            "infection_count": infection_count,
            "exit_code": exit_code,
            "scan_duration_seconds": scan_duration,
            "health_checks": health_status.get("checks_performed", 0),
        },
    )

    return {
        "task_type": "trellix_stinger_scan",
        "status": status,
        "summary": result_summary,
        "command": command,
    }


__all__ = ["run_trellix_stinger_scan", "parse_stinger_log"]
