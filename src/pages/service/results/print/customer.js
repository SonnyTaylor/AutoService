import {
  extractCustomerMetrics,
  buildCustomerTaskList,
  generateRecommendations,
} from "./metrics.js";

/**
 * @typedef {import('./types').ServiceReport} ServiceReport
 */

/**
 * Build customer-friendly header markup.
 * @param {string} title
 * @param {string} overall
 * @param {ServiceReport} report
 */
export function buildCustomerHeader(title, overall, report) {
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

  return `
    <div class="customer-header">
      <div class="company-info">
        <h1 class="company-name">AutoService</h1>
        <div class="tagline">Professional Computer Maintenance</div>
      </div>
      <div class="service-meta">
        <div class="status-badge ${
          overall === "success" ? "success" : "info"
        }">${statusText}</div>
        <div class="date-info">${date}</div>
      </div>
    </div>
  `;
}

/**
 * Build the customer-facing summary content.
 * @param {ServiceReport} report
 */
export function buildCustomerSummary(report) {
  const results = report?.results || [];
  const metrics = extractCustomerMetrics(results);

  return `
    <div class="customer-summary">
      <h3 class="section-heading">Results</h3>
      <p class="intro-text">
        Your computer has been serviced and the following maintenance tasks have been completed:
      </p>
      
      <div class="metrics-list">
        ${metrics
          .map(
            (m) => `
          <div class="metric-card ${m.variant}">
            <div class="metric-icon">${m.icon}</div>
            <div class="metric-content">
              <div class="metric-label">${m.label}</div>
              <div class="metric-value">${m.value}</div>
              ${m.detail ? `<div class="metric-detail">${m.detail}</div>` : ""}
              ${
                m.items && m.items.length > 0
                  ? `
                <ul class="metric-items">
                  ${m.items.map((item) => `<li>${item}</li>`).join("")}
                </ul>
              `
                  : ""
              }
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      
      <div class="footer-note">
        <p><strong>Thank you for choosing AutoService!</strong></p>
        <p class="small-print">For technical details, please refer to the detailed technician report or ask your technician.</p>
      </div>
    </div>
  `;
}
