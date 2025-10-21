/**
 * Reports settings management for auto-save and other report preferences.
 */

import {
  NOTIFICATION_SOUNDS,
  getSoundById,
  ensureToneStarted,
} from "../../utils/notification-sounds.js";

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
  const soundSelect = root.querySelector("#reports-sound-select");
  const soundTestBtn = root.querySelector("#reports-sound-test-btn");
  const soundRepeat = root.querySelector("#reports-sound-repeat");
  const statusEl = root.querySelector("#reports-settings-status");

  if (!autoSaveToggle) {
    console.warn("Reports settings UI elements not found");
    return;
  }

  // Populate sound options
  if (soundSelect) {
    // Clear default option
    soundSelect.innerHTML = "";
    // Add all available sounds
    NOTIFICATION_SOUNDS.forEach((sound) => {
      const option = document.createElement("option");
      option.value = sound.id;
      option.textContent = sound.name;
      soundSelect.appendChild(option);
    });
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
    if (soundSelect) {
      const selectedSound = reports.sound_id || "classic-beep";
      soundSelect.value = selectedSound;
    }
    if (soundRepeat) {
      const rep = Number.isFinite(reports.sound_repeat)
        ? Math.max(1, Math.min(10, Number(reports.sound_repeat)))
        : 1;
      soundRepeat.value = String(rep);
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

  /**
   * Test the selected sound by playing it
   */
  async function testSelectedSound() {
    if (!soundSelect) return;

    const soundId = soundSelect.value;
    const sound = getSoundById(soundId);

    if (!sound) {
      showStatus("Sound not found", "error");
      return;
    }

    if (soundTestBtn) {
      soundTestBtn.disabled = true;
      soundTestBtn.innerHTML =
        '<i class="ph ph-speaker-high" aria-hidden="true"></i> <span>Playing...</span>';
    }

    try {
      // Import Tone.js
      let Tone;
      try {
        const mod = await import("tone");
        Tone = mod?.default || mod;
      } catch (e) {
        console.warn("Tone.js not available:", e);
        showStatus("Audio library not available", "error");
        return;
      }

      // Ensure audio is unlocked
      await ensureToneStarted(Tone);

      // Get current volume from slider and repeat count
      const volumePct = soundVolume ? Number(soundVolume.value) : 80;
      const repeat = soundRepeat
        ? Math.max(1, Math.min(10, Number(soundRepeat.value)))
        : 1;

      // Play N times sequentially
      for (let i = 0; i < repeat; i++) {
        await sound.play(Tone, volumePct);
      }

      showStatus(`Played: ${sound.name}`, "success");
    } catch (e) {
      console.error("Error playing sound:", e);
      showStatus("Failed to play sound", "error");
    } finally {
      if (soundTestBtn) {
        soundTestBtn.disabled = false;
        soundTestBtn.innerHTML =
          '<i class="ph ph-speaker-high" aria-hidden="true"></i> <span>Test</span>';
      }
    }
  }

  // Handle test button click
  if (soundTestBtn) {
    soundTestBtn.addEventListener("click", testSelectedSound);
  }

  // Handle sound select change
  if (soundSelect) {
    soundSelect.addEventListener("change", async () => {
      const selectedSoundId = soundSelect.value;
      try {
        const settings = await invoke("load_app_settings");
        settings.reports = settings.reports || {};
        settings.reports.sound_id = selectedSoundId;
        await invoke("save_app_settings", { data: settings });
        const sound = getSoundById(selectedSoundId);
        showStatus(
          sound ? `Sound changed to: ${sound.name}` : "Sound selection saved",
          "success"
        );
      } catch (err) {
        console.error("Failed to save sound selection:", err);
        showStatus("Failed to save sound selection", "error");
      }
    });
  }

  // Handle repeat count change
  if (soundRepeat) {
    soundRepeat.addEventListener("change", async () => {
      try {
        const rep = Math.max(1, Math.min(10, Number(soundRepeat.value)));
        const settings = await invoke("load_app_settings");
        settings.reports = settings.reports || {};
        settings.reports.sound_repeat = rep;
        await invoke("save_app_settings", { data: settings });
        showStatus("Repeat count saved", "success");
      } catch (err) {
        console.error("Failed to save repeat count:", err);
        showStatus("Failed to save repeat count", "error");
      }
    });
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
