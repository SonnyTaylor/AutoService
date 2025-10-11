# dism_health_check Handler

## Overview

The `dism_health_check` handler provides Windows Image Health diagnostics using DISM (Deployment Image Servicing and Management). It runs a sequence of health checks and can automatically repair corruption in the Windows component store.

## Service Definition

**Service ID**: `dism_health_check`  
**Display Name**: DISM Health Check  
**Category**: System Integrity  
**Group**: System Integrity

### Required Tools

None - DISM is a built-in Windows utility.

### Task Parameters

```javascript
{
  type: "dism_health_check",
  actions: ["checkhealth", "scanhealth", "restorehealth"],  // Optional, default: ["checkhealth"]
  ui_label: "DISM Health Check"  // Optional
}
```

**Actions**:

- `checkhealth` - Quick check to see if corruption exists
- `scanhealth` - Thorough scan for corruption
- `restorehealth` - Attempt to repair detected corruption

## Python Service (`runner/services/dism_service.py`)

### Task Execution Flow

1. **CheckHealth**: Quick check for corruption markers
2. **ScanHealth**: Deep scan of component store (if requested)
3. **RestoreHealth**: Automatic repair using Windows Update (if requested)

### Output Structure

```python
{
  "task_type": "dism_health_check",
  "status": "success" | "failure",
  "summary": {
    "steps": [
      {
        "action": "checkhealth",
        "return_code": 0,
        "parsed": {
          "health_state": "healthy" | "repairable" | "unrepairable",
          "message": "No component store corruption detected."
        },
        "stderr": "",
        "command": ["dism", "/Online", "/Cleanup-Image", "/CheckHealth"]
      },
      {
        "action": "scanhealth",
        "return_code": 0,
        "parsed": {
          "health_state": "healthy",
          "message": "The component store is healthy."
        },
        "stderr": "",
        "command": ["dism", "/Online", "/Cleanup-Image", "/ScanHealth"]
      },
      {
        "action": "restorehealth",
        "return_code": 0,
        "parsed": {
          "health_state": "healthy",
          "message": "The restore operation completed successfully.",
          "repair_success": true
        },
        "stderr": "",
        "command": ["dism", "/Online", "/Cleanup-Image", "/RestoreHealth"]
      }
    ]
  }
}
```

### Key Features

- **Sequential Execution**: Runs actions in specified order
- **State Detection**: Parses DISM output to determine health state
- **Repair Tracking**: Monitors RestoreHealth success/failure
- **Error Handling**: Captures failures at each step

## Technician View Renderer

### Display Components

1. **Header**: "Windows Image Health (DISM)" with status badge
2. **KPI Grid** (4 boxes):
   - **Verdict**: Overall health assessment (Healthy/Repaired/Corruption Found/Scan Failed)
   - **CheckHealth**: Health state (Healthy/Corrupt/N/A)
   - **ScanHealth**: Health state (Healthy/Corrupt/N/A)
   - **RestoreHealth**: Repair status (Success/Repaired/Failed/N/A)

### Visual Design

```
╔═══════════════════════════════════════════════════╗
║ Windows Image Health (DISM)          [SUCCESS]   ║
╠═══════════════════════════════════════════════════╣
║ [  Verdict  ] [CheckHealth] [ScanHealth]         ║
║    Healthy       Healthy       Healthy            ║
║                                                    ║
║ [RestoreHealth]                                   ║
║     Success                                       ║
╚═══════════════════════════════════════════════════╝
```

### Verdict Logic

```javascript
if (checkHealth + scanHealth both "healthy") {
  verdict = "Healthy"
} else if (checkHealth or scanHealth "repairable") {
  if (restoreHealth message includes "completed successfully") {
    verdict = "Repaired"
  } else {
    verdict = "Corruption Found"
  }
} else if (status === "fail") {
  verdict = "Scan Failed"
}
```

## Customer Metrics Extraction

### Metric Card Output

**Icon**: ✅  
**Label**: "System Health"  
**Value**: "Verified"  
**Detail**: Health status message  
**Variant**: `info`

### Example Outputs

**Healthy System**:

```javascript
{
  icon: "✅",
  label: "System Health",
  value: "Verified",
  detail: "Windows image: Healthy",
  variant: "info"
}
```

**Repaired System**:

```javascript
{
  icon: "✅",
  label: "System Health",
  value: "Verified",
  detail: "Windows image: Repaired",
  variant: "info"
}
```

**Corruption Detected**:

```javascript
{
  icon: "✅",
  label: "System Health",
  value: "Verified",
  detail: "Windows image: Corruption found",
  variant: "info"
}
```

## Test Fixtures

### Fixture: `healthy.json` - Clean System

```json
{
  "tasks": [
    {
      "type": "dism_health_check",
      "actions": ["checkhealth", "scanhealth"]
    }
  ]
}
```

**Expected Result**: All checks return "healthy" state, verdict shows "Healthy".

### Fixture: `healthy_result.json` - Sample Success Output

Complete result structure showing healthy component store across all checks.

### Fixture: `repairable.json` - Corruption Detected

**Expected Result**: CheckHealth shows "repairable", RestoreHealth attempts repair.

### Fixture: `repairable_result.json` - Repair Success Output

Shows corruption detected and successfully repaired.

### Fixture: `repair_failed.json` - Repair Unsuccessful

**Expected Result**: Corruption detected but RestoreHealth fails, verdict shows "Corruption Found".

## Data Processing Logic

### Health State Parsing

DISM output is parsed to extract health state from text:

- `"No component store corruption detected"` → `healthy`
- `"The component store is repairable"` → `repairable`
- `"Component store corruption detected"` → `repairable`

### Repair Success Detection

RestoreHealth success determined by:

```javascript
restoreHealth?.message
  ?.toLowerCase()
  .includes("operation completed successfully");
```

## Edge Cases

### Insufficient Permissions

DISM requires administrator privileges. If run without elevation:

```javascript
status: "failure",
summary: { error: "Access denied" }
```

### Network Issues (RestoreHealth)

RestoreHealth downloads repair files from Windows Update:

- May fail if offline or firewall blocks Windows Update
- Error message includes "Unable to download files"

### Component Store Locked

If Windows Update or another process is using the component store:

- DISM returns error code
- Status shows "failure" with error message

## Integration Points

### Catalog Integration (`catalog.js`)

Legacy definition **removed**. Handler imported via:

```javascript
import { getServiceDefinitions } from "./handlers/index.js";
```

### Renderer Integration (`renderers/tasks.js`)

Legacy `renderDism` function **removed**. Handler renderer imported via:

```javascript
import { getTechRenderers } from "../handlers/index.js";
```

### Metrics Integration (`metrics.js`)

Legacy `processDISMHealthCheck` function **removed**. Handler extractor called via:

```javascript
const extractors = getCustomerMetricExtractors();
const metrics = extractors[task_type]?.({ result });
```

## Testing Instructions

### Manual Testing

1. **Navigate to Service → Run**
2. **Add "DISM Health Check"** from catalog
3. **Configure actions** (default: all three)
4. **Execute the service** (requires admin rights)
5. **Verify technician view**:
   - Verdict matches health state
   - All requested steps show results
   - KPI formatting correct
6. **Check customer print**:
   - "System Health" metric appears
   - Message reflects actual state

### Fixture Testing

```powershell
# Test with various scenarios
python runner/service_runner.py src/pages/service/handlers/dism_health_check/fixtures/healthy.json
python runner/service_runner.py src/pages/service/handlers/dism_health_check/fixtures/repairable.json
```

### Expected Execution Time

- **CheckHealth**: ~5 seconds (quick scan)
- **ScanHealth**: 5-15 minutes (thorough scan)
- **RestoreHealth**: 10-30 minutes (repair + Windows Update download)

## Dependencies

### Frontend

- **lit-html**: Template rendering
- **common/ui.js**: `renderHeader`, `kpiBox` components
- **common/metrics.js**: `buildMetric` helper

### Backend

- **DISM**: Windows built-in utility (C:\Windows\System32\dism.exe)
- **Windows Update**: For RestoreHealth component downloads
- **Administrator rights**: Required for all DISM operations

## Known Limitations

1. **Admin Required**: Cannot run without elevation
2. **Long Duration**: ScanHealth/RestoreHealth can take 10-30 minutes
3. **Network Dependent**: RestoreHealth requires Windows Update access
4. **Component Store Lock**: Fails if Windows Update running simultaneously
5. **Windows 7+**: DISM health commands introduced in Windows 7

## Migration Notes

### What Was Migrated

✅ Service definition from `catalog.js`  
✅ Tech renderer `renderDism` from `tasks.js`  
✅ Customer metrics `processDISMHealthCheck` from `metrics.js`

### What Changed

- **Signature**: Renderer receives `{ result, index }` instead of `(result, index)`
- **Extractor Signature**: Receives `{ result }` instead of `(summary, status)`
- **Metric Building**: Uses `buildMetric` helper for consistency
- **Location**: All code in single handler file

### Backward Compatibility

Maintained through signature wrapping in `handlers/index.js`.

## Future Enhancements

### Possible Improvements

1. **Progress Streaming**: Show DISM progress percentage during long scans
2. **Component Details**: Parse and display specific corrupted components
3. **Offline Source**: Support offline repair using install media
4. **Skip Downloaded**: Add `/LimitAccess` flag option
5. **Log Export**: Save full DISM.log for detailed troubleshooting
6. **Scheduling**: Option to schedule repair for next boot if system busy

## References

- **DISM Documentation**: https://docs.microsoft.com/en-us/windows-hardware/manufacture/desktop/dism-image-management-command-line-options-s6
- **Component Store**: https://docs.microsoft.com/en-us/windows-hardware/manufacture/desktop/manage-the-component-store
- **Handler Migration Guide**: `docs/HANDLER_MIGRATION_GUIDE.md`
