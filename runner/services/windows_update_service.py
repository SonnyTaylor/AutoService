"""Windows Update service using PowerShell (PSWindowsUpdate).

Runs a PowerShell script to:
  1) Ensure NuGet provider and PSWindowsUpdate module are installed/trusted
  2) Query available updates (including Microsoft/driver updates)
  3) Install available updates with -AcceptAll -IgnoreReboot
  4) Query remaining updates and determine reboot requirement

Returns a structured JSON result that summarizes counts and installed items.

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
        count_installed, count_downloaded, count_failed,
        count_windows_installed, count_driver_installed,
        items: [ { Title, KB, Size, Category, Result, IsDriver } ... ]
      },
      post_scan: { count_remaining, items: [...] },
      reboot_required: bool,
      human_readable: { verdict, notes: [], summary_line },
      exit_code,
      stderr_excerpt,
      stdout_excerpt_on_error?
    }
  }
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any, Dict, List, Optional


def _powershell_json(script_text: str) -> Dict[str, Any]:
    """Run a PowerShell script file and parse its JSON stdout.

    Returns dict with keys: ok(bool), data|error(str), exit_code(int), stdout, stderr.
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
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        try:
            parsed = json.loads(stdout)
            return {
                "ok": True,
                "data": parsed,
                "exit_code": proc.returncode,
                "stdout": stdout,
                "stderr": stderr,
            }
        except json.JSONDecodeError:
            return {
                "ok": False,
                "error": "Failed to parse PowerShell JSON output",
                "exit_code": proc.returncode,
                "stdout": stdout,
                "stderr": stderr,
            }
    finally:
        try:
            os.unlink(ps1_path)
        except Exception:
            pass


def _build_ps_script(
    microsoft_update: bool, accept_all: bool, ignore_reboot: bool
) -> str:
    """Return a PowerShell script that emits structured JSON via ConvertTo-Json."""
    # Use single quotes for JSON keys in here-string, PowerShell will output proper JSON strings
    # The script creates a hashtable $out and converts it to JSON at the end.
    mu_ps = "$true" if microsoft_update else "$false"
    accept_ps = "$true" if accept_all else "$false"
    ignore_ps = "$true" if ignore_reboot else "$false"
    return f"""
$ErrorActionPreference = 'Continue'
function Ensure-NuGetProvider {{
  try {{ if (-not (Get-PackageProvider -Name NuGet -ListAvailable -ErrorAction SilentlyContinue)) {{
      Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers | Out-Null
    }} }} catch {{ }}
}}
function Ensure-PSGalleryTrusted {{
  try {{ $repo = Get-PSRepository -Name 'PSGallery' -ErrorAction SilentlyContinue; if ($repo -and $repo.InstallationPolicy -ne 'Trusted') {{
      Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted -ErrorAction SilentlyContinue
    }} }} catch {{ }}
}}
function Ensure-PSWindowsUpdateModule {{
  try {{ if (-not (Get-Module -ListAvailable -Name 'PSWindowsUpdate')) {{
      Ensure-NuGetProvider; Ensure-PSGalleryTrusted;
      Install-Module -Name 'PSWindowsUpdate' -Force -Scope AllUsers -AllowClobber -ErrorAction SilentlyContinue
    }} }} catch {{ }}
  Import-Module 'PSWindowsUpdate' -ErrorAction SilentlyContinue
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

function As-ItemObject($it, $stage) {{
  if ($null -eq $it) {{ return $null }}
  $title = $it.Title
  $kb = $it.KB
  if (-not $kb -and $it.KBArticleIDs) {{ $kb = ($it.KBArticleIDs -join ',') }}
  $size = $it.Size
  if (-not $size -and $it.SizeStr) {{ $size = $it.SizeStr }}
  $cat = $it.Category
  if (-not $cat -and $it.Categories) {{ $cat = ($it.Categories | ForEach-Object {{ $_.Name }}) -join ', ' }}
  $res = $it.Result
  $isDriver = $false
  try {{ $isDriver = ($cat -match 'driver') }} catch {{ $isDriver = $false }}
  [PSCustomObject]@{{
    Stage = $stage
    Title = $title
    KB = $kb
    Size = $size
    Category = $cat
    Result = $res
    IsDriver = [bool]$isDriver
  }}
}}

Ensure-PSWindowsUpdateModule

$out = @{{}}

$mu = {mu_ps}
$acceptAll = {accept_ps}
$ignoreReboot = {ignore_ps}

# Pre-scan
try {{
  if ($mu) {{ $pre = Get-WindowsUpdate -MicrosoftUpdate -ErrorAction SilentlyContinue }}
  else {{ $pre = Get-WindowsUpdate -ErrorAction SilentlyContinue }}
}} catch {{ $pre = @() }}
if ($null -eq $pre) {{ $pre = @() }}
$preItems = @(); foreach ($u in $pre) {{ $preItems += (As-ItemObject $u 'available') }}
$preWindows = @($preItems | Where-Object {{ -not $_.IsDriver }})
$preDrivers = @($preItems | Where-Object {{ $_.IsDriver }})
$out.pre_scan = @{{ count_total = $preItems.Count; count_windows = $preWindows.Count; count_driver = $preDrivers.Count; items = $preItems }}

# Install
$installItems = @();
try {{
  if ($mu) {{ $inst = Install-WindowsUpdate -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -MicrosoftUpdate -ErrorAction SilentlyContinue }}
  else {{ $inst = Install-WindowsUpdate -AcceptAll:$acceptAll -IgnoreReboot:$ignoreReboot -ErrorAction SilentlyContinue }}
}} catch {{ $inst = @() }}
if ($null -eq $inst) {{ $inst = @() }}
foreach ($r in $inst) {{ $installItems += (As-ItemObject $r 'installed') }}
$installed = @($installItems | Where-Object {{ $_.Result -match 'Installed' }})
$downloaded = @($installItems | Where-Object {{ $_.Result -match 'Downloaded' }})
$failed = @($installItems | Where-Object {{ $_.Result -match 'Failed' }})
$instWindows = @($installItems | Where-Object {{ -not $_.IsDriver }})
$instDrivers = @($installItems | Where-Object {{ $_.IsDriver }})
$out.install = @{{
  count_installed = $installed.Count;
  count_downloaded = $downloaded.Count;
  count_failed = $failed.Count;
  count_windows_installed = ($instWindows | Where-Object {{ $_.Result -match 'Installed' }}).Count;
  count_driver_installed = ($instDrivers | Where-Object {{ $_.Result -match 'Installed' }}).Count;
  items = $installItems
}}

# Post-scan
try {{
  if ($mu) {{ $post = Get-WindowsUpdate -MicrosoftUpdate -ErrorAction SilentlyContinue }}
  else {{ $post = Get-WindowsUpdate -ErrorAction SilentlyContinue }}
}} catch {{ $post = @() }}
if ($null -eq $post) {{ $post = @() }}
$postItems = @(); foreach ($u in $post) {{ $postItems += (As-ItemObject $u 'remaining') }}
$out.post_scan = @{{ count_remaining = $postItems.Count; items = $postItems }}

$out.reboot_required = (Get-RebootRequired)

# Human summary
$notes = @()
if ($out.install.count_failed -gt 0) {{ $notes += ("Failed: $($out.install.count_failed)") }}
if ($out.install.count_installed -gt 0) {{ $notes += ("Installed: $($out.install.count_installed)") }}
if ($out.reboot_required) {{ $notes += 'Reboot required' }}
if ($out.post_scan.count_remaining -gt 0) {{ $notes += ("Remaining: $($out.post_scan.count_remaining)") }}
$verdict = 'up-to-date'
if ($out.install.count_installed -gt 0) {{ $verdict = 'updated' }}
elseif ($out.post_scan.count_remaining -gt 0) {{ $verdict = 'updates-remaining' }}
$out.human_readable = @{{ verdict = $verdict; notes = $notes; summary_line = ($notes -join '; ') }}

$out | ConvertTo-Json -Depth 6
"""


def run_windows_update(task: Dict[str, Any]) -> Dict[str, Any]:
    """Search for and install Windows and driver updates via PSWindowsUpdate."""
    if os.name != "nt":
        return {
            "task_type": "windows_update",
            "status": "failure",
            "summary": {
                "error": "Windows Update service is only supported on Windows."
            },
        }

    microsoft_update = bool(task.get("microsoft_update", True))
    accept_all = bool(task.get("accept_all", True))
    ignore_reboot = bool(task.get("ignore_reboot", True))

    script = _build_ps_script(microsoft_update, accept_all, ignore_reboot)
    res = _powershell_json(script)

    if not res.get("ok"):
        return {
            "task_type": "windows_update",
            "status": "failure",
            "summary": {
                "error": res.get("error") or "PowerShell execution failed",
                "exit_code": res.get("exit_code"),
                "stderr_excerpt": (res.get("stderr") or "")[:1000],
                "stdout_excerpt_on_error": (res.get("stdout") or "")[:1000],
            },
        }

    data = res.get("data") or {}

    status = "success"
    try:
        install = data.get("install") or {}
        if (install.get("count_failed") or 0) > 0:
            status = "completed_with_errors"
    except Exception:
        status = "completed_with_errors"

    summary: Dict[str, Any] = {
        **data,
        "exit_code": res.get("exit_code"),
        "stderr_excerpt": (res.get("stderr") or "")[:1000],
    }

    return {
        "task_type": "windows_update",
        "status": status,
        "summary": summary,
    }


__all__ = ["run_windows_update"]
