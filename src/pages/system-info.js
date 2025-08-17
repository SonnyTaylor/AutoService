// System Info page controller
const { invoke } = window.__TAURI__.core;

function $(sel, root = document) { return root.querySelector(sel); }

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]; let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatPct(n, total) { if (!total) return "-"; return `${Math.round((n/total)*100)}%`; }

function formatDuration(seconds) {
  if (seconds == null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function render(info) {
  const root = document.querySelector('[data-page="system-info"]');
  if (!root) return;
  const usedMem = info.memory.used;
  const totalMem = info.memory.total || 1;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));

  const load1 = info.load_avg?.one ?? 0;
  const load5 = info.load_avg?.five ?? 0;
  const load15 = info.load_avg?.fifteen ?? 0;
  // Summary cards
  const summary = document.createElement('div');
  summary.className = 'card-grid';
  summary.innerHTML = `
    <div class="card">
      <div class="card-title">Operating System</div>
      <div class="card-body">
        <div>${escapeHtml(info.os || 'Unknown')}</div>
        <div class="muted">Kernel ${escapeHtml(info.kernel_version || '-')}, Build ${escapeHtml(info.os_version || '-')}</div>
        <div class="muted">Host ${escapeHtml(info.hostname || '-')}</div>
        <div class="stat-grid">
          <div class="stat"><div class="label">Uptime</div><div class="value">${formatDuration(info.uptime_seconds)}</div></div>
          <div class="stat"><div class="label">Load (1/5/15)</div><div class="value">${load1.toFixed(2)} / ${load5.toFixed(2)} / ${load15.toFixed(2)}</div></div>
          <div class="stat"><div class="label">Users</div><div class="value">${(info.users||[]).length}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">CPU</div>
      <div class="card-body">
        <div>${escapeHtml(info.cpu.brand)}</div>
        <div class="muted">${info.cpu.num_physical_cores ?? '-'}C / ${info.cpu.num_logical_cpus}T • ${info.cpu.frequency_mhz} MHz${info.cpu.vendor_id?` • ${escapeHtml(info.cpu.vendor_id)}`:''}</div>
        ${info.cpu.cores?.length ? `<details><summary>Per-core usage</summary><div class="muted">${info.cpu.cores.map(c=>`<span class="badge">${escapeHtml(c.name)} ${Math.round(c.usage_percent)}%</span>`).join(' ')}</div></details>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Memory</div>
      <div class="card-body">
        <div>${formatBytes(usedMem)} / ${formatBytes(totalMem)} used <span class="badge">${memPct}%</span></div>
        <div class="progress" aria-label="memory usage"><div class="bar" style="width:${memPct}%;"></div></div>
        <div class="muted">Free ${formatBytes(info.memory.free)} • Swap ${formatBytes(info.memory.swap_used)} / ${formatBytes(info.memory.swap_total)}</div>
      </div>
    </div>
    ${info.battery ? `
    <div class="card">
      <div class="card-title">Battery</div>
      <div class="card-body">
        <div>
          <span class="badge ${info.battery.percentage >= 50 ? 'ok' : info.battery.percentage >= 20 ? '' : 'warn'}">${info.battery.percentage.toFixed(0)}%</span>
          <span class="muted" style="margin-left:8px;">${escapeHtml(info.battery.state)}</span>
        </div>
        <div class="muted">${info.battery.cycle_count != null ? `${info.battery.cycle_count} cycles • ` : ''}${info.battery.state_of_health_pct!=null?`${info.battery.state_of_health_pct.toFixed(0)}% health • `:''}${info.battery.voltage_v!=null?`${info.battery.voltage_v.toFixed(2)} V`:''}</div>
        <div class="muted">${info.battery.energy_full_wh!=null?`Full ${info.battery.energy_full_wh.toFixed(1)} Wh • `:''}${info.battery.energy_full_design_wh!=null?`Design ${info.battery.energy_full_design_wh.toFixed(1)} Wh`:''}</div>
        ${info.battery.time_to_full_sec!=null?`<div class="muted">To full ${formatDuration(info.battery.time_to_full_sec)}</div>`:''}
        ${info.battery.time_to_empty_sec!=null?`<div class="muted">To empty ${formatDuration(info.battery.time_to_empty_sec)}</div>`:''}
      </div>
    </div>` : ''}
    ${info.motherboard ? `
    <div class="card">
      <div class="card-title">Motherboard</div>
      <div class="card-body">
        <div>${escapeHtml(info.motherboard.vendor || '-')}${info.motherboard.name?` ${escapeHtml(info.motherboard.name)}`:''}</div>
        <div class="muted">${info.motherboard.version?`v${escapeHtml(info.motherboard.version)} • `:''}${info.motherboard.serial_number?`S/N ${escapeHtml(info.motherboard.serial_number)} • `:''}${info.motherboard.asset_tag?`Asset ${escapeHtml(info.motherboard.asset_tag)}`:''}</div>
      </div>
    </div>` : ''}
    ${info.product ? `
    <div class="card">
      <div class="card-title">Product</div>
      <div class="card-body">
        <div>${escapeHtml(info.product.vendor || '-')}${info.product.name?` ${escapeHtml(info.product.name)}`:''}${info.product.family?` • ${escapeHtml(info.product.family)}`:''}</div>
        <div class="muted">${info.product.version?`v${escapeHtml(info.product.version)} • `:''}${info.product.sku?`SKU ${escapeHtml(info.product.sku)} • `:''}${info.product.uuid?`UUID ${escapeHtml(info.product.uuid)} • `:''}${info.product.serial_number?`S/N ${escapeHtml(info.product.serial_number)}`:''}</div>
      </div>
    </div>` : ''}
  `;

  // Storage list
  const disks = document.createElement('div');
  disks.className = 'card';
  disks.innerHTML = `
    <div class="card-title">Storage</div>
    <div class="list">
      ${info.disks.map(d => {
        const used = Math.max(0, (d.total_space - d.available_space));
        const pct = d.total_space ? Math.min(100, Math.round((used / d.total_space) * 100)) : 0;
        return `
        <div class="row">
          <div class="main">
            <div class="name">${escapeHtml(d.name || d.mount_point)}</div>
            <div class="muted">${escapeHtml(d.file_system)} • ${escapeHtml(d.mount_point)}${d.is_removable?' • Removable':''}${d.is_read_only?' • Read-only':''}${d.kind?` • ${escapeHtml(d.kind)}`:''}</div>
            <div class="progress" aria-label="disk usage"><div class="bar" style="width:${pct}%;"></div></div>
          </div>
          <div class="meta">
            <div>${formatBytes(used)} / ${formatBytes(d.total_space)} <span class="badge">${pct}%</span></div>
            <div class="muted">R:${formatBytes(d.read_bytes)} • W:${formatBytes(d.written_bytes)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Network list
  const nets = document.createElement('div');
  nets.className = 'card';
  nets.innerHTML = `
    <div class="card-title">Network</div>
    <div class="list">
      ${info.networks.map(n => `
        <div class="row">
          <div class="main">
            <div class="name">${escapeHtml(n.interface)}</div>
            <div class="muted">${n.mac?`MAC ${escapeHtml(n.mac)} • `:''}MTU ${n.mtu} • ${n.ips.map(escapeHtml).join(', ')}</div>
          </div>
          <div class="meta">
            <div>Rx ${formatBytes(n.total_received)} <span class="muted">(Δ${formatBytes(n.received)})</span></div>
            <div class="muted">Tx ${formatBytes(n.total_transmitted)} (Δ${formatBytes(n.transmitted)})${(n.errors_rx||n.errors_tx)?` • Err ${n.errors_rx}/${n.errors_tx}`:''}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // GPU list
  const gpus = document.createElement('div');
  gpus.className = 'card';
  gpus.innerHTML = `
    <div class="card-title">Graphics</div>
    <div class="list">
      ${info.gpus.length ? info.gpus.map(g => `
        <div class="row">
          <div class="main"><div class="name">${escapeHtml(g.name)}</div></div>
        </div>
      `).join('') : '<div class="muted">No GPU info available</div>'}
    </div>
  `;

  // Sensors
  const sensors = document.createElement('div');
  sensors.className = 'card';
  sensors.innerHTML = `
    <div class="card-title">Sensors</div>
    ${info.sensors.length ? `
      <div class="sensor-grid">
        ${info.sensors.map(s => {
          const t = s.temperature_c;
          const cls = t < 60 ? 'cool' : t < 80 ? 'warm' : 'hot';
          return `<div class="sensor"><div class="label">${escapeHtml(s.label)}</div><div class="temp ${cls}">${t.toFixed(1)} °C</div></div>`;
        }).join('')}
      </div>
    ` : '<div class="muted">No sensor data</div>'}
  `;

  // Clear and append
  const section = document.querySelector('section.page[data-page="system-info"]');
  section.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; justify-content: space-between; flex-wrap: wrap;">
        <div>
          <h1 style="margin-bottom:4px;">System Info</h1>
          <p class="muted" style="margin:0;">Hardware, software, drivers, and temperatures at a glance.</p>
        </div>
        <div>
          <button id="sysinfo-refresh-btn" class="ghost">Refresh</button>
        </div>
      </div>
  `;
  section.appendChild(summary);
  section.appendChild(disks);
  section.appendChild(nets);
  section.appendChild(gpus);
  section.appendChild(sensors);

  // Bind refresh
  const btn = document.getElementById('sysinfo-refresh-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      try {
        const data = await invoke('get_system_info');
        render(data);
      } catch (e) {
        console.error(e);
      } finally {
        // no-op; new render will recreate button
      }
    });
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

export async function initPage() {
  const container = document.querySelector('[data-page="system-info"]');
  if (!container) return;
  const skel = document.createElement('div');
  skel.className = 'muted';
  skel.textContent = 'Loading system information…';
  container.appendChild(skel);
  try {
    const info = await invoke('get_system_info');
    render(info);
  } catch (e) {
    container.innerHTML = '<section class="page"><h1>System Info</h1><p class="muted">Failed to read system information.</p></section>';
    console.error(e);
  }
}
