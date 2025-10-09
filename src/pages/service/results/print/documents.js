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
 * @param {{ layout?: string }} [options]
 */
export function buildCustomerPrintHtml(report, options = {}) {
  const title = "Service Summary";
  const overall = String(report.overall_status || "").toLowerCase();
  const requestedLayout =
    typeof options.layout === "string" ? options.layout : "list";
  const layout = ["list", "two", "three", "masonry", "grouped"].includes(
    requestedLayout
  )
    ? requestedLayout
    : "list";
  const body = `
    ${buildCustomerHeader(title, overall, report)}
    ${buildCustomerSummary(report, layout)}
  `;
  return `<div class="customer-print layout-${layout}" data-layout="${layout}">${body}</div>`;
}

/**
 * Wrap technician markup in a standalone HTML document.
 * @param {ServiceReport} report
 * @param {HTMLElement} sectionsEl
 */
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
 * Wrap customer summary markup in a standalone HTML document.
 * @param {ServiceReport} report
 * @param {{ layout?: string }} [options]
 */
export function buildCustomerPrintDocumentHtml(report, options = {}) {
  const inner = buildCustomerPrintHtml(report, options);
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
