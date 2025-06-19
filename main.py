import os
import sys
import webview
from app.system_info import SystemInfo


# API exposed to JS in the webview
class Api:
    def __init__(self):
        self.base_path = self.get_base_path()
        self.system_info = SystemInfo()  # Create an instance of SystemInfo

    def get_base_path(self):
        if getattr(sys, "frozen", False):
            # Running from compiled exe
            return os.path.dirname(sys.executable)
        else:
            # Running from script
            return os.path.dirname(os.path.abspath(__file__))

    def get_tool_path(self, tool_name):
        return os.path.join(self.base_path, "data", tool_name)

    def get_all_info(self):
        """Get all system information"""
        return self.system_info.get_all_info()

    def run_scan(self):
        # Placeholder: Replace with real scan logic using subprocess etc.
        scanner_path = self.get_tool_path("scanner1/scanner.exe")
        # You’d call subprocess here to run the scanner:
        # result = subprocess.run([scanner_path, '--scan'], capture_output=True)
        # For now, just simulate:
        return "Scan simulated. Scanner would run from:\n" + scanner_path

    def get_system_info(self):
        import platform

        return {
            "os": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "processor": platform.processor(),
        }

    def open_system_program(self, program):
        """Open Windows system programs"""
        import subprocess
        import platform

        if platform.system() != "Windows":
            return {"error": "This feature is only available on Windows"}

        commands = {
            # Control Panel and Settings
            "control": "control.exe",
            "settings": "start ms-settings:",
            "windowsfeatures": "optionalfeatures.exe",
            "systemproperties": "sysdm.cpl",
            "ncpa": "ncpa.cpl",  # Network Connections
            "powercfg": "powercfg.cpl",  # Power Options
            "appwiz": "appwiz.cpl",  # Programs and Features
            "sysdm": "sysdm.cpl",  # System Properties
            "firewall": "firewall.cpl",
            "netplwiz": "netplwiz.exe",  # User Accounts
            # Administrative Tools
            "devmgmt": "devmgmt.msc",  # Device Manager
            "diskmgmt": "diskmgmt.msc",  # Disk Management
            "compmgmt": "compmgmt.msc",  # Computer Management
            "services": "services.msc",  # Services
            "taskmgr": "taskmgr.exe",  # Task Manager
            "msconfig": "msconfig.exe",  # System Configuration
            "eventvwr": "eventvwr.msc",  # Event Viewer
            "perfmon": "perfmon.exe",  # Performance Monitor
            "resmon": "resmon.exe",  # Resource Monitor
            "taskschd": "taskschd.msc",  # Task Scheduler
            "wmimgmt": "wmimgmt.msc",  # WMI Management
            # System Tools
            "regedit": "regedit.exe",  # Registry Editor
            "msinfo32": "msinfo32.exe",  # System Information
            "dxdiag": "dxdiag.exe",  # DirectX Diagnostic Tool
            "cleanmgr": "cleanmgr.exe",  # Disk Cleanup
            "mdsched": "mdsched.exe",  # Windows Memory Diagnostic
            "mstsc": "mstsc.exe",  # Remote Desktop
            "snippingtool": "snippingtool.exe",
            "cmd": "cmd.exe",  # Command Prompt
            "powershell": "powershell.exe",
            # Security and Maintenance
            "secpol": "secpol.msc",  # Security Policy
            "certmgr": "certmgr.msc",  # Certificate Manager
            "azman": "azman.msc",  # Authorization Manager
            "gpedit": "gpedit.msc",  # Group Policy Editor
            "lusrmgr": "lusrmgr.msc",  # Local Users and Groups
            # Network Tools
            "ncpa": "ncpa.cpl",  # Network Connections
            "netstat": "netstat.exe",
            "ipconfig": "ipconfig.exe",
            # Accessibility
            "magnify": "magnify.exe",  # Magnifier
            "narrator": "narrator.exe",
            "osk": "osk.exe",  # On-Screen Keyboard
            # Windows Tools
            "calc": "calc.exe",  # Calculator
            "notepad": "notepad.exe",
            "charmap": "charmap.exe",  # Character Map
            "mspaint": "mspaint.exe",  # Paint
        }

        if program not in commands:
            return {"error": f"Unknown program: {program}"}

        try:
            subprocess.Popen(commands[program], shell=True)
            return {"success": True}
        except Exception as e:
            return {"error": str(e)}


def start():
    api = Api()
    web_dir = os.path.join(api.get_base_path(), "web")
    index_html = os.path.join(web_dir, "index.html")
    webview.create_window("AutoService", index_html, js_api=api)
    webview.start()


if __name__ == "__main__":
    start()

    # Test the system info directly
    try:
        test_info = Api().get_all_info()
        print("System Info Test:", test_info)
    except Exception as e:
        print("Error getting system info:", str(e))
