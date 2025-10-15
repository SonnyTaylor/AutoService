#!/usr/bin/env python3
"""Simple test script for battery health service."""

import sys
import os

sys.path.append(os.path.dirname(__file__))

from services.battery_service import run_battery_health_report


def main():
    task = {"type": "battery_health_report"}
    result = run_battery_health_report(task)

    import json

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
