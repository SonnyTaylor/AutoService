"""Windows Update service using PowerShell (PSWindowsUpdate).

Runs a PowerShell script to:
  1) Ensure NuGet provider and PSWindowsUpdate module are installed/trusted
  2) Query available updates (including Microsoft/driver updates)
  3) Install available updates with -AcceptAll -IgnoreReboot
  4) Query remaining updates and determine reboot requirement
  5) Stream real-time progress updates to user

Enhanced with:
  - Real-time progress streaming to stderr for UI feedback
  - Better error handling and recovery
  - Detailed per-update status tracking
  - Graceful degradation when modules unavailable
  - Progress indicators during long-running operations

Task schema (dict expected):
  type: "windows_update"
  microsoft_update: bool (optional, default True) include Microsoft/driver updates
  accept_all: bool (optional, default True) pass -AcceptAll
  ignore_reboot: bool (optional, default True) pass -IgnoreReboot

Return dict structure:
  {
    task_type: "windows_update",
    status: "success" | "failure" | "completed_with_errors",
    summary: {
      pre_scan: { count_total, count_windows, count_driver, items: [...] },
      install: {
        count_installed, count_downloaded, count_failed, count_accepted,
        count_windows_installed, count_driver_installed,
        items: [ { Title, KB, Size, Category, Result, IsDriver, Status } ... ]
      },
      post_scan: { count_remaining, items: [...] },
      reboot_required: bool,
      human_readable: { verdict, notes: [], summary_line, details: [] },
      exit_code,
      stderr_excerpt,
      stdout_excerpt_on_error?,
      timings: { pre_scan_seconds, install_seconds, post_scan_seconds, total_seconds }
    }
  }
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional

# Use the same logger as service_runner for consistent real-time streaming
logger = logging.getLogger(__name__)

# Sentry integration for breadcrumbs
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


def _powershell_json(script_text: str) -> Dict[str, Any]:
    """Run a PowerShell script file and parse its JSON stdout.

    Streams stderr output in real-time for user feedback while capturing stdout for JSON parsing.

    Returns dict with keys: ok(bool), data|error(str), exit_code(int), stdout, stderr.
    """
    with tempfile.NamedTemporaryFile(
        "w", delete=False, suffix=".ps1", encoding="utf-8"
    ) as tf:
        tf.write(script_text)
        ps1_path = tf.name

    try:
        # Use Popen for real-time output streaming
        proc = subprocess.Popen(
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
            bufsize=1,  # Line buffered
        )

        stdout_lines = []
        stderr_lines = []

        # Read stderr in real-time (progress messages)
        # Read stdout at the end (JSON result)
        import threading

        def read_stderr():
            """Read and log stderr in real-time."""
            try:
                for line in iter(proc.stderr.readline, ""):  # type: ignore
                    if not line:
                        break
                    line = line.rstrip()
                    if line:
                        stderr_lines.append(line)
                        # Stream [WU] prefixed lines directly to user
                        if line.startswith("[WU]"):
                            logger.info(line)
                            _flush_stderr()
            except Exception:
                pass

        # Start stderr reader thread
        stderr_thread = threading.Thread(target=read_stderr, daemon=True)
        stderr_thread.start()

        # Read stdout (JSON result)
        stdout = ""
        try:
            stdout = proc.stdout.read() if proc.stdout else ""  # type: ignore
        except Exception:
            pass

        # Wait for process to complete
        exit_code = proc.wait()

        # Wait for stderr thread to finish (with timeout)
        stderr_thread.join(timeout=2.0)

        stderr = "\n".join(stderr_lines)

        # Try to parse JSON from stdout
        try:
            # Find JSON in stdout (may have extra output before/after)
            json_start = stdout.find("{")
            json_end = stdout.rfind("}") + 1

            if json_start >= 0 and json_end > json_start:
                json_text = stdout[json_start:json_end]
                parsed = json.loads(json_text)
                return {
                    "ok": True,
                    "data": parsed,
                    "exit_code": exit_code,
                    "stdout": stdout,
                    "stderr": stderr,
                }
            else:
                raise json.JSONDecodeError("No JSON object found", stdout, 0)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse PowerShell JSON output: {e}")
            logger.error(f"stdout preview: {stdout[:500]}")
            _flush_stderr()
            return {
                "ok": False,
                "error": f"Failed to parse PowerShell JSON output: {e}",
                "exit_code": exit_code,
                "stdout": stdout,
                "stderr": stderr,
            }
    finally:
        try:
            os.unlink(ps1_path)
        except Exception:
            pass


def _flush_stderr():
    """Flush stderr to ensure real-time log delivery to UI."""
    try:
        sys.stderr.flush()
        # Force OS-level flush for immediate delivery
        if hasattr(sys.stderr, "fileno"):
            try:
                os.fsync(sys.stderr.fileno())
            except Exception:
                pass
    except Exception:
        pass


def _build_ps_script(
    microsoft_update: bool, accept_all: bool, ignore_reboot: bool
) -> str:
    """Return a PowerShell script that emits structured JSON via ConvertTo-Json.

    Enhanced with real-time progress updates via Write-Host for user feedback.
    """
    # Use single quotes for JSON keys in here-string, PowerShell will output proper JSON strings
    # The script creates a hashtable $out and converts it to JSON at the end.
    mu_ps = "$true" if microsoft_update else "$false"
    accept_ps = "$true" if accept_all else "$false"
    ignore_ps = "$true" if ignore_reboot else "$false"
    return f"""
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$ConfirmPreference = 'None'
try {{ [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }} catch {{ }}

function Write-Progress {{ param([string]$msg) Write-Host "[WU] $msg" -ForegroundColor Cyan }}
function Write-Info {{ param([string]$msg) Write-Host "[WU] $msg" -ForegroundColor Gray }}
function Write-Success {{ param([string]$msg) Write-Host "[WU] $msg" -ForegroundColor Green }}
function Write-Warning {{ param([string]$msg) Write-Host "[WU] $msg" -ForegroundColor Yellow }}
function Write-Error {{ param([string]$msg) Write-Host "[WU] $msg" -ForegroundColor Red }}

function Ensure-NuGetProvider {{
  try {{ 
    if (-not (Get-PackageProvider -Name NuGet -ListAvailable -ErrorAction SilentlyContinue)) {{
      Write-Progress "Installing NuGet package provider..."
      Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers | Out-Null
      Write-Success "NuGet provider installed"
    }} else {{
      Write-Info "NuGet provider already available"
    }}
  }} catch {{ 
    Write-Warning "Could not install NuGet provider: $_"
  }}
}}

function Ensure-PSGalleryTrusted {{
  try {{ 
    $repo = Get-PSRepository -Name 'PSGallery' -ErrorAction SilentlyContinue
    if ($repo -and $repo.InstallationPolicy -ne 'Trusted') {{
      Write-Progress "Setting PSGallery as trusted repository..."
      Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted -ErrorAction SilentlyContinue
      Write-Success "PSGallery set as trusted"
    }} else {{
      Write-Info "PSGallery already trusted"
    }}
  }} catch {{ 
    Write-Warning "Could not trust PSGallery: $_"
  }}
}}

function Ensure-PSWindowsUpdateModule {{
  try {{ 
    if (-not (Get-Module -ListAvailable -Name 'PSWindowsUpdate')) {{
      Write-Progress "PSWindowsUpdate module not found, installing..."
      Ensure-NuGetProvider
      Ensure-PSGalleryTrusted
      
      Write-Progress "Installing PSWindowsUpdate module (system-wide)..."
      try {{
        Install-Module -Name 'PSWindowsUpdate' -Force -Scope AllUsers -AllowClobber -ErrorAction Stop
        Write-Success "PSWindowsUpdate installed system-wide"
      }} catch {{
        Write-Warning "System-wide install failed, trying user scope..."
        Install-Module -Name 'PSWindowsUpdate' -Force -Scope CurrentUser -AllowClobber -ErrorAction Stop
        Write-Success "PSWindowsUpdate installed for current user"
      }}
    }} else {{
      Write-Info "PSWindowsUpdate module already installed"
    }}
  }} catch {{ 
    Write-Error "Failed to install PSWindowsUpdate module: $_"
    return
  }}
  
  try {{ 
    Import-Module 'PSWindowsUpdate' -ErrorAction Stop
    Write-Success "PSWindowsUpdate module loaded successfully"
  }} catch {{ 
    Write-Error "Failed to import PSWindowsUpdate module: $_"
  }}
}}

function Get-RebootRequired {{
  try {{ if (Get-Command -Name Get-WURebootStatus -ErrorAction SilentlyContinue) {{
      $st = Get-WURebootStatus -Silent
      if ($null -ne $st) {{ return [bool]$st.RebootRequired }}
    }} }} catch {{ }}
  $p1 = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
  $p2 = $false
  try {{ $p2 = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name 'PendingFileRenameOperations' -ErrorAction SilentlyContinue) -ne $null }} catch {{ }}
  return ($p1 -or $p2)
}}

function Format-Size($bytes) {{
  if ($null -eq $bytes -or $bytes -eq 0) {{ return "0 B" }}
  $sizes = 'B','KB','MB','GB','TB'
  $order = [Math]::Floor([Math]::Log($bytes, 1024))
  $size = [Math]::Round($bytes / [Math]::Pow(1024, $order), 2)
  return "$size $($sizes[$order])"
}}

function As-ItemObject($it, $stage) {{
  if ($null -eq $it) {{ return $null }}
  $title = $it.Title
  $kb = $it.KB
  if (-not $kb -and $it.KBArticleIDs) {{ $kb = ($it.KBArticleIDs -join ',') }}
  
  # Handle size formatting
  $size = $null
  if ($it.Size -is [int64] -or $it.Size -is [int]) {{
    $size = Format-Size $it.Size
  }} elseif ($it.Size) {{
    $size = $it.Size
  }} elseif ($it.SizeStr) {{
    $size = $it.SizeStr
  }}
  
  $cat = $it.Category
  if (-not $cat -and $it.Categories) {{ $cat = ($it.Categories | ForEach-Object {{ $_.Name }}) -join ', ' }}
  $res = $it.Result
  $status = $it.Status
  
  $isDriver = $false
  try {{ $isDriver = ($cat -match 'driver') }} catch {{ $isDriver = $false }}
  
  [PSCustomObject]@{{
    Stage = $stage
    Title = $title
    KB = $kb
    Size = $size
    Category = $cat
    Result = $res
    Status = $status
    IsDriver = [bool]$isDriver
  }}
}}

Write-Progress "Initializing Windows Update service..."
$startTime = Get-Date

Ensure-PSWindowsUpdateModule

$out = @{{}}
$out.errors = @()
$out.meta = @{{}}
$out.warnings = @()

$mu = {mu_ps}
$acceptAll = {accept_ps}
$ignoreReboot = {ignore_ps}

# Discover module + versions
try {{
  $mod = Get-Module -Name 'PSWindowsUpdate' -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1
  $out.meta.module_available = [bool]($mod -ne $null)
  $out.meta.module_version = if ($mod) {{ $mod.Version.ToString() }} else {{ $null }}
  if ($mod) {{
    Write-Info "Using PSWindowsUpdate version $($mod.Version)"
  }} else {{
    Write-Error "PSWindowsUpdate module not available"
  }}
}} catch {{ 
  $out.meta.module_available = $false
  $out.meta.module_version = $null
  Write-Error "Failed to detect PSWindowsUpdate module: $_"
}}

# Register Microsoft Update service when requested (best-effort)
if ($mu) {{ 
  Write-Progress "Registering Microsoft Update service for driver updates..."
  try {{ 
    if (Get-Command -Name Add-WUServiceManager -ErrorAction SilentlyContinue) {{
      Add-WUServiceManager -MicrosoftUpdate -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
      Write-Success "Microsoft Update service registered"
    }} else {{
      Write-Warning "Add-WUServiceManager command not available"
      $out.warnings += "Microsoft Update service registration not available"
    }}
  }} catch {{ 
    Write-Warning "Could not register Microsoft Update service: $_"
    $out.errors += [pscustomobject]@{{ where='Add-WUServiceManager'; message=$_ | Out-String }}
  }}
}}

function Invoke-GetUpdates([bool]$useMU, [string]$stage) {{
  try {{
    Write-Progress "Scanning for available updates ($stage)..."
    if (Get-Command -Name Get-WindowsUpdate -ErrorAction SilentlyContinue) {{
      $out.meta.get_command = 'Get-WindowsUpdate'
      if ($useMU) {{ 
        $updates = Get-WindowsUpdate -MicrosoftUpdate -ErrorAction SilentlyContinue
      }} else {{ 
        $updates = Get-WindowsUpdate -ErrorAction SilentlyContinue
      }}
      if ($updates) {{
        Write-Info "Found $($updates.Count) update(s) using Get-WindowsUpdate"
      }}
      return $updates
    }} elseif (Get-Command -Name Get-WUList -ErrorAction SilentlyContinue) {{
      $out.meta.get_command = 'Get-WUList'
      if ($useMU) {{ 
        $updates = Get-WUList -MicrosoftUpdate -ErrorAction SilentlyContinue
      }} else {{ 
        $updates = Get-WUList -ErrorAction SilentlyContinue
      }}
      if ($updates) {{
        Write-Info "Found $($updates.Count) update(s) using Get-WUList"
      }}
      return $updates
    }} else {{
      $out.meta.get_command = $null
      Write-Error "No Windows Update query command available"
      return @()
    }}
  }} catch {{ 
    Write-Error "Failed to query updates ($stage): $_"
    $out.errors += [pscustomobject]@{{ where="GetUpdates-$stage"; message=$_ | Out-String }}
    return @()
  }}
}}

function Invoke-InstallUpdates([bool]$useMU, [bool]$acceptAll, [bool]$ignoreReboot) {{
  try {{
    Write-Progress "Installing updates..."
    Write-Info "Options: AcceptAll=$acceptAll, IgnoreReboot=$ignoreReboot, MicrosoftUpdate=$useMU"
    
    if (Get-Command -Name Install-WindowsUpdate -ErrorAction SilentlyContinue) {{
      $out.meta.install_command = 'Install-WindowsUpdate'
      Write-Info "Using Install-WindowsUpdate command"
      if ($useMU) {{ 
        $results = Install-WindowsUpdate -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -MicrosoftUpdate -Confirm:$false -ErrorAction Continue
      }} else {{ 
        $results = Install-WindowsUpdate -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -Confirm:$false -ErrorAction Continue
      }}
      
      # Report progress for each update
      if ($results) {{
        foreach ($r in $results) {{
          $status = $r.Result
          $kb = $r.KB
          if (-not $kb -and $r.KBArticleIDs) {{ $kb = ($r.KBArticleIDs -join ',') }}
          if ($status -match 'Installed') {{
            Write-Success "Installed: $kb - $($r.Title)"
          }} elseif ($status -match 'Downloaded') {{
            Write-Info "Downloaded: $kb - $($r.Title)"
          }} elseif ($status -match 'Accepted') {{
            Write-Info "Accepted: $kb - $($r.Title)"
          }} elseif ($status -match 'Failed') {{
            Write-Error "Failed: $kb - $($r.Title)"
          }}
        }}
      }}
      return $results
    }} elseif (Get-Command -Name Get-WUInstall -ErrorAction SilentlyContinue) {{
      $out.meta.install_command = 'Get-WUInstall'
      Write-Info "Using Get-WUInstall command"
      if ($useMU) {{ 
        $results = Get-WUInstall -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -MicrosoftUpdate -Confirm:$false -ErrorAction Continue
      }} else {{ 
        $results = Get-WUInstall -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -Confirm:$false -ErrorAction Continue
      }}
      
      # Report progress
      if ($results) {{
        foreach ($r in $results) {{
          $status = $r.Result
          $kb = $r.KB
          if ($status -match 'Installed') {{
            Write-Success "Installed: $kb"
          }} elseif ($status -match 'Failed') {{
            Write-Error "Failed: $kb"
          }}
        }}
      }}
      return $results
    }} else {{
      $out.meta.install_command = $null
      Write-Error "No Windows Update install command available"
      return @()
    }}
  }} catch {{ 
    Write-Error "Failed to install updates: $_"
    $out.errors += [pscustomobject]@{{ where='InstallUpdates'; message=$_ | Out-String }}
    return @()
  }}
}}

# Pre-scan
Write-Progress "========================================="
Write-Progress "Phase 1: Pre-installation Scan"
Write-Progress "========================================="
$t0 = Get-Date
try {{
  $pre = Invoke-GetUpdates $mu 'pre-scan'
}} catch {{ 
  $pre = @()
  Write-Error "Pre-scan failed: $_"
  $out.errors += [pscustomobject]@{{ where='pre_scan'; message=$_ | Out-String }}
}}
if ($null -eq $pre) {{ $pre = @() }}
$preItems = @()
foreach ($u in $pre) {{ 
  $item = As-ItemObject $u 'available'
  if ($item) {{
    $preItems += $item
    Write-Info "  - $($item.KB): $($item.Title) ($($item.Size))"
  }}
}}
$preWindows = @($preItems | Where-Object {{ -not $_.IsDriver }})
$preDrivers = @($preItems | Where-Object {{ $_.IsDriver }})
$out.pre_scan = @{{ 
  count_total = $preItems.Count
  count_windows = $preWindows.Count
  count_driver = $preDrivers.Count
  items = $preItems
}}
$scanDuration = ((Get-Date) - $t0).TotalSeconds
$out.timings = @{{ pre_scan_seconds = $scanDuration }}

if ($preItems.Count -eq 0) {{
  Write-Success "No updates available"
}} else {{
  Write-Info "Found $($preItems.Count) total update(s): $($preWindows.Count) Windows, $($preDrivers.Count) driver(s)"
  Write-Info "Pre-scan completed in $([Math]::Round($scanDuration, 1)) seconds"
}}

# Install
Write-Progress "========================================="
Write-Progress "Phase 2: Installing Updates"
Write-Progress "========================================="
$installItems = @()
$t1 = Get-Date

if ($preItems.Count -eq 0) {{
  Write-Info "Skipping installation phase (no updates available)"
  $out.install = @{{
    count_installed = 0
    count_downloaded = 0
    count_failed = 0
    count_accepted = 0
    count_windows_installed = 0
    count_driver_installed = 0
    items = @()
  }}
}} else {{
  try {{
    $inst = Invoke-InstallUpdates $mu $acceptAll $ignoreReboot
  }} catch {{ 
    $inst = @()
    Write-Error "Installation failed: $_"
    $out.errors += [pscustomobject]@{{ where='install'; message=$_ | Out-String }}
  }}
  
  if ($null -eq $inst) {{ $inst = @() }}
  foreach ($r in $inst) {{ 
    $item = As-ItemObject $r 'installed'
    if ($item) {{ $installItems += $item }}
  }}
  
  $accepted = @($installItems | Where-Object {{ $_.Result -match 'Accepted' }})
  $downloaded = @($installItems | Where-Object {{ $_.Result -match 'Downloaded' }})
  $installed = @($installItems | Where-Object {{ $_.Result -match 'Installed' }})
  $failed = @($installItems | Where-Object {{ $_.Result -match 'Failed' }})
  $instWindows = @($installItems | Where-Object {{ -not $_.IsDriver }})
  $instDrivers = @($installItems | Where-Object {{ $_.IsDriver }})
  
  $out.install = @{{
    count_accepted = $accepted.Count
    count_downloaded = $downloaded.Count
    count_installed = $installed.Count
    count_failed = $failed.Count
    count_windows_installed = ($instWindows | Where-Object {{ $_.Result -match 'Installed' }}).Count
    count_driver_installed = ($instDrivers | Where-Object {{ $_.Result -match 'Installed' }}).Count
    items = $installItems
  }}
  
  $installDuration = ((Get-Date) - $t1).TotalSeconds
  $out.timings.install_seconds = $installDuration
  
  Write-Info "Installation phase completed in $([Math]::Round($installDuration, 1)) seconds"
  Write-Info "Summary: $($installed.Count) installed, $($downloaded.Count) downloaded, $($failed.Count) failed"
  
  if ($failed.Count -gt 0) {{
    Write-Warning "Some updates failed to install:"
    foreach ($f in $failed) {{
      Write-Warning "  - $($f.KB): $($f.Title)"
    }}
  }}
}}

# Post-scan
Write-Progress "========================================="
Write-Progress "Phase 3: Post-installation Verification"
Write-Progress "========================================="
$t2 = Get-Date
try {{
  $post = Invoke-GetUpdates $mu 'post-scan'
}} catch {{ 
  $post = @()
  Write-Error "Post-scan failed: $_"
  $out.errors += [pscustomobject]@{{ where='post_scan'; message=$_ | Out-String }}
}}
if ($null -eq $post) {{ $post = @() }}
$postItems = @()
foreach ($u in $post) {{ 
  $item = As-ItemObject $u 'remaining'
  if ($item) {{
    $postItems += $item
    Write-Warning "  - Remaining: $($item.KB): $($item.Title)"
  }}
}}
$postDuration = ((Get-Date) - $t2).TotalSeconds
$out.post_scan = @{{ count_remaining = $postItems.Count; items = $postItems }}
$out.timings.post_scan_seconds = $postDuration

if ($postItems.Count -eq 0) {{
  Write-Success "All available updates installed"
}} else {{
  Write-Warning "$($postItems.Count) update(s) still pending (may require reboot or have dependencies)"
}}

Write-Progress "Checking reboot requirement..."
$out.reboot_required = (Get-RebootRequired)
if ($out.reboot_required) {{
  Write-Warning "System reboot is required to complete updates"
}} else {{
  Write-Info "No reboot currently required"
}}

# Calculate total duration
$totalDuration = ((Get-Date) - $startTime).TotalSeconds
$out.timings.total_seconds = $totalDuration

# Human summary
Write-Progress "========================================="
Write-Progress "Summary"
Write-Progress "========================================="

$notes = @()
$details = @()

if ($out.install.count_accepted -gt 0) {{ 
  $notes += ("Accepted: $($out.install.count_accepted)")
  $details += "$($out.install.count_accepted) update(s) accepted"
}}
if ($out.install.count_downloaded -gt 0) {{ 
  $notes += ("Downloaded: $($out.install.count_downloaded)")
  $details += "$($out.install.count_downloaded) update(s) downloaded"
}}
if ($out.install.count_installed -gt 0) {{ 
  $notes += ("Installed: $($out.install.count_installed)")
  $details += "$($out.install.count_installed) update(s) installed successfully"
  Write-Success "$($out.install.count_installed) update(s) installed"
}}
if ($out.install.count_failed -gt 0) {{ 
  $notes += ("Failed: $($out.install.count_failed)")
  $details += "$($out.install.count_failed) update(s) failed"
  Write-Error "$($out.install.count_failed) update(s) failed"
}}
if ($out.reboot_required) {{ 
  $notes += 'Reboot required'
  $details += 'System reboot required to complete installation'
  Write-Warning "Reboot required"
}}
if ($out.post_scan.count_remaining -gt 0) {{ 
  $notes += ("Remaining: $($out.post_scan.count_remaining)")
  $details += "$($out.post_scan.count_remaining) update(s) still available"
  Write-Info "$($out.post_scan.count_remaining) update(s) remaining"
}}

$verdict = 'up-to-date'
if ($out.install.count_failed -gt 0) {{
  $verdict = 'completed-with-errors'
}} elseif ($out.install.count_installed -gt 0) {{
  $verdict = 'updated'
}} elseif ($out.post_scan.count_remaining -gt 0) {{
  $verdict = 'updates-remaining'
}} elseif ($preItems.Count -eq 0) {{
  $verdict = 'up-to-date'
  $details += 'System is fully up to date'
  Write-Success "System is up to date"
}}

$out.human_readable = @{{ 
  verdict = $verdict
  notes = $notes
  details = $details
  summary_line = ($notes -join '; ')
}}

Write-Info "Total operation time: $([Math]::Round($totalDuration, 1)) seconds"
Write-Progress "========================================="

$out | ConvertTo-Json -Depth 8
"""


def run_windows_update(task: Dict[str, Any]) -> Dict[str, Any]:
    """Search for and install Windows and driver updates via PSWindowsUpdate.

    Streams real-time progress to stderr for UI feedback and returns structured results.
    """
    add_breadcrumb(
        "Starting Windows Update",
        category="task",
        level="info",
        data={
            "microsoft_update": task.get("microsoft_update", True),
            "accept_all": task.get("accept_all", True),
        },
    )

    start_time = time.time()

    if os.name != "nt":
        logger.error("Windows Update service is only supported on Windows")
        _flush_stderr()
        return {
            "task_type": "windows_update",
            "status": "failure",
            "summary": {
                "error": "Windows Update service is only supported on Windows.",
                "duration_seconds": 0,
            },
        }

    microsoft_update = bool(task.get("microsoft_update", True))
    accept_all = bool(task.get("accept_all", True))
    ignore_reboot = bool(task.get("ignore_reboot", True))

    logger.info("Windows Update Configuration:")
    logger.info(f"  - Microsoft Update (drivers): {microsoft_update}")
    logger.info(f"  - Accept All: {accept_all}")
    logger.info(f"  - Ignore Reboot: {ignore_reboot}")
    _flush_stderr()

    script = _build_ps_script(microsoft_update, accept_all, ignore_reboot)

    logger.info("Executing Windows Update PowerShell script...")
    _flush_stderr()

    add_breadcrumb(
        "Executing Windows Update (may take several minutes)",
        category="subprocess",
        level="info",
    )

    res = _powershell_json(script)

    duration = time.time() - start_time

    if not res.get("ok"):
        error_msg = res.get("error") or "PowerShell execution failed"
        logger.error(f"Windows Update failed: {error_msg}")
        logger.error(f"Exit code: {res.get('exit_code')}")

        stderr_text = res.get("stderr") or ""
        if stderr_text:
            # Log relevant error lines (skip [WU] prefixed lines as they're already logged)
            for line in stderr_text.split("\n")[:20]:  # First 20 lines
                line = line.strip()
                if line and not line.startswith("[WU]"):
                    logger.error(f"PS Error: {line}")
        _flush_stderr()

        return {
            "task_type": "windows_update",
            "status": "failure",
            "summary": {
                "error": error_msg,
                "exit_code": res.get("exit_code"),
                "stderr_excerpt": stderr_text[:2000],
                "stdout_excerpt_on_error": (res.get("stdout") or "")[:2000],
                "duration_seconds": duration,
            },
        }

    data = res.get("data") or {}

    # Determine overall status based on results
    status = "success"
    try:
        install = data.get("install") or {}
        failed_count = install.get("count_failed") or 0
        installed_count = install.get("count_installed") or 0

        # Check module availability first
        meta = data.get("meta") or {}
        if not meta.get("module_available", False):
            status = "failure"
            logger.error("PSWindowsUpdate module not available")
        elif failed_count > 0:
            status = "completed_with_errors"
            logger.warning(f"{failed_count} update(s) failed to install")
        elif installed_count > 0:
            logger.info(f"Successfully installed {installed_count} update(s)")
        else:
            logger.info("No updates were installed")

        # Check for errors in execution
        errors = data.get("errors")
        if errors and isinstance(errors, list) and len(errors) > 0:
            if status == "success":
                status = "completed_with_errors"
            logger.warning(f"Encountered {len(errors)} error(s) during execution")

    except Exception as e:
        logger.error(f"Error processing Windows Update results: {e}")
        status = "completed_with_errors"

    _flush_stderr()

    # Build summary with all data
    summary: Dict[str, Any] = {
        **data,
        "exit_code": res.get("exit_code"),
        "stderr_excerpt": (res.get("stderr") or "")[
            -2000:
        ],  # Last 2000 chars for context
        "duration_seconds": duration,
    }

    # Add human-readable summary to logs
    try:
        hr = data.get("human_readable") or {}
        verdict = hr.get("verdict", "unknown")
        summary_line = hr.get("summary_line", "")

        logger.info("=" * 50)
        logger.info(f"Windows Update Result: {verdict.upper()}")
        if summary_line:
            logger.info(f"Summary: {summary_line}")

        details = hr.get("details", [])
        if details:
            for detail in details:
                logger.info(f"  - {detail}")

        logger.info(f"Completed in {duration:.1f} seconds")
        logger.info("=" * 50)
        _flush_stderr()
    except Exception:
        pass

    add_breadcrumb(
        f"Windows Update completed: {status}",
        category="task",
        level="info"
        if status == "success"
        else "warning"
        if status == "completed_with_errors"
        else "error",
        data={
            "installed_count": data.get("install", {}).get("count_installed", 0),
            "failed_count": data.get("install", {}).get("count_failed", 0),
            "reboot_required": data.get("reboot_required", False),
            "duration_seconds": round(duration, 1),
        },
    )

    return {
        "task_type": "windows_update",
        "status": status,
        "summary": summary,
    }


__all__ = ["run_windows_update"]
