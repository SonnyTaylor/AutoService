use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

use crate::icons::get_logo_from_exe;
use crate::models::{ProgramDiskEntry, ProgramEntry, ToolStatus};
use crate::{paths, state::AppState};

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
pub fn save_program(
    state: tauri::State<AppState>,
    mut program: ProgramEntry,
) -> Result<(), String> {
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
        Some(existing) => {
            // Preserve launch_count unless explicitly provided (frontend doesn't send it)
            program.launch_count = existing.launch_count;
            *existing = program
        }
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
    {
        return Err("Programs launch only supported on Windows".into());
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        let exe_full = resolve_exe_path(state.data_dir.as_path(), &program.exe_path);
        if !Path::new(&exe_full).is_file() {
            return Err(format!("Executable not found: {}", exe_full));
        }
        let ps = format!(
            "Start-Process -FilePath \"{}\"",
            exe_full.replace('`', "``").replace('"', "`\"")
        );
        // Spawn the process first; if successful, increment and persist the launch counter.
        Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .spawn()
            .map_err(|e| format!("Failed to start program: {}", e))
            .and_then(|_| {
                // Increment launch_count and persist
                let settings_path = programs_json_path(state.data_dir.as_path());
                let mut list = read_programs_file(&settings_path);
                if let Some(p) = list.iter_mut().find(|p| p.id == program.id) {
                    // Saturating add to avoid overflow
                    p.launch_count = p.launch_count.saturating_add(1);
                }
                write_programs_file(&settings_path, &list).map(|_| ())
            })
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

/// Returns a list of tool statuses based on known required tools and saved program entries.
/// Frontend can use this to know what tools are available globally (e.g., virus scanners).
#[tauri::command]
pub fn get_tool_statuses(state: tauri::State<AppState>) -> Result<Vec<ToolStatus>, String> {
    // Load saved programs and resolve existence
    let data_root = state.data_dir.as_path();
    let settings_path = programs_json_path(data_root);
    let mut list = read_programs_file(&settings_path);
    for p in &mut list {
        let full = resolve_exe_path(data_root, &p.exe_path);
        p.exe_exists = Path::new(&full).is_file();
    }

    // Define a minimal set of known tool keys so pages can query consistently.
    // Keep names aligned with Settings REQUIRED list.
    let required: &[(&str, &str, &str)] = &[
        ("ccleaner", "CCleaner", "CCleaner.exe"),
        ("bleachbit", "BleachBit", "bleachbit.exe"),
        ("adwcleaner", "AdwCleaner", "adwcleaner.exe"),
        ("clamav", "ClamAV", "clamscan.exe"),
        ("kvrt", "KVRT", "KVRT.exe"),
        ("defender", "Windows Defender (MpCmdRun)", "MpCmdRun.exe"),
        ("furmark2", "Furmark 2", "FurMark.exe"),
        ("prime95", "Prime95", "prime95.exe"),
        ("sdi", "Snappy Driver Installer", "SDI.exe"),
        ("gsmartcontrol", "GSmartControl", "gsmartcontrol.exe"),
    ];

    let mut out = Vec::with_capacity(required.len());
    for (key, name, hint) in required.iter().copied() {
        // Simple fuzzy match against saved entries
        let mut path: Option<String> = None;
        let mut exists = false;
        for p in &list {
            let hay = format!("{} {} {}", p.name, p.description, p.exe_path).to_lowercase();
            if hay.contains(key) || hay.contains(name.to_lowercase().as_str()) {
                let full = resolve_exe_path(data_root, &p.exe_path);
                exists = Path::new(&full).is_file();
                path = Some(full);
                break;
            }
        }

        // Special-case Defender: try system detection when not found via saved entries
        if key == "defender" && !exists {
            if let Some(def_path) = find_defender_mpcmdrun() {
                exists = true;
                path = Some(def_path);
            }
        }

        out.push(ToolStatus {
            key: key.to_string(),
            name: name.to_string(),
            exists,
            path,
            hint: Some(hint.to_string()),
        });
    }
    Ok(out)
}

/// Run a Windows Defender quick scan using the detected MpCmdRun.exe and return
/// structured results (stdout/stderr/exit code). This is intentionally simple
/// and synchronous to make frontend integration straightforward.
#[tauri::command]
pub fn run_defender_scan(_state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    #[cfg(not(windows))]
    {
        return Err("Windows Defender scanning is only supported on Windows".into());
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::time::{SystemTime, UNIX_EPOCH};

        let exe = match find_defender_mpcmdrun() {
            Some(p) => p,
            None => return Err("MpCmdRun.exe (Windows Defender) not found".into()),
        };

        // Helper to run a single command and capture output
        fn run_cmd(cmd: &str, args: Vec<String>) -> (i32, String, String) {
            match Command::new(cmd).args(&args).output() {
                Ok(out) => {
                    let code = out.status.code().unwrap_or(-1);
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    (code, stdout, stderr)
                }
                Err(e) => (-1, "".to_string(), format!("Failed to execute: {}", e)),
            }
        }

        // Signature update (best-effort)
        let sig_args: Vec<String> = vec![
            "-NoProfile".into(),
            "-ExecutionPolicy".into(),
            "Bypass".into(),
            "-Command".into(),
            format!("& '{}' -SignatureUpdate", exe.replace('"', "\\\"")),
        ];

        // Quick scan
        let scan_args: Vec<String> = vec![
            "-NoProfile".into(),
            "-ExecutionPolicy".into(),
            "Bypass".into(),
            "-Command".into(),
            format!("& '{}' -Scan -ScanType 1", exe.replace('"', "\\\"")),
        ];

        let (sig_code, sig_out, sig_err) = run_cmd("powershell.exe", sig_args);
        let (scan_code, scan_out, scan_err) = run_cmd("powershell.exe", scan_args);

        let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);

        let res = serde_json::json!({
            "path": exe,
            "timestamp": ts,
            "signature_update": {
                "code": sig_code,
                "stdout": sig_out,
                "stderr": sig_err,
            },
            "quick_scan": {
                "code": scan_code,
                "stdout": scan_out,
                "stderr": scan_err,
            }
        });

        Ok(res)
    }
}

#[cfg(windows)]
fn find_defender_mpcmdrun() -> Option<String> {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    let base = env::var_os("ProgramData")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\ProgramData"));
    let platform_dir = base
        .join("Microsoft")
        .join("Windows Defender")
        .join("Platform");
    let mut best_dir: Option<PathBuf> = None;
    let entries = fs::read_dir(&platform_dir).ok()?;
    for entry in entries.flatten() {
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                let p = entry.path();
                match (&best_dir, p.file_name().and_then(|s| s.to_str())) {
                    (None, Some(_)) => best_dir = Some(p),
                    (Some(cur), Some(name)) => {
                        let cur_name = cur.file_name().and_then(|s| s.to_str()).unwrap_or("");
                        if name > cur_name { best_dir = Some(p); }
                    }
                    _ => {}
                }
            }
        }
    }
    let exe = best_dir?.join("MpCmdRun.exe");
    if exe.is_file() { Some(exe.to_string_lossy().to_string()) } else { None }
}

#[cfg(not(windows))]
fn find_defender_mpcmdrun() -> Option<String> { None }

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
                    launch_count: d.launch_count,
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
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid settings path".to_string())?;
    if let Err(e) = fs::create_dir_all(parent) {
        return Err(e.to_string());
    }
    let disk: Vec<ProgramDiskEntry> = list
        .iter()
        .map(|p| ProgramDiskEntry {
            id: p.id,
            name: p.name.clone(),
            version: p.version.clone(),
            description: p.description.clone(),
            exe_path: p.exe_path.clone(),
            logo_data_url: p.logo_data_url.clone(),
            launch_count: p.launch_count,
        })
        .collect();
    let data = serde_json::to_string_pretty(&disk).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}
