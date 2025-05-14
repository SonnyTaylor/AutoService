"""
Main entry point for the AutoService application.
This script initializes the main application window using ttkbootstrap
and starts the application event loop.
"""

import sys
import traceback
import ttkbootstrap as tb
from ttkbootstrap.dialogs import Messagebox
from src.app import AutoService


def main():
    try:
        # Create the main application window with dark theme
        root = tb.Window(themename="darkly")

        # Initialize the AutoService application
        app = AutoService(root)

        # Start the application event loop
        root.mainloop()
    except Exception as e:
        error_message = (
            f"An error occurred:\n{str(e)}\n\nTraceback:\n{traceback.format_exc()}"
        )
        # Create a basic root window for the error dialog
        error_root = tb.Window(themename="darkly")
        error_root.withdraw()  # Hide the root window
        Messagebox.show_error(
            title="Application Error", message=error_message, parent=error_root
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
