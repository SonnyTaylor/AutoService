import subprocess

import ttkbootstrap as tb
from ttkbootstrap.constants import BOTH, YES, PRIMARY
from ttkbootstrap.dialogs import Messagebox


class UtilitiesScreen(tb.Frame):
    """
    A screen that provides quick access to common Windows system utilities and tools.
    Displays a grid of buttons that launch various system management programs.
    """

    def __init__(self, master):
        """
        Initialize the utilities screen.

        Args:
            master: Parent widget
        """
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()

    def create_widgets(self):
        """Create and arrange all widgets for the utilities interface."""
        # Create main utilities container frame
        tools_frame = tb.LabelFrame(
            self, text=" System Utilities ", bootstyle="success", padding=15
        )
        tools_frame.pack(fill=BOTH, expand=YES, pady=10)

        # Define available Windows system tools with their commands and icons
        tools = [
            ("Device Manager", "devmgmt.msc", "🖥️"),
            ("Registry Editor", "regedit", "📝"),
            ("Command Prompt", "cmd", "💻"),
            ("PowerShell", "powershell", "⚡"),
            ("Control Panel", "control", "⚙️"),
            ("Task Manager", "taskmgr", "📊"),
            ("Services", "services.msc", "🔧"),
            ("System Config", "msconfig", "⚙️"),
            ("Disk Management", "diskmgmt.msc", "💿"),
            ("Event Viewer", "eventvwr.msc", "📋"),
            ("Perf Monitor", "perfmon.msc", "📈"),
            ("Resource Monitor", "resmon", "📊"),
            ("Computer Mgmt", "compmgmt.msc", "💻"),
            ("Group Policy", "gpedit.msc", "👥"),
            ("DirectX Diag", "dxdiag", "🎮"),
            ("System Info", "msinfo32", "ℹ️"),
            ("Network", "ncpa.cpl", "🌐"),
            ("Firewall", "firewall.cpl", "🛡️"),
            ("System Props", "sysdm.cpl", "⚙️"),
            ("User Accounts", "netplwiz", "👤"),
            ("Windows Features", "optionalfeatures", "✨"),
            ("Disk Cleanup", "cleanmgr", "🧹"),
            ("Character Map", "charmap", "🔤"),
            ("Remote Desktop", "mstsc", "🖥️"),
        ]

        # Create frame for button grid
        btn_frame = tb.Frame(tools_frame)
        btn_frame.pack(expand=YES, pady=10)

        # Create and arrange buttons in a 3x8 grid layout
        for i, (text, command, icon) in enumerate(tools):
            row = i // 3  # Calculate row position
            col = i % 3  # Calculate column position
            btn = tb.Button(
                btn_frame,
                text=f"{icon} {text}",
                bootstyle=PRIMARY,
                command=lambda cmd=command: self.run_system_tool(cmd),
                width=25,
            )
            btn.grid(row=row, column=col, pady=5, padx=5)

    def run_system_tool(self, command):
        """
        Launch a Windows system tool using the provided command.

        Args:
            command: The command to execute (e.g. 'devmgmt.msc', 'regedit')
        """
        try:
            subprocess.run(command, shell=True)
        except Exception as e:
            Messagebox.show_error(f"Error launching {command}: {str(e)}", "Error")
