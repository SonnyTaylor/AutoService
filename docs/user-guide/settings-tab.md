# Settings Tab

The **Settings** tab allows you to configure AutoService behavior, preferences, and tool management.

## Overview

Settings are organized into several sections:

- **General** - Application-level preferences
- **Tools** - Manage external tools and utilities
- **Reports** - Configure report generation
- **Network** - Network settings and connectivity
- **Business** - Technician mode and business information

## General Settings

### Auto-Save Reports

Enable or disable automatic report saving after task runs complete.

- **On**: Reports automatically saved to `data/reports/`
- **Off**: You must manually save reports

### Data Folder Location

Shows the current path to the data folder. Cannot be changed from settings; move the entire `data/` folder to change location.

### Application Theme

Choose between:

- **Light Mode** - Light background, dark text
- **Dark Mode** - Dark background, light text
- **System** - Follow Windows preference

## Tools Management

This section shows the status of external tools required for various tasks.

### Tool Status Indicators

- **Green checkmark** - Tool is installed and available
- **Yellow warning** - Tool is available but may need update
- **Red X** - Tool is missing or not available

### Available Tools

Common tools include:

- **BleachBit** - Temporary file cleanup
- **AdwCleaner** - Adware removal
- **7-Zip** - Archive utility
- **SFC** - System File Checker (built-in)
- **DISM** - Deployment Image Servicing (built-in)
- **HeavyLoad** - Stress testing
- **FurMark** - GPU stress testing
- **smartctl** - Drive health monitoring
- **And more...**

### Adding Tools

1. Obtain the tool (preferably portable version)
2. Place in `data/programs/[ToolName - Version]/`
3. In Settings → Tools, tool should auto-detect
4. If not detected, use "Add Tool" button and navigate to executable

### Updating Tools

1. Go to Tools section
2. Click "Update" on a tool
3. Point to new version/executable
4. Confirm

## Report Settings

### Report Format

Configure what's included in generated reports:

- **Technical Report** - Include detailed findings and raw data
- **Customer Report** - Generate simplified professional summary
- **Both** - Generate both report types

### Report Destination

- **Default**: `data/reports/`
- **Custom**: Choose alternate location

### Auto-Archive Old Reports

Enable automatic archiving of reports older than:

- 30 days
- 90 days
- 6 months
- 1 year
- Never

## Network Settings

### Connectivity Test

Configure how AutoService tests internet connectivity:

- **Test URL**: URL to ping for connectivity check
- **Timeout**: Seconds to wait before considering offline
- **Retry**: Number of retry attempts

### Proxy Settings (if needed)

- **Proxy URL**: HTTP proxy address
- **Port**: Proxy port number
- **Authentication**: Username/password if required

## Business/Technician Settings

### Technician Information

Enter your business details (displayed on customer reports):

- **Your Name** - Technician or business name
- **Company Name** - Your company/business name
- **Phone** - Contact phone number
- **Email** - Contact email address
- **Logo** - Upload business logo for reports

### Technician Mode

Enable specialized features for technicians:

- Additional diagnostic tools
- Custom report templates
- Bulk operations
- Client database integration (if available)

### Report Branding

Configure professional appearance:

- **Company logo** - Display on reports
- **Color scheme** - Match your business
- **Footer** - Custom footer text for reports

## Advanced Settings

### Logging

- **Log Level**: Verbose, Info, Warning, Error
- **Log Location**: Where execution logs are saved
- **Log Retention**: How long to keep logs

### Sentry Error Reporting

Send anonymous error reports to help improve AutoService:

- **Enabled**: Allow error reporting
- **Release Version**: Current AutoService version
- **Sensitive Data**: Options to exclude personal information

### Data Management

- **Clear Cache** - Remove cached tool availability data
- **Reset Settings** - Restore default settings
- **Export Settings** - Save current settings to file
- **Import Settings** - Load settings from file

## Saving Settings

Most settings save automatically. For confirmation:

1. Make your changes
2. Look for "Saved" confirmation or notification
3. Settings persist in `data/settings/app_settings.json`

## Restoring Defaults

To restore default settings:

1. Go to Settings → Advanced
2. Click **"Reset All Settings"**
3. Confirm the action
4. AutoService will restart with defaults

## Configuration Files

Settings are stored in JSON files you can edit directly:

- `data/settings/app_settings.json` - Main settings
- `data/settings/programs.json` - Tool definitions
- `data/settings/scripts.json` - User scripts

---

Next: [Shortcuts Tab](shortcuts-tab.md)
