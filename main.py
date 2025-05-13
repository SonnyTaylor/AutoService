import subprocess
import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
import tkinter as tk
from datetime import datetime, timedelta
import psutil
import socket
import platform
from uuid import getnode as get_mac_address

class ScanScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()
    
    def create_widgets(self):
        # Scan Options Frame
        scan_frame = tb.LabelFrame(
            self,
            text=" Scan Options ",
            bootstyle="primary",
            padding=10
        )
        scan_frame.pack(fill=X, pady=10)
        
        # Scan Buttons
        btn_frame = tb.Frame(scan_frame)
        btn_frame.pack(fill=X, expand=YES, pady=10)
        
        self.quick_scan_btn = tb.Button(
            btn_frame,
            text="Quick Scan",
            bootstyle=SUCCESS,
            command=self.run_quick_scan,
            width=15
        )
        self.quick_scan_btn.pack(side=LEFT, padx=5)
        
        self.full_scan_btn = tb.Button(
            btn_frame,
            text="Full System Scan",
            bootstyle=INFO,
            command=self.run_full_scan,
            width=15
        )
        self.full_scan_btn.pack(side=LEFT, padx=5)
        
        self.custom_scan_btn = tb.Button(
            btn_frame,
            text="Custom Scan",
            bootstyle=WARNING,
            command=self.run_custom_scan,
            width=15
        )
        self.custom_scan_btn.pack(side=LEFT, padx=5)
        
        # Results Frame
        self.results_frame = tb.LabelFrame(
            self,
            text=" Scan Results ",
            bootstyle="secondary",
            padding=10
        )
        self.results_frame.pack(fill=BOTH, expand=YES, pady=10)
        
        # Text widget for results
        self.results_text = tk.Text(
            self.results_frame,
            wrap=WORD,
            height=20,
            bg='#2d2d2d',
            fg='#ffffff',
            insertbackground='white',
            font=('Consolas', 9)
        )
        self.results_text.pack(fill=BOTH, expand=YES)
        
        # Add scrollbar
        scrollbar = tb.Scrollbar(
            self.results_text,
            bootstyle="round",
            command=self.results_text.yview
        )
        scrollbar.pack(side=RIGHT, fill=Y)
        self.results_text.config(yscrollcommand=scrollbar.set)
    
    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.results_text.insert(END, f"[{timestamp}] {message}\n")
        self.results_text.see(END)
        self.update()
    
    def run_quick_scan(self):
        self.log("Starting quick scan...")
        self.status_var.set("Quick scan in progress...")
        self.master.master.update_status("Quick scan in progress...")
        self.after(2000, self.scan_complete, "quick")
    
    def run_full_scan(self):
        self.log("Starting full system scan...")
        self.status_var.set("Full system scan in progress...")
        self.master.master.update_status("Full system scan in progress...")
        self.after(3000, self.scan_complete, "full")
    
    def run_custom_scan(self):
        self.log("Starting custom scan...")
        self.status_var.set("Custom scan in progress...")
        self.master.master.update_status("Custom scan in progress...")
        self.after(2500, self.scan_complete, "custom")
    
    def scan_complete(self, scan_type):
        self.log(f"{scan_type.capitalize()} scan completed successfully!")
        self.status_var.set(f"{scan_type.capitalize()} scan completed")
        self.master.master.update_status(f"{scan_type.capitalize()} scan completed")
        Messagebox.show_info(f"{scan_type.capitalize()} scan completed successfully!", "Scan Complete")


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
            self,
            text=" System Information ",
            bootstyle="info",
            padding=15
        )
        self.sys_info_frame.pack(fill=BOTH, expand=YES, pady=10)
        
        # Create a canvas with scrollbar
        self.canvas = tb.Canvas(self.sys_info_frame, highlightthickness=0)
        scrollbar = tb.Scrollbar(self.sys_info_frame, orient=VERTICAL, command=self.canvas.yview)
        self.scrollable_frame = tb.Frame(self.canvas)
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(
                scrollregion=self.canvas.bbox("all")
            )
        )
        
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        
        self.canvas.pack(side=LEFT, fill=BOTH, expand=True)
        scrollbar.pack(side=RIGHT, fill=Y)
        
        # Bind mouse wheel scrolling
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)
        
        # System Info Labels
        self.info_labels = {}
        info_sections = [
            ("System", self.get_system_info()),
            ("Battery", self.get_battery_info()),  # Add battery section
            ("CPU", self.get_cpu_info()),
            ("Memory", self.get_memory_info()),
            ("Disks", self.get_disk_info()),
            ("Network", self.get_network_info()),
            ("Boot Time", self.get_boot_info())
        ]
        
        for section, items in info_sections:
            section_label = tb.Label(
                self.scrollable_frame,
                text=f"{section}:",
                font=('Segoe UI', 10, 'bold'),
                bootstyle="primary"
            )
            section_label.pack(anchor=W, pady=(10, 5))
            
            for key, value in items.items():
                frame = tb.Frame(self.scrollable_frame)
                frame.pack(fill=X, pady=2)
                
                key_label = tb.Label(
                    frame,
                    text=f"{key}:",
                    width=30,
                    anchor=W,
                    bootstyle="light"
                )
                key_label.pack(side=LEFT)
                
                value_label = tb.Label(
                    frame,
                    text=value,
                    anchor=W,
                    bootstyle="light"
                )
                value_label.pack(side=LEFT, fill=X, expand=True)
                
                self.info_labels[f"{section}_{key}"] = value_label
        
        # Add a refresh button
        refresh_btn = tb.Button(
            self,
            text="Refresh Information",
            command=self.update_system_info,
            bootstyle="info"
        )
        refresh_btn.pack(pady=10)
    
    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(-1 * (event.delta // 120), "units")
    
    def get_system_info(self):
        return {
            "Operating System": f"{platform.system()} {platform.release()}",
            "OS Version": platform.version(),
            "Hostname": socket.gethostname(),
            "Machine": platform.machine(),
            "Processor": platform.processor(),
            "MAC Address": ":".join(["{:02x}".format((get_mac_address() >> elements) & 0xff) 
                                    for elements in range(0,2*6,2)][::-1])
        }
    
    def get_battery_info(self):
        battery_info = {}
        try:
            battery = psutil.sensors_battery()
            if battery:
                battery_info["Power Status"] = "Plugged In" if battery.power_plugged else "On Battery"
                battery_info["Battery Level"] = f"{battery.percent}%"
                battery_info["Time Left"] = str(timedelta(seconds=battery.secsleft)) if battery.secsleft != -1 else "Unknown"
                
                # Try to get more detailed battery info on Windows
                if platform.system() == 'Windows':
                    try:
                        cmd = "powershell \"Get-WmiObject Win32_Battery | Select-Object DeviceID, Name, DesignVoltage, EstimatedChargeRemaining, EstimatedRunTime\""
                        result = subprocess.check_output(cmd, shell=True).decode()
                        for line in result.split('\n'):
                            if ":" in line:
                                key, value = line.split(':', 1)
                                battery_info[key.strip()] = value.strip()
                    except:
                        pass
            else:
                battery_info["Status"] = "No battery detected"
        except:
            battery_info["Status"] = "Battery information unavailable"
        return battery_info
    
    def get_cpu_info(self):
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_freq = psutil.cpu_freq()
        return {
            "Physical Cores": str(psutil.cpu_count(logical=False)),
            "Total Cores": str(psutil.cpu_count(logical=True)),
            "CPU Usage": f"{cpu_percent}%",
            "CPU Frequency": f"{cpu_freq.current:.2f}Mhz" if cpu_freq else "N/A",
            "CPU Max Frequency": f"{cpu_freq.max:.2f}Mhz" if cpu_freq else "N/A"
        }
    
    def get_memory_info(self):
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            "Total Memory": f"{self.bytes_to_gb(mem.total):.2f} GB",
            "Available Memory": f"{self.bytes_to_gb(mem.available):.2f} GB",
            "Used Memory": f"{self.bytes_to_gb(mem.used):.2f} GB ({mem.percent}%)",
            "Total Swap": f"{self.bytes_to_gb(swap.total):.2f} GB",
            "Used Swap": f"{self.bytes_to_gb(swap.used):.2f} GB"
        }
    
    def get_disk_info(self):
        disk_info = {}
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disk_info[f"{part.device} ({part.mountpoint})"] = \
                    f"Total: {self.bytes_to_gb(usage.total):.1f}GB, " \
                    f"Used: {self.bytes_to_gb(usage.used):.1f}GB, " \
                    f"Free: {self.bytes_to_gb(usage.free):.1f}GB, " \
                    f"{usage.percent}%"
            except Exception as e:
                disk_info[part.device] = f"Error: {str(e)}"
        return disk_info or {"No disks found": ""}
    
    def get_network_info(self):
        net_info = {}
        for name, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == 2:  # AF_INET
                    net_info[f"{name} (IPv4)"] = addr.address
                elif addr.family == 17:  # AF_PACKET
                    net_info[f"{name} (MAC)"] = addr.address
        return net_info
    
    def get_boot_info(self):
        boot_time = psutil.boot_time()
        return {
            "Boot Time": datetime.fromtimestamp(boot_time).strftime("%Y-%m-%d %H:%M:%S"),
            "Uptime": str(timedelta(seconds=int(time.time() - boot_time)))
        }
    
    def bytes_to_gb(self, bytes_val):
        return bytes_val / (1024 ** 3)
    
    def update_system_info(self):
        # Update all dynamic information
        for section, items in [
            ("CPU", self.get_cpu_info()),
            ("Battery", self.get_battery_info()),  # Add battery update
            ("Memory", self.get_memory_info()),
            ("Disks", self.get_disk_info()),
            ("Network", self.get_network_info()),
            ("Boot Time", self.get_boot_info())
        ]:
            for key, value in items.items():
                label_key = f"{section}_{key}"
                if label_key in self.info_labels:
                    self.info_labels[label_key].config(text=value)
        
        # Update the window to reflect changes
        self.update_idletasks()


class ToolsScreen(tb.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.master = master
        self.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        self.create_widgets()
    
    def create_widgets(self):
        # Tools Frame
        tools_frame = tb.LabelFrame(
            self,
            text=" System Tools ",
            bootstyle="success",
            padding=15
        )
        tools_frame.pack(fill=BOTH, expand=YES, pady=10)
        
        # Tools Buttons with Windows system programs
        tools = [
            ("Device Manager", "devmgmt.msc"),
            ("Registry Editor", "regedit"),
            ("Command Prompt", "cmd"),
            ("PowerShell", "powershell"),
            ("Control Panel", "control"),
            ("Task Manager", "taskmgr"),
            ("Services", "services.msc"),
            ("System Configuration", "msconfig"),
            ("Disk Management", "diskmgmt.msc"),
            ("Event Viewer", "eventvwr.msc")
        ]
        
        # Create button grid
        btn_frame = tb.Frame(tools_frame)
        btn_frame.pack(expand=YES, pady=10)
        
        # Arrange buttons in a 3x4 grid
        for i, (text, command) in enumerate(tools):
            row = i // 3
            col = i % 3
            btn = tb.Button(
                btn_frame,
                text=text,
                bootstyle=PRIMARY,
                command=lambda cmd=command: self.run_system_tool(cmd),
                width=20
            )
            btn.grid(row=row, column=col, pady=5, padx=5)
    
    def run_system_tool(self, command):
        try:
            subprocess.run(command, shell=True)
        except Exception as e:
            Messagebox.show_error(f"Error launching {command}: {str(e)}", "Error")


class AutoService:
    def __init__(self, root):
        self.root = root
        self.root.title("AutoService v1.0")
        self.root.geometry("1000x800")
        
        # Set theme and style
        self.style = tb.Style("darkly")
        self.style.configure("TButton", font=('Segoe UI', 10))
        
        # Create main container
        self.main_container = tb.Frame(root)
        self.main_container.pack(fill=BOTH, expand=YES)
        
        # Create notebook for tabs
        self.notebook = tb.Notebook(self.main_container, bootstyle="primary")
        self.notebook.pack(fill=BOTH, expand=YES, padx=10, pady=5)
        
        # Create tabs
        self.tab1 = tb.Frame(self.notebook)
        self.tab2 = tb.Frame(self.notebook)
        self.tab3 = tb.Frame(self.notebook)
        
        # Change the order of tabs
        self.notebook.add(self.tab1, text="Scans")
        self.notebook.add(self.tab2, text="System Info")
        self.notebook.add(self.tab3, text="Tools")
        
        # Create screens in new order
        self.scan_screen = ScanScreen(self.tab1)
        self.system_info_screen = SystemInfoScreen(self.tab2)
        self.tools_screen = ToolsScreen(self.tab3)
        
        # Status Bar at the bottom of main window
        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        self.status_bar = tb.Label(
            self.main_container,
            textvariable=self.status_var,
            relief=SUNKEN,
            anchor=W,
            bootstyle="secondary",
            foreground="white"  # Add white text color
        )
        self.status_bar.pack(fill=X, side=BOTTOM, pady=(5, 0))
    
    def update_status(self, message):
        self.status_var.set(message)
        self.root.update()
    
if __name__ == "__main__":
    import time
    root = tb.Window(themename="darkly")
    app = AutoService(root)
    root.mainloop()
