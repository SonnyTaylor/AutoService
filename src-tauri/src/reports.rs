/// Report management utilities for AutoService.
///
/// Handles saving, loading, listing, and deleting service run reports in the data/reports directory.
/// Each report is saved in a dedicated folder with a descriptive name including
/// PC hostname, customer name (if available), and timestamp.
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveReportRequest {
    /// Final JSON report content
    pub report_json: String,
    /// Original run plan file path (optional)
    pub plan_file_path: Option<String>,
    /// Original log file path (optional)
    pub log_file_path: Option<String>,
    /// PC hostname
    pub hostname: Option<String>,
    /// Customer name from business metadata
    pub customer_name: Option<String>,
    /// Technician name from business metadata
    pub technician_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SaveReportResponse {
    /// Whether the save operation succeeded
    pub success: bool,
    /// Path to the saved report folder
    pub report_folder: Option<String>,
    /// Error message if save failed
    pub error: Option<String>,
}

/// Saves a service report to a dedicated folder in data/reports.
///
/// Creates a new folder with format: `{hostname}_{customer_name}_{timestamp}`
/// Saves the following files:
/// - `report.json` - Final JSON report
/// - `run_plan.json` - Original run plan (if provided)
/// - `execution.log` - Execution log (if provided)
/// - `metadata.json` - Report metadata (names, timestamp, etc.)
///
/// # Arguments
/// * `state` - Application state containing data directory path
/// * `request` - Save report request with all report data
///
/// # Returns
/// A result containing the save response with folder path or error message
#[tauri::command]
pub fn save_report(
    state: tauri::State<AppState>,
    request: SaveReportRequest,
) -> Result<SaveReportResponse, String> {
    let data_root = state.data_dir.as_path();
    let reports_dir = data_root.join("reports");

    // Ensure reports directory exists
    if let Err(e) = fs::create_dir_all(&reports_dir) {
        return Ok(SaveReportResponse {
            success: false,
            report_folder: None,
            error: Some(format!("Failed to create reports directory: {}", e)),
        });
    }

    // Generate folder name
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let folder_name = generate_folder_name(
        request.hostname.as_deref(),
        request.customer_name.as_deref(),
        request.technician_name.as_deref(),
        timestamp,
    );

    let report_folder = reports_dir.join(&folder_name);

    // Create report folder
    if let Err(e) = fs::create_dir_all(&report_folder) {
        return Ok(SaveReportResponse {
            success: false,
            report_folder: None,
            error: Some(format!("Failed to create report folder: {}", e)),
        });
    }

    // Save report.json
    let report_file = report_folder.join("report.json");
    if let Err(e) = fs::write(&report_file, &request.report_json) {
        return Ok(SaveReportResponse {
            success: false,
            report_folder: None,
            error: Some(format!("Failed to write report.json: {}", e)),
        });
    }

    // Copy run plan if provided
    if let Some(plan_path) = &request.plan_file_path {
        let plan_source = PathBuf::from(plan_path);
        if plan_source.exists() {
            let plan_dest = report_folder.join("run_plan.json");
            if let Err(e) = fs::copy(&plan_source, &plan_dest) {
                eprintln!("Warning: Failed to copy run_plan.json: {}", e);
            }
        }
    }

    // Copy log file if provided
    if let Some(log_path) = &request.log_file_path {
        let log_source = PathBuf::from(log_path);
        if log_source.exists() {
            let log_dest = report_folder.join("execution.log");
            if let Err(e) = fs::copy(&log_source, &log_dest) {
                eprintln!("Warning: Failed to copy execution.log: {}", e);
            }
        }
    }

    // Save metadata.json
    let metadata = serde_json::json!({
        "timestamp": timestamp,
        "hostname": request.hostname,
        "customer_name": request.customer_name,
        "technician_name": request.technician_name,
        "saved_at": chrono::Local::now().to_rfc3339(),
    });

    let metadata_file = report_folder.join("metadata.json");
    if let Err(e) = fs::write(
        &metadata_file,
        serde_json::to_string_pretty(&metadata).unwrap(),
    ) {
        eprintln!("Warning: Failed to write metadata.json: {}", e);
    }

    Ok(SaveReportResponse {
        success: true,
        report_folder: Some(report_folder.to_string_lossy().to_string()),
        error: None,
    })
}

/// Metadata structure for saved reports
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportMetadata {
    pub timestamp: u64,
    pub hostname: Option<String>,
    pub customer_name: Option<String>,
    pub technician_name: Option<String>,
    pub saved_at: String,
}

/// List item for a saved report
#[derive(Debug, Serialize)]
pub struct ReportListItem {
    pub folder_name: String,
    pub folder_path: String,
    pub metadata: Option<ReportMetadata>,
    pub has_report_json: bool,
    pub has_execution_log: bool,
    pub has_run_plan: bool,
}

/// Lists all saved reports in the data/reports directory
///
/// Scans for report folders (ignoring temporary JSON files) and returns
/// metadata for each report. Results are sorted by timestamp (newest first).
///
/// # Arguments
/// * `state` - Application state containing data directory path
///
/// # Returns
/// A vector of report list items with metadata
#[tauri::command]
pub fn list_reports(state: tauri::State<AppState>) -> Result<Vec<ReportListItem>, String> {
    let data_root = state.data_dir.as_path();
    let reports_dir = data_root.join("reports");

    // Ensure reports directory exists
    if !reports_dir.exists() {
        return Ok(Vec::new());
    }

    let mut reports = Vec::new();

    // Read directory entries
    let entries = fs::read_dir(&reports_dir)
        .map_err(|e| format!("Failed to read reports directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Only process directories (skip temporary JSON files)
        if !path.is_dir() {
            continue;
        }

        let folder_name = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };

        // Check for required files
        let has_report_json = path.join("report.json").exists();
        let has_execution_log = path.join("execution.log").exists();
        let has_run_plan = path.join("run_plan.json").exists();

        // Read metadata if available
        let metadata = read_metadata(&path);

        reports.push(ReportListItem {
            folder_name,
            folder_path: to_user_visible_path(&path),
            metadata,
            has_report_json,
            has_execution_log,
            has_run_plan,
        });
    }

    // Sort by timestamp (newest first)
    reports.sort_by(|a, b| {
        let a_time = a.metadata.as_ref().map(|m| m.timestamp).unwrap_or(0);
        let b_time = b.metadata.as_ref().map(|m| m.timestamp).unwrap_or(0);
        b_time.cmp(&a_time)
    });

    Ok(reports)
}

/// Loaded report data including JSON content and metadata
#[derive(Debug, Serialize)]
pub struct LoadedReport {
    pub report_json: String,
    pub execution_log: Option<String>,
    pub run_plan: Option<String>,
    pub metadata: ReportMetadata,
}

/// Loads a specific report's data from disk
///
/// Reads the report.json, metadata.json, and optionally the execution.log
/// and run_plan.json files from the specified report folder.
///
/// # Arguments
/// * `state` - Application state containing data directory path
/// * `folder_name` - Name of the report folder to load
///
/// # Returns
/// A loaded report with all available data
#[tauri::command]
pub fn load_report(
    state: tauri::State<AppState>,
    folder_name: String,
) -> Result<LoadedReport, String> {
    let data_root = state.data_dir.as_path();
    let report_folder = data_root.join("reports").join(&folder_name);

    // Verify folder exists
    if !report_folder.exists() {
        return Err(format!("Report folder not found: {}", folder_name));
    }

    // Read report.json (required)
    let report_path = report_folder.join("report.json");
    if !report_path.exists() {
        return Err("report.json not found in report folder".to_string());
    }
    let report_json = fs::read_to_string(&report_path)
        .map_err(|e| format!("Failed to read report.json: {}", e))?;

    // Read metadata.json (required)
    let metadata = read_metadata(&report_folder)
        .ok_or_else(|| "metadata.json not found or invalid".to_string())?;

    // Read execution.log (optional)
    let execution_log = {
        let log_path = report_folder.join("execution.log");
        if log_path.exists() {
            fs::read_to_string(&log_path).ok()
        } else {
            None
        }
    };

    // Read run_plan.json (optional)
    let run_plan = {
        let plan_path = report_folder.join("run_plan.json");
        if plan_path.exists() {
            fs::read_to_string(&plan_path).ok()
        } else {
            None
        }
    };

    Ok(LoadedReport {
        report_json,
        execution_log,
        run_plan,
        metadata,
    })
}

/// Loads a specific report from an absolute folder path (e.g., a network share)
#[tauri::command]
pub fn load_report_from_path(folder_path: String) -> Result<LoadedReport, String> {
    let raw_path = PathBuf::from(&folder_path);
    let report_folder = prepare_path_for_io(&raw_path);
    if !report_folder.exists() || !report_folder.is_dir() {
        return Err(format!(
            "Report folder not found: {}",
            to_user_visible_path(&raw_path)
        ));
    }

    let report_path = report_folder.join("report.json");
    if !report_path.exists() {
        return Err("report.json not found in report folder".to_string());
    }
    let report_json = fs::read_to_string(&report_path)
        .map_err(|e| format!("Failed to read report.json: {}", e))?;

    let metadata = read_metadata(&report_folder)
        .ok_or_else(|| "metadata.json not found or invalid".to_string())?;

    let execution_log = {
        let log_path = report_folder.join("execution.log");
        if log_path.exists() {
            fs::read_to_string(&log_path).ok()
        } else {
            None
        }
    };

    let run_plan = {
        let plan_path = report_folder.join("run_plan.json");
        if plan_path.exists() {
            fs::read_to_string(&plan_path).ok()
        } else {
            None
        }
    };

    Ok(LoadedReport {
        report_json,
        execution_log,
        run_plan,
        metadata,
    })
}

/// Deletes a report folder and all its contents
///
/// Recursively removes the specified report folder from the data/reports directory.
///
/// # Arguments
/// * `state` - Application state containing data directory path
/// * `folder_name` - Name of the report folder to delete
///
/// # Returns
/// True if deletion succeeded, error message otherwise
#[tauri::command]
pub fn delete_report(state: tauri::State<AppState>, folder_name: String) -> Result<bool, String> {
    let data_root = state.data_dir.as_path();
    let report_folder = data_root.join("reports").join(&folder_name);

    // Verify folder exists
    if !report_folder.exists() {
        return Err(format!("Report folder not found: {}", folder_name));
    }

    // Verify it's actually a directory
    if !report_folder.is_dir() {
        return Err("Specified path is not a directory".to_string());
    }

    // Delete the folder and all contents
    fs::remove_dir_all(&report_folder)
        .map_err(|e| format!("Failed to delete report folder: {}", e))?;

    Ok(true)
}

/// Opens a report folder in the system file explorer
///
/// Opens the specified report folder using the default file manager.
/// On Windows, this uses explorer.exe to open the folder.
///
/// # Arguments
/// * `state` - Application state containing data directory path
/// * `folder_name` - Name of the report folder to open
///
/// # Returns
/// True if the folder was opened successfully, error message otherwise
#[tauri::command]
pub fn open_report_folder(
    state: tauri::State<AppState>,
    folder_name: String,
) -> Result<bool, String> {
    let data_root = state.data_dir.as_path();
    let report_folder = data_root.join("reports").join(&folder_name);

    // Verify folder exists
    if !report_folder.exists() {
        return Err(format!("Report folder not found: {}", folder_name));
    }

    // Verify it's actually a directory
    if !report_folder.is_dir() {
        return Err("Specified path is not a directory".to_string());
    }

    // Open the folder in file explorer
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&report_folder)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open folder: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&report_folder)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open folder: {}", e))
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&report_folder)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open folder: {}", e))
    }
}

/// Helper function to read and parse metadata.json from a report folder
fn read_metadata(report_folder: &PathBuf) -> Option<ReportMetadata> {
    let metadata_path = report_folder.join("metadata.json");
    if !metadata_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&metadata_path).ok()?;
    serde_json::from_str(&content).ok()
}

// ---------------------- Network report sharing ----------------------

struct NetworkCopyLogger {
    path: Option<PathBuf>,
}

impl NetworkCopyLogger {
    fn new_from_state(state: &tauri::State<AppState>) -> Self {
        let data_root = state.data_dir.as_path();
        let logs_dir = data_root.join("logs");
        if let Err(e) = fs::create_dir_all(&logs_dir) {
            eprintln!(
                "Failed to ensure logs directory for network copy logging: {}",
                e
            );
            Self { path: None }
        } else {
            Self {
                path: Some(logs_dir.join("network_copy.log")),
            }
        }
    }

    fn log(&self, message: impl AsRef<str>) {
        let msg = message.as_ref();
        if let Some(path) = &self.path {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
                let _ = writeln!(file, "[{}] {}", timestamp, msg);
                return;
            }
        }
        eprintln!("network_copy: {}", msg);
    }
}

#[cfg(target_os = "windows")]
fn prepare_path_for_io(path: &Path) -> PathBuf {
    let value = path.to_string_lossy();
    let s = value.as_ref();
    if s.starts_with(r"\\?\") {
        PathBuf::from(s)
    } else if s.starts_with(r"\\") {
        PathBuf::from(format!(r"\\?\UNC\{}", s.trim_start_matches(r"\\")))
    } else {
        PathBuf::from(format!(r"\\?\{}", s))
    }
}

#[cfg(not(target_os = "windows"))]
fn prepare_path_for_io(path: &Path) -> PathBuf {
    path.to_path_buf()
}

fn to_user_visible_path(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        let value = path.to_string_lossy();
        let s = value.as_ref();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", rest)
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            s.to_string()
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_string_lossy().to_string()
    }
}

/// Network sharing configuration
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkConfig {
    pub unc_path: String,
    /// Optional save mode hint ("local"|"network"|"both") - not used by backend logic
    #[serde(default)]
    pub save_mode: Option<String>,
}

fn normalize_unc_path(unc: &str) -> String {
    let trimmed = unc.trim();
    // Support both \\server\share and //server/share by converting to backslashes on Windows
    // On non-Windows platforms this still returns a valid-looking path string.
    #[cfg(target_os = "windows")]
    {
        let s = trimmed.replace('/', "\\");
        // Ensure it starts with \\ for UNC
        if s.starts_with("\\\\") {
            s
        } else if s.starts_with("\\") {
            // single leading backslash -> ensure double
            format!("\\{}", s)
        } else if s.starts_with("//") {
            format!("\\\\{}", s.trim_start_matches("//").replace('/', "\\"))
        } else {
            s
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Keep forward slashes on non-Windows systems
        if trimmed.starts_with("//") {
            trimmed.to_string()
        } else {
            trimmed.replace('\\', "/")
        }
    }
}

fn copy_dir_recursive<F>(
    src: &Path,
    dst: &Path,
    deadline: Option<SystemTime>,
    log: &mut F,
) -> io::Result<()>
where
    F: FnMut(String),
{
    if let Some(deadline) = deadline {
        if SystemTime::now() > deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!(
                    "Copy timed out before processing {}",
                    to_user_visible_path(src)
                ),
            ));
        }
    }

    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| {
            io::Error::new(
                e.kind(),
                format!(
                    "Failed to create directory {}: {}",
                    to_user_visible_path(dst),
                    e
                ),
            )
        })?;
        log(format!("Created directory {}", to_user_visible_path(dst)));
    }

    let entries = fs::read_dir(src).map_err(|e| {
        io::Error::new(
            e.kind(),
            format!(
                "Failed to read directory {}: {}",
                to_user_visible_path(src),
                e
            ),
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            io::Error::new(
                e.kind(),
                format!(
                    "Failed to iterate directory {}: {}",
                    to_user_visible_path(src),
                    e
                ),
            )
        })?;
        let path = entry.path();
        let file_name = entry.file_name();
        let target = dst.join(&file_name);
        if path.is_dir() {
            log(format!("Descending into {}", to_user_visible_path(&path)));
            copy_dir_recursive(&path, &target, deadline, log)?;
        } else {
            log(format!(
                "Copying file {} -> {}",
                to_user_visible_path(&path),
                to_user_visible_path(&target)
            ));
            fs::copy(&path, &target).map_err(|e| {
                io::Error::new(
                    e.kind(),
                    format!(
                        "Failed to copy {} -> {}: {}",
                        to_user_visible_path(&path),
                        to_user_visible_path(&target),
                        e
                    ),
                )
            })?;
        }
        if let Some(deadline) = deadline {
            if SystemTime::now() > deadline {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    format!(
                        "Copy timed out while processing {}",
                        to_user_visible_path(&path)
                    ),
                ));
            }
        }
    }
    Ok(())
}

/// Copies a saved local report folder to a network UNC path.
///
/// Returns true on success, or an error string.
#[tauri::command]
pub fn save_report_to_network(
    state: tauri::State<AppState>,
    report_path: String,
    network_config: NetworkConfig,
) -> Result<bool, String> {
    let logger = NetworkCopyLogger::new_from_state(&state);
    let save_mode = network_config
        .save_mode
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    logger.log(format!(
        "Starting network copy | report_path='{}' | unc_path='{}' | mode='{}'",
        report_path, network_config.unc_path, save_mode
    ));

    let normalized = normalize_unc_path(&network_config.unc_path);
    if normalized.is_empty() {
        let msg = "UNC path is empty";
        logger.log(msg);
        return Err(msg.into());
    }

    let src_raw = PathBuf::from(&report_path);
    if !src_raw.exists() || !src_raw.is_dir() {
        let msg = format!(
            "Local report path not found or not a directory: {}",
            to_user_visible_path(&src_raw)
        );
        logger.log(&msg);
        return Err(msg);
    }

    let folder_name = src_raw.file_name().ok_or_else(|| {
        let msg = format!(
            "Failed to derive folder name from {}",
            to_user_visible_path(&src_raw)
        );
        logger.log(&msg);
        msg
    })?;

    let src = prepare_path_for_io(&src_raw);
    let share_path = PathBuf::from(&normalized);
    let dst_root = prepare_path_for_io(&share_path);

    logger.log(format!(
        "Resolved destination root '{}' (io path: '{}')",
        normalized,
        dst_root.display()
    ));

    match fs::read_dir(&dst_root) {
        Ok(_) => logger.log(format!(
            "Verified network share is reachable: {}",
            normalized
        )),
        Err(e) => {
            let warn = format!(
                "Warning: unable to list network share {}: {}",
                normalized, e
            );
            logger.log(&warn);
            if e.kind() == io::ErrorKind::NotFound {
                return Err(format!("Network share not found: {}", normalized));
            }
        }
    }

    let dst = dst_root.join(&folder_name);
    logger.log(format!(
        "Copy target resolved to {}",
        to_user_visible_path(&dst)
    ));

    // Allow additional time for network operations to reduce false timeouts on slower links
    let timeout = Duration::from_secs(120);
    let deadline = SystemTime::now() + timeout;

    let mut log_fn = |line: String| logger.log(line);
    copy_dir_recursive(&src, &dst, Some(deadline), &mut log_fn).map_err(|e| {
        logger.log(format!(
            "Copy failed for {} -> {}: {}",
            to_user_visible_path(&src_raw),
            to_user_visible_path(&dst),
            e
        ));
        format!("Copy failed: {e}")
    })?;

    logger.log(format!(
        "Network copy completed successfully for {} -> {}",
        to_user_visible_path(&src_raw),
        to_user_visible_path(&dst)
    ));
    Ok(true)
}

fn list_reports_in_dir(dir: &Path) -> io::Result<Vec<ReportListItem>> {
    let mut reports = Vec::new();
    if !dir.exists() {
        return Ok(reports);
    }
    for entry in fs::read_dir(dir)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder_name = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };
        let has_report_json = path.join("report.json").exists();
        let has_execution_log = path.join("execution.log").exists();
        let has_run_plan = path.join("run_plan.json").exists();
        let metadata = read_metadata(&path);
        reports.push(ReportListItem {
            folder_name,
            folder_path: to_user_visible_path(&path),
            metadata,
            has_report_json,
            has_execution_log,
            has_run_plan,
        });
    }
    // Sort newest first similar to local implementation
    reports.sort_by(|a, b| {
        let a_time = a.metadata.as_ref().map(|m| m.timestamp).unwrap_or(0);
        let b_time = b.metadata.as_ref().map(|m| m.timestamp).unwrap_or(0);
        b_time.cmp(&a_time)
    });
    Ok(reports)
}

/// Lists reports from a network UNC path.
#[tauri::command]
pub fn list_network_reports(
    _state: tauri::State<AppState>,
    unc_path: String,
) -> Result<Vec<ReportListItem>, String> {
    let normalized = normalize_unc_path(&unc_path);
    let share_path = PathBuf::from(&normalized);
    let path = prepare_path_for_io(&share_path);

    // Run in a worker thread with timeout to avoid UI freeze on hanging shares
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let res = list_reports_in_dir(&path).map_err(|e| e.to_string());
        let _ = tx.send(res);
    });

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(res) => res,
        Err(_) => Err("Network listing timed out".into()),
    }
}

/// Tests connectivity to a network UNC directory by attempting to read its entries.
#[tauri::command]
pub fn test_network_path(_state: tauri::State<AppState>, unc_path: String) -> Result<bool, String> {
    let normalized = normalize_unc_path(&unc_path);
    let share_path = PathBuf::from(&normalized);
    let path = prepare_path_for_io(&share_path);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let res = fs::read_dir(&path).map(|_| true).map_err(|e| e.to_string());
        let _ = tx.send(res);
    });
    match rx.recv_timeout(Duration::from_secs(6)) {
        Ok(v) => v,
        Err(_) => Err("Network test timed out".into()),
    }
}

/// Opens an absolute path (file or directory) in the OS file explorer.
#[tauri::command]
pub fn open_absolute_path(path: String) -> Result<bool, String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Err("Path does not exist".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&target)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open path: {}", e))
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open path: {}", e))
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("Failed to open path: {}", e))
    }
}

/// Generates a folder name for a saved report.
///
/// Format: `{hostname}_{customer_name}_{technician_name}_{date}_{time}`
/// - If customer name is missing, uses "Report" instead
/// - If hostname is missing, uses "Unknown_PC"
/// - If technician name is provided, includes it in the folder name
/// - Sanitizes names to be filesystem-safe
///
/// # Arguments
/// * `hostname` - Optional PC hostname
/// * `customer_name` - Optional customer name
/// * `technician_name` - Optional technician name
/// * `timestamp` - Unix timestamp in seconds
///
/// # Returns
/// A sanitized folder name string
fn generate_folder_name(
    hostname: Option<&str>,
    customer_name: Option<&str>,
    technician_name: Option<&str>,
    timestamp: u64,
) -> String {
    // Use chrono to format human-readable date/time
    let datetime = chrono::DateTime::from_timestamp(timestamp as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now().into());
    let date_str = datetime.format("%Y-%m-%d_%H-%M-%S").to_string();

    // Sanitize and use provided names
    let hostname_part = sanitize_name(hostname.unwrap_or("Unknown_PC"));
    let customer_part = sanitize_name(customer_name.unwrap_or("Report"));

    // Include technician name if provided
    if let Some(tech) = technician_name {
        let tech_part = sanitize_name(tech);
        format!(
            "{}_{}_{}__{}",
            hostname_part, customer_part, tech_part, date_str
        )
    } else {
        format!("{}_{}__{}", hostname_part, customer_part, date_str)
    }
}

/// Sanitizes a name for use in filesystem paths.
///
/// Replaces invalid characters with underscores and limits length.
///
/// # Arguments
/// * `name` - The name to sanitize
///
/// # Returns
/// A sanitized string safe for filesystem use
fn sanitize_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '_'
            } else {
                '_'
            }
        })
        .collect();

    // Limit length and trim underscores
    sanitized
        .chars()
        .take(50)
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_name() {
        assert_eq!(sanitize_name("John Doe"), "John_Doe");
        assert_eq!(sanitize_name("PC-123"), "PC-123");
        assert_eq!(sanitize_name("Test@#$PC"), "Test___PC");
        assert_eq!(sanitize_name("  spaces  "), "spaces");
    }

    #[test]
    fn test_generate_folder_name() {
        let timestamp = 1760000000; // Some fixed timestamp

        // Test with technician name
        let name = generate_folder_name(
            Some("MyPC"),
            Some("John Doe"),
            Some("Tech Smith"),
            timestamp,
        );
        assert!(name.contains("MyPC"));
        assert!(name.contains("John_Doe"));
        assert!(name.contains("Tech_Smith"));
        assert!(name.contains("__"));

        // Test without technician name
        let name_no_tech = generate_folder_name(Some("MyPC"), Some("John Doe"), None, timestamp);
        assert!(name_no_tech.contains("MyPC"));
        assert!(name_no_tech.contains("John_Doe"));
        assert!(!name_no_tech.contains("Tech_Smith"));
        assert!(name_no_tech.contains("__"));
    }

    #[test]
    fn test_generate_folder_name_defaults() {
        let timestamp = 1760000000;
        let name = generate_folder_name(None, None, None, timestamp);
        assert!(name.contains("Unknown_PC"));
        assert!(name.contains("Report"));
    }
}
