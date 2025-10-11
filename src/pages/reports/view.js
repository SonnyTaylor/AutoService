// -----------------------------------------------------------------------------
// Reports/view
// -----------------------------------------------------------------------------
// Renders the Reports list and wires the toolbar and list actions.
// Responsibilities:
// - Render list items from state.filtered
// - Apply search and sort to derive the filtered list
// - Wire toolbar events (search, sort)
// - Handle per-row actions (view, delete)
// This module stays UI-focused and delegates viewing to viewer.js.
// -----------------------------------------------------------------------------
import { invoke, state, LIST_SELECTOR, $, escapeHtml } from "./state.js";
import { openViewer } from "./viewer.js";
import { formatReportDate } from "../../utils/reports.js";
import Fuse from "fuse.js";

let fuse = null;

/**
 * Render a single report row as HTML.
 * @param {import('./state.js').ReportItem} item - Report item to render
 * @returns {string} HTML string for the row
 */
function renderReportRow(item) {
  const { folder_name, metadata } = item;
  const hostname = metadata?.hostname || "Unknown PC";
  const customerName = metadata?.customer_name;
  const timestamp = metadata?.timestamp || 0;
  const dateStr = formatReportDate(timestamp);

  // Determine status badge (we'll need to load report to get actual status)
  // For now, just show if files exist
  const hasFiles = item.has_report_json;

  return `
    <div class="report-row" data-folder="${escapeHtml(folder_name)}">
      <div class="report-icon">
        <i class="ph ph-file-text"></i>
        ${
          hasFiles
            ? '<span class="status-badge exists">✓</span>'
            : '<span class="status-badge missing">!</span>'
        }
      </div>
      <div class="report-main">
        <div class="report-title">
          <span class="hostname">${escapeHtml(hostname)}</span>
          ${
            customerName
              ? `<span class="customer">— ${escapeHtml(customerName)}</span>`
              : ""
          }
        </div>
        <div class="report-meta muted">
          <span class="date">${escapeHtml(dateStr)}</span>
          ${item.has_execution_log ? '<span class="badge">Log</span>' : ""}
          ${item.has_run_plan ? '<span class="badge">Plan</span>' : ""}
        </div>
      </div>
      <div class="report-actions">
        <button data-action="view" class="primary" ${
          !hasFiles ? "disabled" : ""
        }>View</button>
        <button data-action="delete" class="ghost">Delete</button>
      </div>
    </div>`;
}

/**
 * Render the list of reports to the DOM
 */
export function renderList() {
  const list = /** @type {HTMLElement|null} */ ($(LIST_SELECTOR));
  if (!list) return;

  const items = state.filtered;
  if (!items.length) {
    list.innerHTML =
      '<div class="muted">No reports found. Reports will appear here after you save them from the Service Results page.</div>';
    return;
  }

  list.innerHTML = items.map(renderReportRow).join("");
}

/**
 * Load all reports from the backend and refresh the view
 */
export async function loadReports() {
  try {
    state.all = await invoke("list_reports");
    buildFuseIndex();
    applyFilter();
  } catch (error) {
    console.error("Failed to load reports:", error);
    const list = $(LIST_SELECTOR);
    if (list) {
      list.innerHTML = `<div class="muted error">Failed to load reports: ${error}</div>`;
    }
  }
}

/**
 * Apply current search query and sort order to derive filtered list
 */
export function applyFilter() {
  const q = state.query.trim();
  let base;

  if (q) {
    if (!fuse) buildFuseIndex();
    const results = fuse.search(q);
    base = results.map((r) => r.item);
  } else {
    base = [...state.all];
  }

  // Sort
  switch (state.sort) {
    case "date-desc":
      base.sort(
        (a, b) => (b.metadata?.timestamp || 0) - (a.metadata?.timestamp || 0)
      );
      break;
    case "date-asc":
      base.sort(
        (a, b) => (a.metadata?.timestamp || 0) - (b.metadata?.timestamp || 0)
      );
      break;
    case "name-asc":
      base.sort((a, b) =>
        (a.metadata?.hostname || "").localeCompare(b.metadata?.hostname || "")
      );
      break;
    case "name-desc":
      base.sort((a, b) =>
        (b.metadata?.hostname || "").localeCompare(a.metadata?.hostname || "")
      );
      break;
  }

  state.filtered = base;
  renderList();
}

/**
 * Build Fuse.js search index from all reports
 */
function buildFuseIndex() {
  const items = state.all.map((item) => ({
    folder_name: item.folder_name,
    hostname: item.metadata?.hostname || "",
    customer_name: item.metadata?.customer_name || "",
    technician_name: item.metadata?.technician_name || "",
  }));

  fuse = new Fuse(items, {
    keys: ["hostname", "customer_name", "technician_name"],
    threshold: 0.3,
    ignoreLocation: true,
  });

  // Map Fuse items back to the original report objects
  fuse.search = ((origSearch) => (query) => {
    const res = origSearch.call(fuse, query);
    return res
      .map((r) =>
        state.all.find((item) => item.folder_name === r.item.folder_name)
      )
      .filter(Boolean);
  })(fuse.search);
}

/**
 * Wire up toolbar event handlers (search, sort)
 */
export function wireToolbar() {
  const searchInput = $("#report-search");
  const sortSelect = $("#report-sort");

  searchInput?.addEventListener("input", (e) => {
    state.query = e.target.value;
    applyFilter();
  });

  sortSelect?.addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyFilter();
  });
}

/**
 * Wire up list action handlers (view, delete)
 */
export function wireListActions() {
  const list = $(LIST_SELECTOR);
  if (!list) return;

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const row = btn.closest(".report-row");
    const folderName = row?.dataset.folder;
    if (!folderName) return;

    const item = state.all.find((r) => r.folder_name === folderName);
    if (!item) return;

    const action = btn.dataset.action;

    if (action === "view") {
      if (!item.has_report_json) {
        alert("Report file is missing or corrupted.");
        return;
      }
      await openViewer(item);
    } else if (action === "delete") {
      const confirmMsg = item.metadata?.customer_name
        ? `Delete report for ${item.metadata.hostname} - ${item.metadata.customer_name}?`
        : `Delete report for ${item.metadata?.hostname || "Unknown PC"}?`;

      if (confirm(confirmMsg)) {
        try {
          btn.disabled = true;
          btn.textContent = "Deleting...";
          await invoke("delete_report", { folderName });
          await loadReports();
        } catch (error) {
          alert(`Failed to delete report: ${error}`);
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      }
    }
  });
}
