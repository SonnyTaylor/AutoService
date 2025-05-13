import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
import tkinter as tk
from datetime import datetime
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.style import Bootstyle

class ServiceCard(tb.Frame):
    def __init__(self, master, title, description, features, duration, command):
        super().__init__(master)
        
        # Create a bordered frame
        self.card_frame = tb.LabelFrame(
            self,
            text=title,
            bootstyle="primary",
            padding=15
        )
        self.card_frame.pack(fill=BOTH, expand=YES)
        
        # Description
        desc = tb.Label(
            self.card_frame,
            text=description,
            wraplength=250,  # Fixed width for consistency
            justify=CENTER,
            font=("Segoe UI", 10)
        )
        desc.pack(fill=X, pady=(0, 15))
        
        # Features frame
        features_frame = tb.Frame(self.card_frame)
        features_frame.pack(fill=X, pady=(0, 15))
        
        for feature in features:
            feature_item = tb.Label(
                features_frame,
                text=f"• {feature}",
                justify=LEFT,
                font=("Segoe UI", 9),
                wraplength=230  # Slightly less than card width
            )
            feature_item.pack(fill=X, pady=2)
        
        # Duration
        duration_frame = tb.Frame(self.card_frame)
        duration_frame.pack(fill=X, pady=(0, 15))
        
        duration_icon = tb.Label(
            duration_frame,
            text="⏱",
            font=("Segoe UI", 12)
        )
        duration_icon.pack(side=LEFT)
        
        duration_text = tb.Label(
            duration_frame,
            text=f"Estimated duration: {duration}",
            font=("Segoe UI", 9, "italic")
        )
        duration_text.pack(side=LEFT, padx=5)
        
        # Start button
        start_btn = tb.Button(
            self.card_frame,
            text="Start Service",
            command=command,
            bootstyle="primary-outline",
            width=20,
            padding=10
        )
        start_btn.pack(pady=(0, 5))

class ScanScreen(tb.Frame):
    def __init__(self, master, app):
        super().__init__(master)
        self.master = master
        self.app = app
        self.pack(fill=BOTH, expand=YES, padx=20, pady=10)
        self.current_frame = None
        self.show_service_selection()
    
    def show_service_selection(self):
        if self.current_frame:
            self.current_frame.destroy()
        
        self.current_frame = ServiceSelection(self, self)
        self.current_frame.pack(fill=BOTH, expand=YES)
    
    def show_scan_screen(self, service_type):
        if self.current_frame:
            self.current_frame.destroy()
        
        self.current_frame = ActiveScanScreen(self, service_type, self)
        self.current_frame.pack(fill=BOTH, expand=YES)

class ServiceSelection(tb.Frame):
    def __init__(self, master, controller):
        super().__init__(master)
        self.controller = controller
        self.create_widgets()
    
    def create_widgets(self):
        # Header
        header_frame = tb.Frame(self)
        header_frame.pack(fill=X, pady=(0, 20))
        
        title = tb.Label(
            header_frame,
            text="Select a Service",
            font=("Segoe UI", 24, "bold"),
            bootstyle="primary"
        )
        title.pack(side=TOP, pady=(0, 20))
        
        # Main container frame with border
        main_frame = tb.LabelFrame(
            self,
            text=" Available Services ",
            bootstyle="primary",
            padding=20
        )
        main_frame.pack(fill=BOTH, expand=YES)
        
        # Services grid with center alignment
        services_frame = tb.Frame(main_frame)
        services_frame.pack(expand=YES)
        
        # General Service Card
        general_card = ServiceCard(
            services_frame,
            "General Service",
            "Quick system maintenance and security check",
            [
                "Quick malware scan",
                "Temporary files cleanup",
                "Basic system optimization",
                "Startup programs check"
            ],
            "15-20 minutes",
            lambda: self.controller.show_scan_screen("general")
        )
        general_card.grid(row=0, column=0, padx=15, pady=10, sticky=NSEW)
        
        # Complete Service Card
        complete_card = ServiceCard(
            services_frame,
            "Complete Service",
            "Comprehensive system analysis and optimization",
            [
                "Full malware and rootkit scan",
                "Advanced system cleanup",
                "Registry optimization",
                "Disk health check",
                "System performance analysis"
            ],
            "45-60 minutes",
            lambda: self.controller.show_scan_screen("complete")
        )
        complete_card.grid(row=0, column=1, padx=15, pady=10, sticky=NSEW)
        
        # Custom Service Card
        custom_card = ServiceCard(
            services_frame,
            "Custom Service",
            "Tailored scanning and optimization options",
            [
                "Select specific tools to run",
                "Choose scan locations",
                "Custom optimization settings",
                "Advanced configuration options"
            ],
            "Varies based on selection",
            lambda: self.controller.show_scan_screen("custom")
        )
        custom_card.grid(row=0, column=2, padx=15, pady=10, sticky=NSEW)
        
        # Configure grid weights for equal spacing
        services_frame.grid_columnconfigure(0, weight=1, uniform="column")
        services_frame.grid_columnconfigure(1, weight=1, uniform="column")
        services_frame.grid_columnconfigure(2, weight=1, uniform="column")
        services_frame.grid_rowconfigure(0, weight=1)

class ActiveScanScreen(tb.Frame):
    def __init__(self, master, service_type, controller):
        super().__init__(master)
        self.service_type = service_type
        self.controller = controller
        self.progress = tk.DoubleVar(value=0)
        self.status_var = tk.StringVar(value="Ready to start")
        self.scan_running = False
        self.create_widgets()
    
    def create_widgets(self):
        # Header with back button
        header_frame = tb.Frame(self)
        header_frame.pack(fill=X, pady=(0, 20))
        
        back_btn = tb.Button(
            header_frame,
            text="← Back",
            command=self.controller.show_service_selection,
            bootstyle="secondary-outline",
            padding=5
        )
        back_btn.pack(side=LEFT)
        
        title = tb.Label(
            header_frame,
            text=f"{self.service_type.title()} Service Scan",
            font=("Segoe UI", 20, "bold"),
            bootstyle="primary"
        )
        title.pack(side=LEFT, padx=20)

        # Service details frame
        details_frame = tb.LabelFrame(
            self,
            text="Scan Details",
            padding=15,
            bootstyle="info"
        )
        details_frame.pack(fill=X, pady=(0, 15))

        # Add appropriate details based on service type
        details_text = self.get_service_details()
        details_label = tb.Label(
            details_frame,
            text=details_text,
            justify=LEFT,
            wraplength=600,
            font=("Segoe UI", 10)
        )
        details_label.pack(fill=X)
        
        # Control frame for start/stop buttons
        control_frame = tb.Frame(self)
        control_frame.pack(fill=X, pady=(0, 15))
        
        self.start_btn = tb.Button(
            control_frame,
            text="Start Scan",
            command=self.start_scan,
            bootstyle="success-outline",
            width=20,
            padding=10
        )
        self.start_btn.pack(side=LEFT, padx=5)
        
        # Status label
        status_label = tb.Label(
            control_frame,
            textvariable=self.status_var,
            font=("Segoe UI", 12),
            bootstyle="info"
        )
        status_label.pack(side=LEFT, padx=20)
        
        # Progress frame
        progress_frame = tb.Frame(self)
        progress_frame.pack(fill=X, pady=10)
        
        self.progress_bar = tb.Progressbar(
            progress_frame,
            variable=self.progress,
            bootstyle="success-striped",
            length=300,
            mode="determinate"
        )
        self.progress_bar.pack(fill=X)
        
        # Results area
        results_frame = tb.LabelFrame(
            self,
            text="Scan Results",
            padding=15,
            bootstyle="secondary"
        )
        results_frame.pack(fill=BOTH, expand=YES, pady=10)
        
        self.results_text = ScrolledText(
            results_frame,
            padding=10,
            height=20,
            wrap=WORD,
            autohide=True,
            font=("Consolas", 9)
        )
        self.results_text.pack(fill=BOTH, expand=YES)

    def get_service_details(self):
        if self.service_type == "general":
            return """This quick scan will perform the following tasks:
• Quick malware scan of critical system areas
• Cleanup of temporary files and system cache
• Basic system optimization
• Check and optimize startup programs

Estimated duration: 15-20 minutes"""
        elif self.service_type == "complete":
            return """This comprehensive scan will perform the following tasks:
• Full system malware and rootkit scan
• Advanced system cleanup and optimization
• Complete registry analysis and optimization
• Disk health check and optimization
• Detailed system performance analysis
• Security vulnerability assessment

Estimated duration: 45-60 minutes"""
        else:  # custom
            return """This custom scan allows you to select from the following options:
• Choose specific areas to scan
• Select cleanup and optimization tools
• Configure scan intensity and depth
• Set custom optimization parameters
• Define specific file types to analyze

Duration varies based on selected options"""
    
    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.results_text.insert(END, f"[{timestamp}] {message}\n")
        self.results_text.see(END)
        self.update()
    
    def start_scan(self):
        if not self.scan_running:
            self.scan_running = True
            self.start_btn.configure(
                text="Stop Scan",
                bootstyle="danger-outline"
            )
            self.log(f"Starting {self.service_type} service scan...")
            self.status_var.set("Scan in progress...")
            self.simulate_progress()
        else:
            self.scan_running = False
            self.start_btn.configure(
                text="Start Scan",
                bootstyle="success-outline"
            )
            self.status_var.set("Scan stopped")
            self.log("Scan stopped by user")
    
    def simulate_progress(self):
        if not self.scan_running:
            return
            
        current = self.progress.get()
        if current < 100:
            increment = 2 if self.service_type == "general" else 1
            self.progress.set(current + increment)
            
            if current % 10 == 0:
                self.log(f"Processing... {int(current)}% complete")
            
            delay = 100 if self.service_type == "general" else 200
            self.after(delay, self.simulate_progress)
        else:
            self.scan_running = False
            self.start_btn.configure(
                text="Start Scan",
                bootstyle="success-outline"
            )
            self.status_var.set("Scan Complete")
            self.log("Service completed successfully!")
            Messagebox.show_info(
                "Service Completed",
                "The selected service has been completed successfully!",
                parent=self
            )
