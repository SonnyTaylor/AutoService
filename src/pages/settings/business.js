/**
 * Business settings management for technician mode, logo, and business name.
 */

import { settingsManager } from "../../utils/settings-manager.js";

const { invoke } = window.__TAURI__.core;

/**
 * Initialize business settings UI and load saved values.
 * @param {HTMLElement} root - The settings page root element.
 */
export async function initializeBusinessSettings(root) {
  const techModeToggle = root.querySelector("#technician-mode-toggle");
  const logoInput = root.querySelector("#business-logo-input");
  const logoBrowseBtn = root.querySelector("#business-logo-browse-btn");
  const nameInput = root.querySelector("#business-name-input");
  const addressInput = root.querySelector("#business-address-input");
  const phoneInput = root.querySelector("#business-phone-input");
  const emailInput = root.querySelector("#business-email-input");
  const websiteInput = root.querySelector("#business-website-input");
  const tfnInput = root.querySelector("#business-tfn-input");
  const abnInput = root.querySelector("#business-abn-input");
  const statusEl = root.querySelector("#business-settings-status");

  // Technician names management
  const techNameForm = root.querySelector("#technician-name-form");
  const techNameInput = root.querySelector("#technician-name-input");
  const techNamesList = root.querySelector("#technician-names-list");

  // Get category containers for opacity control
  const categories = [
    root.querySelector("#branding-category"),
    root.querySelector("#contact-category"),
    root.querySelector("#identification-category"),
  ].filter(Boolean);

  if (!techModeToggle || !logoInput || !nameInput) {
    console.warn("Business settings UI elements not found");
    return;
  }

  // Load current settings
  try {
    const business = await settingsManager.get("business");

    // Set toggle state
    const techModeEnabled = business.technician_mode === true;
    techModeToggle.checked = techModeEnabled;

    // Set input values
    logoInput.value = business.logo || "";
    nameInput.value = business.name || "";
    addressInput.value = business.address || "";
    phoneInput.value = business.phone || "";
    emailInput.value = business.email || "";
    websiteInput.value = business.website || "";
    tfnInput.value = business.tfn || "";
    abnInput.value = business.abn || "";

    // Load and render technician names
    const technicianNames = business.technician_names || [];
    renderTechnicianNames(technicianNames);

    // Apply initial disabled state
    updateInputsDisabledState(techModeEnabled);
  } catch (err) {
    console.error("Failed to load business settings:", err);
    showStatus("Failed to load settings", "error");
  }

  /**
   * Update the disabled state of all inputs based on technician mode.
   * @param {boolean} enabled - Whether technician mode is enabled.
   */
  function updateInputsDisabledState(enabled) {
    // Disable/enable all inputs
    logoInput.disabled = !enabled;
    logoBrowseBtn.disabled = !enabled;
    nameInput.disabled = !enabled;
    addressInput.disabled = !enabled;
    phoneInput.disabled = !enabled;
    emailInput.disabled = !enabled;
    websiteInput.disabled = !enabled;
    tfnInput.disabled = !enabled;
    abnInput.disabled = !enabled;

    // Visual styling for disabled state - apply to category containers
    const opacity = enabled ? "1" : "0.5";
    categories.forEach((category) => {
      if (category) category.style.opacity = opacity;
    });
  }

  /**
   * Save a single business field
   * @param {string} field - Field name (e.g., 'name', 'address')
   * @param {string} value - Field value
   */
  async function saveBusinessField(field, value) {
    if (!techModeToggle.checked) {
      return; // Don't save if technician mode is disabled
    }

    try {
      await settingsManager.set(`business.${field}`, value);
      showStatus(`${field.charAt(0).toUpperCase() + field.slice(1)} saved`, "success");
    } catch (err) {
      console.error(`Failed to save ${field}:`, err);
      showStatus(`Failed to save ${field}`, "error");
    }
  }

  /**
   * Show status message to user.
   * @param {string} message - Message to display.
   * @param {"success" | "error"} [type="success"] - Status type.
   */
  function showStatus(message, type = "success") {
    if (!statusEl) return;
    const icon = type === "success" ? "✓" : "✕";
    statusEl.className = `settings-status ${type}`;
    statusEl.textContent = `${icon} ${message}`;
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
    }, 3000);
  }

  // Handle technician mode toggle
  techModeToggle.addEventListener("change", async () => {
    const enabled = techModeToggle.checked;
    updateInputsDisabledState(enabled);

    // Auto-save technician mode state
    try {
      await settingsManager.set("business.technician_mode", enabled, true);
      showStatus(
        enabled ? "Technician mode enabled" : "Technician mode disabled",
        "success"
      );
    } catch (err) {
      console.error("Failed to save technician mode:", err);
      showStatus("Failed to save technician mode", "error");
      // Revert toggle on error
      techModeToggle.checked = !enabled;
      updateInputsDisabledState(!enabled);
    }
  });

  // Handle logo browse button
  if (logoBrowseBtn) {
    logoBrowseBtn.addEventListener("click", async () => {
      if (!techModeToggle.checked) {
        showStatus("Enable technician mode first", "error");
        return;
      }

      try {
        // Open file dialog to select image
        const { open } = window.__TAURI__.dialog;
        const selected = await open({
          title: "Select Business Logo",
          multiple: false,
          filters: [
            {
              name: "Image Files",
              extensions: [
                "png",
                "jpg",
                "jpeg",
                "gif",
                "bmp",
                "webp",
                "svg",
                "ico",
              ],
            },
          ],
        });

        if (selected) {
          // Convert image to base64 data URL
          showStatus("Loading logo...", "success");

          const dataUrl = await invoke("read_image_as_data_url", {
            path: selected,
          });

          // Store base64 data URL directly
          logoInput.value = dataUrl;

          // Auto-save logo
          await saveBusinessField("logo", dataUrl);

          // Show confirmation with file size info
          const sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
          showStatus(`Logo loaded and saved (${sizeKB} KB)`, "success");
        }
      } catch (err) {
        console.error("Failed to load logo:", err);
        showStatus("Failed to load logo image", "error");
      }
    });
  }

  // Auto-save handlers for all business fields
  nameInput?.addEventListener("blur", async () => {
    await saveBusinessField("name", nameInput.value.trim());
  });

  addressInput?.addEventListener("blur", async () => {
    await saveBusinessField("address", addressInput.value.trim());
  });

  phoneInput?.addEventListener("blur", async () => {
    await saveBusinessField("phone", phoneInput.value.trim());
  });

  emailInput?.addEventListener("blur", async () => {
    await saveBusinessField("email", emailInput.value.trim());
  });

  websiteInput?.addEventListener("blur", async () => {
    await saveBusinessField("website", websiteInput.value.trim());
  });

  tfnInput?.addEventListener("blur", async () => {
    await saveBusinessField("tfn", tfnInput.value.trim());
  });

  abnInput?.addEventListener("blur", async () => {
    await saveBusinessField("abn", abnInput.value.trim());
  });

  /**
   * Render the list of technician names
   * @param {string[]} names - Array of technician names
   */
  function renderTechnicianNames(names) {
    if (!techNamesList) return;

    if (names.length === 0) {
      techNamesList.innerHTML =
        '<p class="muted" style="font-size: 0.9rem;">No technician names added yet.</p>';
      return;
    }

    techNamesList.innerHTML = names
      .map(
        (name, index) => `
        <div class="row" style="padding: 8px 12px;">
          <div class="main">
            <span class="name">${escapeHtml(name)}</span>
          </div>
          <button type="button" class="ghost" data-tech-index="${index}" style="padding: 4px 12px; min-height: auto;">
            Remove
          </button>
        </div>
      `
      )
      .join("");

    // Attach remove handlers
    techNamesList.querySelectorAll("button[data-tech-index]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = parseInt(btn.dataset.techIndex, 10);
        await removeTechnicianName(index);
      });
    });
  }

  /**
   * Add a technician name
   * @param {string} name - The name to add
   */
  async function addTechnicianName(name) {
    try {
      const business = await settingsManager.get("business");
      const names = business.technician_names || [];

      // Check for duplicates
      if (names.includes(name)) {
        showStatus("This name already exists", "error");
        return;
      }

      names.push(name);
      await settingsManager.set("business.technician_names", names, true);

      renderTechnicianNames(names);
      showStatus("Technician name added", "success");
    } catch (err) {
      console.error("Failed to add technician name:", err);
      showStatus("Failed to add name", "error");
    }
  }

  /**
   * Remove a technician name by index
   * @param {number} index - The index of the name to remove
   */
  async function removeTechnicianName(index) {
    try {
      const business = await settingsManager.get("business");
      const names = business.technician_names || [];

      names.splice(index, 1);
      await settingsManager.set("business.technician_names", names, true);

      renderTechnicianNames(names);
      showStatus("Technician name removed", "success");
    } catch (err) {
      console.error("Failed to remove technician name:", err);
      showStatus("Failed to remove name", "error");
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Handle technician name form submission
  if (techNameForm && techNameInput) {
    techNameForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = techNameInput.value.trim();
      if (!name) return;

      await addTechnicianName(name);
      techNameInput.value = "";
    });
  }
}
