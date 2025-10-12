/**
 * AI Startup Optimizer Handler
 * ---------------------------------------------------------------------------
 * Uses AI to analyze Windows startup programs and recommend safe optimizations.
 *
 * Features:
 * - Enumerates all startup items (registry, folders)
 * - AI-powered analysis via OpenAI-compatible models
 * - Conservative recommendations prioritizing system safety
 * - Preview mode (dry run) or actual changes
 * - Detailed impact assessment for each recommendation
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
  id: "ai_startup_disable",
  label: "AI Startup Optimizer",
  group: "System Optimization",
  category: "Performance",
  description: "Use AI to analyze and optimize Windows startup programs",
  defaultParams: {
    api_key: "env:AUTOSERVICE_OPENAI_KEY",
    model: "gpt-4o-mini",
    apply_changes: false,
  },
  toolKeys: [],
  async build({ params }) {
    return {
      type: "ai_startup_disable",
      api_key: params?.api_key || "env:AUTOSERVICE_OPENAI_KEY",
      model: params?.model || "gpt-4o-mini",
      base_url: params?.base_url || undefined,
      apply_changes: Boolean(params?.apply_changes),
      ui_label: params?.apply_changes
        ? "AI Startup Optimizer (Apply Changes)"
        : "AI Startup Optimizer (Preview)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for AI startup optimizer results.
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const summary = result.summary || {};
  const hr = summary.human_readable || {};
  const results = summary.results || {};

  const mode = hr.mode || "Unknown";
  const totalItems = hr.total_items || 0;
  const recommendations = hr.recommendations || 0;
  const disabled = hr.items_disabled || 0;
  const errors = hr.errors || 0;
  const skipped = hr.items_skipped || 0;
  const keptEnabled = hr.items_kept_enabled || 0;
  const bootTimeSaving = hr.estimated_boot_time_saving || "Unknown";
  const modelUsed = hr.model_used || "N/A";
  const duration = hr.duration_seconds || 0;

  const toDisable = results.to_disable || [];
  const keepEnabled = results.keep_enabled || [];
  const disabledItems = results.disabled || [];
  const errorItems = results.errors || [];
  const analysisSummary = results.analysis_summary || {};

  // Determine status variant for header
  const statusVariant = getStatusVariant(result.status);

  // Build KPI boxes
  const kpis = [
    kpiBox("Total Items", totalItems),
    kpiBox("Recommendations", recommendations),
    kpiBox("Boot Time Saving", bootTimeSaving),
    kpiBox("Model", modelUsed),
  ];

  if (results.applied) {
    kpis.push(
      kpiBox("Disabled", disabled, "success"),
      kpiBox("Errors", errors, errors > 0 ? "error" : "muted")
    );
  }

  return html`
    <div class="card ai-startup-optimizer">
      ${renderHeader("AI Startup Optimizer", result.status)}

      <!-- Mode Badge -->
      <div class="mb-3">
        ${pill(mode, results.applied ? "info" : "warning")}
        ${duration
          ? html`<span class="text-muted ms-2"
              >(completed in ${duration}s)</span
            >`
          : ""}
      </div>

      <!-- KPI Overview -->
      <div class="kpi-row">${kpis}</div>

      <!-- Analysis Summary -->
      ${analysisSummary && Object.keys(analysisSummary).length > 0
        ? html`
            <div class="mt-4">
              <h4>AI Analysis Summary</h4>
              <div class="summary-box">
                ${Object.entries(analysisSummary).map(
                  ([key, value]) => html`
                    <div class="summary-item">
                      <strong>${formatKey(key)}:</strong> ${value}
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : ""}

      <!-- Recommendations to Disable -->
      ${toDisable.length > 0
        ? html`
            <div class="mt-4">
              <h4>
                ${results.applied ? "Items Disabled" : "Recommended to Disable"}
                (${toDisable.length})
              </h4>
              <div class="startup-items-list">
                ${toDisable.map((item, idx) => renderStartupItem(item, idx))}
              </div>
            </div>
          `
        : html`
            <div class="mt-4">
              <div class="alert alert-success">
                <strong>✓ No items recommended for disabling.</strong><br />
                Your startup configuration looks clean and optimized!
              </div>
            </div>
          `}

      <!-- Items Kept Enabled -->
      ${keepEnabled.length > 0
        ? html`
            <details class="mt-4">
              <summary>
                <h4 style="display: inline;">
                  Critical Items Kept Enabled (${keepEnabled.length})
                </h4>
              </summary>
              <div class="startup-items-list mt-2">
                ${keepEnabled.map((item, idx) =>
                  renderKeepEnabledItem(item, idx)
                )}
              </div>
            </details>
          `
        : ""}

      <!-- Errors (if any) -->
      ${errorItems.length > 0
        ? html`
            <div class="mt-4">
              <h4 class="text-danger">Errors (${errorItems.length})</h4>
              <div class="error-list">
                ${errorItems.map(
                  (err) => html`
                    <div class="error-item">
                      <strong>${err.name}</strong>: ${err.error}
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : ""}

      <!-- All Enumerated Items (collapsed) -->
      ${results.all_items && results.all_items.length > 0
        ? html`
            <details class="mt-4">
              <summary>
                <h4 style="display: inline;">
                  All Startup Items (${results.all_items.length})
                </h4>
              </summary>
              <div class="all-items-table mt-2">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Command</th>
                      <th>Publisher</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${results.all_items.map(
                      (item) => html`
                        <tr>
                          <td><code>${item.name}</code></td>
                          <td>
                            <small
                              >${item.location_display || item.location}</small
                            >
                          </td>
                          <td>
                            <small
                              class="text-muted"
                              style="word-break: break-all;"
                              >${truncate(item.command, 60)}</small
                            >
                          </td>
                          <td>
                            <small
                              >${item.publisher ||
                              (item.is_microsoft_signed
                                ? "Microsoft"
                                : "—")}</small
                            >
                          </td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          `
        : ""}
    </div>
  `;
}

/**
 * Render a single startup item recommended for disabling.
 */
function renderStartupItem(item, index) {
  const riskColor =
    item.risk === "low"
      ? "success"
      : item.risk === "medium"
      ? "warning"
      : "danger";
  const confidenceColor =
    item.confidence === "high"
      ? "success"
      : item.confidence === "medium"
      ? "info"
      : "muted";

  return html`
    <div class="startup-item">
      <div class="item-header">
        <strong>${index + 1}. ${item.name}</strong>
        <div class="item-badges">
          ${pill(item.category || "unknown", "info")}
          ${pill(`Risk: ${item.risk}`, riskColor)}
          ${pill(`Confidence: ${item.confidence}`, confidenceColor)}
        </div>
      </div>
      <div class="item-details">
        <div><strong>Reason:</strong> ${item.reason}</div>
        ${item.user_impact
          ? html`<div><strong>User Impact:</strong> ${item.user_impact}</div>`
          : ""}
        ${item.manual_launch
          ? html`<div>
              <strong>Manual Launch:</strong> ${item.manual_launch}
            </div>`
          : ""}
      </div>
    </div>
  `;
}

/**
 * Render a single item that should be kept enabled.
 */
function renderKeepEnabledItem(item, index) {
  return html`
    <div class="startup-item keep-enabled">
      <div class="item-header">
        <strong>${index + 1}. ${item.name}</strong>
        ${pill(item.category || "critical", "success")}
      </div>
      <div class="item-details">
        <div><strong>Reason:</strong> ${item.reason}</div>
      </div>
    </div>
  `;
}

/**
 * Format object keys for display (convert snake_case to Title Case).
 */
function formatKey(key) {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Truncate long strings for display.
 */
function truncate(str, maxLen) {
  if (!str) return "—";
  return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION
// =============================================================================

/**
 * Extract customer-friendly metrics from AI startup optimizer results.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric | null} Customer metric or null
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  if (status === "error") return null;

  const hr = summary?.human_readable || {};
  const results = summary?.results || {};

  const recommendations = hr.recommendations || 0;
  const disabled = hr.items_disabled || 0;
  const bootTimeSaving = hr.estimated_boot_time_saving || "Unknown";

  // Only show metric if there were recommendations
  if (recommendations === 0) return null;

  const value = results.applied
    ? `${disabled} apps disabled`
    : `${recommendations} apps can be optimized`;

  const detail = `Estimated boot time improvement: ${bootTimeSaving}`;

  return buildMetric({
    icon: "⚡",
    label: "Startup Optimization",
    value: value,
    detail: detail,
    variant: results.applied ? "success" : "info",
  });
}

// =============================================================================
// PRINT CSS
// =============================================================================

export const printCSS = `
.ai-startup-optimizer .startup-items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-startup-optimizer .startup-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  background: #f9f9f9;
}

.ai-startup-optimizer .startup-item.keep-enabled {
  border-color: #28a745;
  background: #f0fff4;
}

.ai-startup-optimizer .item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.ai-startup-optimizer .item-badges {
  display: flex;
  gap: 6px;
}

.ai-startup-optimizer .item-details {
  font-size: 0.9em;
  line-height: 1.6;
}

.ai-startup-optimizer .item-details > div {
  margin-bottom: 4px;
}

.ai-startup-optimizer .summary-box {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 12px;
}

.ai-startup-optimizer .summary-item {
  margin-bottom: 6px;
}

.ai-startup-optimizer .error-list {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 12px;
}

.ai-startup-optimizer .error-item {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.ai-startup-optimizer .all-items-table {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

.ai-startup-optimizer details summary {
  cursor: pointer;
  user-select: none;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 8px;
}

.ai-startup-optimizer details summary:hover {
  background: #e9ecef;
}

@media print {
  .ai-startup-optimizer details {
    page-break-inside: avoid;
  }
  
  .ai-startup-optimizer .startup-item {
    page-break-inside: avoid;
  }
}
`;
