"""HeavyLoad stress test service.

This module provides a function `run_heavyload_stress_test` that builds a
command line for HeavyLoad.exe and executes it headlessly (when possible)
based on a task specification similar to the other services.

Reference CLI parameters (subset implemented):
  /START               Start the test run
  /CPU [n]             Stress CPU; optional n = number of cores
  /MEMORY [n]          Allocate memory; optional n = threshold of free MB
  /FILE [n]            Write temp file; optional n = threshold of free MB
  /TESTFILEPATH "path" Path for temp file (only with /FILE)
  /GPU                 Stress GPU
  /DURATION n          Duration in minutes (required if /AUTOEXIT supplied)
  /AUTOEXIT            Exit automatically after duration
  /NOGUI               Run without UI (recommended for automation)

Task schema (dict expected):
  type: 'heavyload_stress_test'
  executable_path: str (required) path to HeavyLoad.exe
  duration_minutes: int (optional) positive minutes; if provided we auto-add /AUTOEXIT
  headless: bool (optional default True) -> adds /NOGUI

  stress_cpu: bool (optional)
  cpu_cores: int (optional, only if stress_cpu)
  stress_memory: bool (optional)
  memory_threshold_mb: int (optional)
  stress_disk: bool (optional)
  disk_threshold_mb: int (optional)
  testfile_path: str (optional, only if stress_disk)
  stress_gpu: bool (optional)

Returns dict with keys:
  task_type, status ('success'|'failure'), summary{}, command(list)
"""

from __future__ import annotations

import subprocess
import logging
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _build_heavyload_command(task: Dict[str, Any]) -> Dict[str, Any]:
    """Build command list and capture a normalized summary of intent.

    Returns a dict with keys: command (List[str]), summary (Dict[str,Any]) or
    error (str) when validation fails.
    """

    exec_path = task.get("executable_path")
    if not exec_path:
        return {"error": "'executable_path' not provided"}

    # What to stress
    stress_cpu = bool(task.get("stress_cpu"))
    stress_mem = bool(task.get("stress_memory"))
    stress_disk = bool(task.get("stress_disk"))
    stress_gpu = bool(task.get("stress_gpu"))

    if not any([stress_cpu, stress_mem, stress_disk, stress_gpu]):
        return {"error": "At least one of stress_cpu/memory/disk/gpu must be True"}

    duration = task.get("duration_minutes")
    headless = task.get("headless", True)

    # Safety: if headless and no duration, avoid indefinite run.
    if headless and (not duration or duration <= 0):
        return {"error": "'duration_minutes' must be positive when headless (/NOGUI)"}

    cmd: List[str] = [exec_path]
    summary: Dict[str, Any] = {
        "duration_minutes": duration,
        "headless": headless,
        "stress_cpu": stress_cpu,
        "stress_memory": stress_mem,
        "stress_disk": stress_disk,
        "stress_gpu": stress_gpu,
    }

    if stress_cpu:
        cpu_cores = task.get("cpu_cores")
        if cpu_cores is not None:
            try:
                cores_int = int(cpu_cores)
                if cores_int <= 0:
                    raise ValueError
                cmd += ["/CPU", str(cores_int)]
                summary["cpu_cores"] = cores_int
            except (ValueError, TypeError):
                # fallback to just /CPU
                logger.warning("Invalid cpu_cores value; using all cores.")
                cmd.append("/CPU")
        else:
            cmd.append("/CPU")

    if stress_mem:
        mem_thresh = task.get("memory_threshold_mb")
        if mem_thresh is not None:
            try:
                mem_int = int(mem_thresh)
                if mem_int <= 0:
                    raise ValueError
                cmd += ["/MEMORY", str(mem_int)]
                summary["memory_threshold_mb"] = mem_int
            except (ValueError, TypeError):
                logger.warning(
                    "Invalid memory_threshold_mb; enabling default memory stress."
                )
                cmd.append("/MEMORY")
        else:
            cmd.append("/MEMORY")

    testfile_path = task.get("testfile_path")
    if stress_disk:
        disk_thresh = task.get("disk_threshold_mb")
        if disk_thresh is not None:
            try:
                disk_int = int(disk_thresh)
                if disk_int <= 0:
                    raise ValueError
                cmd += ["/FILE", str(disk_int)]
                summary["disk_threshold_mb"] = disk_int
            except (ValueError, TypeError):
                logger.warning(
                    "Invalid disk_threshold_mb; enabling default disk stress."
                )
                cmd.append("/FILE")
        else:
            cmd.append("/FILE")
        if testfile_path:
            cmd += ["/TESTFILEPATH", str(testfile_path)]
            summary["testfile_path"] = testfile_path
    else:
        if testfile_path:
            logger.warning(
                "'testfile_path' provided but stress_disk is False; ignoring."
            )

    if stress_gpu:
        cmd.append("/GPU")

    if duration and duration > 0:
        cmd += ["/DURATION", str(int(duration))]
        cmd.append("/AUTOEXIT")  # only valid with /DURATION

    if headless:
        cmd.append("/NOGUI")

    # HeavyLoad requires /START last (after options)
    cmd.append("/START")

    return {"command": cmd, "summary": summary}


def run_heavyload_stress_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a HeavyLoad stress test.

    HeavyLoad does not provide rich machine-readable console output when /NOGUI
    is used; we therefore mainly return the echoed parameters, exit code, and
    a trimmed stdout/stderr excerpt for diagnostics.
    """
    add_breadcrumb(
        "Starting HeavyLoad stress test",
        category="task",
        level="info",
        data={
            "duration_minutes": task.get("duration_minutes"),
            "headless": task.get("headless", True),
        },
    )

    build = _build_heavyload_command(task)
    if "error" in build:
        return {
            "task_type": "heavyload_stress_test",
            "status": "failure",
            "summary": {"error": build["error"]},
        }

    command: List[str] = build["command"]
    summary = build["summary"]

    logger.info("Running HeavyLoad: %s", " ".join(command))

    add_breadcrumb(
        "Executing HeavyLoad",
        category="subprocess",
        level="info",
        data={
            "stress_cpu": summary.get("stress_cpu"),
            "stress_memory": summary.get("stress_memory"),
            "stress_disk": summary.get("stress_disk"),
            "stress_gpu": summary.get("stress_gpu"),
        },
    )

    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return {
            "task_type": "heavyload_stress_test",
            "status": "failure",
            "summary": {"error": f"File not found: {task.get('executable_path')}"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "heavyload_stress_test",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    # Consider any non-zero exit code a failure for now.
    if proc.returncode != 0:
        logger.error("HeavyLoad exited with code %s", proc.returncode)
        return {
            "task_type": "heavyload_stress_test",
            "status": "failure",
            "summary": {
                **summary,
                "exit_code": proc.returncode,
                "stderr_excerpt": proc.stderr.strip()[:500],
                "stdout_excerpt": proc.stdout.strip()[:500],
                "message": "Process exited with non-zero code",
            },
            "command": command,
        }

    # Success path
    add_breadcrumb(
        "HeavyLoad stress test completed successfully",
        category="task",
        level="info",
        data={"duration_minutes": summary.get("duration_minutes")},
    )

    result_summary = {
        **summary,
        "exit_code": proc.returncode,
        "stdout_excerpt": proc.stdout.strip()[:500],
        "stderr_excerpt": proc.stderr.strip()[:500],
    }
    return {
        "task_type": "heavyload_stress_test",
        "status": "success",
        "summary": result_summary,
        "command": command,
    }


__all__ = ["run_heavyload_stress_test"]
