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
import {
  renderOS,
  renderSystem,
  renderMotherboard,
  renderCPU,
  renderRAM,
  renderGPU,
  renderStorage,
  renderNetwork,
  renderBattery,
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
        <p class="muted" style="margin:0;">Hardware, software, and drivers at a glance.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap: wrap;">
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
    {
      title: "Storage",
      icon: "ph-hard-drives",
      renderFunc: () => renderStorage(info, ex),
    },
    {
      title: "Network",
      icon: "ph-network",
      renderFunc: () => renderNetwork(info),
    },
    {
      title: "Battery",
      icon: "ph-battery-charging",
      renderFunc: () => renderBattery(info),
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
