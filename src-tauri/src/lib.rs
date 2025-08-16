// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn launch_shortcut(id: &str) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Err("Shortcuts are only supported on Windows".into());
    }

    #[cfg(windows)]
    {
        use std::process::Command;

        // Launch using cmd /c start "" <target> [args...] to detach from the current console
        fn start_detached(target: &str, args: &[&str]) -> Result<(), String> {
            let mut cmd = Command::new("cmd");
            cmd.args(["/c", "start", "", target]);
            if !args.is_empty() {
                cmd.args(args);
            }
            cmd.spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start '{}': {}", target, e))
        }

        // Elevate with UAC prompt
        fn start_elevated(target: &str, args: &[&str]) -> Result<(), String> {
            // Quote each argument for PowerShell -ArgumentList
            let arg_list = if args.is_empty() {
                String::new()
            } else {
                let joined = args
                    .iter()
                    .map(|a| a.replace('\'', "''"))
                    .map(|a| format!("'{}'", a))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(" -ArgumentList {}", joined)
            };
            let ps = format!("Start-Process '{}' -Verb runAs{}", target, arg_list);
            Command::new("powershell.exe")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to elevate '{}': {}", target, e))
        }

        match id {
            // Control Panel and classic CPLs
            "control_panel" => start_detached("control.exe", &[]),
            "power_options" => start_detached("control.exe", &["powercfg.cpl"]),
            "programs_features" => start_detached("control.exe", &["appwiz.cpl"]),
            "internet_options" => start_detached("control.exe", &["inetcpl.cpl"]),
            "printers" => start_detached("control.exe", &["printers"]),
            "network_connections" => start_detached("control.exe", &["ncpa.cpl"]),
            "firewall_control" => start_detached("control.exe", &["firewall.cpl"]),
            "user_accounts_advanced" => start_detached("control.exe", &["userpasswords2"]),
            "netplwiz" => start_detached("netplwiz.exe", &[]),

            // MMC / MSC consoles (open via mmc)
            "device_manager" => start_detached("devmgmt.msc", &[]),
            "disk_management" => start_detached("diskmgmt.msc", &[]),
            "services" => start_detached("services.msc", &[]),
            "event_viewer" => start_detached("eventvwr.msc", &[]),
            "computer_management" => start_detached("compmgmt.msc", &[]),
            "firewall_advanced" => start_detached("wf.msc", &[]),
            "local_users_groups" => start_detached("lusrmgr.msc", &[]),
            "local_security_policy" => start_detached("secpol.msc", &[]),
            "group_policy" => start_detached("gpedit.msc", &[]),

            // System tools
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

            // Consoles
            "cmd" => start_detached("cmd.exe", &[]),
            "cmd_admin" => start_elevated("cmd.exe", &[]),
            "powershell" => start_detached("powershell.exe", &[]),
            "powershell_admin" => start_elevated("powershell.exe", &[]),

            // Utilities
            "notepad" => start_detached("notepad.exe", &[]),
            "calculator" => start_detached("calc.exe", &[]),
            "snipping_tool" => start_detached("snippingtool.exe", &[]),
            "paint" => start_detached("mspaint.exe", &[]),
            "character_map" => start_detached("charmap.exe", &[]),
            "remote_desktop" => start_detached("mstsc.exe", &[]),
            "remote_assistance" => start_detached("msra.exe", &[]),
            "on_screen_keyboard" => start_detached("osk.exe", &[]),
            "magnifier" => start_detached("magnify.exe", &[]),
            "narrator" => start_detached("narrator.exe", &[]),
            "msrt" => start_detached("mrt.exe", &[]),
            "registry_editor" => start_detached("regedit.exe", &[]),
            "about_windows" => start_detached("winver.exe", &[]),

            // Settings URIs via explorer (opens Windows Settings pages)
            "settings_power_sleep" => start_detached("explorer.exe", &["ms-settings:powersleep"]),
            "settings_update" => start_detached("explorer.exe", &["ms-settings:windowsupdate"]),
            "settings_apps_features" => start_detached("explorer.exe", &["ms-settings:appsfeatures"]),
            "settings_network" => start_detached("explorer.exe", &["ms-settings:network"]),
            "settings_windows_security" => start_detached("explorer.exe", &["windowsdefender:"]),
            "control_troubleshooting" => start_detached("control.exe", &["/name", "Microsoft.Troubleshooting"]),

            _ => Err(format!("Unknown shortcut id: {}", id)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![greet, launch_shortcut])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
