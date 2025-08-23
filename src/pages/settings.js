// Settings page controller for required external tools
const { invoke } = window.__TAURI__.core;
const { Command } = window.__TAURI__?.shell || {};

// List of required tools with fuzzy match keys and optional detector
const REQUIRED = [
  { key: 'ccleaner', name: 'CCleaner', match: ['ccleaner'], hint: 'CCleaner.exe', prefer: 'CCleaner/CCleaner64.exe' },
  { key: 'bleachbit', name: 'BleachBit', match: ['bleachbit'], hint: 'bleachbit.exe' },
  { key: 'adwcleaner', name: 'AdwCleaner', match: ['adwcleaner'], hint: 'adwcleaner.exe' },
  { key: 'clamav', name: 'ClamAV', match: ['clamav', 'clamscan'], hint: 'clamscan.exe' },
  { key: 'kvrt', name: 'KVRT', match: ['kvrt'], hint: 'KVRT.exe' },
  { key: 'defender', name: 'Windows Defender (MpCmdRun)', match: ['mpcmdrun', 'windows defender'], hint: 'Resolved automatically' , detector: detectDefender },
  { key: 'furmark2', name: 'Furmark 2', match: ['furmark'], hint: 'FurMark.exe' },
  { key: 'prime95', name: 'Prime95', match: ['prime95'], hint: 'prime95.exe' },
  { key: 'sdi', name: 'Snappy Driver Installer', match: ['snappy', 'sdi'], hint: 'SDI*\SDI*.exe' },
  { key: 'gsmartcontrol', name: 'GSmartControl', match: ['gsmartcontrol'], hint: 'gsmartcontrol.exe' },
];

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

async function loadProgramsFile() {
  try { return await invoke('list_programs'); } catch { return []; }
}

function fuzzyMatch(entry, names) {
  const hay = `${entry.name} ${entry.description} ${entry.exe_path}`.toLowerCase();
  return names.some(n => hay.includes(n));
}

async function pickExe(defaultPath) {
  const open = window.__TAURI__?.dialog?.open;
  return open ? await open({ multiple: false, title: 'Select executable', defaultPath, filters: [{ name: 'Executables', extensions: ['exe'] }] }) : null;
}

async function detectDefender() {
  if (!Command) return null;
  try {
    const ps = await Command.create('powershell', [
      '-NoProfile','-ExecutionPolicy','Bypass','-Command',
      "(Get-ChildItem -Path \"$env:ProgramData\\Microsoft\\Windows Defender\\Platform\" -Directory | Sort-Object Name -Descending | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName 'MpCmdRun.exe' })"
    ]).execute();
    const path = (ps.stdout || '').trim();
    return path || null;
  } catch { return null; }
}

async function renderRequired() {
  const listEl = document.getElementById('req-programs-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="muted">Scanning programs.json…</div>';

  const [entries, dirs] = await Promise.all([
    loadProgramsFile(),
    invoke('get_data_dirs').catch(() => ({})),
  ]);
  const baseDir = dirs?.programs || dirs?.data || undefined;

  // Build a map of first matches
  const found = Object.create(null);
  for (const req of REQUIRED) {
    const hit = entries.find(e => fuzzyMatch(e, req.match));
    if (hit && hit.exe_path) {
      found[req.key] = hit.exe_path; // already possibly relative
    } else if (req.detector) {
      // run detector for dynamic tools like Defender
      found[req.key] = await req.detector();
    }
  }

  const rows = REQUIRED.map(req => {
    const has = !!found[req.key];
    const path = found[req.key] || '';
    const status = has ? '<span class="badge ok">Found</span>' : '<span class="badge error">Missing</span>';
    const pathHtml = path ? `<div class="muted" title="${escapeHtml(path)}">${escapeHtml(path)}</div>` : `<div class="muted">${escapeHtml(req.hint || '')}</div>`;
    const btn = has ? '' : '<button class="secondary" data-action="locate">Locate</button>';
    return `
      <div class="row" data-key="${req.key}">
        <div class="main">
          <div class="name">${escapeHtml(req.name)} ${status}</div>
          ${pathHtml}
        </div>
        <div class="meta">${btn}</div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = rows || '<div class="muted">No items.</div>';

  // Publish a global cache of tool statuses for other pages to use
  try {
    const statuses = await invoke('get_tool_statuses');
    // Store in sessionStorage so other pages (e.g., scans) can read without refetching
    sessionStorage.setItem('tool.statuses.v1', JSON.stringify(statuses || []));
  } catch {}

  listEl.querySelectorAll('.row').forEach(row => {
    row.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action="locate"]');
      if (!btn) return;
      const key = row.getAttribute('data-key');
      let defaultPath = baseDir;
      try {
        const dirs2 = await invoke('get_data_dirs');
        if (dirs2?.programs) defaultPath = dirs2.programs;
      } catch {}
      const selected = await pickExe(defaultPath);
      if (!selected) return;

      // Save a thin ProgramEntry for this tool so scans can resolve it later
      const entry = {
        id: crypto.randomUUID(),
        name: REQUIRED.find(x => x.key === key)?.name || key,
        version: '',
        description: '',
        exe_path: selected,
        logo_data_url: '',
      };
      try {
        await invoke('save_program', { program: entry });
        await renderRequired();
      } catch (e) {
        console.error(e);
        alert(typeof e === 'string' ? e : (e?.message || 'Failed to save path'));
      }
    });
  });
}

export async function initPage() {
  // Only run on settings page when present
  const root = document.querySelector('[data-page="settings"]');
  if (!root) return;
  // Prevent double-initialization when reloading route
  if (root.dataset.controllerInitialized) return;
  root.dataset.controllerInitialized = '1';

  await renderRequired();

  // ---- Sidebar pane navigation (moved from inline <script>) ----
  const nav = root.querySelector('#settings-nav');
  function panes() { return Array.from(root.querySelectorAll('[data-pane]')); }
  function showPane(id){
    panes().forEach(p => {
      const match = p.getAttribute('data-pane') === id;
      p.style.display = match ? '' : 'none';
    });
    if (nav) {
      Array.from(nav.querySelectorAll('button[data-target]')).forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === id);
      });
    }
  }
  nav?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    showPane(btn.getAttribute('data-target'));
  });
  showPane('programs');

  // ---- Technician links management (moved from inline <script>) ----
  (async function(){
    const { invoke } = window.__TAURI__.core || {};
    if (!invoke) return;
    let settings = {};
    async function load(){
      try { settings = await invoke('load_app_settings'); } catch { settings = {}; }
      if(!settings.technician_links) settings.technician_links = [];
    }
    function save(){ return invoke('save_app_settings', { data: settings }); }
    function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
    function renderLinks(){
      const list = root.querySelector('#tech-links-list');
      if(!list) return;
      const arr = settings.technician_links;
      if(!arr.length){ list.innerHTML = '<div class="muted">No links added.</div>'; return; }
      list.innerHTML = arr.map(l => `<div class="row" data-id="${l.id}"><div class="main"><div class="name">${escapeHtml(l.title||l.url)}</div><div class="muted" style="font-size:11px;">${escapeHtml(l.url)}</div></div><div class="meta" style="display:flex;gap:6px;"><button data-action="edit" class="ghost" title="Edit" style="min-width:42px;">Edit</button><button data-action="remove" class="danger" title="Remove" style="min-width:42px;">✕</button></div></div>`).join('');
      list.querySelectorAll('button[data-action="remove"]').forEach(btn=>{
        btn.addEventListener('click', e => { e.stopPropagation(); const id = btn.closest('.row').getAttribute('data-id'); settings.technician_links = settings.technician_links.filter(x=>x.id!==id); save().then(()=>{ dispatchEvent(new Event('technician-links-updated')); renderLinks(); }); });
      });
      const dialog = root.querySelector('#tech-link-editor');
      const form = root.querySelector('#tech-link-edit-form');
      const titleInput = root.querySelector('#t-edit-title');
      const urlInput = root.querySelector('#t-edit-url');
      const cancelBtn = root.querySelector('#t-edit-cancel');
      let editingId = null;
      cancelBtn?.addEventListener('click', () => dialog?.close());
      form?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!editingId) return;
        const item = settings.technician_links.find(x=>x.id===editingId);
        if (!item) return;
        item.title = titleInput.value.trim();
        item.url = urlInput.value.trim();
        await save();
        dialog.close();
        dispatchEvent(new Event('technician-links-updated'));
        renderLinks();
      });
      list.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.closest('.row')?.getAttribute('data-id');
          const item = settings.technician_links.find(x=>x.id===id);
          if(!item) return;
          editingId = id;
          titleInput.value = item.title || '';
          urlInput.value = item.url || '';
          dialog.showModal();
          titleInput.focus();
        });
      });
    }
    await load();
    renderLinks();
    const form = root.querySelector('#tech-link-form');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = (fd.get('title')||'').toString().trim();
      const url = (fd.get('url')||'').toString().trim();
      if(!title || !url) return;
      settings.technician_links.push({ id: crypto.randomUUID(), title, url });
      await save();
      form.reset();
      renderLinks();
      dispatchEvent(new Event('technician-links-updated'));
    });
  })();
}
