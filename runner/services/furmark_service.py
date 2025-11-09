"""FurMark GPU stress test service.

Builds the command line for a timed FurMark demo, executes it, and parses
console output into structured metrics (FPS, frames, duration, temps, etc.).
"""

import subprocess
import logging
import re
from typing import Dict, Any, List

# Import subprocess utility with skip checking
try:
    from subprocess_utils import run_with_skip_check
except ImportError:
    # Fallback if utility not available
    run_with_skip_check = subprocess.run

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


FURMARK_DEMO_DEFAULT = "furmark-gl"


def parse_furmark_output(output: str) -> Dict[str, Any]:
    """Parse FurMark console output into structured metrics.

    Expected sample lines:
      - demo                 : FurMark (GL) (built-in: YES)
      - renderer             : NVIDIA GeForce RTX 3060/PCIe/SSE2
      - 3D API               : OpenGL 3.2.0 NVIDIA 572.83
      - resolution           : 1920x1080
      - frames               : 322
      - duration             : 3114 ms
      - FPS (min/avg/max)    : 96 / 103 / 108
      - GPU 0: NVIDIA GeForce RTX 3060 [10DE-2504]
            .max temperature: 52░C
            .max usage: 96%
            .max core clock: 1882 MHz
            .min core clock: 1756 MHz
    """

    summary: Dict[str, Any] = {
        "demo": None,
        "renderer": None,
        "api": None,
        "resolution": {"width": None, "height": None},
        "frames": None,
        "duration_ms": None,
        "fps": {"min": None, "avg": None, "max": None},
        "gpus": [],
    }

    # Precompile regex patterns
    patterns = {
        "demo": re.compile(r"^-\s*demo\s*:\s*(.+)$", re.IGNORECASE),
        "renderer": re.compile(r"^-\s*renderer\s*:\s*(.+)$", re.IGNORECASE),
        "api": re.compile(r"^-\s*3D API\s*:\s*(.+)$", re.IGNORECASE),
        "resolution": re.compile(r"^-\s*resolution\s*:\s*(\d+)x(\d+)$", re.IGNORECASE),
        "frames": re.compile(r"^-\s*frames\s*:\s*(\d+)$", re.IGNORECASE),
        "duration": re.compile(r"^-\s*duration\s*:\s*(\d+)\s*ms", re.IGNORECASE),
        "fps": re.compile(
            r"^-\s*FPS.*?:\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)", re.IGNORECASE
        ),
        "gpu_header": re.compile(r"^-\s*GPU\s+(\d+):\s*(.+?)\s*\[(.+?)\]"),
        "gpu_temp": re.compile(r"\.max temperature:\s*(\d+)"),
        "gpu_usage": re.compile(r"\.max usage:\s*(\d+)%"),
        "gpu_core_max": re.compile(r"\.max core clock:\s*(\d+)\s*MHz", re.IGNORECASE),
        "gpu_core_min": re.compile(r"\.min core clock:\s*(\d+)\s*MHz", re.IGNORECASE),
    }

    current_gpu: Dict[str, Any] | None = None

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # GPU section start
        m_gpu = patterns["gpu_header"].match(line)
        if m_gpu:
            # Push previous GPU if any
            if current_gpu is not None:
                summary["gpus"].append(current_gpu)
            current_gpu = {
                "index": int(m_gpu.group(1)),
                "name": m_gpu.group(2).strip(),
                "id": m_gpu.group(3).strip(),
                "max_temperature_c": None,
                "max_usage_percent": None,
                "max_core_clock_mhz": None,
                "min_core_clock_mhz": None,
            }
            continue

        if current_gpu is not None and line.startswith("."):
            if m := patterns["gpu_temp"].search(line):
                current_gpu["max_temperature_c"] = int(m.group(1))
            elif m := patterns["gpu_usage"].search(line):
                current_gpu["max_usage_percent"] = int(m.group(1))
            elif m := patterns["gpu_core_max"].search(line):
                current_gpu["max_core_clock_mhz"] = int(m.group(1))
            elif m := patterns["gpu_core_min"].search(line):
                current_gpu["min_core_clock_mhz"] = int(m.group(1))
            continue

        # General metrics
        for key in [
            "demo",
            "renderer",
            "api",
            "resolution",
            "frames",
            "duration",
            "fps",
        ]:
            pat = patterns[key]
            m = pat.match(line)
            if not m:
                continue
            if key == "resolution":
                summary["resolution"] = {
                    "width": int(m.group(1)),
                    "height": int(m.group(2)),
                }
            elif key == "frames":
                summary["frames"] = int(m.group(1))
            elif key == "duration":
                summary["duration_ms"] = int(m.group(1))
            elif key == "fps":
                summary["fps"] = {
                    "min": int(m.group(1)),
                    "avg": int(m.group(2)),
                    "max": int(m.group(3)),
                }
            else:  # demo, renderer, api
                summary[key] = m.group(1).strip()
            break  # stop scanning remaining patterns for this line

    # Append last GPU block if still open
    if current_gpu is not None:
        summary["gpus"].append(current_gpu)

    return summary


def run_furmark_test(task: Dict[str, Any]) -> Dict[str, Any]:
    """Run a FurMark stress test for the specified duration.

    Task schema (dict):
      type: "furmark_stress_test"
      executable_path: str (required) path to furmark.exe
      duration_seconds: int (required) runtime for --max-time
      width: int (optional, default 1920)
      height: int (optional, default 1080)
      demo: str (optional, default 'furmark-gl')
      extra_args: List[str] (optional) pass-through additional args
    Returns structured result with parsed metrics.
    """
    add_breadcrumb(
        "Starting FurMark GPU stress test",
        category="task",
        level="info",
        data={"duration_seconds": task.get("duration_seconds")},
    )

    exec_path = task.get("executable_path")
    duration = task.get("duration_seconds")
    width = int(task.get("width", 1920))
    height = int(task.get("height", 1080))
    demo = task.get("demo", FURMARK_DEMO_DEFAULT)
    extra_args: List[str] = task.get("extra_args", [])

    if not exec_path:
        return {
            "task_type": "furmark_stress_test",
            "status": "failure",
            "summary": {"error": "'executable_path' not provided"},
        }
    if not duration or not isinstance(duration, (int, float)) or duration <= 0:
        return {
            "task_type": "furmark_stress_test",
            "status": "failure",
            "summary": {"error": "'duration_seconds' must be positive"},
        }

    command: List[str] = [
        exec_path,
        "--demo",
        str(demo),
        "--width",
        str(width),
        "--height",
        str(height),
        "--max-time",
        str(int(duration)),
    ] + extra_args

    logger.info(f"Running FurMark: {' '.join(command)}")

    add_breadcrumb(
        "Executing FurMark",
        category="subprocess",
        level="info",
        data={"duration_seconds": int(duration), "resolution": f"{width}x{height}"},
    )

    try:
        proc = run_with_skip_check(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return {
            "task_type": "furmark_stress_test",
            "status": "failure",
            "summary": {"error": f"File not found: {exec_path}"},
        }
    except Exception as e:  # noqa: BLE001
        return {
            "task_type": "furmark_stress_test",
            "status": "failure",
            "summary": {"error": f"Unexpected exception: {e}"},
        }

    if proc.returncode != 0:
        logger.error(f"FurMark exited with code {proc.returncode}")
        return {
            "task_type": "furmark_stress_test",
            "status": "failure",
            "summary": {
                "error": f"Process exited with non-zero code {proc.returncode}",
                "stderr": proc.stderr.strip(),
                "command": command,
            },
        }

    parsed = parse_furmark_output(proc.stdout)

    add_breadcrumb(
        "FurMark stress test completed",
        category="task",
        level="info",
        data={
            "frames": parsed.get("frames"),
            "fps_avg": parsed.get("fps", {}).get("avg"),
            "max_temp": parsed.get("gpus", [{}])[0].get("max_temperature_c")
            if parsed.get("gpus")
            else None,
        },
    )

    return {
        "task_type": "furmark_stress_test",
        "status": "success",
        "summary": parsed,
        "command": command,
    }


__all__ = ["run_furmark_test", "parse_furmark_output"]
