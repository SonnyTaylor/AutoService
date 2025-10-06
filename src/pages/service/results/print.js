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

/**
 * Build customer-friendly print HTML (high-level summary only)
 */
export function buildCustomerPrintHtml(report) {
  const title = "Service Summary";
  const overall = String(report.overall_status || "").toLowerCase();
  const body = `
    ${buildCustomerHeader(title, overall, report)}
    ${buildCustomerSummary(report)}
  `;
  return `<div>${body}</div>`;
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

/**
 * Build customer-friendly document HTML
 */
export function buildCustomerPrintDocumentHtml(report) {
  const inner = buildCustomerPrintHtml(report);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AutoService – Service Summary</title>
    <style>${CUSTOMER_PRINT_CSS}</style>
  </head>
  <body>${inner}</body>
</html>`;
}

/**
 * Build customer-friendly header
 */
function buildCustomerHeader(title, overall, report) {
  const dt = new Date();
  const date = dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const statusText =
    overall === "success"
      ? "Service Completed Successfully"
      : "Service Completed";
  const hostname =
    report?.summary?.hostname || report?.hostname || "Your Computer";

  return `
    <div class="customer-header">
      <div class="company-info">
        <h1 class="company-name">AutoService</h1>
        <div class="tagline">Professional Computer Maintenance</div>
      </div>
      <div class="service-title">
        <h2>${title}</h2>
        <div class="service-meta">
          <div class="status-badge ${
            overall === "success" ? "success" : "info"
          }">${statusText}</div>
          <div class="date-info">${date}</div>
        </div>
      </div>
      <div class="customer-info">
        <strong>Computer:</strong> ${hostname}
      </div>
    </div>
  `;
}

/**
 * Build customer summary with high-level metrics
 */
function buildCustomerSummary(report) {
  const results = report?.results || [];

  // Extract high-level metrics from various task types
  const metrics = extractCustomerMetrics(results);

  return `
    <div class="customer-summary">
      <h3 class="section-heading">Service Summary</h3>
      <p class="intro-text">
        Your computer has been serviced and the following maintenance tasks have been completed:
      </p>
      
      <div class="metrics-grid">
        ${metrics
          .map(
            (m) => `
          <div class="metric-card ${m.variant}">
            <div class="metric-icon">${m.icon}</div>
            <div class="metric-content">
              <div class="metric-label">${m.label}</div>
              <div class="metric-value">${m.value}</div>
              ${m.detail ? `<div class="metric-detail">${m.detail}</div>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      
      <div class="tasks-completed">
        <h4 class="subsection-heading">Tasks Performed</h4>
        <ul class="task-list">
          ${buildCustomerTaskList(results)}
        </ul>
      </div>
      
      <div class="recommendations">
        <h4 class="subsection-heading">Recommendations</h4>
        <div class="recommendation-box">
          ${generateRecommendations(results)}
        </div>
      </div>
      
      <div class="footer-note">
        <p><strong>Thank you for choosing AutoService!</strong></p>
        <p class="small-print">This report provides a summary of maintenance performed on your computer. 
        For technical details, please refer to the detailed technician report.</p>
      </div>
    </div>
  `;
}

/**
 * Extract customer-friendly metrics from task results
 */
function extractCustomerMetrics(results) {
  const metrics = [];

  let totalThreatsRemoved = 0;
  let spaceRecovered = 0;
  let filesDeleted = 0;
  let systemHealthChecked = false;
  let driveHealthChecked = false;
  let performanceTest = false;

  results.forEach((result) => {
    const type = result?.task_type || result?.type || "";
    const summary = result?.summary || {};
    const status = result?.status || "";

    // Count threats from various security scanners
    if (type === "kvrt_scan" && summary.detections) {
      totalThreatsRemoved += Array.isArray(summary.detections)
        ? summary.detections.length
        : 0;
    }
    if (type === "adwcleaner_clean" && summary.quarantined) {
      totalThreatsRemoved += summary.quarantined || 0;
    }

    // Track space recovered from cleanup tools
    if (type === "bleachbit_clean" && summary.space_recovered_bytes) {
      spaceRecovered += summary.space_recovered_bytes || 0;
      filesDeleted += summary.files_deleted || 0;
    }

    // System health checks
    if (
      (type === "sfc_scan" || type === "dism_health_check") &&
      status === "success"
    ) {
      systemHealthChecked = true;
    }

    // Drive health
    if (type === "smartctl_report" && status === "success") {
      driveHealthChecked = true;
    }

    // Performance testing
    if (
      (type === "winsat_disk" ||
        type === "heavyload_stress_test" ||
        type === "furmark_stress_test") &&
      status === "success"
    ) {
      performanceTest = true;
    }
  });

  // Build metrics cards
  if (totalThreatsRemoved > 0) {
    metrics.push({
      icon: "🛡️",
      label: "Threats Removed",
      value: totalThreatsRemoved.toString(),
      detail: "Viruses, malware, and unwanted software",
      variant: "success",
    });
  }

  if (spaceRecovered > 0) {
    const gb = (spaceRecovered / 1024 ** 3).toFixed(2);
    metrics.push({
      icon: "🧹",
      label: "Space Recovered",
      value: `${gb} GB`,
      detail: `${filesDeleted.toLocaleString()} junk files removed`,
      variant: "success",
    });
  }

  if (systemHealthChecked) {
    metrics.push({
      icon: "✅",
      label: "System Health",
      value: "Verified",
      detail: "System files checked and repaired",
      variant: "info",
    });
  }

  if (driveHealthChecked) {
    metrics.push({
      icon: "💾",
      label: "Drive Health",
      value: "Checked",
      detail: "Storage drives analyzed",
      variant: "info",
    });
  }

  if (performanceTest) {
    metrics.push({
      icon: "⚡",
      label: "Performance",
      value: "Tested",
      detail: "System performance verified",
      variant: "info",
    });
  }

  // If no specific metrics, show general service completion
  if (metrics.length === 0) {
    metrics.push({
      icon: "✓",
      label: "Service Completed",
      value: `${results.length} tasks`,
      detail: "Maintenance tasks performed",
      variant: "info",
    });
  }

  return metrics;
}

/**
 * Build customer-friendly task list
 */
function buildCustomerTaskList(results) {
  const taskNames = {
    bleachbit_clean: "System Cleanup & Junk File Removal",
    adwcleaner_clean: "Adware & Malware Removal",
    kvrt_scan: "Virus Scan & Removal",
    sfc_scan: "System File Integrity Check",
    dism_health_check: "System Health Verification",
    smartctl_report: "Hard Drive Health Analysis",
    chkdsk_scan: "Disk Error Check & Repair",
    heavyload_stress_test: "CPU & RAM Stress Test",
    furmark_stress_test: "Graphics Card Stress Test",
    winsat_disk: "Disk Performance Test",
    speedtest: "Internet Speed Test",
    ping_test: "Network Connectivity Test",
    windows_update: "Windows Updates",
    whynotwin11_check: "Windows 11 Compatibility Check",
    ai_startup_disable: "Startup Optimization",
  };

  return results
    .filter((r) => r.status !== "skipped")
    .map((result) => {
      const type = result?.task_type || result?.type || "unknown";
      const name =
        taskNames[type] ||
        type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      const status = result?.status || "";
      const icon =
        status === "success" ? "✓" : status === "failure" ? "⚠" : "•";
      return `<li><span class="task-icon ${status}">${icon}</span> ${name}</li>`;
    })
    .join("");
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(results) {
  const recommendations = [];

  const hasFailures = results.some((r) => r.status === "failure");
  const hasThreats = results.some(
    (r) =>
      (r.task_type === "kvrt_scan" && r.summary?.detections?.length > 0) ||
      (r.task_type === "adwcleaner_clean" && r.summary?.quarantined > 0)
  );

  if (hasThreats) {
    recommendations.push(
      "• Run a full system scan regularly to maintain security"
    );
  }

  recommendations.push("• Keep Windows and your applications up to date");
  recommendations.push("• Perform regular maintenance every 3-6 months");
  recommendations.push("• Back up important files regularly");

  if (hasFailures) {
    recommendations.push(
      "• Some tasks encountered issues - contact support if problems persist"
    );
  }

  return recommendations.map((r) => `<p>${r}</p>`).join("");
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

export async function waitForChartsRendered(root, timeoutMs = 500) {
  // Charts are hidden in print, so just give DOM a moment to settle
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

const PRINT_LIGHT_CSS = `
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  html, body {
    background: #fff !important; color: #0f172a !important;
    font-family: 'Segoe UI Variable', 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, 'Noto Sans', system-ui, sans-serif;
    font-size: 10.5pt; line-height: 1.4;
    margin: 0; padding: 0;
  }
  body { margin: 0; padding: 0; }
  
  /* Print Header */
  .print-header { 
    display: grid; grid-template-columns: 1fr max-content; gap: 16px; align-items: end; 
    padding: 8px 4px 12px 4px; border-bottom: 3px solid #0f172a; margin-bottom: 16px; 
  }
  .print-header .title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.3px; color: #0f172a; }
  .print-header .sub { margin: 4px 0 0; font-size: 11pt; color: #334155; font-weight: 500; }
  .print-header .meta { font-size: 10pt; color: #475569; text-align: right; line-height: 1.5; }
  .print-header .meta div { margin: 2px 0; }
  
  /* Summary */
  .summary-head { 
    display: flex; align-items: center; justify-content: space-between; 
    border: 2px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; 
    margin: 0 0 18px 0; background: #f8fafc; 
  }
  .summary-head.ok { background: #f0fdf4; border-color: #86efac; }
  .summary-head.ok .title { color: #166534; }
  .summary-head.warn { background: #fffbeb; border-color: #fde68a; }
  .summary-head.warn .title { color: #92400e; }
  .summary-head.fail { background: #fef2f2; border-color: #fca5a5; }
  .summary-head.fail .title { color: #991b1b; }
  .summary-head .title { margin: 0; font-size: 16px; letter-spacing: 0.2px; font-weight: 700; }
  
  /* Utilities */
  .muted { color: #64748b; }
  .small { font-size: 9.5pt; }
  
  /* Result Sections */
  .result-section { 
    page-break-inside: avoid; break-inside: avoid; 
    margin: 0 0 16px 0; 
  }
  .result-header { 
    display: flex; align-items: center; justify-content: space-between; 
    margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb;
  }
  .result-header h3 { margin: 0; font-size: 14.5px; color: #0f172a; font-weight: 700; letter-spacing: 0.2px; }
  
  /* Status Badges */
  .status { 
    font-size: 11px; padding: 3px 10px; border-radius: 999px; 
    border: 1px solid #cbd5e1; background: #f1f5f9; text-transform: capitalize; 
    font-weight: 600;
  }
  .status.success, .status.ok { color: #166534; border-color: #86efac; background: #dcfce7; }
  .status.warn, .status.warning { color: #92400e; border-color: #fde68a; background: #fef3c7; }
  .status.fail, .status.failure, .status.error { color: #991b1b; border-color: #fca5a5; background: #fee2e2; }
  .status.skipped { color: #713f12; border-color: #d4d4d4; background: #f5f5f5; }

  /* Cards */
  .card, .result, .drive-card { 
    background: #fff; border: 1.5px solid #cbd5e1; 
    border-radius: 10px; padding: 14px; margin-bottom: 4px;
  }
  
  /* KPI Boxes */
  .kpi-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .kpi { 
    min-width: 110px; border: 1.5px solid #cbd5e1; 
    border-radius: 8px; padding: 10px 12px; background: #fafbfc; 
    flex: 1;
  }
  .kpi .lab { display: block; font-size: 9pt; color: #64748b; margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .kpi .val { display: block; font-weight: 700; font-size: 13pt; color: #0f172a; }
  
  /* KPI Color Variants */
  .kpi.ok { border-color: #86efac; background: #f0fdf4; }
  .kpi.ok .val { color: #166534; }
  .kpi.warn { border-color: #fde68a; background: #fffbeb; }
  .kpi.warn .val { color: #92400e; }
  .kpi.fail { border-color: #fca5a5; background: #fef2f2; }
  .kpi.fail .val { color: #991b1b; }
  .kpi.info { border-color: #93c5fd; background: #eff6ff; }
  .kpi.info .val { color: #1e40af; }

  /* Pills */
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .pill { 
    display: inline-block; font-size: 10.5px; padding: 4px 10px; 
    border-radius: 999px; background: #e0e7ff; color: #3730a3; 
    border: 1px solid #a5b4fc; font-weight: 500;
  }
  .pill.info { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
  .pill.warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .pill.fail { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
  .pill.ok { background: #dcfce7; color: #166534; border-color: #86efac; }

  /* Tags */
  .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  
  /* Drive-specific */
  .drive-list { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 8px; }
  .drive-card { margin-bottom: 0; }
  .drive-head { 
    display: flex; align-items: center; justify-content: space-between; 
    margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;
  }
  .drive-model { font-weight: 600; font-size: 11.5pt; color: #0f172a; }
  .badge { 
    font-size: 10px; padding: 3px 10px; border-radius: 999px; 
    border: 1px solid #cbd5e1; background: #f1f5f9; font-weight: 600;
  }
  .badge.ok { color: #166534; border-color: #86efac; background: #dcfce7; }
  .badge.fail { color: #991b1b; border-color: #fca5a5; background: #fee2e2; }

  /* SFC Layout */
  .sfc-layout { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: start; }
  .sfc-icon { font-size: 26px; }
  .sfc-icon .ok { color: #16a34a; }
  .sfc-icon .fail { color: #dc2626; }
  .sfc-verdict { font-weight: 600; font-size: 11.5pt; margin-bottom: 4px; }
  .sfc-repair { margin-top: 6px; font-size: 10pt; color: #64748b; }

  /* DISM & Other Cards */
  .dism, .chkdsk, .bleachbit, .adwcleaner, .kvrt, .heavyload, .wn11, .winsat { margin-bottom: 4px; }
  
  /* WinSAT print layout */
  .winsat-kpis { 
    display: grid; 
    grid-template-columns: 1fr;
    gap: 10px; 
    margin-bottom: 10px;
  }
  .winsat-meta { 
    background: #fafbfc; border: 1px solid #e5e7eb; 
    border-radius: 6px; padding: 8px 10px;
  }
  .winsat-meta-row { 
    display: flex; justify-content: space-between; 
    margin: 3px 0; font-size: 9.5pt; 
    gap: 8px;
  }
  .winsat-meta-row .lab { 
    text-transform: uppercase; letter-spacing: 0.5px; 
    color: #64748b; font-weight: 500; 
    flex-shrink: 0;
  }
  .winsat-kpi-grid { 
    display: grid; grid-template-columns: repeat(2, 1fr); 
    gap: 8px; max-width: 100%;
  }
  .winsat-latency, .winsat-scores {
    background: #fafbfc; border: 1px solid #e5e7eb; 
    border-radius: 6px; padding: 10px;
  }
  .winsat-latency .section-title, .winsat-scores .section-title {
    font-size: 10pt; text-transform: uppercase; 
    letter-spacing: 0.5px; color: #64748b; 
    margin-bottom: 8px; font-weight: 600;
  }
  .winsat-latency .kpi-row, .winsat-scores .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  
  /* Hide complex charts in print - replace with simple visuals */
  .speedtest-chart, .ping-chart, .ping-chart-shell, .chart-container, .winsat-chart,
  [id^="speedtest-chart-"], [id^="ping-chart-"], [id^="iperf-chart-"], [id^="winsat-chart-"] {
    display: none !important;
  }
  
  /* Print-friendly layouts */
  .ping-layout, .speedtest-layout, .winsat-layout { 
    display: block; 
  }
  
  /* KPI layouts */
  .speedtest-kpis, .ping-kpis { 
    display: grid; 
    grid-template-columns: repeat(2, 1fr);
    gap: 10px; 
    margin-bottom: 10px;
  }
  .speedtest-kpi-grid { 
    display: grid; grid-template-columns: repeat(2, 1fr); 
    gap: 8px; max-width: 100%;
  }
  .speedtest-meta { 
    background: #fafbfc; border: 1px solid #e5e7eb; 
    border-radius: 6px; padding: 8px 10px; margin-top: 6px;
    word-wrap: break-word;
  }
  .speedtest-meta-row { 
    display: flex; justify-content: space-between; 
    margin: 3px 0; font-size: 9.5pt; 
    gap: 8px;
  }
  .speedtest-meta-row .lab { 
    text-transform: uppercase; letter-spacing: 0.5px; 
    color: #64748b; font-weight: 500; 
    flex-shrink: 0;
  }
  .speedtest-meta-row .val {
    overflow: hidden; text-overflow: ellipsis; 
    white-space: nowrap;
    text-align: right;
  }
  
  /* Simple visual bars for print */
  .print-bar {
    width: 100%;
    height: 32px;
    background: #e5e7eb;
    border-radius: 6px;
    position: relative;
    overflow: hidden;
    margin-top: 4px;
  }
  .print-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
    color: white;
    font-weight: 600;
    font-size: 10pt;
  }
  .print-bar-label {
    font-size: 9pt;
    color: #64748b;
    margin-top: 3px;
  }
  
  /* Prevent chart overflow */
  svg, img, canvas { 
    page-break-inside: avoid; break-inside: avoid; 
    max-width: 100%; height: auto;
  }

  /* Enhanced Print Displays */
  .iperf .kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
  
  /* KVRT Detections */
  .kvrt-detections { margin-top: 10px; }
  .kvrt-detection-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .kvrt-detection { 
    background: #fafbfc; border: 1px solid #cbd5e1; 
    border-radius: 6px; padding: 10px; 
  }
  .kvrt-detection-head { display: flex; justify-content: space-between; align-items: start; gap: 10px; margin-bottom: 6px; }
  .kvrt-threat { font-weight: 600; font-size: 10.5pt; color: #92400e; }
  .kvrt-detection-body { font-size: 9.5pt; }
  .kvrt-label { text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5px; color: #64748b; margin-bottom: 2px; }
  .kvrt-object { 
    font-family: 'Consolas', 'Monaco', monospace; 
    font-size: 9pt; color: #334155; 
    word-break: break-all; margin-top: 2px;
  }
  .kvrt-meta { 
    border-top: 1px solid #e5e7eb; padding-top: 8px; 
    margin-top: 8px; font-size: 9pt; color: #64748b; 
  }

  /* Typography */
  h2, h3 { page-break-after: avoid; }
  p, dl, ul { margin: 0.3rem 0; }
  dt { color: #334155; font-weight: 600; }
  dd { margin: 0 0 4px 0; color: #0f172a; }
  
  /* Details/Output sections */
  details.output { 
    margin-top: 10px; background: #fafbfc; 
    border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; 
  }
  details.output summary { 
    cursor: pointer; font-weight: 600; 
    font-size: 10pt; color: #475569; 
  }
  details.output pre { 
    margin: 8px 0 0; font-size: 8.5pt; 
    white-space: pre-wrap; color: #334155; 
    font-family: 'Consolas', 'Monaco', monospace;
  }
`;

const CUSTOMER_PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  
  html, body {
    background: #fff !important;
    color: #1e293b !important;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    margin: 0;
    padding: 0;
  }
  
  body { margin: 0; padding: 20px; }
  
  /* Customer Header */
  .customer-header {
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 3px solid #0f172a;
  }
  
  .company-info {
    margin-bottom: 20px;
  }
  
  .company-name {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.5px;
  }
  
  .tagline {
    margin: 4px 0 0;
    font-size: 12pt;
    color: #64748b;
    font-weight: 500;
  }
  
  .service-title h2 {
    margin: 0 0 12px;
    font-size: 24px;
    font-weight: 600;
    color: #1e293b;
  }
  
  .service-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  
  .status-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .status-badge.success {
    background: #dcfce7;
    color: #166534;
    border: 2px solid #86efac;
  }
  
  .status-badge.info {
    background: #dbeafe;
    color: #1e40af;
    border: 2px solid #93c5fd;
  }
  
  .date-info {
    font-size: 11pt;
    color: #475569;
    font-weight: 500;
  }
  
  .customer-info {
    margin-top: 16px;
    padding: 12px 16px;
    background: #f8fafc;
    border-left: 4px solid #3b82f6;
    border-radius: 4px;
    font-size: 11pt;
  }
  
  .customer-info strong {
    color: #0f172a;
  }
  
  /* Customer Summary */
  .customer-summary {
    max-width: 100%;
  }
  
  .section-heading {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  
  .intro-text {
    margin: 0 0 24px;
    font-size: 11pt;
    color: #475569;
    line-height: 1.7;
  }
  
  /* Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }
  
  .metric-card {
    display: flex;
    align-items: start;
    gap: 14px;
    padding: 18px;
    border-radius: 12px;
    border: 2px solid;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .metric-card.success {
    background: #f0fdf4;
    border-color: #86efac;
  }
  
  .metric-card.info {
    background: #eff6ff;
    border-color: #93c5fd;
  }
  
  .metric-icon {
    font-size: 32px;
    line-height: 1;
    flex-shrink: 0;
  }
  
  .metric-content {
    flex: 1;
    min-width: 0;
  }
  
  .metric-label {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    font-weight: 600;
    margin-bottom: 4px;
  }
  
  .metric-value {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
  }
  
  .metric-card.success .metric-value {
    color: #166534;
  }
  
  .metric-card.info .metric-value {
    color: #1e40af;
  }
  
  .metric-detail {
    font-size: 9.5pt;
    color: #64748b;
    margin-top: 4px;
  }
  
  /* Tasks Completed */
  .tasks-completed {
    margin-bottom: 32px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .subsection-heading {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
    letter-spacing: -0.2px;
  }
  
  .task-list {
    list-style: none;
    padding: 0;
    margin: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
  }
  
  .task-list li {
    margin: 8px 0;
    padding-left: 28px;
    position: relative;
    font-size: 10.5pt;
    color: #334155;
  }
  
  .task-icon {
    position: absolute;
    left: 0;
    top: 0;
    font-weight: 700;
    font-size: 12pt;
  }
  
  .task-icon.success {
    color: #16a34a;
  }
  
  .task-icon.failure {
    color: #dc2626;
  }
  
  /* Recommendations */
  .recommendations {
    margin-bottom: 32px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .recommendation-box {
    background: #fef3c7;
    border: 2px solid #fbbf24;
    border-radius: 8px;
    padding: 16px 20px;
  }
  
  .recommendation-box p {
    margin: 6px 0;
    font-size: 10.5pt;
    color: #78350f;
    line-height: 1.6;
  }
  
  /* Footer */
  .footer-note {
    margin-top: 40px;
    padding-top: 24px;
    border-top: 2px solid #e2e8f0;
  }
  
  .footer-note p {
    margin: 8px 0;
    font-size: 10.5pt;
    color: #475569;
  }
  
  .footer-note strong {
    color: #0f172a;
    font-size: 11.5pt;
  }
  
  .small-print {
    font-size: 9pt !important;
    color: #94a3b8 !important;
    font-style: italic;
    line-height: 1.5;
  }
  
  /* Typography */
  h1, h2, h3, h4 {
    page-break-after: avoid;
    break-after: avoid;
  }
  
  p {
    orphans: 3;
    widows: 3;
  }
`;
