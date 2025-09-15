//! Load and persist application settings to the portable data directory.
//!
//! Responsibilities:
//! - Compute the `data/settings/app_settings.json` path under the configured data root
//! - Load user settings as JSON (empty object if the file is missing)
//! - Save settings as pretty-printed JSON, creating parent directories when needed
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{paths, state::AppState};

// Build the full path to the app settings JSON within the `settings` directory.
fn settings_file_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("app_settings.json")
}

#[tauri::command]
/// Load the application settings from `data/settings/app_settings.json`.
///
/// Returns an empty JSON object when the file does not exist. Any parse error
/// from an existing file is surfaced as a user-facing error string.
pub fn load_app_settings(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let path = settings_file_path(state.data_dir.as_path());
    match fs::read_to_string(&path) {
        // File exists: attempt to parse the JSON content into a generic Value.
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|e| format!("Failed to parse settings: {}", e)),
        // Missing file (or other read error): fall back to an empty object.
        Err(_) => Ok(serde_json::json!({})),
    }
}

#[tauri::command]
/// Save the provided application settings to `data/settings/app_settings.json`.
///
/// Ensures the parent directory exists and writes pretty-printed JSON for readability.
pub fn save_app_settings(
    state: tauri::State<AppState>,
    data: serde_json::Value,
) -> Result<(), String> {
    let path = settings_file_path(state.data_dir.as_path());
    if let Some(parent) = path.parent() {
        // Ensure the `settings/` directory exists before writing the file.
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Store human-readable JSON to simplify manual inspection and diffs.
    let pretty = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}
