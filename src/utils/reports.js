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
