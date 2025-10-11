/// Report management utilities for AutoService.
///
/// Handles saving service run reports to persistent storage in the data/reports directory.
/// Each report is saved in a dedicated folder with a descriptive name including
/// PC hostname, customer name (if available), and timestamp.
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

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

/// Generates a folder name for a saved report.
///
/// Format: `{hostname}_{customer_name}_{date}_{time}`
/// - If customer name is missing, uses "Report" instead
/// - If hostname is missing, uses "Unknown_PC"
/// - Sanitizes names to be filesystem-safe
///
/// # Arguments
/// * `hostname` - Optional PC hostname
/// * `customer_name` - Optional customer name
/// * `timestamp` - Unix timestamp in seconds
///
/// # Returns
/// A sanitized folder name string
fn generate_folder_name(
    hostname: Option<&str>,
    customer_name: Option<&str>,
    timestamp: u64,
) -> String {
    // Use chrono to format human-readable date/time
    let datetime = chrono::DateTime::from_timestamp(timestamp as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now().into());
    let date_str = datetime.format("%Y-%m-%d_%H-%M-%S").to_string();

    // Sanitize and use provided names
    let hostname_part = sanitize_name(hostname.unwrap_or("Unknown_PC"));
    let customer_part = sanitize_name(customer_name.unwrap_or("Report"));

    format!("{}_{}__{}", hostname_part, customer_part, date_str)
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
        let name = generate_folder_name(Some("MyPC"), Some("John Doe"), timestamp);
        assert!(name.contains("MyPC"));
        assert!(name.contains("John_Doe"));
        assert!(name.contains("__"));
    }

    #[test]
    fn test_generate_folder_name_defaults() {
        let timestamp = 1760000000;
        let name = generate_folder_name(None, None, timestamp);
        assert!(name.contains("Unknown_PC"));
        assert!(name.contains("Report"));
    }
}
