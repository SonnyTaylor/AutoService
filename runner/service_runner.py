import sys, os, ctypes, json, subprocess, argparse, logging
from typing import List, Dict, Any


def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False


if not is_admin():
    # Relaunch script with admin rights
    params = " ".join([f'"{x}"' for x in sys.argv])
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
    sys.exit(0)

# Local service imports
from services.bleachbit_service import run_bleachbit_clean  # type: ignore
from services.adwcleaner_service import run_adwcleaner_clean  # type: ignore
from services.furmark_service import run_furmark_test  # type: ignore
from services.heavyload_service import run_heavyload_stress_test  # type: ignore

# Configure basic logging to stderr for debugging purposes.
# The final report will be printed to stdout.
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


"""BleachBit functionality refactored into services.bleachbit_service."""


# --- Modular Task Dispatcher ---
# To add a new tool (e.g., 'kvrt_scan'), add a new function like 'run_kvrt_scan'
# and then add it to this dictionary.
TASK_HANDLERS = {
    "bleachbit_clean": run_bleachbit_clean,
    "adwcleaner_clean": run_adwcleaner_clean,
    "furmark_stress_test": run_furmark_test,
    "heavyload_stress_test": run_heavyload_stress_test,
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
    args = parser.parse_args()

    raw_input = args.json_input
    input_data = None
    # Allow passing a filename instead of raw JSON
    if os.path.exists(raw_input) and os.path.isfile(raw_input):
        try:
            with open(raw_input, "r", encoding="utf-8") as f:
                input_data = json.load(f)
        except Exception as e:  # noqa: BLE001
            logging.error(f"Failed reading JSON file: {e}")
    if input_data is None:
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
    tasks = input_data.get("tasks", [])

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
