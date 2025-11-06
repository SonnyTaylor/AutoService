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

    return {
      type: "windows_update_logs_analysis",
      time_frame: params?.time_frame || "week",
      include_ai_analysis: params?.include_ai_analysis === true,
      err_exe_path: errPath, // Pass Err.exe path to Python service
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

  // Build status color based on error count
  const statusColor =
    totalErrors === 0 ? "success" : totalErrors < 5 ? "info" : "warning";

  return html`
    <div class="card windows-update-logs">
      ${renderHeader("Windows Update Error Analysis", result.status)}

      <!-- Summary KPIs -->
      <div class="kpi-row">
        ${kpiBox("Total Errors", totalErrors)}
        ${kpiBox("Unique Codes", uniqueCodes)}
        ${kpiBox("Time Frame", timeFrame)}
      </div>

      <!-- Summary Notes -->
      ${hr.notes && hr.notes.length > 0
        ? html`
            <div class="summary-notes">
              ${hr.notes.map(
                (note) => html`<p class="note-item">• ${note}</p>`
              )}
            </div>
          `
        : html``}

      <!-- Error Groups Table -->
      ${errorGroups.length > 0
        ? html`
            <div class="error-groups">
              <h3>Error Codes Detected</h3>
              <div class="error-table-container">
                <table class="error-table">
                  <thead>
                    <tr>
                      <th>Error Code</th>
                      <th>Error Name</th>
                      <th>Count</th>
                      <th>Latest</th>
                      <th>Packages</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${errorGroups.map(
                      (error) => html`
                        <tr>
                          <td class="error-code">${error.error_code}</td>
                          <td class="error-name">${error.error_name}</td>
                          <td class="error-count">
                            <span class="badge">${error.count}</span>
                          </td>
                          <td class="error-latest">
                            ${formatTimestamp(error.latest_occurrence)}
                          </td>
                          <td class="error-packages">
                            ${error.affected_packages &&
                            error.affected_packages.length > 0
                              ? html`
                                  <div class="package-list">
                                    ${error.affected_packages
                                      .slice(0, 2)
                                      .map(
                                        (pkg) =>
                                          html`<span class="package-badge"
                                            >${pkg}</span
                                          >`
                                      )}
                                    ${error.affected_packages.length > 2
                                      ? html`<span class="package-more"
                                          >+${error.affected_packages.length -
                                          2}
                                          more</span
                                        >`
                                      : html``}
                                  </div>
                                `
                              : html`<span class="na">N/A</span>`}
                          </td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          `
        : html`
            <div class="no-errors">
              <p>
                ✓ No Windows Update errors found in the selected time frame.
              </p>
            </div>
          `}

      <!-- AI Analysis Section -->
      ${errorGroups.some((e) => e.ai_analysis)
        ? html`
            <div class="ai-analysis-section">
              <h3>AI Analysis & Remediation</h3>
              ${errorGroups
                .filter((e) => e.ai_analysis)
                .map(
                  (error) => html`
                    <div class="ai-analysis-card">
                      <div class="ai-header">
                        <span class="error-code-badge"
                          >${error.error_code}</span
                        >
                        <span
                          class="priority-badge priority-${error.ai_analysis
                            .priority || "medium"}"
                        >
                          ${(
                            error.ai_analysis.priority || "medium"
                          ).toUpperCase()}
                        </span>
                      </div>

                      <div class="ai-issue">
                        <strong>Issue:</strong>
                        <p>
                          ${error.ai_analysis.issue_summary ||
                          "No summary available"}
                        </p>
                      </div>

                      ${error.ai_analysis.root_causes &&
                      error.ai_analysis.root_causes.length > 0
                        ? html`
                            <div class="ai-causes">
                              <strong>Likely Causes:</strong>
                              <ul>
                                ${error.ai_analysis.root_causes.map(
                                  (cause) => html`<li>${cause}</li>`
                                )}
                              </ul>
                            </div>
                          `
                        : html``}
                      ${error.ai_analysis.remediation_steps &&
                      error.ai_analysis.remediation_steps.length > 0
                        ? html`
                            <div class="ai-remediation">
                              <strong>Remediation Steps:</strong>
                              <ol>
                                ${error.ai_analysis.remediation_steps.map(
                                  (step) => html`<li>${step}</li>`
                                )}
                              </ol>
                            </div>
                          `
                        : html``}
                    </div>
                  `
                )}
            </div>
          `
        : html``}

      <!-- Error Details -->
      ${summary.stderr_excerpt
        ? html`
            <div class="error-details">
              <details>
                <summary>Error Output</summary>
                <pre>${summary.stderr_excerpt}</pre>
              </details>
            </div>
          `
        : html``}
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
    <label class="tiny-lab" title="Include AI-powered analysis of errors (requires OpenAI API key)">
      <input type="checkbox" data-param="include_ai_analysis" ${
        aiAnalysisVal ? "checked" : ""
      } />
      <span class="lab">AI Analysis</span>
    </label>
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
  });

  return wrapper;
}

// =============================================================================
// CSS EXPORTS
// =============================================================================

export const printCSS = `
  .card.windows-update-logs {
    break-inside: avoid;
  }

  .card.windows-update-logs .kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .card.windows-update-logs .summary-notes {
    background: #f5f5f5;
    border-left: 4px solid #0066cc;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border-radius: 4px;
  }

  .card.windows-update-logs .summary-notes .note-item {
    margin: 0.5rem 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .card.windows-update-logs .error-groups {
    margin: 2rem 0;
  }

  .card.windows-update-logs .error-groups h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #222;
  }

  .card.windows-update-logs .error-table-container {
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  .card.windows-update-logs .error-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .card.windows-update-logs .error-table thead {
    background: #f0f0f0;
    border-bottom: 2px solid #ddd;
  }

  .card.windows-update-logs .error-table th {
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #333;
  }

  .card.windows-update-logs .error-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #eee;
  }

  .card.windows-update-logs .error-code {
    font-family: "Courier New", monospace;
    font-weight: 600;
    color: #d32f2f;
  }

  .card.windows-update-logs .error-name {
    font-weight: 500;
    color: #555;
  }

  .card.windows-update-logs .error-count .badge {
    background: #ff9800;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .card.windows-update-logs .error-latest {
    font-size: 0.85rem;
    color: #666;
  }

  .card.windows-update-logs .package-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .card.windows-update-logs .package-badge {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card.windows-update-logs .package-more {
    color: #999;
    font-size: 0.8rem;
    font-style: italic;
  }

  .card.windows-update-logs .no-errors {
    background: #e8f5e9;
    border-left: 4px solid #4caf50;
    padding: 1rem;
    border-radius: 4px;
    color: #2e7d32;
    margin: 1rem 0;
  }

  .card.windows-update-logs .ai-analysis-section {
    margin: 2rem 0;
    padding-top: 1rem;
    border-top: 2px solid #eee;
  }

  .card.windows-update-logs .ai-analysis-section h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #222;
  }

  .card.windows-update-logs .ai-analysis-card {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    break-inside: avoid;
  }

  .card.windows-update-logs .ai-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .card.windows-update-logs .error-code-badge {
    background: #f5f5f5;
    border: 1px solid #ddd;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-family: "Courier New", monospace;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .card.windows-update-logs .priority-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card.windows-update-logs .priority-critical {
    background: #d32f2f;
    color: white;
  }

  .card.windows-update-logs .priority-high {
    background: #f57c00;
    color: white;
  }

  .card.windows-update-logs .priority-medium {
    background: #fbc02d;
    color: #222;
  }

  .card.windows-update-logs .priority-low {
    background: #388e3c;
    color: white;
  }

  .card.windows-update-logs .ai-issue {
    margin-bottom: 1rem;
  }

  .card.windows-update-logs .ai-issue strong {
    display: block;
    margin-bottom: 0.5rem;
    color: #333;
  }

  .card.windows-update-logs .ai-issue p {
    margin: 0;
    line-height: 1.5;
    color: #555;
  }

  .card.windows-update-logs .ai-causes,
  .card.windows-update-logs .ai-remediation {
    margin: 1rem 0;
  }

  .card.windows-update-logs .ai-causes strong,
  .card.windows-update-logs .ai-remediation strong {
    display: block;
    margin-bottom: 0.5rem;
    color: #333;
  }

  .card.windows-update-logs .ai-causes ul,
  .card.windows-update-logs .ai-remediation ol {
    margin: 0;
    padding-left: 1.5rem;
  }

  .card.windows-update-logs .ai-causes li,
  .card.windows-update-logs .ai-remediation li {
    margin: 0.5rem 0;
    color: #555;
    line-height: 1.5;
  }

  .card.windows-update-logs .error-details {
    margin-top: 1rem;
    border-top: 1px solid #eee;
    padding-top: 1rem;
  }

  .card.windows-update-logs .error-details details {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.75rem;
  }

  .card.windows-update-logs .error-details summary {
    cursor: pointer;
    font-weight: 600;
    color: #333;
    user-select: none;
  }

  .card.windows-update-logs .error-details pre {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 0.75rem;
    margin: 0.75rem 0 0 0;
    font-family: "Courier New", monospace;
    font-size: 0.8rem;
    overflow-x: auto;
    color: #333;
    line-height: 1.3;
  }

  @media print {
    .card.windows-update-logs .error-table {
      page-break-inside: avoid;
    }

    .card.windows-update-logs .ai-analysis-card {
      page-break-inside: avoid;
    }
  }
`;
