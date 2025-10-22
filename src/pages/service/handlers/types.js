/**
 * Type definitions for service handlers.
 * These types document the expected structure of handler modules.
 */

/**
 * @typedef {Object} ServiceBuildArgs
 * @property {Object<string, any>=} params - UI parameters for this service
 * @property {(keyOrKeys: string|string[]) => Promise<string|null>} resolveToolPath - Resolve tool executable path(s)
 * @property {() => Promise<Record<string, string>>} getDataDirs - Resolve data directories
 */

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} id - Unique service identifier (must match Python handler)
 * @property {string} label - Human-readable display name
 * @property {string} group - UI grouping category (Diagnostics, Security, Cleanup, etc.)
 * @property {string=} category - Sub-category for advanced filtering
 * @property {Object<string, any>=} defaultParams - Default UI parameters
 * @property {string[]=} toolKeys - Array of tool keys required for this service
 * @property {boolean=} isDiagnostic - If true, this service is read-only diagnostic (no system changes)
 * @property {(args: ServiceBuildArgs) => Promise<Record<string, any>>} build - Build task JSON payload
 */

/**
 * @typedef {Object} ServiceTaskResult
 * @property {string} task_type - Task type identifier
 * @property {string} status - Execution status (success, error, warning)
 * @property {Record<string, any>} summary - Task-specific result data
 * @property {string} [ui_label] - Optional display name override
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

/**
 * @typedef {Object} TechRendererContext
 * @property {ServiceTaskResult} result - The task result to render
 * @property {number} index - Index of this result in the results array
 */

/**
 * @typedef {Object} CustomerMetricsContext
 * @property {Record<string, any>} summary - Task summary data
 * @property {string} status - Task execution status
 */

/**
 * @typedef {Object} ParamControlsContext
 * @property {Record<string, any>} params - Current parameter values
 * @property {(key: string, value: any) => void} updateParam - Callback to update a parameter
 */

/**
 * Service handler module interface.
 * Each handler exports these components to integrate with the service system.
 *
 * @typedef {Object} ServiceHandler
 * @property {ServiceDefinition} definition - Service catalog definition
 * @property {function(TechRendererContext): any} renderTech - Technician view renderer (lit-html)
 * @property {function(CustomerMetricsContext): CustomerMetric|CustomerMetric[]|null} [extractCustomerMetrics] - Customer metric extractor (optional)
 * @property {function(ParamControlsContext): HTMLElement|string|null} [renderParamControls] - Optional UI controls for service parameters in builder
 * @property {string} [viewCSS] - Optional CSS rules for technician web view (screen)
 * @property {string} [printCSS] - Optional CSS rules for technician print output (tech PDF)
 * @property {string} [customerPrintCSS] - Optional CSS rules for customer print output (customer PDF)
 */
