// -----------------------------------------------------------------------------
// Programs/stacks-view
// -----------------------------------------------------------------------------
// Renders the Stacks list and wires stack actions.
// Responsibilities:
// - Render stack cards from state.stacks
// - Handle stack actions (launch all, launch individual, edit, remove)
// - Load stacks from backend
// This module stays UI-focused and delegates editing to stack-editor.js.
// -----------------------------------------------------------------------------
import {
  invoke,
  state,
  DEFAULT_LOGO,
  $,
  escapeHtml,
} from "./state.js";
import { openStackEditor } from "./stack-editor.js";
import { confirmRemove } from "./view.js";

/** CSS selector for the stacks container element on the Programs page. */
export const STACKS_SELECTOR = ".stacks-list";

/**
 * Render a single stack card as HTML.
 * @param {import('./state.js').Stack} stack Stack to render
 * @param {import('./state.js').Program[]} programs All programs for resolving IDs
 * @returns {string} HTML string for the stack card
 */
function renderStackCard(stack, programs) {
  // Resolve program IDs to actual program objects
  const stackPrograms = stack.program_ids
    .map((id) => programs.find((p) => p.id === id))
    .filter((p) => p !== undefined);

  const programButtons = stackPrograms
    .map(
      (p) => `
      <button 
        class="stack-program-launch" 
        data-program-id="${p.id}" 
        ${p.exe_exists ? "" : "disabled"}
        title="Launch ${escapeHtml(p.name)}"
      >
        ${p.logo_data_url ? `<img src="${p.logo_data_url}" alt="${escapeHtml(p.name)}"/>` : `<i class="${DEFAULT_LOGO}"></i>`}
        <span>${escapeHtml(p.name)}</span>
      </button>
    `
    )
    .join("");

  return `
    <div class="stack-card" data-id="${stack.id}">
      <div class="stack-main">
        <div class="stack-header">
          <h3 class="stack-name">${escapeHtml(stack.name)}</h3>
          <span class="stack-count">${stackPrograms.length} program${stackPrograms.length !== 1 ? "s" : ""}</span>
        </div>
        ${stack.description ? `<div class="stack-desc" title="${escapeHtml(stack.description)}">${escapeHtml(stack.description)}</div>` : ""}
        ${stackPrograms.length > 0 ? `<div class="stack-programs-list">${programButtons}</div>` : ""}
      </div>
      <div class="stack-actions">
        <button data-action="launch-all" ${stackPrograms.length === 0 || !stackPrograms.some(p => p.exe_exists) ? "disabled" : ""} title="Launch all programs in this stack">
          Launch All
        </button>
        <button data-action="edit" class="secondary">Edit</button>
        <button data-action="remove" class="ghost">Remove</button>
      </div>
    </div>
  `;
}

export function renderStacks() {
  // Replaces the stacks list contents with either an empty state or cards.
  const container = /** @type {HTMLElement|null} */ ($(STACKS_SELECTOR));
  if (!container) return;
  const stacks = state.stacksFiltered.length > 0 ? state.stacksFiltered : state.stacks;
  if (!stacks.length) {
    container.innerHTML =
      '<div class="muted">No stacks yet. Click "Add Stack" to create one.</div>';
    return;
  }
  container.innerHTML = stacks
    .map((stack) => renderStackCard(stack, state.all))
    .join("");
}

export async function loadStacks() {
  // Fetch all stacks from the backend and refresh the view.
  state.stacks = await invoke("list_stacks");
  state.stacksFiltered = [...state.stacks];
  renderStacks();
}

export function wireStackActions() {
  // Event delegation on the stacks container keeps bindings stable across renders.
  const container = /** @type {HTMLElement|null} */ ($(STACKS_SELECTOR));
  if (!container || container.dataset.bound === "true") return;

  container.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLElement|null} */ (
      e.target instanceof HTMLElement
        ? e.target.closest("button[data-action], button.stack-program-launch")
        : null
    );
    if (!btn) return;
    const card = /** @type {HTMLElement|null} */ (btn.closest(".stack-card"));
    const stackId = card?.getAttribute("data-id");
    if (!stackId) return;
    const stack = state.stacks.find((s) => s.id === stackId);
    if (!stack) return;

    // Handle individual program launch
    if (btn.classList.contains("stack-program-launch")) {
      const programId = btn.getAttribute("data-program-id");
      if (programId) {
        const program = state.all.find((p) => p.id === programId);
        if (program && program.exe_exists) {
          /** @type {HTMLButtonElement} */ (btn).disabled = true;
          try {
            await invoke("launch_program", { program });
            // Refresh programs to update launch count
            const { loadPrograms } = await import("./view.js");
            await loadPrograms();
          } catch (error) {
            console.error("Failed to launch program:", error);
            alert(typeof error === "string" ? error : error?.message || "Failed to launch program");
          } finally {
            /** @type {HTMLButtonElement} */ (btn).disabled = false;
          }
        }
      }
      return;
    }

    const action = btn.getAttribute("data-action");
    if (action === "launch-all") {
      // Launch all programs in the stack sequentially
      const stackPrograms = stack.program_ids
        .map((id) => state.all.find((p) => p.id === id))
        .filter((p) => p !== undefined && p.exe_exists);

      if (stackPrograms.length === 0) {
        alert("No programs available to launch in this stack");
        return;
      }

      /** @type {HTMLButtonElement} */ (btn).disabled = true;
      try {
        // Launch all programs (non-blocking)
        for (const program of stackPrograms) {
          try {
            await invoke("launch_program", { program });
            // Small delay between launches to avoid overwhelming the system
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (error) {
            console.error(`Failed to launch ${program.name}:`, error);
          }
        }
        // Refresh programs to update launch counts
        const { loadPrograms } = await import("./view.js");
        await loadPrograms();
      } finally {
        /** @type {HTMLButtonElement} */ (btn).disabled = false;
      }
      return;
    }

    if (action === "edit") {
      // Open modal editor with a copy of the stack data.
      openStackEditor(stack);
      return;
    }

    if (action === "remove") {
      // Confirm via Tauri dialog (if available), falling back to browser confirm.
      const ok = await confirmRemove(stack.name);
      if (!ok) return;
      try {
        await invoke("remove_stack", { id: stack.id });
        await loadStacks();
      } catch (error) {
        console.error("Failed to remove stack:", error);
        alert(typeof error === "string" ? error : error?.message || "Failed to remove stack");
      }
    }
  });

  container.dataset.bound = "true";
}

