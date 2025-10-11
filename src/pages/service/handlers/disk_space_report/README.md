# Disk Space Report Handler

## Overview

Reports storage usage across all system drives, identifying drives with low or critical space remaining. This service provides essential storage diagnostics for customer reports and technician reviews.

## Service Definition

- **ID**: `disk_space_report`
- **Label**: Disk Space Report
- **Group**: Diagnostics
- **Category**: Diagnostics

## Parameters

This service has no configurable parameters.

## Tool Dependencies

None - uses built-in Windows system calls.

## Python Handler

This service is handled by `runner/services/disk_space_service.py` with the function `run_disk_space_report(task)`.

### Expected Task Payload

```json
{
  "type": "disk_space_report",
  "ui_label": "Disk Space Report"
}
```

### Expected Result Structure

```json
{
  "status": "success",
  "summary": {
    "drives": [
      {
        "drive": "C:",
        "total_gb": 500.0,
        "used_gb": 350.5,
        "free_gb": 149.5,
        "usage_percent": 70.1
      }
    ],
    "human_readable": {
      "warnings": ["Drive D: is running low on space (92% used)"]
    }
  },
  "ui_label": "Disk Space Report"
}
```

## Rendering

### Technician View

The technician view shows:

- **Drive Usage Bars**: Visual bars showing space utilization for each drive
  - Green bar: < 80% usage (healthy)
  - Yellow bar: 80-90% usage (warning)
  - Red bar: > 90% usage (critical)
- **Drive Statistics**: Used/Total GB and percentage for each drive
- **Warnings Section**: Lists drives with low or critical space

### Customer Metrics

Customer reports include:

- **Storage Usage Card**: Shows total storage usage across all drives
  - Icon: 🗄️
  - Value: Total used GB / Total GB
  - Detail: Average utilization percentage
  - Variant: "warning" if any drive > 90% full, otherwise "info"
  - Items: Per-drive breakdown with critical/low space warnings

## Testing

Test fixtures are available in `fixtures/` directory:

- `test_success.json` - Successful execution with multiple drives
- `test_warning.json` - Drive with low space warning
- `test_critical.json` - Drive with critical space warning

## Notes

### Drive Classification

- **Critical**: > 90% usage
- **Low**: 80-90% usage
- **Healthy**: < 80% usage

### Customer Report Behavior

- Always displays in customer reports (unless task fails)
- Critical drives are prominently highlighted
- Shows aggregate storage metrics across all drives

## Migration Checklist

- [x] Service definition migrated from catalog.js
- [x] Tech renderer migrated from renderers/tasks.js
- [x] Customer metrics migrated from print/metrics.js
- [x] Handler registered in handlers/index.js
- [x] Integration points updated in catalog.js, renderers/tasks.js, metrics.js
- [ ] Old code removed from original locations (Step 10 - do last after testing)
- [x] Documentation created
- [ ] Test fixtures created
- [ ] Tests validated through UI workflow
