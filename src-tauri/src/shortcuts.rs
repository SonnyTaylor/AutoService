//! Windows shortcut launcher
//!
//! This module defines a Tauri command (`launch_shortcut`) that launches
//! various built-in Windows tools, settings panels, and utilities by ID.
//!
//! On non-Windows platforms, this command returns an error since shortcuts
//! are not supported.

#[tauri::command]
/// Launches a Windows shortcut by ID.
///
/// # Parameters
/// - `id`: A string identifier for the shortcut to launch.
///
/// # Returns
/// - `Ok(())` if the shortcut was launched successfully.
/// - `Err(String)` with an error message if launching failed or if shortcuts
///   are not supported on the current platform.
///
/// # Notes
/// - Only supported on Windows.
/// - Some shortcuts require elevation (administrator privileges).
pub fn launch_shortcut(id: &str) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        // Shortcuts are unsupported outside Windows
        return Err("Shortcuts are only supported on Windows".into());
    }

    #[cfg(windows)]
    {
        use std::process::Command;

        /// Starts a process without elevation and detaches it.
        fn start_detached(target: &str, args: &[&str]) -> Result<(), String> {
            let mut cmd = Command::new("cmd");
            // `/c start "" <target>` launches in a new process/window
            cmd.args(["/c", "start", "", target]);

            // Append arguments if provided
            if !args.is_empty() {
                cmd.args(args);
            }

            // Spawn the process and handle errors
            cmd.spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start '{}': {}", target, e))
        }

        /// Starts a process with elevation (administrator rights).
        ///
        /// Uses PowerShell's `Start-Process ... -Verb runAs`.
        fn start_elevated(target: &str, args: &[&str]) -> Result<(), String> {
            // Prepare argument list if provided
            let arg_list = if args.is_empty() {
                String::new()
            } else {
                let joined = args
                    .iter()
                    // Escape single quotes
                    .map(|a| a.replace('\'', "''"))
                    // Wrap each argument in single quotes
                    .map(|a| format!("'{}'", a))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(" -ArgumentList {}", joined)
            };

            // PowerShell command for elevated launch
            let ps = format!("Start-Process '{}' -Verb runAs{}", target, arg_list);

            Command::new("powershell.exe")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to elevate '{}': {}", target, e))
        }

        // Match shortcut ID to its corresponding command
        match id {
            // Control Panel sections
            "control_panel" => start_detached("control.exe", &[]),
            "power_options" => start_detached("control.exe", &["powercfg.cpl"]),
            "programs_features" => start_detached("control.exe", &["appwiz.cpl"]),
            "internet_options" => start_detached("control.exe", &["inetcpl.cpl"]),
            "printers" => start_detached("control.exe", &["printers"]),
            "network_connections" => start_detached("control.exe", &["ncpa.cpl"]),
            "firewall_control" => start_detached("control.exe", &["firewall.cpl"]),
            "user_accounts_advanced" => start_detached("control.exe", &["userpasswords2"]),
            "netplwiz" => start_detached("netplwiz.exe", &[]),

            // System management tools
            "device_manager" => start_detached("devmgmt.msc", &[]),
            "disk_management" => start_detached("diskmgmt.msc", &[]),
            "services" => start_detached("services.msc", &[]),
            "event_viewer" => start_detached("eventvwr.msc", &[]),
            "computer_management" => start_detached("compmgmt.msc", &[]),
            "firewall_advanced" => start_detached("wf.msc", &[]),
            "local_users_groups" => start_detached("lusrmgr.msc", &[]),
            "local_security_policy" => start_detached("secpol.msc", &[]),
            "group_policy" => start_detached("gpedit.msc", &[]),

            // System utilities
            "task_manager" => start_detached("taskmgr.exe", &[]),
            "system_properties" => start_detached("sysdm.cpl", &[]),
            "system_information" => start_detached("msinfo32.exe", &[]),
            "performance_monitor" => start_detached("perfmon.exe", &[]),
            "resource_monitor" => start_detached("resmon.exe", &[]),
            "directx_diag" => start_detached("dxdiag.exe", &[]),
            "disk_cleanup" => start_detached("cleanmgr.exe", &[]),
            "windows_features" => start_detached("optionalfeatures.exe", &[]),
            "optimize_drives" => start_detached("dfrgui.exe", &[]),
            "system_config" => start_detached("msconfig.exe", &[]),
            "diskpart" => start_elevated("diskpart.exe", &[]),

            // Command-line & scripting
            "cmd" => start_detached("cmd.exe", &[]),
            "cmd_admin" => start_elevated("cmd.exe", &[]),
            "powershell" => start_detached("powershell.exe", &[]),
            "powershell_admin" => start_elevated("powershell.exe", &[]),

            // Common applications
            "notepad" => start_detached("notepad.exe", &[]),
            "calculator" => start_detached("calc.exe", &[]),
            "snipping_tool" => start_detached("snippingtool.exe", &[]),
            "paint" => start_detached("mspaint.exe", &[]),
            "character_map" => start_detached("charmap.exe", &[]),

            // Accessibility & assistance
            "remote_desktop" => start_detached("mstsc.exe", &[]),
            "remote_assistance" => start_detached("msra.exe", &[]),
            "on_screen_keyboard" => start_detached("osk.exe", &[]),
            "magnifier" => start_detached("magnify.exe", &[]),
            "narrator" => start_detached("narrator.exe", &[]),

            // Misc tools
            "msrt" => start_detached("mrt.exe", &[]),
            "registry_editor" => start_detached("regedit.exe", &[]),
            "about_windows" => start_detached("winver.exe", &[]),

            // Settings panels
            "settings_power_sleep" => start_detached("explorer.exe", &["ms-settings:powersleep"]),
            "settings_update" => start_detached("explorer.exe", &["ms-settings:windowsupdate"]),
            "settings_apps_features" => {
                start_detached("explorer.exe", &["ms-settings:appsfeatures"])
            }
            "settings_network" => start_detached("explorer.exe", &["ms-settings:network"]),
            "settings_windows_security" => start_detached("explorer.exe", &["windowsdefender:"]),

            // Troubleshooting
            "control_troubleshooting" => {
                start_detached("control.exe", &["/name", "Microsoft.Troubleshooting"])
            }

            // Unknown shortcut
            _ => Err(format!("Unknown shortcut id: {}", id)),
        }
    }
}
