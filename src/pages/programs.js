// Programs page controller
const { invoke } = window.__TAURI__.core;

let state = {
  all: [],
  filtered: [],
  query: "",
  editing: null, // program object being edited or null
};

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderList() {
  const list = document.querySelector(".programs-list");
  if (!list) return;
  const items = state.filtered;
  if (!items.length) {
    list.innerHTML = '<div class="muted">No programs yet. Click "Add" to create one.</div>';
    return;
    }
  list.innerHTML = items.map(p => `
    <div class="program-row" data-id="${p.id}">
      <img class="program-logo" src="${p.logo_data_url || "./assets/tauri.svg"}" alt="${p.name} logo"/>
      <div class="program-main">
        <div class="program-title">${escapeHtml(p.name)} <span class="ver">${escapeHtml(p.version || "")}</span></div>
        <div class="program-desc">${escapeHtml(p.description || "")}</div>
        <div class="program-path muted">${escapeHtml(p.exe_path)}</div>
      </div>
      <div class="program-actions">
        <button data-action="launch">Launch</button>
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
      const prog = state.all.find(p => p.id === id);
      if (!prog) return;
      const action = btn.getAttribute("data-action");
      if (action === "launch") {
        btn.disabled = true;
        try { await invoke("launch_program", { program: prog }); } finally { btn.disabled = false; }
      } else if (action === "edit") {
        openEditor(prog);
      } else if (action === "remove") {
        const ok = await confirmRemove(prog.name);
        if (!ok) return;
        await invoke("remove_program", { id: prog.id });
        await loadPrograms();
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

async function loadPrograms() {
  state.all = await invoke("list_programs");
  applyFilter();
}

function applyFilter() {
  const q = state.query.trim().toLowerCase();
  state.filtered = q ? state.all.filter(p => `${p.name} ${p.description} ${p.version}`.toLowerCase().includes(q)) : [...state.all];
  renderList();
}

function wireToolbar() {
  const search = document.querySelector("#program-search");
  const addBtn = document.querySelector("#program-add-btn");
  search?.addEventListener("input", () => { state.query = search.value; applyFilter(); });
  addBtn?.addEventListener("click", () => openEditor());
}

function openEditor(prog) {
  state.editing = prog ? { ...prog } : {
    id: crypto.randomUUID(),
    name: "",
    version: "",
    description: "",
    exe_path: "",
    logo_data_url: "",
  };
  const dlg = document.querySelector("#program-editor");
  const form = document.querySelector("#program-form");
  form.reset();
  document.querySelector("#p-name").value = state.editing.name;
  document.querySelector("#p-version").value = state.editing.version;
  document.querySelector("#p-desc").value = state.editing.description;
  document.querySelector("#p-exe").value = state.editing.exe_path;
  const preview = document.querySelector("#p-logo-preview");
  preview.src = state.editing.logo_data_url || "./assets/tauri.svg";
  dlg.showModal();
}

function wireEditor() {
  const dlg = document.querySelector("#program-editor");
  const form = document.querySelector("#program-form");
  const exeBtn = document.querySelector("#p-pick-exe");
  const logoBtn = document.querySelector("#p-pick-logo");
  const cancel = document.querySelector("#p-cancel");
  const save = document.querySelector("#p-save");

  exeBtn.addEventListener("click", async () => {
    const open = window.__TAURI__?.dialog?.open;
    let defaultPath;
    try {
      const dirs = await invoke("get_data_dirs");
      if (dirs?.programs) defaultPath = dirs.programs;
    } catch {}
    const selected = open ? await open({ multiple: false, title: "Select program executable", defaultPath, filters: [{ name: "Executables", extensions: ["exe"] }] }) : null;
    if (selected) {
      document.querySelector("#p-exe").value = selected;
      state.editing.exe_path = selected;
      // If Name is empty, set it to the EXE filename (without extension)
      const nameInput = document.querySelector("#p-name");
      if (nameInput && !nameInput.value.trim()) {
        const base = selected.split(/[\\\/]/).pop() || "";
        const inferred = base.replace(/\.exe$/i, "");
        state.editing.name = inferred;
        nameInput.value = inferred;
      }
      try {
        const suggested = await invoke("suggest_logo_from_exe", { exe_path: selected });
        if (suggested) {
          state.editing.logo_data_url = suggested;
          document.querySelector("#p-logo-preview").src = suggested;
        }
      } catch {}
    }
  });

  logoBtn.addEventListener("click", async () => {
    const open = window.__TAURI__?.dialog?.open;
    const selected = open ? await open({ multiple: false, title: "Select logo image", filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "ico"] }] }) : null;
    if (selected) {
      try {
        const dataUrl = await invoke("read_image_as_data_url", { path: selected });
        state.editing.logo_data_url = dataUrl;
        document.querySelector("#p-logo-preview").src = dataUrl;
      } catch (e) { console.error(e); }
    }
  });

  cancel.addEventListener("click", () => dlg.close());

  save.addEventListener("click", async () => {
    // Collect values
    state.editing.name = document.querySelector("#p-name").value.trim();
    state.editing.version = document.querySelector("#p-version").value.trim();
    state.editing.description = document.querySelector("#p-desc").value.trim();
    state.editing.exe_path = document.querySelector("#p-exe").value.trim();

    if (!state.editing.name || !state.editing.exe_path) {
      alert("Name and executable are required");
      return;
    }
    // If no logo yet, try to extract from the EXE before saving
    if (!state.editing.logo_data_url) {
      try {
        const suggested = await invoke("suggest_logo_from_exe", { exe_path: state.editing.exe_path });
        if (suggested) {
          state.editing.logo_data_url = suggested;
        }
      } catch {}
    }
    save.disabled = true;
    try {
      await invoke("save_program", { program: state.editing });
      dlg.close();
      await loadPrograms();
    } finally { save.disabled = false; }
  });
}

// no longer needed; backend performs data URL encoding

export async function initPage() {
  wireToolbar();
  wireEditor();
  await loadPrograms();
}

async function confirmRemove(name) {
  const tauriConfirm = window.__TAURI__?.dialog?.confirm;
  if (tauriConfirm) {
    try {
      return await tauriConfirm(`Remove ${name}?`, { title: "Confirm", type: "warning" });
    } catch { /* fall through */ }
  }
  return window.confirm(`Remove ${name}?`);
}
