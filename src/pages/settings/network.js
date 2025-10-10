/**
 * Network settings management (e.g., iperf server) for the settings page.
 */

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

  // Populate current value
  input.value = appSettings.network.iperf_server || "";
  if (!appSettings.network.ping_host) appSettings.network.ping_host = "8.8.8.8";
  if (pingInput) pingInput.value = appSettings.network.ping_host || "8.8.8.8";

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = (input.value || "").toString().trim();
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
