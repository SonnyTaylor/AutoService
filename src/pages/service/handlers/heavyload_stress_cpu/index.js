/**
 * HeavyLoad CPU Stress Handler
 * ---------------------------------------------------------------------------
 * Stress tests CPU using HeavyLoad.exe to validate system stability under load.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with stress test results
 * - Customer metrics extractor showing performance test completion
 */

import { html } from "lit-html";
import { renderHeader, kpiBox } from "../common/ui.js";
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
  id: "heavyload_stress_cpu",
  label: "CPU Stress (HeavyLoad)",
  group: "Stress",
  category: "Stress",
  defaultParams: { minutes: 1 },
  toolKeys: ["heavyload"],
  async build({ params, resolveToolPath }) {
    const p = await resolveToolPath(["heavyload"]);
    return {
      type: "heavyload_stress_test",
      executable_path: p,
      duration_minutes: params?.minutes || 1,
      headless: false,
      stress_cpu: true,
      stress_memory: false,
      stress_gpu: false,
      ui_label: "CPU Stress (HeavyLoad)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for HeavyLoad CPU stress test.
 * Displays stress test duration, exit code, and output.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const modes = [
    s.stress_cpu ? "CPU" : "",
    s.stress_memory ? "RAM" : "",
    s.stress_gpu ? "GPU" : "",
    s.stress_disk ? "Disk" : "",
  ].filter(Boolean);
  const label = modes.length
    ? `${modes.join(" + ")} Stress (HeavyLoad)`
    : "HeavyLoad Stress";

  const exitCode = s.exit_code;
  const durationMinutes = s.duration_minutes;
  const durationStr = (() => {
    if (durationMinutes == null) return "-";
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes)) return String(durationMinutes);
    if (minutes < 1) {
      return `${Math.round(minutes * 60)} sec`;
    }
    const whole = Math.floor(minutes);
    const remainder = minutes - whole;
    const seconds = Math.round(remainder * 60);
    return seconds > 0 ? `${whole}m ${seconds}s` : `${whole} min`;
  })();

  const verdictInfo = (() => {
    if (result.status === "fail") {
      return { label: "Failed", variant: "fail" };
    }
    if (exitCode == null) {
      return { label: "Completed", variant: "ok" };
    }
    if (exitCode === 0) {
      return { label: "Completed", variant: "ok" };
    }
    if (exitCode > 0) {
      return { label: `Exited (${exitCode})`, variant: "warn" };
    }
    return { label: "Unknown", variant: "info" };
  })();

  return html`
    <div class="card heavyload">
      ${renderHeader(label, result.status)}
      <div class="kpi-row">
        ${kpiBox("Verdict", verdictInfo.label, verdictInfo.variant)}
        ${kpiBox("Duration", durationStr)}
        ${kpiBox("Exit Code", exitCode != null ? String(exitCode) : "-")}
      </div>
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>View HeavyLoad output</summary>
              ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
              ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
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
 * Extract customer-friendly stress test metrics.
 * Shows that CPU stress test was performed.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const modes = [];
  if (summary?.stress_cpu) modes.push("CPU");
  if (summary?.stress_memory) modes.push("RAM");
  if (summary?.stress_gpu) modes.push("GPU");
  if (summary?.stress_disk) modes.push("Disk");

  const components = modes.length > 0 ? modes.join(" + ") : "System";
  const duration = summary?.duration_minutes;
  const result = summary?.exit_code === 0 ? "Passed" : "Completed";

  return buildMetric({
    icon: "⚡",
    label: "Stress Test",
    value: result,
    detail: `${components} tested${duration ? ` for ${duration} min` : ""}`,
    variant: "info",
  });
}
