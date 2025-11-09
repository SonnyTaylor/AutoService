//! # AutoService Tauri Application
//!
//! This is the main entry point for AutoService.
//! Provides a GUI for managing system tools, programs, scripts, and settings.

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Module declarations for organizing code
mod icons;
mod models;
mod paths;
mod programs;
mod reports;
mod scripts;
mod settings;
mod shortcuts;
mod state;
mod system;

use tauri::{Emitter, Manager};

// Import command functions to bring them into scope for the handler
use crate::icons::{read_image_as_data_url, suggest_logo_from_exe};
use crate::programs::{
    get_tool_statuses, launch_program, list_programs, open_program_folder, remove_program,
    save_program,
};
use crate::reports::{
    delete_report, list_network_reports, list_reports, load_report, load_report_from_path,
    open_absolute_path, open_report_folder, save_report, save_report_to_network, test_network_path,
};
use crate::scripts::{list_scripts, remove_script, run_script, save_script};
use crate::settings::{
    load_app_settings, make_portable_path, resolve_portable_path, save_app_settings,
};
use crate::shortcuts::launch_shortcut;
use crate::state::AppState;
use crate::system::get_system_info;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command as StdCommand, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// A simple greeting command for testing IPC communication.
///
/// This command demonstrates basic Tauri command functionality and can be used
/// for testing the connection between the Rust backend and frontend.
///
/// # Arguments
/// * `name` - The name to include in the greeting message
///
/// # Returns
/// A formatted greeting string
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Retrieves information about the application's data directories.
///
/// This command provides paths to various data directories used by the application,
/// including reports, programs, settings, and resources. It also includes the
/// executable directory and sidecar runner path for convenience.
///
/// # Arguments
/// * `state` - The application state containing the data directory path
///
/// # Returns
/// A JSON object containing all directory paths, or an error message on failure
#[tauri::command]
fn get_data_dirs(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    // Get the root data directory from application state
    let data_root = state.data_dir.as_path();

    // Get subdirectories using the paths module
    let (reports, programs, settings, resources) = crate::paths::subdirs(data_root);

    // Determine the executable directory for sidecar binaries
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    // Path to the service runner sidecar executable
    let sidecar_runner = exe_dir.join("binaries").join("service_runner.exe");

    // Return all paths as a JSON object
    Ok(serde_json::json!({
        "data": data_root,
        "reports": reports,
        "programs": programs,
        "settings": settings,
        "resources": resources,
        "exe_dir": exe_dir,
        "sidecar_runner": sidecar_runner,
    }))
}

/// Writes a control signal to the control file to stop the service run.
/// The current task will finish, then the run will stop.
#[tauri::command]
fn stop_service_run(state: tauri::State<AppState>) -> Result<(), String> {
    let control_path = state.control_file_path.lock().unwrap();
    if let Some(path) = control_path.as_ref() {
        let control_data = serde_json::json!({
            "action": "stop",
            "timestamp": SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        });
        std::fs::write(path, serde_json::to_string(&control_data).unwrap_or_default())
            .map_err(|e| format!("Failed to write control file: {e}"))?;
        Ok(())
    } else {
        Err("No active service run".to_string())
    }
}

/// Writes a control signal to the control file to pause the service run.
/// The current task will finish, then the run will pause.
#[tauri::command]
fn pause_service_run(state: tauri::State<AppState>) -> Result<(), String> {
    let control_path = state.control_file_path.lock().unwrap();
    if let Some(path) = control_path.as_ref() {
        let control_data = serde_json::json!({
            "action": "pause",
            "timestamp": SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        });
        std::fs::write(path, serde_json::to_string(&control_data).unwrap_or_default())
            .map_err(|e| format!("Failed to write control file: {e}"))?;
        Ok(())
    } else {
        Err("No active service run".to_string())
    }
}

/// Writes a control signal to the control file to skip the current task.
/// The current task will be immediately stopped and marked as skipped.
#[tauri::command]
fn skip_current_task(state: tauri::State<AppState>) -> Result<(), String> {
    let control_path = state.control_file_path.lock().unwrap();
    if let Some(path) = control_path.as_ref() {
        let control_data = serde_json::json!({
            "action": "skip",
            "timestamp": SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        });
        std::fs::write(path, serde_json::to_string(&control_data).unwrap_or_default())
            .map_err(|e| format!("Failed to write control file: {e}"))?;
        Ok(())
    } else {
        Err("No active service run".to_string())
    }
}

/// Starts the Python service runner executable and streams stderr lines as Tauri events.
/// Frontend listens to `service_runner_line` (payload: {stream, line}) and
/// `service_runner_done` (payload: { final_report, plan_file, log_file }).
/// Returns the plan file path (for reference) immediately after spawning.
#[tauri::command]
fn start_service_run(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    plan_json: String,
) -> Result<String, String> {
    // Resolve runner path
    let data_root = state.data_dir.as_path();
    let runner_exe: PathBuf = data_root
        .join("resources")
        .join("bin")
        .join("service_runner.exe");

    // Dev fallback: if the compiled runner is missing, try to run the Python script directly.
    // This makes `pnpm tauri dev` usable without PyInstaller.
    let mut use_python_fallback = false;
    let mut python_script_path: Option<PathBuf> = None;
    if !runner_exe.exists() {
        // Try to infer repo root from data_root (repo_root/data)
        if let Some(repo_root) = data_root.parent() {
            let script = repo_root.join("runner").join("service_runner.py");
            if script.exists() {
                use_python_fallback = true;
                python_script_path = Some(script);
            }
        }

        if !use_python_fallback {
            return Err(format!(
                "service_runner.exe not found at {} and Python fallback script was not located. \
                 Expected script path: <repo>/runner/service_runner.py",
                runner_exe.display()
            ));
        }
    }

    // Write temporary plan file into logs directory
    let logs_dir = data_root.join("logs");
    if let Err(e) = std::fs::create_dir_all(&logs_dir) {
        return Err(format!("Failed to create logs dir: {e}"));
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let plan_file = logs_dir.join(format!("run_plan_{ts}.json"));
    if let Err(e) = std::fs::write(&plan_file, &plan_json) {
        return Err(format!("Failed to write plan file: {e}"));
    }
    let log_file = plan_file.with_extension("log.txt");
    let plan_file_for_return = plan_file.clone();
    
    // Create control file path
    let control_file = logs_dir.join(format!("run_control_{ts}.json"));
    let control_file_for_state = control_file.clone();
    
    // Clear any existing control file and store new path in state
    {
        let mut control_path = state.control_file_path.lock().unwrap();
        if let Some(old_path) = control_path.as_ref() {
            let _ = std::fs::remove_file(old_path);
        }
        *control_path = Some(control_file_for_state.clone());
    }

    let app_handle = app.clone();
    let runner_exe_clone = runner_exe.clone();
    let python_script_clone = python_script_path.clone();
    let control_file_env = control_file.clone();
    std::thread::spawn(move || {
        // Choose command: exe or python fallback
        let spawn_result = if let Some(script) = python_script_clone.as_ref() {
            // Prefer PY or PYTHON from PATH; use "python" here
            StdCommand::new("python")
                .arg(script)
                .arg(&plan_file)
                .arg("--log-file")
                .arg(&log_file)
                .env("AUTOSERVICE_CONTROL_FILE", &control_file_env)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        } else {
            StdCommand::new(&runner_exe_clone)
                .arg(&plan_file)
                .arg("--log-file")
                .arg(&log_file)
                .env("AUTOSERVICE_CONTROL_FILE", &control_file_env)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        };

        let mut child = match spawn_result {
            Ok(c) => c,
            Err(e) => {
                let which = if python_script_clone.is_some() {
                    format!(
                        "Failed to spawn Python runner (python {}): {e}",
                        python_script_clone.unwrap().display()
                    )
                } else {
                    format!(
                        "Failed to spawn runner EXE ({}): {e}",
                        runner_exe_clone.display()
                    )
                };
                let _ = app_handle.emit(
                    "service_runner_line",
                    serde_json::json!({"stream":"stderr","line": which}),
                );
                return;
            }
        };

        // Stream stderr lines (Python logging)
        if let Some(stderr) = child.stderr.take() {
            let app_stderr = app_handle.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(l) => {
                            let _ = app_stderr.emit(
                                "service_runner_line",
                                serde_json::json!({"stream":"stderr","line": l}),
                            );
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // Collect stdout after process exits (used mainly for final JSON)
        let mut final_stdout = String::new();
        if let Some(stdout) = child.stdout.take() {
            // It's fine to read after wait if output is small; read concurrently anyway to be safe
            let mut buf_reader = BufReader::new(stdout);
            let _ = buf_reader.read_to_string(&mut final_stdout);
        }

        let _ = child.wait();
        
        // Clear control file path when run completes
        {
            let app_state = app_handle.state::<AppState>();
            let mut control_path = app_state.control_file_path.lock().unwrap();
            if let Some(path) = control_path.as_ref() {
                let _ = std::fs::remove_file(path);
            }
            *control_path = None;
        }

        // Attempt to parse final JSON
        let final_report = match serde_json::from_str::<serde_json::Value>(&final_stdout) {
            Ok(v) => v,
            Err(_) => serde_json::json!({"raw": final_stdout}),
        };
        let _ = app_handle.emit(
            "service_runner_done",
            serde_json::json!({
                "final_report": final_report,
                "plan_file": plan_file,
                "log_file": log_file
            }),
        );
    });

    Ok(plan_file_for_return.to_string_lossy().to_string())
}

/// Main entry point for the Tauri application.
///
/// This function sets up the Tauri application with all necessary plugins,
/// state management, and command handlers. It also ensures the data directory
/// structure is created before starting the application.
///
/// # Panics
/// Panics if the Tauri application fails to run
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;

    // Resolve and ensure the data directory structure exists
    let data_root = crate::paths::resolve_data_dir();
    if let Err(e) = crate::paths::ensure_structure(&data_root) {
        eprintln!("Failed to ensure data structure at {:?}: {}", data_root, e);
    }

    // Build the Tauri application with plugins and state
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) // Shell plugin for running external commands
        .manage(AppState {
            data_dir: Arc::new(data_root), // Manage application state with data directory
            control_file_path: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_opener::init()) // Opener plugin for opening files/URLs
        .plugin(tauri_plugin_dialog::init()) // Dialog plugin for file/folder dialogs
        .plugin(tauri_plugin_notification::init()) // Notification plugin for desktop toasts
        .invoke_handler(tauri::generate_handler![
            // List of all Tauri commands exposed to the frontend
            greet,
            launch_shortcut,
            get_data_dirs,
            start_service_run,
            stop_service_run,
            pause_service_run,
            skip_current_task,
            list_programs,
            save_program,
            remove_program,
            launch_program,
            open_program_folder,
            get_tool_statuses,
            list_scripts,
            save_script,
            remove_script,
            run_script,
            suggest_logo_from_exe,
            read_image_as_data_url,
            get_system_info,
            load_app_settings,
            save_app_settings,
            make_portable_path,
            resolve_portable_path,
            save_report,
            list_reports,
            load_report,
            load_report_from_path,
            delete_report,
            open_report_folder,
            // Network report sharing
            save_report_to_network,
            list_network_reports,
            test_network_path,
            open_absolute_path
        ])
        .setup(|app| {
            // Setup function called after the app is initialized
            // Configure WebView2 user data folder for persistence in portable mode
            if let Some(data_dir_str) = app
                .state::<AppState>()
                .inner()
                .clone()
                .data_dir
                .as_ref()
                .to_str()
            {
                let webview_profile = std::path::Path::new(data_dir_str).join("webview_profile");
                if std::fs::create_dir_all(&webview_profile).is_ok() {
                    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_profile);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
