# Getting Started with AutoService

## Initial Setup

!!! info "Prerequisites"

    - Windows 10 or later
    - Administrator access (required for some diagnostic and maintenance tasks)
    - At least 100 MB free disk space for the application and logs

### Download & Extract

1. Download the latest AutoService release from [GitHub Releases](https://github.com/SonnyTaylor/AutoService/releases)
2. Extract the ZIP file to your preferred location (USB drive recommended for portability)
3. You should have:
   - `AutoService.exe` - the main application
   - `data/` - the data folder containing programs, settings, and resources

### First Launch

!!! warning "Administrator Privileges Required"
AutoService requires administrator privileges for most diagnostic tasks. Right-click `autoservice.exe` and select "Run as administrator" if UAC prompts don't appear automatically.

1. Run autoservice.exe and accept any UAC prompts
   - Some features require elevated privileges for system access
2. The application will launch and perform initial setup
3. The interface will show several tabs across the top

## Understanding the Main Interface

AutoService uses a tab-based interface for organization:

| Tab            | Purpose                                   |
| -------------- | ----------------------------------------- |
| Service        | Run automated maintenance and diagnostics |
| System Info    | View hardware and OS details              |
| Component Test | Test hardware components                  |
| Shortcuts      | Quick links to Windows tools              |
| Programs       | Manage and launch portable tools          |
| Scripts        | Execute cmd scripts                       |
| Reports        | Access previous reports                   |
| Settings       | Configure AutoService                     |

## Your First Maintenance Run

### Step 1: Navigate to the Service Tab

Click the **Service** tab at the top of the window. You'll see two main sections:

- **Left panel**: Available services organized by category
- **Right panel**: Your task queue

### Step 2: Select Services to Run

Browse through the available services:

- **Diagnostics**: Disk checks, drive reports, system checks
- **Cleanup**: File cleanup, registry optimization, temporary file removal
- **Security**: Virus scans, security checks
- **Stress Tests**: Hardware performance testing
- **System Maintenance**: Updates, system file checks

Click on a service to add it to your queue.

### Step 3: Build Your Queue

Services appear in the right panel in the order they'll execute. You can:

- **Drag and drop** to reorder tasks
- **Click the ☑️** to remove a task
- **Adjust parameters** (like stress test duration) if available

### Step 4: Run Your Queue

Click the **"Run"** or **"Start"** button to begin execution. You'll see:

- **Live progress** of each task
- **Current status** indicators
- **Task duration** and completion percentage
- **Real-time output** from the executing tools

### Step 5: Review Results

When the queue completes, AutoService displays results:

- **Technical view**: Detailed findings and raw data
- **Customer view**: Simplified, professional summary
- **Export options**: Save as PDF, JSON, or HTML

## Common Tasks

### Running a Quick System Check

1. Go to **Service** tab
2. Add these services:
   - Disk Space Report
   - SMART Drive Report
   - System File Check (SFC)
3. Click **Run**
4. Review results when complete

### Stress Testing Your Hardware

1. Go to **Service** tab
2. Add stress test services:
   - HeavyLoad CPU Stress (set duration, e.g., 5 minutes)
   - HeavyLoad Memory Stress
   - FurMark GPU Stress
3. Click **Run**
4. Monitor system performance during testing
5. Review results and ensure temperatures are within normal range

### Cleaning Up a System

1. Go to **Service** tab
2. Add cleanup services:
   - BleachBit Clean
   - AdwCleaner Clean
   - Drive Cleanup
3. Configure cleanup options if available
4. Click **Run**
5. Verify the cleanup report for freed disk space

### Viewing System Information

1. Click the **System Info** tab
2. Browse through the available information:
   - Hardware specifications
   - Storage details
   - Operating system info
   - GPU information
   - Network configuration

### Launching a Portable Tool

1. Click the **Programs** tab
2. Browse available programs
3. Click on a program to launch it
4. The program will open in its own window

## Tips & Best Practices

!!! warning "Before Running on a Client System"

    - **Backup Important Data**: Always ensure client data is backed up
    - **Communicate Your Plan**: Inform the client what tasks you'll run
    - **Note Initial State**: Take screenshots or notes of the starting condition
    - **Read Task Descriptions**: Understand what each task does before running

!!! tip "During Execution"

    - **Don't Force Quit**: Let tasks complete naturally (some take time)
    - **Monitor Performance**: Watch CPU/Memory usage during stress tests
    - **Keep AutoService Open**: Closing the window may interrupt task execution
    - **Check Network Connection**: For online tests (speed tests, updates)

!!! tip "After Completion"

    - **Review Both Report Types**: Check both technical and customer views
    - **Save Reports**: Store reports for records or customer handoff
    - **Note Any Warnings**: Flag unusual findings for further investigation
    - **Verify Improvements**: Compare to initial state if appropriate

## Troubleshooting

!!! failure "AutoService Won't Start"

    - **Check admin privileges**: Right-click and select "Run as administrator"
    - **Check Windows version**: AutoService requires Windows 10 or later
    - **Verify data folder**: Ensure the `data/` folder exists alongside the EXE

!!! warning "Tasks Keep Failing"

    - **Check tool availability**: Go to Settings → Tools to verify required tools are present
    - **Update tools**: Some tools may need newer versions
    - **Check permissions**: Some tasks require administrator access
    - **Review logs**: Check `data/logs/` for detailed error messages

!!! error "Reports Not Generating"

    - **Check disk space**: Ensure you have space in the data folder
    - **Verify permissions**: Check file write permissions in the data directory
    - **Check reports folder**: Look in `data/reports/` for saved reports

## Next Steps

Now that you understand the basics:

- **[Learn about the Service Tab](service-tab.md)** - Deep dive into task automation
- **[Explore Programs Tab](programs-tab.md)** - Manage portable tools
- **[Configure Settings](settings-tab.md)** - Customize AutoService behavior
- **[View System Information](system-info-tab.md)** - Understand your hardware

---

**Need Help?** Check the [Overview](overview.md) for more details on what AutoService can do, or visit the [GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues) page.
