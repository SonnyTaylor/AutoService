# kvrt_scan - Kaspersky Virus Scan

## Overview

The `kvrt_scan` handler executes Kaspersky Virus Removal Tool (KVRT) to scan for and remove malware, viruses, trojans, and other threats.

## Service Definition

**Service_id**: `kvrt_scan`  
**Type**: Security scan  
**Group**: Security  
**Category**: Antivirus

### Task Parameters

```javascript
{
  type: "kvrt_scan",
  scan_path: "C:",              // Path to scan
  extended_scan: false,         // Extended scan mode
  scan_archives: true,          // Scan inside archives
  scan_email: false,            // Scan email databases
  ui_label: "Kaspersky Virus Scan"
}
```

## Python Service (`runner/services/kvrt_service.py`)

### Output Structure

```python
{
  "task_type": "kvrt",
  "status": "success" | "failure",
  "summary": {
    "objects_scanned": 125847,       # Total objects scanned
    "threats_found": 5,              # Number of threats detected
    "threats_neutralized": 5,         # Number of threats removed
    "detections": [                   # List of detected threats
      {
        "threat_name": "Trojan-Downloader.Win32.Agent",
        "file_path": "C:\\Path\\To\\File.exe",
        "status": "removed"           # or "quarantined", "skipped"
      }
    ],
    "scan_duration_seconds": 542,
    "config_flags": {
      "extended_scan": true,
      "scan_archives": true,
      "scan_email": false
    }
  },
  "ui_label": "Kaspersky Virus Scan"
}
```

## Technician View

### Components

- **Header**: "Kaspersky Virus Scan" with status badge
- **KPI Grid**: 8 statistics boxes
  - Objects Scanned
  - Threats Found
  - Threats Removed
  - Scan Duration (formatted)
  - Extended Scan (Yes/No pill)
  - Scan Archives (Yes/No pill)
  - Scan Email (Yes/No pill)
- **Detection Table**: Threat name, file path, action taken

### Example Render

```
╔═══════════════════════════════════════╗
║  Kaspersky Virus Scan         [SUCCESS] ║
╟───────────────────────────────────────║
║  📊 Objects Scanned:  125,847        ║
║  ⚠️ Threats Found:    5               ║
║  ✅ Threats Removed:  5               ║
║  ⏱️ Scan Duration:    9:02            ║
║                                        ║
║  🔧 Configuration:                     ║
║  [Extended: No] [Archives: Yes]       ║
║  [Email: No]                           ║
║                                        ║
║  🦠 Detections:                        ║
║  ┌─────────────────────────────────┐  ║
║  │ Trojan-Downloader.Win-█-Exe    │  │  │  ││  ├─────────────────────────────────┤  ║
║  │ Trojan-Spy.Win32-Zbot          │  │
║  │ C:\Path\...\file.scr       │  ║
║  │ Status: [REMOVED]                │  ║
║  └─────────────────────────────────┘  ║
╚═══════════════════════════════════════╝
```

## Customer Metrics

**Icon**: 🦠  
**Label**: "Virus Scan"  
**Value**: "Clean" or threat count  
**Detail**: Threat summary  
**Variant**: `info` (clean) or `success` (threats removed)

### Example Outputs

**Clean System**:

```javascript
{
  icon: "🦠",
  label: "Virus Scan",
  value: "Clean",
  detail: "125,847 objects scanned",
  variant: "info"
}
```

**Threats Found & Removed**:

```javascript
{
  icon: "🦠",
  label: "Virus Scan",
  value: "5 Threats Removed",
  detail: "Trojan, spyware, adware detected and cleaned",
  variant: "success"
}
```

## Test Fixtures

### `clean_system.json`

- Objects scanned: 125,847
- Threats found: 0
- Threats neutralized: 0
- Detections: [] (empty)

### `threats_found.json`

- Objects scanned: 125,847
- Threats found: 5
- Threats neutralized: 5
- Detections: 5 items (Trojan, Adware, Backdoor, Spy, Generic)

### `error.json`

- Status: failure
- Error: "Kaspersky executable not found"

## Integration

- **Catalog**: Service definition imported from handler
- **Renderer**: `renderKVRT` replaced by handler's `renderTech`
- **Metrics**: `processKVRT` replaced by handler's `extractCustomerMetrics`

## Technical Details

### Action Color Variants

```javascript
{
  removed: "success",      // Green
  quarantined: "info",     // Blue
  skipped: "warning",      // Yellow
  failed: "error"          // Red
}
```

### Duration Formatting

```javascript
// Converts seconds to MM:SS format
542 seconds → "9:02"
3665 seconds → "61:05"
```

### Threat Type Extraction

Extracts threat category from threat name:

- `"Trojan-Downloader.Win-..` → "Trojan"
- `"Adware.Win32-..."` → "Adware"
- `"HEUR:..."` → "Heuristic detection"

## Dependencies

- **lit-html**: Template rendering with `map` directive
- **common/ui.js**: `renderHeader`, `kpiBox`, `pill`
- **common/metrics.js**: `buildMetric`

## Notes

- KVRT is a free standalone tool (no installation required)
- Scan duration varies by system size and configuration
- Extended scan takes significantly longer but is more thorough
- Threats are automatically removed or quarantined
- Configuration flags affect scan coverage and duration
- Output parsed from KVRT's log files or XML reports
