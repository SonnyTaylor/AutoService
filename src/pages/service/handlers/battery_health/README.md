# Battery Health Handler

**Service ID**: `battery_health`  
**Type**: Client-only (No Python backend)  
**Migration Date**: January 2025  
**Complexity**: ⭐ Low

## Overview

Displays battery health metrics for laptops and mobile devices. This is a **client-only task** that runs entirely in the frontend using the Tauri `battery` API—no Python runner execution required.

## Architecture

### Task Definition

- **ID**: `battery_health`
- **Label**: Battery Health
- **Group**: Diagnostics
- **Tool Dependencies**: None (uses Tauri runtime APIs)
- **Client-Only Flag**: `_client_only: true` (skips Python runner)

### Parameters

| Parameter | Type   | Default | Description                                      |
| --------- | ------ | ------- | ------------------------------------------------ |
| `source`  | string | `auto`  | Data source: `auto`, `cache`, or `live` (unused) |

**Note**: The `source` parameter is currently unused and exists for future extensibility. Battery data always fetches live from Tauri API.

## Rendering

### Technician View

Displays 4 key performance indicators in a horizontal row:

1. **Batteries**: Total battery count detected
2. **Avg SOH**: Average State of Health percentage
3. **Low Health**: Count of batteries below 80% SOH threshold
4. **Verdict**: Overall health status
   - `"Pass"` (green) if all batteries ≥ 80% SOH
   - `"Fail"` (red) if any battery < 80% SOH

**Layout**: Uses `kpi-row` CSS grid for even spacing.

### Customer View

**Conditional Display**: Only appears in customer report if issues detected.

**Conditions for Display**:

- `lowHealthBatteries > 0` (any battery below 80% SOH)
- **OR** `avgSoh < 80` (fleet average unhealthy)

**Metric Card**:

- **Icon**: 🔋 (battery emoji)
- **Label**: Battery Health
- **Value**: `"Needs Attention"` (fixed warning message)
- **Detail**: Descriptive explanation (e.g., "1 battery below 80% health")
- **Variant**: `info` (blue styling)

**Example Output**:

```javascript
{
  icon: "🔋",
  label: "Battery Health",
  value: "Needs Attention",
  detail: "1 battery below 80% health",
  variant: "info"
}
```

**Suppression**: If all batteries are healthy (≥80% SOH), returns `null` to hide from customer report.

## Test Fixtures

### 1. `success.json` - Healthy Battery

```json
{
  "status": "success",
  "summary": {
    "count_batteries": 1,
    "average_soh_percent": 95,
    "low_health_batteries": 0,
    "human_readable": {
      "verdict": "Pass"
    }
  }
}
```

**Expected Behavior**:

- All KPIs show healthy metrics
- Verdict displays `"Pass"` with default styling
- Customer metrics returns `null` (not displayed)

### 2. `low_health.json` - Degraded Battery

```json
{
  "status": "warning",
  "summary": {
    "count_batteries": 1,
    "average_soh_percent": 72,
    "low_health_batteries": 1,
    "human_readable": {
      "verdict": "Fail"
    }
  }
}
```

**Expected Behavior**:

- Avg SOH shows 72%
- Low Health shows 1
- Verdict displays `"Fail"` with red `fail` variant styling
- Customer metrics displays warning card

### 3. `no_battery.json` - No Battery Detected

```json
{
  "status": "error",
  "summary": {
    "count_batteries": 0,
    "average_soh_percent": null,
    "low_health_batteries": 0,
    "human_readable": {
      "verdict": "No battery detected"
    }
  }
}
```

**Expected Behavior**:

- Batteries shows 0
- Avg SOH shows `"-"` (null value)
- Verdict shows descriptive message
- Customer metrics returns `null` (no actionable data)

### 4. `error.json` - System Error

```json
{
  "status": "error",
  "summary": {
    "error": "Failed to query battery API"
  }
}
```

**Expected Behavior**:

- All KPIs show `"-"` (missing data)
- Verdict shows `"-"`
- Customer metrics returns `null`

## Data Schema

### Result Object

```typescript
{
  task_type: "battery_health",
  status: "success" | "warning" | "error",
  ui_label: "Battery Health",
  summary: {
    count_batteries: number,
    average_soh_percent: number | null,
    low_health_batteries: number,
    human_readable?: {
      verdict: string
    }
  }
}
```

### Key Fields

- **`count_batteries`**: Total batteries detected (0 for desktops)
- **`average_soh_percent`**: Average State of Health across all batteries (0-100)
- **`low_health_batteries`**: Count of batteries with SOH < 80%
- **`human_readable.verdict`**: Human-friendly assessment string

## Implementation Notes

### Client-Only Execution

The `_client_only: true` flag in the task definition prevents the Python runner from attempting execution. Instead, the frontend handles battery queries directly:

1. User initiates task from builder
2. Runner page detects `_client_only` flag
3. Frontend calls `window.__TAURI__.invoke('get_battery_info')`
4. Results displayed immediately without runner overhead

### Health Threshold Logic

**80% SOH threshold** is the industry-standard cutoff for battery replacement recommendations:

- **≥80% SOH**: Battery retains acceptable capacity
- **<80% SOH**: Significant degradation, consider replacement

### Null Handling

- Missing or `null` values display as `"-"` in technician view
- Customer metrics gracefully handle missing data by returning `null`
- Errors suppress all metrics to avoid misleading information

### Conditional Customer Display

Unlike most services that always appear in customer reports, battery health only shows when actionable:

- **Hidden**: Desktop systems with no batteries
- **Hidden**: All batteries healthy (nothing to report)
- **Shown**: Any battery degraded (customer needs awareness)

This prevents cluttering customer reports with non-issues.

## Migration Notes

### Removed from `catalog.js`

```javascript
// OLD: Lines 110-125
battery_health: {
  id: "battery_health",
  label: "Battery Health",
  // ...
}
```

### Removed from `renderers/tasks.js`

```javascript
// OLD: renderBatteryHealth() function (Lines 257-283)
function renderBatteryHealth(res, index) {
  // 27 lines of rendering logic
}
```

### Removed from `metrics.js`

No legacy processing—battery health was already client-side only and didn't have dedicated customer metric extraction. The new handler provides more sophisticated conditional logic.

## Dependencies

### Internal Modules

- `../common/ui.js`: `renderHeader()`, `kpiBox()` helper functions
- `../common/metrics.js`: `buildMetric()` for customer card construction

### External Libraries

- **lit-html**: `html` template tag for rendering

### Tauri APIs (Future)

Currently unused, but handler is designed to integrate with:

- `window.__TAURI__.invoke('get_battery_info')` for live battery queries

## Future Enhancements

1. **Multi-Battery Support**: Enhanced display for systems with multiple batteries (laptops with extended batteries)
2. **Historical Tracking**: Store SOH values over time to show degradation trends
3. **Charging Cycle Metrics**: Display charge/discharge cycle count
4. **Temperature Monitoring**: Warn if battery temperature exceeds safe thresholds
5. **Calibration Recommendations**: Suggest calibration schedules based on usage patterns

## Related Services

- **System Info**: Also queries battery data for overview page
- **Power Report**: Could integrate for comprehensive power diagnostics
- **Stress Testing**: Battery drain during load tests could inform health assessment
