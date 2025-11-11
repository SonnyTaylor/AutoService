/**
 * System Restore Handler
 * ---------------------------------------------------------------------------
 * Creates a Windows System Restore point before running other tasks.
 * This is a built-in task injected by the builder toggle and always runs first.
 */

import { html } from "lit-html";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

/**
 * @typedef {import('../types').ServiceDefinition} ServiceDefinition
 * @typedef {import('../types').ServiceTaskResult} ServiceTaskResult
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
  id: "system_restore",
  label: "System Restore",
  group: "System Integrity",
  category: "System Integrity",
  defaultParams: {},
  toolKeys: [], // built-in
  isDiagnostic: false,
  async build({ params }) {
    return {
      type: "system_restore",
      ui_label: "Create System Restore point",
      // No params needed; backend handles enabling protection if needed
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for System Restore.
 * Shows outcome, message, and remediation details if any.
 *
 * @param {TechRendererContext} context
 */
export function renderTech({ result }) {
  const s = result?.summary || {};
  const hr = s.human_readable || {};
  const res = s.results || {};
  const dur = typeof s.duration_seconds === "number" ? s.duration_seconds : result.duration_seconds;

  const message = hr.message || "System Restore result";
  const description = res.description || "AutoService pre-run restore point";
  const remediation = res.remediation || res.remediation_attempt || null;
  const returnCode =
    typeof res.return_code === "number" ? res.return_code : undefined;
  const created = res.restore_point_created === true;
  const output = res.output || "";

  return html`
    <div class="card system-restore">
      ${renderHeader("System Restore", result.status)}
      <div class="kpi-row">
        ${kpiBox("Created", created ? "Yes" : "No", created ? "success" : "warning")}
        ${kpiBox("Return Code", returnCode != null ? String(returnCode) : "-")}
        ${kpiBox("Duration", dur != null ? `${dur}s` : "-")}
      </div>
      <div class="sr-content">
        <div class="sr-row">
          <div class="sr-label">Message</div>
          <div class="sr-value">${message}</div>
        </div>
        <div class="sr-row">
          <div class="sr-label">Description</div>
          <div class="sr-value">${description}</div>
        </div>
        <div class="sr-row">
          <div class="sr-label">Created</div>
          <div class="sr-value">${created ? "Yes" : "No"}</div>
        </div>
        ${returnCode !== undefined
          ? html`<div class="sr-row">
              <div class="sr-label">Return code</div>
              <div class="sr-value">${returnCode}</div>
            </div>`
          : ""}
        ${remediation
          ? html`<div class="sr-row">
              <div class="sr-label">Remediation</div>
              <div class="sr-value">${remediation}</div>
            </div>`
          : ""}
        ${output && result.status !== "success"
          ? html`<details class="sr-output">
              <summary>View command output</summary>
              <pre>${output}</pre>
            </details>`
          : ""}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS
// =============================================================================

/**
 * Extract customer-friendly summary.
 * For success: reports that a restore point was created.
 */
export function extractCustomerMetrics({ result }) {
  // Do not show System Restore on customer print
  return null;
}

// =============================================================================
// PRINT CSS
// =============================================================================

export const printCSS = `
  .card.system-restore .sr-content {
    display: grid;
    grid-template-columns: 160px 1fr;
    row-gap: 8px;
    column-gap: 12px;
  }
  .card.system-restore .sr-row {
    display: contents;
  }
  .card.system-restore .sr-label {
    color: var(--text-secondary);
    font-size: 12px;
  }
  .card.system-restore .sr-value {
    font-size: 13px;
  }
`;

// Ensure card is hidden on customer print (defense-in-depth)
export const customerPrintCSS = `
  .card.system-restore { display: none !important; }
`;

// =============================================================================
// VIEW CSS (screen styles)
// =============================================================================
export const viewCSS = `
  .card.system-restore { display: flex; flex-direction: column; gap: 12px; }
  .card.system-restore .kpi-row { display: flex; flex-wrap: wrap; gap: 12px; }
  .card.system-restore .sr-content {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 8px 12px;
    background: var(--panel-accent);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
  }
  .card.system-restore .sr-label {
    color: var(--muted);
    font-size: 12px;
  }
  .card.system-restore .sr-value {
    font-size: 13px;
    color: var(--text);
    word-break: break-word;
  }
  .card.system-restore details.sr-output {
    grid-column: 1 / -1;
    margin-top: 6px;
    background: rgba(36, 48, 68, 0.5);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .card.system-restore details.sr-output pre {
    margin: 8px 0 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
    font-size: 12px;
    color: #e3e9f8;
  }
`;


