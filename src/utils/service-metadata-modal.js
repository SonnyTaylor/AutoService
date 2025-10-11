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

    // Create input wrapper for hybrid select/input
    const technicianInputWrapper = document.createElement("div");
    technicianInputWrapper.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    // If there are saved names, show a select dropdown
    let technicianSelect = null;
    if (savedNames.length > 0) {
      technicianSelect = document.createElement("select");
      technicianSelect.id = "service-metadata-technician-select";
      technicianSelect.style.cssText = `
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel-accent);
        color: var(--text);
        font-size: 1rem;
        font-family: inherit;
        transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
        min-height: 38px;
        cursor: pointer;
        flex: 1;
      `;

      // Add default option
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "-- Select or type below --";
      technicianSelect.appendChild(defaultOption);

      // Add saved names
      savedNames.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        technicianSelect.appendChild(option);
      });

      technicianSelect.addEventListener("focus", () => {
        technicianSelect.style.borderColor = "#335d9b";
        technicianSelect.style.outline = "none";
        technicianSelect.style.boxShadow = "0 0 0 1px #335d9b";
      });
      technicianSelect.addEventListener("blur", () => {
        technicianSelect.style.borderColor = "var(--border)";
        technicianSelect.style.boxShadow = "none";
      });
    }

    const technicianInput = document.createElement("input");
    technicianInput.type = "text";
    technicianInput.id = "service-metadata-technician";
    technicianInput.required = true;
    technicianInput.placeholder =
      savedNames.length > 0 ? "Or type a name" : "Enter your name";
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
      flex: ${savedNames.length > 0 ? "1" : "1"};
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

    // When select changes, populate input
    if (technicianSelect) {
      technicianSelect.addEventListener("change", () => {
        if (technicianSelect.value) {
          technicianInput.value = technicianSelect.value;
        }
      });

      technicianInputWrapper.appendChild(technicianSelect);
    }

    technicianInputWrapper.appendChild(technicianInput);

    technicianGroup.appendChild(technicianLabel);
    technicianGroup.appendChild(technicianInputWrapper);

    // Add hint if there are saved names
    if (savedNames.length > 0) {
      const hint = document.createElement("div");
      hint.style.cssText = `
        font-size: 0.85rem;
        color: var(--muted);
        margin-top: -2px;
      `;
      hint.textContent = "Select from dropdown or type a name";
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
      justify-content: flex-end;
    `;

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
