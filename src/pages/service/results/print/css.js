import { getHandlerPrintCSS } from "../../handlers/index.js";

/**
 * Base print CSS - shared styles for all technician reports.
 * Service-specific CSS is now defined in individual handlers.
 */
const BASE_PRINT_CSS = `
  @page { 
    size: A4; 
    margin: 8mm;
  }
  @media print {
    @page { 
      margin: 8mm;
    }
    /* Attempt to hide browser-injected headers/footers */
    html::before, html::after,
    body::before, body::after {
      display: none !important;
      content: none !important;
    }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  html, body {
    background: #fff !important; color: #0f172a !important;
    font-family: 'Segoe UI Variable', 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, 'Noto Sans', system-ui, sans-serif;
    font-size: 10.5pt; line-height: 1.4;
    margin: 0 !important; padding: 0 !important;
  }
  body { margin: 0 !important; padding: 0 !important; }
  
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

/**
 * Get complete technician print CSS.
 * Combines base CSS with service-specific CSS from handlers.
 * @returns {string} Complete CSS for technician reports
 */
export function getTechPrintCSS() {
  return BASE_PRINT_CSS + "\n\n" + getHandlerPrintCSS();
}

/**
 * Legacy export for backward compatibility.
 * Use getTechPrintCSS() for dynamic handler CSS injection.
 */
export const PRINT_LIGHT_CSS = getTechPrintCSS();

export const CUSTOMER_PRINT_CSS = `
  @page { 
    size: A4; 
    margin: 10mm;
  }
  @media print {
    @page { 
      margin: 10mm;
    }
    /* Attempt to hide browser-injected headers/footers */
    html::before, html::after,
    body::before, body::after {
      display: none !important;
      content: none !important;
    }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  
  html, body {
    background: #fff !important;
    color: #1e293b !important;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    margin: 0 !important;
    padding: 0 !important;
  }
  
  body { 
    margin: 0 !important; 
    padding: 0 !important;
    max-width: 100%;
    overflow-x: hidden;
  }
  
  /* Customer Header */
  .customer-header {
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: start;
    position: relative;
  }
  
  /* For narrow print, stack vertically */
  @media print and (max-width: 600px) {
    .customer-header {
      grid-template-columns: 1fr;
    }
  }
  
  /* Business Branding Layout (left side) */
  .business-branding {
    display: flex;
    gap: 12px;
    align-items: stretch;
    padding-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  /* Service Info (right side) */
  .service-info {
    padding: 12px;
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .service-info-heading {
    margin: 0 0 8px 0;
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.2px;
  }
  
  .service-info .info-line {
    font-size: 9pt;
    color: #475569;
    line-height: 1.5;
    margin: 3px 0;
  }
  
  .logo-container {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  
  .company-logo {
    max-width: 100px;
    height: 100%;
    max-height: 80px;
    object-fit: contain;
    display: block;
  }
  
  .business-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  
  .info-line {
    font-size: 8pt;
    color: #4b5563;
    line-height: 1.3;
  }
  
  .default-branding {
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e5e7eb;
  }
  
  .brand-block {
    min-width: 0;
  }
  
  .company-name {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
    line-height: 1.1;
  }
  
  .tagline {
    margin: 2px 0 0;
    font-size: 8pt;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  
  .header-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    margin-bottom: 16px;
    padding-top: 10px;
    border-top: 2px solid #e5e7eb;
  }
  
  .meta-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 9pt;
    color: #475569;
  }
  
  .status-badge {
    display: inline-block;
  padding: 4px 12px;
    border-radius: 999px;
    font-weight: 600;
  font-size: 9pt;
  letter-spacing: 0.4px;
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
  
  /* Customer Summary */
  .customer-summary {
    max-width: 100%;
    padding: 0 4px;
  }
  
  .customer-print {
    max-width: 100%;
    overflow-x: hidden;
    padding: 0 4px;
  }
  
  .section-heading {
    margin: 0 0 10px;
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  
  /* Service and Diagnostic Sections */
  .customer-services-section,
  .customer-diagnostics-section {
    margin-bottom: 16px;
    /* Allow breaking within sections so we don't push entire blocks to next page
       which can create large gaps when layouts toggle. Individual metric cards
       still avoid breaking, so page breaks will occur cleanly between cards. */
    page-break-inside: auto;
    break-inside: auto;
  }

  .customer-diagnostics-section {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 2px solid #e5e7eb;
  }

  .customer-diagnostics-section .section-heading {
    color: #1e293b;
    opacity: 0.8;
  }
  
  .intro-text {
    margin: 0 0 12px;
    font-size: 9.5pt;
    color: #475569;
    line-height: 1.45;
  }
  
  /* Metrics List Layouts */
  .metrics-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 16px;
    max-width: 100%;
    box-sizing: border-box;
  }

  .metrics-list.layout-list {
    grid-template-columns: 1fr;
  }

  .metrics-list.layout-two {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 8px;
  }

  .metrics-list.layout-three {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }

  .metrics-list.layout-masonry {
    display: block;
    column-count: 3;
    column-gap: 12px;
  }

  @media (max-width: 900px) {
    .metrics-list.layout-masonry {
      column-count: 2;
    }
  }

  @media (max-width: 640px) {
    .metrics-list.layout-masonry {
      column-count: 1;
    }
  }

  .metric-card {
    display: flex;
    align-items: start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid;
    page-break-inside: avoid;
    break-inside: avoid;
    column-break-inside: avoid;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }

  .metrics-list.layout-masonry .metric-card {
    display: inline-flex;
    margin-bottom: 10px;
  }

  .customer-summary.layout-three .metric-card,
  .customer-summary.layout-masonry .metric-card {
    padding: 8px 10px;
    gap: 8px;
  }

  .customer-summary.layout-three .metric-icon,
  .customer-summary.layout-masonry .metric-icon {
    font-size: 18px;
  }

  .customer-summary.layout-three .metric-value,
  .customer-summary.layout-masonry .metric-value {
    font-size: 14px;
  }

  .customer-summary.layout-three .metric-detail,
  .customer-summary.layout-masonry .metric-detail,
  .customer-summary.layout-three .metric-items,
  .customer-summary.layout-masonry .metric-items {
    font-size: 7.5pt;
  }

  .customer-summary.layout-three .metric-label,
  .customer-summary.layout-masonry .metric-label {
    font-size: 7.5pt;
  }
  
  .metric-card.success {
    background: #f0fdf4;
    border-color: #86efac;
  }
  
  .metric-card.info {
    background: #eff6ff;
    border-color: #93c5fd;
  }
  
  .metric-card.warning {
    background: #fef9c3;
    border-color: #facc15;
  }

  /* Ink saver: when disabled, neutralize card colors */
  .no-card-color .metric-card {
    background: #ffffff !important;
    border-color: #000000 !important;
  }
  .no-card-color .metric-card .metric-value,
  .no-card-color .metric-card .metric-label,
  .no-card-color .metric-card .metric-detail,
  .no-card-color .metric-card .metric-items,
  .no-card-color .metric-card .metric-items li::before {
    color: #0f172a !important;
  }
  
  .metric-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 1px;
  }
  
  .metric-content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  
  .metric-label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #64748b;
    font-weight: 600;
    margin-bottom: 2px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  .metric-value {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
    line-height: 1.2;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  .metric-card.success .metric-value {
    color: #166534;
  }
  
  .metric-card.info .metric-value {
    color: #1e40af;
  }
  
  .metric-card.warning .metric-value {
    color: #92400e;
  }
  
  .metric-detail {
    font-size: 8pt;
    color: #64748b;
    margin-top: 2px;
  }
  
  .metric-items {
    list-style: none;
    padding: 0;
    margin: 6px 0 0;
    font-size: 8pt;
    color: #475569;
    line-height: 1.35;
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
  
  .metric-card.warning .metric-items li::before {
    color: #f59e0b;
  }
  
  /* Footer */
  .footer-note {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
  }
  
  .footer-note p {
    margin: 4px 0;
    font-size: 9pt;
    color: #475569;
  }
  
  .footer-note strong {
    color: #0f172a;
    font-size: 9.5pt;
  }
  
  .small-print {
    font-size: 8pt !important;
    color: #94a3b8 !important;
    font-style: italic;
    line-height: 1.3;
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
