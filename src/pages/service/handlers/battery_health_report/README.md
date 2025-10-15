# Battery Health Report Handler

Reports comprehensive battery health information for laptop and portable systems using the `batteryinfo` Python module.

## Features

- **Battery Capacity**: Shows current charge level and maximum capacity percentage
- **Wear Level**: Calculates battery degradation over time
- **Cycle Count**: Tracks number of charge/discharge cycles
- **Temperature Monitoring**: Reports battery temperature in Celsius
- **State Detection**: Indicates charging, discharging, full, or empty states
- **Time Estimates**: Shows time to full charge or empty based on current rate
- **Health Verdict**: Provides overall health assessment (Excellent, Good, Fair, Poor, Critical)
- **Energy Metrics**: Displays current, full, and design capacity in watt-hours
- **Voltage Monitoring**: Reports current battery voltage

## Service Definition

- **ID**: `battery_health_report`
- **Label**: Battery Health Report
- **Category**: Diagnostics
- **Tool Dependencies**: None (uses Python module)

## Task Schema

```json
{
  "type": "battery_health_report",
  "index": 0 // Optional: Battery index for multi-battery systems (default: 0)
}
```

## Result Structure

### Success Response

```json
{
  "task_type": "battery_health_report",
  "status": "success",
  "summary": {
    "vendor": "Samsung",
    "model": "SDI-BT50",
    "serial_number": "BAT98765",
    "technology": "Li-ion",
    "percent": 92.1,
    "state": "Charging",
    "capacity_percent": 95.8,
    "temperature_c": 28.3,
    "cycle_count": 23,
    "energy_wh": 45.2,
    "energy_full_wh": 47.1,
    "energy_full_design_wh": 49.2,
    "voltage_v": 11.92,
    "time_to_empty": null,
    "time_to_full": "1h,12m,35s",
    "health_verdict": "Excellent",
    "wear_level_percent": 4.2,
    "human_readable": "Battery: Samsung SDI-BT50\n..."
  }
}
```

### Skipped Response (No Battery)

```json
{
  "task_type": "battery_health_report",
  "status": "skipped",
  "summary": {
    "error": "No battery detected. This system may not have a battery (desktop) or battery information is unavailable.",
    "human_readable": "Battery Check: Skipped (No battery detected)"
  }
}
```

## Health Verdicts

Based on capacity percentage:

- **Excellent**: ≥ 90% capacity
- **Good**: 80-89% capacity
- **Fair**: 70-79% capacity
- **Poor**: 60-69% capacity
- **Critical**: < 60% capacity

## Dependencies

**Python Module**: `batteryinfo`

Install with:

```bash
pip install batteryinfo
```

Already included in `runner/requirements.txt`.

## Testing

Test fixtures are provided in `fixtures/`:

- `test_good.json` - Battery in good condition
- `test_charging.json` - Battery currently charging with excellent health
- `test_degraded.json` - Battery with significant wear and poor health
- `test_no_battery.json` - No battery detected (desktop system)

Run tests with:

```bash
python runner/service_runner.py fixtures/test_battery.json
```

## Technician View

Displays:

- Battery icon with charge level indicator
- Manufacturer and model information
- KPI boxes for all key metrics
- Color-coded health indicators (green/yellow/red)
- Time estimates for charging/discharging
- Status pills for health verdict and technology

## Customer Report

Extracts customer-friendly metrics:

- **Icon**: 🔋
- **Label**: Battery Health
- **Value**: Health verdict or capacity percentage
- **Details**: Key metrics like capacity, wear, cycles, charge level, temperature

## Print Styles

Custom print CSS is exported for technician report printing with optimized layout for battery metrics visualization.
