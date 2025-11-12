"""Utility functions for subprocess execution with skip signal support.

This module provides wrappers around subprocess calls that check for skip signals
from the control file and terminate processes immediately when skip is requested.
"""

import subprocess
import os
import json
import time
import logging
import threading
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
    # Use DEVNULL for stdin when no input is provided to prevent processes from waiting for user input
    stdin_arg = subprocess.PIPE if input is not None else subprocess.DEVNULL
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
    
    # Use threads to read stdout/stderr during execution to prevent buffer overflow
    # This is critical on Windows where pipes can block if not read continuously
    stdout_result = {"data": "", "done": False, "error": None}
    stderr_result = {"data": "", "done": False, "error": None}
    
    def read_stdout():
        """Read stdout in a separate thread."""
        try:
            if process.stdout:
                # Read all available data (blocks until EOF/pipe closes)
                data = process.stdout.read()
                stdout_result["data"] = data
            stdout_result["done"] = True
        except Exception as e:
            logger.debug(f"Error reading stdout: {e}")
            stdout_result["error"] = str(e)
            stdout_result["done"] = True
    
    def read_stderr():
        """Read stderr in a separate thread."""
        try:
            if process.stderr:
                # Read all available data (blocks until EOF/pipe closes)
                data = process.stderr.read()
                stderr_result["data"] = data
            stderr_result["done"] = True
        except Exception as e:
            logger.debug(f"Error reading stderr: {e}")
            stderr_result["error"] = str(e)
            stderr_result["done"] = True
    
    # Start reader threads if we're capturing output
    stdout_thread = None
    stderr_thread = None
    if capture_output:
        if process.stdout:
            stdout_thread = threading.Thread(target=read_stdout, daemon=True)
            stdout_thread.start()
        if process.stderr:
            stderr_thread = threading.Thread(target=read_stderr, daemon=True)
            stderr_thread.start()
    
    # Monitor process and check for skip signals periodically
    # Use wait() with short timeouts to allow skip signal checking
    process_finished = False
    while not process_finished:
        # Check for skip signal FIRST (before timeout check) for immediate response
        if _check_skip_signal(control_file_path):
            _kill_process_and_raise_skip(process, control_file_path)
        
        # Check timeout
        elapsed = time.time() - start_time
        if timeout and elapsed >= timeout:
            process.kill()
            # Give threads a moment to finish reading
            if stdout_thread:
                stdout_thread.join(timeout=0.5)
            if stderr_thread:
                stderr_thread.join(timeout=0.5)
            raise subprocess.TimeoutExpired(command, timeout)
        
        # Wait for process with a short timeout so we can check skip signals
        wait_timeout = min(check_interval, 0.1)
        if timeout:
            remaining = timeout - elapsed
            if remaining <= 0:
                # Should have been caught above, but be safe
                process.kill()
                raise subprocess.TimeoutExpired(command, timeout)
            wait_timeout = min(wait_timeout, remaining)
        
        # Check if process has already finished (poll is non-blocking)
        returncode = process.poll()
        if returncode is not None:
            # Process has finished
            process_finished = True
            break
        
        # Process still running, wait a bit and check again
        try:
            process.wait(timeout=wait_timeout)
            process_finished = True
        except subprocess.TimeoutExpired:
            # Process hasn't finished yet, continue loop to check skip/timeout
            continue
    
    # Process has completed, close pipes to help threads finish reading
    # On Windows, explicitly closing pipes helps threads complete
    try:
        if process.stdout and not stdout_result["done"]:
            process.stdout.close()
        if process.stderr and not stderr_result["done"]:
            process.stderr.close()
    except Exception:
        pass
    
    # Wait for reader threads to finish (they should complete now that pipes are closed)
    if stdout_thread:
        stdout_thread.join(timeout=2.0)
    if stderr_thread:
        stderr_thread.join(timeout=2.0)
    
    # Get the output from threads
    stdout_str = stdout_result["data"] if capture_output else ""
    stderr_str = stderr_result["data"] if capture_output else ""
    
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
    
    # Output already collected in threads above
    
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

