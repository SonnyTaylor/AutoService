// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod paths;

// New modules for organization
mod icons;
mod models;
mod programs;
mod scripts;
mod settings;
mod shortcuts;
mod state;
mod system;

use tauri::Manager;

// Bring command fns into scope for generate_handler!
use crate::icons::{read_image_as_data_url, suggest_logo_from_exe};
use crate::programs::{
    get_tool_statuses, launch_program, list_programs, remove_program, save_program,
};
use crate::scripts::{list_scripts, remove_script, run_script, save_script};
use crate::settings::{load_app_settings, save_app_settings};
use crate::shortcuts::launch_shortcut;
use crate::state::AppState;
use crate::system::get_system_info;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_data_dirs(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let data_root = state.data_dir.as_path();
    let (reports, programs, settings, resources) = crate::paths::subdirs(data_root);
    // Also expose the executable directory and expected sidecar path for convenience
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let sidecar_runner = exe_dir.join("binaries").join("service_runner.exe");
    Ok(serde_json::json!({
        "data": data_root,
        "reports": reports,
        "programs": programs,
        "settings": settings,
        "resources": resources,
        "exe_dir": exe_dir,
        "sidecar_runner": sidecar_runner,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;

    let data_root = crate::paths::resolve_data_dir();
    if let Err(e) = crate::paths::ensure_structure(&data_root) {
        eprintln!("Failed to ensure data structure at {:?}: {}", data_root, e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            data_dir: Arc::new(data_root),
        })
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
            get_tool_statuses,
            list_scripts,
            save_script,
            remove_script,
            run_script,
            suggest_logo_from_exe,
            read_image_as_data_url,
            get_system_info,
            load_app_settings,
            save_app_settings
        ])
        .setup(|app| {
            // Optionally, set current directory to data dir for simpler relative paths
            if let Some(state) = app
                .state::<AppState>()
                .inner()
                .clone()
                .data_dir
                .as_ref()
                .to_str()
            {
                let _ = std::env::set_current_dir(state);
                // Configure WebView2 user data folder to live inside portable data dir for persistence across PCs
                // This ensures cookies/localStorage for technician links stay on the USB drive.
                let webview_profile = std::path::Path::new(state).join("webview_profile");
                if std::fs::create_dir_all(&webview_profile).is_ok() {
                    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_profile);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
