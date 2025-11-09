"""AdwCleaner service: run a cleanup and parse the resulting log file.

Executes AdwCleaner in no-reboot mode and extracts structured results from the
latest log (counts and per-category lists). Requires paths to executable and
working directory where logs are produced.
"""

import subprocess
import logging
import os
import re
from typing import Dict, Any, List
from pathlib import Path

# Import subprocess utility with skip checking
try:
    from subprocess_utils import run_with_skip_check
except ImportError:
    # Fallback if utility not available
    run_with_skip_check = subprocess.run

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def parse_adwcleaner_log(log_path: str) -> Dict[str, Any]:
    """Parse the latest AdwCleaner log file and return structured data."""
    summary = {
        "cleaned": 0,
        "failed": 0,
        "registry": [],
        "files": [],
        "folders": [],
        "services": [],
        "tasks": [],
        "shortcuts": [],
        "dlls": [],
        "wmi": [],
        "browsers": {},
        "preinstalled": [],
    }

    current_section = None
    section_map = {
        "Services": "services",
        "Folders": "folders",
        "Files": "files",
        "DLL": "dlls",
        "WMI": "wmi",
        "Shortcuts": "shortcuts",
        "Tasks": "tasks",
        "Registry": "registry",
        "Chromium (and derivatives)": ("browsers", "chromium"),
        "Chromium URLs": ("browsers", "chromium_urls"),
        "Firefox (and derivatives)": ("browsers", "firefox"),
        "Firefox URLs": ("browsers", "firefox_urls"),
        "Hosts File Entries": ("browsers", "hosts"),
        "Preinstalled Software": "preinstalled",
    }

    with open(log_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()

            # summary numbers
            if line.startswith("# Cleaned:"):
                try:
                    summary["cleaned"] = int(line.split(":")[1].strip())
                except ValueError:
                    pass
            elif line.startswith("# Failed:"):
                try:
                    summary["failed"] = int(line.split(":")[1].strip())
                except ValueError:
                    pass

            # section headers
            m = re.match(r"\*{5} \[ (.+?) \] \*{5}", line)
            if m:
                section = m.group(1).strip()
                current_section = section_map.get(section)
                continue

            # section content
            if current_section:
                if line.startswith("########## EOF"):
                    # Stop parsing at EOF marker
                    break

                if isinstance(current_section, tuple):
                    key = current_section[1]
                    if "No malicious" not in line and line:
                        summary["browsers"].setdefault(key, []).append(line)
                elif isinstance(current_section, str):
                    if (
                        "No malicious" not in line
                        and "No Preinstalled" not in line
                        and not line.startswith("AdwCleaner[")
                        and not line.startswith("########## EOF")
                        and line
                    ):
                        summary[current_section].append(line)

    return summary


def find_latest_log(log_dir: str) -> str:
    """Find the newest AdwCleaner log file in a given directory."""
    log_path = Path(log_dir)
    if not log_path.exists():
        return None
    logs = sorted(
        log_path.glob("AdwCleaner*.txt"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return str(logs[0]) if logs else None


def run_adwcleaner_clean(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run AdwCleaner with given options and parse the latest log."""
    add_breadcrumb(
        "Starting AdwCleaner clean",
        category="task",
        level="info",
        data={"clean_preinstalled": task.get("clean_preinstalled", False)},
    )

    logger.info("Starting AdwCleaner task.")
    exec_path = task.get("executable_path")
    working_path = task.get("working_path")
    clean_preinstalled = task.get("clean_preinstalled", False)

    if not exec_path or not working_path:
        logger.error("Missing required AdwCleaner task parameters.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": "Executable path or working path missing."},
        }

    # AdwCleaner CLI args
    command = [
        exec_path,
        "/eula",
        "/clean",
        "/noreboot",
        "/path",
        working_path,
    ]
    if clean_preinstalled:
        command.append("/preinstalled")

    logger.info(f"Executing command: {' '.join(command)}")

    add_breadcrumb(
        "Executing AdwCleaner",
        category="subprocess",
        level="info",
        data={"command": " ".join(command[:3])},  # Don't log full paths
    )

    try:
        process = run_with_skip_check(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )

        if process.returncode != 0:
            logger.error(f"AdwCleaner exited with error code {process.returncode}.")
            return {
                "task_type": "adwcleaner_clean",
                "status": "failure",
                "summary": {
                    "error": f"Process exited with code {process.returncode}.",
                    "details": process.stderr.strip(),
                },
            }

        # Locate the latest log file
        logs_dir = os.path.join(working_path, "AdwCleaner", "Logs")

        # Create the logs directory if it doesn't exist
        os.makedirs(logs_dir, exist_ok=True)

        latest_log = find_latest_log(logs_dir)
        if not latest_log:
            logger.error("No AdwCleaner log file found.")
            return {
                "task_type": "adwcleaner_clean",
                "status": "failure",
                "summary": {"error": "No log file was generated."},
            }

        parsed_summary = parse_adwcleaner_log(latest_log)

        add_breadcrumb(
            "AdwCleaner completed",
            category="task",
            level="info",
            data={
                "cleaned": parsed_summary.get("cleaned", 0),
                "failed": parsed_summary.get("failed", 0),
            },
        )

        logger.info("AdwCleaner task completed successfully.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "success",
            "summary": parsed_summary,
            "log_file": latest_log,
        }

    except FileNotFoundError:
        logger.error(f"AdwCleaner executable not found at '{exec_path}'.")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:
        logger.error(f"Unexpected error running AdwCleaner: {e}")
        return {
            "task_type": "adwcleaner_clean",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {str(e)}"},
        }
