"""Windows system utilities and shortcuts launcher"""

import os
import subprocess
from typing import Dict, List


class WindowsShortcuts:
    @staticmethod
    def get_shortcut_categories() -> Dict[str, List[Dict[str, str]]]:
        """Returns all available Windows shortcuts organized by categories"""
        return {
            "System Tools": [
                {"name": "Control Panel", "command": "control"},
                {"name": "Device Manager", "command": "devmgmt.msc"},
                {"name": "Disk Management", "command": "diskmgmt.msc"},
                {"name": "Registry Editor", "command": "regedit"},
                {"name": "Services", "command": "services.msc"},
                {"name": "System Configuration", "command": "msconfig"},
                {"name": "System Information", "command": "msinfo32"},
                {"name": "Task Manager", "command": "taskmgr"},
                {"name": "Windows Security", "command": "windowsdefender:"},
            ],
            "Administrative Tools": [
                {"name": "Computer Management", "command": "compmgmt.msc"},
                {"name": "Event Viewer", "command": "eventvwr.msc"},
                {"name": "Group Policy Editor", "command": "gpedit.msc"},
                {"name": "Local Security Policy", "command": "secpol.msc"},
                {"name": "Performance Monitor", "command": "perfmon.msc"},
                {"name": "Resource Monitor", "command": "resmon"},
            ],
            "Network Tools": [
                {"name": "Network Connections", "command": "ncpa.cpl"},
                {"name": "Network Status", "command": "ms-settings:network-status"},
                {"name": "Remote Desktop", "command": "mstsc"},
                {"name": "Windows Firewall", "command": "firewall.cpl"},
                {
                    "name": "Network Diagnostics",
                    "command": "ms-settings:network-troubleshoot",
                },
            ],
            "Power & Hardware": [
                {"name": "Power Options", "command": "powercfg.cpl"},
                {"name": "Sound Settings", "command": "mmsys.cpl"},
                {"name": "System Properties", "command": "sysdm.cpl"},
                {"name": "DirectX Diagnostic Tool", "command": "dxdiag"},
                {"name": "Bluetooth Settings", "command": "ms-settings:bluetooth"},
            ],
            "Terminal & Development": [
                {"name": "Command Prompt", "command": "cmd"},
                {"name": "Command Prompt (Admin)", "command": "cmd", "admin": True},
                {"name": "PowerShell", "command": "powershell"},
                {"name": "PowerShell (Admin)", "command": "powershell", "admin": True},
                {"name": "Windows Terminal", "command": "wt"},
                {"name": "Windows Terminal (Admin)", "command": "wt", "admin": True},
            ],
            "Windows Settings": [
                {"name": "Settings", "command": "ms-settings:"},
                {"name": "Windows Update", "command": "ms-settings:windowsupdate"},
                {"name": "Apps & Features", "command": "ms-settings:appsfeatures"},
                {"name": "Display Settings", "command": "ms-settings:display"},
                {"name": "Personalization", "command": "ms-settings:personalization"},
            ],
            "Maintenance": [
                {"name": "Disk Cleanup", "command": "cleanmgr"},
                {"name": "Programs and Features", "command": "appwiz.cpl"},
                {"name": "Storage Settings", "command": "ms-settings:storagesense"},
                {"name": "System Restore", "command": "rstrui"},
                {"name": "Windows Memory Diagnostic", "command": "mdsched"},
            ],
        }

    @staticmethod
    def launch_shortcut(command: str, admin: bool = False) -> None:
        """Launch a Windows utility or command

        Args:
            command: The command to execute
            admin: Whether to run with administrative privileges
        """
        try:
            if admin:
                # For administrative privileges
                subprocess.run(["runas", "/user:Administrator", command], check=True)
            else:
                # For normal execution
                if command.startswith("ms-settings:"):
                    # Handle modern Windows Settings URIs
                    os.startfile(command)
                else:
                    subprocess.Popen(command, shell=True)
        except Exception as e:
            print(f"Error launching {command}: {str(e)}")
