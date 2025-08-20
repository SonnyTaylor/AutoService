// System Info page controller
const { invoke } = window.__TAURI__.core;
// Shell plugin is globally exposed via withGlobalTauri
const { Command } = window.__TAURI__?.shell || {};

function $(sel, root = document) { return root.querySelector(sel); }

// Simple in-session cache (also persisted in sessionStorage across tab switches)
const SYSINFO_CACHE_KEY = 'sysinfo.cache.v1';
const SYSINFO_CACHE_TS_KEY = 'sysinfo.cache.ts.v1';
let sysinfoCache = null; // object
let sysinfoCacheTs = null; // number (ms)

function loadCache() {
  try {
    const raw = sessionStorage.getItem(SYSINFO_CACHE_KEY);
    const ts = Number(sessionStorage.getItem(SYSINFO_CACHE_TS_KEY) || '');
    if (raw) {
      sysinfoCache = JSON.parse(raw);
      sysinfoCacheTs = Number.isFinite(ts) ? ts : null;
    }
  } catch {}
}

function saveCache(info, ts) {
  sysinfoCache = info;
  sysinfoCacheTs = ts;
  try {
    sessionStorage.setItem(SYSINFO_CACHE_KEY, JSON.stringify(info));
    sessionStorage.setItem(SYSINFO_CACHE_TS_KEY, String(ts));
  } catch {}
}

function formatTimeShort(ms) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function setLastRefreshedLabel(container, ms) {
  const el = container.querySelector('#sysinfo-last-refreshed');
  if (!el) return;
  if (!ms) { el.textContent = ''; return; }
  el.textContent = `Updated ${formatTimeShort(ms)}`;
}

// Build a collapsible section HTML string
function makeCollapsible(title, contentHtml) {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="collapsible" data-id="${id}">
      <div class="collapsible-header" role="button" tabindex="0" aria-expanded="true">
        <span class="chevron" aria-hidden="true" style="display:inline-block; width:1.2em;">▾</span>
        <span class="title">${escapeHtml(title)}</span>
      </div>
      <div class="collapsible-body">
        ${contentHtml}
      </div>
    </div>
  `;
}

// Activate collapsible toggle interactions inside a container
function initCollapsibles(container) {
  const headers = container.querySelectorAll('.collapsible-header');
  headers.forEach((header) => {
    const onToggle = () => {
      const body = header.nextElementSibling;
      const chev = header.querySelector('.chevron');
      const expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (body) body.style.display = expanded ? 'none' : '';
      if (chev) chev.textContent = expanded ? '▸' : '▾';
    };
    header.addEventListener('click', onToggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
    });
  });
}

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
  const ex = info.extra || null;

  // Clear and scaffold
  const section = document.querySelector('section.page[data-page="system-info"]');
  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; justify-content: space-between; flex-wrap: wrap;">
      <div>
        <h1 style="margin-bottom:4px;">System Info</h1>
  <p class="muted" style="margin:0;">Hardware, software, and drivers at a glance.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap: wrap;">
        <button id=\"sysinfo-toggle-all-btn\" class=\"ghost\">Collapse all</button>
  <button id=\"sysinfo-refresh-btn\" class=\"ghost\">Refresh</button>
  <span id=\"sysinfo-last-refreshed\" class=\"muted\" style=\"font-size:.85rem; align-self:center;\"></span>
      </div>
    </div>
  `;

  // OS Info
  const osExtraRows = [];
  // Domain (Windows)
  if (ex && Array.isArray(ex.computer_system) && ex.computer_system.length) {
    const cs = ex.computer_system[0] || {};
    if (cs?.Domain) osExtraRows.push(`<tr><th>Domain</th><td>${escapeHtml(cs.Domain)}</td></tr>`);
  }
  // Secure Boot / TPM / .NET
  if (ex?.secure_boot) osExtraRows.push(`<tr><th>Secure Boot</th><td>${escapeHtml(ex.secure_boot)}</td></tr>`);
  // TPM: parse JSON and avoid printing meaningless nulls
  if (ex?.tpm_summary) {
    let added = false;
    const raw = String(ex.tpm_summary || '').trim();
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') {
        const parts = [];
        if (v.TpmPresent === true) parts.push('Present');
        else if (v.TpmPresent === false) parts.push('Not Present');
        if (v.TpmReady === true) parts.push('Ready');
        else if (v.TpmReady === false) parts.push('Not Ready');
        if (typeof v.SpecVersion === 'string' && v.SpecVersion.trim()) parts.push(`Spec ${v.SpecVersion}`);
        if (typeof v.ManagedAuthLevel === 'string' && v.ManagedAuthLevel.trim()) parts.push(v.ManagedAuthLevel);
        if (parts.length) {
          osExtraRows.push(`<tr><th>TPM</th><td>${escapeHtml(parts.join(' • '))}</td></tr>`);
          added = true;
        }
      }
    } catch {}
    if (!added) {
      // Hide the known useless all-null object; otherwise show trimmed text
      const compact = raw.replace(/\s+/g, '');
      const allNull = compact === '{"TpmPresent":null,"TpmReady":null,"ManagedAuthLevel":null,"OwnerAuth":null,"SpecVersion":null}';
      if (raw && !allNull) {
        osExtraRows.push(`<tr><th>TPM</th><td>${escapeHtml(raw)}</td></tr>`);
      }
    }
  }
  if (ex?.dotnet_version) osExtraRows.push(`<tr><th>.NET</th><td>${escapeHtml(ex.dotnet_version)}</td></tr>`);

  const osHtml = `
    <div class="table-block"><div class="table-wrap">
      <table class="table kv-table">
        <tbody>
          <tr><th>Operating System</th><td>${escapeHtml(info.os || 'Unknown')}</td></tr>
          <tr><th>Kernel</th><td>${escapeHtml(info.kernel_version || '-')}</td></tr>
          <tr><th>Build</th><td>${escapeHtml(info.os_version || '-')}</td></tr>
          <tr><th>Hostname</th><td>${escapeHtml(info.hostname || '-')}</td></tr>
          <tr><th>Uptime</th><td>${formatDuration(info.uptime_seconds)}</td></tr>
          ${osExtraRows.join('')}
        </tbody>
      </table>
    </div></div>
  `;
  section.insertAdjacentHTML('beforeend', makeCollapsible('OS Info', osHtml));

  // Windows Updates table removed per request

  // System / Product info (if available)
  if (info.product) {
    const sysHtml = `
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
    `;
    section.insertAdjacentHTML('beforeend', makeCollapsible('System', sysHtml));
  }

  // Motherboard (if available)
  if (info.motherboard) {
    // BIOS details (Windows) belong with motherboard
    const biosRows = [];
    if (ex?.bios_vendor) biosRows.push(`<tr><th>BIOS Vendor</th><td>${escapeHtml(ex.bios_vendor)}</td></tr>`);
    if (ex?.bios_version) biosRows.push(`<tr><th>BIOS Version</th><td>${escapeHtml(ex.bios_version)}</td></tr>`);
    if (ex?.bios_release_date) biosRows.push(`<tr><th>BIOS Release</th><td>${escapeHtml(ex.bios_release_date)}</td></tr>`);

    const mbHtml = `
      <div class="table-block"><div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Vendor</th><td>${escapeHtml(info.motherboard.vendor || '-')}</td></tr>
            ${info.motherboard.name?`<tr><th>Model</th><td>${escapeHtml(info.motherboard.name)}</td></tr>`:''}
            ${info.motherboard.version?`<tr><th>Version</th><td>${escapeHtml(info.motherboard.version)}</td></tr>`:''}
            ${info.motherboard.serial_number?`<tr><th>Serial</th><td>${escapeHtml(info.motherboard.serial_number)}</td></tr>`:''}
            ${info.motherboard.asset_tag?`<tr><th>Asset Tag</th><td>${escapeHtml(info.motherboard.asset_tag)}</td></tr>`:''}
            ${biosRows.join('')}
          </tbody>
        </table>
      </div></div>
    `;
    section.insertAdjacentHTML('beforeend', makeCollapsible('Motherboard', mbHtml));
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
  const cpuHtml = `
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
  `;
  section.insertAdjacentHTML('beforeend', makeCollapsible('CPU', cpuHtml));

  // RAM
  // DIMM details table (Windows extras)
  let dimmHtml = '';
  if (ex && Array.isArray(ex.ram_modules) && ex.ram_modules.length) {
    const mapFF = (n) => {
      // Common Win32 FormFactor codes
      const m = { 8: 'DIMM', 12: 'SODIMM' };
      return n in m ? m[n] : (n!=null?String(n):'-');
    };
    const dimmRows = ex.ram_modules.map(m => {
      const cap = Number(m?.Capacity||0);
      const speed = m?.Speed!=null ? `${m.Speed} MHz` : '-';
      const volt = m?.ConfiguredVoltage!=null ? `${Number(m.ConfiguredVoltage)/1000} V` : '-';
      const dtype = m?.MemoryType!=null ? String(m.MemoryType) : '-';
      const ff = mapFF(Number(m?.FormFactor));
      const width = (m?.DataWidth!=null||m?.TotalWidth!=null) ? `${m?.DataWidth??'-'}/${m?.TotalWidth??'-'}` : '-';
      return `<tr>
        <td>${escapeHtml(m?.BankLabel||'-')}</td>
        <td>${escapeHtml(m?.DeviceLocator||'-')}</td>
        <td>${formatBytes(cap)}</td>
        <td>${speed}</td>
        <td>${escapeHtml(m?.Manufacturer||'-')}</td>
        <td>${escapeHtml(m?.PartNumber||'-')}</td>
        <td>${escapeHtml(m?.SerialNumber||'-')}</td>
        <td>${dtype}</td>
        <td>${ff}</td>
        <td>${volt}</td>
        <td>${width}</td>
      </tr>`;
    }).join('');
    dimmHtml = `
      <div class="table-block"><div class="table-wrap">
        <table class="table data-table">
          <thead><tr>
            <th>Bank</th><th>Locator</th><th>Capacity</th><th>Speed</th><th>Manufacturer</th><th>Part #</th><th>Serial</th><th>Type</th><th>Form</th><th>Voltage</th><th>Width D/T</th>
          </tr></thead>
          <tbody>${dimmRows}</tbody>
        </table>
      </div></div>
    `;
  }

  const ramHtml = `
    <div class="table-block"><div class="table-wrap">
      <table class="table kv-table">
        <tbody>
          <tr><th>Usage</th><td>${formatBytes(usedMem)} / ${formatBytes(totalMem)} <span class="badge">${memPct}%</span><div class="progress" aria-label="memory usage"><div class="bar" style="width:${memPct}%;"></div></div></td></tr>
          <tr><th>Free</th><td>${formatBytes(info.memory.free)}</td></tr>
          <tr><th>Swap</th><td>${formatBytes(info.memory.swap_used)} / ${formatBytes(info.memory.swap_total)}</td></tr>
        </tbody>
      </table>
    </div></div>
    ${dimmHtml}
  `;
  section.insertAdjacentHTML('beforeend', makeCollapsible('RAM', ramHtml));

  // GPU — prefer Rust info; fall back to Windows video controller details
  let gpuHtml = '';
  if (info.gpus && info.gpus.length) {
    const rows = info.gpus.map(g => {
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
    }).join('');
    gpuHtml = `
      <div class="table-block"><div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Name</th><th>Vendor</th><th>Device</th><th>Type</th><th>Driver</th><th>Backend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div></div>
    `;
  } else if (ex && Array.isArray(ex.video_ctrl_ex) && ex.video_ctrl_ex.length) {
    const vRows = ex.video_ctrl_ex.map(v => `<tr>
      <td>${escapeHtml(v?.Name||'-')}</td>
      <td>${v?.AdapterRAM?formatBytes(Number(v.AdapterRAM)):'-'}</td>
      <td>${escapeHtml(v?.DriverVersion||'-')}</td>
      <td>${escapeHtml(v?.VideoModeDescription||'-')}</td>
    </tr>`).join('');
    gpuHtml = `
      <div class="table-block"><div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Name</th><th>VRAM</th><th>Driver</th><th>Mode</th></tr></thead>
          <tbody>${vRows}</tbody>
        </table>
      </div></div>
    `;
  } else {
    gpuHtml = `
      <div class="table-block"><div class="table-wrap">
        <div class="empty-state">No GPU info available</div>
      </div></div>
    `;
  }
  section.insertAdjacentHTML('beforeend', makeCollapsible('GPU', gpuHtml));

  // Storage (volumes + physical drives)
  let storageHtml = `
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
  `;
  if (ex && Array.isArray(ex.disk_drives) && ex.disk_drives.length) {
    const ddRows = ex.disk_drives.map(d => `<tr>
      <td>${escapeHtml(d?.Model||'-')}</td>
      <td>${escapeHtml(d?.InterfaceType||'-')}</td>
      <td>${escapeHtml(d?.MediaType||'-')}</td>
      <td>${d?.Size?formatBytes(Number(d.Size)):'-'}</td>
    </tr>`).join('');
    storageHtml += `
      <div class="table-block"><div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr><th>Model</th><th>Interface</th><th>Media Type</th><th>Size</th></tr>
          </thead>
          <tbody>${ddRows}</tbody>
        </table>
      </div></div>
    `;
  }
  section.insertAdjacentHTML('beforeend', makeCollapsible('Storage', storageHtml));

  // Network
  const netHtml = `
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
  `;
  section.insertAdjacentHTML('beforeend', makeCollapsible('Network', netHtml));

  // Advanced moved to bottom — rendered after Battery

  // Battery (always render; supports multiple)
  {
    const batteries = Array.isArray(info.batteries)
      ? info.batteries
      : (info.battery ? [info.battery] : []); // backward compatibility

    let battHtml = '';
    if (!batteries.length) {
      battHtml = `
        <div class="table-block"><div class="table-wrap">
          <div class="empty-state">No batteries detected</div>
        </div></div>
      `;
    } else {
      battHtml = batteries.map((batt, idx) => {
        const pct = batt.percentage ?? 0;
        const stateBadgeClass = pct >= 50 ? 'ok' : pct >= 20 ? '' : 'warn';
        const idBits = [batt.vendor, batt.model].filter(Boolean).join(' ');
        const details = [
          batt.cycle_count != null ? `${batt.cycle_count} cycles` : null,
          batt.voltage_v != null ? `${batt.voltage_v.toFixed(2)} V` : null,
          batt.energy_full_wh != null ? `Full ${batt.energy_full_wh.toFixed(1)} Wh` : null,
          batt.energy_full_design_wh != null ? `Design ${batt.energy_full_design_wh.toFixed(1)} Wh` : null,
        ].filter(Boolean).join(' • ');

        const healthPct = batt.state_of_health_pct;
        const healthClass = healthPct == null ? '' : (healthPct >= 80 ? 'ok' : (healthPct >= 60 ? '' : 'warn'));
        const healthLabel = healthPct == null ? '' : (healthPct >= 80 ? 'Good' : (healthPct >= 60 ? 'Fair' : 'Poor'));

        return `
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
        `;
      }).join('');
    }
    section.insertAdjacentHTML('beforeend', makeCollapsible('Battery', battHtml));
  }

  // Sensors section intentionally removed per request

  // Bind refresh
  const btn = document.getElementById('sysinfo-refresh-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
  btn.innerHTML = '<span class="spinner sm" aria-hidden="true"></span><span style="margin-left:8px;">Refreshing…</span>';
      try {
        const data = await invoke('get_system_info');
        // Optional: keep the Windows caption nicety on refresh too
        if (Command && navigator.userAgent.includes('Windows')) {
          try {
            const cmd = await Command.create('exec-sh', ['-c', 'wmic os get Caption | more +1']).execute();
            const osCaption = (cmd?.stdout || '').trim();
            if (osCaption) data.os = osCaption;
          } catch {}
        }
        const now = Date.now();
        saveCache(data, now);
        render(data);
      } catch (e) {
        console.error(e);
      } finally {
        // no-op; new render will recreate button
      }
    });
  }

  // Activate collapsibles
  initCollapsibles(section);
  // Timestamp label (after toolbar exists)
  setLastRefreshedLabel(section, sysinfoCacheTs);

  // Collapse/Expand All control
  const toggleAllBtn = document.getElementById('sysinfo-toggle-all-btn');
  const headers = Array.from(section.querySelectorAll('.collapsible-header'));
  const updateToggleAllLabel = () => {
    const allExpanded = headers.length && headers.every(h => h.getAttribute('aria-expanded') === 'true');
    if (toggleAllBtn) toggleAllBtn.textContent = allExpanded ? 'Collapse all' : 'Expand all';
  };
  updateToggleAllLabel();
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      const allExpanded = headers.length && headers.every(h => h.getAttribute('aria-expanded') === 'true');
      const target = !allExpanded; // if all expanded, collapse; else expand
      headers.forEach((header) => {
        header.setAttribute('aria-expanded', target ? 'true' : 'false');
        const body = header.nextElementSibling;
        const chev = header.querySelector('.chevron');
        if (body) body.style.display = target ? '' : 'none';
        if (chev) chev.textContent = target ? '▾' : '▸';
      });
      updateToggleAllLabel();
    });
    // Keep label in sync when user toggles individual sections
    section.addEventListener('click', (e) => {
      if (e.target.closest('.collapsible-header')) setTimeout(updateToggleAllLabel, 0);
    });
    section.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.collapsible-header')) setTimeout(updateToggleAllLabel, 0);
    });
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

export async function initPage() {
  const container = document.querySelector('[data-page="system-info"]');
  if (!container) return;
  const skel = document.createElement('div');
  skel.className = 'loading center';
  skel.innerHTML = '<div class="spinner" aria-hidden="true"></div><div><div class="loading-title">Loading system information…</div><div class="muted">Collecting hardware and OS details</div></div>';
  container.appendChild(skel);
  try {
    // If we have a cached copy for this session, use it
    if (sysinfoCache == null) loadCache();
    if (sysinfoCache) {
      render(sysinfoCache);
      return;
    }
    // Otherwise fetch fresh, then cache
    const info = await invoke('get_system_info');
    if (Command && navigator.userAgent.includes('Windows')) {
      try {
        const cmd = await Command.create('exec-sh', ['-c', 'wmic os get Caption | more +1']).execute();
        const osCaption = (cmd?.stdout || '').trim();
        if (osCaption) info.os = osCaption;
      } catch {}
    }
    const now = Date.now();
    saveCache(info, now);
    render(info);
  } catch (e) {
    container.innerHTML = '<section class="page"><h1>System Info</h1><p class="muted">Failed to read system information.</p></section>';
    console.error(e);
  }
}
