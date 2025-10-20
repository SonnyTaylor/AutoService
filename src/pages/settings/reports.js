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
  const notificationsToggle = root.querySelector(
    "#reports-notifications-toggle"
  );
  const soundToggle = root.querySelector("#reports-sound-toggle");
  const soundVolume = root.querySelector("#reports-sound-volume");
  const soundVolumeLabel = root.querySelector("#reports-sound-volume-label");
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
    if (notificationsToggle) {
      notificationsToggle.checked = reports.notifications_enabled === true;
    }
    if (soundToggle) {
      soundToggle.checked = reports.sound_enabled === true;
    }
    if (soundVolume) {
      const vol = Number.isFinite(reports.sound_volume)
        ? Math.max(0, Math.min(100, Number(reports.sound_volume)))
        : 80;
      soundVolume.value = String(vol);
      if (soundVolumeLabel) soundVolumeLabel.textContent = `${vol}%`;
    }
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

  // Handle notifications toggle
  if (notificationsToggle) {
    notificationsToggle.addEventListener("change", async () => {
      const enabled = notificationsToggle.checked;
      try {
        const settings = await invoke("load_app_settings");
        settings.reports = settings.reports || {};
        settings.reports.notifications_enabled = enabled;
        await invoke("save_app_settings", { data: settings });
        showStatus(
          enabled
            ? "Notifications enabled - you'll get a toast when services finish"
            : "Notifications disabled",
          "success"
        );
      } catch (err) {
        console.error("Failed to save notifications setting:", err);
        showStatus("Failed to save setting", "error");
        // Revert toggle on error
        notificationsToggle.checked = !enabled;
      }
    });
  }

  // Live update volume label
  if (soundVolume) {
    soundVolume.addEventListener("input", () => {
      if (soundVolumeLabel)
        soundVolumeLabel.textContent = `${soundVolume.value}%`;
    });
  }

  // Handle sound toggle
  if (soundToggle) {
    soundToggle.addEventListener("change", async () => {
      const enabled = soundToggle.checked;
      try {
        const settings = await invoke("load_app_settings");
        settings.reports = settings.reports || {};
        settings.reports.sound_enabled = enabled;
        // Preserve volume when toggling
        if (soundVolume) {
          const vol = Math.max(0, Math.min(100, Number(soundVolume.value)));
          settings.reports.sound_volume = vol;
        }
        await invoke("save_app_settings", { data: settings });
        showStatus(
          enabled ? "Completion sound enabled" : "Completion sound disabled",
          "success"
        );
      } catch (err) {
        console.error("Failed to save sound setting:", err);
        showStatus("Failed to save setting", "error");
        soundToggle.checked = !enabled;
      }
    });
  }

  // Handle sound volume change
  if (soundVolume) {
    soundVolume.addEventListener("change", async () => {
      try {
        const vol = Math.max(0, Math.min(100, Number(soundVolume.value)));
        const settings = await invoke("load_app_settings");
        settings.reports = settings.reports || {};
        settings.reports.sound_volume = vol;
        await invoke("save_app_settings", { data: settings });
        showStatus("Sound volume saved", "success");
      } catch (err) {
        console.error("Failed to save sound volume:", err);
        showStatus("Failed to save volume", "error");
      }
    });
  }
}
