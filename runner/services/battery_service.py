"""Battery health reporting service.

Reports battery health information using the batteryinfo Python module.
Provides details on battery capacity, cycle count, wear level, temperature,
state, and time estimates.

Task schema (dict expected):
  type: 'battery_health_report'
  index: int (optional, default 0) - Battery index for systems with multiple batteries

Return dict structure:
  {
    task_type: 'battery_health_report',
    status: 'success' | 'failure' | 'skipped',
    summary: {
      vendor: str (optional),
      model: str (optional),
      serial_number: str (optional),
      technology: str,
      percent: float,
      state: str ('Charging', 'Discharging', 'Full', 'Empty', 'Unknown'),
      capacity_percent: float,
      temperature_c: float (optional),
      cycle_count: int,
      energy_wh: float,
      energy_full_wh: float,
      energy_full_design_wh: float,
      voltage_v: float,
      time_to_empty: str (optional),
      time_to_full: str (optional),
      health_verdict: str,
      wear_level_percent: float (calculated as 100 - capacity),
      human_readable: str
    }
  }
"""

from __future__ import annotations

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

try:
    import batteryinfo

    BATTERYINFO_AVAILABLE = True
except ImportError:
    BATTERYINFO_AVAILABLE = False
    logger.warning("batteryinfo module not available")


def _extract_measurement_value(measurement) -> Optional[float]:
    """Extract numeric value from a batteryinfo Measurement object."""
    if measurement is None:
        return None
    try:
        # Measurement objects have a .value attribute
        return float(measurement.value)
    except (AttributeError, ValueError, TypeError):
        return None


def run_battery_health_report(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute battery health check using batteryinfo module.

    Returns structured battery health data including capacity, wear level,
    cycle count, temperature, and charge state.
    """

    if not BATTERYINFO_AVAILABLE:
        return {
            "task_type": "battery_health_report",
            "status": "failure",
            "summary": {
                "error": "batteryinfo module not installed. Install with: pip install batteryinfo"
            },
        }

    battery_index = task.get("index", 0)

    try:
        # Create battery instance with human-readable time format and Celsius
        battery = batteryinfo.Battery(
            index=battery_index,
            time_format=batteryinfo.TimeFormat.Human,
            temp_unit=batteryinfo.TempUnit.DegC,
            refresh_interval=500,
        )

        # Extract all battery properties
        vendor = battery.vendor
        model = battery.model
        serial_number = battery.serial_number
        technology = battery.technology
        state = battery.state

        # Extract measurement values
        percent = _extract_measurement_value(battery.percent)
        capacity_percent = _extract_measurement_value(battery.capacity)
        temperature_c = _extract_measurement_value(battery.temperature)
        cycle_count = battery.cycle_count
        energy_wh = _extract_measurement_value(battery.energy)
        energy_full_wh = _extract_measurement_value(battery.energy_full)
        energy_full_design_wh = _extract_measurement_value(battery.energy_full_design)
        voltage_v = _extract_measurement_value(battery.voltage)

        # Time estimates (already formatted as strings)
        time_to_empty = battery.time_to_empty
        time_to_full = battery.time_to_full

        # Calculate wear level (inverse of capacity)
        wear_level_percent = None
        if capacity_percent is not None:
            wear_level_percent = 100.0 - capacity_percent

        # Determine health verdict based on capacity
        health_verdict = "Unknown"
        if capacity_percent is not None:
            if capacity_percent >= 90:
                health_verdict = "Excellent"
            elif capacity_percent >= 80:
                health_verdict = "Good"
            elif capacity_percent >= 70:
                health_verdict = "Fair"
            elif capacity_percent >= 60:
                health_verdict = "Poor"
            else:
                health_verdict = "Critical"

        # Build human-readable summary
        human_readable_parts = []
        if model or vendor:
            battery_name = f"{vendor or ''} {model or ''}".strip()
            human_readable_parts.append(f"Battery: {battery_name}")

        if serial_number:
            human_readable_parts.append(f"Serial: {serial_number}")

        if technology:
            human_readable_parts.append(f"Technology: {technology}")

        if percent is not None:
            human_readable_parts.append(f"Charge Level: {percent:.1f}%")

        human_readable_parts.append(f"State: {state}")

        if capacity_percent is not None:
            human_readable_parts.append(f"Capacity: {capacity_percent:.1f}%")

        if wear_level_percent is not None:
            human_readable_parts.append(f"Wear Level: {wear_level_percent:.1f}%")

        if cycle_count is not None:
            human_readable_parts.append(f"Cycle Count: {cycle_count:,}")

        if temperature_c is not None:
            human_readable_parts.append(f"Temperature: {temperature_c:.1f}°C")

        if voltage_v is not None:
            human_readable_parts.append(f"Voltage: {voltage_v:.2f}V")

        if energy_wh is not None and energy_full_design_wh is not None:
            human_readable_parts.append(
                f"Energy: {energy_wh:.2f}Wh / {energy_full_design_wh:.2f}Wh (design)"
            )

        if state == "Charging" and time_to_full:
            human_readable_parts.append(f"Time to Full: {time_to_full}")
        elif state == "Discharging" and time_to_empty:
            human_readable_parts.append(f"Time to Empty: {time_to_empty}")

        human_readable_parts.append(f"Health: {health_verdict}")

        human_readable = "\n".join(human_readable_parts)

        summary = {
            "vendor": vendor,
            "model": model,
            "serial_number": serial_number,
            "technology": technology,
            "percent": percent,
            "state": state,
            "capacity_percent": capacity_percent,
            "temperature_c": temperature_c,
            "cycle_count": cycle_count,
            "energy_wh": energy_wh,
            "energy_full_wh": energy_full_wh,
            "energy_full_design_wh": energy_full_design_wh,
            "voltage_v": voltage_v,
            "time_to_empty": time_to_empty,
            "time_to_full": time_to_full,
            "health_verdict": health_verdict,
            "wear_level_percent": wear_level_percent,
            "human_readable": human_readable,
        }

        return {
            "task_type": "battery_health_report",
            "status": "success",
            "summary": summary,
        }

    except Exception as e:
        logger.error("Battery health report failed")
        error_msg = str(e)

        # Check if this is a "no battery" error
        if "no battery" in error_msg.lower() or "not found" in error_msg.lower():
            return {
                "task_type": "battery_health_report",
                "status": "skipped",
                "summary": {
                    "error": "No battery detected. This system may not have a battery (desktop) or battery information is unavailable.",
                    "human_readable": "Battery Check: Skipped (No battery detected)",
                },
            }

        return {
            "task_type": "battery_health_report",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "human_readable": f"Battery Check: Failed ({error_msg})",
            },
        }


__all__ = ["run_battery_health_report"]
