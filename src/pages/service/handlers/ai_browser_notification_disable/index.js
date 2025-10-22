/**
 * AI Browser Notification Optimizer Handler
 * ---------------------------------------------------------------------------
 * Uses AI to analyze browser notification permissions and recommend safe optimizations.
 *
 * Features:
 * - Enumerates notifications from Chrome, Edge, Firefox, Brave, Opera
 * - AI-powered analysis via OpenAI-compatible models
 * - Conservative recommendations prioritizing essential notifications
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
  id: "ai_browser_notification_disable",
  label: "AI Browser Notification Optimizer",
  group: "System Optimization",
  category: "Performance",
  description:
    "Use AI to analyze and optimize browser notification permissions",
  defaultParams: {
    model: "gpt-4o-mini",
    apply_changes: true, // Default: apply changes
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
      type: "ai_browser_notification_disable",
      api_key: apiKey || "env:AUTOSERVICE_OPENAI_KEY", // Fallback to env var
      model: params?.model || "gpt-4o-mini",
      base_url: params?.base_url || undefined,
      apply_changes: Boolean(params?.apply_changes),
      ui_label: params?.apply_changes
        ? "AI Browser Notification Optimizer (Apply Changes)"
        : "AI Browser Notification Optimizer (Preview)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for AI browser notification optimizer results.
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const summary = result.summary || {};
  const hr = summary.human_readable || {};
  const results = summary.results || {};

  const mode = hr.mode || "Unknown";
  const totalNotifications = hr.total_notifications || 0;
  const recommendations = hr.recommendations || 0;
  const disabled = hr.notifications_disabled || 0;
  const errors = hr.errors || 0;
  const skipped = hr.notifications_skipped || 0;
  const keptEnabled = hr.notifications_kept_enabled || 0;
  const estimatedReduction = hr.estimated_reduction || "Unknown";
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
    kpiBox("Mode", mode),
    kpiBox("Duration", duration > 0 ? `${duration.toFixed(2)}s` : "-"),
    kpiBox("Total Notifications", totalNotifications),
    kpiBox("Recommendations", recommendations),
    kpiBox("Est. Reduction", estimatedReduction),
    kpiBox("Model", modelUsed),
  ];

  if (results.applied) {
    kpis.push(
      kpiBox("Disabled", disabled, "success"),
      kpiBox("Errors", errors, errors > 0 ? "error" : "muted")
    );
  }

  return html`
    <div class="card ai-browser-notification-optimizer">
      ${renderHeader("AI Browser Notification Optimizer", result.status)}

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
                ${results.applied
                  ? "Notifications Disabled"
                  : "Recommended to Disable"}
                (${toDisable.length})
              </div>
              <div class="notification-detection-grid">
                ${toDisable.map((item, idx) =>
                  renderNotificationItem(item, idx)
                )}
              </div>
            </div>
          `
        : html`
            <div class="mt-4">
              <div class="alert alert-success">
                <strong>✓ No notifications recommended for disabling.</strong
                ><br />
                Your browser notification settings look clean and optimized!
              </div>
            </div>
          `}

      <!-- Notifications Kept Enabled (collapsible, screen-only) -->
      ${keepEnabled.length > 0
        ? html`
            <details class="mt-4 screen-only">
              <summary>
                <h4 style="display: inline;">
                  Essential Notifications Kept Enabled (${keepEnabled.length})
                </h4>
              </summary>
              <div class="notification-detection-grid mt-2">
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
                      <strong>${err.origin}</strong>: ${err.error}
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : ""}

      <!-- All Enumerated Notifications (collapsed, screen-only) -->
      ${results.all_notifications && results.all_notifications.length > 0
        ? html`
            <details class="mt-4 screen-only">
              <summary>
                <h4 style="display: inline;">
                  All Browser Notifications
                  (${results.all_notifications.length})
                </h4>
              </summary>
              <div class="all-notifications-table mt-2">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Origin</th>
                      <th>Browser</th>
                      <th>Profile</th>
                      <th>Permission</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${results.all_notifications.map(
                      (item) => html`
                        <tr>
                          <td>
                            <code style="font-size: 0.85em;"
                              >${item.origin}</code
                            >
                          </td>
                          <td><small>${item.browser}</small></td>
                          <td>
                            <small class="text-muted">${item.profile}</small>
                          </td>
                          <td>
                            <small
                              >${pill(
                                item.permission || "allowed",
                                "success"
                              )}</small
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
 * Render a single browser notification recommended for disabling.
 */
function renderNotificationItem(item, index) {
  const categoryColor = getCategoryColor(item.category);
  const confidenceColor =
    item.confidence === "high"
      ? "success"
      : item.confidence === "medium"
      ? "info"
      : "muted";

  // Clean up origin URL for display
  const displayOrigin = cleanOrigin(item.origin);

  return html`
    <div class="notification-detection" data-index=${index}>
      <div class="notification-detection-head">
        <div class="notification-name-block">
          <span class="notification-origin" title=${item.origin}>
            <strong>${index + 1}.</strong> ${displayOrigin}
          </span>
          <div class="item-badges">
            ${pill(item.browser, "info")}
            ${pill(item.category || "other", categoryColor)}
            ${pill(`Confidence: ${item.confidence}`, confidenceColor)}
          </div>
        </div>
      </div>
      <div class="notification-detection-body">
        <div class="detail-row">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${item.reason}</span>
        </div>
        ${item.user_impact
          ? html`<div class="detail-row">
              <span class="detail-label">Impact:</span>
              <span class="detail-value">${item.user_impact}</span>
            </div>`
          : ""}
        ${item.alternative
          ? html`<div class="detail-row">
              <span class="detail-label">Alternative:</span>
              <span class="detail-value">${item.alternative}</span>
            </div>`
          : ""}
      </div>
    </div>
  `;
}

/**
 * Render a single notification that should be kept enabled.
 */
function renderKeepEnabledItem(item, index) {
  const displayOrigin = cleanOrigin(item.origin);

  return html`
    <div class="notification-detection keep-enabled" data-index=${index}>
      <div class="notification-detection-head">
        <div class="notification-name-block">
          <span class="notification-origin" title=${item.origin}>
            <strong>${index + 1}.</strong> ${displayOrigin}
          </span>
          ${pill("Essential", "success")}
        </div>
      </div>
      <div class="notification-detection-body">
        <div class="detail-row">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${item.reason}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get color variant for notification category.
 */
function getCategoryColor(category) {
  const colorMap = {
    social_media: "warning",
    shopping: "info",
    news: "info",
    entertainment: "warning",
    marketing: "danger",
    other: "muted",
  };
  return colorMap[category] || "muted";
}

/**
 * Clean up origin URL for display (remove port, trailing wildcards).
 */
function cleanOrigin(origin) {
  if (!origin) return "Unknown";

  // Remove trailing ,*
  let cleaned = origin.replace(/,\*$/, "");

  // Remove port numbers for cleaner display
  cleaned = cleaned.replace(/:(443|80|8080|8096)\b/, "");

  return cleaned;
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

// =============================================================================
// CUSTOMER METRICS EXTRACTION
// =============================================================================

/**
 * Extract customer-friendly metrics from AI browser notification optimizer results.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {Array<CustomerMetric>} Array of customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  if (status === "error") return [];

  const hr = summary?.human_readable || {};
  const results = summary?.results || {};

  const totalNotifications = hr.total_notifications || 0;
  const recommendations = hr.recommendations || 0;
  const disabled = hr.notifications_disabled || 0;
  const estimatedReduction = hr.estimated_reduction || "Unknown";

  // Always show a metric, even if nothing was enumerated
  if (totalNotifications === 0) {
    if (!results.applied) {
      return [
        buildMetric({
          icon: "🔔",
          label: "Browser Notifications",
          value: "0 things could be fixed",
          detail: "0 notifications analyzed",
          variant: "info",
        }),
      ];
    }
    // Applied mode but nothing enumerated
    return [
      buildMetric({
        icon: "🔔",
        label: "Browser Notifications",
        value: "All clean",
        detail: "0 notifications analyzed",
        variant: "success",
      }),
    ];
  }

  // If no recommendations, show clean result in applied mode
  if (recommendations === 0 && results.applied) {
    return [
      buildMetric({
        icon: "🔔",
        label: "Browser Notifications",
        value: "All clean",
        detail: `${totalNotifications} notification${
          totalNotifications !== 1 ? "s" : ""
        } checked - no changes needed`,
        variant: "success",
      }),
    ];
  }

  // Build detail items showing what was found
  const detailItems = [];
  const toDisable = results.to_disable || [];

  // Group by category
  const categoryGroups = {};
  toDisable.forEach((item) => {
    const cat = item.category || "other";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(item);
  });

  // Create items from categories
  Object.entries(categoryGroups).forEach(([category, categoryItems]) => {
    const catLabel = formatKey(category);
    categoryItems.forEach((item) => {
      const origin = cleanOrigin(item.origin);
      const browser = item.browser || "Unknown";
      detailItems.push(`${catLabel}: ${origin} (${browser})`);
    });
  });

  // In preview mode with no recommendations, show as diagnostic
  if (recommendations === 0 && !results.applied) {
    return [
      buildMetric({
        icon: "🔔",
        label: "Browser Notifications",
        value: "0 things could be fixed",
        detail: `${totalNotifications} notification${
          totalNotifications !== 1 ? "s" : ""
        } analyzed - all appear safe`,
        variant: "info",
      }),
    ];
  }

  const value = results.applied
    ? `${disabled} disabled`
    : `${recommendations} things could be fixed`;

  return [
    buildMetric({
      icon: "🔔",
      label: "Browser Notifications",
      value: value,
      detail: estimatedReduction,
      variant: results.applied ? "success" : "info",
      items: detailItems.length > 0 ? detailItems : undefined,
    }),
  ];
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

  const applyChangesVal = params?.apply_changes === true; // Default false for safety
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
/* AI Browser Notification Optimizer - Detection Grid Layout */
.ai-browser-notification-optimizer .notification-detection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.ai-browser-notification-optimizer .notification-detection {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 12px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  page-break-inside: avoid;
}

.ai-browser-notification-optimizer .notification-detection.keep-enabled {
  border-color: #28a745;
  background: #f0fff4;
}

.ai-browser-notification-optimizer .notification-detection-head {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e9ecef;
}

.ai-browser-notification-optimizer .notification-name-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ai-browser-notification-optimizer .notification-origin {
  font-size: 0.95em;
  font-weight: 600;
  color: #212529;
  word-break: break-all;
  line-height: 1.4;
}

.ai-browser-notification-optimizer .notification-origin strong {
  color: #6c757d;
  margin-right: 4px;
}

.ai-browser-notification-optimizer .item-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ai-browser-notification-optimizer .notification-detection-body {
  font-size: 0.85em;
  color: #495057;
}

.ai-browser-notification-optimizer .detail-row {
  margin-bottom: 8px;
  line-height: 1.5;
}

.ai-browser-notification-optimizer .detail-row:last-child {
  margin-bottom: 0;
}

.ai-browser-notification-optimizer .detail-label {
  font-weight: 600;
  color: #6c757d;
  margin-right: 4px;
}

.ai-browser-notification-optimizer .detail-value {
  color: #212529;
}

/* Section Titles */
.ai-browser-notification-optimizer .section-title {
  font-size: 1.1em;
  font-weight: 600;
  color: #212529;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 2px solid #dee2e6;
}

/* Summary Box */
.ai-browser-notification-optimizer .summary-box {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}

.ai-browser-notification-optimizer .summary-item {
  margin-bottom: 6px;
  font-size: 0.9em;
  line-height: 1.6;
}

.ai-browser-notification-optimizer .summary-item:last-child {
  margin-bottom: 0;
}

/* Error List */
.ai-browser-notification-optimizer .error-list {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}

.ai-browser-notification-optimizer .error-item {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.ai-browser-notification-optimizer .error-item:last-child {
  margin-bottom: 0;
}

/* All Notifications Table */
.ai-browser-notification-optimizer .all-notifications-table {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-top: 12px;
}

.ai-browser-notification-optimizer .all-notifications-table table {
  width: 100%;
  font-size: 0.85em;
}

/* Details/Summary Styling */
.ai-browser-notification-optimizer details summary {
  cursor: pointer;
  user-select: none;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 8px;
  font-weight: 600;
}

.ai-browser-notification-optimizer details summary:hover {
  background: #e9ecef;
}

/* Print-specific styles */
@media print {
  /* Hide screen-only sections in print */
  .ai-browser-notification-optimizer .screen-only {
    display: none !important;
  }

  .ai-browser-notification-optimizer .notification-detection-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .ai-browser-notification-optimizer .notification-detection {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .ai-browser-notification-optimizer details {
    page-break-inside: avoid;
  }
  
  .ai-browser-notification-optimizer details summary {
    background: none;
    padding: 4px 0;
  }
}
`;

// =============================================================================
// VIEW CSS (Technician web view)
// =============================================================================

export const viewCSS = `
/* AI Browser Notification Optimizer (technician screen styles) */
.card.ai-browser-notification-optimizer { display: flex; flex-direction: column; gap: 16px; }
.card.ai-browser-notification-optimizer .section-title { font-size: 16px; font-weight: 600; color: #e3e9f8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid var(--border); }
.card.ai-browser-notification-optimizer .mb-3 { margin-bottom: 12px !important; }
.card.ai-browser-notification-optimizer .kpi-row { margin-bottom: 0; }
.card.ai-browser-notification-optimizer .mt-4 { margin-top: 0; }
.card.ai-browser-notification-optimizer h4 { font-size: 14px; font-weight: 600; color: #a3adbf; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.03em; }
.card.ai-browser-notification-optimizer .summary-box { background: rgba(36, 48, 68, 0.45); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.card.ai-browser-notification-optimizer .summary-item { margin-bottom: 6px; font-size: 13px; line-height: 1.5; color: #cbd5e1; }
.card.ai-browser-notification-optimizer .summary-item strong { color: #e3e9f8; font-weight: 600; margin-right: 6px; }
.card.ai-browser-notification-optimizer .notification-detection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-top: 14px; }
.card.ai-browser-notification-optimizer .notification-detection { background: rgba(36, 48, 68, 0.5); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s ease; }
.card.ai-browser-notification-optimizer .notification-detection:hover { border-color: #4f8cff; background: rgba(36, 48, 68, 0.7); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); }
.card.ai-browser-notification-optimizer .notification-detection.keep-enabled { border-color: #10b981; background: rgba(16, 185, 129, 0.12); }
.card.ai-browser-notification-optimizer .notification-detection.keep-enabled:hover { border-color: #34d399; background: rgba(16, 185, 129, 0.18); }
.card.ai-browser-notification-optimizer .notification-detection-head { padding-bottom: 8px; border-bottom: 1px solid rgba(203, 213, 225, 0.15); }
.card.ai-browser-notification-optimizer .notification-name-block { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.card.ai-browser-notification-optimizer .notification-origin { font-weight: 600; color: #f6d8a5; word-break: break-all; line-height: 1.5; font-size: 14px; }
.card.ai-browser-notification-optimizer .notification-origin strong { color: #a3adbf; margin-right: 8px; font-weight: 700; }
.card.ai-browser-notification-optimizer .item-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.card.ai-browser-notification-optimizer .notification-detection-body { display: flex; flex-direction: column; gap: 8px; }
.card.ai-browser-notification-optimizer .detail-row { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
.card.ai-browser-notification-optimizer .detail-label { font-weight: 600; color: #94a3b8; margin-right: 8px; }
.card.ai-browser-notification-optimizer .detail-value { color: #e3e9f8; }
.card.ai-browser-notification-optimizer .alert.alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 14px; color: #e3e9f8; line-height: 1.6; }
.card.ai-browser-notification-optimizer .alert.alert-success strong { color: #34d399; }
.card.ai-browser-notification-optimizer .error-list { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 14px; margin-top: 14px; }
.card.ai-browser-notification-optimizer .error-item { margin-bottom: 10px; padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; font-size: 13px; line-height: 1.6; color: #fecaca; }
.card.ai-browser-notification-optimizer .error-item strong { color: #fef2f2; font-weight: 600; }
.card.ai-browser-notification-optimizer .all-notifications-table { max-height: 480px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-top: 12px; background: rgba(36, 48, 68, 0.3); }
.card.ai-browser-notification-optimizer .all-notifications-table table { width: 100%; border-collapse: collapse; }
.card.ai-browser-notification-optimizer .all-notifications-table th, .card.ai-browser-notification-optimizer .all-notifications-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(203, 213, 225, 0.1); }
.card.ai-browser-notification-optimizer .all-notifications-table th { background: rgba(36, 48, 68, 0.5); font-weight: 600; color: #e3e9f8; position: sticky; top: 0; z-index: 1; }
.card.ai-browser-notification-optimizer .all-notifications-table tr:last-child td { border-bottom: none; }
.card.ai-browser-notification-optimizer details { margin-top: 16px; }
.card.ai-browser-notification-optimizer details summary { cursor: pointer; user-select: none; padding: 10px 14px; background: rgba(36, 48, 68, 0.4); border: 1px solid var(--border); border-radius: 6px; font-weight: 600; font-size: 15px; color: #e3e9f8; transition: all 0.2s ease; }
.card.ai-browser-notification-optimizer details summary:hover { background: rgba(36, 48, 68, 0.6); border-color: #4a5568; }
.card.ai-browser-notification-optimizer details[open] summary { margin-bottom: 12px; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: none; }
.card.ai-browser-notification-optimizer details summary h4 { display: inline; font-size: inherit; font-weight: inherit; margin: 0; }
`;
