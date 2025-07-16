#!/usr/bin/env python3
"""Test icon extraction functionality"""

import sys
import os

sys.path.append(".")

from src.ui.programs import ProgramsView
import customtkinter as ctk


def test_icon_extraction():
    """Test extracting icon from CrystalDiskInfo"""
    # Create a dummy frame
    root = ctk.CTk()
    frame = ctk.CTkFrame(root)

    # Create ProgramsView instance
    programs_view = ProgramsView(frame)

    # Test icon extraction from CrystalDiskInfo
    exe_path = os.path.join(
        programs_view.data_folder,
        "programs",
        "CrystalDiskInfo9_7_0Aoi",
        "DiskInfo64A.exe",
    )
    print(f"Testing icon extraction from: {exe_path}")
    print(f"File exists: {os.path.exists(exe_path)}")

    if os.path.exists(exe_path):
        icon_base64 = programs_view.extract_icon_from_exe(exe_path)
        if icon_base64:
            print(f"Icon extracted successfully! Length: {len(icon_base64)} characters")

            # Test loading the icon
            icon_image = programs_view.load_icon_from_base64(icon_base64, (64, 64))
            if icon_image:
                print("Icon loaded successfully as PhotoImage!")
            else:
                print("Failed to load icon as PhotoImage")
        else:
            print("No icon found or extraction failed")
    else:
        print("Executable file not found")

    root.destroy()


if __name__ == "__main__":
    test_icon_extraction()
