/**
 * State management for the scripts page.
 */

const { invoke } = window.__TAURI__.core;
import Fuse from "fuse.js";
import { refreshWithCache, clearCache } from "../../utils/page-cache.js";

const SCRIPTS_CACHE_KEY = "scripts.cache.v1";

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
  editing: null,
};

/**
 * Loads all scripts from the backend and applies the current filter.
 * @param {boolean} [force=false] - When true, bypass cache and refresh
 */
export async function loadScripts(force = false) {
  // Load with caching: show cached data immediately, refresh in background
  await refreshWithCache({
    cacheKey: SCRIPTS_CACHE_KEY,
    version: "v1",
    fetchFn: async () => {
      return await invoke("list_scripts");
    },
    onCached: (cached) => {
      // Show cached data immediately
      state.all = cached;
      buildFuseIndex();
      applyFilter();
    },
    onFresh: (fresh) => {
      // Update with fresh data if changed
      state.all = fresh;
      buildFuseIndex();
      applyFilter();
    },
    force,
  });
}

/**
 * Clear the scripts cache (used when scripts are saved/deleted)
 */
export function clearScriptsCache() {
  clearCache(SCRIPTS_CACHE_KEY);
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

  // Determine existence for file-based scripts
  filteredScripts.forEach((script) => {
    if (script.source === "file") {
      script.exists = !!script.path_exists;
    } else {
      script.exists = true;
    }
  });

  state.filtered = filteredScripts;
}

// --- Fuzzy Search Index -----------------------------------------------------
let fuse = null;
function buildFuseIndex() {
  const items = state.all.map((s) => ({
    id: s.id,
    name: s.name || "",
    description: s.description || "",
    path: s.path || s.exe_path || "",
    command: s.command || "",
    raw: s,
  }));
  fuse = new Fuse(items, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "description", weight: 0.3 },
      { name: "path", weight: 0.05 },
      { name: "command", weight: 0.05 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  // Map Fuse items back to current state.all by id in case the array mutates
  fuse.search = ((origSearch) => (query) => {
    const res = origSearch.call(fuse, query);
    return res.map((r) => ({ ...r, item: state.all.find((s) => s.id === r.item.id) || r.item.raw }));
  })(fuse.search);
}
