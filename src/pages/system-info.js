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

  // Clear and scaffold
  const section = document.querySelector('section.page[data-page="system-info"]');
  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; justify-content: space-between; flex-wrap: wrap;">
      <div>
        <h1 style="margin-bottom:4px;">System Info</h1>
  <p class="muted" style="margin:0;">Hardware, software, and drivers at a glance.</p>
      </div>
      <div>
        <button id=\"sysinfo-refresh-btn\" class=\"ghost\">Refresh</button>
      </div>
    </div>
  `;

  // OS Info
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">OS Info</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table kv-table">
        <tbody>
          <tr><th>Operating System</th><td>${escapeHtml(info.os || 'Unknown')}</td></tr>
          <tr><th>Kernel</th><td>${escapeHtml(info.kernel_version || '-')}</td></tr>
          <tr><th>Build</th><td>${escapeHtml(info.os_version || '-')}</td></tr>
          <tr><th>Hostname</th><td>${escapeHtml(info.hostname || '-')}</td></tr>
          <tr><th>Uptime</th><td>${formatDuration(info.uptime_seconds)}</td></tr>
          <tr><th>Load (1/5/15)</th><td>${load1.toFixed(2)} / ${load5.toFixed(2)} / ${load15.toFixed(2)}</td></tr>
          <tr><th>Users</th><td>${(info.users || []).length}</td></tr>
        </tbody>
      </table>
    </div></div>
  `);

  // Motherboard (if available)
  if (info.motherboard) {
    section.insertAdjacentHTML('beforeend', `
      <div class="section-title">Motherboard</div>
      <div class="table-block"><div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Vendor</th><td>${escapeHtml(info.motherboard.vendor || '-')}</td></tr>
            ${info.motherboard.name?`<tr><th>Model</th><td>${escapeHtml(info.motherboard.name)}</td></tr>`:''}
            ${info.motherboard.version?`<tr><th>Version</th><td>${escapeHtml(info.motherboard.version)}</td></tr>`:''}
            ${info.motherboard.serial_number?`<tr><th>Serial</th><td>${escapeHtml(info.motherboard.serial_number)}</td></tr>`:''}
            ${info.motherboard.asset_tag?`<tr><th>Asset Tag</th><td>${escapeHtml(info.motherboard.asset_tag)}</td></tr>`:''}
          </tbody>
        </table>
      </div></div>
    `);
  }

  // CPU
  const cores = info.cpu.cores || [];
  const avgCpu = cores.length ? Math.max(0, Math.min(100, Math.round(cores.reduce((s,c)=> s + (c.usage_percent||0), 0) / cores.length))) : null;
  const perCoreGrid = cores.length ? `
    <div class="per-core-grid">
      ${cores.map(c => {
        const pct = Math.max(0, Math.min(100, Math.round(c.usage_percent||0)));
        const name = escapeHtml(c.name);
        return `<div class="per-core-item">
          <div class="per-core-name"><span>${name}</span><span class="badge">${pct}%</span></div>
          <div class="progress" aria-label="${name} usage"><div class="bar" style="width:${pct}%;"></div></div>
        </div>`;
      }).join('')}
    </div>
  ` : '';
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">CPU</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table kv-table">
        <tbody>
          <tr><th>Model</th><td>${escapeHtml(info.cpu.brand)}</td></tr>
          <tr><th>Vendor</th><td>${escapeHtml(info.cpu.vendor_id || '-')}</td></tr>
          <tr><th>Cores/Threads</th><td>${info.cpu.num_physical_cores ?? '-'}C / ${info.cpu.num_logical_cpus}T</td></tr>
          <tr><th>Frequency</th><td>${info.cpu.frequency_mhz} MHz</td></tr>
          ${avgCpu!=null?`<tr><th>CPU Usage</th><td>${avgCpu}%<div class="progress" aria-label="cpu usage"><div class="bar" style="width:${avgCpu}%;"></div></div></td></tr>`:''}
          ${perCoreGrid?`<tr><th>Per-core usage</th><td>${perCoreGrid}</td></tr>`:''}
        </tbody>
      </table>
    </div></div>
  `);

  // RAM
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">RAM</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table kv-table">
        <tbody>
          <tr><th>Usage</th><td>${formatBytes(usedMem)} / ${formatBytes(totalMem)} <span class="badge">${memPct}%</span><div class="progress" aria-label="memory usage"><div class="bar" style="width:${memPct}%;"></div></div></td></tr>
          <tr><th>Free</th><td>${formatBytes(info.memory.free)}</td></tr>
          <tr><th>Swap</th><td>${formatBytes(info.memory.swap_used)} / ${formatBytes(info.memory.swap_total)}</td></tr>
        </tbody>
      </table>
    </div></div>
  `);

  // GPU
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">GPU</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table data-table">
        <thead><tr><th>Name</th><th>Vendor</th><th>Device</th><th>Type</th><th>Driver</th><th>Backend</th></tr></thead>
        <tbody>
          ${info.gpus.length ? info.gpus.map(g => {
            const vendor = (g.vendor ?? null) !== null ? String(g.vendor) : '';
            const device = (g.device ?? null) !== null ? String(g.device) : '';
            const dtype = g.device_type || '';
            const driver = [g.driver, g.driver_info].filter(Boolean).join(' ');
            const backend = g.backend || '';
            return `<tr>
              <td>${escapeHtml(g.name)}</td>
              <td>${escapeHtml(vendor || '-')}</td>
              <td>${escapeHtml(device || '-')}</td>
              <td>${escapeHtml(dtype || '-')}</td>
              <td>${escapeHtml(driver || '-')}</td>
              <td>${escapeHtml(backend || '-')}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="6" class="muted">No GPU info available</td></tr>'}
        </tbody>
      </table>
    </div></div>
  `);

  // Storage
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">Storage</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table data-table">
        <thead>
          <tr>
            <th>Name</th><th>Mount</th><th>FS</th><th>Flags</th><th>Usage</th><th>IO</th>
          </tr>
        </thead>
        <tbody>
          ${info.disks.map(d => {
            const used = Math.max(0, (d.total_space - d.available_space));
            const pct = d.total_space ? Math.min(100, Math.round((used / d.total_space) * 100)) : 0;
            const flags = [`${d.is_removable? 'Removable' : ''}`, `${d.is_read_only? 'Read-only' : ''}`, `${d.kind? escapeHtml(d.kind):''}`].filter(Boolean).join(', ');
            return `
              <tr>
                <td>${escapeHtml(d.name || d.mount_point)}</td>
                <td>${escapeHtml(d.mount_point)}</td>
                <td>${escapeHtml(d.file_system)}</td>
                <td>${flags || '-'}</td>
                <td>
                  ${formatBytes(used)} / ${formatBytes(d.total_space)} <span class="badge">${pct}%</span>
                  <div class="progress" aria-label="disk usage"><div class="bar" style="width:${pct}%;"></div></div>
                </td>
                <td>R:${formatBytes(d.read_bytes)} • W:${formatBytes(d.written_bytes)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div></div>
  `);

  // Network
  section.insertAdjacentHTML('beforeend', `
    <div class="section-title">Network</div>
    <div class="table-block"><div class="table-wrap">
      <table class="table data-table">
        <thead>
          <tr>
            <th>Interface</th><th>MAC</th><th>MTU</th><th>IPs</th><th>Totals</th><th>Δ</th><th>Errors</th>
          </tr>
        </thead>
        <tbody>
          ${info.networks.map(n => `
            <tr>
              <td>${escapeHtml(n.interface)}</td>
              <td>${n.mac?escapeHtml(n.mac):'-'}</td>
              <td>${n.mtu}</td>
              <td>${n.ips.map(escapeHtml).join('<br>')}</td>
              <td>Rx ${formatBytes(n.total_received)}<br>Tx ${formatBytes(n.total_transmitted)}</td>
              <td>Rx ${formatBytes(n.received)} • Tx ${formatBytes(n.transmitted)}</td>
              <td>${(n.errors_rx||n.errors_tx)?`${n.errors_rx}/${n.errors_tx}`:'-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div></div>
  `);

  // Battery (if available)
  if (info.battery) {
    const pct = info.battery.percentage;
    const stateBadgeClass = pct >= 50 ? 'ok' : pct >= 20 ? '' : 'warn';
    const statusBits = [
      info.battery.cycle_count != null ? `${info.battery.cycle_count} cycles` : null,
      info.battery.state_of_health_pct != null ? `${info.battery.state_of_health_pct.toFixed(0)}% health` : null,
      info.battery.voltage_v != null ? `${info.battery.voltage_v.toFixed(2)} V` : null,
      info.battery.energy_full_wh != null ? `Full ${info.battery.energy_full_wh.toFixed(1)} Wh` : null,
      info.battery.energy_full_design_wh != null ? `Design ${info.battery.energy_full_design_wh.toFixed(1)} Wh` : null,
    ].filter(Boolean).join(' • ');

    section.insertAdjacentHTML('beforeend', `
      <div class="section-title">Battery</div>
      <div class="table-block"><div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Charge</th><td><span class="badge ${stateBadgeClass}">${pct.toFixed(0)}%</span> <span class="muted" style="margin-left:8px;">${escapeHtml(info.battery.state)}</span></td></tr>
            ${statusBits?`<tr><th>Details</th><td class="muted">${statusBits}</td></tr>`:''}
            ${info.battery.time_to_full_sec!=null?`<tr><th>To full</th><td>${formatDuration(info.battery.time_to_full_sec)}</td></tr>`:''}
            ${info.battery.time_to_empty_sec!=null?`<tr><th>To empty</th><td>${formatDuration(info.battery.time_to_empty_sec)}</td></tr>`:''}
          </tbody>
        </table>
      </div></div>
    `);
  }

  // Sensors section intentionally removed per request

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
