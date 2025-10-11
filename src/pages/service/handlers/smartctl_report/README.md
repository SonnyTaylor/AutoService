# smartctl_report Handler

## Overview

The `smartctl_report` handler provides drive health diagnostics using smartctl from GSmartControl. It scans all non-USB drives and reports comprehensive SMART health metrics including wear levels, temperature, power-on hours, and error counts.

## Service Definition

**Service ID**: `smartctl_report`  
**Display Name**: Drive Health Report (smartctl)  
**Category**: Diagnostics  
**Group**: Diagnostics

### Required Tools

- **smartctl** (from GSmartControl package) - SMART monitoring utility
- **gsmartcontrol** (alternative) - GUI wrapper that includes smartctl

### Task Parameters

```javascript
{
  type: "smartctl_report",
  executable_path: "path/to/smartctl.exe",  // Required
  detail_level: "basic",                     // Optional: "basic" | "full"
  ui_label: "Drive Health Report (smartctl)" // Optional
}
```

## Python Service (`runner/services/smartctl_service.py`)

### Task Execution Flow

1. **Scan for Drives**: Runs `smartctl --scan -j` to enumerate available drives
2. **Filter USB Drives**: Automatically skips USB drives and bridge devices
3. **Query Each Drive**: Runs `smartctl -a <device> -j` for detailed SMART data
4. **Parse Metrics**: Extracts health status, wear level, temperature, error counts

### Output Structure

```python
{
  "task_type": "smartctl_report",
  "status": "success" | "failure" | "completed_with_errors",
  "summary": {
    "drives": [
      {
        "name": "/dev/sda",
        "model_name": "Samsung SSD 980 PRO 1TB",
        "serial_number": "S5GYNX0R123456A",
        "firmware_version": "5B2QGXA7",
        "health_passed": true,
        "wear_level_percent_used": 1,
        "power_on_hours": 2419,
        "power_cycles": 58,
        "unsafe_shutdowns": 5,
        "media_errors": 0,
        "error_log_entries": 0,
        "data_written_bytes": 33205913600000,
        "data_written_human": "33.2 TB",
        "data_read_bytes": 25179576320000,
        "data_read_human": "25.2 TB",
        "temperature": "30–43 °C",
        "last_self_test_result": "Completed without error",
        "friendly": "Drive: Samsung SSD 980 PRO 1TB..."
      }
    ],
    "queried_devices": 1,
    "scan_command": ["smartctl", "--scan", "-j"],
    "skipped_devices": [
      {
        "device": "/dev/sdb",
        "reason": "usb"
      }
    ],
    "errors": []  // Only if any device queries failed
  }
}
```

### Key Features

- **USB Detection**: Automatically skips USB drives to avoid bridge issues
- **Health Assessment**: Validates SMART status for each drive
- **Wear Monitoring**: Tracks SSD wear level percentage (NVMe specific)
- **Error Tracking**: Reports media errors, log entries, unsafe shutdowns
- **Data Usage**: Calculates total data read/written with human-readable format
- **Temperature Monitoring**: Reports current temperature or sensor range
- **Self-Test Results**: Shows last self-test status if available

## Technician View Renderer

### Display Components

1. **Header**: "Drive Health (smartctl)" with status badge
2. **Drive Cards**: One card per drive with:
   - **Drive Header**:
     - Model name
     - Serial number and firmware version
     - PASSED/FAILED badge (based on health_passed)
   - **KPI Grid**:
     - Drive Health (wear level, color-coded: green ≥90%, yellow ≥70%, red <70%)
     - Temperature
     - Media Errors (red if >0)
     - Error Log entries (yellow if >0)
     - Unsafe Shutdowns (yellow if >0)
     - Power On Hours
     - Power Cycles
     - Data Written (human-readable)
     - Data Read (human-readable)

### Visual Design

```
╔══════════════════════════════════════════════════════╗
║ Drive Health (smartctl)                    [SUCCESS] ║
╠══════════════════════════════════════════════════════╣
║ Samsung SSD 980 PRO 1TB                      PASSED  ║
║ (SN: S5GYNX0R123456A, FW: 5B2QGXA7)                  ║
║                                                      ║
║ [Drive Health] [  Temp  ] [Media Errors] [Error Log] ║
║     99%           35 °C         0             0      ║
║                                                      ║
║ [Unsafe Shutdowns] [Power On Hrs] [Power Cycles]     ║
║         5               2,419           58           ║
║                                                      ║
║ [Data Written] [Data Read]                           ║
║    33.2 TB       25.2 TB                             ║
╚══════════════════════════════════════════════════════╝
```

### Color Coding

- **Green (ok)**: Health ≥90%, no errors, PASSED status
- **Yellow (warn)**: Health 70-89%, error log entries, unsafe shutdowns
- **Red (fail)**: Health <70%, media errors >0, FAILED status

## Customer Metrics Extraction

### Metric Card Output

**Icon**: 💾  
**Label**: "Hard Drive Health"  
**Value**: Average health percentage or "Checked"  
**Detail**: Number of drives analyzed  
**Variant**: `success` (if avg <80%) or `info`

### Example Output

```javascript
{
  icon: "💾",
  label: "Hard Drive Health",
  value: "99% avg",
  detail: "2 drives analyzed",
  variant: "info",
  items: [
    "Samsung SSD 980 PRO 1TB: 99% health, 35 °C, 2419h runtime",
    "WD Blue 1TB HDD: 100% health, 32 °C, 8234h runtime"
  ]
}
```

### Customer-Friendly Presentation

- **Value**: Shows average health across all drives
- **Detail**: Counts total drives scanned
- **Items**: One line per drive with health, temperature, runtime
- **Variant**: Highlights drives with <80% health as success (issue found/addressed)

## Test Fixtures

### Fixture: `healthy.json` - All Drives Healthy

```json
{
  "tasks": [
    {
      "type": "smartctl_report",
      "executable_path": "..\\data\\programs\\GSmartControl - 2.0.2\\smartctl.exe",
      "detail_level": "basic"
    }
  ]
}
```

**Expected Result**: All drives show PASSED status with high health percentages.

### Fixture: `degraded_drive.json` - Drive with Wear

```json
{
  "tasks": [
    {
      "type": "smartctl_report",
      "executable_path": "..\\data\\programs\\GSmartControl - 2.0.2\\smartctl.exe",
      "detail_level": "basic"
    }
  ]
}
```

**Expected Result**: One drive shows elevated wear level (e.g., 85% used = 15% health).

### Fixture: `drive_errors.json` - Drive with Errors

```json
{
  "tasks": [
    {
      "type": "smartctl_report",
      "executable_path": "..\\data\\programs\\GSmartControl - 2.0.2\\smartctl.exe",
      "detail_level": "basic"
    }
  ]
}
```

**Expected Result**: Drive shows media errors and/or error log entries.

### Fixture: `no_drives.json` - No Drives Found

```json
{
  "tasks": [
    {
      "type": "smartctl_report",
      "executable_path": "..\\data\\programs\\GSmartControl - 2.0.2\\smartctl.exe",
      "detail_level": "basic"
    }
  ]
}
```

**Expected Result**: "No drive data" message displayed.

## Data Processing Logic

### Health Calculation

```javascript
// Wear level is percentage USED, health is percentage REMAINING
const healthPercent =
  d.wear_level_percent_used != null ? 100 - d.wear_level_percent_used : null;

// Color variant based on remaining health
const healthVariant = (() => {
  if (healthPercent == null) return undefined;
  if (healthPercent >= 90) return "ok"; // Green: Excellent
  if (healthPercent >= 70) return "warn"; // Yellow: Aging
  return "fail"; // Red: Critical
})();
```

### Average Health for Customer View

```javascript
const drivesWithHealth = driveHealthData.filter((d) => d.health != null);
const avgHealth =
  drivesWithHealth.length > 0
    ? Math.round(
        drivesWithHealth.reduce((sum, d) => sum + d.health, 0) /
          drivesWithHealth.length
      )
    : null;
```

### Temperature Display

- **Single Sensor**: "35 °C"
- **Multiple Sensors**: "30–43 °C" (range)
- **No Data**: "-"

## Edge Cases

### USB Drives Skipped

```javascript
skipped_devices: [
  {
    device: "/dev/sdb",
    reason: "usb",
  },
];
```

Technician view could show skipped drives in a separate section if needed.

### Partial Success (Some Drives Failed)

```javascript
status: "completed_with_errors",
summary: {
  drives: [...],  // Successfully queried drives
  errors: [
    {
      device: "/dev/sdc",
      error: "Failed to parse JSON output"
    }
  ]
}
```

Status badge shows warning, errors section provides details.

### No SMART Support

Some drives don't support SMART monitoring:

```javascript
{
  health_passed: null,  // SMART not available
  wear_level_percent_used: null
}
```

Display shows "-" for unavailable metrics.

## Integration Points

### Catalog Integration (`catalog.js`)

The legacy `smartctl_report` entry has been **removed** from `SERVICES` object. Handler is imported via:

```javascript
import { getServiceDefinitions } from "./handlers/index.js";
const HANDLER_DEFINITIONS = getServiceDefinitions();

export const SERVICES = {
  ...HANDLER_DEFINITIONS, // Includes smartctl_report
  // ... other legacy services
};
```

### Renderer Integration (`renderers/tasks.js`)

The legacy `renderSmartctl` function has been **removed**. Handler renderer is imported via:

```javascript
import { getTechRenderers } from "../handlers/index.js";
const HANDLER_RENDERERS = getTechRenderers();

export const RENDERERS = {
  ...HANDLER_RENDERERS, // Includes smartctl_report
  // ... other legacy renderers
};
```

### Metrics Integration (`metrics.js`)

The legacy `processDriveHealth` function has been **removed**. Handler extractor is called via:

```javascript
import { getCustomerMetricExtractors } from "../handlers/index.js";
const extractors = getCustomerMetricExtractors();

// In extractCustomerMetrics:
const extractor = extractors[task_type];
if (extractor) {
  const handlerMetrics = extractor({ result });
  metrics.push(...handlerMetrics);
}
```

## Testing Instructions

### Manual Testing

1. **Navigate to Service → Run**
2. **Add "Drive Health Report (smartctl)"** from catalog
3. **Execute the service**
4. **Verify technician view**:
   - All drives displayed with correct badges
   - Health percentages accurate (100 - wear_level)
   - Color coding matches health thresholds
   - Temperature, errors, hours displayed
5. **Check customer print**:
   - "Hard Drive Health" metric appears
   - Average health calculated correctly
   - All drives listed with details

### Fixture Testing

```powershell
# Test with various scenarios
python runner/service_runner.py runner/fixtures/smartctl/healthy.json
python runner/service_runner.py runner/fixtures/smartctl/degraded_drive.json
python runner/service_runner.py runner/fixtures/smartctl/drive_errors.json
```

### Integration Testing

1. Run smartctl report in a multi-service workflow
2. Verify customer print aggregates all metrics correctly
3. Confirm print output shows drive health summary

## Dependencies

### Frontend

- **lit-html**: Template rendering
- **common/ui.js**: `renderHeader`, `kpiBox` components
- **common/metrics.js**: `buildMetric` helper

### Backend

- **smartctl.exe**: SMART monitoring command-line utility
- **Python subprocess**: Command execution
- **JSON parsing**: SMART data interpretation

## Known Limitations

1. **USB Drives**: Automatically skipped due to bridge compatibility issues
2. **SMART Support**: Some drives don't support SMART (shows N/A)
3. **NVMe Focus**: Wear level percentage is NVMe-specific (SSDs)
4. **HDD Metrics**: Traditional HDDs may have different/limited metrics
5. **Permissions**: May require admin rights for low-level disk access

## Migration Notes

### What Was Migrated

✅ Service definition from `catalog.js`  
✅ Tech renderer `renderSmartctl` from `tasks.js`  
✅ Customer metrics `processDriveHealth` from `metrics.js`

### What Changed

- **Signature**: Renderer now receives `{ result, index }` instead of `(result, index)`
- **Extractor Signature**: Receives `{ result }` instead of `(summary, status)`
- **Metric Building**: Uses `buildMetric` helper for consistency
- **Location**: All code now in single `handlers/smartctl_report/index.js` file

### Backward Compatibility

The handler system maintains full backward compatibility through signature wrapping in `handlers/index.js`. Legacy code calling the renderer with `(result, index)` automatically works.

## Future Enhancements

### Possible Improvements

1. **Show Skipped Drives**: Display USB drives in separate section with reason
2. **Self-Test Trigger**: Option to run SMART self-test during scan
3. **Historical Tracking**: Compare current metrics with previous scans
4. **Alert Thresholds**: Configurable warning levels for wear/temperature
5. **Raw Data View**: Toggle to show full SMART attribute table
6. **HDD-Specific Metrics**: Add reallocated sectors, seek error rate for HDDs
7. **Chart Visualization**: Health trend over time if multiple scans saved

## References

- **smartctl Manual**: https://www.smartmontools.org/wiki/TocDoc
- **SMART Attributes**: https://en.wikipedia.org/wiki/S.M.A.R.T.
- **NVMe Health**: https://nvmexpress.org/specifications/
- **Handler Migration Guide**: `docs/HANDLER_MIGRATION_GUIDE.md`
