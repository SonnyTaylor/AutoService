# Ping Test Handler

## Overview

Tests network connectivity and latency to a specified host by sending ICMP ping packets and measuring response times. Provides detailed metrics including average latency, packet loss, stability score, and jitter.

## Service Definition

- **ID**: `ping_test`
- **Label**: Ping Test
- **Group**: Network
- **Category**: Network

## Parameters

| Parameter | Type   | Default | Description                                  |
| --------- | ------ | ------- | -------------------------------------------- |
| host      | string | ""      | Host to ping (loaded from settings if empty) |
| count     | number | 4       | Number of ping packets to send               |

## Tool Dependencies

None - uses built-in Windows `ping` command.

## Python Handler

This service is handled by `runner/services/ping_service.py` with the function `run_ping_test(task)`.

### Expected Task Payload

```json
{
  "type": "ping_test",
  "host": "google.com",
  "count": 4,
  "ui_label": "Ping Test (google.com, 4x)"
}
```

### Expected Result Structure

```json
{
  "status": "success",
  "summary": {
    "host": "google.com",
    "latency_ms": {
      "avg": 15.5,
      "min": 12.0,
      "max": 20.0
    },
    "packets": {
      "sent": 4,
      "received": 4,
      "loss_percent": 0
    },
    "interval_stats": {
      "stdev": 2.5
    },
    "human_readable": {
      "stability_score": 95.0
    }
  },
  "ui_label": "Ping Test (google.com, 4x)"
}
```

## Rendering

### Technician View

The technician view shows:

- **KPI Metrics**:
  - Average Latency (ms)
  - Packet Loss (%)
  - Stability Score (0-100)
  - Jitter/Standard Deviation (ms)
- **Latency Visualization**: Horizontal bar chart with color-coded zones
  - Green (Excellent): < 30ms
  - Blue (Good): 30-60ms
  - Brown (Fair): 60-100ms
  - Red (Poor): > 100ms

### Customer Metrics

Customer reports include:

- **Network Latency Card**: Shows ping response time
  - Icon: 📡
  - Value: Average latency in milliseconds
  - Detail: Host being pinged
  - Variant: "success" if < 30ms, "info" if < 100ms, "warning" if higher
  - Items: Packet loss percentage (if any)

## Testing

Test fixtures are available in `fixtures/` directory:

- `test_success.json` - Successful ping with good latency
- `test_warning.json` - High latency warning
- `test_packet_loss.json` - Packet loss detected
- `test_error.json` - Ping failed (host unreachable)

## Notes

### Latency Classification

- **Excellent**: < 30ms (Gaming/Real-time OK)
- **Good**: 30-60ms (General use OK)
- **Fair**: 60-100ms (Noticeable delay)
- **Poor**: > 100ms (Significant lag)

### Stability Score

The stability score is calculated based on:

- Consistency of response times
- Packet loss percentage
- Jitter (standard deviation)

Score ranges:

- 85-100: Excellent stability
- 70-84: Good stability
- 50-69: Fair stability (warnings)
- < 50: Poor stability (issues detected)

### Default Host

If no host is specified, the service loads the default ping host from app settings (`settings.network.ping_host`), falling back to `google.com`.

## Migration Checklist

- [x] Service definition migrated from catalog.js
- [x] Tech renderer migrated from renderers/tasks.js
- [x] Customer metrics migrated from print/metrics.js
- [x] Handler registered in handlers/index.js
- [x] Integration points updated
- [x] Old code removed from original locations
- [x] Documentation created
- [ ] Test fixtures created
- [ ] Tests validated through UI workflow
