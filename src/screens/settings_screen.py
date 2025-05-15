import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from ttkbootstrap.tooltip import ToolTip
import json
import os
import sys


class SettingsScreen(tb.Frame):
    """
    A settings screen that allows users to customize application preferences.
    Currently supports theme selection and persistence of settings.

    The settings are stored in a JSON file, which is located:
    - In the data/settings directory next to the executable when running as a compiled application
    - In the data/settings directory in the project root when running in development
    """

    def __init__(self, master):
        """
        Initialize the settings screen.

        Args:
            master: The parent widget (usually a tab or frame)
        """
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Determine the appropriate directory for settings storage
        self._setup_settings_paths()

        # Load existing settings or create with defaults
        self.settings = self.load_settings()

        # Initialize and apply the theme
        self._initialize_theme()

        # Create the settings interface
        self.create_widgets()

    def _setup_settings_paths(self):
        """Set up the paths for settings storage based on execution context."""
        if getattr(sys, "frozen", False):
            # Running as compiled executable
            self.base_dir = os.path.dirname(sys.executable)
        else:
            # Running in development
            self.base_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )

        # Define paths and ensure settings directory exists
        self.data_dir = os.path.join(self.base_dir, "data")
        self.settings_path = os.path.join(self.data_dir, "settings")
        self.settings_file = os.path.join(self.settings_path, "settings.json")
        os.makedirs(self.settings_path, exist_ok=True)

    def _initialize_theme(self):
        """Initialize and apply the saved theme or default theme."""
        root = self.winfo_toplevel()
        self.current_theme = self.settings.get("theme", root.style.theme.name)
        root.style.theme_use(self.current_theme)

    def load_settings(self):
        """
        Load settings from the JSON file.

        Returns:
            dict: The loaded settings or default settings if file doesn't exist
        """
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error loading settings: {e}")
        return {
            "theme": "darkly",
            "technician_mode": False,  # Default technician mode setting
        }

    def save_settings_to_file(self):
        """Save current settings to the JSON file."""
        try:
            with open(self.settings_file, "w") as f:
                json.dump(self.settings, f, indent=4)
        except Exception as e:
            Messagebox.show_error(message=f"Error saving settings: {e}", title="Error")

    def create_widgets(self):
        """Create and arrange all widgets for the settings screen."""
        # Main container for all settings
        settings_container = tb.Frame(self)
        settings_container.pack(fill=BOTH, expand=YES, padx=20, pady=20)

        # Theme selection section
        self._create_theme_section(settings_container)

        # Technician mode section
        self._create_technician_mode_section(settings_container)

        # Save button at the bottom
        self._create_save_button(settings_container)

        # Settings location indicator
        self._create_location_label(settings_container)

    def _create_theme_section(self, container):
        """
        Create the theme selection section of the settings screen.

        Args:
            container: The parent container widget
        """
        # Theme selection frame
        theme_frame = tb.LabelFrame(container, text="Theme Settings", padding=15)
        theme_frame.pack(fill=X, pady=5)

        # Available themes in ttkbootstrap
        themes = [
            "cosmo",
            "flatly",
            "litera",
            "minty",
            "lumen",
            "sandstone",
            "yeti",
            "pulse",
            "united",
            "morph",
            "journal",
            "darkly",
            "superhero",
            "solar",
            "cyborg",
            "vapor",
        ]

        # Theme selection controls
        theme_label = tb.Label(theme_frame, text="Select Theme:")
        theme_label.pack(side=LEFT, padx=5)

        self.theme_combobox = tb.Combobox(theme_frame, values=themes, state="readonly")
        self.theme_combobox.set(self.current_theme)
        self.theme_combobox.pack(side=LEFT, padx=5)

        preview_button = tb.Button(
            theme_frame, text="Preview", command=self.preview_theme, bootstyle="info"
        )
        preview_button.pack(side=LEFT, padx=5)

    def _create_technician_mode_section(self, container):
        """
        Create the technician mode section of the settings screen.

        Args:
            container: The parent container widget
        """
        # Technician mode frame
        tech_frame = tb.LabelFrame(container, text="Advanced Settings", padding=15)
        tech_frame.pack(fill=X, pady=5)

        # Technician mode switch
        self.tech_mode_var = tb.BooleanVar(
            value=self.settings.get("technician_mode", False)
        )
        tech_switch = tb.Checkbutton(
            tech_frame,
            text="Technician Mode",
            variable=self.tech_mode_var,
            bootstyle="round-toggle",
        )
        tech_switch.pack(side=LEFT, padx=5)

        # Add tooltip to the switch
        ToolTip(
            tech_switch,
            text="Enable advanced features for service technicians.\nProvides access to diagnostic tools and detailed system information.",
            bootstyle=(INFO, INVERSE),
        )

    def _create_save_button(self, container):
        """
        Create the save settings button.

        Args:
            container: The parent container widget
        """
        save_button = tb.Button(
            container,
            text="Save Settings",
            command=self.save_settings,
            bootstyle="success",
        )
        save_button.pack(side=BOTTOM, pady=20)

    def _create_location_label(self, container):
        """
        Create the label showing where settings are stored.

        Args:
            container: The parent container widget
        """
        location_label = tb.Label(
            container,
            text=f"Settings stored in: {self.settings_path}",
            wraplength=400,
        )
        location_label.pack(side=BOTTOM, pady=(0, 10))

    def preview_theme(self):
        """Preview the selected theme without saving."""
        selected_theme = self.theme_combobox.get()
        root = self.winfo_toplevel()
        root.style.theme_use(selected_theme)

    def save_settings(self):
        """Save the current settings and apply them."""
        selected_theme = self.theme_combobox.get()
        self.current_theme = selected_theme

        # Apply the theme
        root = self.winfo_toplevel()
        root.style.theme_use(selected_theme)

        # Update and save settings
        self.settings["theme"] = selected_theme
        self.settings["technician_mode"] = self.tech_mode_var.get()
        self.save_settings_to_file()

        # Confirm to user
        Messagebox.show_info(message="Settings saved successfully!", title="Success")
