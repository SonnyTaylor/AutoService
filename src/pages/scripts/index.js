/**
 * Scripts page controller for managing custom scripts.
 * Handles loading, displaying, editing, and running scripts in the AutoService application.
 */

import { $, $all } from "./utils.js";
import { state, loadScripts, applyFilter } from "./state.js";
import { renderList } from "./renderer.js";
import { openEditor, wireEditor } from "./editor.js";
import { runScript, removeScript } from "./api.js";
import { confirmRemove } from "./utils.js";
import { initAIGenerate } from "./ai-generate.js";

/**
 * Wires up event listeners for the toolbar controls (search, sort, add).
 */
function wireToolbar() {
  const searchInput = $("#script-search");
  const sortSelect = $("#script-sort");
  const addButton = $("#script-add-btn");

  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value;
    applyFilter();
    renderList();
    wireScriptActions();
  });

  sortSelect?.addEventListener("change", () => {
    state.sort = sortSelect.value;
    applyFilter();
    renderList();
    wireScriptActions();
  });

  addButton?.addEventListener("click", () => openEditor());
}

/**
 * Wires up event listeners for script actions (run, edit, remove).
 */
function wireScriptActions() {
  // Remove existing event listeners by cloning and replacing elements
  $all(".program-row").forEach((row) => {
    const newRow = row.cloneNode(true);
    row.parentNode.replaceChild(newRow, row);

    newRow.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      const scriptId = newRow.getAttribute("data-id");
      const script = state.all.find((s) => s.id === scriptId);
      if (!script) return;

      const action = button.getAttribute("data-action");
      if (action === "run") {
        try {
          await runScript(script);
          script.run_count = (script.run_count || 0) + 1;
          // Refresh to update run count
          await loadScripts(true);
          renderList();
          wireScriptActions();
        } catch (error) {
          console.error("Error running script:", error);
          window.__TAURI__?.dialog?.message?.(String(error), {
            title: "Run failed",
            kind: "error",
          });
        }
      } else if (action === "edit") {
        openEditor(script);
      } else if (action === "remove") {
        if (await confirmRemove(script.name)) {
          await removeScript(scriptId);
          // Cache already invalidated by removeScript, just refresh
          await loadScripts(true);
          renderList();
          wireScriptActions();
        }
      }
    });
  });
}

/**
 * Initializes the scripts page by wiring events and loading initial data.
 */
export async function initPage() {
  wireToolbar();
  wireEditor();
  initAIGenerate();
  
  // Refresh scripts list when editor saves or scripts are updated
  window.addEventListener(
    "scripts-updated",
    async () => {
      // Cache already invalidated by saveScript, just refresh
      await loadScripts(true);
      renderList();
      wireScriptActions();
    },
    { once: false }
  );
  
  await loadScripts();
  renderList();
  wireScriptActions();
}
