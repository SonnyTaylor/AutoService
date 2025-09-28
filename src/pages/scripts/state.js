/**
 * State management for the scripts page.
 */

const { invoke } = window.__TAURI__.core;
import Fuse from "fuse.js";

/**
 * Application state for scripts management.
 * @typedef {Object} ScriptsState
 * @property {Array<Object>} all - All loaded scripts from the backend.
 * @property {Array<Object>} filtered - Filtered and sorted scripts for display.
 * @property {string} query - Current search query string.
 * @property {string} sort - Current sort order ('name-asc', 'name-desc', 'used-asc', 'used-desc').
 * @property {Object|null} editing - Currently editing script object, or null if not editing.
 */
/** @type {ScriptsState} */
export const state = {
  all: [],
  filtered: [],
  query: "",
  sort: "name-asc",
  filter: "all",
  editing: null,
};

/**
 * Loads all scripts from the backend and applies the current filter.
 */
export async function loadScripts() {
  const scripts = await invoke("list_scripts");
  state.all = scripts.map((script) => ({
    ...script,
    exists: script.source === "file" ? !!script.path_exists : true,
  }));
  buildFuseIndex();
  applyFilter();
}

/**
 * Applies search filter and sorting to the scripts list.
 * Updates state.filtered and re-renders the list.
 */
export function applyFilter() {
  const searchQuery = state.query.trim();
  let filteredScripts;
  if (searchQuery) {
    if (!fuse) buildFuseIndex();
    const results = fuse.search(searchQuery);
    filteredScripts = results.map((r) => r.item);
  } else {
    filteredScripts = [...state.all];
  }

  const sortOrder = state.sort;
  filteredScripts.sort((a, b) => {
    switch (sortOrder) {
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "", undefined, {
          sensitivity: "base",
        });
      case "used-desc":
        return (b.run_count || 0) - (a.run_count || 0);
      case "used-asc":
        return (a.run_count || 0) - (b.run_count || 0);
      case "name-asc":
      default:
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        });
    }
  });

  if (state.filter && state.filter !== "all") {
    filteredScripts = filteredScripts.filter(
      (script) => (script.source || "file") === state.filter
    );
  }

  state.filtered = filteredScripts;
}

// --- Fuzzy Search Index -----------------------------------------------------
let fuse = null;
function buildFuseIndex() {
  const items = state.all.map((s) => ({
    id: s.id,
    name: s.name || "",
    description: s.description || "",
    version: s.version || "",
    path: s.path || s.exe_path || "",
    command: s.command || "",
    raw: s,
  }));
  fuse = new Fuse(items, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "description", weight: 0.25 },
      { name: "version", weight: 0.08 },
      { name: "path", weight: 0.04 },
      { name: "command", weight: 0.03 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  // Map Fuse items back to current state.all by id in case the array mutates
  fuse.search = ((origSearch) => (query) => {
    const res = origSearch.call(fuse, query);
    return res.map((r) => ({
      ...r,
      item: state.all.find((s) => s.id === r.item.id) || r.item.raw,
    }));
  })(fuse.search);
}
