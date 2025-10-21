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
  const technicianName = metadata?.technician_name;
  const timestamp = metadata?.timestamp || 0;
  const dateStr = formatReportDate(timestamp);

  // Determine status badge (we'll need to load report to get actual status)
  // For now, just show if files exist
  const hasFiles = item.has_report_json;
  const sourceBadge =
    item.source === "network"
      ? '<span class="badge info" title="Network"><i class="ph ph-wifi-high"></i> Net</span>'
      : item.source === "both"
      ? '<span class="badge ok" title="Local + Network"><i class="ph ph-file-cloud"></i> Both</span>'
      : '<span class="badge" title="Local"><i class="ph ph-desktop"></i> Local</span>';

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
          ${
            technicianName
              ? `<span class="badge tech"><i class="ph ph-user"></i> ${escapeHtml(
                  technicianName
                )}</span>`
              : ""
          }
          ${
            item.has_execution_log
              ? '<span class="badge"><i class="ph ph-clipboard-text"></i> Log</span>'
              : ""
          }
          ${
            item.has_run_plan
              ? '<span class="badge"><i class="ph ph-file-text"></i> Plan</span>'
              : ""
          }
          ${sourceBadge}
        </div>
      </div>
      <div class="report-actions">
        <button data-action="view" class="primary" ${
          !hasFiles ? "disabled" : ""
        }>View</button>
      <button data-action="open" class="ghost" title="Open folder in file explorer">
          <i class="ph ph-folder-open"></i> Open
        </button>
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
    // Load local reports
    const local = await invoke("list_reports");
    // Try network when enabled
    let merged = local.map((r) => ({ ...r, source: "local" }));
    try {
      const settings = await invoke("load_app_settings");
      const ns = settings?.network_sharing;
      const enabled =
        ns?.enabled !== undefined ? !!ns?.enabled : !!ns?.unc_path;
      const unc = ns?.unc_path || "";
      if (enabled && unc) {
        const network = await invoke("list_network_reports", {
          uncPath: unc,
          unc_path: unc,
        });
        // Deduplicate by folder_name; prefer the one with newer metadata.timestamp; mark 'both' if same exists
        const byName = new Map();
        merged.forEach((r) => byName.set(r.folder_name, r));
        for (const n of network) {
          const existing = byName.get(n.folder_name);
          if (!existing) {
            byName.set(n.folder_name, { ...n, source: "network" });
          } else {
            // Compare timestamps
            const tA = existing.metadata?.timestamp || 0;
            const tB = n.metadata?.timestamp || 0;
            if (tB > tA) {
              byName.set(n.folder_name, { ...n, source: "both" });
            } else {
              byName.set(existing.folder_name, { ...existing, source: "both" });
            }
          }
        }
        merged = Array.from(byName.values());
      }
    } catch (e) {
      console.warn("Network reports unavailable:", e);
    }
    state.all = merged;
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
 * Apply current search query, technician filter, and sort order to derive filtered list
 */
export function applyFilter() {
  const q = state.query.trim();
  const tech = state.technicianFilter.trim();
  let base;

  // Start with all or search results using improved custom search
  if (q) {
    base = customSearch(q);
  } else {
    base = [...state.all];
  }

  // Apply technician filter
  if (tech) {
    base = base.filter((item) => {
      const itemTech = item.metadata?.technician_name || "";
      return itemTech === tech;
    });
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
    keys: [
      { name: "hostname", weight: 2 },
      { name: "customer_name", weight: 2 },
      { name: "technician_name", weight: 2 },
    ],
    threshold: 0.3, // Slightly more lenient for multi-word searches
    distance: 200, // Allow more distance for multi-word matches
    minMatchCharLength: 1, // Allow single character matches (for initials)
    ignoreLocation: true,
    useExtendedSearch: false,
    findAllMatches: true, // Find all matching instances
    shouldSort: true,
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
 * Custom search that handles multi-word queries better than Fuse alone
 * @param {string} query - Search query
 * @returns {Array} Filtered items
 */
function customSearch(query) {
  const lowerQuery = query.toLowerCase().trim();

  // If query is empty, return all
  if (!lowerQuery) {
    return state.all;
  }

  // First, try exact substring matching (case-insensitive)
  const exactMatches = state.all.filter((item) => {
    const hostname = (item.metadata?.hostname || "").toLowerCase();
    const customerName = (item.metadata?.customer_name || "").toLowerCase();
    const technicianName = (item.metadata?.technician_name || "").toLowerCase();

    return (
      hostname.includes(lowerQuery) ||
      customerName.includes(lowerQuery) ||
      technicianName.includes(lowerQuery)
    );
  });

  // If we found exact matches, return them
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // Fall back to fuzzy search with Fuse.js for typo tolerance
  if (!fuse) buildFuseIndex();
  const fuseResults = fuse.search(lowerQuery);
  return fuseResults;
}

/**
 * Wire up toolbar event handlers (search, sort, technician filter)
 */
export function wireToolbar() {
  const searchInput = $("#report-search");
  const sortSelect = $("#report-sort");
  const technicianFilter = $("#report-technician-filter");

  searchInput?.addEventListener("input", (e) => {
    state.query = e.target.value;
    applyFilter();
  });

  sortSelect?.addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyFilter();
  });

  technicianFilter?.addEventListener("change", (e) => {
    state.technicianFilter = e.target.value;
    applyFilter();
  });

  // Load and populate technician filter from settings
  loadTechnicianFilter();
}

/**
 * Load technician names from settings and populate the filter dropdown
 */
async function loadTechnicianFilter() {
  try {
    const settings = await invoke("load_app_settings");
    const technicianNames = settings?.business?.technician_names || [];

    // Get unique technicians from reports
    const reportTechnicians = new Set();
    state.all.forEach((item) => {
      const tech = item.metadata?.technician_name;
      if (tech) reportTechnicians.add(tech);
    });

    // Combine both sources (settings and actual report data)
    const allTechnicians = new Set([
      ...technicianNames,
      ...Array.from(reportTechnicians),
    ]);

    // Sort alphabetically
    const sortedTechnicians = Array.from(allTechnicians).sort((a, b) =>
      a.localeCompare(b)
    );

    // Populate dropdown
    const technicianFilter = $("#report-technician-filter");
    if (technicianFilter && sortedTechnicians.length > 0) {
      // Keep the "All Technicians" option and add individual technicians
      const options = sortedTechnicians
        .map(
          (tech) =>
            `<option value="${escapeHtml(tech)}">${escapeHtml(tech)}</option>`
        )
        .join("");

      technicianFilter.innerHTML = `<option value="">All Technicians</option>${options}`;
    }
  } catch (error) {
    console.error("Failed to load technician filter:", error);
  }
}

/**
 * Wire up list action handlers (view, delete, open)
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
    } else if (action === "open") {
      try {
        if (item.source === "network" && item.folder_path) {
          await invoke("open_absolute_path", { path: item.folder_path });
        } else {
          await invoke("open_report_folder", { folderName });
        }
      } catch (error) {
        alert(`Failed to open folder: ${error}`);
      }
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
