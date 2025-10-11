/**
 * Reports settings management for auto-save and other report preferences.
 */

const { invoke } = window.__TAURI__.core;

/**
 * Initialize reports settings UI and load saved values.
 * @param {HTMLElement} root - The settings page root element.
 */
export async function initializeReportsSettings(root) {
  const autoSaveToggle = root.querySelector("#reports-autosave-toggle");
  const statusEl = root.querySelector("#reports-settings-status");

  if (!autoSaveToggle) {
    console.warn("Reports settings UI elements not found");
    return;
  }

  // Load current settings
  try {
    const settings = await invoke("load_app_settings");
    const reports = settings.reports || {};

    // Set toggle state (default to false if not set)
    autoSaveToggle.checked = reports.auto_save === true;
  } catch (err) {
    console.error("Failed to load reports settings:", err);
    showStatus("Failed to load settings", "error");
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

  // Handle auto-save toggle
  autoSaveToggle.addEventListener("change", async () => {
    const enabled = autoSaveToggle.checked;

    // Save auto-save state
    try {
      const settings = await invoke("load_app_settings");
      settings.reports = settings.reports || {};
      settings.reports.auto_save = enabled;
      await invoke("save_app_settings", { data: settings });
      showStatus(
        enabled
          ? "Auto-save enabled - reports will save automatically"
          : "Auto-save disabled - save reports manually",
        "success"
      );
    } catch (err) {
      console.error("Failed to save auto-save setting:", err);
      showStatus("Failed to save setting", "error");
      // Revert toggle on error
      autoSaveToggle.checked = !enabled;
    }
  });
}
