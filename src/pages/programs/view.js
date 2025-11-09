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
  $all,
  escapeHtml,
} from "./state.js";
import { openEditor } from "./editor.js";
import Fuse from "fuse.js";
import { refreshWithCache, clearCache } from "../../utils/page-cache.js";

const PROGRAMS_CACHE_KEY = "programs.cache.v1";

/**
 * Render a single program row as HTML.
 * @param {import('./state.js').Program} p Program to render
 * @returns {string} HTML string for the row
 */
function renderProgramRow(p) {
  return `
    <div class="program-row" data-id="${p.id}">
      <div class="program-logo-wrap">
        ${
          p.logo_data_url
            ? `<img class="program-logo" src="${p.logo_data_url}" alt="${escapeHtml(
                p.name
              )} logo"/>`
            : `<i class="program-logo-icon ${DEFAULT_LOGO}" aria-hidden="true"></i>`
        }
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
        <button data-action="open" class="ghost" title="Open folder in file explorer">
          <i class="ph ph-folder-open"></i> Open
        </button>
        <div class="program-actions-menu">
          <button class="ghost program-menu-trigger" title="More actions">
            <i class="ph ph-dots-three"></i>
          </button>
          <div class="program-menu-dropdown">
            <button data-action="add-to-stack" class="ghost" title="Add to stack">
              <i class="ph ph-stack"></i> Add to Stack
            </button>
            <button data-action="edit" class="ghost">Edit</button>
            <button data-action="remove" class="ghost">Remove</button>
          </div>
        </div>
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

export async function loadPrograms(force = false) {
  // Load with caching: show cached data immediately, refresh in background
  await refreshWithCache({
    cacheKey: PROGRAMS_CACHE_KEY,
    version: "v1",
    fetchFn: async () => {
      return await invoke("list_programs");
    },
    onCached: (cached) => {
      // Show cached data immediately
      state.all = cached;
      buildFuseIndex();
      applyFilter();
    },
    onFresh: (fresh) => {
      // Update with fresh data if changed
      state.all = fresh;
      buildFuseIndex();
      applyFilter();
    },
    force,
  });
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

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const menu = e.target.closest(".program-actions-menu");
    if (!menu) {
      // Close all dropdowns
      $all(".program-menu-dropdown").forEach((dropdown) => {
        dropdown.classList.remove("open");
      });
    }
  });

  list.addEventListener("click", async (e) => {
    if (!(e.target instanceof HTMLElement)) return;

    // Handle menu trigger clicks
    const menuTrigger = e.target.closest(".program-menu-trigger");
    if (menuTrigger) {
      e.stopPropagation();
      const menu = menuTrigger.closest(".program-actions-menu");
      const dropdown = menu?.querySelector(".program-menu-dropdown");
      if (dropdown) {
        // Close other dropdowns
        $all(".program-menu-dropdown").forEach((d) => {
          if (d !== dropdown) d.classList.remove("open");
        });
        // Toggle this dropdown
        dropdown.classList.toggle("open");
      }
      return;
    }

    const btn = /** @type {HTMLElement|null} */ (
      e.target.closest("button[data-action]")
    );
    if (!btn) return;
    const row = /** @type {HTMLElement|null} */ (btn.closest(".program-row"));
    const id = row?.getAttribute("data-id");
    if (!id) return;
    const prog = state.all.find((p) => p.id === id);
    if (!prog) return;

    // Close dropdown after action
    const dropdown = btn.closest(".program-menu-dropdown");
    if (dropdown) {
      dropdown.classList.remove("open");
    }

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
    if (action === "open") {
      try {
        await invoke("open_program_folder", { program: prog });
      } catch (error) {
        alert(`Failed to open folder: ${error}`);
      }
      return;
    }
    if (action === "add-to-stack") {
      // Show stack selection dialog to add program to stack(s)
      await showAddToStackDialog(prog);
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
      // Invalidate cache and refresh
      clearCache(PROGRAMS_CACHE_KEY);
      await loadPrograms(true);
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

/**
 * Show dialog to add a program to one or more stacks.
 * @param {import('./state.js').Program} program
 */
async function showAddToStackDialog(program) {
  const { state, invoke, escapeHtml } = await import("./state.js");

  // Load stacks if not already loaded
  if (state.stacks.length === 0) {
    state.stacks = await invoke("list_stacks");
  }

  // Create a simple modal dialog
  const dialog = document.createElement("dialog");
  dialog.className = "add-to-stack-dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <h3>Add "${escapeHtml(program.name)}" to Stack</h3>
      <div class="stack-selection-list">
        ${state.stacks.length === 0 
          ? '<div class="muted">No stacks available. Create a stack first.</div>'
          : state.stacks.map(stack => {
              const isInStack = stack.program_ids.includes(program.id);
              return `
                <label class="stack-selection-item">
                  <input 
                    type="checkbox" 
                    value="${stack.id}" 
                    ${isInStack ? "checked disabled" : ""}
                    data-stack-id="${stack.id}"
                  />
                  <div class="stack-selection-info">
                    <div class="stack-selection-name">${escapeHtml(stack.name)}</div>
                    ${stack.description ? `<div class="stack-selection-desc">${escapeHtml(stack.description)}</div>` : ""}
                    ${isInStack ? '<span class="stack-selection-badge">Already in stack</span>' : ""}
                  </div>
                </label>
              `;
            }).join("")
        }
      </div>
      <div class="stack-selection-actions">
        <button type="button" id="add-to-stack-new" class="secondary">Create New Stack</button>
        <div style="flex: 1"></div>
        <button type="button" id="add-to-stack-cancel" class="ghost">Cancel</button>
        <button type="button" id="add-to-stack-save">Add to Selected</button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  return new Promise((resolve) => {
    const cancelBtn = dialog.querySelector("#add-to-stack-cancel");
    const saveBtn = dialog.querySelector("#add-to-stack-save");
    const newBtn = dialog.querySelector("#add-to-stack-new");

    const cleanup = () => {
      dialog.close();
      document.body.removeChild(dialog);
      resolve();
    };

    cancelBtn?.addEventListener("click", cleanup);

    newBtn?.addEventListener("click", async () => {
      cleanup();
      // Create a new stack with this program pre-selected
      const { openStackEditor } = await import("./stack-editor.js");
      openStackEditor({
        id: crypto.randomUUID(),
        name: "",
        description: "",
        program_ids: [program.id],
      });
    });

    saveBtn?.addEventListener("click", async () => {
      const checkboxes = dialog.querySelectorAll("input[type='checkbox']:checked:not(:disabled)");
      const selectedStackIds = Array.from(checkboxes).map((cb) => cb.getAttribute("data-stack-id"));

      if (selectedStackIds.length === 0) {
        alert("Please select at least one stack");
        return;
      }

      try {
        // Add program to each selected stack
        for (const stackId of selectedStackIds) {
          const stack = state.stacks.find((s) => s.id === stackId);
          if (stack && !stack.program_ids.includes(program.id)) {
            stack.program_ids.push(program.id);
            await invoke("save_stack", { stack });
          }
        }
        // Refresh stacks
        window.dispatchEvent(new CustomEvent("stacks-updated"));
        cleanup();
      } catch (error) {
        console.error("Failed to add program to stacks:", error);
        alert(typeof error === "string" ? error : error?.message || "Failed to add program to stacks");
      }
    });

    // Close on backdrop click
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        cleanup();
      }
    });
  });
}
