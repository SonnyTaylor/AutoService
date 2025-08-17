// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod paths;

// New modules for organization
mod state;
mod models;
mod icons;
mod programs;
mod shortcuts;
mod system;

use tauri::Manager;

// Bring command fns into scope for generate_handler!
use crate::icons::{read_image_as_data_url, suggest_logo_from_exe};
use crate::programs::{launch_program, list_programs, remove_program, save_program};
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
    Ok(serde_json::json!({
        "data": data_root,
        "reports": reports,
        "programs": programs,
        "settings": settings,
        "resources": resources,
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
            read_image_as_data_url,
            get_system_info
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
