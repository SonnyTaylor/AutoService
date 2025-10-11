/**
 * dism_health_check Handler
 *
 * Windows Image Health Check using DISM (Deployment Image Servicing and Management).
 * Runs CheckHealth, ScanHealth, and RestoreHealth operations.
 */

import { html } from "lit-html";
import { renderHeader, kpiBox } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "dism_health_check",
  label: "DISM Health Check",
  group: "System Integrity",
  category: "System Integrity",
  toolKeys: [],
  async build() {
    return {
      type: "dism_health_check",
      actions: ["checkhealth", "scanhealth", "restorehealth"],
      ui_label: "DISM Health Check",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderDism in tasks.js)
// =============================================================================

/**
 * Render DISM health check results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const steps = Array.isArray(s.steps) ? s.steps : [];

  const getStep = (action) =>
    steps.find((step) => step.action === action)?.parsed;

  const checkHealth = getStep("checkhealth");
  const scanHealth = getStep("scanhealth");
  const restoreHealth = getStep("restorehealth");

  const isHealthy =
    checkHealth?.health_state === "healthy" &&
    scanHealth?.health_state === "healthy";
  const isRepairable =
    checkHealth?.health_state === "repairable" ||
    scanHealth?.health_state === "repairable";

  let verdict = "Unknown";
  if (isHealthy) {
    verdict = "Healthy";
  } else if (isRepairable) {
    const repaired = restoreHealth?.message
      ?.toLowerCase()
      .includes("operation completed successfully");
    verdict = repaired ? "Repaired" : "Corruption Found";
  } else if (result.status === "fail") {
    verdict = "Scan Failed";
  }

  const fmtHealth = (h) => {
    if (!h) return "N/A";
    if (h.health_state === "healthy") return "Healthy";
    if (h.health_state === "repairable") return "Corrupt";
    return "Unknown";
  };

  const fmtRestore = (h) => {
    if (!h) return "N/A";
    if (h.message?.toLowerCase().includes("operation completed successfully")) {
      return isRepairable ? "Repaired" : "Success";
    }
    if (h.repair_success === false) return "Failed";
    return "Unknown";
  };

  return html`
    <div class="card dism">
      ${renderHeader("Windows Image Health (DISM)", result.status)}
      <div class="kpi-row">
        ${kpiBox("Verdict", verdict)}
        ${kpiBox("CheckHealth", fmtHealth(checkHealth))}
        ${kpiBox("ScanHealth", fmtHealth(scanHealth))}
        ${kpiBox("RestoreHealth", fmtRestore(restoreHealth))}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processDISMHealthCheck in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from DISM health check results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  if (status !== "success") return [];

  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const checkHealth = steps.find((s) => s.action === "checkhealth")?.parsed;
  const restoreHealth = steps.find((s) => s.action === "restorehealth")?.parsed;

  if (checkHealth?.health_state === "healthy") {
    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: "Windows image: Healthy",
        variant: "info",
      }),
    ];
  } else if (checkHealth?.health_state === "repairable") {
    const repaired = restoreHealth?.message
      ?.toLowerCase()
      .includes("operation completed successfully");

    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: `Windows image: ${repaired ? "Repaired" : "Corruption found"}`,
        variant: "info",
      }),
    ];
  }

  return [];
}
