// System Info page controller
const { invoke } = window.__TAURI__.core;
// Shell plugin is globally exposed via withGlobalTauri
const { Command } = window.__TAURI__?.shell || {};

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
        </tbody>
      </table>
    </div></div>
  `);

  // System / Product info (if available)
  if (info.product) {
    section.insertAdjacentHTML('beforeend', `
      <div class="section-title">System</div>
      <div class="table-block"><div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            ${info.product.vendor?`<tr><th>Vendor</th><td>${escapeHtml(info.product.vendor)}</td></tr>`:''}
            ${info.product.name?`<tr><th>Model</th><td>${escapeHtml(info.product.name)}</td></tr>`:''}
            ${info.product.family?`<tr><th>Family</th><td>${escapeHtml(info.product.family)}</td></tr>`:''}
            ${info.product.version?`<tr><th>Version</th><td>${escapeHtml(info.product.version)}</td></tr>`:''}
            ${info.product.serial_number?`<tr><th>Serial</th><td>${escapeHtml(info.product.serial_number)}</td></tr>`:''}
            ${info.product.sku?`<tr><th>SKU</th><td>${escapeHtml(info.product.sku)}</td></tr>`:''}
            ${info.product.uuid?`<tr><th>UUID</th><td><code>${escapeHtml(info.product.uuid)}</code></td></tr>`:''}
          </tbody>
        </table>
      </div></div>
    `);
  }

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
          <tr><th>Cores / Threads</th><td>
            <span class="badge">Physical: ${info.cpu.num_physical_cores ?? '-' }C</span>
            <span class="badge" style="margin-left:6px;">Logical: ${info.cpu.num_logical_cpus}T</span>
          </td></tr>
          <tr><th>Frequency</th><td>${info.cpu.frequency_mhz ? (info.cpu.frequency_mhz/1000).toFixed(2) + ' GHz' : '-'}</td></tr>
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

  // Advanced moved to bottom — rendered after Battery

  // Battery (always render; supports multiple)
  {
    const batteries = Array.isArray(info.batteries)
      ? info.batteries
      : (info.battery ? [info.battery] : []); // backward compatibility

    section.insertAdjacentHTML('beforeend', `<div class="section-title">Battery</div>`);
    if (!batteries.length) {
      section.insertAdjacentHTML('beforeend', `
        <div class="table-block"><div class="table-wrap">
          <div class="empty-state">No batteries detected</div>
        </div></div>
      `);
    } else {
      batteries.forEach((batt, idx) => {
        const pct = batt.percentage ?? 0;
        const stateBadgeClass = pct >= 50 ? 'ok' : pct >= 20 ? '' : 'warn';
        const idBits = [batt.vendor, batt.model].filter(Boolean).join(' ');
        const details = [
          batt.cycle_count != null ? `${batt.cycle_count} cycles` : null,
          batt.voltage_v != null ? `${batt.voltage_v.toFixed(2)} V` : null,
          batt.energy_full_wh != null ? `Full ${batt.energy_full_wh.toFixed(1)} Wh` : null,
          batt.energy_full_design_wh != null ? `Design ${batt.energy_full_design_wh.toFixed(1)} Wh` : null,
        ].filter(Boolean).join(' • ');

  // Health as its own row with a color badge
  const healthPct = batt.state_of_health_pct;
  const healthClass = healthPct == null ? '' : (healthPct >= 80 ? 'ok' : (healthPct >= 60 ? '' : 'warn'));
  const healthLabel = healthPct == null ? '' : (healthPct >= 80 ? 'Good' : (healthPct >= 60 ? 'Fair' : 'Poor'));

        section.insertAdjacentHTML('beforeend', `
          <div class="table-block"><div class="table-wrap">
            <table class="table kv-table">
              <tbody>
                <tr><th>Charge ${batteries.length>1?`(Battery ${idx+1})`:''}</th><td><span class="badge ${stateBadgeClass}">${pct.toFixed(0)}%</span> <span class="muted" style="margin-left:8px;">${escapeHtml(batt.state || '-')}</span></td></tr>
                ${idBits?`<tr><th>Identity</th><td>${escapeHtml(idBits)}</td></tr>`:''}
                ${batt.serial?`<tr><th>Serial</th><td>${escapeHtml(batt.serial)}</td></tr>`:''}
                ${batt.technology?`<tr><th>Technology</th><td>${escapeHtml(batt.technology)}</td></tr>`:''}
                ${healthPct!=null?`<tr><th>Health</th><td><span class="badge ${healthClass}">${Number(healthPct).toFixed(0)}%</span>${healthLabel?` <span class="muted" style="margin-left:8px;">${healthLabel}</span>`:''}</td></tr>`:''}
                ${details?`<tr><th>Details</th><td class="muted">${details}</td></tr>`:''}
                ${batt.time_to_full_sec!=null?`<tr><th>To full</th><td>${formatDuration(batt.time_to_full_sec)}</td></tr>`:''}
                ${batt.time_to_empty_sec!=null?`<tr><th>To empty</th><td>${formatDuration(batt.time_to_empty_sec)}</td></tr>`:''}
              </tbody>
            </table>
          </div></div>
        `);
      });
    }
  }

  // Sensors section intentionally removed per request

  // Advanced (Windows extras) — last
  if (info.extra) {
    const ex = info.extra;
    const section = document.querySelector('section.page[data-page="system-info"]');

    const hotfixes = Array.isArray(ex.hotfixes) && ex.hotfixes.length
      ? `<ul>${ex.hotfixes.slice(0, 20).map(h => `<li><code>${escapeHtml(h)}</code></li>`).join('')}${ex.hotfixes.length>20?`<li class="muted">…and ${ex.hotfixes.length-20} more</li>`:''}</ul>`
      : '-';
    const gpus2 = Array.isArray(ex.video_controllers) && ex.video_controllers.length
      ? ex.video_controllers.map(escapeHtml).join('<br>')
      : '-';
    const pdisks = Array.isArray(ex.physical_disks) && ex.physical_disks.length
      ? ex.physical_disks.map(escapeHtml).join('<br>')
      : '-';

    const mkKV = (rows) => `
      <div class="table-block"><div class="table-wrap">
        <table class="table kv-table"><tbody>
          ${rows.join('')}
        </tbody></table>
      </div></div>`;
    const mkDataTable = (headers, rows) => `
      <div class="table-block"><div class="table-wrap">
        <table class="table data-table">
          <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div></div>`;

    // RAM modules
    const ramRows = (ex.ram_modules||[]).map(m => {
      const cap = Number(m?.Capacity||0);
      const speed = m?.Speed!=null ? `${m.Speed} MHz` : '-';
      return `<tr>
        <td>${escapeHtml(m?.BankLabel||'-')}</td>
        <td>${escapeHtml(m?.DeviceLocator||'-')}</td>
        <td>${escapeHtml(m?.Manufacturer||'-')}</td>
        <td>${formatBytes(cap)}</td>
        <td>${speed}</td>
        <td>${escapeHtml(m?.SerialNumber||'-')}</td>
        <td>${escapeHtml(m?.PartNumber||'-')}</td>
      </tr>`;
    });
    // CPU WMI
    const cpuRows = (ex.cpu_wmi||[]).map(c => `<tr>
      <td>${escapeHtml(c?.Name||'-')}</td>
      <td>${escapeHtml(c?.Manufacturer||'-')}</td>
      <td>${c?.NumberOfCores??'-'}</td>
      <td>${c?.NumberOfLogicalProcessors??'-'}</td>
      <td>${c?.MaxClockSpeed?`${(Number(c.MaxClockSpeed)/1000).toFixed(2)} GHz`:'-'}</td>
      <td>${c?.LoadPercentage??'-'}%</td>
    </tr>`);
    // Video controller extended
    const vRows = (ex.video_ctrl_ex||[]).map(v => `<tr>
      <td>${escapeHtml(v?.Name||'-')}</td>
      <td>${v?.AdapterRAM?formatBytes(Number(v.AdapterRAM)):'-'}</td>
      <td>${escapeHtml(v?.DriverVersion||'-')}</td>
      <td>${escapeHtml(v?.VideoModeDescription||'-')}</td>
    </tr>`);
    // Baseboard
    const bbRows = (ex.baseboard||[]).map(b => `<tr>
      <td>${escapeHtml(b?.Manufacturer||'-')}</td>
      <td>${escapeHtml(b?.Product||'-')}</td>
      <td>${escapeHtml(b?.SerialNumber||'-')}</td>
    </tr>`);
    // Disk drives
    const ddRows = (ex.disk_drives||[]).map(d => `<tr>
      <td>${escapeHtml(d?.Model||'-')}</td>
      <td>${escapeHtml(d?.InterfaceType||'-')}</td>
      <td>${escapeHtml(d?.MediaType||'-')}</td>
      <td>${d?.Size?formatBytes(Number(d.Size)):'-'}</td>
    </tr>`);
    // NIC enabled
    const nicRows = (ex.nic_enabled||[]).map(n => `<tr>
      <td>${escapeHtml(n?.Name||'-')}</td>
      <td>${escapeHtml(n?.MACAddress||'-')}</td>
      <td>${n?.Speed!=null?`${(Number(n.Speed)/1e9).toFixed(2)} Gbps`:'-'}</td>
    </tr>`);

    // Computer System (first entry summary)
    let compKV = '';
    if (Array.isArray(ex.computer_system) && ex.computer_system.length) {
      const c = ex.computer_system[0] || {};
      compKV = mkKV([
        `<tr><th>Computer</th><td>${escapeHtml(c?.Name||'-')}</td></tr>`,
        `<tr><th>Domain</th><td>${escapeHtml(c?.Domain||'-')}</td></tr>`,
        `<tr><th>Model</th><td>${escapeHtml(c?.Model||'-')}</td></tr>`,
        `<tr><th>Manufacturer</th><td>${escapeHtml(c?.Manufacturer||'-')}</td></tr>`,
        `<tr><th>Total RAM</th><td>${c?.TotalPhysicalMemory?formatBytes(Number(c.TotalPhysicalMemory)):'-'}</td></tr>`,
      ]);
    }

    const adv = `
      <div class="section-title">Advanced</div>
      ${mkKV([
        ex.secure_boot?`<tr><th>Secure Boot</th><td>${escapeHtml(ex.secure_boot)}</td></tr>`:'',
        ex.tpm_summary?`<tr><th>TPM</th><td><pre style="white-space:pre-wrap;">${escapeHtml(ex.tpm_summary)}</pre></td></tr>`:'',
        (ex.bios_vendor||ex.bios_version||ex.bios_release_date)?`<tr><th>BIOS</th><td>${escapeHtml([ex.bios_vendor, ex.bios_version, ex.bios_release_date].filter(Boolean).join(' • '))}</td></tr>`:'',
        ex.dotnet_version?`<tr><th>.NET</th><td>${escapeHtml(ex.dotnet_version)}</td></tr>`:'',
        `<tr><th>Video Controllers</th><td>${gpus2}</td></tr>`,
        `<tr><th>Physical Disks</th><td>${pdisks}</td></tr>`,
        `<tr><th>Hotfixes</th><td>${hotfixes}</td></tr>`,
      ].filter(Boolean))}
      ${compKV}
      ${ramRows.length?mkDataTable(['Bank','Locator','Manufacturer','Capacity','Speed','Serial','Part #'], ramRows):''}
      ${cpuRows.length?mkDataTable(['Name','Vendor','#Cores','#Threads','Max Clock','Load'], cpuRows):''}
      ${vRows.length?mkDataTable(['Name','VRAM','Driver','Mode'], vRows):''}
      ${bbRows.length?mkDataTable(['Manufacturer','Product','Serial'], bbRows):''}
      ${ddRows.length?mkDataTable(['Model','Interface','Media Type','Size'], ddRows):''}
      ${nicRows.length?mkDataTable(['Name','MAC','Speed'], nicRows):''}
    `;
    section.insertAdjacentHTML('beforeend', adv);
  }

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
    // Optional client-side augmentation via shell (non-blocking)
    if (Command && navigator.userAgent.includes('Windows')) {
      try {
        // Example: get Windows edition via shell as a nicety
        const cmd = await Command.create('exec-sh', ['-c', 'wmic os get Caption | more +1']).execute();
        const osCaption = (cmd?.stdout || '').trim();
        if (osCaption) info.os = osCaption;
      } catch {}
    }
    render(info);
  } catch (e) {
    container.innerHTML = '<section class="page"><h1>System Info</h1><p class="muted">Failed to read system information.</p></section>';
    console.error(e);
  }
}
