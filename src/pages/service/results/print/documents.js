import { buildCustomerHeader, buildCustomerSummary } from "./customer.js";
import { buildPrintHeader } from "./tech.js";
import { CUSTOMER_PRINT_CSS, PRINT_LIGHT_CSS } from "./css.js";

/**
 * @typedef {import('./types').ServiceReport} ServiceReport
 */

/**
 * Build technician printable markup.
 * @param {ServiceReport} report
 * @param {HTMLElement} sectionsEl
 */
export function buildPrintableHtml(report, sectionsEl) {
  const title = "AutoService – Service Results";
  const overall = String(report.overall_status || "").toLowerCase();
  const head = "";
  const body = `
    ${buildPrintHeader(title, overall, report)}
    ${sectionsEl.innerHTML}
  `;
  return `<div>${head}${body}</div>`;
}

/**
 * Build customer summary markup.
 * @param {ServiceReport} report
 * @param {{ layout?: string, showDiagnostics?: boolean, colorCards?: boolean }} [options]
 */
export async function buildCustomerPrintHtml(report, options = {}) {
  const title = "Service Summary";
  const overall = String(report.overall_status || "").toLowerCase();
  const requestedLayout =
    typeof options.layout === "string" ? options.layout : "list";
  const layout = ["list", "two", "three", "masonry"].includes(requestedLayout)
    ? requestedLayout
    : "list";
  const showDiagnostics = options.showDiagnostics !== false; // defaults to true
  const colorCards = options.colorCards !== false; // defaults to true
  const aiSummary = report?.ai_summary || null; // Extract AI summary from report
  const customerHeader = await buildCustomerHeader(title, overall, report);
  const customerSummary = await buildCustomerSummary(report, {
    layout,
    showDiagnostics,
    aiSummary,
  });
  const body = `
    ${customerHeader}
    ${customerSummary}
  `;
  const classes = [
    "customer-print",
    `layout-${layout}`,
    colorCards ? "" : "no-card-color",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="${classes}" data-layout="${layout}">${body}</div>`;
}

/**
 * Wrap technician markup in a standalone HTML document.
 * @param {ServiceReport} report
 * @param {HTMLElement} sectionsEl
 */
export function buildPrintableDocumentHtml(report, sectionsEl) {
  // Clone the sections element to avoid modifying the live DOM
  const clonedSections = sectionsEl.cloneNode(true);

  // Open all <details> elements for print (can't interact with dropdowns on paper!)
  const allDetails = clonedSections.querySelectorAll("details");
  allDetails.forEach((details) => {
    details.setAttribute("open", "");
  });

  const inner = buildPrintableHtml(report, clonedSections);
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
 * Wrap customer summary markup in a standalone HTML document.
 * @param {ServiceReport} report
 * @param {{ layout?: string, showDiagnostics?: boolean, colorCards?: boolean }} [options]
 */
export async function buildCustomerPrintDocumentHtml(report, options = {}) {
  const inner = await buildCustomerPrintHtml(report, options);
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
