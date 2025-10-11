/**
 * [SERVICE_NAME] Handler
 * ---------------------------------------------------------------------------
 * [Brief description of what this service does]
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer
 * - Customer metrics extractor (optional)
 */

import { html } from "lit-html";
import { renderHeader, kpiBox, pill, renderList } from "../common/ui.js";
import {
  formatBytes,
  formatPercent,
  getStatusVariant,
  buildMetric,
} from "../common/metrics.js";

/**
 * @typedef {import('../types').ServiceDefinition} ServiceDefinition
 * @typedef {import('../types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('../types').CustomerMetric} CustomerMetric
 * @typedef {import('../types').TechRendererContext} TechRendererContext
 * @typedef {import('../types').CustomerMetricsContext} CustomerMetricsContext
 */

// =============================================================================
// SERVICE DEFINITION
// =============================================================================

/**
 * Service catalog definition.
 * @type {ServiceDefinition}
 */
export const definition = {
  id: "template_service",
  label: "Template Service",
  group: "Diagnostics", // or Security, Cleanup, Network, Stress, System Integrity
  category: "Diagnostics",
  defaultParams: {
    // Optional: UI-configurable parameters
    // example_param: "default_value"
  },
  toolKeys: [
    // Optional: External tool dependencies
    // "tool_key_from_programs_json"
  ],
  async build({ params, resolveToolPath, getDataDirs }) {
    // Build the JSON payload for the Python runner
    // This is what gets passed to the Python service handler

    // Example: Resolve tool path if needed
    // const toolPath = await resolveToolPath(['tool_key']);

    // Example: Get data directories if needed
    // const dirs = await getDataDirs();

    return {
      type: "template_service", // Must match Python handler type
      // Add task-specific parameters here
      // param1: params?.param1 || "default",
      ui_label: "Template Service", // Optional: Override display name
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for this service result.
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const summary = result.summary || {};
  const hr = summary.human_readable || {};

  // Extract data from the result
  // const exampleValue = hr.example_value || "N/A";

  // Build KPIs or other display elements
  // const kpis = [
  //   kpiBox("Label", exampleValue),
  //   // Add more KPIs...
  // ];

  return html`
    <div class="card template-service">
      ${renderHeader(result.ui_label || "Template Service", result.status)}

      <!-- Add your custom rendering here -->
      <div class="template-content">${renderList(summary)}</div>

      <!-- Example KPI row -->
      <!-- <div class="kpi-row">${kpis}</div> -->
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly metrics from this service result.
 * Return null if this service shouldn't appear in customer reports.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|CustomerMetric[]|null} Customer metric(s) or null
 */
export function extractCustomerMetrics({ summary, status }) {
  // Return null if no customer-facing metrics for this service
  // return null;

  // Example: Extract data and build metric
  // const exampleValue = summary?.example_value;
  // if (!exampleValue) return null;

  // return buildMetric({
  //   icon: "🔧",
  //   label: "Example Metric",
  //   value: exampleValue,
  //   detail: "Additional context",
  //   variant: getStatusVariant(status),
  //   items: [
  //     "Detail item 1",
  //     "Detail item 2",
  //   ],
  // });

  return null; // Remove this when implementing
}
