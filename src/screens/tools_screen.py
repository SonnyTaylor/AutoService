import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
import subprocess


class ToolsScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()

    def create_widgets(self):
        # Tools Frame
        tools_frame = tb.LabelFrame(
            self, text=" System Tools ", bootstyle="success", padding=15
        )
        tools_frame.pack(fill=BOTH, expand=YES, pady=10)

        # Tools Buttons with Windows system programs
        tools = [
            ("Device Manager", "devmgmt.msc"),
            ("Registry Editor", "regedit"),
            ("Command Prompt", "cmd"),
            ("PowerShell", "powershell"),
            ("Control Panel", "control"),
            ("Task Manager", "taskmgr"),
            ("Services", "services.msc"),
            ("System Configuration", "msconfig"),
            ("Disk Management", "diskmgmt.msc"),
            ("Event Viewer", "eventvwr.msc"),
        ]

        # Create button grid
        btn_frame = tb.Frame(tools_frame)
        btn_frame.pack(expand=YES, pady=10)

        # Arrange buttons in a 3x4 grid
        for i, (text, command) in enumerate(tools):
            row = i // 3
            col = i % 3
            btn = tb.Button(
                btn_frame,
                text=text,
                bootstyle=PRIMARY,
                command=lambda cmd=command: self.run_system_tool(cmd),
                width=20,
            )
            btn.grid(row=row, column=col, pady=5, padx=5)

    def run_system_tool(self, command):
        try:
            subprocess.run(command, shell=True)
        except Exception as e:
            Messagebox.show_error(f"Error launching {command}: {str(e)}", "Error")
