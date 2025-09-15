/**
 * UI module for shortcuts page.
 * Handles rendering and DOM manipulation for shortcuts.
 */

/**
 * Renders the list of categories and their shortcuts into the DOM.
 * Clears the container and rebuilds the UI based on the provided categories.
 *
 * @param {Array} categoriesList - The list of categories to render.
 * @param {HTMLElement} shortcutsContainer - The DOM element to render into.
 */
export function renderShortcuts(categoriesList, shortcutsContainer) {
  shortcutsContainer.innerHTML = ""; // Clear existing content

  categoriesList.forEach((category) => {
    const categorySection = createCategorySection(category);
    shortcutsContainer.appendChild(categorySection);
  });
}

/**
 * Creates a DOM section element for a category, including its header and grid of shortcuts.
 *
 * @param {Object} category - The category object with title and items.
 * @param {string} category.title - The title of the category.
 * @param {Array} category.items - The list of shortcut items.
 * @returns {HTMLElement} The created section element.
 */
export function createCategorySection(category) {
  const section = document.createElement("section");
  section.className = "category";
  section.innerHTML = `
    <div class="category-header"><h2>${category.title}</h2></div>
    <div class="shortcut-grid"></div>
  `;

  const grid = section.querySelector(".shortcut-grid");
  category.items.forEach((item) => {
    const button = createShortcutButton(item);
    grid.appendChild(button);
  });

  return section;
}

/**
 * Creates a button element for a shortcut item, including icon, label, and click handler.
 *
 * @param {Object} item - The shortcut item with id, label, and icon.
 * @param {string} item.id - The unique identifier for the shortcut.
 * @param {string} item.label - The display label for the shortcut.
 * @param {string} item.icon - The Phosphor icon name.
 * @param {Function} onClick - The click handler function.
 * @returns {HTMLElement} The created button element.
 */
export function createShortcutButton(item, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shortcut-btn";
  button.title = item.label;
  // Allow text wrapping for better layout on smaller screens
  button.style.whiteSpace = "normal";
  button.style.wordBreak = "break-word";

  // Create and append the icon element
  const iconElement = document.createElement("i");
  const iconClass = convertIconNameToKebabCase(item.icon || "Gear");
  iconElement.className = `ph ph-${iconClass} ph-icon`;
  button.appendChild(iconElement);

  // Create and append the text span
  const textSpan = document.createElement("span");
  textSpan.textContent = item.label;
  button.appendChild(textSpan);

  // Add click event listener
  if (onClick) {
    button.addEventListener("click", onClick);
  }

  return button;
}

/**
 * Converts a PascalCase icon name to kebab-case for CSS class usage.
 *
 * @param {string} iconName - The icon name in PascalCase.
 * @returns {string} The icon name in kebab-case.
 */
export function convertIconNameToKebabCase(iconName) {
  return iconName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
