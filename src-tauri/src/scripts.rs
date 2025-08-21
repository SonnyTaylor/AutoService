use std::{fs, path::{Path, PathBuf}};

use uuid::Uuid;
use tauri::Manager;

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
                let candidate = data_root.join(&p);
                candidate.is_file()
            }
        } else { true };
    }
    Ok(list)
}

#[tauri::command]
pub fn save_script(state: tauri::State<AppState>, script: ScriptEntry) -> Result<(), String> {
    let settings_path = scripts_json_path(state.data_dir.as_path());
    let mut entry = script;
    // For file source, if the path is absolute and under data root, store relative for portability
    if entry.source == "file" {
        let p = PathBuf::from(&entry.path);
        if p.is_absolute() {
            let data_root = state.data_dir.as_path();
            if let Ok(stripped) = p.strip_prefix(data_root) {
                entry.path = stripped.to_string_lossy().to_string();
            }
        }
    }

    let mut list = read_scripts_file(&settings_path);
    match list.iter_mut().find(|p| p.id == entry.id) {
        Some(existing) => { *existing = entry; }
        None => list.push(entry),
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
        let is_admin = runner.ends_with("-admin");
        let is_cmd = runner.starts_with("cmd");

        // Helper to quote for PowerShell single-quoted strings
        fn ps_quote(s: &str) -> String { format!("'{}'", s.replace("'", "''")) }

    // args are built per-branch below
        // Resolve file path relative to data dir when needed
        let data_root = app.state::<AppState>().data_dir.clone();
        let resolve_path = |p: String| -> String {
            let pb = PathBuf::from(&p);
            if pb.is_absolute() { return p; }
            data_root.join(pb).to_string_lossy().to_string()
        };
        let output = if is_admin {
            // Build elevated start via PowerShell: Start-Process -Verb RunAs -FilePath <target> -ArgumentList @('arg1','arg2',...)
            let (target, inner_args): (String, Vec<String>) = if is_cmd {
                let mut v = vec!["/C".to_string()];
                match script.source.as_str() {
                    "file" => {
                        let path = resolve_path(script.path);
                        if path.trim().is_empty() { return Err("Script path is empty".into()); }
                        v.push(path);
                    }
                    "link" => {
                        v.push(format!("curl -sL {} | cmd", script.url));
                    }
                    _ => v.push(script.inline),
                }
                ("cmd.exe".to_string(), v)
            } else {
                let mut v = vec!["-NoProfile".to_string(), "-ExecutionPolicy".to_string(), "Bypass".to_string()];
                match script.source.as_str() {
                    "file" => {
                        let path = resolve_path(script.path);
                        if path.trim().is_empty() { return Err("Script path is empty".into()); }
                        v.push("-File".to_string());
                        v.push(path);
                    }
                    "link" => {
                        v.push("-Command".to_string());
                        v.push(format!("Invoke-Expression (Invoke-WebRequest -UseBasicParsing -Uri '{}').Content", script.url));
                    }
                    _ => {
                        v.push("-Command".to_string());
                        v.push(script.inline);
                    }
                }
                ("powershell.exe".to_string(), v)
            };

            let args_ps = format!(
                "Start-Process -FilePath {} -Verb RunAs -ArgumentList @({})",
                ps_quote(&target),
                inner_args.iter().map(|a| ps_quote(a)).collect::<Vec<_>>().join(",")
            );

            shell
                .command("powershell.exe")
                .args(["-NoProfile","-ExecutionPolicy","Bypass","-Command", &args_ps])
                .output()
                .await
                .map_err(|e| e.to_string())?
        } else if is_cmd {
            let mut v: Vec<String> = vec!["/C".into()];
            match script.source.as_str() {
                "file" => {
                    let path = resolve_path(script.path);
                    if path.trim().is_empty() { return Err("Script path is empty".into()); }
                    v.push(path);
                }
                "link" => v.push(format!("curl -sL {} | cmd", script.url)),
                _ => v.push(script.inline),
            }
            shell.command("cmd.exe").args(v).output().await.map_err(|e| e.to_string())?
        } else {
            let mut v: Vec<String> = vec!["-NoProfile".into(), "-ExecutionPolicy".into(), "Bypass".into()];
            match script.source.as_str() {
                "file" => {
                    let path = resolve_path(script.path);
                    if path.trim().is_empty() { return Err("Script path is empty".into()); }
                    v.push("-File".into());
                    v.push(path);
                }
                "link" => {
                    v.push("-Command".into());
                    v.push(format!("Invoke-Expression (Invoke-WebRequest -UseBasicParsing -Uri '{}').Content", script.url));
                }
                _ => { v.push("-Command".into()); v.push(script.inline); }
            }
            shell.command("powershell.exe").args(v).output().await.map_err(|e| e.to_string())?
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Script failed (code {:?}): {}", output.status.code(), stderr));
        }
        Ok(())
    }
}
