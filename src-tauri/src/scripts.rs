use std::{fs, path::{Path, PathBuf}};

use uuid::Uuid;

use crate::{models::ScriptEntry, paths, state::AppState};

fn scripts_json_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("scripts.json")
}

fn read_scripts_file(path: &Path) -> Vec<ScriptEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        if let Ok(list) = serde_json::from_str::<Vec<ScriptEntry>>(&data) {
            return list;
        }
    }
    Vec::new()
}

fn write_scripts_file(path: &Path, list: &Vec<ScriptEntry>) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Invalid settings path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_scripts(state: tauri::State<AppState>) -> Result<Vec<ScriptEntry>, String> {
    let data_root = state.data_dir.as_path();
    let settings_path = scripts_json_path(data_root);
    let mut list = read_scripts_file(&settings_path);
    for s in &mut list {
        s.path_exists = if s.source == "file" {
            let p = PathBuf::from(&s.path);
            if p.is_absolute() {
                p.is_file()
            } else {
                // try relative to data root
                let candidate1 = data_root.join(&p);
                candidate1.is_file()
            }
        } else { true };
    }
    Ok(list)
}

#[tauri::command]
pub fn save_script(state: tauri::State<AppState>, script: ScriptEntry) -> Result<(), String> {
    let settings_path = scripts_json_path(state.data_dir.as_path());
    let mut list = read_scripts_file(&settings_path);
    match list.iter_mut().find(|p| p.id == script.id) {
        Some(existing) => { *existing = script; }
        None => list.push(script),
    }
    write_scripts_file(&settings_path, &list)
}

#[tauri::command]
pub fn remove_script(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
    let settings_path = scripts_json_path(state.data_dir.as_path());
    let mut list = read_scripts_file(&settings_path);
    list.retain(|p| p.id != id);
    write_scripts_file(&settings_path, &list)
}

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
        let cmd_name = if runner == "cmd" { "cmd.exe" } else { "powershell.exe" };

        let mut args: Vec<String> = Vec::new();
        if runner == "cmd" {
            // use /C to run and exit
            args.push("/C".into());
            match script.source.as_str() {
                "file" => {
                    let path = script.path;
                    if path.trim().is_empty() { return Err("Script path is empty".into()); }
                    args.push(path);
                }
                "link" => {
                    args.push(format!("curl -sL {} | cmd", script.url));
                }
                _ => {
                    args.push(script.inline);
                }
            }
        } else {
            // PowerShell. Use -NoProfile -ExecutionPolicy Bypass
            args.push("-NoProfile".into());
            args.push("-ExecutionPolicy".into());
            args.push("Bypass".into());
            match script.source.as_str() {
                "file" => {
                    let path = script.path;
                    if path.trim().is_empty() { return Err("Script path is empty".into()); }
                    args.push("-File".into());
                    args.push(path);
                }
                "link" => {
                    let ps = format!("Invoke-Expression (Invoke-WebRequest -UseBasicParsing -Uri '{}').Content", script.url);
                    args.push("-Command".into());
                    args.push(ps);
                }
                _ => {
                    args.push("-Command".into());
                    args.push(script.inline);
                }
            }
        }

        let output = shell.command(cmd_name).args(args).output().await.map_err(|e| e.to_string())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Script failed (code {:?}): {}", output.status.code(), stderr));
        }
        Ok(())
    }
}
