# Service Tab - Task Automation

The **Service** tab is the heart of AutoService—where you build and execute automated maintenance and diagnostic tasks.

## Overview

The Service tab consists of three main views:

1. **Presets** (default view) - Pre-built task collections for common scenarios
2. **Builder** - Customize and queue individual tasks
3. **Runner** - Execute queued tasks and monitor progress
4. **Results** - Review completed task reports

## The Builder Interface

### Service Catalog (Left Panel)

The left side shows available services organized by category:

- **Diagnostics**

  - Disk Space Report - Analyze disk usage and free space
  - SMART Drive Report - Drive health and S.M.A.R.T. data
  - CHKDSK Scan - Check disk for errors
  - Battery Health Report - Battery status and health
  - WINSAT Disk - Disk performance benchmarking

- **System Maintenance**

  - SFC Scan - Verify system file integrity
  - DISM Health Check - System image health check
  - Windows Update - Install available updates
  - Why Not Win11 - Check Windows 11 compatibility

- **Cleanup & Security**

  - BleachBit Clean - Remove temporary files and cache
  - AdwCleaner Clean - Remove adware and PUPs
  - Drive Cleanup - Remove large unnecessary files
  - KVRT Scan - Kaspersky virus removal tool
  - Trellix Stinger - McAfee malware removal

- **Stress Testing**

  - HeavyLoad CPU Stress - CPU load testing
  - HeavyLoad Memory Stress - RAM stress testing
  - HeavyLoad GPU Stress - GPU load testing
  - FurMark Stress Test - Graphics stress testing

- **Network & Connectivity**

  - Ping Test - ICMP connectivity test
  - Speed Test - Internet speed benchmark
  - iPerf Test - Network performance testing

- **Optimization**
  - AI Startup Disable - Remove startup programs
  - AI Browser Notification Disable - Disable browser notifications

### Task Queue (Right Panel)

Your queued tasks appear here in execution order. For each task, you can:

- **View parameters** - Click on a task to see adjustable settings
- **Reorder** - Drag tasks up or down to change execution order
- **Remove** - Click the X to remove a task from the queue
- **Adjust settings** - Modify parameters like stress test duration before running

## Adding Tasks to Your Queue

### Step 1: Search or Browse

- Scroll through the catalog, or
- Use the search box to find specific tasks quickly

### Step 2: Click to Add

Click on any service in the left panel to add it to your queue. The task appears in the right panel with default settings.

### Step 3: Configure (Optional)

Some tasks have configurable parameters:

- **Stress Tests**: Set duration (in minutes)
- **Network Tests**: Set target server or parameters
- **Cleanup Tasks**: Choose what types of files to clean

Click on a queued task to reveal its configuration options.

### Step 4: Reorder as Needed

Drag tasks up or down in the queue to set the execution order. For example:

1. System diagnostics first (check drive health)
2. Cleanup tasks (remove unnecessary files)
3. Security scans (verify no threats)
4. Stress tests last (test stability after cleanup)

## Presets

Presets are pre-configured task queues for common scenarios:

- **Quick Check** - Basic diagnostics (5-10 minutes)
- **Full Maintenance** - Complete cleanup and diagnostics (30-45 minutes)
- **Security Scan** - Comprehensive security checks (15-20 minutes)
- **Hardware Stress** - Full stress testing suite (varies by duration)

To use a preset:

1. Click the **Presets** tab
2. Select a preset from the list
3. Review the queued tasks
4. Click **Run** to execute, or customize further in the **Builder**

## Running Your Queue

!!! warning "Before You Start"

    - **Save your work** on the target system
    - **Close other applications** to prevent interference
    - **Ensure admin privileges** (UAC prompt may appear)
    - **Plan for time**: Check estimated duration

### Starting Execution

1. Click the **Run** button after building your queue
2. You'll be taken to the **Runner** view
3. Execution begins automatically

### Monitoring Progress

During execution, you see:

- **Current task** name and description
- **Progress bar** showing overall completion
- **Task status** (Running, Completed, Failed, Skipped)
- **Live output** from the executing tool
- **Elapsed time** for the current task
- **Estimated time remaining**

### What to Expect

- **Normal tasks** (SFC, DISM) may show no output initially
- **Scans** will show progress bars or file counts
- **Stress tests** will show CPU/Memory/GPU usage
- **Some tasks require admin elevation** - UAC prompts may appear
- **Some tasks take longer** - Be patient; don't interrupt

## Canceling Execution

!!! warning "Interrupting Tasks"
Some tasks may take a moment to shut down gracefully. Avoid force-closing AutoService during execution.

If you need to stop the queue:

- Click the **"Cancel"** or **"Stop"** button
- Currently executing task will be interrupted
- Already completed tasks are saved

## Viewing Results

After execution completes (or is canceled), navigate to the **Results** view:

### Technical View

Shows detailed technical information:

- Raw output from each tool
- Performance metrics and data
- Detailed error messages if any
- Complete execution logs

Use this view for:

- Diagnosing issues
- Technical reference
- Archival records

### Customer View

Shows a simplified, professional summary:

- Key findings only
- Issues and recommendations
- Files cleaned / space freed
- Security threats found
- Performance improvements

Use this view for:

- Customer communication
- Service documentation
- Quick summary reference

### Printing & Exporting

From the results view, you can:

- **Print** both technical and customer views
- **Save as PDF** for archival or email
- **Download JSON** for data analysis
- **Copy to clipboard** for pasting into documents

## Common Workflow Examples

### Quick System Check (15 minutes)

1. Add **Disk Space Report**
2. Add **SMART Drive Report**
3. Add **SFC Scan**
4. Run and review
5. Export results

### Full Maintenance (45 minutes)

1. Add **Disk Space Report** (before)
2. Add **AdwCleaner Clean**
3. Add **BleachBit Clean**
4. Add **Drive Cleanup**
5. Add **Windows Update**
6. Add **SFC Scan**
7. Add **Disk Space Report** (after, to compare)
8. Run and review

### Pre-Sale Diagnostics

1. Add **System Info** (base snapshot)
2. Add **SMART Drive Report**
3. Add **Battery Health Report** (if laptop)
4. Add **Windows Update** (if needed)
5. Add **CHKDSK Scan** (if drive issues suspected)
6. Run and generate customer report

### Hardware Validation

1. Add **WINSAT Disk** (performance baseline)
2. Add **HeavyLoad CPU Stress** (5 minutes)
3. Add **HeavyLoad Memory Stress** (5 minutes)
4. Add **FurMark Stress Test** (5 minutes)
5. Run and monitor system stability
6. Review temperatures and results

!!! tip "Tips for Efficient Runs"

    - **Group similar tasks** - Do diagnostics first, then cleanup, then stress tests
    - **Run overnight** for long maintenance routines (if UAC will allow it)
    - **Check tool availability** before queuing - If a tool is missing, the task will fail
    - **Generate both reports** - Technical for reference, customer for handoff
    - **Save results** - Store reports for future reference or comparison

## Troubleshooting

!!! failure "Tasks Fail Immediately"

    **Causes:**
    - Required tool is missing or not in PATH
    - Task requires administrator privileges but run without elevation
    - System doesn't meet task requirements

    **Solution:**
    - Check Settings → Tools for missing tools
    - Re-run AutoService as administrator
    - Check logs in `data/logs/` for specific error

!!! warning "Progress Seems Stuck"

    **Causes:**
    - Long-running task (SFC, DISM can take 15+ minutes)
    - Tool is responding but not showing output
    - System is busy with other processes

    **Solution:**
    - Wait longer before canceling (check system resource usage)
    - Check Windows Task Manager for tool processes
    - Close other applications to free resources

!!! info "Some Tasks Skipped"

    **Causes:**
    - Tool not available on this system
    - Task requirements not met
    - System configuration prevents execution

    **Solution:**
    - Check skip reason in results
    - Install missing tools via Programs tab
    - Verify system configuration

---

Next: [Learn about Programs Tab](programs-tab.md)
