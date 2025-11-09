/**
 * Network settings management (e.g., iperf server) for the settings page.
 */

import validator from "validator";
import { settingsManager } from "../../utils/settings-manager.js";

const { invoke } = window.__TAURI__.core || {};

/**
 * Initializes the Network settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeNetworkSettings(root) {
  if (!root || !invoke) return;

  const input = root.querySelector("#iperf-server-input");
  const status = root.querySelector("#iperf-settings-status");

  const pingInput = root.querySelector("#ping-host-input");
  const pingStatus = root.querySelector("#ping-settings-status");

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
      statusElement.style.display = "inline-block";
      setTimeout(() => {
        statusElement.textContent = "";
        statusElement.className = "";
        statusElement.style.display = "none";
      }, 4000);
    }
  }

  // Load current values
  const network = await settingsManager.get("network");
  input.value = network.iperf_server || "";
  if (pingInput) pingInput.value = network.ping_host || "8.8.8.8";

  // iPerf server auto-save on blur
  input?.addEventListener("blur", async () => {
    const value = (input.value || "").toString().trim();

    // Validate the input
    if (!isValidIPOrEmpty(value, true)) {
      showValidationError(status, "iPerf server");
      return;
    }

    try {
      await settingsManager.set("network.iperf_server", value, true);
      if (status) {
        status.className = "settings-status success";
        status.textContent = value
          ? `✓ Saved. Using ${value} as iPerf server.`
          : "✓ Saved. iPerf server cleared.";
        status.style.display = "inline-block";
        setTimeout(() => {
          status.textContent = "";
          status.className = "";
          status.style.display = "none";
        }, 3000);
      }
      dispatchEvent(new Event("network-settings-updated"));
    } catch (e) {
      if (status) {
        status.className = "settings-status error";
        status.textContent = "✕ Failed to save settings.";
        status.style.display = "inline-block";
        setTimeout(() => {
          status.textContent = "";
          status.className = "";
          status.style.display = "none";
        }, 3000);
      }
      console.error(e);
    }
  });

  // Ping host auto-save on blur
  pingInput?.addEventListener("blur", async () => {
    const value = (pingInput.value || "").toString().trim() || "8.8.8.8";

    // Validate the input (ping host should not be empty)
    if (!isValidIPOrEmpty(value, false)) {
      showValidationError(pingStatus, "Ping host");
      return;
    }

    try {
      await settingsManager.set("network.ping_host", value, true);
      if (pingStatus) {
        pingStatus.className = "settings-status success";
        pingStatus.textContent = `✓ Saved. Using ${value} as Ping host.`;
        pingStatus.style.display = "inline-block";
        setTimeout(() => {
          pingStatus.textContent = "";
          pingStatus.className = "";
          pingStatus.style.display = "none";
        }, 3000);
      }
      dispatchEvent(new Event("network-settings-updated"));
    } catch (e) {
      if (pingStatus) {
        pingStatus.className = "settings-status error";
        pingStatus.textContent = "✕ Failed to save settings.";
        pingStatus.style.display = "inline-block";
        setTimeout(() => {
          pingStatus.textContent = "";
          pingStatus.className = "";
          pingStatus.style.display = "none";
        }, 3000);
      }
      console.error(e);
    }
  });
}
