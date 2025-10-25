# Sentry Integration for AutoService Python Runner

## Overview

The AutoService Python runner now includes comprehensive Sentry error tracking and performance monitoring. All Sentry-related code is cleanly separated in `sentry_config.py` for easy maintenance.

## Features

### ✅ Implemented

- **Error Tracking**: All exceptions during task execution are automatically captured with full context
- **Performance Monitoring**: Each task execution is tracked as a Sentry transaction with timing data
- **Rich Context**: System information (OS, CPU, memory, disks, Python version, etc.) is automatically attached to all events
- **Task Fingerprinting**: Errors from different services (e.g., ping_test vs battery_health_report) are grouped separately in Sentry
- **Breadcrumbs**: Detailed trail of events leading up to errors for easier debugging
- **Environment Detection**: Automatically detects development vs production based on build path
- **Easy Toggle**: Single `SENTRY_ENABLED` flag to enable/disable all tracking

### System Context Collected

Every error and performance event includes:
- **OS**: Name, version, release, platform, architecture, processor
- **Python**: Version, implementation, compiler, build info
- **User**: Hostname, username
- **CPU**: Physical/logical core count, usage percentage, frequency
- **Memory**: Total, available, used (in GB), percentage used
- **Disks**: All partitions with total, used, free space and usage percentage
- **Process**: PID, parent PID, working directory, executable path, memory usage

## Configuration

### Enable/Disable Sentry

Edit `runner/sentry_config.py` and change the flag at the top:

```python
# Set to False to disable all Sentry tracking
SENTRY_ENABLED = True
```

### Environment Detection

Sentry automatically detects the environment:

1. Checks `AUTOSERVICE_ENV` environment variable (highest priority)
2. Checks executable path:
   - Contains `target/debug` → development
   - Contains `target/release` or `dist` → production
3. Defaults to `development` if uncertain

Override by setting environment variable:
```powershell
$env:AUTOSERVICE_ENV = "production"
```

### DSN Configuration

The Sentry DSN is hardcoded in `sentry_config.py`:
```python
SENTRY_DSN = "https://50870527bd92f4631d029e6881e76daf@o4510235877769216.ingest.us.sentry.io/4510250131324928"
```

## Error Grouping

Errors from different task types are automatically grouped separately in Sentry using custom fingerprinting. This means:

- ❌ **Before**: All task errors mixed together
- ✅ **After**: Separate issue groups for each task type (ping_test, battery_health_report, etc.)

The fingerprint is set based on: `[task_type, exception_class_name]`

## Usage in Code

### Capturing Exceptions

```python
from sentry_config import capture_task_exception

try:
    result = some_task_operation()
except Exception as e:
    capture_task_exception(
        e,
        task_type="ping_test",
        task_data={"host": "8.8.8.8", "count": 4},
        extra_context={"additional": "context"}
    )
```

### Creating Performance Spans

```python
from sentry_config import create_task_span

with create_task_span("ping_test", 0, 5, task_data) as span:
    if span:
        span.set_tag("host", "8.8.8.8")
    result = run_ping_test(task_data)
```

### Adding Breadcrumbs

```python
from sentry_config import add_breadcrumb

add_breadcrumb(
    "Starting network test",
    category="task",
    level="info",
    host="8.8.8.8"
)
```

## Testing

To verify Sentry integration is working:

1. Run any service with an intentional error
2. Check your Sentry dashboard at https://sentry.io
3. Verify:
   - Error events are appearing
   - System context is attached
   - Performance transactions are recorded
   - Different task types are grouped separately

## Dependencies

Added to `requirements.txt`:
- `sentry-sdk>=2.0.0,<3.0.0` - Sentry Python SDK
- `psutil>=5.9.0` - For system information collection

## Files Modified

- ✅ **Created**: `runner/sentry_config.py` - All Sentry configuration and utilities
- ✅ **Modified**: `runner/service_runner.py` - Integrated Sentry tracking into task execution
- ✅ **Modified**: `runner/requirements.txt` - Added dependencies

## Future Enhancements

Potential improvements (not implemented):

- Read `SENTRY_ENABLED` from `app_settings.json` for runtime configuration
- Per-service error rate tracking and alerts
- Custom performance metrics for specific operations
- User feedback integration
- Sample rate configuration based on environment

