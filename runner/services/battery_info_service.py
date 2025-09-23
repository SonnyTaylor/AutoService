"""Battery information service.

Collects detailed battery information using the third-party `batteryinfo`
package (Rust-backed). Mirrors the service shape used by other tasks and
returns a structured summary suitable for UI consumption.

Result shape:
  {
        "task_type": "battery_info",
        "status": "success|skipped|failure",
        "summary": {
          "battery_index": 0,
          "vendor": str|None,
          ...
          # Measurement fields are normalized to objects: {"value": float, "units": str}
          "percent": {"value": 71.1, "units": "%"},
          "voltage": {"value": 12.5, "units": "V"},
          "time_to_full": "1h,5m,19s"|None,
          "duration_seconds": 0.12
        }
  }
"""

from typing import Any, Dict, Optional, Tuple
import logging
import time

logger = logging.getLogger(__name__)


def _normalize_measurements(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert batteryinfo.as_dict() tuples to {value, units} objects.

    The batteryinfo `as_dict()` returns Measurement fields as (value, units).
    Keep non-tuple values as-is. If units are empty, treat as unavailable (None).
    """
    out: Dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, tuple) and len(v) == 2:
            # Expected measurement tuple: (value, units)
            value, units = v  # type: ignore[misc]
            # If units are missing/empty, report as None to indicate unavailability
            if units is None or (isinstance(units, str) and units.strip() == ""):
                out[k] = None
                continue
            # Round values for cleaner UI
            if isinstance(value, float):
                u = str(units)
                if u == "%":
                    value = round(value, 1)
                elif u in ("Wh", "W", "V"):
                    value = round(value, 3)
                else:
                    value = round(value, 4)
            out[k] = {"value": value, "units": units}
        else:
            out[k] = v
    return out


def _parse_time_format(bi_mod, fmt: Optional[str]):
    """Map flexible user input to batteryinfo.TimeFormat.

    Accepts: "human" (default), "seconds", "minutes" (case-insensitive)
    Fallback to Human on invalid input.
    """
    if not fmt:
        return bi_mod.TimeFormat.Human
    s = str(fmt).strip().lower()
    if s in ("sec", "secs", "second", "seconds"):
        return bi_mod.TimeFormat.Seconds
    if s in ("min", "mins", "minute", "minutes"):
        return bi_mod.TimeFormat.Minutes
    if s in ("human", "default"):
        return bi_mod.TimeFormat.Human
    # Also allow exact enum name strings
    try:
        return getattr(bi_mod.TimeFormat, fmt)
    except Exception:
        return bi_mod.TimeFormat.Human


def _parse_temp_unit(bi_mod, unit: Optional[str]):
    """Map flexible user input to batteryinfo.TempUnit.

    Accepts: "degc"/"c" or "degf"/"f". Default is DegF (library default).
    """
    if not unit:
        return bi_mod.TempUnit.DegF
    s = str(unit).strip().lower()
    if s in ("c", "degc", "celsius"):
        return bi_mod.TempUnit.DegC
    if s in ("f", "degf", "fahrenheit"):
        return bi_mod.TempUnit.DegF
    # Also allow exact enum name strings
    try:
        return getattr(bi_mod.TempUnit, unit)
    except Exception:
        return bi_mod.TempUnit.DegF


def run_battery_info(task: Dict[str, Any]) -> Dict[str, Any]:
    """Gather battery information using the `batteryinfo` package.

    Task schema (all optional):
      type: "battery_info"
      index: int (default 0)
      time_format: str ("human"|"seconds"|"minutes" or enum name)
      temp_unit: str ("degC"|"degF" or "C"/"F"; or enum name)
      refresh_interval: int milliseconds (default batteryinfo default, 500)
    """
    # Lazy import to avoid hard failure if dependency is missing at import time.
    try:
        import batteryinfo as bi
    except Exception as e:
        logger.warning("batteryinfo package unavailable: %s", e)
        return {
            "task_type": "battery_info",
            "status": "skipped",
            "summary": {"reason": "batteryinfo package not installed"},
        }

    index = int(task.get("index", 0))
    time_format = _parse_time_format(bi, task.get("time_format"))
    temp_unit = _parse_temp_unit(bi, task.get("temp_unit"))
    refresh_interval = task.get("refresh_interval")
    if refresh_interval is not None:
        try:
            refresh_interval = int(refresh_interval)
        except Exception:
            refresh_interval = None

    logger.info(
        "Collecting battery info (index=%s, time_format=%s, temp_unit=%s, refresh_interval=%s)",
        index,
        getattr(time_format, "name", str(time_format)),
        getattr(temp_unit, "name", str(temp_unit)),
        refresh_interval if refresh_interval is not None else "default",
    )

    started = time.time()
    try:
        kwargs: Dict[str, Any] = {
            "index": index,
            "time_format": time_format,
            "temp_unit": temp_unit,
        }
        if refresh_interval is not None:
            kwargs["refresh_interval"] = refresh_interval

        bat = bi.Battery(**kwargs)
        # Ensure values are fresh if caller requests; otherwise cached within interval
        # bat.refresh()  # optional; respect refresh_interval cache by default
        info_dict: Dict[str, Any] = bat.as_dict()
        summary = _normalize_measurements(info_dict)

        # Post-normalization cleanups
        # Normalize state to Title-Case (Charging, Discharging, Full, Empty, Unknown)
        state_val = summary.get("state")
        if isinstance(state_val, str):
            normalized = state_val.strip().lower()
            mapping = {
                "charging": "Charging",
                "discharging": "Discharging",
                "full": "Full",
                "empty": "Empty",
                "unknown": "Unknown",
            }
            summary["state"] = mapping.get(normalized, state_val.title())

        # Coerce cycle_count to int when numeric
        if "cycle_count" in summary:
            try:
                summary["cycle_count"] = (
                    int(summary["cycle_count"])
                    if summary["cycle_count"] is not None
                    else None
                )
            except Exception:
                pass

        # Convert empty time fields to None
        for tkey in ("time_to_empty", "time_to_full"):
            tval = summary.get(tkey)
            if isinstance(tval, str) and not tval.strip():
                summary[tkey] = None

        # Ensure temperature is None when unavailable (already handled if units were empty)
        if summary.get("temperature") is None:
            summary["temperature"] = None

        # Derived convenience: plugged_in (True if Charging or Full)
        summary["plugged_in"] = summary.get("state") in ("Charging", "Full")
        summary["duration_seconds"] = round(time.time() - started, 4)
        logger.info("Battery info collected successfully.")
        return {
            "task_type": "battery_info",
            "status": "success",
            "summary": summary,
        }

    except Exception as e:  # noqa: BLE001
        msg = str(e)
        logger.warning("Battery info not available: %s", msg)
        # If system has no battery, treat as skipped to avoid failing entire run
        if "no battery" in msg.lower() or "not present" in msg.lower():
            return {
                "task_type": "battery_info",
                "status": "skipped",
                "summary": {"reason": msg or "No battery detected"},
            }
        # Otherwise, report as failure
        return {
            "task_type": "battery_info",
            "status": "failure",
            "summary": {"error": msg or "Unknown error while querying battery"},
        }
