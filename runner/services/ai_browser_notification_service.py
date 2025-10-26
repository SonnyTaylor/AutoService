"""AI-assisted browser notification optimizer.

Enumerates browser notification permissions from Chrome, Edge, Firefox, and Brave,
then consults an OpenAI-compatible model to suggest which notifications should be disabled.
Optionally applies changes based on AI recommendations.

Features:
- Multi-browser support (Chrome, Edge, Firefox, Brave, Opera)
- Reads notification permissions from browser profile databases/configs
- AI-powered analysis using OpenAI-compatible models
- Conservative recommendations focused on reducing notification spam
- Preview mode for safety before applying changes
- Detailed impact analysis and rationale
"""

import os
import sys
import json
import logging
import sqlite3
import time
import shutil
from typing import Dict, Any, List, Optional
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    env_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", ".env")
    load_dotenv(env_path)
except ImportError:
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


# Prefer requests for HTTP if available; fall back to urllib otherwise.
try:
    import requests  # type: ignore
except Exception:
    requests = None  # type: ignore


# Browser profile paths (relative to user's home)
BROWSER_PATHS = {
    "chrome": {
        "name": "Google Chrome",
        "profiles_base": os.path.join(
            os.getenv("LOCALAPPDATA", ""), "Google", "Chrome", "User Data"
        ),
        "type": "chromium",
    },
    "edge": {
        "name": "Microsoft Edge",
        "profiles_base": os.path.join(
            os.getenv("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data"
        ),
        "type": "chromium",
    },
    "brave": {
        "name": "Brave Browser",
        "profiles_base": os.path.join(
            os.getenv("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data"
        ),
        "type": "chromium",
    },
    "opera": {
        "name": "Opera",
        "profiles_base": os.path.join(
            os.getenv("APPDATA", ""), "Opera Software", "Opera Stable"
        ),
        "type": "chromium",
    },
    "firefox": {
        "name": "Mozilla Firefox",
        "profiles_base": os.path.join(
            os.getenv("APPDATA", ""), "Mozilla", "Firefox", "Profiles"
        ),
        "type": "firefox",
    },
}


def enumerate_chromium_notifications(
    profiles_base: str, browser_name: str
) -> List[Dict[str, Any]]:
    """Enumerate notification permissions from Chromium-based browsers.

    Chromium stores permissions in the Preferences file (JSON) under
    profile.content_settings.exceptions.notifications
    """
    notifications = []

    if not os.path.exists(profiles_base):
        logger.info(f"Browser not found: {browser_name} at {profiles_base}")
        return notifications

    # Find all profile directories (Default, Profile 1, Profile 2, etc.)
    profile_dirs = ["Default"]
    for i in range(1, 20):  # Check up to Profile 19
        profile_dirs.append(f"Profile {i}")

    for profile_name in profile_dirs:
        profile_path = os.path.join(profiles_base, profile_name)
        prefs_file = os.path.join(profile_path, "Preferences")

        if not os.path.exists(prefs_file):
            continue

        try:
            with open(prefs_file, "r", encoding="utf-8") as f:
                prefs = json.load(f)

            # Navigate to notification settings
            notification_settings = (
                prefs.get("profile", {})
                .get("content_settings", {})
                .get("exceptions", {})
                .get("notifications", {})
            )

            for origin, settings in notification_settings.items():
                # Skip if not explicitly allowed
                if settings.get("setting") != 1:  # 1 = ALLOW
                    continue

                notification = {
                    "id": f"chromium:{browser_name}:{profile_name}:{origin}",
                    "browser": browser_name,
                    "profile": profile_name,
                    "origin": origin,
                    "type": "notification",
                    "permission": "allowed",
                    "last_modified": settings.get("last_modified", 0),
                    "prefs_file": prefs_file,
                }
                notifications.append(notification)
                logger.debug(f"Found notification: {browser_name} - {origin}")

        except Exception as e:
            logger.warning(
                f"Failed to read {browser_name} {profile_name} preferences: {e}"
            )

    return notifications


def enumerate_firefox_notifications(profiles_base: str) -> List[Dict[str, Any]]:
    """Enumerate notification permissions from Firefox.

    Firefox stores permissions in permissions.sqlite database.
    """
    notifications = []

    if not os.path.exists(profiles_base):
        logger.info(f"Firefox not found at {profiles_base}")
        return notifications

    # Find all profile directories
    try:
        profile_dirs = [
            d
            for d in os.listdir(profiles_base)
            if os.path.isdir(os.path.join(profiles_base, d))
        ]
    except Exception as e:
        logger.warning(f"Failed to list Firefox profiles: {e}")
        return notifications

    for profile_name in profile_dirs:
        profile_path = os.path.join(profiles_base, profile_name)
        permissions_db = os.path.join(profile_path, "permissions.sqlite")

        if not os.path.exists(permissions_db):
            continue

        # Create a temporary copy to avoid locking issues
        temp_db = permissions_db + ".temp"
        try:
            shutil.copy2(permissions_db, temp_db)

            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()

            # Query for notification permissions
            # type = 'desktop-notification', permission = 1 (ALLOW)
            cursor.execute("""
                SELECT origin, type, permission
                FROM moz_perms
                WHERE type = 'desktop-notification' AND permission = 1
            """)

            for row in cursor.fetchall():
                origin, perm_type, perm_value = row
                notification = {
                    "id": f"firefox:{profile_name}:{origin}",
                    "browser": "Mozilla Firefox",
                    "profile": profile_name,
                    "origin": origin,
                    "type": "notification",
                    "permission": "allowed",
                    "db_file": permissions_db,
                }
                notifications.append(notification)
                logger.debug(f"Found notification: Firefox - {origin}")

            conn.close()
            os.remove(temp_db)

        except Exception as e:
            logger.warning(f"Failed to read Firefox {profile_name} permissions: {e}")
            if os.path.exists(temp_db):
                try:
                    os.remove(temp_db)
                except:
                    pass

    return notifications


def enumerate_browser_notifications() -> List[Dict[str, Any]]:
    """Enumerate all browser notification permissions across installed browsers."""
    logger.info("Enumerating browser notification permissions...")
    sys.stderr.flush()

    all_notifications = []

    for browser_id, config in BROWSER_PATHS.items():
        logger.info(f"Checking {config['name']}...")
        sys.stderr.flush()

        try:
            if config["type"] == "chromium":
                notifications = enumerate_chromium_notifications(
                    config["profiles_base"], config["name"]
                )
            elif config["type"] == "firefox":
                notifications = enumerate_firefox_notifications(config["profiles_base"])
            else:
                notifications = []

            all_notifications.extend(notifications)
            logger.info(f"  Found {len(notifications)} allowed notification(s)")
            sys.stderr.flush()

        except Exception as e:
            logger.warning(f"Error checking {config['name']}: {e}")
            sys.stderr.flush()

    logger.info(f"Total notifications found: {len(all_notifications)}")
    sys.stderr.flush()

    return all_notifications


SYSTEM_INSTRUCTIONS = """<role>
You are an expert browser notification analyzer for a computer repair shop. Your role is to analyze browser notification permissions and recommend ONLY truly unnecessary or spammy notifications that should be disabled.
</role>

<critical_philosophy>
BE REASONABLY CONSERVATIVE. Recommend disabling notifications that meet these criteria:
1. Likely spam, marketing, or low-value content
2. Non-essential to user's work or critical communications
3. High frequency or interruption potential
4. User can still access the site/service without notifications
5. Reasonable confidence in classification

Balance user experience improvements with safety. Some notifications ARE valuable.
</critical_philosophy>

<never_disable>
<category name="Critical Communications">
- Work email services (Gmail for work domains, Outlook, corporate email)
- Business chat platforms (Slack, Microsoft Teams, Discord if used for work)
- Video conferencing (Zoom, Google Meet, Microsoft Teams notifications)
- Project management tools (Asana, Trello, Jira, Monday.com, Notion)
- Cloud services (AWS, Azure, Google Cloud Console)
</category>

<category name="Productivity & Time Management">
- Task management apps (Any.do, Todoist, Microsoft To Do, Google Keep, TickTick)
- Calendar services (Google Calendar, Outlook Calendar, Notion Calendar, calendar.notion.so)
- Pomodoro and focus timers (Pomofocus, Pomodone, Focus To-Do, Marinara Timer)
- Time tracking tools (Toggl, RescueTime, Clockify)
- Note-taking with reminders (Notion, Evernote, OneNote)
- Habit trackers with time-based alerts
- IMPORTANT: These services are notification-centric - their core value is alerting users at specific times
</category>

<category name="Notification Services & Alerting">
- Self-hosted notification services (ntfy, Gotify, Pushover)
- Custom alert systems (Uptime monitoring, server alerts, smart home notifications)
- Webhook notification endpoints
- Personal notification aggregators
- IMPORTANT: If the domain/service IS a notification platform, NEVER disable it
</category>

<category name="Development & Localhost">
- Localhost notifications (http://localhost:*, http://127.0.0.1:*)
- Local development servers (*.local, *.dev domains)
- Self-hosted services on custom domains
- IMPORTANT: These are often personal tools or services - be conservative
</category>

<category name="Security & Financial">
- Banking and financial services
- Payment processors (PayPal, Stripe dashboards)
- Cryptocurrency exchanges or wallets
- Two-factor authentication services
- Password managers
- Security alert services
</category>

<category name="Healthcare & Emergency">
- Medical portals or telehealth services
- Pharmacy notifications
- Health monitoring apps
- Emergency alert systems
</category>

<category name="Critical Services">
- Cloud storage (Google Drive, Dropbox, OneDrive) - for share notifications
- Government services or portals
- Educational platforms (Canvas, Blackboard, Google Classroom)
</category>
</never_disable>

<safe_to_disable>
<criteria>
Recommend disabling if the notification meets ANY of these:
- News websites or blogs (unless it's a specialized professional source)
- Social media platforms (Facebook, Twitter, Instagram, TikTok, Reddit)
- Entertainment sites (YouTube, streaming services, gaming sites)
- Shopping and e-commerce sites (Amazon, eBay, retail stores)
- Deal and coupon sites
- Sports scores and updates
- Weather sites (unless user specifically needs alerts)
- Content recommendation sites
- Marketing emails or promotional sites
- Dating apps or sites
- Forums or community sites (unless work-related)
</criteria>

<approved_categories>
<category name="Social Media & Entertainment">
- Facebook, Instagram, Twitter/X, TikTok, Snapchat, Reddit
- YouTube, Twitch, streaming platforms
- Gaming sites, game stores
- Entertainment news, celebrity gossip
</category>

<category name="Shopping & Deals">
- Amazon, eBay, AliExpress, retail sites
- Deal aggregators (Slickdeals, Honey)
- Coupon sites
- Price tracking sites
- Shopping comparison sites
</category>

<category name="News & Media">
- General news sites (CNN, BBC, NYTimes) - unless user's profession
- Sports sites and score updates
- Celebrity and entertainment news
- Viral content sites (BuzzFeed, BoredPanda)
- Blogs and personal sites
</category>

<category name="Marketing & Promotional">
- Newsletter subscription prompts
- "Get notifications for updates" generic prompts
- Marketing campaign landing pages
- Promotional microsites
- Affiliate marketing sites
</category>
</approved_categories>
</safe_to_disable>

<output_format>
Return a JSON object with this structure:
{
  "to_disable": [
    {
      "id": "exact_id_from_input",
      "origin": "https://example.com",
      "browser": "Google Chrome",
      "reason": "Brief explanation of why this should be disabled",
      "category": "social_media|shopping|news|entertainment|marketing|other",
      "confidence": "high|medium",
      "user_impact": "Brief description of what user loses",
      "alternative": "How user can still access this content"
    }
  ],
  "keep_enabled": [
    {
      "id": "exact_id_from_input",
      "origin": "https://important-site.com",
      "reason": "Why this should stay enabled"
    }
  ],
  "analysis_summary": {
    "total_analyzed": 50,
    "recommended_to_disable": 30,
    "spam_notifications": 15,
    "marketing_notifications": 10,
    "low_value_notifications": 5,
    "estimated_reduction": "60% fewer interruptions"
  }
}
</output_format>

<instructions>
1. Analyze each notification permission carefully
2. Consider the origin domain and its purpose
3. Classify based on the categories above
4. Be specific in your reasoning
5. Only recommend disabling if you're confident it won't harm the user's workflow
6. Provide clear alternatives for accessing the content

CRITICAL RULES:
- If the service's PRIMARY PURPOSE is sending notifications/alerts, NEVER disable it (e.g., ntfy, Gotify, Pushover)
- If it's a timer/pomodoro app that NEEDS to alert users, NEVER disable it (e.g., pomofocus, pomodone)
- If it's a task/reminder app whose VALUE is time-based notifications, NEVER disable it (e.g., Any.do, Todoist)
- If it's localhost or a self-hosted service, be VERY conservative - assume it's intentional
- If it's a calendar service, ALWAYS keep enabled
- When in doubt about whether a service needs notifications, KEEP IT ENABLED

Only disable notifications from:
- Social media (Facebook, Twitter, Instagram, TikTok, Reddit)
- News sites (CNN, BBC, etc.)
- Shopping sites (Amazon, eBay, etc.)
- Entertainment (YouTube, Netflix, gaming)
- Marketing/promotional sites
</instructions>
"""


def _call_openai_api(
    api_key: str,
    model: str,
    notifications: List[Dict[str, Any]],
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Call OpenAI (or compatible) API to analyze notification permissions."""

    if not requests:
        return {"success": False, "error": "requests library not available"}

    # Build the user message with notification data
    notifications_json = json.dumps(notifications, indent=2)
    user_message = f"""Analyze these browser notification permissions and recommend which should be disabled.

Total notifications to analyze: {len(notifications)}

Notification permissions:
```json
{notifications_json}
```

For each notification, determine if it should be disabled based on the guidelines provided.
Return your analysis as JSON following the specified format."""

    api_endpoint = base_url or "https://api.openai.com/v1"
    if not api_endpoint.endswith("/chat/completions"):
        api_endpoint = api_endpoint.rstrip("/") + "/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"Calling AI API: {api_endpoint}")
    logger.info(f"Model: {model}")
    sys.stderr.flush()

    try:
        response = requests.post(
            api_endpoint, headers=headers, json=payload, timeout=120
        )
        response.raise_for_status()
        outer = response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {e}")
        sys.stderr.flush()
        return {"success": False, "error": f"API request failed: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error calling API: {e}")
        sys.stderr.flush()
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

    # Parse response
    try:
        choices = outer.get("choices", [])
        if not choices:
            return {"success": False, "error": "No choices in API response"}

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            return {"success": False, "error": "Empty content in API response"}

        parsed = json.loads(content)

        # Ensure required fields exist
        if "to_disable" not in parsed:
            parsed["to_disable"] = []
        if "keep_enabled" not in parsed:
            parsed["keep_enabled"] = []
        if "analysis_summary" not in parsed:
            parsed["analysis_summary"] = {}

        # Extract token usage if available
        usage_info = outer.get("usage", {})

        logger.info(
            f"AI analysis complete. Recommendations: {len(parsed['to_disable'])} to disable, "
            f"{len(parsed.get('keep_enabled', []))} to keep"
        )
        sys.stderr.flush()

    except Exception as e:
        logger.error(f"Failed to parse AI response: {e}")
        sys.stderr.flush()
        return {
            "success": False,
            "error": f"Malformed API reply: {e} | body={str(outer)[:2000]}",
        }

    return {
        "success": True,
        "data": parsed,
        "usage": usage_info,
    }


def _disable_chromium_notification(prefs_file: str, origin: str) -> bool:
    """Disable a notification in Chromium-based browser by setting permission to BLOCK."""
    try:
        # Read current preferences
        with open(prefs_file, "r", encoding="utf-8") as f:
            prefs = json.load(f)

        # Navigate to notification settings
        if "profile" not in prefs:
            prefs["profile"] = {}
        if "content_settings" not in prefs["profile"]:
            prefs["profile"]["content_settings"] = {}
        if "exceptions" not in prefs["profile"]["content_settings"]:
            prefs["profile"]["content_settings"]["exceptions"] = {}
        if "notifications" not in prefs["profile"]["content_settings"]["exceptions"]:
            prefs["profile"]["content_settings"]["exceptions"]["notifications"] = {}

        notifications = prefs["profile"]["content_settings"]["exceptions"][
            "notifications"
        ]

        # Set permission to BLOCK (2)
        if origin in notifications:
            notifications[origin]["setting"] = 2  # 2 = BLOCK
            notifications[origin]["last_modified"] = str(int(time.time()))

        # Write back to file
        with open(prefs_file, "w", encoding="utf-8") as f:
            json.dump(prefs, f, indent=2)

        return True

    except Exception as e:
        logger.warning(f"Failed to disable Chromium notification {origin}: {e}")
        return False


def _disable_firefox_notification(db_file: str, origin: str) -> bool:
    """Disable a notification in Firefox by updating permissions database."""
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        # Update capability to BLOCK (2)
        cursor.execute(
            """
            UPDATE moz_perms
            SET capability = 2
            WHERE origin = ? AND permission = 'desktop-notification'
        """,
            (origin,),
        )

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        logger.warning(f"Failed to disable Firefox notification {origin}: {e}")
        return False


def run_ai_browser_notification_disable(task: Dict[str, Any]) -> Dict[str, Any]:
    """Enumerate browser notifications, consult AI for disable suggestions, and optionally apply them.

    Task schema:
      type: "ai_browser_notification_disable"
      api_key: str (required, or "env:VARNAME" to read from environment)
      model: str (required, e.g., "gpt-4o-mini", "gpt-4o")
      base_url: str (optional, for custom OpenAI-compatible endpoints)
      apply_changes: bool (optional, default False - if True, actually disables notifications)
      preview_mode: bool (optional, default True - same as apply_changes=False)
    """
    add_breadcrumb(
        "Starting AI browser notification optimizer",
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

    # Handle preview_mode parameter (inverse of apply_changes)
    if "preview_mode" in task:
        apply_changes = not bool(task.get("preview_mode", True))

    # Support environment-backed API keys
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
            "task_type": "ai_browser_notification_disable",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": "Missing required parameters: api_key and model"
                },
                "results": {},
            },
        }

    # Enumerate browser notifications
    logger.info("=" * 60)
    logger.info("ENUMERATING BROWSER NOTIFICATIONS")
    logger.info("=" * 60)
    sys.stderr.flush()

    add_breadcrumb("Enumerating browser notifications", category="task", level="info")

    notifications = enumerate_browser_notifications()

    if not notifications:
        logger.info("No browser notification permissions found.")
        sys.stderr.flush()
        duration = time.time() - start_time
        return {
            "task_type": "ai_browser_notification_disable",
            "status": "success",
            "summary": {
                "human_readable": {
                    "mode": "Preview Mode" if not apply_changes else "Applied Changes",
                    "total_notifications": 0,
                    "recommendations": 0,
                    "notifications_disabled": 0,
                    "errors": 0,
                    "model_used": model,
                    "duration_seconds": round(duration, 2),
                },
                "results": {
                    "enumerated_count": 0,
                    "all_notifications": [],
                    "to_disable": [],
                    "keep_enabled": [],
                    "analysis_summary": {},
                    "disabled": [],
                    "errors": [],
                    "applied": apply_changes,
                },
            },
        }

    logger.info(f"Found {len(notifications)} notification permission(s) to analyze")
    sys.stderr.flush()

    # Call AI for analysis
    logger.info("=" * 60)
    logger.info("CONSULTING AI FOR RECOMMENDATIONS")
    logger.info("=" * 60)
    sys.stderr.flush()

    add_breadcrumb(
        "Calling AI model for notification analysis",
        category="task",
        level="info",
        data={"model": model, "notification_count": len(notifications)},
    )

    ai_response = _call_openai_api(api_key, model, notifications, base_url)

    if not ai_response.get("success"):
        logger.error(f"AI analysis failed: {ai_response.get('error')}")
        sys.stderr.flush()
        duration = time.time() - start_time
        return {
            "task_type": "ai_browser_notification_disable",
            "status": "error",
            "summary": {
                "human_readable": {
                    "error": f"AI analysis failed: {ai_response.get('error')}",
                    "duration_seconds": round(duration, 2),
                },
                "results": {
                    "enumerated_count": len(notifications),
                    "all_notifications": notifications,
                },
            },
        }

    ai_data = ai_response["data"]
    suggestions = ai_data.get("to_disable", [])
    keep_enabled = ai_data.get("keep_enabled", [])
    analysis_summary = ai_data.get("analysis_summary", {})

    # Display recommendations
    logger.info("=" * 60)
    logger.info("AI RECOMMENDATIONS")
    logger.info("=" * 60)
    logger.info(f"Total analyzed: {len(notifications)}")
    logger.info(f"Recommended to disable: {len(suggestions)}")
    logger.info(f"Recommended to keep: {len(keep_enabled)}")
    logger.info("=" * 60)
    sys.stderr.flush()

    if suggestions:
        logger.info("\nNOTIFICATIONS TO DISABLE:")
        for idx, entry in enumerate(suggestions, 1):
            logger.info(f"\n{idx}. {entry.get('origin')} ({entry.get('browser')})")
            logger.info(f"   Category: {entry.get('category')}")
            logger.info(f"   Reason: {entry.get('reason')}")
            logger.info(f"   Impact: {entry.get('user_impact')}")
            logger.info(f"   Alternative: {entry.get('alternative')}")
        sys.stderr.flush()

    # Index notifications by id for quick lookup
    notifications_by_id = {n["id"]: n for n in notifications}

    disabled: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Apply changes if requested
    if apply_changes and suggestions:
        logger.info("=" * 60)
        logger.info("APPLYING CHANGES - Disabling recommended notifications...")
        logger.info("=" * 60)
        sys.stderr.flush()

        add_breadcrumb(
            "Applying AI recommendations to disable browser notifications",
            category="task",
            level="info",
            data={"notifications_to_disable": len(suggestions)},
        )

        for idx, entry in enumerate(suggestions, 1):
            nid = entry.get("id")
            origin = entry.get("origin", "Unknown")

            logger.info(f"[{idx}/{len(suggestions)}] Processing: {origin}")
            sys.stderr.flush()

            if nid not in notifications_by_id:
                logger.warning(f"  ⚠ Skipped: Notification ID not found")
                sys.stderr.flush()
                skipped.append(
                    {"id": nid, "origin": origin, "reason": "not_found_in_enumeration"}
                )
                continue

            notification = notifications_by_id[nid]
            success = False
            error_msg = None

            try:
                if nid.startswith("chromium:"):
                    success = _disable_chromium_notification(
                        notification["prefs_file"], notification["origin"]
                    )
                    if not success:
                        error_msg = "Failed to update preferences file"
                elif nid.startswith("firefox:"):
                    success = _disable_firefox_notification(
                        notification["db_file"], notification["origin"]
                    )
                    if not success:
                        error_msg = "Failed to update permissions database"
                else:
                    error_msg = "Unknown notification type"
            except Exception as e:
                error_msg = f"Exception: {str(e)}"

            if success:
                logger.info(f"  ✓ Disabled: {origin}")
                sys.stderr.flush()
                disabled.append(
                    {
                        "id": nid,
                        "origin": origin,
                        "browser": notification["browser"],
                        "reason": entry.get("reason"),
                        "category": entry.get("category"),
                    }
                )
            else:
                logger.error(f"  ✗ Failed: {origin} - {error_msg}")
                sys.stderr.flush()
                errors.append({"id": nid, "origin": origin, "error": error_msg})

        logger.info("=" * 60)
        logger.info(
            f"SUMMARY: {len(disabled)} disabled, {len(errors)} errors, {len(skipped)} skipped"
        )
        logger.info("=" * 60)
        sys.stderr.flush()

    elif suggestions:
        logger.info("PREVIEW MODE - No changes applied")
        logger.info("Run with apply_changes=true to disable these notifications:")
        for idx, entry in enumerate(suggestions, 1):
            logger.info(f"  {idx}. {entry.get('origin')} - {entry.get('reason')}")
        sys.stderr.flush()

    duration = time.time() - start_time

    # Build standardized result
    status = "success"
    if apply_changes and errors:
        status = "warning" if disabled else "error"

    add_breadcrumb(
        f"AI browser notification optimizer completed: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "warning"
        else "error",
        data={
            "total_notifications": len(notifications),
            "recommendations": len(suggestions),
            "disabled": len(disabled) if apply_changes else 0,
            "errors": len(errors) if apply_changes else 0,
            "duration_seconds": round(duration, 2),
        },
    )

    return {
        "task_type": "ai_browser_notification_disable",
        "status": status,
        "summary": {
            "human_readable": {
                "mode": "Applied Changes" if apply_changes else "Preview Mode",
                "total_notifications": len(notifications),
                "recommendations": len(suggestions),
                "notifications_disabled": len(disabled) if apply_changes else 0,
                "notifications_skipped": len(skipped) if apply_changes else 0,
                "errors": len(errors) if apply_changes else 0,
                "notifications_kept_enabled": len(keep_enabled),
                "estimated_reduction": analysis_summary.get(
                    "estimated_reduction", "Unknown"
                ),
                "model_used": model,
                "duration_seconds": round(duration, 2),
            },
            "results": {
                "enumerated_count": len(notifications),
                "all_notifications": notifications,
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


__all__ = ["run_ai_browser_notification_disable"]
