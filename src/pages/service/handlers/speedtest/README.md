# Speedtest Handler

**Service ID**: `speedtest`  
**Type**: Python backend (speedtest-cli)  
**Migration Date**: October 11, 2025  
**Complexity**: ⭐⭐ Medium

## Overview

Tests internet connection speed by measuring download/upload bandwidth and latency using Speedtest.net via the `speedtest-cli` Python library.

## Architecture

### Task Definition

- **ID**: `speedtest`
- **Label**: Internet Speed Test
- **Group**: Network
- **Tool Dependencies**: None (uses Python speedtest-cli package)

### Parameters

| Parameter       | Type    | Default | Description                                  |
| --------------- | ------- | ------- | -------------------------------------------- |
| `threads`       | int     | `null`  | Number of threads for download/upload (auto) |
| `share`         | boolean | `false` | Upload result image and include share URL    |
| `secure`        | boolean | `true`  | Use HTTPS endpoints                          |
| `skip_download` | boolean | `false` | Skip download test (backend only)            |
| `skip_upload`   | boolean | `false` | Skip upload test (backend only)              |
| `servers`       | array   | `[]`    | Server IDs to consider (backend only)        |

**Note**: Most parameters are backend-only. The UI currently only exposes basic execution without advanced options.

## Rendering

### Technician View

Displays performance metrics and visualization:

**4 KPI Grid**:

1. **Download**: Download speed in Mbps
2. **Upload**: Upload speed in Mbps
3. **Ping**: Latency in milliseconds
4. **Verdict**: Overall quality rating (excellent/good/fair/poor)

**Bar Chart**: Vertical bar chart showing download and upload speeds

- Download: Blue bar (#4f8cff)
- Upload: Green bar (#8bd17c)
- Data labels on top of bars
- Y-axis: Speed in Mbps
- Height: 220px with responsive breakpoint

**Metadata Section** (if available):

- ISP name
- Server description (name, sponsor, country)
- Test timestamp

**Notes Pills**: Dynamic pills showing performance issues

- Excellent/great: Green (ok variant)
- Moderate/average: Yellow (warn variant)
- Unstable/issue/poor: Red (fail variant)
- Default: Blue (info variant)

### Customer View

Shows internet speed performance as single metric card.

**Metric Card**:

- **Icon**: 🌐 (globe emoji)
- **Label**: Internet Speed
- **Value**: Download speed in Mbps
- **Detail**: "Download speed"
- **Variant**: `info` (blue styling)
- **Items**: Download, Upload, Ping, Quality verdict
- **keepAllItems**: `true` (shows all details)

**Example Output**:

```javascript
{
  icon: "🌐",
  label: "Internet Speed",
  value: "125.4 Mbps",
  detail: "Download speed",
  variant: "info",
  items: [
    "Download: 125.4 Mbps",
    "Upload: 45.2 Mbps",
    "Ping: 18 ms",
    "Quality: excellent"
  ],
  keepAllItems: true
}
```

## Test Fixtures

### 1. `success.json` - Excellent Speed

```json
{
  "task_type": "speedtest",
  "status": "success",
  "summary": {
    "duration_seconds": 45.2,
    "results": {
      "download": 125400000.0,
      "upload": 45200000.0,
      "ping": 18.5,
      "timestamp": "2025-10-11T10:30:00Z",
      "server": {
        "name": "New York",
        "sponsor": "Speedtest",
        "country": "US"
      },
      "client": {
        "isp": "Example ISP"
      }
    },
    "human_readable": {
      "download_mbps": 125.4,
      "upload_mbps": 45.2,
      "ping_ms": 18.5,
      "jitter_ms": 2.1,
      "server_description": "New York, Speedtest, US",
      "isp": "Example ISP",
      "verdict": "excellent",
      "notes": [],
      "score": 100.0,
      "rating_stars": 5
    }
  }
}
```

**Expected Behavior**:

- Download: 125.4 Mbps
- Upload: 45.2 Mbps
- Ping: 18.5 ms
- Verdict: "Excellent" with green (ok) styling
- Chart shows both bars at appropriate heights
- Metadata shows ISP, server, timestamp

### 2. `moderate.json` - Fair Speed with Issues

```json
{
  "task_type": "speedtest",
  "status": "success",
  "summary": {
    "human_readable": {
      "download_mbps": 15.2,
      "upload_mbps": 3.8,
      "ping_ms": 65.0,
      "server_description": "Chicago, Test Server, US",
      "isp": "Slow ISP",
      "verdict": "fair",
      "notes": ["moderate download 15.2 Mbps", "elevated ping 65 ms"],
      "score": 60.0,
      "rating_stars": 3
    }
  }
}
```

**Expected Behavior**:

- Verdict: "Fair" with yellow (warn) styling
- Note pills show issues in yellow/red
- Chart displays smaller bars
- Customer metric still displays (not hidden)

### 3. `slow.json` - Poor Connection

```json
{
  "task_type": "speedtest",
  "status": "success",
  "summary": {
    "human_readable": {
      "download_mbps": 5.1,
      "upload_mbps": 1.2,
      "ping_ms": 150.0,
      "verdict": "poor",
      "notes": [
        "slow download 5.1 Mbps",
        "slow upload 1.2 Mbps",
        "high ping 150 ms"
      ],
      "score": 15.0,
      "rating_stars": 1
    }
  }
}
```

**Expected Behavior**:

- Verdict: "Poor" with red (fail) styling
- Multiple red note pills
- Chart shows very small bars
- Customer sees concerning metric

### 4. `error.json` - Test Failure

```json
{
  "task_type": "speedtest",
  "status": "failure",
  "summary": {
    "reason": "Exception during speedtest execution",
    "error": "Network unreachable"
  }
}
```

**Expected Behavior**:

- No chart displayed
- All KPIs show "-"
- Error status header
- Customer metrics returns `null` (hidden)

## Data Schema

### Result Object

```typescript
{
  task_type: "speedtest",
  status: "success" | "failure",
  ui_label: "Internet Speed Test",
  summary: {
    duration_seconds: number,
    results: {
      download: number,      // bits per second
      upload: number,        // bits per second
      ping: number,          // milliseconds
      timestamp: string,     // ISO 8601
      server: {
        name: string,
        sponsor: string,
        country: string
      },
      client: {
        isp: string
      }
    },
    human_readable: {
      download_mbps: number,
      upload_mbps: number,
      ping_ms: number,
      jitter_ms?: number,
      server_description: string,
      isp: string,
      verdict: "excellent" | "good" | "fair" | "poor",
      notes: string[],
      score: number,         // 0-100
      rating_stars: number   // 1-5
    },
    share_url?: string
  }
}
```

### Key Fields

- **`results`**: Raw speedtest-cli output with bits-per-second values
- **`human_readable`**: Converted values in Mbps for display
- **`verdict`**: Calculated quality assessment based on thresholds
- **`score`**: Numeric performance score (100 = perfect, 0 = unusable)
- **`rating_stars`**: 1-5 star rating derived from score
- **`notes`**: Array of performance issues detected during analysis

## Implementation Notes

### Scoring Algorithm

The Python service calculates a score starting at 100 and deducts points:

**Ping Penalties**:

- > 100ms: -20 points, note "high ping"
- 50-100ms: -10 points, note "elevated ping"

**Download Penalties**:

- <10 Mbps: -40 points, note "slow download"
- 10-25 Mbps: -20 points, note "moderate download"

**Upload Penalties**:

- <5 Mbps: -25 points, note "slow upload"

**Verdict Thresholds**:

- ≥85: excellent
- 70-84: good
- 50-69: fair
- <50: poor

### Chart Configuration

- **Type**: Vertical bar chart (ApexCharts)
- **Distribution**: Distributed colors (different color per bar)
- **Data Labels**: Positioned above bars with Mbps suffix
- **Responsive**: Reduces height on mobile (<1000px breakpoint)
- **Theme**: Dark mode with custom grid colors (#2a3140)

### Note Pill Styling

Pills use sentiment analysis on note text:

- "excellent", "great" → green
- "unstable", "issue", "poor" → red
- "moderate", "average" → yellow
- Default → blue

### Customer Metric Always Shows

Unlike some services that hide metrics when healthy, speedtest always displays results if successful (even for poor speeds). This is intentional - customers paid for internet service and deserve to see what they're getting.

## Migration Notes

### Removed from `catalog.js`

```javascript
// OLD: Lines 82-107
speedtest: {
  id: "speedtest",
  label: "Internet Speed Test",
  // ...
}
```

### Removed from `renderers/tasks.js`

```javascript
// OLD: renderSpeedtest() function (Lines 71-254)
function renderSpeedtest(res, index) {
  // 184 lines of rendering logic
}
```

### Removed from `metrics.js`

```javascript
// OLD: Lines 344-355
function processSpeedTest(summary, status) {
  // Processing logic
}

// OLD: Lines 623-651
function buildSpeedTestMetric(speedTestResults) {
  // Metric card construction
}
```

## Dependencies

### Internal Modules

- `../common/ui.js`: `renderHeader()`, `kpiBox()`, `pill()` UI components
- `../common/metrics.js`: `buildMetric()` for customer card construction

### External Libraries

- **ApexCharts**: Chart visualization library for bar chart
- **lit-html**: `html` template tag for rendering

### Python Dependencies

- **speedtest-cli**: `pip install speedtest-cli` (handled by runner environment)

## Future Enhancements

1. **Historical Tracking**: Store speed test results over time to show trends
2. **Server Selection**: UI for choosing specific test servers
3. **Advanced Options**: Expose threads, secure, share parameters in UI
4. **Quality Monitoring**: Alert when speeds drop below expected thresholds
5. **ISP Comparison**: Compare results against advertised speeds from ISP
6. **Jitter Visualization**: Display jitter/stability metrics more prominently
7. **Multi-Server Tests**: Run tests against multiple servers and compare
8. **Share URLs**: Display and copy share URLs when enabled

## Related Services

- **ping_test**: Complementary latency testing to specific hosts
- **iperf_test**: Advanced network throughput testing with custom servers
- **Network diagnostics**: Could integrate with DNS, traceroute analysis
