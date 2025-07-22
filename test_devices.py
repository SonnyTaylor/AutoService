#!/usr/bin/env python3
"""
Test script to verify device enumeration functionality
"""

import sys
import os

# Add the src directory to the path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from core.component_tests import ComponentTestsManager


def test_device_enumeration():
    """Test the device enumeration methods"""
    print("Testing Device Enumeration...")
    print("=" * 50)

    manager = ComponentTestsManager()

    try:
        # Test audio devices
        print("\n1. Testing Audio Device Enumeration:")
        print("-" * 30)

        output_devices = manager.get_audio_devices("output")
        print(f"Found {len(output_devices)} output devices:")
        for i, device in enumerate(output_devices):
            print(
                f"  {i + 1}. {device['name']} (Index: {device['index']}, API: {device['api']})"
            )

        input_devices = manager.get_audio_devices("input")
        print(f"\nFound {len(input_devices)} input devices:")
        for i, device in enumerate(input_devices):
            print(
                f"  {i + 1}. {device['name']} (Index: {device['index']}, API: {device['api']})"
            )

    except Exception as e:
        print(f"Error testing audio devices: {e}")

    try:
        # Test camera devices
        print("\n\n2. Testing Camera Device Enumeration:")
        print("-" * 30)

        cameras = manager.get_camera_devices()
        print(f"Found {len(cameras)} camera devices:")
        for i, camera in enumerate(cameras):
            print(f"  {i + 1}. Camera {camera['index']}")
            if "name" in camera and camera["name"]:
                print(f"      Name: {camera['name']}")
            if "resolution" in camera:
                print(f"      Resolution: {camera['resolution']}")

    except Exception as e:
        print(f"Error testing camera devices: {e}")

    try:
        # Test display devices (Windows only)
        print("\n\n3. Testing Display Device Enumeration:")
        print("-" * 30)

        displays = manager.get_display_devices()
        print(f"Found {len(displays)} display devices:")
        for i, display in enumerate(displays):
            print(f"  {i + 1}. {display['name']}")
            if "resolution" in display:
                print(f"      Resolution: {display['resolution']}")
            if "primary" in display:
                print(f"      Primary: {display['primary']}")

    except Exception as e:
        print(f"Error testing display devices: {e}")

    print("\n" + "=" * 50)
    print("Device enumeration test completed!")


if __name__ == "__main__":
    test_device_enumeration()
