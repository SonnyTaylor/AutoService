# Programs Tab

The **Programs** tab lets you manage and launch portable tools and utilities stored in the `data/programs/` folder.

## Overview

The Programs tab displays:

- **Available programs** organized in a grid or list view
- **Program details** (name, version, path)
- **Launch buttons** to run programs
- **Add/Remove options** to manage your program collection

## Viewing Your Programs

Programs are displayed with:

- **Program icon** (if available)
- **Program name**
- **Version** (if specified)
- **Description** (if available)
- **Launch button**

## Launching a Program

1. Find the program you want to launch
2. Click the **"Launch"** or **"Run"** button
3. The program will start in its own window
4. AutoService remains open in the background

## Adding New Programs

To add a new portable tool to AutoService:

1. **Create a folder** in `data/programs/` with the tool name
   - Format: `ToolName - Version` (e.g., `BleachBit - 4.6.0`)
2. **Copy your tool files** into the new folder
   - Executables should be directly in this folder or in a `bin/` subfolder
3. **Optional**: Create a `program.json` file with metadata:

```json
{
  "name": "Tool Name",
  "version": "1.0.0",
  "description": "What this tool does",
  "executable": "tool.exe",
  "icon": "icon.png"
}
```

1. **Refresh AutoService** (may require restart in some cases)
2. Your program should now appear in the Programs tab

## Program Organization

Keep your `data/programs/` folder organized:

```text
data/programs/
├── BleachBit - 4.6.0/
│   ├── bleachbit.exe
│   ├── library/
│   └── ...
├── 7-Zip - 25.01/
│   ├── 7z.exe
│   └── ...
└── YourTool - 1.0/
    ├── yourapp.exe
    └── config.ini
```

## Advanced: Custom Program Entries

You can manually edit `data/settings/programs.json` to configure programs:

```json
{
  "programs": [
    {
      "id": "bleachbit",
      "name": "BleachBit",
      "version": "4.6.0",
      "path": "programs/BleachBit - 4.6.0/bleachbit.exe",
      "description": "Clean up unnecessary files and other traces"
    }
  ]
}
```

## Tips

- **Portable apps work best** - Use portable (non-installing) versions of tools
- **Update paths** - If you move or rename a program folder, update programs.json
- **Add descriptions** - Help users understand what each tool does
- **Use consistent naming** - Makes it easier to find tools later

---

Next: [Scripts Tab](scripts-tab.md)
