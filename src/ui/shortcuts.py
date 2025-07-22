import customtkinter as ctk
from src.core.shortcuts import WindowsShortcuts


class ShortcutSection(ctk.CTkFrame):
    def __init__(self, master, title, shortcuts):
        super().__init__(master)

        # Create title label
        title_label = ctk.CTkLabel(
            self, text=title, font=("Segoe UI", 16, "bold"), anchor="w"
        )
        title_label.pack(fill="x", padx=10, pady=(10, 5))

        # Create grid frame for buttons
        self.grid_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.grid_frame.pack(fill="x", padx=10, pady=(0, 10))

        # Create buttons for each shortcut
        for i, shortcut in enumerate(shortcuts):
            btn = ctk.CTkButton(
                self.grid_frame,
                text=shortcut["name"],
                width=200,
                command=lambda cmd=shortcut["command"],
                adm=shortcut.get("admin", False): WindowsShortcuts.launch_shortcut(
                    cmd, adm
                ),
            )
            row = i // 2  # Two buttons per row
            col = i % 2  # Alternating between columns 0 and 1
            btn.grid(row=row, column=col, padx=5, pady=5, sticky="ew")

        # Configure grid columns to be equal width
        self.grid_frame.grid_columnconfigure(0, weight=1)
        self.grid_frame.grid_columnconfigure(1, weight=1)


def init_view(frame):
    """Initialize the Shortcuts view"""
    # Create scrollable frame
    scrollable_frame = ctk.CTkScrollableFrame(frame, width=700)
    scrollable_frame.pack(fill="both", expand=True, padx=10, pady=10)

    # Get shortcuts organized by category
    categories = WindowsShortcuts.get_shortcut_categories()

    # Create a section for each category
    for category, shortcuts in categories.items():
        section = ShortcutSection(scrollable_frame, category, shortcuts)
        section.pack(fill="x", pady=5)
