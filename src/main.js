// Minimal hash router that loads pages from /pages/*.html into #content

// Base static routes; technician custom links will be appended at runtime
let dynamicTechRoutes = [];
const baseRoutes = [
  "service",
  "service-run",
  "service-report",
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

function allRoutes() {
  return [...baseRoutes, ...dynamicTechRoutes];
}

function normalizeHash() {
  const hash = window.location.hash || "#/service";
  // ensure format #/route[?query]
  if (!hash.startsWith("#/")) return "#/service";
  const route = hash.slice(2);
  const [name, query] = route.split("?", 2);
  if (!allRoutes().includes(name)) return "#/service";
  return `#/${name}${query ? `?${query}` : ""}`;
}

async function loadPage(route) {
  const content = document.getElementById("content");
  if (!content) return;
  content.setAttribute("aria-busy", "true");
  try {
    // map logical routes to foldered page files
    const pathMap = {
      service: "service/index",
      "service-run": "service/run",
      "service-report": "service/report",
      programs: "programs/index",
      reports: "reports/index",
    };
    // map logical routes to HTML files (different from scripts for some cases)
    const htmlMap = {
      "system-info": "system-info/system-info",
      shortcuts: "shortcuts/shortcuts",
      scripts: "scripts/scripts",
      settings: "settings/settings",
    };
    // map logical routes to script files (different from HTML for some cases)
    const scriptMap = {
      "system-info": "system-info/index",
      shortcuts: "shortcuts/index",
      scripts: "scripts/index",
      settings: "settings/index",
      programs: "programs/index",
    };
    if (nameIsDynamicTech(route)) {
      // dynamic technician pages are now shown in a persistent iframe container
      try {
        const importer = controllers["./pages/technician-link-display.js"];
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
    const pagePath = htmlMap[route] || pathMap[route] || route;
    const res = await fetch(`/pages/${pagePath}.html`, { cache: "no-cache" });
    const html = await res.text();
    // Reset scroll before content change
    window.scrollTo(0, 0);
    content.innerHTML = html;

    // Focus the main landmark for a11y but prevent auto-scrolling
    content.focus({ preventScroll: true });

    // Ensure any persistent technician webviews are hidden when loading a normal page
    try {
      const importerHide = controllers["./pages/technician-link-display.js"];
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

function setActiveTab(route) {
  document.querySelectorAll(".tab-bar .tab").forEach((el) => {
    const r = el.getAttribute("data-route");
    if (r === route) el.classList.add("active");
    else el.classList.remove("active");
  });
}

function onRouteChange() {
  const hash = normalizeHash();
  if (window.location.hash !== hash) {
    window.location.hash = hash; // will re-trigger
    return;
  }
  const route = hash.slice(2);
  const [name] = route.split("?", 2);
  setActiveTab(name);
  loadPage(name);
}

function nameIsDynamicTech(name) {
  return name.startsWith("tech-");
}

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

window.addEventListener("hashchange", onRouteChange);
window.addEventListener("DOMContentLoaded", () => {
  onRouteChange();
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
