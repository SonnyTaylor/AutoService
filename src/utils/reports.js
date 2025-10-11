/**
 * Shared utilities for loading and managing reports across the app.
 * Used by both the reports page and other components that need report access.
 */

/**
 * Load a report from the filesystem and prepare it for display
 * @param {string} folderName - Report folder name
 * @returns {Promise<Object>} Parsed report data
 */
export async function loadReportFromDisk(folderName) {
  const { core } = window.__TAURI__;
  const loaded = await core.invoke("load_report", { folderName });

  return {
    report: JSON.parse(loaded.report_json),
    metadata: loaded.metadata,
    executionLog: loaded.execution_log,
    runPlan: loaded.run_plan ? JSON.parse(loaded.run_plan) : null,
    folderName,
  };
}

/**
 * Format timestamp for display
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string
 */
export function formatReportDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Format timestamp for detailed display with seconds
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string with time
 */
export function formatReportDateTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/**
 * Extract summary info from report for list display
 * @param {Object} report - Parsed report JSON
 * @returns {Object} Summary info
 */
export function extractReportSummary(report) {
  const taskCount = report.results?.length || 0;
  const successCount =
    report.results?.filter((r) => r.status === "success").length || 0;
  const errorCount =
    report.results?.filter((r) => r.status === "error").length || 0;
  const warningCount =
    report.results?.filter((r) => r.status === "warning").length || 0;
  const overall = report.overall_status || "unknown";

  return {
    taskCount,
    successCount,
    errorCount,
    warningCount,
    overall,
    hasErrors: overall !== "success",
  };
}

/**
 * Get a display title for a report based on metadata
 * @param {Object} metadata - Report metadata
 * @returns {string} Display title
 */
export function getReportTitle(metadata) {
  const hostname = metadata.hostname || "Unknown PC";
  const customerName = metadata.customer_name;

  if (customerName) {
    return `${hostname} - ${customerName}`;
  }

  return hostname;
}

/**
 * Get a short title for a report (just hostname)
 * @param {Object} metadata - Report metadata
 * @returns {string} Short display title
 */
export function getReportShortTitle(metadata) {
  return metadata.hostname || "Unknown PC";
}

/**
 * List all reports from the filesystem
 * @returns {Promise<Array>} Array of report items
 */
export async function listReports() {
  const { core } = window.__TAURI__;
  return await core.invoke("list_reports");
}

/**
 * Delete a report from the filesystem
 * @param {string} folderName - Report folder name to delete
 * @returns {Promise<boolean>} True if deletion succeeded
 */
export async function deleteReport(folderName) {
  const { core } = window.__TAURI__;
  return await core.invoke("delete_report", { folderName });
}

/**
 * Check if auto-save is enabled in settings
 * @returns {Promise<boolean>} True if auto-save is enabled
 */
export async function isAutoSaveEnabled() {
  try {
    const { core } = window.__TAURI__;
    const settings = await core.invoke("load_app_settings");
    return settings?.reports?.auto_save === true;
  } catch (err) {
    console.error("Failed to check auto-save setting:", err);
    return false;
  }
}

/**
 * Auto-save a report after service completion
 * @param {Object} report - The final report data
 * @param {Object} options - Additional options
 * @param {string} options.planFilePath - Path to the plan file
 * @param {string} options.logFilePath - Path to the log file
 * @param {string} options.hostname - System hostname
 * @param {string} options.customerName - Customer name (optional)
 * @param {string} options.technicianName - Technician name (optional)
 * @returns {Promise<Object>} Save response with success status and folder path
 */
export async function autoSaveReport(report, options = {}) {
  const {
    planFilePath = null,
    logFilePath = null,
    hostname = "Unknown_PC",
    customerName = null,
    technicianName = null,
  } = options;

  try {
    const { core } = window.__TAURI__;
    const reportJson = JSON.stringify(report, null, 2);

    const response = await core.invoke("save_report", {
      request: {
        report_json: reportJson,
        plan_file_path: planFilePath,
        log_file_path: logFilePath,
        hostname: hostname,
        customer_name: customerName,
        technician_name: technicianName,
      },
    });

    return response;
  } catch (error) {
    console.error("Auto-save failed:", error);
    throw error;
  }
}
