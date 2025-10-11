/**
 * Speedtest Handler
 * ---------------------------------------------------------------------------
 * Tests internet connection speed by measuring download/upload bandwidth
 * and latency using Speedtest.net via speedtest-cli.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with speed visualization
 * - Customer metrics extractor showing internet performance
 */

import { html } from "lit-html";
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
  id: "speedtest",
  label: "Internet Speed Test",
  group: "Network",
  category: "Network",
  defaultParams: {},
  toolKeys: [],
  async build({ params }) {
    // Optional parameters supported by the runner; UI currently keeps defaults
    const threads = Number.isFinite(params?.threads)
      ? Math.max(1, parseInt(params.threads, 10))
      : null;
    const share = !!params?.share;
    const secure = params?.secure === false ? false : true;
    const task = {
      type: "speedtest",
      ...(threads ? { threads } : {}),
      ...(share ? { share: true } : {}),
      secure,
      ui_label: "Internet Speed Test",
    };
    return task;
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Format Mbps value for display.
 * @private
 */
const fmtMbps = (val) => {
  if (val == null) return "-";
  const num = Number(val);
  return Number.isFinite(num) ? `${num.toFixed(1)} Mbps` : "-";
};

/**
 * Format milliseconds value for display.
 * @private
 */
const fmtMs = (val) => {
  if (val == null) return "-";
  const num = Number(val);
  return Number.isFinite(num) ? `${num.toFixed(1)} ms` : "-";
};

/**
 * Render technician view for speedtest.
 * Displays download/upload speeds, latency, and chart visualization.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const h = result.summary?.human_readable || {};
  const chartId = `speedtest-chart-${index}`;

  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const download = toNumber(h.download_mbps);
  const upload = toNumber(h.upload_mbps);

  const speeds = [
    { label: "Download", value: download, color: "#4f8cff" },
    { label: "Upload", value: upload, color: "#8bd17c" },
  ].filter((s) => s.value != null && s.value >= 0);

  // Render chart after DOM update
  setTimeout(() => {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || speeds.length === 0) return;
    if (chartEl.dataset.rendered === "true") return;
    chartEl.dataset.rendered = "true";

    const seriesData = speeds.map((s) => Number(s.value.toFixed(2)));
    const categories = speeds.map((s) => s.label);
    const colors = speeds.map((s) => s.color);

    const options = {
      chart: {
        type: "bar",
        height: 220,
        width: "100%",
        toolbar: { show: false },
        animations: { enabled: false },
      },
      series: [
        {
          name: "Speed",
          data: seriesData,
        },
      ],
      plotOptions: {
        bar: {
          columnWidth: "50%",
          borderRadius: 10,
          distributed: true,
          dataLabels: { position: "top" },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: {
          colors: ["#ffffff"],
          fontSize: "12px",
          fontFamily: "Inter, sans-serif",
        },
        formatter: (val) => `${Number(val ?? 0).toFixed(1)} Mbps`,
      },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
        },
      },
      yaxis: {
        min: 0,
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
          formatter: (val) => `${Number(val ?? 0).toFixed(0)} Mbps`,
        },
      },
      grid: { borderColor: "#2a3140" },
      legend: { show: false },
      tooltip: {
        theme: "dark",
        y: {
          formatter: (val) => `${Number(val ?? 0).toFixed(2)} Mbps`,
        },
      },
      colors,
      responsive: [
        {
          breakpoint: 1000,
          options: {
            chart: {
              height: 200,
            },
          },
        },
      ],
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
  }, 0);

  // Verdict processing
  const verdictRaw = typeof h.verdict === "string" ? h.verdict : "";
  const verdictLabel = verdictRaw
    ? verdictRaw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : "-";
  const verdictVariant = (() => {
    const lower = verdictRaw.toLowerCase();
    if (!lower) return undefined;
    if (lower.includes("excellent")) return "ok";
    if (lower.includes("good")) return "info";
    if (lower.includes("fair")) return "warn";
    if (lower.includes("poor") || lower.includes("bad")) return "fail";
    return undefined;
  })();

  // Metadata rows
  const metaRows = [
    h.isp ? { label: "ISP", value: h.isp } : null,
    h.server_description
      ? { label: "Server", value: h.server_description }
      : null,
    result.summary?.results?.timestamp
      ? {
          label: "Timestamp",
          value: new Date(result.summary.results.timestamp).toLocaleString(),
        }
      : null,
  ].filter(Boolean);

  // Notes processing
  const notes = Array.isArray(h.notes) ? h.notes : [];
  const notePills = notes
    .map((note) => {
      if (note == null) return null;
      const text = String(note);
      const lower = text.toLowerCase();
      let variant = "info";
      if (lower.includes("excellent") || lower.includes("great")) {
        variant = "ok";
      } else if (
        lower.includes("unstable") ||
        lower.includes("issue") ||
        lower.includes("poor")
      ) {
        variant = "fail";
      } else if (lower.includes("moderate") || lower.includes("average")) {
        variant = "warn";
      }
      return pill(text, variant);
    })
    .filter(Boolean);

  return html`
    <div class="card speedtest">
      ${renderHeader("Internet Speed Test", result.status)}
      <div class="speedtest-layout">
        <div class="speedtest-kpis">
          <div class="speedtest-kpi-grid">
            ${kpiBox("Download", fmtMbps(h.download_mbps))}
            ${kpiBox("Upload", fmtMbps(h.upload_mbps))}
            ${kpiBox("Ping", fmtMs(h.ping_ms))}
            ${kpiBox("Verdict", verdictLabel, verdictVariant)}
          </div>
          ${metaRows.length
            ? html`
                <div class="speedtest-meta muted small">
                  ${metaRows.map(
                    (row) => html`
                      <div class="speedtest-meta-row">
                        <span class="lab">${row.label}</span>
                        <span class="val">${row.value}</span>
                      </div>
                    `
                  )}
                </div>
              `
            : ""}
        </div>
        <div class="speedtest-chart">
          ${speeds.length
            ? html`<div id=${chartId}></div>`
            : html`<div class="muted small">
                No download/upload data available for chart.
              </div>`}
        </div>
      </div>
      ${notePills.length ? html`<div class="pill-row">${notePills}</div>` : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-facing metrics from speedtest result.
 * Shows internet speed performance with download/upload details.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Metric card or null if no data
 */
export function extractCustomerMetrics({ result }) {
  if (result.status !== "success") return null;

  const hr = result.summary?.human_readable || {};
  const download = hr.download_mbps;
  const upload = hr.upload_mbps;
  const ping = hr.ping_ms;
  const verdict = hr.verdict;

  if (download == null) return null;

  const items = [
    `Download: ${download?.toFixed(1) || "?"} Mbps`,
    `Upload: ${upload?.toFixed(1) || "?"} Mbps`,
    `Ping: ${ping?.toFixed(0) || "?"} ms`,
  ];

  if (verdict) {
    items.push(`Quality: ${verdict}`);
  }

  return buildMetric({
    icon: "🌐",
    label: "Internet Speed",
    value: `${download.toFixed(1)} Mbps`,
    detail: "Download speed",
    variant: "info",
    items,
    keepAllItems: true,
  });
}
