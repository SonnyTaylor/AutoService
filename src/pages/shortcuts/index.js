/**
 * Main module for the Shortcuts page.
 * Initializes the page by setting up UI, event listeners, and rendering shortcuts.
 */

import { CATEGORIES } from "./data.js";
import { renderShortcuts, createShortcutButton } from "./ui.js";
import { setupSearchHandlers } from "./handlers.js";

/**
 * Initializes the Shortcuts page by setting up the UI, event listeners, and rendering shortcuts.
 * This function handles the display of categorized Windows system tools and utilities,
 * provides search functionality, and manages the invocation of shortcuts via Tauri backend.
 *
 * @async
 * @returns {Promise<void>} Resolves when the page initialization is complete.
 */
export async function initPage() {
  const { invoke } = window.__TAURI__.core;

  // DOM elements for the shortcuts list, search input, and clear button
  const shortcutsContainer = document.getElementById("shortcut-list");
  const searchInput = document.getElementById("shortcut-search");
  const clearSearchButton = document.getElementById("clear-search");
  const totalCountEl = document.getElementById("shortcuts-total");
  const categoryCountEl = document.getElementById("shortcuts-cat-count");
  const lastLaunchEl = document.getElementById("shortcuts-last-launch");

  const state = {
    lastLaunch: null,
  };

  /**
   * Handles the click event for a shortcut button.
   * Invokes the shortcut via Tauri backend and manages button state.
   *
   * @param {Object} item - The shortcut item.
   * @param {string} item.id - The shortcut ID.
   * @param {string} item.label - The shortcut label.
   * @param {HTMLButtonElement} button - The button element.
   */
  const handleShortcutClick = async (item, button) => {
    button.disabled = true; // Disable button during invocation
    try {
      await invoke("launch_shortcut", { id: item.id });
      state.lastLaunch = item.label;
      currentCategories = renderShortcutsWithHandlers(CATEGORIES);
    } catch (error) {
      console.error("Error launching shortcut:", error);
      alert(`Failed to launch: ${item.label}`);
    } finally {
      button.disabled = false; // Re-enable button
    }
  };

  /**
   * Renders shortcuts with click handlers.
   * Wraps the renderShortcuts function to add event listeners.
   *
   * @param {Array} categoriesList - The list of categories to render.
   */
  const renderShortcutsWithHandlers = (categoriesList) => {
    const filteredCategories = categoriesList.filter(
      (category) => category.items.length
    );

    shortcutsContainer.innerHTML = ""; // Clear existing content

    filteredCategories.forEach((category) => {
      const section = document.createElement("section");
      section.className = "category";
      section.innerHTML = `
        <div class="category-header"><h2>${category.title}</h2></div>
        <div class="shortcut-grid"></div>
      `;

      const grid = section.querySelector(".shortcut-grid");
      category.items.forEach((item) => {
        const button = createShortcutButton(item, () =>
          handleShortcutClick(item, button)
        );
        grid.appendChild(button);
      });

      shortcutsContainer.appendChild(section);
    });

    const totalShortcuts = filteredCategories.reduce(
      (sum, category) => sum + category.items.length,
      0
    );
    if (totalCountEl) totalCountEl.textContent = String(totalShortcuts);
    if (categoryCountEl)
      categoryCountEl.textContent = String(filteredCategories.length);
    if (lastLaunchEl) lastLaunchEl.textContent = state.lastLaunch ?? "—";

    return filteredCategories;
  };

  // Initial render of all categories
  let currentCategories = renderShortcutsWithHandlers(CATEGORIES);

  // Set up search handlers
  setupSearchHandlers(
    searchInput,
    clearSearchButton,
    shortcutsContainer,
    renderShortcutsWithHandlers
  );
}
