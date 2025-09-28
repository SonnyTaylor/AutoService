export function buildPrintableHtml(report, sectionsEl) {
  const title = "AutoService – Service Results";
  const overall = String(report.overall_status || "").toLowerCase();
  const head = ``;
  const body = `
    ${buildPrintHeader(title, overall, report)}
    ${sectionsEl.innerHTML}
  `;
  return `<div>${head}${body}</div>`;
}

export function buildPrintableDocumentHtml(report, sectionsEl) {
  const inner = buildPrintableHtml(report, sectionsEl);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AutoService – Service Results</title>
    <style>${PRINT_LIGHT_CSS}</style>
  </head>
  <body>${inner}</body>
</html>`;
}

export function buildPrintHeader(title, overall, report) {
  const dt = new Date();
  const date = dt.toLocaleDateString();
  const time = dt.toLocaleTimeString();
  const tasks = Array.isArray(report?.results) ? report.results.length : 0;
  const statusText =
    overall === "success" ? "Success" : "Completed with errors";
  const hostname = report?.summary?.hostname || report?.hostname || "";
  return `
    <div class="print-header">
      <div>
        <h1 class="title">${title}</h1>
        <div class="sub">Overall: ${statusText} · ${tasks} task(s)</div>
      </div>
      <div class="meta">
        <div>${date} ${time}</div>
        ${hostname ? `<div>Host: ${hostname}</div>` : ""}
      </div>
    </div>
  `;
}

export async function waitForChartsRendered(root, timeoutMs = 3000) {
  const hasChartContainers =
    !!root.querySelector('[id^="ping-chart-"]') ||
    !!root.querySelector('[id^="iperf-chart-"]');
  if (!hasChartContainers) return;

  const start = Date.now();
  let stableSince = 0;
  let observer;
  await new Promise((resolve) => {
    const checkDone = () => {
      const haveRendered = !!root.querySelector(
        ".apexcharts-canvas, .apexcharts-svg"
      );
      const now = Date.now();
      if (haveRendered && stableSince && now - stableSince > 250) {
        cleanup();
        resolve();
        return;
      }
      if (now - start > timeoutMs) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      try {
        observer && observer.disconnect();
      } catch {}
    };
    observer = new MutationObserver(() => {
      stableSince = Date.now();
    });
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: false,
      });
      stableSince = Date.now();
    } catch {}
    const interval = setInterval(() => {
      checkDone();
      if (Date.now() - start > timeoutMs + 300) {
        clearInterval(interval);
      }
    }, 100);
  });
}

const PRINT_LIGHT_CSS = `
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  html, body {
    background: #fff !important; color: #0f172a !important;
    font-family: 'Segoe UI Variable', 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, 'Noto Sans', system-ui, sans-serif;
    font-size: 11pt; line-height: 1.35;
  }
  body { margin: 0; }
  .print-header { display: grid; grid-template-columns: 1fr max-content; gap: 12px; align-items: end; padding: 6px 2px 10px 2px; border-bottom: 2px solid #0f172a; margin-bottom: 12px; }
  .print-header .title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.2px; color: #0f172a; }
  .print-header .sub { margin: 3px 0 0; font-size: 11pt; color: #0f172a; }
  .print-header .meta { font-size: 10pt; color: #334155; text-align: right; }
  .print-header .meta div { margin: 2px 0; }
  .summary-head { display: flex; align-items: center; justify-content: space-between; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin: 0 0 16px 0; background: #fff; }
  .summary-head.ok .title { color: #166534; }
  .summary-head.warn .title { color: #92400e; }
  .summary-head .title { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
  .muted { color: #475569; }
  .small { font-size: 10pt; }
  .result-section { page-break-inside: avoid; break-inside: avoid; margin: 0 0 14px 0; }
  .result-header { display: flex; align-items: center; justify-content: space-between; margin: 0 0 8px 0; }
  .result-header h3 { margin: 0; font-size: 15px; color: #0f172a; font-weight: 700; }
  .status { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid #e5e7eb; background: #f9fafb; text-transform: capitalize; }
  .status.success, .status.ok { color: #166534; border-color: #bbf7d0; background: #f0fdf4; }
  .status.warn, .status.warning { color: #92400e; border-color: #fed7aa; background: #fffbeb; }
  .status.fail, .status.failure, .status.error { color: #7f1d1d; border-color: #fecaca; background: #fef2f2; }

  .card, .result, .drive-card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
  .kpi-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .kpi { min-width: 120px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #fff; }
  .kpi .lab { display: block; font-size: 9.5pt; color: #64748b; }
  .kpi .val { display: block; font-weight: 600; font-size: 12pt; color: #0f172a; }

  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pill { display: inline-block; font-size: 12px; padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #1e3a8a; border: 1px solid #94a3b8; }
  .pill.warn { background: #fffbeb; color: #92400e; border-color: #fed7aa; }
  .pill.fail { background: #fef2f2; color: #7f1d1d; border-color: #fecaca; }
  .pill.ok { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }

  .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .drive-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .drive-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid #e5e7eb; background: #f9fafb; }
  .badge.ok { color: #166534; border-color: #bbf7d0; background: #f0fdf4; }
  .badge.fail { color: #7f1d1d; border-color: #fecaca; background: #fef2f2; }

  .sfc-layout { display: grid; grid-template-columns: 40px 1fr; gap: 10px; align-items: start; }
  .sfc-icon { font-size: 24px; }
  .sfc-verdict { font-weight: 600; }
  .sfc-repair { margin-top: 4px; }

  .ping-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .chart-container, .ping-chart { min-height: 160px; }
  .apexcharts-canvas, .apexcharts-svg { background: #fff !important; }
  .apexcharts-tooltip, .apexcharts-toolbar { display: none !important; }
  svg, img, canvas { page-break-inside: avoid; break-inside: avoid; }

  h2, h3 { page-break-after: avoid; }
  p, dl, ul { margin: 0.2rem 0; }
  dt { color: #334155; font-weight: 600; }
  dd { margin: 0 0 4px 0; color: #0f172a; }
`;
