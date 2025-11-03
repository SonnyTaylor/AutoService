/**
 * Service Metadata Modal
 *
 * Prompts technician for metadata before starting a service run when business mode is enabled.
 * Collects: technician name, customer name
 */

import { getBusinessSettings } from "./business.js";

/**
 * Show modal to prompt for service metadata (technician name, customer name)
 * @returns {Promise<{technicianName: string, customerName: string, skipped?: boolean} | null | false>}
 *   - Object with metadata if user completed the form
 *   - Object with skipped: true if user skipped the prompt
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
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    const modal = document.createElement("div");
    modal.className = "service-metadata-modal";
    modal.style.cssText = `
      background: var(--panel-2);
      border-radius: 12px;
      padding: 28px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border);
    `;

    const title = document.createElement("h2");
    title.textContent = "Service Information";
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 1.5rem;
      color: var(--text);
    `;

    const subtitle = document.createElement("p");
    subtitle.textContent =
      "Please provide information for the customer report.";
    subtitle.style.cssText = `
      margin: 0 0 24px 0;
      color: var(--muted);
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
      color: var(--text);
      font-size: 0.95rem;
    `;

    // Load saved technician names from business settings
    const savedNames = business.technician_names || [];
    console.log("Loaded technician names:", savedNames);

    // Create searchable combo box using datalist
    const technicianInput = document.createElement("input");
    technicianInput.type = "text";
    technicianInput.id = "service-metadata-technician";
    technicianInput.setAttribute("list", "service-metadata-technician-list");
    technicianInput.placeholder =
      savedNames.length > 0
        ? "Select or type technician name"
        : "Enter your name";
    technicianInput.style.cssText = `
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel-accent);
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
      min-height: 38px;
    `;
    technicianInput.addEventListener("focus", () => {
      technicianInput.style.borderColor = "#335d9b";
      technicianInput.style.outline = "none";
      technicianInput.style.boxShadow = "0 0 0 1px #335d9b";
    });
    technicianInput.addEventListener("blur", () => {
      technicianInput.style.borderColor = "var(--border)";
      technicianInput.style.boxShadow = "none";
    });

    // Create datalist with saved names
    const technicianDatalist = document.createElement("datalist");
    technicianDatalist.id = "service-metadata-technician-list";
    savedNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      technicianDatalist.appendChild(option);
    });

    technicianGroup.appendChild(technicianLabel);
    technicianGroup.appendChild(technicianInput);
    technicianGroup.appendChild(technicianDatalist);

    // Add hint if there are saved names
    if (savedNames.length > 0) {
      const hint = document.createElement("div");
      hint.style.cssText = `
        font-size: 0.85rem;
        color: var(--muted);
        margin-top: -2px;
      `;
      hint.textContent = "Click dropdown or type to filter suggestions";
      technicianGroup.appendChild(hint);
    }

    // Customer Name Field
    const customerGroup = document.createElement("div");
    customerGroup.style.cssText =
      "display: flex; flex-direction: column; gap: 6px;";

    const customerLabel = document.createElement("label");
    customerLabel.textContent = "Customer Name";
    customerLabel.htmlFor = "service-metadata-customer";
    customerLabel.style.cssText = `
      font-weight: 500;
      color: var(--text);
      font-size: 0.95rem;
    `;

    const customerInput = document.createElement("input");
    customerInput.type = "text";
    customerInput.id = "service-metadata-customer";
    customerInput.required = true;
    customerInput.placeholder = "Enter customer's name";
    customerInput.style.cssText = `
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel-accent);
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
      min-height: 38px;
    `;
    customerInput.addEventListener("focus", () => {
      customerInput.style.borderColor = "#335d9b";
      customerInput.style.outline = "none";
      customerInput.style.boxShadow = "0 0 0 1px #335d9b";
    });
    customerInput.addEventListener("blur", () => {
      customerInput.style.borderColor = "var(--border)";
      customerInput.style.boxShadow = "none";
    });

    customerGroup.appendChild(customerLabel);
    customerGroup.appendChild(customerInput);

    // Buttons
    const buttonGroup = document.createElement("div");
    buttonGroup.style.cssText = `
      display: flex;
      gap: 12px;
      margin-top: 8px;
      justify-content: space-between;
      align-items: center;
    `;

    const leftButtons = document.createElement("div");
    leftButtons.style.cssText = `
      display: flex;
      gap: 12px;
    `;

    const rightButtons = document.createElement("div");
    rightButtons.style.cssText = `
      display: flex;
      gap: 12px;
    `;

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.textContent = "Skip";
    skipBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      font-size: 0.95rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    `;
    skipBtn.addEventListener("mouseenter", () => {
      skipBtn.style.color = "var(--text)";
      skipBtn.style.textDecoration = "underline";
    });
    skipBtn.addEventListener("mouseleave", () => {
      skipBtn.style.color = "var(--muted)";
      skipBtn.style.textDecoration = "none";
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "ghost";
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font-size: 1rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    `;
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "var(--panel-hover)";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "transparent";
    });

    const startBtn = document.createElement("button");
    startBtn.type = "submit";
    startBtn.textContent = "Start Service";
    startBtn.style.cssText = `
      padding: 8px 24px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: var(--primary);
      color: white;
      font-size: 1rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    `;
    startBtn.addEventListener("mouseenter", () => {
      startBtn.style.background = "var(--primary-700)";
    });
    startBtn.addEventListener("mouseleave", () => {
      startBtn.style.background = "var(--primary)";
    });

    leftButtons.appendChild(skipBtn);
    rightButtons.appendChild(cancelBtn);
    rightButtons.appendChild(startBtn);
    buttonGroup.appendChild(leftButtons);
    buttonGroup.appendChild(rightButtons);

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

    skipBtn.addEventListener("click", () => {
      cleanup();
      resolve({
        technicianName: "",
        customerName: "",
        skipped: true,
      });
    });

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
        skipped: false,
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
