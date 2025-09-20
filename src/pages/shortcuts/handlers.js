/**
 * Handlers module for shortcuts page.
 * Contains filtering logic and event handler setup.
 */

import { CATEGORIES } from "./data.js";

/**
 * Filters the categories based on a search query.
 * Returns categories that have items matching the query (case-insensitive).
 *
 * @param {string} query - The search query string.
 * @returns {Array} The filtered list of categories.
 */
export function filterCategoriesByQuery(query) {
  if (!query) return CATEGORIES;

  const lowerQuery = query.toLowerCase();
  return CATEGORIES.map((category) => ({
    title: category.title,
    items: category.items.filter((item) =>
      item.label.toLowerCase().includes(lowerQuery)
    ),
  })).filter((category) => category.items.length > 0);
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
