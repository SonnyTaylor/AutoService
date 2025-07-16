#!/usr/bin/env python3
"""Simple test of the program dialog"""

import sys
import os

sys.path.append(".")

import customtkinter as ctk
from src.ui.programs import ProgramsView


def test_dialog():
    """Test the program dialog"""
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")

    root = ctk.CTk()
    root.title("Test Program Dialog")
    root.geometry("800x600")

    frame = ctk.CTkFrame(root, fg_color="transparent")
    frame.pack(fill="both", expand=True, padx=10, pady=10)

    programs_view = ProgramsView(frame)

    root.mainloop()


if __name__ == "__main__":
    test_dialog()
