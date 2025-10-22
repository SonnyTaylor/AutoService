/**
 * @typedef {import('./types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('./types').CustomerMetric} CustomerMetric
 */

// =============================================================================
// HANDLER INTEGRATION
// =============================================================================

import {
  getCustomerMetricExtractors,
  getServiceDefinitions,
} from "../../handlers/index.js";

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
// DIAGNOSTIC STATUS DETECTION
// =============================================================================

/**
 * Check if a task type is diagnostic (read-only, no system changes).
 * Uses handler definitions to determine diagnostic status.
 *
 * @private
 * @param {string} taskType - Task type identifier
 * @returns {boolean} True if task is diagnostic
 */
function isTaskTypeDiagnostic(taskType) {
  const definitions = getServiceDefinitions();
  const definition = definitions[taskType];
  return definition?.isDiagnostic === true;
}

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
 * @param {Object} options - Options for extraction
 * @param {boolean} [options.includeDiagnostics=true] - Include diagnostic results
 * @returns {CustomerMetric[]} Array of formatted metric cards for display
 *
 * @example
 * const metrics = extractCustomerMetrics(serviceResults);
 * // Returns: [
 * //   { icon: "🛡️", label: "Viruses Removed", value: "5", ... },
 * //   { icon: "🧹", label: "Junk Files Cleaned", value: "2.5 GB", ... }
 * // ]
 */
export function extractCustomerMetrics(results, options = {}) {
  const { includeDiagnostics = true } = options;
  const handlerExtractors = getCustomerMetricExtractors();
  const metrics = [];

  // Extract metrics using handler extractors
  for (const result of results) {
    const taskType = result.task_type || result.type;

    // Skip diagnostic results if not included
    if (!includeDiagnostics && isTaskTypeDiagnostic(taskType)) {
      continue;
    }

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

/**
 * Separate task results into services (with changes) and diagnostics (read-only).
 *
 * @param {ServiceTaskResult[]} results - Array of service task execution results
 * @returns {Object} Object with 'services' and 'diagnostics' arrays
 *
 * @example
 * const { services, diagnostics } = separateServiceAndDiagnostic(results);
 */
export function separateServiceAndDiagnostic(results) {
  const services = [];
  const diagnostics = [];
  const definitions = getServiceDefinitions();

  for (const result of results) {
    const taskType = result.task_type || result.type;
    const definition = definitions[taskType];

    // Dynamic diagnostic detection:
    // Treat tasks as diagnostic if their handler marks them as such OR
    // if the task was run in preview-only mode (no changes applied).
    const summary = result?.summary || {};
    const hr = summary?.human_readable || {};
    const res = summary?.results || {};
    const ranInPreview =
      res?.applied === false || /preview/i.test(String(hr?.mode || ""));

    if (
      isTaskTypeDiagnostic(taskType) ||
      definition?.isDiagnostic === true ||
      ranInPreview
    ) {
      diagnostics.push(result);
    } else {
      services.push(result);
    }
  }

  return { services, diagnostics };
}

// =============================================================================
// TASK LIST GENERATION
// =============================================================================

/**
 * Get customer-friendly display name for a task type.
 * Retrieves the label from the handler definition if available,
 * otherwise converts snake_case to Title Case.
 *
 * @private
 * @param {string} taskType - Internal task type identifier
 * @returns {string} Human-readable task name
 */
function getTaskDisplayName(taskType) {
  // Try to get label from handler definition
  const serviceDefinitions = getServiceDefinitions();
  const definition = serviceDefinitions[taskType];

  if (definition?.label) {
    return definition.label;
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
 * Uses a generic approach to detect threats based on common patterns
 * in summary data from security-related handlers.
 *
 * @private
 * @param {ServiceTaskResult[]} results - Array of task results
 * @returns {boolean} True if threats were found
 */
function hasThreatsDetected(results) {
  return results.some((result) => {
    const summary = result?.summary || {};

    // Generic threat detection patterns:
    // 1. Check for detections array (KVRT, security scanners)
    if (Array.isArray(summary.detections) && summary.detections.length > 0) {
      return true;
    }

    // 2. Check for quarantined items count (AdwCleaner, cleaners)
    if (summary.quarantined && summary.quarantined > 0) {
      return true;
    }

    // 3. Check for removed/detected threat counts
    if (summary.threats_removed && summary.threats_removed > 0) {
      return true;
    }

    if (summary.threats_detected && summary.threats_detected > 0) {
      return true;
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
