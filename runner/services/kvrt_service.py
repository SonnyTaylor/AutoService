"""Kaspersky Virus Removal Tool (KVRT) scan service.

Executes KVRT.exe with configurable command-line options, captures console
output, and parses key results (processed counts, detections, actions).

Task schema (dict expected):
  type: "kvrt_scan"
  executable_path: str (required) - path to KVRT.exe or folder containing it
  quarantine_dir: str (optional) - maps to -d <folder>
  modules_dir: str (optional) - maps to -moddirpath <folder>
  accept_eula: bool (optional, default True) - maps to -accepteula
  trace: bool (optional) - maps to -trace
  tracelevel: str (optional: ERR|WRN|INF|DBG) - maps to -tracelevel <level>
  processlevel: int (optional: 0..3) - maps to -processlevel <level>
  dontencrypt: bool (optional) - maps to -dontencrypt
  details: bool (optional, default True) - maps to -details
  proxyconfig: str (optional) - maps to -proxyconfig <path>
  noads: bool (optional, default True) - maps to -noads
  fixednames: bool (optional, default True) - maps to -fixednames
  freboot: bool (optional) - maps to -freboot
  silent: bool (optional, default True) - maps to -silent
  adinsilent: bool (optional) - maps to -adinsilent
  allvolumes: bool (optional) - maps to -allvolumes
  custom_path: str (optional) - maps to -custom <folder_path>
  custom_list_path: str (optional) - maps to -customlist <file_path>
  additional_args: List[str] (optional) - extra raw args appended as-is

Return dict structure:
  {
    task_type: "kvrt_scan",
    status: "success" | "failure",
    summary: {
      processed, processing_errors, detected, password_protected, corrupted,
      detections: [ { threat, object_path, action? } ],
      removed_count: int,  # number of items neutralized/removed/quarantined
      quarantine_dir, exit_code, stdout_excerpt, stderr_excerpt
    },
    command: [ ... executed command ... ]
  }
"""

from __future__ import annotations

import os
import re
import logging
import subprocess
from typing import Dict, Any, List, Optional, Tuple


logger = logging.getLogger(__name__)


def _resolve_kvrt_path(executable_path: Optional[str]) -> Optional[str]:
    """Resolve the path to KVRT.exe.

    Accepts either the direct path to KVRT.exe or a directory containing it.
    Returns None if not found.
    """
    if not executable_path:
        return None
    path = str(executable_path)
    if os.path.isdir(path):
        candidate = os.path.join(path, "KVRT.exe")
        return candidate if os.path.exists(candidate) else None
    if os.path.isfile(path):
        return path
    return None


def _build_kvrt_command(task: Dict[str, Any]) -> Dict[str, Any]:
    """Build the KVRT command list and normalized summary of intent.

    Returns { command: List[str], summary: Dict[str, Any] } or { error: str }.
    """
    exec_path = _resolve_kvrt_path(task.get("executable_path"))
    if not exec_path:
        return {"error": "'executable_path' invalid or KVRT.exe not found"}

    # Booleans
    accept_eula = bool(task.get("accept_eula", True))
    trace = bool(task.get("trace", False))
    dontencrypt = bool(task.get("dontencrypt", False))
    details = bool(task.get("details", True))
    noads = bool(task.get("noads", True))
    fixednames = bool(task.get("fixednames", True))
    freboot = bool(task.get("freboot", False))
    silent = bool(task.get("silent", True))
    adinsilent = bool(task.get("adinsilent", False))
    allvolumes = bool(task.get("allvolumes", False))

    # Strings / numbers
    quarantine_dir = task.get("quarantine_dir") or task.get("d")
    modules_dir = task.get("modules_dir") or task.get("moddirpath")
    tracelevel = task.get("tracelevel")
    processlevel = task.get("processlevel")
    proxyconfig = task.get("proxyconfig")
    custom_path = task.get("custom_path")
    custom_list_path = task.get("custom_list_path")
    additional_args: List[str] = task.get("additional_args", [])

    cmd: List[str] = [exec_path]
    summary: Dict[str, Any] = {}

    if accept_eula:
        cmd.append("-accepteula")
        summary["accept_eula"] = True
    if silent:
        cmd.append("-silent")
        summary["silent"] = True
    if details:
        cmd.append("-details")
        summary["details"] = True
    if dontencrypt:
        cmd.append("-dontencrypt")
        summary["dontencrypt"] = True
    if noads:
        cmd.append("-noads")
        summary["noads"] = True
    if fixednames:
        cmd.append("-fixednames")
        summary["fixednames"] = True
    if freboot:
        cmd.append("-freboot")
        summary["freboot"] = True
    if adinsilent:
        cmd.append("-adinsilent")
        summary["adinsilent"] = True
    if allvolumes:
        cmd.append("-allvolumes")
        summary["allvolumes"] = True

    if quarantine_dir:
        cmd += ["-d", str(quarantine_dir)]
        summary["quarantine_dir"] = str(quarantine_dir)
    if modules_dir:
        cmd += ["-moddirpath", str(modules_dir)]
        summary["modules_dir"] = str(modules_dir)
    if trace:
        cmd.append("-trace")
        summary["trace"] = True
    if tracelevel:
        tl = str(tracelevel).upper()
        if tl in ("ERR", "WRN", "INF", "DBG"):
            cmd += ["-tracelevel", tl]
            summary["tracelevel"] = tl
    if processlevel is not None:
        try:
            pl = int(processlevel)
            if pl < 0 or pl > 3:
                raise ValueError
            cmd += ["-processlevel", str(pl)]
            summary["processlevel"] = pl
        except (TypeError, ValueError):
            logger.warning("Ignoring invalid processlevel: %r", processlevel)
    if proxyconfig:
        cmd += ["-proxyconfig", str(proxyconfig)]
        summary["proxyconfig"] = str(proxyconfig)
    if custom_path:
        cmd += ["-custom", str(custom_path)]
        summary["custom_path"] = str(custom_path)
    if custom_list_path:
        cmd += ["-customlist", str(custom_list_path)]
        summary["custom_list_path"] = str(custom_list_path)

    if additional_args and isinstance(additional_args, list):
        cmd += [str(a) for a in additional_args]
        summary["additional_args"] = [str(a) for a in additional_args]

    return {"command": cmd, "summary": summary, "exec_path": exec_path}


_RE_DETECTION = re.compile(
    r"Threat\s*<(?P<threat>.+?)>\s*is detected on object\s*<(?P<object>.+?)>",
    re.IGNORECASE,
)
_RE_ACTION = re.compile(
    r"Action\s*<(?P<action>.+?)>\s*is selected for threat\s*<(?P<threat>.+?)>\s*on object\s*<(?P<object>.+?)>",
    re.IGNORECASE,
)
_RE_KVRT_COUNT = {
    "processed": re.compile(r"^\s*Processed:\s*(\d+)", re.IGNORECASE),
    "processing_errors": re.compile(r"^\s*Processing errors:\s*(\d+)", re.IGNORECASE),
    "detected": re.compile(r"^\s*Detected:\s*(\d+)", re.IGNORECASE),
    "password_protected": re.compile(r"^\s*Password protected:\s*(\d+)", re.IGNORECASE),
    "corrupted": re.compile(r"^\s*Corrupted:\s*(\d+)", re.IGNORECASE),
}


def parse_kvrt_output(output: str) -> Dict[str, Any]:
    """Parse KVRT console output into structured results.

    Extracts totals, detected threats, and post-scan actions.
    """
    summary: Dict[str, Any] = {
        "processed": None,
        "processing_errors": None,
        "detected": None,
        "password_protected": None,
        "corrupted": None,
        "detections": [],
        "removed_count": 0,
    }

    detections_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    removed_count = 0

    for raw_line in (output or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Totals
        for k, pat in _RE_KVRT_COUNT.items():
            m = pat.match(line)
            if m:
                try:
                    summary[k] = int(m.group(1))
                except Exception:
                    pass
                break

        # Detection lines
        m_det = _RE_DETECTION.search(line)
        if m_det:
            threat = m_det.group("threat").strip()
            obj = m_det.group("object").strip()
            key = (threat, obj)
            entry = detections_map.get(key)
            if not entry:
                entry = {"threat": threat, "object_path": obj, "action": None}
                detections_map[key] = entry
            continue

        # Action lines
        m_act = _RE_ACTION.search(line)
        if m_act:
            action = m_act.group("action").strip()
            threat = m_act.group("threat").strip()
            obj = m_act.group("object").strip()
            key = (threat, obj)
            entry = detections_map.get(key)
            if entry:
                entry["action"] = action
            else:
                detections_map[key] = {
                    "threat": threat,
                    "object_path": obj,
                    "action": action,
                }
            # Count removal/neutralization actions
            try:
                act_lower = action.lower()
                # KVRT action vocabulary commonly includes: Delete, Disinfect, Quarantine, Skip
                if any(
                    k in act_lower
                    for k in [
                        "delete",
                        "disinfect",
                        "quarantine",
                        "neutraliz",
                        "remove",
                    ]
                ):
                    removed_count += 1
            except Exception:
                pass

    summary["detections"] = list(detections_map.values())
    summary["removed_count"] = removed_count
    return summary


def run_kvrt_scan(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute KVRT scan according to task configuration and parse results."""
    build = _build_kvrt_command(task)
    if "error" in build:
        return {
            "task_type": "kvrt_scan",
            "status": "failure",
            "summary": {"error": build["error"]},
        }

    command: List[str] = build["command"]
    intent_summary: Dict[str, Any] = build.get("summary", {})
    exec_path: str = build.get("exec_path", "")

    logger.info("Running KVRT: %s", " ".join(command))

    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            cwd=os.path.dirname(exec_path) or None,
        )
    except FileNotFoundError:
        return {
            "task_type": "kvrt_scan",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "kvrt_scan",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # Consider exit code 0 as success; otherwise failure (still parse to provide details)
    parsed = parse_kvrt_output(stdout)

    result_summary: Dict[str, Any] = {
        **intent_summary,
        **parsed,
        "exit_code": proc.returncode,
        "stdout_excerpt": stdout[-1200:],
        "stderr_excerpt": stderr[-1200:],
    }

    status = "success" if proc.returncode == 0 else "failure"

    return {
        "task_type": "kvrt_scan",
        "status": status,
        "summary": result_summary,
        "command": command,
    }


__all__ = ["run_kvrt_scan", "parse_kvrt_output"]
