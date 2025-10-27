# Scripts Tab

The **Scripts** tab allows you to create, organize, and execute PowerShell and CMD scripts directly from AutoService.

## Overview

Scripts are useful for:

- Automating repetitive administrative tasks
- Running custom maintenance routines
- Automating system configuration
- Creating custom diagnostics
- Batch operations

## Viewing Scripts

The Scripts tab displays:

- List of saved scripts
- Script name and description
- Script type (PowerShell or CMD)
- Launch/edit buttons

## Running a Script

1. Find the script you want to run
2. Click **"Run"** to execute it
3. A terminal window may open showing script output
4. Wait for the script to complete
5. Review any output or results

## Creating a New Script

1. Click **"New Script"** or the **"+"** button
2. Enter a name for your script
3. Choose the interpreter:
   - **PowerShell** - For advanced Windows automation
   - **CMD** - For batch commands and legacy scripts
4. Enter your script content in the editor
5. Click **"Save"**

## Script Examples

### Basic PowerShell Script

```powershell
# Get Windows version
$os = Get-WmiObject Win32_OperatingSystem
Write-Host "OS: $($os.Caption)"
Write-Host "Build: $($os.BuildNumber)"
```

### Basic CMD Script

```batch
@echo off
REM Get system information
systeminfo
```

### Disk Usage Report

```powershell
# Report disk usage by folder
$path = "C:\Users"
Get-ChildItem -Path $path -Directory | ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -Force | Measure-Object -Property Length -Sum).Sum
    Write-Host "$($_.Name): $(("{0:N2}" -f ($size / 1GB)) + ' GB')"
}
```

## Editing Scripts

1. Click the **"Edit"** button on a script
2. Modify the script content
3. Click **"Save"** to update

## Deleting Scripts

1. Find the script you want to remove
2. Click the **"Delete"** or **"X"** button
3. Confirm deletion

## Tips for Script Writing

- **PowerShell**: Use for complex operations and Windows API access
- **CMD**: Use for simple batch operations and compatibility
- **Error Handling**: Include try-catch blocks to handle errors gracefully
- **Output**: Use Write-Host (PowerShell) or echo (CMD) for user feedback
- **Testing**: Test scripts on a non-production system first
- **Comments**: Add comments explaining what the script does

## Important Notes

- Scripts run with **administrator privileges** (same as AutoService)
- Scripts can access **all system resources**
- Be careful with scripts that modify system files
- Always backup data before running unknown scripts
- Test scripts on a test system before production use

---

Next: [System Info Tab](system-info-tab.md)
