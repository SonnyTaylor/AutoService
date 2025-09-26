<div align="center">
  <img src="https://github.com/SonnyTaylor/AutoService/blob/dev/src-tauri/icons/128x128@2x.png?raw=true" alt="AutoService Logo" width="128" height="128" />
  <h1>AutoService</h1>
  <p><strong>A Windows 10/11 Swiss-Army knife desktop toolkit for computer repair technicians and power users.</strong><br/>
  Automate cleanup, diagnostics, testing, scripted workflows, and reporting – from a single portable executable.</p>
  <p>
    <a href="#getting-started">Getting Started</a> ·
    <a href="#features">Features</a> ·
    <a href="#roadmap">Roadmap</a> ·
    <a href="https://github.com/SonnyTaylor/AutoService/issues">Issues</a>
  </p>
  <img src="src-tauri/icons/autoservice_github.gif" alt="AutoService Demo" width="640" />
</div>

<p align="center">
  <a href="https://github.com/SonnyTaylor/AutoService/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/SonnyTaylor/AutoService?style=flat" /></a>
  <a href="https://github.com/SonnyTaylor/AutoService/issues"><img alt="Issues" src="https://img.shields.io/github/issues/SonnyTaylor/AutoService" /></a>
  <a href="https://github.com/SonnyTaylor/AutoService/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/License-GPLv3-blue.svg" /></a>
  <a href="https://github.com/SonnyTaylor/AutoService/commits/dev"><img alt="Last Commit" src="https://img.shields.io/github/last-commit/SonnyTaylor/AutoService/dev" /></a>
  <a href="https://github.com/SonnyTaylor/AutoService/releases"><img alt="Latest Release" src="https://img.shields.io/github/v/release/SonnyTaylor/AutoService?display_name=tag" /></a>
  <a href="https://github.com/SonnyTaylor/AutoService/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/SonnyTaylor/AutoService" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-blue?logo=windows" />
  <img alt="Built With" src="https://img.shields.io/badge/Built%20with-Tauri%20%2B%20Rust-orange?logo=tauri" />
  <img alt="Commit Activity" src="https://img.shields.io/github/commit-activity/m/SonnyTaylor/AutoService" />
</p>

## Table of Contents

- [Overview](#overview)
- [Key Concepts](#key-concepts)
- [Features](#features)
- [Portable Layout](#portable-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone & Install](#clone--install)
  - [Run (Dev)](#run-dev)
  - [Build Portable EXE](#build-portable-exe)
- [Service Runner](#service-runner)
- [Configuration](#configuration)
- [Adding Programs](#adding-programs)
- [Adding Scripts](#adding-scripts)
- [Reports](#reports)
- [Roadmap](#roadmap)
- [License](#license)

## Overview

AutoService is a Rust + Tauri desktop application (HTML/CSS/vanilla JS frontend) for Windows focused on accelerating common service bench tasks:

- Run multiple cleanup, security, and maintenance tools with minimal clicks.
- Collect system information and component test results in one place.
- Provide a consistent portable toolkit you can drop onto any Windows machine from a USB drive.

The project is under active development; flows are maturing quickly. Feedback & contributions welcome.

## Key Concepts

- **Automation First**: Orchestrate tools like AdwCleaner, BleachBit, SFC, DISM, smartctl, HeavyLoad, FurMark, with a growing catalog.
- **Run Queue Builder**: Build an ordered run of tasks (with durations/toggles) directly from the UI; JSON is generated for the runner.
- **Extensible Catalogs**: User‑editable lists (JSON) for programs and scripts so technicians can tailor their toolkit.
- **Portable Data Folder**: A sibling `data/` directory travels with the built EXE (ideal for USB use).
- **Low Friction UI**: Plain HTML/CSS/JS for fast iteration; Rust backend for system operations, Python runner for automation.

## Features

Current & planned surface (implemented portions are minimal or WIP unless marked stable):

### Automation & Maintenance

- Run Queue Builder (Service → Run) with presets and drag‑reorder.
- Tasks include: AdwCleaner clean, BleachBit junk cleanup, SFC, DISM health check, smartctl drive report.
- GPU/CPU/RAM stress: FurMark and HeavyLoad (select toggles, set durations).
- Live availability checks based on detected tools and saved programs.

### Diagnostics & System Info

- System info snapshot (hardware / OS; more to come).
- Component testing: camera, microphone, speakers, mouse, display, basic network tests.

### Convenience Shortcuts

- Quick links to common Windows management surfaces (Control Panel, Device Manager, etc.).

### Programs Page

- Display & launch curated tools stored inside `data/programs/`.
- Add your own folders (portable apps, utilities) without code changes.

### Scripts Page

- Maintain a catalog of frequently used PowerShell / CMD scripts.
- Run scripts from the UI (execution plumbing expanding).

### Reports (Early)

- Stub UI for past reports listing (`data/reports/`).
- Planned: HTML/JSON report generation after automation batches.

### Settings

- Adjust app behavior & paths via JSON (`settings/`).

## Portable Layout

AutoService is designed to be compiled and run from a USB drive (or locally) alongside a portable data folder. Place the executable next to the `data/` folder like so:

```
AutoService.exe
data/                 # aka @data/
  programs/           # Portable tools (e.g., BleachBit, AdwCleaner, HeavyLoad, FurMark, smartctl)
  logs/               # Logs captured from tool runs
  reports/            # JSON/HTML reports (planned; some JSON available via runner)
  resources/          # Auxiliary binaries/resources (e.g., resources/bin)
  settings/
    app_settings.json
    programs.json     # User-maintained list of launchable programs
    scripts.json      # User-maintained script definitions
```

The app reads and writes within `data/` so user customizations persist across target machines. Keep the structure intact when copying to a USB drive.

## Getting Started

### Prerequisites

- Windows (primary target at this stage).
- Recent Node.js + pnpm.
- Rust toolchain (for Tauri backend; install via <https://rustup.rs/>).

### Clone & Install

```powershell
git clone https://github.com/SonnyTaylor/AutoService.git
cd AutoService
pnpm install
```

### Run (Dev)

```powershell
# Frontend only
pnpm dev

# Full app with Tauri (hot reload)
pnpm tauri dev
```

### Build Portable EXE

```powershell
pnpm tauri build
```

The build output (under `src-tauri/target/` per Tauri conventions) can be moved alongside your prepared `data/` folder.

## Service Runner

I originally wanted autoservice to use rust to run and automate programs but my rust knowledge was too limited to get me anywhere so i decided to go with having an external python binary to handle the running of services instead. It executes tasks defined by the Run Queue Builder or ad‑hoc JSON. Highlights:

- Windows UAC elevation is requested automatically when a task requires admin.
- Streams progress lines to stderr so the UI can show live updates.
- Emits a final JSON report to stdout; optionally writes to `--output-file`.

CLI usage examples:

```powershell
# Pass raw JSON describing tasks
python runner/service_runner.py '{
  "tasks": [
    { "type": "bleachbit_clean" },
    { "type": "sfc_scan" },
    { "type": "dism_health_check" },
    { "type": "smartctl_report" },
    { "type": "heavyload_stress_test", "duration_minutes": 2, "stress_cpu": true }
  ]
}' --output-file data/reports/run_%DATE%.json --log-file data/logs/runner.log

# Or read JSON from a file path
python runner/service_runner.py data/reports/preset_run.json -o data/reports/result.json
```

Progress markers sent to stderr include:

- `TASK_START:<index>:<type>` / `TASK_OK:<index>:<type>` / `TASK_FAIL:<index>:<type>` / `TASK_SKIP`.
- `PROGRESS_JSON:{...}` snapshots during the run and `PROGRESS_JSON_FINAL:{...}` at completion.

## Configuration

Configuration lives in `data/settings/`:

- `app_settings.json` – global app prefs (WIP fields).
- `programs.json` – array of program definitions (name, path, maybe arguments – schema evolving).
- `scripts.json` – script entries (id, description, interpreter, content or path).

These JSON files are human‑editable; you can also manage them from within AutoService.

## Adding Programs

1. Drop the tool (portable folder or executable) into `data/programs/YourToolName/`.
2. Add / edit an entry in the programs page referencing it.
3. Relaunch (or later: refresh) AutoService – it should appear on the Programs page.

## Adding Scripts

1. Open scripts page
2. Enter script name, version, command, etc
3. Save
4. Use the Scripts page to run it (execution feedback still basic).

## Reports

Report generation is in progress. The intended pipeline:

1. Queue selected maintenance / scan tasks.
2. Execute each tool, capturing exit status, timings, and log pointers.
3. Normalize findings (threats removed, files cleaned, issues flagged).
4. Emit a consolidated JSON + human‑readable HTML report into `data/reports/` with timestamp naming.

Contributions toward this normalization layer are especially welcome.

## Roadmap

Planned (unordered) – check issues for details:

- First pass HTML/JSON report generator
- Additional component tests (storage benchmarks, stress, sensors)
- Export tech summary (quick ticket attachment)
- Optional integrity hash list for portable tools
- UI polish (light mode, responsive layout)
- Basic plugin architecture (register new task types)

## License

Distributed under the GNU General Public License v3.0. See `LICENSE` for details.
