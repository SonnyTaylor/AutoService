import { extractCustomerMetrics } from "./metrics.js";
import { getBusinessSettings } from "../../../../utils/business.js";

const CUSTOMER_LAYOUTS = new Set(["list", "two", "three", "masonry"]);

function normalizeLayout(layout) {
  return CUSTOMER_LAYOUTS.has(layout) ? layout : "list";
}

function renderMetricCard(metric) {
  return `
          <div class="metric-card ${metric.variant || "info"}" data-variant="${
    metric.variant || "info"
  }">
            <div class="metric-icon">${metric.icon}</div>
            <div class="metric-content">
              <div class="metric-label">${metric.label}</div>
              <div class="metric-value">${metric.value}</div>
              ${
                metric.detail
                  ? `<div class="metric-detail">${metric.detail}</div>`
                  : ""
              }
              ${
                metric.items && metric.items.length > 0
                  ? `
                <ul class="metric-items">
                  ${metric.items.map((item) => `<li>${item}</li>`).join("")}
                </ul>
              `
                  : ""
              }
            </div>
          </div>
        `;
}

/**
 * @typedef {import('./types').ServiceReport} ServiceReport
 */

/**
 * Build customer-friendly header markup.
 * @param {string} title
 * @param {string} overall
 * @param {ServiceReport} report
 */
export async function buildCustomerHeader(title, overall, report) {
  const dt = new Date();
  const date = dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const tasks = Array.isArray(report?.results) ? report.results.length : 0;
  const hostname = report?.summary?.hostname || report?.hostname || "";
  const statusText =
    overall === "success" ? "All Tasks Successful" : "Service Completed";

  const quickFacts = [`${tasks} task${tasks === 1 ? "" : "s"}`, date];

  // Get business settings for branding
  const business = await getBusinessSettings();
  const showBranding = business.enabled && (business.name || business.logo);

  // Use business name if provided, otherwise default to AutoService
  const companyName = business.name || "AutoService";

  // Logo is stored as base64 data URL, use directly
  const logoUrl = business.logo;

  // Build business info lines (only show if business mode enabled and field has value)
  const businessInfoLines = [];
  if (showBranding) {
    if (business.address) businessInfoLines.push(business.address);
    if (business.phone) businessInfoLines.push(business.phone);
    if (business.email) businessInfoLines.push(business.email);
    if (business.website) businessInfoLines.push(business.website);

    // Tax identifiers on same line if both present
    const taxInfo = [];
    if (business.tfn) taxInfo.push(`TFN: ${business.tfn}`);
    if (business.abn) taxInfo.push(`ABN: ${business.abn}`);
    if (taxInfo.length > 0) businessInfoLines.push(taxInfo.join(" | "));
  }

  // Build the header layout - logo on left, info on right (compact)
  const brandingMarkup = showBranding
    ? `
      <div class="business-branding">
        ${
          logoUrl
            ? `<div class="logo-container">
              <img src="${logoUrl}" alt="${companyName}" class="company-logo" />
            </div>`
            : ""
        }
        <div class="business-info">
          <h1 class="company-name">${companyName}</h1>
          ${businessInfoLines
            .map((line) => `<div class="info-line">${line}</div>`)
            .join("")}
        </div>
      </div>
    `
    : `
      <div class="default-branding">
        <h1 class="company-name">${companyName}</h1>
        <div class="tagline">Customer Service Summary</div>
      </div>
    `;

  return `
    <div class="customer-header">
      ${brandingMarkup}
      <div class="header-meta">
        <span class="status-badge ${
          overall === "success" ? "success" : "info"
        }">${statusText}</span>
        <div class="meta-lines">
          <span>${quickFacts.join(" • ")}</span>
          ${hostname ? `<span>Device: ${hostname}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

/**
 * Build the customer-facing summary content.
 * @param {ServiceReport} report
 */
export function buildCustomerSummary(report, layout = "list") {
  const resolvedLayout = normalizeLayout(layout);
  const results = report?.results || [];
  const metrics = extractCustomerMetrics(results);

  const listClass = `layout-${resolvedLayout}`;

  const metricsMarkup = metrics
    .map((metric) => renderMetricCard(metric))
    .join("");

  return `
    <div class="customer-summary ${listClass}" data-layout="${resolvedLayout}">
      <h3 class="section-heading">Service Highlights</h3>
      <p class="intro-text">
        Here's a concise overview of the maintenance completed during your visit.
      </p>

      <div class="metrics-list ${listClass}">
        ${metricsMarkup}
      </div>
      <div class="footer-note">
        <p><strong>Thank you for choosing AutoService.</strong></p>
        <p class="small-print">Need the technical breakdown? Your technician can provide the detailed report on request.</p>
      </div>
    </div>
  `;
}
