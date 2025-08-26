import json
import subprocess
import sys
import os
from datetime import datetime, timezone
from typing import Dict, Any, List

"""
AutoService Python Service Runner

This script is designed to run system maintenance/security tasks (starting with Windows Defender scans)
using external tools, collect logs, and generate a structured JSON report.

Usage:
    python service_runner.py input.json output.json

Where:
    - input.json: Defines what tasks to run and with what settings.
    - output.json: File to write the results report.

Example input.json:
{
  "tasks": [
    {
      "type": "antivirus",
      "tool": "windows_defender",
      "scan_type": "quick"
    }
  ]
}
"""


def run_windows_defender(scan_type: str = "quick") -> Dict[str, Any]:
    """
    Run a Windows Defender scan using MpCmdRun.exe.

    Args:
        scan_type (str): Type of scan ("quick" or "full").

    Returns:
        Dict with status, output, errors, and summary metrics if possible.
    """
    # Locate MpCmdRun.exe (default Windows path)
    defender_path = r"C:\Program Files\Windows Defender\MpCmdRun.exe"
    if not os.path.exists(defender_path):
        return {
            "tool": "windows_defender",
            "status": "error",
            "message": f"MpCmdRun.exe not found at {defender_path}",
        }

    # Map scan type to argument
    scan_args = {
        "quick": ["-Scan", "-ScanType", "1"],
        "full": ["-Scan", "-ScanType", "2"],
    }

    if scan_type not in scan_args:
        scan_type = "quick"  # fallback

    cmd = [defender_path] + scan_args[scan_type]

    try:
        process = subprocess.run(cmd, capture_output=True, text=True, check=False)

        # Basic parse of Defender output
        stdout = process.stdout.strip()
        stderr = process.stderr.strip()

        result = {
            "tool": "windows_defender",
            "scan_type": scan_type,
            "status": "success" if process.returncode == 0 else "failed",
            "exit_code": process.returncode,
            "stdout": stdout,
            "stderr": stderr,
        }

        # TODO: Parse stdout for metrics like threats found, cleaned, etc.

        return result
    except Exception as e:
        return {"tool": "windows_defender", "status": "error", "message": str(e)}


def run_task(task: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dispatch a single task to the appropriate handler.

    Args:
        task: Dictionary describing the task.

    Returns:
        Dictionary with the task's execution results.
    """
    task_type = task.get("type")
    tool = task.get("tool")

    if task_type == "antivirus" and tool == "windows_defender":
        return run_windows_defender(task.get("scan_type", "quick"))

    return {"tool": tool, "status": "skipped", "message": "Unsupported task type/tool"}


def main():
    if len(sys.argv) < 3:
        print("Usage: python service_runner.py input.json output.json")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(input_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    tasks: List[Dict[str, Any]] = config.get("tasks", [])
    results: List[Dict[str, Any]] = []

    for task in tasks:
        result = run_task(task)
        results.append(result)

    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "results": results,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
