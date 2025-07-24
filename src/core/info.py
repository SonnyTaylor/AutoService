"""System information core functionality"""

import psutil
import platform
from datetime import datetime
import socket
from win32com.client import GetObject
import batteryinfo


def get_size(bytes_value):
    """Convert bytes to human readable format"""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_value < 1024:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024


def get_wmi_object():
    """Get WMI object"""
    return GetObject(r"winmgmts:root\cimv2")


class SystemInfo:
    @staticmethod
    def get_system_info():
        """Get basic system information"""
        try:
            wmi = get_wmi_object()
            os_info = wmi.ExecQuery("Select * from Win32_OperatingSystem")[0]
            os_name = os_info.Caption
            if "Windows 11" in os_name:
                edition = os_info.OperatingSystemSKU
                if edition == 48:  # Professional
                    os_name = "Windows 11 Pro"
                elif edition == 49:  # Professional N
                    os_name = "Windows 11 Pro N"
                elif edition == 101:  # Home
                    os_name = "Windows 11 Home"
                elif edition == 100:  # Home N
                    os_name = "Windows 11 Home N"

            build = os_info.BuildNumber
            version = os_info.Version

            return {
                "OS": f"{os_name} ({version} Build {build})",
                "Computer Name": platform.node(),
                "Architecture": platform.machine(),
                "Boot Time": datetime.fromtimestamp(psutil.boot_time()).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            }
        except Exception:
            # Fallback to platform if WMI fails
            system = platform.uname()
            return {
                "OS": f"{system.system} {system.version}",
                "Computer Name": system.node,
                "Architecture": system.machine,
                "Boot Time": datetime.fromtimestamp(psutil.boot_time()).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            }

    @staticmethod
    def get_cpu_info():
        """Get CPU information"""
        try:
            wmi = get_wmi_object()
            cpu = wmi.ExecQuery("Select * from Win32_Processor")[0]
            cpu_name = cpu.Name.strip()

            cpu_info = {
                "Processor": cpu_name,
                "Physical Cores": psutil.cpu_count(logical=False),
                "Total Cores": psutil.cpu_count(logical=True),
                "CPU Usage": f"{psutil.cpu_percent()}%",
            }

            cpu_freq = psutil.cpu_freq()
            if cpu_freq:
                cpu_info.update(
                    {
                        "Max Frequency": f"{cpu_freq.max / 1000:.2f} GHz",
                        "Min Frequency": f"{cpu_freq.min / 1000:.2f} GHz",
                        "Current Frequency": f"{cpu_freq.current / 1000:.2f} GHz",
                    }
                )

            return cpu_info
        except Exception:
            # Fallback to psutil if WMI fails
            return {
                "Processor": platform.processor(),
                "Physical Cores": psutil.cpu_count(logical=False),
                "Total Cores": psutil.cpu_count(logical=True),
                "CPU Usage": f"{psutil.cpu_percent()}%",
            }

    @staticmethod
    def get_memory_info():
        """Get memory information"""
        svmem = psutil.virtual_memory()
        return {
            "Total": get_size(svmem.total),
            "Available": get_size(svmem.available),
            "Used": get_size(svmem.used),
            "Percentage": f"{svmem.percent}%",
        }

    @staticmethod
    def get_gpu_info():
        """Get GPU information"""
        try:
            wmi = get_wmi_object()
            # First try NVIDIA specific paths for accurate VRAM info
            nvidia_memory = None
            try:
                # Try using Win32_VideoController's AdapterRAM first
                nvidia_cards = wmi.ExecQuery(
                    "Select * from Win32_VideoController where Name like '%NVIDIA%'"
                )
                for card in nvidia_cards:
                    try:
                        if hasattr(card, "AdapterRAM") and card.AdapterRAM:
                            nvidia_memory = int(card.AdapterRAM)
                            break
                    except Exception:
                        continue

                # If that didn't work, try alternative WMI classes
                if not nvidia_memory:
                    # Try performance counters
                    nvidia_wmi = wmi.ExecQuery(
                        "Select * from Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine"
                    )
                    if nvidia_wmi:
                        for gpu in nvidia_wmi:
                            if hasattr(gpu, "DedicatedMemory"):
                                try:
                                    mem = int(gpu.DedicatedMemory)
                                    if mem > 0:
                                        nvidia_memory = mem
                                        break
                                except Exception:
                                    continue

                # If still no success, try DisplayConfiguration
                if not nvidia_memory:
                    display_info = wmi.ExecQuery(
                        "Select * from Win32_DisplayConfiguration"
                    )
                    for display in display_info:
                        if (
                            hasattr(display, "VideoMemoryType")
                            and display.VideoMemoryType
                        ):
                            try:
                                mem = int(display.VideoMemoryType)
                                if mem > 0:
                                    nvidia_memory = (
                                        mem * 1024 * 1024
                                    )  # Convert to bytes
                                    break
                            except Exception:
                                continue

            except Exception:
                nvidia_memory = None

            gpus = wmi.ExecQuery("Select * from Win32_VideoController")
            gpu_info = {}

            for i, gpu in enumerate(gpus, 1):
                # Try multiple methods to get dedicated video memory
                try:
                    dedicated_memory = 0

                    # For NVIDIA cards, use our previously gathered NVIDIA-specific info
                    if "NVIDIA" in gpu.Name and nvidia_memory:
                        dedicated_memory = nvidia_memory
                    else:
                        # Try direct properties first
                        for prop in ["AdapterRAM", "VideoMemoryType", "VideoRAM"]:
                            try:
                                val = int(getattr(gpu, prop, 0))
                                if val > dedicated_memory:
                                    dedicated_memory = val
                            except (AttributeError, TypeError, ValueError):
                                continue

                        # If still no success, try additional properties
                        if dedicated_memory <= 0:
                            # Try VideoProcessor property which might contain memory info
                            if hasattr(gpu, "VideoProcessor"):
                                # Common format "NVIDIA GeForce MX150 (2GB)"
                                desc = gpu.VideoProcessor
                                if "GB)" in desc:
                                    try:
                                        gb_str = desc[
                                            desc.find("(") + 1 : desc.find("GB")
                                        ]
                                        gb_val = float(gb_str)
                                        dedicated_memory = int(
                                            gb_val * 1024 * 1024 * 1024
                                        )
                                    except Exception:
                                        pass

                            # Try description for memory info
                            if dedicated_memory <= 0 and hasattr(gpu, "Description"):
                                desc = gpu.Description
                                if "GB" in desc:
                                    try:
                                        # Try to find patterns like "2GB" or "2 GB"
                                        import re

                                        match = re.search(r"(\d+(?:\.\d+)?)\s*GB", desc)
                                        if match:
                                            gb_val = float(match.group(1))
                                            dedicated_memory = int(
                                                gb_val * 1024 * 1024 * 1024
                                            )
                                    except Exception:
                                        pass

                    dedicated_memory_gb = (
                        dedicated_memory / (1024**3) if dedicated_memory > 0 else None
                    )
                except Exception:
                    dedicated_memory_gb = None

                # Format memory string
                if dedicated_memory_gb:
                    memory_str = (
                        f"{dedicated_memory_gb:.1f} GB"
                        if dedicated_memory_gb > 0
                        else "Shared"
                    )
                else:
                    memory_str = "Unknown"

                gpu_info[f"GPU {i}"] = {
                    "Name": gpu.Name.strip(),
                    "Driver Version": gpu.DriverVersion.strip()
                    if gpu.DriverVersion
                    else "Unknown",
                    "Video Memory": memory_str,
                    "Driver Date": gpu.DriverDate.split(".")[0]
                    if gpu.DriverDate
                    else "Unknown",
                }

                # Add resolution if available
                if (
                    hasattr(gpu, "CurrentHorizontalResolution")
                    and gpu.CurrentHorizontalResolution
                ):
                    gpu_info[f"GPU {i}"]["Current Resolution"] = (
                        f"{gpu.CurrentHorizontalResolution}x{gpu.CurrentVerticalResolution} "
                        f"@ {gpu.CurrentRefreshRate}Hz"
                        if gpu.CurrentRefreshRate
                        else "Unknown Hz"
                    )

            return gpu_info
        except Exception as e:
            return {"Error": f"Could not detect GPU information: {str(e)}"}

    @staticmethod
    def get_storage_info():
        """Get storage information"""
        storage_info = {}
        try:
            wmi = get_wmi_object()
            for drive in wmi.ExecQuery("Select * from Win32_LogicalDisk"):
                try:
                    if (
                        drive.Size
                    ):  # Skip drives with no size (CD-ROM, network drives, etc.)
                        total = int(drive.Size)
                        free = int(drive.FreeSpace)
                        used = total - free
                        percent = (used / total) * 100

                        # Get volume name if available
                        volume_name = drive.VolumeName or "Local Disk"

                        storage_info[f"{drive.DeviceID} ({volume_name})"] = {
                            "Total": get_size(total),
                            "Used": get_size(used),
                            "Free": get_size(free),
                            "Percentage": f"{percent:.1f}%",
                        }
                except Exception:
                    continue
            return storage_info
        except Exception:
            # Fallback to psutil
            return SystemInfo._get_storage_info_fallback()

    @staticmethod
    def _get_storage_info_fallback():
        """Fallback method for storage information using psutil"""
        storage_info = {}
        partitions = psutil.disk_partitions()
        for partition in partitions:
            try:
                partition_usage = psutil.disk_usage(partition.mountpoint)
                storage_info[partition.device] = {
                    "Total": get_size(partition_usage.total),
                    "Used": get_size(partition_usage.used),
                    "Free": get_size(partition_usage.free),
                    "Percentage": f"{partition_usage.percent}%",
                }
            except Exception:
                continue
        return storage_info

    @staticmethod
    def get_network_info():
        """Get network information"""
        try:
            wmi = get_wmi_object()
            interfaces = {}

            # Get network adapters
            for adapter in wmi.ExecQuery(
                "Select * from Win32_NetworkAdapter where PhysicalAdapter=True"
            ):
                # Get configuration for this adapter
                configs = wmi.ExecQuery(
                    f"Select * from Win32_NetworkAdapterConfiguration where InterfaceIndex={adapter.InterfaceIndex}"
                )
                for config in configs:
                    if config.IPAddress:
                        # IPAddress is an array of strings, join them with commas
                        ip_addresses = ", ".join(config.IPAddress)
                        status_map = {
                            0: "Disconnected",
                            1: "Connecting",
                            2: "Connected",
                            3: "Disconnecting",
                            4: "Hardware not present",
                            5: "Hardware disabled",
                            6: "Hardware malfunction",
                            7: "Media disconnected",
                            8: "Authenticating",
                            9: "Authentication succeeded",
                            10: "Authentication failed",
                            11: "Invalid address",
                            12: "Credentials required",
                        }
                        status = status_map.get(adapter.NetConnectionStatus, "Unknown")

                        interfaces[adapter.Name] = [ip_addresses]
            return interfaces
        except Exception:
            # Fallback to psutil
            interfaces = {}
            for iface, addrs in psutil.net_if_addrs().items():
                interfaces[iface] = []
                for addr in addrs:
                    if addr.family == socket.AF_INET:  # IPv4
                        interfaces[iface].append(addr.address)
            return interfaces

    @staticmethod
    def get_battery_info():
        """Get detailed battery information using batteryinfo"""
        try:
            batteries = {}

            # Try getting info for both batteries (index 0 and 1)
            for idx in range(2):
                try:
                    battery = batteryinfo.Battery(
                        index=idx,
                        time_format=batteryinfo.TimeFormat.Human,
                        temp_unit=batteryinfo.TempUnit.DegC,
                    )

                    info = {}

                    # Basic information
                    if battery.vendor:
                        info["Vendor"] = battery.vendor
                    if battery.model:
                        info["Model"] = battery.model
                    if battery.serial_number:
                        info["Serial Number"] = battery.serial_number
                    if battery.technology:
                        info["Technology"] = battery.technology

                    # Essential status information
                    info["Status"] = battery.state
                    info["Battery Level"] = str(battery.percent)

                    # Health information
                    if battery.capacity:
                        info["Battery Health"] = str(battery.capacity)
                    if battery.cycle_count:
                        info["Cycle Count"] = str(battery.cycle_count)

                    # Power information
                    if battery.energy and battery.energy_full:
                        info["Current Energy"] = str(battery.energy)
                        info["Full Energy"] = str(battery.energy_full)
                    if battery.energy_full_design:
                        info["Design Energy"] = str(battery.energy_full_design)
                    if battery.energy_rate:
                        info["Power Draw"] = str(battery.energy_rate)
                    if battery.voltage:
                        info["Voltage"] = str(battery.voltage)

                    # Temperature
                    if battery.temperature:
                        info["Temperature"] = str(battery.temperature)

                    # Time estimates
                    if battery.state == "Charging" and battery.time_to_full:
                        info["Time to Full"] = battery.time_to_full
                    elif battery.state == "Discharging" and battery.time_to_empty:
                        info["Time to Empty"] = battery.time_to_empty

                    batteries[f"Battery {idx + 1}"] = info
                except Exception:
                    continue

            return batteries if batteries else None

        except (ImportError, Exception) as e:
            # Fallback to psutil if batteryinfo is not available
            if hasattr(psutil, "sensors_battery"):
                battery = psutil.sensors_battery()
                if battery:
                    return {
                        "Battery 1": {
                            "Battery Level": f"{battery.percent}%",
                            "Status": "Charging"
                            if battery.power_plugged
                            else "Discharging",
                            "Power Plugged": "Yes" if battery.power_plugged else "No",
                        }
                    }
            return None
