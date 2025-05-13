"""
Main entry point for the AutoService application.
This script initializes the main application window using ttkbootstrap
and starts the application event loop.
"""

import ttkbootstrap as tb
from src.app import AutoService

if __name__ == "__main__":
    # Create the main application window with dark theme
    root = tb.Window(themename="darkly")

    # Initialize the AutoService application
    app = AutoService(root)

    # Start the application event loop
    root.mainloop()
