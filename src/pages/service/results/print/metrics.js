/**
 * @typedef {import('./types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('./types').CustomerMetric} CustomerMetric
 */

// =============================================================================
// HANDLER INTEGRATION
// =============================================================================

import { getCustomerMetricExtractors } from "../../handlers/index.js";

/**
 * All customer metrics are now extracted by handlers.
 * Each handler exports an extractCustomerMetrics function that processes
 * task results into customer-friendly metric cards.
 *
 * To add a new service metric:
 * 1. Create a handler in handlers/[service_id]/
 * 2. Implement the extractCustomerMetrics function
 * 3. Register in handlers/index.js
 *
 * See docs/HANDLER_MIGRATION_GUIDE.md for details.
 */

// =============================================================================
// CUSTOMER METRICS EXTRACTION
// =============================================================================

/**
 * Extract customer-friendly metrics from an array of task results.
 *
 * This function processes service task results and converts them into
 * human-readable metric cards suitable for customer reports. All task types
 * are now handled by their respective handler modules.
 *
 * @param {ServiceTaskResult[]} results - Array of service task execution results
 * @returns {CustomerMetric[]} Array of formatted metric cards for display
 *
 * @example
 * const metrics = extractCustomerMetrics(serviceResults);
 * // Returns: [
 * //   { icon: "🛡️", label: "Viruses Removed", value: "5", ... },
 * //   { icon: "🧹", label: "Junk Files Cleaned", value: "2.5 GB", ... }
 * // ]
 */
export function extractCustomerMetrics(results) {
  const handlerExtractors = getCustomerMetricExtractors();
  const metrics = [];

  // Extract metrics using handler extractors
  for (const result of results) {
    const taskType = result.task_type || result.type;
    const extractor = handlerExtractors[taskType];

    if (extractor) {
      const extracted = extractor({
        summary: result.summary,
        status: result.status,
        result: result,
      });

      if (extracted) {
        if (Array.isArray(extracted)) {
          metrics.push(...extracted);
        } else {
          metrics.push(extracted);
        }
      }
    }
  }

  return metrics;
}

// =============================================================================
// TASK LIST GENERATION
// =============================================================================

/**
 * Map of task type identifiers to customer-friendly display names.
 * @private
 */
const TASK_DISPLAY_NAMES = {
  bleachbit_clean: "System Cleanup & Junk File Removal",
  adwcleaner_clean: "Adware & Malware Removal",
  kvrt_scan: "Virus Scan & Removal",
  sfc_scan: "System File Integrity Check",
  dism_health_check: "System Health Verification",
  smartctl_report: "Hard Drive Health Analysis",
  chkdsk_scan: "Disk Error Check & Repair",
  heavyload_stress_test: "CPU & RAM Stress Test",
  furmark_stress_test: "Graphics Card Stress Test",
  winsat_disk: "Disk Performance Test",
  speedtest: "Internet Speed Test",
  ping_test: "Network Connectivity Test",
  iperf_test: "Network Throughput Test",
  windows_update: "Windows Updates",
  whynotwin11_check: "Windows 11 Compatibility Check",
  ai_startup_disable: "Startup Optimization",
  disk_space_report: "Disk Space Report",
};

/**
 * Get customer-friendly display name for a task type.
 * @private
 * @param {string} taskType - Internal task type identifier
 * @returns {string} Human-readable task name
 */
function getTaskDisplayName(taskType) {
  if (TASK_DISPLAY_NAMES[taskType]) {
    return TASK_DISPLAY_NAMES[taskType];
  }

  // Fallback: convert snake_case to Title Case
  return taskType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Get status icon for a task based on its execution status.
 * @private
 * @param {string} status - Task execution status (success, failure, etc.)
 * @returns {string} Icon character to display
 */
function getStatusIcon(status) {
  switch (status) {
    case "success":
      return "✓";
    case "failure":
      return "⚠";
    default:
      return "•";
  }
}

/**
 * Format a single task result as an HTML list item.
 * @private
 * @param {ServiceTaskResult} result - Task execution result
 * @returns {string} HTML string for list item
 */
function formatTaskListItem(result) {
  const type = result?.task_type || result?.type || "unknown";
  const status = result?.status || "";

  const displayName = getTaskDisplayName(type);
  const icon = getStatusIcon(status);

  return `<li><span class="task-icon ${status}">${icon}</span> ${displayName}</li>`;
}

/**
 * Convert task results into a simple customer-facing HTML list.
 *
 * Creates an HTML unordered list of tasks performed during the service,
 * with status icons and customer-friendly names. Excludes skipped tasks.
 *
 * @param {ServiceTaskResult[]} results - Array of task execution results
 * @returns {string} HTML string containing list items (without <ul> wrapper)
 *
 * @example
 * const listHtml = buildCustomerTaskList(serviceResults);
 * // Returns: "<li><span class='task-icon success'>✓</span> Virus Scan & Removal</li>..."
 */
export function buildCustomerTaskList(results) {
  return results
    .filter((result) => result.status !== "skipped")
    .map(formatTaskListItem)
    .join("");
}

// =============================================================================
// RECOMMENDATIONS GENERATION
// =============================================================================

/**
 * Check if any threats were detected during service execution.
 * @private
 * @param {ServiceTaskResult[]} results - Array of task results
 * @returns {boolean} True if threats were found
 */
function hasThreatsDetected(results) {
  return results.some((result) => {
    const type = result?.task_type || "";
    const summary = result?.summary || {};

    // Check KVRT scan for virus detections
    if (type === "kvrt_scan" && Array.isArray(summary.detections)) {
      return summary.detections.length > 0;
    }

    // Check AdwCleaner for quarantined items
    if (type === "adwcleaner_clean" && summary.quarantined) {
      return summary.quarantined > 0;
    }

    return false;
  });
}

/**
 * Check if any tasks failed during execution.
 * @private
 * @param {ServiceTaskResult[]} results - Array of task results
 * @returns {boolean} True if any failures occurred
 */
function hasFailedTasks(results) {
  return results.some((result) => result.status === "failure");
}

/**
 * Build list of actionable recommendations based on service outcomes.
 * @private
 * @param {boolean} threatsFound - Whether threats were detected
 * @param {boolean} tasksFailed - Whether any tasks failed
 * @returns {string[]} Array of recommendation strings
 */
function buildRecommendationList(threatsFound, tasksFailed) {
  const recommendations = [];

  // Security recommendation if threats were found
  if (threatsFound) {
    recommendations.push(
      "• Run a full system scan regularly to maintain security"
    );
  }

  // Standard maintenance recommendations
  recommendations.push("• Keep Windows and your applications up to date");
  recommendations.push("• Perform regular maintenance every 3-6 months");
  recommendations.push("• Back up important files regularly");

  // Support recommendation if issues occurred
  if (tasksFailed) {
    recommendations.push(
      "• Some tasks encountered issues - contact support if problems persist"
    );
  }

  return recommendations;
}

/**
 * Generate customer-facing recommendations based on task outcomes.
 *
 * Analyzes service results and provides tailored maintenance recommendations.
 * Recommendations are context-aware based on threats detected, task failures,
 * and general best practices.
 *
 * @param {ServiceTaskResult[]} results - Array of task execution results
 * @returns {string} HTML string of recommendation paragraphs
 *
 * @example
 * const recommendations = generateRecommendations(serviceResults);
 * // Returns: "<p>• Keep Windows and your applications up to date</p>..."
 */
export function generateRecommendations(results) {
  const threatsFound = hasThreatsDetected(results);
  const tasksFailed = hasFailedTasks(results);

  const recommendations = buildRecommendationList(threatsFound, tasksFailed);

  // Convert to HTML paragraphs
  return recommendations.map((rec) => `<p>${rec}</p>`).join("");
}
