// Scripts page controller
const { invoke } = window.__TAURI__.core;

let state = {
  all: [],
  filtered: [],
  query: "",
  sort: "name-asc",
  editing: null,
};

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",
    ">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function renderList() {
  const list = $(".scripts-list");
  if (!list) return;
  const items = state.filtered;
  if (!items.length) {
    list.innerHTML = '<div class="muted">No scripts yet. Click "Add" to create one.</div>';
    return;
  }
  list.innerHTML = items.map(p => `
    <div class="program-row" data-id="${p.id}">
      <div class="program-logo-wrap"></div>
      <div class="program-main">
        <div class="program-title" title="${escapeHtml(p.name)}${p.version ? ` — ${escapeHtml(p.version)}` : ''}">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="ver">${escapeHtml(p.version || "")}</span>
          <span class="muted usage" title="Times run">(${p.run_count || 0})</span>
        </div>
        <div class="program-desc" title="${escapeHtml(p.description || "")}">${escapeHtml(p.description || "")}</div>
        <div class="program-path muted" title="${escapeHtml(displayPathOrCmd(p))}">${escapeHtml(displayPathOrCmd(p))}</div>
      </div>
      <div class="program-actions">
        <button data-action="run" ${p.exists || p.source !== 'file' ? "" : "disabled"}>Run</button>
        <button data-action="edit" class="secondary">Edit</button>
        <button data-action="remove" class="ghost">Remove</button>
      </div>
    </div>
  `).join("");

  // Wire actions
  $all(".program-row").forEach(row => {
    row.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = row.getAttribute("data-id");
      const item = state.all.find(p => p.id === id);
      if (!item) return;
      const action = btn.getAttribute("data-action");
      if (action === "run") {
        try {
          await invoke("run_script", { script: item });
          item.run_count = (item.run_count || 0) + 1;
          await invoke("save_script", { script: item });
          applyFilter();
        } catch (e) {
          console.error(e);
          window.__TAURI__?.dialog?.message?.(String(e), { title: "Run failed", kind: "error" });
        }
      } else if (action === "edit") {
        openEditor(item);
      } else if (action === "remove") {
        if (await confirmRemove(item.name)) {
          await invoke("remove_script", { id });
          await loadScripts();
        }
      }
    });
  });
}

function displayPathOrCmd(s) {
  if (s.source === 'file') return s.path || '';
  if (s.source === 'link') return s.url || '';
  return (s.inline || '').slice(0, 140).replace(/\s+/g, ' ');
}

async function loadScripts() {
  state.all = await invoke("list_scripts");
  applyFilter();
}

function applyFilter() {
  const q = state.query.trim().toLowerCase();
  const base = q ? state.all.filter(p => `${p.name} ${p.description} ${p.version}`.toLowerCase().includes(q)) : [...state.all];
  const sort = state.sort;
  base.sort((a, b) => {
    switch (sort) {
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" });
      case "used-desc":
        return (b.run_count || 0) - (a.run_count || 0);
      case "used-asc":
        return (a.run_count || 0) - (b.run_count || 0);
      case "name-asc":
      default:
        return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    }
  });
  // existence calc: only for file source
  base.forEach(s => { if (s.source === 'file') s.exists = !!s.path_exists; else s.exists = true; });
  state.filtered = base;
  renderList();
}

function wireToolbar() {
  const search = $("#script-search");
  const sortSel = $("#script-sort");
  const addBtn = $("#script-add-btn");
  search?.addEventListener("input", () => { state.query = search.value; applyFilter(); });
  sortSel?.addEventListener("change", () => { state.sort = sortSel.value; applyFilter(); });
  addBtn?.addEventListener("click", () => openEditor());
}

function setSourceUI(source) {
  $("#s-source-file").hidden = source !== 'file';
  $("#s-source-link").hidden = source !== 'link';
  $("#s-source-inline").hidden = source !== 'inline';
}

function openEditor(item) {
  state.editing = item ? { ...item } : {
    id: crypto.randomUUID(),
    name: "",
    version: "",
    description: "",
    runner: "powershell", // or cmd
    source: "file", // file | link | inline
    path: "",
    url: "",
    inline: "",
    run_count: 0,
  };
  const dlg = $("#script-editor");
  const form = $("#script-form");
  form.reset();
  $("#s-name").value = state.editing.name;
  $("#s-version").value = state.editing.version;
  $("#s-desc").value = state.editing.description;
  $("#s-runner").value = state.editing.runner;
  const source = state.editing.source || 'file';
  const sourceSel = document.querySelector('#s-source');
  if (sourceSel) sourceSel.value = source;
  setSourceUI(source);
  $("#s-file").value = state.editing.path || "";
  $("#s-url").value = state.editing.url || "";
  $("#s-inline").value = state.editing.inline || "";
  dlg.showModal();
}

function wireEditor() {
  const dlg = $("#script-editor");
  const fileBtn = $("#s-pick-file");
  const cancel = $("#s-cancel");
  const save = $("#s-save");
  const runnerSel = $("#s-runner");
  const sourceSel = document.querySelector('#s-source');
  sourceSel?.addEventListener('change', () => setSourceUI(sourceSel.value));

  fileBtn?.addEventListener("click", async () => {
    const open = window.__TAURI__?.dialog?.open;
    let defaultPath;
    try {
      const dirs = await invoke("get_data_dirs");
      if (dirs?.programs) defaultPath = dirs.programs;
    } catch {}
    const selected = open ? await open({ multiple: false, title: "Select script file", defaultPath, filters: [{ name: "Scripts", extensions: ["ps1","cmd","bat","psm1"] }] }) : null;
    if (selected) {
      $("#s-file").value = selected;
    }
  });

  cancel?.addEventListener("click", () => dlg.close());

  save?.addEventListener("click", async () => {
    const sourceSel = document.querySelector('#s-source');
    const src = sourceSel?.value || 'file';
    state.editing.name = $("#s-name").value.trim();
    state.editing.version = $("#s-version").value.trim();
    state.editing.description = $("#s-desc").value.trim();
    state.editing.runner = runnerSel.value;
    state.editing.source = src;
    state.editing.path = $("#s-file").value.trim();
    state.editing.url = $("#s-url").value.trim();
    state.editing.inline = $("#s-inline").value.trim();

    if (!state.editing.name) {
      return window.__TAURI__?.dialog?.message?.("Name is required.", { title: "Validation", kind: "warning" });
    }
    if (src === 'file' && !state.editing.path) {
      return window.__TAURI__?.dialog?.message?.("Pick a script file or change source.", { title: "Validation", kind: "warning" });
    }
    if (src === 'link' && !state.editing.url) {
      return window.__TAURI__?.dialog?.message?.("Enter a URL or change source.", { title: "Validation", kind: "warning" });
    }
    if (src === 'inline' && !state.editing.inline) {
      return window.__TAURI__?.dialog?.message?.("Enter command text or change source.", { title: "Validation", kind: "warning" });
    }

    save.disabled = true;
    try {
      await invoke("save_script", { script: state.editing });
      await loadScripts();
      dlg.close();
    } catch (e) {
      console.error(e);
      window.__TAURI__?.dialog?.message?.(String(e), { title: "Save failed", kind: "error" });
    } finally {
      save.disabled = false;
    }
  });
}

export async function initPage() {
  wireToolbar();
  wireEditor();
  await loadScripts();
}

async function confirmRemove(name) {
  const tauriConfirm = window.__TAURI__?.dialog?.confirm;
  if (tauriConfirm) {
    try { return await tauriConfirm(`Remove ${name}?`, { title: "Confirm" }); } catch {}
  }
  return window.confirm(`Remove ${name}?`);
}
