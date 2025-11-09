/**
 * Sentry settings management for error tracking and performance monitoring.
 */

import { settingsManager } from "../../utils/settings-manager.js";

const { invoke } = window.__TAURI__.core || {};

/**
 * Initializes the Sentry settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeSentrySettings(root) {
  if (!root || !invoke) return;

  const sentryEnabledToggle = root.querySelector("#sentry-enabled-toggle");
  const sentryEnvironmentSelect = root.querySelector(
    "#sentry-environment-select"
  );
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

  /**
   * Show status message to user.
   * @param {string} message - Status message to display.
   * @param {"success"|"error"} type - Type of status message.
   */
  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.className = `settings-status ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = "inline-block";
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
      statusEl.style.display = "none";
    }, 3000);
  }

  // Load current settings
  const sentryEnabled = await settingsManager.get("sentry_enabled");
  const sentry = await settingsManager.get("sentry");

  // Set toggle states (default to true if not set)
  sentryEnabledToggle.checked = sentryEnabled !== false;
  sentryPiiToggle.checked = sentry.send_default_pii !== false;
  sentryPerformanceToggle.checked = sentry.traces_sample_rate !== 0.0;
  sentrySystemInfoToggle.checked = sentry.send_system_info !== false;

  // Set environment (default to production for fresh users)
  const currentEnvironment = sentry.environment || "production";
  sentryEnvironmentSelect.value = currentEnvironment;

  /**
   * Update disabled state of sub-toggles based on master toggle.
   */
  function updateSubTogglesState() {
    const masterEnabled = sentryEnabledToggle.checked;
    sentryEnvironmentSelect.disabled = !masterEnabled;
    sentryPiiToggle.disabled = !masterEnabled;
    sentryPerformanceToggle.disabled = !masterEnabled;
    sentrySystemInfoToggle.disabled = !masterEnabled;

    // Visual indication when disabled
    const labels = [
      sentryEnvironmentSelect.closest("label"),
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
    try {
      await settingsManager.set(
        "sentry_enabled",
        sentryEnabledToggle.checked,
        true
      );
      updateSubTogglesState();
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  });

  // Listen for changes on environment select
  sentryEnvironmentSelect.addEventListener("change", async () => {
    try {
      await settingsManager.set(
        "sentry.environment",
        sentryEnvironmentSelect.value,
        true
      );
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  });

  // Listen for changes on PII toggle
  sentryPiiToggle.addEventListener("change", async () => {
    try {
      await settingsManager.set(
        "sentry.send_default_pii",
        sentryPiiToggle.checked,
        true
      );
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  });

  // Listen for changes on performance toggle
  sentryPerformanceToggle.addEventListener("change", async () => {
    try {
      // Convert boolean to traces_sample_rate (1.0 = enabled, 0.0 = disabled)
      const tracesSampleRate = sentryPerformanceToggle.checked ? 1.0 : 0.0;
      await settingsManager.set(
        "sentry.traces_sample_rate",
        tracesSampleRate,
        true
      );
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  });

  // Listen for changes on system info toggle
  sentrySystemInfoToggle.addEventListener("change", async () => {
    try {
      await settingsManager.set(
        "sentry.send_system_info",
        sentrySystemInfoToggle.checked,
        true
      );
      showStatus("✓ Sentry settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save Sentry settings:", err);
      showStatus("✕ Failed to save Sentry settings", "error");
    }
  });
}
