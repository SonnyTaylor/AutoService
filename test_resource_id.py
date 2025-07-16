#!/usr/bin/env python3
"""Test different extraction methods"""

import sys
import os

sys.path.append(".")

from icoextract import IconExtractor, IconExtractorError


def test_different_methods():
    """Test different icon extraction methods"""
    exe_path = r"C:\Users\Sonny Taylor\Documents\Code\AutoService\data\programs\CrystalDiskInfo9_7_0Aoi\DiskInfo64A.exe"

    try:
        extractor = IconExtractor(exe_path)
        icons = extractor.list_group_icons()
        print(f"Found {len(icons)} icons")

        # Try first few icons by resource ID
        for i, (resource_id, offset) in enumerate(icons[:10]):
            try:
                print(f"Trying resource ID {resource_id}...")
                icon_data = extractor.get_icon(resource_id=resource_id)
                icon_bytes = icon_data.read()
                print(f"  Success! Size: {len(icon_bytes)} bytes")
                if len(icon_bytes) > 0:
                    print(f"  Found working icon at resource ID {resource_id}")
                    break
            except Exception as e:
                print(f"  Failed: {e}")

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    test_different_methods()
