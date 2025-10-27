# Adding a Service

Learn how to create a new diagnostic or maintenance service in AutoService.

!!! tip "Service Architecture"
    Adding a service requires changes in **exactly two places** that must share the same ID:
    
    === "Python Backend"
        **Location**: `runner/services/`  
        **Responsibility**: Implement task execution logic  
        **Example**: `runner/services/my_service.py`
    
    === "Frontend"
        **Location**: `src/pages/service/handlers/`  
        **Responsibility**: UI display and parameter building  
        **Example**: `src/pages/service/handlers/my_service/index.js`
    
    Both components are coordinated by a shared service ID (e.g., `bleachbit_clean`, `sfc_scan`).

## Step 1: Python Service Implementation

### Create Python Handler

Create `runner/services/my_service.py`:

```python
import subprocess
import json
from typing import Dict, Any
import time  # (1)!

def run_my_service(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute my_service task."""
    start_time = time.time()
    try:
        params = task.get("params", {})  # (2)!
        result = execute_my_logic(params)  # (3)!

        return {
            "task_type": "my_service",  # (4)!
            "status": "success",
            "summary": {
                "human_readable": {  # (5)!
                    "status": "Service completed",
                    "items_processed": result["count"]
                },
                "results": result  # (6)!
            },
            "duration_seconds": time.time() - start_time
        }
    except Exception as e:
        return {
            "task_type": "my_service",
            "status": "error",
            "summary": {
                "human_readable": {"error": str(e)},
                "results": {}
            },
            "duration_seconds": time.time() - start_time
        }

def execute_my_logic(params):
    """Your service logic here."""
    return {"count": 42}
```

1. Import `time` to measure execution duration
2. Extract parameters passed from the frontend
3. Execute your custom service logic
4. Must match the frontend handler ID exactly
5. Human-readable data for UI display
6. Raw technical data for detailed reports

### Register in Service Runner

Edit `runner/service_runner.py` and add to `TASK_HANDLERS`:

```python
from services.my_service import run_my_service

TASK_HANDLERS = {
    # ... existing handlers ...
    "my_service": run_my_service,  # (1)!
}
```

1. The key must match the `id` in the frontend handler definition

## Step 2: Frontend Handler

### Setup

=== "Create Directory"

    ```powershell
    mkdir src/pages/service/handlers/my_service
    ```

=== "Copy Template"

    ```powershell
    cp src/pages/service/handlers/_TEMPLATE/index.js src/pages/service/handlers/my_service/index.js
    ```

### Implement Handler

Edit `src/pages/service/handlers/my_service/index.js`:

```javascript
import { html } from "lit-html";
import { kpiBox, buildMetric } from "../common/ui.js";

/**
 * Service definition for my_service
 */
export const definition = {
  id: "my_service",                     // (1)!
  label: "My Service",                  // (2)!
  group: "Diagnostics",                 // (3)!
  toolKeys: ["my-tool"],                // (4)!

  async build({ params, resolveToolPath }) {
    const toolPath = await resolveToolPath("my-tool");  // (5)!
    if (!toolPath) {
      throw new Error("my-tool not found");
    }

    return {
      type: "my_service",
      executable_path: toolPath,
      params: {
        my_param: params?.my_param || "default_value",
      },
    };
  },
};

/**
 * Render technical report view
 */
export function renderTech({ result, index }) {  // (6)!
  const { summary, status } = result;

  return html`
    <div class="card">
      <div class="card-header">
        <h3>My Service #${index + 1}</h3>
      </div>
      <div class="card-body">
        ${kpiBox("Status", status)} 
        ${kpiBox("Items Processed", summary.human_readable?.items_processed ?? "N/A")} 
        ${summary.results ? html`<pre class="output">${JSON.stringify(summary.results, null, 2)}</pre>` : ""}
      </div>
    </div>
  `;
}

/**
 * Extract customer-friendly metrics (optional)
 */
export function extractCustomerMetrics({ summary, status }) {  // (7)!
  if (status !== "success") return null;

  return buildMetric({
    icon: "✓",
    label: "Service Status",
    value: "Complete",
    detail: `Processed ${summary.human_readable?.items_processed ?? 0} items`,
    variant: "success",
  });
}

/**
 * Print-specific CSS (optional)
 */
export const printCSS = `
  .my-service {
    page-break-inside: avoid;
  }
`;
```

1. Must match Python handler ID exactly
2. Display name in the UI service catalog
3. Category for grouping services in the UI
4. List of required external tools (e.g., `["bleachbit", "furmark"]`)
5. Resolve tool paths dynamically for USB portability
6. Required - renders detailed technical view
7. Optional - extracts metrics for customer-friendly report

### Register Handler

Edit `src/pages/service/handlers/index.js`:

```javascript
import * as myService from "./my_service/index.js";

const HANDLERS = {
  // ... existing handlers ...
  my_service: myService,  // (1)!
};
```

1. Key must match the `id` from the handler definition

## Step 3: Configurable Parameters

### Add Parameters to Definition

Update the frontend handler to support user-configurable parameters:

```javascript
export const definition = {
  id: "my_service",
  label: "My Service",
  group: "Diagnostics",
  
  // Parameter UI configuration  
  params: [  // (1)!
    {
      id: "duration",
      label: "Duration (minutes)",
      type: "number",
      default: 5,
      min: 1,
      max: 60,
    },
    {
      id: "verbose",
      label: "Verbose Output",
      type: "checkbox",
      default: true,
    },
  ],

  async build({ params, resolveToolPath }) {
    // params.duration and params.verbose are now available  // (2)!
    return {
      type: "my_service",
      duration_minutes: params?.duration || 5,
      verbose: params?.verbose ?? true
    };
  },
};
```

1. Array of parameter definitions that appear in the UI
2. Parameters are passed to `build()` from user selections

### Parameter Types Supported

=== "Number Input"

    ```javascript
    {
      id: "threshold",
      label: "Threshold Value",
      type: "number",
      default: 50,
      min: 0,
      max: 100,
      step: 5
    }
    ```

=== "Checkbox"

    ```javascript
    {
      id: "enable_deep_scan",
      label: "Enable Deep Scan",
      type: "checkbox",
      default: false
    }
    ```

=== "Text Input"

    ```javascript
    {
      id: "custom_path",
      label: "Custom Path",
      type: "text",
      default: "C:\\",
      placeholder: "Enter directory path"
    }
    ```

=== "Select Dropdown"

    ```javascript
    {
      id: "priority",
      label: "Priority Level",
      type: "select",
      default: "normal",
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" }
      ]
    }
    ```

## Step 4: Return Value Schema

!!! warning "Critical: Exact Schema Required"
    All Python services **must** return this exact structure. Deviations will break the frontend and reporting system.

=== "Successful Response"

    ```python
    {
        "task_type": "my_service",                  # (1)!
        "status": "success",                        # (2)!
        "summary": {
            "human_readable": {                     # (3)!
                "key": "User-friendly value",
                "status": "Completed"
            },
            "results": {                            # (4)!
                "technical_data": 42,
                "raw_output": "..."
            }
        },
        "duration_seconds": 12.34                   # (5)!
    }
    ```

    1. Must match service ID exactly
    2. Use: `"success"`, `"error"`, or `"warning"`
    3. Data displayed in customer-friendly report
    4. Raw technical data for technician report
    5. Execution time in seconds

=== "Error Response"

    ```python
    {
        "task_type": "my_service",
        "status": "error",
        "summary": {
            "human_readable": {
                "error": "User-friendly error message"
            },
            "results": {
                "exception": "Full traceback or details"
            }
        },
        "duration_seconds": 2.5
    }
    ```

=== "Warning Response"

    ```python
    {
        "task_type": "my_service",
        "status": "warning",
        "summary": {
            "human_readable": {
                "status": "Partial success",
                "warning": "Some files could not be processed"
            },
            "results": {
                "processed": 95,
                "failed": 5
            }
        },
        "duration_seconds": 8.75
    }
    ```

## Step 5: Testing

### Test Python Handler

Create `runner/fixtures/test_my_service.json`:

```json
{
  "tasks": [
    {
      "type": "my_service",
      "params": {
        "my_param": "test_value"
      }
    }
  ]
}
```

Run test:

```powershell
python runner/service_runner.py runner/fixtures/test_my_service.json
```

### Test Frontend Handler

1. Run `pnpm tauri dev`
2. Navigate to Service tab
3. Your service should appear in the catalog
4. Queue and run it
5. Verify output in results

## Real-World Example: Simple Disk Check

### Python (`runner/services/disk_check_service.py`)

```python
import subprocess
import json

def run_disk_check(task):
    try:
        # Run chkdsk to get disk info
        result = subprocess.run(
            ["chkdsk", "C:"],
            capture_output=True,
            text=True,
            timeout=300
        )

        return {
            "task_type": "disk_check",
            "status": "success" if result.returncode == 0 else "warning",
            "summary": {
                "human_readable": {
                    "drive": "C:",
                    "status": "OK" if result.returncode == 0 else "Errors found"
                },
                "results": {
                    "output": result.stdout
                }
            },
            "duration_seconds": 60
        }
    except Exception as e:
        return {
            "task_type": "disk_check",
            "status": "error",
            "summary": {
                "human_readable": {"error": str(e)},
                "results": {}
            },
            "duration_seconds": 0
        }
```

### Frontend Handler (similar to example above)

!!! tip "Best Practices"

    1. **Error handling** - Always return proper status and error messages
    2. **Logging** - Use stderr markers for progress updates
    3. **Performance** - Include realistic duration estimates
    4. **Validation** - Check parameters before execution
    5. **Documentation** - Comment your code clearly
    6. **Testing** - Test both Python and frontend components
    7. **User feedback** - Provide clear status and next steps

!!! info "Implementation Checklist"

    - [ ] Python service created in `runner/services/my_service.py`
    - [ ] Service registered in `runner/service_runner.py`
    - [ ] Frontend handler created in `src/pages/service/handlers/my_service/`
    - [ ] Handler registered in `src/pages/service/handlers/index.js`
    - [ ] Service tested with Python fixtures
    - [ ] Service tested in AutoService UI
    - [ ] Both technical and customer views display correctly
    - [ ] Documentation added (README in handler folder)

---

Next: [Frontend Development](frontend-dev.md)
