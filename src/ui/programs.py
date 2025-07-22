import customtkinter as ctk
import os
from tkinter import filedialog, messagebox
from pathlib import Path
from datetime import datetime
from ..core.programs import ProgramsManager


class ProgramsView:
    def __init__(self, frame):
        self.frame = frame
        self.programs_manager = ProgramsManager()

        self.setup_ui()
        self.refresh_program_list()

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

    def refresh_program_list(self):
        """Refresh the display of programs"""
        # Clear existing widgets
        for widget in self.programs_frame.winfo_children():
            widget.destroy()

        programs_data = self.programs_manager.get_programs()
        if not programs_data:
            ctk.CTkLabel(
                self.programs_frame,
                text="No programs added yet.\nUse 'Add Program' to add portable .exe files.",
                font=ctk.CTkFont(size=14),
                text_color="gray",
            ).pack(pady=50)
            return

        # Create program entries
        for i, program in enumerate(programs_data):
            self.create_program_entry(program, i)

    def create_program_entry(self, program, index):
        """Create a single program entry widget"""
        # Main frame for this program
        program_frame = ctk.CTkFrame(self.programs_frame)
        program_frame.pack(fill="x", padx=5, pady=5)

        # Main content frame
        content_frame = ctk.CTkFrame(program_frame, fg_color="transparent")
        content_frame.pack(fill="both", expand=True, padx=10, pady=10)

        # Left side - Icon
        icon_frame = ctk.CTkFrame(content_frame, fg_color="transparent", width=50)
        icon_frame.pack(side="left", padx=(0, 15), pady=0)
        icon_frame.pack_propagate(False)

        # Load and display icon
        icon_image = None
        if program.get("icon"):
            icon_image = self.programs_manager.load_icon_from_base64(
                program["icon"], (40, 40)
            )

        if not icon_image:
            icon_image = self.programs_manager.get_default_icon((40, 40))

        if icon_image:
            icon_label = ctk.CTkLabel(icon_frame, image=icon_image, text="")
            icon_label.pack(pady=10)
            # Keep reference to prevent garbage collection
            icon_label.image = icon_image

        # Right side - Program info
        info_frame = ctk.CTkFrame(content_frame, fg_color="transparent")
        info_frame.pack(side="left", fill="both", expand=True)

        # Program name and version
        name_version_frame = ctk.CTkFrame(info_frame, fg_color="transparent")
        name_version_frame.pack(fill="x")

        name_text = program.get("name", "Unknown Program")
        if program.get("version"):
            name_text += f" v{program['version']}"

        name_label = ctk.CTkLabel(
            name_version_frame,
            text=name_text,
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        )
        name_label.pack(side="left", fill="x", expand=True)

        # Description
        if program.get("description"):
            desc_label = ctk.CTkLabel(
                info_frame,
                text=program["description"],
                font=ctk.CTkFont(size=12),
                text_color="gray",
                anchor="w",
            )
            desc_label.pack(fill="x", pady=(2, 0))

        # Path label
        path_label = ctk.CTkLabel(
            info_frame,
            text=f"Path: {program.get('executable', 'Unknown')}",
            font=ctk.CTkFont(size=10),
            text_color="gray70",
            anchor="w",
        )
        path_label.pack(fill="x", pady=(2, 0))

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

        # Edit button
        edit_button = ctk.CTkButton(
            buttons_frame,
            text="Edit",
            command=lambda idx=index: self.edit_program(idx),
            width=80,
            height=28,
            fg_color="blue",
            hover_color="darkblue",
        )
        edit_button.pack(side="left", padx=(0, 10))

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
        if self.programs_manager.get_program_status(program):
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
            self.programs_manager.launch_program(program)
        except FileNotFoundError as e:
            messagebox.showerror("Program Not Found", str(e))
        except Exception as e:
            messagebox.showerror("Launch Error", f"Failed to launch program: {str(e)}")

    class ProgramDialog(ctk.CTkToplevel):
        """Dialog for adding or editing program details"""

        def __init__(
            self,
            parent,
            programs_view,
            title="Add Program",
            program_data=None,
            exe_path=None,
        ):
            super().__init__(parent)
            self.parent = parent
            self.programs_view = programs_view  # Reference to ProgramsView instance
            self.program_data = program_data or {}
            self.exe_path = exe_path
            self.result = None
            self.icon_base64 = self.program_data.get("icon", "")
            self.icon_image = None

            self.title(title)
            self.geometry("500x600")
            self.resizable(False, False)

            # Make modal
            self.transient(parent)
            self.grab_set()

            self.setup_ui()
            self.populate_fields()

            # Center the dialog
            self.center_window()

        def center_window(self):
            self.update_idletasks()
            x = (self.winfo_screenwidth() // 2) - (self.winfo_width() // 2)
            y = (self.winfo_screenheight() // 2) - (self.winfo_height() // 2)
            self.geometry(f"+{x}+{y}")

        def setup_ui(self):
            # Main frame
            main_frame = ctk.CTkFrame(self, fg_color="transparent")
            main_frame.pack(fill="both", expand=True, padx=20, pady=20)

            # Icon preview frame
            icon_frame = ctk.CTkFrame(main_frame)
            icon_frame.pack(fill="x", pady=(0, 15))

            ctk.CTkLabel(
                icon_frame,
                text="Icon Preview",
                font=ctk.CTkFont(size=14, weight="bold"),
            ).pack(pady=(10, 5))

            self.icon_label = ctk.CTkLabel(
                icon_frame, text="No icon", width=64, height=64
            )
            self.icon_label.pack(pady=(0, 10))

            # Extract icon button
            self.extract_icon_btn = ctk.CTkButton(
                icon_frame,
                text="Extract Icon from EXE",
                command=self.extract_icon,
                width=150,
            )
            self.extract_icon_btn.pack(pady=(0, 10))

            # Form fields
            # Name field
            ctk.CTkLabel(
                main_frame,
                text="Program Name:",
                font=ctk.CTkFont(size=12, weight="bold"),
            ).pack(anchor="w", pady=(10, 5))
            self.name_entry = ctk.CTkEntry(
                main_frame, placeholder_text="Enter program name"
            )
            self.name_entry.pack(fill="x", pady=(0, 10))

            # Version field
            ctk.CTkLabel(
                main_frame, text="Version:", font=ctk.CTkFont(size=12, weight="bold")
            ).pack(anchor="w", pady=(0, 5))
            self.version_entry = ctk.CTkEntry(
                main_frame, placeholder_text="e.g., 1.0.0"
            )
            self.version_entry.pack(fill="x", pady=(0, 10))

            # Description field
            ctk.CTkLabel(
                main_frame,
                text="Description:",
                font=ctk.CTkFont(size=12, weight="bold"),
            ).pack(anchor="w", pady=(0, 5))
            self.description_text = ctk.CTkTextbox(main_frame, height=100)
            self.description_text.pack(fill="x", pady=(0, 10))

            # Executable path field
            ctk.CTkLabel(
                main_frame,
                text="Executable Path:",
                font=ctk.CTkFont(size=12, weight="bold"),
            ).pack(anchor="w", pady=(0, 5))

            path_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
            path_frame.pack(fill="x", pady=(0, 15))

            self.path_entry = ctk.CTkEntry(
                path_frame, placeholder_text="Select executable file"
            )
            self.path_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

            self.browse_btn = ctk.CTkButton(
                path_frame, text="Browse", command=self.browse_executable, width=80
            )
            self.browse_btn.pack(side="right")

            # Buttons frame
            buttons_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
            buttons_frame.pack(fill="x", pady=(20, 0))

            self.cancel_btn = ctk.CTkButton(
                buttons_frame,
                text="Cancel",
                command=self.cancel,
                width=100,
                fg_color="gray",
                hover_color="darkgray",
            )
            self.cancel_btn.pack(side="right", padx=(10, 0))

            self.save_btn = ctk.CTkButton(
                buttons_frame,
                text="Save",
                command=self.save,
                width=100,
                fg_color="green",
                hover_color="darkgreen",
            )
            self.save_btn.pack(side="right")

        def populate_fields(self):
            """Populate fields with existing data"""
            if self.program_data:
                self.name_entry.insert(0, self.program_data.get("name", ""))
                self.version_entry.insert(0, self.program_data.get("version", ""))
                self.description_text.insert(
                    "1.0", self.program_data.get("description", "")
                )
                self.path_entry.insert(0, self.program_data.get("executable", ""))

            elif self.exe_path:
                # For new programs, auto-fill from exe path
                program_name = os.path.splitext(os.path.basename(self.exe_path))[0]
                self.name_entry.insert(0, program_name)
                self.path_entry.insert(0, self.exe_path)

            self.update_icon_preview()

        def extract_icon(self):
            """Extract icon from the selected executable"""
            exe_path = self.path_entry.get().strip()
            if not exe_path:
                messagebox.showwarning(
                    "No Executable", "Please select an executable file first."
                )
                return

            # Convert relative path to absolute if needed
            if not os.path.isabs(exe_path):
                exe_path = os.path.join(
                    self.programs_view.programs_manager.data_folder, "..", exe_path
                )
                exe_path = os.path.normpath(exe_path)

            if not os.path.exists(exe_path):
                messagebox.showerror(
                    "File Not Found", "The selected executable file does not exist."
                )
                return

            try:
                self.icon_base64 = (
                    self.programs_view.programs_manager.extract_icon_from_exe(exe_path)
                )
                if self.icon_base64:
                    self.update_icon_preview()
                    messagebox.showinfo("Success", "Icon extracted successfully!")
                else:
                    messagebox.showwarning(
                        "No Icon", "No icon found in the executable file."
                    )
            except Exception as e:
                messagebox.showerror("Error", f"Failed to extract icon: {str(e)}")

        def update_icon_preview(self):
            """Update the icon preview"""
            if self.icon_base64:
                self.icon_image = (
                    self.programs_view.programs_manager.load_icon_from_base64(
                        self.icon_base64, (64, 64)
                    )
                )

            if not self.icon_image:
                self.icon_image = self.programs_view.programs_manager.get_default_icon(
                    (64, 64)
                )

            if self.icon_image:
                self.icon_label.configure(image=self.icon_image, text="")
                self.icon_label.image = self.icon_image
            else:
                self.icon_label.configure(image=None, text="No icon")

        def browse_executable(self):
            """Browse for executable file"""
            file_path = filedialog.askopenfilename(
                title="Select Portable Executable",
                filetypes=[("Executable files", "*.exe"), ("All files", "*.*")],
                initialdir=os.path.join(
                    self.programs_view.programs_manager.data_folder, "programs"
                ),
            )

            if file_path:
                relative_path = (
                    self.programs_view.programs_manager.convert_to_relative_path(
                        file_path
                    )
                )

                self.path_entry.delete(0, "end")
                self.path_entry.insert(0, relative_path)

                # Auto-fill name if empty
                if not self.name_entry.get().strip():
                    program_name = os.path.splitext(os.path.basename(file_path))[0]
                    self.name_entry.delete(0, "end")
                    self.name_entry.insert(0, program_name)

        def save(self):
            """Save the program data"""
            program_data = {
                "name": self.name_entry.get().strip(),
                "version": self.version_entry.get().strip(),
                "description": self.description_text.get("1.0", "end-1c").strip(),
                "executable": self.path_entry.get().strip(),
                "icon": self.icon_base64,
                "added_date": self.program_data.get(
                    "added_date", datetime.now().strftime("%Y-%m-%d")
                ),
            }

            try:
                self.programs_view.programs_manager.validate_program_data(program_data)
                self.result = program_data
                self.destroy()
            except ValueError as e:
                messagebox.showerror("Validation Error", str(e))

        def cancel(self):
            """Cancel the dialog"""
            self.result = None
            self.destroy()

    def add_program(self):
        """Add a new program through dialog"""
        try:
            # Open file dialog to select executable first
            file_path = filedialog.askopenfilename(
                title="Select Portable Executable",
                filetypes=[("Executable files", "*.exe"), ("All files", "*.*")],
                initialdir=os.path.join(self.programs_manager.data_folder, "programs"),
            )

            if not file_path:
                return

            # Convert to relative path from project root
            relative_path = self.programs_manager.convert_to_relative_path(file_path)

            # Open dialog to edit program details
            dialog = self.ProgramDialog(
                self.frame.winfo_toplevel(),
                self,  # Pass the ProgramsView instance
                title="Add Program",
                exe_path=relative_path,
            )
            self.frame.wait_window(dialog)

            if dialog.result:
                # Add to list and save
                self.programs_manager.add_program(dialog.result)
                self.refresh_program_list()

                messagebox.showinfo(
                    "Program Added", f"Successfully added: {dialog.result['name']}"
                )

        except ValueError as e:
            messagebox.showwarning("Program Exists", str(e))
        except Exception as e:
            messagebox.showerror("Error", f"Failed to add program: {str(e)}")

    def edit_program(self, index):
        """Edit an existing program"""
        try:
            program = self.programs_manager.get_program(index)
            if program:
                # Open dialog to edit program details
                dialog = self.ProgramDialog(
                    self.frame.winfo_toplevel(),
                    self,  # Pass the ProgramsView instance
                    title="Edit Program",
                    program_data=program.copy(),
                )
                self.frame.wait_window(dialog)

                if dialog.result:
                    # Update the program data
                    self.programs_manager.update_program(index, dialog.result)
                    self.refresh_program_list()

                    messagebox.showinfo(
                        "Program Updated",
                        f"Successfully updated: {dialog.result['name']}",
                    )

        except Exception as e:
            messagebox.showerror("Error", f"Failed to edit program: {str(e)}")

    def remove_program(self, index):
        """Remove a program from the list"""
        try:
            program = self.programs_manager.get_program(index)
            if program:
                program_name = program.get("name", "Unknown")

                # Confirm removal
                if messagebox.askyesno(
                    "Confirm Removal",
                    f"Are you sure you want to remove '{program_name}' from the list?\n\nThis will not delete the actual program file.",
                ):
                    self.programs_manager.remove_program(index)
                    self.refresh_program_list()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to remove program: {str(e)}")


def init_view(frame):
    """Initialize the Programs view"""
    ProgramsView(frame)
