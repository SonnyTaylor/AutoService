/**
 * Windows Update Handler
 * ---------------------------------------------------------------------------
 * Installs Windows and driver updates using PowerShell's PSWindowsUpdate module.
 * Performs pre-scan, installation, and post-scan to track update status.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with update details
 * - Customer metrics extractor showing update installation summary
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill, renderList } from "../common/ui.js";
import { buildMetric, truncateItems } from "../common/metrics.js";

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
  id: "windows_update",
  label: "Windows Update",
  group: "System Integrity",
  category: "System Integrity",
  defaultParams: {
    microsoftUpdate: true,
    acceptAll: true,
    ignoreReboot: true,
  },
  toolKeys: [],
  async build({ params }) {
    const microsoft_update = params?.microsoftUpdate !== false;
    const accept_all = params?.acceptAll !== false;
    const ignore_reboot = params?.ignoreReboot !== false;
    return {
      type: "windows_update",
      microsoft_update,
      accept_all,
      ignore_reboot,
      ui_label: "Windows Update",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for Windows Update.
 * Displays pre-scan, installation results, post-scan, and reboot status.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const preScan = s.pre_scan || {};
  const install = s.install || {};
  const postScan = s.post_scan || {};
  const hr = s.human_readable || {};
  const meta = s.meta || {};

  // Pre-scan summary
  const preTotal = preScan.count_total || 0;
  const preWindows = preScan.count_windows || 0;
  const preDrivers = preScan.count_driver || 0;

  // Installation summary
  const installed = install.count_installed || 0;
  const downloaded = install.count_downloaded || 0;
  const failed = install.count_failed || 0;
  const windowsInstalled = install.count_windows_installed || 0;
  const driversInstalled = install.count_driver_installed || 0;

  // Post-scan summary
  const remaining = postScan.count_remaining || 0;

  // Reboot status
  const rebootRequired = s.reboot_required || false;

  // Verdict
  const verdict = hr.verdict || "unknown";
  const verdictLabel = verdict
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const verdictVariant = (() => {
    const v = verdict.toLowerCase();
    if (v.includes("up-to-date") || v.includes("updated")) return "ok";
    if (v.includes("remaining") || v.includes("available")) return "info";
    if (v.includes("error") || v.includes("failed")) return "fail";
    return undefined;
  })();

  // Module info pills
  const moduleAvailable = meta.module_available !== false;
  const moduleVersion = meta.module_version || "unknown";

  // Installation items
  const installItems = Array.isArray(install.items) ? install.items : [];

  // Errors
  const errors = Array.isArray(s.errors) ? s.errors : [];

  return html`
    <div class="card windows-update">
      ${renderHeader("Windows Update", result.status)}

      <!-- KPI Row -->
      <div class="kpi-row">
        ${kpiBox("Verdict", verdictLabel, verdictVariant)}
        ${kpiBox("Available", String(preTotal))}
        ${kpiBox(
          "Installed",
          String(installed),
          installed > 0 ? "ok" : undefined
        )}
        ${kpiBox("Failed", String(failed), failed > 0 ? "fail" : undefined)}
        ${kpiBox(
          "Remaining",
          String(remaining),
          remaining > 0 ? "info" : undefined
        )}
        ${kpiBox(
          "Reboot",
          rebootRequired ? "Required" : "Not Required",
          rebootRequired ? "warn" : "ok"
        )}
      </div>

      <!-- Module Info -->
      ${moduleAvailable
        ? html`
            <div class="pill-row">
              ${pill(`PSWindowsUpdate v${moduleVersion}`, "info")}
              ${meta.get_command
                ? pill(`Get: ${meta.get_command}`, "info")
                : ""}
              ${meta.install_command
                ? pill(`Install: ${meta.install_command}`, "info")
                : ""}
            </div>
          `
        : html`
            <div class="pill-row">
              ${pill("PSWindowsUpdate module not available", "fail")}
            </div>
          `}

      <!-- Pre-scan Details -->
      ${preTotal > 0
        ? html`
            <div class="section-title">Pre-Scan (Available Updates)</div>
            <div class="kpi-row">
              ${kpiBox("Total", String(preTotal))}
              ${kpiBox("Windows", String(preWindows))}
              ${kpiBox("Drivers", String(preDrivers))}
            </div>
          `
        : ""}

      <!-- Installation Details -->
      ${installItems.length > 0
        ? html`
            <div class="section-title">Installation Results</div>
            <div class="update-items">
              ${map(installItems, (item, idx) => {
                const result = (item.Result || "Unknown").toString();
                const isInstalled = result.toLowerCase().includes("installed");
                const isFailed = result.toLowerCase().includes("failed");
                const isDownloaded = result
                  .toLowerCase()
                  .includes("downloaded");
                const isDriver = item.IsDriver === true;

                const resultVariant = isInstalled
                  ? "ok"
                  : isFailed
                  ? "fail"
                  : isDownloaded
                  ? "info"
                  : "warn";

                return html`
                  <div class="update-item">
                    <div class="update-item-header">
                      <span class="update-title"
                        >${item.Title || "Unknown Update"}</span
                      >
                      ${pill(result, resultVariant)}
                    </div>
                    <div class="update-item-details">
                      ${item.KB
                        ? html`<span class="update-kb">KB: ${item.KB}</span>`
                        : ""}
                      ${item.Category
                        ? html`<span class="update-category"
                            >${item.Category}</span
                          >`
                        : ""}
                      ${item.Size
                        ? html`<span class="update-size">${item.Size}</span>`
                        : ""}
                      ${isDriver ? pill("Driver", "info") : ""}
                    </div>
                  </div>
                `;
              })}
            </div>
          `
        : installed > 0
        ? html`
            <div class="section-title">Installation Summary</div>
            <div class="kpi-row">
              ${kpiBox("Windows Updates", String(windowsInstalled))}
              ${kpiBox("Driver Updates", String(driversInstalled))}
            </div>
          `
        : ""}

      <!-- Post-scan Details -->
      ${remaining > 0
        ? html`
            <div class="section-title">Post-Scan (Remaining Updates)</div>
            <div class="info-box">
              <p>
                ${remaining} update${remaining !== 1 ? "s" : ""} still
                available.
              </p>
              ${rebootRequired
                ? html`<p>
                    A reboot may be required before additional updates can be
                    installed.
                  </p>`
                : ""}
            </div>
          `
        : ""}

      <!-- Summary Notes -->
      ${Array.isArray(hr.notes) && hr.notes.length > 0
        ? html`
            <div class="pill-row">
              ${map(hr.notes, (note) => {
                const noteStr = String(note || "").toLowerCase();
                let variant = "info";
                if (noteStr.includes("failed")) variant = "fail";
                else if (noteStr.includes("reboot")) variant = "warn";
                else if (noteStr.includes("installed")) variant = "ok";
                return pill(note, variant);
              })}
            </div>
          `
        : ""}

      <!-- Errors -->
      ${errors.length > 0
        ? html`
            <details class="output">
              <summary>Errors (${errors.length})</summary>
              <div class="error-list">
                ${map(errors, (err, idx) => {
                  const where = err.where || "Unknown";
                  const message = err.message || err.toString();
                  return html`
                    <div class="error-item">
                      <strong>${where}:</strong>
                      <pre>${message}</pre>
                    </div>
                  `;
                })}
              </div>
            </details>
          `
        : ""}

      <!-- Timings -->
      ${s.timings
        ? html`
            <details class="timings">
              <summary>Execution Timings</summary>
              ${renderList(s.timings)}
            </details>
          `
        : ""}

      <!-- Debug Output -->
      ${s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>Debug Output</summary>
              <pre>${s.stderr_excerpt}</pre>
            </details>
          `
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly Windows Update metrics.
 * Shows update installation summary with reboot status.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  // Only show metrics if updates were actually performed
  if (status !== "success" && status !== "completed_with_errors") return null;

  const install = summary?.install || {};
  const preScan = summary?.pre_scan || {};
  const installed = install.count_installed || 0;
  const failed = install.count_failed || 0;
  const rebootRequired = summary?.reboot_required || false;
  const windowsUpdates = install.count_windows_installed || 0;
  const driverUpdates = install.count_driver_installed || 0;

  // Don't show if no updates were installed
  if (installed === 0) return null;

  const items = [];

  if (windowsUpdates > 0) {
    items.push(
      `${windowsUpdates} Windows update${windowsUpdates !== 1 ? "s" : ""}`
    );
  }

  if (driverUpdates > 0) {
    items.push(
      `${driverUpdates} driver update${driverUpdates !== 1 ? "s" : ""}`
    );
  }

  if (failed > 0) {
    items.push(`${failed} failed`);
  }

  if (rebootRequired) {
    items.push("Reboot required");
  }

  return buildMetric({
    icon: "🔄",
    label: "Updates Installed",
    value: `${installed}`,
    detail: rebootRequired ? "Reboot required" : "Ready to use",
    variant: failed > 0 ? "warning" : "success",
    items: items.length > 0 ? items : undefined,
  });
}
