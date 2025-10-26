/**
 * Network settings management (e.g., iperf server) for the settings page.
 */

import validator from "validator";
const { invoke } = window.__TAURI__.core || {};

/**
 * Initializes the Network settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeNetworkSettings(root) {
  if (!root || !invoke) return;

  let appSettings = {};

  async function loadSettings() {
    try {
      appSettings = await invoke("load_app_settings");
    } catch {
      appSettings = {};
    }
  }

  function saveSettings() {
    return invoke("save_app_settings", { data: appSettings });
  }

  await loadSettings();

  const form = root.querySelector("#iperf-settings-form");
  const input = root.querySelector("#iperf-server-input");
  const status = root.querySelector("#iperf-settings-status");

  const pingForm = root.querySelector("#ping-settings-form");
  const pingInput = root.querySelector("#ping-host-input");
  const pingStatus = root.querySelector("#ping-settings-status");

  // Ensure container for future network keys
  if (!appSettings.network) appSettings.network = {};

  /**
   * Validates if a value is a valid IPv4 or IPv6 address, or empty (for optional fields)
   * @param {string} value - The value to validate
   * @param {boolean} allowEmpty - Whether to allow empty values
   * @returns {boolean} - True if valid or empty (if allowed)
   */
  function isValidIPOrEmpty(value, allowEmpty = true) {
    if (allowEmpty && (!value || value.trim() === "")) {
      return true;
    }
    return validator.isIP(value.trim());
  }

  /**
   * Shows validation error message
   * @param {HTMLElement} statusElement - The status element to update
   * @param {string} fieldName - The name of the field being validated
   */
  function showValidationError(statusElement, fieldName) {
    if (statusElement) {
      statusElement.className = "settings-status error";
      statusElement.textContent = `✕ Please enter a valid IPv4 or IPv6 address for ${fieldName}.`;
      setTimeout(() => {
        statusElement.textContent = "";
        statusElement.className = "";
      }, 4000);
    }
  }

  // Populate current value
  input.value = appSettings.network.iperf_server || "";
  if (!appSettings.network.ping_host) appSettings.network.ping_host = "8.8.8.8";
  if (pingInput) pingInput.value = appSettings.network.ping_host || "8.8.8.8";

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = (input.value || "").toString().trim();

    // Validate the input
    if (!isValidIPOrEmpty(value, true)) {
      showValidationError(status, "iPerf server");
      return;
    }

    appSettings.network.iperf_server = value;
    try {
      await saveSettings();
      if (status) {
        status.className = "settings-status success";
        status.textContent = value
          ? `✓ Saved. Using ${value} as iPerf server.`
          : "✓ Saved. iPerf server cleared.";
        setTimeout(() => {
          status.textContent = "";
          status.className = "";
        }, 3000);
      }
      dispatchEvent(new Event("network-settings-updated"));
    } catch (e) {
      if (status) {
        status.className = "settings-status error";
        status.textContent = "✕ Failed to save settings.";
      }
      console.error(e);
    }
  });

  pingForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = (pingInput?.value || "").toString().trim() || "8.8.8.8";

    // Validate the input (ping host should not be empty)
    if (!isValidIPOrEmpty(value, false)) {
      showValidationError(pingStatus, "Ping host");
      return;
    }

    appSettings.network.ping_host = value;
    try {
      await saveSettings();
      if (pingStatus) {
        pingStatus.className = "settings-status success";
        pingStatus.textContent = `✓ Saved. Using ${value} as Ping host.`;
        setTimeout(() => {
          pingStatus.textContent = "";
          pingStatus.className = "";
        }, 3000);
      }
      dispatchEvent(new Event("network-settings-updated"));
    } catch (e) {
      if (pingStatus) {
        pingStatus.className = "settings-status error";
        pingStatus.textContent = "✕ Failed to save settings.";
      }
      console.error(e);
    }
  });
}
