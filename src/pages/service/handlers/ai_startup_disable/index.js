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
 * Check if OpenAI API key is configured in settings.
 * @returns {Promise<boolean>} True if API key is available
 */
async function hasApiKey() {
  try {
    const { invoke } = window.__TAURI__?.core || {};
    if (!invoke) return false;

    const settings = await invoke("load_app_settings");
    const apiKey = settings?.ai?.openai_api_key;
    return Boolean(apiKey && apiKey.trim().length > 0);
  } catch {
    return false;
  }
}

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
    model: "gpt-4o-mini",
    apply_changes: true, // Default: actually disable items (not preview mode)
  },
  toolKeys: [],
  async isAvailable() {
    // Check if API key is configured
    return await hasApiKey();
  },
  getUnavailableReason() {
    return "OpenAI API key not configured. Add it in Settings → AI / API.";
  },
  async build({ params }) {
    // Get API key from settings
    const { invoke } = window.__TAURI__?.core || {};
    let apiKey = "";

    if (invoke) {
      try {
        const settings = await invoke("load_app_settings");
        apiKey = settings?.ai?.openai_api_key || "";
      } catch (e) {
        console.error("Failed to load API key from settings:", e);
      }
    }

    return {
      type: "ai_startup_disable",
      api_key: apiKey || "env:AUTOSERVICE_OPENAI_KEY", // Fallback to env var
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
              <div class="section-title">
                ${results.applied ? "Items Disabled" : "Recommended to Disable"}
                (${toDisable.length})
              </div>
              <div class="startup-detection-grid">
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
            <div class="mt-4">
              <div class="section-title">
                Critical Items Kept Enabled (${keepEnabled.length})
              </div>
              <div class="startup-detection-grid">
                ${keepEnabled.map((item, idx) =>
                  renderKeepEnabledItem(item, idx)
                )}
              </div>
            </div>
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
    <div class="startup-detection" data-index=${index}>
      <div class="startup-detection-head">
        <span class="startup-name" title=${item.name}>
          <strong>${index + 1}.</strong> ${item.name}
        </span>
        <div class="item-badges">
          ${pill(item.category || "unknown", "info")}
          ${pill(`Risk: ${item.risk}`, riskColor)}
          ${pill(`Confidence: ${item.confidence}`, confidenceColor)}
        </div>
      </div>
      <div class="startup-detection-body">
        <div class="detail-row">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${item.reason}</span>
        </div>
        ${item.user_impact
          ? html`<div class="detail-row">
              <span class="detail-label">User Impact:</span>
              <span class="detail-value">${item.user_impact}</span>
            </div>`
          : ""}
        ${item.manual_launch
          ? html`<div class="detail-row">
              <span class="detail-label">Manual Launch:</span>
              <span class="detail-value">${item.manual_launch}</span>
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
    <div class="startup-detection keep-enabled" data-index=${index}>
      <div class="startup-detection-head">
        <span class="startup-name" title=${item.name}>
          <strong>${index + 1}.</strong> ${item.name}
        </span>
        ${pill(item.category || "critical", "success")}
      </div>
      <div class="startup-detection-body">
        <div class="detail-row">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${item.reason}</span>
        </div>
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
// PARAMETER CONTROLS (Builder UI)
// =============================================================================

/**
 * Render parameter controls for the builder UI.
 * @param {import('../types').ParamControlsContext} context - Parameter context
 * @returns {HTMLElement} Parameter controls element
 */
export function renderParamControls({ params, updateParam }) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.alignItems = "center";
  wrapper.style.columnGap = "12px";
  wrapper.style.rowGap = "6px";

  const applyChangesVal = params?.apply_changes !== false; // Default true
  const modelVal = params?.model || "gpt-4o-mini";

  wrapper.innerHTML = `
    <label class="tiny-lab" style="margin-right:12px;" title="Apply AI recommendations or show preview only">
      <input type="checkbox" data-param="apply_changes" ${
        applyChangesVal ? "checked" : ""
      } />
      <span class="lab">Apply changes</span>
    </label>
    <label class="tiny-lab" style="margin-right:12px;" title="Select AI model for analysis">
      <span class="lab">AI Model</span>
      <select data-param="model" aria-label="AI model selection">
        <option value="gpt-4o-mini" ${
          modelVal === "gpt-4o-mini" ? "selected" : ""
        }>GPT-4o Mini (Fast)</option>
        <option value="gpt-4o" ${
          modelVal === "gpt-4o" ? "selected" : ""
        }>GPT-4o (Balanced)</option>
        <option value="gpt-4-turbo" ${
          modelVal === "gpt-4-turbo" ? "selected" : ""
        }>GPT-4 Turbo</option>
        <option value="gpt-4" ${
          modelVal === "gpt-4" ? "selected" : ""
        }>GPT-4</option>
      </select>
    </label>
  `;

  // Stop event propagation to prevent drag-and-drop interference
  wrapper.querySelectorAll("input, select").forEach((el) => {
    ["mousedown", "pointerdown", "click"].forEach((evt) => {
      el.addEventListener(evt, (e) => e.stopPropagation());
    });
  });

  const cbApply = wrapper.querySelector('input[data-param="apply_changes"]');
  const selModel = wrapper.querySelector('select[data-param="model"]');

  cbApply?.addEventListener("change", () => {
    updateParam("apply_changes", cbApply.checked);
  });

  selModel?.addEventListener("change", () => {
    updateParam("model", selModel.value);
  });

  return wrapper;
}

// =============================================================================
// PRINT CSS
// =============================================================================

export const printCSS = `
/* AI Startup Optimizer - Detection Grid Layout (similar to KVRT) */
.ai-startup-optimizer .startup-detection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.ai-startup-optimizer .startup-detection {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 12px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  page-break-inside: avoid;
}

.ai-startup-optimizer .startup-detection.keep-enabled {
  border-color: #28a745;
  background: #f0fff4;
}

.ai-startup-optimizer .startup-detection-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e9ecef;
}

.ai-startup-optimizer .startup-name {
  font-size: 0.95em;
  font-weight: 600;
  color: #212529;
  word-break: break-word;
  flex: 1;
  line-height: 1.4;
}

.ai-startup-optimizer .startup-name strong {
  color: #6c757d;
  margin-right: 4px;
}

.ai-startup-optimizer .item-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.ai-startup-optimizer .startup-detection-body {
  font-size: 0.85em;
  color: #495057;
}

.ai-startup-optimizer .detail-row {
  margin-bottom: 8px;
  line-height: 1.5;
}

.ai-startup-optimizer .detail-row:last-child {
  margin-bottom: 0;
}

.ai-startup-optimizer .detail-label {
  font-weight: 600;
  color: #6c757d;
  margin-right: 4px;
}

.ai-startup-optimizer .detail-value {
  color: #212529;
}

/* Section Titles */
.ai-startup-optimizer .section-title {
  font-size: 1.1em;
  font-weight: 600;
  color: #212529;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 2px solid #dee2e6;
}

/* Summary Box */
.ai-startup-optimizer .summary-box {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}

.ai-startup-optimizer .summary-item {
  margin-bottom: 6px;
  font-size: 0.9em;
  line-height: 1.6;
}

.ai-startup-optimizer .summary-item:last-child {
  margin-bottom: 0;
}

/* Error List */
.ai-startup-optimizer .error-list {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}

.ai-startup-optimizer .error-item {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.ai-startup-optimizer .error-item:last-child {
  margin-bottom: 0;
}

/* All Items Table */
.ai-startup-optimizer .all-items-table {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-top: 12px;
}

.ai-startup-optimizer .all-items-table table {
  width: 100%;
  font-size: 0.85em;
}

/* Details/Summary Styling */
.ai-startup-optimizer details summary {
  cursor: pointer;
  user-select: none;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 8px;
  font-weight: 600;
}

.ai-startup-optimizer details summary:hover {
  background: #e9ecef;
}

/* Print-specific styles */
@media print {
  .ai-startup-optimizer .startup-detection-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .ai-startup-optimizer .startup-detection {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .ai-startup-optimizer details {
    page-break-inside: avoid;
  }
  
  .ai-startup-optimizer details summary {
    background: none;
    padding: 4px 0;
  }
}
`;
