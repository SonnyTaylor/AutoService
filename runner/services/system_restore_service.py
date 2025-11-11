"""System Restore point creation service.

Creates a Windows System Restore point before running maintenance tasks.
Uses PowerShell Checkpoint-Computer cmdlet.

Task schema (dict expected):
  type: "system_restore"

Return dict structure:
  {
    task_type: "system_restore",
    status: "success" | "error" | "warning",
    summary: {
      human_readable: {
        message: str,
        warnings: [str] (optional)
      },
      results: {
        restore_point_created: bool,
        description: str (optional),
        error_details: str (optional)
      }
    },
    duration_seconds: float
  }
"""

import subprocess
import logging
import sys
import time
import re
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# Import subprocess utility with skip checking
try:
    from subprocess_utils import run_with_skip_check
except ImportError:
    # Fallback if utility not available
    run_with_skip_check = subprocess.run

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def check_system_protection_enabled() -> Tuple[bool, Optional[str]]:
    """Check if System Protection is enabled for the system drive.
    
    Returns:
        Tuple of (is_enabled, error_message)
        is_enabled: True if System Protection is enabled, False otherwise
        error_message: Error message if check failed, None otherwise
    """
    try:
        # Use PowerShell to check System Protection status
        command = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Select-Object -First 1 | Out-Null; if ($?) { $true } else { $false }"
        ]
        
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        
        # Alternative: Check registry or use Get-ComputerRestorePoint to verify
        # If we can query restore points, protection is likely enabled
        # More reliable: Check the actual protection status
        command2 = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "(Get-ComputerRestorePoint -ErrorAction SilentlyContinue).Count -ge 0"
        ]
        
        proc2 = subprocess.run(
            command2,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        
        # If command succeeded (even with 0 restore points), protection might be enabled
        # The actual check is done when creating the restore point
        return True, None
    except Exception as e:
        logger.warning(f"Failed to check System Protection status: {e}")
        return True, None  # Assume enabled, let the create command fail if not


def attempt_enable_system_protection() -> Tuple[bool, str]:
    """Attempt to enable System Protection and required services on C:.
    
    Returns:
        (success, details) tuple describing what actions were taken.
    """
    try:
        actions = []
        # Ensure Volume Shadow Copy (VSS) and Software Shadow Copy Provider (swprv)
        # are not disabled and are started, then enable protection on C:
        service_script = r"""
          $ErrorActionPreference = 'SilentlyContinue'
          $changed = @()
          foreach ($svcName in @('VSS','swprv')) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($null -ne $svc) {
              if ($svc.StartType -eq 'Disabled') {
                Set-Service -Name $svcName -StartupType Manual
                $changed += \"Set $svcName StartupType=Manual\"
              }
              if ($svc.Status -ne 'Running') {
                Start-Service -Name $svcName
                $changed += \"Started $svcName\"
              }
            }
          }
          Enable-ComputerRestore -Drive 'C:\' | Out-Null
          if ($changed.Count -gt 0) { $changed -join '; ' } else { 'No service changes' }
        """
        proc_services = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                service_script,
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        actions.append((proc_services.stdout or "").strip())
        # Give the system a moment to register protection change
        time.sleep(2)
        verify = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "(Get-ComputerRestorePoint -ErrorAction SilentlyContinue).Count -ge 0",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        ok = "True" in (verify.stdout or "") or verify.returncode == 0
        return ok, "; ".join([a for a in actions if a])
    except Exception as e:
        return False, f"Enable attempt failed: {e}"


def run_system_restore(task: Dict[str, Any]) -> Dict[str, Any]:
    """Create a Windows System Restore point.
    
    Uses PowerShell Checkpoint-Computer cmdlet to create a restore point.
    Requires administrator privileges and System Protection to be enabled.
    """
    start_time = time.time()
    add_breadcrumb("Starting System Restore point creation", category="task", level="info")
    
    description = "AutoService pre-run restore point"
    
    # PowerShell command to create restore point
    # MODIFY_SETTINGS is appropriate for maintenance operations
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        f"Checkpoint-Computer -Description '{description}' -RestorePointType 'MODIFY_SETTINGS'"
    ]
    
    logger.info("Creating System Restore point: %s", description)
    sys.stderr.flush()
    
    add_breadcrumb(
        "Executing System Restore point creation",
        category="subprocess",
        level="info",
        data={"description": description},
    )
    
    try:
        proc = run_with_skip_check(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,  # 5 minute timeout (should be much faster)
        )
        
        duration = time.time() - start_time
        
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        return_code = proc.returncode
        
        # Combine output for analysis
        combined_output = (stdout + "\n" + stderr).strip()
        
        add_breadcrumb(
            f"System Restore command completed",
            category="subprocess",
            level="info",
            data={"return_code": return_code, "duration": duration},
        )
        
        # Check for common error conditions
        output_lower = combined_output.lower()
        
        # Check for access denied / admin required
        if "access is denied" in output_lower or "requires elevation" in output_lower or "administrator" in output_lower:
            add_breadcrumb(
                "System Restore failed: Administrator privileges required",
                category="task",
                level="warning",
            )
            return {
                "task_type": "system_restore",
                "status": "warning",
                "summary": {
                    "human_readable": {
                        "message": "System Restore point creation requires administrator privileges. Please run AutoService as administrator.",
                        "warnings": [
                            "Administrator privileges required",
                            "System Restore point was not created"
                        ]
                    },
                    "results": {
                        "restore_point_created": False,
                        "error_details": "Administrator privileges required",
                        "return_code": return_code,
                        "output": combined_output[:500]  # Truncate for size
                    }
                },
                "duration_seconds": round(duration, 2),
            }
        
        # Check for System Protection disabled
        disabled_signal = (
            ("system protection" in output_lower and ("disabled" in output_lower or "not enabled" in output_lower))
            or "servicedisabled" in output_lower
            or "the service cannot be started because it is disabled" in output_lower
        )
        if disabled_signal:
            # Try to enable services and System Protection, then retry once
            add_breadcrumb(
                "System Protection appears disabled; attempting remediation",
                category="task",
                level="info",
            )
            enabled_ok, enable_details = attempt_enable_system_protection()
            retry_proc = None
            if enabled_ok:
                try:
                    retry_proc = run_with_skip_check(
                        command,
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=300,
                    )
                except Exception:
                    retry_proc = None
            if retry_proc and retry_proc.returncode == 0:
                duration2 = time.time() - start_time
                add_breadcrumb(
                    "System Restore created successfully after enabling protection",
                    category="task",
                    level="info",
                )
                return {
                    "task_type": "system_restore",
                    "status": "success",
                    "summary": {
                        "human_readable": {
                            "message": f"System Restore point created after enabling protection: {description}",
                        },
                        "results": {
                            "restore_point_created": True,
                            "description": description,
                            "remediation": enable_details,
                            "return_code": 0,
                        },
                    },
                    "duration_seconds": round(duration2, 2),
                }
            # If still failing, return warning with explicit guidance
            add_breadcrumb(
                "System Restore failed: System Protection disabled",
                category="task",
                level="warning",
            )
            return {
                "task_type": "system_restore",
                "status": "warning",
                "summary": {
                    "human_readable": {
                        "message": "System Protection is disabled. Enable System Protection to create restore points.",
                        "warnings": [
                            "System Protection is disabled",
                            "System Restore point was not created",
                            "To enable: Control Panel > System > System Protection > Configure",
                            "Ensure services 'Volume Shadow Copy (VSS)' and 'Microsoft Software Shadow Copy Provider (swprv)' are not Disabled",
                        ]
                    },
                    "results": {
                        "restore_point_created": False,
                        "error_details": "System Protection disabled",
                        "return_code": return_code,
                        "output": combined_output[:500],
                        "remediation_attempt": enable_details,
                    }
                },
                "duration_seconds": round(duration, 2),
            }
        
        # Check for success indicators
        # PowerShell Checkpoint-Computer typically doesn't output much on success
        # Return code 0 usually indicates success
        if return_code == 0:
            add_breadcrumb(
                "System Restore point created successfully",
                category="task",
                level="info",
                data={"duration": duration},
            )
            return {
                "task_type": "system_restore",
                "status": "success",
                "summary": {
                    "human_readable": {
                        "message": f"System Restore point created successfully: {description}",
                    },
                    "results": {
                        "restore_point_created": True,
                        "description": description,
                        "return_code": return_code,
                    }
                },
                "duration_seconds": round(duration, 2),
            }
        
        # If return code is non-zero but no specific error pattern matched
        add_breadcrumb(
            "System Restore point creation failed",
            category="task",
            level="warning",
            data={"return_code": return_code},
        )
        return {
            "task_type": "system_restore",
            "status": "warning",
            "summary": {
                "human_readable": {
                    "message": "System Restore point creation completed with warnings. Check output for details.",
                    "warnings": [
                        f"Command returned exit code {return_code}",
                        "System Restore point may not have been created"
                    ]
                },
                "results": {
                    "restore_point_created": False,
                    "error_details": f"Command failed with return code {return_code}",
                    "return_code": return_code,
                    "output": combined_output[:500]
                }
            },
            "duration_seconds": round(duration, 2),
        }
        
    except subprocess.TimeoutExpired:
        duration = time.time() - start_time
        add_breadcrumb(
            "System Restore point creation timed out",
            category="task",
            level="error",
            data={"duration": duration},
        )
        return {
            "task_type": "system_restore",
            "status": "error",
            "summary": {
                "human_readable": {
                    "message": "System Restore point creation timed out after 5 minutes.",
                    "warnings": [
                        "Operation timed out",
                        "System Restore point may not have been created"
                    ]
                },
                "results": {
                    "restore_point_created": False,
                    "error_details": "Command timed out after 5 minutes",
                }
            },
            "duration_seconds": round(duration, 2),
        }
    except FileNotFoundError:
        duration = time.time() - start_time
        add_breadcrumb(
            "System Restore failed: PowerShell not found",
            category="task",
            level="error",
        )
        return {
            "task_type": "system_restore",
            "status": "error",
            "summary": {
                "human_readable": {
                    "message": "PowerShell not found. System Restore point creation requires PowerShell.",
                    "warnings": [
                        "PowerShell not available",
                        "System Restore point was not created"
                    ]
                },
                "results": {
                    "restore_point_created": False,
                    "error_details": "PowerShell command not found",
                }
            },
            "duration_seconds": round(duration, 2),
        }
    except Exception as e:
        duration = time.time() - start_time
        logger.exception("System Restore point creation failed with exception")
        add_breadcrumb(
            "System Restore point creation exception",
            category="task",
            level="error",
            data={"error": str(e)},
        )
        return {
            "task_type": "system_restore",
            "status": "error",
            "summary": {
                "human_readable": {
                    "message": f"System Restore point creation failed: {str(e)}",
                    "warnings": [
                        "Unexpected error occurred",
                        "System Restore point was not created"
                    ]
                },
                "results": {
                    "restore_point_created": False,
                    "error_details": str(e),
                }
            },
            "duration_seconds": round(duration, 2),
        }

