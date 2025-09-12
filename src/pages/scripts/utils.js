/**
 * Utility functions for the scripts page.
 */

/**
 * Selects a single element from the DOM.
 * @param {string} selector - CSS selector string.
 * @param {Element} [root=document] - Root element to search in.
 * @returns {Element|null} The selected element or null if not found.
 */
export function $(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Selects all elements matching the selector from the DOM.
 * @param {string} selector - CSS selector string.
 * @param {Element} [root=document] - Root element to search in.
 * @returns {Array<Element>} Array of selected elements.
 */
export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        char
      ])
  );
}

/**
 * Returns a display string for the script's source (path, URL, or inline command).
 * @param {Object} script - The script object.
 * @returns {string} Display string for the script source.
 */
export function displayPathOrCmd(script) {
  if (script.source === "file") return script.path || "";
  if (script.source === "link") return script.url || "";
  return (script.inline || "").slice(0, 140).replace(/\s+/g, " ");
}

/**
 * Confirms removal of a script with the user using a dialog.
 * @param {string} name - The name of the script to remove.
 * @returns {boolean} True if the user confirmed, false otherwise.
 */
export async function confirmRemove(name) {
  const tauriConfirm = window.__TAURI__?.dialog?.confirm;
  if (tauriConfirm) {
    try {
      return await tauriConfirm(`Remove ${name}?`, { title: "Confirm" });
    } catch (error) {
      // Fall back to browser confirm if Tauri dialog fails
    }
  }
  return window.confirm(`Remove ${name}?`);
}