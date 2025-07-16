"""System information core functionality"""
import psutil
import platform
from datetime import datetime
import socket
from win32com.client import GetObject


def get_size(bytes_value):
    """Convert bytes to human readable format"""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_value < 1024:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024


def get_wmi_object():
    """Get WMI object"""
    return GetObject('winmgmts:root\cimv2')


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
                "Boot Time": datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
            }
        except Exception:
            # Fallback to platform if WMI fails
            system = platform.uname()
            return {
                "OS": f"{system.system} {system.version}",
                "Computer Name": system.node,
                "Architecture": system.machine,
                "Boot Time": datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
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
                "CPU Usage": f"{psutil.cpu_percent()}%"
            }
            
            cpu_freq = psutil.cpu_freq()
            if cpu_freq:
                cpu_info.update({
                    "Max Frequency": f"{cpu_freq.max / 1000:.2f} GHz",
                    "Min Frequency": f"{cpu_freq.min / 1000:.2f} GHz",
                    "Current Frequency": f"{cpu_freq.current / 1000:.2f} GHz"
                })
            
            return cpu_info
        except Exception:
            # Fallback to psutil if WMI fails
            return {
                "Processor": platform.processor(),
                "Physical Cores": psutil.cpu_count(logical=False),
                "Total Cores": psutil.cpu_count(logical=True),
                "CPU Usage": f"{psutil.cpu_percent()}%"
            }

    @staticmethod
    def get_memory_info():
        """Get memory information"""
        svmem = psutil.virtual_memory()
        return {
            "Total": get_size(svmem.total),
            "Available": get_size(svmem.available),
            "Used": get_size(svmem.used),
            "Percentage": f"{svmem.percent}%"
        }

    @staticmethod
    def get_gpu_info():
        """Get GPU information"""
        try:
            wmi = get_wmi_object()
            # First try NVIDIA specific path for accurate VRAM info
            try:
                nvidia_wmi = GetObject('winmgmts:root\cimv2').ExecQuery('Select * from Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine')
                if nvidia_wmi:
                    nvidia_memory = sum(int(gpu.DedicatedMemory) for gpu in nvidia_wmi if hasattr(gpu, 'DedicatedMemory'))
            except Exception:
                nvidia_memory = None

            gpus = wmi.ExecQuery('Select * from Win32_VideoController')
            gpu_info = {}
            
            for i, gpu in enumerate(gpus, 1):
                # Try multiple methods to get dedicated video memory
                try:
                    # Method 1: Direct AdapterRAM (works for some cards)
                    dedicated_memory = int(gpu.AdapterRAM)
                    
                    # Method 2: If this is an NVIDIA card and we got NVIDIA specific info
                    if 'NVIDIA' in gpu.Name and nvidia_memory:
                        dedicated_memory = nvidia_memory
                    
                    # Method 3: Try specific video memory properties
                    if dedicated_memory <= 0:
                        for prop in ['AdapterRAM', 'VideoMemoryType', 'VideoRAM']:
                            try:
                                val = int(getattr(gpu, prop, 0))
                                if val > dedicated_memory:
                                    dedicated_memory = val
                            except (AttributeError, TypeError, ValueError):
                                continue
                    
                    dedicated_memory_gb = dedicated_memory / (1024**3)
                except (AttributeError, TypeError):
                    dedicated_memory_gb = None

                # Format memory string
                if dedicated_memory_gb:
                    memory_str = f"{dedicated_memory_gb:.1f} GB" if dedicated_memory_gb > 0 else "Shared"
                else:
                    memory_str = "Unknown"

                gpu_info[f"GPU {i}"] = {
                    "Name": gpu.Name.strip(),
                    "Driver Version": gpu.DriverVersion.strip() if gpu.DriverVersion else "Unknown",
                    "Video Memory": memory_str,
                    "Driver Date": gpu.DriverDate.split('.')[0] if gpu.DriverDate else "Unknown",
                }

                # Add resolution if available
                if hasattr(gpu, 'CurrentHorizontalResolution') and gpu.CurrentHorizontalResolution:
                    gpu_info[f"GPU {i}"]["Current Resolution"] = (
                        f"{gpu.CurrentHorizontalResolution}x{gpu.CurrentVerticalResolution} "
                        f"@ {gpu.CurrentRefreshRate}Hz" if gpu.CurrentRefreshRate else "Unknown Hz"
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
                    if drive.Size:  # Skip drives with no size (CD-ROM, network drives, etc.)
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
                            "Percentage": f"{percent:.1f}%"
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
                    "Percentage": f"{partition_usage.percent}%"
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
            for adapter in wmi.ExecQuery("Select * from Win32_NetworkAdapter where PhysicalAdapter=True"):
                # Get configuration for this adapter
                configs = wmi.ExecQuery(f"Select * from Win32_NetworkAdapterConfiguration where InterfaceIndex={adapter.InterfaceIndex}")
                for config in configs:
                    if config.IPAddress:
                        interfaces[adapter.Name] = {
                            "IP Addresses": config.IPAddress,
                            "MAC Address": config.MACAddress if config.MACAddress else "N/A",
                            "Status": adapter.NetConnectionStatus if adapter.NetConnectionStatus else "Unknown"
                        }
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
        """Get battery information if available"""
        if hasattr(psutil, "sensors_battery"):
            battery = psutil.sensors_battery()
            if battery:
                time_left = ""
                if battery.secsleft != -1:
                    hours = battery.secsleft // 3600
                    minutes = (battery.secsleft % 3600) // 60
                    if hours > 0:
                        time_left = f"{hours}h {minutes}m"
                    else:
                        time_left = f"{minutes}m"

                return {
                    "Battery Percentage": f"{battery.percent}%",
                    "Power Plugged": "Yes" if battery.power_plugged else "No",
                    "Time Left": time_left if time_left else "Calculating..." if battery.power_plugged else "Unknown"
                }
        return None
