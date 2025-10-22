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
  isDiagnostic: true,
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

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* Windows 11 Compatibility Check (WhyNotWin11) */
  .card.wn11 {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card.wn11 .wn11-status-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1.5px solid #cbd5e1;
    background: #fafbfc;
  }
  .card.wn11 .wn11-status-banner.ready {
    border-color: #86efac;
    background: #f0fdf4;
  }
  .card.wn11 .wn11-status-banner.not-ready {
    border-color: #fca5a5;
    background: #fef2f2;
  }
  .card.wn11 .wn11-status-icon {
    font-size: 26px;
    line-height: 1;
    flex-shrink: 0;
  }
  .card.wn11 .wn11-status-banner.ready .wn11-status-icon {
    color: #16a34a;
  }
  .card.wn11 .wn11-status-banner.not-ready .wn11-status-icon {
    color: #dc2626;
  }
  .card.wn11 .wn11-status-content {
    flex: 1;
    min-width: 0;
  }
  .card.wn11 .wn11-status-title {
    font-size: 11.5pt;
    font-weight: 600;
    letter-spacing: 0.01em;
    margin-bottom: 2px;
    color: #0f172a;
  }
  .card.wn11 .wn11-status-subtitle {
    font-size: 9.5pt;
    color: #64748b;
  }
  .card.wn11 .wn11-checks-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: #fafbfc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  .card.wn11 .wn11-checks-section .section-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
  }
  .card.wn11 .wn11-checks-section .section-title i {
    font-size: 12px;
  }
  .card.wn11 .wn11-check-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card.wn11 .wn11-check-group-title {
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #64748b;
    margin-top: 2px;
  }
  .card.wn11 .wn11-passing-details {
    margin-top: 4px;
  }
  /* Force details open for print - can't interact with dropdowns on paper! */
  .card.wn11 .wn11-passing-details[open],
  .card.wn11 .wn11-passing-details {
    display: block;
  }
  .card.wn11 .wn11-passing-details summary {
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    margin-bottom: 6px;
    list-style: none;
    cursor: default;
    padding: 0;
    background: none;
    border: none;
  }
  .card.wn11 .wn11-passing-details summary::-webkit-details-marker {
    display: none;
  }
  /* Hide the dropdown arrow in print */
  .card.wn11 .wn11-passing-details summary::before {
    display: none;
  }
  .card.wn11 .wn11-passing-details .pill-row {
    margin-top: 0;
  }
  .card.wn11 .wn11-recommendations {
    padding: 10px 12px;
    background: #fef9c3;
    border: 1px solid #facc15;
    border-radius: 6px;
  }
  .card.wn11 .wn11-rec-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #854d0e;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .card.wn11 .wn11-rec-title i {
    font-size: 12px;
  }
  .card.wn11 .wn11-rec-list {
    margin: 0;
    padding-left: 18px;
    list-style: disc;
  }
  .card.wn11 .wn11-rec-list li {
    margin: 5px 0;
    font-size: 9.5pt;
    line-height: 1.4;
    color: #475569;
  }
  .card.wn11 .wn11-rec-list li strong {
    color: #0f172a;
    font-weight: 600;
  }
`;

// =============================================================================
// VIEW CSS (Technician web view)
// =============================================================================

export const viewCSS = `
/* Windows 11 Compatibility Check (technician screen styles) */
.card.wn11 { display: flex; flex-direction: column; gap: 12px; }
.card.wn11 .wn11-status-banner { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border); background: rgba(36, 48, 68, 0.35); }
.card.wn11 .wn11-status-banner.ready { border-color: rgba(74, 222, 128, 0.3); background: rgba(34, 197, 94, 0.08); }
.card.wn11 .wn11-status-banner.not-ready { border-color: rgba(248, 113, 113, 0.3); background: rgba(239, 68, 68, 0.08); }
.card.wn11 .wn11-status-icon { font-size: 32px; line-height: 1; flex-shrink: 0; opacity: 0.9; }
.card.wn11 .wn11-status-banner.ready .wn11-status-icon { color: #4ade80; }
.card.wn11 .wn11-status-banner.not-ready .wn11-status-icon { color: #f87171; }
.card.wn11 .wn11-status-content { flex: 1; min-width: 0; }
.card.wn11 .wn11-status-title { font-size: 14px; font-weight: 600; letter-spacing: 0.01em; margin-bottom: 3px; color: var(--text-primary); }
.card.wn11 .wn11-status-subtitle { font-size: 12px; opacity: 0.7; color: var(--text-secondary); }
.card.wn11 .wn11-checks-section { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: rgba(36, 48, 68, 0.35); border: 1px solid var(--border); border-radius: 8px; }
.card.wn11 .wn11-checks-section .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; display: flex; align-items: center; gap: 6px; }
.card.wn11 .wn11-checks-section .section-title i { font-size: 14px; }
.card.wn11 .wn11-check-group { display: flex; flex-direction: column; gap: 6px; }
.card.wn11 .wn11-check-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin-top: 2px; }
.card.wn11 .wn11-passing-details { margin-top: 4px; cursor: pointer; }
.card.wn11 .wn11-passing-details summary { font-size: 12px; font-weight: 500; opacity: 0.8; cursor: pointer; user-select: none; padding: 6px 10px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; transition: all 0.2s ease; }
.card.wn11 .wn11-passing-details summary:hover { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.35); }
.card.wn11 .wn11-passing-details[open] summary { margin-bottom: 8px; }
.card.wn11 .wn11-recommendations { padding: 12px 14px; background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.25); border-radius: 8px; }
.card.wn11 .wn11-rec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #fbbf24; opacity: 0.9; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.card.wn11 .wn11-rec-title i { font-size: 14px; }
.card.wn11 .wn11-rec-list { margin: 0; padding-left: 20px; list-style: disc; }
.card.wn11 .wn11-rec-list li { margin: 6px 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); opacity: 0.9; }
.card.wn11 .wn11-rec-list li strong { color: var(--text-primary); font-weight: 600; }
`;
