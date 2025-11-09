/**
 * Windows Update Logs Analysis Handler
 * ---------------------------------------------------------------------------
 * Retrieves and analyzes Windows Update errors from event logs with optional
 * AI-powered root cause analysis and remediation suggestions.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with error grouping and frequency analysis
 * - Customer metrics extractor for summary reports
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
 * Check if OpenAI API key is configured in settings (only needed if AI analysis is enabled).
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
 * Service catalog definition for Windows Update logs analysis.
 * @type {ServiceDefinition}
 */
export const definition = {
  id: "windows_update_logs_analysis",
  label: "Windows Update Error Analysis",
  group: "Diagnostics",
  category: "System Integrity",
  defaultParams: {
    time_frame: "week",
    include_ai_analysis: false,
  },
  toolKeys: ["err"], // Add Err.exe as a tool dependency
  async build({ params, resolveToolPath, getDataDirs }) {
    // Resolve Err.exe path (optional - service will work without it)
    const errPath = await resolveToolPath("err");

    // Get AI settings from centralized config if AI analysis is enabled
    const { invoke } = window.__TAURI__?.core || {};
    let apiKey = "";
    let provider = "openai";
    let model = "gpt-4o-mini";
    let baseUrl = "";

    if (params?.include_ai_analysis && invoke) {
      try {
        const settings = await invoke("load_app_settings");
        const ai = settings?.ai || {};

        // Get provider and model from settings
        provider = ai.provider || "openai";
        model = ai.model || "gpt-4o-mini";

        // Get API key - check provider-specific keys first, then fallback
        const providerKeys = ai.provider_keys || {};
        apiKey =
          providerKeys[provider] || ai.api_key || ai.openai_api_key || "";

        // Get base URL - check provider-specific URLs first, then fallback
        const providerBaseUrls = ai.provider_base_urls || {};
        baseUrl = providerBaseUrls[provider] || ai.base_url || "";
      } catch (e) {
        console.error("Failed to load AI settings:", e);
      }
    }

    // Build model name with provider prefix for LiteLLM
    const litellmModel = model.includes("/") ? model : `${provider}/${model}`;

    return {
      type: "windows_update_logs_analysis",
      time_frame: params?.time_frame || "week",
      include_ai_analysis: params?.include_ai_analysis === true,
      err_exe_path: errPath, // Pass Err.exe path to Python service
      api_key: apiKey || undefined, // Pass API key if AI analysis is enabled
      model: litellmModel,
      base_url: baseUrl || undefined,
      max_errors: 50,
      ui_label: "Windows Update Error Analysis",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for Windows Update logs analysis.
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const summary = result.summary || {};
  const hr = summary.human_readable || {};
  const errorGroups = summary.error_groups || [];

  const totalErrors = summary.total_errors_found || 0;
  const uniqueCodes = summary.unique_error_codes || 0;
  const timeFrame = summary.time_frame || "unknown";
  const exitCode = summary.exit_code || 0;

  // Format time frame for display
  const timeFrameLabel =
    {
      today: "Past 24 Hours",
      week: "Past Week",
      month: "Past Month",
      all: "All Time",
    }[timeFrame] || timeFrame;

  // Build KPI boxes
  const kpis = [
    kpiBox("Time Frame", timeFrameLabel),
    kpiBox("Total Events", totalErrors),
    kpiBox("Unique Errors", uniqueCodes),
    kpiBox(
      "Severity",
      uniqueCodes === 0 ? "None" : uniqueCodes < 3 ? "Low" : "Moderate",
      uniqueCodes === 0 ? "success" : uniqueCodes < 3 ? "info" : "warning"
    ),
  ];

  return html`
    <div class="card windows-update-logs">
      ${renderHeader("Windows Update Error Analysis", result.status)}

      <!-- KPI Overview -->
      <div class="kpi-row">${kpis}</div>

      <!-- Summary Notes -->
      ${hr.notes && hr.notes.length > 0
        ? html`
            <div class="summary-notes">
              ${hr.notes.map(
                (note) => html`<div class="note-item">• ${note}</div>`
              )}
            </div>
          `
        : ""}

      <!-- No Errors State -->
      ${errorGroups.length === 0
        ? html`
            <div class="no-errors">
              <strong>✅ No Windows Update errors detected</strong><br />
              All Windows Update operations completed successfully during the
              analyzed period.
            </div>
          `
        : ""}

      <!-- Error Groups -->
      ${errorGroups.length > 0
        ? html`
            <div class="error-groups">
              <h3>
                Error Details (${errorGroups.length} unique
                error${errorGroups.length !== 1 ? "s" : ""})
              </h3>
              ${errorGroups.map((group, idx) => renderErrorGroup(group, idx))}
            </div>
          `
        : ""}
    </div>
  `;
}

/**
 * Render a single error group with AI analysis if available.
 */
function renderErrorGroup(group, index) {
  const errorCode = group.error_code || "Unknown";
  const errorName = group.error_name || "Unknown Error";
  const errorDesc = group.error_description || "";
  const count = group.count || 0;
  const latestOccurrence = group.latest_occurrence || "";
  const affectedPackages = group.affected_packages || [];
  const aiAnalysis = group.ai_analysis || null;

  // Severity indicator based on count
  const severityPill =
    count >= 10
      ? pill(`${count} occurrences`, "danger")
      : count >= 5
      ? pill(`${count} occurrences`, "warning")
      : pill(`${count} occurrences`, "info");

  return html`
    <div class="error-group-card">
      <div class="error-group-header">
        <div class="error-title-row">
          <span class="error-code-badge">${errorCode}</span>
          <span class="error-name">${errorName}</span>
          ${severityPill}
        </div>
        <div class="error-description">${errorDesc}</div>
        ${latestOccurrence
          ? html`<div class="error-meta">
              Latest occurrence: ${formatTimestamp(latestOccurrence)}
            </div>`
          : ""}
      </div>

      <!-- Affected Packages -->
      ${affectedPackages.length > 0
        ? html`
            <div class="error-packages">
              <strong>Affected Packages:</strong>
              <div class="package-list">
                ${affectedPackages
                  .slice(0, 5)
                  .map(
                    (pkg) => html`<span class="package-badge">${pkg}</span>`
                  )}
                ${affectedPackages.length > 5
                  ? html`<span class="package-more"
                      >+${affectedPackages.length - 5} more</span
                    >`
                  : ""}
              </div>
            </div>
          `
        : ""}

      <!-- AI Analysis Section -->
      ${aiAnalysis ? renderAIAnalysis(aiAnalysis, errorCode) : ""}
    </div>
  `;
}

/**
 * Render AI analysis section for an error.
 */
function renderAIAnalysis(analysis, errorCode) {
  const priority = analysis.priority || "low";
  const issueSummary = analysis.issue_summary || "";
  const rootCauses = analysis.root_causes || [];
  const remediationSteps = analysis.remediation_steps || [];

  // Priority badge color mapping
  const priorityVariant =
    {
      critical: "danger",
      high: "warning",
      medium: "info",
      low: "success",
    }[priority] || "info";

  return html`
    <div class="ai-analysis-section">
      <div class="ai-header">
        <span style="font-weight: 600;">🤖 AI Analysis</span>
        ${pill(`Priority: ${priority.toUpperCase()}`, priorityVariant)}
      </div>

      ${issueSummary
        ? html`
            <div class="ai-issue-summary">
              <strong>Issue:</strong>
              <p>${issueSummary}</p>
            </div>
          `
        : ""}
      ${rootCauses.length > 0
        ? html`
            <div class="ai-causes">
              <strong>Likely Root Causes:</strong>
              <ul>
                ${rootCauses.map((cause) => html`<li>${cause}</li>`)}
              </ul>
            </div>
          `
        : ""}
      ${remediationSteps.length > 0
        ? html`
            <div class="ai-remediation">
              <strong>Remediation Steps:</strong>
              <ol>
                ${remediationSteps.map((step) => html`<li>${step}</li>`)}
              </ol>
            </div>
          `
        : ""}
    </div>
  `;
}

/**
 * Format ISO timestamp to readable format.
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "N/A";
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly metrics from Windows Update logs analysis.
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  const totalErrors = summary?.total_errors_found || 0;

  // Only show metric if there are errors
  if (totalErrors === 0) {
    return buildMetric({
      icon: "✓",
      label: "Windows Updates",
      value: "No Errors",
      detail: "System is not experiencing update failures",
      variant: "success",
    });
  }

  // If there are errors, provide actionable summary
  const errorGroups = summary?.error_groups || [];
  const topError = errorGroups[0];

  return buildMetric({
    icon: "⚠",
    label: "Update Issues Detected",
    value: `${totalErrors} Error(s)`,
    detail: topError
      ? `Most common: ${topError.error_name}`
      : "Updates failed to install",
    variant: "warning",
    items: [
      `${errorGroups.length} unique error code(s)`,
      totalErrors > 10
        ? "Multiple update failures detected"
        : "Isolated update issues",
    ],
  });
}

// =============================================================================
// PARAMETER CONTROLS
// =============================================================================

/**
 * Render parameter controls for Windows Update logs analysis in builder.
 * Allows selection of time frame and AI analysis options.
 * @param {import('../types').ParamControlsContext} context - Control context
 * @returns {HTMLElement} Control wrapper element
 */
export function renderParamControls({ params, updateParam }) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.alignItems = "center";
  wrapper.style.columnGap = "12px";
  wrapper.style.rowGap = "6px";

  const timeFrameVal = params?.time_frame || "week";
  const aiAnalysisVal = !!params?.include_ai_analysis;

  wrapper.innerHTML = `
    <label class="tiny-lab" style="margin-right:12px;" title="Select time period for error log analysis">
      <span class="lab">Time Frame</span>
      <select data-param="time_frame" aria-label="Windows Update error log time frame">
        <option value="today" ${
          timeFrameVal === "today" ? "selected" : ""
        }>Today</option>
        <option value="week" ${
          timeFrameVal === "week" ? "selected" : ""
        }>Last 7 Days</option>
        <option value="month" ${
          timeFrameVal === "month" ? "selected" : ""
        }>Last Month</option>
        <option value="all" ${
          timeFrameVal === "all" ? "selected" : ""
        }>All Time</option>
      </select>
    </label>
    <label class="tiny-lab" title="Include AI-powered analysis of errors (requires API key in settings)">
      <input type="checkbox" data-param="include_ai_analysis" ${
        aiAnalysisVal ? "checked" : ""
      } />
      <span class="lab">AI Analysis</span>
    </label>
    ${
      aiAnalysisVal
        ? '<span class="muted" style="font-size: 0.85em;">AI model configured in Settings → AI / API</span>'
        : ""
    }
  `;

  // Stop event propagation to prevent drag-and-drop interference
  wrapper.querySelectorAll("input, select").forEach((el) => {
    ["mousedown", "pointerdown", "click"].forEach((evt) => {
      el.addEventListener(evt, (e) => e.stopPropagation());
    });
  });

  const selTimeFrame = wrapper.querySelector('select[data-param="time_frame"]');
  const cbAiAnalysis = wrapper.querySelector(
    'input[data-param="include_ai_analysis"]'
  );

  selTimeFrame?.addEventListener("change", () => {
    updateParam("time_frame", selTimeFrame.value);
  });

  cbAiAnalysis?.addEventListener("change", () => {
    updateParam("include_ai_analysis", cbAiAnalysis.checked);
    // Re-render to show/hide hint
    const newWrapper = renderParamControls({
      params: { ...params, include_ai_analysis: cbAiAnalysis.checked },
      updateParam,
    });
    wrapper.parentElement?.replaceChild(newWrapper, wrapper);
  });

  return wrapper;
}

// =============================================================================
// CSS EXPORTS
// =============================================================================

// Screen-only styles (dark theme for tech view)
export const viewCSS = `
/* Windows Update Logs Analysis (technician screen styles) */
.card.windows-update-logs { display: flex; flex-direction: column; gap: 16px; }
.card.windows-update-logs .summary-notes { background: rgba(79, 140, 255, 0.12); border-left: 4px solid #4f8cff; padding: 14px; border-radius: 8px; margin-bottom: 0; }
.card.windows-update-logs .note-item { margin: 6px 0; font-size: 13px; line-height: 1.5; color: #cbd5e1; }
.card.windows-update-logs .note-item:first-child { margin-top: 0; }
.card.windows-update-logs .note-item:last-child { margin-bottom: 0; }
.card.windows-update-logs .no-errors { background: rgba(16, 185, 129, 0.15); border-left: 4px solid #10b981; padding: 14px; border-radius: 8px; color: #d1fae5; line-height: 1.6; margin-bottom: 0; }
.card.windows-update-logs .no-errors strong { color: #6ee7b7; }
.card.windows-update-logs .error-groups { margin: 0; }
.card.windows-update-logs .error-groups h3 { font-size: 16px; font-weight: 600; color: #e3e9f8; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
.card.windows-update-logs .error-group-card { background: rgba(36, 48, 68, 0.5); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; transition: all 0.2s ease; }
.card.windows-update-logs .error-group-card:last-child { margin-bottom: 0; }
.card.windows-update-logs .error-group-card:hover { border-color: #4f8cff; background: rgba(36, 48, 68, 0.7); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
.card.windows-update-logs .error-group-header { display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(203, 213, 225, 0.15); margin-bottom: 12px; }
.card.windows-update-logs .error-title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.card.windows-update-logs .error-code-badge { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px 10px; border-radius: 6px; font-family: "Courier New", "Consolas", monospace; font-weight: 700; font-size: 13px; color: #fca5a5; letter-spacing: 0.5px; }
.card.windows-update-logs .error-name { font-weight: 600; color: #e3e9f8; font-size: 14px; flex: 1; min-width: 200px; }
.card.windows-update-logs .error-description { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
.card.windows-update-logs .error-meta { font-size: 12px; color: #94a3b8; font-style: italic; }
.card.windows-update-logs .error-packages { margin-top: 12px; padding: 12px; background: rgba(36, 48, 68, 0.4); border-radius: 8px; }
.card.windows-update-logs .error-packages strong { display: block; font-size: 13px; font-weight: 600; color: #a3adbf; margin-bottom: 8px; }
.card.windows-update-logs .package-list { display: flex; flex-wrap: wrap; gap: 6px; }
.card.windows-update-logs .package-badge { background: rgba(79, 140, 255, 0.15); border: 1px solid rgba(79, 140, 255, 0.3); color: #93bbff; padding: 4px 10px; border-radius: 5px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.card.windows-update-logs .package-more { color: #64748b; font-size: 12px; font-style: italic; padding: 4px 8px; }
.card.windows-update-logs .ai-analysis-section { margin-top: 16px; padding: 14px; background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 8px; }
.card.windows-update-logs .ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(203, 213, 225, 0.15); }
.card.windows-update-logs .ai-header span:first-child { font-weight: 600; color: #e3e9f8; font-size: 14px; }
.card.windows-update-logs .ai-issue-summary { margin-bottom: 14px; }
.card.windows-update-logs .ai-issue-summary strong { display: block; font-size: 13px; font-weight: 600; color: #a3adbf; margin-bottom: 6px; }
.card.windows-update-logs .ai-issue-summary p { margin: 0; font-size: 13px; line-height: 1.6; color: #cbd5e1; }
.card.windows-update-logs .ai-causes, .card.windows-update-logs .ai-remediation { margin: 14px 0 0 0; }
.card.windows-update-logs .ai-causes strong, .card.windows-update-logs .ai-remediation strong { display: block; font-size: 13px; font-weight: 600; color: #a3adbf; margin-bottom: 8px; }
.card.windows-update-logs .ai-causes ul, .card.windows-update-logs .ai-remediation ol { margin: 0; padding-left: 20px; }
.card.windows-update-logs .ai-causes li, .card.windows-update-logs .ai-remediation li { margin: 6px 0; font-size: 13px; color: #cbd5e1; line-height: 1.6; }
.card.windows-update-logs .ai-causes li::marker, .card.windows-update-logs .ai-remediation li::marker { color: #94a3b8; }
`;

// Print styles (light theme for reports)
export const printCSS = `
  .card.windows-update-logs { page-break-inside: avoid; }
  .card.windows-update-logs .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
  .card.windows-update-logs .summary-notes { background: #e3f2fd; border-left: 4px solid #1976d2; padding: 1rem; margin-bottom: 1.5rem; border-radius: 6px; }
  .card.windows-update-logs .note-item { margin: 0.5rem 0; font-size: 0.95rem; line-height: 1.5; color: #0d47a1; }
  .card.windows-update-logs .note-item:first-child { margin-top: 0; }
  .card.windows-update-logs .note-item:last-child { margin-bottom: 0; }
  .card.windows-update-logs .no-errors { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 1rem; border-radius: 6px; color: #1b5e20; margin: 1.5rem 0; line-height: 1.6; }
  .card.windows-update-logs .no-errors strong { color: #2e7d32; }
  .card.windows-update-logs .error-groups { margin: 1.5rem 0; }
  .card.windows-update-logs .error-groups h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: #1a1a1a; padding-bottom: 0.5rem; border-bottom: 2px solid #ddd; }
  .card.windows-update-logs .error-group-card { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; page-break-inside: avoid; }
  .card.windows-update-logs .error-group-card:last-child { margin-bottom: 0; }
  .card.windows-update-logs .error-group-header { padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; margin-bottom: 1rem; }
  .card.windows-update-logs .error-title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .card.windows-update-logs .error-code-badge { background: #ffebee; border: 1px solid #ef5350; padding: 0.35rem 0.75rem; border-radius: 4px; font-family: "Courier New", "Consolas", monospace; font-weight: 700; font-size: 0.85rem; color: #c62828; letter-spacing: 0.5px; }
  .card.windows-update-logs .error-name { font-weight: 600; color: #333; font-size: 0.95rem; }
  .card.windows-update-logs .error-description { font-size: 0.9rem; color: #555; line-height: 1.6; margin-bottom: 0.5rem; }
  .card.windows-update-logs .error-meta { font-size: 0.85rem; color: #666; font-style: italic; }
  .card.windows-update-logs .error-packages { margin-top: 1rem; padding: 0.875rem; background: #f5f5f5; border-radius: 6px; border: 1px solid #e0e0e0; }
  .card.windows-update-logs .error-packages strong { display: block; font-size: 0.9rem; font-weight: 600; color: #444; margin-bottom: 0.5rem; }
  .card.windows-update-logs .package-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .card.windows-update-logs .package-badge { background: #e3f2fd; border: 1px solid #90caf9; color: #0d47a1; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
  .card.windows-update-logs .package-more { color: #888; font-size: 0.8rem; font-style: italic; padding: 0.25rem 0.5rem; }
  .card.windows-update-logs .ai-analysis-section { margin-top: 1.25rem; padding: 1rem; background: #f3e5f5; border: 1px solid #ce93d8; border-radius: 6px; page-break-inside: avoid; }
  .card.windows-update-logs .ai-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e0e0e0; }
  .card.windows-update-logs .ai-header span:first-child { font-weight: 600; color: #6a1b9a; font-size: 0.95rem; }
  .card.windows-update-logs .ai-issue-summary { margin-bottom: 1rem; }
  .card.windows-update-logs .ai-issue-summary strong { display: block; font-size: 0.9rem; font-weight: 600; color: #444; margin-bottom: 0.5rem; }
  .card.windows-update-logs .ai-issue-summary p { margin: 0; font-size: 0.9rem; line-height: 1.6; color: #555; }
  .card.windows-update-logs .ai-causes, .card.windows-update-logs .ai-remediation { margin: 1rem 0 0 0; }
  .card.windows-update-logs .ai-causes strong, .card.windows-update-logs .ai-remediation strong { display: block; font-size: 0.9rem; font-weight: 600; color: #444; margin-bottom: 0.5rem; }
  .card.windows-update-logs .ai-causes ul, .card.windows-update-logs .ai-remediation ol { margin: 0; padding-left: 1.5rem; }
  .card.windows-update-logs .ai-causes li, .card.windows-update-logs .ai-remediation li { margin: 0.5rem 0; font-size: 0.9rem; color: #555; line-height: 1.6; }
  
  @media print {
    .card.windows-update-logs .error-group-card { page-break-inside: avoid; break-inside: avoid; }
    .card.windows-update-logs .ai-analysis-section { page-break-inside: avoid; break-inside: avoid; }
  }
`;
