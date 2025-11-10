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

    // Age-based cleanup: Remove records older than 12 months (31536000 seconds)
    // This keeps estimates relevant to current system performance
    const MAX_AGE_SECONDS: u64 = 12 * 30 * 24 * 60 * 60; // ~12 months
    let current_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let filtered_by_age: Vec<TaskTimeRecord> = all_records
        .into_iter()
        .filter(|record| {
            let age = current_timestamp.saturating_sub(record.timestamp);
            age <= MAX_AGE_SECONDS
        })
        .collect();

    // Optional: Limit to last 100 records per task+params combination to prevent unbounded growth
    // Group by task_type + params hash (using normalized params for consistency)
    use std::collections::HashMap;
    use serde_json::Map;
    let mut grouped: HashMap<String, Vec<&TaskTimeRecord>> = HashMap::new();
    for record in &filtered_by_age {
      // Create consistent key from task_type and normalized params JSON string
      let params_normalized = match serde_json::to_value(&record.params) {
          Ok(v) => {
              if let serde_json::Value::Object(map) = v {
                  let mut sorted: Vec<_> = map.into_iter().collect();
                  sorted.sort_by_key(|(k, _)| k.clone());
                  let sorted_map: Map<String, serde_json::Value> = sorted.into_iter().collect();
                  serde_json::to_string(&serde_json::Value::Object(sorted_map)).unwrap_or_default()
              } else {
                  serde_json::to_string(&v).unwrap_or_default()
              }
          },
          Err(_) => serde_json::to_string(&record.params).unwrap_or_default(),
      };
      let key = format!("{}|{}", record.task_type, params_normalized);
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTimeEstimate {
    pub estimate: f64,
    pub sample_count: usize,
    pub variance: f64,
    pub min: f64,
    pub max: f64,
}

#[tauri::command]
/// Get median time estimate for a specific task type and parameter combination.
///
/// Returns None if no samples exist for the given task+params.
/// Returns estimate with sample count, variance, and min/max for confidence indicators.
pub fn get_task_time_estimate(
    state: tauri::State<AppState>,
    task_type: String,
    params: serde_json::Value,
) -> Result<Option<TaskTimeEstimate>, String> {
    let all_records = load_task_times(state)?;

    // Filter records matching task_type and params
    // Compare params by normalizing both to sorted JSON strings
    // This ensures consistent comparison regardless of key order or formatting
    use serde_json::Map;
    
    let params_normalized = match serde_json::to_value(&params) {
        Ok(v) => {
            // Sort keys by converting to a sorted map
            if let serde_json::Value::Object(map) = v {
                let mut sorted: Vec<_> = map.into_iter().collect();
                sorted.sort_by_key(|(k, _)| k.clone());
                let sorted_map: Map<String, serde_json::Value> = sorted.into_iter().collect();
                serde_json::to_string(&serde_json::Value::Object(sorted_map)).unwrap_or_default()
            } else {
                serde_json::to_string(&v).unwrap_or_default()
            }
        },
        Err(_) => serde_json::to_string(&params).unwrap_or_default(),
    };
    
    let mut matching: Vec<f64> = all_records
        .into_iter()
        .filter(|r| {
            if r.task_type != task_type {
                return false;
            }
            // Normalize stored params the same way
            let r_params_normalized = match serde_json::to_value(&r.params) {
                Ok(v) => {
                    if let serde_json::Value::Object(map) = v {
                        let mut sorted: Vec<_> = map.into_iter().collect();
                        sorted.sort_by_key(|(k, _)| k.clone());
                        let sorted_map: Map<String, serde_json::Value> = sorted.into_iter().collect();
                        serde_json::to_string(&serde_json::Value::Object(sorted_map)).unwrap_or_default()
                    } else {
                        serde_json::to_string(&v).unwrap_or_default()
                    }
                },
                Err(_) => serde_json::to_string(&r.params).unwrap_or_default(),
            };
            r_params_normalized == params_normalized
        })
        .map(|r| r.duration_seconds)
        .collect();

    // Need at least 1 sample
    if matching.is_empty() {
        return Ok(None);
    }

    // Filter out extreme outliers using IQR (Interquartile Range) method
    // This helps resist single huge outliers while keeping the median robust
    matching.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let len = matching.len();
    
    // For small samples (1-3), just use the values as-is
    let (median, filtered_for_stats) = if len <= 3 {
        let median = if len == 1 {
            matching[0]
        } else if len == 2 {
            (matching[0] + matching[1]) / 2.0
        } else {
            matching[1] // Middle of 3
        };
        (median, matching)
    } else {
        // For larger samples, filter outliers using IQR
        let q1_idx = len / 4;
        let q3_idx = (3 * len) / 4;
        let q1 = matching[q1_idx];
        let q3 = matching[q3_idx];
        let iqr = q3 - q1;
        
        // Outlier bounds: Q1 - 1.5*IQR and Q3 + 1.5*IQR
        let lower_bound = q1 - 1.5 * iqr;
        let upper_bound = q3 + 1.5 * iqr;
        
        // Filter out outliers
        let filtered: Vec<f64> = matching
            .iter()
            .filter(|&&x| x >= lower_bound && x <= upper_bound)
            .copied()
            .collect();
        
        // If filtering removed too many values, use original
        let (median, stats_source) = if filtered.len() < len / 2 {
            // Too many outliers removed, use original (median is already robust)
            let median = if len % 2 == 0 {
                (matching[len / 2 - 1] + matching[len / 2]) / 2.0
            } else {
                matching[len / 2]
            };
            (median, matching)
        } else {
            // Use filtered values (already sorted from original)
            let mut filtered_sorted = filtered;
            filtered_sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            
            let filtered_len = filtered_sorted.len();
            let median = if filtered_len % 2 == 0 {
                (filtered_sorted[filtered_len / 2 - 1] + filtered_sorted[filtered_len / 2]) / 2.0
            } else {
                filtered_sorted[filtered_len / 2]
            };
            (median, filtered_sorted)
        };
        
        (median, stats_source)
    };
    
    // Calculate variance and min/max from the data used for stats
    let sample_count = filtered_for_stats.len();
    let min = filtered_for_stats[0];
    let max = filtered_for_stats[sample_count - 1];
    
    // Calculate variance (population variance for sample size)
    let mean = filtered_for_stats.iter().sum::<f64>() / sample_count as f64;
    let variance = if sample_count > 1 {
        filtered_for_stats
            .iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f64>()
            / sample_count as f64
    } else {
        0.0
    };

    Ok(Some(TaskTimeEstimate {
        estimate: median,
        sample_count,
        variance,
        min,
        max,
    }))
}

#[tauri::command]
/// Clear all task time records by deleting the task_times.json file.
///
/// Returns Ok(()) on success, or an error string if deletion fails.
pub fn clear_task_times(state: tauri::State<AppState>) -> Result<(), String> {
    let path = task_times_file_path(state.data_dir.as_path());
    
    // Delete the file if it exists
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
