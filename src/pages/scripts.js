/**
 * Scripts page controller for managing custom scripts.
 * Handles loading, displaying, editing, and running scripts in the AutoService application.
 */
const { invoke } = window.__TAURI__.core;

/**
 * Application state for scripts management.
 * @typedef {Object} ScriptsState
 * @property {Array<Object>} all - All loaded scripts from the backend.
 * @property {Array<Object>} filtered - Filtered and sorted scripts for display.
 * @property {string} query - Current search query string.
 * @property {string} sort - Current sort order ('name-asc', 'name-desc', 'used-asc', 'used-desc').
 * @property {Object|null} editing - Currently editing script object, or null if not editing.
 */
/** @type {ScriptsState} */
let state = {
  all: [],
  filtered: [],
  query: "",
  sort: "name-asc",
  editing: null,
};

/**
 * Selects a single element from the DOM.
 * @param {string} selector - CSS selector string.
 * @param {Element} [root=document] - Root element to search in.
 * @returns {Element|null} The selected element or null if not found.
 */
function $(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Selects all elements matching the selector from the DOM.
 * @param {string} selector - CSS selector string.
 * @param {Element} [root=document] - Root element to search in.
 * @returns {Array<Element>} Array of selected elements.
 */
function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        char
      ])
  );
}

/**
 * Renders the list of filtered scripts in the UI.
 * Updates the scripts-list element with script items and wires event handlers for actions.
 */
function renderList() {
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

  // Attach event listeners to each script row for handling actions
  $all(".program-row").forEach((row) => {
    row.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      const scriptId = row.getAttribute("data-id");
      const script = state.all.find((s) => s.id === scriptId);
      if (!script) return;

      const action = button.getAttribute("data-action");
      if (action === "run") {
        try {
          await invoke("run_script", { script });
          script.run_count = (script.run_count || 0) + 1;
          await invoke("save_script", { script });
          applyFilter();
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
          await invoke("remove_script", { id: scriptId });
          await loadScripts();
        }
      }
    });
  });
}

/**
 * Returns a display string for the script's source (path, URL, or inline command).
 * @param {Object} script - The script object.
 * @returns {string} Display string for the script source.
 */
function displayPathOrCmd(script) {
  if (script.source === "file") return script.path || "";
  if (script.source === "link") return script.url || "";
  return (script.inline || "").slice(0, 140).replace(/\s+/g, " ");
}

/**
 * Loads all scripts from the backend and applies the current filter.
 */
async function loadScripts() {
  state.all = await invoke("list_scripts");
  applyFilter();
}

/**
 * Applies search filter and sorting to the scripts list.
 * Updates state.filtered and re-renders the list.
 */
function applyFilter() {
  const searchQuery = state.query.trim().toLowerCase();
  let filteredScripts = searchQuery
    ? state.all.filter((script) =>
        `${script.name} ${script.description} ${script.version}`
          .toLowerCase()
          .includes(searchQuery)
      )
    : [...state.all];

  const sortOrder = state.sort;
  filteredScripts.sort((a, b) => {
    switch (sortOrder) {
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "", undefined, {
          sensitivity: "base",
        });
      case "used-desc":
        return (b.run_count || 0) - (a.run_count || 0);
      case "used-asc":
        return (a.run_count || 0) - (b.run_count || 0);
      case "name-asc":
      default:
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        });
    }
  });

  // Determine existence for file-based scripts
  filteredScripts.forEach((script) => {
    if (script.source === "file") {
      script.exists = !!script.path_exists;
    } else {
      script.exists = true;
    }
  });

  state.filtered = filteredScripts;
  renderList();
}

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
  });

  sortSelect?.addEventListener("change", () => {
    state.sort = sortSelect.value;
    applyFilter();
  });

  addButton?.addEventListener("click", () => openEditor());
}

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
function openEditor(script) {
  state.editing = script
    ? { ...script }
    : {
        id: crypto.randomUUID(),
        name: "",
        version: "",
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
  $("#s-version").value = state.editing.version;
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
function wireEditor() {
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
      const dataDirs = await invoke("get_data_dirs");
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
    state.editing.version = $("#s-version").value.trim();
    state.editing.description = $("#s-desc").value.trim();
    state.editing.runner = runnerSelect.value;
    state.editing.source = source;
    state.editing.path = $("#s-file").value.trim();
    state.editing.url = $("#s-url").value.trim();
    state.editing.inline = $("#s-inline").value.trim();

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
      await invoke("save_script", { script: state.editing });
      await loadScripts();
      dialog.close();
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

/**
 * Initializes the scripts page by wiring events and loading initial data.
 */
export async function initPage() {
  wireToolbar();
  wireEditor();
  await loadScripts();
}

/**
 * Confirms removal of a script with the user using a dialog.
 * @param {string} name - The name of the script to remove.
 * @returns {boolean} True if the user confirmed, false otherwise.
 */
async function confirmRemove(name) {
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
