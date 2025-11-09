// -----------------------------------------------------------------------------
// Programs/stack-editor
// -----------------------------------------------------------------------------
// Handles the modal editor for creating and updating Stack entries.
// Responsibilities:
// - Open/seed the dialog with an existing stack or a new template
// - Multi-select interface for choosing programs
// - Validate and save via backend then notify listeners
// -----------------------------------------------------------------------------
/* global crypto */
import { invoke, state, DEFAULT_LOGO, $, escapeHtml } from "./state.js";

/**
 * Open the stack editor with either a copy of the existing stack
 * or a fresh template.
 * This only seeds the form and shows the dialog; it does not save.
 * @param {import('./state.js').Stack} [stack]
 */
export function openStackEditor(stack) {
  state.editingStack = stack
    ? { ...stack }
    : {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        program_ids: [],
      };

  const dlg = /** @type {HTMLDialogElement|null} */ ($("#stack-editor"));
  const form = /** @type {HTMLFormElement|null} */ ($("#stack-form"));
  if (!dlg || !form) return;

  form.reset();
  /** @type {HTMLInputElement} */ ($("#s-name")).value = state.editingStack.name;
  /** @type {HTMLTextAreaElement} */ ($("#s-desc")).value =
    state.editingStack.description || "";

  // Render program selector
  renderProgramSelector();

  dlg.showModal();
}

/**
 * Render the program selector with checkboxes for all available programs.
 */
function renderProgramSelector() {
  const container = /** @type {HTMLElement|null} */ ($("#s-programs-selector"));
  if (!container) return;

  if (state.all.length === 0) {
    container.innerHTML = '<div class="muted">No programs available. Add programs first.</div>';
    return;
  }

  container.innerHTML = state.all
    .map((program) => {
      const isChecked = state.editingStack.program_ids.includes(program.id);
      return `
        <label class="program-selector-item">
          <input 
            type="checkbox" 
            value="${program.id}" 
            ${isChecked ? "checked" : ""}
            data-program-id="${program.id}"
          />
          <div class="program-selector-preview">
            ${
              program.logo_data_url
                ? `<img src="${program.logo_data_url}" alt="${escapeHtml(program.name)}"/>`
                : `<i class="${DEFAULT_LOGO}" aria-hidden="true"></i>`
            }
          </div>
          <div class="program-selector-info">
            <div class="program-selector-name">${escapeHtml(program.name)}</div>
            ${program.description ? `<div class="program-selector-desc">${escapeHtml(program.description)}</div>` : ""}
          </div>
        </label>
      `;
    })
    .join("");
}

/**
 * Wire up the editor dialog controls.
 * - Program selection checkboxes
 * - Cancel and Save handlers
 * Save dispatches a `stacks-updated` event to refresh the list.
 */
export function wireStackEditor() {
  const dlg = /** @type {HTMLDialogElement|null} */ ($("#stack-editor"));
  const cancel = /** @type {HTMLButtonElement|null} */ ($("#s-cancel"));
  const save = /** @type {HTMLButtonElement|null} */ ($("#s-save"));
  const selector = /** @type {HTMLElement|null} */ ($("#s-programs-selector"));
  if (!cancel || !save || !dlg || !selector) return;

  // Handle checkbox changes
  selector.addEventListener("change", (e) => {
    if (!(e.target instanceof HTMLInputElement && e.target.type === "checkbox")) return;
    const programId = e.target.getAttribute("data-program-id");
    if (!programId) return;

    if (!state.editingStack) return;

    if (e.target.checked) {
      if (!state.editingStack.program_ids.includes(programId)) {
        state.editingStack.program_ids.push(programId);
      }
    } else {
      state.editingStack.program_ids = state.editingStack.program_ids.filter(
        (id) => id !== programId
      );
    }
  });

  cancel.addEventListener("click", () => dlg.close());

  save.addEventListener("click", async () => {
    if (!state.editingStack) return;

    state.editingStack.name = /** @type {HTMLInputElement} */ (
      $("#s-name")
    ).value.trim();
    state.editingStack.description = /** @type {HTMLTextAreaElement} */ (
      $("#s-desc")
    ).value.trim();

    if (!state.editingStack.name) {
      alert("Name is required");
      return;
    }

    if (state.editingStack.program_ids.length === 0) {
      alert("Please select at least one program");
      return;
    }

    save.disabled = true;
    try {
      await invoke("save_stack", { stack: state.editingStack });
      dlg.close();
      // Inform listeners that list should be refreshed
      window.dispatchEvent(new CustomEvent("stacks-updated"));
    } catch (e) {
      console.error(e);
      alert(typeof e === "string" ? e : e?.message || "Failed to save stack");
    } finally {
      save.disabled = false;
    }
  });
}

