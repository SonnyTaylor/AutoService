# Settings Tab

The **Settings** tab allows you to configure AutoService behavior, preferences, and tool management.

## Overview

Settings are organized into several sections:

- **Programs** - View and manage required external tools
- **Technician** - Add quick-access web tools and links
- **Network** - Configure network test settings
- **AI / API** - Set up API keys for AI features
- **Business** - Configure technician mode and business information
- **Reports** - Configure report generation and completion notifications
- **Sentry** - Error tracking and performance monitoring

## Programs

This section displays all external tools required by automated services.

### Tool Status Indicators

- **Green checkmark (✓)** - Tool is installed and available
- **Yellow warning (⚠)** - Tool is available but may need update
- **Red X (✕)** - Tool is missing or not available

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

### Search Tools

Use the search box to quickly filter and find specific tools in the programs list.

## Technician

Quick-access web tools that technicians use frequently.

### Adding Technician Links

1. Enter a **Title** (e.g., "Password Reset", "Remote Support")
2. Enter the **URL** (must be valid https:// or http:// URL)
3. Click **Add**
4. Links appear as tabs in the top bar of AutoService

### Persistent Web Data

Browser data (cookies, localStorage, site data) is stored in the app's webview profile and persists across sessions when running from the same USB drive—useful for staying logged into frequently-used tools.

## Network

Configure settings for network diagnostics and tests.

### iPerf Server

Configure the IP address or hostname of your iPerf server for network performance testing:

- Leave blank to disable iPerf tests
- Enter a valid IPv4 (e.g., `192.168.0.34`) or IPv6 address

### Ping Host

Set the default host for network connectivity testing:

- Default: `8.8.8.8` (Google DNS)
- Can use IP address (IPv4 or IPv6) or hostname
- Used by network diagnostic services to verify connectivity

## AI / API

Configure API keys for AI-powered features.

### OpenAI API Key

Required for AI Startup Optimizer and other AI features:

1. Get your API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Enter your key in the **OpenAI API Key** field (displayed as dots for security)
3. Click **Save** to store it
4. Click **Clear** to remove the saved key

## Business

Configure business branding and technician information for customer-facing reports.

### Enable Technician Mode

Toggle **Enable Technician Mode** to:

- Add business branding to customer reports
- Enable all business information fields
- Include technician/company details on printed reports

When disabled, all business fields are grayed out.

### Technician Names

Add frequently-used technician names for quick selection when starting services:

1. Enter a technician name
2. Click **Add**
3. Names appear in a list for quick access during service runs

### Business Logo

Upload an image file to use as your business logo on reports:

1. Click **Browse...** to select an image file from your computer
2. Any image format is supported (PNG, JPG, GIF, etc.)
3. The image is embedded into settings for portability

### Business Information

Fill in your business details (all fields optional):

- **Business Name** - Your company/business name
- **Business Address** - Office address
- **Phone Number** - Contact phone
- **Email Address** - Contact email
- **Website** - Business website URL
- **TFN (Tax File Number)** - Australian tax file number (if applicable)
- **ABN (Australian Business Number)** - Australian business number (if applicable)

All fields appear on customer reports when Technician Mode is enabled.

## Reports

Configure report saving behavior and completion notifications.

### Auto-save Reports

Enable **Auto-save Reports** to automatically save reports after every service run completes:

- **On**: Reports automatically saved to `data/reports/` with no action needed
- **Off**: You must manually save reports using the Save Report button

### Desktop Notifications

Enable **Desktop Notifications** to receive a system notification when a service run finishes:

- Shows a toast notification in the system tray
- Useful when you need to monitor multiple PC cleanups

### Completion Sound

Enable **Play Sound on Completion** to hear an audio alert when services finish:

- **Volume**: Adjust volume from 0-100%
- **Sound**: Choose notification sound (currently: Classic Beep)
- **Repeat**: Set how many times to play the sound (1-10)
- **Test**: Click the speaker icon to preview the selected sound with current settings

### Network Report Sharing

Share completed reports to a network location (UNC path):

1. Enable **Enable network report sharing**
2. Enter a valid UNC path (e.g., `\\server\share\reports` or `//server/share/reports`)
3. Choose where to save reports:
   - **Local only**: Save to `data/reports/` only
   - **Network only**: Save to network share only
   - **Both (recommended)**: Save to both locations for backup
4. Click **Test Connection** to verify the network path is accessible

## Sentry Error Tracking

Configure error reporting and performance monitoring for the Python service runner.

### Enable Sentry

Master toggle to enable/disable all error tracking:

- **Enabled**: Reports errors and performance metrics to Sentry
- **Disabled**: No error data is sent

### Environment

Select the environment for tracking:

- **Production** - Standard environment (default)
- **Development** - For development builds
- **Staging** - For testing releases

### Send PII Data

Include personal information in error reports:

- **Enabled**: Include hostname and username (helps identify which PC had issues)
- **Disabled**: Strip personal identifiers from reports

### Performance Monitoring

Enable transaction and trace sampling:

- **Enabled**: Track task execution performance and response times
- **Disabled**: Only errors are reported

### System Information

Include system details in error reports:

- **Enabled**: Include CPU, memory, disk information (helps diagnose hardware-related issues)
- **Disabled**: Exclude system information

## Saving Settings

Most settings save automatically as you make changes. Status messages confirm success or report errors.

Settings are stored in JSON files:

- `data/settings/app_settings.json` - Main settings
- `data/settings/programs.json` - Tool definitions
- `data/settings/scripts.json` - User scripts

---

Next: [Shortcuts Tab](shortcuts-tab.md)
