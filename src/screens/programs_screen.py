import ttkbootstrap as tb
from ttkbootstrap.constants import *
from PIL import Image, ImageTk
import os
import subprocess
from pathlib import Path
import sys
import json
import ctypes
from typing import List, Dict


def get_base_path():
    """
    Get the base path for the application, works for both development and compiled exe.
    For compiled exe, this will be the directory containing the exe.
    For development, this will be the project root.

    Returns:
        Path: Base directory path
    """
    if getattr(sys, "frozen", False):
        # Running as compiled exe
        return Path(sys.executable).parent
    else:
        # Running in development
        return Path(__file__).parent.parent.parent


def is_admin():
    """Check if the program is running with admin privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False


class ProgramCard(tb.Frame):
    """A custom widget that displays a program as a card with icon, description, and run button."""

    def __init__(self, master, program_data, data_dir, on_program_run=None):
        """
        Initialize a program card.

        Args:
            master: Parent widget
            program_data: Dictionary containing program information
            data_dir: Path to the data directory
            on_program_run: Callback function when program is run
        """
        super().__init__(master)

        # Store program data for sorting
        self.program_data = program_data
        self.on_program_run = on_program_run
        self.data_dir = data_dir

        # Configure frame to expand horizontally
        self.pack_configure(fill=X, expand=YES)

        # Create a bordered frame that spans full width
        title = f"{program_data['name']} (v{program_data['version']})"
        if "usage_count" in program_data:
            title += f" - Used: {program_data['usage_count']} times"
        self.card_frame = tb.LabelFrame(self, text=title, padding=15)
        self.card_frame.pack(fill=X, expand=YES)

        # Icon and description container
        content_frame = tb.Frame(self.card_frame)
        content_frame.pack(fill=X, expand=YES, pady=(0, 10))

        # Load and display icon
        try:
            icon_path = (
                data_dir / "tools" / program_data["folder"] / program_data["icon"]
            )
            image = Image.open(icon_path)
            image = image.resize((48, 48), Image.Resampling.LANCZOS)
            photo = ImageTk.PhotoImage(image)
            icon_label = tb.Label(content_frame, image=photo)
            icon_label.image = photo  # Keep a reference
        except Exception:
            # Fallback text if icon fails to load
            icon_label = tb.Label(content_frame, text="🔧", font=("", 24))

        icon_label.pack(side=LEFT, padx=(0, 10))

        # Description
        desc_label = tb.Label(
            content_frame,
            text=program_data["description"],
            wraplength=400,
            justify=LEFT,
        )
        desc_label.pack(side=LEFT, fill=BOTH, expand=YES)

        # Run button - align to right
        button_frame = tb.Frame(self.card_frame)
        button_frame.pack(fill=X, expand=YES)

        run_btn = tb.Button(
            button_frame,
            text="Run",
            command=self.run_program,
            bootstyle="success",
            width=15,
        )
        run_btn.pack(side=RIGHT)

    def run_program(self):
        """Run the program and update usage count."""
        try:
            program_path = (
                self.data_dir
                / "tools"
                / self.program_data["folder"]
                / self.program_data["executable"]
            )
            if program_path.exists():
                if not is_admin():
                    # If not running as admin, use ShellExecute to trigger UAC prompt
                    ctypes.windll.shell32.ShellExecuteW(
                        None,
                        "runas",
                        str(program_path),
                        None,
                        str(program_path.parent),
                        1,  # SW_SHOWNORMAL
                    )
                else:
                    # If already running as admin, just start the process
                    subprocess.Popen([str(program_path)])

                # Notify parent about program run
                if self.on_program_run:
                    self.on_program_run(self.program_data)
            else:
                tb.dialogs.Messagebox.show_error(
                    title="Program Not Found",
                    message=f"Could not find {self.program_data['executable']} at:\n{program_path}\n\nPlease ensure the program is installed in the correct location.",
                )
        except Exception as e:
            tb.dialogs.Messagebox.show_error(
                title="Error",
                message=f"Error running {self.program_data['executable']}: {str(e)}",
            )


class ProgramsScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Get base path and setup data directory structure
        self.base_path = get_base_path()
        self.data_dir = self.base_path / "data"
        self.tools_dir = self.data_dir / "tools"
        self.config_file = self.tools_dir / "config.json"

        # Create data directory structure if in development mode
        if not getattr(sys, "frozen", False):
            for folder in ["tools", "settings", "resources", "reports"]:
                (self.data_dir / folder).mkdir(parents=True, exist_ok=True)

        # Store all programs and current filtered/sorted programs
        self.all_programs = []
        self.filtered_programs = []

        # Create the settings interface
        self.create_widgets()

    def load_programs_config(self):
        """Load programs configuration from JSON file."""
        try:
            with open(self.config_file, "r") as f:
                return json.load(f)["programs"]
        except Exception as e:
            tb.dialogs.Messagebox.show_error(
                title="Configuration Error",
                message=f"Error loading programs configuration: {str(e)}\n\nPlease ensure config.json exists in the data/tools directory.",
            )
            return []

    def save_programs_config(self):
        """Save programs configuration to JSON file."""
        try:
            with open(self.config_file, "r") as f:
                config = json.load(f)
            config["programs"] = self.all_programs
            with open(self.config_file, "w") as f:
                json.dump(config, f, indent=4)
        except Exception as e:
            tb.dialogs.Messagebox.show_error(
                title="Error",
                message=f"Error saving program configuration: {str(e)}",
            )

    def on_program_run(self, program_data):
        """Handle program run event by updating usage count."""
        # Find and update the program in all_programs
        for prog in self.all_programs:
            if prog["name"] == program_data["name"]:
                prog["usage_count"] = prog.get("usage_count", 0) + 1
                break

        # Save the updated configuration
        self.save_programs_config()

        # Refresh the display
        self.filter_and_sort_programs()

    def create_widgets(self):
        """Create and arrange all widgets for the programs interface."""
        # Main container frame
        main_frame = tb.LabelFrame(
            self, text=" Available Programs ", padding=15, bootstyle="primary"
        )
        main_frame.pack(fill=BOTH, expand=YES)

        # Create search and sort controls frame
        controls_frame = tb.Frame(main_frame)
        controls_frame.pack(fill=X, pady=(0, 10))

        # Search bar
        search_frame = tb.Frame(controls_frame)
        search_frame.pack(side=LEFT, fill=X, expand=YES)

        search_label = tb.Label(search_frame, text="Search:")
        search_label.pack(side=LEFT, padx=(0, 5))

        self.search_var = tb.StringVar()
        self.search_var.trace_add(
            "write", lambda *args: self.filter_and_sort_programs()
        )
        search_entry = tb.Entry(search_frame, textvariable=self.search_var)
        search_entry.pack(side=LEFT, fill=X, expand=YES)

        # Sort dropdown
        sort_frame = tb.Frame(controls_frame)
        sort_frame.pack(side=RIGHT, padx=(10, 0))

        sort_label = tb.Label(sort_frame, text="Sort by:")
        sort_label.pack(side=LEFT, padx=(0, 5))

        self.sort_var = tb.StringVar(value="Most Used")  # Set default sort to Most Used
        sort_options = [
            "Most Used",
            "Least Used",
            "Name (A-Z)",
            "Name (Z-A)",
            "Version (Newest)",
            "Version (Oldest)",
        ]
        sort_combo = tb.Combobox(
            sort_frame,
            textvariable=self.sort_var,
            values=sort_options,
            state="readonly",
            width=15,
        )
        sort_combo.pack(side=LEFT)
        self.sort_var.trace_add("write", lambda *args: self.filter_and_sort_programs())

        # Create a frame to hold the canvas and scrollbar
        self.container = tb.Frame(main_frame)
        self.container.pack(fill=BOTH, expand=YES)

        # Configure container grid
        self.container.grid_rowconfigure(0, weight=1)
        self.container.grid_columnconfigure(0, weight=1)

        # Create canvas and scrollbar
        self.canvas = tb.Canvas(self.container)
        self.scrollbar = tb.Scrollbar(
            self.container, orient=VERTICAL, command=self.canvas.yview
        )

        # Create the scrollable frame
        self.scrollable_frame = tb.Frame(self.canvas)
        self.scrollable_frame.columnconfigure(0, weight=1)  # Make column expandable

        # Configure canvas
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        # Grid layout for canvas and scrollbar
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.scrollbar.grid(row=0, column=1, sticky="ns")

        # Create canvas window
        self.canvas_window = self.canvas.create_window(
            (0, 0),
            window=self.scrollable_frame,
            anchor="nw",
            tags=("window",),
            width=0,
        )

        # Configure canvas scrolling
        self.scrollable_frame.bind("<Configure>", self.configure_scroll_region)
        self.canvas.bind("<Configure>", self.configure_canvas_window)

        # Load and display programs
        self.all_programs = self.load_programs_config()
        self.filter_and_sort_programs()

        # Bind mouse wheel scrolling
        self.canvas.bind_all("<MouseWheel>", self.on_mousewheel)

    def configure_scroll_region(self, event):
        """Configure the scroll region of the canvas."""
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def configure_canvas_window(self, event):
        """Configure the canvas window width."""
        canvas_width = event.width - 5
        self.canvas.itemconfig("window", width=canvas_width)

    def on_mousewheel(self, event):
        """Handle mousewheel scrolling."""
        self.canvas.yview_scroll(-1 * (event.delta // 120), "units")

    def filter_and_sort_programs(self):
        """Filter and sort programs based on search text and sort option."""
        # Clear existing program cards
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()

        # Filter programs based on search text
        search_text = self.search_var.get().lower()
        self.filtered_programs = [
            prog
            for prog in self.all_programs
            if search_text in prog["name"].lower()
            or search_text in prog["description"].lower()
        ]

        # Sort programs based on selected option
        sort_option = self.sort_var.get()
        if sort_option == "Most Used":
            self.filtered_programs.sort(
                key=lambda x: x.get("usage_count", 0), reverse=True
            )
        elif sort_option == "Least Used":
            self.filtered_programs.sort(key=lambda x: x.get("usage_count", 0))
        elif sort_option == "Name (A-Z)":
            self.filtered_programs.sort(key=lambda x: x["name"])
        elif sort_option == "Name (Z-A)":
            self.filtered_programs.sort(key=lambda x: x["name"], reverse=True)
        elif sort_option == "Version (Newest)":
            self.filtered_programs.sort(key=lambda x: x["version"], reverse=True)
        elif sort_option == "Version (Oldest)":
            self.filtered_programs.sort(key=lambda x: x["version"])

        # Create program cards for filtered and sorted programs
        for program in self.filtered_programs:
            card = ProgramCard(
                self.scrollable_frame,
                program,
                self.data_dir,
                on_program_run=self.on_program_run,
            )
            card.pack(fill=X, expand=YES, pady=5, padx=5)
