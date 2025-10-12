# Windows Update Handler

## Overview

Installs Windows and driver updates using PowerShell's **PSWindowsUpdate** module. The service performs a three-stage process:

1. **Pre-scan**: Queries available updates
2. **Installation**: Installs updates with configurable options
3. **Post-scan**: Checks for remaining updates and reboot requirements

## Service Definition

- **ID**: `windows_update`
- **Label**: Windows Update
- **Group**: System Integrity
- **Category**: System Integrity
- **Tool Dependencies**: None (uses PowerShell)

## Parameters

| Parameter         | Type    | Default | Description                                  |
| ----------------- | ------- | ------- | -------------------------------------------- |
| `microsoftUpdate` | boolean | `true`  | Include Microsoft Update service for drivers |
| `acceptAll`       | boolean | `true`  | Accept all updates without prompting         |
| `ignoreReboot`    | boolean | `true`  | Continue installation without rebooting      |

## Python Handler

**File**: `runner/services/windows_update_service.py`  
**Function**: `run_windows_update(task: Dict[str, Any]) -> Dict[str, Any]`

### Expected Task Payload

```json
{
  "type": "windows_update",
  "microsoft_update": true,
  "accept_all": true,
  "ignore_reboot": true,
  "ui_label": "Windows Update"
}
```

### Return Structure

```json
{
  "task_type": "windows_update",
  "status": "success" | "failure" | "completed_with_errors",
  "summary": {
    "pre_scan": {
      "count_total": 5,
      "count_windows": 3,
      "count_driver": 2,
      "items": [
        {
          "Stage": "available",
          "Title": "Security Update for Windows 11 (KB5012345)",
          "KB": "KB5012345",
          "Size": "150 MB",
          "Category": "Security Updates",
          "Result": null,
          "IsDriver": false
        }
      ]
    },
    "install": {
      "count_installed": 5,
      "count_downloaded": 0,
      "count_failed": 0,
      "count_windows_installed": 3,
      "count_driver_installed": 2,
      "items": [
        {
          "Stage": "installed",
          "Title": "Security Update for Windows 11 (KB5012345)",
          "KB": "KB5012345",
          "Size": "150 MB",
          "Category": "Security Updates",
          "Result": "Installed",
          "IsDriver": false
        }
      ]
    },
    "post_scan": {
      "count_remaining": 0,
      "items": []
    },
    "reboot_required": true,
    "human_readable": {
      "verdict": "updated",
      "notes": ["Installed: 5", "Reboot required"],
      "summary_line": "Installed: 5; Reboot required"
    },
    "meta": {
      "module_available": true,
      "module_version": "2.2.0.3",
      "get_command": "Get-WindowsUpdate",
      "install_command": "Install-WindowsUpdate"
    },
    "timings": {
      "pre_scan_seconds": 15.2,
      "install_seconds": 245.8,
      "post_scan_seconds": 12.5
    },
    "errors": [],
    "exit_code": 0,
    "stderr_excerpt": ""
  }
}
```

## Rendering

### Technician View

Displays comprehensive update information:

- **KPI Dashboard**: Verdict, available, installed, failed, remaining, reboot status
- **Module Info Pills**: PSWindowsUpdate version and available commands
- **Pre-scan Summary**: Breakdown of available updates (Windows vs. drivers)
- **Installation Results**: List of installed updates with:
  - Title, KB article number, size, category
  - Result badge (Installed/Downloaded/Failed)
  - Driver indicator
- **Post-scan Info**: Remaining updates (if any)
- **Notes Pills**: Human-readable summary notes
- **Error Details**: Collapsible error list (if errors occurred)
- **Execution Timings**: Performance metrics for each stage

### Customer Metrics

Shows high-level update installation summary:

- **Icon**: 🔄 (sync/update symbol)
- **Label**: "Updates Installed"
- **Value**: Number of updates installed
- **Detail**: "Reboot required" or "Ready to use"
- **Variant**:
  - `success` if all updates succeeded
  - `warning` if some updates failed
- **Items** (optional):
  - Windows update count
  - Driver update count
  - Failed update count
  - Reboot requirement

**Note**: Metric is only shown if updates were actually installed (count > 0).

## Verdict States

The handler processes the verdict from `human_readable.verdict`:

- **`up-to-date`**: No updates were available (green/ok)
- **`updated`**: Updates were installed successfully (green/ok)
- **`updates-remaining`**: Some updates still need to be installed (blue/info)
- **Error states**: Installation failures (red/fail)

## Status Variants

- **`success`**: All updates installed successfully
- **`completed_with_errors`**: Some updates installed, some failed
- **`failure`**: Critical error (e.g., PSWindowsUpdate module not available)

## Edge Cases

### No Updates Available

If no updates are found during pre-scan:

- Verdict shows "up-to-date"
- Customer metrics are not displayed
- Only pre-scan KPIs shown

### Module Not Available

If PSWindowsUpdate module is missing:

- Status is `failure`
- Error pill displayed: "PSWindowsUpdate module not available"
- Installation cannot proceed

### Partial Failures

If some updates fail during installation:

- Status is `completed_with_errors`
- Failed count displayed in red
- Failed updates shown in installation results
- Customer metric variant is `warning`

### Reboot Required

System reboot detection via:

1. `Get-WURebootStatus` (if available)
2. Registry key checks
3. Pending file operations

Reboot indicator shown in:

- Main KPI row (Required/Not Required)
- Customer metrics items
- Summary notes

## Customer Metrics

The handler extracts customer-friendly metrics covering all scenarios:

### Scenario 1: Updates Installed

- **Icon**: ✅
- **Label**: "System Updated"
- **Value**: Number of installed updates
- **Items**: Windows/driver breakdown, failed updates, reboot status

### Scenario 2: Updates Available but Not Installed

- **Icon**: ⚠️
- **Label**: "Updates Available"
- **Value**: Number of available updates
- **Items**: Windows/driver breakdown
- **Use Case**: When pre-scan found updates but installation didn't complete

### Scenario 3: System Up to Date

- **Icon**: ✅
- **Label**: "System Up to Date"
- **Value**: "Current"
- **Items**: "No updates needed"
- **Use Case**: When no updates were found

### Scenario 4: Status Unclear

- **Icon**: ℹ️
- **Label**: "Windows Updates"
- **Value**: "Checked"
- **Items**: Pending updates if any
- **Use Case**: Fallback for edge cases

All metrics include:

- Reboot requirements (if applicable)
- Failed update counts (if any)
- Remaining updates after reboot (if applicable)

## Testing

### Fixtures

Create test fixtures in `fixtures/`:

- `test_success.json` - All updates installed successfully
- `test_with_errors.json` - Some updates failed
- `test_no_updates.json` - System already up-to-date
- `test_module_missing.json` - PSWindowsUpdate not available
- `test_reboot_required.json` - Updates installed, reboot needed

### Test Locally

```bash
# Run Python handler directly
python runner/service_runner.py runner/fixtures/test_windows_update.json
```

### Integration Test

1. Add service in Builder UI
2. Configure parameters (microsoft_update, accept_all, ignore_reboot)
3. Execute task
4. Verify tech view shows:
   - Update counts
   - Installation details
   - Reboot status
5. Verify customer print shows update summary

## Notes

- **PowerShell Execution**: Uses elevated PowerShell with PSWindowsUpdate module
- **Module Auto-Install**: Handler attempts to install PSWindowsUpdate if missing
- **Long Execution Time**: Windows updates can take several minutes to install
- **Reboot Handling**: `ignore_reboot` parameter prevents automatic restart
- **Driver Updates**: Requires Microsoft Update service registration

## Migration Checklist

- [x] Handler implementation created
- [x] Service definition migrated from catalog.js
- [x] Tech renderer implemented (replaces renderWindowsUpdate)
- [x] Customer metrics extractor implemented (replaces processWindowsUpdate + buildWindowsUpdateMetric)
- [x] Handler registered in handlers/index.js
- [x] Test fixtures created
- [x] Integration tested
- [x] Customer metrics enhanced to show all scenarios:
  - [x] Updates installed successfully
  - [x] Updates available but not installed
  - [x] System up-to-date
  - [x] Reboot required status
  - [x] Failed updates
  - [x] Remaining updates after reboot
- [x] Documentation reviewed
- [x] Migration complete
