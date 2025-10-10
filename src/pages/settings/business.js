/**
 * Business settings management for technician mode, logo, and business name.
 */

import { clearBusinessCache } from "../../utils/business.js";

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
  const saveBtn = root.querySelector("#business-settings-save");
  const statusEl = root.querySelector("#business-settings-status");

  // Get category containers for opacity control
  const categories = [
    root.querySelector("#branding-category"),
    root.querySelector("#contact-category"),
    root.querySelector("#identification-category"),
  ].filter(Boolean);

  if (!techModeToggle || !logoInput || !nameInput || !saveBtn) {
    console.warn("Business settings UI elements not found");
    return;
  }

  // Load current settings
  try {
    const settings = await invoke("load_app_settings");
    const business = settings.business || {};

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
    saveBtn.disabled = !enabled;

    // Visual styling for disabled state - apply to category containers
    const opacity = enabled ? "1" : "0.5";
    categories.forEach((category) => {
      if (category) category.style.opacity = opacity;
    });
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
      const settings = await invoke("load_app_settings");
      settings.business = settings.business || {};
      settings.business.technician_mode = enabled;
      await invoke("save_app_settings", { data: settings });
      clearBusinessCache(); // Clear cache to force refresh elsewhere
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

          // Show confirmation with file size info
          const sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
          showStatus(`Logo loaded (${sizeKB} KB)`, "success");
        }
      } catch (err) {
        console.error("Failed to load logo:", err);
        showStatus("Failed to load logo image", "error");
      }
    });
  }

  // Handle save button
  saveBtn.addEventListener("click", async () => {
    if (!techModeToggle.checked) {
      showStatus("Enable technician mode first", "error");
      return;
    }

    // Collect all field values
    const logo = logoInput.value.trim();
    const name = nameInput.value.trim();
    const address = addressInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const website = websiteInput.value.trim();
    const tfn = tfnInput.value.trim();
    const abn = abnInput.value.trim();

    try {
      const settings = await invoke("load_app_settings");
      settings.business = settings.business || {};
      settings.business.technician_mode = techModeToggle.checked;
      settings.business.logo = logo;
      settings.business.name = name;
      settings.business.address = address;
      settings.business.phone = phone;
      settings.business.email = email;
      settings.business.website = website;
      settings.business.tfn = tfn;
      settings.business.abn = abn;

      await invoke("save_app_settings", { data: settings });
      clearBusinessCache(); // Clear cache to force refresh elsewhere
      showStatus("Business settings saved", "success");
    } catch (err) {
      console.error("Failed to save business settings:", err);
      showStatus("Failed to save settings", "error");
    }
  });

  // Allow Enter key in inputs to trigger save
  [
    logoInput,
    nameInput,
    addressInput,
    phoneInput,
    emailInput,
    websiteInput,
    tfnInput,
    abnInput,
  ].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && techModeToggle.checked) {
        e.preventDefault();
        saveBtn.click();
      }
    });
  });
}
