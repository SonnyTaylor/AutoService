/**
 * Rendering functions for the scripts page.
 */

import { $, escapeHtml, displayPathOrCmd } from "./utils.js";
import { state } from "./state.js";

/**
 * Renders the list of filtered scripts in the UI.
 * Updates the scripts-list element with script items and wires event handlers for actions.
 */
export function renderList() {
  const listElement = $(".scripts-list");
  if (!listElement) return;

  const scripts = state.filtered;
  if (!scripts.length) {
    listElement.innerHTML =
      '<div class="muted">No scripts yet. Click "Add" to create one.</div>';
    return;
  }

  listElement.innerHTML = scripts
    .map(
      (script) => `
    <div class="program-row" data-id="${script.id}">
      <div class="program-logo-wrap"></div>
      <div class="program-main">
        <div class="program-title" title="${escapeHtml(script.name)}">
          <span class="name">${escapeHtml(script.name)}</span>
          <span class="muted usage" title="Times run">(${
            script.run_count || 0
          })</span>
        </div>
        <div class="program-desc" title="${escapeHtml(
          script.description || ""
        )}">${escapeHtml(script.description || "")}</div>
        <div class="program-path muted" title="${escapeHtml(
          displayPathOrCmd(script)
        )}">${escapeHtml(displayPathOrCmd(script))}</div>
      </div>
      <div class="program-actions">
        <button data-action="run" ${
          script.exists || script.source !== "file" ? "" : "disabled"
        }>Run</button>
        <button data-action="edit" class="secondary">Edit</button>
        <button data-action="remove" class="ghost">Remove</button>
      </div>
    </div>
  `
    )
    .join("");
}
