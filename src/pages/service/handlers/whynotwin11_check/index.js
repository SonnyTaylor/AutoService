/**
 * WhyNotWin11 Compatibility Check Handler
 * ---------------------------------------------------------------------------
 * Checks Windows 11 upgrade compatibility using WhyNotWin11 tool.
 * Analyzes hardware requirements and provides upgrade recommendations.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with compatibility matrix
 * - Customer metrics extractor showing upgrade readiness
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
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

export const definition = {
  id: "whynotwin11_check",
  label: "Windows 11 Upgrade Check",
  group: "Diagnostics",
  category: "Diagnostics",
  toolKeys: ["whynotwin11"],
  async build({ resolveToolPath }) {
    const p = await resolveToolPath(["whynotwin11", "whynotwin11portable"]);
    return {
      type: "whynotwin11_check",
      executable_path: p,
      ui_label: "Windows 11 Upgrade Check",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

export function renderTech({ result, index }) {
  const s = result.summary || {};
  const hr = s.human_readable || {};
  const failing = Array.isArray(s.failing_checks) ? s.failing_checks.length : 0;
  const passing = Array.isArray(s.passing_checks) ? s.passing_checks.length : 0;
  const total = failing + passing;

  const compatPercent = total > 0 ? Math.round((passing / total) * 100) : 0;
  const readyVariant = s.ready ? "ok" : "fail";
  const readyText = s.ready ? "Yes ✓" : "No ✗";

  const criticalChecks = [];
  const warningChecks = [];

  (s.failing_checks || []).forEach((check) => {
    const checkLower = String(check).toLowerCase();
    if (
      checkLower.includes("tpm") ||
      checkLower.includes("secure boot") ||
      checkLower.includes("cpu") ||
      checkLower.includes("processor")
    ) {
      criticalChecks.push(check);
    } else {
      warningChecks.push(check);
    }
  });

  return html`
    <div class="card wn11">
      ${renderHeader("Windows 11 Compatibility Check", result.status)}

      <div class="wn11-status-banner ${s.ready ? "ready" : "not-ready"}">
        <div class="wn11-status-icon">
          ${s.ready
            ? html`<i class="ph-fill ph-check-circle"></i>`
            : html`<i class="ph-fill ph-x-circle"></i>`}
        </div>
        <div class="wn11-status-content">
          <div class="wn11-status-title">
            ${s.ready
              ? "This PC meets Windows 11 requirements"
              : "This PC does not meet Windows 11 requirements"}
          </div>
          <div class="wn11-status-subtitle">
            ${s.hostname ? `Computer: ${s.hostname}` : ""}
            ${compatPercent > 0 ? ` • ${compatPercent}% compatible` : ""}
          </div>
        </div>
      </div>

      <div class="kpi-row">
        ${kpiBox("Windows 11 Ready", readyText, readyVariant)}
        ${kpiBox(
          "Compatibility",
          `${compatPercent}%`,
          compatPercent >= 100
            ? "ok"
            : compatPercent >= 80
            ? "info"
            : compatPercent >= 50
            ? "warn"
            : "fail"
        )}
        ${kpiBox(
          "Passing Checks",
          String(passing),
          passing > 0 ? "ok" : undefined
        )}
        ${kpiBox(
          "Failing Checks",
          String(failing),
          failing > 0 ? "fail" : "ok"
        )}
      </div>

      ${failing > 0
        ? html`
            <div class="wn11-checks-section">
              <div class="section-title">
                <i class="ph ph-warning-circle"></i> Requirements Not Met
              </div>
              ${criticalChecks.length > 0
                ? html`
                    <div class="wn11-check-group">
                      <div class="wn11-check-group-title">
                        Critical Requirements
                      </div>
                      <div class="pill-row">
                        ${map(criticalChecks, (c) => pill(c, "fail"))}
                      </div>
                    </div>
                  `
                : ""}
              ${warningChecks.length > 0
                ? html`
                    <div class="wn11-check-group">
                      <div class="wn11-check-group-title">
                        ${criticalChecks.length > 0
                          ? "Other Requirements"
                          : "Failed Requirements"}
                      </div>
                      <div class="pill-row">
                        ${map(warningChecks, (c) => pill(c, "fail"))}
                      </div>
                    </div>
                  `
                : ""}
              ${criticalChecks.length === 0 && warningChecks.length === 0
                ? html`<div class="pill-row">
                    ${map(s.failing_checks || [], (c) => pill(c, "fail"))}
                  </div>`
                : ""}
            </div>
          `
        : ""}
      ${passing > 0
        ? html`
            <div class="wn11-checks-section">
              <div class="section-title">
                <i class="ph ph-check-circle"></i> Requirements Met (${passing})
              </div>
              <details class="wn11-passing-details">
                <summary>Show all passing checks</summary>
                <div class="pill-row">
                  ${map(s.passing_checks || [], (c) => pill(c, "ok"))}
                </div>
              </details>
            </div>
          `
        : ""}
      ${!s.ready && failing > 0
        ? html`
            <div class="wn11-recommendations">
              <div class="wn11-rec-title">
                <i class="ph ph-lightbulb"></i> Recommendations
              </div>
              <ul class="wn11-rec-list">
                ${criticalChecks.some((c) => c.toLowerCase().includes("tpm"))
                  ? html`<li>
                      <strong>TPM 2.0:</strong> Enable TPM in BIOS/UEFI settings
                      or check if motherboard supports TPM module
                    </li>`
                  : ""}
                ${criticalChecks.some((c) =>
                  c.toLowerCase().includes("secure boot")
                )
                  ? html`<li>
                      <strong>Secure Boot:</strong> Enable Secure Boot in
                      BIOS/UEFI settings (may require converting MBR to GPT)
                    </li>`
                  : ""}
                ${criticalChecks.some(
                  (c) =>
                    c.toLowerCase().includes("cpu") ||
                    c.toLowerCase().includes("processor")
                )
                  ? html`<li>
                      <strong>CPU:</strong> CPU is not on Microsoft's compatible
                      list. Consider hardware upgrade for Windows 11
                    </li>`
                  : ""}
                ${criticalChecks.length === 0 && failing > 0
                  ? html`<li>
                      Review the failed requirements above and consult
                      manufacturer documentation or BIOS settings
                    </li>`
                  : ""}
              </ul>
            </div>
          `
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const ready = summary?.ready;
  const failingChecks = summary?.failing_checks || [];
  const passingChecks = summary?.passing_checks || [];
  const totalChecks = passingChecks.length + failingChecks.length;

  const items = [];
  if (failingChecks.length > 0) {
    items.push(`Failing: ${failingChecks.join(", ")}`);
  }

  return buildMetric({
    icon: ready ? "✅" : "⚠️",
    label: "Windows 11 Ready",
    value: ready ? "Yes" : "Not Yet",
    detail: `${passingChecks.length}/${totalChecks} requirements met`,
    variant: ready ? "success" : "info",
    items: items.length > 0 ? items : undefined,
  });
}
