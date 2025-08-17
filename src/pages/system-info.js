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

function render(info) {
  const root = document.querySelector('[data-page="system-info"]');
  if (!root) return;
  // Summary cards
  const summary = document.createElement('div');
  summary.className = 'card-grid';
  summary.innerHTML = `
    <div class="card">
      <div class="card-title">OS</div>
      <div class="card-body">
        <div>${escapeHtml(info.os || 'Unknown')}</div>
        <div class="muted">Kernel ${escapeHtml(info.kernel_version || '-')}, Build ${escapeHtml(info.os_version || '-')}</div>
        <div class="muted">Host ${escapeHtml(info.hostname || '-')}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">CPU</div>
      <div class="card-body">
        <div>${escapeHtml(info.cpu.brand)}</div>
        <div class="muted">${info.cpu.num_physical_cores ?? '-'}C / ${info.cpu.num_logical_cpus}T • ${info.cpu.frequency_mhz} MHz</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Memory</div>
      <div class="card-body">
        <div>${formatBytes(info.memory.used)} / ${formatBytes(info.memory.total)} used</div>
        <div class="muted">Free ${formatBytes(info.memory.free)} • Swap ${formatBytes(info.memory.swap_used)} / ${formatBytes(info.memory.swap_total)}</div>
      </div>
    </div>
    ${info.battery ? `
    <div class="card">
      <div class="card-title">Battery</div>
      <div class="card-body">
        <div>${info.battery.percentage.toFixed(0)}%</div>
        <div class="muted">${escapeHtml(info.battery.state)}${info.battery.cycle_count != null ? ` • ${info.battery.cycle_count} cycles` : ''}</div>
      </div>
    </div>` : ''}
  `;

  // Storage list
  const disks = document.createElement('div');
  disks.className = 'card';
  disks.innerHTML = `
    <div class="card-title">Storage</div>
    <div class="list">
      ${info.disks.map(d => `
        <div class="row">
          <div class="main">
            <div class="name">${escapeHtml(d.name || d.mount_point)}</div>
            <div class="muted">${escapeHtml(d.file_system)} • ${escapeHtml(d.mount_point)}</div>
          </div>
          <div class="meta">
            <div>${formatBytes(d.total_space - d.available_space)} / ${formatBytes(d.total_space)}</div>
            <div class="muted">${formatPct(d.total_space - d.available_space, d.total_space)}</div>
          </div>
        </div>
      `).join('')}
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
          </div>
          <div class="meta">
            <div>RX ${formatBytes(n.received)}</div>
            <div class="muted">TX ${formatBytes(n.transmitted)}</div>
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
    <div class="list">
      ${info.sensors.length ? info.sensors.map(s => `
        <div class="row">
          <div class="main"><div class="name">${escapeHtml(s.label)}</div></div>
          <div class="meta">${s.temperature_c.toFixed(1)} °C</div>
        </div>
      `).join('') : '<div class="muted">No sensor data</div>'}
    </div>
  `;

  // Clear and append
  const section = document.querySelector('section.page[data-page="system-info"]');
  section.innerHTML = `
      <h1>System Info</h1>
      <p class="muted">Hardware, software, drivers, and temperatures at a glance.</p>
  `;
  section.appendChild(summary);
  section.appendChild(disks);
  section.appendChild(nets);
  section.appendChild(gpus);
  section.appendChild(sensors);
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
