// Minimal hash router that loads pages from /pages/*.html into #content

const routes = [
  "scans",
  "service",
  "service-run",
  "system-info",
  "shortcuts",
  "programs",
  "stress-test",
  "component-test",
  "diagnostic",
  "tools",
  "settings",
];

function normalizeHash() {
  const hash = window.location.hash || "#\/scans";
  // ensure format #/route[?query]
  if (!hash.startsWith("#/")) return "#/scans";
  const route = hash.slice(2);
  const [name, query] = route.split("?", 2);
  if (!routes.includes(name)) return "#/scans";
  return `#/${name}${query ? `?${query}` : ""}`;
}

async function loadPage(route) {
  const content = document.getElementById("content");
  if (!content) return;
  content.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(`pages/${route}.html`, { cache: "no-cache" });
    const html = await res.text();
    content.innerHTML = html;
    // Focus the main landmark for a11y
    content.focus();

    // Try to load optional page controller: /pages/<route>.js
    try {
      const mod = await import(`./pages/${route}.js?ts=${Date.now()}`);
      if (typeof mod.initPage === "function") {
        await mod.initPage();
      }
    } catch (e) {
      // No controller or failed to load; ignore silently
      // console.debug("No page controller for", route, e);
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

window.addEventListener("hashchange", onRouteChange);
window.addEventListener("DOMContentLoaded", onRouteChange);
