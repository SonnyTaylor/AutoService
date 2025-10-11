# adwcleaner_clean - Adware & PUP Removal

## Overview

The `adwcleaner_clean` handler executes AdwCleaner to scan for and remove adware, potentially unwanted programs (PUPs), and browser hijackers.

## Service Definition

**Service_id**: `adwcleaner_clean`  
**Type**: Security scan  
**Group**: Security  
**Category**: Malware Removal

### Task Parameters

```javascript
{
  type: "adwcleaner",
  executable_path: "path/to/AdwCleaner.exe",
  ui_label: "AdwCleaner Scan"
}
```

## Python Service (`runner/services/adwcleaner_service.py`)

### Output Structure

```python
{
  "task_type": "adwcleaner",
  "status": "success" | "failure",
  "summary": {
    "total_cleaned": 23,       # Total items removed
    "reboot_required": true,   # Whether system reboot needed
    "categories": {
      "registry": 8,           # Registry entries cleaned
      "file": 5,               # Files removed
      "folder": 3,             # Folders deleted
      "service": 2,            # Services stopped/removed
      "task": 0,               # Scheduled tasks removed
      "shortcut": 2,           # Shortcuts cleaned
      "dll": 0,                # DLLs unregistered
      "wmi": 0,                # WMI entries removed
      "browser": 3,            # Browser extensions removed
      "preinstalled": 0        # Pre-installed apps removed
    }
  },
  "ui_label": "AdwCleaner Scan"
}
```

## Technician View

### Components

- **Header**: "AdwCleaner Scan" with status badge
- **KPI**: Total items cleaned
- **Status Pills**: Reboot required, configuration flags
- **Category Grid**: 10 category tags showing counts

### Example Render

```
╔═══════════════════════════════════════╗
║  AdwCleaner Scan            [SUCCESS] ║
╟───────────────────────────────────────╠║  🎯 Total Items Cleaned: 23           ║
║                                        ║
║  🔄 Reboot Required                    ║
║                                        ║
║  📦 Items by Type:                     ║
║  [Registry: 8] [Files: 5] [Folders: 3]║
║  [Services: 2] [Shortcuts: 2]         ║
║  [Browser: 3]                          ║
╚═══════════════════════════════════════╝
```

## Customer Metrics

**Icon**: 🛡️  
**Label**: "Adware Scan"  
**Value**: "Clean" or item count  
**Detail**: Category breakdown  
**Variant**: `info` (clean) or `success` (items removed)

### Example Outputs

**Clean System**:

```javascript
{
  icon: "🛡️",
  label: "Adware Scan",
  value: "Clean",
  detail: "No threats detected",
  variant: "info"
}
```

**Threats Removed**:

```javascript
{
  icon: "🛡️",
  label: "Adware Scan",
  value: "23 Items Removed",
  detail: "8 registry, 5 files, 3 folders, 2 services, 2 shortcuts, 3 browser",
  variant: "success"
}
```

## Test Fixtures

### `clean_system.json`

- Total cleaned: 0
- Reboot required: false
- All categories: 0

### `threats_found.json`

- Total cleaned: 23
- Reboot required: true
- Multiple categories with counts

### `error.json`

- Status: failure
- Error: "AdwCleaner executable not found"

## Integration

- **Catalog**: Service definition imported from handler
- **Renderer**: `renderAdwCleaner` replaced by handler's `renderTech`
- **Metrics**: `processAdwCleaner` replaced by handler's `extractCustomerMetrics`

## Dependencies

- **lit-html**: Template rendering
- **common/ui.js**: `renderHeader`, `kpiBox`, `pill`
- **common/metrics.js**: `buildMetric`

## Notes

- AdwCleaner must be in `data/programs/` directory
- Reboot often required to complete removal
- Scans registry, files, services, browser extensions
- Results parsed from AdwCleaner's XML/JSON output
- 10 category types tracked separately
