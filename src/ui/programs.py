import customtkinter as ctk
import json
import os
import subprocess
import sys
from tkinter import filedialog, messagebox
from pathlib import Path
from datetime import datetime


class ProgramsView:
    def __init__(self, frame):
        self.frame = frame
        self.programs_data = []
        self.data_folder = self.get_data_folder_path()
        self.programs_json_path = os.path.join(
            self.data_folder, "settings", "programs.json"
        )

        self.setup_ui()
        self.load_programs()
        self.refresh_program_list()

    def get_data_folder_path(self):
        """Get the path to the data folder, works both in development and when compiled"""
        if getattr(sys, "frozen", False):
            # Running as compiled executable
            app_dir = os.path.dirname(sys.executable)
        else:
            # Running as script
            app_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )

        return os.path.join(app_dir, "data")

    def setup_ui(self):
        """Set up the user interface"""
        # Header
        header_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        header_frame.pack(fill="x", padx=10, pady=(10, 0))

        ctk.CTkLabel(
            header_frame,
            text="Portable Programs",
            font=ctk.CTkFont(size=24, weight="bold"),
        ).pack(side="left")

        # Add Program button
        self.add_button = ctk.CTkButton(
            header_frame,
            text="Add Program",
            command=self.add_program,
            width=120,
            height=32,
        )
        self.add_button.pack(side="right")

        # Programs list frame with scrollbar
        self.programs_frame = ctk.CTkScrollableFrame(
            self.frame, label_text="Available Programs"
        )
        self.programs_frame.pack(fill="both", expand=True, padx=10, pady=10)

    def load_programs(self):
        """Load programs from JSON file"""
        try:
            if os.path.exists(self.programs_json_path):
                with open(self.programs_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.programs_data = data.get("programs", [])
            else:
                self.programs_data = []
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load programs: {str(e)}")
            self.programs_data = []

    def save_programs(self):
        """Save programs to JSON file"""
        try:
            os.makedirs(os.path.dirname(self.programs_json_path), exist_ok=True)
            data = {"programs": self.programs_data}
            with open(self.programs_json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save programs: {str(e)}")

    def refresh_program_list(self):
        """Refresh the display of programs"""
        # Clear existing widgets
        for widget in self.programs_frame.winfo_children():
            widget.destroy()

        if not self.programs_data:
            ctk.CTkLabel(
                self.programs_frame,
                text="No programs added yet.\nUse 'Add Program' to add portable .exe files.",
                font=ctk.CTkFont(size=14),
                text_color="gray",
            ).pack(pady=50)
            return

        # Create program entries
        for i, program in enumerate(self.programs_data):
            self.create_program_entry(program, i)

    def create_program_entry(self, program, index):
        """Create a single program entry widget"""
        # Main frame for this program
        program_frame = ctk.CTkFrame(self.programs_frame)
        program_frame.pack(fill="x", padx=5, pady=5)

        # Program info frame
        info_frame = ctk.CTkFrame(program_frame, fg_color="transparent")
        info_frame.pack(fill="x", padx=10, pady=10)

        # Program name and description
        name_label = ctk.CTkLabel(
            info_frame,
            text=program.get("name", "Unknown Program"),
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        )
        name_label.pack(fill="x")

        if program.get("description"):
            desc_label = ctk.CTkLabel(
                info_frame,
                text=program["description"],
                font=ctk.CTkFont(size=12),
                text_color="gray",
                anchor="w",
            )
            desc_label.pack(fill="x")

        # Path label
        path_label = ctk.CTkLabel(
            info_frame,
            text=f"Path: {program.get('executable', 'Unknown')}",
            font=ctk.CTkFont(size=10),
            text_color="gray70",
            anchor="w",
        )
        path_label.pack(fill="x")

        # Buttons frame
        buttons_frame = ctk.CTkFrame(info_frame, fg_color="transparent")
        buttons_frame.pack(fill="x", pady=(10, 0))

        # Launch button
        launch_button = ctk.CTkButton(
            buttons_frame,
            text="Launch",
            command=lambda p=program: self.launch_program(p),
            width=80,
            height=28,
            fg_color="green",
            hover_color="darkgreen",
        )
        launch_button.pack(side="left", padx=(0, 10))

        # Remove button
        remove_button = ctk.CTkButton(
            buttons_frame,
            text="Remove",
            command=lambda idx=index: self.remove_program(idx),
            width=80,
            height=28,
            fg_color="red",
            hover_color="darkred",
        )
        remove_button.pack(side="left")

        # Status indicator
        exe_path = os.path.join(self.data_folder, "..", program.get("executable", ""))
        exe_path = os.path.normpath(exe_path)
        if os.path.exists(exe_path):
            status_color = "green"
            status_text = "Available"
        else:
            status_color = "red"
            status_text = "Missing"

        status_label = ctk.CTkLabel(
            buttons_frame,
            text=status_text,
            font=ctk.CTkFont(size=10),
            text_color=status_color,
            width=60,
        )
        status_label.pack(side="right")

    def launch_program(self, program):
        """Launch the selected program"""
        try:
            exe_path = program.get("executable", "")
            # Convert relative path to absolute path
            if not os.path.isabs(exe_path):
                exe_path = os.path.join(self.data_folder, "..", exe_path)
            exe_path = os.path.normpath(exe_path)

            if not os.path.exists(exe_path):
                messagebox.showerror(
                    "Program Not Found",
                    f"The executable file could not be found:\n{exe_path}",
                )
                return

            # Launch the program
            subprocess.Popen([exe_path], shell=True)

        except Exception as e:
            messagebox.showerror("Launch Error", f"Failed to launch program: {str(e)}")

    def add_program(self):
        """Add a new program through file dialog"""
        try:
            # Open file dialog to select executable
            file_path = filedialog.askopenfilename(
                title="Select Portable Executable",
                filetypes=[("Executable files", "*.exe"), ("All files", "*.*")],
                initialdir=os.path.join(self.data_folder, "programs"),
            )

            if not file_path:
                return

            # Convert to relative path from project root
            try:
                project_root = os.path.dirname(self.data_folder)
                relative_path = os.path.relpath(file_path, project_root)
                relative_path = relative_path.replace("\\", "/")
            except ValueError:
                # If we can't make it relative, use absolute path
                relative_path = file_path

            # Get program name from filename
            program_name = os.path.splitext(os.path.basename(file_path))[0]

            # Create program entry
            new_program = {
                "name": program_name,
                "description": "",  # User can edit the JSON manually for descriptions
                "executable": relative_path,
                "added_date": datetime.now().strftime("%Y-%m-%d"),
            }

            # Check if already exists
            for existing in self.programs_data:
                if existing.get("executable") == relative_path:
                    messagebox.showwarning(
                        "Program Exists", "This program is already in the list."
                    )
                    return

            # Add to list and save
            self.programs_data.append(new_program)
            self.save_programs()
            self.refresh_program_list()

            messagebox.showinfo(
                "Program Added",
                f"Successfully added: {program_name}\n\nYou can edit the description by modifying the programs.json file.",
            )

        except Exception as e:
            messagebox.showerror("Error", f"Failed to add program: {str(e)}")

    def remove_program(self, index):
        """Remove a program from the list"""
        try:
            if 0 <= index < len(self.programs_data):
                program_name = self.programs_data[index].get("name", "Unknown")

                # Confirm removal
                if messagebox.askyesno(
                    "Confirm Removal",
                    f"Are you sure you want to remove '{program_name}' from the list?\n\nThis will not delete the actual program file.",
                ):
                    self.programs_data.pop(index)
                    self.save_programs()
                    self.refresh_program_list()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to remove program: {str(e)}")


def init_view(frame):
    """Initialize the Programs view"""
    ProgramsView(frame)
