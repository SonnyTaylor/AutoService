/**
 * Battery Health Report Handler
 * ---------------------------------------------------------------------------
 * Reports battery health information including capacity, wear level, cycle
 * count, temperature, charge state, and time estimates using batteryinfo.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with battery metrics visualization
 * - Customer metrics extractor showing battery health status
 */

import { html } from "lit-html";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

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
  id: "battery_health_report",
  label: "Battery Health Report",
  group: "Diagnostics",
  category: "Diagnostics",
  defaultParams: {},
  toolKeys: [],
  async build({ params }) {
    const index = params?.index != null ? parseInt(params.index, 10) : 0;
    return {
      type: "battery_health_report",
      index,
      ui_label: "Battery Health Report",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Get variant for battery capacity/health.
 * @private
 */
const getHealthVariant = (capacityPercent) => {
  if (capacityPercent == null) return undefined;
  if (capacityPercent >= 80) return "ok";
  if (capacityPercent >= 60) return "warn";
  return "fail";
};

/**
 * Get variant for battery state.
 * @private
 */
const getStateVariant = (state) => {
  const lower = (state || "").toLowerCase();
  if (lower === "full") return "ok";
  if (lower === "charging") return "info";
  if (lower === "discharging") return undefined;
  if (lower === "empty") return "fail";
  return undefined;
};

/**
 * Format battery identifier string.
 * @private
 */
const formatBatteryName = (summary) => {
  const parts = [];
  if (summary.vendor) parts.push(summary.vendor);
  if (summary.model) parts.push(summary.model);
  if (parts.length === 0) return "Battery";
  return parts.join(" ");
};

/**
 * Render technician view for battery health report.
 * Displays battery capacity, wear level, cycle count, temperature, and state.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};

  // Handle skipped status (no battery detected)
  if (result.status === "skipped") {
    return html`
      <div class="card battery-health">
        ${renderHeader("Battery Health Report", "skipped")}
        <div class="battery-content">
          <div class="no-battery-message">
            <i
              class="ph ph-battery-warning"
              style="font-size: 48px; opacity: 0.5;"
            ></i>
            <p class="muted">
              ${s.error || "No battery detected on this system"}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // Handle failure status
  if (result.status === "failure") {
    return html`
      <div class="card battery-health">
        ${renderHeader("Battery Health Report", "failure")}
        <div class="battery-content">
          <div class="error-message">
            <p class="badge fail">${s.error || "Unknown error"}</p>
          </div>
        </div>
      </div>
    `;
  }

  const batteryName = formatBatteryName(s);
  const stateVariant = getStateVariant(s.state);
  const healthVariant = getHealthVariant(s.capacity_percent);

  // Build status pills
  const pills = [];

  if (s.health_verdict) {
    const verdictVariant = (() => {
      const lower = (s.health_verdict || "").toLowerCase();
      if (lower === "excellent") return "ok";
      if (lower === "good") return "info";
      if (lower === "fair") return "warn";
      if (lower === "poor" || lower === "critical") return "fail";
      return undefined;
    })();
    pills.push(pill(`Health: ${s.health_verdict}`, verdictVariant));
  }

  if (s.technology) {
    pills.push(pill(s.technology, "info"));
  }

  return html`
    <div class="card battery-health">
      ${renderHeader("Battery Health Report", result.status)}
      <div class="battery-content">
        <div class="battery-header">
          <div class="battery-icon">
            <i
              class="ph ph-battery-${s.percent >= 80
                ? "full"
                : s.percent >= 30
                ? "medium"
                : "low"}"
              style="font-size: 42px;"
            ></i>
          </div>
          <div class="battery-title">
            <h3>${batteryName}</h3>
            ${s.serial_number
              ? html`<div class="muted small">SN: ${s.serial_number}</div>`
              : ""}
          </div>
        </div>

        <div class="kpi-grid">
          ${s.percent != null
            ? kpiBox(
                "Charge Level",
                `${s.percent.toFixed(1)}%`,
                s.percent < 20 ? "fail" : s.percent < 50 ? "warn" : undefined
              )
            : ""}
          ${s.state ? kpiBox("State", s.state, stateVariant) : ""}
          ${s.capacity_percent != null
            ? kpiBox(
                "Capacity",
                `${s.capacity_percent.toFixed(1)}%`,
                healthVariant
              )
            : ""}
          ${s.wear_level_percent != null
            ? kpiBox(
                "Wear Level",
                `${s.wear_level_percent.toFixed(1)}%`,
                s.wear_level_percent > 40
                  ? "fail"
                  : s.wear_level_percent > 20
                  ? "warn"
                  : undefined
              )
            : ""}
          ${s.cycle_count != null
            ? kpiBox("Cycle Count", s.cycle_count.toLocaleString())
            : ""}
          ${s.temperature_c != null
            ? kpiBox(
                "Temperature",
                `${s.temperature_c.toFixed(1)}°C`,
                s.temperature_c > 45
                  ? "fail"
                  : s.temperature_c > 35
                  ? "warn"
                  : undefined
              )
            : ""}
          ${s.voltage_v != null
            ? kpiBox("Voltage", `${s.voltage_v.toFixed(2)}V`)
            : ""}
          ${s.energy_wh != null
            ? kpiBox("Current Energy", `${s.energy_wh.toFixed(2)}Wh`)
            : ""}
          ${s.energy_full_wh != null
            ? kpiBox("Full Capacity", `${s.energy_full_wh.toFixed(2)}Wh`)
            : ""}
          ${s.energy_full_design_wh != null
            ? kpiBox(
                "Design Capacity",
                `${s.energy_full_design_wh.toFixed(2)}Wh`
              )
            : ""}
        </div>

        ${s.time_to_full || s.time_to_empty
          ? html`
              <div class="battery-time-estimates">
                ${s.state === "Charging" && s.time_to_full
                  ? html`
                      <div class="time-estimate">
                        <i class="ph ph-lightning"></i>
                        <span>Full in ${s.time_to_full}</span>
                      </div>
                    `
                  : ""}
                ${s.state === "Discharging" && s.time_to_empty
                  ? html`
                      <div class="time-estimate">
                        <i class="ph ph-clock"></i>
                        <span>Empty in ${s.time_to_empty}</span>
                      </div>
                    `
                  : ""}
              </div>
            `
          : ""}
        ${pills.length > 0 ? html`<div class="pill-row">${pills}</div>` : ""}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-facing metrics from battery health result.
 * Shows battery health status with capacity and cycle count details.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Metric card or null if no data
 */
export function extractCustomerMetrics({ result }) {
  const { status, summary } = result;

  // Skip if no battery or failed
  if (status === "skipped" || status === "failure") return null;
  if (status !== "success") return null;

  const s = summary || {};

  if (s.capacity_percent == null) return null;

  const items = [];

  if (s.capacity_percent != null) {
    items.push(`Capacity: ${s.capacity_percent.toFixed(1)}%`);
  }

  if (s.wear_level_percent != null) {
    items.push(`Wear: ${s.wear_level_percent.toFixed(1)}%`);
  }

  if (s.cycle_count != null) {
    items.push(`Cycles: ${s.cycle_count.toLocaleString()}`);
  }

  if (s.percent != null) {
    items.push(`Current Charge: ${s.percent.toFixed(0)}%`);
  }

  if (s.temperature_c != null) {
    items.push(`Temperature: ${s.temperature_c.toFixed(1)}°C`);
  }

  // Determine variant based on capacity
  let variant = "info";
  if (s.capacity_percent < 60) {
    variant = "warning";
  } else if (s.capacity_percent >= 80) {
    variant = "success";
  }

  const batteryName = formatBatteryName(s);

  return buildMetric({
    icon: "🔋",
    label: "Battery Health",
    value: s.health_verdict || `${s.capacity_percent.toFixed(0)}%`,
    detail: `${batteryName} - ${s.capacity_percent.toFixed(
      0
    )}% capacity remaining`,
    variant,
    items: items.length > 0 ? items : undefined,
  });
}

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* Battery Health Report print styles */
  .battery-health .battery-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .battery-health .battery-icon {
    color: #22c55e;
  }
  
  .battery-health .battery-title h3 {
    margin: 0;
    font-size: 14pt;
    font-weight: 600;
  }
  
  .battery-health .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0;
  }
  
  .battery-health .battery-time-estimates {
    display: flex;
    gap: 16px;
    margin: 12px 0;
    padding: 8px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
  }
  
  .battery-health .time-estimate {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10pt;
  }
  
  .battery-health .time-estimate i {
    font-size: 14pt;
    color: #3b82f6;
  }
  
  .battery-health .no-battery-message {
    text-align: center;
    padding: 20px;
  }
  
  .battery-health .error-message {
    padding: 10px;
  }
`;
