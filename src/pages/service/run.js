export async function initPage(){
  const params = new URLSearchParams(location.hash.split('?')[1]||'');
  const preset = params.get('preset');
  const mode = params.get('mode');
  const descEl = document.getElementById('svc-run-desc');
  const cfg = document.getElementById('svc-run-config');
  const list = document.getElementById('svc-task-list');
  const back = document.getElementById('svc-run-back');

  back?.addEventListener('click', () => { window.location.hash = '#/service'; });

  let tasks = [];
  if (preset === 'general') tasks = ['Temp + Cache Cleanup','Basic AV Scan (stub)','Quick Disk Check'];
  else if (preset === 'complete') tasks = ['Temp + Cache Cleanup','Deep Malware Scan (stub)','Disk Health Summary','Stress Test (stub)','System Snapshot'];
  else if (mode === 'custom') tasks = ['(Custom builder coming – no tasks yet)'];

  if (preset) descEl.textContent = `Preset: ${preset}`;
  else if (mode) descEl.textContent = `Mode: ${mode}`;
  else descEl.textContent = 'No preset selected.';

  list.innerHTML = tasks.map(t => `<li>${t}</li>`).join('');
  cfg.hidden = false;
}
