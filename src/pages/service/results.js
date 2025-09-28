import printJS from "print-js";

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

export async function initPage() {
  const container = document.getElementById("svc-results");
  const backBtn = document.getElementById("svc-results-back");
  const printBtn = document.getElementById("svc-results-print");
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
    summaryEl.innerHTML = `<div class="muted">No report found. Run a service first.</div>`;
    container.hidden = false;
    return;
  }

  // Summary header
  const overall = String(report.overall_status || "").toLowerCase();
  summaryEl.innerHTML = `
    <div class="summary-head ${overall === "success" ? "ok" : "warn"}">
      <div class="left">
        <div class="title">Overall: ${overall === "success" ? "Success" : "Completed with errors"}</div>
        <div class="muted small">${report.results.length} task(s)</div>
      </div>
      <div class="right">
        <button id="svc-results-print-top">Print</button>
      </div>
    </div>
  `;

  // Build sections modularly (fault-tolerant per task)
  sectionsEl.innerHTML = "";
  for (const res of report.results) {
    const type = res?.task_type || res?.type || "unknown";
    const renderer = RENDERERS[type] || renderGeneric;
    const section = document.createElement("section");
    section.className = "result-section";
    try {
      section.appendChild(renderer(res));
    } catch (e) {
      section.appendChild(renderGeneric(res));
    }
    sectionsEl.appendChild(section);
  }

  // Prepare printable HTML content
  try {
    const printableHtml = buildPrintableHtml(report, sectionsEl);
    printContainer.innerHTML = printableHtml;
    if (printPreview) printPreview.innerHTML = printableHtml;
  } catch {}

  const doPrint = () => {
    try {
      printJS({
        type: "html",
        printable: "svc-print-container",
        targetStyles: ["*"],
        scanStyles: false,
        css: [],
      });
    } catch {}
  };

  document.getElementById("svc-results-print-top")?.addEventListener("click", doPrint);
  printBtn?.addEventListener("click", doPrint);
  printSideBtn?.addEventListener("click", doPrint);

  container.hidden = false;
}

// ---------- Renderers ----------
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function renderHeader(label, status) {
  const wrap = el("div", "result-header");
  wrap.appendChild(el("h3", "", label || "Task"));
  const s = el("span", `status ${String(status || "").toLowerCase()}`);
  s.textContent = status || "unknown";
  wrap.appendChild(s);
  return wrap;
}

function renderList(obj) {
  const dl = el("dl", "kv");
  for (const [k, v] of Object.entries(obj || {})) {
    const dt = el("dt", "", prettifyKey(k));
    const dd = el("dd", "", formatValue(v));
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  return dl;
}

function prettifyKey(k) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatValue(v) {
  if (v == null) return "-";
  if (Array.isArray(v)) {
    if (v.length === 0) return "-";
    if (typeof v[0] === "string" || typeof v[0] === "number") return v.join(", ");
    return `${v.length} item(s)`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderGeneric(res) {
  const root = el("div", "result generic");
  root.appendChild(renderHeader(res.ui_label || res.task_type, res.status));
  root.appendChild(renderList(res.summary || {}));
  return root;
}

function renderSpeedtest(res) {
  const root = el("div", "card speedtest");
  root.appendChild(renderHeader("Internet Speed Test", res.status));
  const h = res.summary?.human_readable || {};
  const kpi = document.createElement("div");
  kpi.className = "kpi-row";
  kpi.appendChild(kpiBox("Download", fmtMbps(h.download_mbps)));
  kpi.appendChild(kpiBox("Upload", fmtMbps(h.upload_mbps)));
  kpi.appendChild(kpiBox("Ping", fmtMs(h.ping_ms)));
  kpi.appendChild(kpiBox("Jitter", h.jitter_ms == null ? "-" : fmtMs(h.jitter_ms)));
  kpi.appendChild(kpiBox("Rating", h.rating_stars != null ? `${h.rating_stars}★` : "-"));
  root.appendChild(kpi);
  const notes = Array.isArray(h.notes) ? h.notes : [];
  if (notes.length) {
    const line = el("div", "", "");
    notes.forEach(n => line.appendChild(pill(n)));
    root.appendChild(line);
  }
  const srv = res.summary?.results?.server || {};
  const meta = el("div", "list");
  addKv(meta, "Server", srv.name ? `${srv.name}, ${srv.country}` : h.server_description || "");
  addKv(meta, "ISP", h.isp || res.summary?.results?.client?.isp || "");
  root.appendChild(meta);
  return root;
}

function renderBatteryHealth(res) {
  const root = el("div", "result battery");
  root.appendChild(renderHeader("Battery Health", res.status));
  const s = res.summary || {};
  const info = {
    Batteries: s.count_batteries,
    "Average SOH %": s.average_soh_percent,
    "Low‑health batteries": s.low_health_batteries,
    Verdict: s.human_readable?.verdict,
  };
  // Show as KPI row
  const k = document.createElement("div");
  k.className = "kpi-row";
  k.appendChild(kpiBox("Batteries", info.Batteries ?? "-"));
  k.appendChild(kpiBox("Avg SOH", info["Average SOH %"] != null ? `${info["Average SOH %"]}%` : "-"));
  k.appendChild(kpiBox("Low Health", info["Low‑health batteries"] ?? "-"));
  k.appendChild(kpiBox("Verdict", (info.Verdict || "").toString()));
  root.appendChild(k);
  return root;
}

function renderSfc(res) { return renderGeneric(res); }
function renderDism(res) { return renderGeneric(res); }
function renderSmartctl(res) {
  const root = el("div", "card smartctl");
  root.appendChild(renderHeader("Drive Health (smartctl)", res.status));
  const s = res.summary || {};
  const drives = Array.isArray(s.drives) ? s.drives : [];
  const list = document.createElement("div");
  list.className = "drive-list";
  drives.forEach((d) => {
    const card = el("div", "drive-card");
    const head = el("div", "drive-head");
    head.appendChild(el("div", "drive-model", `${d.model_name || d.name || "Drive"}`));
    const badge = el("span", `badge ${d.health_passed ? "ok" : "fail"}`, d.health_passed ? "PASSED" : "FAILED");
    head.appendChild(badge);
    card.appendChild(head);
    const k = document.createElement("div"); k.className = "kpi-row";
    k.appendChild(kpiBox("Temp", d.temperature || "-"));
    k.appendChild(kpiBox("Power On Hrs", d.power_on_hours != null ? String(d.power_on_hours) : "-"));
    k.appendChild(kpiBox("Power Cycles", d.power_cycles != null ? String(d.power_cycles) : "-"));
    if (d.wear_level_percent_used != null) k.appendChild(kpiBox("Wear Used", `${d.wear_level_percent_used}%`));
    if (d.media_errors != null) k.appendChild(kpiBox("Media Errors", String(d.media_errors)));
    card.appendChild(k);
    if (d.friendly) {
      const fr = el("div", "muted small", d.friendly);
      card.appendChild(fr);
    }
    list.appendChild(card);
  });
  if (!drives.length) list.appendChild(el("div", "muted", "No drive data"));
  root.appendChild(list);
  return root;
}
function renderKvrt(res) { return renderGeneric(res); }
function renderAdwCleaner(res) { return renderGeneric(res); }
function renderPing(res) {
  const root = el("div", "card ping");
  root.appendChild(renderHeader("Ping Test", res.status));
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const k = document.createElement("div"); k.className = "kpi-row";
  k.appendChild(kpiBox("Average", fmtMs(s.average_latency_ms)));
  k.appendChild(kpiBox("Min", fmtMs(s.latency_ms?.min)));
  k.appendChild(kpiBox("Max", fmtMs(s.latency_ms?.max)));
  k.appendChild(kpiBox("Loss", s.packet_loss_percent != null ? `${s.packet_loss_percent}%` : "-"));
  k.appendChild(kpiBox("Verdict", hr.verdict || "-"));
  root.appendChild(k);
  if (Array.isArray(hr.notes) && hr.notes.length) {
    const line = el("div", "", "");
    hr.notes.forEach(n => line.appendChild(pill(n)));
    root.appendChild(line);
  }
  return root;
}
function renderChkdsk(res) { return renderGeneric(res); }
function renderBleachBit(res) { return renderGeneric(res); }
function renderFurmark(res) { return renderGeneric(res); }
function renderHeavyload(res) {
  const root = el("div", "card heavyload");
  const label = res.summary?.stress_cpu ? "CPU Stress (HeavyLoad)" : res.summary?.stress_memory ? "RAM Stress (HeavyLoad)" : res.summary?.stress_gpu ? "GPU Stress (HeavyLoad)" : "HeavyLoad Stress";
  root.appendChild(renderHeader(label, res.status));
  const s = res.summary || {};
  const k = document.createElement("div"); k.className = "kpi-row";
  k.appendChild(kpiBox("Duration", s.duration_minutes != null ? `${s.duration_minutes} min` : "-"));
  k.appendChild(kpiBox("Exit Code", s.exit_code != null ? String(s.exit_code) : "-"));
  root.appendChild(k);
  return root;
}
function renderIperf(res) { return renderGeneric(res); }
function renderWhyNotWin11(res) {
  const root = el("div", "card wn11");
  root.appendChild(renderHeader("Windows 11 Compatibility", res.status));
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const k = document.createElement("div"); k.className = "kpi-row";
  k.appendChild(kpiBox("Hostname", s.hostname || "-"));
  k.appendChild(kpiBox("Ready", s.ready ? "Yes" : "No"));
  k.appendChild(kpiBox("Verdict", (hr.verdict || "").toString()));
  const failing = Array.isArray(s.failing_checks) ? s.failing_checks.length : 0;
  const passing = Array.isArray(s.passing_checks) ? s.passing_checks.length : 0;
  k.appendChild(kpiBox("Passing", passing));
  k.appendChild(kpiBox("Failing", failing));
  root.appendChild(k);
  if (Array.isArray(s.failing_checks) && s.failing_checks.length) {
    const failWrap = el("div", "", "");
    s.failing_checks.forEach((c) => failWrap.appendChild(pill(c, "fail")));
    root.appendChild(failWrap);
  }
  if (Array.isArray(s.passing_checks) && s.passing_checks.length) {
    const passWrap = el("div", "", "");
    s.passing_checks.forEach((c) => passWrap.appendChild(pill(c)));
    root.appendChild(passWrap);
  }
  return root;
}
function renderWindowsUpdate(res) { return renderGeneric(res); }

// ---------- Printable ----------
function buildPrintableHtml(report, sectionsEl) {
  const title = "AutoService – Service Results";
  const overall = String(report.overall_status || "").toLowerCase();
  const head = `
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #e6e6e6; background: #1a1a1a; }
      h1, h2, h3 { margin: 0 0 6px; }
      .muted { color: #aaa; }
      .summary-head { display:flex; align-items:center; justify-content:space-between; padding: 8px 0; border-bottom:1px solid #333; }
      .summary-head.ok .title { color:#58d68d; }
      .summary-head.warn .title { color:#f5b041; }
      .result-section { padding: 10px 0; border-bottom: 1px solid #333; }
      .result-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px; }
      .status { padding:2px 6px; border-radius:4px; border:1px solid #444; font-size: 12px; }
      .status.success, .status.ok { background:#1e3d2a; color:#58d68d; border-color:#2e7d32; }
      .status.failure, .status.error, .status.failed { background:#3d1e1e; color:#ec7063; border-color:#943126; }
      .status.skipped { background:#2a2a2a; color:#bbb; border-color:#555; }
      .badge { padding:2px 6px; border-radius:4px; border:1px solid #444; font-size: 12px; }
      .badge.ok { background:#1e3d2a; color:#58d68d; border-color:#2e7d32; }
      .badge.fail { background:#3d1e1e; color:#ec7063; border-color:#943126; }
      .pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #2b2b2b; margin:2px 4px 0 0; font-size:12px; color:#c9c9c9; }
      .pill.fail { border-color:#943126; color:#ec7063; }
      dl.kv { display:grid; grid-template-columns: max-content 1fr; gap: 6px 12px; }
      dl.kv dt { color:#bbb; }
      dl.kv dd { margin:0; }
    </style>
  `;
  const body = `
    <div class="summary-head ${overall === "success" ? "ok" : "warn"}">
      <div>
        <h2 class="title">Overall: ${overall === "success" ? "Success" : "Completed with errors"}</h2>
        <div class="muted">${report.results.length} task(s)</div>
      </div>
    </div>
    ${sectionsEl.innerHTML}
  `;
  return `<div>${head}${body}</div>`;
}

// ---------- Helpers ----------
function kpiBox(label, value) {
  const box = el("div", "kpi");
  box.appendChild(el("span", "lab", label));
  box.appendChild(el("span", "val", value == null ? "-" : String(value)));
  return box;
}
function pill(text, variant) {
  const p = el("span", `pill${variant ? " " + variant : ""}`, text);
  return p;
}
function addKv(container, k, v) {
  const wrapK = el("div", "k", k);
  const wrapV = el("div", "v", v == null ? "-" : String(v));
  container.appendChild(wrapK);
  container.appendChild(wrapV);
}
function fmtMs(ms) {
  if (ms == null || !isFinite(ms)) return "-";
  return `${Math.round(ms)} ms`;
}
function fmtMbps(n) {
  if (n == null || !isFinite(n)) return "-";
  return `${Math.round(n * 10) / 10} Mbps`;
}


