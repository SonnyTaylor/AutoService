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

        fn spawn(program: &str, args: &[&str]) -> Result<(), String> {
            Command::new(program)
                .args(args)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to launch {}: {}", program, e))
        }

        match id {
            // Control Panel and classic CPLs
            "control_panel" => spawn("control.exe", &[]),
            "power_options" => spawn("control.exe", &["powercfg.cpl"]),
            "programs_features" => spawn("control.exe", &["appwiz.cpl"]),
            "internet_options" => spawn("control.exe", &["inetcpl.cpl"]),
            "printers" => spawn("control.exe", &["printers"]),
            "network_connections" => spawn("control.exe", &["ncpa.cpl"]),
            "firewall_control" => spawn("control.exe", &["firewall.cpl"]),
            "user_accounts_advanced" => spawn("control.exe", &["userpasswords2"]),
            "netplwiz" => spawn("netplwiz.exe", &[]),

            // MMC / MSC consoles (open via mmc)
            "device_manager" => spawn("mmc.exe", &["devmgmt.msc"]),
            "disk_management" => spawn("mmc.exe", &["diskmgmt.msc"]),
            "services" => spawn("mmc.exe", &["services.msc"]),
            "event_viewer" => spawn("mmc.exe", &["eventvwr.msc"]),
            "computer_management" => spawn("mmc.exe", &["compmgmt.msc"]),
            "firewall_advanced" => spawn("mmc.exe", &["wf.msc"]),
            "local_users_groups" => spawn("mmc.exe", &["lusrmgr.msc"]),
            "local_security_policy" => spawn("mmc.exe", &["secpol.msc"]),
            "group_policy" => spawn("mmc.exe", &["gpedit.msc"]),

            // System tools
            "task_manager" => spawn("taskmgr.exe", &[]),
            "system_properties" => spawn("sysdm.cpl", &[]),
            "system_information" => spawn("msinfo32.exe", &[]),
            "performance_monitor" => spawn("perfmon.exe", &[]),
            "resource_monitor" => spawn("resmon.exe", &[]),
            "directx_diag" => spawn("dxdiag.exe", &[]),
            "disk_cleanup" => spawn("cleanmgr.exe", &[]),
            "windows_features" => spawn("optionalfeatures.exe", &[]),
            "optimize_drives" => spawn("dfrgui.exe", &[]),
            "system_config" => spawn("msconfig.exe", &[]),
            "diskpart" => spawn("diskpart.exe", &[]),

            // Consoles
            "cmd" => spawn("cmd.exe", &[]),
            "cmd_admin" => spawn("powershell.exe", &["-Command", "Start-Process cmd -Verb runAs"]),
            "powershell" => spawn("powershell.exe", &[]),
            "powershell_admin" => spawn("powershell.exe", &["-Command", "Start-Process PowerShell -Verb runAs"]),

            // Utilities
            "notepad" => spawn("notepad.exe", &[]),
            "calculator" => spawn("calc.exe", &[]),
            "snipping_tool" => spawn("snippingtool.exe", &[]),
            "paint" => spawn("mspaint.exe", &[]),
            "character_map" => spawn("charmap.exe", &[]),
            "remote_desktop" => spawn("mstsc.exe", &[]),
            "remote_assistance" => spawn("msra.exe", &[]),
            "on_screen_keyboard" => spawn("osk.exe", &[]),
            "magnifier" => spawn("magnify.exe", &[]),
            "narrator" => spawn("narrator.exe", &[]),
            "msrt" => spawn("mrt.exe", &[]),
            "registry_editor" => spawn("regedit.exe", &[]),
            "about_windows" => spawn("winver.exe", &[]),

            // Settings URIs via explorer (opens Windows Settings pages)
            "settings_power_sleep" => spawn("explorer.exe", &["ms-settings:powersleep"]),
            "settings_update" => spawn("explorer.exe", &["ms-settings:windowsupdate"]),
            "settings_apps_features" => spawn("explorer.exe", &["ms-settings:appsfeatures"]),
            "settings_network" => spawn("explorer.exe", &["ms-settings:network"]),
            "settings_windows_security" => spawn("explorer.exe", &["windowsdefender:"]),
            "control_troubleshooting" => spawn("control.exe", &["/name", "Microsoft.Troubleshooting"]),

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
