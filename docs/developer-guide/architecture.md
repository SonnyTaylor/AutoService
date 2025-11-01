# Architecture

Deep dive into AutoService's three-layer architecture, data flow patterns, and design principles.

## :material-layers: Three-Layer Architecture

AutoService uses a clean separation of concerns across three independent layers:

<div class="grid" markdown>

<div markdown>

!!! abstract ":material-web: Frontend Layer"
    **Responsibility**: User interface and state management

    - Hash-based SPA routing
    - Task queue builder UI
    - Real-time progress display
    - Report rendering & printing

</div>

<div markdown>

!!! abstract ":material-language-rust: Backend Layer"
    **Responsibility**: System operations and IPC

    - File I/O operations
    - System information collection
    - Process spawning & management
    - Event emission to frontend

</div>

<div markdown>

!!! abstract ":material-language-python: Service Runner"
    **Responsibility**: Task execution

    - Sequential task processing
    - Real-time log streaming
    - External tool orchestration
    - Report generation

</div>

</div>

---

AutoService's architecture enables:

### Layer 1: Frontend (Vanilla JS + Vite)

**Responsibilities:**

- User interface and interactions
- Task queue management (builder)
- Results display and reporting
- Local state management (sessionStorage/localStorage)

**Technologies:**

- HTML, CSS, vanilla JavaScript
- Vite build tool
- lit-html for templating
- No framework dependencies

**Key Files:**

- `src/main.js` - Hash-based router
- `src/pages/*/` - Page modules
- `src/utils/` - Shared utilities

### Layer 2: Backend (Rust + Tauri)

**Responsibilities:**

- File I/O and data persistence
- System information collection
- External process management
- IPC command dispatch

**Technologies:**

- Rust programming language
- Tauri desktop framework
- sysinfo crate for hardware info
- tokio async runtime

**Key Files:**

- `src-tauri/src/lib.rs` - Command registration
- `src-tauri/src/*.rs` - Command implementations
- `src-tauri/tauri.conf.json` - Configuration

### Layer 3: Python Runner (Async Service Executor)

**Responsibilities:**

- Execute maintenance and diagnostic tasks
- Subprocess management
- Real-time progress streaming
- Report generation

**Technologies:**

- Python 3.9+
- PyInstaller packaging
- Subprocess and asyncio

**Key Files:**

- `runner/service_runner.py` - Main orchestrator
- `runner/services/*.py` - Task implementations
- `runner/requirements.txt` - Dependencies

## Data Flow: Running a Service

### Complete Service Execution Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as 🖥️ Frontend<br/>(JS)
    participant BE as ⚙️ Backend<br/>(Rust)
    participant PR as 🐍 Python<br/>Runner

    User->>FE: 1️⃣ Build task queue
    Note right of FE: User selects:<br/>• SFC Scan<br/>• Disk Cleanup<br/>• BleachBit Clean
    
    FE->>FE: 2️⃣ Generate JSON plan
    FE->>BE: 3️⃣ invoke("start_service_run")
    
    BE->>PR: 4️⃣ Spawn subprocess
    Note right of BE: Pass JSON via stdin
    
    rect rgb(230, 245, 255)
        Note over PR: 🔄 Task Execution Loop
        
        PR->>PR: 5️⃣ Parse & validate plan
        
        Note over PR: TASK_START: sfc_scan
        PR->>PR: Execute SFC
        PR->>BE: stderr: TASK_OK ✓
        BE->>FE: Emit progress event
        FE->>FE: Update UI (33%)
        
        Note over PR: TASK_START: disk_cleanup
        PR->>PR: Execute cleanup
        PR->>BE: stderr: TASK_OK ✓
        BE->>FE: Emit progress event
        FE->>FE: Update UI (66%)
        
        Note over PR: TASK_START: bleachbit_clean
        PR->>PR: Execute clean
        PR->>BE: stderr: TASK_OK ✓
        BE->>FE: Emit progress event
        FE->>FE: Update UI (100%)
    end
    
    PR->>BE: stdout: 📄 FINAL JSON report
    BE->>FE: Emit completion event
    FE->>FE: Parse & store report
    FE->>User: 📊 Display results
```

!!! success "Key Benefits of This Flow"
    - **Asynchronous**: UI remains responsive during execution
    - **Real-time feedback**: Users see progress immediately
    - **Fault-tolerant**: Errors in one task don't block others
    - **Detailed logging**: Full execution trace for debugging

### Architecture Layers

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend Layer"]
        Router["Hash Router<br/>main.js"]
        Pages["Page Modules<br/>src/pages/*"]
        State["State Management<br/>sessionStorage"]
        IPC["IPC Bridge<br/>window.__TAURI__"]
    end
    
    subgraph Backend["⚙️ Backend Layer"]
        Commands["Tauri Commands<br/>lib.rs"]
        FileIO["File I/O<br/>programs.rs"]
        System["System Info<br/>system.rs"]
        Process["Process Mgmt<br/>Tokio"]
    end
    
    subgraph Runner["🐍 Python Runner Layer"]
        Dispatcher["Task Dispatcher<br/>service_runner.py"]
        Services["Service Modules<br/>services/*.py"]
        Output["Progress Streaming<br/>stderr/stdout"]
    end
    
    Frontend -->|IPC Invoke| Backend
    Backend -->|Spawn Subprocess| Runner
    Backend -->|Tauri Events| Frontend
    Services -->|Stream Logs| Output
    Output -->|Emit Events| Backend
```

## :material-connection: IPC Communication Patterns

AutoService uses Tauri's IPC (Inter-Process Communication) system for frontend-backend interaction.

=== "Frontend → Rust"

    **Invoke Pattern**: Frontend calls backend commands asynchronously.

    ```javascript title="src/pages/service/builder.js"
    // Frontend calls Rust command with arguments
    const result = await window.__TAURI__.core.invoke("command_name", {
      arg1: value1,
      arg2: value2
    });
    
    // Example: Load app settings
    const settings = await window.__TAURI__.core.invoke("load_app_settings");
    ```

    !!! tip "Common Commands"
        - `load_app_settings` - Load application configuration
        - `save_program` - Persist program definition
        - `list_programs` - Get all registered programs
        - `get_system_info` - Retrieve hardware details
        - `start_service_run` - Execute service queue

=== "Rust → Frontend"

    **Event Pattern**: Backend emits events that frontend listens to.

    ```rust title="src-tauri/src/lib.rs"
    // Rust emits event to frontend
    app.emit("event_name", payload)?;
    
    // Example: Stream service runner output
    app.emit("service_runner_line", LogLine {
        timestamp: chrono::Utc::now(),
        message: line,
    })?;
    ```

=== "Frontend Event Listener"

    **Listen Pattern**: Subscribe to backend events in frontend.

    ```javascript title="src/pages/service/runner.js"
    // Frontend listens for events
    const unlisten = await window.__TAURI__.event.listen("event_name", (event) => {
      console.log("Received:", event.payload);
    });
    
    // Example: Listen to service progress
    await window.__TAURI__.event.listen("service_runner_line", (event) => {
      const { message } = event.payload;
      if (message.includes("TASK_OK")) {
        updateProgress(message);
      }
    });
    
    // Cleanup when done
    unlisten();
    ```

## Key Design Patterns

### 1. Self-Contained Service Handlers

All logic for a service lives in one place:

```
src/pages/service/handlers/my_service/
├── index.js              # definition, renderTech, extractCustomerMetrics, printCSS
├── README.md
└── fixtures/
    └── test_my_service.json
```

This keeps related code together and makes services easy to add/remove.

### 2. Portable Data Directory

All settings, tools, and reports live in `data/`:

```
AutoService.exe
data/
├── programs/    # External tools
├── settings/    # JSON configs (relative paths)
├── reports/     # Generated reports
└── logs/        # Execution logs
```

**Benefits:**

- USB portability (no absolute paths)
- Offline operation
- User customization without code changes
- Easy data backup

### 3. Real-Time Progress Streaming

Python runner emits markers to stderr:

```python
sys.stderr.write("TASK_START: sfc_scan\n")
sys.stderr.flush()  # Critical!

# ... do work ...

sys.stderr.write("TASK_OK: sfc_scan\n")
sys.stderr.flush()
```

Frontend listens and updates UI in real-time.

### 4. Standard Service Response Schema

All services return consistent structure:

```python
{
    "task_type": "service_id",
    "status": "success" | "error" | "warning",
    "summary": {
        "human_readable": {...},    # User-friendly data
        "results": {...}             # Raw technical data
    },
    "duration_seconds": 123.45
}
```

### 5. Hash-Based Router

Frontend uses hash routing for SPA:

```
#/service           → Service presets
#/service-run       → Service builder
#/service-results   → Results viewer
#/programs          → Program management
#/settings          → Configuration
```

No server required, works from file.

## State Management

### Frontend State

**SessionStorage** (transient, cleared on tab close):

- `service.pendingRun` - Queued tasks
- `service.finalReport` - Completed results
- `tool.statuses.v1` - Cached tool availability

**LocalStorage** (persistent):

- `service.finalReport` - Report fallback
- Business settings
- App configuration

### Backend State

**AppState** (in-memory):

- `data_dir` - Path to data folder
- Connected app handle for event emission

## Async Patterns

### Frontend → Tauri → Python

```javascript
// Frontend (async/await)
const result = await invoke("start_service_run", { plan });

// Rust (tokio async)
#[tauri::command]
async fn start_service_run(plan: RunPlan) -> Result<(), String> {
    // Spawn subprocess
    // Listen to stdout/stderr
}

// Python (runs synchronously)
def main():
    tasks = parse_plan(json_input)
    run_tasks(tasks)
    print_final_report()
```

## Error Handling Strategy

1. **Python errors** → Return error status in response
2. **Rust errors** → Convert to IPC error message
3. **Frontend errors** → Display user-friendly message
4. **User messages** → Via notification system

## Performance Considerations

1. **Lazy loading** - Pages load only when routed
2. **Vite code splitting** - Automatic chunk optimization
3. **No re-renders** - Vanilla JS, no framework overhead
4. **Async subprocess** - Python runner runs in background
5. **Streaming output** - No waiting for full results

## Security Considerations

1. **Admin privileges** - UAC prompt ensures user consent
2. **Sandboxed scripts** - Python runner subprocess isolation
3. **No network by default** - Only for explicit tests
4. **Data folder controls** - User owns all tool/setting files

---

Next: [Adding a Service](adding-service.md)
