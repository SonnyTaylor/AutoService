"""BleachBit cleaning service.

Runs BleachBit with selected cleaners and parses console output into
structured metrics (space reclaimed, files deleted, etc.).
"""

import subprocess
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
import os

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


def convert_to_bytes(value: float, unit: Optional[str]) -> int:
    """Convert a value with unit to bytes."""
    if not unit:
        return int(value)
    unit = unit.lower()
    if unit.startswith("k"):
        return int(value * 1024)
    if unit.startswith("m"):
        return int(value * 1024**2)
    if unit.startswith("g"):
        return int(value * 1024**3)
    return int(value)


def parse_bleachbit_output(output: str) -> Dict[str, Any]:
    """Parse stdout from bleachbit_console.exe to extract structured data.

    Handles both preview mode ("Disk space to be recovered") and clean mode
    ("Disk space recovered"). Also captures error messages and file deletion details.

    Returns a dict with keys:
    - space_recovered_bytes: Total space recovered in bytes
    - files_deleted: Number of files deleted
    - special_operations: Number of special operations performed
    - errors: Number of errors encountered
    - error_messages: List of specific error messages found
    - blocked_cleaners: List of cleaners that couldn't run (e.g., app running)
    - deleted_files: List of files that were deleted (with sizes)
    - no_work: Boolean indicating if there was nothing to clean
    """
    summary: Dict[str, Any] = {
        "space_recovered_bytes": 0,
        "files_deleted": 0,
        "special_operations": 0,
        "errors": 0,
        "error_messages": [],
        "blocked_cleaners": [],
        "deleted_files": [],
        "no_work": False,
    }

    # Patterns for summary lines
    patterns = {
        "space_recovered": re.compile(
            r"Disk space (?:to be )?recovered:\s*(\d+(?:\.\d+)?)\s*([kKmMgG]B)?"
        ),
        "files_deleted": re.compile(r"Files (?:to be )?deleted:\s*(\d+)"),
        "special_operations": re.compile(r"Special operations:\s*(\d+)"),
        "errors": re.compile(r"Errors:\s*(\d+)"),
    }

    # Pattern for individual file deletions: "Delete <size> <path>"
    file_delete_pattern = re.compile(
        r"Delete\s+(\d+(?:\.\d+)?)\s*([kKmMgG]B)?\s+(.+)"
    )

    # Pattern for application blocking messages
    blocked_pattern = re.compile(
        r"(.+?)\s+cannot be cleaned because (?:it is currently running|.+?)\."
    )

    lines = output.splitlines()
    for i, line in enumerate(lines):
        line_stripped = line.strip()

        # Check for "No work to do" message
        if "No work to do" in line_stripped:
            summary["no_work"] = True
            continue
        
        # Check for zero work indicators
        if "Disk space to be recovered: 0B" in line_stripped:
            if i + 1 < len(lines) and "Files to be deleted: 0" in lines[i + 1].strip():
                summary["no_work"] = True
            continue

        # Parse space recovered (handles both preview and clean modes)
        if "Disk space" in line and ("recovered" in line or "to be recovered" in line):
            match = patterns["space_recovered"].search(line)
            if match:
                value = float(match.group(1))
                unit = match.group(2)
                summary["space_recovered_bytes"] = convert_to_bytes(value, unit)

        # Parse files deleted
        elif "Files" in line and ("deleted" in line or "to be deleted" in line):
            match = patterns["files_deleted"].search(line)
            if match:
                summary["files_deleted"] = int(match.group(1))

        # Parse special operations
        elif "Special operations" in line:
            match = patterns["special_operations"].search(line)
            if match:
                summary["special_operations"] = int(match.group(1))

        # Parse error count
        elif "Errors:" in line:
            match = patterns["errors"].search(line)
            if match:
                summary["errors"] = int(match.group(1))

        # Parse individual file deletions
        elif line_stripped.startswith("Delete "):
            match = file_delete_pattern.search(line_stripped)
            if match:
                size_value = float(match.group(1))
                size_unit = match.group(2)
                file_path = match.group(3).strip()
                size_bytes = convert_to_bytes(size_value, size_unit)
                summary["deleted_files"].append({
                    "path": file_path,
                    "size_bytes": size_bytes,
                    "size_display": f"{size_value:.1f}{size_unit or 'B'}",
                })

        # Parse blocked cleaners (e.g., "Firefox cannot be cleaned because it is currently running")
        elif "cannot be cleaned" in line_stripped.lower():
            match = blocked_pattern.search(line_stripped)
            if match:
                cleaner_name = match.group(1).strip()
                summary["blocked_cleaners"].append(cleaner_name)
                summary["error_messages"].append(line_stripped)
            else:
                # Fallback: capture the whole line as an error message
                summary["error_messages"].append(line_stripped)

        # Capture other error-like messages
        elif any(keyword in line_stripped.lower() for keyword in ["error", "failed", "cannot", "unable"]):
            if line_stripped and line_stripped not in summary["error_messages"]:
                summary["error_messages"].append(line_stripped)

    return summary


def _resolve_bleachbit_executable(exec_path: str) -> Optional[str]:
    """Resolve the appropriate BleachBit executable for console operations.

    For --clean operations, bleachbit_console.exe is required as bleachbit.exe
    doesn't support console flags. This function:
    1. If bleachbit.exe is provided, checks for bleachbit_console.exe in the same directory
    2. If bleachbit_console.exe exists, uses it (required for --clean)
    3. Otherwise, uses the provided path as-is

    Returns the path if valid, None otherwise.
    """
    if not exec_path:
        return None

    # If a directory was provided, prefer bleachbit_console.exe for console operations
    if os.path.isdir(exec_path):
        # Try console exe first (required for --clean)
        console_candidate = os.path.join(exec_path, "bleachbit_console.exe")
        if os.path.exists(console_candidate):
            return console_candidate
        # Fallback to regular exe
        regular_candidate = os.path.join(exec_path, "bleachbit.exe")
        if os.path.exists(regular_candidate):
            return regular_candidate
        return None

    # If a file path was provided
    if os.path.isfile(exec_path):
        folder = os.path.dirname(exec_path)
        name = os.path.basename(exec_path).lower()
        
        # If bleachbit.exe is provided, check for bleachbit_console.exe in same directory
        if name == "bleachbit.exe":
            console_path = os.path.join(folder, "bleachbit_console.exe")
            if os.path.exists(console_path):
                logger.info(
                    "Using bleachbit_console.exe for console operations (required for --clean flag)"
                )
                return console_path
            # If console exe doesn't exist, warn but use the provided exe
            logger.warning(
                "bleachbit_console.exe not found in %s. bleachbit.exe may not support --clean flag.",
                folder
            )
        
        return exec_path

    # Path doesn't exist
    return None


def _determine_status(summary_data: Dict[str, Any], returncode: int) -> Tuple[str, Optional[str]]:
    """Determine task status and optional hint based on parsed output.

    Returns:
        Tuple of (status, hint) where status is "success", "warning", or "failure"
    """
    errors = summary_data.get("errors", 0)
    blocked_cleaners = summary_data.get("blocked_cleaners", [])
    error_messages = summary_data.get("error_messages", [])
    no_work = summary_data.get("no_work", False)
    files_deleted = summary_data.get("files_deleted", 0)
    space_recovered = summary_data.get("space_recovered_bytes", 0)

    # If process exited with non-zero code, it's a failure
    if returncode != 0:
        hint = None
        if returncode == 120:
            hint = (
                "Exit code 120: call not implemented. The bleachbit.exe executable does not support "
                "the --clean flag. Please ensure bleachbit_console.exe exists in the same directory "
                "as bleachbit.exe - it will be used automatically for console operations."
            )
        return "failure", hint

    # If there are explicit errors reported by BleachBit
    if errors > 0:
        # If we have blocked cleaners but some work was done, it's a warning
        if blocked_cleaners and (files_deleted > 0 or space_recovered > 0):
            hint = (
                f"{len(blocked_cleaners)} cleaner(s) could not run (applications may be running). "
                f"Close the applications and try again if needed."
            )
            return "warning", hint
        # Otherwise it's a failure
        return "failure", "One or more cleaners encountered errors during execution."

    # If cleaners were blocked but no work was done, it's a warning
    if blocked_cleaners:
        hint = (
            f"{len(blocked_cleaners)} cleaner(s) could not run because applications are currently running. "
            f"Close {', '.join(blocked_cleaners)} and try again."
        )
        return "warning", hint

    # If there's no work to do, it's still a success (nothing to clean is good)
    if no_work:
        return "success", "No files needed cleaning - system is already clean."

    # If we have error messages but no explicit error count, check if any work was done
    if error_messages and files_deleted == 0 and space_recovered == 0:
        # If no work was done and there are errors, it's likely a failure
        return "warning", "Encountered issues but no files were cleaned."

    # Default: success
    return "success", None


def run_bleachbit_clean(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the BleachBit cleaning task and return structured result."""
    add_breadcrumb(
        "Starting BleachBit clean",
        category="task",
        level="info",
        data={"cleaner_count": len(task.get("options", []))},
    )

    logger.info("Starting BleachBit task.")
    provided_exec_path: Optional[str] = task.get("executable_path")
    options: List[str] = task.get("options", [])  # cleaners to run

    if not provided_exec_path:
        logger.error("BleachBit task failed: 'executable_path' not provided.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": "Executable path was missing.",
                "error_hint": "Ensure BleachBit is properly configured in the Programs settings.",
            },
        }

    if not options:
        logger.warning("BleachBit task called with no cleaners specified.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": "No cleaners specified.",
                "error_hint": "At least one cleaner must be selected.",
            },
        }

    exec_path = _resolve_bleachbit_executable(provided_exec_path)
    if not exec_path:
        logger.error(
            "BleachBit executable not found or invalid path provided: '%s'",
            provided_exec_path,
        )
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": f"Executable not found: {provided_exec_path}",
                "error_hint": (
                    "Ensure bleachbit.exe or bleachbit_console.exe exists at the specified path. "
                    "For --clean operations, bleachbit_console.exe is required. "
                    "If using the portable version, the path should point to the executable file or the directory containing it."
                ),
            },
        }

    command = [exec_path, "--clean", *options]
    logger.info(f"Executing command: {' '.join(command)}")

    add_breadcrumb(
        "Executing BleachBit",
        category="subprocess",
        level="info",
        data={"cleaner_count": len(options), "cleaners": options},
    )

    try:
        # Set a reasonable timeout to prevent indefinite hangs
        # 30 minutes should be more than enough for cleanup operations
        timeout_seconds = 30 * 60  # 30 minutes
        
        process = run_with_skip_check(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            cwd=os.path.dirname(exec_path) or None,
            timeout=timeout_seconds,
        )

        stdout = process.stdout or ""
        stderr = process.stderr or ""

        # Log full output for debugging
        if stdout:
            logger.debug("BleachBit stdout:\n%s", stdout)
        if stderr:
            logger.debug("BleachBit stderr:\n%s", stderr)

        # Parse the output regardless of return code
        summary_data = parse_bleachbit_output(stdout)

        # Determine status based on parsed output
        status, hint = _determine_status(summary_data, process.returncode)

        # If return code is non-zero, add process error info
        if process.returncode != 0:
            error_details = stderr.strip() or stdout.strip()
            if error_details:
                summary_data.setdefault("error_messages", []).insert(0, error_details)
            summary_data["process_exit_code"] = process.returncode

        # Add hint to summary if present
        if hint:
            summary_data["error_hint"] = hint

        # Log appropriate level based on status
        if status == "failure":
            logger.error(
                "BleachBit task failed. Errors: %d, Blocked: %d, Files deleted: %d",
                summary_data.get("errors", 0),
                len(summary_data.get("blocked_cleaners", [])),
                summary_data.get("files_deleted", 0),
            )
        elif status == "warning":
            logger.warning(
                "BleachBit task completed with warnings. Errors: %d, Blocked: %d, Files deleted: %d",
                summary_data.get("errors", 0),
                len(summary_data.get("blocked_cleaners", [])),
                summary_data.get("files_deleted", 0),
            )
        else:
            logger.info(
                "BleachBit task completed successfully. Files deleted: %d, Space recovered: %d bytes",
                summary_data.get("files_deleted", 0),
                summary_data.get("space_recovered_bytes", 0),
            )

        add_breadcrumb(
            "BleachBit completed",
            category="task",
            level="info" if status == "success" else "warning",
            data={
                "status": status,
                "space_recovered_mb": summary_data.get("space_recovered_bytes", 0)
                / (1024**2),
                "files_deleted": summary_data.get("files_deleted", 0),
                "errors": summary_data.get("errors", 0),
                "blocked_cleaners": len(summary_data.get("blocked_cleaners", [])),
            },
        )

        return {
            "task_type": "bleachbit_clean",
            "status": status,
            "summary": summary_data,
        }

    except subprocess.TimeoutExpired:
        logger.error(
            "BleachBit process timed out after %d seconds (30 minutes). Process may have hung.",
            timeout_seconds
        )
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": f"Process timed out after {timeout_seconds} seconds",
                "error_hint": (
                    "BleachBit process exceeded the 30-minute timeout limit. "
                    "This may indicate the process hung or is waiting for input. "
                    "Try closing any applications that might be blocking cleanup operations."
                ),
                "timed_out": True,
            },
        }

    except FileNotFoundError:
        logger.error(f"BleachBit executable not found at '{exec_path}'.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": f"File not found: {exec_path}",
                "error_hint": (
                    "The BleachBit executable could not be found. "
                    "Verify the path in Programs settings and ensure the file exists."
                ),
            },
        }
    except Exception as e:  # noqa: BLE001
        logger.exception(f"An unexpected error occurred while running BleachBit: {e}")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {
                "error": f"An unexpected exception occurred: {str(e)}",
                "error_hint": "Check the logs for more details about this error.",
            },
        }
