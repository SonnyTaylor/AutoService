export async function showTechnicianLink(id) {
  // Persistent iframe container approach:
  // - keep per-link iframe elements inside #tech-wv-container
  // - create iframe if missing, otherwise show existing iframe (preserve state)
  // - hide the main #content area while a tech link is active
  let settings = {};
  try {
    settings = await window.__TAURI__.core.invoke("load_app_settings");
  } catch {}
  const link = (settings.technician_links || []).find(
    (l) => `tech-${l.id}` === `tech-${id}` || l.id === id
  );
  const container = document.getElementById("tech-wv-container");
  const content = document.getElementById("content");
  if (!container) return;
  // Ensure content area is hidden while tech container is visible
  if (content) content.style.display = "none";
  container.style.display = "";

  // If link missing, show a small message pane inside container
  if (!link) {
    container.innerHTML = `<div style="padding:1rem;font:14px/1.4 Inter, system-ui, sans-serif;color:#888;">Link not found. Return to Settings to configure technician links.</div>`;
    return;
  }

  // Create or reuse an iframe for this link
  const iframeId = `tech-wv-${link.id}`;
  let iframe = document.getElementById(iframeId);
  // Hide all other iframes in the container
  Array.from(container.children).forEach((child) => {
    if (child.id !== iframeId) child.style.display = "none";
  });

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = iframeId;
    iframe.setAttribute("title", link.title || link.url || "Technician Link");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups"
    );
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");
    iframe.style.cssText =
      "flex:1;width:100%;height:100%;border:0;background:#111;display:block;";
    // Basic sanitization: ensure protocol present
    let url = (link.url || "").trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    iframe.src = url;
    container.appendChild(iframe);
  } else {
    // If iframe exists, just show it (no src reassignment to preserve state)
    iframe.style.display = "";
  }
}

// Utility to hide the tech container and restore main content (used when navigating away)
export function hideTechnicianLinks() {
  const container = document.getElementById("tech-wv-container");
  const content = document.getElementById("content");
  if (container) container.style.display = "none";
  if (content) content.style.display = "";
}
