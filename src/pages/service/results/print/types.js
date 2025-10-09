/**
 * @typedef {Object} ServiceTaskResult
 * @property {string} [task_type]
 * @property {string} [type]
 * @property {string} [status]
 * @property {Record<string, any>} [summary]
 */

/**
 * @typedef {Object} ServiceReport
 * @property {string} [overall_status]
 * @property {string} [hostname]
 * @property {{ hostname?: string }} [summary]
 * @property {ServiceTaskResult[]} [results]
 */

/**
 * @typedef {Object} CustomerMetric
 * @property {string} icon - Emoji icon for the metric
 * @property {string} label - Human-readable label
 * @property {string} value - Primary value to display
 * @property {string} [detail] - Additional context
 * @property {'success' | 'info' | 'warning'} variant - Color variant
 * @property {string[]} [items] - Detailed breakdown items (optional list)
 * @property {boolean} [keepAllItems] - If true, skip item truncation in customer summary
 * @property {number} [itemDisplayLimit] - Optional override for truncation limit
 */
