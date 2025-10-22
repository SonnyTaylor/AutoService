/**
 * Disk Space Report Handler
 * ---------------------------------------------------------------------------
 * Reports storage usage across all system drives, identifying drives with
 * low or critical space remaining.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with visual drive usage bars
 * - Customer metrics extractor showing storage utilization
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
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
  id: "disk_space_report",
  label: "Disk Space Report",
  group: "Diagnostics",
  category: "Diagnostics",
  defaultParams: {},
  toolKeys: [],
  isDiagnostic: true,
  async build({ params }) {
    return {
      type: "disk_space_report",
      ui_label: "Disk Space Report",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for disk space report.
 * Displays drive usage bars with color-coded warnings.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const drives = s.drives || [];
  const hr = s.human_readable || {};
  const warnings = hr.warnings || [];

  return html`
    <div class="card disk-space">
      ${renderHeader("Disk Space Report", result.status)}
      <div class="disk-space-content">
        ${drives.length > 0
          ? html`
              <div class="disk-drives">
                ${map(drives, (drive) => {
                  const percent = drive.usage_percent || 0;
                  const variant =
                    percent > 90 ? "fail" : percent > 80 ? "warn" : "ok";
                  return html`
                    <div class="drive-item">
                      <div class="drive-label">${drive.drive}</div>
                      <div class="drive-bar">
                        <div
                          class="drive-bar-fill ${variant}"
                          style="width: ${Math.min(percent, 100)}%"
                        ></div>
                      </div>
                      <div class="drive-stats">
                        ${drive.used_gb?.toFixed(1) || 0}GB used of
                        ${drive.total_gb?.toFixed(1) || 0}GB
                        (${percent?.toFixed(1) || 0}%)
                      </div>
                    </div>
                  `;
                })}
              </div>
            `
          : html`<div class="no-data">No drive information available</div>`}
        ${warnings.length > 0
          ? html`
              <div class="warnings">
                <h4><i class="ph ph-warning"></i> Warnings</h4>
                <ul>
                  ${map(warnings, (warning) => html`<li>${warning}</li>`)}
                </ul>
              </div>
            `
          : ""}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly storage metrics from disk space report.
 * Shows total storage usage and highlights drives with low/critical space.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ result }) {
  if (result.status !== "success") return null;

  const summary = result.summary || {};
  const drives = Array.isArray(summary.drives) ? summary.drives : [];
  if (drives.length === 0) return null;

  let totalGb = 0;
  let totalUsedGb = 0;
  const critical = [];
  const low = [];
  const items = [];

  drives.forEach((d) => {
    const total = d.total_gb || 0;
    const used = d.used_gb || 0;
    const percent = d.usage_percent || 0;

    totalGb += total;
    totalUsedGb += used;

    items.push(
      `${d.drive}: ${used.toFixed(1)}GB / ${total.toFixed(
        1
      )}GB (${percent.toFixed(1)}%)`
    );

    if (percent > 90) {
      critical.push(d.drive);
    } else if (percent > 80) {
      low.push(d.drive);
    }
  });

  const avgUsage = totalGb > 0 ? (totalUsedGb / totalGb) * 100 : 0;

  const metricItems = [];
  if (items.length > 0) {
    metricItems.push(...items);
  }
  if (critical.length > 0) {
    metricItems.push(`⚠️ Critical space: ${critical.join(", ")}`);
  }
  if (low.length > 0) {
    metricItems.push(`⚠️ Low space: ${low.join(", ")}`);
  }

  return buildMetric({
    icon: "🗄️",
    label: "Storage Usage",
    value: `${totalUsedGb.toFixed(1)} / ${totalGb.toFixed(1)} GB`,
    detail: `Average utilization ${avgUsage.toFixed(1)}%`,
    variant: critical.length > 0 ? "warning" : "info",
    items: metricItems.length > 0 ? metricItems : undefined,
  });
}

// =============================================================================
// VIEW CSS (screen styles migrated from service.css)
// =============================================================================

export const viewCSS = `
  /* Disk Space Report */
  .card.disk-space .disk-space-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card.disk-space .disk-drives {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card.disk-space .drive-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba(36, 48, 68, 0.35);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .card.disk-space .drive-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .card.disk-space .drive-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }
  .card.disk-space .drive-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .card.disk-space .drive-bar-fill.ok { background: #4ade80; }
  .card.disk-space .drive-bar-fill.warn { background: #fbbf24; }
  .card.disk-space .drive-bar-fill.fail { background: #f87171; }
  .card.disk-space .drive-stats {
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.8;
  }
  .card.disk-space .warnings {
    padding: 12px;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 8px;
  }
  .card.disk-space .warnings h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: #fbbf24;
  }
  .card.disk-space .warnings ul { margin: 0; padding-left: 20px; list-style: disc; }
  .card.disk-space .warnings li {
    margin: 4px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .card.disk-space .no-data {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
    opacity: 0.7;
    font-style: italic;
  }
`;
