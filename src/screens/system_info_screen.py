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
    def __init__(self, parent, text, **kwargs):
        super().__init__(parent, text=f" ▼ {text}", **kwargs)
        self.expanded = True
        self.content_frame = tb.Frame(self)
        self.content_frame.pack(fill=X, expand=True, padx=5, pady=5)

        # Remove border
        self.configure(relief="flat", borderwidth=0)

        # Bind click event to the label
        self.bind("<Button-1>", self.toggle)
        for child in self.winfo_children():
            child.bind("<Button-1>", self.toggle)

    def toggle(self, event=None):
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

        # Get the root SystemInfoScreen instance
        system_info_screen = self.master.master.master.master
        if isinstance(system_info_screen, SystemInfoScreen):
            system_info_screen.update_scroll_region()


class SystemInfoScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()
        self.update_system_info()

    def create_widgets(self):
        # System Info Frame
        self.sys_info_frame = tb.LabelFrame(
            self, text=" System Information ", bootstyle="info", padding=15
        )
        self.sys_info_frame.pack(fill=BOTH, expand=YES, pady=10)

        # Create a canvas with scrollbar
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

        # System Info Labels
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

        for section, items in info_sections:
            # Create a collapsible section for each category
            section_frame = CollapsibleSection(
                self.scrollable_frame,
                text=section,
                bootstyle="primary",
            )
            section_frame.pack(fill=X, pady=5)

            for key, value in items.items():
                frame = tb.Frame(section_frame.content_frame)
                frame.pack(fill=X, pady=2)

                key_label = tb.Label(frame, text=f"{key}:", width=30, anchor=W)
                key_label.pack(side=LEFT)

                value_label = tb.Label(frame, text=value, anchor=W)
                value_label.pack(side=LEFT, fill=X, expand=True)

                self.info_labels[f"{section}_{key}"] = value_label

        # Add a refresh button
        refresh_btn = tb.Button(
            self,
            text="Refresh Information",
            command=self.update_system_info,
            bootstyle="info",
        )
        refresh_btn.pack(pady=10)

    def on_canvas_configure(self, event):
        # Update the scrollable region to encompass the inner frame
        self.canvas.itemconfig(self.canvas_window, width=event.width)
        self.update_scroll_region()

    def update_scroll_region(self):
        # Update the scroll region to encompass the inner frame
        self.canvas.update_idletasks()
        self.scrollable_frame.update_idletasks()
        bbox = self.canvas.bbox("all")
        if bbox:
            self.canvas.configure(scrollregion=bbox)

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(-1 * (event.delta // 120), "units")

    def update_system_info(self):
        # Update all dynamic information
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
