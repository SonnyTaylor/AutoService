import psutil
import platform
import batteryinfo
import socket
import locale
import time
import os
import wmi
from datetime import datetime, timedelta
from uuid import getnode as get_mac_address


def get_system_info():
    system = platform.system()
    release = platform.release()
    version = platform.version()

    # Windows 11 detection
    if system == "Windows" and release == "10" and int(version.split(".")[2]) >= 22000:
        release = "11"

    uname = platform.uname()
    try:
        user = os.getlogin()
    except Exception:
        user = os.environ.get("USERNAME") or "N/A"

    # Uptime in case not elsewhere
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime = datetime.now() - boot_time

    # Get BIOS, Manufacturer, Model using WMI
    bios_version = "N/A"
    system_model = "N/A"
    system_manufacturer = "N/A"
    secure_boot = "N/A"

    try:
        w = wmi.WMI()

        # Get BIOS information
        for bios in w.Win32_BIOS():
            bios_version = bios.SMBIOSBIOSVersion
            break

        # Get System information
        for system_info in w.Win32_ComputerSystem():
            system_manufacturer = system_info.Manufacturer
            system_model = system_info.Model
            break

        # Get Secure Boot status using WMI
        for os_info in w.Win32_OperatingSystem():
            if hasattr(os_info, "SecureBootEnabled"):
                secure_boot = str(os_info.SecureBootEnabled)
            break

    except Exception as e:
        print(f"Error getting WMI information: {e}")

    return {
        "Operating System": f"{system} {release}",
        "OS Version": version,
        "Architecture": uname.machine,
        "Kernel Version": uname.release,
        "Hostname": socket.gethostname(),
        "Username": user,
        "MAC Address": ":".join(
            [
                "{:02x}".format((get_mac_address() >> elements) & 0xFF)
                for elements in range(0, 2 * 6, 2)
            ][::-1]
        ),
        "Processor": platform.processor() or uname.processor,
        "BIOS Version": bios_version,
        "System Manufacturer": system_manufacturer,
        "System Model": system_model,
        "Secure Boot": secure_boot,
        "Boot Time": boot_time.strftime("%Y-%m-%d %H:%M:%S"),
        "Uptime": str(uptime).split(".")[0],
        "Locale": locale.getdefaultlocale()[0] or "N/A",
        "Timezone": time.tzname[0],
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
            "capacity": "Battery Health",
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


def bytes_to_gb(bytes_val):
    return bytes_val / (1024**3)
