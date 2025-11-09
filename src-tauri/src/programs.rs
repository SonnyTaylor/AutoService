//! Program management commands for the desktop app.
//!
//! Responsibilities:
//! - Persist user-defined external tools to `settings/programs.json`
//! - Normalize stored paths relative to the application data directory
//! - Resolve and launch Windows executables
//! - Provide summarized availability ("tool statuses") for key utilities
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

use crate::icons::get_logo_from_exe;
use crate::models::{ProgramDiskEntry, ProgramEntry, ToolStatus};
use crate::{paths, state::AppState};

#[tauri::command]
/// Load saved programs, normalize paths relative to the data directory,
/// and annotate each entry with whether its executable currently exists.
pub fn list_programs(state: tauri::State<AppState>) -> Result<Vec<ProgramEntry>, String> {
    let data_root = state.data_dir.as_path();
    let settings_path = programs_json_path(data_root);
    let mut list = read_programs_file(&settings_path);
    let mut changed = false;
    for p in &mut list {
        let exe_p = PathBuf::from(&p.exe_path);
        if exe_p.is_absolute() {
            // Store exe paths relative to the data directory to keep the JSON portable.
            if let Ok(stripped) = exe_p.strip_prefix(data_root) {
                p.exe_path = stripped.to_string_lossy().to_string();
                changed = true;
            }
        }
        // Compute existence against the resolved absolute path (not persisted).
        let full = resolve_exe_path(data_root, &p.exe_path);
        p.exe_exists = Path::new(&full).is_file();
    }
    if changed {
        // If we normalized any paths, write the cleaned list back to disk.
        let _ = write_programs_file(&settings_path, &list);
    }
    Ok(list)
}

#[tauri::command]
/// Create or update a `ProgramEntry` in `programs.json`.
///
/// - Derives a logo from the executable if none was provided.
/// - Normalizes `exe_path` to be relative to the data directory when possible.
/// - Preserves `launch_count` on updates (frontend does not send it).
pub fn save_program(
    state: tauri::State<AppState>,
    mut program: ProgramEntry,
) -> Result<(), String> {
    let settings_path = programs_json_path(state.data_dir.as_path());
    // Best-effort: extract an icon from the referenced executable when missing.
    if program.logo_data_url.is_empty() {
        if let Ok(Some(url)) = get_logo_from_exe(state.data_dir.as_path(), &program.exe_path) {
            program.logo_data_url = url;
        }
    }
    let exe_p = std::path::PathBuf::from(&program.exe_path);
    if exe_p.is_absolute() {
        let data_root = state.data_dir.as_path();
        // Persist relative paths to keep storage portable across machines.
        if let Ok(stripped) = exe_p.strip_prefix(data_root) {
            program.exe_path = stripped.to_string_lossy().to_string();
        }
    }
    let mut list = read_programs_file(&settings_path);
    match list.iter_mut().find(|p| p.id == program.id) {
        Some(existing) => {
            // Preserve `launch_count` unless explicitly provided (frontend doesn't send it).
            program.launch_count = existing.launch_count;
            *existing = program
        }
        None => list.push(program),
    }
    write_programs_file(&settings_path, &list)
}

#[tauri::command]
/// Remove a program by its `id` from `programs.json`.
pub fn remove_program(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
    let settings_path = programs_json_path(state.data_dir.as_path());
    let mut list = read_programs_file(&settings_path);
    list.retain(|p| p.id != id);
    write_programs_file(&settings_path, &list)
}

#[tauri::command]
/// Launch a program on Windows using PowerShell and increment its `launch_count` on success.
///
/// Returns an error on non-Windows platforms or when the executable cannot be found/spawned.
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
        // Use PowerShell Start-Process to decouple from the current process and avoid blocking.
        let ps = format!(
            "Start-Process -FilePath \"{}\"",
            exe_full.replace('`', "``").replace('"', "`\"")
        );
        // Spawn the process first; if successful, increment and persist the launch counter.
        // Note: arguments are escaped for PowerShell to handle paths with special characters.
        Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .spawn()
            .map_err(|e| format!("Failed to start program: {}", e))
            .and_then(|_| {
                // Increment `launch_count` and persist to disk.
                let settings_path = programs_json_path(state.data_dir.as_path());
                let mut list = read_programs_file(&settings_path);
                if let Some(p) = list.iter_mut().find(|p| p.id == program.id) {
                    // Saturating add to avoid overflow on long-lived installs.
                    p.launch_count = p.launch_count.saturating_add(1);
                }
                write_programs_file(&settings_path, &list).map(|_| ())
            })
    }
}

// Build the full path to the persisted programs index JSON within the settings directory.
fn programs_json_path(data_root: &Path) -> PathBuf {
    let (_reports, _programs, settings, _resources) = paths::subdirs(data_root);
    settings.join("programs.json")
}

// Resolve an executable path to an absolute string, checking both the data root and the
// `programs` subdirectory. If the provided path is already absolute, return it unchanged.
fn resolve_exe_path(data_root: &Path, exe_path: &str) -> String {
    let p = PathBuf::from(exe_path);
    if p.is_absolute() {
        return exe_path.to_string();
    }
    let (_reports, programs, _settings, _resources) = paths::subdirs(data_root);
    // Prefer a file under the data root if it exists.
    let candidate1 = data_root.join(&p);
    if candidate1.is_file() {
        return candidate1.to_string_lossy().to_string();
    }
    // Fall back to a file under the `programs` subdirectory if present.
    let candidate2 = programs.join(&p);
    if candidate2.is_file() {
        return candidate2.to_string_lossy().to_string();
    }
    // As a last resort, return the candidate under the data root even if it doesn't exist.
    candidate1.to_string_lossy().to_string()
}

/// Return a list of tool statuses based on known required tools and saved program entries.
///
/// Frontend uses this to determine which global tools (e.g., virus scanners) are available.
/// Matches saved entries via a simple fuzzy search over name/description/path, resolves paths,
/// and reports existence alongside an optional executable hint for the user.
#[tauri::command]
pub fn get_tool_statuses(state: tauri::State<AppState>) -> Result<Vec<ToolStatus>, String> {
    // Load saved programs and resolve existence for each entry.
    let data_root = state.data_dir.as_path();
    let settings_path = programs_json_path(data_root);
    let mut list = read_programs_file(&settings_path);
    for p in &mut list {
        let full = resolve_exe_path(data_root, &p.exe_path);
        p.exe_exists = Path::new(&full).is_file();
    }

    // Define a minimal set of known tool keys so pages can query consistently.
    // Keep names aligned with the Settings REQUIRED list.
    let required: &[(&str, &str, &str)] = &[
        ("ccleaner", "CCleaner", "CCleaner.exe"),
        ("bleachbit", "BleachBit", "bleachbit.exe"),
        ("adwcleaner", "AdwCleaner", "adwcleaner.exe"),
        ("clamav", "ClamAV", "clamscan.exe"),
        ("kvrt", "KVRT", "KVRT.exe"),
        ("trellix_stinger", "Trellix Stinger", "stinger64.exe"),
        ("defender", "Windows Defender (MpCmdRun)", "MpCmdRun.exe"),
        ("furmark2", "Furmark 2", "FurMark.exe"),
        ("smartctl", "smartctl", "smartctl.exe"),
        ("prime95", "Prime95", "prime95.exe"),
        ("sdi", "Snappy Driver Installer", "SDI.exe"),
        ("gsmartcontrol", "GSmartControl", "gsmartcontrol.exe"),
        ("err", "Microsoft Error Lookup Tool", "Err_6.4.5.exe"),
        ("heavyload", "HeavyLoad", "heavyload.exe"),
        ("furmark", "FurMark", "furmark.exe"),
        ("iperf3", "iPerf3", "iperf3.exe"),
        (
            "whynotwin11",
            "WhyNotWin11 Portable",
            "WhyNotWin11Portable.exe",
        ),
        ("drivecleanup", "DriveCleanup", "DriveCleanup.exe"),
    ];

    let mut out = Vec::with_capacity(required.len());
    for (key, name, hint) in required.iter().copied() {
        // Fuzzy match with scoring to find best match
        let mut path: Option<String> = None;
        let mut exists = false;
        let mut best_score = 0;

        for p in &list {
            let p_name_lower = p.name.to_lowercase();
            let p_exe_lower = p.exe_path.to_lowercase();
            let key_lower = key.to_lowercase();

            let mut score = 0;

            // Highest priority: Name starts with key (e.g., "Err_6.4.5" starts with "err")
            if p_name_lower.starts_with(&key_lower) {
                score += 1000;
            }

            // High priority: Key matches full name
            if p_name_lower == key_lower || p_name_lower == name.to_lowercase() {
                score += 500;
            }

            // Medium priority: Key appears as whole word in name
            let name_words: Vec<&str> =
                p_name_lower.split(|c: char| !c.is_alphanumeric()).collect();
            if name_words.iter().any(|word| *word == key_lower) {
                score += 100;
            }

            // Low priority: Key appears as whole word in exe path
            let exe_words: Vec<&str> = p_exe_lower.split(|c: char| !c.is_alphanumeric()).collect();
            if exe_words.iter().any(|word| *word == key_lower) {
                score += 50;
            }

            // Only update if this is a better match
            if score > best_score {
                best_score = score;
                let full = resolve_exe_path(data_root, &p.exe_path);
                exists = Path::new(&full).is_file();
                path = Some(full);
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

// Read `programs.json` into runtime `ProgramEntry` values.
// Supports both the on-disk schema (`ProgramDiskEntry`) and the runtime schema for backward compatibility.
// Note: `exe_exists` is computed at runtime and is always initialized to false here.
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

// Persist `ProgramEntry` values to `programs.json` using the portable on-disk schema.
// Ensures the parent directory exists and pretty-prints the JSON for easier diffing.
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
