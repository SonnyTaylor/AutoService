import os
import json
import re
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

try:
    import winreg  # type: ignore
except ImportError:  # Non-Windows systems will not support this service
    winreg = None  # type: ignore


REGISTRY_RUN_PATHS = [
    ("HKEY_LOCAL_MACHINE", r"Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
    ("HKEY_LOCAL_MACHINE", r"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"),
    ("HKEY_CURRENT_USER", r"Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
    ("HKEY_CURRENT_USER", r"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"),
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


def _get_hive(name: str):  # type: ignore
    if winreg is None:
        return None
    return {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }.get(name)


def enumerate_startup_items() -> List[Dict[str, Any]]:
    """Collect startup items from Run/RunOnce registry keys and Startup folders.

    Returns list of dicts with at minimum: id, name, command, location, enabled.
    """
    items: List[Dict[str, Any]] = []

    # Registry entries
    if winreg is not None:
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
                        items.append(
                            {
                                "id": f"reg:{hive_name}:{path}:{value_name}",
                                "name": value_name,
                                "command": value_data,
                                "location": "registry",
                                "hive": hive_name,
                                "key_path": path,
                                "enabled": True,
                            }
                        )
                        index += 1
            except FileNotFoundError:
                continue
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Failed reading registry {hive_name} {path}: {e}")

    # Startup folders
    for folder_label, get_path in STARTUP_FOLDERS:
        folder = get_path()
        if not folder or not os.path.isdir(folder):
            continue
        try:
            for entry in os.listdir(folder):
                full_path = os.path.join(folder, entry)
                if os.path.isfile(full_path):
                    items.append(
                        {
                            "id": f"file:{folder_label}:{full_path}",
                            "name": os.path.splitext(entry)[0],
                            "command": full_path,
                            "location": folder_label,
                            "folder_path": folder,
                            "enabled": True,
                        }
                    )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed enumerating startup folder {folder}: {e}")

    return items


SYSTEM_INSTRUCTIONS = """
You are a conservative Windows startup optimization assistant used by a computer repair shop.

Your job is to recommend ONLY startup items that are extremely safe to disable for non-technical users. Do NOT recommend disabling any item that could prevent a user from connecting to their network, using remote-access/remote-control software, accessing cloud storage or backups, using security/antivirus, printing/scanning, basic input/accessibility features or programs thats main purpose is to run in the background.

Specifically NEVER disable items that appear to belong to: antivirus/security (Windows Defender, Malwarebytes, Emsisoft, etc.), VPNs or networking tools (Tailscale, OpenVPN, WireGuard), remote support/remote desktop/remote access (RustDesk, TeamViewer, AnyDesk, RDP related entries), cloud sync or storage (OneDrive, Google Drive, Nextcloud, Dropbox), backup clients (UrBackup, Veeam, etc.), graphics drivers and their control panels (NVIDIA/AMD/Intel), audio drivers, OS components, or anything located directly under %windir% or signed by Microsoft.

Also avoid disabling updaters, installers, device drivers, or anything with an empty command. If unsure, do NOT disable it.

Only suggest disabling clearly user-facing non-essential convenience apps that can be launched manually without impacting system functionality — examples: game launchers (Steam, Epic, GOG), telemetry/tracking crap, chat/communication apps (Discord), optional third-party UI helpers, or explicit user-installed tool tray apps — and only if the item command clearly corresponds to that app.

Return ONLY valid JSON with the exact structure below (no extra text):

{
    "to_disable": [
        {
            "id": "<id>",
            "reason": "<brief reason for disabling>",
            "risk": "low|medium|high",
            "confidence": "low|medium|high",
            "user_impact": "<brief statement about what the user will notice (e.g., 'no noticeable impact', 'tray icon won't appear', 'cloud sync won't start automatically')>"
        }
    ]
}

Rules: keep the list minimal. Only include items you are >= medium confidence are safe to disable for non-technical users. If nothing meets that bar, return {"to_disable": []}. The 'id' value MUST match an 'id' from the supplied list exactly.
"""


def call_chat_model(
    api_key: str, model: str, items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Call the OpenAI-compatible chat completion endpoint using only stdlib.

    Returns dict with keys: success, data|error.
    """
    import urllib.request
    import urllib.error

    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": json.dumps(items)},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # type: ignore
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:  # type: ignore
        return {
            "success": False,
            "error": f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}",
        }
    except Exception as e:  # noqa: BLE001
        return {"success": False, "error": f"Request failed: {e}"}

    # Parse JSON response
    try:
        outer = json.loads(body)
        content = outer["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001
        return {
            "success": False,
            "error": f"Malformed API reply: {e} | body={body[:2000]}",
        }

    # Extract JSON object from content (in case of extra text)
    json_text = content.strip()
    if not json_text.startswith("{"):
        m = re.search(r"(\{.*\})", json_text, re.DOTALL)
        if m:
            json_text = m.group(1)
    try:
        parsed = json.loads(json_text)
        if "to_disable" not in parsed or not isinstance(parsed["to_disable"], list):
            parsed.setdefault("to_disable", [])
    except Exception as e:  # noqa: BLE001
        return {
            "success": False,
            "error": f"Could not parse model JSON: {e} | content={content[:1000]}",
        }

    return {"success": True, "data": parsed}


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
      api_key: str (required)
      model: str (required)
      apply_changes: bool (optional, default False)
    """

    api_key = task.get("api_key")
    model = task.get("model")
    apply_changes = bool(task.get("apply_changes", False))

    # Support environment-backed API keys in fixtures or tasks.
    # If the task's api_key is a string like "env:VARNAME" we will read that
    # environment variable. If no api_key is provided, fall back to common
    # env var names to avoid embedding secrets in fixtures.
    if isinstance(api_key, str) and api_key.startswith("env:"):
        env_var = api_key.split(":", 1)[1]
        api_key = os.getenv(env_var)
    if not api_key:
        # Try project-specific and common env var names
        api_key = os.getenv("AUTOSERVICE_OPENAI_KEY") or os.getenv("OPENAI_API_KEY")

    if not api_key or not model:
        return {
            "task_type": "ai_startup_disable",
            "status": "failure",
            "summary": {"error": "'api_key' and 'model' are required"},
        }

    items = enumerate_startup_items()
    logger.info(f"Enumerated {len(items)} startup items")

    ai_response = call_chat_model(api_key, model, items)
    if not ai_response.get("success"):
        return {
            "task_type": "ai_startup_disable",
            "status": "failure",
            "summary": {
                "error": ai_response.get("error"),
                "items_enumerated": len(items),
            },
        }

    suggestions = ai_response["data"].get("to_disable", [])

    # Index items by id for quick lookup
    items_by_id = {i["id"]: i for i in items}

    disabled: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    if apply_changes:
        for entry in suggestions:
            sid = entry.get("id")
            if sid not in items_by_id:
                skipped.append({"id": sid, "reason": "not_found"})
                continue
            item = items_by_id[sid]
            success = False
            if item["id"].startswith("reg:"):
                # id format: reg:HIVE:path:value
                _, hive_name, key_path, value_name = item["id"].split(":", 3)
                success = _disable_registry_item(hive_name, key_path, value_name)
            elif item["id"].startswith("file:"):
                # id format: file:label:full_path
                _, _label, full_path = item["id"].split(":", 2)
                success = _disable_file_item(full_path)
            if success:
                disabled.append(
                    {
                        "id": sid,
                        "reason": entry.get("reason"),
                        "risk": entry.get("risk"),
                    }
                )
            else:
                skipped.append({"id": sid, "reason": "disable_failed"})

    return {
        "task_type": "ai_startup_disable",
        "status": "success",
        "summary": {
            "enumerated_count": len(items),
            "items": items,
            "suggestions": suggestions,
            ("disabled" if apply_changes else "would_disable"): disabled
            if apply_changes
            else suggestions,
            "skipped": skipped if apply_changes else [],
            "applied": apply_changes,
            "model": model,
        },
    }


__all__ = ["run_ai_startup_disable"]
