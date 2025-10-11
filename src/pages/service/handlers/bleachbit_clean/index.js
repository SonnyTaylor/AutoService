/**
 * bleachbit_clean Handler
 *
 * Disk Cleanup using BleachBit to remove junk files.
 * Cleans temporary files, caches, logs, and other unnecessary data.
 */

import { html } from "lit-html";
import { renderHeader, kpiBox } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// Import prettyBytes for formatting
const prettyBytes = (bytes) => {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "bleachbit_clean",
  label: "Junk Cleanup (BleachBit)",
  group: "Cleanup",
  category: "Junk",
  toolKeys: ["bleachbit"],
  async build({ resolveToolPath }) {
    return {
      type: "bleachbit_clean",
      executable_path: await resolveToolPath("bleachbit"),
      options: [
        "system.tmp",
        "system.recycle_bin",
        "system.prefetch",
        "system.logs",
        "system.memory_dump",
        "system.updates",
        "google_chrome.cache",
        "microsoft_edge.cache",
        "firefox.cache",
        "brave.cache",
        "opera.cache",
        "librewolf.cache",
        "palemoon.cache",
        "waterfox.cache",
        "discord.cache",
        "slack.cache",
        "zoom.cache",
        "zoom.recordings",
        "windows_defender.temp",
        "winrar.temp",
        "vuze.cache",
        "vuze.temp",
      ],
      ui_label: "Junk Cleanup (BleachBit)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderBleachBit in tasks.js)
// =============================================================================

/**
 * Render BleachBit cleanup results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const recovered = s.space_recovered_bytes;

  return html`
    <div class="card bleachbit">
      ${renderHeader("Disk Cleanup (BleachBit)", result.status)}
      <div class="kpi-row">
        ${kpiBox(
          "Space Recovered",
          recovered != null ? prettyBytes(recovered) : "-"
        )}
        ${kpiBox("Files Deleted", s.files_deleted ?? "-")}
        ${kpiBox("Errors", s.errors ?? "-")}
        ${s.special_operations
          ? kpiBox("Special Ops", s.special_operations)
          : ""}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processDiskCleanup in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from BleachBit cleanup results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  const spaceRecovered = summary.space_recovered_bytes || 0;
  const filesDeleted = summary.files_deleted || 0;

  if (spaceRecovered === 0) return [];

  const gb = (spaceRecovered / 1024 ** 3).toFixed(2);

  return [
    buildMetric({
      icon: "🧹",
      label: "Junk Files Cleaned",
      value: `${gb} GB`,
      detail: `${filesDeleted.toLocaleString()} files removed`,
      variant: "success",
    }),
  ];
}
