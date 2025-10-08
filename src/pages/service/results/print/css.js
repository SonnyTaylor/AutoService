export const PRINT_LIGHT_CSS = `
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

export const CUSTOMER_PRINT_CSS = `
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
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 3px solid #0f172a;
  }
  
  .company-info {
    margin-bottom: 16px;
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
  
  .service-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 12px;
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
  
  /* Customer Summary */
  .customer-summary {
    max-width: 100%;
  }
  
  .section-heading {
    margin: 0 0 10px;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  
  .intro-text {
    margin: 0 0 16px;
    font-size: 10pt;
    color: #475569;
    line-height: 1.6;
  }
  
  /* Metrics List - Single Column */
  .metrics-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }
  
  .metric-card {
    display: flex;
    align-items: start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1.5px solid;
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
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 2px;
  }
  
  .metric-content {
    flex: 1;
    min-width: 0;
  }
  
  .metric-label {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    font-weight: 600;
    margin-bottom: 2px;
  }
  
  .metric-value {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
    line-height: 1.2;
  }
  
  .metric-card.success .metric-value {
    color: #166534;
  }
  
  .metric-card.info .metric-value {
    color: #1e40af;
  }
  
  .metric-detail {
    font-size: 8.5pt;
    color: #64748b;
    margin-top: 2px;
  }
  
  .metric-items {
    list-style: none;
    padding: 0;
    margin: 6px 0 0;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.5;
  }
  
  .metric-items li {
    padding: 2px 0 2px 14px;
    position: relative;
  }
  
  .metric-items li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: #94a3b8;
    font-weight: bold;
  }
  
  .metric-card.success .metric-items li::before {
    color: #16a34a;
  }
  
  .metric-card.info .metric-items li::before {
    color: #3b82f6;
  }
  
  /* Footer */
  .footer-note {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1.5px solid #e2e8f0;
  }
  
  .footer-note p {
    margin: 6px 0;
    font-size: 10pt;
    color: #475569;
  }
  
  .footer-note strong {
    color: #0f172a;
    font-size: 10.5pt;
  }
  
  .small-print {
    font-size: 8.5pt !important;
    color: #94a3b8 !important;
    font-style: italic;
    line-height: 1.4;
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
