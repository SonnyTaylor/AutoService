use std::{fs, path::{Path, PathBuf}};
use uuid::Uuid;

use crate::{paths, state::AppState};
use crate::icons::get_logo_from_exe;
use crate::models::{ProgramDiskEntry, ProgramEntry};

#[tauri::command]
pub fn list_programs(state: tauri::State<AppState>) -> Result<Vec<ProgramEntry>, String> {
    let data_root = state.data_dir.as_path();
    let settings_path = programs_json_path(data_root);
    let mut list = read_programs_file(&settings_path);
    let mut changed = false;
    for p in &mut list {
        let exe_p = PathBuf::from(&p.exe_path);
        if exe_p.is_absolute() {
            if let Ok(stripped) = exe_p.strip_prefix(data_root) {
                p.exe_path = stripped.to_string_lossy().to_string();
                changed = true;
            }
        }
        let full = resolve_exe_path(data_root, &p.exe_path);
        p.exe_exists = Path::new(&full).is_file();
    }
    if changed {
        let _ = write_programs_file(&settings_path, &list);
    }
    Ok(list)
}

#[tauri::command]
pub fn save_program(state: tauri::State<AppState>, mut program: ProgramEntry) -> Result<(), String> {
    let settings_path = programs_json_path(state.data_dir.as_path());
    if program.logo_data_url.is_empty() {
        if let Ok(Some(url)) = get_logo_from_exe(state.data_dir.as_path(), &program.exe_path) {
            program.logo_data_url = url;
        }
    }
    let exe_p = std::path::PathBuf::from(&program.exe_path);
    if exe_p.is_absolute() {
        let data_root = state.data_dir.as_path();
        if let Ok(stripped) = exe_p.strip_prefix(data_root) {
            program.exe_path = stripped.to_string_lossy().to_string();
        }
    }
    let mut list = read_programs_file(&settings_path);
    match list.iter_mut().find(|p| p.id == program.id) {
        Some(existing) => *existing = program,
        None => list.push(program),
    }
    write_programs_file(&settings_path, &list)
}

#[tauri::command]
pub fn remove_program(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
    let settings_path = programs_json_path(state.data_dir.as_path());
    let mut list = read_programs_file(&settings_path);
    list.retain(|p| p.id != id);
    write_programs_file(&settings_path, &list)
}

#[tauri::command]
pub fn launch_program(state: tauri::State<AppState>, program: ProgramEntry) -> Result<(), String> {
    #[cfg(not(windows))]
    { return Err("Programs launch only supported on Windows".into()); }
    #[cfg(windows)]
    {
        use std::process::Command;
        let exe_full = resolve_exe_path(state.data_dir.as_path(), &program.exe_path);
        if !Path::new(&exe_full).is_file() {
            return Err(format!("Executable not found: {}", exe_full));
        }
        let ps = format!("Start-Process -FilePath \"{}\"", exe_full.replace('`', "``").replace('"', "`\""));
        Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to start program: {}", e))
    }
}

fn programs_json_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("programs.json")
}

fn resolve_exe_path(data_root: &Path, exe_path: &str) -> String {
    let p = PathBuf::from(exe_path);
    if p.is_absolute() {
        return exe_path.to_string();
    }
    let (_reports, programs, _settings, _resources) = paths::subdirs(data_root);
    let candidate1 = data_root.join(&p);
    if candidate1.is_file() {
        return candidate1.to_string_lossy().to_string();
    }
    let candidate2 = programs.join(&p);
    if candidate2.is_file() {
        return candidate2.to_string_lossy().to_string();
    }
    candidate1.to_string_lossy().to_string()
}

fn read_programs_file(path: &Path) -> Vec<ProgramEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        if let Ok(list) = serde_json::from_str::<Vec<ProgramDiskEntry>>(&data) {
            return list
                .into_iter()
                .map(|d| ProgramEntry {
                    id: d.id,
                    name: d.name,
                    version: d.version,
                    description: d.description,
                    exe_path: d.exe_path,
                    logo_data_url: d.logo_data_url,
                    exe_exists: false,
                })
                .collect();
        }
        if let Ok(list) = serde_json::from_str::<Vec<ProgramEntry>>(&data) {
            return list;
        }
    }
    Vec::new()
}

fn write_programs_file(path: &Path, list: &Vec<ProgramEntry>) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Invalid settings path".to_string())?;
    if let Err(e) = fs::create_dir_all(parent) { return Err(e.to_string()); }
    let disk: Vec<ProgramDiskEntry> = list
        .iter()
        .map(|p| ProgramDiskEntry {
            id: p.id,
            name: p.name.clone(),
            version: p.version.clone(),
            description: p.description.clone(),
            exe_path: p.exe_path.clone(),
            logo_data_url: p.logo_data_url.clone(),
        })
        .collect();
    let data = serde_json::to_string_pretty(&disk).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}
