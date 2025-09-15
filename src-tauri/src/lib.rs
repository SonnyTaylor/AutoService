//! # AutoService Tauri Application
//!
//! This is the main entry point for AutoService.
//! Provides a GUI for managing system tools, programs, scripts, and settings.

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Module declarations for organizing code
mod icons;
mod models;
mod paths;
mod programs;
mod scripts;
mod settings;
mod shortcuts;
mod state;
mod system;

use tauri::Manager;

// Import command functions to bring them into scope for the handler
use crate::icons::{read_image_as_data_url, suggest_logo_from_exe};
use crate::programs::{
    get_tool_statuses, launch_program, list_programs, remove_program, save_program,
};
use crate::scripts::{list_scripts, remove_script, run_script, save_script};
use crate::settings::{load_app_settings, save_app_settings};
use crate::shortcuts::launch_shortcut;
use crate::state::AppState;
use crate::system::get_system_info;

/// A simple greeting command for testing IPC communication.
///
/// This command demonstrates basic Tauri command functionality and can be used
/// for testing the connection between the Rust backend and frontend.
///
/// # Arguments
/// * `name` - The name to include in the greeting message
///
/// # Returns
/// A formatted greeting string
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Retrieves information about the application's data directories.
///
/// This command provides paths to various data directories used by the application,
/// including reports, programs, settings, and resources. It also includes the
/// executable directory and sidecar runner path for convenience.
///
/// # Arguments
/// * `state` - The application state containing the data directory path
///
/// # Returns
/// A JSON object containing all directory paths, or an error message on failure
#[tauri::command]
fn get_data_dirs(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    // Get the root data directory from application state
    let data_root = state.data_dir.as_path();

    // Get subdirectories using the paths module
    let (reports, programs, settings, resources) = crate::paths::subdirs(data_root);

    // Determine the executable directory for sidecar binaries
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    // Path to the service runner sidecar executable
    let sidecar_runner = exe_dir.join("binaries").join("service_runner.exe");

    // Return all paths as a JSON object
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

/// Main entry point for the Tauri application.
///
/// This function sets up the Tauri application with all necessary plugins,
/// state management, and command handlers. It also ensures the data directory
/// structure is created before starting the application.
///
/// # Panics
/// Panics if the Tauri application fails to run
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;

    // Resolve and ensure the data directory structure exists
    let data_root = crate::paths::resolve_data_dir();
    if let Err(e) = crate::paths::ensure_structure(&data_root) {
        eprintln!("Failed to ensure data structure at {:?}: {}", data_root, e);
    }

    // Build the Tauri application with plugins and state
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) // Shell plugin for running external commands
        .manage(AppState {
            data_dir: Arc::new(data_root), // Manage application state with data directory
        })
        .plugin(tauri_plugin_opener::init()) // Opener plugin for opening files/URLs
        .plugin(tauri_plugin_dialog::init()) // Dialog plugin for file/folder dialogs
        .invoke_handler(tauri::generate_handler![
            // List of all Tauri commands exposed to the frontend
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
            // Setup function called after the app is initialized
            // Configure WebView2 user data folder for persistence in portable mode
            if let Some(data_dir_str) = app
                .state::<AppState>()
                .inner()
                .clone()
                .data_dir
                .as_ref()
                .to_str()
            {
                let webview_profile = std::path::Path::new(data_dir_str).join("webview_profile");
                if std::fs::create_dir_all(&webview_profile).is_ok() {
                    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_profile);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
