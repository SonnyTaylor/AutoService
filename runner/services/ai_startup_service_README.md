# AI Startup Optimizer Service

**AI-powered Windows startup program analysis and optimization.**

## Overview

The AI Startup Optimizer uses OpenAI-compatible language models to intelligently analyze Windows startup programs and provide safe, conservative recommendations for optimization. It's designed for computer repair shops that want to improve customer boot times without risking system stability.

## Features

### Comprehensive Enumeration

- **Registry startup locations**: All Run/RunOnce keys (including WOW6432Node)
- **Startup folders**: User and common startup directories
- **Detailed metadata**: File paths, publishers, Microsoft signatures, directories

### AI-Powered Analysis

- **Conservative recommendations**: Prioritizes system safety over performance
- **Category classification**: Security, system, drivers, convenience apps, etc.
- **Impact assessment**: Risk level, confidence score, user impact statement
- **Boot time estimates**: Estimated improvement from optimizations

### Safety First

The AI is instructed to **NEVER** disable:

- Security/antivirus software
- Remote access tools (TeamViewer, RustDesk, etc.)
- VPN clients
- Cloud storage/backup (OneDrive, Google Drive, etc.)
- Graphics/audio drivers
- System components
- Microsoft-signed executables in Windows directories

### Safe to Disable (with confidence)

- Game launchers (Steam, Epic, GOG)
- Chat/messaging apps (Discord, Slack)
- Media players (Spotify, iTunes)
- Telemetry/tracking software
- Optional manufacturer bloatware

## Usage

### Basic Usage (Dry Run)

```json
{
  "type": "ai_startup_disable",
  "api_key": "env:AUTOSERVICE_OPENAI_KEY",
  "model": "gpt-4o-mini",
  "apply_changes": false
}
```

This analyzes startup items and provides recommendations without making changes.

### Apply Changes

```json
{
  "type": "ai_startup_disable",
  "api_key": "env:AUTOSERVICE_OPENAI_KEY",
  "model": "gpt-4o-mini",
  "apply_changes": true
}
```

This actually disables the recommended items.

### Custom API Endpoint

```json
{
  "type": "ai_startup_disable",
  "api_key": "your-api-key",
  "model": "gpt-4",
  "base_url": "https://custom-api.example.com",
  "apply_changes": false
}
```

Use a custom OpenAI-compatible endpoint (e.g., Azure OpenAI, local models).

## API Key Configuration

### Environment Variables

The service supports multiple methods for API key configuration:

1. **Task parameter**: `"api_key": "sk-..."`
2. **Environment reference**: `"api_key": "env:CUSTOM_VAR_NAME"`
3. **Auto-detection**: Checks `AUTOSERVICE_OPENAI_KEY` and `OPENAI_API_KEY`

### .env File

Create `runner/fixtures/.env`:

```env
AUTOSERVICE_OPENAI_KEY=sk-your-key-here
```

## Parameters

| Parameter       | Type    | Required | Default                  | Description                                  |
| --------------- | ------- | -------- | ------------------------ | -------------------------------------------- |
| `api_key`       | string  | Yes      | —                        | OpenAI API key or `env:VAR_NAME`             |
| `model`         | string  | Yes      | —                        | Model to use (e.g., `gpt-4o-mini`, `gpt-4o`) |
| `base_url`      | string  | No       | `https://api.openai.com` | Custom API endpoint                          |
| `apply_changes` | boolean | No       | `false`                  | Actually disable items (vs preview)          |
| `dry_run`       | boolean | No       | `true`                   | Inverse of `apply_changes`                   |

## Output Structure

### Human Readable Summary

```json
{
  "human_readable": {
    "mode": "Dry Run (Preview Only)",
    "total_items": 45,
    "recommendations": 8,
    "items_disabled": 0,
    "items_skipped": 0,
    "errors": 0,
    "items_kept_enabled": 37,
    "estimated_boot_time_saving": "5-10 seconds",
    "model_used": "gpt-4o-mini",
    "duration_seconds": 12.34
  }
}
```

### Detailed Results

```json
{
  "results": {
    "enumerated_count": 45,
    "to_disable": [
      {
        "id": "reg:HKEY_CURRENT_USER:...:Steam",
        "name": "Steam",
        "category": "game_launcher",
        "reason": "Game launcher that can be started manually",
        "risk": "low",
        "confidence": "high",
        "user_impact": "Steam won't start automatically, must be launched manually",
        "manual_launch": "Start menu or desktop shortcut"
      }
    ],
    "keep_enabled": [
      {
        "id": "reg:HKEY_LOCAL_MACHINE:...:SecurityHealth",
        "name": "Windows Security",
        "category": "security",
        "reason": "Windows Defender real-time protection - critical for system security"
      }
    ],
    "analysis_summary": {
      "total_items": 45,
      "critical_items": 37,
      "safe_to_disable": 8,
      "potential_boot_time_saving": "5-10 seconds"
    },
    "disabled": [],
    "skipped": [],
    "errors": [],
    "applied": false
  }
}
```

## Testing

### Test Individual Service

```powershell
# Dry run (preview only)
python runner/service_runner.py runner/fixtures/test_ai_startup_disable.json

# Apply changes
python runner/service_runner.py runner/fixtures/test_ai_startup_disable_apply.json
```

### Create Apply Changes Test Fixture

Create `runner/fixtures/test_ai_startup_disable_apply.json`:

```json
{
  "tasks": [
    {
      "type": "ai_startup_disable",
      "api_key": "env:AUTOSERVICE_OPENAI_KEY",
      "model": "gpt-4o-mini",
      "apply_changes": true
    }
  ]
}
```

## How It Works

### 1. Enumeration Phase

- Scans registry Run/RunOnce keys (HKLM, HKCU, WOW6432Node)
- Lists files in user and common Startup folders
- Extracts executable paths, publishers, file sizes
- Detects Microsoft-signed components

### 2. AI Analysis Phase

- Sends simplified item list to AI model
- AI categorizes each item by purpose
- Determines safety and confidence for recommendations
- Provides user-friendly explanations

### 3. Application Phase (if enabled)

- Deletes registry values for registry items
- Moves shortcut files to `DisabledStartup` subfolder (reversible)
- Logs success/failure for each item
- Provides detailed error reporting

## Reversibility

### Registry Items

Registry values are deleted. To restore:

1. Open Registry Editor
2. Navigate to the original key path (shown in logs)
3. Create new String Value with the original name and command

### File Items

Files are moved to `DisabledStartup` subfolder. To restore:

1. Navigate to the Startup folder
2. Open `DisabledStartup` subfolder
3. Move the file back to parent folder

## Best Practices

### 1. Always Test First

Run in dry-run mode first to review recommendations before applying.

### 2. Review AI Suggestions

Don't blindly trust AI - review the recommendations and verify they make sense for your customer's use case.

### 3. Document Changes

The service logs all changes. Save the report for customer records.

### 4. Educate Customers

Explain what was disabled and how to manually launch programs if needed.

### 5. Use Conservative Models

`gpt-4o-mini` is more conservative than `gpt-4o`. For maximum safety, use `gpt-4o-mini`.

## Model Recommendations

| Model         | Speed  | Cost   | Conservatism | Use Case                |
| ------------- | ------ | ------ | ------------ | ----------------------- |
| `gpt-4o-mini` | Fast   | Low    | High         | Default recommendation  |
| `gpt-4o`      | Medium | Medium | Medium       | More nuanced analysis   |
| `gpt-4`       | Slow   | High   | Medium       | Legacy, not recommended |

## Troubleshooting

### "API request failed"

- Check API key is valid
- Verify internet connection
- Ensure API endpoint is reachable

### "Malformed API reply"

- Model may not support JSON mode
- Try a different model
- Check API endpoint compatibility

### "Failed to enumerate startup items"

- Requires Windows OS
- May need administrator privileges
- Check registry permissions

### "Failed to disable registry item"

- Requires administrator privileges
- Registry key may be protected
- Value may have already been deleted

## Security Considerations

### API Key Storage

- Never commit API keys to git
- Use environment variables or .env files
- Restrict .env file permissions

### Data Privacy

- Startup item data is sent to AI provider
- Review privacy policies of your AI provider
- Consider on-premises AI models for sensitive environments

### System Safety

- Service is designed to be conservative
- Always review recommendations before applying
- Test on non-production systems first
- Maintain system backups

## Frontend Integration

The service is automatically integrated into AutoService:

- **Catalog**: Shows in "System Optimization" group
- **Builder**: Configurable parameters (API key, model, apply mode)
- **Runner**: Real-time progress streaming
- **Results**: Detailed technician view with expandable sections
- **Print**: Customer-friendly summary with optimization details

## Dependencies

### Python

- `python-dotenv` (optional): Load API keys from .env
- `requests` (optional): Preferred HTTP library, falls back to urllib

### External

- OpenAI API or compatible endpoint
- Internet connection (unless using local AI model)

## License

Part of AutoService - see main project license.
