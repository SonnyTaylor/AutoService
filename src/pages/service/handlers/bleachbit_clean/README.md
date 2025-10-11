# bleachbit_clean - Junk File Cleanup

## Overview

The `bleachbit_clean` handler executes BleachBit to remove temporary files, caches, and other junk data to free up disk space.

## Service Definition

**Service ID**: `bleachbit_clean`  
**Type**: Maintenance  
**Group**: Cleanup  
**Category**: System Maintenance

### Task Parameters

```javascript
{
  type: "bleachbit",
  cleaners: ["system", "windows.temp", "..."],  // List of cleaners to run
  ui_label: "BleachBit Clean"
}
```

## Python Service (`runner/services/bleach_service.py`)

### Output Structure

```python
{
  "task_type": "bleachbit",
  "status": "success" | "failure",
  "summary": {
    "space_freed_bytes": 2684258234,  # Total bytes freed
    "files_deleted": 1247,            # Number of files removed
    "errors": 0                        # Number of errors encountered
  },
  "ui_label": "BleachBit Clean"
}
```

## Technician View

### Components

- **Header**: "BleachBit Cleanup" with status badge
- **KPI Grid**: 3 metrics in a row
  - Space Freed (GB/MB/KB)
  - Files Deleted (count)
  - Errors (count)

### Example Render

```
╔═══════════════════════════════════════╗
║  BleachBit Cleanup          [SUCCESS] ║
╟───────────────────────────────────────╢
║  🗑️ Space Freed:    2.5 GB           ║
║  📁 Files Deleted:  1,247             ║
║  ⚠️ Errors:        0                 ║
╚═══════════════════════════════════════╝
```

## Customer Metrics

**Icon**: 🧹  
**Label**: "Cleanup"  
**Value**: Space freed (formatted)  
**Detail**: Files deleted count  
**Variant**: `info`

### Example Output

```javascript
{
  icon: "🧹",
  label: "Disk Cleanup",
  value: "2.5 GB",
  detail: "1,247 files removed",
  variant: "info"
}
```

## Test Fixtures

### `success.json`

- Space freed: 2.6 GB (2684354560 bytes)
- Files deleted: 1,247
- Errors: 0

### `minimal_clean.json`

- Space freed: 512 KB (small cleanup)
- Files deleted: 12
- Errors: 0

### `error.json`

- Status: failure
- Error: "BleachBit executable not found"

## Integration

- **Catalog**: Service definition imported from handler
- **Renderer**: `renderBleachbit` replaced by handler's `renderTech`
- **Metrics**: `processDiskCleanup` replaced by handler's `extractCustomerMetrics`

## Dependencies

- **prettyBytes**: Format byte sizes (2684354560 → "2.5 GB")
- **lit-html**: Template rendering
- **common/ui.js**: `renderHeader`, `kpiBox`
- **common/metrics.js**: `buildMetric`

## Notes

- BleachBit must be in `data/programs/` directory
- Safe operation - only removes temporary/cache files
- Space freed calculated from BleachBit's output logs
- Number formatting uses `toLocaleString()` for readability
