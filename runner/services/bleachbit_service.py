"""BleachBit cleaning service.

Runs BleachBit with selected cleaners and parses console output into
structured metrics (space reclaimed, files deleted, etc.).
"""

import subprocess
import re
import logging
from typing import Dict, Any, List, Optional
import os

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def parse_bleachbit_output(output: str) -> Dict[str, Any]:
    """Parse stdout from bleachbit_console.exe to extract structured data.

    Returns a dict with keys: space_recovered_bytes, files_deleted, special_operations, errors.
    """
    summary = {
        "space_recovered_bytes": 0,
        "files_deleted": 0,
        "special_operations": 0,
        "errors": 0,
    }

    patterns = {
        "space_recovered_bytes": re.compile(
            r"Disk space recovered:\s*(\d+(\.\d+)?)\s*([kKmMgG]B)?"
        ),
        "files_deleted": re.compile(r"Files deleted:\s*(\d+)"),
        "special_operations": re.compile(r"Special operations:\s*(\d+)"),
        "errors": re.compile(r"Errors:\s*(\d+)"),
    }

    def convert_to_bytes(value, unit):
        if unit:
            unit = unit.lower()
            if unit.startswith("k"):
                return value * 1024
            if unit.startswith("m"):
                return value * 1024**2
            if unit.startswith("g"):
                return value * 1024**3
        return value

    for line in output.splitlines():
        if "Disk space recovered" in line:
            match = patterns["space_recovered_bytes"].search(line)
            if match:
                value = float(match.group(1))
                unit = match.group(3)
                summary["space_recovered_bytes"] = int(convert_to_bytes(value, unit))
        elif "Files deleted" in line:
            match = patterns["files_deleted"].search(line)
            if match:
                summary["files_deleted"] = int(match.group(1))
        elif "Special operations" in line:
            match = patterns["special_operations"].search(line)
            if match:
                summary["special_operations"] = int(match.group(1))
        elif "Errors" in line:
            match = patterns["errors"].search(line)
            if match:
                summary["errors"] = int(match.group(1))

    return summary


def _resolve_bleachbit_console_path(exec_path: str) -> Optional[str]:
    """Given a path provided by the task, resolve the proper console executable.

    Prefers bleachbit_console.exe. If the provided path is the GUI exe or a directory,
    attempt to locate the console exe in the same folder.
    """
    if not exec_path:
        return None

    # If a directory was provided, assume portable layout and append console exe
    if os.path.isdir(exec_path):
        candidate = os.path.join(exec_path, "bleachbit_console.exe")
        return candidate if os.path.exists(candidate) else None

    # If a file path was provided
    if os.path.isfile(exec_path):
        folder = os.path.dirname(exec_path)
        name = os.path.basename(exec_path).lower()
        if name == "bleachbit.exe":
            # Switch to console exe in the same folder
            console_path = os.path.join(folder, "bleachbit_console.exe")
            if os.path.exists(console_path):
                logger.info(
                    "Detected GUI executable; switching to console executable: %s",
                    console_path,
                )
                return console_path
        # If it's already the console exe, keep as is
        return exec_path

    # Path doesn't exist
    return None


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
            "summary": {"error": "Executable path was missing."},
        }

    exec_path = _resolve_bleachbit_console_path(provided_exec_path)
    if not exec_path:
        logger.error(
            "BleachBit executable not found or invalid path provided: '%s'",
            provided_exec_path,
        )
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": f"Executable not found: {provided_exec_path}"},
        }

    command = [exec_path, "--clean", *options]
    logger.info(f"Executing command: {' '.join(command)}")

    add_breadcrumb(
        "Executing BleachBit",
        category="subprocess",
        level="info",
        data={"cleaner_count": len(options)},
    )

    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            cwd=os.path.dirname(exec_path) or None,
        )

        stdout = process.stdout or ""
        stderr = process.stderr or ""

        if process.returncode != 0:
            # Provide a more helpful hint for common Windows error 120 when the GUI exe was used
            hint = None
            if process.returncode == 120:
                hint = (
                    "Exit code 120: call not implemented. This often occurs when the GUI "
                    "executable is invoked with console flags. Ensure bleachbit_console.exe is used."
                )
            logger.error(
                "BleachBit process exited with error code %s.", process.returncode
            )

            return {
                "task_type": "bleachbit_clean",
                "status": "failure",
                "summary": {
                    "error": f"Process exited with code {process.returncode}.",
                    "details": stderr.strip() or stdout.strip(),
                    **({"hint": hint} if hint else {}),
                },
            }

        logger.info("BleachBit task completed successfully.")
        summary_data = parse_bleachbit_output(stdout)

        add_breadcrumb(
            "BleachBit completed",
            category="task",
            level="info",
            data={
                "space_recovered_mb": summary_data.get("space_recovered_bytes", 0)
                / (1024**2),
                "files_deleted": summary_data.get("files_deleted", 0),
                "errors": summary_data.get("errors", 0),
            },
        )

        return {
            "task_type": "bleachbit_clean",
            "status": "success",
            "summary": summary_data,
        }

    except FileNotFoundError:
        logger.error(f"BleachBit executable not found at '{exec_path}'.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:  # noqa: BLE001
        logger.error(f"An unexpected error occurred while running BleachBit: {e}")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": f"An unexpected exception occurred: {str(e)}"},
        }
