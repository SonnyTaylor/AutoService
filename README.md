<div align="center">
  <img src="https://github.com/SonnyTaylor/AutoService/blob/dev/src-tauri/icons/128x128@2x.png?raw=true" alt="AutoService Logo" width="128" height="128" />
  <h1>AutoService</h1>
  <p><strong>A Swiss-Army knife desktop toolkit for computer repair technicians and power users.</strong><br/>
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
- [Configuration](#configuration)
- [Adding Programs](#adding-programs)
- [Adding Scripts](#adding-scripts)
- [Reports](#reports)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

AutoService is an early-stage Rust + Tauri desktop application (HTML/CSS/vanilla JS frontend) focused on accelerating common service bench tasks:

- Run multiple cleanup, security, and maintenance tools with minimal clicks.
- Collect system information and component test results in one place.
- Provide a consistent portable toolkit you can drop onto any Windows machine from a USB drive.

The project is still in heavy development; many flows are prototypes or stubs. Feedback & contributions welcome.

## Key Concepts

- **Automation First**: Orchestrate tools like ClamAV, Windows Defender, CCleaner, BleachBit (more planned) and eventually consolidate their outputs.
- **Extensible Catalogs**: User‑editable lists (JSON) for programs and scripts so technicians can tailor their toolkit.
- **Portable Data Folder**: A sibling `data/` directory travels with the built EXE (ideal for USB use).
- **Low Friction UI**: Plain HTML/CSS/JS for fast iteration; Rust backend for execution, spawning tools, and future reporting logic.

## Features

Current & planned surface (implemented portions are minimal or WIP unless marked stable):

### Automation & Maintenance
- Launch / orchestrate third‑party utilities (ClamAV, Defender, CCleaner, BleachBit, etc.).
- Planned: unified run queue + progress + error capture.
- Planned: post‑run artifact collection and summary report.

### Diagnostics & System Info
- System info page (hardware / OS snapshot – scope expanding).
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

When built, place the executable and this folder structure together on a USB stick:

```
AutoService.exe
data/
  programs/           # Portable tool folders (e.g. ClamAV, CCleaner, etc.)
  logs/               # Raw logs captured from tool runs
  reports/            # Generated report outputs (planned)
  resources/          # Any auxiliary binaries/resources
  settings/
    app_settings.json
    programs.json     # User-maintained list of launchable programs
    scripts.json      # User-maintained script definitions
```

The app reads and (eventually) writes within `data/` so user customizations persist across target machines.

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
pnpm tauri dev
```

### Build Portable EXE

```powershell
pnpm tauri build
```

The build output (under `src-tauri/target/` per Tauri conventions) can be moved alongside your prepared `data/` folder.

## Configuration

Configuration lives in `data/settings/`:

- `app_settings.json` – global app prefs (WIP fields).
- `programs.json` – array of program definitions (name, path, maybe arguments – schema evolving).
- `scripts.json` – script entries (id, description, interpreter, content or path).

These JSON files are meant to be human‑editable but its just easier to edit within AutoService.

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

Report generation is not functional yet. The intended pipeline:

1. Queue selected maintenance / scan tasks.
2. Execute each tool, capturing exit status, timings, and log pointers.
3. Normalize findings (threats removed, files cleaned, issues flagged).
4. Emit a consolidated JSON + human‑readable HTML report into `data/reports/` with timestamp naming.

Contributions toward this normalization layer are especially welcome.

## Roadmap

Planned (unordered) – check issues for details:

- Core automation queue & progress UI
- Log collection + normalization adapters (ClamAV, Defender, CCleaner, BleachBit, etc.)
- First pass HTML/JSON report generator
- Additional component tests (storage benchmarks, stress, sensors)
- Export tech summary (quick ticket attachment)
- Optional integrity hash list for portable tools
- UI polish (dark mode, responsive layout)
- Basic plugin architecture (register new task types)

## Contributing

Ways to help:

1. File issues with clear reproduction / proposal.
2. Implement a small self‑contained enhancement (mark WIP in PR).
3. Improve JSON schema validation / runtime checks.
4. Prototype a report adapter for one tool.
5. Documentation improvements (screens, usage notes, troubleshooting).

Suggested PR flow:

```bash
gh repo fork
git checkout -b feature/short-description
# commit changes
git push origin feature/short-description
# open PR
```

Please keep PRs focused; open an issue first for larger refactors.

## License

Distributed under the GNU General Public License v3.0. See `LICENSE` for details.

---

If this is useful, a star helps visibility. Feedback & ideas welcome via issues.

> NOTE: AutoService is experimental and not yet suitable for production repair reporting; verify results manually.