/**
 * Sentry settings management for error tracking and performance monitoring.
 */

const { invoke } = window.__TAURI__.core || {};

/**
 * Initializes the Sentry settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeSentrySettings(root) {
  if (!root || !invoke) return;

  const sentryEnabledToggle = root.querySelector("#sentry-enabled-toggle");
  const sentryPiiToggle = root.querySelector("#sentry-pii-toggle");
  const sentryPerformanceToggle = root.querySelector(
    "#sentry-performance-toggle"
  );
  const sentrySystemInfoToggle = root.querySelector(
    "#sentry-system-info-toggle"
  );
  const statusEl = root.querySelector("#sentry-settings-status");

  if (!sentryEnabledToggle) {
    console.warn("Sentry settings UI elements not found");
    return;
  }

  let appSettings = {};

  /**
   * Load current settings from backend.
   */
  async function loadSettings() {
    try {
      appSettings = await invoke("load_app_settings");
    } catch (err) {
      console.error("Failed to load Sentry settings:", err);
      appSettings = {};
    }
  }

  /**
   * Save settings to backend.
   */
  async function saveSettings() {
    try {
      await invoke("save_app_settings", { data: appSettings });
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  }

  /**
   * Show status message to user.
   * @param {string} message - Status message to display.
   * @param {"success"|"error"} type - Type of status message.
   */
  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.className = `settings-status ${type}`;
    statusEl.textContent = message;
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
    }, 3000);
  }

  // Load current settings
  await loadSettings();

  // Ensure sentry object exists
  if (!appSettings.sentry) appSettings.sentry = {};

  // Set toggle states (default to true if not set)
  sentryEnabledToggle.checked = appSettings.sentry_enabled !== false;
  sentryPiiToggle.checked = appSettings.sentry.send_default_pii !== false;
  sentryPerformanceToggle.checked =
    appSettings.sentry.traces_sample_rate !== 0.0;
  sentrySystemInfoToggle.checked =
    appSettings.sentry.send_system_info !== false;

  /**
   * Update disabled state of sub-toggles based on master toggle.
   */
  function updateSubTogglesState() {
    const masterEnabled = sentryEnabledToggle.checked;
    sentryPiiToggle.disabled = !masterEnabled;
    sentryPerformanceToggle.disabled = !masterEnabled;
    sentrySystemInfoToggle.disabled = !masterEnabled;

    // Visual indication when disabled
    const labels = [
      sentryPiiToggle.closest("label"),
      sentryPerformanceToggle.closest("label"),
      sentrySystemInfoToggle.closest("label"),
    ];
    labels.forEach((label) => {
      if (label) {
        label.style.opacity = masterEnabled ? "1" : "0.5";
        label.style.cursor = masterEnabled ? "pointer" : "not-allowed";
      }
    });
  }

  // Initial state
  updateSubTogglesState();

  // Listen for changes on master toggle
  sentryEnabledToggle.addEventListener("change", async () => {
    appSettings.sentry_enabled = sentryEnabledToggle.checked;
    updateSubTogglesState();
    await saveSettings();
  });

  // Listen for changes on PII toggle
  sentryPiiToggle.addEventListener("change", async () => {
    appSettings.sentry.send_default_pii = sentryPiiToggle.checked;
    await saveSettings();
  });

  // Listen for changes on performance toggle
  sentryPerformanceToggle.addEventListener("change", async () => {
    // Convert boolean to traces_sample_rate (1.0 = enabled, 0.0 = disabled)
    appSettings.sentry.traces_sample_rate = sentryPerformanceToggle.checked
      ? 1.0
      : 0.0;
    await saveSettings();
  });

  // Listen for changes on system info toggle
  sentrySystemInfoToggle.addEventListener("change", async () => {
    appSettings.sentry.send_system_info = sentrySystemInfoToggle.checked;
    await saveSettings();
  });
}
