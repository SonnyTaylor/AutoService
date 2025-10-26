"""Sentry configuration and utilities for error tracking and performance monitoring.

This module provides a clean, centralized way to configure Sentry error tracking
for the AutoService Python runner. All Sentry-related logic is contained here
for easy maintenance and toggling.

To disable Sentry, simply set SENTRY_ENABLED = False at the module level.
"""

import os
import sys
import platform
import logging
import psutil
from typing import Dict, Any, Optional, List
from contextlib import contextmanager

# Simple toggle to enable/disable Sentry - change this to False to disable all tracking
SENTRY_ENABLED = True

# Hardcoded Sentry DSN for the AutoService project
SENTRY_DSN = "https://50870527bd92f4631d029e6881e76daf@o4510235877769216.ingest.us.sentry.io/4510250131324928"

logger = logging.getLogger(__name__)

# Global flag to track if Sentry has been initialized
_sentry_initialized = False


def detect_environment() -> str:
    """Detect whether we're running in development or production environment.

    Detection logic:
    1. Check AUTOSERVICE_ENV environment variable (highest priority)
    2. Check executable path for 'target/debug' → development
    3. Check executable path for 'target/release' or 'dist' → production
    4. Default to 'development' if uncertain

    Returns:
        str: Either 'development' or 'production'
    """
    # Check environment variable first
    env_var = os.environ.get("AUTOSERVICE_ENV", "").lower()
    if env_var in ("development", "dev"):
        return "development"
    elif env_var in ("production", "prod"):
        return "production"

    # Check executable path
    try:
        exe_path = sys.executable.lower()
        if "target/debug" in exe_path or "debug" in exe_path:
            return "development"
        elif (
            "target/release" in exe_path or "dist" in exe_path or "release" in exe_path
        ):
            return "production"
    except Exception:
        pass

    # Default to development for safety
    return "development"


def get_system_context() -> Dict[str, Any]:
    """Collect comprehensive system information for Sentry context.

    Gathers detailed information about the system, process, hardware, and
    environment to provide rich context for error reports and performance data.

    Returns:
        Dict[str, Any]: Dictionary containing system information organized into categories
    """
    context = {}

    try:
        # OS and platform information
        context["os"] = {
            "name": platform.system(),
            "version": platform.version(),
            "release": platform.release(),
            "platform": platform.platform(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
        }

        # Python runtime information
        context["python"] = {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "compiler": platform.python_compiler(),
            "build": platform.python_build(),
        }

        # User and hostname information
        try:
            context["user"] = {
                "hostname": platform.node(),
                "username": os.getlogin()
                if hasattr(os, "getlogin")
                else os.environ.get("USERNAME", "unknown"),
            }
        except Exception:
            context["user"] = {"hostname": "unknown", "username": "unknown"}

        # CPU information
        try:
            context["cpu"] = {
                "count_physical": psutil.cpu_count(logical=False),
                "count_logical": psutil.cpu_count(logical=True),
                "percent_used": psutil.cpu_percent(interval=0.1),
                "frequency_current_mhz": psutil.cpu_freq().current
                if psutil.cpu_freq()
                else None,
            }
        except Exception as e:
            logger.debug(f"Failed to collect CPU info: {e}")
            context["cpu"] = {"error": str(e)}

        # Memory information
        try:
            mem = psutil.virtual_memory()
            context["memory"] = {
                "total_gb": round(mem.total / (1024**3), 2),
                "available_gb": round(mem.available / (1024**3), 2),
                "used_gb": round(mem.used / (1024**3), 2),
                "percent_used": mem.percent,
            }
        except Exception as e:
            logger.debug(f"Failed to collect memory info: {e}")
            context["memory"] = {"error": str(e)}

        # Disk information for all partitions
        try:
            disk_info = []
            for partition in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    disk_info.append(
                        {
                            "device": partition.device,
                            "mountpoint": partition.mountpoint,
                            "fstype": partition.fstype,
                            "total_gb": round(usage.total / (1024**3), 2),
                            "used_gb": round(usage.used / (1024**3), 2),
                            "free_gb": round(usage.free / (1024**3), 2),
                            "percent_used": usage.percent,
                        }
                    )
                except (PermissionError, OSError):
                    # Skip partitions we can't access
                    continue
            context["disks"] = disk_info
        except Exception as e:
            logger.debug(f"Failed to collect disk info: {e}")
            context["disks"] = {"error": str(e)}

        # Process information
        try:
            process = psutil.Process()
            context["process"] = {
                "pid": process.pid,
                "parent_pid": process.ppid(),
                "cwd": process.cwd(),
                "executable": process.exe(),
                "cmdline": " ".join(process.cmdline()) if process.cmdline() else None,
                "memory_mb": round(process.memory_info().rss / (1024**2), 2),
                "cpu_percent": process.cpu_percent(interval=0.1),
            }
        except Exception as e:
            logger.debug(f"Failed to collect process info: {e}")
            context["process"] = {
                "pid": os.getpid(),
                "parent_pid": os.getppid() if hasattr(os, "getppid") else None,
                "error": str(e),
            }

        # Environment detection
        context["environment"] = {
            "detected": detect_environment(),
            "frozen": getattr(sys, "frozen", False),
            "executable_path": sys.executable,
        }

    except Exception as e:
        logger.error(f"Failed to collect system context: {e}")
        context["error"] = str(e)

    return context


def init_sentry(
    enabled: bool = True,
    send_pii: bool = True,
    traces_sample_rate: float = 1.0,
    send_system_info: bool = True,
) -> bool:
    """Initialize Sentry SDK with AutoService configuration.

    Configures Sentry with performance monitoring, error tracking, and system context.
    Safe to call multiple times - will only initialize once.

    Args:
        enabled: Whether to enable Sentry tracking (default: True)
        send_pii: Whether to include PII like hostname/username (default: True)
        traces_sample_rate: Performance monitoring sample rate, 0.0-1.0 (default: 1.0)
        send_system_info: Whether to include system info in error reports (default: True)

    Returns:
        bool: True if Sentry was successfully initialized, False otherwise
    """
    global _sentry_initialized  # CRITICAL: Must declare global to modify module-level variable

    # Check both the hardcoded kill-switch and the runtime parameter
    if not SENTRY_ENABLED or not enabled:
        logger.info("Sentry is disabled")
        return False

    if _sentry_initialized:
        logger.debug("Sentry already initialized, skipping")
        return True

    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration

        # Detect environment
        environment = detect_environment()

        # Get system context once for the before_send hook (if enabled)
        system_context = get_system_context() if send_system_info else {}

        def before_send(event, hint):
            """Hook to enrich all events with system context before sending to Sentry."""
            # Add system context to every event (if enabled)
            if send_system_info and system_context:
                if "contexts" not in event:
                    event["contexts"] = {}
                event["contexts"]["system_info"] = system_context

                # Add environment info to tags for easy filtering
                if "tags" not in event:
                    event["tags"] = {}
                event["tags"]["environment_detected"] = system_context.get(
                    "environment", {}
                ).get("detected", "unknown")
                event["tags"]["os_name"] = system_context.get("os", {}).get(
                    "name", "unknown"
                )
                event["tags"]["python_version"] = system_context.get("python", {}).get(
                    "version", "unknown"
                )

            # Fix fingerprinting for task-related events
            # This ensures different task types don't get grouped together
            if "fingerprint" not in event or event.get("fingerprint") == [
                "{{ default }}"
            ]:
                # Extract task type from transaction if this is a task event
                transaction = event.get("transaction", "")
                if transaction.startswith("task."):
                    task_type = transaction.replace("task.", "")

                    # Get the message to include in fingerprint for better grouping
                    message = ""
                    if "logentry" in event:
                        message = event["logentry"].get("formatted", "")
                    elif "message" in event:
                        message = event["message"]
                    elif "exception" in event and "values" in event["exception"]:
                        # For exceptions, use the exception type
                        exc_values = event["exception"]["values"]
                        if exc_values:
                            message = exc_values[-1].get("type", "")

                    # Create a stable fingerprint based on task type and error pattern
                    # Strip out dynamic parts like paths and line numbers for better grouping
                    error_pattern = (
                        message.split(" - ")[-1] if " - " in message else message
                    )
                    error_pattern = error_pattern[
                        :100
                    ]  # Limit length to avoid too granular grouping

                    event["fingerprint"] = [task_type, error_pattern]

            return event

        # Initialize Sentry with comprehensive configuration
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            # Environment settings
            environment=environment,
            # Performance monitoring
            traces_sample_rate=traces_sample_rate,  # Configurable performance tracking
            enable_tracing=traces_sample_rate > 0.0,  # Only enable if sample rate > 0
            # Privacy settings
            send_default_pii=send_pii,  # Configurable PII collection
            # Event enrichment
            before_send=before_send,
            # Logging integration
            integrations=[
                LoggingIntegration(
                    level=logging.INFO,  # Capture breadcrumbs for context
                    event_level=None,  # Don't auto-send any logs as events
                ),
            ],
            # Release tracking (can be enhanced with version info later)
            release=f"autoservice@{os.environ.get('AUTOSERVICE_VERSION', 'dev')}",
        )

        _sentry_initialized = True
        logger.info(f"Sentry initialized successfully in {environment} environment")

        return True

    except ImportError:
        logger.warning("sentry-sdk not installed, Sentry tracking disabled")
        return False
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")
        return False


def capture_task_exception(
    exception: Exception,
    task_type: str,
    task_data: Optional[Dict[str, Any]] = None,
    extra_context: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Capture an exception that occurred during task execution with rich context.

    This helper ensures consistent error reporting across all task handlers with
    proper fingerprinting so errors from different services don't get mixed together.

    Args:
        exception: The exception that was raised
        task_type: Type of task that failed (e.g., 'ping_test', 'battery_health_report')
        task_data: The task configuration/parameters that were being executed
        extra_context: Additional context to attach to the error report

    Returns:
        Optional[str]: Event ID if error was captured, None otherwise
    """
    if not SENTRY_ENABLED or not _sentry_initialized:
        return None

    try:
        import sentry_sdk

        # Set task-specific context
        with sentry_sdk.push_scope() as scope:
            # Set fingerprint based on task_type and exception type to ensure
            # different service errors are grouped separately in Sentry
            scope.fingerprint = [task_type, exception.__class__.__name__]

            # Add task information as context
            if task_data:
                scope.set_context(
                    "task",
                    {
                        "type": task_type,
                        "data": task_data,
                    },
                )

            # Add any extra context provided
            if extra_context:
                for key, value in extra_context.items():
                    scope.set_context(key, value)

            # Set tags for easy filtering in Sentry
            scope.set_tag("task_type", task_type)
            scope.set_tag("error_type", exception.__class__.__name__)

            # Capture the exception
            event_id = sentry_sdk.capture_exception(exception)
            return event_id

    except Exception as e:
        logger.error(f"Failed to capture task exception: {e}")
        return None


@contextmanager
def create_task_span(
    task_type: str,
    task_index: int,
    total_tasks: int,
    task_data: Optional[Dict[str, Any]] = None,
):
    """Context manager to create a Sentry span for task execution lifecycle.

    This tracks the performance and lifecycle of individual task executions,
    providing detailed timing and context for debugging and optimization.

    Args:
        task_type: Type of task being executed
        task_index: Index of this task in the execution queue (0-based)
        total_tasks: Total number of tasks in the run
        task_data: Task configuration/parameters

    Yields:
        Sentry span object (or None if Sentry is disabled)

    Example:
        >>> with create_task_span("ping_test", 0, 5, task_data) as span:
        ...     if span:
        ...         span.set_tag("host", "8.8.8.8")
        ...     result = run_ping_test(task_data)
    """
    if not SENTRY_ENABLED or not _sentry_initialized:
        yield None
        return

    try:
        import sentry_sdk

        # Start a transaction for this task
        with sentry_sdk.start_transaction(
            op="task",
            name=f"task.{task_type}",
            description=f"Execute {task_type} ({task_index + 1}/{total_tasks})",
        ) as transaction:
            # Set transaction tags
            transaction.set_tag("task_type", task_type)
            transaction.set_tag("task_index", task_index)
            transaction.set_tag("total_tasks", total_tasks)

            # Add task data as context
            if task_data:
                transaction.set_context("task_data", task_data)

            # Add breadcrumb
            sentry_sdk.add_breadcrumb(
                category="task",
                message=f"Starting task: {task_type}",
                level="info",
                data={
                    "task_type": task_type,
                    "task_index": task_index,
                    "total_tasks": total_tasks,
                },
            )

            yield transaction

            # Add completion breadcrumb
            sentry_sdk.add_breadcrumb(
                category="task",
                message=f"Completed task: {task_type}",
                level="info",
                data={"task_type": task_type},
            )

    except Exception as e:
        logger.error(f"Error creating task span: {e}")
        yield None


def capture_task_failure(
    task_type: str,
    failure_reason: str,
    task_data: Optional[Dict[str, Any]] = None,
    extra_context: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Capture a non-exception task failure with rich context and proper fingerprinting.

    Use this when a task fails with status="failure" but doesn't raise an exception.
    This ensures failures are properly grouped by task type in Sentry.

    Args:
        task_type: Type of task that failed (e.g., 'ping_test', 'battery_health_report')
        failure_reason: Human-readable reason for the failure
        task_data: The task configuration/parameters that were being executed
        extra_context: Additional context to attach to the error report

    Returns:
        Optional[str]: Event ID if failure was captured, None otherwise
    """
    if not SENTRY_ENABLED or not _sentry_initialized:
        return None

    try:
        import sentry_sdk

        # Set task-specific context
        with sentry_sdk.push_scope() as scope:
            # Set fingerprint based on task_type to ensure different task types
            # are grouped separately in Sentry
            scope.fingerprint = [task_type, "task_failure"]

            # Add task information as context
            if task_data:
                scope.set_context(
                    "task",
                    {
                        "type": task_type,
                        "data": task_data,
                    },
                )

            # Add any extra context provided
            if extra_context:
                for key, value in extra_context.items():
                    scope.set_context(key, value)

            # Set tags for easy filtering in Sentry
            scope.set_tag("task_type", task_type)
            scope.set_tag("failure_type", "task_status_failure")

            # Capture as a message event with error level
            event_id = sentry_sdk.capture_message(
                f"{task_type}: {failure_reason}", level="error"
            )
            return event_id

    except Exception as e:
        logger.error(f"Failed to capture task failure: {e}")
        return None


def add_breadcrumb(message: str, category: str = "info", level: str = "info", **data):
    """Add a breadcrumb to the current Sentry scope for debugging context.

    Breadcrumbs provide a trail of events leading up to an error, making debugging easier.

    Args:
        message: Human-readable message describing the event
        category: Category of the breadcrumb (e.g., 'task', 'system', 'subprocess')
        level: Severity level ('debug', 'info', 'warning', 'error', 'critical')
        **data: Additional key-value data to attach to the breadcrumb
    """
    if not SENTRY_ENABLED or not _sentry_initialized:
        return

    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category=category, message=message, level=level, data=data
        )
    except Exception as e:
        logger.debug(f"Failed to add breadcrumb: {e}")
