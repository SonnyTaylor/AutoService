/**
 * Handlers module for shortcuts page.
 * Contains filtering logic and event handler setup.
 */

import { CATEGORIES } from "./data.js";
import Fuse from "fuse.js";

// Build a fuzzy search index over all shortcut items across categories
const FUSE_ITEMS = CATEGORIES.flatMap((category, catIdx) =>
  category.items.map((item, itemIdx) => ({
    catIdx,
    itemIdx,
    categoryTitle: category.title,
    id: item.id,
    label: item.label,
  }))
);

let fuse = new Fuse(FUSE_ITEMS, {
  keys: [
    { name: "label", weight: 0.7 },
    { name: "id", weight: 0.2 },
    { name: "categoryTitle", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
});

/**
 * Filters the categories based on a search query.
 * Returns categories that have items matching the query (case-insensitive).
 *
 * @param {string} query - The search query string.
 * @returns {Array} The filtered list of categories.
 */
export function filterCategoriesByQuery(query) {
  const q = String(query || "").trim();
  if (!q) return CATEGORIES;

  const results = fuse.search(q);
  // Group matched items back into their categories, preserving category order
  const byCat = new Map();
  for (const r of results) {
    const { catIdx, itemIdx } = r.item;
    const cat = CATEGORIES[catIdx];
    const item = cat.items[itemIdx];
    if (!byCat.has(catIdx)) byCat.set(catIdx, { title: cat.title, items: [] });
    byCat.get(catIdx).items.push(item);
  }
  // Preserve original category order
  const out = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    const grp = byCat.get(i);
    if (grp && grp.items.length) out.push(grp);
  }
  return out;
}

/**
 * Sets up event listeners for search functionality.
 *
 * @param {HTMLElement} searchInput - The search input element.
 * @param {HTMLElement} clearSearchButton - The clear search button element.
 * @param {HTMLElement} shortcutsContainer - The container for shortcuts.
 * @param {Function} renderFunction - The function to render shortcuts.
 */
export function setupSearchHandlers(
  searchInput,
  clearSearchButton,
  shortcutsContainer,
  renderFunction
) {
  // Set up search input event listener for dynamic filtering
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const filteredCategories = filterCategoriesByQuery(searchInput.value);
      renderFunction(filteredCategories, shortcutsContainer);
    });
  }

  // Set up clear search button event listener
  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      renderFunction(CATEGORIES, shortcutsContainer);
      searchInput.focus();
    });
  }
}
