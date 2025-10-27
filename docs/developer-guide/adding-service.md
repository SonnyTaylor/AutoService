# Adding a Service

Learn how to create a new diagnostic or maintenance service in AutoService.

!!! info "Overview"
Adding a service requires changes in **two places** that must use the same ID:

    1. **Python Backend** (`runner/services/`) - Implement task logic
    2. **Frontend** (`src/pages/service/handlers/`) - UI and display logic

    Both components are coordinated by a shared service ID (e.g., `bleachbit_clean`, `sfc_scan`).

## Step 1: Python Service Implementation

### Create Python Handler

Create `runner/services/my_service.py`:

```python
import subprocess
import json
from typing import Dict, Any

def run_my_service(task: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute my_service task.

    Args:
        task: Task definition with parameters

    Returns:
        Standard result dictionary
    """
    try:
        # Get task parameters
        params = task.get("params", {})

        # Execute your service logic
        result = execute_my_logic(params)

        return {
            "task_type": "my_service",
            "status": "success",
            "summary": {
                "human_readable": {
                    "status": "Service completed",
                    "items_processed": result["count"]
                },
                "results": result
            },
            "duration_seconds": 12.34
        }
    except Exception as e:
        return {
            "task_type": "my_service",
            "status": "error",
            "summary": {
                "human_readable": {"error": str(e)},
                "results": {}
            },
            "duration_seconds": 0
        }

def execute_my_logic(params):
    # Your implementation here
    return {"count": 42}
```

### Register in Service Runner

Edit `runner/service_runner.py` and add to `TASK_HANDLERS`:

```python
from services.my_service import run_my_service

TASK_HANDLERS = {
    # ... existing handlers ...
    "my_service": run_my_service,
}
```

## Step 2: Frontend Handler

### Create Handler Directory

```powershell
mkdir src/pages/service/handlers/my_service
```

### Copy and Modify Template

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
  id: "my_service", // Matches Python handler
  label: "My Service", // Display name
  group: "Diagnostics", // Category
  toolKeys: ["my-tool"], // Required tools

  async build({ params, resolveToolPath }) {
    // Resolve required tools
    const toolPath = await resolveToolPath("my-tool");
    if (!toolPath) {
      throw new Error("my-tool not found");
    }

    // Return task definition for Python runner
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
export function renderTech({ result, index }) {
  const { summary, status } = result;

  return html`
    <div class="card">
      <div class="card-header">
        <h3>My Service #${index + 1}</h3>
      </div>
      <div class="card-body">
        ${kpiBox("Status", status)} ${kpiBox(
          "Items Processed",
          summary.human_readable?.items_processed ?? "N/A"
        )} ${summary.results
          ? html`
              <pre class="output">
${JSON.stringify(summary.results, null, 2)}</pre
              >
            `
          : ""}
      </div>
    </div>
  `;
}

/**
 * Extract customer-friendly metrics (optional)
 */
export function extractCustomerMetrics({ summary, status }) {
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

### Register Handler

Edit `src/pages/service/handlers/index.js`:

```javascript
import * as myService from "./my_service/index.js";

const HANDLERS = {
  // ... existing handlers ...
  my_service: myService,
};
```

## Step 3: Configurable Parameters

### Add Parameters to Task Builder

Modify the handler's `build()` function to accept UI parameters:

```javascript
async build({ params, resolveToolPath, getDataDirs }) {
  // params are passed from the UI
  const duration = params?.duration || 5;
  const verbose = params?.verbose ?? true;

  return {
    type: "my_service",
    duration_minutes: duration,
    verbose: verbose
  };
}
```

### Define UI Parameters

Add parameter definitions to `definition`:

```javascript
export const definition = {
  id: "my_service",
  label: "My Service",
  group: "Diagnostics",
  toolKeys: [],

  // Parameter UI configuration
  params: [
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
    // Use params.duration, params.verbose, etc.
    return {
      /* ... */
    };
  },
};
```

## Step 4: Return Value Schema

!!! warning "Critical: Exact Schema Required"
All Python services **must** return this exact structure. Deviations will break the frontend and reporting system.

All Python services must return this structure:

```python
{
    "task_type": "my_service",                  # Matches service ID
    "status": "success" | "error" | "warning",  # Task status
    "summary": {
        "human_readable": {                     # User-friendly data
            "key": "value"
        },
        "results": {                            # Raw technical data
            "key": "value"
        }
    },
    "duration_seconds": 12.34
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
