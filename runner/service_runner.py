import sys
import json
import subprocess
import re
import argparse
import logging
from typing import List, Dict, Any

# Configure basic logging to stderr for debugging purposes.
# The final report will be printed to stdout.
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


def parse_bleachbit_output(output: str) -> Dict[str, Any]:
    """
    Parses the stdout from bleachbit_console.exe to extract structured data.

    Args:
        output: The captured stdout string from the BleachBit process.

    Returns:
        A dictionary containing extracted metrics like space recovered and files deleted.
    """
    summary = {
        "space_recovered_bytes": 0,
        "files_deleted": 0,
        "special_operations": 0,
        "errors": 0,
    }

    # Regex patterns to find specific lines in the output
    patterns = {
        # Looks for "Disk space recovered: 1.23MB"
        "space_recovered_bytes": re.compile(
            r"Disk space recovered:\s*(\d+(\.\d+)?)\s*([kKmMgG]B)?"
        ),
        # Looks for "Files deleted: 123"
        "files_deleted": re.compile(r"Files deleted:\s*(\d+)"),
        # Looks for "Special operations: 4"
        "special_operations": re.compile(r"Special operations:\s*(\d+)"),
        # Looks for "Errors: 1"
        "errors": re.compile(r"Errors:\s*(\d+)"),
    }

    # Helper to convert units like KB, MB, GB to bytes
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
    """
    Executes the BleachBit cleaning task.

    This function constructs and runs the BleachBit command-line tool,
    captures its output, and returns a structured result dictionary.

    Args:
        task: A dictionary containing task details, including 'executable_path'
              and a list of 'options' (cleaners to run).

    Returns:
        A dictionary summarizing the execution result.
    """
    logging.info("Starting BleachBit task.")
    exec_path = task.get("executable_path")
    options = task.get("options", [])  # Default to empty list if not provided

    if not exec_path:
        logging.error("BleachBit task failed: 'executable_path' not provided.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": "Executable path was missing."},
        }

    # Construct the command: e.g., "bleachbit_console.exe --clean system.tmp system.recycle_bin"
    command = [exec_path, "--clean"] + options
    logging.info(f"Executing command: {' '.join(command)}")

    try:
        # Run the command. text=True decodes stdout/stderr as UTF-8.
        # capture_output=True is equivalent to stdout=PIPE, stderr=PIPE.
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,  # We handle the return code manually
            encoding="utf-8",
            errors="replace",  # Handle potential encoding errors in tool output
        )

        if process.returncode != 0:
            logging.error(
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

        logging.info("BleachBit task completed successfully.")

        # Parse the output to get actionable data
        summary_data = parse_bleachbit_output(process.stdout)

        return {
            "task_type": "bleachbit_clean",
            "status": "success",
            "summary": summary_data,
        }

    except FileNotFoundError:
        logging.error(f"BleachBit executable not found at '{exec_path}'.")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred while running BleachBit: {e}")
        return {
            "task_type": "bleachbit_clean",
            "status": "failure",
            "summary": {"error": f"An unexpected exception occurred: {str(e)}"},
        }


# --- Modular Task Dispatcher ---
# To add a new tool (e.g., 'kvrt_scan'), add a new function like 'run_kvrt_scan'
# and then add it to this dictionary.
TASK_HANDLERS = {
    "bleachbit_clean": run_bleachbit_clean,
    # "kvrt_scan": run_kvrt_scan, # Example for the future
    # "windows_defender_scan": run_windows_defender_scan, # Example for the future
}


def main():
    """
    Main entry point for the automation script.

    Parses a JSON input string from the command line, executes the defined tasks,
    and prints a final JSON report to standard output.
    """
    parser = argparse.ArgumentParser(description="AutoService Automation Runner")
    parser.add_argument(
        "json_input",
        type=str,
        help="A JSON string defining the sequence of automation tasks to run.",
    )
    args = parser.parse_args()

    try:
        input_data = json.loads(args.json_input)
        tasks = input_data.get("tasks", [])
    except json.JSONDecodeError:
        logging.error("Failed to decode input JSON.")
        final_report = {
            "overall_status": "failure",
            "error": "Invalid JSON input provided.",
            "results": [],
        }
        print(json.dumps(final_report, indent=2))
        sys.exit(1)

    all_results = []
    overall_success = True

    for task in tasks:
        task_type = task.get("type")
        handler = TASK_HANDLERS.get(task_type)

        if handler:
            result = handler(task)
            if result.get("status") == "failure":
                overall_success = False
            all_results.append(result)
        else:
            logging.warning(f"No handler found for task type '{task_type}'. Skipping.")
            all_results.append(
                {
                    "task_type": task_type,
                    "status": "skipped",
                    "summary": {
                        "reason": f"No handler implemented for this task type."
                    },
                }
            )

    final_report = {
        "overall_status": "success" if overall_success else "completed_with_errors",
        "results": all_results,
    }

    # Print the final JSON report to stdout for the parent process (AutoService) to capture.
    print(json.dumps(final_report, indent=2))


if __name__ == "__main__":
    main()
