/**
 * System Information Page Module
 *
 * This module handles fetching, caching, and displaying comprehensive system
 * hardware and software information in a user-friendly web interface.
 * It provides collapsible sections for different system components with
 * real-time data visualization and refresh capabilities.
 *
 * Features:
 * - Session-based caching to avoid repeated system queries
 * - Collapsible sections for organized information display
 * - Real-time refresh functionality
 * - Windows-specific enhancements (OS caption, TPM, etc.)
 * - Responsive progress bars and badges for usage metrics
 */

// Tauri API imports
let invoke;
let Command;
if (window.__TAURI__) {
  invoke = window.__TAURI__.core.invoke;
  Command = window.__TAURI__?.shell?.Command || null;
} else {
  invoke = async () => {
    console.warn("Tauri not available, using mock data");
    return {}; // mock empty data
  };
  Command = null;
}

// Import our modules
import {
  loadCache,
  saveCache,
  getCache,
  getCacheTimestamp,
  setPrewarmPromise,
  getPrewarmPromise,
} from "./cache.js";
import {
  makeCollapsible,
  initCollapsibles,
  setLastRefreshedLabel,
  setupToggleAll,
  $,
} from "./ui.js";
import { formatBytes, formatDuration, escapeHtml } from "./formatters.js";
import printJS from "print-js";
import {
  renderOS,
  renderUsers,
  renderSystem,
  renderMotherboard,
  renderCPU,
  renderRAM,
  renderGPU,
  renderStorage,
  renderNetwork,
  renderBattery,
  renderSensors,
  renderUpdates,
  renderAdapters,
} from "./renderers.js";

/**
 * Enhances system info with Windows-specific data like OS caption.
 * @param {Object} info - System info object
 * @returns {Promise<Object>} Enhanced system info
 */
async function enhanceWindowsInfo(info) {
  if (!Command || !navigator.userAgent.includes("Windows")) {
    return info;
  }

  try {
    const psArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "wmic os get Caption | more +1",
    ];
    const cmd = await Command.create("powershell", psArgs).execute();
    const osCaption = (cmd?.stdout || "").trim();
    if (osCaption) {
      info.os = osCaption;
    }
  } catch (error) {
    console.warn("Failed to get Windows OS caption:", error);
  }

  return info;
}

/**
 * Generate printable light-mode HTML for customer-facing system specs.
 * Uses inline styles and does not rely on app CSS.
 * @param {Object} info
 * @returns {string}
 */
function generatePrintHtml(info) {
  const product = info.product || {};
  const motherboard = info.motherboard || {};
  const hostname = info.hostname || "-";
  const os = info.os || "-";
  const osBuild = info.os_version || info.kernel_version || "-";
  const uptime = formatDuration(info.uptime_seconds);
  const bootStr = (() => {
    try {
      return info.boot_time_seconds
        ? new Date(info.boot_time_seconds * 1000).toLocaleString()
        : "-";
    } catch {
      return "-";
    }
  })();

  const cpu = info.cpu || {};
  const cpuCores = cpu.num_physical_cores != null ? String(cpu.num_physical_cores) : "-";
  const cpuThreads = cpu.num_logical_cpus != null ? String(cpu.num_logical_cpus) : "-";
  const cpuFreq = cpu.frequency_mhz ? `${(cpu.frequency_mhz / 1000).toFixed(2)} GHz` : "-";

  const mem = info.memory || { total: 0, used: 0, free: 0, swap_total: 0, swap_used: 0 };
  const memPct = mem.total ? Math.min(100, Math.round((mem.used / mem.total) * 100)) : 0;

  const gpus = Array.isArray(info.gpus) ? info.gpus : [];
  const gpuRows = gpus
    .map(
      (g) => `
        <tr>
          <td>${escapeHtml(g.name || "-")}</td>
          <td>${escapeHtml(String(g.device_type || "-"))}</td>
          <td>${escapeHtml([g.driver, g.driver_info].filter(Boolean).join(" ") || "-")}</td>
          <td>${escapeHtml(String(g.backend || "-"))}</td>
        </tr>`
    )
    .join("");

  const disks = Array.isArray(info.disks) ? info.disks : [];
  const diskRows = disks
    .map((d) => {
      const used = Math.max(0, (d.total_space || 0) - (d.available_space || 0));
      const pct = d.total_space ? Math.min(100, Math.round((used / d.total_space) * 100)) : 0;
      return `
        <tr>
          <td>${escapeHtml(d.name || d.mount_point || "-")}</td>
          <td>${escapeHtml(d.mount_point || "-")}</td>
          <td>${escapeHtml(d.file_system || "-")}</td>
          <td>${formatBytes(used)} / ${formatBytes(d.total_space || 0)} (${pct}%)</td>
          <td>${escapeHtml(d.kind || "-")}</td>
        </tr>`;
    })
    .join("");

  const nets = Array.isArray(info.networks) ? info.networks : [];
  const netRows = nets
    .map((n) => `
      <tr>
        <td>${escapeHtml(n.interface || "-")}</td>
        <td>${escapeHtml(n.mac || "-")}</td>
        <td>${escapeHtml((n.ips || []).join(", ") || "-")}</td>
        <td>Rx ${formatBytes(n.total_received || 0)} / Tx ${formatBytes(n.total_transmitted || 0)}</td>
      </tr>`)
    .join("");

  const batteries = Array.isArray(info.batteries) ? info.batteries : [];
  const battRows = batteries
    .map((b, i) => {
      const pct = b.percentage != null ? `${b.percentage.toFixed(0)}%` : "-";
      const health = b.state_of_health_pct != null ? `${b.state_of_health_pct.toFixed(0)}%` : "-";
      const ident = [b.vendor, b.model].filter(Boolean).join(" ") || "-";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(ident)}</td>
          <td>${escapeHtml(b.state || "-")}</td>
          <td>${pct}</td>
          <td>${health}</td>
        </tr>`;
    })
    .join("");

  const nowStr = new Date().toLocaleString();
  const customerTitle = `System Specifications`;
  const subTitle = `${escapeHtml(hostname)}${product.name ? " • " + escapeHtml(product.name) : ""}`;

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${customerTitle} - ${escapeHtml(hostname)}</title>
    <style>
      :root {
        --text: #0b1220;
        --muted: #5a667f;
        --border: #e4e8f0;
        --bg: #ffffff;
        --bg-alt: #f7f9fc;
        --heading: #0b1220;
        --accent: #1b66ff;
      }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; color: var(--text); background: var(--bg); margin: 0; padding: 24px; }
      .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid var(--border); padding-bottom: 12px; margin-bottom: 16px; }
      .title h1 { margin: 0; font-size: 24px; color: var(--heading); }
      .title .sub { color: var(--muted); margin-top: 4px; }
      .meta { text-align: right; color: var(--muted); font-size: 12px; }
      .section { margin: 18px 0; }
      .section h2 { font-size: 16px; color: var(--heading); margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
      thead th { background: var(--bg-alt); font-weight: 600; color: var(--muted); }
      .kv { width: 100%; }
      .kv th { width: 200px; color: var(--muted); font-weight: 500; background: transparent; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eaf1ff; color: #1346b5; font-weight: 600; font-size: 12px; }
      .small { font-size: 12px; color: var(--muted); }
      @media print {
        body { padding: 0; }
        .page-break { page-break-after: always; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title">
        <h1>${customerTitle}</h1>
        <div class="sub">${subTitle}</div>
      </div>
      <div class="meta">
        <div><strong>Date:</strong> ${escapeHtml(nowStr)}</div>
        <div><strong>OS:</strong> ${escapeHtml(os)} (${escapeHtml(osBuild)})</div>
      </div>
    </div>

    <div class="section">
      <h2>Overview</h2>
      <table class="kv">
        <tbody>
          <tr><th>Computer</th><td>${escapeHtml([product.vendor, product.name].filter(Boolean).join(" ") || "-")}</td></tr>
          <tr><th>Serial</th><td>${escapeHtml(product.serial_number || "-")}</td></tr>
          <tr><th>Motherboard</th><td>${escapeHtml([motherboard.vendor, motherboard.name].filter(Boolean).join(" ") || "-")}</td></tr>
          <tr><th>Uptime</th><td>${escapeHtml(uptime)}</td></tr>
          <tr><th>Booted</th><td>${escapeHtml(bootStr)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Processor</h2>
      <table class="kv"><tbody>
        <tr><th>Model</th><td>${escapeHtml(cpu.brand || "-")}</td></tr>
        <tr><th>Cores / Threads</th><td>${cpuCores}C / ${cpuThreads}T</td></tr>
        <tr><th>Base Frequency</th><td>${cpuFreq}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <h2>Memory</h2>
      <table class="kv"><tbody>
        <tr><th>Usage</th><td>${formatBytes(mem.used || 0)} / ${formatBytes(mem.total || 0)} <span class="badge">${memPct}%</span></td></tr>
        <tr><th>Free</th><td>${formatBytes(mem.free || 0)}</td></tr>
        <tr><th>Swap</th><td>${formatBytes(mem.swap_used || 0)} / ${formatBytes(mem.swap_total || 0)}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <h2>Graphics</h2>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Driver</th><th>Backend</th></tr></thead>
        <tbody>${gpuRows || '<tr><td colspan="4" class="small">No GPU information</td></tr>'}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Storage</h2>
      <table>
        <thead><tr><th>Name</th><th>Mount</th><th>FS</th><th>Usage</th><th>Kind</th></tr></thead>
        <tbody>${diskRows || '<tr><td colspan="5" class="small">No storage information</td></tr>'}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Network</h2>
      <table>
        <thead><tr><th>Interface</th><th>MAC</th><th>IPs</th><th>Totals</th></tr></thead>
        <tbody>${netRows || '<tr><td colspan="4" class="small">No network information</td></tr>'}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Battery</h2>
      <table>
        <thead><tr><th>#</th><th>Identity</th><th>State</th><th>Charge</th><th>Health</th></tr></thead>
        <tbody>${battRows || '<tr><td colspan="5" class="small">No batteries detected</td></tr>'}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

/**
 * Main render function that builds the entire system info UI.
 * @param {Object} info - System info object from Tauri backend
 */
function render(info) {
  const root = $('[data-page="system-info"]');
  if (!root) return;

  const ex = info.extra || null;

  // Find or create the main section
  const section = $('section.page[data-page="system-info"]');
  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; justify-content: space-between; flex-wrap: wrap;">
      <div>
        <h1 style="margin-bottom:4px;">System Info</h1>
        <p class="muted" style="margin:0;">All your hardware and system info at a glance.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap: wrap;">
        <button id="sysinfo-print-btn" class="ghost">Print</button>
        <button id="sysinfo-toggle-all-btn" class="ghost">Collapse all</button>
        <button id="sysinfo-refresh-btn" class="ghost">Refresh</button>
        <span id="sysinfo-last-refreshed" class="muted" style="font-size:.85rem; align-self:center;"></span>
      </div>
    </div>
  `;

  // Define sections to render with their render functions and icons
  const sections = [
    {
      title: "OS Info",
      icon: "ph-monitor",
      renderFunc: () => renderOS(info, ex),
    },
    {
      title: "Users",
      icon: "ph-users",
      renderFunc: () => renderUsers(info),
      condition: Array.isArray(info.users) && info.users.length > 0,
    },
    {
      title: "System",
      icon: "ph-info",
      renderFunc: () => renderSystem(info),
      condition: true,
    },
    {
      title: "Motherboard",
      icon: "ph-circuitry",
      renderFunc: () => renderMotherboard(info, ex),
      condition: true,
    },
    { title: "CPU", icon: "ph-cpu", renderFunc: () => renderCPU(info) },
    { title: "RAM", icon: "ph-memory", renderFunc: () => renderRAM(info, ex) },
    {
      title: "GPU",
      icon: "ph-graphics-card",
      renderFunc: () => renderGPU(info, ex),
    },
    // Sensors near CPU/GPU for temps context
    {
      title: "Sensors",
      icon: "ph-thermometer",
      renderFunc: () => renderSensors(info),
      condition: Array.isArray(info.sensors) && info.sensors.length > 0,
    },
    {
      title: "Storage",
      icon: "ph-hard-drives",
      renderFunc: () => renderStorage(info, ex),
    },
    {
      title: "Network",
      icon: "ph-cell-signal-full",
      renderFunc: () => renderNetwork(info),
    },
    {
      title: "Adapters",
      icon: "ph-network",
      renderFunc: () => renderAdapters(ex),
      condition: Array.isArray(ex?.nic_enabled) && ex.nic_enabled.length > 0,
    },
    {
      title: "Battery",
      icon: "ph-battery-charging",
      renderFunc: () => renderBattery(info),
    },
    {
      title: "Updates",
      icon: "ph-arrows-clockwise",
      renderFunc: () => renderUpdates(ex),
      condition: Array.isArray(ex?.hotfixes) && ex.hotfixes.length > 0,
    },
  ];

  // Render each section
  sections.forEach(({ title, icon, renderFunc, condition = true }) => {
    const html = renderFunc();
    if (condition && html) {
      const titleWithIcon = `<i class="ph ${icon}" style="font-size: 1.2em; margin-right: 8px; vertical-align: middle;"></i>${title}`;
      section.insertAdjacentHTML(
        "beforeend",
        makeCollapsible(titleWithIcon, html)
      );
    }
  });

  // Bind refresh button
  const btn = $("#sysinfo-refresh-btn");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner sm" aria-hidden="true"></span><span style="margin-left:8px;">Refreshing…</span>';
      try {
        let data = await invoke("get_system_info");
        data = await enhanceWindowsInfo(data);
        const now = Date.now();
        saveCache(data, now);
        render(data);
      } catch (error) {
        console.error("Failed to refresh system info:", error);
      }
    });
  }

  // Bind print button
  const printBtn = $("#sysinfo-print-btn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      try {
        const html = generatePrintHtml(info);
        const titleParts = [
          "System Specifications",
          info.hostname || undefined,
          new Date().toLocaleDateString(),
        ].filter(Boolean);
        printJS({
          printable: html,
          type: "raw-html",
          scanStyles: false,
          documentTitle: titleParts.join(" - "),
        });
      } catch (e) {
        console.error("Failed to print system info:", e);
      }
    });
  }

  // Initialize UI components
  initCollapsibles(section);
  setLastRefreshedLabel(section, getCacheTimestamp());
  setupToggleAll(section);
}

/**
 * Initializes the system info page.
 * Loads cached data or fetches fresh data and renders the UI.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = $('[data-page="system-info"]');
  if (!container) return;

  // Show loading skeleton
  const skel = document.createElement("div");
  skel.className = "loading center";
  skel.innerHTML = `
    <div class="spinner" aria-hidden="true"></div>
    <div>
      <div class="loading-title">Loading system information…</div>
      <div class="muted">Collecting hardware and OS details</div>
    </div>
  `;
  container.appendChild(skel);

  try {
    // Load from cache if available
    if (getCache() == null) loadCache();
    if (getCache()) {
      render(getCache());
      return;
    }

    // Fetch fresh data and enhance for Windows
    let info = await invoke("get_system_info");
    info = await enhanceWindowsInfo(info);

    const now = Date.now();
    saveCache(info, now);
    render(info);
  } catch (error) {
    // Show error state
    container.innerHTML = `
      <section class="page">
        <h1>System Info</h1>
        <p class="muted">Failed to read system information.</p>
      </section>
    `;
    console.error("Failed to initialize system info page:", error);
  }
}

/**
 * Prewarms system info by fetching data in the background.
 * Useful for instant loading on first navigation.
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force refresh even if cached
 * @returns {Promise<Object>} Promise resolving to system info object
 */
export function prewarmSystemInfo({ force = false } = {}) {
  // Return cached data if available and not forcing
  if (!force && getCache()) return Promise.resolve(getCache());

  if (getPrewarmPromise()) return getPrewarmPromise();

  // Start background fetch
  const promise = (async () => {
    try {
      let info = await invoke("get_system_info");
      info = await enhanceWindowsInfo(info);
      saveCache(info, Date.now());
      return info;
    } catch (error) {
      setPrewarmPromise(null); // Reset on failure for retry
      throw error;
    }
  })();

  setPrewarmPromise(promise);
  return promise;
}
