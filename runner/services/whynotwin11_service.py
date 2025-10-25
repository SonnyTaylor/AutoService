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
import logging

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _bool_from_str(s: str) -> Optional[bool]:
    if s is None:
        return None
    v = str(s).strip().lower()
    if v in ("true", "yes", "1"):
        return True
    if v in ("false", "no", "0"):
        return False
    return None


def _read_csv_flex(path: str) -> Dict[str, List[str]]:
    """Read 1-2 line CSV (header optional) trying multiple encodings.

    Returns dict with keys: header, row. If only one line exists, header is [].
    """
    encodings = ["utf-8-sig", "utf-8", "utf-16", "cp1252"]
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc, errors="replace") as f:
                reader = list(csv.reader(f))
                if len(reader) >= 2:
                    return {"header": reader[0] or [], "row": reader[1] or []}
                if len(reader) == 1:
                    return {"header": [], "row": reader[0] or []}
        except Exception:
            continue
    return {"header": [], "row": []}


def run_whynotwin11_check(task: Dict[str, Any]) -> Dict[str, Any]:
    add_breadcrumb(
        "Starting WhyNotWin11 compatibility check", category="task", level="info"
    )

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

        add_breadcrumb("Executing WhyNotWin11", category="subprocess", level="info")

        proc = subprocess.run(
            command,
            cwd=work_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        # Locate CSV (some builds place it under App\WhyNotWin11 regardless of provided path)
        candidates = [csv_path]
        candidates.append(os.path.join(work_dir, "App", "WhyNotWin11", "result.csv"))
        candidates.append(os.path.join(work_dir, "result.csv"))
        found_csv = next((p for p in candidates if os.path.exists(p)), None)
        if not found_csv:
            return {
                "task_type": "whynotwin11_check",
                "status": "failure",
                "summary": {
                    "error": "CSV result not produced",
                    "tried_paths": candidates,
                    "exit_code": proc.returncode,
                    "stderr_excerpt": (proc.stderr or "")[:800],
                    "stdout_excerpt": (proc.stdout or "")[:800],
                    "command": command,
                },
            }

        # Parse CSV (expected single row + header)
        parsed = _read_csv_flex(found_csv)
        header: List[str] = parsed.get("header", [])
        row: List[str] = parsed.get("row", [])

        # Default column order used by WhyNotWin11 when header might be missing
        default_columns = [
            "Hostname",
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
        ]

        if (not header) and row:
            # If the single row length matches expected columns, adopt defaults
            if len(row) == len(default_columns):
                header = list(default_columns)

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

        add_breadcrumb(
            "Win11 compatibility check completed",
            category="task",
            level="info",
            data={
                "ready": ready,
                "failing_count": len(failing),
                "passing_count": len(passing),
            },
        )

        hostname = None
        if header and row and header[0].strip().lower() == "hostname":
            try:
                hostname = row[0]
            except Exception:
                hostname = None

        summary: Dict[str, Any] = {
            "ready": ready,
            "checks": checks,
            "failing_checks": failing,
            "passing_checks": passing,
            "hostname": hostname,
            "csv_path": found_csv,
            "raw": {"header": header, "row": row},
            "command": command,
            "exit_code": proc.returncode,
            "stderr_excerpt": (proc.stderr or "")[:800],
        }

        # Human-readable quick verdict and notes
        hr_notes: List[str] = []
        if failing:
            hr_notes.append("Failing: " + ", ".join(failing))
        summary["human_readable"] = {
            "verdict": "ready" if ready else "not_ready",
            "notes": hr_notes,
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
