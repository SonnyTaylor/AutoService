/**
 * Service Metadata Modal
 *
 * Prompts technician for metadata before starting a service run when business mode is enabled.
 * Collects: technician name, customer name
 */

import { getBusinessSettings } from "./business.js";

/**
 * Show modal to prompt for service metadata (technician name, customer name)
 * @returns {Promise<{technicianName: string, customerName: string} | null | false>}
 *   - Object with metadata if user completed the form
 *   - null if business mode is disabled (no prompt needed)
 *   - false if user cancelled the prompt
 */
export async function promptServiceMetadata() {
  const business = await getBusinessSettings();

  // Only prompt if business mode is enabled
  if (!business.enabled) {
    return null;
  }

  return new Promise((resolve) => {
    // Create modal elements
    const overlay = document.createElement("div");
    overlay.className = "service-metadata-modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    const modal = document.createElement("div");
    modal.className = "service-metadata-modal";
    modal.style.cssText = `
      background: var(--bg-secondary, #1e1e1e);
      border-radius: 12px;
      padding: 28px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-color, #333);
    `;

    const title = document.createElement("h2");
    title.textContent = "Service Information";
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 1.5rem;
      color: var(--text-primary, #fff);
    `;

    const subtitle = document.createElement("p");
    subtitle.textContent =
      "Please provide information for the customer report.";
    subtitle.style.cssText = `
      margin: 0 0 24px 0;
      color: var(--text-secondary, #aaa);
      font-size: 0.95rem;
    `;

    const form = document.createElement("form");
    form.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    // Technician Name Field
    const technicianGroup = document.createElement("div");
    technicianGroup.style.cssText =
      "display: flex; flex-direction: column; gap: 6px;";

    const technicianLabel = document.createElement("label");
    technicianLabel.textContent = "Technician Name";
    technicianLabel.htmlFor = "service-metadata-technician";
    technicianLabel.style.cssText = `
      font-weight: 500;
      color: var(--text-primary, #fff);
      font-size: 0.95rem;
    `;

    const technicianInput = document.createElement("input");
    technicianInput.type = "text";
    technicianInput.id = "service-metadata-technician";
    technicianInput.required = true;
    technicianInput.placeholder = "Enter your name";
    technicianInput.style.cssText = `
      padding: 10px 14px;
      border: 1px solid var(--border-color, #444);
      border-radius: 6px;
      background: var(--bg-primary, #252525);
      color: var(--text-primary, #fff);
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.2s;
    `;
    technicianInput.addEventListener("focus", () => {
      technicianInput.style.borderColor = "var(--accent-color, #0078d4)";
      technicianInput.style.outline = "none";
    });
    technicianInput.addEventListener("blur", () => {
      technicianInput.style.borderColor = "var(--border-color, #444)";
    });

    technicianGroup.appendChild(technicianLabel);
    technicianGroup.appendChild(technicianInput);

    // Customer Name Field
    const customerGroup = document.createElement("div");
    customerGroup.style.cssText =
      "display: flex; flex-direction: column; gap: 6px;";

    const customerLabel = document.createElement("label");
    customerLabel.textContent = "Customer Name";
    customerLabel.htmlFor = "service-metadata-customer";
    customerLabel.style.cssText = `
      font-weight: 500;
      color: var(--text-primary, #fff);
      font-size: 0.95rem;
    `;

    const customerInput = document.createElement("input");
    customerInput.type = "text";
    customerInput.id = "service-metadata-customer";
    customerInput.required = true;
    customerInput.placeholder = "Enter customer's name";
    customerInput.style.cssText = `
      padding: 10px 14px;
      border: 1px solid var(--border-color, #444);
      border-radius: 6px;
      background: var(--bg-primary, #252525);
      color: var(--text-primary, #fff);
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.2s;
    `;
    customerInput.addEventListener("focus", () => {
      customerInput.style.borderColor = "var(--accent-color, #0078d4)";
      customerInput.style.outline = "none";
    });
    customerInput.addEventListener("blur", () => {
      customerInput.style.borderColor = "var(--border-color, #444)";
    });

    customerGroup.appendChild(customerLabel);
    customerGroup.appendChild(customerInput);

    // Buttons
    const buttonGroup = document.createElement("div");
    buttonGroup.style.cssText = `
      display: flex;
      gap: 12px;
      margin-top: 8px;
      justify-content: flex-end;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid var(--border-color, #444);
      border-radius: 6px;
      background: transparent;
      color: var(--text-primary, #fff);
      font-size: 1rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    `;
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "var(--bg-hover, #2a2a2a)";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "transparent";
    });

    const startBtn = document.createElement("button");
    startBtn.type = "submit";
    startBtn.textContent = "Start Service";
    startBtn.style.cssText = `
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      background: var(--accent-color, #0078d4);
      color: white;
      font-size: 1rem;
      cursor: pointer;
      font-weight: 500;
      font-family: inherit;
      transition: all 0.2s;
    `;
    startBtn.addEventListener("mouseenter", () => {
      startBtn.style.background = "var(--accent-hover, #106ebe)";
    });
    startBtn.addEventListener("mouseleave", () => {
      startBtn.style.background = "var(--accent-color, #0078d4)";
    });

    buttonGroup.appendChild(cancelBtn);
    buttonGroup.appendChild(startBtn);

    // Assemble form
    form.appendChild(technicianGroup);
    form.appendChild(customerGroup);
    form.appendChild(buttonGroup);

    // Assemble modal
    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(form);
    overlay.appendChild(modal);

    // Event handlers
    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(false); // User cancelled
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false); // User cancelled
      }
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const technicianName = technicianInput.value.trim();
      const customerName = customerInput.value.trim();

      if (!technicianName || !customerName) {
        return;
      }

      cleanup();
      resolve({
        technicianName,
        customerName,
      });
    });

    // Show modal
    document.body.appendChild(overlay);

    // Focus first input
    setTimeout(() => technicianInput.focus(), 100);

    // Handle ESC key
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false); // User cancelled
        document.removeEventListener("keydown", handleEsc);
      }
    };
    document.addEventListener("keydown", handleEsc);
  });
}
