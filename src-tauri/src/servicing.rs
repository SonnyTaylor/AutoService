use std::path::Path;

/// Run a Windows Defender quick scan using the detected MpCmdRun.exe and return
/// structured results (stdout/stderr/exit code). This is intentionally simple
/// and synchronous to make frontend integration straightforward.
#[tauri::command]
pub fn run_defender_scan(
    _state: tauri::State<crate::state::AppState>,
) -> Result<serde_json::Value, String> {
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

        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

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
pub fn find_defender_mpcmdrun() -> Option<String> {
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
                        if name > cur_name {
                            best_dir = Some(p);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    let exe = best_dir?.join("MpCmdRun.exe");
    if exe.is_file() {
        Some(exe.to_string_lossy().to_string())
    } else {
        None
    }
}

#[cfg(not(windows))]
pub fn find_defender_mpcmdrun() -> Option<String> {
    None
}
