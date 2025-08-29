/**
 * Service Run Builder (run.js)
 * --------------------------------------------------------------
 * Responsibilities:
 *  - Present list of available maintenance/stress tasks.
 *  - Allow selecting & ordering tasks (keyboard + mouse drag reordering).
 *  - Expose per-task parameter controls (durations) inline.
 *  - Provide GPU Stress parent task with sub‑options (FurMark / HeavyLoad) where FurMark defaults on.
 *  - Generate JSON spec (similar to test_all.json) stored in sessionStorage for next page.
 *  - Resolve tool executable paths via tools.js (no hard-coded versioned paths).
 *  - Internal documentation for future contributors.
 */

import { getToolPath, getToolStatuses } from '../../utils/tools.js';

// ---- Utility helpers ------------------------------------------------------
function capitalize(s){ return s? s.charAt(0).toUpperCase()+s.slice(1):s; }

// Fetch and cache tool paths locally (avoid repeated lookups per build)
let TOOL_CACHE = null;
async function toolPath(key){
  if (!TOOL_CACHE) { TOOL_CACHE = await getToolStatuses(); }
  const hit = TOOL_CACHE.find(t => t.key === key);
  return hit?.path || null; // If null, downstream code may flag missing
}

// ---- Task definitions -----------------------------------------------------
// Basic atomic tasks (excluding GPU parent group) keyed by id.
const ATOMIC_TASKS = {
  adwcleaner_clean: {
    label: 'Adware Clean (AdwCleaner)', group: 'Cleanup', async build(state){
      const p = await toolPath('adwcleaner');
      return { type: 'adwcleaner_clean', executable_path: p, working_path: '..\\data\\logs', clean_preinstalled: false };
    }
  },
  bleachbit_clean: {
    label: 'Junk Cleanup (BleachBit)', group: 'Cleanup', async build(){
      const p = await toolPath('bleachbit');
      return { type: 'bleachbit_clean', executable_path: p, options: ['system.tmp','system.recycle_bin','system.prefetch'] };
    }
  },
  dism_health_check: {
    label: 'DISM Health Check', group: 'System Integrity', async build(){
      return { type: 'dism_health_check', actions: ['checkhealth','scanhealth','restorehealth'] };
    }
  },
  sfc_scan: { label: 'SFC Scan', group: 'System Integrity', async build(){ return { type: 'sfc_scan' }; } },
  smartctl_report: { label: 'Drive Health Report (smartctl)', group: 'Diagnostics', async build(){
    const p = await toolPath('smartctl');
    return { type: 'smartctl_report', executable_path: p, detail_level: 'basic' };
  }},
  furmark_stress_test: { label: 'GPU Stress (FurMark)', group: 'Stress', params: { seconds: 60 }, async build(state){
    const p = await toolPath('furmark');
    return { type: 'furmark_stress_test', executable_path: p, duration_seconds: state.params.seconds||60, width: 1920, height: 1080, demo: 'furmark-gl', extra_args: ['--no-gui'] };
  }},
  heavyload_stress_cpu: { label: 'CPU Stress (HeavyLoad)', group: 'Stress', params: { minutes: 1 }, async build(state){
    const p = await toolPath('heavyload');
    return { type: 'heavyload_stress_test', executable_path: p, duration_minutes: state.params.minutes||1, headless: false, stress_cpu: true, stress_memory: false, stress_gpu: false };
  }},
  heavyload_stress_memory: { label: 'RAM Stress (HeavyLoad)', group: 'Stress', params: { minutes: 1 }, async build(state){
    const p = await toolPath('heavyload');
    return { type: 'heavyload_stress_test', executable_path: p, duration_minutes: state.params.minutes||1, headless: false, stress_cpu: false, stress_memory: true, stress_gpu: false };
  }},
  heavyload_stress_gpu: { label: 'GPU Stress (HeavyLoad)', group: 'Stress', params: { minutes: 1 }, async build(state){
    const p = await toolPath('heavyload');
    return { type: 'heavyload_stress_test', executable_path: p, duration_minutes: state.params.minutes||1, headless: false, stress_cpu: false, stress_memory: false, stress_gpu: true };
  }},
};

// GPU parent pseudo-task: manages sub-options furmark_stress_test + heavyload_stress_gpu
const GPU_PARENT_ID = 'gpu_stress_parent';

// Presets define high-level visible ids (including parent groups) in initial order.
const PRESET_MAP = {
  general: ['adwcleaner_clean','bleachbit_clean','sfc_scan','dism_health_check','smartctl_report'],
  complete: ['adwcleaner_clean','bleachbit_clean','dism_health_check','sfc_scan','smartctl_report',GPU_PARENT_ID,'heavyload_stress_cpu','heavyload_stress_memory'],
  custom: ['adwcleaner_clean','bleachbit_clean','dism_health_check','sfc_scan','smartctl_report']
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
    const json = jsonEl.textContent || '{}';
    sessionStorage.setItem('service.pendingRun', json);
    window.location.hash = '#/service-report';
  });

  // Ordered visible IDs (may include GPU_PARENT_ID)
  let order = [];
  const selection = new Set();
  // Per-task mutable param state { id: { params: {...} } }
  const state = {};
  // GPU sub-selections
  const gpuSubs = { furmark: true, heavyload: false }; // default: FurMark only
  const gpuParams = { furmarkSeconds: 60, heavyloadMinutes: 1 };

  // Initialize from preset
  const base = preset ? PRESET_MAP[preset] : PRESET_MAP[mode] || PRESET_MAP.custom;
  base.forEach(id => { selection.add(id); order.push(id); });

  // Provide initial params copies
  Object.entries(ATOMIC_TASKS).forEach(([id, def]) => { if (def.params) state[id] = { params: { ...def.params } }; });

  if (preset) { titleEl.textContent = `Preset: ${capitalize(preset)} – Build Run Queue`; descEl.textContent = 'Reorder or tweak tasks before execution.'; }
  else if (mode === 'custom') { titleEl.textContent = 'Custom Service – Build Run Queue'; descEl.textContent = 'Pick tasks, arrange order, then Next.'; }
  else { titleEl.textContent = 'Build Run Queue'; descEl.textContent = 'Select tasks for this run.'; }

  // ---- Rendering ----------------------------------------------------------
  function renderPalette(){
    paletteEl.innerHTML = '';
    order.forEach(id => {
      paletteEl.appendChild(renderItem(id));
    });
    // Also append non-selected (for adding) at end
    Object.keys(ATOMIC_TASKS).concat(GPU_PARENT_ID).forEach(id => {
      if (!selection.has(id)) paletteEl.appendChild(renderItem(id));
    });
    nextBtn.disabled = selection.size === 0;
    updateJson();
  }

  function renderItem(id){
    const isGpuParent = id === GPU_PARENT_ID;
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = id;
    const selected = selection.has(id);
    li.draggable = selected; // only draggable when active
    const orderIdx = selected ? [...order].indexOf(id) + 1 : null;
    const label = isGpuParent ? 'GPU Stress' : ATOMIC_TASKS[id]?.label || id;
    const group = isGpuParent ? 'Stress' : ATOMIC_TASKS[id]?.group || '';
    // Build inner HTML
    li.innerHTML = `
      <div class="task-row${isGpuParent?' gpu-parent':''}">
        <input type="checkbox" ${selected?'checked':''} aria-label="Select task ${label}">
        <span class="grab" aria-hidden="true">⋮⋮</span>
        <span class="main">
          <span class="name">${label}</span>
          <span class="meta">${group}</span>
        </span>
      </div>`;
    const row = li.querySelector('.task-row');
    const checkbox = row.querySelector('input');

    // Order pill
    if (orderIdx) {
      const pill = document.createElement('span');
      pill.className = 'order-pill';
      pill.textContent = orderIdx;
      row.appendChild(pill);
    }

    // Parameter controls
    if (!isGpuParent && selected && ATOMIC_TASKS[id]?.params) {
      const ctlWrap = document.createElement('div');
      ctlWrap.className = 'param-controls';
      Object.keys(ATOMIC_TASKS[id].params).forEach(paramKey => {
        if (paramKey === 'seconds') {
          ctlWrap.innerHTML += `<label class="tiny-lab">Sec <input type="number" min="10" max="3600" step="10" data-param="seconds" value="${state[id].params.seconds}" /></label>`;
        } else if (paramKey === 'minutes') {
          ctlWrap.innerHTML += `<label class="tiny-lab">Min <input type="number" min="1" max="240" step="1" data-param="minutes" value="${state[id].params.minutes}" /></label>`;
        }
      });
      row.appendChild(ctlWrap);
      ctlWrap.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
          const k = inp.dataset.param;
            state[id].params[k] = Number(inp.value)||state[id].params[k];
            updateJson();
        });
      });
    }

    // GPU Parent sub-options
    if (isGpuParent) {
      const sub = document.createElement('div');
      sub.className = `gpu-sub ${selected?'' :'disabled'}`;
      sub.innerHTML = `
        <label><input type="checkbox" data-sub="furmark" ${gpuSubs.furmark?'checked':''} ${!selected?'disabled':''}> FurMark <input type="number" class="dur" data-sub-dur="furmarkSeconds" value="${gpuParams.furmarkSeconds}" min="10" max="3600" step="10" ${!selected?'disabled':''} title="Seconds"/></label>
        <label><input type="checkbox" data-sub="heavyload" ${gpuSubs.heavyload?'checked':''} ${!selected?'disabled':''}> HeavyLoad <input type="number" class="dur" data-sub-dur="heavyloadMinutes" value="${gpuParams.heavyloadMinutes}" min="1" max="240" step="1" ${!selected?'disabled':''} title="Minutes"/></label>
      `;
      row.appendChild(sub);
      sub.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => { gpuSubs[cb.dataset.sub] = cb.checked; updateJson(); }));
      sub.querySelectorAll('input.dur').forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.subDur; gpuParams[k] = Number(inp.value)||gpuParams[k]; updateJson(); }));
    }

    // Checkbox toggle
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selection.add(id);
        if (!order.includes(id)) order.push(id);
      } else {
        selection.delete(id);
        order = order.filter(x => x !== id);
      }
      renderPalette();
    });

    // Drag logic
    li.addEventListener('dragstart', e => {
      if (!selection.has(id)) { e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-task-id', id);
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', e => {
      const dragId = e.dataTransfer.getData('text/x-task-id');
      if (!dragId || dragId === id || !selection.has(dragId) || !selection.has(id)) return; // only reorder among selected
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    li.addEventListener('drop', e => {
      const dragId = e.dataTransfer.getData('text/x-task-id');
      if (!dragId || dragId === id) return;
      if (!selection.has(dragId) || !selection.has(id)) return;
      e.preventDefault();
      const from = order.indexOf(dragId); const to = order.indexOf(id);
      if (from === -1 || to === -1) return;
      order.splice(from,1);
      // Place before target depending on vertical center
      const rect = li.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height/2;
      order.splice(before?to:to+1,0,dragId);
      renderPalette();
    });
    return li;
  }

  // ---- JSON Generation ----------------------------------------------------
  async function generateTasksArray(){
    const result = [];
    for (const id of order){
      if (!selection.has(id)) continue;
      if (id === GPU_PARENT_ID) {
        if (gpuSubs.furmark) {
          const built = await ATOMIC_TASKS.furmark_stress_test.build({ params: { seconds: gpuParams.furmarkSeconds } });
          result.push(built);
        }
        if (gpuSubs.heavyload) {
          const built = await ATOMIC_TASKS.heavyload_stress_gpu.build({ params: { minutes: gpuParams.heavyloadMinutes } });
          result.push(built);
        }
        continue;
      }
      const def = ATOMIC_TASKS[id];
      if (!def) continue;
      const built = await def.build(state[id] || { params: {} });
      result.push(built);
    }
    // Filter out tasks missing executable_path (tool not found) except ones that don't require it.
    return result.map(t => ({ ...t })).filter(t => !('executable_path' in t) || !!t.executable_path);
  }

  async function updateJson(){
    jsonEl.textContent = 'Generating...';
    const tasks = await generateTasksArray();
    jsonEl.textContent = JSON.stringify({ tasks }, null, 2);
  }

  renderPalette();
  builder.hidden = false;
}

