// -----------------------------------------------------------------------------
// Programs/view
// -----------------------------------------------------------------------------
// Renders the Programs list and wires the toolbar and list actions.
// Responsibilities:
// - Render list items from state.filtered
// - Apply search and sort to derive the filtered list
// - Wire toolbar events (search, sort, add)
// - Handle per-row actions (launch, edit, remove)
// This module stays UI-focused and delegates editing to editor.js.
// -----------------------------------------------------------------------------
/* global crypto */
import {
  invoke,
  state,
  LIST_SELECTOR,
  DEFAULT_LOGO,
  $,
  escapeHtml,
} from "./state.js";
import { openEditor } from "./editor.js";
import Fuse from "fuse.js";

/**
 * Render a single program row as HTML.
 * @param {import('./state.js').Program} p Program to render
 * @returns {string} HTML string for the row
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

export function renderList() {
  // Replaces the list contents with either an empty state or rows.
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

export async function loadPrograms() {
  // Fetch all programs from the backend and refresh the view.
  state.all = await invoke("list_programs");
  buildFuseIndex();
  applyFilter();
}

export function applyFilter() {
  // Compute derived filtered list from `state.all` using current query/sort.
  const q = state.query.trim();
  let base;
  if (q) {
    if (!fuse) buildFuseIndex();
    const results = fuse.search(q);
    base = results.map((r) => r.item);
  } else {
    base = [...state.all];
  }
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

// --- Fuzzy Search Index -----------------------------------------------------
let fuse = null;
function buildFuseIndex() {
  const items = state.all.map((p) => ({
    id: p.id,
    name: p.name || "",
    description: p.description || "",
    version: p.version || "",
    exe_path: p.exe_path || "",
    raw: p,
  }));
  fuse = new Fuse(items, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "description", weight: 0.25 },
      { name: "version", weight: 0.1 },
      { name: "exe_path", weight: 0.05 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  // Map Fuse items back to the original program objects
  fuse.search = ((origSearch) => (query) => {
    const res = origSearch.call(fuse, query);
    return res.map((r) => ({ ...r, item: state.all.find((p) => p.id === r.item.id) || r.item.raw }));
  })(fuse.search);
}

export function wireToolbar() {
  // Wires search input, sort dropdown, and Add button.
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

export function wireListActions() {
  // Event delegation on the list container keeps bindings stable across renders.
  const list = /** @type {HTMLElement|null} */ ($(LIST_SELECTOR));
  if (!list || list.dataset.bound === "true") return;

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
      // Disable launch button during invoke to prevent double clicks.
      /** @type {HTMLButtonElement} */ (btn).disabled = true;
      try {
        await invoke("launch_program", { program: prog });
        await loadPrograms();
      } finally {
        /** @type {HTMLButtonElement} */ (btn).disabled = false;
      }
      return;
    }
    if (action === "edit") {
      // Open modal editor with a copy of the program data.
      openEditor(prog);
      return;
    }
    if (action === "remove") {
      // Confirm via Tauri dialog (if available), falling back to browser confirm.
      const ok = await confirmRemove(prog.name);
      if (!ok) return;
      await invoke("remove_program", { id: prog.id });
      await loadPrograms();
    }
  });

  list.dataset.bound = "true";
}

/**
 * Ask the user to confirm removal. Uses Tauri dialog if available, otherwise falls back to window.confirm.
 * @param {string} name
 * @returns {Promise<boolean>} whether the user confirmed the removal
 */
export async function confirmRemove(name) {
  const tauriConfirm = window.__TAURI__?.dialog?.confirm;
  if (tauriConfirm) {
    try {
      return await tauriConfirm(`Remove ${name}?`, {
        title: "Confirm",
        type: "warning",
      });
    } catch {
      // fall through
    }
  }
  return window.confirm(`Remove ${name}?`);
}
