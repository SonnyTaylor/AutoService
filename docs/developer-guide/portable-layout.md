# Portable Layout

Understanding and working with AutoService's portable data directory structure.

## Design Principles

AutoService is built for portability:

- **USB-friendly**: Run from any USB drive
- **No installation**: No registry or system-wide changes
- **Self-contained**: All data travels with the executable
- **User-controlled**: All settings are editable JSON files

## Folder Structure

```
AutoService.exe                 # Main executable
data/                          # Portable data folder
├── programs/                  # External tools
│   ├── BleachBit - 4.6.0/
│   ├── 7-Zip - 25.01/
│   └── YourTool - 1.0/
├── settings/                  # Configuration files
│   ├── app_settings.json
│   ├── programs.json
│   └── scripts.json
├── reports/                   # Generated reports
│   ├── run_1234567890.json
│   └── run_1234567890.log.txt
├── logs/                      # Execution logs
│   ├── run_plan_1234567890.log.txt
│   └── service_runner_1234567890.log
├── resources/                 # Runtime resources
│   └── bin/
│       └── service_runner.exe
└── webview_profile/          # Tauri webview cache
```

## Settings Files

### app_settings.json

Global application configuration:

```json
{
  "theme": "dark",
  "auto_save_reports": true,
  "report_format": "both",
  "technician_mode": false,
  "technician_info": {
    "name": "John Doe",
    "company": "Tech Services",
    "phone": "555-1234",
    "email": "john@tech.local"
  }
}
```

### programs.json

Registered portable tools:

```json
{
  "programs": [
    {
      "id": "bleachbit",
      "name": "BleachBit",
      "version": "4.6.0",
      "path": "programs/BleachBit - 4.6.0/bleachbit.exe",
      "description": "Clean up junk files"
    },
    {
      "id": "7zip",
      "name": "7-Zip",
      "version": "25.01",
      "path": "programs/7-Zip - 25.01/7z.exe",
      "description": "Archive manager"
    }
  ]
}
```

### scripts.json

User-maintained script catalog:

```json
{
  "scripts": [
    {
      "id": "cleanup_temp",
      "name": "Clean Temp Files",
      "description": "Remove temporary files",
      "type": "powershell",
      "content": "Remove-Item -Path $env:TEMP -Recurse -Force"
    }
  ]
}
```

## Path Normalization

### Why Relative Paths?

Absolute paths break when USB drive letter changes:

```
D:\data\programs\BleachBit\bleachbit.exe  (Works on D:)
E:\data\programs\BleachBit\bleachbit.exe  (Won't work, wrong drive)
```

Relative paths are portable:

```
data/programs/BleachBit/bleachbit.exe     (Works on any drive)
```

### Rust Backend Normalization

The Rust backend automatically converts paths to be relative to the `data/` folder:

```rust
// When user sets: "C:/Users/Data/AutoService/data/programs/BleachBit/bleachbit.exe"
// Backend stores: "programs/BleachBit/bleachbit.exe"

// When loading: "programs/BleachBit/bleachbit.exe"
// Backend expands: "<data_dir>/programs/BleachBit/bleachbit.exe"
```

## Adding Tools Programmatically

### From Frontend

```javascript
// Add tool via Tauri command
const toolInfo = {
  id: "mytool",
  name: "My Tool",
  version: "1.0",
  path: "programs/My Tool - 1.0/mytool.exe",
  description: "Does something useful"
};

await window.__TAURI__.core.invoke("save_program", { program: toolInfo });
```

### Manual (JSON Editing)

1. Add folder: `data/programs/My Tool - 1.0/`
2. Copy tool into folder
3. Add entry to `data/settings/programs.json`
4. Restart AutoService

## Reports and Logs

### Report Storage

`data/reports/` contains:

- Generated maintenance reports (JSON)
- Customer-friendly reports (HTML/PDF)
- Technical analysis reports

Naming convention:

```
run_<timestamp>.json        # Raw report
run_<timestamp>.log.txt     # Execution log
```

### Log Storage

`data/logs/` contains execution logs:

- Service runner output
- Task execution logs
- Error messages and diagnostics

## Backup and Sync

### What to Backup

**Essential:**

- `data/settings/` - User configuration
- `data/reports/` - Generated reports
- `data/logs/` - Historical logs (optional)

**Optional:**

- `data/programs/` - Tools (can be re-downloaded)
- `data/resources/` - Runtime resources (regenerated on build)

### USB Setup Example

```powershell
# Copy to USB
Copy-Item "AutoService.exe" "E:\"
Copy-Item "data" "E:\data" -Recurse

# Update on USB
Copy-Item "data/settings" "E:\data\settings" -Recurse -Force
```

## Troubleshooting Path Issues

### "Tool not found" Error

**Problem**: Tool exists but AutoService can't find it

**Solution**:

1. Check `data/settings/programs.json` - is path correct?
2. Verify tool exists: `data/programs/[Tool Name]/executable`
3. Try removing and re-adding the tool
4. Check `data/logs/` for specific error

### Reports not saving

**Problem**: Reports are generated but not saved

**Solution**:

1. Check `data/reports/` has write permissions
2. Verify `data/settings/app_settings.json` has `"auto_save_reports": true`
3. Check available disk space
4. Look in `data/logs/` for errors

### Settings not persisting

**Problem**: Changes lost after restart

**Solution**:

1. Verify `data/settings/` is writable
2. Check JSON syntax in settings files
3. Restart AutoService if changes are recent
4. Look for file lock issues

## Development: Using Portable Layout

### During Development

Frontend can access data folder:

```javascript
// Get data paths
const dataPaths = await window.__TAURI__.core.invoke("get_data_dirs");
console.log("Data folder:", dataPaths.data_dir);
```

### Building for Distribution

```powershell
# Build executable
pnpm tauri build

# Output locations
src-tauri/target/release/autoservice.exe   # Executable
src-tauri/target/release/bundle/           # Installer

# Copy data folder alongside exe
Copy-Item "data" "src-tauri/target/release/data" -Recurse

# Distribute together
# - autoservice.exe
# - data/
```

## Performance Notes

- **Path resolution** cached during app startup
- **Tool availability** cached in sessionStorage
- **Settings** loaded once at startup
- Minimize I/O for better responsiveness

---

Next: [Contributing](contributing.md)
