/**
 * iPerf Network Throughput Test Handler
 * ---------------------------------------------------------------------------
 * Tests network throughput and stability using iPerf3 to validate network performance.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with throughput chart
 * - Customer metrics extractor showing network performance
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import ApexCharts from "apexcharts";
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
  id: "iperf_test",
  label: "Network Stability (iPerf3)",
  group: "Network",
  category: "Network",
  defaultParams: { minutes: 10 },
  toolKeys: ["iperf3"],
  async build({ params, resolveToolPath }) {
    const p = await resolveToolPath(["iperf3"]);
    // Load saved iperf server from app settings
    let server = "";
    try {
      const { core } = window.__TAURI__ || {};
      const inv = core?.invoke;
      const settings = inv ? await inv("load_app_settings") : {};
      server = settings?.network?.iperf_server || "";
    } catch {}

    const minutes = params?.minutes || 10;
    return {
      type: "iperf_test",
      executable_path: p,
      server,
      port: 5201,
      duration_minutes: minutes,
      protocol: "tcp",
      reverse: false,
      parallel_streams: 1,
      omit_seconds: 0,
      interval_seconds: 1,
      stability_threshold_mbps: "20Mbps",
      ui_label: `Network Stability (iPerf3)${
        server ? ` – ${server}` : " (server not set)"
      }`,
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for iPerf network throughput test.
 * Displays throughput chart and stability metrics.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const hr = s.human_readable || {};
  const throughput = hr.throughput || {};
  const throughput_over_time = s.throughput_over_time_mbps || [];

  setTimeout(() => {
    const chartEl = document.getElementById(`iperf-chart-${index}`);
    if (chartEl && throughput_over_time.length > 0) {
      if (chartEl.dataset.rendered === "true") return;
      chartEl.dataset.rendered = "true";

      const options = {
        chart: {
          type: "area",
          height: 200,
          width: "100%",
          toolbar: { show: false },
          animations: { enabled: false },
        },
        series: [
          {
            name: "Throughput",
            data: throughput_over_time.map((d) => d?.toFixed(1) ?? 0),
          },
        ],
        colors: ["#4f8cff"],
        xaxis: {
          type: "numeric",
          tickAmount: 10,
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val}s`,
          },
          axisBorder: { show: false },
        },
        yaxis: {
          min: 0,
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val} Mbps`,
          },
        },
        grid: { borderColor: "#2a3140" },
        dataLabels: { enabled: false },
        tooltip: {
          theme: "dark",
          x: { formatter: (val) => `Interval: ${val}s` },
        },
        stroke: { curve: "smooth", width: 2 },
        fill: {
          type: "gradient",
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.4,
            opacityTo: 0.1,
            stops: [0, 90, 100],
          },
        },
        responsive: [
          {
            breakpoint: 1000,
            options: {
              chart: {
                height: 180,
              },
            },
          },
        ],
      };
      const chart = new ApexCharts(chartEl, options);
      chart.render();
    }
  }, 0);

  const durationMin = s.duration_seconds
    ? Math.round(s.duration_seconds / 60)
    : null;

  return html`
    <div class="card iperf">
      ${renderHeader("Network Throughput (iPerf)", result.status)}
      <div class="kpi-row">
        ${(() => {
          const verdictRaw = hr.verdict ? String(hr.verdict) : "";
          const verdict = verdictRaw
            ? verdictRaw.charAt(0).toUpperCase() + verdictRaw.slice(1)
            : "-";
          const lower = verdictRaw.toLowerCase();
          let variant = "";
          if (lower.includes("excellent")) variant = "info";
          else if (lower.includes("good")) variant = "ok";
          else if (lower.includes("fair")) variant = "warn";
          else if (lower.includes("poor")) variant = "fail";
          return html`<div class="kpi verdict${variant ? ` ${variant}` : ""}">
            <span class="lab">Verdict</span>
            <span class="val">${verdict}</span>
          </div>`;
        })()}
        ${kpiBox(
          "Avg Throughput",
          `${throughput.mean?.toFixed(1) || "?"} Mbps`
        )}
        ${kpiBox("Stability", `${hr.stability_score || "?"}/100`)}
        ${kpiBox(
          "Direction",
          hr.direction
            ? hr.direction.charAt(0).toUpperCase() + hr.direction.slice(1)
            : "-"
        )}
        ${kpiBox("Protocol", hr.protocol ? hr.protocol.toUpperCase() : "-")}
        ${kpiBox("Time", durationMin ? `${durationMin} min` : "-")}
      </div>
      ${Array.isArray(hr.notes) && hr.notes.length
        ? html`<div class="pill-row">
            ${map(hr.notes, (n) => {
              const note = String(n || "").toLowerCase();
              let variant = "warn";
              if (
                note.includes("low variability") ||
                note.includes("low variation")
              ) {
                variant = "ok";
              } else if (
                note.includes("high variability") ||
                note.includes("high variation") ||
                note.includes("unstable")
              ) {
                variant = "fail";
              } else if (
                note.includes("medium variability") ||
                note.includes("moderate variability")
              ) {
                variant = "warn";
              }
              return pill(n, variant);
            })}
          </div>`
        : ""}
      <div class="chart-container">
        ${throughput_over_time.length > 0
          ? html`<div id="iperf-chart-${index}"></div>`
          : html`<div class="muted">
              No interval data available for chart.
            </div>`}
      </div>
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly network throughput metrics.
 * Shows throughput and stability information.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const hr = summary?.human_readable || {};
  const throughput = hr.throughput || {};
  const server = summary?.server;
  const protocol = hr.protocol;
  const stabilityScore = hr.stability_score;
  const verdict = hr.verdict;

  const items = [];

  if (throughput.mean != null) {
    const mbps = throughput.mean.toFixed(1);
    items.push(`Throughput: ${mbps} Mbps`);
  }

  if (stabilityScore != null) {
    items.push(`Stability: ${stabilityScore.toFixed(1)}%`);
  }

  if (verdict) {
    items.push(`Quality: ${verdict}`);
  }

  return buildMetric({
    icon: "🔄",
    label: "Network Throughput",
    value:
      throughput.mean != null ? `${throughput.mean.toFixed(1)} Mbps` : "Tested",
    detail: `${protocol?.toUpperCase() || "Network"} to ${server || "server"}`,
    variant: "info",
    items: items.length > 0 ? items : undefined,
  });
}

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* Enhanced Print Display for iPerf */
  .iperf .kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
  
  /* Hide chart in print */
  [id^="iperf-chart-"] {
    display: none !important;
  }
`;
