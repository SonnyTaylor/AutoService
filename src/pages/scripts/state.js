/**
 * State management for the scripts page.
 */

const { invoke } = window.__TAURI__.core;

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
 */
export async function loadScripts() {
  state.all = await invoke("list_scripts");
  applyFilter();
}

/**
 * Applies search filter and sorting to the scripts list.
 * Updates state.filtered and re-renders the list.
 */
export function applyFilter() {
  const searchQuery = state.query.trim().toLowerCase();
  let filteredScripts = searchQuery
    ? state.all.filter((script) =>
        `${script.name} ${script.description} ${script.version}`
          .toLowerCase()
          .includes(searchQuery)
      )
    : [...state.all];

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
