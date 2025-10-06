/**
 * @typedef {import('./types').ServiceReport} ServiceReport
 */

/**
 * Build the technician-facing print header.
 * @param {string} title
 * @param {string} overall
 * @param {ServiceReport} report
 */
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
