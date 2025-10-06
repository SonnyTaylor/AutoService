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
