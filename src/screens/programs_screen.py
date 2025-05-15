import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from PIL import Image, ImageTk
import os
import subprocess
from tkinter import BOTH, YES, LEFT, RIGHT, X, VERTICAL
from pathlib import Path
import sys
import json
import ctypes
from typing import List, Dict
import glob


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
    except (AttributeError, OSError):
        # AttributeError if not on Windows or windll not available
        # OSError if the Windows API call fails
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

        # Buttons container for run and delete
        buttons_frame = tb.Frame(content_frame)
        buttons_frame.pack(side=RIGHT, padx=5)

        # Check if program is core
        is_core = program_data.get("core", False)  # Default to False if not specified

        # Run button
        run_btn = tb.Button(
            buttons_frame,
            text="Run",
            command=self.run_program,
            bootstyle="success",
            width=15,
        )
        run_btn.pack(side=LEFT, padx=(0, 5))

        # Edit button - disabled for core programs
        edit_btn = tb.Button(
            buttons_frame,
            text="✎",  # Using pencil symbol for edit
            command=self.edit_program if not is_core else None,
            bootstyle="info" if not is_core else "secondary",
            width=3,
            state="normal" if not is_core else "disabled",
        )
        edit_btn.pack(side=LEFT, padx=(0, 5))

        # Add tooltip for disabled edit button
        if is_core:
            from ttkbootstrap.tooltip import ToolTip

            ToolTip(
                edit_btn,
                text="This is a core program and cannot be edited",
                bootstyle="secondary",
            )

        # Delete button - disabled for core programs
        delete_btn = tb.Button(
            buttons_frame,
            text="×",  # Using × symbol for delete
            command=self.delete_program if not is_core else None,
            bootstyle="danger" if not is_core else "secondary",
            width=3,
            state="normal" if not is_core else "disabled",
        )
        delete_btn.pack(side=LEFT)

        # Add tooltip for disabled delete button
        if is_core:
            from ttkbootstrap.tooltip import ToolTip

            ToolTip(
                delete_btn,
                text="This is a core program and cannot be deleted",
                bootstyle="secondary",
            )

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

    def delete_program(self):
        """Delete the program from config and its folder."""
        # Check if program is core
        if self.program_data.get("core", False):
            tb.dialogs.Messagebox.show_warning(
                title="Cannot Delete",
                message=f"{self.program_data['name']} is a core program and cannot be deleted.",
            )
            return

        # Confirm with user
        response = tb.dialogs.Messagebox.show_question(
            title="Confirm Delete",
            message=f"Are you sure you want to delete {self.program_data['name']}?\n\n"
            f"This will remove it from the programs list and delete the folder:\n"
            f"{self.data_dir}/tools/{self.program_data['folder']}",
            buttons=["Yes:danger", "No:secondary"],
        )

        if response == "Yes":
            try:
                # Get parent ProgramsScreen instance
                parent = self
                while parent and not isinstance(parent, ProgramsScreen):
                    parent = parent.master

                if not parent:
                    raise Exception("Could not find ProgramsScreen instance")

                programs_screen = parent

                # Remove from all_programs list
                original_count = len(programs_screen.all_programs)
                programs_screen.all_programs = [
                    p
                    for p in programs_screen.all_programs
                    if p["name"] != self.program_data["name"]
                ]
                if len(programs_screen.all_programs) == original_count:
                    raise Exception("Program was not removed from config")

                # Save updated config
                try:
                    with open(programs_screen.config_file, "r") as f:
                        config = json.load(f)
                    config["programs"] = programs_screen.all_programs
                    with open(programs_screen.config_file, "w") as f:
                        json.dump(config, f, indent=4)
                except Exception as e:
                    raise Exception(f"Failed to save config: {str(e)}")

                # Delete program folder
                program_folder = self.data_dir / "tools" / self.program_data["folder"]
                if program_folder.exists():
                    try:
                        import shutil

                        shutil.rmtree(str(program_folder))
                        if program_folder.exists():
                            raise Exception("Folder still exists after deletion")
                    except Exception as e:
                        raise Exception(f"Failed to delete folder: {str(e)}")

                # Refresh the display
                programs_screen.filter_and_sort_programs()

                # Show success message
                tb.dialogs.Messagebox.show_info(
                    title="Success",
                    message=f"Program '{self.program_data['name']}' has been deleted successfully!",
                )
            except Exception as e:
                tb.dialogs.Messagebox.show_error(
                    title="Error",
                    message=f"Error deleting program: {str(e)}\n\n"
                    f"Config file: {programs_screen.config_file}\n"
                    f"Program folder: {program_folder if 'program_folder' in locals() else 'Not found'}",
                )

    def edit_program(self):
        """Show dialog to edit the program."""
        # Check if program is core
        if self.program_data.get("core", False):
            tb.dialogs.Messagebox.show_warning(
                title="Cannot Edit",
                message=f"{self.program_data['name']} is a core program and cannot be edited.",
            )
            return

        # Get parent ProgramsScreen instance
        parent = self
        while parent and not isinstance(parent, ProgramsScreen):
            parent = parent.master

        if not parent:
            raise Exception("Could not find ProgramsScreen instance")

        programs_screen = parent

        # Show edit dialog
        dialog = EditProgramDialog(
            programs_screen,
            programs_screen.tools_dir,
            self.program_data,
            programs_screen.update_program,
        )
        dialog.grab_set()  # Make dialog modal


class EditProgramDialog(tb.Toplevel):
    """Dialog for editing an existing program."""

    def __init__(self, parent, tools_dir, program_data, on_program_updated):
        """
        Initialize the edit program dialog.

        Args:
            parent: Parent widget
            tools_dir: Path to the tools directory
            program_data: Dictionary containing the program's current information
            on_program_updated: Callback function when program is updated
        """
        super().__init__(parent)
        self.tools_dir = Path(tools_dir)  # Ensure it's a Path object
        self.program_data = program_data
        self.on_program_updated = on_program_updated

        # Initialize variables first
        self.name_var = tb.StringVar(value=program_data["name"])
        self.folder_var = tb.StringVar(value=program_data["folder"])
        self.exe_var = tb.StringVar(value=program_data["executable"])
        self.version_var = tb.StringVar(value=program_data["version"])
        self.icon_var = tb.StringVar(value=program_data["icon"])

        # Initialize combo boxes as None first
        self.folder_combo = None
        self.exe_combo = None
        self.icon_combo = None
        self.desc_text = None
        self.preview_label = None

        # Configure dialog
        self.title(f"Edit Program - {program_data['name']}")
        self.geometry("600x600")
        self.resizable(False, False)

        # Create the interface
        self.create_interface()

        # Now that everything is initialized, refresh the folder list
        self.refresh_folder_list()

        # Set description text
        self.desc_text.insert("1.0", program_data["description"])

    def create_interface(self):
        """Create and arrange all interface elements."""
        # Create main frame with padding
        main_frame = tb.Frame(self, padding=20)
        main_frame.pack(fill=BOTH, expand=YES)

        # Content frame for all inputs
        content_frame = tb.Frame(main_frame)
        content_frame.pack(fill=BOTH, expand=YES)

        # Program Name
        name_frame = tb.Frame(content_frame)
        name_frame.pack(fill=X, pady=(0, 10))
        name_label = tb.Label(name_frame, text="Program Name:", width=15, anchor="w")
        name_label.pack(side=LEFT)
        tb.Entry(name_frame, textvariable=self.name_var).pack(
            side=LEFT, fill=X, expand=YES, padx=(10, 0)
        )

        # Description
        desc_frame = tb.Frame(content_frame)
        desc_frame.pack(fill=X, pady=(0, 10))
        desc_label = tb.Label(desc_frame, text="Description:", width=15, anchor="nw")
        desc_label.pack(side=LEFT, anchor="n")
        self.desc_text = tb.Text(desc_frame, height=3, width=50)
        self.desc_text.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Folder Selection
        folder_frame = tb.Frame(content_frame)
        folder_frame.pack(fill=X, pady=(0, 10))
        folder_label = tb.Label(
            folder_frame, text="Program Folder:", width=15, anchor="w"
        )
        folder_label.pack(side=LEFT)
        self.folder_combo = tb.Combobox(
            folder_frame, textvariable=self.folder_var, state="readonly"
        )
        self.folder_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Executable Selection
        exe_frame = tb.Frame(content_frame)
        exe_frame.pack(fill=X, pady=(0, 10))
        exe_label = tb.Label(exe_frame, text="Executable:", width=15, anchor="w")
        exe_label.pack(side=LEFT)
        self.exe_combo = tb.Combobox(
            exe_frame, textvariable=self.exe_var, state="readonly"
        )
        self.exe_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Version
        version_frame = tb.Frame(content_frame)
        version_frame.pack(fill=X, pady=(0, 10))
        version_label = tb.Label(version_frame, text="Version:", width=15, anchor="w")
        version_label.pack(side=LEFT)
        tb.Entry(version_frame, textvariable=self.version_var).pack(
            side=LEFT, fill=X, expand=YES, padx=(10, 0)
        )

        # Icon Selection
        icon_frame = tb.Frame(content_frame)
        icon_frame.pack(fill=X, pady=(0, 10))
        icon_label = tb.Label(icon_frame, text="Icon:", width=15, anchor="w")
        icon_label.pack(side=LEFT)
        self.icon_combo = tb.Combobox(
            icon_frame, textvariable=self.icon_var, state="readonly"
        )
        self.icon_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Preview Frame
        preview_frame = tb.LabelFrame(content_frame, text="Preview", padding=10)
        preview_frame.pack(fill=X, pady=(10, 20))
        self.preview_label = tb.Label(
            preview_frame, text="Select a folder to see program details"
        )
        self.preview_label.pack(fill=X)

        # Buttons Frame at the bottom
        btn_frame = tb.Frame(main_frame)
        btn_frame.pack(fill=X, pady=(10, 0))

        # Update Program button (left)
        update_btn = tb.Button(
            btn_frame,
            text="Update Program",
            command=self.update_program,
            bootstyle="success",
            width=15,
        )
        update_btn.pack(side=LEFT, padx=(0, 10))

        # Cancel button (right)
        cancel_btn = tb.Button(
            btn_frame,
            text="Cancel",
            command=self.destroy,
            bootstyle="secondary",
            width=10,
        )
        cancel_btn.pack(side=RIGHT)

        # Bind events after all widgets are created
        self.folder_combo.bind("<<ComboboxSelected>>", self.on_folder_selected)
        self.name_var.trace_add("write", lambda *args: self.update_preview())
        self.version_var.trace_add("write", lambda *args: self.update_preview())
        self.folder_var.trace_add("write", lambda *args: self.update_preview())
        self.exe_var.trace_add("write", lambda *args: self.update_preview())
        self.icon_var.trace_add("write", lambda *args: self.update_preview())

    def refresh_folder_list(self):
        """Refresh the list of available program folders."""
        try:
            if not self.tools_dir.exists():
                Messagebox.show_warning(
                    title="Warning",
                    message=f"Tools directory not found at:\n{self.tools_dir}\n\nPlease create the directory and add program folders.",
                )
                return

            folders = [d.name for d in self.tools_dir.iterdir() if d.is_dir()]
            if not folders:
                Messagebox.show_warning(
                    title="No Folders Found",
                    message=f"No program folders found in:\n{self.tools_dir}\n\nPlease add program folders first.",
                )
                return

            self.folder_combo["values"] = folders
            self.folder_combo.set(self.program_data["folder"])
            self.on_folder_selected(None)

        except Exception as e:
            Messagebox.show_error(
                title="Error",
                message=f"Error loading program folders: {str(e)}\n\nPath: {self.tools_dir}",
            )

    def on_folder_selected(self, event):
        """Update executable and icon lists when a folder is selected."""
        try:
            folder_path = self.tools_dir / self.folder_var.get()

            # Update executable list
            exes = list(folder_path.glob("*.exe"))
            self.exe_combo["values"] = [exe.name for exe in exes]
            if self.program_data["executable"] in [exe.name for exe in exes]:
                self.exe_combo.set(self.program_data["executable"])
            elif exes:
                self.exe_combo.set(exes[0].name)
            else:
                self.exe_combo.set("")

            # Update icon list
            icons = list(folder_path.glob("*.ico")) + list(folder_path.glob("*.png"))
            self.icon_combo["values"] = [icon.name for icon in icons]
            if self.program_data["icon"] in [icon.name for icon in icons]:
                self.icon_combo.set(self.program_data["icon"])
            elif icons:
                self.icon_combo.set(icons[0].name)
            else:
                self.icon_combo.set("")

            # Update preview
            self.update_preview()

        except Exception as e:
            Messagebox.show_error(
                title="Error", message=f"Error loading folder contents: {str(e)}"
            )

    def update_preview(self):
        """Update the preview of the program details."""
        preview_text = f"Program: {self.name_var.get() or '[Program Name]'}\n"
        preview_text += f"Version: {self.version_var.get() or '[Version]'}\n"
        preview_text += f"Folder: {self.folder_var.get() or '[Folder]'}\n"
        preview_text += f"Executable: {self.exe_var.get() or '[Executable]'}\n"
        preview_text += f"Icon: {self.icon_var.get() or '[Icon]'}\n"
        preview_text += (
            f"Description: {self.desc_text.get('1.0', 'end-1c') or '[Description]'}"
        )

        self.preview_label.configure(text=preview_text)

    def validate_inputs(self):
        """Validate all input fields."""
        if not self.name_var.get().strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a program name."
            )
            return False

        if not self.desc_text.get("1.0", "end-1c").strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a program description."
            )
            return False

        if not self.folder_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select a program folder."
            )
            return False

        if not self.exe_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select an executable."
            )
            return False

        if not self.version_var.get().strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a version number."
            )
            return False

        if not self.icon_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select an icon."
            )
            return False

        return True

    def update_program(self):
        """Update the program in the configuration."""
        if not self.validate_inputs():
            return

        updated_program = {
            "name": self.name_var.get().strip(),
            "description": self.desc_text.get("1.0", "end-1c").strip(),
            "folder": self.folder_var.get(),
            "executable": self.exe_var.get(),
            "icon": self.icon_var.get(),
            "version": self.version_var.get().strip(),
            "usage_count": self.program_data.get("usage_count", 0),
            "core": self.program_data.get("core", False),
        }

        self.on_program_updated(self.program_data["name"], updated_program)
        self.destroy()


class AddProgramDialog(tb.Toplevel):
    """Dialog for adding a new program to the configuration."""

    def __init__(self, parent, tools_dir, on_program_added):
        """
        Initialize the add program dialog.

        Args:
            parent: Parent widget
            tools_dir: Path to the tools directory
            on_program_added: Callback function when a program is added
        """
        super().__init__(parent)
        self.tools_dir = Path(tools_dir)  # Ensure it's a Path object
        self.on_program_added = on_program_added

        # Initialize variables first
        self.name_var = tb.StringVar()
        self.folder_var = tb.StringVar()
        self.exe_var = tb.StringVar()
        self.version_var = tb.StringVar()
        self.icon_var = tb.StringVar()

        # Initialize combo boxes as None first
        self.folder_combo = None
        self.exe_combo = None
        self.icon_combo = None
        self.desc_text = None
        self.preview_label = None

        # Configure dialog
        self.title("Add New Program")
        self.geometry("600x600")
        self.resizable(False, False)

        # Create the interface
        self.create_interface()

        # Now that everything is initialized, refresh the folder list
        self.refresh_folder_list()

    def create_interface(self):
        """Create and arrange all interface elements."""
        # Create main frame with padding
        main_frame = tb.Frame(self, padding=20)
        main_frame.pack(fill=BOTH, expand=YES)

        # Content frame for all inputs
        content_frame = tb.Frame(main_frame)
        content_frame.pack(fill=BOTH, expand=YES)

        # Program Name
        name_frame = tb.Frame(content_frame)
        name_frame.pack(fill=X, pady=(0, 10))
        name_label = tb.Label(name_frame, text="Program Name:", width=15, anchor="w")
        name_label.pack(side=LEFT)
        tb.Entry(name_frame, textvariable=self.name_var).pack(
            side=LEFT, fill=X, expand=YES, padx=(10, 0)
        )

        # Description
        desc_frame = tb.Frame(content_frame)
        desc_frame.pack(fill=X, pady=(0, 10))
        desc_label = tb.Label(desc_frame, text="Description:", width=15, anchor="nw")
        desc_label.pack(side=LEFT, anchor="n")
        self.desc_text = tb.Text(desc_frame, height=3, width=50)
        self.desc_text.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Folder Selection
        folder_frame = tb.Frame(content_frame)
        folder_frame.pack(fill=X, pady=(0, 10))
        folder_label = tb.Label(
            folder_frame, text="Program Folder:", width=15, anchor="w"
        )
        folder_label.pack(side=LEFT)
        self.folder_combo = tb.Combobox(
            folder_frame, textvariable=self.folder_var, state="readonly"
        )
        self.folder_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Executable Selection
        exe_frame = tb.Frame(content_frame)
        exe_frame.pack(fill=X, pady=(0, 10))
        exe_label = tb.Label(exe_frame, text="Executable:", width=15, anchor="w")
        exe_label.pack(side=LEFT)
        self.exe_combo = tb.Combobox(
            exe_frame, textvariable=self.exe_var, state="readonly"
        )
        self.exe_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Version
        version_frame = tb.Frame(content_frame)
        version_frame.pack(fill=X, pady=(0, 10))
        version_label = tb.Label(version_frame, text="Version:", width=15, anchor="w")
        version_label.pack(side=LEFT)
        tb.Entry(version_frame, textvariable=self.version_var).pack(
            side=LEFT, fill=X, expand=YES, padx=(10, 0)
        )

        # Icon Selection
        icon_frame = tb.Frame(content_frame)
        icon_frame.pack(fill=X, pady=(0, 10))
        icon_label = tb.Label(icon_frame, text="Icon:", width=15, anchor="w")
        icon_label.pack(side=LEFT)
        self.icon_combo = tb.Combobox(
            icon_frame, textvariable=self.icon_var, state="readonly"
        )
        self.icon_combo.pack(side=LEFT, fill=X, expand=YES, padx=(10, 0))

        # Preview Frame
        preview_frame = tb.LabelFrame(content_frame, text="Preview", padding=10)
        preview_frame.pack(fill=X, pady=(10, 20))
        self.preview_label = tb.Label(
            preview_frame, text="Select a folder to see program details"
        )
        self.preview_label.pack(fill=X)

        # Buttons Frame at the bottom
        btn_frame = tb.Frame(main_frame)
        btn_frame.pack(fill=X, pady=(10, 0))

        # Add Program button (left)
        add_btn = tb.Button(
            btn_frame,
            text="Save Program",
            command=self.add_program,
            bootstyle="success",
            width=15,
        )
        add_btn.pack(side=LEFT, padx=(0, 10))

        # Cancel button (right)
        cancel_btn = tb.Button(
            btn_frame,
            text="Cancel",
            command=self.destroy,
            bootstyle="secondary",
            width=10,
        )
        cancel_btn.pack(side=RIGHT)

        # Bind events after all widgets are created
        self.folder_combo.bind("<<ComboboxSelected>>", self.on_folder_selected)
        self.name_var.trace_add("write", lambda *args: self.update_preview())
        self.version_var.trace_add("write", lambda *args: self.update_preview())
        self.folder_var.trace_add("write", lambda *args: self.update_preview())
        self.exe_var.trace_add("write", lambda *args: self.update_preview())
        self.icon_var.trace_add("write", lambda *args: self.update_preview())

    def refresh_folder_list(self):
        """Refresh the list of available program folders."""
        try:
            if not self.tools_dir.exists():
                Messagebox.show_warning(
                    title="Warning",
                    message=f"Tools directory not found at:\n{self.tools_dir}\n\nPlease create the directory and add program folders.",
                )
                return

            folders = [d.name for d in self.tools_dir.iterdir() if d.is_dir()]
            if not folders:
                Messagebox.show_warning(
                    title="No Folders Found",
                    message=f"No program folders found in:\n{self.tools_dir}\n\nPlease add program folders first.",
                )
                return

            self.folder_combo["values"] = folders
            self.folder_combo.set(folders[0])
            self.on_folder_selected(None)

        except Exception as e:
            Messagebox.show_error(
                title="Error",
                message=f"Error loading program folders: {str(e)}\n\nPath: {self.tools_dir}",
            )

    def on_folder_selected(self, event):
        """Update executable and icon lists when a folder is selected."""
        try:
            folder_path = self.tools_dir / self.folder_var.get()

            # Update executable list
            exes = list(folder_path.glob("*.exe"))
            self.exe_combo["values"] = [exe.name for exe in exes]
            if exes:
                self.exe_combo.set(exes[0].name)
            else:
                self.exe_combo.set("")

            # Update icon list
            icons = list(folder_path.glob("*.ico")) + list(folder_path.glob("*.png"))
            self.icon_combo["values"] = [icon.name for icon in icons]
            if icons:
                self.icon_combo.set(icons[0].name)
            else:
                self.icon_combo.set("")

            # Update preview
            self.update_preview()

        except Exception as e:
            Messagebox.show_error(
                title="Error", message=f"Error loading folder contents: {str(e)}"
            )

    def update_preview(self):
        """Update the preview of the program details."""
        preview_text = f"Program: {self.name_var.get() or '[Program Name]'}\n"
        preview_text += f"Version: {self.version_var.get() or '[Version]'}\n"
        preview_text += f"Folder: {self.folder_var.get() or '[Folder]'}\n"
        preview_text += f"Executable: {self.exe_var.get() or '[Executable]'}\n"
        preview_text += f"Icon: {self.icon_var.get() or '[Icon]'}\n"
        preview_text += (
            f"Description: {self.desc_text.get('1.0', 'end-1c') or '[Description]'}"
        )

        self.preview_label.configure(text=preview_text)

    def validate_inputs(self):
        """Validate all input fields."""
        if not self.name_var.get().strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a program name."
            )
            return False

        if not self.desc_text.get("1.0", "end-1c").strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a program description."
            )
            return False

        if not self.folder_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select a program folder."
            )
            return False

        if not self.exe_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select an executable."
            )
            return False

        if not self.version_var.get().strip():
            Messagebox.show_warning(
                title="Validation Error", message="Please enter a version number."
            )
            return False

        if not self.icon_var.get():
            Messagebox.show_warning(
                title="Validation Error", message="Please select an icon."
            )
            return False

        return True

    def add_program(self):
        """Add the new program to the configuration."""
        if not self.validate_inputs():
            return

        new_program = {
            "name": self.name_var.get().strip(),
            "description": self.desc_text.get("1.0", "end-1c").strip(),
            "folder": self.folder_var.get(),
            "executable": self.exe_var.get(),
            "icon": self.icon_var.get(),
            "version": self.version_var.get().strip(),
            "usage_count": 0,
        }

        self.on_program_added(new_program)
        self.destroy()


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

        # Initialize resize timer
        self._resize_timer = None

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
            # Create a backup of the current config
            import shutil

            backup_file = self.config_file.with_suffix(".json.bak")
            if self.config_file.exists():
                shutil.copy2(str(self.config_file), str(backup_file))

            # Read existing config or create new one
            if self.config_file.exists():
                with open(self.config_file, "r") as f:
                    config = json.load(f)
            else:
                config = {"programs": []}

            # Update programs list
            config["programs"] = self.all_programs

            # Write updated config
            with open(self.config_file, "w") as f:
                json.dump(config, f, indent=4)

            # Remove backup if save was successful
            if backup_file.exists():
                backup_file.unlink()

        except Exception as e:
            # Restore from backup if it exists
            if "backup_file" in locals() and backup_file.exists():
                shutil.copy2(str(backup_file), str(self.config_file))
                backup_file.unlink()

            tb.dialogs.Messagebox.show_error(
                title="Error",
                message=f"Error saving program configuration: {str(e)}\n\n"
                f"Config file: {self.config_file}",
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

        # Top controls container
        top_controls = tb.Frame(main_frame)
        top_controls.pack(fill=X, pady=(0, 10))

        # Add Program button (left side)
        add_btn = tb.Button(
            top_controls,
            text="Add Program",
            command=self.show_add_program_dialog,
            bootstyle="success",
            width=12,
        )
        add_btn.pack(side=LEFT, padx=(0, 20))

        # Search and sort controls frame (right side)
        controls_frame = tb.Frame(top_controls)
        controls_frame.pack(side=RIGHT, fill=X, expand=YES)

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

        self.sort_var = tb.StringVar(value="Most Used")
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
        def _on_mousewheel(event):
            if event.delta > 0:
                # Scroll up (negative units)
                self.canvas.yview_scroll(-1, "units")
            else:
                # Scroll down (positive units)
                self.canvas.yview_scroll(1, "units")

        # Bind mousewheel to the entire window
        self.bind_all("<MouseWheel>", _on_mousewheel)

        # Bind mousewheel to the canvas for better control
        self.canvas.bind("<MouseWheel>", _on_mousewheel)

    def configure_scroll_region(self, event):
        """Configure the scroll region of the canvas."""
        # Get the total height of content and visible area
        content_height = self.scrollable_frame.winfo_reqheight()
        visible_height = self.canvas.winfo_height()
        
        # Only enable scrolling if content is taller than visible area
        if content_height > visible_height:
            self.canvas.configure(scrollregion=(0, 0, 0, content_height))
            self.scrollbar.grid(row=0, column=1, sticky="ns")
        else:
            self.canvas.configure(scrollregion=(0, 0, 0, visible_height))
            self.canvas.yview_moveto(0)  # Reset to top
            self.scrollbar.grid_remove()

    def configure_canvas_window(self, event):
        """Configure the canvas window width and update scroll region."""
        # Set canvas width immediately but batch the update
        self.canvas.after_idle(lambda: self.canvas.itemconfig("window", width=event.width - 5))
        
        # Cancel any existing timer
        if self._resize_timer is not None:
            self.after_cancel(self._resize_timer)
            self._resize_timer = None
        
        # Use a longer delay and batch updates
        self._resize_timer = self.after(200, self._update_scroll_region)
    
    def _update_scroll_region(self):
        """Update the scroll region after resize."""
        try:
            # Get dimensions once to avoid multiple queries
            content_height = self.scrollable_frame.winfo_reqheight()
            visible_height = self.canvas.winfo_height()
            current_view = self.canvas.yview()
            
            # Prepare updates
            updates = {}
            
            # Only enable scrolling if content is taller than visible area
            if content_height > visible_height:
                updates['scrollregion'] = (0, 0, 0, content_height)
                # Batch grid management
                self.after_idle(lambda: self.scrollbar.grid(row=0, column=1, sticky="ns"))
                # Keep scroll position
                updates['yscrollcommand'] = self.scrollbar.set
            else:
                updates['scrollregion'] = (0, 0, 0, visible_height)
                # Batch grid management
                self.after_idle(lambda: self.scrollbar.grid_remove())
                # Reset scroll position
                updates['yscrollcommand'] = lambda *args: None
            
            # Apply all updates at once
            self.canvas.configure(**updates)
            
            # Restore scroll position if needed
            if content_height > visible_height:
                self.canvas.after_idle(lambda: self.canvas.yview_moveto(current_view[0]))
        
        except Exception:
            pass
        finally:
            self._resize_timer = None

    def on_mousewheel(self, event):
        """Handle mousewheel scrolling."""
        content_height = self.scrollable_frame.winfo_reqheight()
        visible_height = self.canvas.winfo_height()
        
        # Only allow scrolling if content is taller than visible area
        if content_height > visible_height:
            # Get current scroll position and size
            current_pos = self.canvas.yview()
            
            # Check if we're at the top or bottom before scrolling
            if event.delta > 0 and current_pos[0] > 0:
                # Scroll up
                self.canvas.yview_scroll(-1, "units")
            elif event.delta < 0 and current_pos[1] < 1:
                # Scroll down
                self.canvas.yview_scroll(1, "units")

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

    def show_add_program_dialog(self):
        """Show the dialog for adding a new program."""
        dialog = AddProgramDialog(self, self.tools_dir, self.add_new_program)
        dialog.grab_set()  # Make dialog modal

    def add_new_program(self, new_program):
        """
        Add a new program to the configuration.

        Args:
            new_program: Dictionary containing the new program's information
        """
        # Add to programs list
        self.all_programs.append(new_program)

        # Save to config file
        self.save_programs_config()

        # Refresh display
        self.filter_and_sort_programs()

        # Show success message
        Messagebox.show_info(
            title="Success",
            message=f"Program '{new_program['name']}' has been added successfully!",
        )

    def update_program(self, old_name, new_program):
        """
        Update an existing program in the configuration.

        Args:
            old_name: The name of the program to be updated
            new_program: Dictionary containing the updated program's information
        """
        # Find and update the program in all_programs
        for i, prog in enumerate(self.all_programs):
            if prog["name"] == old_name:
                self.all_programs[i] = new_program
                break

        # Save the updated configuration
        self.save_programs_config()

        # Refresh the display
        self.filter_and_sort_programs()

        # Show success message
        Messagebox.show_info(
            title="Success",
            message=f"Program '{old_name}' has been updated successfully!",
        )
