import ttkbootstrap as tb
from ttkbootstrap.constants import *
import tkinter as tk
from ..utils.system_utils import (
    get_system_info,
    get_battery_info,
    get_cpu_info,
    get_memory_info,
    get_disk_info,
    get_network_info,
    get_boot_info,
)


class CollapsibleSection(tb.Labelframe):
    """
    A custom widget that creates a collapsible/expandable section with a toggle arrow.
    Inherits from ttkbootstrap.Labelframe.
    """

    def __init__(self, parent, text, **kwargs):
        """
        Initialize the collapsible section.

        Args:
            parent: The parent widget
            text: The section title text
            **kwargs: Additional keyword arguments passed to the parent class
        """
        super().__init__(parent, text=f" ▼ {text}", **kwargs)
        self.expanded = True
        self.content_frame = tb.Frame(self)
        self.content_frame.pack(fill=X, expand=True, padx=5, pady=5)

        # Remove border
        self.configure(relief="flat", borderwidth=0)

        # Bind click event to the label and all child widgets
        self.bind("<Button-1>", self.toggle)
        for child in self.winfo_children():
            child.bind("<Button-1>", self.toggle)

    def toggle(self, event=None):
        """
        Toggle the expanded/collapsed state of the section.
        Updates the arrow indicator and adjusts the content visibility.

        Args:
            event: The event that triggered the toggle (optional)
        """
        if self.expanded:
            self.content_frame.pack_forget()
            self.configure(text=f" ▶ {self.cget('text')[3:]}")
            # Force the frame to update its size
            self.update_idletasks()
            self.configure(height=30)  # Set a fixed height when collapsed
        else:
            self.content_frame.pack(fill=X, expand=True, padx=5, pady=5)
            self.configure(text=f" ▼ {self.cget('text')[3:]}")
            # Reset height to allow content to determine size
            self.configure(height=0)
        self.expanded = not self.expanded

        # Get the root SystemInfoScreen instance and update scroll region
        system_info_screen = self.master.master.master.master
        if isinstance(system_info_screen, SystemInfoScreen):
            system_info_screen.update_scroll_region()


class SystemInfoScreen(tb.Frame):
    """
    A screen that displays various system information in collapsible sections.
    Information includes system specs, battery, CPU, memory, disks, network, and boot time.
    """

    def __init__(self, master):
        """
        Initialize the system information screen.

        Args:
            master: The parent widget
        """
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()
        self.update_system_info()

    def create_widgets(self):
        """Create and arrange all widgets for the system information display."""
        # System Info Frame
        self.sys_info_frame = tb.LabelFrame(
            self, text=" System Information ", bootstyle="info", padding=15
        )
        self.sys_info_frame.pack(fill=BOTH, expand=YES, pady=10)

        # Create a canvas with scrollbar for scrollable content
        self.canvas = tb.Canvas(
            self.sys_info_frame, highlightthickness=0, width=500
        )  # Set minimum width
        scrollbar = tb.Scrollbar(
            self.sys_info_frame, orient=VERTICAL, command=self.canvas.yview
        )
        self.scrollable_frame = tb.Frame(self.canvas)

        self.scrollable_frame.bind("<Configure>", lambda e: self.update_scroll_region())

        self.canvas_window = self.canvas.create_window(
            (0, 0), window=self.scrollable_frame, anchor="nw"
        )
        self.canvas.configure(yscrollcommand=scrollbar.set)

        # Bind to Configure event to update the window size
        self.canvas.bind("<Configure>", self.on_canvas_configure)

        self.canvas.pack(side=LEFT, fill=BOTH, expand=True)
        scrollbar.pack(side=RIGHT, fill=Y)

        # Bind mouse wheel scrolling
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

        # Create sections for different types of system information
        self.info_labels = {}
        info_sections = [
            ("System", get_system_info()),
            ("Battery", get_battery_info()),
            ("CPU", get_cpu_info()),
            ("Memory", get_memory_info()),
            ("Disks", get_disk_info()),
            ("Network", get_network_info()),
            ("Boot Time", get_boot_info()),
        ]

        # Create collapsible sections for each category of information
        for section, items in info_sections:
            section_frame = CollapsibleSection(
                self.scrollable_frame,
                text=section,
                bootstyle="primary",
            )
            section_frame.pack(fill=X, pady=5)

            # Create labels for each key-value pair in the section
            for key, value in items.items():
                frame = tb.Frame(section_frame.content_frame)
                frame.pack(fill=X, pady=2)

                key_label = tb.Label(frame, text=f"{key}:", width=30, anchor=W)
                key_label.pack(side=LEFT)

                value_label = tb.Label(frame, text=value, anchor=W)
                value_label.pack(side=LEFT, fill=X, expand=True)

                self.info_labels[f"{section}_{key}"] = value_label

        # Add a refresh button at the bottom
        refresh_btn = tb.Button(
            self,
            text="Refresh Information",
            command=self.update_system_info,
            bootstyle="info",
        )
        refresh_btn.pack(pady=10)

    def on_canvas_configure(self, event):
        """
        Handle canvas resize events by updating the scrollable window width.

        Args:
            event: The Configure event
        """
        self.canvas.itemconfig(self.canvas_window, width=event.width)
        self.update_scroll_region()

    def update_scroll_region(self):
        """Update the canvas scroll region to match the content size."""
        self.canvas.update_idletasks()
        self.scrollable_frame.update_idletasks()
        bbox = self.canvas.bbox("all")
        if bbox:
            self.canvas.configure(scrollregion=bbox)

    def _on_mousewheel(self, event):
        """
        Handle mousewheel scrolling.

        Args:
            event: The MouseWheel event
        """
        self.canvas.yview_scroll(-1 * (event.delta // 120), "units")

    def update_system_info(self):
        """Update all dynamic system information in the display."""
        # Update all dynamic information sections
        for section, items in [
            ("CPU", get_cpu_info()),
            ("Battery", get_battery_info()),
            ("Memory", get_memory_info()),
            ("Disks", get_disk_info()),
            ("Network", get_network_info()),
            ("Boot Time", get_boot_info()),
        ]:
            for key, value in items.items():
                label_key = f"{section}_{key}"
                if label_key in self.info_labels:
                    self.info_labels[label_key].config(text=value)

        # Update the window to reflect changes
        self.update_idletasks()
