// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod paths;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};
use uuid::Uuid;
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
    use std::sync::Arc;
    use tauri::Manager;

    #[derive(Clone)]
    struct AppState { data_dir: Arc<std::path::PathBuf> }

    #[tauri::command]
    fn get_data_dirs(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
        let data_root = state.data_dir.as_path();
        let (reports, programs, settings, resources) = crate::paths::subdirs(data_root);
        Ok(serde_json::json!({
            "data": data_root,
            "reports": reports,
            "programs": programs,
            "settings": settings,
            "resources": resources,
        }))
    }

    let data_root = crate::paths::resolve_data_dir();
    if let Err(e) = crate::paths::ensure_structure(&data_root) {
        eprintln!("Failed to ensure data structure at {:?}: {}", data_root, e);
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct ProgramEntry {
        pub id: Uuid,
        pub name: String,
        pub version: String,
        pub description: String,
        pub exe_path: String,
        // Data URL (e.g., data:image/png;base64,....) or empty string if not set
        pub logo_data_url: String,
    }

    #[tauri::command]
    fn list_programs(state: tauri::State<AppState>) -> Result<Vec<ProgramEntry>, String> {
        let data_root = state.data_dir.as_path();
        let settings_path = programs_json_path(data_root);
        let mut list = read_programs_file(&settings_path);
        // One-time migration: store exe_path relative to data dir when possible
        let mut changed = false;
        for p in &mut list {
            let exe_p = PathBuf::from(&p.exe_path);
            if exe_p.is_absolute() {
                if let Ok(stripped) = exe_p.strip_prefix(data_root) {
                    p.exe_path = stripped.to_string_lossy().to_string();
                    changed = true;
                }
            }
        }
        if changed {
            // Best-effort write; ignore error in listing path
            let _ = write_programs_file(&settings_path, &list);
        }
        Ok(list)
    }

    #[tauri::command]
    fn save_program(state: tauri::State<AppState>, mut program: ProgramEntry) -> Result<(), String> {
        let settings_path = programs_json_path(state.data_dir.as_path());
        // If no logo provided by frontend, try to extract one here
        if program.logo_data_url.is_empty() {
            if let Ok(Some(url)) = get_logo_from_exe(state.data_dir.as_path(), &program.exe_path) {
                program.logo_data_url = url;
            }
        }
        // Convert exe_path to relative (to data dir) if applicable
        let exe_p = std::path::PathBuf::from(&program.exe_path);
        if exe_p.is_absolute() {
            let data_root = state.data_dir.as_path();
            if let Ok(stripped) = exe_p.strip_prefix(data_root) {
                program.exe_path = stripped.to_string_lossy().to_string();
            }
        }
        let mut list = read_programs_file(&settings_path);
        match list.iter_mut().find(|p| p.id == program.id) {
            Some(existing) => *existing = program,
            None => list.push(program),
        }
        write_programs_file(&settings_path, &list)
    }

    #[tauri::command]
    fn remove_program(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
        let settings_path = programs_json_path(state.data_dir.as_path());
        let mut list = read_programs_file(&settings_path);
        list.retain(|p| p.id != id);
        write_programs_file(&settings_path, &list)
    }

    #[tauri::command]
    fn launch_program(state: tauri::State<AppState>, program: ProgramEntry) -> Result<(), String> {
        #[cfg(not(windows))]
        { return Err("Programs launch only supported on Windows".into()); }
        #[cfg(windows)]
        {
            use std::process::Command;
            let exe_full = resolve_exe_path(state.data_dir.as_path(), &program.exe_path);
            // Use PowerShell Start-Process for robust path handling
            let ps = format!("Start-Process -FilePath \"{}\"", exe_full.replace('`', "``").replace('"', "`\""));
            Command::new("powershell.exe")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start program: {}", e))
        }
    }

    #[tauri::command]
    fn suggest_logo_from_exe(state: tauri::State<AppState>, exe_path: String) -> Result<Option<String>, String> {
        get_logo_from_exe(state.data_dir.as_path(), &exe_path)
    }

    fn get_logo_from_exe(data_root: &Path, exe_path: &str) -> Result<Option<String>, String> {
        // Windows-only icon extraction using exeico; otherwise fallback heuristics
        let p0 = PathBuf::from(exe_path);
        let p = if p0.is_absolute() { p0 } else { data_root.join(&p0) };
        #[cfg(windows)]
        {
            if let Ok(bytes) = exeico::get_exe_ico(&p) {
                if let Ok(png_data_url) = ico_bytes_to_png_data_url(&bytes) {
                    return Ok(Some(png_data_url));
                }
            }
        }
        // Heuristic: look for .ico or .png next to the exe
        if let Some(dir) = p.parent() {
            if let Some(stem) = p.file_stem() {
                let ico = dir.join(format!("{}.ico", stem.to_string_lossy()));
                if ico.exists() {
                    if let Ok(bytes) = fs::read(&ico) {
                        if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                    }
                    return Ok(load_image_data_url(&ico).ok());
                }
                let png = dir.join(format!("{}.png", stem.to_string_lossy()));
                if png.exists() { return Ok(load_image_data_url(&png).ok()); }
            }
            if let Ok(read) = fs::read_dir(dir) {
                for entry in read.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        let ext_l = ext.to_ascii_lowercase();
                        if ext_l == "ico" {
                            if let Ok(bytes) = fs::read(&path) {
                                if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                            }
                            return Ok(load_image_data_url(&path).ok());
                        } else if ext_l == "png" {
                            return Ok(load_image_data_url(&path).ok());
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    fn ico_bytes_to_png_data_url(ico_bytes: &[u8]) -> Result<String, String> {
        let img = image::load_from_memory_with_format(ico_bytes, image::ImageFormat::Ico)
            .map_err(|e| format!("ICO decode failed: {}", e))?;
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| format!("PNG encode failed: {}", e))?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
        Ok(format!("data:image/png;base64,{}", b64))
    }

    #[tauri::command]
    fn read_image_as_data_url(path: String) -> Result<String, String> {
        load_image_data_url(Path::new(&path))
    }

    fn load_image_data_url(path: &Path) -> Result<String, String> {
        let bytes = fs::read(path).map_err(|e| format!("Failed to read image: {}", e))?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        let mime = match path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) {
            Some(ext) if ext == "png" => "image/png",
            Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
            Some(ext) if ext == "ico" => "image/x-icon",
            _ => "application/octet-stream",
        };
        Ok(format!("data:{};base64,{}", mime, b64))
    }

    fn programs_json_path(data_root: &Path) -> PathBuf {
        let (_reports, _programs, settings, _resources) = crate::paths::subdirs(data_root);
        settings.join("programs.json")
    }

    fn resolve_exe_path(data_root: &Path, exe_path: &str) -> String {
        let p = PathBuf::from(exe_path);
        if p.is_absolute() {
            exe_path.to_string()
        } else {
            data_root.join(p).to_string_lossy().to_string()
        }
    }

    fn read_programs_file(path: &Path) -> Vec<ProgramEntry> {
        if let Ok(data) = fs::read_to_string(path) {
            if let Ok(list) = serde_json::from_str::<Vec<ProgramEntry>>(&data) {
                return list;
            }
        }
        Vec::new()
    }

    fn write_programs_file(path: &Path, list: &Vec<ProgramEntry>) -> Result<(), String> {
        let parent = path.parent().ok_or_else(|| "Invalid settings path".to_string())?;
        if let Err(e) = fs::create_dir_all(parent) { return Err(e.to_string()); }
        let data = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())
    }

    tauri::Builder::default()
        .manage(AppState { data_dir: Arc::new(data_root) })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            launch_shortcut,
            get_data_dirs,
            list_programs,
            save_program,
            remove_program,
            launch_program,
            suggest_logo_from_exe,
            read_image_as_data_url
        ])
        .setup(|app| {
            // Optionally, set current directory to data dir for simpler relative paths
            if let Some(state) = app.state::<AppState>().inner().clone().data_dir.as_ref().to_str() {
                let _ = std::env::set_current_dir(state);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
