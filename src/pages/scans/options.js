function getHashQuery() {
  const hash = window.location.hash || '';
  const idx = hash.indexOf('?');
  if (idx === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(idx + 1));
}

const TASKS = [
  { id: 'virus', label: 'Virus scanning/removal (malware, rootkits, adware, PUP)' },
  { id: 'cpu_bench', label: 'CPU Benchmark' },
  { id: 'gpu_bench', label: 'GPU Benchmark' },
  { id: 'drive_bench', label: 'Drive Benchmark' },
  { id: 'battery_report', label: 'Battery Report' },
  { id: 'storage_report', label: 'Storage/SMART Report' },
  { id: 'registry_cleanup', label: 'Registry Cleanup' },
  { id: 'junk_cleanup', label: 'Junk/Temp Cleanup' },
  { id: 'driver_updates', label: 'Driver Updates' },
  { id: 'windows_updates', label: 'Windows Updates' },
];

function presetDefaults(preset) {
  if (preset === 'complete-general') {
    return TASKS.map(t => t.id);
  }
  if (preset === 'general') {
    return ['virus','junk_cleanup','registry_cleanup','storage_report','windows_updates'];
  }
  return [];
}

function humanPreset(preset) {
  return preset === 'complete-general' ? 'Complete General Service' : preset === 'custom' ? 'Custom Service' : 'General Service';
}

function getSelection() {
  return Array.from(document.querySelectorAll('#task-list input[type="checkbox"]:checked')).map(el => el.value);
}

function updateStartEnabled() {
  const start = document.getElementById('service-start');
  const preset = (getHashQuery().get('preset') || 'general');
  const any = getSelection().length > 0;
  start.disabled = preset === 'custom' ? !any : false;
}

function renderTasks(selectedIds) {
  const wrap = document.getElementById('task-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  TASKS.forEach(task => {
    const id = `task_${task.id}`;
    const row = document.createElement('label');
    row.className = 'task-row';
    row.setAttribute('for', id);
    row.innerHTML = `
      <input id="${id}" type="checkbox" value="${task.id}" ${selectedIds.includes(task.id) ? 'checked' : ''} />
      <div class="main">
        <div class="name">${task.label}</div>
      </div>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', updateStartEnabled));
  updateStartEnabled();
}

export async function initPage() {
  const params = getHashQuery();
  const preset = params.get('preset') || 'general';
  const sub = document.getElementById('service-sub');
  const presetPill = document.getElementById('preset-pill');
  const backBtn = document.getElementById('back-btn');
  const startBtn = document.getElementById('service-start');

  if (sub) {
    sub.textContent = preset === 'custom'
      ? 'Select the exact items you want to run.'
      : 'Preset preselected. You can add/remove items.';
  }
  if (presetPill) presetPill.textContent = `Preset: ${humanPreset(preset)}`;

  const selected = presetDefaults(preset);
  renderTasks(selected);

  backBtn?.addEventListener('click', () => {
    window.location.hash = '#/scans';
  });

  startBtn?.addEventListener('click', () => {
    const chosenTasks = getSelection();
    const cfg = {
      id: `run_${Date.now()}`,
      preset,
      presetLabel: humanPreset(preset),
      tasks: chosenTasks,
      createdAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem('autoservice.runConfig', JSON.stringify(cfg));
    } catch {}
    window.location.hash = '#/service-run';
  });
}
