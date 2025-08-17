// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod paths;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};
use uuid::Uuid;
use image::GenericImageView; // for dimensions()
use sysinfo::{System, Components, Disks, Networks, Users, Cpu};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    os: Option<String>,
    hostname: Option<String>,
    kernel_version: Option<String>,
    os_version: Option<String>,
    system_name: Option<String>,
    uptime_seconds: u64,
    boot_time_seconds: u64,
    users: Vec<String>,
    cpu: CpuInfo,
    memory: MemoryInfo,
    disks: Vec<DiskInfo>,
    networks: Vec<NetworkInfo>,
    gpus: Vec<GpuInfo>,
    sensors: Vec<SensorInfo>,
    batteries: Vec<BatteryInfo>,
    motherboard: Option<MotherboardInfo>,
    product: Option<ProductInfo>,
    load_avg: LoadAvgInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo { brand: String, vendor_id: Option<String>, frequency_mhz: u64, num_physical_cores: Option<usize>, num_logical_cpus: usize, cores: Vec<CpuCoreInfo> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuCoreInfo { name: String, frequency_mhz: u64, usage_percent: f32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo { total: u64, available: u64, used: u64, free: u64, swap_total: u64, swap_used: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo { name: String, file_system: String, mount_point: String, total_space: u64, available_space: u64, is_removable: bool, is_read_only: bool, kind: String, read_bytes: u64, written_bytes: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo { interface: String, mac: Option<String>, mtu: u64, ips: Vec<String>, received: u64, transmitted: u64, total_received: u64, total_transmitted: u64, errors_rx: u64, errors_tx: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    name: String,
    vendor: Option<u32>,
    device: Option<u32>,
    device_type: Option<String>,
    driver: Option<String>,
    driver_info: Option<String>,
    backend: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorInfo { label: String, temperature_c: f32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo { vendor: Option<String>, model: Option<String>, serial: Option<String>, technology: Option<String>, state: String, percentage: f32, cycle_count: Option<u32>, state_of_health_pct: Option<f32>, energy_wh: Option<f32>, energy_full_wh: Option<f32>, energy_full_design_wh: Option<f32>, voltage_v: Option<f32>, temperature_c: Option<f32>, time_to_full_sec: Option<u64>, time_to_empty_sec: Option<u64> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotherboardInfo { vendor: Option<String>, name: Option<String>, version: Option<String>, serial_number: Option<String>, asset_tag: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInfo { vendor: Option<String>, name: Option<String>, family: Option<String>, version: Option<String>, serial_number: Option<String>, sku: Option<String>, uuid: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadAvgInfo { one: f64, five: f64, fifteen: f64 }
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn launch_shortcut(id: &str) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Err("Shortcuts are only supported on Windows".into());
    }

    #[cfg(windows)]
    {
        use std::process::Command;

        // Launch using cmd /c start "" <target> [args...] to detach from the current console
        fn start_detached(target: &str, args: &[&str]) -> Result<(), String> {
            let mut cmd = Command::new("cmd");
            cmd.args(["/c", "start", "", target]);
            if !args.is_empty() {
                cmd.args(args);
            }
            cmd.spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start '{}': {}", target, e))
        }

        // Elevate with UAC prompt
        fn start_elevated(target: &str, args: &[&str]) -> Result<(), String> {
            // Quote each argument for PowerShell -ArgumentList
            let arg_list = if args.is_empty() {
                String::new()
            } else {
                let joined = args
                    .iter()
                    .map(|a| a.replace('\'', "''"))
                    .map(|a| format!("'{}'", a))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(" -ArgumentList {}", joined)
            };
            let ps = format!("Start-Process '{}' -Verb runAs{}", target, arg_list);
            Command::new("powershell.exe")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to elevate '{}': {}", target, e))
        }

        match id {
            // Control Panel and classic CPLs
            "control_panel" => start_detached("control.exe", &[]),
            "power_options" => start_detached("control.exe", &["powercfg.cpl"]),
            "programs_features" => start_detached("control.exe", &["appwiz.cpl"]),
            "internet_options" => start_detached("control.exe", &["inetcpl.cpl"]),
            "printers" => start_detached("control.exe", &["printers"]),
            "network_connections" => start_detached("control.exe", &["ncpa.cpl"]),
            "firewall_control" => start_detached("control.exe", &["firewall.cpl"]),
            "user_accounts_advanced" => start_detached("control.exe", &["userpasswords2"]),
            "netplwiz" => start_detached("netplwiz.exe", &[]),

            // MMC / MSC consoles (open via mmc)
            "device_manager" => start_detached("devmgmt.msc", &[]),
            "disk_management" => start_detached("diskmgmt.msc", &[]),
            "services" => start_detached("services.msc", &[]),
            "event_viewer" => start_detached("eventvwr.msc", &[]),
            "computer_management" => start_detached("compmgmt.msc", &[]),
            "firewall_advanced" => start_detached("wf.msc", &[]),
            "local_users_groups" => start_detached("lusrmgr.msc", &[]),
            "local_security_policy" => start_detached("secpol.msc", &[]),
            "group_policy" => start_detached("gpedit.msc", &[]),

            // System tools
            "task_manager" => start_detached("taskmgr.exe", &[]),
            "system_properties" => start_detached("sysdm.cpl", &[]),
            "system_information" => start_detached("msinfo32.exe", &[]),
            "performance_monitor" => start_detached("perfmon.exe", &[]),
            "resource_monitor" => start_detached("resmon.exe", &[]),
            "directx_diag" => start_detached("dxdiag.exe", &[]),
            "disk_cleanup" => start_detached("cleanmgr.exe", &[]),
            "windows_features" => start_detached("optionalfeatures.exe", &[]),
            "optimize_drives" => start_detached("dfrgui.exe", &[]),
            "system_config" => start_detached("msconfig.exe", &[]),
            "diskpart" => start_elevated("diskpart.exe", &[]),

            // Consoles
            "cmd" => start_detached("cmd.exe", &[]),
            "cmd_admin" => start_elevated("cmd.exe", &[]),
            "powershell" => start_detached("powershell.exe", &[]),
            "powershell_admin" => start_elevated("powershell.exe", &[]),

            // Utilities
            "notepad" => start_detached("notepad.exe", &[]),
            "calculator" => start_detached("calc.exe", &[]),
            "snipping_tool" => start_detached("snippingtool.exe", &[]),
            "paint" => start_detached("mspaint.exe", &[]),
            "character_map" => start_detached("charmap.exe", &[]),
            "remote_desktop" => start_detached("mstsc.exe", &[]),
            "remote_assistance" => start_detached("msra.exe", &[]),
            "on_screen_keyboard" => start_detached("osk.exe", &[]),
            "magnifier" => start_detached("magnify.exe", &[]),
            "narrator" => start_detached("narrator.exe", &[]),
            "msrt" => start_detached("mrt.exe", &[]),
            "registry_editor" => start_detached("regedit.exe", &[]),
            "about_windows" => start_detached("winver.exe", &[]),

            // Settings URIs via explorer (opens Windows Settings pages)
            "settings_power_sleep" => start_detached("explorer.exe", &["ms-settings:powersleep"]),
            "settings_update" => start_detached("explorer.exe", &["ms-settings:windowsupdate"]),
            "settings_apps_features" => start_detached("explorer.exe", &["ms-settings:appsfeatures"]),
            "settings_network" => start_detached("explorer.exe", &["ms-settings:network"]),
            "settings_windows_security" => start_detached("explorer.exe", &["windowsdefender:"]),
            "control_troubleshooting" => start_detached("control.exe", &["/name", "Microsoft.Troubleshooting"]),

            _ => Err(format!("Unknown shortcut id: {}", id)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;
    use tauri::Manager;

    #[derive(Clone)]
    struct AppState { data_dir: Arc<std::path::PathBuf> }

    #[tauri::command]
    fn get_data_dirs(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
        let data_root = state.data_dir.as_path();
        let (reports, programs, settings, resources) = crate::paths::subdirs(data_root);
        Ok(serde_json::json!({
            "data": data_root,
            "reports": reports,
            "programs": programs,
            "settings": settings,
            "resources": resources,
        }))
    }

    let data_root = crate::paths::resolve_data_dir();
    if let Err(e) = crate::paths::ensure_structure(&data_root) {
        eprintln!("Failed to ensure data structure at {:?}: {}", data_root, e);
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct ProgramEntry {
        pub id: Uuid,
        pub name: String,
        pub version: String,
        pub description: String,
        pub exe_path: String,
        // Data URL (e.g., data:image/png;base64,....) or empty string if not set
    pub logo_data_url: String,
    #[serde(default)]
    pub exe_exists: bool,
    }

    // On-disk representation (does not include derived fields like exe_exists)
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct ProgramDiskEntry {
        pub id: Uuid,
        pub name: String,
        pub version: String,
        pub description: String,
        pub exe_path: String,
        pub logo_data_url: String,
    }

    #[tauri::command]
    fn list_programs(state: tauri::State<AppState>) -> Result<Vec<ProgramEntry>, String> {
        let data_root = state.data_dir.as_path();
        let settings_path = programs_json_path(data_root);
        let mut list = read_programs_file(&settings_path);
        // One-time migration: store exe_path relative to data dir when possible
        let mut changed = false;
        for p in &mut list {
            let exe_p = PathBuf::from(&p.exe_path);
            if exe_p.is_absolute() {
                if let Ok(stripped) = exe_p.strip_prefix(data_root) {
                    p.exe_path = stripped.to_string_lossy().to_string();
                    changed = true;
                }
            }
            // compute existence for UI
            let full = resolve_exe_path(data_root, &p.exe_path);
            p.exe_exists = Path::new(&full).is_file();
        }
        if changed {
            // Best-effort write; ignore error in listing path
            let _ = write_programs_file(&settings_path, &list);
        }
        Ok(list)
    }

    #[tauri::command]
    fn save_program(state: tauri::State<AppState>, mut program: ProgramEntry) -> Result<(), String> {
        let settings_path = programs_json_path(state.data_dir.as_path());
        // If no logo provided by frontend, try to extract one here
        if program.logo_data_url.is_empty() {
            if let Ok(Some(url)) = get_logo_from_exe(state.data_dir.as_path(), &program.exe_path) {
                program.logo_data_url = url;
            }
        }
        // Convert exe_path to relative (to data dir) if applicable
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
    fn remove_program(state: tauri::State<AppState>, id: Uuid) -> Result<(), String> {
        let settings_path = programs_json_path(state.data_dir.as_path());
        let mut list = read_programs_file(&settings_path);
        list.retain(|p| p.id != id);
        write_programs_file(&settings_path, &list)
    }

    #[tauri::command]
    fn launch_program(state: tauri::State<AppState>, program: ProgramEntry) -> Result<(), String> {
        #[cfg(not(windows))]
        { return Err("Programs launch only supported on Windows".into()); }
        #[cfg(windows)]
        {
            use std::process::Command;
            let exe_full = resolve_exe_path(state.data_dir.as_path(), &program.exe_path);
            if !Path::new(&exe_full).is_file() {
                return Err(format!("Executable not found: {}", exe_full));
            }
            // Use PowerShell Start-Process for robust path handling
            let ps = format!("Start-Process -FilePath \"{}\"", exe_full.replace('`', "``").replace('"', "`\""));
            Command::new("powershell.exe")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start program: {}", e))
        }
    }

    #[tauri::command]
    fn suggest_logo_from_exe(state: tauri::State<AppState>, exe_path: String) -> Result<Option<String>, String> {
        get_logo_from_exe(state.data_dir.as_path(), &exe_path)
    }

    fn get_logo_from_exe(data_root: &Path, exe_path: &str) -> Result<Option<String>, String> {
        // Prefer bundled NirSoft IconsExtract if present (better quality/size selection),
        // then fall back to exeico and file heuristics.
        let p0 = PathBuf::from(exe_path);
        let p = if p0.is_absolute() { p0 } else { data_root.join(&p0) };

        #[cfg(windows)]
        {
            if let Some(iconsext) = find_iconsext_exe(data_root) {
                if let Ok(Some(url)) = extract_with_iconsext(&iconsext, &p) {
                    return Ok(Some(url));
                }
            }

            // Fallback: use exeico crate
            if let Ok(bytes) = exeico::get_exe_ico(&p) {
                if let Ok(png_data_url) = ico_bytes_to_png_data_url(&bytes) {
                    return Ok(Some(png_data_url));
                }
            }
        }

        // Heuristic (cross-platform): look for .ico or .png next to the exe
        if let Some(dir) = p.parent() {
            if let Some(stem) = p.file_stem() {
                let ico = dir.join(format!("{}.ico", stem.to_string_lossy()));
                if ico.exists() {
                    if let Ok(bytes) = fs::read(&ico) {
                        if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                    }
                    return Ok(load_image_data_url(&ico).ok());
                }
                let png = dir.join(format!("{}.png", stem.to_string_lossy()));
                if png.exists() { return Ok(load_image_data_url(&png).ok()); }
            }
            if let Ok(read) = fs::read_dir(dir) {
                for entry in read.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        let ext_l = ext.to_ascii_lowercase();
                        if ext_l == "ico" {
                            if let Ok(bytes) = fs::read(&path) {
                                if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                            }
                            return Ok(load_image_data_url(&path).ok());
                        } else if ext_l == "png" {
                            return Ok(load_image_data_url(&path).ok());
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    #[cfg(windows)]
    fn find_iconsext_exe(data_root: &Path) -> Option<PathBuf> {
        // Expected at: data/resources/bin/iconsextract/iconsext.exe
        let (_reports, _programs, _settings, resources) = crate::paths::subdirs(data_root);
        let exe = resources.join("bin").join("iconsextract").join("iconsext.exe");
        if exe.exists() { Some(exe) } else { None }
    }

    #[cfg(windows)]
    fn extract_with_iconsext(iconsext_path: &Path, target_exe: &Path) -> Result<Option<String>, String> {
        use std::process::Command;

        // Create a temp folder to hold extracted icons
        let tmp_dir = std::env::temp_dir().join(format!(
            "autoservice_iconsextract_{}",
            Uuid::new_v4()
        ));
        if let Err(e) = std::fs::create_dir_all(&tmp_dir) {
            return Err(format!("Failed to create temp dir: {}", e));
        }

        // Run: iconsext.exe /save "<exe>" "<tmp_dir>" -icons
        let status = Command::new(iconsext_path)
            .args([
                "/save",
                &target_exe.to_string_lossy(),
                &tmp_dir.to_string_lossy(),
                "-icons",
            ])
            .status()
            .map_err(|e| format!("Failed to run IconsExtract: {}", e))?;

        if !status.success() {
            // Cleanup and return none on failure
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Ok(None);
        }

        // Find the best .ico produced (largest dimensions). Some builds may also output .png; prefer PNG if found.
        let mut best_png: Option<(u32, u32, Vec<u8>)> = None;
        let mut best_ico: Option<(u32, u32, Vec<u8>)> = None;
        if let Ok(read_dir) = std::fs::read_dir(&tmp_dir) {
            for entry in read_dir.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let ext_l = path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase());
                match ext_l.as_deref() {
                    Some("png") => {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Ok(img) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png) {
                                let (w, h) = img.dimensions();
                                if best_png.as_ref().map(|(bw, bh, _)| w * h > *bw * *bh).unwrap_or(true) {
                                    best_png = Some((w, h, bytes));
                                }
                            }
                        }
                    }
                    Some("ico") => {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Ok(img) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Ico) {
                                let (w, h) = img.dimensions();
                                if best_ico.as_ref().map(|(bw, bh, _)| w * h > *bw * *bh).unwrap_or(true) {
                                    best_ico = Some((w, h, bytes));
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // Prefer PNG if available; otherwise convert best ICO to PNG
        let out = if let Some((_w, _h, bytes)) = best_png {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
            Some(format!("data:image/png;base64,{}", b64))
        } else if let Some((_w, _h, ico_bytes)) = best_ico {
            Some(ico_bytes_to_png_data_url(&ico_bytes)?)
        } else {
            None
        };

        // Cleanup temp folder
        let _ = std::fs::remove_dir_all(&tmp_dir);
        Ok(out)
    }

    fn ico_bytes_to_png_data_url(ico_bytes: &[u8]) -> Result<String, String> {
        let img = image::load_from_memory_with_format(ico_bytes, image::ImageFormat::Ico)
            .map_err(|e| format!("ICO decode failed: {}", e))?;
        let mut buf = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| format!("PNG encode failed: {}", e))?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
        Ok(format!("data:image/png;base64,{}", b64))
    }

    #[tauri::command]
    fn read_image_as_data_url(path: String) -> Result<String, String> {
        load_image_data_url(Path::new(&path))
    }

    fn load_image_data_url(path: &Path) -> Result<String, String> {
        let bytes = fs::read(path).map_err(|e| format!("Failed to read image: {}", e))?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        let mime = match path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) {
            Some(ext) if ext == "png" => "image/png",
            Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
            Some(ext) if ext == "ico" => "image/x-icon",
            _ => "application/octet-stream",
        };
        Ok(format!("data:{};base64,{}", mime, b64))
    }

    fn programs_json_path(data_root: &Path) -> PathBuf {
        let (_reports, _programs, settings, _resources) = crate::paths::subdirs(data_root);
        settings.join("programs.json")
    }

    fn resolve_exe_path(data_root: &Path, exe_path: &str) -> String {
        let p = PathBuf::from(exe_path);
        if p.is_absolute() {
            return exe_path.to_string();
        }
    let (_reports, programs, _settings, _resources) = crate::paths::subdirs(data_root);
        let candidate1 = data_root.join(&p); // relative to data root
        if candidate1.is_file() {
            return candidate1.to_string_lossy().to_string();
        }
        let candidate2 = programs.join(&p); // relative to data/programs
        if candidate2.is_file() {
            return candidate2.to_string_lossy().to_string();
        }
        // Fallback to data root join even if it doesn't exist yet
        candidate1.to_string_lossy().to_string()
    }

    fn read_programs_file(path: &Path) -> Vec<ProgramEntry> {
        if let Ok(data) = fs::read_to_string(path) {
            // Prefer disk format without exe_exists, but be lenient if older/newer formats exist
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
                        exe_exists: false, // will be computed later
                    })
                    .collect();
            }
            // Fallback: try reading full ProgramEntry if present
            if let Ok(list) = serde_json::from_str::<Vec<ProgramEntry>>(&data) {
                return list;
            }
        }
        Vec::new()
    }

    fn write_programs_file(path: &Path, list: &Vec<ProgramEntry>) -> Result<(), String> {
        let parent = path.parent().ok_or_else(|| "Invalid settings path".to_string())?;
        if let Err(e) = fs::create_dir_all(parent) { return Err(e.to_string()); }
        // Persist without derived fields
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

    #[tauri::command]
    fn get_system_info() -> Result<SystemInfo, String> {
        let mut sys = System::new_all();
        sys.refresh_all();

    // CPU (refresh to compute usage)
    sys.refresh_cpu_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    let cpus: &[Cpu] = sys.cpus();
    let brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or_default();
    let vendor_id = cpus.first().map(|c| c.vendor_id().to_string());
    let frequency_mhz = cpus.first().map(|c| c.frequency() as u64).unwrap_or(0);
    let num_logical = cpus.len();
    let num_physical = System::physical_core_count();
    let cores: Vec<CpuCoreInfo> = cpus.iter().map(|c| CpuCoreInfo { name: c.name().to_string(), frequency_mhz: c.frequency() as u64, usage_percent: c.cpu_usage() }).collect();
    let cpu = CpuInfo { brand, vendor_id, frequency_mhz, num_physical_cores: num_physical, num_logical_cpus: num_logical, cores };

        // Memory
        let total = sys.total_memory();
        let available = sys.available_memory();
        let used = sys.used_memory();
        let free = sys.free_memory();
        let swap_total = sys.total_swap();
        let swap_used = sys.used_swap();
        let memory = MemoryInfo { total, available, used, free, swap_total, swap_used };

        // Disks
    let disks_list = Disks::new_with_refreshed_list();
        let disks: Vec<DiskInfo> = disks_list
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                file_system: d.file_system().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_space: d.total_space(),
                available_space: d.available_space(),
        is_removable: d.is_removable(),
        is_read_only: d.is_read_only(),
        kind: format!("{:?}", d.kind()),
        read_bytes: d.usage().read_bytes,
        written_bytes: d.usage().written_bytes,
            })
            .collect();

        // Networks
        let networks_list = Networks::new_with_refreshed_list();
        let networks: Vec<NetworkInfo> = networks_list
            .iter()
            .map(|(name, data)| NetworkInfo {
                interface: name.clone(),
                mac: Some(data.mac_address().to_string()),
                mtu: data.mtu(),
                ips: data.ip_networks().iter().map(|ip| ip.to_string()).collect(),
                received: data.received(),
                transmitted: data.transmitted(),
                total_received: data.total_received(),
                total_transmitted: data.total_transmitted(),
                errors_rx: data.errors_on_received(),
                errors_tx: data.errors_on_transmitted(),
            })
            .collect();

        // Sensors (temperatures)
        let components = Components::new_with_refreshed_list();
        let sensors: Vec<SensorInfo> = components
            .iter()
            .map(|c| SensorInfo { label: c.label().to_string(), temperature_c: c.temperature().unwrap_or(0.0) })
            .collect();

        // GPU via wgpu AdapterInfo (best-effort; ignore errors)
        // Deduplicate physical GPUs by vendor+device (or vendor+name if device id is 0),
        // prefer real hardware backends and richer driver info.
        let gpus: Vec<GpuInfo> = {
            #[allow(unused_mut)]
            let mut all: Vec<GpuInfo> = Vec::new();
            #[cfg(not(target_arch = "wasm32"))]
            {
                use wgpu::{Backends, Instance};
                let instance = Instance::default();
                for adapter in instance.enumerate_adapters(Backends::all()) {
                    let info = adapter.get_info();
                    all.push(GpuInfo {
                        name: info.name,
                        vendor: Some(info.vendor),
                        device: Some(info.device),
                        device_type: Some(format!("{:?}", info.device_type)),
                        driver: Some(info.driver),
                        driver_info: Some(info.driver_info),
                        backend: Some(format!("{:?}", info.backend)),
                    });
                }
            }

            // If any non-CPU adapters exist, drop CPU/software adapters (e.g., Microsoft Basic Render Driver)
            let has_hw = all.iter().any(|g| g.device_type.as_deref() != Some("Cpu"));
            let filtered: Vec<GpuInfo> = if has_hw {
                all.into_iter().filter(|g| g.device_type.as_deref() != Some("Cpu")).collect()
            } else {
                all
            };

            use std::collections::HashMap;

            // Backend preference (higher is better)
            fn backend_rank(s: Option<&str>) -> u8 {
                match s.unwrap_or("") {
                    "Dx12" => 5,
                    "Vulkan" => 4,
                    "Metal" => 4,
                    "Gl" => 2,
                    "BrowserWebGpu" => 1,
                    _ => 0,
                }
            }

            // Select best per (vendor, device) or (vendor, name) when device==0
            let mut best: HashMap<String, GpuInfo> = HashMap::new();
            for g in filtered.into_iter() {
                let vendor = g.vendor.unwrap_or(0);
                let device = g.device.unwrap_or(0);
                let key = if device != 0 {
                    format!("{}:{}", vendor, device)
                } else {
                    format!("{}:{}", vendor, g.name.to_lowercase())
                };

                let cand_score = (
                    backend_rank(g.backend.as_deref()),
                    (g.device.unwrap_or(0) != 0) as u8,
                    g.driver.as_deref().unwrap_or("").len() as u16,
                );

                if let Some(existing) = best.get(&key) {
                    let ex_score = (
                        backend_rank(existing.backend.as_deref()),
                        (existing.device.unwrap_or(0) != 0) as u8,
                        existing.driver.as_deref().unwrap_or("").len() as u16,
                    );
                    if cand_score > ex_score {
                        best.insert(key, g);
                    }
                } else {
                    best.insert(key, g);
                }
            }

            // Drop any remaining entries with unknown device id (0) if a concrete device exists for the same vendor
            let vendor_with_real: std::collections::HashSet<u32> = best
                .values()
                .filter_map(|g| {
                    let v = g.vendor.unwrap_or(0);
                    let d = g.device.unwrap_or(0);
                    if v != 0 && d != 0 { Some(v) } else { None }
                })
                .collect();

            let mut out: Vec<GpuInfo> = best
                .into_values()
                .filter(|g| {
                    let v = g.vendor.unwrap_or(0);
                    let d = g.device.unwrap_or(0);
                    if d == 0 && vendor_with_real.contains(&v) { return false; }
                    true
                })
                .collect();

            // Stable-ish order: by vendor, device, name
            out.sort_by(|a, b| {
                let av = a.vendor.unwrap_or(0).cmp(&b.vendor.unwrap_or(0));
                if av != std::cmp::Ordering::Equal { return av; }
                let ad = a.device.unwrap_or(0).cmp(&b.device.unwrap_or(0));
                if ad != std::cmp::Ordering::Equal { return ad; }
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            });
            out
        };

    // Users
    let users_list = Users::new_with_refreshed_list();
    let users: Vec<String> = users_list.iter().map(|u| u.name().to_string()).collect();

        // Batteries (optional; may be empty)
        let batteries = match get_batteries_info() {
            Ok(list) => list,
            Err(_) => Vec::new(),
        };

        // Motherboard & Product
        let motherboard = sysinfo::Motherboard::new().map(|m| MotherboardInfo {
            vendor: m.vendor_name(),
            name: m.name(),
            version: m.version(),
            serial_number: m.serial_number(),
            asset_tag: m.asset_tag(),
        });
        let product = Some(ProductInfo {
            vendor: sysinfo::Product::vendor_name(),
            name: sysinfo::Product::name(),
            family: sysinfo::Product::family(),
            version: sysinfo::Product::version(),
            serial_number: sysinfo::Product::serial_number(),
            sku: sysinfo::Product::stock_keeping_unit(),
            uuid: sysinfo::Product::uuid(),
        });

        let la = System::load_average();
        let info = SystemInfo {
            os: sysinfo::System::long_os_version(),
            hostname: System::host_name(),
            kernel_version: System::kernel_version(),
            os_version: System::os_version(),
            system_name: System::name(),
            uptime_seconds: System::uptime(),
            boot_time_seconds: System::boot_time(),
            users,
            cpu,
            memory,
            disks,
            networks,
            gpus,
            sensors,
            batteries,
            motherboard,
            product,
            load_avg: LoadAvgInfo { one: la.one, five: la.five, fifteen: la.fifteen },
        };

        Ok(info)
    }

    fn get_batteries_info() -> Result<Vec<BatteryInfo>, String> {
        // Battery crate may fail on desktops; return empty vec if not present
        let manager = match battery::Manager::new() { Ok(m) => m, Err(_) => return Ok(Vec::new()) };
        let list = match manager.batteries() { Ok(b) => b, Err(_) => return Ok(Vec::new()) };
        let mut out = Vec::new();
    for item in list {
            if let Ok(batt) = item {
                let percentage = batt.state_of_charge().value as f32 * 100.0;
                let state = format!("{:?}", batt.state());
                let technology = Some(format!("{:?}", batt.technology()));
                let vendor = batt.vendor().map(|s| s.to_string());
                let model = batt.model().map(|s| s.to_string());
                let serial = batt.serial_number().map(|s| s.to_string());
                let cycle_count = batt.cycle_count();
        let soh = Some(batt.state_of_health().value as f32 * 100.0);
        // Convert to Wh using units to avoid mWh confusion
        use battery::units::energy::watt_hour;
        let energy_wh = Some(batt.energy().get::<watt_hour>() as f32);
        let energy_full_wh = Some(batt.energy_full().get::<watt_hour>() as f32);
        let energy_full_design_wh = Some(batt.energy_full_design().get::<watt_hour>() as f32);
                let voltage_v = Some(batt.voltage().value as f32);
                let temp_c = batt.temperature().map(|t| t.value as f32);
                let ttf = batt.time_to_full().map(|d| d.value as u64);
                let tte = batt.time_to_empty().map(|d| d.value as u64);
                out.push(BatteryInfo { vendor, model, serial, technology, state, percentage, cycle_count, state_of_health_pct: soh, energy_wh, energy_full_wh, energy_full_design_wh, voltage_v, temperature_c: temp_c, time_to_full_sec: ttf, time_to_empty_sec: tte });
            }
        }
        Ok(out)
    }

    tauri::Builder::default()
        .manage(AppState { data_dir: Arc::new(data_root) })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            launch_shortcut,
            get_data_dirs,
            list_programs,
            save_program,
            remove_program,
            launch_program,
            suggest_logo_from_exe,
            read_image_as_data_url,
            get_system_info
        ])
        .setup(|app| {
            // Optionally, set current directory to data dir for simpler relative paths
            if let Some(state) = app.state::<AppState>().inner().clone().data_dir.as_ref().to_str() {
                let _ = std::env::set_current_dir(state);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
