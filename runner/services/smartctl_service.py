"""smartctl drive health reporting service.

Task schema (dict expected):
  type: 'smartctl_report'
  executable_path: str (required) path to smartctl.exe
  detail_level: 'basic' | 'full' (optional, default 'basic')
  devices: List[str] (optional) subset of device names from --scan to query.

The service will:
  1. Run: smartctl --scan -j
  2. Enumerate devices (optionally filter via 'devices')
  3. For each device run: smartctl -a <name> -j
  4. Build either a basic summary (concise health / wear / usage metrics) or
     include the full raw smartctl JSON (detail_level == 'full').

Return dict structure:
  {
    task_type: 'smartctl_report',
    status: 'success' | 'failure',
    summary: {
       drives: [ { name, model_name, health_passed, ... basic fields ..., raw (optional) } ],
       queried_devices: int,
       scan_command: [...],
       errors: [ ... per-device errors ... ] (only if any)
    },
    command: [ optional last executed command list ]
  }
"""

from __future__ import annotations

import subprocess
import json
import logging

# Import subprocess utility with skip checking
try:
    from subprocess_utils import run_with_skip_check
except ImportError:
    # Fallback if utility not available
    run_with_skip_check = subprocess.run
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _run_smartctl(exec_path: str, args: List[str]) -> Dict[str, Any]:
    """Run smartctl with the given args (excluding executable) and parse JSON.

    Returns dict with keys: "ok" (bool), "data" (parsed JSON) or "error" (str),
    plus the executed command list under "command" for diagnostics.
    """
    command = [exec_path] + args
    try:
        proc = run_with_skip_check(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "error": f"File not found: {exec_path}",
            "command": command,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"Unexpected exception: {e}", "command": command}

    if proc.returncode != 0:
        # smartctl often returns non-zero for certain warnings; still try to parse JSON.
        logger.warning("smartctl exited with code %s for %s", proc.returncode, args)

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        excerpt = proc.stdout[:400].replace("\n", " ")
        return {
            "ok": False,
            "error": f"Failed to parse JSON output (exit {proc.returncode}). Excerpt: {excerpt}",
            "command": command,
            "stderr": proc.stderr.strip()[:400],
        }

    return {"ok": True, "data": data, "command": command, "stderr": proc.stderr.strip()}


def _bytes_from_nvme_data_units(units: Optional[int]) -> Optional[int]:
    if units is None:
        return None
    try:
        # NVMe spec: one data unit equals 1000 * 512 bytes = 512000 bytes (decimal base)
        return int(units) * 512000
    except Exception:  # noqa: BLE001
        return None


def _human_decimal_bytes(num_bytes: Optional[int]) -> Optional[str]:
    if num_bytes is None:
        return None
    # Use decimal (10^3) units to align with ~33.2 TB expectations from sample
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    value = float(num_bytes)
    for unit in units:
        if value < 1000 or unit == units[-1]:
            if unit == "B":
                return f"{int(value)} B"
            return f"{value:.1f} {unit}"
        value /= 1000.0
    return f"{value:.1f} B"  # fallback


def _latest_self_test_result(device_json: Dict[str, Any]) -> Optional[str]:
    st_log = device_json.get("nvme_self_test_log") or device_json.get(
        "ata_self_test_log"
    )
    if not st_log:
        return None
    table = st_log.get("table")
    if not isinstance(table, list) or not table:
        return None
    # Assume first entry is most recent (smartctl prints in order newest -> oldest for NVMe)
    entry = table[0]
    # NVMe
    if isinstance(entry, dict):
        result = entry.get("self_test_result") or entry.get("status")
        if isinstance(result, dict):
            return result.get("string") or result.get("value")
    return None


def _build_basic_summary(device_json: Dict[str, Any]) -> Dict[str, Any]:
    name = (device_json.get("device") or {}).get("name") or device_json.get("name")
    model = (
        device_json.get("model_name") or device_json.get("device_model") or "Unknown"
    )
    serial = (
        device_json.get("serial_number")
        or device_json.get("serial_number")
        or "Unknown"
    )
    fw = (
        device_json.get("firmware_version")
        or device_json.get("firmware_version")
        or "Unknown"
    )

    smart_status = device_json.get("smart_status") or {}
    health_passed = smart_status.get("passed")

    # NVMe specific health info
    nvme_health = device_json.get("nvme_smart_health_information_log") or {}
    percent_used = nvme_health.get("percentage_used")

    power_on_hours = None
    if isinstance(device_json.get("power_on_time"), dict):
        power_on_hours = device_json["power_on_time"].get("hours")
    power_on_hours = power_on_hours or device_json.get("power_on_hours")

    power_cycles = device_json.get("power_cycle_count") or nvme_health.get(
        "power_cycles"
    )
    unsafe_shutdowns = nvme_health.get("unsafe_shutdowns")
    media_errors = nvme_health.get("media_errors")
    err_log_entries = nvme_health.get("num_err_log_entries")

    data_units_written = nvme_health.get("data_units_written")
    data_units_read = nvme_health.get("data_units_read")
    bytes_written = _bytes_from_nvme_data_units(data_units_written)
    bytes_read = _bytes_from_nvme_data_units(data_units_read)

    temp_obj = device_json.get("temperature") or {}
    current_temp = temp_obj.get("current")
    sensors = nvme_health.get("temperature_sensors") or []
    temp_range = None
    if isinstance(sensors, list) and sensors:
        try:
            temps = [int(t) for t in sensors if t is not None]
            if temps:
                t_min, t_max = min(temps), max(temps)
                if t_min == t_max:
                    temp_range = f"{t_min} °C"
                else:
                    temp_range = f"{t_min}–{t_max} °C"
        except Exception:  # noqa: BLE001
            temp_range = None
    if not temp_range and current_temp is not None:
        temp_range = f"{current_temp} °C"

    self_test_result = _latest_self_test_result(device_json)

    summary = {
        "name": name,
        "model_name": model,
        "serial_number": serial,
        "firmware_version": fw,
        "health_passed": health_passed,
        "wear_level_percent_used": percent_used,
        "power_on_hours": power_on_hours,
        "power_cycles": power_cycles,
        "unsafe_shutdowns": unsafe_shutdowns,
        "media_errors": media_errors,
        "error_log_entries": err_log_entries,
        "data_written_bytes": bytes_written,
        "data_written_human": _human_decimal_bytes(bytes_written)
        if bytes_written
        else None,
        "data_read_bytes": bytes_read,
        "data_read_human": _human_decimal_bytes(bytes_read) if bytes_read else None,
        "temperature": temp_range,
        "last_self_test_result": self_test_result,
    }

    # Friendly one-line description similar to example
    try:
        wear_str = f"{percent_used}% used" if percent_used is not None else "N/A"
        data_written_str = (
            f"~{summary['data_written_human'].split()[0]} {summary['data_written_human'].split()[1]}"
            if summary.get("data_written_human")
            else "N/A"
        )
        data_read_str = (
            f"~{summary['data_read_human'].split()[0]} {summary['data_read_human'].split()[1]}"
            if summary.get("data_read_human")
            else "N/A"
        )
        summary["friendly"] = (
            f"Drive: {model} (SN: {serial}, FW: {fw})\n"
            f"Health: {'PASSED' if health_passed else 'FAILED' if health_passed is not None else 'UNKNOWN'}\n"
            f"Wear Level: {wear_str}\n"
            f"Power On Time: {power_on_hours:,} hours"
            if power_on_hours is not None
            else "Power On Time: N/A"
        )
        summary["friendly"] += (
            f"\nPower Cycles: {power_cycles:,}"
            if power_cycles is not None
            else "\nPower Cycles: N/A"
        )
        summary["friendly"] += (
            f"\nUnsafe Shutdowns: {unsafe_shutdowns:,}"
            if unsafe_shutdowns is not None
            else "\nUnsafe Shutdowns: N/A"
        )
        summary["friendly"] += (
            f"\nMedia Errors: {media_errors:,}"
            if media_errors is not None
            else "\nMedia Errors: N/A"
        )
        summary["friendly"] += (
            f"\nError Log Entries: {err_log_entries:,}"
            if err_log_entries is not None
            else "\nError Log Entries: N/A"
        )
        summary["friendly"] += f"\nData Written: {data_written_str}"
        summary["friendly"] += f"\nData Read: {data_read_str}"
        summary["friendly"] += f"\nTemperature: {temp_range or 'N/A'}"
        summary["friendly"] += f"\nLast Self-Test: {self_test_result or 'N/A'}"
    except Exception:  # noqa: BLE001
        pass

    return summary


def run_smartctl_report(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute smartctl scan and per-device queries, returning structured data.

    Provides either basic summaries or full raw JSON per device.
    """
    add_breadcrumb(
        "Starting smartctl drive health report", category="task", level="info"
    )

    exec_path = task.get("executable_path")
    if not exec_path:
        return {
            "task_type": "smartctl_report",
            "status": "failure",
            "summary": {"error": "'executable_path' not provided"},
        }

    detail_level = task.get("detail_level", "basic").lower()
    requested_devices: Optional[List[str]] = task.get("devices")
    if requested_devices and not isinstance(requested_devices, list):
        return {
            "task_type": "smartctl_report",
            "status": "failure",
            "summary": {"error": "'devices' must be a list of device names"},
        }

    # 1. Scan devices
    scan_res = _run_smartctl(exec_path, ["--scan", "-j"])
    if not scan_res.get("ok"):
        return {
            "task_type": "smartctl_report",
            "status": "failure",
            "summary": {"error": scan_res.get("error")},
            "command": scan_res.get("command"),
        }

    scan_data = scan_res["data"]
    devices = scan_data.get("devices", []) if isinstance(scan_data, dict) else []

    add_breadcrumb(
        f"Scanned {len(devices)} potential devices",
        category="task",
        level="info",
        data={"device_count": len(devices)},
    )

    available_names: List[str] = []
    skipped_devices: List[Dict[str, str]] = []

    def _is_usb_device(dev: Dict[str, Any]) -> bool:
        # Heuristics: many scan entries include type/protocol/info_name that mention USB
        t = dev.get("type")
        proto = dev.get("protocol")
        info = dev.get("info_name") or dev.get("name")
        if t and "usb" in str(t).lower():
            return True
        if proto and "usb" in str(proto).lower():
            return True
        if info and "usb" in str(info).lower():
            return True
        return False

    for d in devices:
        if not isinstance(d, dict):
            continue
        name = d.get("name")
        if not name:
            continue
        if _is_usb_device(d):
            skipped_devices.append({"device": name, "reason": "usb"})
            continue
        available_names.append(name)

    device_names = available_names

    if requested_devices:
        # Keep only requested devices present in scan (and not skipped)
        requested_filtered = [n for n in device_names if n in requested_devices]
        # Record requested devices that were skipped or missing
        for n in requested_devices:
            if n not in requested_filtered:
                was_skipped = any(s.get("device") == n for s in skipped_devices)
                skipped_devices.append(
                    {
                        "device": n,
                        "reason": "requested_but_skipped_or_missing"
                        if was_skipped
                        else "requested_but_missing",
                    }
                )
        device_names = requested_filtered

    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    add_breadcrumb(
        f"Querying {len(device_names)} devices",
        category="task",
        level="info",
        data={"device_count": len(device_names)},
    )

    for name in device_names:
        # Ensure name is a str for type checker
        device_name = str(name)
        res = _run_smartctl(exec_path, ["-a", device_name, "-j"])
        if not res.get("ok"):
            errors.append({"device": device_name, "error": res.get("error")})
            continue
        device_json = res["data"]
        stderr_text = res.get("stderr") or ""

        # If smartctl emitted messages about USB bridges or missing -d args, skip device
        lower_err = stderr_text.lower()
        usb_indicators = [
            "usb",
            "unknown usb bridge",
            "please specify device type",
            "usbjmicron",
            "usbasm",
        ]
        if any(ind in lower_err for ind in usb_indicators):
            skipped_devices.append(
                {
                    "device": device_name,
                    "reason": "usb_or_bridge",
                    "stderr": stderr_text,
                }
            )
            continue

        # If parsed JSON lacks identifying fields (no device name and no model), skip
        has_name = False
        dev_obj = (
            device_json.get("device")
            if isinstance(device_json.get("device"), dict)
            else None
        )
        if (dev_obj and dev_obj.get("name")) or device_json.get("name"):
            has_name = True
        if not has_name and not device_json.get("model_name"):
            skipped_devices.append(
                {
                    "device": device_name,
                    "reason": "no_identity",
                    "note": "parsed JSON missing name/model",
                }
            )
            continue
        basic = _build_basic_summary(device_json)
        if detail_level == "full":
            results.append({"basic": basic, "raw": device_json})
        else:
            results.append(basic)

    status = "success" if results else "failure"

    add_breadcrumb(
        f"smartctl report completed: {status}",
        category="task",
        level="info" if status == "success" else "warning",
        data={
            "drives_reported": len(results),
            "skipped": len(skipped_devices),
            "errors": len(errors),
        },
    )

    summary: Dict[str, Any] = {
        "drives": results,
        "queried_devices": len(device_names),
        "scan_command": scan_res.get("command"),
    }
    # Include skipped devices (e.g., USB) for visibility
    if "skipped_devices" in locals() and skipped_devices:
        summary["skipped_devices"] = skipped_devices
    if errors:
        summary["errors"] = errors
        if status == "success":  # partial success
            status = "completed_with_errors"

    return {
        "task_type": "smartctl_report",
        "status": status,
        "summary": summary,
    }


__all__ = ["run_smartctl_report"]
