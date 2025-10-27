# User Guide Overview

## What You Can Do With AutoService

AutoService is a comprehensive toolkit designed to make computer maintenance and diagnostics faster and more consistent. Whether you're a technician servicing multiple systems or a power user maintaining your own machine, AutoService provides a unified interface to run complex maintenance routines.

### Core Capabilities

#### 1. Run Automated Maintenance Tasks

Queue up and run multiple maintenance and diagnostic tools in sequence:

- **Cleanup**: BleachBit, AdwCleaner, Drive Cleanup
- **System Maintenance**: Windows Update, SFC (System File Checker), DISM (Deployment Image Servicing and Management)
- **Diagnostics**: Disk checks (CHKDSK), SMART drive reports, battery health checks
- **Security Scans**: KVRT (Kaspersky Virus Removal Tool), Trellix Stinger
- **Hardware Stress Testing**: CPU, Memory, and GPU stress tests (HeavyLoad, FurMark)
- **Network Testing**: Speed tests, ping tests, iPerf testing

#### 2. Collect System Information

Get a complete snapshot of your system's hardware and software configuration:

- Processor details and capabilities
- Memory information
- Storage and drive information
- Battery status and health
- Operating system details
- GPU and display information
- And more

#### 3. Component Testing

Test individual hardware components:

- **Camera**: Test webcam functionality
- **Microphone**: Audio input testing
- **Speakers**: Audio output testing
- **Display**: Screen and color testing
- **Keyboard & Mouse**: Input device testing
- **Network**: Connectivity verification

#### 4. Manage Portable Tools

Organize and launch portable applications stored in the `data/programs/` folder. Add your own tools without any code changes—just drop them into the programs folder and they'll appear in AutoService.

#### 5. Run Scripts

Maintain a catalog of PowerShell and CMD scripts. Run frequently used automation scripts directly from the AutoService interface.

#### 6. Generate Reports

After running maintenance tasks, AutoService generates two types of reports:

- **Technical Reports**: Detailed findings with full diagnostic data, suitable for technician reference
- **Customer Reports**: Simplified, customer-friendly summaries highlighting key findings and recommendations

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
| **Settings**       | Configure AutoService behavior and preferences                         |

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
