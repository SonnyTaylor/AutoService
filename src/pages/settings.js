// Settings page controller for required external tools
const { invoke } = window.__TAURI__.core;
const { Command } = window.__TAURI__?.shell || {};

// List of required tools with fuzzy match keys and optional detector
const REQUIRED = [
  { key: 'ccleaner', name: 'CCleaner', match: ['ccleaner'], hint: 'CCleaner.exe', prefer: 'CCleaner/CCleaner64.exe' },
  { key: 'bleachbit', name: 'BleachBit', match: ['bleachbit'], hint: 'bleachbit.exe' },
  { key: 'clamav', name: 'ClamAV', match: ['clamav', 'clamscan'], hint: 'clamscan.exe' },
  { key: 'kvrt', name: 'KVRT', match: ['kvrt'], hint: 'KVRT.exe' },
  { key: 'defender', name: 'Windows Defender (MpCmdRun)', match: ['mpcmdrun', 'windows defender'], hint: 'Resolved automatically' , detector: detectDefender },
  { key: 'furmark2', name: 'Furmark 2', match: ['furmark'], hint: 'FurMark.exe' },
  { key: 'stressng', name: 'StressNG', match: ['stressng','stress-ng'], hint: 'stress-ng.exe' },
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
  if (!document.querySelector('[data-page="settings"]')) return;
  await renderRequired();
}
