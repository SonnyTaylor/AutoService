"""WhyNotWin11 compatibility check service.

Runs the portable WhyNotWin11 tool with CSV export and parses the result into
structured JSON indicating Windows 11 readiness and reasons.

Task schema (dict expected):
  type: "whynotwin11_check"
  executable_path: str (required) path to WhyNotWin11Portable.exe (or launcher)
  working_dir: str (optional) working directory; defaults to directory of exe
  output_csv: str (optional) explicit CSV path to write; defaults within working dir

Return dict structure:
  {
    task_type: "whynotwin11_check",
    status: "success" | "failure",
    summary: {
      ready: bool,
      checks: { <check_name>: true|false, ... },
      failing_checks: [ names... ],
      passing_checks: [ names... ],
      csv_path: str,
      raw: { header: [...], row: [...] },
      command
    }
  }
"""

from __future__ import annotations

import csv
import os
import subprocess
import tempfile
from typing import Any, Dict, List, Optional


def _bool_from_str(s: str) -> Optional[bool]:
    if s is None:
        return None
    v = str(s).strip().lower()
    if v in ("true", "yes", "1"):
        return True
    if v in ("false", "no", "0"):
        return False
    return None


def run_whynotwin11_check(task: Dict[str, Any]) -> Dict[str, Any]:
    exec_path = task.get("executable_path")
    working_dir = task.get("working_dir")
    output_csv = task.get("output_csv")

    if not exec_path:
        return {
            "task_type": "whynotwin11_check",
            "status": "failure",
            "summary": {"error": "'executable_path' not provided"},
        }

    try:
        abs_exec = os.path.abspath(exec_path)
        if not os.path.exists(abs_exec):
            return {
                "task_type": "whynotwin11_check",
                "status": "failure",
                "summary": {"error": f"Executable not found: {abs_exec}"},
            }
        work_dir = (
            os.path.abspath(working_dir)
            if working_dir
            else os.path.dirname(abs_exec) or os.getcwd()
        )
        os.makedirs(work_dir, exist_ok=True)

        # Choose output file
        if output_csv:
            csv_path = (
                output_csv
                if os.path.isabs(output_csv)
                else os.path.join(work_dir, output_csv)
            )
        else:
            csv_fd, tmp_csv = tempfile.mkstemp(
                prefix="whynotwin11_", suffix=".csv", dir=work_dir
            )
            os.close(csv_fd)
            csv_path = tmp_csv

        # WhyNotWin11 Portable supports: /export CSV <file> /silent
        command = [abs_exec, "/export", "CSV", csv_path, "/silent"]

        proc = subprocess.run(
            command,
            cwd=work_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        # Some variants exit 0 even when no updates; still attempt to read CSV
        if not os.path.exists(csv_path):
            return {
                "task_type": "whynotwin11_check",
                "status": "failure",
                "summary": {
                    "error": "CSV result not produced",
                    "exit_code": proc.returncode,
                    "stderr_excerpt": (proc.stderr or "")[:800],
                    "stdout_excerpt": (proc.stdout or "")[:800],
                    "command": command,
                },
            }

        # Parse CSV (expected single row + header)
        header: List[str] = []
        row: List[str] = []
        with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
                row = next(reader)
            except StopIteration:
                header = list(next(csv.reader([f.readline() or ""])) or [])

        checks: Dict[str, Optional[bool]] = {}
        failing: List[str] = []
        passing: List[str] = []

        # Known boolean columns from typical WhyNotWin11 output
        known_bool_cols = {
            "Architecture",
            "Boot Method",
            "CPU Compatibility",
            "CPU Core Count",
            "CPU Frequency",
            "DirectX + WDDM2",
            "Disk Partition Type",
            "RAM Installed",
            "Secure Boot",
            "Storage Available",
            "TPM Version",
        }

        for name, val in zip(header, row):
            if name and name != "Hostname":
                is_bool = name in known_bool_cols
                parsed = _bool_from_str(val) if is_bool else None
                checks[name] = parsed if is_bool else None
                if is_bool and parsed is True:
                    passing.append(name)
                elif is_bool and parsed is False:
                    failing.append(name)

        ready = len(failing) == 0 and any(name in checks for name in known_bool_cols)

        summary: Dict[str, Any] = {
            "ready": ready,
            "checks": checks,
            "failing_checks": failing,
            "passing_checks": passing,
            "csv_path": csv_path,
            "raw": {"header": header, "row": row},
            "command": command,
            "exit_code": proc.returncode,
            "stderr_excerpt": (proc.stderr or "")[:800],
        }

        return {
            "task_type": "whynotwin11_check",
            "status": "success",
            "summary": summary,
        }

    except FileNotFoundError:
        return {
            "task_type": "whynotwin11_check",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "whynotwin11_check",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {str(e)}"},
        }


__all__ = ["run_whynotwin11_check"]
