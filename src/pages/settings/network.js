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
   * Validates if a value is a valid IP address, hostname/FQDN, or hostname with port
   * @param {string} value - The value to validate
   * @param {boolean} allowEmpty - Whether to allow empty values
   * @returns {boolean} - True if valid or empty (if allowed)
   */
  function isValidIPOrHostname(value, allowEmpty = true) {
    if (allowEmpty && (!value || value.trim() === "")) {
      return true;
    }
    
    const trimmed = value.trim();
    
    // Check if it's an IP address (IPv4 or IPv6)
    if (validator.isIP(trimmed)) {
      return true;
    }
    
    // Check if it's a hostname with port (e.g., "iperf.example.com:5201")
    const portMatch = trimmed.match(/^(.+):(\d+)$/);
    if (portMatch) {
      const hostname = portMatch[1];
      const port = parseInt(portMatch[2], 10);
      
      // Validate port is in valid range (1-65535)
      if (port < 1 || port > 65535) {
        return false;
      }
      
      // Validate hostname part (FQDN or IP)
      return validator.isIP(hostname) || validator.isFQDN(hostname, { require_tld: false });
    }
    
    // Check if it's a valid FQDN/hostname (allow subdomains and no TLD for local networks)
    return validator.isFQDN(trimmed, { require_tld: false });
  }

  /**
   * Shows validation error message
   * @param {HTMLElement} statusElement - The status element to update
   * @param {string} fieldName - The name of the field being validated
   * @param {boolean} allowHostnames - Whether to mention hostnames in the error message
   */
  function showValidationError(statusElement, fieldName, allowHostnames = true) {
    if (statusElement) {
      statusElement.className = "settings-status error";
      const message = allowHostnames
        ? `✕ Please enter a valid IP address or hostname for ${fieldName}.`
        : `✕ Please enter a valid IPv4 or IPv6 address for ${fieldName}.`;
      statusElement.textContent = message;
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

    // Validate the input (allows IPs, hostnames, and hostnames with ports)
    if (!isValidIPOrHostname(value, true)) {
      showValidationError(status, "iPerf server", true);
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

    // Validate the input (ping host should not be empty, allows IPs and hostnames)
    if (!isValidIPOrHostname(value, false)) {
      showValidationError(pingStatus, "Ping host", true);
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
