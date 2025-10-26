# Trellix Stinger Handler

**Service Type:** `trellix_stinger_scan`

## Overview

Trellix Stinger is a specialized standalone antivirus scanner designed to detect and remove prevalent malware. Unlike full antivirus suites, Stinger is a portable utility ideal for quick scans and cleanup of infected systems.

## Features

- **Smart Scan**: By default, uses Stinger's Smart Scan mode which targets common infection areas
- **Fast Scanning**: Optimized for detecting prevalent threats
- **Portable**: No installation required, perfect for USB drive deployment
- **Two Modes**: Report-only or automatic deletion
- **PUP Detection**: Optional detection of Potentially Unwanted Programs
- **Flexible Scope**: Smart Scan (default) or specific folders
- **HTML Reports**: Generates detailed HTML logs for each scan

## Task Parameters

### Required

- `type`: `"trellix_stinger_scan"`
- `executable_path`: Path to `stinger64.exe` or its containing directory

### Optional

- `action`: `"delete"` (default) or `"report"` - Action to take on detected threats
- `include_pups`: `boolean` (default: `false`) - Detect Potentially Unwanted Programs
- `scan_path`: `string` - Specific folder to scan (defaults to Smart Scan mode)
- `scan_subdirectories`: `boolean` (default: `true`) - Scan subdirectories when `scan_path` is set
- `logs_dir`: `string` - Directory for HTML log output (defaults to `data/logs/Stinger/`)
- `additional_args`: `string[]` - Extra command-line arguments

## Python Service

**Backend:** `runner/services/trellix_stinger_service.py`

### Return Schema

```json
{
  "task_type": "trellix_stinger_scan",
  "status": "success" | "failure",
  "summary": {
    "intent": {
      "action": "delete" | "report",
      "include_pups": boolean,
      "scan_path": string | undefined,
      "scan_subdirectories": boolean | undefined,
      ...
    },
    "version": "13.0.0.553",
    "engine_version": "v6820.10831",
    "virus_data_version": "v9999.0",
    "virus_count": 10068,
    "scan_start_time": "Sunday, October 26, 2025 14:41:58",
    "scan_end_time": "Sunday, October 26, 2025 14:41:58",
    "total_files": 4067,
    "clean_files": 4066,
    "not_scanned": 0,
    "infected_files": 1,
    "infections": [
      {
        "file_path": "C:\\path\\to\\infected.exe",
        "md5": "e7e5fa40569514ec442bbdf755d89c2f",
        "threat_name": "EICAR test file"
      }
    ],
    "log_file": "Z:\\Projects\\AutoService\\data\\logs\\Stinger\\Stinger_DDMMYYYY_HHMMSS.html",
    "exit_code": 0
  }
}
```

## Frontend Components

### Definition (`definition`)

- **ID**: `trellix_stinger_scan`
- **Label**: "Antivirus Scan (Trellix Stinger)"
- **Group**: "Security"
- **Category**: "Antivirus"
- **Tool Keys**: `["trellix_stinger"]`

### Tech Renderer (`renderTech`)

Displays:

- Version information (Stinger, engine, virus definitions)
- Scan statistics (total files, clean, infected)
- Scan configuration flags (mode, PUP detection, scope)
- Scan timestamps
- Detailed infection list with file paths, MD5 hashes, and threat names
- Log file location

### Customer Metrics (`extractCustomerMetrics`)

Extracts customer-friendly metrics when infections are found and deleted:

- Icon: 🛡️
- Label: "Security Threats Removed"
- Value: Number of infections removed
- Detail: "Trellix Stinger Scan"
- Items: List of threat types found

### Parameter Controls (`renderParamControls`)

Builder UI controls:

- **Action**: Dropdown (Delete threats / Report only)
- **Detect PUPs**: Checkbox

## Command-Line Options

Key Stinger options used by the service:

| Option | Description |
|--------|-------------|
| `--GO` | Start scanning immediately (required for CLI) |
| `--SILENT` | Silent mode (no UI, essential for automation) |
| *(none)* | **Default: Smart Scan** - Targets common infection areas when no scan scope specified |
| `--SCANPATH=` | Scan specific directory |
| `--DELETE` | Delete infected files automatically |
| `--REPORTONLY` | Report infections without taking action |
| `--PROGRAM` | Detect Potentially Unwanted Programs |
| `--NOSUB` | Don't scan subdirectories |
| `--REPORTPATH=` | Custom log output directory |
| `--NOBOOT` | Don't scan boot sectors (used with --SCANPATH) |
| `--NOPROCESS` | Don't scan processes (used with --SCANPATH) |
| `--NOREGISTRY` | Don't scan registry (used with --SCANPATH) |
| `--NOROOTKIT` | Don't scan for rootkits (used with --SCANPATH) |
| `--NOWMI` | Don't scan WMI (used with --SCANPATH) |

## Usage Examples

### Smart Scan with Deletion (Default)

```json
{
  "type": "trellix_stinger_scan",
  "executable_path": "data/programs/Trellix Stinger - 13.0.0.553",
  "logs_dir": "data/logs/Stinger",
  "action": "delete",
  "include_pups": true
}
```

### Report-Only Folder Scan

```json
{
  "type": "trellix_stinger_scan",
  "executable_path": "data/programs/Trellix Stinger - 13.0.0.553",
  "logs_dir": "data/logs/Stinger",
  "action": "report",
  "scan_path": "C:\\Users\\Public\\Downloads",
  "scan_subdirectories": false
}
```

## Log File Format

Stinger generates HTML logs with the naming pattern: `Stinger_DDMMYYYY_HHMMSS.html`

**Log Location**: By default, logs are saved to `data/logs/Stinger/` for centralized log management. This keeps the Stinger executable directory clean and makes log review easier.

The service automatically:

1. Creates the logs directory if it doesn't exist
2. Finds the newest log file in the logs directory
3. Parses version information, scan times, and statistics
4. Extracts infection details (file path, MD5, threat name)
5. Returns structured data for UI rendering

## Testing

### Fixtures

- `clean_system.json` - Successful scan with no infections
- `infections_found.json` - Scan with EICAR test file detection
- `report_only.json` - Report-only mode with detection

### EICAR Test File

Use the EICAR test file to verify detection without actual malware:

```text
X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
```

Save as `eicar.txt` in a test folder and run a scan.

## Notes

- **Smart Scan is the default** - Stinger automatically targets common infection areas without scanning all drives, making it faster and more efficient
- Stinger is updated frequently by Trellix with new virus definitions
- The tool is designed for on-demand scanning, not real-time protection
- Scans can take several minutes depending on scope and system size
- Log files accumulate in `data/logs/Stinger/`; consider periodic cleanup
- Exit code 0 is returned even when threats are found and successfully removed
- The `Stinger.opt` configuration file is automatically deleted before each scan to prevent issues from previous runs

## Related Documentation

- [Trellix Stinger Official Documentation](https://www.trellix.com/en-us/downloads/free-tools/stinger.html)
- [Stinger CLI Options Reference](../../../../../../docs/trellix-stinger-cli.md)
