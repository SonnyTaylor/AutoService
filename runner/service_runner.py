"""Automation runner for AutoService.

Coordinates execution of individual maintenance/diagnostic tasks (e.g., BleachBit,
SFC, DISM) and streams progress to stderr for the UI while emitting a final JSON
report to stdout. Windows elevation is requested automatically when needed.
"""

import sys, os, ctypes, json, subprocess, argparse, logging, time
from typing import List, Dict, Any, Callable


def is_admin():
    """Return True if the current process is running with administrator rights.

    On non-Windows platforms, returns False if the check fails.
    """
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False


def relaunch_elevated(argv: List[str]) -> int:
    """Attempt to relaunch this executable elevated.

    Returns Windows-style error code on failure; returns 0 if the relaunch was
    initiated successfully (this process should then exit).
    """
    try:
        # Use the current executable so this works for both python.exe and PyInstaller exe
        exe_path = sys.executable
        # Build parameter string excluding the executable itself
        params = " ".join([f'"{a}"' for a in argv])
        ShellExecuteW = ctypes.windll.shell32.ShellExecuteW
        ShellExecuteW.restype = ctypes.c_void_p
        rc = ShellExecuteW(None, "runas", exe_path, params, None, 1)
        # Per docs, >32 indicates success; <=32 are error codes
        if rc <= 32:
            # 1223 is ERROR_CANCELLED when the user refuses elevation
            # ShellExecuteW doesn't return 1223 directly, but map common access denied to 1223 for clarity
            return int(rc) if rc != 5 else 1223
        return 0
    except Exception:
        return 1


# Local service imports
from services.bleachbit_service import run_bleachbit_clean  # type: ignore
from services.adwcleaner_service import run_adwcleaner_clean  # type: ignore
from services.furmark_service import run_furmark_test  # type: ignore
from services.heavyload_service import run_heavyload_stress_test  # type: ignore
from services.smartctl_service import run_smartctl_report  # type: ignore
from services.sfc_service import run_sfc_scan  # type: ignore
from services.dism_service import run_dism_health_check  # type: ignore
from services.ai_startup_service import run_ai_startup_disable  # type: ignore
from services.ping_service import run_ping_test  # type: ignore

# Configure logging to stderr for live streaming to the UI.
# Use a simple format that's easy to parse.
_DEFAULT_LOG_FMT = "%(message)s"
logging.basicConfig(level=logging.INFO, stream=sys.stderr, format=_DEFAULT_LOG_FMT)

# Truncation threshold for log snippets to keep logs readable in the UI.
MAX_LOG_SNIPPET: int = 200

# Type aliases for better readability.
Task = Dict[str, Any]
TaskResult = Dict[str, Any]
TaskHandler = Callable[[Task], TaskResult]


# --- Modular Task Dispatcher ---
# To add a new tool (e.g., 'kvrt_scan'), add a new function like 'run_kvrt_scan'
# and then add it to this dictionary.
TASK_HANDLERS: Dict[str, TaskHandler] = {
    "bleachbit_clean": run_bleachbit_clean,
    "adwcleaner_clean": run_adwcleaner_clean,
    "furmark_stress_test": run_furmark_test,
    "heavyload_stress_test": run_heavyload_stress_test,
    "smartctl_report": run_smartctl_report,
    "sfc_scan": run_sfc_scan,
    "dism_health_check": run_dism_health_check,
    "ai_startup_disable": run_ai_startup_disable,
    "ping_test": run_ping_test,
    # "kvrt_scan": run_kvrt_scan, # Example for the future
    # "windows_defender_scan": run_windows_defender_scan, # Example for the future
}


def main():
    """Entrypoint: parse input, execute tasks, emit final JSON report.

    Behavior:
    - Accepts either a raw JSON string or a path to a JSON file describing tasks
    - Optionally writes a live log to a file and/or writes the final report to a file
    - On Windows, auto-prompts for elevation if not already running as admin
    """
    parser = argparse.ArgumentParser(description="AutoService Automation Runner")
    parser.add_argument(
        "json_input",
        type=str,
        help="Either a JSON string or a path to a JSON file defining tasks.",
    )
    parser.add_argument(
        "--output-file",
        "-o",
        dest="output_file",
        type=str,
        default=None,
        help="Optional path to write the final JSON report. If omitted, no file is written.",
    )
    parser.add_argument(
        "--log-file",
        dest="log_file",
        type=str,
        default=None,
        help="Optional path to write a live log file (in addition to stderr).",
    )
    args = parser.parse_args()

    # Configure file logging if requested
    if args.log_file:
        try:
            os.makedirs(os.path.dirname(args.log_file), exist_ok=True)
            fh = logging.FileHandler(args.log_file, encoding="utf-8")
            fh.setFormatter(logging.Formatter(_DEFAULT_LOG_FMT))
            logging.getLogger().addHandler(fh)
            logging.info("Log file initialized: %s", args.log_file)
        except Exception as e:  # noqa: BLE001
            logging.error("Failed to initialize log file '%s': %s", args.log_file, e)

    # Elevation (Windows only): avoid confusing failures for tools that need admin rights.
    if os.name == "nt" and not is_admin():
        logging.info("Attempting to elevate privileges via UAC prompt…")
        # Preserve arguments; include script/module path in argv for Python launched interpreter
        argv = sys.argv[0:]
        code = relaunch_elevated(argv)
        if code != 0:
            logging.error("Elevation failed or cancelled (code %s)", code)
            sys.exit(code)
        # Relaunch initiated successfully; exit unelevated instance so elevated one can proceed
        sys.exit(0)

    raw_input = args.json_input
    logging.info(f"Received input: {raw_input[:MAX_LOG_SNIPPET]}...")
    input_data = None
    # Allow passing a filename instead of raw JSON
    if os.path.exists(raw_input) and os.path.isfile(raw_input):
        logging.info(f"Reading from file: {raw_input}")
        try:
            with open(raw_input, "r", encoding="utf-8") as f:
                input_data = json.load(f)
        except Exception as e:  # noqa: BLE001
            logging.error(f"Failed reading JSON file: {e}")
    if input_data is None:
        logging.info("Parsing as raw JSON")
        try:
            input_data = json.loads(raw_input)
        except json.JSONDecodeError:
            logging.error("Failed to decode input JSON.")
            final_report = {
                "overall_status": "failure",
                "error": "Invalid JSON input provided.",
                "results": [],
            }
            print(json.dumps(final_report, indent=2))
            sys.exit(1)
    # Extract tasks list; default to empty list if key missing.
    tasks = input_data.get("tasks", [])
    logging.info(f"Parsed {len(tasks)} tasks")
    for i, task in enumerate(tasks):
        logging.info(f"Task {i}: {task.get('type', 'unknown')}")

    all_results = []
    overall_success = True

    for idx, task in enumerate(tasks):
        task_type = task.get("type")
        handler = TASK_HANDLERS.get(task_type)

        if handler:
            logging.info("TASK_START:%d:%s", idx, task_type)
            logging.info("Starting task %d/%d: %s", idx + 1, len(tasks), task_type)

            try:
                result = handler(task)
                status = result.get("status", "unknown")

                if status == "failure":
                    overall_success = False
                    logging.error(
                        "TASK_FAIL:%d:%s - %s",
                        idx,
                        task_type,
                        result.get("summary", {}).get("reason", "Unknown error"),
                    )
                elif status == "skipped":
                    logging.warning(
                        "TASK_SKIP:%d:%s - %s",
                        idx,
                        task_type,
                        result.get("summary", {}).get("reason", "Skipped"),
                    )
                else:
                    logging.info("TASK_OK:%d:%s", idx, task_type)

                # Log additional details if available
                summary = result.get("summary", {})
                if summary and isinstance(summary, dict):
                    if "output" in summary:
                        out_text = str(summary["output"])  # ensure sliceable string
                        logging.info(
                            "Task %s completed with output: %s",
                            task_type,
                            out_text[:MAX_LOG_SNIPPET] + "..."
                            if len(out_text) > MAX_LOG_SNIPPET
                            else out_text,
                        )
                    if "duration_seconds" in summary:
                        logging.info(
                            "Task %s took %.2f seconds",
                            task_type,
                            summary["duration_seconds"],
                        )

                all_results.append(result)

            except Exception as e:
                overall_success = False
                logging.error("TASK_FAIL:%d:%s - Exception: %s", idx, task_type, str(e))
                all_results.append(
                    {
                        "task_type": task_type,
                        "status": "failure",
                        "summary": {"reason": f"Exception during execution: {str(e)}"},
                    }
                )

        else:
            logging.warning(
                "TASK_SKIP:%d:%s - No handler found for task type", idx, task_type
            )
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
    report_json = json.dumps(final_report, indent=2)
    print(report_json)

    # Write the final report to disk only if the user supplied --output-file.
    output_path = args.output_file
    if output_path:
        try:
            dirpath = os.path.dirname(output_path)
            if dirpath:
                os.makedirs(dirpath, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as out_f:
                out_f.write(report_json)
            logging.info(f"Final report written to '{output_path}'")
        except Exception as e:  # noqa: BLE001
            logging.error(f"Failed to write final report to '{output_path}': {e}")
    else:
        logging.info("No --output-file provided; final report not written to disk.")


if __name__ == "__main__":
    main()
