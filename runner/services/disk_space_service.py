"""Disk space report service.

Reports disk usage for all mounted drives using shutil.disk_usage.
Excludes USB drives and network locations.

Task schema (dict expected):
  type: "disk_space_report"

Return dict structure:
  {
    task_type: "disk_space_report",
    status: "success" | "failure",
    summary: {
      drives: [
        {
          drive: "C:",
          total_gb: float,
          used_gb: float,
          free_gb: float,
          usage_percent: float
        },
        ...
      ],
      human_readable: {
        summary: str,
        warnings: [str]
      }
    }
  }
"""

import shutil
import string
import logging
import ctypes
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _get_drive_type(drive: str) -> int:
    """Get the drive type using Windows API.

    Returns:
        0: Unknown
        1: No root directory
        2: Removable (USB)
        3: Fixed (HDD/SSD)
        4: Remote (Network)
        5: CD-ROM
        6: RAM disk
    """
    try:
        return ctypes.windll.kernel32.GetDriveTypeW(drive)
    except Exception:
        return 0  # Unknown


def run_disk_space_report(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run disk space report for all drives, excluding USB and network drives."""
    add_breadcrumb("Starting disk space report", category="task", level="info")

    try:
        drives = []
        warnings = []

        # Check all possible drive letters A-Z
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            try:
                # Check drive type - skip USB (2) and network (4) drives
                drive_type = _get_drive_type(drive)
                if drive_type in (
                    2,
                    4,
                ):  # DRIVE_REMOVABLE (USB) or DRIVE_REMOTE (Network)
                    continue

                usage = shutil.disk_usage(drive)
                total_gb = usage.total / (1024**3)
                used_gb = usage.used / (1024**3)
                free_gb = usage.free / (1024**3)
                usage_percent = (used_gb / total_gb) * 100 if total_gb > 0 else 0

                drives.append(
                    {
                        "drive": drive,
                        "total_gb": round(total_gb, 2),
                        "used_gb": round(used_gb, 2),
                        "free_gb": round(free_gb, 2),
                        "usage_percent": round(usage_percent, 1),
                    }
                )
            except OSError:
                # Drive not accessible or doesn't exist
                continue

        add_breadcrumb(
            f"Enumerated {len(drives)} drives",
            category="task",
            level="info",
            data={"drive_count": len(drives)},
        )

        if not drives:
            add_breadcrumb(
                "No drives found or accessible", category="task", level="warning"
            )
            return {
                "task_type": "disk_space_report",
                "status": "failure",
                "summary": {"error": "No drives found or accessible"},
            }

        # Generate human readable summary
        summary_lines = []
        for drive_info in drives:
            drive = drive_info["drive"]
            used = drive_info["used_gb"]
            total = drive_info["total_gb"]
            percent = drive_info["usage_percent"]
            summary_lines.append(
                f"{drive}: {used:.1f}GB used of {total:.1f}GB ({percent:.1f}%)"
            )

            if percent > 90:
                warnings.append(
                    f"Drive {drive} is critically low on space ({percent:.1f}% used)"
                )
                add_breadcrumb(
                    f"Critical disk space warning",
                    category="task",
                    level="warning",
                    data={"drive": drive, "usage_percent": percent},
                )
            elif percent > 80:
                warnings.append(
                    f"Drive {drive} is running low on space ({percent:.1f}% used)"
                )
                add_breadcrumb(
                    f"Low disk space warning",
                    category="task",
                    level="warning",
                    data={"drive": drive, "usage_percent": percent},
                )

        summary = "\n".join(summary_lines)

        add_breadcrumb(
            "Disk space report completed successfully",
            category="task",
            level="info",
            data={"drive_count": len(drives), "warning_count": len(warnings)},
        )

        return {
            "task_type": "disk_space_report",
            "status": "success",
            "summary": {
                "drives": drives,
                "human_readable": {"summary": summary, "warnings": warnings},
            },
        }

    except Exception as e:
        logger.exception("Disk space report failed")
        return {
            "task_type": "disk_space_report",
            "status": "failure",
            "summary": {"error": str(e)},
        }
