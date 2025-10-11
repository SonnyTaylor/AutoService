# SFC Scan Handler

**Service ID**: `sfc_scan`  
**Type**: Python backend (Windows System File Checker)  
**Migration Date**: October 11, 2025  
**Complexity**: ⭐⭐ Medium

## Overview

Runs Windows System File Checker (`sfc /scannow`) to verify and repair system file integrity. This built-in Windows utility scans all protected system files and replaces corrupted files with cached copies from `%WinDir%\System32\dllcache`.

## Architecture

### Task Definition

- **ID**: `sfc_scan`
- **Label**: SFC Scan
- **Group**: System Integrity
- **Tool Dependencies**: None (uses built-in Windows command)

### Parameters

No configurable parameters. The scan always runs in full mode (`/scannow`).

## Rendering

### Technician View

Displays integrity status with icon-based visual feedback:

**Icon States**:

- ✅ **Green Checkmark** (`ph-check-circle ok`): No integrity violations found
- ⚠️ **Yellow Warning** (`ph-warning-circle fail`): Violations found
- ❓ **Question Mark** (`ph-question`): Unable to determine status

**Verdict Messages**:

- `"No integrity violations found."` - System is healthy
- `"System file integrity violations were found."` - Issues detected
- `"Scan result could not be determined."` - Parse error or incomplete scan

**Repair Information** (shown if violations detected):

- Shows if repairs were attempted
- Reports success/failure of repairs

**Layout**: Uses `.sfc-layout` flex container with icon on left and details on right.

### Customer View

Shows system file health status as a metric card.

**Metric Variants**:

1. **Healthy (No Violations)**:

   ```javascript
   {
     icon: "🛡️",
     label: "System Files",
     value: "Healthy",
     detail: "No integrity violations found",
     variant: "success"  // Green
   }
   ```

2. **Repaired (Issues Fixed)**:

   ```javascript
   {
     icon: "🛡️",
     label: "System Files",
     value: "Repaired",
     detail: "System file issues found and repaired",
     variant: "info"  // Blue
   }
   ```

3. **Issues Found (Not Repaired)**:
   ```javascript
   {
     icon: "🛡️",
     label: "System Files",
     value: "Issues Found",
     detail: "System file issues detected",
     variant: "warning"  // Yellow
   }
   ```

**Suppression**: If status is unknown or scan failed, returns `null` (hidden from customer).

## Test Fixtures

### 1. `healthy.json` - Clean System

```json
{
  "task_type": "sfc_scan",
  "status": "success",
  "summary": {
    "integrity_violations": false,
    "repairs_attempted": false,
    "repairs_successful": null,
    "message": "Windows Resource Protection did not find any integrity violations."
  },
  "return_code": 0
}
```

**Expected Behavior**:

- Green checkmark icon
- "No integrity violations found" message
- Customer metric: "Healthy" (green success variant)

### 2. `violations_repaired.json` - Issues Fixed

```json
{
  "task_type": "sfc_scan",
  "status": "success",
  "summary": {
    "integrity_violations": true,
    "repairs_attempted": true,
    "repairs_successful": true,
    "message": "Windows Resource Protection found corrupt files and successfully repaired them."
  },
  "return_code": 0
}
```

**Expected Behavior**:

- Yellow warning icon
- "System file integrity violations were found" message
- Repair status: "Repairs were attempted. Result: Success"
- Customer metric: "Repaired" (blue info variant)

### 3. `violations_not_repaired.json` - Issues Persist

```json
{
  "task_type": "sfc_scan",
  "status": "success",
  "summary": {
    "integrity_violations": true,
    "repairs_attempted": true,
    "repairs_successful": false,
    "message": "Windows Resource Protection found corrupt files but was unable to fix some of them."
  },
  "return_code": 0
}
```

**Expected Behavior**:

- Yellow warning icon
- Violations message shown
- Repair status: "Repairs were attempted. Result: Failed"
- Customer metric: "Issues Found" (yellow warning variant)

### 4. `error.json` - Scan Failure

```json
{
  "task_type": "sfc_scan",
  "status": "failure",
  "summary": {
    "error": "sfc command not found in PATH"
  },
  "return_code": 1
}
```

**Expected Behavior**:

- Question mark icon (unknown status)
- "Scan result could not be determined" message
- Customer metric returns `null` (hidden)

## Data Schema

### Result Object

```typescript
{
  task_type: "sfc_scan",
  status: "success" | "failure",
  ui_label: "SFC Scan",
  summary: {
    integrity_violations: boolean | null,  // true = found, false = none, null = unknown
    repairs_attempted: boolean,
    repairs_successful: boolean | null,
    message: string,                       // Parsed output excerpt
    raw_output_preview?: string,           // Last 10 lines for debugging
    stderr?: string                        // Error output if present
  },
  return_code: number
}
```

### Key Fields

- **`integrity_violations`**: Three-state field indicating scan result
  - `false`: Clean system, no issues
  - `true`: Violations found
  - `null`: Unable to determine (parse error, incomplete scan)
- **`repairs_attempted`**: Whether SFC tried to fix issues
- **`repairs_successful`**: Repair outcome (only meaningful if repairs attempted)
- **`message`**: Last 15 lines of parsed output (most relevant information)
- **`return_code`**: Exit code from `sfc /scannow` command

## Implementation Notes

### Python Service Parsing

The Python service handles complex output parsing challenges:

**Encoding Detection**:

- SFC often outputs UTF-16LE on Windows (null bytes between characters)
- Parser attempts UTF-16LE first, then falls back to UTF-8, Latin-1
- Removes null bytes and normalizes whitespace

**Pattern Matching**:
Detects specific phrases to determine status:

- `"did not find any integrity violations"` → No issues
- `"found corrupt files and successfully repaired them"` → Fixed
- `"found corrupt files but was unable to fix some of them"` → Failed to repair
- `"could not perform the requested operation"` → Operation failed

### Icon Component Usage

Uses **Phosphor Icons** (`ph-fill` prefix) for visual indicators:

- `ph-check-circle`: Success checkmark
- `ph-warning-circle`: Warning indicator
- `ph-question`: Unknown status

Icons styled with CSS variants:

- `.ok`: Green color
- `.fail`: Red/yellow color

### Customer Metric Logic

**Always Shows**:

- Healthy systems (good news for customer)
- Systems with violations (transparency about issues)
- Repaired systems (shows work performed)

**Never Shows**:

- Failed scans (no actionable information)
- Unknown status (unreliable data)

This approach balances transparency with avoiding confusion from unreliable data.

### Windows Permission Requirements

**Admin Privileges Required**: SFC scan must run with administrator privileges. The Python service runner handles elevation automatically.

**Component Store Access**: Repairs require access to Windows Component Store (`%WinDir%\WinSxS`). If CBS logs show access denied, user needs to run as admin.

## Migration Notes

### Removed from `catalog.js`

```javascript
// OLD: Lines 250-259
sfc_scan: {
  id: "sfc_scan",
  label: "SFC Scan",
  group: "System Integrity",
  category: "System Integrity",
  toolKeys: [],
  async build() {
    return { type: "sfc_scan", ui_label: "SFC Scan" };
  },
}
```

### Removed from `renderers/tasks.js`

```javascript
// OLD: renderSfc() function (Lines 260-300)
function renderSfc(res, index) {
  // 41 lines of rendering logic
}
```

### Removed from `metrics.js`

```javascript
// OLD: Lines 188-210
function processSFCScan(summary, status) {
  // Processing returns single health string
  return "System files: No issues found";
}
```

**Note**: Legacy metrics only returned a string status. New handler returns full metric card with icon, variant styling, and detailed context.

## Dependencies

### Internal Modules

- `../common/ui.js`: `renderHeader()` for consistent card headers
- `../common/metrics.js`: `buildMetric()` for customer card construction

### External Libraries

- **lit-html**: `html` template tag for rendering
- **Phosphor Icons**: Icon font for status indicators (already loaded globally)

### System Dependencies

- **Windows SFC Utility**: Built-in, available on all Windows systems
- **Administrator Privileges**: Required for scan and repair operations

## Future Enhancements

1. **CBS Log Parsing**: Parse `C:\Windows\Logs\CBS\CBS.log` for detailed corruption info
2. **File-Level Details**: Show which specific files were corrupted/repaired
3. **Scheduled Scans**: Track SFC scan history and recommend periodic checks
4. **Integration with DISM**: Coordinate with DISM health checks for comprehensive integrity verification
5. **Repair Verification**: Offer re-scan after repairs to confirm fix
6. **Component Store Health**: Check Windows Component Store integrity separately
7. **Export CBS Log**: Include CBS.log excerpt in technical report

## Related Services

- **dism_health_check**: Complementary image health verification
- **chkdsk_scan**: File system integrity (SFC focuses on system files only)
- **windows_update**: Keeps component store current for repairs
- **System Integrity Group**: All services verifying Windows installation health

## Troubleshooting

**Common Issues**:

1. **"Unable to determine status"**

   - **Cause**: Scan interrupted or output parsing failed
   - **Fix**: Re-run scan, check CBS logs manually

2. **"Repairs failed"**

   - **Cause**: Component store corrupted or missing files
   - **Fix**: Run DISM /RestoreHealth first, then retry SFC

3. **Scan takes too long**

   - **Cause**: Large Windows installation or slow disk
   - **Expected**: Can take 15-30 minutes on HDD, 5-10 on SSD

4. **Access denied errors**
   - **Cause**: Insufficient privileges
   - **Fix**: Ensure runner executes with admin rights
