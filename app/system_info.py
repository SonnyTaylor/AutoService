import psutil
import platform
from datetime import datetime
import os

# Optional imports for different platforms
try:
    from py3nvml import nvidia_smi

    HAS_NVIDIA = True
except ImportError:
    HAS_NVIDIA = False

# Windows-specific imports
WINDOWS = platform.system() == "Windows"
if WINDOWS:
    try:
        import wmi

        HAS_WMI = True
    except ImportError:
        HAS_WMI = False
else:
    HAS_WMI = False


class SystemInfo:
    def _get_linux_cpu_info(self):
        """Get detailed CPU information on Linux systems"""
        cpu_info = {}
        try:
            with open("/proc/cpuinfo", "r") as f:
                info = {}
                for line in f:
                    if line.strip():
                        if ":" in line:
                            key, value = line.split(":")
                            info[key.strip()] = value.strip()
                    else:
                        if info:
                            # We only need the first processor's info as they're usually identical
                            break

                # Map the information to our structure
                cpu_info.update(
                    {
                        "name": info.get("model name", ""),
                        "vendor": info.get("vendor_id", ""),
                        "family": info.get("cpu family", ""),
                        "model": info.get("model", ""),
                        "stepping": info.get("stepping", ""),
                        "microcode": info.get("microcode", ""),
                        "cache_size": info.get("cache size", ""),
                        "bugs": info.get("bugs", "").split(),
                        "flags": info.get("flags", "").split(),
                        "address_sizes": info.get("address sizes", ""),
                        "bugs_list": info.get("bugs", "").split(),
                    }
                )
        except Exception:
            pass
        return cpu_info

    def _get_cpu_temp_linux(self):
        """Get CPU temperature on Linux systems"""
        try:
            # Try reading from thermal zone
            for i in range(10):  # Check first 10 thermal zones
                thermal_file = f"/sys/class/thermal/thermal_zone{i}/temp"
                if os.path.exists(thermal_file):
                    with open(thermal_file, "r") as f:
                        temp = (
                            float(f.read().strip()) / 1000.0
                        )  # Convert from millidegrees to degrees
                        if temp > 0 and temp < 150:  # Sanity check
                            return temp
            return None
        except Exception:
            return None

    def get_cpu_info(self):
        cpu_info = {
            "physical_cores": psutil.cpu_count(logical=False),
            "total_cores": psutil.cpu_count(logical=True),
            "cpu_usage_per_core": [
                percentage
                for percentage in psutil.cpu_percent(percpu=True, interval=0.1)
            ],
            "total_cpu_usage": psutil.cpu_percent(interval=0.1),
        }

        # Get CPU frequency information safely
        try:
            freq = psutil.cpu_freq(percpu=True)
            if freq:
                cpu_info["cpu_freq"] = {
                    "per_core": [
                        {
                            "current": core.current,
                            "min": core.min if core.min else 0,
                            "max": core.max if core.max else 0,
                        }
                        for core in freq
                    ],
                    "average": {
                        "current": sum(core.current for core in freq) / len(freq),
                        "min": min((core.min for core in freq if core.min), default=0),
                        "max": max((core.max for core in freq if core.max), default=0),
                    },
                }
            else:
                cpu_info["cpu_freq"] = {
                    "per_core": [],
                    "average": {"current": 0, "min": 0, "max": 0},
                }
        except Exception:
            cpu_info["cpu_freq"] = {
                "per_core": [],
                "average": {"current": 0, "min": 0, "max": 0},
            }

        # Get CPU load averages
        try:
            load1, load5, load15 = os.getloadavg()
            cpu_info["load_avg"] = {"1min": load1, "5min": load5, "15min": load15}
        except Exception:
            cpu_info["load_avg"] = {"1min": 0, "5min": 0, "15min": 0}

        # Platform specific information
        if WINDOWS and HAS_WMI:
            try:
                w = wmi.WMI()
                processor = w.Win32_Processor()[0]
                cpu_info.update(
                    {
                        "name": processor.Name,
                        "manufacturer": processor.Manufacturer,
                        "description": processor.Description,
                        "architecture": processor.Architecture,
                        "family": processor.Family,
                        "voltage": processor.CurrentVoltage
                        if hasattr(processor, "CurrentVoltage")
                        else None,
                        "socket": processor.SocketDesignation,
                        "stepping": processor.Stepping,
                        "max_clock_speed": processor.MaxClockSpeed,
                        "virtualization": processor.VirtualizationFirmwareEnabled
                        if hasattr(processor, "VirtualizationFirmwareEnabled")
                        else None,
                        "power_management": processor.PowerManagementSupported,
                        "characteristics": processor.Characteristics
                        if hasattr(processor, "Characteristics")
                        else None,
                        "address_width": processor.AddressWidth,
                        "data_width": processor.DataWidth,
                        "l2_cache_size": processor.L2CacheSize
                        if hasattr(processor, "L2CacheSize")
                        else None,
                        "l3_cache_size": processor.L3CacheSize
                        if hasattr(processor, "L3CacheSize")
                        else None,
                        "temperature": processor.Temperature
                        if hasattr(processor, "Temperature")
                        else None,
                    }
                )
            except Exception:
                pass
        else:
            # Get Linux specific information
            linux_info = self._get_linux_cpu_info()
            cpu_info.update(linux_info)

            # Try to get CPU temperature on Linux
            temp = self._get_cpu_temp_linux()
            if temp is not None:
                cpu_info["temperature"] = temp

            # Get cache sizes on Linux
            try:
                cache_info = {}
                for i in range(4):  # L1i, L1d, L2, L3
                    cache_path = f"/sys/devices/system/cpu/cpu0/cache/index{i}/size"
                    if os.path.exists(cache_path):
                        with open(cache_path, "r") as f:
                            size = f.read().strip()
                            with open(
                                f"/sys/devices/system/cpu/cpu0/cache/index{i}/level",
                                "r",
                            ) as f2:
                                level = f2.read().strip()
                            with open(
                                f"/sys/devices/system/cpu/cpu0/cache/index{i}/type", "r"
                            ) as f3:
                                cache_type = f3.read().strip()
                            cache_info[f"L{level}_{cache_type.lower()}"] = size
                if cache_info:
                    cpu_info["cache_info"] = cache_info
            except Exception:
                pass

        return cpu_info

    def get_memory_info(self):
        memory = psutil.virtual_memory()
        return {
            "total": memory.total,
            "available": memory.available,
            "used": memory.used,
            "percentage": memory.percent,
        }

    def get_disk_info(self):
        partitions = []
        # Get physical disk information on Windows
        if WINDOWS and HAS_WMI:
            try:
                w = wmi.WMI()
                for disk in w.Win32_DiskDrive():
                    physical_info = {
                        "name": disk.Caption,
                        "size": int(disk.Size) if disk.Size else 0,
                        "interface_type": disk.InterfaceType,
                        "media_type": disk.MediaType,
                        "serial": disk.SerialNumber,
                    }
                    partitions.append(
                        {"physical_disk": physical_info, "partitions": []}
                    )
            except Exception:
                pass

        # Get partition information (works on both Windows and Linux)
        for partition in psutil.disk_partitions(all=False):
            try:
                if WINDOWS and ("cdrom" in partition.opts or partition.fstype == ""):
                    # Skip CD-ROM and empty drives on Windows
                    continue

                usage = psutil.disk_usage(partition.mountpoint)
                partition_info = {
                    "device": partition.device,
                    "mountpoint": partition.mountpoint,
                    "filesystem": partition.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percentage": usage.percent,
                }

                if WINDOWS and HAS_WMI:
                    # Try to match partition to physical disk
                    try:
                        w = wmi.WMI()
                        for logical_disk in w.Win32_LogicalDisk():
                            if (
                                logical_disk.DeviceID == partition.device[:2]
                            ):  # Compare drive letters
                                partition_info["volume_name"] = logical_disk.VolumeName
                                break
                    except Exception:
                        pass

                # On Windows, group partitions with their physical disks
                if WINDOWS and partitions and "physical_disk" in partitions[0]:
                    for disk in partitions:
                        disk["partitions"].append(partition_info)
                else:
                    partitions.append(partition_info)

            except Exception:
                continue

        return partitions

    def get_gpu_info(self):
        if not HAS_NVIDIA:
            return {"error": "NVIDIA drivers not found"}

        try:
            nvidia_smi.nvmlInit()
            device_count = nvidia_smi.nvmlDeviceGetCount()
            gpus = []

            for i in range(device_count):
                handle = nvidia_smi.nvmlDeviceGetHandleByIndex(i)
                info = nvidia_smi.nvmlDeviceGetMemoryInfo(handle)
                gpu = {
                    "name": nvidia_smi.nvmlDeviceGetName(handle),
                    "memory_total": info.total,
                    "memory_used": info.used,
                    "memory_free": info.free,
                    "temperature": nvidia_smi.nvmlDeviceGetTemperature(
                        handle, nvidia_smi.NVML_TEMPERATURE_GPU
                    ),
                    "power_usage": nvidia_smi.nvmlDeviceGetPowerUsage(handle)
                    / 1000.0,  # Convert to watts
                }
                gpus.append(gpu)

            nvidia_smi.nvmlShutdown()
            return gpus
        except:
            return {"error": "Failed to get GPU information"}

    def get_network_info(self):
        network_info = {}
        for interface, stats in psutil.net_if_stats().items():
            addrs = psutil.net_if_addrs().get(interface, [])
            addresses = []
            for addr in addrs:
                addresses.append(
                    {
                        "address": addr.address,
                        "netmask": addr.netmask,
                        "family": str(addr.family),
                    }
                )
            network_info[interface] = {
                "isup": stats.isup,
                "speed": stats.speed,
                "mtu": stats.mtu,
                "addresses": addresses,
            }
        return network_info

    def get_os_info(self):
        info = {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "hostname": platform.node(),
        }

        if WINDOWS and HAS_WMI:
            try:
                w = wmi.WMI()
                os_info = w.Win32_OperatingSystem()[0]
                info.update(
                    {
                        "manufacturer": os_info.Manufacturer,
                        "architecture": os_info.OSArchitecture,
                        "install_date": str(os_info.InstallDate)
                        if hasattr(os_info, "InstallDate")
                        else None,
                        "last_boot": str(os_info.LastBootUpTime)
                        if hasattr(os_info, "LastBootUpTime")
                        else None,
                        "registered_user": os_info.RegisteredUser,
                        "serial_number": os_info.SerialNumber,
                        "windows_directory": os_info.WindowsDirectory,
                    }
                )
            except Exception:
                pass
        else:
            # Additional Linux-specific information
            try:
                info["distribution"] = " ".join(platform.linux_distribution())
            except:
                try:
                    # Alternative method for Linux distribution info
                    with open("/etc/os-release", "r") as f:
                        os_release = dict(
                            line.strip().split("=", 1) for line in f if "=" in line
                        )
                    info["distribution"] = os_release.get("PRETTY_NAME", "").strip('"')
                except:
                    info["distribution"] = "Unknown"

        return info

    def get_all_info(self):
        return {
            "timestamp": datetime.now().isoformat(),
            "cpu": self.get_cpu_info(),
            "memory": self.get_memory_info(),
            "disk": self.get_disk_info(),
            "gpu": self.get_gpu_info(),
            "network": self.get_network_info(),
            "os": self.get_os_info(),
        }
