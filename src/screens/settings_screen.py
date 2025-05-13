import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
import json
import os
import sys


class SettingsScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Setup settings file path
        if getattr(sys, "frozen", False):
            # If the application is run as a bundle (compiled)
            self.settings_dir = os.path.dirname(sys.executable)
        else:
            # If running in development
            self.settings_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )

        self.settings_path = os.path.join(self.settings_dir, "settings")
        self.settings_file = os.path.join(self.settings_path, "settings.json")

        # Create settings directory if it doesn't exist
        os.makedirs(self.settings_path, exist_ok=True)

        # Load or create settings
        self.settings = self.load_settings()

        # Get the root window to access the style
        root = self.winfo_toplevel()
        self.current_theme = self.settings.get("theme", root.style.theme.name)

        # Apply saved theme
        root.style.theme_use(self.current_theme)

        self.create_widgets()

    def load_settings(self):
        """Load settings from JSON file or return defaults"""
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error loading settings: {e}")
        return {"theme": "cosmo"}  # Default settings

    def save_settings_to_file(self):
        """Save settings to JSON file"""
        try:
            with open(self.settings_file, "w") as f:
                json.dump(self.settings, f, indent=4)
        except Exception as e:
            Messagebox.show_error(message=f"Error saving settings: {e}", title="Error")

    def create_widgets(self):
        # Create main container
        settings_container = tb.Frame(self)
        settings_container.pack(fill=BOTH, expand=YES, padx=20, pady=20)

        # Theme selection section
        theme_frame = tb.LabelFrame(
            settings_container, text="Theme Settings", padding=15
        )
        theme_frame.pack(fill=X, pady=5)

        # Available themes
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

        # Theme selection combobox
        theme_label = tb.Label(theme_frame, text="Select Theme:")
        theme_label.pack(side=LEFT, padx=5)

        self.theme_combobox = tb.Combobox(theme_frame, values=themes, state="readonly")
        self.theme_combobox.set(self.current_theme)
        self.theme_combobox.pack(side=LEFT, padx=5)

        # Preview button
        preview_button = tb.Button(
            theme_frame, text="Preview", command=self.preview_theme, bootstyle="info"
        )
        preview_button.pack(side=LEFT, padx=5)

        # Save button at the bottom
        save_button = tb.Button(
            settings_container,
            text="Save Settings",
            command=self.save_settings,
            bootstyle="success",
        )
        save_button.pack(side=BOTTOM, pady=20)

        # Add settings file location label
        location_label = tb.Label(
            settings_container,
            text=f"Settings stored in: {self.settings_path}",
            wraplength=400,
        )
        location_label.pack(side=BOTTOM, pady=(0, 10))

    def preview_theme(self):
        selected_theme = self.theme_combobox.get()
        root = self.winfo_toplevel()
        root.style.theme_use(selected_theme)

    def save_settings(self):
        selected_theme = self.theme_combobox.get()
        self.current_theme = selected_theme
        root = self.winfo_toplevel()
        root.style.theme_use(selected_theme)

        # Update settings dictionary
        self.settings["theme"] = selected_theme

        # Save to file
        self.save_settings_to_file()

        # Show success message
        Messagebox.show_info(message="Settings saved successfully!", title="Success")
