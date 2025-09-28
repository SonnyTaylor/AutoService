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
  const summaryEl = document.getElementById("svc-results-summary");
  const sectionsEl = document.getElementById("svc-results-sections");
  const printContainer = document.getElementById("svc-print-container");

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-report";
  });

  let report = null;
  try {
    const raw = sessionStorage.getItem("service.finalReport") || "{}";
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

  // Build sections modularly
  sectionsEl.innerHTML = "";
  for (const res of report.results) {
    const type = res?.task_type || res?.type || "unknown";
    const renderer = RENDERERS[type] || renderGeneric;
    const section = document.createElement("section");
    section.className = "result-section";
    section.appendChild(renderer(res));
    sectionsEl.appendChild(section);
  }

  // Prepare printable HTML content
  try {
    const printableHtml = buildPrintableHtml(report, sectionsEl);
    printContainer.innerHTML = printableHtml;
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
  if (Array.isArray(v)) return v.join(", ");
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
  return renderGeneric(res);
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
  root.appendChild(renderList(info));
  return root;
}

function renderSfc(res) { return renderGeneric(res); }
function renderDism(res) { return renderGeneric(res); }
function renderSmartctl(res) { return renderGeneric(res); }
function renderKvrt(res) { return renderGeneric(res); }
function renderAdwCleaner(res) { return renderGeneric(res); }
function renderPing(res) { return renderGeneric(res); }
function renderChkdsk(res) { return renderGeneric(res); }
function renderBleachBit(res) { return renderGeneric(res); }
function renderFurmark(res) { return renderGeneric(res); }
function renderHeavyload(res) { return renderGeneric(res); }
function renderIperf(res) { return renderGeneric(res); }
function renderWhyNotWin11(res) { return renderGeneric(res); }
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


