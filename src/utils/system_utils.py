import psutil
import platform
import batteryinfo
import socket
from datetime import datetime, timedelta
import time
from uuid import getnode as get_mac_address


def get_system_info():
    system = platform.system()
    release = platform.release()
    version = platform.version()

    # Fix for Windows 11 detection
    if system == "Windows" and release == "10" and int(version.split(".")[2]) >= 22000:
        release = "11"

    return {
        "Operating System": f"{system} {release}",
        "OS Version": version,
        "Hostname": socket.gethostname(),
        "Machine": platform.machine(),
        "Processor": platform.processor(),
        "MAC Address": ":".join(
            [
                "{:02x}".format((get_mac_address() >> elements) & 0xFF)
                for elements in range(0, 2 * 6, 2)
            ][::-1]
        ),
    }


def get_battery_info():
    try:
        battery = batteryinfo.Battery(
            time_format=batteryinfo.TimeFormat.Human,
            temp_unit=batteryinfo.TempUnit.DegC,
        )

        raw_info = battery.as_dict()

        # Map of internal keys to user-friendly labels
        fields_to_display = {
            "vendor": "Vendor",
            "model": "Model",
            "serial_number": "Serial Number",
            "technology": "Technology",
            "percent": "Battery Level",
            "state": "Power Status",
            "capacity": "Capacity",
            "temperature": "Temperature",
            "cycle_count": "Charge Cycles",
            "energy": "Current Energy",
            "energy_full": "Energy When Full",
            "energy_full_design": "Design Energy",
            "energy_rate": "Energy Rate",
            "voltage": "Voltage",
            "time_to_empty": "Time Until Empty",
            "time_to_full": "Time Until Full",
        }

        formatted_info = {}

        for key, label in fields_to_display.items():
            value = raw_info.get(key)

            if value is None or value == "":
                formatted_info[label] = "N/A"
            elif isinstance(value, tuple):
                val, unit = value
                formatted_info[label] = f"{round(val, 1)} {unit.upper()}"
            else:
                formatted_info[label] = str(value) if str(value).strip() else "N/A"

        return formatted_info

    except Exception as e:
        return {"Status": f"Battery information unavailable: {e}"}


def get_cpu_info():
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_freq = psutil.cpu_freq()
    return {
        "Physical Cores": str(psutil.cpu_count(logical=False)),
        "Total Cores": str(psutil.cpu_count(logical=True)),
        "CPU Usage": f"{cpu_percent}%",
        "CPU Frequency": f"{cpu_freq.current / 1000:.2f} GHz" if cpu_freq else "N/A",
        "CPU Max Frequency": f"{cpu_freq.max / 1000:.2f} GHz" if cpu_freq else "N/A",
    }


def get_memory_info():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "Total Memory": f"{bytes_to_gb(mem.total):.2f} GB",
        "Available Memory": f"{bytes_to_gb(mem.available):.2f} GB",
        "Used Memory": f"{bytes_to_gb(mem.used):.2f} GB ({mem.percent}%)",
        "Total Swap": f"{bytes_to_gb(swap.total):.2f} GB",
        "Used Swap": f"{bytes_to_gb(swap.used):.2f} GB",
    }


def get_disk_info():
    disk_info = {}
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disk_info[f"{part.device} ({part.mountpoint})"] = (
                f"Total: {bytes_to_gb(usage.total):.1f}GB, "
                f"Used: {bytes_to_gb(usage.used):.1f}GB, "
                f"Free: {bytes_to_gb(usage.free):.1f}GB, "
                f"{usage.percent}%"
            )
        except Exception as e:
            disk_info[part.device] = f"Error: {str(e)}"
    return disk_info or {"No disks found": ""}


def get_network_info():
    net_info = {}
    for name, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == 2:  # AF_INET
                net_info[f"{name} (IPv4)"] = addr.address
            elif addr.family == 17:  # AF_PACKET
                net_info[f"{name} (MAC)"] = addr.address
    return net_info


def get_boot_info():
    boot_time = psutil.boot_time()
    return {
        "Boot Time": datetime.fromtimestamp(boot_time).strftime("%Y-%m-%d %H:%M:%S"),
        "Uptime": str(timedelta(seconds=int(time.time() - boot_time))),
    }


def bytes_to_gb(bytes_val):
    return bytes_val / (1024**3)
