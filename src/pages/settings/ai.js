/**
 * AI/API settings management for the settings page.
 */

const { invoke } = window.__TAURI__.core || {};

/**
 * Initializes the AI settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeAISettings(root) {
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

  const form = root.querySelector("#openai-settings-form");
  const input = root.querySelector("#openai-api-key-input");
  const status = root.querySelector("#openai-settings-status");

  // Ensure container for AI keys
  if (!appSettings.ai) appSettings.ai = {};

  // Populate current value (mask for security)
  const currentKey = appSettings.ai.openai_api_key || "";
  if (currentKey && input) {
    // Show masked version
    input.value = "sk-..." + currentKey.slice(-4);
    input.dataset.hasKey = "true";
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = (input.value || "").toString().trim();

    // Don't save if it's the masked placeholder
    if (value.startsWith("sk-...") && input.dataset.hasKey === "true") {
      if (status) {
        status.className = "settings-status";
        status.textContent = "No changes made (key already set).";
        setTimeout(() => {
          status.textContent = "";
          status.className = "";
        }, 3000);
      }
      return;
    }

    appSettings.ai.openai_api_key = value;

    try {
      await saveSettings();
      if (status) {
        status.className = "settings-status success";
        status.textContent = value
          ? "✓ Saved. OpenAI API key updated."
          : "✓ Saved. OpenAI API key cleared.";

        // Update input to masked value
        if (value) {
          input.value = "sk-..." + value.slice(-4);
          input.dataset.hasKey = "true";
        } else {
          input.value = "";
          input.dataset.hasKey = "false";
        }

        setTimeout(() => {
          status.textContent = "";
          status.className = "";
        }, 3000);
      }

      // Dispatch event so other parts of the app can react
      const event = new CustomEvent("ai-settings-updated", {
        detail: { hasKey: Boolean(value) },
      });
      dispatchEvent(event);
    } catch (e) {
      if (status) {
        status.className = "settings-status error";
        status.textContent = "✕ Failed to save settings.";
      }
      console.error(e);
    }
  });

  // Clear button
  const clearBtn = root.querySelector("#openai-api-key-clear-btn");
  clearBtn?.addEventListener("click", () => {
    if (input) {
      input.value = "";
      input.dataset.hasKey = "false";
      input.focus();
    }
  });
}
