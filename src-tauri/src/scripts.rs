//! # Scripts Module
//!
//! This module handles the management and execution of scripts within the AutoService application.
//! It provides functionality to list, save, remove, and run scripts stored in a JSON configuration file.
//!
//! Scripts can be sourced from:
//! - Local files (relative or absolute paths)
//! - Remote URLs (downloaded and executed)
//! - Inline command strings
//!
//! The module integrates with Tauri's shell plugin to execute scripts in PowerShell or CMD,
//! with support for administrative privileges and visible console windows.

use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::Manager;
use uuid::Uuid;

use crate::{models::ScriptEntry, paths, state::AppState};

/// Constructs the path to the scripts configuration file (scripts.json) within the settings directory.
///
/// # Arguments
/// * `data_root` - The root directory of the application's data.
///
/// # Returns
/// A `PathBuf` pointing to the scripts.json file.
fn scripts_json_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("scripts.json")
}

/// Reads and parses the scripts configuration file into a vector of ScriptEntry objects.
///
/// If the file doesn't exist or parsing fails, returns an empty vector.
///
/// # Arguments
/// * `path` - The path to the scripts.json file.
///
/// # Returns
/// A vector of `ScriptEntry` objects.
fn read_scripts_file(path: &Path) -> Vec<ScriptEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        if let Ok(list) = serde_json::from_str::<Vec<ScriptEntry>>(&data) {
            return list;
        }
    }
    Vec::new()
}

/// Writes a vector of ScriptEntry objects to the scripts configuration file in pretty JSON format.
///
/// Creates the parent directory if it doesn't exist.
///
/// # Arguments
/// * `path` - The path to the scripts.json file.
/// * `list` - The vector of `ScriptEntry` objects to write.
///
/// # Returns
/// A `Result` indicating success or containing an error string.
fn write_scripts_file(path: &Path, list: &Vec<ScriptEntry>) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid settings path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

/// Retrieves the list of all stored scripts from the configuration file.
///
/// This function reads the scripts.json file and returns a vector of `ScriptEntry` objects.
/// For each script with a "file" source, it verifies whether the file exists at the specified path
/// (resolving relative paths against the data directory) and updates the `path_exists` field accordingly.
///
/// # Arguments
/// * `state` - The application state containing the data directory path.
///
/// # Returns
/// A `Result` containing either a vector of `ScriptEntry` objects or an error string.
#[tauri::command]
pub fn list_scripts(state: tauri::State<AppState>) -> Result<Vec<ScriptEntry>, String> {
    let data_root = state.data_dir.as_path();
    let settings_path = scripts_json_path(data_root);
    let mut list = read_scripts_file(&settings_path);
    for script_entry in &mut list {
        script_entry.path_exists = if script_entry.source == "file" {
            let script_path = PathBuf::from(&script_entry.path);
            if script_path.is_absolute() {
                script_path.is_file()
            } else {
                let candidate = data_root.join(&script_path);
                candidate.is_file()
            }
        } else {
            true
        };
    }
    Ok(list)
}

/// Saves or updates a script entry in the configuration file.
///
/// If a script with the same ID already exists, it updates the existing entry.
/// Otherwise, it adds the new script to the list. For file-based scripts, if the path is absolute
/// and within the data directory, it converts it to a relative path for portability.
///
/// # Arguments
/// * `state` - The application state containing the data directory path.
/// * `script` - The `ScriptEntry` to save or update.
///
/// # Returns
/// A `Result` indicating success or containing an error string.
#[tauri::command]
pub fn save_script(state: tauri::State<AppState>, script: ScriptEntry) -> Result<(), String> {
    let settings_path = scripts_json_path(state.data_dir.as_path());
    let mut entry = script;
    // For file source, if the path is absolute and under data root, store relative for portability
    if entry.source == "file" {
        let script_path = PathBuf::from(&entry.path);
        if script_path.is_absolute() {
            let data_root = state.data_dir.as_path();
            if let Ok(stripped) = script_path.strip_prefix(data_root) {
                entry.path = stripped.to_string_lossy().to_string();
            }
        }
    }

    let mut list = read_scripts_file(&settings_path);
    match list.iter_mut().find(|p| p.id == entry.id) {
        Some(existing_entry) => {
            *existing_entry = entry;
        }
        None => list.push(entry),
    }
    write_scripts_file(&settings_path, &list)
}

/// Removes a script entry from the configuration file by its ID.
///
/// # Arguments
/// * `state` - The application state containing the data directory path.
/// * `id` - The UUID of the script to remove.
///
/// # Returns
/// A `Result` indicating success or containing an error string.
#[tauri::command]
pub fn remove_script(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
    let settings_path = scripts_json_path(state.data_dir.as_path());
    let mut list = read_scripts_file(&settings_path);
    list.retain(|script| script.id != id);
    write_scripts_file(&settings_path, &list)
}

/// Executes a script using the appropriate runner (PowerShell or CMD) with optional administrative privileges.
///
/// This function spawns a new console window to run the script, ensuring visibility.
/// It supports three script sources:
/// - "file": Executes a local script file
/// - "link": Downloads and executes content from a URL
/// - "inline": Executes a command string directly
///
/// The runner type is determined by the `runner` field of the script:
/// - "powershell" or "powershell-admin": Uses PowerShell
/// - "cmd" or "cmd-admin": Uses CMD
/// - Admin variants run with elevated privileges
///
/// # Arguments
/// * `app` - The Tauri application handle for accessing the shell and state.
/// * `script` - The `ScriptEntry` containing execution details.
///
/// # Returns
/// A `Result` indicating success or containing an error string with details.
#[tauri::command]
pub async fn run_script(app: tauri::AppHandle, script: ScriptEntry) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Err("Running scripts currently supported on Windows only".into());
    }
    #[cfg(windows)]
    {
        use tauri_plugin_shell::ShellExt;

        let shell = app.shell();
        let runner = script.runner.to_lowercase();
        let is_admin = runner.ends_with("-admin");
        let is_cmd = runner.starts_with("cmd");

        // Helper function to properly quote strings for PowerShell single-quoted strings
        fn ps_quote(s: &str) -> String {
            format!("'{}'", s.replace("'", "''"))
        }

        // Resolve file path relative to data directory if not absolute
        let data_root = app.state::<AppState>().data_dir.clone();
        let resolve_path = |path_str: String| -> String {
            let pb = PathBuf::from(&path_str);
            if pb.is_absolute() {
                return path_str;
            }
            data_root.join(pb).to_string_lossy().to_string()
        };

        // Build the target executable and its arguments based on runner type
        // This ensures the script runs in a visible console window
        let (target, inner_args): (String, Vec<String>) = if is_cmd {
            // Use cmd.exe with /K to keep the console window open after execution
            let mut v = vec!["/K".to_string()];
            match script.source.as_str() {
                "file" => {
                    let path = resolve_path(script.path);
                    if path.trim().is_empty() {
                        return Err("Script path is empty".into());
                    }
                    v.push(path);
                }
                "link" => {
                    // Download content from URL and pipe to cmd for execution
                    v.push(format!("curl -sL {} | cmd", script.url));
                }
                _ => {
                    // Execute inline command string directly
                    v.push(script.inline);
                }
            }
            ("cmd.exe".to_string(), v)
        } else {
            // Use PowerShell with -NoExit to keep the window open
            let mut v = vec![
                "-NoExit".to_string(),
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
            ];
            match script.source.as_str() {
                "file" => {
                    let path = resolve_path(script.path);
                    if path.trim().is_empty() {
                        return Err("Script path is empty".into());
                    }
                    v.push("-File".to_string());
                    v.push(path);
                }
                "link" => {
                    v.push("-Command".to_string());
                    v.push(format!(
                        "Invoke-Expression (Invoke-WebRequest -UseBasicParsing -Uri '{}').Content",
                        script.url
                    ));
                }
                _ => {
                    v.push("-Command".to_string());
                    v.push(script.inline);
                }
            }
            ("powershell.exe".to_string(), v)
        };

        // Construct PowerShell command to spawn the target process in a new window
        // Use Start-Process with -Verb RunAs for admin privileges
        let args_ps = if is_admin {
            format!(
                "Start-Process -FilePath {} -Verb RunAs -ArgumentList @({})",
                ps_quote(&target),
                inner_args
                    .iter()
                    .map(|a| ps_quote(a))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        } else {
            format!(
                "Start-Process -FilePath {} -ArgumentList @({})",
                ps_quote(&target),
                inner_args
                    .iter()
                    .map(|a| ps_quote(a))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        };

        // Execute the PowerShell command to launch the script
        let output = shell
            .command("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &args_ps,
            ])
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Script failed (code {:?}): {}",
                output.status.code(),
                stderr
            ));
        }
        Ok(())
    }
}
