// -----------------------------------------------------------------------------
// Programs/editor
// -----------------------------------------------------------------------------
// Handles the modal editor for creating and updating Programs entries.
// Responsibilities:
// - Open/seed the dialog with an existing program or a new template
// - Pick EXE and image files via Tauri dialog
// - Try to extract icons from executables
// - Validate and save via backend then notify listeners
// -----------------------------------------------------------------------------
/* global crypto */
import { invoke, state, DEFAULT_LOGO, $, inferNameFromPath } from "./state.js";

/**
 * Open the program editor with either a copy of the existing program
 * or a fresh template.
 * This only seeds the form and shows the dialog; it does not save.
 * @param {import('./state.js').Program} [prog]
 */
export function openEditor(prog) {
  state.editing = prog
    ? { ...prog }
    : {
        id: crypto.randomUUID(),
        name: "",
        version: "",
        description: "",
        exe_path: "",
        logo_data_url: "",
      };

  const dlg = /** @type {HTMLDialogElement|null} */ ($("#program-editor"));
  const form = /** @type {HTMLFormElement|null} */ ($("#program-form"));
  if (!dlg || !form) return;

  form.reset();
  /** @type {HTMLInputElement} */ ($("#p-name")).value = state.editing.name;
  /** @type {HTMLInputElement} */ ($("#p-version")).value =
    state.editing.version || "";
  /** @type {HTMLTextAreaElement} */ ($("#p-desc")).value =
    state.editing.description || "";
  /** @type {HTMLInputElement} */ ($("#p-exe")).value =
    state.editing.exe_path || "";
  const preview = /** @type {HTMLImageElement} */ ($("#p-logo-preview"));
  preview.src = state.editing.logo_data_url || DEFAULT_LOGO;
  dlg.showModal();
}

/**
 * Attempt to extract a logo from an executable and update the preview/state.
 * Non-fatal if extraction fails.
 * @param {string} exePath
 */
export async function tryExtractLogo(exePath) {
  try {
    const suggested = await invoke("suggest_logo_from_exe", {
      exe_path: exePath,
    });
    if (suggested) {
      state.editing.logo_data_url = suggested;
      const img = /** @type {HTMLImageElement} */ ($("#p-logo-preview"));
      if (img) img.src = suggested;
    }
  } catch {
    // ignore
  }
}

/**
 * Wire up the editor dialog controls.
 * - Browse for EXE and logo
 * - Cancel and Save handlers
 * Save dispatches a `programs-updated` event to refresh the list.
 */
export function wireEditor() {
  const dlg = /** @type {HTMLDialogElement|null} */ ($("#program-editor"));
  const exeBtn = /** @type {HTMLButtonElement|null} */ ($("#p-pick-exe"));
  const logoBtn = /** @type {HTMLButtonElement|null} */ ($("#p-pick-logo"));
  const cancel = /** @type {HTMLButtonElement|null} */ ($("#p-cancel"));
  const save = /** @type {HTMLButtonElement|null} */ ($("#p-save"));
  if (!exeBtn || !logoBtn || !cancel || !save || !dlg) return;

  exeBtn.addEventListener("click", async () => {
    const open = window.__TAURI__?.dialog?.open;
    let defaultPath;
    try {
      const dirs = await invoke("get_data_dirs");
      if (dirs?.programs) defaultPath = dirs.programs;
    } catch {
      // ignore
    }
    const selected = open
      ? await open({
          multiple: false,
          title: "Select program executable",
          defaultPath,
          filters: [{ name: "Executables", extensions: ["exe"] }],
        })
      : null;
    if (selected) {
      /** @type {HTMLInputElement} */ ($("#p-exe")).value = selected;
      state.editing.exe_path = selected;
      const nameInput = /** @type {HTMLInputElement} */ ($("#p-name"));
      if (nameInput && !nameInput.value.trim()) {
        const inferred = inferNameFromPath(selected);
        state.editing.name = inferred;
        nameInput.value = inferred;
      }
      await tryExtractLogo(selected);
    }
  });

  logoBtn.addEventListener("click", async () => {
    const open = window.__TAURI__?.dialog?.open;
    const selected = open
      ? await open({
          multiple: false,
          title: "Select logo image",
          filters: [
            { name: "Images", extensions: ["png", "jpg", "jpeg", "ico"] },
          ],
        })
      : null;
    if (selected) {
      try {
        const dataUrl = await invoke("read_image_as_data_url", {
          path: selected,
        });
        state.editing.logo_data_url = dataUrl;
        const img = /** @type {HTMLImageElement} */ ($("#p-logo-preview"));
        if (img) img.src = dataUrl;
      } catch (e) {
        console.error(e);
      }
    }
  });

  cancel.addEventListener("click", () => dlg.close());

  save.addEventListener("click", async () => {
    state.editing.name = /** @type {HTMLInputElement} */ (
      $("#p-name")
    ).value.trim();
    state.editing.version = /** @type {HTMLInputElement} */ (
      $("#p-version")
    ).value.trim();
    state.editing.description = /** @type {HTMLTextAreaElement} */ (
      $("#p-desc")
    ).value.trim();
    state.editing.exe_path = /** @type {HTMLInputElement} */ (
      $("#p-exe")
    ).value.trim();

    if (!state.editing.name || !state.editing.exe_path) {
      alert("Name and executable are required");
      return;
    }

    if (!state.editing.logo_data_url) {
      await tryExtractLogo(state.editing.exe_path);
    }

    save.disabled = true;
    try {
      await invoke("save_program", { program: state.editing });
      dlg.close();
      // Inform listeners that list should be refreshed
      window.dispatchEvent(new CustomEvent("programs-updated"));
    } catch (e) {
      console.error(e);
      alert(typeof e === "string" ? e : e?.message || "Failed to save program");
    } finally {
      save.disabled = false;
    }
  });
}
