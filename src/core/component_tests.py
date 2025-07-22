import os
import sys
import threading
import time
import subprocess
import platform
from datetime import datetime
import json
import numpy as np
import cv2
import pyaudio
import wave
from PIL import Image, ImageTk
import customtkinter as ctk


class ComponentTestsManager:
    """Handles all business logic for hardware component testing"""

    def __init__(self):
        self.data_folder = self.get_data_folder_path()

        # Audio settings
        self.audio_sample_rate = 44100
        self.audio_chunk = 1024
        self.audio_format = pyaudio.paInt16
        self.audio_channels = 2

        # Test states
        self.is_testing = False
        self.current_test = None

        # Results storage
        self.test_results = {}

    def get_data_folder_path(self):
        """Get the path to the data folder"""
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
        return os.path.join(app_dir, "data")

    # Device Enumeration Methods
    def get_audio_devices(self, device_type=None):
        """Get list of available audio devices

        Args:
            device_type (str): 'input', 'output', or None for all devices

        Returns:
            list or dict: List of devices if device_type specified, dict with both types if None
        """
        devices = {"input": [], "output": []}
        try:
            p = pyaudio.PyAudio()

            for i in range(p.get_device_count()):
                device_info = p.get_device_info_by_index(i)
                device_data = {
                    "index": i,
                    "name": device_info["name"],
                    "max_input_channels": device_info["maxInputChannels"],
                    "max_output_channels": device_info["maxOutputChannels"],
                    "default_sample_rate": device_info["defaultSampleRate"],
                    "api": p.get_host_api_info_by_index(device_info["hostApi"])["name"],
                }

                # Categorize devices
                if device_info["maxInputChannels"] > 0:
                    devices["input"].append(device_data)
                if device_info["maxOutputChannels"] > 0:
                    devices["output"].append(device_data)

            p.terminate()
        except Exception as e:
            print(f"Error getting audio devices: {e}")

        # Return specific device type or all devices
        if device_type == "input":
            return devices["input"]
        elif device_type == "output":
            return devices["output"]
        else:
            return devices

    def get_camera_devices(self):
        """Get list of available camera devices"""
        cameras = []
        for i in range(10):  # Check first 10 camera indices
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret:
                    cameras.append(
                        {
                            "index": i,
                            "name": f"Camera {i}",
                            "resolution": (
                                int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                            ),
                        }
                    )
                cap.release()
        return cameras

    def get_display_devices(self):
        """Get list of available display devices"""
        displays = []
        try:
            if platform.system() == "Windows":
                # Use wmic to get display information on Windows
                result = subprocess.run(
                    ["wmic", "desktopmonitor", "get", "Name,ScreenWidth,ScreenHeight"],
                    capture_output=True,
                    text=True,
                    shell=True,
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split("\n")[1:]  # Skip header
                    for i, line in enumerate(lines):
                        if line.strip():
                            displays.append(
                                {
                                    "index": i,
                                    "name": f"Display {i + 1}",
                                    "info": line.strip(),
                                }
                            )
            else:
                # Default display for non-Windows systems
                displays.append(
                    {"index": 0, "name": "Primary Display", "info": "Default display"}
                )
        except Exception as e:
            print(f"Error getting display devices: {e}")
            # Fallback to primary display
            displays.append(
                {"index": 0, "name": "Primary Display", "info": "Default display"}
            )

        return displays

    def get_data_folder_path(self):
        """Get the path to the data folder"""
        if getattr(sys, "frozen", False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
        return os.path.join(app_dir, "data")

    # Speaker Tests
    def generate_tone(self, frequency, duration, channel="both"):
        """Generate a sine wave tone for speaker testing"""
        frames = int(duration * self.audio_sample_rate)
        t = np.linspace(0, duration, frames, False)

        # Generate sine wave
        wave_data = np.sin(2 * np.pi * frequency * t)

        # Apply amplitude
        wave_data = (wave_data * 32767).astype(np.int16)

        if channel == "both":
            # Stereo - both channels
            stereo_data = np.column_stack((wave_data, wave_data))
        elif channel == "left":
            # Left channel only
            stereo_data = np.column_stack((wave_data, np.zeros_like(wave_data)))
        elif channel == "right":
            # Right channel only
            stereo_data = np.column_stack((np.zeros_like(wave_data), wave_data))

        return stereo_data.flatten().tobytes()

    def play_speaker_test(
        self, frequency=1000, duration=2, channel="both", device_index=None
    ):
        """Play a test tone through speakers"""
        try:
            p = pyaudio.PyAudio()

            # Generate tone data
            tone_data = self.generate_tone(frequency, duration, channel)

            # Open audio stream
            stream = p.open(
                format=self.audio_format,
                channels=self.audio_channels,
                rate=self.audio_sample_rate,
                output=True,
                output_device_index=device_index,
            )

            # Play the tone
            stream.write(tone_data)

            # Cleanup
            stream.stop_stream()
            stream.close()
            p.terminate()

            return True

        except Exception as e:
            print(f"Speaker test error: {e}")
            return False

    # Microphone Tests
    def test_microphone(self, duration=5, callback=None, device_index=None):
        """Test microphone input and return audio level data"""
        try:
            p = pyaudio.PyAudio()

            # Open microphone stream
            stream = p.open(
                format=self.audio_format,
                channels=1,  # Mono for microphone
                rate=self.audio_sample_rate,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=self.audio_chunk,
            )

            audio_data = []
            frames = int(self.audio_sample_rate / self.audio_chunk * duration)

            for i in range(frames):
                if not self.is_testing:
                    break

                data = stream.read(self.audio_chunk)
                audio_data.append(data)

                # Calculate audio level for real-time feedback
                audio_array = np.frombuffer(data, dtype=np.int16)
                if len(audio_array) > 0:
                    # Use RMS calculation with safety check for NaN
                    rms = np.sqrt(np.mean(audio_array.astype(np.float64) ** 2))
                    level = rms if not np.isnan(rms) and not np.isinf(rms) else 0.0
                else:
                    level = 0.0

                if callback:
                    callback(level, i / frames * 100)

            # Cleanup
            stream.stop_stream()
            stream.close()
            p.terminate()

            # Calculate overall statistics
            if audio_data:
                full_audio = b"".join(audio_data)
                audio_array = np.frombuffer(full_audio, dtype=np.int16)
                max_level = np.max(np.abs(audio_array))
                avg_level = np.mean(np.abs(audio_array))

                return {
                    "success": True,
                    "max_level": int(max_level),
                    "avg_level": int(avg_level),
                    "duration": duration,
                    "sample_rate": self.audio_sample_rate,
                }

            return {"success": False, "error": "No audio data captured"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    # Camera Tests
    def start_camera_test(self, camera_index=0):
        """Start camera test and return camera object"""
        try:
            cap = cv2.VideoCapture(camera_index)
            if not cap.isOpened():
                return None

            # Set camera properties
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

            return cap

        except Exception as e:
            print(f"Camera test error: {e}")
            return None

    def capture_camera_frame(self, cap):
        """Capture a frame from the camera"""
        if cap and cap.isOpened():
            ret, frame = cap.read()
            if ret:
                # Convert BGR to RGB for tkinter
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                return frame_rgb
        return None

    # Keyboard Tests
    def get_keyboard_layout(self):
        """Get standard keyboard layout for testing"""
        layout = {
            "row1": [
                "Esc",
                "F1",
                "F2",
                "F3",
                "F4",
                "F5",
                "F6",
                "F7",
                "F8",
                "F9",
                "F10",
                "F11",
                "F12",
            ],
            "row2": [
                "`",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "0",
                "-",
                "=",
                "Backspace",
            ],
            "row3": [
                "Tab",
                "Q",
                "W",
                "E",
                "R",
                "T",
                "Y",
                "U",
                "I",
                "O",
                "P",
                "[",
                "]",
                "\\",
            ],
            "row4": [
                "Caps",
                "A",
                "S",
                "D",
                "F",
                "G",
                "H",
                "J",
                "K",
                "L",
                ";",
                "'",
                "Enter",
            ],
            "row5": [
                "Shift",
                "Z",
                "X",
                "C",
                "V",
                "B",
                "N",
                "M",
                ",",
                ".",
                "/",
                "Shift",
            ],
            "row6": ["Ctrl", "Win", "Alt", "Space", "Alt", "Win", "Menu", "Ctrl"],
        }
        return layout

    # Screen Tests
    def get_test_colors(self):
        """Get list of colors for screen testing"""
        colors = [
            {"name": "Red", "rgb": (255, 0, 0), "hex": "#FF0000"},
            {"name": "Green", "rgb": (0, 255, 0), "hex": "#00FF00"},
            {"name": "Blue", "rgb": (0, 0, 255), "hex": "#0000FF"},
            {"name": "White", "rgb": (255, 255, 255), "hex": "#FFFFFF"},
            {"name": "Black", "rgb": (0, 0, 0), "hex": "#000000"},
            {"name": "Yellow", "rgb": (255, 255, 0), "hex": "#FFFF00"},
            {"name": "Cyan", "rgb": (0, 255, 255), "hex": "#00FFFF"},
            {"name": "Magenta", "rgb": (255, 0, 255), "hex": "#FF00FF"},
            {"name": "Gray", "rgb": (128, 128, 128), "hex": "#808080"},
        ]
        return colors

    def generate_pixel_test_pattern(self, width, height, pattern_type="checkerboard"):
        """Generate test patterns for dead pixel detection"""
        if pattern_type == "checkerboard":
            # Create checkerboard pattern
            pattern = np.zeros((height, width, 3), dtype=np.uint8)
            for i in range(height):
                for j in range(width):
                    if (i + j) % 2 == 0:
                        pattern[i, j] = [255, 255, 255]  # White
                    else:
                        pattern[i, j] = [0, 0, 0]  # Black

        elif pattern_type == "gradient":
            # Create gradient pattern
            pattern = np.zeros((height, width, 3), dtype=np.uint8)
            for i in range(height):
                value = int(255 * i / height)
                pattern[i, :] = [value, value, value]

        elif pattern_type == "lines":
            # Create line pattern
            pattern = np.zeros((height, width, 3), dtype=np.uint8)
            for i in range(0, height, 2):
                pattern[i, :] = [255, 255, 255]

        return pattern

    # USB Port Tests
    def get_usb_devices(self):
        """Get list of connected USB devices"""
        devices = []
        try:
            if platform.system() == "Windows":
                # Use wmic to get USB devices on Windows
                result = subprocess.run(
                    ["wmic", "path", "Win32_USBHub", "get", "DeviceID,Description"],
                    capture_output=True,
                    text=True,
                    shell=True,
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split("\n")[1:]  # Skip header
                    for line in lines:
                        if line.strip():
                            parts = line.strip().split(None, 1)
                            if len(parts) >= 2:
                                devices.append(
                                    {
                                        "device_id": parts[0],
                                        "description": parts[1]
                                        if len(parts) > 1
                                        else "Unknown",
                                    }
                                )
            else:
                # Use lsusb on Linux/Mac
                result = subprocess.run(["lsusb"], capture_output=True, text=True)
                if result.returncode == 0:
                    for line in result.stdout.split("\n"):
                        if line.strip():
                            devices.append({"description": line.strip()})

        except Exception as e:
            print(f"USB detection error: {e}")

        return devices

    # Network Tests
    def test_network_connectivity(self, hosts=None):
        """Test network connectivity to various hosts"""
        if hosts is None:
            hosts = ["8.8.8.8", "1.1.1.1", "google.com", "github.com"]

        results = {}
        for host in hosts:
            try:
                if platform.system() == "Windows":
                    result = subprocess.run(
                        ["ping", "-n", "4", host],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                else:
                    result = subprocess.run(
                        ["ping", "-c", "4", host],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )

                results[host] = {
                    "success": result.returncode == 0,
                    "output": result.stdout
                    if result.returncode == 0
                    else result.stderr,
                }

            except subprocess.TimeoutExpired:
                results[host] = {"success": False, "error": "Timeout"}
            except Exception as e:
                results[host] = {"success": False, "error": str(e)}

        return results

    # Control Methods
    def start_test(self, test_name):
        """Start a specific test"""
        self.is_testing = True
        self.current_test = test_name

    def stop_test(self):
        """Stop the current test"""
        self.is_testing = False
        self.current_test = None
