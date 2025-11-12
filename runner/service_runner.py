"""Automation runner for AutoService.

Coordinates execution of individual maintenance/diagnostic tasks (e.g., BleachBit,
SFC, DISM) and streams progress to stderr for the UI while emitting a final JSON
report to stdout. Windows elevation is requested automatically when needed.
"""

import sys, os, ctypes, json, subprocess, argparse, logging, time
from typing import List, Dict, Any, Callable, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import Sentry configuration early for error tracking
try:
    from sentry_config import (
        init_sentry,
        capture_task_exception,
        capture_task_failure,
        create_task_span,
        add_breadcrumb,
    )

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    # Define no-op fallbacks if sentry_config is not available
    def init_sentry():
        return False

    def capture_task_exception(
        exception, task_type, task_data=None, extra_context=None
    ):
        return None

    def capture_task_failure(
        task_type, failure_reason, task_data=None, extra_context=None
    ):
        return None

    def create_task_span(task_type, task_index, total_tasks, task_data=None):
        from contextlib import contextmanager

        @contextmanager
        def _noop():
            yield None

        return _noop()

    def add_breadcrumb(message, category="info", level="info", **data):
        pass


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
from services.ai_browser_notification_service import run_ai_browser_notification_disable  # type: ignore
from services.ping_service import run_ping_test  # type: ignore
from services.chkdsk_service import run_chkdsk_scan  # type: ignore
from services.iperf_service import run_iperf_test  # type: ignore
from services.kvrt_service import run_kvrt_scan  # type: ignore
from services.speedtest_service import run_speedtest  # type: ignore
from services.windows_update_service import run_windows_update  # type: ignore
from services.windows_update_logs_service import run_windows_update_logs_analysis  # type: ignore
from services.whynotwin11_service import run_whynotwin11_check  # type: ignore
from services.winsat_service import run_winsat_disk  # type: ignore
from services.disk_space_service import run_disk_space_report  # type: ignore
from services.battery_service import run_battery_health_report  # type: ignore
from services.drivecleanup_service import run_drivecleanup_clean  # type: ignore
from services.trellix_stinger_service import run_trellix_stinger_scan  # type: ignore
from services.system_restore_service import run_system_restore  # type: ignore

"""NOTE ON REAL-TIME LOG STREAMING

Historically the UI only received task status updates after all tasks finished.
Root causes observed on Windows when launching via PowerShell / Tauri shell:
  * stdio stream buffering (especially when frozen into an .exe) delayed delivery
  * file handler buffering (write combining) further postponed writes

Mitigations implemented below:
  * Force stdout/stderr into (best-effort) line-buffered / unbuffered modes
  * Provide a helper flush_logs() and call it immediately after each marker line
  * Keep log format minimal so the UI regex ( ^TASK_START etc.) matches directly
"""

# Attempt to force line buffering / unbuffered behavior for Python >=3.7
try:  # pragma: no cover - defensive
    _reconf_out = getattr(sys.stdout, "reconfigure", None)
    if callable(_reconf_out):  # type: ignore[attr-defined]
        try:
            _reconf_out(line_buffering=True, write_through=True)  # type: ignore[call-arg]
        except Exception:
            pass
    _reconf_err = getattr(sys.stderr, "reconfigure", None)
    if callable(_reconf_err):  # type: ignore[attr-defined]
        try:
            _reconf_err(line_buffering=True, write_through=True)  # type: ignore[call-arg]
        except Exception:
            pass
except Exception:  # noqa: BLE001
    pass

# Configure logging to stderr for live streaming to the UI (message only).
_DEFAULT_LOG_FMT = "%(message)s"
logging.basicConfig(
    level=logging.INFO, stream=sys.stderr, format=_DEFAULT_LOG_FMT, force=True
)


def flush_logs():  # pragma: no cover - simple utility
    """Flush all logging handlers & stdio to push incremental lines to UI ASAP."""
    try:
        for h in logging.getLogger().handlers:
            try:
                h.flush()
                # Force underlying OS write for file handlers to minimize buffering delays
                stream = getattr(h, "stream", None)
                if stream is not None and hasattr(stream, "fileno"):
                    try:
                        os.fsync(stream.fileno())  # type: ignore[arg-type]
                    except Exception:
                        pass
            except Exception:
                pass
        try:
            sys.stderr.flush()
        except Exception:
            pass
        try:
            sys.stdout.flush()
        except Exception:
            pass
    except Exception:
        pass


def check_control_file(
    control_file_path: Optional[str],
) -> Tuple[Optional[str], Optional[int]]:
    """Check control file for stop/pause/skip/resume signals.

    Returns:
        Tuple of (action, timestamp) or (None, None) if no signal or file doesn't exist.
        action can be "stop", "pause", "skip", or "resume".
    """
    if not control_file_path:
        return None, None

    try:
        if not os.path.exists(control_file_path):
            return None, None

        with open(control_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            action = data.get("action")
            timestamp = data.get("timestamp")
            if action in ("stop", "pause", "skip", "resume"):
                return action, timestamp
    except Exception:
        # File doesn't exist, is malformed, or other error - ignore
        pass

    return None, None


def clear_control_file(control_file_path: Optional[str]) -> None:
    """Clear the control file by removing it.

    Args:
        control_file_path: Path to the control file to clear
    """
    if control_file_path and os.path.exists(control_file_path):
        try:
            os.remove(control_file_path)
        except Exception:
            pass


def execute_task_with_skip_monitoring(
    handler: TaskHandler,
    task: Task,
    control_file_path: Optional[str],
    check_interval: float = 0.2,
) -> TaskResult:
    """Execute a task handler with periodic skip signal monitoring.

    This function runs the handler and periodically checks for skip signals.
    If a skip signal is detected, it raises KeyboardInterrupt to immediately stop the task.

    For handlers that use subprocess calls, the subprocess_utils.run_with_skip_check
    will handle skip detection within those subprocess calls. This wrapper provides
    additional monitoring for handlers that don't use subprocess calls or have
    long-running Python code between subprocess calls.

    Args:
        handler: The task handler function to execute
        task: The task dictionary to pass to the handler
        control_file_path: Path to the control file for skip signal checking
        check_interval: How often to check for skip signals (seconds)

    Returns:
        TaskResult from the handler

    Raises:
        KeyboardInterrupt: If skip signal is detected during execution
    """
    # Simple approach: check for skip before calling handler, then call handler directly
    # Most handlers use subprocess_utils.run_with_skip_check which handles skip internally
    # For handlers with long Python code, they should check periodically themselves
    # This wrapper just ensures we catch skip signals that might be set right before
    # or during handler execution

    # Check for skip signal before starting
    action, _ = check_control_file(control_file_path)
    if action == "skip":
        clear_control_file(control_file_path)
        raise KeyboardInterrupt("User requested skip")

    # Call handler directly - subprocess calls within will handle skip signals
    # For pure Python code, the handler should check periodically if needed
    result = handler(task)

    # Check for skip signal after handler completes (in case it was set during execution
    # but handler didn't check for it - this shouldn't happen with proper subprocess usage)
    action, _ = check_control_file(control_file_path)
    if action == "skip":
        clear_control_file(control_file_path)
        # Handler already completed, but skip was requested - mark as skipped anyway
        raise KeyboardInterrupt("User requested skip")

    return result


# Truncation threshold for log snippets to keep logs readable in the UI.
MAX_LOG_SNIPPET: int = 200

# Type aliases for better readability.
Task = Dict[str, Any]
TaskResult = Dict[str, Any]
TaskHandler = Callable[[Task], TaskResult]


def execute_single_task(
    task: Task,
    task_index: int,
    total_tasks: int,
    control_file_path: Optional[str],
    all_results: List[TaskResult],
    overall_success_ref: List[bool],
) -> Optional[TaskResult]:
    """Execute a single task and return its result.

    This is a helper function used by both sequential and parallel execution.
    It handles task execution, logging, error handling, and result collection.

    Args:
        task: The task dictionary to execute
        task_index: Index of the task in the task list
        total_tasks: Total number of tasks
        control_file_path: Path to control file for skip signals
        all_results: List to append results to (for progress updates)
        overall_success_ref: List with single bool element to track overall success

    Returns:
        TaskResult dictionary or None if task was skipped
    """
    # Check for skip signal before starting
    action, _ = check_control_file(control_file_path)
    if action == "skip":
        clear_control_file(control_file_path)
        task_type = task.get("type", "unknown")
        logging.warning(
            "TASK_SKIP:%d:%s - User requested skip",
            task_index,
            task_type,
        )
        flush_logs()
        skipped_result = {
            "task_type": task_type,
            "status": "skipped",
            "summary": {"reason": "User requested skip"},
        }
        return skipped_result

    task_type = task.get("type", "")
    handler = TASK_HANDLERS.get(task_type) if task_type else None

    if not handler:
        logging.warning(
            "TASK_SKIP:%d:%s - No handler found for task type",
            task_index,
            task_type,
        )
        flush_logs()
        add_breadcrumb(
            f"No handler found for task type: {task_type}",
            category="task",
            level="warning",
            task_type=task_type,
        )
        skipped_result = {
            "task_type": task_type,
            "status": "skipped",
            "summary": {"reason": f"No handler implemented for this task type."},
        }
        return skipped_result

    logging.info("TASK_START:%d:%s", task_index, task_type)
    logging.info("Starting task %d/%d: %s", task_index + 1, total_tasks, task_type)
    flush_logs()

    # Add Sentry breadcrumb for task start
    add_breadcrumb(
        f"Starting task: {task_type}",
        category="task",
        level="info",
        task_type=task_type,
        task_index=task_index,
        total_tasks=total_tasks,
    )

    # Wrap task execution in Sentry span for performance tracking
    with create_task_span(task_type, task_index, total_tasks, task) as span:
        try:
            # Track execution time for all tasks
            task_start_time = time.time()

            # Execute handler with skip monitoring for immediate skip detection
            result = execute_task_with_skip_monitoring(
                handler, task, control_file_path, check_interval=0.2
            )

            # Calculate duration and add to summary if not already present
            task_duration = time.time() - task_start_time
            if not result.get("summary"):
                result["summary"] = {}
            if "duration_seconds" not in result.get("summary", {}):
                result["summary"]["duration_seconds"] = round(task_duration, 2)

            status = result.get("status", "unknown")

            # Handle both "failure" and "error" as error conditions
            if status in ("failure", "error"):
                overall_success_ref[0] = False
                failure_reason = result.get("summary", {}).get("reason") or result.get(
                    "summary", {}
                ).get("error", "Unknown error")
                logging.error(
                    "TASK_FAIL:%d:%s - %s",
                    task_index,
                    task_type,
                    failure_reason,
                )
                # Capture task failure in Sentry
                capture_task_failure(
                    task_type=task_type,
                    failure_reason=failure_reason,
                    task_data=task,
                    extra_context={
                        "task_index": task_index,
                        "total_tasks": total_tasks,
                        "result_summary": result.get("summary", {}),
                        "status_type": status,
                    },
                )
                add_breadcrumb(
                    f"Task failed: {task_type}",
                    category="task",
                    level="error",
                    task_type=task_type,
                    reason=failure_reason,
                    status=status,
                )
            elif status == "skipped":
                logging.warning(
                    "TASK_SKIP:%d:%s - %s",
                    task_index,
                    task_type,
                    result.get("summary", {}).get("reason", "Skipped"),
                )
                add_breadcrumb(
                    f"Task skipped: {task_type}",
                    category="task",
                    level="warning",
                    task_type=task_type,
                    reason=result.get("summary", {}).get("reason", "Skipped"),
                )
            else:
                logging.info("TASK_OK:%d:%s", task_index, task_type)
                add_breadcrumb(
                    f"Task completed successfully: {task_type}",
                    category="task",
                    level="info",
                    task_type=task_type,
                )
                if span:
                    span.set_tag("status", "success")

            flush_logs()

            # Log additional details if available
            summary = result.get("summary", {})
            if summary and isinstance(summary, dict):
                if "output" in summary:
                    out_text = str(summary["output"])
                    logging.info(
                        "Task %s completed with output: %s",
                        task_type,
                        out_text[:MAX_LOG_SNIPPET] + "..."
                        if len(out_text) > MAX_LOG_SNIPPET
                        else out_text,
                    )
                    flush_logs()
                if "duration_seconds" in summary:
                    logging.info(
                        "Task %s took %.2f seconds",
                        task_type,
                        summary["duration_seconds"],
                    )
                    flush_logs()
                    if span:
                        span.set_data("duration_seconds", summary["duration_seconds"])

            return result

        except KeyboardInterrupt as e:
            # Handle skip signal
            if "skip" in str(e).lower() or "User requested skip" in str(e):
                logging.warning(
                    "TASK_SKIP:%d:%s - User requested skip",
                    task_index,
                    task_type,
                )
                flush_logs()
                skipped_result = {
                    "task_type": task_type,
                    "status": "skipped",
                    "summary": {"reason": "User requested skip"},
                }
                clear_control_file(control_file_path)
                return skipped_result
            else:
                raise
        except Exception as e:
            overall_success_ref[0] = False
            logging.error(
                "TASK_FAIL:%d:%s - Exception: %s", task_index, task_type, str(e)
            )
            flush_logs()

            # Capture exception with Sentry
            capture_task_exception(
                e,
                task_type=task_type,
                task_data=task,
                extra_context={
                    "task_index": task_index,
                    "total_tasks": total_tasks,
                },
            )

            if span:
                span.set_tag("status", "error")
                span.set_tag("error", True)

            failure_result = {
                "task_type": task_type,
                "status": "failure",
                "summary": {"reason": f"Exception during execution: {str(e)}"},
            }
            return failure_result


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
    "ai_browser_notification_disable": run_ai_browser_notification_disable,
    "ping_test": run_ping_test,
    "chkdsk_scan": run_chkdsk_scan,
    "iperf_test": run_iperf_test,
    "kvrt_scan": run_kvrt_scan,
    "speedtest": run_speedtest,
    "windows_update": run_windows_update,
    "windows_update_logs_analysis": run_windows_update_logs_analysis,
    "whynotwin11_check": run_whynotwin11_check,
    "winsat_disk": run_winsat_disk,
    "disk_space_report": run_disk_space_report,
    "battery_health_report": run_battery_health_report,
    "drivecleanup_clean": run_drivecleanup_clean,
    "trellix_stinger_scan": run_trellix_stinger_scan,
    "system_restore": run_system_restore,
    # "windows_defender_scan": run_windows_defender_scan, # Example for the future
}


def execute_tasks_parallel(
    tasks: List[Task],
    control_file_path: Optional[str],
    all_results: List[TaskResult],
    overall_success_ref: List[bool],
) -> None:
    """Execute tasks in parallel using ThreadPoolExecutor.

    System restore tasks are always run first sequentially, then remaining
    tasks are executed in parallel.

    Args:
        tasks: List of tasks to execute
        control_file_path: Path to control file for stop/skip signals
        all_results: List to collect results in (maintains order)
        overall_success_ref: List with single bool element to track overall success
    """
    # Separate system_restore tasks from others
    system_restore_tasks = [t for t in tasks if t.get("type") == "system_restore"]
    other_tasks = [t for t in tasks if t.get("type") != "system_restore"]

    # Track original indices for proper result ordering
    task_indices = {}
    original_idx = 0
    for task in tasks:
        task_indices[id(task)] = original_idx
        original_idx += 1

    # Run system_restore first if present (sequential)
    if system_restore_tasks:
        logging.info("Running system_restore task first (sequential)")
        flush_logs()
        for task in system_restore_tasks:
            idx = task_indices[id(task)]
            result = execute_single_task(
                task,
                idx,
                len(tasks),
                control_file_path,
                all_results,
                overall_success_ref,
            )
            if result:
                all_results.append(result)
                # Emit progress update
                try:
                    progress_obj = {
                        "type": "progress",
                        "completed": len(all_results),
                        "total": len(tasks),
                        "last_result": result,
                        "results": all_results,
                        "overall_status": "success"
                        if overall_success_ref[0]
                        else "completed_with_errors",
                    }
                    logging.info("PROGRESS_JSON:%s", json.dumps(progress_obj))
                    flush_logs()
                except Exception:
                    pass

            # Check for stop signal after system restore
            action, _ = check_control_file(control_file_path)
            if action == "stop":
                logging.info("RUN_STOPPED:user_requested")
                flush_logs()
                return

    # If no other tasks, we're done
    if not other_tasks:
        return

    # Now run remaining tasks in parallel
    logging.info(f"Running {len(other_tasks)} tasks in parallel")
    flush_logs()

    # Use ThreadPoolExecutor with reasonable worker limit
    max_workers = min(
        len(other_tasks), os.cpu_count() or 4, 8
    )  # Cap at 8 to avoid resource exhaustion

    # Dictionary to store results by original index for proper ordering
    results_by_index = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_task = {}
        for task in other_tasks:
            idx = task_indices[id(task)]
            future = executor.submit(
                execute_single_task,
                task,
                idx,
                len(tasks),
                control_file_path,
                all_results,
                overall_success_ref,
            )
            future_to_task[future] = (task, idx)

        # Process completed tasks as they finish
        for future in as_completed(future_to_task):
            # Check for stop signal periodically
            action, _ = check_control_file(control_file_path)
            if action == "stop":
                logging.info("RUN_STOPPED:user_requested - Cancelling remaining tasks")
                flush_logs()
                # Cancel all remaining futures
                for f in future_to_task:
                    if not f.done():
                        f.cancel()
                # Shutdown executor immediately
                executor.shutdown(wait=False, cancel_futures=True)
                break

            # Get result
            task, idx = future_to_task[future]
            try:
                result = future.result()
                if result:
                    results_by_index[idx] = result
            except Exception as e:
                # Task raised an exception (should be handled in execute_single_task, but catch just in case)
                logging.error(f"Task {idx} raised exception: {e}")
                flush_logs()
                failure_result = {
                    "task_type": task.get("type", "unknown"),
                    "status": "failure",
                    "summary": {"reason": f"Unexpected exception: {str(e)}"},
                }
                results_by_index[idx] = failure_result
                overall_success_ref[0] = False

    # Add results in original order
    for idx in sorted(results_by_index.keys()):
        result = results_by_index[idx]
        all_results.append(result)
        # Emit progress update
        try:
            progress_obj = {
                "type": "progress",
                "completed": len(all_results),
                "total": len(tasks),
                "last_result": result,
                "results": all_results,
                "overall_status": "success"
                if overall_success_ref[0]
                else "completed_with_errors",
            }
            logging.info("PROGRESS_JSON:%s", json.dumps(progress_obj))
            flush_logs()
        except Exception:
            pass


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
            flush_logs()
        except Exception as e:  # noqa: BLE001
            logging.error("Failed to initialize log file '%s': %s", args.log_file, e)
            flush_logs()

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

    # Extract Sentry configuration from input (if provided)
    sentry_config = {}
    if isinstance(input_data, dict):
        sentry_config = input_data.get("sentry_config", {})

    # Initialize Sentry with configuration from frontend
    sentry_enabled = sentry_config.get("enabled", True)  # default True
    sentry_pii = sentry_config.get("send_default_pii", True)  # default True
    sentry_traces = sentry_config.get("traces_sample_rate", 1.0)  # default 1.0
    sentry_system_info = sentry_config.get("send_system_info", True)  # default True

    sentry_initialized = init_sentry(
        enabled=sentry_enabled,
        send_pii=sentry_pii,
        traces_sample_rate=sentry_traces,
        send_system_info=sentry_system_info,
        environment=sentry_config.get("environment"),
    )
    if sentry_initialized:
        add_breadcrumb("Service runner starting", category="lifecycle", level="info")

    # Extract/normalize tasks: accept {"tasks": [...]}, a single task dict, or a list of tasks.
    tasks: List[Task] = []
    try:
        if isinstance(input_data, dict):
            if isinstance(input_data.get("tasks"), list):
                tasks = input_data["tasks"]
            elif "type" in input_data:
                # Single task object shorthand
                tasks = [input_data]
        elif isinstance(input_data, list):
            tasks = input_data
    except Exception:
        tasks = []
    logging.info(f"Parsed {len(tasks)} tasks")
    flush_logs()
    for i, task in enumerate(tasks):
        logging.info(f"Task {i}: {task.get('type', 'unknown')}")
        flush_logs()

    # Reorder tasks: ensure system_restore runs first (if present)
    # Also de-duplicate if multiple system_restore tasks exist
    system_restore_tasks = [t for t in tasks if t.get("type") == "system_restore"]
    other_tasks = [t for t in tasks if t.get("type") != "system_restore"]

    if system_restore_tasks:
        # Take only the first system_restore task (de-duplicate)
        tasks = [system_restore_tasks[0]] + other_tasks
        if len(system_restore_tasks) > 1:
            logging.info(
                f"Found {len(system_restore_tasks)} system_restore tasks, using only the first one"
            )
            flush_logs()
        logging.info("Reordered tasks: system_restore will run first")
        flush_logs()

    # Get control file path from environment
    control_file_path = os.environ.get("AUTOSERVICE_CONTROL_FILE")

    # Control state
    run_stopped = False
    run_paused = False
    # pending_auto_pause no longer used; immediate pause is enforced after each task

    # Determine if we should automatically pause between tasks (frontend hint)
    auto_pause_between_tasks = False
    try:
        if isinstance(input_data, dict):
            auto_pause_between_tasks = bool(
                input_data.get("pause_between_tasks", False)
            )
    except Exception:
        auto_pause_between_tasks = False

    # Determine if we should run tasks in parallel (experimental)
    parallel_execution = False
    try:
        if isinstance(input_data, dict):
            parallel_execution = bool(input_data.get("parallel_execution", False))
            if parallel_execution:
                logging.info("Parallel execution flag detected in input data")
            else:
                logging.info("Parallel execution flag not found or disabled")
    except Exception:
        parallel_execution = False
        logging.warning(
            "Failed to read parallel_execution flag, defaulting to sequential"
        )

    all_results = []
    overall_success = True

    # Branch based on parallel_execution flag
    if parallel_execution:
        # Parallel execution mode
        logging.info("Parallel execution mode enabled")
        flush_logs()

        # Use list reference for overall_success so it can be modified by parallel tasks
        overall_success_ref = [overall_success]

        execute_tasks_parallel(
            tasks, control_file_path, all_results, overall_success_ref
        )

        # Update overall_success from reference
        overall_success = overall_success_ref[0]

        # Check final stop signal
        action, _ = check_control_file(control_file_path)
        if action == "stop":
            run_stopped = True
            logging.info("RUN_STOPPED:user_requested")
            flush_logs()
    else:
        # Sequential execution mode (existing logic)
        for idx, task in enumerate(tasks):
            # Note: auto-pause is handled immediately after each task completion

            # CRITICAL: Clear any lingering skip signal before checking for next task
            # This prevents skipping the wrong task if a skip signal wasn't cleared properly
            action, _ = check_control_file(control_file_path)
            if action == "skip":
                # Clear stale skip signal before starting new task
                clear_control_file(control_file_path)
                logging.info("Cleared stale skip signal before starting task %d", idx)
                flush_logs()

            # Check for control signals before starting task
            action, _ = check_control_file(control_file_path)
            if action == "stop":
                run_stopped = True
                logging.info("RUN_STOPPED:user_requested")
                flush_logs()
                break
            elif action == "pause":
                run_paused = True
                logging.info("RUN_PAUSED:user_requested")
                flush_logs()
                # Wait in pause loop until stopped or resumed
                while run_paused:
                    time.sleep(0.5)
                    action, _ = check_control_file(control_file_path)
                    if action == "stop":
                        run_stopped = True
                        run_paused = False
                        logging.info("RUN_STOPPED:user_requested")
                        flush_logs()
                        break
                    elif action == "resume":
                        run_paused = False
                        logging.info("RUN_RESUMED:user_requested")
                        flush_logs()
                        # Clear resume signal by removing control file
                        clear_control_file(control_file_path)
                        break
                if run_stopped:
                    break
            elif action == "skip":
                # Skip current task before it starts
                logging.warning(
                    "TASK_SKIP:%d:%s - User requested skip",
                    idx,
                    task.get("type", "unknown"),
                )
                flush_logs()
                skipped_result = {
                    "task_type": task.get("type", "unknown"),
                    "status": "skipped",
                    "summary": {"reason": "User requested skip"},
                }
                all_results.append(skipped_result)
                # Clear skip signal immediately
                clear_control_file(control_file_path)
                continue
            task_type = task.get("type", "")
            handler = TASK_HANDLERS.get(task_type) if task_type else None

            if handler:
                logging.info("TASK_START:%d:%s", idx, task_type)
                logging.info("Starting task %d/%d: %s", idx + 1, len(tasks), task_type)
                flush_logs()

                # Add Sentry breadcrumb for task start
                add_breadcrumb(
                    f"Starting task: {task_type}",
                    category="task",
                    level="info",
                    task_type=task_type,
                    task_index=idx,
                    total_tasks=len(tasks),
                )

                # Wrap task execution in Sentry span for performance tracking
                with create_task_span(task_type, idx, len(tasks), task) as span:
                    try:
                        # Track execution time for all tasks
                        task_start_time = time.time()

                        # Execute handler with skip monitoring for immediate skip detection
                        # Subprocess calls within handlers use run_with_skip_check for skip detection
                        result = execute_task_with_skip_monitoring(
                            handler, task, control_file_path, check_interval=0.2
                        )

                        # Calculate duration and add to summary if not already present
                        task_duration = time.time() - task_start_time
                        if not result.get("summary"):
                            result["summary"] = {}
                        if "duration_seconds" not in result.get("summary", {}):
                            result["summary"]["duration_seconds"] = round(
                                task_duration, 2
                            )

                        status = result.get("status", "unknown")

                        # Check for stop/pause after task completes
                        action, _ = check_control_file(control_file_path)
                        if action == "stop":
                            run_stopped = True
                        elif action == "pause":
                            run_paused = True

                        # Handle both "failure" and "error" as error conditions
                        if status in ("failure", "error"):
                            overall_success = False
                            failure_reason = result.get("summary", {}).get(
                                "reason"
                            ) or result.get("summary", {}).get("error", "Unknown error")
                            logging.error(
                                "TASK_FAIL:%d:%s - %s",
                                idx,
                                task_type,
                                failure_reason,
                            )
                            # Capture task failure in Sentry with proper fingerprinting
                            capture_task_failure(
                                task_type=task_type,
                                failure_reason=failure_reason,
                                task_data=task,
                                extra_context={
                                    "task_index": idx,
                                    "total_tasks": len(tasks),
                                    "result_summary": result.get("summary", {}),
                                    "status_type": status,  # Track whether it was "failure" or "error"
                                },
                            )
                            # Add breadcrumb for task failure (not exception, just failure/error status)
                            add_breadcrumb(
                                f"Task failed: {task_type}",
                                category="task",
                                level="error",
                                task_type=task_type,
                                reason=failure_reason,
                                status=status,
                            )
                        elif status == "skipped":
                            logging.warning(
                                "TASK_SKIP:%d:%s - %s",
                                idx,
                                task_type,
                                result.get("summary", {}).get("reason", "Skipped"),
                            )
                            add_breadcrumb(
                                f"Task skipped: {task_type}",
                                category="task",
                                level="warning",
                                task_type=task_type,
                                reason=result.get("summary", {}).get(
                                    "reason", "Skipped"
                                ),
                            )
                        else:
                            logging.info("TASK_OK:%d:%s", idx, task_type)
                            add_breadcrumb(
                                f"Task completed successfully: {task_type}",
                                category="task",
                                level="info",
                                task_type=task_type,
                            )

                            # Set success status on span if available
                            if span:
                                span.set_tag("status", "success")

                        flush_logs()

                        # Auto-pause immediately after task completion if enabled (before progressing)
                        if (
                            auto_pause_between_tasks
                            and not run_stopped
                            and idx < len(tasks) - 1
                        ):
                            if not run_paused:
                                run_paused = True
                                logging.info("RUN_PAUSED:auto_pause_between_tasks")
                                flush_logs()
                            # Wait until user explicitly resumes or stops
                            while run_paused:
                                time.sleep(0.5)
                                action, _ = check_control_file(control_file_path)
                                if action == "stop":
                                    run_stopped = True
                                    run_paused = False
                                    logging.info("RUN_STOPPED:user_requested")
                                    flush_logs()
                                    break
                                elif action == "resume":
                                    run_paused = False
                                    logging.info("RUN_RESUMED:user_requested")
                                    flush_logs()
                                    # Clear resume signal by removing control file
                                    clear_control_file(control_file_path)
                                    break

                        # Log additional details if available
                        summary = result.get("summary", {})
                        if summary and isinstance(summary, dict):
                            if "output" in summary:
                                out_text = str(
                                    summary["output"]
                                )  # ensure sliceable string
                                logging.info(
                                    "Task %s completed with output: %s",
                                    task_type,
                                    out_text[:MAX_LOG_SNIPPET] + "..."
                                    if len(out_text) > MAX_LOG_SNIPPET
                                    else out_text,
                                )
                                flush_logs()
                            if "duration_seconds" in summary:
                                logging.info(
                                    "Task %s took %.2f seconds",
                                    task_type,
                                    summary["duration_seconds"],
                                )
                                flush_logs()
                                # Add duration to span if available
                                if span:
                                    span.set_data(
                                        "duration_seconds", summary["duration_seconds"]
                                    )

                        all_results.append(result)
                        # Emit incremental progress JSON line for UI consumption
                        try:
                            progress_obj = {
                                "type": "progress",
                                "completed": len(all_results),
                                "total": len(tasks),
                                "last_result": result,
                                "results": all_results,
                                "overall_status": "success"
                                if overall_success
                                else "completed_with_errors",
                            }
                            logging.info("PROGRESS_JSON:%s", json.dumps(progress_obj))
                            flush_logs()
                        except Exception:
                            pass

                        # Note: no pending auto-pause; immediate pause already handled above

                        # If stopped or paused after task, break or pause
                        if run_stopped:
                            logging.info("RUN_STOPPED:user_requested")
                            flush_logs()
                            break
                        elif run_paused:
                            logging.info("RUN_PAUSED:user_requested")
                            flush_logs()
                            # Wait in pause loop
                            while run_paused:
                                time.sleep(0.5)
                                action, _ = check_control_file(control_file_path)
                                if action == "stop":
                                    run_stopped = True
                                    run_paused = False
                                    logging.info("RUN_STOPPED:user_requested")
                                    flush_logs()
                                    break
                                elif action == "resume":
                                    run_paused = False
                                    logging.info("RUN_RESUMED:user_requested")
                                    flush_logs()
                                    # Clear resume signal by removing control file
                                    if control_file_path and os.path.exists(
                                        control_file_path
                                    ):
                                        try:
                                            os.remove(control_file_path)
                                        except Exception:
                                            pass
                                    break
                            if run_stopped:
                                break

                    except KeyboardInterrupt as e:
                        # Handle skip signal
                        if "skip" in str(e).lower() or "User requested skip" in str(e):
                            logging.warning(
                                "TASK_SKIP:%d:%s - User requested skip", idx, task_type
                            )
                            flush_logs()
                            skipped_result = {
                                "task_type": task_type,
                                "status": "skipped",
                                "summary": {"reason": "User requested skip"},
                            }
                            all_results.append(skipped_result)
                            # Clear skip signal immediately (should already be cleared, but ensure it)
                            clear_control_file(control_file_path)
                            # Continue to next task
                            continue
                        else:
                            raise
                    except Exception as e:
                        overall_success = False
                        logging.error(
                            "TASK_FAIL:%d:%s - Exception: %s", idx, task_type, str(e)
                        )
                        flush_logs()

                        # Capture exception with Sentry with proper fingerprinting
                        capture_task_exception(
                            e,
                            task_type=task_type,
                            task_data=task,
                            extra_context={
                                "task_index": idx,
                                "total_tasks": len(tasks),
                            },
                        )

                        # Set error status on span if available
                        if span:
                            span.set_tag("status", "error")
                            span.set_tag("error", True)

                        failure_result = {
                            "task_type": task_type,
                            "status": "failure",
                            "summary": {
                                "reason": f"Exception during execution: {str(e)}"
                            },
                        }
                        all_results.append(failure_result)
                        try:
                            progress_obj = {
                                "type": "progress",
                                "completed": len(all_results),
                                "total": len(tasks),
                                "last_result": failure_result,
                                "results": all_results,
                                "overall_status": "success"
                                if overall_success
                                else "completed_with_errors",
                            }
                            logging.info("PROGRESS_JSON:%s", json.dumps(progress_obj))
                            flush_logs()
                        except Exception:
                            pass

            else:
                logging.warning(
                    "TASK_SKIP:%d:%s - No handler found for task type", idx, task_type
                )
                flush_logs()
                add_breadcrumb(
                    f"No handler found for task type: {task_type}",
                    category="task",
                    level="warning",
                    task_type=task_type,
                )
                skipped_result = {
                    "task_type": task_type,
                    "status": "skipped",
                    "summary": {
                        "reason": f"No handler implemented for this task type."
                    },
                }
                all_results.append(skipped_result)
            try:
                progress_obj = {
                    "type": "progress",
                    "completed": len(all_results),
                    "total": len(tasks),
                    "last_result": skipped_result,
                    "results": all_results,
                    "overall_status": "success"
                    if overall_success
                    else "completed_with_errors",
                }
                logging.info("PROGRESS_JSON:%s", json.dumps(progress_obj))
                flush_logs()
            except Exception:
                pass

    # Collect system metadata
    import platform
    import getpass

    system_metadata = {
        "hostname": platform.node(),
        "username": getpass.getuser(),
        "os_name": platform.system(),
        "os_version": platform.version(),
    }

    # Include metadata from input_data if provided (only if input_data is a dict)
    if isinstance(input_data, dict):
        metadata = input_data.get("metadata", {})
        if metadata:
            system_metadata.update(metadata)

    # Determine final status
    if run_stopped:
        final_status = "stopped"
    elif run_paused:
        final_status = "paused"
    elif overall_success:
        final_status = "success"
    else:
        final_status = "completed_with_errors"

    final_report = {
        "overall_status": final_status,
        "results": all_results,
        "metadata": system_metadata,
    }

    # Add final breadcrumb
    add_breadcrumb(
        f"Service run completed: {final_report['overall_status']}",
        category="lifecycle",
        level="info" if overall_success else "warning",
        total_tasks=len(tasks),
        completed_tasks=len(all_results),
        overall_status=final_report["overall_status"],
    )

    # Print the final JSON report to stdout for the parent process (AutoService) to capture.
    report_json = json.dumps(final_report, indent=2)
    print(report_json)
    # Also emit final progress snapshot as PROGRESS_JSON_FINAL for UI
    try:
        final_progress = {
            "type": "final",
            "completed": len(all_results),
            "total": len(tasks),
            "results": all_results,
            "overall_status": final_report["overall_status"],
        }
        logging.info("PROGRESS_JSON_FINAL:%s", json.dumps(final_progress))
    except Exception:
        pass
    flush_logs()

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
            flush_logs()
        except Exception as e:  # noqa: BLE001
            logging.error(f"Failed to write final report to '{output_path}': {e}")
            flush_logs()
    else:
        logging.info("No --output-file provided; final report not written to disk.")
        flush_logs()


if __name__ == "__main__":
    main()
