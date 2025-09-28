import printJS from "print-js";
import { html, render } from "lit-html";
import { map } from "lit-html/directives/map.js";
import prettyBytes from "pretty-bytes";
import ApexCharts from "apexcharts";

/**
 * @file Renders the service results page (#/service-results).
 * This module is responsible for parsing a service report from session/local storage,
 * rendering a summary and detailed sections for each task, and providing a printable
 * version of the report. It uses lit-html for efficient and declarative rendering.
 */

// Modular renderers per task type. Extend incrementally here.
const RENDERERS = {
  speedtest: renderSpeedtest,
  battery_health: renderBatteryHealth,
  sfc_scan: renderSfc,
  dism_health_check: renderDism,
  smartctl_report: renderSmartctl,
  kvrt_scan: renderKvrt,
  adwcleaner_clean: renderAdwCleaner,
  ping_test: renderPing,
  chkdsk_scan: renderChkdsk,
  bleachbit_clean: renderBleachBit,
  furmark_stress_test: renderFurmark,
  heavyload_stress_test: renderHeavyload,
  iperf_test: renderIperf,
  whynotwin11_check: renderWhyNotWin11,
  windows_update: renderWindowsUpdate,
};

/**
 * Initializes the results page, loads the report, and renders all content.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = document.getElementById("svc-results");
  const backBtn = document.getElementById("svc-results-back");
  const printSideBtn = document.getElementById("svc-results-print-side");
  const summaryEl = document.getElementById("svc-results-summary");
  const sectionsEl = document.getElementById("svc-results-sections");
  const printContainer = document.getElementById("svc-print-container");
  const printPreview = document.getElementById("svc-print-preview");

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-report";
  });

  let report = null;
  try {
    const raw =
      sessionStorage.getItem("service.finalReport") ||
      localStorage.getItem("service.finalReport") ||
      "{}";
    report = JSON.parse(raw);
  } catch {
    report = null;
  }

  if (!report || !Array.isArray(report.results)) {
    render(
      html`<div class="muted">No report found. Run a service first.</div>`,
      summaryEl
    );
    container.hidden = false;
    return;
  }

  // Summary header
  const overall = String(report.overall_status || "").toLowerCase();
  const summaryTemplate = html`
    <div class="summary-head ${overall === "success" ? "ok" : "warn"}">
      <div class="left">
        <div class="title">
          Overall:
          ${overall === "success" ? "Success" : "Completed with errors"}
        </div>
        <div class="muted small">${report.results.length} task(s)</div>
      </div>
    </div>
  `;
  render(summaryTemplate, summaryEl);

  // Build sections modularly (fault-tolerant per task)
  const sectionsTemplate = html`
    ${map(report.results, (res, index) => {
      const type = res?.task_type || res?.type || "unknown";
      const renderer = RENDERERS[type] || renderGeneric;
      let content;
      try {
        content = renderer(res, index);
      } catch (e) {
        console.error("Failed to render result section:", res, e);
        content = renderGeneric(res, index);
      }
      return html`<section class="result-section">${content}</section>`;
    })}
  `;
  render(sectionsTemplate, sectionsEl);

  // Prepare printable HTML content
  try {
    const printableHtml = buildPrintableHtml(report, sectionsEl);
    if (printContainer) printContainer.innerHTML = printableHtml;
    if (printPreview) printPreview.innerHTML = printableHtml;
  } catch {}

  const doPrint = () => {
    try {
      printJS({
        type: "html",
        printable: "svc-print-container",
        targetStyles: ["*"],
        scanStyles: true,
        css: [],
      });
    } catch {}
  };

  printSideBtn?.addEventListener("click", doPrint);

  container.hidden = false;
}

// ---------- Renderers ----------

/**
 * Renders a standard header for a result section.
 * @param {string} label The title of the section.
 * @param {string} status The status of the task (e.g., "success", "warn", "fail").
 * @returns {import("lit-html").TemplateResult}
 */
const renderHeader = (label, status) => html`
  <div class="result-header">
    <h3>${label || "Task"}</h3>
    <span class="status ${String(status || "").toLowerCase()}"
      >${status || "unknown"}</span
    >
  </div>
`;

/**
 * Renders a key-value list from an object.
 * @param {Record<string, any>} obj The object to render.
 * @returns {import("lit-html").TemplateResult}
 */
const renderList = (obj) => html`
  <dl class="kv">
    ${map(
      Object.entries(obj || {}),
      ([k, v]) => html`
        <dt>${prettifyKey(k)}</dt>
        <dd>${formatValue(v)}</dd>
      `
    )}
  </dl>
`;

/**
 * Prettifies an object key for display (e.g., "cpu_speed" -> "Cpu Speed").
 * @param {string} k The key to prettify.
 * @returns {string} The formatted key.
 */
function prettifyKey(k) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Formats a value for display, handling null, arrays, and objects.
 * @param {any} v The value to format.
 * @returns {string} The formatted value.
 */
function formatValue(v) {
  if (v == null) return "-";
  if (Array.isArray(v)) {
    if (v.length === 0) return "-";
    if (typeof v[0] === "string" || typeof v[0] === "number")
      return v.join(", ");
    return `${v.length} item(s)`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Generic renderer for tasks that don't have a custom one.
 * Displays the task type as a title and the summary as a key-value list.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderGeneric(res, index) {
  return html`
    <div class="result generic">
      ${renderHeader(res.ui_label || res.task_type, res.status)}
      ${renderList(res.summary || {})}
    </div>
  `;
}

/**
 * Renders the result for an internet speed test.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderSpeedtest(res, index) {
  const h = res.summary?.human_readable || {};
  return html`
    <div class="card speedtest">
      ${renderHeader("Internet Speed Test", res.status)}
      <div class="kpi-row">
        ${kpiBox("Download", fmtMbps(h.download_mbps))}
        ${kpiBox("Upload", fmtMbps(h.upload_mbps))}
        ${kpiBox("Ping", fmtMs(h.ping_ms))}
        ${kpiBox("Jitter", h.jitter_ms == null ? "-" : fmtMs(h.jitter_ms))}
        ${kpiBox("Rating", h.rating_stars != null ? `${h.rating_stars}★` : "-")}
      </div>
    </div>
  `;
}

/**
 * Renders the result for a battery health check.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderBatteryHealth(res, index) {
  const s = res.summary || {};
  const info = {
    Batteries: s.count_batteries,
    "Average SOH %": s.average_soh_percent,
    "Low‑health batteries": s.low_health_batteries,
    Verdict: s.human_readable?.verdict,
  };
  return html`
    <div class="result battery">
      ${renderHeader("Battery Health", res.status)}
      <div class="kpi-row">
        ${kpiBox("Batteries", info.Batteries ?? "-")}
        ${kpiBox(
          "Avg SOH",
          info["Average SOH %"] != null ? `${info["Average SOH %"]}%` : "-"
        )}
        ${kpiBox("Low Health", info["Low‑health batteries"] ?? "-")}
        ${kpiBox("Verdict", (info.Verdict || "").toString())}
      </div>
    </div>
  `;
}

/**
 * Renders the result for a System File Checker (SFC) scan.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderSfc(res, index) {
  const s = res.summary || {};
  const violations = s.integrity_violations;
  const repairs = s.repairs_attempted;
  const success = s.repairs_successful;

  let icon, message;
  if (violations === false) {
    icon = html`<i class="ph-fill ph-check-circle ok"></i>`;
    message = "No integrity violations found.";
  } else if (violations === true) {
    icon = html`<i class="ph-fill ph-warning-circle fail"></i>`;
    message = "System file integrity violations were found.";
  } else {
    icon = html`<i class="ph-fill ph-question"></i>`;
    message = "Scan result could not be determined.";
  }

  return html`
    <div class="card sfc">
      ${renderHeader("System File Checker (SFC)", res.status)}
      <div class="sfc-layout">
        <div class="sfc-icon">${icon}</div>
        <div class="sfc-details">
          <div class="sfc-verdict">${message}</div>
          ${violations
            ? html`
                <div class="sfc-repair muted">
                  ${repairs
                    ? `Repairs were attempted. Result: ${
                        success ? "Success" : "Failed"
                      }`
                    : "Repairs were not attempted."}
                </div>
              `
            : ""}
        </div>
      </div>
    </div>
  `;
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderDism(res, index) {
  const s = res.summary || {};
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const getStep = (action) =>
    steps.find((step) => step.action === action)?.parsed;

  const checkHealth = getStep("checkhealth");
  const scanHealth = getStep("scanhealth");
  const restoreHealth = getStep("restorehealth");

  const isHealthy =
    checkHealth?.health_state === "healthy" &&
    scanHealth?.health_state === "healthy";
  const isRepairable =
    checkHealth?.health_state === "repairable" ||
    scanHealth?.health_state === "repairable";

  let verdict = "Unknown";
  if (isHealthy) {
    verdict = "Healthy";
  } else if (isRepairable) {
    const repaired = restoreHealth?.message
      ?.toLowerCase()
      .includes("operation completed successfully");
    verdict = repaired ? "Repaired" : "Corruption Found";
  } else if (res.status === "fail") {
    verdict = "Scan Failed";
  }

  const fmtHealth = (h) => {
    if (!h) return "N/A";
    if (h.health_state === "healthy") return "Healthy";
    if (h.health_state === "repairable") return "Corrupt";
    return "Unknown";
  };

  const fmtRestore = (h) => {
    if (!h) return "N/A";
    if (h.message?.toLowerCase().includes("operation completed successfully")) {
      return isRepairable ? "Repaired" : "Success";
    }
    if (h.repair_success === false) return "Failed";
    return "Unknown";
  };

  return html`
    <div class="card dism">
      ${renderHeader("Windows Image Health (DISM)", res.status)}
      <div class="kpi-row">
        ${kpiBox("Verdict", verdict)}
        ${kpiBox("CheckHealth", fmtHealth(checkHealth))}
        ${kpiBox("ScanHealth", fmtHealth(scanHealth))}
        ${kpiBox("RestoreHealth", fmtRestore(restoreHealth))}
      </div>
    </div>
  `;
}
/**
 * Renders the result for a drive health (smartctl) check.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderSmartctl(res, index) {
  const s = res.summary || {};
  const drives = Array.isArray(s.drives) ? s.drives : [];
  return html`
    <div class="card smartctl">
      ${renderHeader("Drive Health (smartctl)", res.status)}
      <div class="drive-list">
        ${drives.length > 0
          ? map(
              drives,
              (d) => html`
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
                    ${kpiBox("Temp", d.temperature || "-")}
                    ${kpiBox(
                      "Power On Hrs",
                      d.power_on_hours != null ? String(d.power_on_hours) : "-"
                    )}
                    ${kpiBox(
                      "Power Cycles",
                      d.power_cycles != null ? String(d.power_cycles) : "-"
                    )}
                    ${d.wear_level_percent_used != null
                      ? kpiBox(
                          "Drive Health",
                          `${100 - d.wear_level_percent_used}%`
                        )
                      : ""}
                    ${d.data_written_human
                      ? kpiBox("Data Written", d.data_written_human)
                      : ""}
                    ${d.data_read_human
                      ? kpiBox("Data Read", d.data_read_human)
                      : ""}
                    ${d.media_errors != null
                      ? kpiBox("Media Errors", String(d.media_errors))
                      : ""}
                    ${d.unsafe_shutdowns != null
                      ? kpiBox("Unsafe Shutdowns", String(d.unsafe_shutdowns))
                      : ""}
                    ${d.error_log_entries != null
                      ? kpiBox("Error Log", String(d.error_log_entries))
                      : ""}
                  </div>
                </div>
              `
            )
          : html`<div class="muted">No drive data</div>`}
      </div>
    </div>
  `;
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderKvrt(res, index) {
  return renderGeneric(res, index);
}
/**
 * Renders the result for an AdwCleaner scan.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderAdwCleaner(res, index) {
  const s = res.summary || {};
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
      ${renderHeader("AdwCleaner Cleanup", res.status)}
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
/**
 * Renders the result for a ping test.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderPing(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const lat = s.latency_ms || {};
  const stats = s.interval_stats || {};
  const loss = s.packets?.loss_percent;

  setTimeout(() => {
    const chartEl = document.getElementById(`ping-chart-${index}`);
    if (chartEl && lat.avg != null) {
      const getPingColor = (ping) => {
        if (ping == null) return "#4f8cff";
        if (ping < 30) return "#2f6b4a";
        if (ping < 60) return "#4f8cff";
        if (ping < 100) return "#6b422b";
        return "#7a3333";
      };

      const options = {
        chart: { type: "bar", height: 120, toolbar: { show: false } },
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
      ${renderHeader(`Ping Test: ${s.host || ""}`, res.status)}
      <div class="ping-layout">
        <div class="ping-kpis">
          ${kpiBox("Average Latency", fmtMs(lat.avg))}
          ${kpiBox("Packet Loss", loss != null ? `${loss}%` : "-")}
          ${kpiBox("Stability", `${hr.stability_score || "?"}/100`)}
          ${kpiBox(
            "Jitter (StDev)",
            stats.stdev != null ? fmtMs(stats.stdev) : "-"
          )}
        </div>
        <div class="ping-chart">
          ${lat.avg != null
            ? html`<div id="ping-chart-${index}"></div>`
            : html`<div class="muted">No latency data for chart.</div>`}
        </div>
      </div>
    </div>
  `;
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderChkdsk(res, index) {
  return renderGeneric(res, index);
}
/**
 * Renders the result for a BleachBit disk cleanup.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderBleachBit(res, index) {
  const s = res.summary || {};
  const recovered = s.space_recovered_bytes;
  return html`
    <div class="card bleachbit">
      ${renderHeader("Disk Cleanup (BleachBit)", res.status)}
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
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderFurmark(res, index) {
  return renderGeneric(res, index);
}
/**
 * Renders the result for a HeavyLoad stress test.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderHeavyload(res, index) {
  const s = res.summary || {};
  const label = s.stress_cpu
    ? "CPU Stress (HeavyLoad)"
    : s.stress_memory
    ? "RAM Stress (HeavyLoad)"
    : s.stress_gpu
    ? "GPU Stress (HeavyLoad)"
    : "HeavyLoad Stress";
  return html`
    <div class="card heavyload">
      ${renderHeader(label, res.status)}
      <div class="kpi-row">
        ${kpiBox(
          "Duration",
          s.duration_minutes != null ? `${s.duration_minutes} min` : "-"
        )}
        ${kpiBox("Exit Code", s.exit_code != null ? String(s.exit_code) : "-")}
      </div>
    </div>
  `;
}
/**
 * Renders the result for an iPerf network throughput test.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderIperf(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const throughput = hr.throughput || {};
  const throughput_over_time = s.throughput_over_time_mbps || [];

  // Schedule the chart to be rendered after the DOM is updated
  setTimeout(() => {
    const chartEl = document.getElementById(`iperf-chart-${index}`);
    if (chartEl && throughput_over_time.length > 0) {
      const options = {
        chart: {
          type: "area",
          height: 200,
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
      ${renderHeader("Network Throughput (iPerf)", res.status)}
      <div class="kpi-row">
        ${kpiBox(
          "Avg Throughput",
          `${throughput.mean?.toFixed(1) || "?"} Mbps`
        )}
        ${kpiBox(
          "Verdict",
          hr.verdict
            ? hr.verdict.charAt(0).toUpperCase() + hr.verdict.slice(1)
            : "-"
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
            ${map(hr.notes, (n) => pill(n, "warn"))}
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
/**
 * Renders the result for a Windows 11 compatibility check.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderWhyNotWin11(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const failing = Array.isArray(s.failing_checks) ? s.failing_checks.length : 0;
  const passing = Array.isArray(s.passing_checks) ? s.passing_checks.length : 0;
  return html`
    <div class="card wn11">
      ${renderHeader("Windows 11 Compatibility", res.status)}
      <div class="kpi-row">
        ${kpiBox("Hostname", s.hostname || "-")}
        ${kpiBox("Ready", s.ready ? "Yes" : "No")} ${kpiBox("Passing", passing)}
        ${kpiBox("Failing", failing)}
      </div>
      <div class="pill-row">
        ${map(s.failing_checks || [], (c) => pill(c, "fail"))}
        ${map(s.passing_checks || [], (c) => pill(c, "ok"))}
      </div>
    </div>
  `;
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderWindowsUpdate(res, index) {
  return renderGeneric(res, index);
}

// ---------- Printable ----------
/**
 * Constructs the HTML content for the printable version of the report.
 * @param {object} report The full report object.
 * @param {HTMLElement} sectionsEl The element containing the rendered result sections.
 * @returns {string} The complete HTML string for printing.
 */
function buildPrintableHtml(report, sectionsEl) {
  const title = "AutoService – Service Results";
  const overall = String(report.overall_status || "").toLowerCase();
  const head = ``;
  const body = `
    <div class="summary-head ${overall === "success" ? "ok" : "warn"}">
      <div>
        <h2 class="title">Overall: ${
          overall === "success" ? "Success" : "Completed with errors"
        }</h2>
        <div class="muted">${report.results.length} task(s)</div>
      </div>
    </div>
    ${sectionsEl.innerHTML}
  `;
  return `<div>${head}${body}</div>`;
}

// ---------- Helpers ----------
/**
 * Renders a "Key Performance Indicator" box.
 * @param {string} label The label for the KPI.
 * @param {string|number} value The value of the KPI.
 * @returns {import("lit-html").TemplateResult}
 */
const kpiBox = (label, value) => html`
  <div class="kpi">
    <span class="lab">${label}</span>
    <span class="val">${value == null ? "-" : String(value)}</span>
  </div>
`;

/**
 * Renders a styled pill/badge element.
 * @param {string} text The text content of the pill.
 * @param {string} [variant] An optional style variant (e.g., "warn", "fail").
 * @returns {import("lit-html").TemplateResult}
 */
const pill = (text, variant) => html`
  <span class="pill${variant ? " " + variant : ""}">${text}</span>
`;

/**
 * Formats a millisecond value for display.
 * @param {number} ms Milliseconds.
 * @returns {string} Formatted string (e.g., "123 ms").
 */
function fmtMs(ms) {
  if (ms == null || !isFinite(ms)) return "-";
  return `${Math.round(ms)} ms`;
}
/**
 * Formats a Mbps value for display.
 * @param {number} n Megabits per second.
 * @returns {string} Formatted string (e.g., "100.5 Mbps").
 */
function fmtMbps(n) {
  if (n == null || !isFinite(n)) return "-";
  return `${Math.round(n * 10) / 10} Mbps`;
}
