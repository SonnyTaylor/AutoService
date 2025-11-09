//! Load and persist application settings to the portable data directory.
//!
//! Responsibilities:
//! - Compute the `data/settings/app_settings.json` path under the configured data root
//! - Load user settings as JSON (empty object if the file is missing)
//! - Save settings as pretty-printed JSON, creating parent directories when needed
//! - Manage task time history for time estimation
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{paths, state::AppState};
use serde::{Deserialize, Serialize};

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

// Task time estimation structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTimeRecord {
    pub task_type: String,
    pub params: serde_json::Value,
    pub duration_seconds: f64,
    pub timestamp: u64,
}

// Build the full path to the task times JSON within the `settings` directory.
fn task_times_file_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("task_times.json")
}

#[tauri::command]
/// Save task duration records to `data/settings/task_times.json`.
///
/// Appends new records to existing history. Only saves successful task completions.
pub fn save_task_time(
    state: tauri::State<AppState>,
    records: Vec<TaskTimeRecord>,
) -> Result<(), String> {
    if records.is_empty() {
        return Ok(());
    }

    let path = task_times_file_path(state.data_dir.as_path());
    
    // Load existing records
    let mut all_records: Vec<TaskTimeRecord> = match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    // Append new records
    all_records.extend(records);

    // Optional: Limit to last 100 records per task+params combination to prevent unbounded growth
    // Group by task_type + params hash
    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<&TaskTimeRecord>> = HashMap::new();
    for record in &all_records {
      // Create consistent key from task_type and params JSON string
      let params_str = serde_json::to_string(&record.params).unwrap_or_default();
      let key = format!("{}|{}", record.task_type, params_str);
      grouped.entry(key).or_insert_with(Vec::new).push(record);
    }

    // Keep only last 100 per group, then flatten
    let mut limited: Vec<TaskTimeRecord> = Vec::new();
    for mut group in grouped.into_values() {
        // Sort by timestamp descending
        group.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        // Take last 100
        for record in group.into_iter().take(100) {
            limited.push((*record).clone());
        }
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Save pretty-printed JSON
    let pretty = serde_json::to_string_pretty(&limited).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}

#[tauri::command]
/// Load all task time records from `data/settings/task_times.json`.
///
/// Returns an empty array when the file does not exist.
pub fn load_task_times(state: tauri::State<AppState>) -> Result<Vec<TaskTimeRecord>, String> {
    let path = task_times_file_path(state.data_dir.as_path());
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse task times: {}", e)),
        Err(_) => Ok(Vec::new()),
    }
}

#[tauri::command]
/// Get median time estimate for a specific task type and parameter combination.
///
/// Returns None if fewer than 3 samples exist for the given task+params.
pub fn get_task_time_estimate(
    state: tauri::State<AppState>,
    task_type: String,
    params: serde_json::Value,
) -> Result<Option<f64>, String> {
    let all_records = load_task_times(state)?;

    // Filter records matching task_type and params
    // Compare params by JSON string for consistency
    let params_str = serde_json::to_string(&params).unwrap_or_default();
    let matching: Vec<f64> = all_records
        .into_iter()
        .filter(|r| {
            if r.task_type != task_type {
                return false;
            }
            let r_params_str = serde_json::to_string(&r.params).unwrap_or_default();
            r_params_str == params_str
        })
        .map(|r| r.duration_seconds)
        .collect();

    // Need at least 3 samples
    if matching.len() < 3 {
        return Ok(None);
    }

    // Calculate median
    let mut sorted = matching;
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let len = sorted.len();
    let median = if len % 2 == 0 {
        // Even number: average of two middle values
        (sorted[len / 2 - 1] + sorted[len / 2]) / 2.0
    } else {
        // Odd number: middle value
        sorted[len / 2]
    };

    Ok(Some(median))
}
