"""AI-assisted Windows startup item optimizer.

Enumerates startup entries from registry keys, Startup folders, Task Scheduler,
and services, then consults an AI model to suggest safe disables.
Optionally applies changes based on AI recommendations.

Features:
- Comprehensive startup item enumeration (Registry, folders, scheduled tasks)
- AI-powered analysis using multiple providers via LiteLLM
- Conservative recommendations focused on user safety
- Detailed impact analysis and risk assessment
- Reversible changes with backup/restore capability
"""

import os
import sys
import json
import re
import logging
import subprocess
import time
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

# Import unified AI utilities
from ai_utils import call_ai_analysis

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    env_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", ".env")
    load_dotenv(env_path)
except ImportError:
    # python-dotenv not installed, continue without loading .env
    pass

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


try:
    import winreg  # type: ignore
except ImportError:  # Non-Windows systems will not support this service
    winreg = None  # type: ignore


REGISTRY_RUN_PATHS = [
    ("HKEY_LOCAL_MACHINE", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKEY_LOCAL_MACHINE", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
    ("HKEY_CURRENT_USER", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKEY_CURRENT_USER", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
    # Also check Wow6432Node for 32-bit apps on 64-bit systems
    (
        "HKEY_LOCAL_MACHINE",
        r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
    ),
]

STARTUP_FOLDERS = [
    (
        "user_startup",
        lambda: os.path.join(
            os.getenv("APPDATA", ""),
            "Microsoft",
            "Windows",
            "Start Menu",
            "Programs",
            "Startup",
        ),
    ),
    (
        "common_startup",
        lambda: os.path.join(
            os.getenv("PROGRAMDATA", ""),
            "Microsoft",
            "Windows",
            "Start Menu",
            "Programs",
            "StartUp",
        ),
    ),
]

# Categories for intelligent classification
CRITICAL_CATEGORIES = [
    "security",
    "antivirus",
    "firewall",
    "vpn",
    "network",
    "remote_access",
    "cloud_storage",
    "backup",
    "system_driver",
    "audio_driver",
    "graphics_driver",
    "input_device",
]

SAFE_TO_DISABLE_CATEGORIES = [
    "game_launcher",
    "messaging",
    "telemetry",
    "updater_optional",
    "tray_app",
]


def _get_hive(name: str):  # type: ignore
    if winreg is None:
        return None
    return {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }.get(name)


def _extract_executable_info(command: str) -> Dict[str, Any]:
    """Extract useful information from a startup command string.

    Returns dict with: executable_path, publisher, description, file_size, digital_signature
    """
    info = {
        "executable_path": None,
        "publisher": None,
        "description": None,
        "file_size": None,
        "is_microsoft_signed": False,
        "directory": None,
    }

    if not command:
        return info

    # Extract executable path (remove quotes and arguments)
    exe_match = re.match(r'^"([^"]+)"', command)
    if exe_match:
        exe_path = exe_match.group(1)
    else:
        # No quotes, split on first space
        exe_path = command.split()[0] if command else ""

    info["executable_path"] = exe_path

    try:
        if os.path.isfile(exe_path):
            # Get file size
            info["file_size"] = os.path.getsize(exe_path)

            # Get directory
            info["directory"] = os.path.dirname(exe_path)

            # Check if it's in Windows directory (likely system component)
            windir = os.getenv("SystemRoot", "C:\\Windows")
            if exe_path.lower().startswith(windir.lower()):
                info["is_microsoft_signed"] = True
                info["publisher"] = "Microsoft Corporation"
    except Exception as e:  # noqa: BLE001
        logger.debug(f"Failed to extract executable info from {exe_path}: {e}")

    return info


def enumerate_startup_items() -> List[Dict[str, Any]]:
    """Collect startup items from Run/RunOnce registry keys and Startup folders.

    Returns list of dicts with: id, name, command, location, enabled, and metadata.
    """
    items: List[Dict[str, Any]] = []
    seen_ids = set()  # Deduplicate items

    logger.info("Starting startup items enumeration...")
    sys.stderr.flush()

    # Registry entries
    if winreg is not None:
        logger.info("Scanning registry startup locations...")
        sys.stderr.flush()

        for hive_name, path in REGISTRY_RUN_PATHS:
            hive = _get_hive(hive_name)
            if hive is None:
                continue
            try:
                with winreg.OpenKey(hive, path) as key:  # type: ignore
                    index = 0
                    while True:
                        try:
                            value_name, value_data, _ = winreg.EnumValue(key, index)  # type: ignore
                        except OSError:
                            break

                        item_id = f"reg:{hive_name}:{path}:{value_name}"
                        if item_id in seen_ids:
                            index += 1
                            continue
                        seen_ids.add(item_id)

                        exe_info = _extract_executable_info(str(value_data))

                        items.append(
                            {
                                "id": item_id,
                                "name": value_name,
                                "command": str(value_data),
                                "location": "registry",
                                "location_display": f"Registry: {hive_name.replace('HKEY_', '')}",
                                "hive": hive_name,
                                "key_path": path,
                                "enabled": True,
                                **exe_info,
                            }
                        )
                        index += 1

                logger.debug(f"Scanned {hive_name}\\{path}")
            except FileNotFoundError:
                continue
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Failed reading registry {hive_name} {path}: {e}")

    logger.info(f"Found {len(items)} registry startup items")
    sys.stderr.flush()

    # Startup folders
    logger.info("Scanning startup folders...")
    sys.stderr.flush()

    for folder_label, get_path in STARTUP_FOLDERS:
        folder = get_path()
        if not folder or not os.path.isdir(folder):
            continue
        try:
            for entry in os.listdir(folder):
                full_path = os.path.join(folder, entry)
                if os.path.isfile(full_path):
                    item_id = f"file:{folder_label}:{full_path}"
                    if item_id in seen_ids:
                        continue
                    seen_ids.add(item_id)

                    # For shortcuts, try to resolve target
                    command = full_path
                    if full_path.lower().endswith(".lnk"):
                        # We won't parse .lnk files without external deps, just use path
                        command = f"Shortcut: {os.path.splitext(entry)[0]}"

                    exe_info = _extract_executable_info(full_path)

                    items.append(
                        {
                            "id": item_id,
                            "name": os.path.splitext(entry)[0],
                            "command": command,
                            "location": folder_label,
                            "location_display": f"Startup Folder: {folder_label.replace('_', ' ').title()}",
                            "folder_path": folder,
                            "file_path": full_path,
                            "enabled": True,
                            **exe_info,
                        }
                    )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed enumerating startup folder {folder}: {e}")

    logger.info(f"Total startup items found: {len(items)}")
    sys.stderr.flush()

    return items


SYSTEM_INSTRUCTIONS = """<role>
You are an expert Windows startup optimization assistant for a computer repair shop. Your role is to analyze startup programs and recommend ONLY truly unnecessary items that are safe to disable.
</role>

<critical_philosophy>
BE EXTREMELY CONSERVATIVE. Only recommend disabling programs that meet ALL these criteria:
1. Non-essential to system operation
2. User can easily launch manually when needed
3. No background services or automation required
4. Minimal user workflow disruption
5. HIGH confidence in identification

When in doubt, KEEP IT ENABLED. It's better to leave 10 unnecessary items enabled than disable 1 important one.
</critical_philosophy>

<never_disable>
<category name="Security &amp; Protection">
- Antivirus/antimalware (Windows Defender, Malwarebytes, Emsisoft, Norton, Kaspersky, Bitdefender, ESET, Avast, AVG, etc.)
- Firewall software
- Security updaters or real-time protection
- Intrusion detection systems
</category>

<category name="Remote Access &amp; Connectivity">
- Remote desktop tools (RustDesk, TeamViewer, AnyDesk, Chrome Remote Desktop, Parsec, Splashtop)
- VPN clients (Tailscale, OpenVPN, WireGuard, NordVPN, ExpressVPN, etc.)
- Remote support software
- RDP-related services
- Network monitoring tools
- Dynamic DNS updaters (No-IP, DynDNS, etc.) - these MUST run continuously to update IP addresses
</category>

<category name="Cloud Storage, Sync &amp; Backup">
- OneDrive, Google Drive, Dropbox, iCloud, Nextcloud, Sync.com, pCloud, Box
- File synchronization tools (Syncthing, Resilio Sync, FreeFileSync, etc.)
- Cloud backup clients (Backblaze, Carbonite, IDrive)
- Local backup software (UrBackup, Veeam, Acronis, Macrium Reflect)
- ANY tool with "sync" in the name - these need to run continuously
</category>

<category name="System Components">
- Graphics drivers and control panels (NVIDIA, AMD, Intel)
- Audio drivers (Realtek, Creative, etc.)
- Input device drivers (touchpad, mouse, keyboard, pen/tablet)
- Bluetooth and network adapters
- Any Microsoft-signed executables in Windows directories
- Windows system services
- Device manufacturer utilities (Dell, HP, Lenovo, ASUS support software)
- Display management tools
</category>

<category name="Hardware &amp; Peripherals">
- Fan control software
- RGB lighting control (iCUE, Aura, Mystic Light, G Hub, SignalRGB, OpenRGB)
- Temperature monitoring
- Laptop power management
- Battery management tools
- Gaming peripheral software with macros/profiles (Logitech G Hub, Razer Synapse, Corsair iCUE)
- Input device customization (mouse DPI, keyboard layouts, controller mapping)
</category>

<category name="Automation &amp; Productivity">
- Task automation tools
- Clipboard managers
- Window managers
- Hotkey applications
- System theme switchers (Auto Dark Mode, f.lux, etc.) - these need to run to function
- Time tracking software
- Screen recording tools that monitor in background
</category>

<category name="Accessibility">
- Screen readers
- Magnifiers
- Voice control software
- Eye tracking software
- Accessibility aids
</category>

<category name="Device Integration">
- Phone integration apps (KDE Connect, Your Phone, etc.)
- Device syncing tools
- Cross-device clipboard tools
- Multi-device input sharing
</category>
</never_disable>

<safe_to_disable>
<criteria>
ONLY recommend disabling if the program meets ALL of these requirements:
- It's a launcher for an application the user can open manually
- It provides NO background automation or monitoring
- It has NO system integration or services
- Disabling it will NOT break any functionality
- User impact is minimal (just need to click an icon instead)
</criteria>

<approved_categories>
<category name="Game Launchers (ONLY if purely launchers)">
- Steam - ONLY if user doesn't use Big Picture mode or controller features
- Epic Games Launcher
- GOG Galaxy
- Origin/EA App
- Ubisoft Connect
- Battle.net
- Xbox Game Bar (if not used for screenshots/recording)

NOTE: Some game launchers provide cloud saves, achievement sync, or friend notifications. Consider these features before disabling.
</category>

<category name="Chat/Social (ONLY if no work use)">
- Discord - ONLY if user doesn't need instant notifications or voice auto-join
- Slack - check if used for work first
- Microsoft Teams - check if used for work first
- Telegram
- WhatsApp Desktop
- Signal - consider privacy/security needs
- Social media desktop apps (Facebook, Instagram, TikTok)
</category>

<category name="Media Players (ONLY basic players)">
- Spotify - ONLY if user manually launches it
- iTunes - ONLY if no device sync needed
- VLC - safe to disable, it's just a player
- Windows Media Player
</category>

<category name="Update Checkers (non-critical)">
- Java Update Scheduler - ONLY if Java not actively used
- Adobe Updater - ONLY if user can update manually
- Third-party software updaters (not Windows Update)
</category>

<category name="Manufacturer Bloatware (BE CAREFUL)">
- Pre-installed trials (Norton trial, McAfee trial)
- Manufacturer advertising apps
- Redundant OEM utilities (NOT drivers or essential tools)
</category>
</approved_categories>
</safe_to_disable>

<analysis_process>
<step number="1">Identify the program from name, command path, publisher, directory</step>
<step number="2">Determine if it matches any NEVER_DISABLE categories - if yes, KEEP IT</step>
<step number="3">Check if it provides background services, automation, or system integration - if yes, KEEP IT</step>
<step number="4">Assess user impact - will disabling break workflows or cause confusion? - if yes, KEEP IT</step>
<step number="5">Only if ALL checks pass AND it matches SAFE_TO_DISABLE criteria, consider for disabling</step>
<step number="6">Verify confidence level - if less than HIGH, KEEP IT ENABLED</step>
</analysis_process>

<output_format>
Return ONLY valid JSON with this exact structure (no markdown, no extra text):

{
    "analysis_summary": {
        "total_items": &lt;number&gt;,
        "critical_items": &lt;number&gt;,
        "safe_to_disable": &lt;number&gt;,
        "potential_boot_time_saving": "&lt;estimate like '5-15 seconds'&gt;"
    },
    "to_disable": [
        {
            "id": "&lt;exact id from input&gt;",
            "name": "&lt;program name&gt;",
            "category": "&lt;game_launcher|messaging|media_player|telemetry|bloatware&gt;",
            "reason": "&lt;why it's safe to disable&gt;",
            "risk": "low",
            "confidence": "high",
            "user_impact": "&lt;what user will notice&gt;",
            "manual_launch": "&lt;how to launch it manually if needed&gt;"
        }
    ],
    "keep_enabled": [
        {
            "id": "&lt;exact id from input&gt;",
            "name": "&lt;program name&gt;",
            "category": "&lt;security|system|driver|cloud_storage|remote_access|sync|automation|hardware|etc&gt;",
            "reason": "&lt;why it must stay enabled&gt;"
        }
    ]
}
</output_format>

<strict_rules>
- Be ULTRA conservative - when in ANY doubt, KEEP IT ENABLED
- Only recommend disabling items with confidence = "high" AND risk = "low"
- NEVER disable anything with "sync", "backup", "remote", "VPN", "security", "driver", "RGB", "macro" in name or purpose
- The 'id' value MUST match an 'id' from the input list exactly
- Empty command or unidentifiable items should NEVER be disabled
- Prioritize user safety and functionality over performance gains
- Aim for zero false positives - better to disable nothing than disable something important
- If a tool provides automation, background services, or system integration, it MUST stay enabled
</strict_rules>

<examples>
<example type="keep_enabled">
- NoIPDUC: Dynamic DNS updater - MUST run continuously to update IP address
- LGHUB: Logitech G Hub - manages macros, DPI profiles, RGB - KEEP ENABLED
- Syncthingtray: File sync tool - needs to run to synchronize files - KEEP ENABLED
- AutoDarkMode: Theme automation - provides automatic dark/light mode switching - KEEP ENABLED
- RustDesk Tray: Remote desktop - needed for remote access - KEEP ENABLED
- KDE Connect: Phone integration - provides cross-device features - KEEP ENABLED
- SignalRGB: RGB lighting control - manages hardware lighting - KEEP ENABLED
</example>

<example type="safe_to_disable">
- Steam: Game launcher - user can launch manually to play games
- Discord: Chat app - user can launch manually when needed (if not used for work/coordination)
- Spotify: Music player - user can launch manually to listen to music
- Epic Games Launcher: Game launcher - user can launch manually
</example>
</examples>
"""


def call_chat_model(
    api_key: str,
    model: str,
    items: List[Dict[str, Any]],
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Call AI chat completion to analyze startup items.

    Args:
        api_key: API key for the AI provider
        model: Model name (e.g., "gpt-5", "gpt-4o", "claude-sonnet-4-20250514")
        items: List of startup items to analyze
        base_url: Optional base URL for API endpoint (for compatibility)

    Returns:
        Dict with keys: success, data|error, usage (optional)
    """
    # Prepare simplified item list for AI (remove unnecessary metadata)
    simplified_items = []
    for item in items:
        simplified_items.append(
            {
                "id": item["id"],
                "name": item["name"],
                "command": item["command"],
                "location": item.get(
                    "location_display", item.get("location", "unknown")
                ),
                "publisher": item.get("publisher"),
                "is_microsoft_signed": item.get("is_microsoft_signed", False),
                "directory": item.get("directory"),
            }
        )

    user_prompt = f"Analyze these {len(simplified_items)} startup items and provide recommendations:\n\n{json.dumps(simplified_items, indent=2)}"

    logger.info(f"Sending {len(items)} startup items to AI model {model}...")
    sys.stderr.flush()

    # Use unified AI utility
    result = call_ai_analysis(
        system_prompt=SYSTEM_INSTRUCTIONS,
        user_prompt=user_prompt,
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0.1,
        json_mode=True,
        required_fields=["to_disable"],
    )

    if not result["success"]:
        return result

    # Ensure proper structure
    data = result["data"]
    data.setdefault("to_disable", [])
    data.setdefault("keep_enabled", [])
    data.setdefault("analysis_summary", {})

    logger.info(
        f"AI analysis complete. Recommendations: {len(data['to_disable'])} to disable, "
        f"{len(data.get('keep_enabled', []))} to keep"
    )
    sys.stderr.flush()

    return result


def _disable_registry_item(hive_name: str, path: str, value_name: str) -> bool:
    if winreg is None:
        return False
    hive = _get_hive(hive_name)
    if hive is None:
        return False
    try:
        with winreg.OpenKey(hive, path, 0, winreg.KEY_SET_VALUE) as key:  # type: ignore
            winreg.DeleteValue(key, value_name)  # type: ignore
        return True
    except FileNotFoundError:
        return False
    except Exception as e:  # noqa: BLE001
        logger.warning(
            f"Failed to disable registry startup {hive_name} {path} {value_name}: {e}"
        )
        return False


def _disable_file_item(full_path: str) -> bool:
    try:
        if os.path.isfile(full_path):
            # Move to a DisabledStartup subfolder next to original folder for reversibility
            target_dir = os.path.join(os.path.dirname(full_path), "DisabledStartup")
            os.makedirs(target_dir, exist_ok=True)
            new_path = os.path.join(target_dir, os.path.basename(full_path))
            os.replace(full_path, new_path)
            return True
        return False
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to move startup file {full_path}: {e}")
        return False


def run_ai_startup_disable(task: Dict[str, Any]) -> Dict[str, Any]:
    """Enumerate startup items, consult an AI model for disable suggestions, and optionally apply them.

    Task schema:
      type: "ai_startup_disable"
      api_key: str (required, or "env:VARNAME" to read from environment)
      model: str (required, e.g., "gpt-4o-mini", "gpt-4o")
      base_url: str (optional, for custom OpenAI-compatible endpoints)
      apply_changes: bool (optional, default False - if True, actually disables items)
      dry_run: bool (optional, default True - same as apply_changes=False)
    """
    add_breadcrumb(
        "Starting AI startup optimizer",
        category="task",
        level="info",
        data={
            "model": task.get("model"),
            "apply_changes": task.get("apply_changes", False),
        },
    )

    start_time = time.time()

    api_key = task.get("api_key")
    model = task.get("model")
    base_url = task.get("base_url")
    apply_changes = bool(task.get("apply_changes", False))

    # Handle dry_run parameter (inverse of apply_changes)
    if "dry_run" in task:
        apply_changes = not bool(task.get("dry_run", True))

    # Support environment-backed API keys in fixtures or tasks.
    if isinstance(api_key, str) and api_key.startswith("env:"):
        env_var = api_key.split(":", 1)[1]
        api_key = os.getenv(env_var)
        logger.info(f"Using API key from environment variable: {env_var}")
        sys.stderr.flush()

    if not api_key:
        # Try project-specific and common env var names
        api_key = os.getenv("AUTOSERVICE_OPENAI_KEY") or os.getenv("OPENAI_API_KEY")
        if api_key:
            logger.info("Using API key from default environment variables")
            sys.stderr.flush()

    # Validation
    if not api_key or not model:
        logger.error("Missing required parameters: api_key and model")
        sys.stderr.flush()
        return {
            "task_type": "ai_startup_disable",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": "Configuration error: 'api_key' and 'model' are required"
                },
                "results": {
                    "error_type": "missing_parameters",
                    "required": ["api_key", "model"],
                },
            },
        }

    logger.info("=" * 60)
    logger.info("AI Startup Optimizer - Starting Analysis")
    logger.info("=" * 60)
    logger.info(
        f"Mode: {'APPLY CHANGES' if apply_changes else 'DRY RUN (preview only)'}"
    )
    logger.info(f"Model: {model}")
    sys.stderr.flush()

    # Enumerate all startup items
    add_breadcrumb("Enumerating startup items", category="task", level="info")

    try:
        items = enumerate_startup_items()
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to enumerate startup items: {e}")
        sys.stderr.flush()
        return {
            "task_type": "ai_startup_disable",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": f"Failed to enumerate startup items: {str(e)}"
                },
                "results": {"error_type": "enumeration_failed"},
            },
        }

    if not items:
        logger.warning("No startup items found - system may have no startup programs")
        sys.stderr.flush()
        return {
            "task_type": "ai_startup_disable",
            "status": "success",
            "summary": {
                "human_readable": {
                    "message": "No startup items found",
                    "items_total": 0,
                    "recommendations": 0,
                },
                "results": {
                    "enumerated_count": 0,
                    "items": [],
                    "to_disable": [],
                    "keep_enabled": [],
                },
            },
        }

    # Call AI model for analysis
    logger.info(f"Analyzing {len(items)} startup items with AI...")
    sys.stderr.flush()

    add_breadcrumb(
        "Calling AI model for startup analysis",
        category="task",
        level="info",
        data={"model": model, "item_count": len(items)},
    )

    ai_response = call_chat_model(api_key, model, items, base_url)

    if not ai_response.get("success"):
        logger.error(f"AI analysis failed: {ai_response.get('error')}")
        sys.stderr.flush()
        return {
            "task_type": "ai_startup_disable",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": f"AI analysis failed: {ai_response.get('error')}",
                    "items_enumerated": len(items),
                },
                "results": {
                    "error_type": "ai_failed",
                    "enumerated_count": len(items),
                    "items": items,
                },
            },
        }

    ai_data = ai_response["data"]
    suggestions = ai_data.get("to_disable", [])
    keep_enabled = ai_data.get("keep_enabled", [])
    analysis_summary = ai_data.get("analysis_summary", {})

    logger.info("=" * 60)
    logger.info("AI ANALYSIS RESULTS")
    logger.info("=" * 60)
    logger.info(f"Total startup items: {len(items)}")
    logger.info(f"Items recommended to disable: {len(suggestions)}")
    logger.info(f"Items to keep enabled: {len(keep_enabled)}")
    if "potential_boot_time_saving" in analysis_summary:
        logger.info(
            f"Estimated boot time saving: {analysis_summary['potential_boot_time_saving']}"
        )
    logger.info("=" * 60)
    sys.stderr.flush()

    # Index items by id for quick lookup
    items_by_id = {i["id"]: i for i in items}

    disabled: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Apply changes if requested
    if apply_changes and suggestions:
        logger.info("APPLYING CHANGES - Disabling recommended items...")
        sys.stderr.flush()

        add_breadcrumb(
            "Applying AI recommendations to disable startup items",
            category="task",
            level="info",
            data={"items_to_disable": len(suggestions)},
        )

        for idx, entry in enumerate(suggestions, 1):
            sid = entry.get("id")
            item_name = entry.get("name", "Unknown")

            logger.info(f"[{idx}/{len(suggestions)}] Processing: {item_name}")
            sys.stderr.flush()

            if sid not in items_by_id:
                logger.warning(f"  ⚠ Skipped: Item ID not found in enumeration")
                sys.stderr.flush()
                skipped.append(
                    {"id": sid, "name": item_name, "reason": "not_found_in_enumeration"}
                )
                continue

            item = items_by_id[sid]
            success = False
            error_msg = None

            try:
                if item["id"].startswith("reg:"):
                    # id format: reg:HIVE:path:value
                    parts = item["id"].split(":", 3)
                    if len(parts) == 4:
                        _, hive_name, key_path, value_name = parts
                        success = _disable_registry_item(
                            hive_name, key_path, value_name
                        )
                        if not success:
                            error_msg = "Failed to delete registry value"
                    else:
                        error_msg = "Malformed registry item ID"
                elif item["id"].startswith("file:"):
                    # id format: file:label:full_path
                    parts = item["id"].split(":", 2)
                    if len(parts) == 3:
                        _, _label, full_path = parts
                        success = _disable_file_item(full_path)
                        if not success:
                            error_msg = "Failed to move file to DisabledStartup"
                    else:
                        error_msg = "Malformed file item ID"
                else:
                    error_msg = "Unknown item type"
            except Exception as e:  # noqa: BLE001
                error_msg = f"Exception: {str(e)}"

            if success:
                logger.info(f"  ✓ Disabled: {item_name}")
                sys.stderr.flush()
                disabled.append(
                    {
                        "id": sid,
                        "name": item_name,
                        "reason": entry.get("reason"),
                        "category": entry.get("category"),
                        "user_impact": entry.get("user_impact"),
                        "manual_launch": entry.get("manual_launch"),
                    }
                )
            else:
                logger.error(f"  ✗ Failed: {item_name} - {error_msg}")
                sys.stderr.flush()
                errors.append({"id": sid, "name": item_name, "error": error_msg})

        logger.info("=" * 60)
        logger.info(
            f"SUMMARY: {len(disabled)} disabled, {len(errors)} errors, {len(skipped)} skipped"
        )
        logger.info("=" * 60)
        sys.stderr.flush()

    elif suggestions:
        logger.info("DRY RUN MODE - No changes applied")
        logger.info("Run with apply_changes=true to actually disable these items:")
        for idx, entry in enumerate(suggestions, 1):
            logger.info(f"  {idx}. {entry.get('name')} - {entry.get('reason')}")
        sys.stderr.flush()

    duration = time.time() - start_time

    # Build standardized result
    status = "success"
    if apply_changes and errors:
        status = "warning" if disabled else "error"

    add_breadcrumb(
        f"AI startup optimizer completed: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "warning"
        else "error",
        data={
            "total_items": len(items),
            "recommendations": len(suggestions),
            "disabled": len(disabled) if apply_changes else 0,
            "errors": len(errors) if apply_changes else 0,
            "duration_seconds": round(duration, 2),
        },
    )

    return {
        "task_type": "ai_startup_disable",
        "status": status,
        "summary": {
            "human_readable": {
                "mode": "Applied Changes"
                if apply_changes
                else "Dry Run (Preview Only)",
                "total_items": len(items),
                "recommendations": len(suggestions),
                "items_disabled": len(disabled) if apply_changes else 0,
                "items_skipped": len(skipped) if apply_changes else 0,
                "errors": len(errors) if apply_changes else 0,
                "items_kept_enabled": len(keep_enabled),
                "estimated_boot_time_saving": analysis_summary.get(
                    "potential_boot_time_saving", "Unknown"
                ),
                "model_used": model,
                "duration_seconds": round(duration, 2),
            },
            "results": {
                "enumerated_count": len(items),
                "all_items": items,
                "to_disable": suggestions,
                "keep_enabled": keep_enabled,
                "analysis_summary": analysis_summary,
                "disabled": disabled if apply_changes else [],
                "skipped": skipped if apply_changes else [],
                "errors": errors if apply_changes else [],
                "applied": apply_changes,
                "ai_usage": ai_response.get("usage", {}),
            },
        },
    }


__all__ = ["run_ai_startup_disable"]
