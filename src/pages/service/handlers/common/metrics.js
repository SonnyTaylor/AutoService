/**
 * Common metric processing utilities for service handlers.
 * These helpers are used across multiple handlers when building customer metrics.
 */

/**
 * Format bytes to human-readable size string.
 * @param {number} bytes - Bytes to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Formatted size string (e.g., "1.5 GB")
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes == null || isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Format percentage value.
 * @param {number|string} value - Percentage value
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return "-";
  return `${parseFloat(value).toFixed(decimals)}%`;
}

/**
 * Format milliseconds to human-readable duration.
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Determine status variant from status string.
 * @param {string} status - Status string (e.g., "success", "error", "warning")
 * @returns {'success' | 'info' | 'warning'} Variant for metric display
 */
export function getStatusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "clean" || s === "passed") return "success";
  if (s === "error" || s === "failed" || s === "critical") return "warning";
  return "info";
}

/**
 * Truncate array to specified limit with ellipsis message.
 * @param {Array} items - Array to truncate
 * @param {number} limit - Maximum items to show
 * @returns {Array} Truncated array with optional ellipsis item
 */
export function truncateItems(items, limit = 5) {
  if (!Array.isArray(items) || items.length <= limit) return items;
  const truncated = items.slice(0, limit);
  const remaining = items.length - limit;
  truncated.push(`...and ${remaining} more`);
  return truncated;
}

/**
 * Build a customer metric object.
 * @param {object} options - Metric configuration
 * @param {string} options.icon - Emoji icon
 * @param {string} options.label - Metric label
 * @param {string} options.value - Primary value
 * @param {string} [options.detail] - Additional detail
 * @param {'success' | 'info' | 'warning'} [options.variant] - Display variant
 * @param {string[]} [options.items] - Optional item list
 * @param {boolean} [options.keepAllItems] - Skip item truncation
 * @param {number} [options.itemDisplayLimit] - Custom truncation limit
 * @returns {object} CustomerMetric object
 */
export function buildMetric({
  icon,
  label,
  value,
  detail,
  variant = "info",
  items,
  keepAllItems = false,
  itemDisplayLimit,
}) {
  const metric = { icon, label, value, variant };
  if (detail) metric.detail = detail;
  if (items && items.length > 0) {
    metric.items = items;
    if (keepAllItems) metric.keepAllItems = true;
    if (itemDisplayLimit != null) metric.itemDisplayLimit = itemDisplayLimit;
  }
  return metric;
}
