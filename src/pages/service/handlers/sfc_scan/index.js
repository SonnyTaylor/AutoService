/**
 * SFC Scan Handler
 * ---------------------------------------------------------------------------
 * Runs Windows System File Checker (sfc /scannow) to verify and repair
 * system file integrity.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with icon-based status display
 * - Customer metrics extractor showing system health status
 */

import { html } from "lit-html";
import { renderHeader } from "../common/ui.js";
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
  id: "sfc_scan",
  label: "SFC Scan",
  group: "System Integrity",
  category: "System Integrity",
  toolKeys: [],
  async build() {
    return { type: "sfc_scan", ui_label: "SFC Scan" };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for SFC scan.
 * Displays integrity status with icon and repair information.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const violations = s.integrity_violations;
  const repairs = s.repairs_attempted;
  const success = s.repairs_successful;

  let icon, message;
  if (violations === false) {
    icon = html`<i class="ph-fill ph-check-circle ok"></i>`;
    message = "No integrity violations found.";
  } else if (violations === true) {
    icon = html`<i class="ph-fill ph-warning-circle fail"></i>`;
    message = "System file integrity violations were found.";
  } else {
    icon = html`<i class="ph-fill ph-question"></i>`;
    message = "Scan result could not be determined.";
  }

  return html`
    <div class="card sfc">
      ${renderHeader("System File Checker (SFC)", result.status)}
      <div class="sfc-layout">
        <div class="sfc-icon">${icon}</div>
        <div class="sfc-details">
          <div class="sfc-verdict">${message}</div>
          ${violations
            ? html`
                <div class="sfc-repair muted">
                  ${repairs
                    ? `Repairs were attempted. Result: ${
                        success ? "Success" : "Failed"
                      }`
                    : "Repairs were not attempted."}
                </div>
              `
            : ""}
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-facing metrics from SFC scan result.
 * Shows system file integrity status.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Metric card or null if no data
 */
export function extractCustomerMetrics({ result }) {
  if (result.status !== "success") return null;

  const summary = result.summary || {};
  const violations = summary.integrity_violations;
  const repairs = summary.repairs_attempted;

  if (violations === false) {
    // No issues - report as healthy
    return buildMetric({
      icon: "🛡️",
      label: "System Files",
      value: "Healthy",
      detail: "No integrity violations found",
      variant: "success",
    });
  } else if (violations === true) {
    // Issues found - show repair status
    const value = repairs ? "Repaired" : "Issues Found";
    const detail = repairs
      ? "System file issues found and repaired"
      : "System file issues detected";
    const variant = repairs ? "info" : "warning";

    return buildMetric({
      icon: "🛡️",
      label: "System Files",
      value,
      detail,
      variant,
    });
  }

  // Unknown status - don't show metric
  return null;
}
