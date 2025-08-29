import { getToolPath } from '../../utils/tools.js';

// Canonical task definitions mapping UI id -> JSON entry builder
const TASK_DEFS = [
  {
    id: 'adwcleaner_clean',
    label: 'Adware Clean (AdwCleaner)',
    group: 'Cleanup',
    async build() {
      const p = await getToolPath('adwcleaner');
      return { type: 'adwcleaner_clean', executable_path: p || '..\\data\\programs\\AdwCleaner - 8.5.0\\adwcleaner.exe', working_path: '..\\data\\logs', clean_preinstalled: false };
    }
  },
  {
    id: 'bleachbit_clean',
    label: 'Junk Cleanup (BleachBit)',
    group: 'Cleanup',
    async build() {
      const p = await getToolPath('bleachbit');
      return { type: 'bleachbit_clean', executable_path: p || '..\\data\\programs\\BleachBit - 5.0.0\\BleachBit-Portable\\bleachbit_console.exe', options: [ 'system.tmp','system.recycle_bin','system.prefetch' ] };
    }
  },
  {
    id: 'dism_health_check',
    label: 'DISM Health Check',
    group: 'System Integrity',
    async build() { return { type: 'dism_health_check', actions: ['checkhealth','scanhealth','restorehealth'] }; }
  },
  {
    id: 'sfc_scan',
    label: 'SFC Scan',
    group: 'System Integrity',
    async build() { return { type: 'sfc_scan' }; }
  },
  {
    id: 'smartctl_report',
    label: 'Drive Health Report (smartctl)',
    group: 'Diagnostics',
    async build() {
      const p = await getToolPath('smartctl');
      return { type: 'smartctl_report', executable_path: p || '..\\data\\programs\\GSmartControl - 2.0.2\\smartctl.exe', detail_level: 'basic' };
    }
  },
  {
    id: 'gpu_stress',
    label: 'GPU Stress (FurMark + HeavyLoad)',
    group: 'Stress',
    async build() {
      const fur = await getToolPath('furmark');
      const hw = await getToolPath('heavyload');
      return [
        { type: 'furmark_stress_test', executable_path: fur || '..\\data\\programs\\FurMark2 - 2.9.0\\furmark.exe', duration_seconds: 60, width: 1920, height: 1080, demo: 'furmark-gl', extra_args: ['--no-gui'] },
        { type: 'heavyload_stress_test', executable_path: hw || '..\\data\\programs\\HeavyLoad - 4.0\\HeavyLoad.exe', duration_minutes: 1, headless: false, stress_cpu: false, stress_memory: false, stress_gpu: true }
      ];
    }
  },
  {
    id: 'cpu_stress',
    label: 'CPU Stress (HeavyLoad)',
    group: 'Stress',
    async build() {
      const hw = await getToolPath('heavyload');
      return { type: 'heavyload_stress_test', executable_path: hw || '..\\data\\programs\\HeavyLoad - 4.0\\HeavyLoad.exe', duration_minutes: 1, headless: false, stress_cpu: true, stress_memory: false, stress_gpu: false };
    }
  },
  {
    id: 'ram_stress',
    label: 'RAM Stress (HeavyLoad)',
    group: 'Stress',
    async build() {
      const hw = await getToolPath('heavyload');
      return { type: 'heavyload_stress_test', executable_path: hw || '..\\data\\programs\\HeavyLoad - 4.0\\HeavyLoad.exe', duration_minutes: 1, headless: false, stress_cpu: false, stress_memory: true, stress_gpu: false };
    }
  },
];

const PRESET_MAP = {
  general: ['adwcleaner_clean','bleachbit_clean','sfc_scan','dism_health_check','smartctl_report'],
  complete: ['adwcleaner_clean','bleachbit_clean','dism_health_check','sfc_scan','smartctl_report','cpu_stress','ram_stress','gpu_stress'],
  custom: ['adwcleaner_clean','bleachbit_clean','dism_health_check','sfc_scan','smartctl_report'] // start with common core
};

export async function initPage(){
  const params = new URLSearchParams(location.hash.split('?')[1]||'');
  const preset = params.get('preset');
  const mode = params.get('mode');
  const descEl = document.getElementById('svc-run-desc');
  const titleEl = document.getElementById('svc-run-title');
  const paletteEl = document.getElementById('svc-task-palette');
  const builder = document.getElementById('svc-run-builder');
  const jsonEl = document.getElementById('svc-json');
  const nextBtn = document.getElementById('svc-run-next');
  const back = document.getElementById('svc-run-back');

  back?.addEventListener('click', () => { window.location.hash = '#/service'; });
  nextBtn?.addEventListener('click', () => {
    const json = generateJson();
    sessionStorage.setItem('service.pendingRun', json);
    window.location.hash = '#/service-report'; // future run/execute page
  });

  // State array of task ids in order; toggling removes/adds
  let order = [];
  const selection = new Set();

  // init based on preset or mode
  const base = preset ? PRESET_MAP[preset] : PRESET_MAP[mode] || PRESET_MAP.custom;
  base.forEach(id => { selection.add(id); order.push(id); });

  if (preset) { titleEl.textContent = `Preset: ${capitalize(preset)} – Build Run Queue`; descEl.textContent = 'Reorder or toggle tasks before execution.'; }
  else if (mode === 'custom') { titleEl.textContent = 'Custom Service – Build Run Queue'; descEl.textContent = 'Pick tasks, arrange order, then Next.'; }
  else { titleEl.textContent = 'Build Run Queue'; descEl.textContent = 'Select tasks for this run.'; }

  // Render palette list items
  function renderPalette(){
    paletteEl.innerHTML = '';
    TASK_DEFS.forEach(def => {
      const li = document.createElement('li');
      li.className = 'task-item';
      li.setAttribute('data-id', def.id);
      li.draggable = selection.has(def.id);
      li.innerHTML = `
        <label class="task-row">
          <input type="checkbox" ${selection.has(def.id)?'checked':''} aria-label="Select task ${def.label}">
          <span class="grab" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
          <span class="main">
            <span class="name">${def.label}</span>
            <span class="meta">${def.group}</span>
          </span>
        </label>`;
      const checkbox = li.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selection.add(def.id);
          order.push(def.id);
        } else {
          selection.delete(def.id);
          order = order.filter(i => i !== def.id);
        }
        renderPalette();
        updateJson();
      });
      // Drag events
      li.addEventListener('dragstart', e => {
        if (!selection.has(def.id)) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', def.id);
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('text/plain')) return;
        const draggingId = e.dataTransfer.getData('text/plain');
        if (!selection.has(draggingId) || draggingId === def.id) return;
        e.preventDefault();
        const rect = li.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        const currentIdx = order.indexOf(def.id);
        const dragIdx = order.indexOf(draggingId);
        if (currentIdx === -1 || dragIdx === -1) return;
        if (before && dragIdx > currentIdx) {
          // moving up
          order.splice(dragIdx,1); order.splice(currentIdx,0,draggingId);
          renderPalette(); updateJson();
          const newEl = paletteEl.querySelector(`[data-id="${draggingId}"]`); newEl?.classList.add('just-dropped');
        } else if (!before && dragIdx < currentIdx) {
          // moving down
          order.splice(dragIdx,1); order.splice(currentIdx+1,0,draggingId);
          renderPalette(); updateJson();
          const newEl = paletteEl.querySelector(`[data-id="${draggingId}"]`); newEl?.classList.add('just-dropped');
        }
      });
      // Visual selection order index pill
      if (selection.has(def.id)) {
        const idx = order.indexOf(def.id) + 1;
        const badge = document.createElement('span');
        badge.className = 'order-pill';
        badge.textContent = idx;
        li.querySelector('.task-row').appendChild(badge);
      }
      paletteEl.appendChild(li);
    });
    nextBtn.disabled = order.length === 0;
  }

  function capitalize(s){ return s? s.charAt(0).toUpperCase()+s.slice(1):s; }

  async function generateTasksArray(){
    const out = [];
    for (const id of order){
      const def = TASK_DEFS.find(d => d.id === id || (id==='gpu_stress' && d.id==='gpu_stress'));
      if (!def) continue;
      const built = await def.build();
      if (Array.isArray(built)) out.push(...built); else out.push(built);
    }
    return out;
  }

  function generateJsonString(tasks){
    return JSON.stringify({ tasks }, null, 2);
  }

  async function updateJson(){
    jsonEl.textContent = 'Generating...';
    const tasks = await generateTasksArray();
    jsonEl.textContent = generateJsonString(tasks);
  }

  function generateJson(){ return jsonEl.textContent || '{}'; }

  renderPalette();
  builder.hidden = false;
  updateJson();
}

