/**
 * Module for managing technician link iframes in a persistent container.
 * Handles creation, reuse, and visibility of webviews for technician links.
 */

/**
 * Displays a technician link in a persistent iframe container.
 * If the iframe for the link doesn't exist, it creates one; otherwise, reuses the existing one.
 * Hides the main content area while the technician link is active.
 *
 * @param {string|number} id - The ID of the technician link to display (can be prefixed with 'tech-').
 * @returns {Promise<void>}
 */
export async function showTechnicianLink(id) {
  // Load application settings to retrieve technician links configuration
  let settings = {};
  try {
    settings = await window.__TAURI__.core.invoke("load_app_settings");
  } catch (error) {
    console.warn("Failed to load app settings:", error);
  }

  // Find the technician link by ID, handling both prefixed and non-prefixed IDs
  const technicianLinks = settings.technician_links || [];
  const link = technicianLinks.find(
    (l) => l.id === id || `tech-${l.id}` === id
  );

  // Get DOM elements for container and main content
  const container = document.getElementById("tech-wv-container");
  const content = document.getElementById("content");

  // Ensure container exists; if not, exit early
  if (!container) {
    console.error("Technician link container not found");
    return;
  }

  // Hide main content and show technician container
  if (content) content.style.display = "none";
  container.style.display = "";

  // If link not found, display error message in container
  if (!link) {
    container.innerHTML = `
      <div style="padding:1rem;font:14px/1.4 Inter, system-ui, sans-serif;color:#888;">
        Link not found. Return to Settings to configure technician links.
      </div>
    `;
    return;
  }

  // Generate unique iframe ID for this link
  const iframeId = `tech-wv-${link.id}`;
  let iframe = document.getElementById(iframeId);

  // Hide all other iframes in the container to show only the current one
  Array.from(container.children).forEach((child) => {
    if (child.id !== iframeId) child.style.display = "none";
  });

  if (!iframe) {
    // Create new iframe if it doesn't exist
    iframe = document.createElement("iframe");
    iframe.id = iframeId;
    iframe.setAttribute("title", link.title || link.url || "Technician Link");

    // Set security attributes for the iframe
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups"
    );
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");

    // Apply styling for full-size iframe
    iframe.style.cssText = `
      flex: 1;
      width: 100%;
      height: 100%;
      border: 0;
      background: #111;
      display: block;
    `;

    // Sanitize and set the URL, ensuring HTTPS protocol
    let url = (link.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    iframe.src = url;

    // Add iframe to container
    container.appendChild(iframe);
  } else {
    // If iframe exists, just make it visible (preserve existing state)
    iframe.style.display = "";
  }
}

/**
 * Hides the technician link container and restores the main content area.
 * Used when navigating away from a technician link.
 */
export function hideTechnicianLinks() {
  const container = document.getElementById("tech-wv-container");
  const content = document.getElementById("content");

  // Hide technician container and show main content
  if (container) container.style.display = "none";
  if (content) content.style.display = "";
}
