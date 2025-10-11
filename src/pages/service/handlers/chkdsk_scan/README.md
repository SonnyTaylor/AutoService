# chkdsk_scan - CHKDSK File System Check

## Overview

The `chkdsk_scan` handler executes Windows CHKDSK utility to scan file systems for errors and report disk usage statistics.

## Service Definition

**Service ID**: `chkdsk_scan`  
**Type**: System diagnostic
**Group**: System Health  
**Category**: File System Integrity

### Task Parameters

```javascript
{
  type: "chkdsk",
  drive: "C:",        // Optional, defaults to C:
  fix_errors: false,  // Run in read-only mode
  ui_label: "CHKDSK Scan"
}
```

## Python Service (`runner/services/chkdsk_service.py`)

### Output Structure

```python
{
  "task_type": "chkdsk",
  "status": "success" | "failure",
  "summary": {
    "return_code": 0,  # 0=clean, 2=errors found, 3=could not check
    "output": "...",   # Full CHKDSK output
    "verdict": "The file system is healthy.",
    "severity": "success" | "warning" | "error"
  },
  "ui_label": "CHKDSK Scan"
}
```

## Technician View

### Components

- **Header**: "CHKDSK File System Check" with status badge
- **Verdict Box**: Overall file system health status
- **Stats**: Total space, used space, free space, bytes per sector
- **Output Section**: Full CHKDSK command output

### Example Render

```
╔═══════════════════════════════════════╗
║ CHKDSK File System Check      SUCCESS ║
╟───────────────────────────────────────╢
║  🎯 Verdict: The file system is       ║
║     healthy. No errors found.         ║
║                                        ║
║  💾 Total Space:     1.0 TB           ║
║  📊 Used:            450 GB (45%)     ║
║  📂 Free:            550 GB (55%)     ║
║  🔧 Bytes/Sector:   4096              ║
║                                        ║
║  📄 Output:                            ║
║  The type of the file system is NTFS. ║
║  Volume label is OS.                  ║
║  ...                                   ║
╚═══════════════════════════════════════╝
```

## Customer Metrics

**Icon**: 💾  
**Label**: "Disk Health"  
**Value**: "Verified" | "Errors Found"  
**Detail**: Verdict message  
**Variant**: `info` (clean) or `warning` (errors)

### Example Outputs

**Clean System**:

```javascript
{
  icon: "💾",
  label: "Disk Health",
  value: "Verified",
  detail: "File system is healthy",
  variant: "info"
}
```

**Errors Found**:

```javascript
{
  icon: "💾",
  label: "Disk Health",
  value: "Errors Found",
  detail: "File system requires repair",
  variant: "warning"
}
```

## Test Fixtures

### `healthy.json`

- Return code: 0
- Verdict: "The file system is healthy"
- Status: success

### `errors_found.json`

- Return code: 2
- Verdict: "Errors found - requires repair"
- Status: success (task completed, but errors detected)

### `error.json`

- Status: failure
- Error: "Access denied - requires elevation"

## Integration

- **Catalog**: Service definition imported from handler
- **Renderer**: `renderCHKDSK` replaced by handler's `renderTech`
- **Metrics**: `processCHKDSKScan` replaced by handler's `extractCustomerMetrics`

## Dependencies

- **prettyBytes**: Format storage sizes
- **lit-html**: Template rendering
- **common/ui.js**: `renderHeader`, `pill`, `kpiBox`
- **common/metrics.js**: `buildMetric`

## Notes

- Requires administrator privileges for write access
- Read-only mode (no /F flag) is safe and non-destructive
- File system must be NTFS, FAT32, or exFAT
- Output parsing extracts disk statistics from CHKDSK text
