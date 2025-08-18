function loadRunConfig() {
  try {
    const raw = sessionStorage.getItem('autoservice.runConfig');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to parse run config', e);
    return null;
  }
}

function stepLabel(id) {
  const map = {
    virus: 'Virus scanning/removal',
    cpu_bench: 'CPU Benchmark',
    gpu_bench: 'GPU Benchmark',
    drive_bench: 'Drive Benchmark',
    battery_report: 'Battery Report',
    storage_report: 'Storage/SMART Report',
    registry_cleanup: 'Registry Cleanup',
    junk_cleanup: 'Junk/Temp Cleanup',
    driver_updates: 'Driver Updates',
    windows_updates: 'Windows Updates',
  };
  return map[id] || id;
}

export async function initPage() {
  const cfg = loadRunConfig();
  const runSteps = document.getElementById('run-steps');
  const runSub = document.getElementById('run-sub');
  const runPreset = document.getElementById('run-preset');
  const runBack = document.getElementById('run-back');

  if (!cfg) {
    if (runSub) runSub.textContent = 'No run configuration found. Returning to options…';
    setTimeout(() => (window.location.hash = '#/service'), 800);
    return;
  }

  runSub.textContent = `Preset: ${cfg.presetLabel}`;
  runPreset.textContent = `Preset: ${cfg.presetLabel}`;

  runSteps.innerHTML = '';
  cfg.tasks.forEach((taskId, idx) => {
    const li = document.createElement('li');
    li.className = 'run-step state-pending';
    li.innerHTML = `
      <span class="state-dot" aria-hidden="true"></span>
      <span class="step-name">${stepLabel(taskId)}</span>
      <span class="step-meta muted">Queued</span>
    `;
    runSteps.appendChild(li);
  });

  runBack?.addEventListener('click', () => {
    const qp = new URLSearchParams({ preset: cfg.preset });
    window.location.hash = `#/service?${qp.toString()}`;
  });
}
