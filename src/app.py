import ttkbootstrap as tb
from ttkbootstrap.constants import *
import tkinter as tk
from .screens.scan_screen import ScanScreen
from .screens.system_info_screen import SystemInfoScreen
from .screens.tools_screen import ToolsScreen
from .screens.settings_screen import SettingsScreen


class AutoService:
    def __init__(self, root):
        self.root = root
        self.root.title("AutoService v1.0")
        self.root.geometry("1000x800")

        # Set the taskbar icon
        icon_path = "resources/favicon.ico"
        self.root.iconbitmap(icon_path)

        # Set theme and style
        self.style = tb.Style("darkly")
        self.style.configure("TButton", font=("Segoe UI", 10))

        # Create main container
        self.main_container = tb.Frame(root)
        self.main_container.pack(fill=BOTH, expand=YES)

        # Create notebook for tabs
        self.notebook = tb.Notebook(self.main_container, bootstyle="primary")
        self.notebook.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Create tabs
        self.tab1 = tb.Frame(self.notebook)
        self.tab2 = tb.Frame(self.notebook)
        self.tab3 = tb.Frame(self.notebook)
        self.tab4 = tb.Frame(self.notebook)
        # Add tabs to notebook
        self.notebook.add(self.tab1, text="Scans")
        self.notebook.add(self.tab2, text="System Info")
        self.notebook.add(self.tab3, text="Tools")
        self.notebook.add(self.tab4, text="Settings")

        # Create screens
        self.scan_screen = ScanScreen(self.tab1, self)
        self.system_info_screen = SystemInfoScreen(self.tab2)
        self.tools_screen = ToolsScreen(self.tab3)
        self.settings_screen = SettingsScreen(self.tab4)
        # Status Bar at the bottom of main window
        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        self.status_bar = tb.Label(
            self.main_container,
            textvariable=self.status_var,
            relief=SUNKEN,
            anchor=W,
            bootstyle="secondary",
            foreground="white",
        )
        self.status_bar.pack(fill=X, side=BOTTOM, pady=(5, 0))

    def update_status(self, message):
        self.status_var.set(message)
        self.root.update()
