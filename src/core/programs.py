import json
import os
import subprocess
import sys
from datetime import datetime
import base64
from io import BytesIO
from PIL import Image
import customtkinter as ctk
from icoextract import IconExtractor, IconExtractorError


class ProgramsManager:
    """Handles all business logic for managing portable programs"""

    def __init__(self):
        self.programs_data = []
        self.data_folder = self.get_data_folder_path()
        self.programs_json_path = os.path.join(
            self.data_folder, "settings", "programs.json"
        )
        self.icons_cache = {}  # Cache for loaded icons
        self.load_programs()

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

    def extract_icon_from_exe(self, exe_path):
        """Extract icon from executable file and return as base64 string"""
        try:
            extractor = IconExtractor(exe_path)

            # Try to get the main application icon (usually the first one)
            icons = extractor.list_group_icons()
            if not icons:
                return None

            # Try the first few icons to find a valid one
            for i in range(min(5, len(icons))):
                try:
                    icon_data = extractor.get_icon(num=i)

                    # Use getvalue() instead of read() to get the icon bytes
                    if hasattr(icon_data, "getvalue"):
                        icon_bytes = icon_data.getvalue()
                    else:
                        # Fallback to read() method
                        icon_data.seek(0)  # Reset position
                        icon_bytes = icon_data.read()

                    # Check if we got valid icon data
                    if len(icon_bytes) > 0:
                        # Convert to base64 for storage
                        icon_base64 = base64.b64encode(icon_bytes).decode("utf-8")
                        return icon_base64
                except Exception as e:
                    # Continue to next icon if this one fails
                    continue

            return None
        except IconExtractorError as e:
            print(f"IconExtractorError: {e}")
            return None
        except Exception as e:
            print(f"General error extracting icon: {e}")
            return None

    def load_icon_from_base64(self, icon_base64, size=(32, 32)):
        """Load icon from base64 string and return as CTkImage"""
        try:
            if not icon_base64:
                return None

            icon_bytes = base64.b64decode(icon_base64)
            icon_data = BytesIO(icon_bytes)

            # Load with PIL and resize
            pil_image = Image.open(icon_data)
            pil_image = pil_image.resize(size, Image.Resampling.LANCZOS)

            # Convert to CTkImage for CustomTkinter
            return ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=size)
        except Exception:
            return None

    def get_default_icon(self, size=(32, 32)):
        """Create a default icon for programs without icons"""
        try:
            # Create a simple default icon with program symbol
            img = Image.new("RGBA", size, (64, 128, 255, 255))  # Blue background

            # Draw a simple executable icon shape
            from PIL import ImageDraw

            draw = ImageDraw.Draw(img)

            # Draw a simple rectangle representing an executable
            margin = size[0] // 8
            draw.rectangle(
                [margin, margin, size[0] - margin, size[1] - margin],
                fill=(255, 255, 255, 255),
                outline=(0, 0, 0, 255),
            )

            # Draw "EXE" text if icon is large enough
            if size[0] >= 32:
                try:
                    # Try to use a font if available
                    from PIL import ImageFont

                    font_size = max(8, size[0] // 6)
                    font = ImageFont.load_default()
                    draw.text(
                        (size[0] // 2 - 10, size[1] // 2 - 4),
                        "EXE",
                        fill=(0, 0, 0, 255),
                        font=font,
                    )
                except:
                    # Fallback without font
                    pass

            return ctk.CTkImage(light_image=img, dark_image=img, size=size)
        except Exception:
            return None

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
            raise Exception(f"Failed to load programs: {str(e)}")

    def save_programs(self):
        """Save programs to JSON file"""
        try:
            os.makedirs(os.path.dirname(self.programs_json_path), exist_ok=True)
            data = {"programs": self.programs_data}
            with open(self.programs_json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            raise Exception(f"Failed to save programs: {str(e)}")

    def get_programs(self):
        """Get the list of programs"""
        return self.programs_data

    def add_program(self, program_data):
        """Add a new program to the list"""
        # Check if program already exists
        for existing in self.programs_data:
            if existing.get("executable") == program_data.get("executable"):
                raise ValueError("This program is already in the list.")

        # Add timestamp if not present
        if "added_date" not in program_data:
            program_data["added_date"] = datetime.now().strftime("%Y-%m-%d")

        self.programs_data.append(program_data)
        self.save_programs()
        return True

    def update_program(self, index, program_data):
        """Update an existing program"""
        if 0 <= index < len(self.programs_data):
            self.programs_data[index] = program_data
            self.save_programs()
            return True
        return False

    def remove_program(self, index):
        """Remove a program from the list"""
        if 0 <= index < len(self.programs_data):
            removed_program = self.programs_data.pop(index)
            self.save_programs()
            return removed_program
        return None

    def get_program(self, index):
        """Get a specific program by index"""
        if 0 <= index < len(self.programs_data):
            return self.programs_data[index]
        return None

    def launch_program(self, program):
        """Launch the selected program"""
        exe_path = program.get("executable", "")
        # Convert relative path to absolute path
        if not os.path.isabs(exe_path):
            exe_path = os.path.join(self.data_folder, "..", exe_path)
        exe_path = os.path.normpath(exe_path)

        if not os.path.exists(exe_path):
            raise FileNotFoundError(
                f"The executable file could not be found: {exe_path}"
            )

        # Launch the program
        subprocess.Popen([exe_path], shell=True)
        return True

    def validate_program_data(self, program_data):
        """Validate program data before saving"""
        if not program_data.get("name", "").strip():
            raise ValueError("Program name is required.")

        if not program_data.get("executable", "").strip():
            raise ValueError("Executable path is required.")

        return True

    def get_program_status(self, program):
        """Check if a program's executable exists"""
        exe_path = os.path.join(self.data_folder, "..", program.get("executable", ""))
        exe_path = os.path.normpath(exe_path)
        return os.path.exists(exe_path)

    def convert_to_relative_path(self, file_path):
        """Convert absolute path to relative path from project root"""
        try:
            project_root = os.path.dirname(self.data_folder)
            relative_path = os.path.relpath(file_path, project_root)
            relative_path = relative_path.replace("\\", "/")
            return relative_path
        except ValueError:
            return file_path

    def get_program_count(self):
        """Get the number of programs"""
        return len(self.programs_data)
