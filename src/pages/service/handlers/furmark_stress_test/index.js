/**
 * FurMark GPU Stress Test Handler
 * ---------------------------------------------------------------------------
 * Stress tests GPU using FurMark to validate graphics card stability and thermal performance.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with stress test results
 * - Customer metrics extractor showing performance test completion
 */

import { renderGeneric } from "../../results/renderers/common.js";

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
  id: "furmark_stress_test",
  label: "GPU Stress (FurMark)",
  group: "Stress",
  category: "Stress",
  defaultParams: { minutes: 1 },
  toolKeys: ["furmark", "furmark2"],
  async build({ params, resolveToolPath }) {
    let p = await resolveToolPath(["furmark", "furmark2"]);
    if (p && /furmark_gui\.exe$/i.test(p))
      p = p.replace(/[^\\\/]+$/g, "furmark.exe");
    return {
      type: "furmark_stress_test",
      executable_path: p,
      duration_minutes: params?.minutes || 1,
      width: 1920,
      height: 1080,
      demo: "furmark-gl",
      extra_args: ["--no-gui"],
      ui_label: "GPU Stress (FurMark)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for FurMark GPU stress test.
 * Uses generic renderer since FurMark output is minimal.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  return renderGeneric(result, index);
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly stress test metrics.
 * Shows that GPU stress test was performed.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  return {
    icon: "⚡",
    label: "GPU Stress Test",
    value: "Completed",
    detail: "Graphics card tested",
    variant: "info",
  };
}
