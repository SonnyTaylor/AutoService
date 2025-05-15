import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.tooltip import ToolTip

from ..utils.system_utils import (
    get_battery_info,
    get_cpu_info,
    get_disk_info,
    get_memory_info,
    get_network_info,
    get_system_info,
)

TOOLTIP_DESCRIPTIONS = {
    # System
    "Operating System": "The installed OS platform, indicating the system’s environment (e.g., Windows, Linux).",
    "OS Version": "Detailed version info, useful for compatibility and updates.",
    "Hostname": "The network name of your device, used to identify it on local networks.",
    "Machine": "The system's hardware architecture (e.g., x86_64), which affects software compatibility.",
    "Processor": "The name/model of the CPU, helpful for assessing performance.",
    "MAC Address": "A unique hardware address for network interfaces, used for identification on networks.",
    "Architecture": "System hardware architecture (e.g., x86_64, ARM). Affects compatibility with software.",
    "Kernel Version": "The core OS kernel version — useful for debugging OS-level issues.",
    "Username": "Currently logged-in user — useful for identifying session context.",
    "BIOS Version": "Firmware version of the system BIOS — helps determine hardware compatibility.",
    "System Manufacturer": "OEM or vendor who built the system — useful for warranty/service.",
    "System Model": "Model name/number — helpful for parts lookup or specs matching.",
    "Secure Boot": "Indicates if Secure Boot is enabled — part of system security configuration.",
    "Boot Time": "The exact date and time when the system was last started.",
    "Uptime": "How long your device has been running since the last boot — useful for monitoring stability.",
    "Locale": "Language and region settings — affects date/time, number formatting, etc.",
    "Timezone": "The system's current timezone setting.",
    # CPU
    "Physical Cores": "The number of actual, physical CPU cores — affects multitasking capability.",
    "Total Cores": "Includes both physical and virtual (logical) cores — important for parallel processing.",
    "CPU Usage": "Real-time percentage of CPU workload — useful to monitor performance bottlenecks.",
    "CPU Frequency": "Current operating speed of the CPU in MHz — fluctuates with system load.",
    "CPU Max Frequency": "Maximum rated speed your CPU can reach under load.",
    # Memory
    "Total Memory": "Total RAM installed — more allows better multitasking and app performance.",
    "Available Memory": "Unused RAM currently available for apps — low values may indicate high usage.",
    "Used Memory": "RAM actively being used — helps assess system demand.",
    "Total Swap": "Disk-based memory used when RAM is full — slower than RAM but prevents crashes.",
    "Used Swap": "Portion of swap space currently in use — consistently high values may suggest low RAM.",
    # Boot Time
    "Boot Time": "The exact date and time when the system was last started.",
    "Uptime": "How long your device has been running since the last boot — useful for monitoring stability.",
    # Battery
    "Battery Level": "Current battery charge in percentage — useful for checking how long before recharge.",
    "Vendor": "Battery manufacturer — may help with warranty or replacement.",
    "Serial Number": "Unique identifier for the battery — useful for support and tracking.",
    "Technology": "Battery type (e.g., Li-ion) — affects lifespan and charging behavior.",
    "Power Status": "Whether the battery is charging, discharging, or idle.",
    "Battery Health": "Estimated battery capacity left compared to original — a sign of battery health.",
    "Temperature": "Battery temperature in Celsius — high values may indicate stress or danger.",
    "Charge Cycles": "Number of full charge/discharge cycles — more cycles mean more wear.",
    "Current Energy": "Current stored energy in the battery — typically in Wh or mWh.",
    "Energy When Full": "Estimated energy the battery can store when fully charged.",
    "Design Energy": "Original designed energy capacity — helps determine battery wear.",
    "Energy Rate": "How fast energy is being consumed or charged — measured in watts.",
    "Voltage": "Current voltage across the battery terminals — fluctuates during usage.",
    "Time Until Empty": "Estimated time remaining on current charge if unplugged.",
    "Time Until Full": "Estimated time to fully recharge the battery.",
}


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

    def _bind_mousewheel_recursive(self, widget):
        """
        Recursively bind <MouseWheel> event to all child widgets to ensure scrolling works anywhere.
        """
        widget.bind("<MouseWheel>", self._on_mousewheel)
        for child in widget.winfo_children():
            self._bind_mousewheel_recursive(child)

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

        # Bind mouse wheel event to the root window
        self.winfo_toplevel().bind("<MouseWheel>", self._on_mousewheel)

        # Create sections for different types of system information
        self.info_labels = {}
        info_sections = [
            ("System", get_system_info()),
            ("CPU", get_cpu_info()),
            ("Memory", get_memory_info()),
            ("Disks", get_disk_info()),
            ("Network", get_network_info()),
            ("Battery", get_battery_info()),
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

                # Add a tooltip to the key label
                description = TOOLTIP_DESCRIPTIONS.get(key, "No description available.")
                ToolTip(key_label, text=description)

                # Add a horizontal line separator
                separator = tb.Separator(section_frame.content_frame, orient=HORIZONTAL)
                separator.pack(fill=X, pady=2)

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
        # Get the widget under the mouse
        x = self.winfo_rootx() + event.x
        y = self.winfo_rooty() + event.y
        widget_under_mouse = event.widget.winfo_containing(x, y)

        # Check if the widget under the mouse is part of our frame
        current = widget_under_mouse
        while current is not None:
            if current == self:
                self.canvas.yview_scroll(-1 * (event.delta // 120), "units")
                break
            current = current.master

    def update_system_info(self):
        """Update all dynamic system information in the display."""
        # Update all dynamic information sections
        for section, items in [
            ("CPU", get_cpu_info()),
            ("Memory", get_memory_info()),
            ("Disks", get_disk_info()),
            ("Network", get_network_info()),
            ("Battery", get_battery_info()),
        ]:
            for key, value in items.items():
                label_key = f"{section}_{key}"
                if label_key in self.info_labels:
                    self.info_labels[label_key].config(text=value)

        # Update the window to reflect changes
        self.update_idletasks()
