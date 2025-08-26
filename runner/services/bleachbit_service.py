import subprocess
import re
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


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


def run_bleachbit_clean(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the BleachBit cleaning task and return structured result."""
    logger.info("Starting BleachBit task.")
    exec_path = task.get("executable_path")
    options: List[str] = task.get("options", [])  # cleaners to run

    if not exec_path:
        logger.error("BleachBit task failed: 'executable_path' not provided.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": "Executable path was missing."},
        }

    command = [exec_path, "--clean"] + options
    logger.info(f"Executing command: {' '.join(command)}")

    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )

        if process.returncode != 0:
            logger.error(
                f"BleachBit process exited with error code {process.returncode}."
            )
            return {
                "task_type": "bleachbit_clean",
                "status": "failure",
                "summary": {
                    "error": f"Process exited with code {process.returncode}.",
                    "details": process.stderr.strip(),
                },
            }

        logger.info("BleachBit task completed successfully.")
        summary_data = parse_bleachbit_output(process.stdout)
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
