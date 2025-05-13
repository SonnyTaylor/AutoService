import psutil
import platform
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
    battery_info = {}
    try:
        battery = psutil.sensors_battery()
        if battery:
            is_plugged = battery.power_plugged
            battery_info["Power Status"] = "Plugged In" if is_plugged else "On Battery"
            battery_info["Battery Level"] = f"{battery.percent}%"
            battery_info["Time Left"] = (
                str(timedelta(seconds=battery.secsleft))
                if battery.secsleft != -1
                else "Unknown"
            )

            if platform.system() == "Windows":
                try:
                    import subprocess

                    cmd = 'powershell "Get-WmiObject Win32_Battery | Select-Object DeviceID, Name, DesignVoltage, EstimatedChargeRemaining, EstimatedRunTime"'
                    result = subprocess.check_output(cmd, shell=True).decode()
                    for line in result.split("\n"):
                        if ":" in line:
                            key, value = line.split(":", 1)
                            key = "".join(
                                [" " + c if c.isupper() else c for c in key.strip()]
                            ).strip()
                            value = value.strip()

                            if "Estimated Run Time" in key:
                                if is_plugged:
                                    value = "Indefinite (AC Power)"
                                elif value.isdigit():
                                    try:
                                        seconds = int(value)
                                        value = str(timedelta(seconds=seconds))
                                    except ValueError:
                                        pass

                            battery_info[key] = value
                except:
                    pass
        else:
            battery_info["Status"] = "No battery detected"
    except:
        battery_info["Status"] = "Battery information unavailable"
    return battery_info


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
