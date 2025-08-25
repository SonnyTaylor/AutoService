const { Command } = window.__TAURI__.shell;

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
  // Only the virus step is implemented for now.
  if (id === 'virus') return 'Virus scanning/removal';
  return id;
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
  const stepEls = [];
  cfg.tasks.forEach((taskId, idx) => {
    const li = document.createElement('li');
    li.className = 'run-step state-pending';
    const extra = (taskId === 'virus' && Array.isArray(cfg.virusEngines) && cfg.virusEngines.length)
      ? ` <span class="muted">(${cfg.virusEngines.join(', ')})</span>`
      : '';
    li.innerHTML = `
      <span class="state-dot" aria-hidden="true"></span>
      <span class="step-name">${stepLabel(taskId)}${extra}</span>
      <span class="step-meta muted">Queued</span>
    `;
    runSteps.appendChild(li);
    stepEls.push(li);
  });

  runBack?.addEventListener('click', () => {
    const qp = new URLSearchParams({ preset: cfg.preset });
    window.location.hash = `#/service?${qp.toString()}`;
  });

  const logEl = document.getElementById('run-log');
  const appendLog = (line) => {
    if (!logEl) return;
    const ts = new Date().toLocaleTimeString();
    logEl.textContent += `\n[${ts}] ${line}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setStepState = (idx, state, meta) => {
    const el = stepEls[idx];
    if (!el) return;
    el.className = `run-step state-${state}`;
    const metaEl = el.querySelector('.step-meta');
    if (metaEl) metaEl.textContent = meta || (state === 'running' ? 'Running' : state === 'ok' ? 'Done' : state === 'fail' ? 'Failed' : 'Queued');
  };

  // Resolve the path to MpCmdRun.exe via PowerShell (latest Platform folder)
  async function resolveMpCmdRunPath() {
    try {
  const ps = Command.create('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "(Get-ChildItem -Path \"$env:ProgramData\\Microsoft\\Windows Defender\\Platform\" -Directory | Sort-Object Name -Descending | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName 'MpCmdRun.exe' })"
      ]);
      const res = await ps.execute();
      const out = (res.stdout || '').trim();
      return out || null;
    } catch (e) {
      appendLog(`Failed to resolve MpCmdRun.exe path: ${e.message || e}`);
      return null;
    }
  }

  async function runDefenderQuickScan() {
    appendLog('Windows Defender: resolving MpCmdRun.exe path…');
    // Prefer backend-invoked scan when available (returns JSON with stdout/stderr)
    if (typeof window.__TAURI__?.invoke === 'function') {
      appendLog('Windows Defender: invoking backend scan...');
      try {
        const res = await window.__TAURI__.invoke('run_defender_scan');
        appendLog('Windows Defender: backend scan completed.');
        try { appendLog(JSON.stringify(res)); } catch { appendLog(String(res)); }
        if (res?.quick_scan?.code && res.quick_scan.code !== 0) {
          throw new Error(`Quick scan exited with code ${res.quick_scan.code}`);
        }
        return;
      } catch (e) {
        appendLog(`Backend scan failed: ${e.message || e}`);
        appendLog('Falling back to local PowerShell execution');
      }
    }

    const exePath = await resolveMpCmdRunPath();
    if (!exePath) {
      throw new Error('Could not find MpCmdRun.exe');
    }
    appendLog(`Windows Defender: using ${exePath}`);

    // Update signatures (best effort)
    try {
      appendLog('Windows Defender: updating signatures…');
  const upd = await Command.create('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', `& '${exePath.replace(/'/g, "''")}' -SignatureUpdate`
      ]).execute();
      if (upd.code !== 0) appendLog(`Signature update exited with code ${upd.code}`);
      if (upd.stdout) appendLog(upd.stdout.trim());
      if (upd.stderr) appendLog(upd.stderr.trim());
    } catch (e) {
      appendLog(`Signature update error: ${e.message || e}`);
    }

    // Quick scan
    appendLog('Windows Defender: starting quick scan…');
  const scan = await Command.create('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', `& '${exePath.replace(/'/g, "''")}' -Scan -ScanType 1`
    ]).execute();
    if (scan.stdout) appendLog(scan.stdout.trim());
    if (scan.stderr) appendLog(scan.stderr.trim());
    if (scan.code !== 0) {
      throw new Error(`Quick scan exited with code ${scan.code}`);
    }
  }

  // Execute tasks sequentially; only Virus/Defender is implemented.
  (async () => {
    for (let i = 0; i < cfg.tasks.length; i++) {
      const taskId = cfg.tasks[i];
      try {
        setStepState(i, 'running');
        if (taskId === 'virus') {
          const engines = Array.isArray(cfg.virusEngines) ? cfg.virusEngines : [];
          if (engines.includes('defender')) {
            await runDefenderQuickScan();
          } else {
            appendLog('Virus scan: Defender not selected; nothing to run.');
          }
        } else {
          appendLog(`${stepLabel(taskId)}: not implemented.`);
        }
        setStepState(i, 'ok');
      } catch (e) {
        appendLog(`${stepLabel(taskId)} failed: ${e.message || e}`);
        setStepState(i, 'fail');
      }
    }
    appendLog('All steps processed.');
  })();
}
