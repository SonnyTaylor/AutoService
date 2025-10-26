"""DriveCleanup service: remove stale device instances and registry entries.

Executes Uwe Sieber's DriveCleanup.exe with configurable flags, parses the
console output, and returns key totals (USB devices, hubs, disks, CDROMs,
volumes, WPD devices, registry items). Optionally includes per-item details
and/or the full console output when explicitly requested.

Task schema (dict expected):
  type: "drivecleanup_clean"
  executable_path: str (required) - path to DriveCleanup.exe or its folder
  test_only: bool (optional) -> -t (test only, do not actually remove)
  no_wait: bool (optional) -> -n
  volumes_only: bool (optional) -> -v
  disks_only: bool (optional) -> -d
  cdroms_only: bool (optional) -> -c
  floppies_only: bool (optional) -> -f
  usb_storage_only: bool (optional) -> -u
  hubs_only: bool (optional) -> -h
  wpd_only: bool (optional) -> -w
  registry_only: bool (optional) -> -r
  categories: List[str] (optional) - alternative to booleans, any of
              ["volumes","disks","cdroms","floppies","usb","hubs","wpd","registry"]
  additional_args: List[str] (optional) - extra raw args appended as-is
  include_items: bool (optional, default False) - include parsed per-item list
  max_items: int (optional, default 200) - limit length of per-item list
  include_full_output: bool (optional, default False) - include full stdout

Return dict structure:
  {
    task_type: "drivecleanup_clean",
    status: "success" | "failure",
    summary: {
      version: str | None,
      arch: str | None,
      intent: { ... flags ... },
      counts: {
        usb_devices_removed: int | None,
        usb_hubs_removed: int | None,
        disk_devices_removed: int | None,
        cdrom_devices_removed: int | None,
        floppy_devices_removed: int | None,
        storage_volumes_removed: int | None,
        wpd_devices_removed: int | None,
        registry_items_removed: int | None,
      },
      removed_items_total: int,               # total parsed "removing"/"Regkey delete" lines
      removed_items_truncated: bool,          # true if list was truncated by max_items
      removed_items: [ { category, id } ]?,   # present only if include_items=True
      exit_code: int,
      stdout_excerpt: str,
      stderr_excerpt: str,
      stdout_full: str?,                      # present only if include_full_output=True
    },
    command: [ ... executed command ... ]
  }
"""

from __future__ import annotations

import os
import re
import logging
import subprocess
from typing import Dict, Any, List, Optional


logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _resolve_exec_path(executable_path: Optional[str]) -> Optional[str]:
    """Resolve DriveCleanup.exe path from a file or containing directory."""
    if not executable_path:
        return None
    p = str(executable_path)
    if os.path.isdir(p):
        cand = os.path.join(p, "DriveCleanup.exe")
        return cand if os.path.exists(cand) else None
    if os.path.isfile(p):
        return p
    return None


def _build_command(task: Dict[str, Any]) -> Dict[str, Any]:
    """Build command list and normalized intent from task dict.

    Returns { command: List[str], intent: Dict[str, Any], exec_path: str } or { error: str }.
    """
    exec_path = _resolve_exec_path(task.get("executable_path"))
    if not exec_path:
        return {"error": "'executable_path' invalid or DriveCleanup.exe not found"}

    # Flags (booleans)
    test_only = bool(task.get("test_only", False))
    no_wait = bool(task.get("no_wait", False))

    # Category flags either via individual booleans or a categories list
    categories: List[str] = []
    if isinstance(task.get("categories"), list):
        categories = [str(c).strip().lower() for c in task.get("categories", [])]

    def want(name: str, flag_value: bool, alt_names: List[str]) -> bool:
        return flag_value or any(n in categories for n in alt_names)

    volumes_only = want(
        "volumes_only",
        bool(task.get("volumes_only", False)),
        ["volumes", "volume", "v"],
    )
    disks_only = want(
        "disks_only", bool(task.get("disks_only", False)), ["disks", "disk", "d"]
    )
    cdroms_only = want(
        "cdroms_only", bool(task.get("cdroms_only", False)), ["cdroms", "cdrom", "c"]
    )
    floppies_only = want(
        "floppies_only",
        bool(task.get("floppies_only", False)),
        ["floppies", "floppy", "f"],
    )
    usb_storage_only = want(
        "usb_storage_only",
        bool(task.get("usb_storage_only", False)),
        ["usb", "u", "usb_storage"],
    )
    hubs_only = want(
        "hubs_only", bool(task.get("hubs_only", False)), ["hubs", "hub", "h"]
    )
    wpd_only = want(
        "wpd_only", bool(task.get("wpd_only", False)), ["wpd", "w"]
    )  # Windows Portable Devices
    registry_only = want(
        "registry_only",
        bool(task.get("registry_only", False)),
        ["registry", "reg", "r"],
    )

    additional_args: List[str] = task.get("additional_args", [])

    cmd: List[str] = [exec_path]
    intent: Dict[str, Any] = {}
    if test_only:
        cmd.append("-t")
        intent["test_only"] = True
    if no_wait:
        cmd.append("-n")
        intent["no_wait"] = True

    # At least one category flag implies a filtered run; otherwise "no params: cleanup all!"
    any_category = any(
        [
            volumes_only,
            disks_only,
            cdroms_only,
            floppies_only,
            usb_storage_only,
            hubs_only,
            wpd_only,
            registry_only,
        ]
    )
    if volumes_only:
        cmd.append("-v")
        intent["volumes_only"] = True
    if disks_only:
        cmd.append("-d")
        intent["disks_only"] = True
    if cdroms_only:
        cmd.append("-c")
        intent["cdroms_only"] = True
    if floppies_only:
        cmd.append("-f")
        intent["floppies_only"] = True
    if usb_storage_only:
        cmd.append("-u")
        intent["usb_storage_only"] = True
    if hubs_only:
        cmd.append("-h")
        intent["hubs_only"] = True
    if wpd_only:
        cmd.append("-w")
        intent["wpd_only"] = True
    if registry_only:
        cmd.append("-r")
        intent["registry_only"] = True

    if additional_args and isinstance(additional_args, list):
        cmd += [str(a) for a in additional_args]
        intent["additional_args"] = [str(a) for a in additional_args]

    if not any_category:
        intent["cleanup_all"] = True

    return {"command": cmd, "intent": intent, "exec_path": exec_path}


# Regex patterns for parsing
_RE_VERSION = re.compile(r"^DriveCleanup\s+V([\d.]+)\s+\((x86|x64)\)", re.IGNORECASE)
_RE_COUNTS = {
    "usb_devices_removed": re.compile(
        r"^Removed\s+(\d+)\s+USB devices?", re.IGNORECASE
    ),
    "usb_hubs_removed": re.compile(r"^Removed\s+(\d+)\s+USB hubs?", re.IGNORECASE),
    "disk_devices_removed": re.compile(
        r"^Removed\s+(\d+)\s+Disk devices?", re.IGNORECASE
    ),
    "cdrom_devices_removed": re.compile(
        r"^Removed\s+(\d+)\s+CDROM devices?", re.IGNORECASE
    ),
    "floppy_devices_removed": re.compile(
        r"^Removed\s+(\d+)\s+Floppy devices?", re.IGNORECASE
    ),
    "storage_volumes_removed": re.compile(
        r"^Removed\s+(\d+)\s+Storage volumes?", re.IGNORECASE
    ),
    "wpd_devices_removed": re.compile(
        r"^Removed\s+(\d+)\s+WPD devices?", re.IGNORECASE
    ),
    "registry_items_removed": re.compile(
        r"^Removed\s+(\d+)\s+Items? from registry", re.IGNORECASE
    ),
}

_RE_ITEM_LINES: List[tuple[str, re.Pattern[str]]] = [
    ("usb_device", re.compile(r"^removing\s+USB device\s+'(.+?)'", re.IGNORECASE)),
    ("disk_device", re.compile(r"^removing\s+Disk device\s+'(.+?)'", re.IGNORECASE)),
    ("cdrom_device", re.compile(r"^removing\s+CDROM device\s+'(.+?)'", re.IGNORECASE)),
    ("volume", re.compile(r"^removing\s+volume\s+'(.+?)'", re.IGNORECASE)),
    ("wpd_device", re.compile(r"^removing\s+WPD device\s+'(.+?)'", re.IGNORECASE)),
    ("registry", re.compile(r"^Regkey delete\s+(.+)$", re.IGNORECASE)),
]


def parse_drivecleanup_output(
    output: str, *, include_items: bool = False, max_items: int = 200
) -> Dict[str, Any]:
    """Parse DriveCleanup console output into version, counts, and optional items.

    The tool prints per-item "removing ..." lines followed by \n OK lines and
    finally a summary of totals starting with "Removed ...". We prefer those
    final totals and only include full per-item lists when explicitly requested.
    """
    version: Optional[str] = None
    arch: Optional[str] = None
    counts: Dict[str, Optional[int]] = {k: None for k in _RE_COUNTS.keys()}
    items: List[Dict[str, str]] = []
    items_total = 0

    for raw in (output or "").splitlines():
        line = raw.strip()
        if not line:
            continue

        # Version
        if version is None:
            m_ver = _RE_VERSION.match(line)
            if m_ver:
                version = m_ver.group(1)
                arch = m_ver.group(2)
                continue

        # Totals
        for key, pat in _RE_COUNTS.items():
            m = pat.match(line)
            if m:
                try:
                    counts[key] = int(m.group(1))
                except Exception:
                    pass
                break

        # Items
        for cat, pat in _RE_ITEM_LINES:
            mi = pat.match(line)
            if mi:
                items_total += 1
                if include_items and len(items) < max_items:
                    ident = mi.group(1).strip()
                    items.append({"category": cat, "id": ident})
                break

    result: Dict[str, Any] = {
        "version": version,
        "arch": arch,
        "counts": counts,
        "removed_items_total": items_total,
        "removed_items_truncated": include_items and items_total > len(items),
    }
    if include_items:
        result["removed_items"] = items
    return result


def run_drivecleanup_clean(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute DriveCleanup with requested flags and parse the outcome."""
    add_breadcrumb(
        "Starting DriveCleanup",
        category="task",
        level="info",
        data={"test_only": task.get("test_only", False)},
    )

    build = _build_command(task)
    if "error" in build:
        return {
            "task_type": "drivecleanup_clean",
            "status": "failure",
            "summary": {"error": build["error"]},
        }

    command: List[str] = build["command"]
    intent: Dict[str, Any] = build.get("intent", {})
    exec_path: str = build.get("exec_path", "")

    include_items = bool(task.get("include_items", False))
    max_items = int(task.get("max_items", 200))
    include_full_output = bool(task.get("include_full_output", False))

    logger.info("Running DriveCleanup: %s", " ".join(command))

    add_breadcrumb("Executing DriveCleanup", category="subprocess", level="info")

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
            "task_type": "drivecleanup_clean",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "drivecleanup_clean",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    parsed = parse_drivecleanup_output(
        stdout, include_items=include_items, max_items=max_items
    )

    summary: Dict[str, Any] = {
        "version": parsed.get("version"),
        "arch": parsed.get("arch"),
        "intent": intent,
        "counts": parsed.get("counts", {}),
        "removed_items_total": parsed.get("removed_items_total", 0),
        "removed_items_truncated": parsed.get("removed_items_truncated", False),
        "exit_code": proc.returncode,
        "stdout_excerpt": stdout[-2000:],
        "stderr_excerpt": stderr[-1200:],
    }
    if include_items and "removed_items" in parsed:
        summary["removed_items"] = parsed["removed_items"]
    if include_full_output:
        summary["stdout_full"] = stdout

    # Some DriveCleanup builds exit with non-zero on help/usage or when nothing matches,
    # printing only usage text. If counts are all None but stdout looks like usage, treat
    # this as a no-op success (0 removals) rather than hard failure.
    status = "success" if proc.returncode == 0 else "failure"
    if status == "failure":
        looks_like_usage = bool(
            re.search(r"^DriveCleanUp?\b.*usage", stdout, re.IGNORECASE | re.MULTILINE)
        ) or bool(re.search(r"^usage\s*$", stdout, re.IGNORECASE | re.MULTILINE))
        counts_dict = parsed.get("counts", {}) if isinstance(parsed, dict) else {}
        all_none = all(v is None for v in counts_dict.values()) if counts_dict else True
        if looks_like_usage and all_none:
            status = "success"

    add_breadcrumb(
        f"DriveCleanup finished: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "removed_items_total": summary.get("removed_items_total", 0),
            "exit_code": proc.returncode,
        },
    )

    return {
        "task_type": "drivecleanup_clean",
        "status": status,
        "summary": summary,
        "command": command,
    }


__all__ = ["run_drivecleanup_clean", "parse_drivecleanup_output"]
