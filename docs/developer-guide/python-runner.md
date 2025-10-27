# Python Runner

The Python service runner executes maintenance and diagnostic tasks asynchronously.

## Overview

The Python runner (`runner/service_runner.py`) is responsible for:

- Parsing task definitions (from JSON)
- Executing tasks sequentially
- Streaming progress to stderr
- Generating final reports
- Handling errors and timeouts

## Running the Service Runner

### Direct Execution

```powershell
python runner/service_runner.py runner/fixtures/test_bleachbit.json
```

### With Output File

```powershell
python runner/service_runner.py runner/fixtures/test_bleachbit.json --output-file data/reports/result.json
```

### Command-Line Help

```powershell
python runner/service_runner.py --help
```

## Input Format

Services are defined as JSON tasks:

```json
{
  "tasks": [
    {
      "type": "bleachbit_clean",
      "params": {}
    },
    {
      "type": "sfc_scan",
      "params": {}
    }
  ]
}
```

## Output Format

### Task Result

Each task returns:

```python
{
    "task_type": "bleachbit_clean",
    "status": "success",           # success, error, warning, skipped
    "summary": {
        "human_readable": {        # User-friendly data
            "status": "Complete",
            "items_cleaned": 1247
        },
        "results": {               # Raw technical data
            "output": "...",
            "files_removed": [...]
        }
    },
    "duration_seconds": 45.23
}
```

### Final Report

```json
{
    "tasks": [
        { /* ... task results ... */ }
    ],
    "status": "ok",
    "total_duration_seconds": 120.45,
    "run_timestamp": "2024-10-27T12:34:56Z"
}
```

## Progress Markers

The runner emits markers to stderr for real-time UI updates:

```
TASK_START: task_id
TASK_OK: task_id | success
TASK_FAIL: task_id | error_message
TASK_SKIP: task_id | reason
PROGRESS_JSON: {...}
PROGRESS_JSON_FINAL: {...}
```

**Critical**: Always `flush()` after markers:

```python
sys.stderr.write("TASK_OK: my_service\n")
sys.stderr.flush()  # Without this, updates batch and delay
```

## Creating a Service

### Service Function Signature

```python
def run_my_service(task: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute my_service task.
    
    Args:
        task: Task definition with parameters
        
    Returns:
        Standard service result dictionary
    """
    try:
        # Get parameters
        params = task.get("params", {})
        
        # Do work
        result = do_work(params)
        
        # Return success
        return {
            "task_type": "my_service",
            "status": "success",
            "summary": {
                "human_readable": {
                    "result": "OK"
                },
                "results": result
            },
            "duration_seconds": 1.23
        }
    except Exception as e:
        # Return error
        return {
            "task_type": "my_service",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": str(e)
                },
                "results": {}
            },
            "duration_seconds": 0
        }
```

### Register in Service Runner

Add to `TASK_HANDLERS` in `runner/service_runner.py`:

```python
from services.my_service import run_my_service

TASK_HANDLERS = {
    "my_service": run_my_service,
}
```

## Example: Simple Service

```python
# runner/services/hello_service.py

import time
import sys

def run_hello_service(task):
    """Simple hello service example."""
    try:
        sys.stderr.write("TASK_START: hello_service\n")
        sys.stderr.flush()
        
        # Get parameters
        name = task.get("params", {}).get("name", "World")
        
        # Do work
        time.sleep(2)
        
        sys.stderr.write("TASK_OK: hello_service\n")
        sys.stderr.flush()
        
        return {
            "task_type": "hello_service",
            "status": "success",
            "summary": {
                "human_readable": {
                    "message": f"Hello, {name}!"
                },
                "results": {
                    "timestamp": str(time.time())
                }
            },
            "duration_seconds": 2.0
        }
    except Exception as e:
        sys.stderr.write(f"TASK_FAIL: hello_service | {str(e)}\n")
        sys.stderr.flush()
        
        return {
            "task_type": "hello_service",
            "status": "error",
            "summary": {
                "human_readable": {"error": str(e)},
                "results": {}
            },
            "duration_seconds": 0
        }
```

## Subprocess Execution

Running external programs:

```python
import subprocess

def run_external_tool(exe_path, args=None):
    """Run external tool and capture output."""
    try:
        cmd = [exe_path] + (args or [])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutes
            check=False   # Don't raise on non-zero exit
        )
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"error": "Task timed out"}
    except Exception as e:
        return {"error": str(e)}
```

## Error Handling

### Graceful Failures

Always return proper error status:

```python
try:
    result = do_work()
except FileNotFoundError:
    return {
        "task_type": "my_service",
        "status": "error",
        "summary": {
            "human_readable": {
                "error": "Required file not found"
            },
            "results": {}
        },
        "duration_seconds": 0
    }
except TimeoutError:
    return {
        "task_type": "my_service",
        "status": "warning",
        "summary": {
            "human_readable": {
                "warning": "Operation timed out"
            },
            "results": {}
        },
        "duration_seconds": timeout_secs
    }
```

## Testing Services

### Create Test Fixture

`runner/fixtures/test_my_service.json`:

```json
{
  "tasks": [
    {
      "type": "my_service",
      "params": {
        "name": "Test"
      }
    }
  ]
}
```

### Run Test

```powershell
python runner/service_runner.py runner/fixtures/test_my_service.json
```

### Verify Output

Check the returned JSON for:

- Correct `task_type`
- Valid `status` (success/error/warning)
- Populated `summary` with both `human_readable` and `results`
- Positive `duration_seconds`

## Best Practices

1. **Error handling** - Always return proper status and messages
2. **Progress markers** - Emit markers for long-running tasks
3. **Timeouts** - Set reasonable timeouts for subprocess calls
4. **Cleanup** - Close file handles and processes properly
5. **Logging** - Use stderr for debug output
6. **Performance** - Profile slow operations
7. **Dependencies** - Add requirements to `requirements.txt`
8. **Testing** - Test with fixtures before production use

## Debugging

### Run with Python Debugger

```powershell
python -m pdb runner/service_runner.py runner/fixtures/test_my_service.json
```

### Add Debug Output

```python
import sys

# Write to stderr (visible in logs)
sys.stderr.write(f"DEBUG: value = {value}\n")
sys.stderr.flush()

# Write to stdout (goes to final report)
print(f"Output: {value}")
```

### Check Logs

AutoService writes runner logs to `data/logs/`:

```
data/logs/
├── run_plan_1234567890.json      # Task plan
└── run_plan_1234567890.log.txt   # Runner output
```

---

Next: [Portable Layout](portable-layout.md)
