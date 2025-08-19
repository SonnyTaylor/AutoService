function getHashQuery() {
  const hash = window.location.hash || '';
  const idx = hash.indexOf('?');
  if (idx === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(idx + 1));
}

const TASKS = [
    { id: 'virus', label: 'Virus scanning/removal (malware, rootkits, adware, PUP)' },
    { id: 'junk_cleanup', label: 'Junk/Temp Cleanup' },
    { id: 'registry_cleanup', label: 'Registry Cleanup' },
    { id: 'startup_cleanup', label: 'Startup Programs Cleanup' },
    { id: 'browser_cleanup', label: 'Browser Cache/Cookies Cleanup' },
    { id: 'cpu_bench', label: 'CPU Benchmark' },
    { id: 'gpu_bench', label: 'GPU Benchmark' },
    { id: 'drive_bench', label: 'Drive Benchmark' },
    { id: 'battery_report', label: 'Battery Report' },
    { id: 'storage_report', label: 'Storage/SMART Report' },
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

// Return the IDs of selected TOP-LEVEL tasks (ignore sub-options)
function getSelection() {
  return Array.from(document.querySelectorAll('#task-list input.task-checkbox[type="checkbox"]:checked')).map(el => el.value);
}

function getVirusEnginesSelection() {
  return Array.from(document.querySelectorAll('#task-list input.virus-engine[type="checkbox"]:checked')).map(el => el.value);
}

function updateStartEnabled() {
  const start = document.getElementById('service-start');
  const preset = (getHashQuery().get('preset') || 'general');
  const any = getSelection().length > 0;
  // Enforce: If Virus is selected, at least one engine must be selected
  const virusChecked = document.getElementById('task_virus')?.checked;
  const engines = getVirusEnginesSelection();
  const virusInvalid = !!virusChecked && engines.length === 0;

  // Show/hide inline hint for virus engines
  const hint = document.getElementById('virus-engine-hint');
  if (hint) hint.hidden = !virusInvalid;

  // In custom preset, disable Start when no tasks; in all presets, also disable if virus invalid
  const disableForPreset = (preset === 'custom' ? !any : false);
  start.disabled = disableForPreset || virusInvalid;
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
      <input id="${id}" class="task-checkbox" type="checkbox" value="${task.id}" ${selectedIds.includes(task.id) ? 'checked' : ''} />
      <div class="main">
        <div class="name">${task.label}</div>
      </div>
    `;
    wrap.appendChild(row);

    // Special-case: render sub-options for Virus scanning
    if (task.id === 'virus') {
      const sub = document.createElement('div');
      sub.className = 'subtasks';
      sub.innerHTML = `
        <div class="sub-title muted">Pick at least one engine:</div>
        <label class="sub-row"><input type="checkbox" class="virus-engine" value="kvrt" /> <span>KVRT</span></label>
        <label class="sub-row"><input type="checkbox" class="virus-engine" value="clamav" /> <span>ClamAV</span></label>
        <label class="sub-row"><input type="checkbox" class="virus-engine" value="defender" /> <span>Windows Defender</span></label>
        <div id="virus-engine-hint" class="badge warn" hidden>Choose at least one engine to enable Virus scanning</div>
      `;
      wrap.appendChild(sub);

      // Behavior: the main Virus checkbox reflects whether any engine is selected
      const mainCb = document.getElementById('task_virus');
      const engineCbs = Array.from(sub.querySelectorAll('input.virus-engine'));

      const syncMainFromEngines = () => {
        const anySel = engineCbs.some(cb => cb.checked);
        if (mainCb) mainCb.checked = anySel;
        updateStartEnabled();
      };

      engineCbs.forEach(cb => cb.addEventListener('change', syncMainFromEngines));

      // If user unchecks the main Virus task, clear engines
      mainCb?.addEventListener('change', (e) => {
        const anySel = engineCbs.some(cb => cb.checked);
        if (mainCb.checked && !anySel) {
          // Disallow checking Virus without engines; revert and hint
          mainCb.checked = false;
          const first = engineCbs[0];
          first?.focus();
        } else if (!mainCb.checked) {
          engineCbs.forEach(cb => (cb.checked = false));
        }
        updateStartEnabled();
      });
    }
  });
  wrap.querySelectorAll('input.task-checkbox[type="checkbox"]').forEach(cb => cb.addEventListener('change', updateStartEnabled));
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
    const virusEngines = getVirusEnginesSelection();
    const cfg = {
      id: `run_${Date.now()}`,
      preset,
      presetLabel: humanPreset(preset),
      tasks: chosenTasks,
      virusEngines,
      createdAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem('autoservice.runConfig', JSON.stringify(cfg));
    } catch {}
    window.location.hash = '#/service-run';
  });
}
