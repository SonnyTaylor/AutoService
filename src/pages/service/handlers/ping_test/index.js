/**
 * Ping Test Handler
 * ---------------------------------------------------------------------------
 * Tests network connectivity and latency to a specified host by sending
 * ICMP ping packets and measuring response times.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with latency visualization
 * - Customer metrics extractor showing network connectivity
 */

import { html } from "lit-html";
import ApexCharts from "apexcharts";
import { renderHeader, kpiBox } from "../common/ui.js";
import { buildMetric, getStatusVariant } from "../common/metrics.js";

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
  id: "ping_test",
  label: "Ping Test",
  group: "Network",
  category: "Network",
  defaultParams: { host: "", count: 4 },
  toolKeys: [],
  async build({ params }) {
    // Load default ping host from app settings if not provided
    let host = (params?.host || "").toString();
    if (!host) {
      try {
        const { core } = window.__TAURI__ || {};
        const inv = core?.invoke;
        const settings = inv ? await inv("load_app_settings") : {};
        host = settings?.network?.ping_host || "google.com";
      } catch {}
    }
    const count = parseInt(params?.count ?? 4, 10) || 4;
    return {
      type: "ping_test",
      host,
      count,
      ui_label: `Ping Test (${host}, ${count}x)`,
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Format milliseconds to display string.
 * @private
 */
const fmtMs = (val) => {
  if (val == null) return "-";
  const num = Number(val);
  return Number.isFinite(num) ? `${num.toFixed(1)} ms` : "-";
};

/**
 * Render technician view for ping test.
 * Displays latency metrics and visualization with color-coded zones.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const hr = s.human_readable || {};
  const lat = s.latency_ms || {};
  const stats = s.interval_stats || {};
  const loss = s.packets?.loss_percent;

  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const stabilityScore = toNumber(hr.stability_score);
  const stabilityVariant = (() => {
    if (stabilityScore == null) return undefined;
    if (stabilityScore >= 85) return "ok";
    if (stabilityScore >= 70) return "info";
    if (stabilityScore >= 50) return "warn";
    return "fail";
  })();

  const stabilityDisplay = (() => {
    if (stabilityScore == null) return "-";
    const score =
      Number.isInteger(stabilityScore) || Math.abs(stabilityScore % 1) < 0.05
        ? stabilityScore.toFixed(0)
        : stabilityScore.toFixed(1);
    return `${score}/100`;
  })();

  // Render chart after DOM update
  setTimeout(() => {
    const chartEl = document.getElementById(`ping-chart-${index}`);
    if (chartEl && lat.avg != null) {
      if (chartEl.dataset.rendered === "true") return;
      chartEl.dataset.rendered = "true";

      const getPingColor = (ping) => {
        if (ping == null) return "#4f8cff";
        if (ping < 30) return "#2f6b4a";
        if (ping < 60) return "#4f8cff";
        if (ping < 100) return "#6b422b";
        return "#7a3333";
      };

      const options = {
        chart: {
          type: "bar",
          height: 180,
          width: "100%",
          toolbar: { show: false },
          animations: { enabled: false },
        },
        series: [{ name: "Average", data: [lat.avg.toFixed(1)] }],
        plotOptions: {
          bar: { horizontal: true, barHeight: "35%", distributed: false },
        },
        colors: [getPingColor(lat.avg)],
        xaxis: {
          categories: [""],
          max: Math.max(120, Math.ceil((lat.max || 0) / 20) * 20),
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val} ms`,
          },
        },
        yaxis: { labels: { show: false } },
        grid: { borderColor: "#2a3140", padding: { left: 20, right: 20 } },
        tooltip: {
          theme: "dark",
          y: { title: { formatter: () => "Average Ping" } },
        },
        annotations: {
          xaxis: [
            {
              x: 0,
              x2: 30,
              fillColor: "#2f6b4a",
              opacity: 0.1,
              label: {
                text: "Excellent",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 30,
              x2: 60,
              fillColor: "#4f8cff",
              opacity: 0.1,
              label: {
                text: "Good",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 60,
              x2: 100,
              fillColor: "#6b422b",
              opacity: 0.1,
              label: {
                text: "Fair",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 100,
              x2: 999,
              fillColor: "#7a3333",
              opacity: 0.1,
              label: {
                text: "Poor",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
          ],
        },
      };

      const chart = new ApexCharts(chartEl, options);
      chart.render();
    }
  }, 0);

  return html`
    <div class="card ping">
      ${renderHeader(`Ping Test: ${s.host || ""}`, result.status)}
      <div class="ping-layout">
        <div class="ping-kpis">
          ${kpiBox("Average Latency", fmtMs(lat.avg))}
          ${kpiBox("Packet Loss", loss != null ? `${loss}%` : "-")}
          ${kpiBox("Stability", stabilityDisplay, stabilityVariant)}
          ${kpiBox(
            "Jitter (StDev)",
            stats.stdev != null ? fmtMs(stats.stdev) : "-"
          )}
        </div>
        <div class="ping-chart">
          ${lat.avg != null
            ? html`
                <div class="ping-chart-shell">
                  <div id="ping-chart-${index}"></div>
                </div>
              `
            : html`<div class="muted">No latency data for chart.</div>`}
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly network latency metrics from ping test.
 * Shows average ping time and packet loss percentage.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const lat = summary?.latency_ms;
  const host = summary?.host;
  const loss = summary?.packets?.loss_percent;

  if (!lat || lat.avg == null) return null;

  const avgLatency = Math.round(lat.avg);

  // Determine variant based on latency
  const variant = (() => {
    if (avgLatency < 30) return "success";
    if (avgLatency < 100) return "info";
    return "warning";
  })();

  const items = [];
  if (loss != null) {
    items.push(`Packet loss: ${loss}%`);
  }

  return buildMetric({
    icon: "📡",
    label: "Network Latency",
    value: `${avgLatency} ms`,
    detail: `Ping to ${host || "server"}`,
    variant,
    items: items.length > 0 ? items : undefined,
  });
}
