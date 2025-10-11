/**
 * Battery Health Handler
 * ---------------------------------------------------------------------------
 * Reports battery health status for laptops and portable devices. This is a
 * client-only service that queries battery information directly from the
 * browser/Tauri without requiring Python execution.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with battery metrics
 * - Customer metrics extractor (optional - typically not shown)
 */

import { html } from "lit-html";
import { renderHeader, kpiBox } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

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
  id: "battery_health",
  label: "Battery Health",
  group: "Diagnostics",
  category: "Diagnostics",
  defaultParams: {
    source: "auto", // auto | cache | live
  },
  toolKeys: [],
  async build({ params }) {
    const source = (params?.source || "auto").toString();
    // Build a virtual task that will be executed client-side (no Python)
    return {
      type: "battery_health",
      source,
      ui_label: "Battery Health",
      _client_only: true,
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for battery health check.
 * Displays battery count, state of health, and verdict.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const info = {
    Batteries: s.count_batteries,
    "Average SOH %": s.average_soh_percent,
    "Low‑health batteries": s.low_health_batteries,
    Verdict: s.human_readable?.verdict,
  };

  return html`
    <div class="result battery">
      ${renderHeader("Battery Health", result.status)}
      <div class="kpi-row">
        ${kpiBox("Batteries", info.Batteries ?? "-")}
        ${kpiBox(
          "Avg SOH",
          info["Average SOH %"] != null ? `${info["Average SOH %"]}%` : "-"
        )}
        ${kpiBox("Low Health", info["Low‑health batteries"] ?? "-")}
        ${kpiBox(
          "Verdict",
          (info.Verdict || "").toString(),
          info.Verdict?.toLowerCase().includes("fail") ? "fail" : undefined
        )}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly battery health metrics.
 * Typically not shown in customer reports unless battery health is poor.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  // Only show in customer report if there are battery health issues
  const lowHealthBatteries = summary?.low_health_batteries || 0;
  const avgSoh = summary?.average_soh_percent;

  // Don't show if no issues (batteries are healthy)
  if (lowHealthBatteries === 0 && avgSoh && avgSoh >= 80) {
    return null;
  }

  const verdict = summary?.human_readable?.verdict || "Unknown";
  const batteryCount = summary?.count_batteries || 0;

  return buildMetric({
    icon: "🔋",
    label: "Battery Health",
    value: avgSoh != null ? `${avgSoh}% SOH` : verdict,
    detail: `${batteryCount} battery${batteryCount !== 1 ? "ies" : ""} checked`,
    variant:
      lowHealthBatteries > 0 || (avgSoh && avgSoh < 80) ? "warning" : "info",
    items:
      lowHealthBatteries > 0
        ? [
            `${lowHealthBatteries} battery${
              lowHealthBatteries !== 1 ? "ies" : ""
            } with low health`,
          ]
        : undefined,
  });
}
