/**
 * chkdsk_scan Handler
 *
 * File System Check using Windows CHKDSK utility.
 * Checks and repairs file system errors on specified drives.
 */

import { html } from "lit-html";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
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
  id: "chkdsk_scan",
  label: "File System Check (CHKDSK)",
  group: "System Integrity",
  category: "System Integrity",
  defaultParams: { drive: "C:", mode: "read_only", schedule_if_busy: false },
  toolKeys: [],
  async build({ params }) {
    const drive = (params?.drive || "C:").toString();
    const mode = params?.mode || "read_only"; // read_only | fix_errors | comprehensive
    const schedule = Boolean(params?.schedule_if_busy);
    return {
      type: "chkdsk_scan",
      drive,
      mode,
      schedule_if_busy: schedule,
      ui_label: `CHKDSK (${drive}, ${mode})`,
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderChkdsk in tasks.js)
// =============================================================================

/**
 * Render CHKDSK file system check results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};

  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const toBytes = (kb) => {
    const val = toNumber(kb);
    return val != null ? val * 1024 : null;
  };

  const formatBytes = (kb) => {
    const bytes = toBytes(kb);
    return bytes != null ? prettyBytes(bytes) : "-";
  };

  const totalKb = toNumber(s.total_disk_kb);
  const availKb = toNumber(s.available_kb);
  const usedKb =
    totalKb != null && availKb != null ? Math.max(totalKb - availKb, 0) : null;
  const systemUseKb = toNumber(s.system_use_kb);
  const durationSec = toNumber(s.duration_seconds);

  const pct = (part, whole) => {
    if (part == null || whole == null || whole === 0) return null;
    return Math.round((part / whole) * 100);
  };

  const usedPct = pct(usedKb, totalKb);
  const freePct = pct(availKb, totalKb);

  const verdict = (() => {
    if (s.volume_in_use) return "Volume in use";
    if (s.prompted_schedule_or_dismount) return "Requires schedule";
    if (s.made_corrections) return "Corrections applied";
    if (s.found_no_problems === true) return "No issues found";
    if (s.return_code != null && Number(s.return_code) !== 0)
      return "Completed with warnings";
    return "Review output";
  })();

  const formatDuration = (seconds) => {
    if (seconds == null) return "-";
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  const capitalize = (str) =>
    str ? str.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "-";

  const pills = [];
  if (s.found_no_problems === true) pills.push(pill("Clean", "ok"));
  if (s.made_corrections) pills.push(pill("Corrections Made", "warn"));
  if (s.bad_sectors_kb && Number(s.bad_sectors_kb) > 0)
    pills.push(pill(`Bad Sectors ${formatBytes(s.bad_sectors_kb)}`, "fail"));
  if (s.prompted_schedule_or_dismount)
    pills.push(pill("Prompted to Schedule / Dismount", "warn"));
  if (s.volume_in_use) pills.push(pill("Volume In Use", "warn"));

  return html`
    <div class="card chkdsk">
      ${renderHeader("File System Check (CHKDSK)", result.status)}
      <div class="kpi-row">
        ${kpiBox("Drive", s.drive || "-")}
        ${kpiBox("Mode", capitalize(s.mode || ""))}
        ${kpiBox("Duration", formatDuration(durationSec))}
        ${kpiBox("Total Size", formatBytes(totalKb))}
        ${kpiBox(
          "Used",
          usedKb != null
            ? `${formatBytes(usedKb)}${usedPct != null ? ` (${usedPct}%)` : ""}`
            : "-"
        )}
        ${kpiBox(
          "Free",
          availKb != null
            ? `${formatBytes(availKb)}${
                freePct != null ? ` (${freePct}%)` : ""
              }`
            : "-"
        )}
        ${systemUseKb != null
          ? kpiBox("System Use", formatBytes(systemUseKb))
          : ""}
        ${kpiBox(
          "Return Code",
          s.return_code != null ? String(s.return_code) : "-"
        )}
        ${kpiBox("Verdict", verdict)}
      </div>
      ${pills.length ? html`<div class="pill-row">${pills}</div>` : ""}
      ${s.output
        ? html`
            <details class="output">
              <summary>View raw CHKDSK output</summary>
              <pre>${s.output}</pre>
            </details>
          `
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processCHKDSKScan in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from CHKDSK scan results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  if (status !== "success") return [];

  const drive = summary.drive || "Unknown drive";
  const mode = summary.mode || "unknown";

  if (summary.found_no_problems) {
    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: `${drive}: No problems found`,
        variant: "info",
      }),
    ];
  }

  if (summary.made_corrections) {
    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: `${drive}: Errors found and corrected`,
        variant: "info",
      }),
    ];
  }

  if (summary.scheduled) {
    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: `${drive}: Scan scheduled for next boot`,
        variant: "info",
      }),
    ];
  }

  // If we have bad sectors or other issues but no corrections made
  if (summary.bad_sectors_kb && summary.bad_sectors_kb > 0) {
    return [
      buildMetric({
        icon: "✅",
        label: "System Health",
        value: "Verified",
        detail: `${drive}: Bad sectors detected`,
        variant: "info",
      }),
    ];
  }

  return [];
}

// =============================================================================
// PARAMETER CONTROLS RENDERER (for builder UI)
// =============================================================================

/**
 * Render custom parameter controls for CHKDSK configuration.
 * @param {object} context - Parameter control context
 * @param {object} context.params - Current parameter values
 * @param {function} context.updateParam - Callback to update parameters
 * @returns {HTMLElement} DOM element with controls
 */
export function renderParamControls({ params, updateParam }) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";

  const driveVal = params?.drive ?? "C:";
  const modeVal = params?.mode ?? "read_only";
  const schedVal = !!params?.schedule_if_busy;

  wrapper.innerHTML = `
    <label class="tiny-lab" style="margin-right:8px;">
      <span class="lab">Drive</span>
      <input type="text" class="text-input" data-param="drive" value="${driveVal}" size="4" aria-label="Drive letter (e.g., C:)" />
    </label>
    <label class="tiny-lab" style="margin-right:8px;">
      <span class="lab">Mode</span>
      <select data-param="mode" aria-label="CHKDSK mode">
        <option value="read_only" ${
          modeVal === "read_only" ? "selected" : ""
        }>Read-only</option>
        <option value="fix_errors" ${
          modeVal === "fix_errors" ? "selected" : ""
        }>Fix errors (/f)</option>
        <option value="comprehensive" ${
          modeVal === "comprehensive" ? "selected" : ""
        }>Comprehensive (/f /r)</option>
      </select>
    </label>
    <label class="tiny-lab">
      <input type="checkbox" data-param="schedule_if_busy" ${
        schedVal ? "checked" : ""
      } />
      <span class="lab">Schedule if busy</span>
    </label>
  `;

  const driveInput = wrapper.querySelector('input[data-param="drive"]');
  const modeSelect = wrapper.querySelector('select[data-param="mode"]');
  const schedCb = wrapper.querySelector('input[data-param="schedule_if_busy"]');

  // Stop event propagation to prevent drag-and-drop interference
  [driveInput, modeSelect, schedCb].forEach((el) => {
    ["mousedown", "pointerdown", "click"].forEach((evt) => {
      el.addEventListener(evt, (e) => e.stopPropagation());
    });
  });

  driveInput.addEventListener("change", () => {
    updateParam("drive", (driveInput.value || "C:").trim());
  });

  modeSelect.addEventListener("change", () => {
    updateParam("mode", modeSelect.value);
  });

  schedCb.addEventListener("change", () => {
    updateParam("schedule_if_busy", schedCb.checked);
  });

  return wrapper;
}
