"""Ping test service.

Runs a ping command to test network connectivity to a specified host.
Parses the output to determine success and latency information.
"""

import subprocess
import re
import logging
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)


def parse_ping_output(output: str) -> Dict[str, Any]:
    """Parse the output from ping command into structured data.

    Extracts packet loss, average latency, and success status.
    Handles both Linux and Windows ping output formats.
    """
    packet_loss = None
    avg_latency = None
    success = False
    message_lines = []

    for line in output.splitlines():
        l = line.strip()
        if not l:
            continue
        message_lines.append(l)
        low = l.lower()

        # Check for packet loss - handles both formats
        # Linux: "4 packets transmitted, 4 received, 0% packet loss"
        # Windows: "Lost = 0 (0% loss)"
        loss_match = re.search(r"(\d+)% packet loss", l, re.IGNORECASE) or re.search(
            r"Lost = (\d+) \((\d+)% loss\)", l, re.IGNORECASE
        )
        if loss_match:
            if len(loss_match.groups()) == 1:
                packet_loss = int(loss_match.group(1))
            else:
                packet_loss = int(loss_match.group(2))
            success = packet_loss == 0

        # Check for average latency - handles both formats
        # Linux: "rtt min/avg/max/mdev = 37.000/40.000/44.000/2.500 ms"
        # Windows: "Average = 40ms"
        avg_match = re.search(r"avg = ([\d.]+)", l, re.IGNORECASE) or re.search(
            r"Average = ([\d.]+)", l, re.IGNORECASE
        )
        if avg_match:
            avg_latency = float(avg_match.group(1))

    return {
        "packet_loss_percent": packet_loss,
        "average_latency_ms": avg_latency,
        "success": success,
        "message": "\n".join(message_lines[-5:]),  # last few lines
    }


def run_ping_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the ping test task and return structured result.

    Task schema:
      type: "ping_test"
      host: str (required) - the host to ping, e.g., "google.com"
      count: int (optional) - number of ping packets, default 4
    """
    host = task.get("host")
    count = task.get("count", 4)

    if not host:
        logger.error("Ping task failed: 'host' not provided.")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": "Host was not specified."},
        }

    command = (
        ["ping", "-c", str(count), host]
        if os.name != "nt"
        else ["ping", "-n", str(count), host]
    )
    logger.info(f"Executing ping command: {' '.join(command)}")

    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="replace",
        )

        if process.returncode != 0:
            logger.warning(f"Ping process exited with code {process.returncode}.")
            # Ping might still have useful output even with non-zero exit

        logger.info("Ping test completed.")
        summary_data = parse_ping_output(process.stdout)
        status = "success" if summary_data.get("success") else "failure"

        return {
            "task_type": "ping_test",
            "status": status,
            "summary": summary_data,
        }

    except FileNotFoundError:
        logger.error("Ping command not found in PATH.")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": "Ping command not found in PATH"},
        }
    except Exception as e:  # noqa: BLE001
        logger.error(f"An unexpected error occurred while running ping: {e}")
        return {
            "task_type": "ping_test",
            "status": "failure",
            "summary": {"error": f"An unexpected exception occurred: {str(e)}"},
        }
