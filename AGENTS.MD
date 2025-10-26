# Project Overview

AutoService is a Windows diagnostic toolkit built with **Tauri (Rust backend) + vanilla JavaScript frontend**. It orchestrates portable maintenance tools, runs stress tests, and generates comprehensive reports—designed for computer repair technicians to run from USB drives.

## Essential Commands

### Development

```powershell
# Install dependencies
pnpm install

# Run in development mode (hot-reload frontend + Rust, only works in an admin terminal)
pnpm tauri dev

# Frontend only (without Tauri, this is rarely used)
pnpm dev

# Run tests
pnpm test
```

### Building

```powershell
# Build production executable (creates portable .exe + data/ folder)
pnpm tauri build
# Output: src-tauri/target/release/autoservice.exe
```

### Python Runner Development

```powershell
# Install Python dependencies
pip install -r runner/requirements.txt

# Test individual service
python runner/service_runner.py runner/fixtures/test_bleachbit.json

# The build process automatically compiles service_runner.exe via PyInstaller
# In dev mode, falls back to Python interpreter if exe is missing
```

## Architecture Overview

### Three-Layer Design

1. **Frontend (Vanilla JS + Vite)**
   - Hash-based SPA router in `src/main.js`
   - Modular pages in `src/pages/**/` with `initPage()` controllers
   - No framework dependencies - pure vanilla JS with lit-html templating

2. **Tauri Backend (Rust)**
   - IPC command handlers in `src-tauri/src/*.rs`
   - 40+ commands for file I/O, system info, program/script management
   - AppState holds `data_dir` path (Arc<PathBuf>)

3. **Python Service Runner**
   - Standalone `runner/service_runner.exe` (PyInstaller-packaged)
   - Executes automation tasks asynchronously
   - Streams logs to frontend via stderr markers
   - Falls back to `python runner/service_runner.py` in dev

### Data Flow: Task Execution

```
Frontend (Builder)
  → Generate JSON plan with task definitions
  → invoke("start_service_run", plan)

Rust Backend
  → Spawn Python runner subprocess
  → Stream stderr lines to frontend via events

Python Runner
  → Execute tasks sequentially
  → Emit TASK_START/TASK_OK/TASK_FAIL markers
  → Return final JSON report to stdout

Frontend (Results)
  → Render technical and customer-facing reports
  → Auto-save if enabled
```

## Critical Patterns

### Service Handler System

**All service logic lives in self-contained modules** at `src/pages/service/handlers/[service_id]/`.

Each handler exports up to 4 components:

```javascript
// src/pages/service/handlers/example_service/index.js

// 1. DEFINITION (required) - Service metadata and task builder
export const definition = {
  id: "example_service",           // Matches Python handler
  label: "Example Service",         // UI display name
  group: "Diagnostics",             // Category for grouping
  toolKeys: ["required-tool"],      // External tool dependencies

  async build({ params, resolveToolPath, getDataDirs }) {
    const toolPath = await resolveToolPath("required-tool");
    return {
      type: "example_service",      // Must match handler ID
      executable_path: toolPath,
      params                         // Task-specific parameters
    };
  }
};

// 2. TECH RENDERER (required) - Detailed technical view
export function renderTech({ result, index }) {
  return html`<div class="card">
    ${kpiBox("Status", result.summary.status)}
  </div>`;
}

// 3. CUSTOMER METRICS - Customer-friendly summary
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;
  return buildMetric({
    icon: "🔧",
    label: "Service Result",
    value: summary.result
  });
}

// 4. PRINT CSS - Service-specific print styles
export const printCSS = `.example-service { ... }`;
```

**Handlers automatically integrate** with catalog, renderers, and print systems—no editing scattered files.

### Adding a New Service

**Step 1: Python Backend**

```python
# runner/services/new_service.py
def run_new_service(task: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "task_type": "new_service",
        "status": "success" | "error" | "warning",
        "summary": {
            "human_readable": {...},  # UI display data
            "results": {...}          # Raw technical data
        },
        "duration_seconds": 123.45
    }
```

**Step 2: Register Python Handler**

```python
# runner/service_runner.py
from services.new_service import run_new_service

TASK_HANDLERS = {
    ...,
    "new_service": run_new_service
}
```

**Step 3: Create Frontend Handler**

```powershell
# Copy template
cp -r src/pages/service/handlers/_TEMPLATE src/pages/service/handlers/new_service
```

**Step 4: Implement Handler** (`src/pages/service/handlers/new_service/index.js`)

- Export `definition` with `id`, `label`, `group`, `toolKeys`, `build()`
- Export `renderTech()` function for technical display
- Export `extractCustomerMetrics()` for customer summary (optional)
- Export `printCSS` for service-specific print styles (optional)

**Step 5: Register Handler**

```javascript
// src/pages/service/handlers/index.js
import * as newService from "./new_service/index.js";

const HANDLERS = {
  ...,
  new_service: newService
};
```

Done! The handler will automatically appear in the service catalog.

### Portable Data Directory Pattern

**All external tools** live in `data/programs/<ToolName - Version>/`

**Critical rules:**

- Executable paths in `data/settings/programs.json` are **relative to data/** for USB portability
- Rust backend auto-converts absolute paths to relative on save
- **Never hard-code tool paths** - always use `resolveToolPath()`

```javascript
// ❌ WRONG - Hard-coded path breaks portability
const toolPath = "C:/data/programs/BleachBit/bleachbit.exe";

// ✅ CORRECT - Dynamic resolution
const toolPath = await resolveToolPath("bleachbit");
if (!toolPath) throw new Error("BleachBit not found");
```

### Frontend IPC Communication

**Frontend → Rust**: Use `window.__TAURI__.core.invoke(commandName, args)`

```javascript
// Common IPC patterns
const settings = await window.__TAURI__.core.invoke("load_app_settings");
const programs = await window.__TAURI__.core.invoke("list_programs");
await window.__TAURI__.core.invoke("save_program", { program });
const systemInfo = await window.__TAURI__.core.invoke("get_system_info");
```

**Rust Commands**: Annotate with `#[tauri::command]`, register in `src-tauri/src/lib.rs`

```rust
#[tauri::command]
fn my_command(state: tauri::State<AppState>) -> Result<String, String> {
    // Implementation
}

// In lib.rs builder:
.invoke_handler(tauri::generate_handler![
    my_command,
    // ... other commands
])
```

### Real-Time Log Streaming

Python runner emits structured markers to stderr for live UI updates:

```python
# CRITICAL: Always flush after markers for real-time updates
sys.stderr.write("TASK_START: service_name\n")
sys.stderr.flush()  # Without this, UI receives updates in batches

# ... do work ...

sys.stderr.write("TASK_END: service_name | SUCCESS\n")
sys.stderr.flush()
```

Frontend listens to `service_runner_line` events in `src/pages/service/runner.js` and parses these markers.

### Tool Resolution & Availability

```javascript
// Get tool availability (cached in sessionStorage)
const toolStatuses = await getToolStatuses();
// Returns: [{ key, name, exists, path, hint }, ...]

// Resolve specific tool path
const toolPath = await resolveToolPath(["primary-tool", "fallback-tool"]);
if (!toolPath) {
  console.warn("Tool not available");
}
```

Backend checks existence of key tools (bleachbit, furmark, heavyload, sfc, dism, smartctl, etc.) and returns paths + hints for missing tools.

## State Management

### SessionStorage (transient, cleared on tab close)

- `service.pendingRun` - Queued tasks from builder page
- `service.finalReport` - Completed service run results
- `tool.statuses.v1` - Cached tool availability

### LocalStorage (persistent)

- `service.finalReport` - Fallback for report persistence
- Business settings and app configuration

**State Flow**: Builder → sessionStorage → Runner → sessionStorage → Results page

## Print System

### Technician Reports

- **Purpose**: Detailed technical reports with full diagnostic data, charts, raw outputs
- **Location**: `src/pages/service/results/print/tech.js`
- **Includes**: Task results, performance charts, system info, execution logs

### Customer Reports

- **Purpose**: Simplified, customer-friendly summaries
- **Location**: `src/pages/service/results/print/customer.js`
- **Includes**: High-level metrics, security findings, maintenance work, recommendations

**Metric Card Structure**:

```javascript
{
  icon: "🛡️",                    // Emoji indicator
  label: "Security",              // Category name
  value: "Clean",                 // Primary result
  detail: "No threats found",     // Additional context
  variant: "success" | "info",    // Styling
  items: ["Scanned 1,247 files"]  // Optional breakdown
}
```

## Python Service Return Schema

**All Python services must return standardized schema**:

```python
{
    "task_type": "service_id",      # Matches handler ID
    "status": "success" | "error" | "warning",
    "summary": {
        "human_readable": {...},    # UI display data
        "results": {...}            # Raw technical data
    },
    "output": "...",                # Optional: stdout/stderr
    "duration_seconds": 123.45
}
```

## Common Pitfalls & Solutions

❌ **Hard-coding tool paths**: `"programs/BleachBit/bleachbit.exe"`
✅ **Use dynamic resolution**: `await resolveToolPath('bleachbit')`

❌ **Buffered Python logs**: UI receives updates only after task completion
✅ **Explicit flushing**: `sys.stderr.flush()` after every log marker

❌ **Absolute paths in programs.json**: Breaks portability when USB drive letter changes
✅ **Relative paths**: Rust backend auto-normalizes to `data/programs/...`

❌ **Missing tool detection**: Tasks execute blindly without checking availability
✅ **Pre-check availability**: Builder UI grays out unavailable services using `toolKeys`

❌ **Editing scattered files for new services**: Modifying catalog.js, renderers.js, etc.
✅ **Self-contained handlers**: Everything in `handlers/[service_id]/index.js`

## Project Structure Reference

```
src/
├── main.js                 # Router - loads pages dynamically
├── pages/
│   ├── service/           # Main automation workflow
│   │   ├── catalog.js     # Service registry (imports handlers)
│   │   ├── builder.js     # Task queue builder
│   │   ├── runner.js      # Python runner orchestration
│   │   ├── results/       # Report rendering & printing
│   │   └── handlers/      # Service modules (self-contained)
│   ├── system-info/       # Hardware/OS info
│   ├── programs/          # Program management
│   ├── scripts/           # Script catalog
│   └── settings/          # App configuration
└── utils/
    ├── business.js               # Business settings & technician mode
    ├── notification-sounds.js    # Notification sound library
    ├── reports.js                # Report utilities
    ├── service-metadata-modal.js # Service metadata prompts
    ├── tools.js                  # Tool status caching & resolution
    └── settings/                 # Settings utilities

src-tauri/src/
├── lib.rs                 # Command handlers & app setup
├── state.rs               # AppState (data_dir)
├── models.rs              # Data structures (25+ types)
├── programs.rs            # Program management
├── scripts.rs             # Script execution
├── system.rs              # System info collection
└── reports.rs             # Report persistence

runner/
├── service_runner.py      # Main orchestrator
├── sentry_config.py       # Sentry setup
├── services/              # Service implementations
│   ├── bleachbit_service.py
│   ├── sfc_service.py
│   └── ...               # One file per task type
└── fixtures/              # Test JSON files

data/                      # Portable data folder (travels with EXE)
├── programs/              # External tool executables
├── settings/              # JSON configs
├── reports/               # Generated reports
├── resources/bin/         # service_runner.exe
└── logs/                  # Execution logs
```

## Sentry Error Tracking

### Configuration

- **Python**: `runner/sentry_config.py` - Python SDK with task lifecycle tracking

**Release Format**: `autoservice@{version}` (e.g., `autoservice@0.4.0`)

## Development Notes

- **No TypeScript**: Project uses vanilla JS with JSDoc annotations for IDE hints
- **CSS Architecture**: Global styles in `src/styles/`, component-specific styles inlined
  - **`core.css`**: Main CSS file containing color variables, typography, and global styles
  - **Page-specific CSS**: Individual files for each major section (service.css, programs.css, settings.css, etc.)
  - **Component styles**: Inlined within page components for self-contained styling
- **Frontend Libraries**: Minimal dependencies (Fuse.js, SortableJS, ApexCharts, Tone.js, lit-html)
- **Rust Crates**: sysinfo, battery, wgpu for hardware detection
- **Python Style**: PEP 8 compliant, type hints encouraged
- **Package Management**: Use pnpm packages wherever possible for easier coding.

**Current Setup**:

- `pnpm test` runs Node.js native test runner
- Python fixtures in `runner/fixtures/test_*.json` for isolated service testing
- Manual UI testing via Service → Run workflow

**Testing Individual Services**:

```powershell
# Test Python service in isolation
python runner/service_runner.py runner/fixtures/test_bleachbit.json

# Check output
cat data/reports/*.json
```

## Build System

### Frontend (Vite)

- Target: Chrome 105 (Tauri webview)
- Output: `dist/` folder embedded in Tauri app

### Backend (Cargo + Tauri)

- Compiles Rust → embeds frontend from `dist/`
- Windows UAC elevation requested in `build.rs`
- Output: Single portable EXE

### Python Runner (PyInstaller)

- Triggered during `cargo build` via `src-tauri/build.rs`
- Checks if source is newer than existing exe
- Bundles to single-file `data/resources/bin/service_runner.exe`
- Falls back to Python interpreter if exe missing (dev flexibility)

## Key Files

| File | Purpose |
|------|---------|
| `src/main.js` | Hash router, page loader |
| `src/pages/service/handlers/index.js` | Handler registry |
| `src/pages/service/catalog.js` | Service definitions (from handlers) |
| `src-tauri/src/lib.rs` | Tauri command registrations |
| `runner/service_runner.py` | Task dispatcher |
| `runner/services/*.py` | Individual service implementations |
| `data/settings/programs.json` | User-managed tool definitions |
| `.github/copilot-instructions.md` | Extended AI development guide |

## Extension Points

### Adding a New Page

1. Create `src/pages/[page-name]/[page-name].html`
2. Create `src/pages/[page-name]/index.js` with `initPage()` export
3. Update `src/main.js` router if needed

### Adding a New Tauri Command

1. Create handler function in `src-tauri/src/[module].rs`
2. Annotate with `#[tauri::command]`
3. Register in `src-tauri/src/lib.rs` handler list

### Adding a New Tool

1. Place tool in `data/programs/[ToolName - Version]/`
2. Add entry via Programs page UI
3. Tool becomes available via `resolveToolPath()` and `getToolStatuses()`
