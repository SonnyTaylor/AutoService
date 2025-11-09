/**
 * Editor dialog management for the scripts page.
 */

import { $, $all } from "./utils.js";
import { state } from "./state.js";
import { saveScript, getDataDirs } from "./api.js";

/**
 * Updates the UI visibility based on the selected source type.
 * @param {string} source - The source type ('file', 'link', 'inline').
 */
function setSourceUI(source) {
  $("#s-source-file").hidden = source !== "file";
  $("#s-source-link").hidden = source !== "link";
  $("#s-source-inline").hidden = source !== "inline";
}

/**
 * Opens the script editor dialog for creating or editing a script.
 * @param {Object} [script] - The script to edit, or undefined for a new script.
 */
export function openEditor(script) {
  state.editing = script
    ? { ...script }
    : {
        id: crypto.randomUUID(),
        name: "",
        version: "", // Version field removed from UI but still required by backend
        description: "",
        runner: "powershell",
        source: "file",
        path: "",
        url: "",
        inline: "",
        run_count: 0,
      };

  const dialog = $("#script-editor");
  const form = $("#script-form");
  form.reset();

  $("#s-name").value = state.editing.name;
  $("#s-desc").value = state.editing.description;
  $("#s-runner").value = state.editing.runner;

  const sourceType = state.editing.source || "file";
  const sourceSelect = $("#s-source");
  if (sourceSelect) sourceSelect.value = sourceType;
  setSourceUI(sourceType);

  $("#s-file").value = state.editing.path || "";
  $("#s-url").value = state.editing.url || "";
  $("#s-inline").value = state.editing.inline || "";

  dialog.showModal();
}

/**
 * Wires up event listeners for the editor dialog controls.
 */
export function wireEditor() {
  const dialog = $("#script-editor");
  const fileButton = $("#s-pick-file");
  const cancelButton = $("#s-cancel");
  const saveButton = $("#s-save");
  const runnerSelect = $("#s-runner");
  const sourceSelect = $("#s-source");

  sourceSelect?.addEventListener("change", () =>
    setSourceUI(sourceSelect.value)
  );

  fileButton?.addEventListener("click", async () => {
    const openDialog = window.__TAURI__?.dialog?.open;
    let defaultPath;
    try {
      const dataDirs = await getDataDirs();
      if (dataDirs?.programs) defaultPath = dataDirs.programs;
    } catch (error) {
      // Ignore errors when getting default path
    }

    const selectedFile = openDialog
      ? await openDialog({
          multiple: false,
          title: "Select script file",
          defaultPath,
          filters: [
            { name: "Scripts", extensions: ["ps1", "cmd", "bat", "psm1"] },
          ],
        })
      : null;

    if (selectedFile) {
      $("#s-file").value = selectedFile;
    }
  });

  cancelButton?.addEventListener("click", () => dialog.close());

  saveButton?.addEventListener("click", async () => {
    const sourceSelectElement = $("#s-source");
    const source = sourceSelectElement?.value || "file";

    // Update editing script with form values
    state.editing.name = $("#s-name").value.trim();
    state.editing.description = $("#s-desc").value.trim();
    state.editing.runner = runnerSelect.value;
    state.editing.source = source;
    state.editing.path = $("#s-file").value.trim();
    state.editing.url = $("#s-url").value.trim();
    state.editing.inline = $("#s-inline").value.trim();
    // Ensure version is always an empty string (field removed from UI but still in backend model)
    state.editing.version = "";

    // Validation
    if (!state.editing.name) {
      return window.__TAURI__?.dialog?.message?.("Name is required.", {
        title: "Validation",
        kind: "warning",
      });
    }
    if (source === "file" && !state.editing.path) {
      return window.__TAURI__?.dialog?.message?.(
        "Pick a script file or change source.",
        { title: "Validation", kind: "warning" }
      );
    }
    if (source === "link" && !state.editing.url) {
      return window.__TAURI__?.dialog?.message?.(
        "Enter a URL or change source.",
        { title: "Validation", kind: "warning" }
      );
    }
    if (source === "inline" && !state.editing.inline) {
      return window.__TAURI__?.dialog?.message?.(
        "Enter command text or change source.",
        { title: "Validation", kind: "warning" }
      );
    }

    saveButton.disabled = true;
    try {
      await saveScript(state.editing);
      dialog.close();
      // Inform listeners that list should be refreshed
      window.dispatchEvent(new CustomEvent("scripts-updated"));
    } catch (error) {
      console.error("Error saving script:", error);
      window.__TAURI__?.dialog?.message?.(String(error), {
        title: "Save failed",
        kind: "error",
      });
    } finally {
      saveButton.disabled = false;
    }
  });
}
