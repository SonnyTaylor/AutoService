/**
 * adwcleaner_clean Handler
 *
 * Adware and PUP Removal using AdwCleaner.
 * Removes adware, toolbars, potentially unwanted programs, and browser hijackers.
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "adwcleaner_clean",
  label: "Adware Clean (AdwCleaner)",
  group: "Cleanup",
  category: "Antivirus",
  toolKeys: ["adwcleaner"],
  async build({ resolveToolPath }) {
    return {
      type: "adwcleaner_clean",
      executable_path: await resolveToolPath("adwcleaner"),
      working_path: "..\\data\\logs",
      clean_preinstalled: false,
      ui_label: "Adware Clean (AdwCleaner)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderAdwCleaner in tasks.js)
// =============================================================================

/**
 * Render AdwCleaner cleanup results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};

  const getLen = (a) => (Array.isArray(a) ? a.length : 0);
  const browserHits = Object.values(s.browsers || {}).reduce(
    (sum, v) => sum + (Array.isArray(v) ? v.length : 0),
    0
  );

  const lines = [
    ...(s.registry || []),
    ...(s.files || []),
    ...(s.folders || []),
    ...(s.services || []),
    ...(s.tasks || []),
    ...(s.shortcuts || []),
    ...(s.dlls || []),
    ...(s.wmi || []),
    ...(s.preinstalled || []),
  ].map(String);

  const needsReboot = lines.some((t) => /reboot/i.test(t));
  const problems =
    (s.failed || 0) > 0 || lines.some((t) => /not deleted|failed/i.test(t));

  const categories = {
    Registry: getLen(s.registry),
    Files: getLen(s.files),
    Folders: getLen(s.folders),
    Services: getLen(s.services),
    Tasks: getLen(s.tasks),
    Shortcuts: getLen(s.shortcuts),
    DLLs: getLen(s.dlls),
    WMI: getLen(s.wmi),
    "Browser Items": browserHits,
    Preinstalled: { count: getLen(s.preinstalled), variant: "warn" },
  };

  return html`
    <div class="card adwcleaner">
      ${renderHeader("AdwCleaner Cleanup", result.status)}
      <div class="kpi-row">
        ${kpiBox("Cleaned", s.cleaned != null ? String(s.cleaned) : "-")}
        ${kpiBox("Failed", s.failed != null ? String(s.failed) : "-")}
        ${kpiBox("Browser Items", browserHits)}
        ${getLen(s.preinstalled)
          ? kpiBox("Preinstalled", getLen(s.preinstalled))
          : ""}
      </div>

      ${needsReboot || problems
        ? html`
            <div class="pill-row">
              ${needsReboot ? pill("Reboot Required", "warn") : ""}
              ${(s.failed || 0) > 0 ? pill(`Failed ${s.failed}`, "fail") : ""}
            </div>
          `
        : ""}

      <div class="tag-grid">
        ${map(Object.entries(categories), ([label, data]) => {
          const count = typeof data === "object" ? data.count : data;
          const variant = typeof data === "object" ? data.variant : undefined;
          return count > 0 ? pill(`${label} ${count}`, variant) : "";
        })}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processAdwCleanerScan in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from AdwCleaner cleanup results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  // Only show metrics if scan completed successfully
  if (status !== "success") return [];

  const cleaned = summary.cleaned || 0;

  // Case 1: Threats found and removed
  if (cleaned > 0) {
    // Count items in each category
    const getLen = (arr) => (Array.isArray(arr) ? arr.length : 0);

    const browserHits = summary.browsers
      ? Object.values(summary.browsers).reduce(
          (sum, v) => sum + (Array.isArray(v) ? v.length : 0),
          0
        )
      : 0;

    // Build category breakdown
    const categories = [];
    const registryCount = getLen(summary.registry);
    const filesCount = getLen(summary.files);
    const foldersCount = getLen(summary.folders);
    const servicesCount = getLen(summary.services);
    const tasksCount = getLen(summary.tasks);
    const shortcutsCount = getLen(summary.shortcuts);
    const dllsCount = getLen(summary.dlls);
    const wmiCount = getLen(summary.wmi);
    const preinstalledCount = getLen(summary.preinstalled);

    // Add categories with friendly names
    if (registryCount > 0)
      categories.push({ label: "Registry entries", count: registryCount });
    if (filesCount > 0) categories.push({ label: "Files", count: filesCount });
    if (foldersCount > 0)
      categories.push({ label: "Programs/folders", count: foldersCount });
    if (servicesCount > 0)
      categories.push({ label: "Services", count: servicesCount });
    if (tasksCount > 0)
      categories.push({ label: "Scheduled tasks", count: tasksCount });
    if (shortcutsCount > 0)
      categories.push({ label: "Shortcuts", count: shortcutsCount });
    if (dllsCount > 0)
      categories.push({ label: "System files", count: dllsCount });
    if (wmiCount > 0)
      categories.push({ label: "System entries", count: wmiCount });
    if (browserHits > 0)
      categories.push({ label: "Browser extensions", count: browserHits });
    if (preinstalledCount > 0)
      categories.push({ label: "Unwanted apps", count: preinstalledCount });

    const items = categories.map(
      (cat) => `${cat.label}: ${cat.count.toLocaleString()}`
    );

    return [
      buildMetric({
        icon: "🛡️",
        label: "Security Threats Removed",
        value: cleaned.toString(),
        detail: "Adware & PUP Removal",
        variant: "success",
        items: items.length > 0 ? items : undefined,
      }),
    ];
  }

  // Case 2: No threats found (clean system)
  if (cleaned === 0) {
    return [
      buildMetric({
        icon: "✅",
        label: "Adware Scan",
        value: "Clean",
        detail: "AdwCleaner",
        variant: "success",
        items: ["No adware or unwanted programs detected"],
      }),
    ];
  }

  return [];
}

// =============================================================================
// VIEW CSS (service-specific styles for technician web view)
// =============================================================================

export const viewCSS = `
  /* Numeric alignment tweak for KPIs in AdwCleaner card */
  .card.adwcleaner .kpi .val { font-variant-numeric: tabular-nums; }
`;
