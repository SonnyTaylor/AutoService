# Getting Started with AutoService

## :material-rocket-launch: Initial Setup

!!! info "Prerequisites"

    === "Operating System"
        - Windows 10 (20H1 or later)
        - Windows 11 (all versions)

    === "Permissions"
        - Administrator access for diagnostic tasks
        - UAC approval for elevated operations

    === "Disk Space"
        - 100 MB minimum for app + logs
        - Additional space for tool downloads

---

### Download & Extract

=== "Step 1: Download"

    Download the latest AutoService release:

    [:fontawesome-brands-github: GitHub Releases](https://github.com/SonnyTaylor/AutoService/releases){ .md-button .md-button--primary }

=== "Step 2: Extract"

    Move the .exe to the USB and extract the /data folder alongside it.

=== "Step 3: Verify Structure"

    Ensure you have these files (some may be created on first run):

    ```text title="Expected Directory Structure"
    📂 AutoService/
    ├── 📄 AutoService.exe       # Main application
    └── 📂 data/                 # Data folder
        ├── 📂 programs/         # External tools
        ├── 📂 resources/        # App resources
        ├── 📂 settings/         # Configuration
        ├── 📂 reports/          # Generated reports
        └── 📂 logs/             # Execution logs
    ```

---

### First Launch

!!! warning "Administrator Privileges Required"

    AutoService requires administrator privileges for most diagnostic tasks.

    **How to launch:**

    1. Right-click `AutoService.exe`
    2. Select **"Run as administrator"**
    3. Accept the UAC prompt

!!! success "What Happens on First Launch"

    1. :heavy_check_mark: Application initializes
    2. :heavy_check_mark: Data folder is validated
    3. :heavy_check_mark: Default settings are loaded
    4. :heavy_check_mark: Interface opens with tabs visible

## :material-monitor-dashboard: Understanding the Main Interface

AutoService uses a clean tab-based interface for easy navigation:

<div class="grid" markdown>

<div markdown>

| Tab | Purpose |
|-----|---------|
| :material-cog: **Service** | Run automated maintenance & diagnostics |
| :material-information: **System Info** | View hardware and OS details |
| :material-test-tube: **Component Test** | Test hardware components |
| :material-link-variant: **Shortcuts** | Quick links to Windows tools |

</div>

<div markdown>

| Tab | Purpose |
|-----|---------|
| :material-application: **Programs** | Manage portable tools |
| :material-script-text: **Scripts** | Execute PowerShell/CMD scripts |
| :material-file-document: **Reports** | Access previous reports |
| :material-cog-outline: **Settings** | Configure AutoService |

</div>

</div>

## :material-play-circle: Your First Maintenance Run

Follow these steps to run your first automated maintenance session:

=== "1. Navigate to Service Tab"

    Click the **Service** tab at the top of the window.

    **Interface Layout:**

    - **Left Panel**: Available services organized by category
    - **Right Panel**: Your task queue (drag to reorder)
    - **Top Bar**: Run controls and presets

=== "2. Select Services"

    Browse and select services by category:

    | Category | Examples |
    |----------|----------|
    | :material-stethoscope: **Diagnostics** | Disk checks, SMART reports, battery health |
    | :material-broom: **Cleanup** | BleachBit, AdwCleaner, temp files |
    | :material-shield-check: **Security** | KVRT scan, Stinger scan |
    | :material-fire: **Stress Tests** | CPU, GPU, memory tests |
    | :material-update: **Maintenance** | Windows Update, SFC, DISM |

    **Click a service** to add it to your queue.

=== "3. Build Your Queue"

    Customize your task sequence:

    - **Drag & Drop**: Reorder tasks vertically
    - **Remove**: Click :material-close: to remove a task
    - **Configure**: Adjust parameters (duration, options)
    - **Save Preset**: Save queue for reuse

=== "4. Run Queue"

    Click **Run** to begin execution.

    **Live Feedback:**

    - :heavy_check_mark: **Task Progress**: Real-time status for each task
    - 📊 **Duration**: Elapsed and estimated time
    - 📝 **Output**: Live logs from tools
    - 🔔 **Notifications**: Audio alerts on completion

=== "5. Review Results"

    View comprehensive results after completion:

    **Two Report Types:**

    | Report Type | Audience | Content |
    |-------------|----------|---------|
    | **Technical** | Technicians | Full diagnostic data, raw outputs, detailed findings |
    | **Customer** | End Users | Simplified summary, recommendations, key metrics |

## :material-wrench: Troubleshooting

<div class="grid" markdown>

<div markdown>

!!! failure "AutoService Won't Start"

    **Symptoms**: Double-click does nothing or immediate crash

    **Solutions**:

    1. Right-click → "Run as administrator"
    2. Verify Windows 10+ (20H1 or later)
    3. Check `data/` folder exists beside EXE
    4. Review `data/logs/` for error details
    5. Temporarily disable antivirus
    6. Re-extract from original ZIP

!!! warning "Tasks Keep Failing"

    **Symptoms**: Tasks show error status repeatedly

    **Solutions**:

    1. Go to Settings → Tools tab
    2. Verify required tools are installed
    3. Update outdated tool versions
    4. Ensure administrator access
    5. Check `data/logs/` for specifics
    6. Run individual tools manually to test

</div>

<div markdown>

!!! error "Reports Not Generating"

    **Symptoms**: No report after queue completion

    **Solutions**:

    1. Check free disk space (need ≥ 50MB)
    2. Verify write permissions in `data/`
    3. Look in `data/reports/` manually
    4. Check for antivirus quarantine
    5. Run AutoService as administrator
    6. Review `data/logs/` for errors

!!! bug "Slow Performance"

    **Symptoms**: UI freezes or tasks take too long

    **Solutions**:

    1. Close other resource-heavy apps
    2. Check Task Manager for conflicts
    3. Reduce stress test durations
    4. Run fewer tasks simultaneously
    5. Check drive health (SMART report)
    6. Ensure adequate RAM (4GB+ recommended)

</div>

</div>

!!! question "Still Having Issues?"

    **Get Help:**

    1. Check existing [GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues)
    2. Search the documentation
    3. Open a new issue with:
        - Windows version
        - AutoService version
        - Steps to reproduce
        - Error logs from `data/logs/`

## Next Steps

Now that you understand the basics:

- **[Learn about the Service Tab](service-tab.md)** - Deep dive into task automation
- **[Explore Programs Tab](programs-tab.md)** - Manage portable tools
- **[Configure Settings](settings-tab.md)** - Customize AutoService behavior
- **[View System Information](system-info-tab.md)** - Understand your hardware

---

**Need Help?** Check the [Overview](overview.md) for more details on what AutoService can do, or visit the [GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues) page.
