// -----------------------------------------------------------------------------
// Programs/state
// -----------------------------------------------------------------------------
// Shared state, constants, and tiny DOM/helpers for the Programs page.
//
// This module is intentionally small and dependency-free so it can be imported
// by both the view and editor layers without forming cycles.
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

/** CSS selector for the list container element on the Programs page. */
export const LIST_SELECTOR = ".programs-list";
/**
 * Fallback logo shown when a program has no extracted or provided logo.
 * Uses Phosphor Icons class names (e.g., "ph ph-wrench").
 */
export const DEFAULT_LOGO = "ph ph-wrench";

/**
 * A portable tool or installer entry managed by the Programs page.
 * @typedef {Object} Program
 * @property {string} id Stable unique id used as the primary key.
 * @property {string} name Display name shown in the list.
 * @property {string} [version] Optional version string.
 * @property {string} [description] Optional free-form description.
 * @property {string} exe_path Full path to the program executable (.exe).
 * @property {boolean} [exe_exists] Whether `exe_path` currently exists.
 * @property {number} [launch_count] Number of times launched via this app.
 * @property {string} [logo_data_url] Image data URL for the program logo.
 */

/**
 * View-model for the Programs page.
 * @typedef {Object} State
 * @property {Program[]} all Source list from backend.
 * @property {Program[]} filtered Derived list after search/sort.
 * @property {string} query Current search text.
 * @property {"name-asc"|"name-desc"|"used-asc"|"used-desc"} sort Sort key.
 * @property {Program|null} editing Program currently in the editor, or null.
 */

/** @type {State} */
export let state = {
  all: [],
  filtered: [],
  query: "",
  sort: "used-desc",
  editing: null,
};

/**
 * Tiny DOM helpers to keep the code terse and readable.
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {T|null}
 * @example
 * const list = /** @type {HTMLDivElement|null} *\/ ($(".programs-list"));
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
 * const rows = /** @type {HTMLElement[]} *\/ ($all(".program-row"));
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

/**
 * Infer a program name from an executable path.
 * Example: C:\\Apps\\FooBar.exe -> FooBar
 * @param {string} path
 * @returns {string}
 * @example
 * inferNameFromPath("C:/Tools/FooBar.exe") // => "FooBar"
 */
export function inferNameFromPath(path) {
  const base = path.split(/[\\\/]/).pop() || "";
  return base.replace(/\.exe$/i, "");
}
