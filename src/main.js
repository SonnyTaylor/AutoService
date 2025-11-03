// Router and page loader for AutoService frontend
import "@phosphor-icons/web/regular";
import { initWidget } from "./components/task-progress-widget.js";
//
// Responsibilities:
// - Maintain a minimal hash-based router: #/<route>[?query]
// - Load HTML from /pages/** into #content and optionally initialize controllers
// - Manage dynamic technician tabs derived from app settings
// - Keep focus/scroll behavior accessible and predictable

// -----------------------------
// Route registry
// -----------------------------

/** Dynamic technician routes constructed from settings at runtime. */
let dynamicTechRoutes = [];

/** Base static routes available in the app. */
const baseRoutes = [
  "service",
  "service-run",
  "service-report",
  "service-results",
  "system-info",
  "shortcuts",
  "programs",
  "scripts",
  "reports",
  "component-test",
  "settings",
];

// Pre-register all potential page controllers so Vite can analyze them
// Keys are module paths relative to this file (starting with './')
const controllers = import.meta.glob("./pages/**/*.js");
// Statically include all page HTML so production build doesn't rely on network fetches
const htmlModules = import.meta.glob("./pages/**/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Map logical routes to HTML file paths (without extension). */
const htmlMap = {
  "system-info": "system-info/system-info",
  shortcuts: "shortcuts/shortcuts",
  scripts: "scripts/scripts",
  settings: "settings/settings",
};

/** Map logical routes to script controller module paths (without extension). */
const scriptMap = {
  "system-info": "system-info/index",
  shortcuts: "shortcuts/index",
  scripts: "scripts/index",
  settings: "settings/index",
  programs: "programs/index",
};

/** Map logical routes to foldered page files (fallback when not in htmlMap). */
const pathMap = {
  service: "service/presets",
  "service-run": "service/builder",
  "service-report": "service/runner",
  "service-results": "service/results/index",
  programs: "programs/index",
  reports: "reports/index",
  "component-test": "component-test/index",
};

/** Return all known routes including dynamic technician routes. */
function allRoutes() {
  return [...baseRoutes, ...dynamicTechRoutes];
}

/**
 * Normalize the current window hash to the format #/<route>[?query].
 * Falls back to #/service for invalid or unknown routes.
 * @returns {string} normalized hash
 */
function normalizeHash() {
  const hash = window.location.hash || "#/service";
  // ensure format #/route[?query]
  if (!hash.startsWith("#/")) return "#/service";
  const route = hash.slice(2);
  const [name, query] = route.split("?", 2);
  if (!allRoutes().includes(name)) return "#/service";
  return `#/${name}${query ? `?${query}` : ""}`;
}

/**
 * Determine if a route is a dynamic technician route.
 * @param {string} name logical route name (no leading #/)
 * @returns {boolean}
 */
function nameIsDynamicTech(name) {
  return name.startsWith("tech-");
}

/**
 * Load a page's HTML into #content and initialize its controller (if any).
 * Handles dynamic technician link display specially by delegating to a dedicated module.
 * @param {string} route logical route name (e.g., "service" or "system-info")
 */
async function loadPage(route) {
  const content = document.getElementById("content");
  if (!content) return;
  content.setAttribute("aria-busy", "true");
  try {
    // Dynamic technician pages are shown in a persistent iframe container
    if (nameIsDynamicTech(route)) {
      try {
        const importer =
          controllers["./pages/technician-link-display/index.js"];
        if (importer) {
          const mod = await importer();
          if (typeof mod.showTechnicianLink === "function") {
            await mod.showTechnicianLink(route.replace(/^tech-/, ""));
            content.setAttribute("aria-busy", "false");
            return;
          }
        } else {
          console.warn("Technician link display module not found");
        }
      } catch {}
    }

    // Choose HTML path; some routes use a different HTML file than the script
    const pagePath = htmlMap[route] || pathMap[route] || route;
    const htmlKey = `./pages/${pagePath}.html`;
    const html = htmlModules[htmlKey];

    // Reset scroll before content change, then inject HTML (or a simple error state)
    window.scrollTo(0, 0);
    content.innerHTML =
      html ||
      `<div class="page"><h1>Not Found</h1><p class="muted">Missing page template: ${htmlKey}</p></div>`;

    // Focus the main landmark for a11y but prevent auto-scrolling
    content.focus({ preventScroll: true });

    // Ensure any persistent technician webviews are hidden when loading a normal page
    try {
      const importerHide =
        controllers["./pages/technician-link-display/index.js"];
      if (importerHide) {
        const modHide = await importerHide();
        if (typeof modHide.hideTechnicianLinks === "function")
          modHide.hideTechnicianLinks();
      }
    } catch {}

    // Try to load optional page controller: /pages/<route>.js
    try {
      const scriptPath = scriptMap[route] || pathMap[route] || route;
      const key = `./pages/${scriptPath}.js`;
      const importer = controllers[key];
      if (!importer) {
        console.log("No page controller registered for", key);
      } else {
        const mod = await importer();
        if (typeof mod.initPage === "function") {
          await mod.initPage();
        }
      }
    } catch (e) {
      // No controller or failed to load; ignore silently
      console.log("Failed to load page controller for", route, e);
    }
  } catch (e) {
    content.innerHTML = `<div class="page"><h1>Error</h1><p class="muted">Failed to load page: ${route}</p></div>`;
  } finally {
    content.setAttribute("aria-busy", "false");
  }
}

/**
 * Set the active tab button in the header based on the route.
 * @param {string} route logical route name
 */
function setActiveTab(route) {
  document.querySelectorAll(".tab-bar .tab").forEach((el) => {
    const r = el.getAttribute("data-route");
    if (r === route) el.classList.add("active");
    else el.classList.remove("active");
  });
}

/**
 * Update UI when the hash changes: normalize hash, compute route, set tab, and load page.
 */
async function onRouteChange() {
  const hash = normalizeHash();
  if (window.location.hash !== hash) {
    window.location.hash = hash; // will re-trigger
    return;
  }
  const route = hash.slice(2);
  const [name] = route.split("?", 2);

  // Check if there's an active run and redirect to runner if navigating to service routes
  if (name === "service" || name === "service-run") {
    try {
      const { getRunState, isRunActive } = await import(
        "./utils/task-state.js"
      );
      const state = getRunState();

      // If there's an active run or recently completed run, redirect to runner page
      if (
        isRunActive() ||
        state.overallStatus === "running" ||
        state.overallStatus === "completed" ||
        state.overallStatus === "error"
      ) {
        // Redirect service-related routes to the runner page when there's an active/completed run
        // BUT allow service-results to pass through (user wants to see results page)
        if (name !== "service-report" && state.runId) {
          window.location.hash = "#/service-report";
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to check run state:", e);
    }
  }

  setActiveTab(name);
  loadPage(name);
}

/**
 * Load app settings, rebuild dynamic technician tabs, and inject them into the header.
 * Emits no errors to the user; silently no-ops if settings are unavailable.
 */
async function refreshTechnicianTabs() {
  // Load settings and rebuild dynamic tabs area
  let settings = {};
  try {
    if (window.__TAURI__) {
      settings = await window.__TAURI__.core.invoke("load_app_settings");
    }
  } catch {}
  const links = settings?.technician_links || [];
  dynamicTechRoutes = links.map((l) => `tech-${l.id}`);
  const nav = document.querySelector(".tab-bar");
  if (!nav) return;
  // Remove old dynamic items
  nav.querySelectorAll(".tab.tech-link").forEach((el) => el.remove());
  nav.querySelectorAll(".tab-divider-tech").forEach((el) => el.remove());
  if (!links.length) {
    return;
  }
  // Insert divider then links
  const insertPoint = nav.querySelector(".tab-dynamic-insert-point");
  const divider = document.createElement("span");
  divider.className = "tab-divider-tech";
  divider.style.cssText =
    "display:inline-block;width:1px;height:24px;background:var(--border-color,#444);margin:0 4px;align-self:center;";
  insertPoint?.before(divider);
  links.forEach((link) => {
    const a = document.createElement("a");
    a.className = "tab tech-link";
    a.textContent = link.title || link.url;
    a.href = `#/tech-${link.id}`;
    a.setAttribute("data-route", `tech-${link.id}`);
    insertPoint?.before(a);
  });
}

// -----------------------------
// Wire up events
// -----------------------------

window.addEventListener("hashchange", onRouteChange);
window.addEventListener("DOMContentLoaded", () => {
  onRouteChange();

  // Initialize persistent task progress widget
  initWidget();

  // Background prewarm of system info so navigating there is instant.
  (async () => {
    try {
      const importer = controllers["./pages/system-info/index.js"];
      const mod = importer ? await importer() : null;
      if (typeof mod.prewarmSystemInfo === "function") {
        mod.prewarmSystemInfo();
      }
    } catch {}
  })();
  // Wire custom titlebar controls
  const { getCurrentWindow } =
    (window.__TAURI__ && window.__TAURI__.window) || {};
  if (getCurrentWindow) {
    const appWindow = getCurrentWindow();
    document
      .getElementById("titlebar-minimize")
      ?.addEventListener("click", () => appWindow.minimize());
    document
      .getElementById("titlebar-maximize")
      ?.addEventListener("click", () => appWindow.toggleMaximize());
    document
      .getElementById("titlebar-close")
      ?.addEventListener("click", () => appWindow.close());
  }
  refreshTechnicianTabs();
  // Listen for custom event to refresh tabs when settings change
  window.addEventListener("technician-links-updated", refreshTechnicianTabs);
});
