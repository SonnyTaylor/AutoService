#!/usr/bin/env python3
"""Debug icon extraction"""

import sys
import os

sys.path.append(".")

from icoextract import IconExtractor, IconExtractorError


def debug_icon_extraction():
    """Debug icon extraction from CrystalDiskInfo"""
    exe_path = r"C:\Users\Sonny Taylor\Documents\Code\AutoService\data\programs\CrystalDiskInfo9_7_0Aoi\DiskInfo64A.exe"

    print(f"Testing file: {exe_path}")
    print(f"File exists: {os.path.exists(exe_path)}")

    try:
        extractor = IconExtractor(exe_path)
        icons = extractor.list_group_icons()
        print(f"Found {len(icons)} group icons: {icons}")

        if icons:
            icon_data = extractor.get_icon(num=0)
            print(f"Successfully extracted icon! Size: {len(icon_data.read())} bytes")
        else:
            print("No icons found in the executable")

    except IconExtractorError as e:
        print(f"IconExtractorError: {e}")
    except Exception as e:
        print(f"General error: {e}")


if __name__ == "__main__":
    debug_icon_extraction()
