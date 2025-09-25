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

  // Ensure container for future network keys
  if (!appSettings.network) appSettings.network = {};

  // Populate current value
  input.value = appSettings.network.iperf_server || "";

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = (input.value || "").toString().trim();
    appSettings.network.iperf_server = value;
    try {
      await saveSettings();
      if (status) {
        status.textContent = value
          ? `Saved. Using ${value} as iPerf server.`
          : "Saved. iPerf server cleared.";
        setTimeout(() => (status.textContent = ""), 2500);
      }
      dispatchEvent(new Event("network-settings-updated"));
    } catch (e) {
      if (status) status.textContent = "Failed to save.";
      console.error(e);
    }
  });
}
