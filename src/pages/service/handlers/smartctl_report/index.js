/**
 * smartctl_report Handler
 *
 * Drive Health Report using smartctl from GSmartControl.
 * Scans all non-USB drives and reports SMART health metrics.
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "smartctl_report",
  label: "Drive Health Report (smartctl)",
  group: "Diagnostics",
  category: "Diagnostics",
  toolKeys: ["smartctl", "gsmartcontrol"],
  isDiagnostic: true,
  async build({ resolveToolPath }) {
    let pSmart = await resolveToolPath(["smartctl", "gsmartcontrol"]);
    if (pSmart && /gsmartcontrol\.exe$/i.test(pSmart)) {
      pSmart = pSmart.replace(/[^\\\/]+$/g, "smartctl.exe");
    }
    return {
      type: "smartctl_report",
      executable_path: pSmart,
      detail_level: "basic",
      ui_label: "Drive Health Report (smartctl)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderSmartctl in tasks.js)
// =============================================================================

/**
 * Render smartctl drive health report for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const drives = Array.isArray(s.drives) ? s.drives : [];

  return html`
    <div class="card smartctl">
      ${renderHeader("Drive Health (smartctl)", result.status)}
      <div class="drive-list">
        ${drives.length > 0
          ? map(drives, (d) => {
              // Calculate health percentage and variant
              const healthPercent =
                d.wear_level_percent_used != null
                  ? 100 - d.wear_level_percent_used
                  : null;
              const healthVariant = (() => {
                if (healthPercent == null) return undefined;
                if (healthPercent >= 90) return "ok";
                if (healthPercent >= 70) return "warn";
                return "fail";
              })();

              return html`
                <div class="drive-card">
                  <div class="drive-head">
                    <div class="drive-model">
                      ${d.model_name || d.name || "Drive"}
                      <span class="muted small">
                        (SN: ${d.serial_number || "?"}, FW:
                        ${d.firmware_version || "?"})
                      </span>
                    </div>
                    <span class="badge ${d.health_passed ? "ok" : "fail"}"
                      >${d.health_passed ? "PASSED" : "FAILED"}</span
                    >
                  </div>
                  <div class="kpi-row">
                    ${healthPercent != null
                      ? kpiBox(
                          "Drive Health",
                          `${healthPercent}%`,
                          healthVariant
                        )
                      : ""}
                    ${kpiBox("Temp", d.temperature || "-")}
                    ${d.media_errors != null
                      ? kpiBox(
                          "Media Errors",
                          String(d.media_errors),
                          d.media_errors > 0 ? "fail" : undefined
                        )
                      : ""}
                    ${d.error_log_entries != null
                      ? kpiBox(
                          "Error Log",
                          String(d.error_log_entries),
                          d.error_log_entries > 0 ? "warn" : undefined
                        )
                      : ""}
                    ${d.unsafe_shutdowns != null
                      ? kpiBox(
                          "Unsafe Shutdowns",
                          String(d.unsafe_shutdowns),
                          d.unsafe_shutdowns > 0 ? "warn" : undefined
                        )
                      : ""}
                    ${kpiBox(
                      "Power On Hrs",
                      d.power_on_hours != null ? String(d.power_on_hours) : "-"
                    )}
                    ${kpiBox(
                      "Power Cycles",
                      d.power_cycles != null ? String(d.power_cycles) : "-"
                    )}
                    ${d.data_written_human
                      ? kpiBox("Data Written", d.data_written_human)
                      : ""}
                    ${d.data_read_human
                      ? kpiBox("Data Read", d.data_read_human)
                      : ""}
                  </div>
                </div>
              `;
            })
          : html`<div class="muted">No drive data</div>`}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processDriveHealth in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from smartctl drive health results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  if (status !== "success") return [];

  const drives = Array.isArray(summary.drives) ? summary.drives : [];

  if (drives.length === 0) return [];

  // Process each drive's health data
  const driveHealthData = drives.map((drive) => {
    const healthPercent =
      drive.wear_level_percent_used != null
        ? 100 - drive.wear_level_percent_used
        : null;

    return {
      model: drive.model_name || drive.name || "Unknown Drive",
      health: healthPercent,
      passed: drive.health_passed,
      temp: drive.temperature,
      powerOnHours: drive.power_on_hours,
    };
  });

  // Build detail items for each drive
  const items = driveHealthData.map((d) => {
    const healthStr =
      d.health != null ? `${Math.round(d.health)}% health` : "Health checked";
    const tempStr = d.temp ? `, ${d.temp}` : "";
    const hoursStr = d.powerOnHours ? `, ${d.powerOnHours}h runtime` : "";
    return `${d.model}: ${healthStr}${tempStr}${hoursStr}`;
  });

  // Calculate average health percentage
  const drivesWithHealth = driveHealthData.filter((d) => d.health != null);
  const avgHealth =
    drivesWithHealth.length > 0
      ? Math.round(
          drivesWithHealth.reduce((sum, d) => sum + d.health, 0) /
            drivesWithHealth.length
        )
      : null;

  return [
    buildMetric({
      icon: "💾",
      label: "Hard Drive Health",
      value: avgHealth != null ? `${avgHealth}% avg` : "Checked",
      detail: `${driveHealthData.length} drive${
        driveHealthData.length !== 1 ? "s" : ""
      } analyzed`,
      variant: avgHealth && avgHealth < 80 ? "success" : "info",
      items,
    }),
  ];
}
