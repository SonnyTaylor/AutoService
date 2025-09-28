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
    updateSummaryCounters();
    return;
  }

  listElement.innerHTML = scripts
    .map(
      (script) => `
    <div class="program-row" data-id="${script.id}">
      <div class="program-main">
        <div class="program-title" title="${escapeHtml(script.name)}${
        script.version ? ` — ${escapeHtml(script.version)}` : ""
      }">
          <span class="name">${escapeHtml(script.name)}</span>
          <span class="ver">${escapeHtml(script.version || "")}</span>
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

  updateSummaryCounters();
}

function updateSummaryCounters() {
  const root = document.querySelector('[data-page="scripts"]');
  if (!root) return;
  const total = state.all.length;
  const runnable = state.all.filter((s) => s.exists).length;
  const missing = state.all.filter(
    (s) => !s.exists && s.source === "file"
  ).length;

  const setText = (id, value) => {
    const el = root.querySelector(`#${id}`);
    if (el) el.textContent = String(value);
  };

  setText("scripts-total", total);
  setText("scripts-runnable", runnable);
  setText("scripts-missing", missing);

  const filters = {
    all: total,
    file: state.all.filter((s) => (s.source || "file") === "file").length,
    link: state.all.filter((s) => s.source === "link").length,
    inline: state.all.filter((s) => s.source === "inline").length,
  };

  Object.entries(filters).forEach(([key, value]) => {
    const chip = root.querySelector(`#filter-count-${key}`);
    if (chip) chip.textContent = String(value);
  });
}
