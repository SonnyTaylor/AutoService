---
hide:
  - toc
---

# User Guide Overview

## :material-star-circle: What You Can Do With AutoService

AutoService is a comprehensive toolkit designed to make computer maintenance and diagnostics faster and more consistent. Whether you're a technician servicing multiple systems or a power user maintaining your own machine, AutoService provides a unified interface to run complex maintenance routines.

### Core Capabilities

<!-- markdownlint-disable MD030 MD007 MD050 MD033 -->

<div class="grid cards" markdown>

-   :material-broom: **Automated Maintenance**

    ---

    Queue and execute multiple tools:

    - Cleanup: BleachBit, AdwCleaner, Drive Cleanup
    - Maintenance: Windows Update, SFC, DISM
    - Diagnostics: CHKDSK, SMART reports, battery health
    - Security: KVRT, Trellix Stinger scans

-   :material-chip: **System Information**

    ---

    Complete hardware & software snapshot:

    - Processor details and capabilities
    - Memory configuration
    - Storage and drive information
    - Battery status and health
    - Operating system details
    - GPU and display information

-   :material-test-tube: **Component Testing**

    ---

    Validate individual hardware:

    - Camera: Webcam functionality
    - Microphone: Audio input testing
    - Speakers: Audio output validation
    - Display: Screen and color tests
    - Input Devices: Keyboard & mouse
    - Network: Connectivity checks

-   :material-application-brackets: **Portable Tools**

    ---

    Manage external applications:

    - Launch tools from `data/programs/`
    - Add custom tools without code changes
    - Organize by category
    - Quick access from UI

-   :material-script-text: **Script Management**

    ---

    Execute automation scripts:

    - PowerShell and CMD support
    - Catalog frequently used scripts
    - Run directly from interface
    - Manage script library

-   :material-file-document: **Report Generation**

    ---

    Two report types:

    - Technical: Full diagnostic data
    - Customer: Simplified summaries
    - Export as PDF, JSON, or HTML
    - Auto-save after runs

</div>

<!-- markdownlint-enable MD030 MD007 MD050 MD033 -->

### Main Interface Areas

AutoService is organized into tabs across the top of the window:

| Tab                | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| **Service**        | Run automated maintenance and diagnostic tasks using the queue builder |
| **System Info**    | View detailed hardware and OS information                              |
| **Component Test** | Test individual hardware components                                    |
| **Shortcuts**      | Quick links to Windows management tools                                |
| **Programs**       | Launch portable tools and utilities                                    |
| **Scripts**        | Run and manage PowerShell/CMD scripts                                  |
| **Reports**        | Access previously generated reports                                    |
| **Settings**        | Configure AutoService behavior and preferences                         |

!!! info "Portable Design"

    AutoService is designed to work from a USB drive or any location alongside a `data/` folder. Keep the executable and data folder together for full functionality.

    ```text
    AutoService.exe            # Main application
    data/
    ├── programs/              # Your portable tools
    ├── resources/             # Autoservice executables and assets
    ├── settings/              # Configuration files
    ├── reports/               # Generated reports
    └── logs/                  # Execution logs from AutoService and other tools
    ```

    This portability means:
    - Run from USB on any Windows system
    - Configurations and tools travel with the executable
    - No installation required
    - Leave no traces on the host system

## Typical Workflow

A typical technician workflow looks like this:

1. **Open AutoService** on the target system
2. **Navigate to the Service tab** and select maintenance tasks from the catalog
3. **Build a queue** of tasks you want to run (drag to reorder if needed)
4. **Execute the queue** with one click
5. **View live progress** as tasks execute
6. **Review results** with detailed technical or customer-friendly reports
7. **Save or export the report** for records or customer handoff

!!! info "What You'll Need"

    ### Minimum Requirements

    - Windows 10 or later
    - Administrator access for some tasks (UAC prompt will appear as needed)
    - The `data/` folder alongside the AutoService executable

    ### Recommended

    - 4GB RAM for stress testing
    - Portable tools installed in `data/programs/` (setup during initialization)
    - Network connection for online tests and updates

## Getting Help

Each tab in AutoService includes helpful tooltips and descriptions. Hover over icons and labels to learn more about specific features. The **Settings** tab also provides configuration explanations.

For technical questions or to report issues, visit the [GitHub repository](https://github.com/SonnyTaylor/AutoService/issues).

---

Next: [Getting Started →](getting-started.md)
