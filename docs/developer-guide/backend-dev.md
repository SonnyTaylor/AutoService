# Backend Development

Develop the Rust backend and Tauri commands.

## Tauri Command Structure

Commands are the bridge between frontend and backend.

### Basic Command

```rust
#[tauri::command]
fn my_command(state: tauri::State<AppState>) -> Result<String, String> {
    Ok("Success!".to_string())
}
```

### With Parameters

```rust
#[tauri::command]
fn my_command(
    name: String,
    count: i32,
    state: tauri::State<AppState>,
) -> Result<MyResult, String> {
    // Your logic
    Ok(MyResult { /* ... */ })
}
```

### Async Command

```rust
#[tauri::command]
async fn my_async_command(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Async work
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok("Done!".to_string())
}
```

## Registering Commands

In `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    my_command,
    my_async_command,
    other_command,
    // ... more commands
])
```

## App State

Access shared state:

```rust
#[tauri::command]
fn get_data_dir(state: tauri::State<AppState>) -> Result<String, String> {
    let data_dir = &state.data_dir;
    Ok(data_dir.to_string_lossy().to_string())
}
```

## File Operations

### Read File

```rust
use std::fs;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| e.to_string())
}
```

### Write File

```rust
use std::fs;

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| e.to_string())
}
```

### List Directory

```rust
use std::fs;

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        entries.push(name.to_string_lossy().to_string());
    }
    Ok(entries)
}
```

## Emitting Events

Send data to frontend:

```rust
#[tauri::command]
fn trigger_event(app: tauri::AppHandle) -> Result<(), String> {
    app.emit_all("my_event", "payload data")
        .map_err(|e| e.to_string())
}
```

## Spawning Processes

Run external programs:

```rust
use std::process::Command;

#[tauri::command]
fn run_program(exe_path: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(&exe_path)
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    
    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
}
```

## System Information

Use `sysinfo` crate:

```rust
use sysinfo::System;

#[tauri::command]
fn get_system_info() -> Result<SystemInfo, String> {
    let sys = System::new_all();
    
    Ok(SystemInfo {
        cpu_count: sys.cpus().len(),
        memory_total: sys.total_memory(),
        memory_available: sys.available_memory(),
    })
}
```

## Error Handling

Convert errors to strings for frontend:

```rust
#[tauri::command]
fn risky_operation() -> Result<String, String> {
    // Use ? operator to propagate errors
    let data = std::fs::read_to_string("file.txt")?;
    
    // Manual error handling
    if data.is_empty() {
        return Err("File is empty".to_string());
    }
    
    Ok(data)
}
```

## Development Tips

### Compilation

```powershell
# Check compilation without building
cargo check

# Build for development
cargo build

# Build for release
cargo build --release

# Build and watch for changes
cargo watch -x build
```

### Testing

```powershell
# Run tests
cargo test

# Run specific test
cargo test my_test

# Run with output
cargo test -- --nocapture
```

### Debugging

Add `dbg!()` macro for quick debugging:

```rust
let value = dbg!(some_calculation());
// Output: [filename:line] value = result
```

---

Next: [Python Runner](python-runner.md)
