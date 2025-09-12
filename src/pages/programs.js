// Programs page controller for listing, filtering, launching, and editing programs.
// This module is designed to be readable first: simple data flow, clear helpers, and
// JSDoc throughout to explain the intent of each function.

/* global window, document, crypto */

// Tauri RPC helper
const { invoke } = window.__TAURI__.core;

// UI constants
const LIST_SELECTOR = ".programs-list";
const DEFAULT_LOGO = "./assets/tauri.svg";

/**
 * @typedef {Object} Program
 * @property {string} id - Stable unique id.
 * @property {string} name - Display name.
 * @property {string} [version] - Optional version string.
 * @property {string} [description] - Optional description.
 * @property {string} exe_path - Full path to the program executable.
 * @property {boolean} [exe_exists] - Whether exe_path currently exists.
 * @property {number} [launch_count] - Times launched via this app.
 * @property {string} [logo_data_url] - Image data URL for the program logo.
 */

/**
 * @typedef {Object} State
 * @property {Program[]} all - Source list from backend.
 * @property {Program[]} filtered - Derived after search/sort.
 * @property {string} query - Current search text.
 * @property {"name-asc"|"name-desc"|"used-asc"|"used-desc"} sort - Sort key.
 * @property {Program|null} editing - Program currently in the editor, or null.
 */

/** @type {State} */
let state = {
  all: [],
  filtered: [],
  query: "",
  sort: "name-asc",
  editing: null,
};

/**
 * Tiny DOM helpers to keep the code terse and readable.
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {T|null}
 */
function $(sel, root = document) {
  return /** @type {T|null} */ (root.querySelector(sel));
}

/**
 * Query all matching elements.
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {T[]}
 */
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Escape a string for safe placement in HTML attributes/text.
 * @param {unknown} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

/**
 * Infer a program name from an executable path.
 * Example: C:\\Apps\\FooBar.exe -> FooBar
 * @param {string} path
 * @returns {string}
 */
function inferNameFromPath(path) {
  const base = path.split(/[\\\/]/).pop() || "";
  return base.replace(/\.exe$/i, "");
}

/**
 * Render a single program row as HTML.
 * Keeping this in a dedicated function helps keep renderList small.
 * @param {Program} p
 * @returns {string}
 */
function renderProgramRow(p) {
  return `
    <div class="program-row" data-id="${p.id}">
      <div class="program-logo-wrap">
        <img class="program-logo" src="${
          p.logo_data_url || DEFAULT_LOGO
        }" alt="${escapeHtml(p.name)} logo"/>
        <span class="exe-status ${p.exe_exists ? "ok" : "missing"}" title="${
    p.exe_exists ? "Executable found" : "Executable missing"
  }">${p.exe_exists ? "✓" : "✕"}</span>
      </div>
      <div class="program-main">
        <div class="program-title" title="${escapeHtml(p.name)}${
    p.version ? ` — ${escapeHtml(p.version)}` : ""
  }">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="ver">${escapeHtml(p.version || "")}</span>
          <span class="muted usage" title="Times launched">(${
            p.launch_count || 0
          })</span>
        </div>
        <div class="program-desc" title="${escapeHtml(
          p.description || ""
        )}">${escapeHtml(p.description || "")}</div>
        <div class="program-path muted" title="${escapeHtml(
          p.exe_path
        )}">${escapeHtml(p.exe_path)}</div>
      </div>
      <div class="program-actions">
        <button data-action="launch" ${
          p.exe_exists ? "" : "disabled"
        }>Launch</button>
        <button data-action="edit" class="secondary">Edit</button>
        <button data-action="remove" class="ghost">Remove</button>
      </div>
    </div>`;
}

/**
 * Render the current filtered list into the DOM.
 * Uses simple string concat for performance and clarity.
 */
function renderList() {
  const list = /** @type {HTMLElement|null} */ ($(LIST_SELECTOR));
  if (!list) return;
  const items = state.filtered;
  if (!items.length) {
    list.innerHTML =
      '<div class="muted">No programs yet. Click "Add" to create one.</div>';
    return;
  }
  list.innerHTML = items.map(renderProgramRow).join("");
}

/**
 * Fetch the full program list from the backend and then apply filtering/sorting.
 */
async function loadPrograms() {
  state.all = await invoke("list_programs");
  applyFilter();
}

/**
 * Apply search query and sort order to derive state.filtered, then re-render.
 */
function applyFilter() {
  const q = state.query.trim().toLowerCase();
  const base = q
    ? state.all.filter((p) =>
        `${p.name} ${p.description} ${p.version}`.toLowerCase().includes(q)
      )
    : [...state.all];

  // Sort derived list
  const sort = state.sort;
  base.sort((a, b) => {
    switch (sort) {
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "", undefined, {
          sensitivity: "base",
        });
      case "used-desc":
        return (
          (b.launch_count || 0) - (a.launch_count || 0) ||
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );
      case "used-asc":
        return (
          (a.launch_count || 0) - (b.launch_count || 0) ||
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );
      case "name-asc":
      default:
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        });
    }
  });

  state.filtered = base;
  renderList();
}

/**
 * Wire up the toolbar: search, sort, add buttons.
 */
function wireToolbar() {
  const search = /** @type {HTMLInputElement|null} */ ($("#program-search"));
  const sortSel = /** @type {HTMLSelectElement|null} */ ($("#program-sort"));
  const addBtn = /** @type {HTMLButtonElement|null} */ ($("#program-add-btn"));

  search?.addEventListener("input", () => {
    state.query = search.value;
    applyFilter();
  });
  sortSel?.addEventListener("change", () => {
    state.sort = sortSel.value;
    applyFilter();
  });
  addBtn?.addEventListener("click", () => openEditor());
}

/**
 * Attach a single event listener on the list container for row actions.
 * This avoids re-binding listeners on every render.
 */
function wireListActions() {
  const list = /** @type {HTMLElement|null} */ ($(LIST_SELECTOR));
  if (!list || list.dataset.bound === "true") return; // idempotent binding

  list.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLElement|null} */ (
      e.target instanceof HTMLElement
        ? e.target.closest("button[data-action]")
        : null
    );
    if (!btn) return;
    const row = /** @type {HTMLElement|null} */ (btn.closest(".program-row"));
    const id = row?.getAttribute("data-id");
    if (!id) return;
    const prog = state.all.find((p) => p.id === id);
    if (!prog) return;

    const action = btn.getAttribute("data-action");
    if (action === "launch") {
      /** @type {HTMLButtonElement} */ (btn).disabled = true;
      try {
        await invoke("launch_program", { program: prog });
        // Refresh to update launch counters
        await loadPrograms();
      } finally {
        /** @type {HTMLButtonElement} */ (btn).disabled = false;
      }
      return;
    }
    if (action === "edit") {
      openEditor(prog);
      return;
    }
    if (action === "remove") {
      const ok = await confirmRemove(prog.name);
      if (!ok) return;
      await invoke("remove_program", { id: prog.id });
      await loadPrograms();
    }
  });

  list.dataset.bound = "true";
}

/**
 * Open the program editor with either a copy of the existing program or a fresh template.
 * @param {Program} [prog]
 */
function openEditor(prog) {
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
 * @param {string} exePath
 */
async function tryExtractLogo(exePath) {
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
    // Non-fatal if logo extraction fails
  }
}

/**
 * Wire up the editor dialog controls.
 */
function wireEditor() {
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
      // If Name is empty, set it to the EXE filename (without extension)
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
    // Collect values from form
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

    // If no logo yet, try to extract from the EXE before saving
    if (!state.editing.logo_data_url) {
      await tryExtractLogo(state.editing.exe_path);
    }

    save.disabled = true;
    try {
      await invoke("save_program", { program: state.editing });
      dlg.close();
      await loadPrograms();
    } catch (e) {
      console.error(e);
      alert(typeof e === "string" ? e : e?.message || "Failed to save program");
    } finally {
      save.disabled = false;
    }
  });
}

/**
 * Ask the user to confirm removal. Uses Tauri dialog if available, otherwise falls back to window.confirm.
 * @param {string} name
 */
async function confirmRemove(name) {
  const tauriConfirm = window.__TAURI__?.dialog?.confirm;
  if (tauriConfirm) {
    try {
      return await tauriConfirm(`Remove ${name}?`, {
        title: "Confirm",
        type: "warning",
      });
    } catch {
      // fall through to browser confirm
    }
  }
  return window.confirm(`Remove ${name}?`);
}

/**
 * Entrypoint called when navigating to the Programs page.
 */
export async function initPage() {
  wireToolbar();
  wireListActions();
  wireEditor();
  await loadPrograms();
}
