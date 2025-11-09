"""Windows Update error logs analysis service.

Retrieves Windows Update errors from event logs using PowerShell, decodes error codes
using Err.exe, and optionally provides AI-powered analysis of the issues with remediation
suggestions.

Features:
  - Query Windows Update errors from System and Microsoft-Windows-WindowsUpdateClient logs
  - Configurable time frame (today, week, month, all)
  - Error code decoding using Err.exe with XML output parsing
  - Optional AI analysis using OpenAI-compatible models
  - Deduplication of repeated errors
  - Detailed error context and frequency analysis

Task schema (dict expected):
  type: "windows_update_logs_analysis"
  time_frame: str (optional, default "week") - "today", "week", "month", "all"
  include_ai_analysis: bool (optional, default False) - whether to request AI analysis
  ai_provider: str (optional) - AI provider ("openai", "anthropic", etc.)
  max_errors: int (optional, default 50) - maximum errors to retrieve

Return dict structure:
  {
    task_type: "windows_update_logs_analysis",
    status: "success" | "failure" | "warning",
    summary: {
      time_frame: str,
      total_errors_found: int,
      unique_error_codes: int,
      error_groups: [
        {
          error_code: str (e.g., "0x80073D02"),
          error_name: str (e.g., "ERROR_PACKAGES_IN_USE"),
          error_description: str,
          count: int,
          latest_occurrence: str (ISO timestamp),
          affected_packages: [str],
          ai_analysis: {
            issue_summary: str,
            root_causes: [str],
            remediation_steps: [str],
            priority: "critical" | "high" | "medium" | "low"
          } (if AI analysis enabled)
        },
        ...
      ],
      human_readable: {
        verdict: str,
        notes: [str],
        summary_line: str
      },
      exit_code: int,
      stderr_excerpt: str
    }
  }
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET

# Import unified AI utilities
from ai_utils import call_ai_analysis

logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb, capture_task_exception

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass

    def capture_task_exception(*args, **kwargs):
        pass


def _powershell_run(script_text: str) -> Dict[str, Any]:
    """Run a PowerShell script and return result with stdout/stderr.

    Args:
        script_text: PowerShell script to execute

    Returns:
        Dict with keys: ok (bool), data (str), exit_code (int), stdout (str), stderr (str)
    """
    with tempfile.NamedTemporaryFile(
        "w", delete=False, suffix=".ps1", encoding="utf-8"
    ) as tf:
        tf.write(script_text)
        ps1_path = tf.name

    try:
        proc = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ps1_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )

        ok = proc.returncode == 0
        return {
            "ok": ok,
            "data": proc.stdout,
            "exit_code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "data": "",
            "exit_code": 124,
            "stdout": "",
            "stderr": "PowerShell script timed out after 120 seconds",
        }
    except Exception as e:
        return {
            "ok": False,
            "data": "",
            "exit_code": 1,
            "stdout": "",
            "stderr": str(e),
        }
    finally:
        try:
            os.unlink(ps1_path)
        except Exception:
            pass


def _decode_error_code(error_code: str, err_exe_path: str) -> Dict[str, str]:
    """Decode Windows error code using Err.exe.

    Args:
        error_code: Error code in hex format (e.g., "0x80073D02")
        err_exe_path: Path to Err.exe

    Returns:
        Dict with keys: name, description
    """
    try:
        result = subprocess.run(
            [err_exe_path, "/:xml", error_code],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )

        if result.returncode == 0 and result.stdout:
            try:
                root = ET.fromstring(result.stdout)
                for err_elem in root.findall("err"):
                    name = err_elem.get("name", "UNKNOWN")
                    description = err_elem.text or "No description available"
                    return {
                        "name": name,
                        "description": description,
                    }
            except ET.ParseError:
                pass

        return {
            "name": "UNKNOWN",
            "description": "Could not decode error code",
        }
    except Exception as e:
        logger.warning(f"Failed to decode error code {error_code}: {e}")
        return {
            "name": "UNKNOWN",
            "description": f"Decode error: {str(e)}",
        }


def _get_time_frame_filter(time_frame: str) -> str:
    """Convert time frame string to PowerShell DateTime filter.

    Args:
        time_frame: One of "today", "week", "month", "all"

    Returns:
        PowerShell datetime expression
    """
    if time_frame.lower() == "today":
        return "(Get-Date).Date"
    elif time_frame.lower() == "week":
        return "(Get-Date).AddDays(-7)"
    elif time_frame.lower() == "month":
        return "(Get-Date).AddMonths(-1)"
    else:  # "all"
        return "0"  # No filter


def _query_windows_update_errors(time_frame: str, max_errors: int) -> Dict[str, Any]:
    """Query Windows Update errors from event logs.

    Args:
        time_frame: Time frame for filtering ("today", "week", "month", "all")
        max_errors: Maximum number of errors to retrieve

    Returns:
        Dict with keys: ok (bool), errors (list), error_codes (dict), stderr (str)
    """
    add_breadcrumb(
        "Querying Windows Update error logs",
        category="task",
        level="info",
        data={"time_frame": time_frame, "max_errors": max_errors},
    )

    ps_script = f"""
$timeFilter = {_get_time_frame_filter(time_frame)}
$errors = @()

# Query from System log with WindowsUpdateClient provider
try {{
    $events = Get-WinEvent -FilterHashtable @{{
        LogName = 'System'
        ProviderName = 'Microsoft-Windows-WindowsUpdateClient'
        Level = 2, 3  # Warning and Error levels
    }} -ErrorAction SilentlyContinue | Select-Object -First {max_errors}

    foreach ($event in $events) {{
        $timestamp = $event.TimeCreated
        if ($timeFilter -ne 0 -and $timestamp -lt $timeFilter) {{
            continue
        }}

        $message = $event.Message
        # Extract error code from message
        $errorMatch = [regex]::Match($message, '0x[0-9A-Fa-f]+')
        $errorCode = if ($errorMatch.Success) {{ $errorMatch.Value }} else {{ $null }}

        # Extract package name if present
        $package = $null
        if ($message -match '-(.+?)(?:\\.|$)') {{
            $package = $Matches[1]
        }}

        $errors += @{{
            TimeCreated = $timestamp.ToString('O')
            Id = $event.Id
            Message = $message
            ErrorCode = $errorCode
            Package = $package
            Source = 'System'
        }}
    }}
}} catch {{
    Write-Host "Error querying System log: $_"
}}

# Query from Microsoft-Windows-WindowsUpdateClient/Operational if available
try {{
    $opEvents = Get-WinEvent -LogName 'Microsoft-Windows-WindowsUpdateClient/Operational' `
        -ErrorAction SilentlyContinue | Select-Object -First {max_errors}

    foreach ($event in $opEvents) {{
        $timestamp = $event.TimeCreated
        if ($timeFilter -ne 0 -and $timestamp -lt $timeFilter) {{
            continue
        }}

        $message = $event.Message
        $errorMatch = [regex]::Match($message, '0x[0-9A-Fa-f]+')
        $errorCode = if ($errorMatch.Success) {{ $errorMatch.Value }} else {{ $null }}

        $errors += @{{
            TimeCreated = $timestamp.ToString('O')
            Id = $event.Id
            Message = $message
            ErrorCode = $errorCode
            Package = $null
            Source = 'Operational'
        }}
    }}
}} catch {{
    # Operational log might not exist; continue silently
}}

# Output as JSON
$errors | ConvertTo-Json -Depth 2
"""

    result = _powershell_run(ps_script)

    if not result["ok"]:
        return {
            "ok": False,
            "errors": [],
            "error_codes": {},
            "stderr": result["stderr"],
        }

    errors = []
    error_codes_set = set()

    try:
        if result["data"].strip():
            parsed = json.loads(result["data"])
            # Handle single object vs array
            if isinstance(parsed, dict):
                errors = [parsed]
            elif isinstance(parsed, list):
                errors = parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse PowerShell JSON output: {e}")
        return {
            "ok": False,
            "errors": [],
            "error_codes": {},
            "stderr": f"JSON parse error: {str(e)}",
        }

    # Extract unique error codes
    for error in errors:
        if error.get("ErrorCode"):
            error_codes_set.add(error["ErrorCode"])

    return {
        "ok": True,
        "errors": errors,
        "error_codes": sorted(list(error_codes_set)),
        "stderr": result.get("stderr", ""),
    }


def _call_ai_analysis(
    error_code: str,
    error_name: str,
    error_description: str,
    affected_packages: List[str],
    frequency: int,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Call AI API to analyze error and provide remediation.

    Args:
        error_code: Error code (e.g., "0x80073D02")
        error_name: Error name (e.g., "ERROR_PACKAGES_IN_USE")
        error_description: Error description from Err.exe
        affected_packages: List of affected app packages
        frequency: How many times this error occurred
        model: AI model to use (None for default)
        api_key: API key (must be provided by caller)

    Returns:
        Dict with analysis if successful, None on failure
    """
    try:
        if not api_key:
            logger.debug("No API key provided; skipping AI analysis")
            return None

        # Construct analysis prompt
        user_prompt = f"""Analyze this Windows Update error:

Error Code: {error_code}
Error Name: {error_name}
Error Description: {error_description}
Affected Packages: {", ".join(affected_packages) if affected_packages else "Unknown"}
Frequency: Occurred {frequency} times

Provide a structured analysis with:
1. Root cause explanation (1-2 sentences)
2. List of likely causes
3. Step-by-step remediation steps
4. Priority level (critical/high/medium/low)

Format your response as JSON with the following structure:
{{
  "root_cause": "brief explanation",
  "likely_causes": ["cause1", "cause2", ...],
  "remediation_steps": ["step1", "step2", ...],
  "priority": "critical|high|medium|low"
}}"""

        # Use unified AI utility
        result = call_ai_analysis(
            system_prompt="You are a Windows Update expert assistant. Analyze errors and provide actionable remediation steps.",
            user_prompt=user_prompt,
            model=model or "gpt-4-turbo-preview",
            api_key=api_key,
            temperature=0.5,
            json_mode=True,
        )

        if not result["success"]:
            logger.warning(f"AI analysis failed: {result.get('error')}")
            sys.stderr.flush()
            return None

        analysis = result["data"]

        # Map to expected structure
        return {
            "issue_summary": analysis.get("root_cause", ""),
            "root_causes": analysis.get("likely_causes", []),
            "remediation_steps": analysis.get("remediation_steps", []),
            "priority": analysis.get("priority", "medium").lower(),
        }

    except Exception as e:
        logger.warning(f"AI analysis failed: {e}")
        sys.stderr.flush()
        add_breadcrumb(
            "AI analysis failed",
            category="task",
            level="warning",
            data={"error": str(e)},
        )
        return None


def run_windows_update_logs_analysis(task: Dict[str, Any]) -> Dict[str, Any]:
    """Execute Windows Update logs analysis task.

    Args:
        task: Task configuration with keys:
            - type: str "windows_update_logs_analysis"
            - time_frame: str (optional, default "week") - "today", "week", "month", "all"
            - include_ai_analysis: bool (optional, default False)
            - max_errors: int (optional, default 50)
            - err_exe_path: str (optional) - path to Err.exe for error code decoding
            - api_key: str (optional) - API key for AI analysis
            - model: str (optional) - AI model to use

    Returns:
        Standardized result dict
    """
    start_time = time.time()
    time_frame = task.get("time_frame", "week").lower()
    include_ai_analysis = task.get("include_ai_analysis", False)
    max_errors = task.get("max_errors", 50)
    err_exe_path = task.get("err_exe_path")  # Get from task parameters
    ai_model = task.get("model")  # Get AI model from task
    ai_api_key = task.get("api_key")  # Get API key from task

    # Handle environment-backed API keys (same pattern as ai_startup_service)
    if isinstance(ai_api_key, str) and ai_api_key.startswith("env:"):
        env_var = ai_api_key.split(":", 1)[1]
        ai_api_key = os.getenv(env_var)
        logger.info(f"Using API key from environment variable: {env_var}")
        sys.stderr.flush()

    # Fallback to common environment variables if no key provided
    if not ai_api_key and include_ai_analysis:
        ai_api_key = os.getenv("AUTOSERVICE_OPENAI_KEY") or os.getenv("OPENAI_API_KEY")
        if ai_api_key:
            logger.info("Using API key from default environment variables")
            sys.stderr.flush()
        else:
            logger.warning("AI analysis enabled but no API key available")
            sys.stderr.flush()

    add_breadcrumb(
        "Starting Windows Update logs analysis",
        category="task",
        level="info",
        data={
            "time_frame": time_frame,
            "include_ai_analysis": include_ai_analysis,
            "has_err_exe": err_exe_path is not None,
            "has_api_key": bool(ai_api_key),
        },
    )

    # Query errors from event logs
    query_result = _query_windows_update_errors(time_frame, max_errors)

    if not query_result["ok"]:
        return {
            "task_type": "windows_update_logs_analysis",
            "status": "failure",
            "summary": {
                "error": "Failed to query event logs",
                "stderr": query_result["stderr"],
            },
            "duration_seconds": round(time.time() - start_time, 2),
        }

    errors = query_result["errors"]
    error_codes = query_result["error_codes"]

    add_breadcrumb(
        f"Retrieved {len(errors)} error events",
        category="task",
        level="info",
        data={"error_count": len(errors), "unique_codes": len(error_codes)},
    )

    # Use provided Err.exe path for code decoding (or None if not available)
    if not err_exe_path:
        logger.warning("Err.exe path not provided; error codes will not be decoded")
        add_breadcrumb(
            "Err.exe path not provided",
            category="task",
            level="warning",
        )

    # Group errors by code
    error_groups: Dict[str, Dict[str, Any]] = {}

    for error in errors:
        code = error.get("ErrorCode")
        if not code:
            continue

        if code not in error_groups:
            error_groups[code] = {
                "error_code": code,
                "error_name": "UNKNOWN",
                "error_description": "Not decoded",
                "count": 0,
                "latest_occurrence": None,
                "affected_packages": [],
            }

        error_groups[code]["count"] += 1

        # Update timestamp to latest
        timestamp = error.get("TimeCreated")
        if timestamp:
            if (
                not error_groups[code]["latest_occurrence"]
                or timestamp > error_groups[code]["latest_occurrence"]
            ):
                error_groups[code]["latest_occurrence"] = timestamp

        # Collect package names
        package = error.get("Package")
        if package and package not in error_groups[code]["affected_packages"]:
            error_groups[code]["affected_packages"].append(package)

    # Decode error codes and perform AI analysis if enabled
    for code, group in error_groups.items():
        if err_exe_path:
            decoded = _decode_error_code(code, err_exe_path)
            group["error_name"] = decoded["name"]
            group["error_description"] = decoded["description"]

        if include_ai_analysis:
            if not ai_api_key:
                logger.warning(f"AI analysis enabled but no API key available, skipping analysis for {code}")
                sys.stderr.flush()
                continue

            add_breadcrumb(
                f"Requesting AI analysis for {code}",
                category="task",
                level="info",
            )
            logger.info(f"Calling AI analysis for error code {code} (model: {ai_model or 'default'})")
            sys.stderr.flush()

            ai_analysis = _call_ai_analysis(
                code,
                group["error_name"],
                group["error_description"],
                group["affected_packages"],
                group["count"],
                model=ai_model,
                api_key=ai_api_key,
            )
            if ai_analysis:
                logger.info(f"AI analysis successful for {code}")
                sys.stderr.flush()
                group["ai_analysis"] = ai_analysis
            else:
                logger.warning(f"AI analysis returned no results for {code}")
                sys.stderr.flush()

    # Build human-readable summary
    error_list = sorted(error_groups.values(), key=lambda x: x["count"], reverse=True)

    verdict = "success" if not error_list else "warning"
    notes = []

    if not error_list:
        notes.append("No Windows Update errors found in the specified time frame.")
        summary_line = "✓ No errors detected"
    else:
        notes.append(
            f"Found {len(error_list)} unique error code(s) across {len(errors)} events"
        )
        top_error = error_list[0]
        notes.append(
            f"Most common: {top_error['error_name']} ({top_error['error_code']}) - {top_error['count']} occurrences"
        )
        summary_line = f"⚠ {len(error_list)} error code(s) detected"

        if include_ai_analysis and any("ai_analysis" in e for e in error_list):
            notes.append("AI analysis provided for remediation guidance")

    return {
        "task_type": "windows_update_logs_analysis",
        "status": verdict,
        "summary": {
            "time_frame": time_frame,
            "total_errors_found": len(errors),
            "unique_error_codes": len(error_list),
            "error_groups": error_list,
            "human_readable": {
                "verdict": verdict,
                "notes": notes,
                "summary_line": summary_line,
            },
            "exit_code": 0,
            "stderr_excerpt": query_result.get("stderr", "")[:500],
        },
        "duration_seconds": round(time.time() - start_time, 2),
    }
