import ttkbootstrap as tb
from ttkbootstrap.constants import *
import tkinter as tk
from .screens.scan_screen import ScanScreen
from .screens.system_info_screen import SystemInfoScreen
from .screens.tools_screen import ToolsScreen
from .screens.settings_screen import SettingsScreen
from .screens.programs_screen import ProgramsScreen
import os
import sys


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

    return os.path.join(base_path, relative_path)


class AutoService:
    """
    Main application class that sets up the GUI window and manages different screens.

    This class initializes the main window, sets up the tab-based interface,
    and manages the different screens of the application including scan, system info,
    tools and settings screens.
    """

    def __init__(self, root):
        """
        Initialize the AutoService application.

        Args:
            root: The root window (ttkbootstrap.Window instance)
        """
        self.root = root
        self.root.title("AutoService v1.0")
        self.root.geometry("1000x800")

        # Set the taskbar icon
        try:
            icon_path = resource_path("data/resources/favicon.ico")
            self.root.iconbitmap(icon_path)
        except Exception:
            # If icon loading fails, continue without it
            pass

        # Configure application theme and button style
        self.style = tb.Style("darkly")
        self.style.configure("TButton", font=("Segoe UI", 10))

        # Create main container frame
        self.main_container = tb.Frame(root)
        self.main_container.pack(fill=BOTH, expand=YES)

        # Initialize notebook widget for tab management
        self.notebook = tb.Notebook(self.main_container, bootstyle="primary")
        self.notebook.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Create individual tab frames
        self.tab1 = tb.Frame(self.notebook)
        self.tab2 = tb.Frame(self.notebook)
        self.tab3 = tb.Frame(self.notebook)
        self.tab4 = tb.Frame(self.notebook)
        self.tab5 = tb.Frame(self.notebook)

        # Add tabs to the notebook with their respective labels
        self.notebook.add(self.tab1, text="Scans")
        self.notebook.add(self.tab2, text="System Info")
        self.notebook.add(self.tab3, text="Tools")
        self.notebook.add(self.tab4, text="Programs")
        self.notebook.add(self.tab5, text="Settings")

        # Initialize screen objects for each tab
        self.scan_screen = ScanScreen(self.tab1, self)
        self.system_info_screen = SystemInfoScreen(self.tab2)
        self.tools_screen = ToolsScreen(self.tab3)
        self.programs_screen = ProgramsScreen(self.tab4)
        self.settings_screen = SettingsScreen(self.tab5)

        # Create status bar at the bottom of the window
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
        """
        Update the status bar message.

        Args:
            message: String message to display in the status bar
        """
        self.status_var.set(message)
        self.root.update()
