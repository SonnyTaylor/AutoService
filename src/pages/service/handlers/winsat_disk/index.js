/**
 * WinSAT Disk Benchmark Handler
 * ---------------------------------------------------------------------------
 * Benchmarks disk performance using Windows System Assessment Tool (WinSAT).
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with throughput charts
 * - Customer metrics extractor showing disk performance
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

export const definition = {
  id: "winsat_disk",
  label: "Disk Benchmark (WinSAT)",
  group: "Diagnostics",
  category: "Diagnostics",
  defaultParams: { drive: "C:", test_mode: "full" },
  toolKeys: [],
  isDiagnostic: true,
  async build({ params }) {
    const drive = (params?.drive || "C:").toString().toUpperCase();
    const test_mode = params?.test_mode || "full";
    const modeLabel =
      {
        full: "Full",
        random_read: "Random Read",
        sequential_read: "Sequential Read",
        sequential_write: "Sequential Write",
        flush: "Flush",
      }[test_mode] || "Full";
    return {
      type: "winsat_disk",
      drive,
      test_mode,
      ui_label: `Disk Benchmark (WinSAT) - ${drive} (${modeLabel})`,
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

export function renderTech({ result, index }) {
  const s = result.summary || {};
  const r = s.results || {};
  const hr = s.human_readable || {};
  const chartId = `winsat-chart-${index}`;

  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const metrics = [
    {
      label: "Random Read",
      value: toNumber(r.random_read_mbps),
      color: "#4f8cff",
    },
    {
      label: "Sequential Read",
      value: toNumber(r.sequential_read_mbps),
      color: "#8bd17c",
    },
    {
      label: "Sequential Write",
      value: toNumber(r.sequential_write_mbps),
      color: "#f4a261",
    },
  ].filter((m) => m.value != null && m.value >= 0);

  setTimeout(() => {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || metrics.length === 0) return;
    if (chartEl.dataset.rendered === "true") return;
    chartEl.dataset.rendered = "true";

    const seriesData = metrics.map((m) => Number(m.value.toFixed(2)));
    const categories = metrics.map((m) => m.label);
    const colors = metrics.map((m) => m.color);

    const options = {
      chart: {
        type: "bar",
        height: 240,
        width: "100%",
        toolbar: { show: false },
        animations: { enabled: false },
      },
      series: [{ name: "Throughput", data: seriesData }],
      plotOptions: {
        bar: {
          columnWidth: "60%",
          borderRadius: 8,
          distributed: true,
          dataLabels: { position: "top" },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -20,
        style: {
          colors: ["#ffffff"],
          fontSize: "12px",
          fontFamily: "Inter, sans-serif",
          fontWeight: "600",
        },
        formatter: (val) => `${Number(val ?? 0).toFixed(1)} MB/s`,
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
          formatter: (val) => `${Number(val ?? 0).toFixed(0)} MB/s`,
        },
      },
      grid: { borderColor: "#2a3140" },
      tooltip: {
        theme: "dark",
        y: { formatter: (val) => `${Number(val ?? 0).toFixed(2)} MB/s` },
      },
      colors,
      legend: { show: false },
      responsive: [{ breakpoint: 1000, options: { chart: { height: 220 } } }],
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
  }, 0);

  const verdictRaw = typeof hr.verdict === "string" ? hr.verdict : "";
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

  const testModeLabel =
    {
      full: "Full Benchmark",
      random_read: "Random Read Only",
      sequential_read: "Sequential Read Only",
      sequential_write: "Sequential Write Only",
      flush: "Flush Test",
    }[s.test_mode] || s.test_mode;

  const formatMBps = (val) => {
    if (val == null) return "-";
    const num = Number(val);
    return Number.isFinite(num) ? `${num.toFixed(1)} MB/s` : "-";
  };

  const getSpeedVariant = (mbps, type = "sequential") => {
    if (mbps == null) return undefined;
    const speed = Number(mbps);
    if (!Number.isFinite(speed)) return undefined;
    if (type === "sequential") {
      if (speed >= 3000) return "ok";
      if (speed >= 500) return "info";
      if (speed >= 250) return "warn";
      return "fail";
    } else {
      if (speed >= 500) return "ok";
      if (speed >= 100) return "info";
      if (speed >= 50) return "warn";
      return "fail";
    }
  };

  const notes = Array.isArray(hr.notes) ? hr.notes : [];
  const notePills = notes
    .map((note) => {
      if (note == null) return null;
      const text = String(note);
      const lower = text.toLowerCase();
      let variant = "info";
      if (lower.includes("excellent") || lower.includes("great"))
        variant = "ok";
      else if (
        lower.includes("slow") ||
        lower.includes("poor") ||
        lower.includes("high latency")
      )
        variant = "fail";
      else if (lower.includes("hdd")) variant = "warn";
      return pill(text, variant);
    })
    .filter(Boolean);

  return html`
    <div class="card winsat">
      ${renderHeader(
        `Disk Benchmark (WinSAT) - ${s.drive || ""}`,
        result.status
      )}
      <div class="winsat-layout">
        <div class="winsat-kpis">
          <div class="winsat-meta muted small">
            <div class="winsat-meta-row">
              <span class="lab">Test Mode</span>
              <span class="val">${testModeLabel}</span>
            </div>
            <div class="winsat-meta-row">
              <span class="lab">Duration</span>
              <span class="val"
                >${s.duration_seconds != null
                  ? `${s.duration_seconds}s`
                  : "-"}</span
              >
            </div>
          </div>
          <div class="winsat-kpi-grid">
            ${kpiBox(
              "Overall Score",
              hr.score != null ? `${hr.score}/100` : "-",
              verdictVariant
            )}
            ${kpiBox("Verdict", verdictLabel, verdictVariant)}
            ${r.random_read_mbps != null
              ? kpiBox(
                  "Random Read",
                  formatMBps(r.random_read_mbps),
                  getSpeedVariant(r.random_read_mbps, "random")
                )
              : ""}
            ${r.sequential_read_mbps != null
              ? kpiBox(
                  "Sequential Read",
                  formatMBps(r.sequential_read_mbps),
                  getSpeedVariant(r.sequential_read_mbps, "sequential")
                )
              : ""}
            ${r.sequential_write_mbps != null
              ? kpiBox(
                  "Sequential Write",
                  formatMBps(r.sequential_write_mbps),
                  getSpeedVariant(r.sequential_write_mbps, "sequential")
                )
              : ""}
          </div>
        </div>
        <div class="winsat-chart">
          ${metrics.length
            ? html`<div id=${chartId}></div>`
            : html`<div class="muted small">
                No throughput data available for chart.
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

export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const hr = summary?.human_readable || {};
  const drive = summary?.drive;
  const score = hr.score;
  const verdict = hr.verdict;

  return buildMetric({
    icon: "⚡",
    label: "Disk Benchmark",
    value: score != null ? `${score}/100` : verdict || "Tested",
    detail: `Drive ${drive || ""} performance`,
    variant: "info",
  });
}

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* WinSAT print layout */
  .winsat-kpis { 
    display: grid; 
    grid-template-columns: 1fr;
    gap: 10px; 
    margin-bottom: 10px;
  }
  .winsat-meta { 
    background: #fafbfc; 
    border: 1px solid #e5e7eb; 
    border-radius: 6px; 
    padding: 8px 10px;
  }
  .winsat-meta-row { 
    display: flex; 
    justify-content: space-between; 
    margin: 3px 0; 
    font-size: 9.5pt; 
    gap: 8px;
  }
  .winsat-meta-row .lab { 
    text-transform: uppercase; 
    letter-spacing: 0.5px; 
    color: #64748b; 
    font-weight: 500; 
    flex-shrink: 0;
  }
  .winsat-kpi-grid { 
    display: grid; 
    grid-template-columns: repeat(2, 1fr); 
    gap: 8px; 
    max-width: 100%;
  }
  .winsat-latency, .winsat-scores {
    background: #fafbfc; 
    border: 1px solid #e5e7eb; 
    border-radius: 6px; 
    padding: 10px;
  }
  .winsat-latency .section-title, .winsat-scores .section-title {
    font-size: 10pt; 
    text-transform: uppercase; 
    letter-spacing: 0.5px; 
    color: #64748b; 
    margin-bottom: 8px; 
    font-weight: 600;
  }
  .winsat-latency .kpi-row, .winsat-scores .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  
  /* Hide chart in print */
  .winsat-chart,
  [id^="winsat-chart-"] {
    display: none !important;
  }
  
  .winsat-layout { 
    display: block; 
  }
`;

// =============================================================================
// PARAMETER CONTROLS RENDERER (for builder UI)
// =============================================================================

/**
 * Render custom parameter controls for WinSAT disk benchmark configuration.
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
  wrapper.style.columnGap = "12px";
  wrapper.style.rowGap = "6px";

  const driveVal = (params?.drive ?? "C:").toString().toUpperCase();
  const testModeVal = params?.test_mode ?? "full";

  wrapper.innerHTML = `
    <label class="tiny-lab" style="margin-right:12px;" title="Drive to benchmark">
      <span class="lab">Drive</span>
      <input type="text" class="text-input" data-param="drive" value="${driveVal}" size="4" aria-label="Drive letter (e.g., C:)" placeholder="C:" />
    </label>
    <label class="tiny-lab" style="margin-right:12px;" title="Select test mode to run">
      <span class="lab">Test Mode</span>
      <select data-param="test_mode" aria-label="WinSAT test mode">
        <option value="full" ${
          testModeVal === "full" ? "selected" : ""
        }>Full Benchmark</option>
        <option value="random_read" ${
          testModeVal === "random_read" ? "selected" : ""
        }>Random Read Only</option>
        <option value="sequential_read" ${
          testModeVal === "sequential_read" ? "selected" : ""
        }>Sequential Read Only</option>
        <option value="sequential_write" ${
          testModeVal === "sequential_write" ? "selected" : ""
        }>Sequential Write Only</option>
        <option value="flush" ${
          testModeVal === "flush" ? "selected" : ""
        }>Flush Test</option>
      </select>
    </label>
  `;

  // Stop event propagation to prevent drag-and-drop interference
  wrapper.querySelectorAll("input, select").forEach((el) => {
    ["mousedown", "pointerdown", "click"].forEach((evt) => {
      el.addEventListener(evt, (e) => e.stopPropagation());
    });
  });

  const driveInput = wrapper.querySelector('input[data-param="drive"]');
  const testModeSelect = wrapper.querySelector(
    'select[data-param="test_mode"]'
  );

  driveInput?.addEventListener("change", () => {
    const val = (driveInput.value || "C:").trim().toUpperCase();
    // Normalize to just letter or letter with colon
    const normalized = val.length === 1 ? val + ":" : val.substring(0, 2);
    driveInput.value = normalized;
    updateParam("drive", normalized);
  });

  testModeSelect?.addEventListener("change", () => {
    updateParam("test_mode", testModeSelect.value);
  });

  return wrapper;
}
