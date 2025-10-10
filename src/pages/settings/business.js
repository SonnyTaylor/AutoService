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
  const nameInput = root.querySelector("#business-name-input");
  const saveBtn = root.querySelector("#business-settings-save");
  const statusEl = root.querySelector("#business-settings-status");
  const logoLabel = root.querySelector("#business-logo-label");
  const nameLabel = root.querySelector("#business-name-label");

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

    // Apply initial disabled state
    updateInputsDisabledState(techModeEnabled);
  } catch (err) {
    console.error("Failed to load business settings:", err);
    showStatus("Failed to load settings", "error");
  }

  /**
   * Update the disabled state of logo and name inputs based on technician mode.
   * @param {boolean} enabled - Whether technician mode is enabled.
   */
  function updateInputsDisabledState(enabled) {
    logoInput.disabled = !enabled;
    nameInput.disabled = !enabled;
    saveBtn.disabled = !enabled;

    // Visual styling for disabled state
    const opacity = enabled ? "1" : "0.5";
    if (logoLabel) logoLabel.style.opacity = opacity;
    if (nameLabel) nameLabel.style.opacity = opacity;
  }

  /**
   * Show status message to user.
   * @param {string} message - Message to display.
   * @param {"success" | "error"} [type="success"] - Status type.
   */
  function showStatus(message, type = "success") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = type === "error" ? "#ff6b6b" : "#51cf66";
    setTimeout(() => {
      statusEl.textContent = "";
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

  // Handle save button
  saveBtn.addEventListener("click", async () => {
    if (!techModeToggle.checked) {
      showStatus("Enable technician mode first", "error");
      return;
    }

    const logo = logoInput.value.trim();
    const name = nameInput.value.trim();

    try {
      const settings = await invoke("load_app_settings");
      settings.business = settings.business || {};
      settings.business.technician_mode = techModeToggle.checked;
      settings.business.logo = logo;
      settings.business.name = name;

      await invoke("save_app_settings", { data: settings });
      clearBusinessCache(); // Clear cache to force refresh elsewhere
      showStatus("Business settings saved", "success");
    } catch (err) {
      console.error("Failed to save business settings:", err);
      showStatus("Failed to save settings", "error");
    }
  });

  // Allow Enter key in inputs to trigger save
  [logoInput, nameInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && techModeToggle.checked) {
        e.preventDefault();
        saveBtn.click();
      }
    });
  });
}
