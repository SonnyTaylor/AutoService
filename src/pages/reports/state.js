// -----------------------------------------------------------------------------
// Reports/state
// -----------------------------------------------------------------------------
// Shared state, constants, and tiny DOM/helpers for the Reports page.
//
// This module is intentionally small and dependency-free so it can be imported
// by both the view and viewer layers without forming cycles.
// - expose a single mutable `state` object used by the page
// - provide a couple of DOM helpers used by other modules
// - centralize UI-related constants
// -----------------------------------------------------------------------------

/* global window, document */

/**
 * Tauri RPC helper
 *
 * We re-export `invoke` from Tauri so other modules can import it from here,
 * keeping cross-module imports simple and avoiding multiple global touches.
 */
export const { invoke } = window.__TAURI__.core;

/** CSS selector for the list container element on the Reports page. */
export const LIST_SELECTOR = ".reports-list";

/**
 * A saved report entry from the data/reports directory.
 * @typedef {Object} ReportItem
 * @property {string} folder_name - Folder name (e.g., "DESKTOP-PC_John_Doe__2025-10-12_14-30-45")
 * @property {string} folder_path - Full filesystem path to the folder
 * @property {Object|null} metadata - Parsed metadata.json content
 * @property {boolean} has_report_json - Whether report.json exists
 * @property {boolean} has_execution_log - Whether execution.log exists
 * @property {boolean} has_run_plan - Whether run_plan.json exists
 * @property {('local'|'network'|'both')} [source] - Where this report was found
 */

/**
 * View-model for the Reports page.
 * @typedef {Object} State
 * @property {ReportItem[]} all - Source list from backend
 * @property {ReportItem[]} filtered - Derived list after search/sort
 * @property {string} query - Current search text
 * @property {string} technicianFilter - Filter by technician name (empty string = all)
 * @property {"date-desc"|"date-asc"|"name-asc"|"name-desc"} sort - Sort key
 * @property {Object|null} viewing - Currently open report data (full loaded report)
 */

/** @type {State} */
export let state = {
  all: [],
  filtered: [],
  query: "",
  technicianFilter: "",
  sort: "date-desc",
  viewing: null,
};

/**
 * Tiny DOM helpers to keep the code terse and readable.
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {T|null}
 * @example
 * const list = /** @type {HTMLDivElement|null} *\/ ($(".reports-list"));
 */
export function $(sel, root = document) {
  return /** @type {T|null} */ (root.querySelector(sel));
}

/**
 * Query all matching elements.
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {T[]}
 * @example
 * const rows = /** @type {HTMLElement[]} *\/ ($all(".report-row"));
 */
export function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Escape a string for safe placement in HTML attributes/text.
 * @param {unknown} s
 * @returns {string}
 * @example
 * const safe = escapeHtml(userInput);
 */
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}
