import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox, filedialog
import threading
import time
from PIL import Image, ImageTk
import cv2
import numpy as np
import sys
import os

# Add the src directory to the path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.component_tests import ComponentTestsManager


class ComponentTestView:
    def __init__(self, frame):
        self.frame = frame
        self.test_manager = ComponentTestsManager()
        self.current_test = None
        self.test_thread = None
        self.camera_cap = None
        self.camera_thread = None
        self.screen_test_window = None

        # Device selection maps
        self.speaker_device_map = {}
        self.mic_device_map = {}
        self.camera_device_map = {}

        # Keyboard test state
        self.pressed_keys = set()
        self.keyboard_layout = self.test_manager.get_keyboard_layout()

        self.setup_ui()

        # Initialize device lists after UI is set up
        self.frame.after(100, self.refresh_audio_devices)
        self.frame.after(200, self.refresh_cameras)

    def setup_ui(self):
        """Set up the user interface"""
        # Header
        header_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        header_frame.pack(fill="x", padx=10, pady=(10, 0))

        ctk.CTkLabel(
            header_frame,
            text="Hardware Component Tests",
            font=ctk.CTkFont(size=24, weight="bold"),
        ).pack(side="left")

        # Stop All Tests button
        self.stop_all_btn = ctk.CTkButton(
            header_frame,
            text="Stop All Tests",
            command=self.stop_all_tests,
            width=120,
            height=32,
            fg_color="red",
            hover_color="darkred",
        )
        self.stop_all_btn.pack(side="right")

        # Main content frame with tabs
        self.tabview = ctk.CTkTabview(self.frame)
        self.tabview.pack(fill="both", expand=True, padx=10, pady=10)

        # Create tabs
        self.setup_audio_tab()
        self.setup_camera_tab()
        self.setup_keyboard_tab()
        self.setup_screen_tab()
        self.setup_network_tab()

    def setup_audio_tab(self):
        """Setup audio testing tab"""
        audio_tab = self.tabview.add("Audio")

        # Audio device selection
        device_frame = ctk.CTkFrame(audio_tab)
        device_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            device_frame,
            text="Audio Device Selection",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=10)

        # Speaker device selection
        speaker_dev_frame = ctk.CTkFrame(device_frame, fg_color="transparent")
        speaker_dev_frame.pack(fill="x", padx=10, pady=5)

        ctk.CTkLabel(speaker_dev_frame, text="Output Device:").pack(side="left")
        self.speaker_device_combo = ctk.CTkComboBox(
            speaker_dev_frame,
            values=["Loading devices..."],
            state="readonly",
            width=300,
        )
        self.speaker_device_combo.pack(side="left", padx=10)

        # Microphone device selection
        mic_dev_frame = ctk.CTkFrame(device_frame, fg_color="transparent")
        mic_dev_frame.pack(fill="x", padx=10, pady=5)

        ctk.CTkLabel(mic_dev_frame, text="Input Device:").pack(side="left")
        self.mic_device_combo = ctk.CTkComboBox(
            mic_dev_frame, values=["Loading devices..."], state="readonly", width=300
        )
        self.mic_device_combo.pack(side="left", padx=10)

        # Refresh devices button
        refresh_btn = ctk.CTkButton(
            device_frame,
            text="Refresh Devices",
            command=self.refresh_audio_devices,
            width=150,
        )
        refresh_btn.pack(pady=5)

        # Speaker tests
        speaker_frame = ctk.CTkFrame(audio_tab)
        speaker_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            speaker_frame,
            text="Speaker Tests",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=10)

        # Speaker test buttons
        speaker_buttons_frame = ctk.CTkFrame(speaker_frame, fg_color="transparent")
        speaker_buttons_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkButton(
            speaker_buttons_frame,
            text="Test Left Speaker",
            command=lambda: self.test_speaker("left"),
            width=150,
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            speaker_buttons_frame,
            text="Test Right Speaker",
            command=lambda: self.test_speaker("right"),
            width=150,
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            speaker_buttons_frame,
            text="Test Both Speakers",
            command=lambda: self.test_speaker("both"),
            width=150,
        ).pack(side="left", padx=5)

        # Frequency slider
        freq_frame = ctk.CTkFrame(speaker_frame, fg_color="transparent")
        freq_frame.pack(fill="x", padx=10, pady=5)

        ctk.CTkLabel(freq_frame, text="Frequency (Hz):").pack(side="left")
        self.freq_slider = ctk.CTkSlider(
            freq_frame, from_=200, to=8000, number_of_steps=78
        )
        self.freq_slider.set(1000)
        self.freq_slider.pack(side="left", fill="x", expand=True, padx=10)

        self.freq_label = ctk.CTkLabel(freq_frame, text="1000 Hz")
        self.freq_label.pack(side="right")
        self.freq_slider.configure(command=self.update_frequency_label)

        # Microphone tests
        mic_frame = ctk.CTkFrame(audio_tab)
        mic_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            mic_frame, text="Microphone Tests", font=ctk.CTkFont(size=18, weight="bold")
        ).pack(pady=10)

        # Microphone controls
        mic_controls_frame = ctk.CTkFrame(mic_frame, fg_color="transparent")
        mic_controls_frame.pack(fill="x", padx=10, pady=10)

        self.mic_test_btn = ctk.CTkButton(
            mic_controls_frame,
            text="Start Microphone Test",
            command=self.toggle_microphone_test,
            width=200,
        )
        self.mic_test_btn.pack(side="left", padx=5)

        # Microphone level display
        self.mic_level_frame = ctk.CTkFrame(mic_frame)
        self.mic_level_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(self.mic_level_frame, text="Audio Level:").pack(anchor="w")
        self.mic_level_bar = ctk.CTkProgressBar(self.mic_level_frame)
        self.mic_level_bar.pack(fill="x", padx=10, pady=5)
        self.mic_level_bar.set(0)

        self.mic_status_label = ctk.CTkLabel(
            self.mic_level_frame, text="Click 'Start Microphone Test' to begin"
        )
        self.mic_status_label.pack(pady=5)

    def setup_camera_tab(self):
        """Setup camera testing tab"""
        camera_tab = self.tabview.add("Camera")

        # Camera controls
        controls_frame = ctk.CTkFrame(camera_tab)
        controls_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            controls_frame,
            text="Camera Tests",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=10)

        # Camera selection and controls
        camera_controls_frame = ctk.CTkFrame(controls_frame, fg_color="transparent")
        camera_controls_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(camera_controls_frame, text="Camera:").pack(side="left")

        self.camera_var = ctk.StringVar(value="0")
        self.camera_dropdown = ctk.CTkComboBox(
            camera_controls_frame,
            values=["0", "1", "2"],
            variable=self.camera_var,
            width=100,
        )
        self.camera_dropdown.pack(side="left", padx=10)

        self.camera_test_btn = ctk.CTkButton(
            camera_controls_frame,
            text="Start Camera Test",
            command=self.toggle_camera_test,
            width=150,
        )
        self.camera_test_btn.pack(side="left", padx=10)

        self.refresh_cameras_btn = ctk.CTkButton(
            camera_controls_frame,
            text="Refresh Cameras",
            command=self.refresh_cameras,
            width=120,
        )
        self.refresh_cameras_btn.pack(side="left", padx=5)

        # Camera preview
        self.camera_frame = ctk.CTkFrame(camera_tab)
        self.camera_frame.pack(fill="both", expand=True, padx=10, pady=10)

        self.camera_label = ctk.CTkLabel(
            self.camera_frame,
            text="Camera preview will appear here",
            width=640,
            height=480,
        )
        self.camera_label.pack(pady=20)

    def setup_keyboard_tab(self):
        """Setup keyboard testing tab"""
        keyboard_tab = self.tabview.add("Keyboard")

        # Instructions
        instructions_frame = ctk.CTkFrame(keyboard_tab)
        instructions_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            instructions_frame,
            text="Keyboard Test",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=5)

        ctk.CTkLabel(
            instructions_frame,
            text="Click 'Start Keyboard Test' then press keys to test them. Pressed keys will turn green.",
            font=ctk.CTkFont(size=12),
        ).pack(pady=5)

        # Keyboard controls
        controls_frame = ctk.CTkFrame(keyboard_tab, fg_color="transparent")
        controls_frame.pack(fill="x", padx=10, pady=5)

        self.keyboard_test_btn = ctk.CTkButton(
            controls_frame,
            text="Start Keyboard Test",
            command=self.toggle_keyboard_test,
            width=150,
        )
        self.keyboard_test_btn.pack(side="left", padx=5)

        self.clear_keyboard_btn = ctk.CTkButton(
            controls_frame,
            text="Clear All",
            command=self.clear_keyboard_test,
            width=100,
        )
        self.clear_keyboard_btn.pack(side="left", padx=5)

        # Keyboard layout display
        self.keyboard_frame = ctk.CTkScrollableFrame(keyboard_tab)
        self.keyboard_frame.pack(fill="both", expand=True, padx=10, pady=10)

        self.create_keyboard_layout()

    def setup_screen_tab(self):
        """Setup screen testing tab"""
        screen_tab = self.tabview.add("Screen")

        # Screen test controls
        controls_frame = ctk.CTkFrame(screen_tab)
        controls_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            controls_frame,
            text="Screen Tests",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=10)

        # Color tests
        color_frame = ctk.CTkFrame(controls_frame, fg_color="transparent")
        color_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkButton(
            color_frame,
            text="Start Color Test",
            command=self.start_screen_color_test,
            width=150,
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            color_frame,
            text="Dead Pixel Test",
            command=self.start_dead_pixel_test,
            width=150,
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            color_frame,
            text="Gradient Test",
            command=self.start_gradient_test,
            width=150,
        ).pack(side="left", padx=5)

        # Instructions
        instructions_frame = ctk.CTkFrame(screen_tab)
        instructions_frame.pack(fill="both", expand=True, padx=10, pady=10)

        ctk.CTkLabel(
            instructions_frame,
            text="Screen Test Instructions:",
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(anchor="w", padx=10, pady=5)

        instructions_text = """
        • Color Test: Cycles through solid colors (red, green, blue, white, black, etc.)
        • Dead Pixel Test: Shows patterns to help identify stuck or dead pixels
        • Gradient Test: Shows smooth gradients to test color transitions
        
        During tests:
        • Press SPACE to go to next color/pattern
        • Press ESC to exit the test
        • Use fullscreen mode for best results
        """

        ctk.CTkLabel(
            instructions_frame,
            text=instructions_text,
            font=ctk.CTkFont(size=12),
            justify="left",
        ).pack(anchor="w", padx=10, pady=5)

    def setup_network_tab(self):
        """Setup network testing tab"""
        network_tab = self.tabview.add("Network")

        # Network test controls
        controls_frame = ctk.CTkFrame(network_tab)
        controls_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkLabel(
            controls_frame,
            text="Network Tests",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=10)

        # Ping test controls
        ping_frame = ctk.CTkFrame(controls_frame, fg_color="transparent")
        ping_frame.pack(fill="x", padx=10, pady=10)

        ctk.CTkButton(
            ping_frame,
            text="Test Connectivity",
            command=self.test_network_connectivity,
            width=150,
        ).pack(side="left", padx=5)

        # Network results
        self.network_results_frame = ctk.CTkScrollableFrame(network_tab)
        self.network_results_frame.pack(fill="both", expand=True, padx=10, pady=10)

        ctk.CTkLabel(
            self.network_results_frame,
            text="Click 'Test Connectivity' to check network connection",
            font=ctk.CTkFont(size=12),
        ).pack(pady=20)

    # Audio Test Methods
    def update_frequency_label(self, value):
        """Update frequency label"""
        self.freq_label.configure(text=f"{int(value)} Hz")

    def test_speaker(self, channel):
        """Test specific speaker channel"""
        frequency = int(self.freq_slider.get())
        device_index = self.get_selected_speaker_device()

        def run_test():
            success = self.test_manager.play_speaker_test(
                frequency=frequency, channel=channel, device_index=device_index
            )
            if not success:
                messagebox.showerror(
                    "Audio Error", f"Failed to test {channel} speaker(s)"
                )

        threading.Thread(target=run_test, daemon=True).start()

    def toggle_microphone_test(self):
        """Toggle microphone testing"""
        if self.current_test == "microphone":
            self.stop_microphone_test()
        else:
            self.start_microphone_test()

    def start_microphone_test(self):
        """Start microphone testing"""
        self.current_test = "microphone"
        self.test_manager.start_test("microphone")
        self.mic_test_btn.configure(text="Stop Microphone Test", fg_color="red")

        def mic_callback(level, progress):
            # Update UI on main thread
            self.frame.after(0, lambda: self.update_mic_level(level, progress))

        def run_test():
            device_index = self.get_selected_mic_device()
            result = self.test_manager.test_microphone(
                duration=30, callback=mic_callback, device_index=device_index
            )
            self.frame.after(0, lambda: self.microphone_test_finished(result))

        threading.Thread(target=run_test, daemon=True).start()

    def stop_microphone_test(self):
        """Stop microphone testing"""
        self.test_manager.stop_test()
        self.current_test = None
        self.mic_test_btn.configure(text="Start Microphone Test", fg_color="blue")
        self.mic_status_label.configure(text="Test stopped")

    def update_mic_level(self, level, progress):
        """Update microphone level display"""
        # Normalize level to 0-1 range with safety checks
        if np.isnan(level) or np.isinf(level):
            normalized_level = 0.0
        else:
            normalized_level = min(max(float(level) / 32767, 0.0), 1.0)

        # Ensure valid float values
        normalized_level = float(normalized_level)
        progress = float(progress)

        try:
            self.mic_level_bar.set(normalized_level)
            self.mic_status_label.configure(
                text=f"Recording... {progress:.1f}% - Level: {int(normalized_level * 100)}%"
            )
        except Exception as e:
            print(f"Error updating mic level: {e}")

    def microphone_test_finished(self, result):
        """Handle microphone test completion"""
        self.current_test = None
        self.mic_test_btn.configure(text="Start Microphone Test", fg_color="blue")

        if result.get("success"):
            max_level = result.get("max_level", 0)
            avg_level = result.get("avg_level", 0)
            self.mic_status_label.configure(
                text=f"Test completed - Max: {max_level}, Avg: {avg_level}"
            )
        else:
            error = result.get("error", "Unknown error")
            self.mic_status_label.configure(text=f"Test failed: {error}")

    # Camera Test Methods
    def toggle_camera_test(self):
        """Toggle camera testing"""
        if self.current_test == "camera":
            self.stop_camera_test()
        else:
            self.start_camera_test()

    def start_camera_test(self):
        """Start camera testing"""
        camera_index = self.get_selected_camera_device()

        self.camera_cap = self.test_manager.start_camera_test(camera_index)
        if not self.camera_cap:
            messagebox.showerror("Camera Error", "Failed to open camera")
            return

        self.current_test = "camera"
        self.camera_test_btn.configure(text="Stop Camera Test", fg_color="red")

        # Start camera update thread
        self.camera_thread = threading.Thread(
            target=self.update_camera_feed, daemon=True
        )
        self.camera_thread.start()

    def stop_camera_test(self):
        """Stop camera testing"""
        self.current_test = None
        self.camera_test_btn.configure(text="Start Camera Test", fg_color="blue")

        if self.camera_cap:
            self.camera_cap.release()
            self.camera_cap = None

        self.camera_label.configure(image=None, text="Camera preview will appear here")

    def update_camera_feed(self):
        """Update camera feed"""
        while self.current_test == "camera" and self.camera_cap:
            frame = self.test_manager.capture_camera_frame(self.camera_cap)
            if frame is not None:
                # Resize frame for display
                frame_resized = cv2.resize(frame, (640, 480))

                # Convert to PhotoImage
                image = Image.fromarray(frame_resized)
                photo = ImageTk.PhotoImage(image)

                # Update label on main thread
                self.frame.after(
                    0, lambda p=photo: self.camera_label.configure(image=p, text="")
                )
                self.frame.after(
                    0, lambda p=photo: setattr(self.camera_label, "_photo_ref", p)
                )

            time.sleep(0.033)  # ~30 FPS

    # Keyboard Test Methods
    def create_keyboard_layout(self):
        """Create visual keyboard layout"""
        self.key_buttons = {}

        for row_name, keys in self.keyboard_layout.items():
            row_frame = ctk.CTkFrame(self.keyboard_frame, fg_color="transparent")
            row_frame.pack(fill="x", pady=2)

            for key in keys:
                # Determine button width based on key
                if key in ["Backspace", "Tab", "Enter", "Shift", "Space"]:
                    width = 80 if key != "Space" else 200
                else:
                    width = 40

                btn = ctk.CTkButton(
                    row_frame,
                    text=key,
                    width=width,
                    height=30,
                    fg_color="gray",
                    command=lambda k=key: self.mark_key_pressed(k),
                )
                btn.pack(side="left", padx=1)

                # Store button with original key and also lowercase version for easier matching
                self.key_buttons[key] = btn
                self.key_buttons[key.lower()] = btn

    def toggle_keyboard_test(self):
        """Toggle keyboard testing"""
        if self.current_test == "keyboard":
            self.stop_keyboard_test()
        else:
            self.start_keyboard_test()

    def start_keyboard_test(self):
        """Start keyboard testing"""
        self.current_test = "keyboard"
        self.keyboard_test_btn.configure(text="Stop Keyboard Test", fg_color="red")

        # Bind key events to the main window instead of frame
        # Get the root window
        root = self.frame.winfo_toplevel()
        root.focus_set()
        root.bind("<KeyPress>", self.on_key_press)
        root.bind("<KeyRelease>", self.on_key_release)

        # Store reference to root for cleanup
        self._root_window = root

    def stop_keyboard_test(self):
        """Stop keyboard testing"""
        self.current_test = None
        self.keyboard_test_btn.configure(text="Start Keyboard Test", fg_color="blue")

        # Unbind key events from root window
        if hasattr(self, "_root_window") and self._root_window:
            try:
                self._root_window.unbind("<KeyPress>")
                self._root_window.unbind("<KeyRelease>")
            except Exception:
                pass  # Window might be destroyed
            self._root_window = None

    def on_key_press(self, event):
        """Handle key press"""
        if self.current_test != "keyboard":
            return

        # Get the key symbol and normalize it
        key = event.keysym

        # Create a mapping for special keys and common variations
        key_mapping = {
            # Special keys
            "Escape": "Esc",
            "BackSpace": "Backspace",
            "Return": "Enter",
            "Caps_Lock": "Caps",
            "Shift_L": "Shift",
            "Shift_R": "Shift",
            "Control_L": "Ctrl",
            "Control_R": "Ctrl",
            "Alt_L": "Alt",
            "Alt_R": "Alt",
            "Super_L": "Win",
            "Super_R": "Win",
            "Menu": "Menu",
            "space": "Space",
            # Function keys
            "F1": "F1",
            "F2": "F2",
            "F3": "F3",
            "F4": "F4",
            "F5": "F5",
            "F6": "F6",
            "F7": "F7",
            "F8": "F8",
            "F9": "F9",
            "F10": "F10",
            "F11": "F11",
            "F12": "F12",
            # Special characters
            "grave": "`",
            "minus": "-",
            "equal": "=",
            "bracketleft": "[",
            "bracketright": "]",
            "backslash": "\\",
            "semicolon": ";",
            "apostrophe": "'",
            "comma": ",",
            "period": ".",
            "slash": "/",
        }

        # Apply mapping or use the key as-is (converted to uppercase for letters)
        mapped_key = key_mapping.get(key, key.upper() if key.isalpha() else key)

        print(f"Key pressed: {key} -> mapped to: {mapped_key}")  # Debug print
        self.mark_key_pressed(mapped_key)

    def on_key_release(self, event):
        """Handle key release"""
        pass  # We don't need to do anything on release for this test

    def mark_key_pressed(self, key):
        """Mark a key as pressed"""
        self.pressed_keys.add(key)

        # Try to find the button with exact match first
        button = None
        if key in self.key_buttons:
            button = self.key_buttons[key]
        else:
            # Try case-insensitive search
            for btn_key, btn in self.key_buttons.items():
                if btn_key.lower() == key.lower():
                    button = btn
                    break

        if button:
            button.configure(fg_color="green")
            print(f"Marked key as pressed: {key}")  # Debug print
        else:
            print(f"No button found for key: {key}")  # Debug print
            print(f"Available buttons: {list(self.key_buttons.keys())}")  # Debug print

    def clear_keyboard_test(self):
        """Clear all pressed keys"""
        self.pressed_keys.clear()
        for btn in self.key_buttons.values():
            btn.configure(fg_color="gray")

    # Screen Test Methods
    def start_screen_color_test(self):
        """Start screen color test"""
        self.create_screen_test_window("color")

    def start_dead_pixel_test(self):
        """Start dead pixel test"""
        self.create_screen_test_window("dead_pixel")

    def start_gradient_test(self):
        """Start gradient test"""
        self.create_screen_test_window("gradient")

    def create_screen_test_window(self, test_type):
        """Create fullscreen window for screen tests"""
        if self.screen_test_window:
            self.screen_test_window.destroy()

        self.screen_test_window = tk.Toplevel()
        self.screen_test_window.title(f"Screen Test - {test_type.title()}")
        self.screen_test_window.attributes("-fullscreen", True)
        self.screen_test_window.configure(bg="black")

        # Create canvas for drawing
        canvas = tk.Canvas(self.screen_test_window, highlightthickness=0, bg="black")
        canvas.pack(fill="both", expand=True)

        # Instructions label
        instructions = tk.Label(
            self.screen_test_window,
            text="Press SPACE for next, ESC to exit",
            bg="black",
            fg="white",
            font=("Arial", 12),
        )
        instructions.place(x=10, y=10)

        # Start the test
        if test_type == "color":
            self.run_color_test(canvas)
        elif test_type == "dead_pixel":
            self.run_dead_pixel_test(canvas)
        elif test_type == "gradient":
            self.run_gradient_test(canvas)

        # Bind keys
        self.screen_test_window.bind(
            "<KeyPress-Escape>", lambda e: self.close_screen_test()
        )
        self.screen_test_window.bind(
            "<KeyPress-space>", lambda e: self.next_screen_test()
        )
        self.screen_test_window.focus_set()

    def run_color_test(self, canvas):
        """Run color cycling test"""
        colors = self.test_manager.get_test_colors()
        self.current_color_index = 0
        self.test_canvas = canvas
        self.test_colors = colors

        self.show_next_color()

    def show_next_color(self):
        """Show next color in sequence"""
        if not self.screen_test_window:
            return

        if self.current_color_index < len(self.test_colors):
            color = self.test_colors[self.current_color_index]
            self.test_canvas.configure(bg=color["hex"])

            # Update instructions
            for widget in self.screen_test_window.winfo_children():
                if isinstance(widget, tk.Label):
                    widget.configure(
                        text=f"Color: {color['name']} - Press SPACE for next, ESC to exit"
                    )

            self.current_color_index += 1
        else:
            self.close_screen_test()

    def run_dead_pixel_test(self, canvas):
        """Run dead pixel test"""
        # Implementation for dead pixel patterns
        self.test_canvas = canvas
        self.dead_pixel_patterns = [
            "white",
            "black",
            "red",
            "green",
            "blue",
            "checkerboard",
        ]
        self.current_pattern_index = 0

        self.show_next_dead_pixel_pattern()

    def show_next_dead_pixel_pattern(self):
        """Show next dead pixel test pattern"""
        if not self.screen_test_window:
            return

        if self.current_pattern_index < len(self.dead_pixel_patterns):
            pattern = self.dead_pixel_patterns[self.current_pattern_index]

            if pattern in ["white", "black", "red", "green", "blue"]:
                color_map = {
                    "white": "#FFFFFF",
                    "black": "#000000",
                    "red": "#FF0000",
                    "green": "#00FF00",
                    "blue": "#0000FF",
                }
                self.test_canvas.configure(bg=color_map[pattern])
            elif pattern == "checkerboard":
                self.draw_checkerboard_pattern()

            # Update instructions
            for widget in self.screen_test_window.winfo_children():
                if isinstance(widget, tk.Label):
                    widget.configure(
                        text=f"Pattern: {pattern.title()} - Press SPACE for next, ESC to exit"
                    )

            self.current_pattern_index += 1
        else:
            self.close_screen_test()

    def draw_checkerboard_pattern(self):
        """Draw checkerboard pattern for dead pixel detection"""
        self.test_canvas.delete("all")
        width = self.screen_test_window.winfo_screenwidth()
        height = self.screen_test_window.winfo_screenheight()

        square_size = 20
        for y in range(0, height, square_size):
            for x in range(0, width, square_size):
                color = (
                    "white"
                    if (x // square_size + y // square_size) % 2 == 0
                    else "black"
                )
                self.test_canvas.create_rectangle(
                    x, y, x + square_size, y + square_size, fill=color, outline=""
                )

    def run_gradient_test(self, canvas):
        """Run gradient test"""
        self.test_canvas = canvas
        self.gradient_types = ["horizontal", "vertical", "radial"]
        self.current_gradient_index = 0

        self.show_next_gradient()

    def show_next_gradient(self):
        """Show next gradient pattern"""
        if not self.screen_test_window:
            return

        if self.current_gradient_index < len(self.gradient_types):
            gradient_type = self.gradient_types[self.current_gradient_index]
            self.draw_gradient(gradient_type)

            # Update instructions
            for widget in self.screen_test_window.winfo_children():
                if isinstance(widget, tk.Label):
                    widget.configure(
                        text=f"Gradient: {gradient_type.title()} - Press SPACE for next, ESC to exit"
                    )

            self.current_gradient_index += 1
        else:
            self.close_screen_test()

    def draw_gradient(self, gradient_type):
        """Draw gradient pattern"""
        self.test_canvas.delete("all")
        width = self.screen_test_window.winfo_screenwidth()
        height = self.screen_test_window.winfo_screenheight()

        if gradient_type == "horizontal":
            for x in range(width):
                gray_value = int(255 * x / width)
                color = f"#{gray_value:02x}{gray_value:02x}{gray_value:02x}"
                self.test_canvas.create_line(x, 0, x, height, fill=color)
        elif gradient_type == "vertical":
            for y in range(height):
                gray_value = int(255 * y / height)
                color = f"#{gray_value:02x}{gray_value:02x}{gray_value:02x}"
                self.test_canvas.create_line(0, y, width, y, fill=color)

    def next_screen_test(self):
        """Go to next screen test"""
        if hasattr(self, "show_next_color"):
            self.show_next_color()
        elif hasattr(self, "show_next_dead_pixel_pattern"):
            self.show_next_dead_pixel_pattern()
        elif hasattr(self, "show_next_gradient"):
            self.show_next_gradient()

    def close_screen_test(self):
        """Close screen test window"""
        if self.screen_test_window:
            self.screen_test_window.destroy()
            self.screen_test_window = None

    # Network Test Methods
    def test_network_connectivity(self):
        """Test network connectivity"""
        # Clear previous results
        for widget in self.network_results_frame.winfo_children():
            widget.destroy()

        ctk.CTkLabel(
            self.network_results_frame,
            text="Testing network connectivity...",
            font=ctk.CTkFont(size=12),
        ).pack(pady=10)

        def run_test():
            results = self.test_manager.test_network_connectivity()
            self.frame.after(0, lambda: self.display_network_results(results))

        threading.Thread(target=run_test, daemon=True).start()

    def display_network_results(self, results):
        """Display network test results"""
        # Clear loading message
        for widget in self.network_results_frame.winfo_children():
            widget.destroy()

        for host, result in results.items():
            result_frame = ctk.CTkFrame(self.network_results_frame)
            result_frame.pack(fill="x", padx=5, pady=5)

            status_color = "green" if result["success"] else "red"
            status_text = "✓ Connected" if result["success"] else "✗ Failed"

            ctk.CTkLabel(
                result_frame,
                text=f"{host}: {status_text}",
                text_color=status_color,
                font=ctk.CTkFont(weight="bold"),
            ).pack(anchor="w", padx=10, pady=5)

            if "error" in result:
                ctk.CTkLabel(
                    result_frame,
                    text=f"Error: {result['error']}",
                    text_color="red",
                    font=ctk.CTkFont(size=10),
                ).pack(anchor="w", padx=20)

    # Control Methods
    def stop_all_tests(self):
        """Stop all running tests"""
        self.test_manager.stop_test()
        self.current_test = None

        # Stop specific tests
        if hasattr(self, "camera_cap") and self.camera_cap:
            self.camera_cap.release()
            self.camera_cap = None

        if self.screen_test_window:
            self.screen_test_window.destroy()
            self.screen_test_window = None

        # Stop keyboard test if running
        if hasattr(self, "_root_window") and self._root_window:
            try:
                self._root_window.unbind("<KeyPress>")
                self._root_window.unbind("<KeyRelease>")
            except Exception:
                pass
            self._root_window = None

        # Reset button states
        self.mic_test_btn.configure(text="Start Microphone Test", fg_color="blue")
        self.camera_test_btn.configure(text="Start Camera Test", fg_color="blue")
        self.keyboard_test_btn.configure(text="Start Keyboard Test", fg_color="blue")

        messagebox.showinfo("Tests Stopped", "All tests have been stopped.")

    # Device Management Methods
    def refresh_audio_devices(self):
        """Refresh audio device lists"""
        try:
            # Get audio devices
            output_devices = self.test_manager.get_audio_devices("output")
            input_devices = self.test_manager.get_audio_devices("input")

            # Update speaker device dropdown
            speaker_values = []
            self.speaker_device_map = {}
            for i, device in enumerate(output_devices):
                device_name = f"{device['name']} ({device['api']})"
                speaker_values.append(device_name)
                self.speaker_device_map[device_name] = device["index"]

            if speaker_values:
                self.speaker_device_combo.configure(values=speaker_values)
                self.speaker_device_combo.set(speaker_values[0])
            else:
                self.speaker_device_combo.configure(values=["No output devices found"])
                self.speaker_device_combo.set("No output devices found")

            # Update microphone device dropdown
            mic_values = []
            self.mic_device_map = {}
            for i, device in enumerate(input_devices):
                device_name = f"{device['name']} ({device['api']})"
                mic_values.append(device_name)
                self.mic_device_map[device_name] = device["index"]

            if mic_values:
                self.mic_device_combo.configure(values=mic_values)
                self.mic_device_combo.set(mic_values[0])
            else:
                self.mic_device_combo.configure(values=["No input devices found"])
                self.mic_device_combo.set("No input devices found")

        except Exception as e:
            messagebox.showerror("Error", f"Failed to refresh audio devices: {e}")

    def refresh_cameras(self):
        """Refresh available cameras"""
        try:
            cameras = self.test_manager.get_camera_devices()
            if cameras:
                camera_values = []
                self.camera_device_map = {}
                for camera in cameras:
                    camera_name = f"Camera {camera['index']}"
                    if "name" in camera and camera["name"]:
                        camera_name += f" ({camera['name']})"
                    if "resolution" in camera:
                        camera_name += f" - {camera['resolution']}"
                    camera_values.append(camera_name)
                    self.camera_device_map[camera_name] = camera["index"]

                self.camera_dropdown.configure(values=camera_values)
                if camera_values:
                    self.camera_dropdown.set(camera_values[0])
                    self.camera_var.set(str(cameras[0]["index"]))
            else:
                self.camera_dropdown.configure(values=["No cameras found"])
                self.camera_dropdown.set("No cameras found")
                self.camera_var.set("0")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to refresh cameras: {e}")

    def get_selected_speaker_device(self):
        """Get the currently selected speaker device index"""
        try:
            selected = self.speaker_device_combo.get()
            return self.speaker_device_map.get(selected, None)
        except:
            return None

    def get_selected_mic_device(self):
        """Get the currently selected microphone device index"""
        try:
            selected = self.mic_device_combo.get()
            return self.mic_device_map.get(selected, None)
        except:
            return None

    def get_selected_camera_device(self):
        """Get the currently selected camera device index"""
        try:
            selected = self.camera_dropdown.get()
            return self.camera_device_map.get(selected, int(self.camera_var.get()))
        except:
            return 0


def init_view(frame):
    """Initialize the Component Test view"""
    ComponentTestView(frame)
