import customtkinter as ctk
from src.core.info import SystemInfo


class SystemInfoSection(ctk.CTkFrame):
    def __init__(self, master, title):
        super().__init__(master, fg_color="transparent")
        self.title = ctk.CTkLabel(self, text=title, font=("Segoe UI", 16, "bold"))
        self.title.pack(anchor="w", pady=(10, 5), padx=10)
        self.grid_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.grid_frame.pack(fill="x", padx=10, pady=(0, 10))
        self.row = 0

    def add_item(self, label, value):
        ctk.CTkLabel(self.grid_frame, text=label + ":", font=("Segoe UI", 12)).grid(
            row=self.row, column=0, sticky="w", pady=2
        )
        ctk.CTkLabel(
            self.grid_frame, text=str(value), font=("Segoe UI", 12, "bold")
        ).grid(row=self.row, column=1, sticky="w", padx=10, pady=2)
        self.row += 1


def update_info(scrollable_frame):
    """Update all system information sections"""
    # Clear existing widgets
    for widget in scrollable_frame.winfo_children():
        widget.destroy()

    # System Information
    system_section = SystemInfoSection(scrollable_frame, "System Information")
    system_section.pack(fill="x", pady=5)
    for key, value in SystemInfo.get_system_info().items():
        system_section.add_item(key, value)

    # CPU Information
    cpu_section = SystemInfoSection(scrollable_frame, "CPU Information")
    cpu_section.pack(fill="x", pady=5)
    for key, value in SystemInfo.get_cpu_info().items():
        cpu_section.add_item(key, value)

    # Memory Information
    memory_section = SystemInfoSection(scrollable_frame, "Memory Information")
    memory_section.pack(fill="x", pady=5)
    for key, value in SystemInfo.get_memory_info().items():
        memory_section.add_item(key, value)

    # GPU Information
    gpu_section = SystemInfoSection(scrollable_frame, "GPU Information")
    gpu_section.pack(fill="x", pady=5)
    gpu_info = SystemInfo.get_gpu_info()
    for gpu_name, gpu_details in gpu_info.items():
        if isinstance(gpu_details, dict):
            gpu_section.add_item(gpu_name, "")
            for key, value in gpu_details.items():
                gpu_section.add_item(f"  {key}", value)
        else:
            gpu_section.add_item(gpu_name, gpu_details)

    # Storage Information
    storage_section = SystemInfoSection(scrollable_frame, "Storage Information")
    storage_section.pack(fill="x", pady=5)
    storage_info = SystemInfo.get_storage_info()
    for drive, details in storage_info.items():
        storage_section.add_item(
            f"Drive {drive}",
            f"Total: {details['Total']} | "
            f"Used: {details['Used']} | "
            f"Free: {details['Free']} | "
            f"Usage: {details['Percentage']}",
        )

    # Network Information
    network_section = SystemInfoSection(scrollable_frame, "Network Information")
    network_section.pack(fill="x", pady=5)
    network_info = SystemInfo.get_network_info()
    for interface, addresses in network_info.items():
        for address in addresses:
            network_section.add_item("Interface", f"{interface}: {address}")

    # Battery Information (if available)
    battery_info = SystemInfo.get_battery_info()
    if battery_info:
        battery_section = SystemInfoSection(scrollable_frame, "Battery Information")
        battery_section.pack(fill="x", pady=5)
        for battery_name, battery_details in battery_info.items():
            battery_section.add_item(battery_name, "")  # Add battery header
            for key, value in battery_details.items():
                battery_section.add_item(f"  {key}", value)  # Indent battery details


def init_view(frame):
    """Initialize the System Info view"""
    # Create container for refresh button
    top_container = ctk.CTkFrame(frame, fg_color="transparent")
    top_container.pack(fill="x", padx=10, pady=(10, 0))

    # Create refresh button
    refresh_button = ctk.CTkButton(
        top_container,
        text="↻ Refresh",
        width=100,
        command=lambda: update_info(scrollable_frame),
    )
    refresh_button.pack(side="right")

    # Create scrollable frame with larger width to prevent horizontal scroll
    scrollable_frame = ctk.CTkScrollableFrame(frame, width=700)
    scrollable_frame.pack(fill="both", expand=True, padx=10, pady=10)

    # Initial update of information
    update_info(scrollable_frame)
