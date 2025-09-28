import printJS from "print-js";
import { html, render } from "lit-html";
import { map } from "lit-html/directives/map.js";

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
    ${map(report.results, (res) => {
      const type = res?.task_type || res?.type || "unknown";
      const renderer = RENDERERS[type] || renderGeneric;
      let content;
      try {
        content = renderer(res);
      } catch (e) {
        console.error("Failed to render result section:", res, e);
        content = renderGeneric(res);
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
function renderGeneric(res) {
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
function renderSpeedtest(res) {
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
function renderBatteryHealth(res) {
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

/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderSfc(res) {
  return renderGeneric(res);
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderDism(res) {
  return renderGeneric(res);
}
/**
 * Renders the result for a drive health (smartctl) check.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderSmartctl(res) {
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
function renderKvrt(res) {
  return renderGeneric(res);
}
/**
 * Renders the result for an AdwCleaner scan.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderAdwCleaner(res) {
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
function renderPing(res) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  return html`
    <div class="card ping">
      ${renderHeader("Ping Test", res.status)}
      <div class="kpi-row">
        ${kpiBox("Average", fmtMs(s.average_latency_ms))}
        ${kpiBox("Min", fmtMs(s.latency_ms?.min))}
        ${kpiBox("Max", fmtMs(s.latency_ms?.max))}
        ${kpiBox(
          "Loss",
          s.packet_loss_percent != null ? `${s.packet_loss_percent}%` : "-"
        )}
        ${kpiBox("Verdict", hr.verdict || "-")}
      </div>
      ${Array.isArray(hr.notes) && hr.notes.length
        ? html`<div class="pill-row">${map(hr.notes, (n) => pill(n))}</div>`
        : ""}
    </div>
  `;
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderChkdsk(res) {
  return renderGeneric(res);
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderBleachBit(res) {
  return renderGeneric(res);
}
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderFurmark(res) {
  return renderGeneric(res);
}
/**
 * Renders the result for a HeavyLoad stress test.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderHeavyload(res) {
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
/** @param {object} res @returns {import("lit-html").TemplateResult} */
function renderIperf(res) {
  return renderGeneric(res);
}
/**
 * Renders the result for a Windows 11 compatibility check.
 * @param {object} res The result object for the task.
 * @returns {import("lit-html").TemplateResult}
 */
function renderWhyNotWin11(res) {
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
function renderWindowsUpdate(res) {
  return renderGeneric(res);
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
