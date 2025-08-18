use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{paths, state::AppState};

fn settings_file_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("app_settings.json")
}

#[tauri::command]
pub fn load_app_settings(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let path = settings_file_path(state.data_dir.as_path());
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|e| format!("Failed to parse settings: {}", e)),
        Err(_) => Ok(serde_json::json!({})),
    }
}

#[tauri::command]
pub fn save_app_settings(
    state: tauri::State<AppState>,
    data: serde_json::Value,
) -> Result<(), String> {
    let path = settings_file_path(state.data_dir.as_path());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pretty = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}
