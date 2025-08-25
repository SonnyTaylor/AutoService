function loadRunConfig() {
  try { return JSON.parse(sessionStorage.getItem('autoservice.runConfig')) || null; } catch { return null; }
}
function loadRunResult() {
  try { return JSON.parse(sessionStorage.getItem('autoservice.runResult')) || null; } catch { return null; }
}

function formatDuration(ms){
  if (typeof ms !== 'number' || ms < 0) return '—';
  const s = Math.round(ms/100)/10; // 0.1s resolution
  if (s < 60) return s + 's';
  const m = Math.floor(s/60);
  const rs = Math.round((s - m*60));
  return `${m}m ${rs}s`;
}

function text(el, v){ if (el) el.textContent = v; }

function renderOverview(cfg, result){
  const kv = document.getElementById('overview-kv');
  if (!kv) return;
  kv.innerHTML = '';
  const add = (k,v) => { const dt=document.createElement('dt');dt.textContent=k; const dd=document.createElement('dd'); dd.textContent=v; kv.append(dt,dd); };
  add('Preset', cfg?.presetLabel || '—');
  add('Run ID', cfg?.id || '—');
  add('Started', result?.startedAt ? new Date(result.startedAt).toLocaleString() : '—');
  add('Finished', result?.endedAt ? new Date(result.endedAt).toLocaleString() : '—');
  if (result?.startedAt && result?.endedAt) add('Duration', formatDuration(new Date(result.endedAt)-new Date(result.startedAt)));
  add('Overall Status', result?.overallStatus || 'Unknown');
  add('Threats Found', String(result?.aggregates?.threatsFound ?? '0'));
}

function escapeHtml(s){ return (s||'').replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function renderTasks(result){
  const wrap = document.getElementById('report-tasks');
  if (!wrap) return;
  wrap.innerHTML = '';
  (result?.tasks || []).forEach(t => {
    const div = document.createElement('div');
    div.className = 'report-task';
    const statusClass = t.status === 'ok' ? 'ok' : t.status === 'fail' ? 'error' : 'pending';
    const threats = typeof t.threatsFound === 'number' ? `<span class="badge ${t.threatsFound>0?'error':'ok'}">${t.threatsFound} threat${t.threatsFound===1?'':'s'} found</span>` : '';
    div.innerHTML = `
      <h3>${escapeHtml(t.label || t.id)} <span class="badge ${statusClass}">${t.status}</span> ${threats}</h3>
      <dl class="kv small">
        <dt>Started</dt><dd>${t.startedAt? new Date(t.startedAt).toLocaleTimeString():'—'}</dd>
        <dt>Ended</dt><dd>${t.endedAt? new Date(t.endedAt).toLocaleTimeString():'—'}</dd>
        <dt>Duration</dt><dd>${t.startedAt&&t.endedAt?formatDuration(new Date(t.endedAt)-new Date(t.startedAt)):'—'}</dd>
      </dl>
      ${t.summary ? `<p>${escapeHtml(t.summary)}</p>`:''}
      ${t.outputs && t.outputs.length ? `<details><summary>Output (${t.outputs.length})</summary><pre>${escapeHtml(t.outputs.join('\n'))}</pre></details>`:''}
    `;
    wrap.appendChild(div);
  });
}

function assembleRaw(result){
  const pre = document.getElementById('report-raw-pre');
  const card = document.getElementById('report-raw');
  if (!pre || !card) return;
  const lines = [];
  (result?.tasks||[]).forEach(t=>{
    lines.push(`== ${t.label||t.id} (${t.status}) ==`);
    (t.outputs||[]).forEach(o=> lines.push(o));
    lines.push('');
  });
  pre.textContent = lines.join('\n');
  card.hidden = lines.length === 0;
}

export async function initPage(){
  const cfg = loadRunConfig();
  const result = loadRunResult();
  if (!cfg || !result){
    document.getElementById('service-report-sub').textContent = 'No completed service run found.';
    setTimeout(()=> window.location.hash = '#/service', 1200);
    return;
  }
  text(document.getElementById('service-report-preset'), `Preset: ${cfg.presetLabel}`);
  renderOverview(cfg, result);
  renderTasks(result);
  assembleRaw(result);
  document.getElementById('service-report-back')?.addEventListener('click', ()=> window.location.hash = '#/service');
  document.getElementById('service-report-print')?.addEventListener('click', ()=> window.print());
}
