"""Utility functions for subprocess execution with skip signal support.

This module provides wrappers around subprocess calls that check for skip signals
from the control file and terminate processes immediately when skip is requested.
"""

import subprocess
import os
import json
import time
import logging
from typing import List, Optional, Dict, Any, Tuple

logger = logging.getLogger(__name__)


def run_with_skip_check(
    command: List[str],
    *,
    input: Optional[str] = None,
    capture_output: bool = True,
    text: bool = True,
    check: bool = False,
    encoding: str = "utf-8",
    errors: str = "replace",
    cwd: Optional[str] = None,
    timeout: Optional[float] = None,
    check_interval: float = 0.2,
) -> subprocess.CompletedProcess:
    """Run a subprocess command with periodic skip signal checking.
    
    This function behaves like subprocess.run() but periodically checks for skip
    signals from the control file. If a skip signal is detected, the process is
    immediately terminated and a KeyboardInterrupt is raised.
    
    Args:
        command: Command to execute (list of strings)
        capture_output: If True, capture stdout and stderr
        text: If True, return stdout/stderr as strings
        check: If True, raise CalledProcessError on non-zero exit
        encoding: Text encoding for stdout/stderr
        errors: Error handling for encoding
        cwd: Working directory for the command
        timeout: Maximum time to wait for process (None = no timeout)
        check_interval: How often to check for skip signals (seconds)
    
    Returns:
        CompletedProcess instance with stdout, stderr, and returncode
    
    Raises:
        KeyboardInterrupt: If skip signal is detected
        subprocess.TimeoutExpired: If process exceeds timeout
        subprocess.CalledProcessError: If check=True and process fails
    """
    control_file_path = os.environ.get("AUTOSERVICE_CONTROL_FILE")
    
    # Use Popen so we can monitor and kill the process
    stdin_arg = subprocess.PIPE if input is not None else None
    process = subprocess.Popen(
        command,
        stdin=stdin_arg,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
        text=text,
        encoding=encoding if text else None,
        errors=errors if text else None,
        cwd=cwd,
    )
    
    # Write input if provided
    if input is not None and process.stdin:
        process.stdin.write(input)
        process.stdin.close()
    
    start_time = time.time()
    stdout_data = []
    stderr_data = []
    
    # Monitor process and check for skip signals periodically
    # For Windows, we can't use select on file handles, so use a simpler polling approach
    # But check more frequently for better responsiveness (every 0.1s max)
    while process.poll() is None:
        # Check for skip signal FIRST (before timeout check) for immediate response
        if _check_skip_signal(control_file_path):
            _kill_process_and_raise_skip(process, control_file_path)
        
        # Check timeout
        if timeout and (time.time() - start_time) > timeout:
            process.kill()
            raise subprocess.TimeoutExpired(command, timeout)
        
        # Try to read available output (non-blocking)
        # On Windows, this is best-effort since we can't use select
        try:
            # Use a shorter sleep for more responsive skip checking
            time.sleep(min(check_interval, 0.1))
        except Exception:
            time.sleep(check_interval)
    
    # Process has completed, read any remaining output
    stdout, stderr = process.communicate()
    stdout_data = [stdout] if stdout else []
    stderr_data = [stderr] if stderr else []
    
    # Final check for skip signal (in case it was set just as process finished)
    # This is important - if skip was requested right as process finished,
    # we still want to honor it
    if _check_skip_signal(control_file_path):
        # Process already finished, but clear the signal and raise anyway
        # so the task gets marked as skipped
        if control_file_path and os.path.exists(control_file_path):
            try:
                os.remove(control_file_path)
            except Exception:
                pass
        raise KeyboardInterrupt("User requested skip")
    
    # Combine output
    stdout_str = "".join(stdout_data) if stdout_data else ""
    stderr_str = "".join(stderr_data) if stderr_data else ""
    
    result = subprocess.CompletedProcess(
        command,
        process.returncode,
        stdout_str if capture_output else None,
        stderr_str if capture_output else None,
    )
    
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
    
    return result


def _check_skip_signal(control_file_path: Optional[str]) -> bool:
    """Check if a skip signal is present in the control file.
    
    Returns:
        True if skip signal is detected, False otherwise
    """
    if not control_file_path or not os.path.exists(control_file_path):
        return False
    
    try:
        with open(control_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("action") == "skip":
                return True
    except (json.JSONDecodeError, IOError, OSError):
        # Control file doesn't exist or is malformed, ignore
        pass
    
    return False


def _kill_process_and_raise_skip(process: subprocess.Popen, control_file_path: Optional[str]) -> None:
    """Kill a process and raise KeyboardInterrupt for skip handling.
    
    Args:
        process: The subprocess.Popen instance to kill
        control_file_path: Path to control file (will be cleared)
    """
    logger.warning("Skip signal detected, terminating process immediately")
    
    # Clear skip signal FIRST to prevent it from affecting next task
    if control_file_path and os.path.exists(control_file_path):
        try:
            os.remove(control_file_path)
        except Exception:
            pass
    
    # Try graceful termination first
    try:
        process.terminate()
    except Exception:
        # Process might already be dead
        pass
    
    # Wait briefly for graceful termination, then force kill
    try:
        process.wait(timeout=0.5)
    except subprocess.TimeoutExpired:
        try:
            process.kill()
            process.wait(timeout=1.0)
        except Exception:
            # Process might have finished or be unkillable, continue anyway
            pass
    
    # Raise exception to signal skip
    raise KeyboardInterrupt("User requested skip")

