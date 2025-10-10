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

#[tauri::command]
/// Convert an absolute file path to a portable relative path from the data directory.
///
/// This is useful for storing paths to resources (like logos) that should be portable
/// across different drive letters when running from a USB drive.
///
/// # Arguments
/// * `state` - The application state containing the data directory path
/// * `absolute_path` - The absolute file path to convert
///
/// # Returns
/// A relative path string starting with "data/" if the file is within the data directory,
/// or the original path if it's outside the data directory.
///
/// # Examples
/// - Input: "Z:/Projects/AutoService/data/resources/logo.png"
/// - Output: "data/resources/logo.png"
pub fn make_portable_path(
    state: tauri::State<AppState>,
    absolute_path: String,
) -> Result<String, String> {
    let abs = PathBuf::from(&absolute_path);
    let data_root = state.data_dir.as_path();

    // Try to make the path relative to the data directory
    if let Ok(rel) = abs.strip_prefix(data_root) {
        // Convert to forward slashes for consistency and prepend "data/"
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        Ok(format!("data/{}", rel_str))
    } else {
        // Path is outside data directory - return as-is
        Ok(absolute_path)
    }
}

#[tauri::command]
/// Convert a portable relative path to an absolute path.
///
/// This resolves paths like "data/resources/logo.png" to their absolute equivalents
/// based on the current data directory location.
///
/// # Arguments
/// * `state` - The application state containing the data directory path
/// * `portable_path` - The portable path to resolve (e.g., "data/resources/logo.png")
///
/// # Returns
/// The absolute path to the resource, or the original path if it doesn't start with "data/"
///
/// # Examples
/// - Input: "data/resources/logo.png"
/// - Output: "Z:/Projects/AutoService/data/resources/logo.png"
pub fn resolve_portable_path(
    state: tauri::State<AppState>,
    portable_path: String,
) -> Result<String, String> {
    // Check if this is a portable path starting with "data/"
    if portable_path.starts_with("data/") || portable_path.starts_with("data\\") {
        let rel_path = portable_path
            .trim_start_matches("data/")
            .trim_start_matches("data\\");
        let abs_path = state.data_dir.join(rel_path);
        Ok(abs_path.to_string_lossy().to_string())
    } else {
        // Not a portable path - return as-is (could be URL or absolute path)
        Ok(portable_path)
    }
}
