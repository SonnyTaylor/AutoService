/**
 * AI/API settings management for the settings page.
 */

import { settingsManager } from "../../utils/settings-manager.js";

const { invoke } = window.__TAURI__.core || {};

/**
 * Model options for each provider
 */
const PROVIDER_MODELS = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (Recommended)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Cheap)" },
    { value: "gpt-4-turbo-preview", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Latest)" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  xai: [
    { value: "grok-2-latest", label: "Grok 2 (Latest)" },
    { value: "grok-2-1212", label: "Grok 2 (Dec 2024)" },
    { value: "grok-beta", label: "Grok Beta" },
  ],
  azure: [
    { value: "gpt-4o", label: "GPT-4o (Azure)" },
    { value: "gpt-4", label: "GPT-4 (Azure)" },
    { value: "gpt-35-turbo", label: "GPT-3.5 Turbo (Azure)" },
  ],
  google: [
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-pro", label: "Gemini Pro" },
  ],
  ollama: [
    { value: "llama3.2", label: "Llama 3.2" },
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "mistral", label: "Mistral" },
    { value: "mixtral", label: "Mixtral" },
    { value: "phi3", label: "Phi-3" },
    { value: "qwen2.5", label: "Qwen 2.5" },
  ],
};

/**
 * Provider information and hints
 */
const PROVIDER_INFO = {
  openai: {
    hint: 'Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>',
    showBaseUrl: false,
  },
  anthropic: {
    hint: 'Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>',
    showBaseUrl: false,
  },
  groq: {
    hint: 'Get your API key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com</a>',
    showBaseUrl: false,
  },
  xai: {
    hint: 'Get your API key from <a href="https://console.x.ai/" target="_blank" rel="noopener">console.x.ai</a>',
    showBaseUrl: false,
  },
  azure: {
    hint: "Enter your Azure OpenAI API key and configure deployment in base URL",
    showBaseUrl: true,
  },
  google: {
    hint: 'Get your API key from <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>',
    showBaseUrl: false,
  },
  ollama: {
    hint: "Ollama runs locally. Make sure Ollama is running on your machine.",
    showBaseUrl: true,
  },
};

/**
 * Populate model dropdown based on selected provider
 */
function populateModelDropdown(provider, currentModel) {
  const modelSelect = document.getElementById("ai-model-select");
  if (!modelSelect) return;

  const models = PROVIDER_MODELS[provider] || [];
  modelSelect.innerHTML = "";

  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label;
    if (model.value === currentModel) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  });

  // If current model isn't in the list, add it as custom
  if (currentModel && !models.find((m) => m.value === currentModel)) {
    const option = document.createElement("option");
    option.value = currentModel;
    option.textContent = `${currentModel} (Custom)`;
    option.selected = true;
    modelSelect.appendChild(option);
  }
}

/**
 * Update UI based on selected provider
 */
function updateProviderUI(provider) {
  const info = PROVIDER_INFO[provider] || PROVIDER_INFO.openai;
  const hintElement = document.getElementById("ai-provider-hint");
  const baseUrlLabel = document.getElementById("ai-base-url-label");

  if (hintElement) {
    hintElement.innerHTML = info.hint;
  }

  if (baseUrlLabel) {
    baseUrlLabel.style.display = info.showBaseUrl ? "block" : "none";
  }
}

/**
 * Initializes the AI settings pane.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeAISettings(root) {
  if (!root || !invoke) return;

  const form = root.querySelector("#ai-settings-form");
  const providerSelect = root.querySelector("#ai-provider-select");
  const modelSelect = root.querySelector("#ai-model-select");
  const apiKeyInput = root.querySelector("#ai-api-key-input");
  const baseUrlInput = root.querySelector("#ai-base-url-input");
  const status = root.querySelector("#ai-settings-status");

  // Load current settings
  const ai = await settingsManager.get("ai");
  const currentProvider = ai.provider || "openai";
  const currentModel = ai.model || "gpt-4o-mini";
  const currentKey = ai.api_key || ai.openai_api_key || ""; // Backward compatibility
  const currentBaseUrl = ai.base_url || "";

  // Set provider
  if (providerSelect) {
    providerSelect.value = currentProvider;
  }

  // Populate models and set current
  populateModelDropdown(currentProvider, currentModel);

  // Set base URL
  if (baseUrlInput) {
    baseUrlInput.value = currentBaseUrl;
  }

  // Update UI for current provider
  updateProviderUI(currentProvider);

  // Show masked API key
  if (currentKey && apiKeyInput) {
    const maskedKey = currentKey.substring(0, 3) + "..." + currentKey.slice(-4);
    apiKeyInput.value = maskedKey;
    apiKeyInput.dataset.hasKey = "true";
  }

  // Provider change handler
  providerSelect?.addEventListener("change", async (e) => {
    const provider = e.target.value;
    updateProviderUI(provider);

    // Load default model for provider
    const models = PROVIDER_MODELS[provider] || [];
    const defaultModel = models.length > 0 ? models[0].value : "";
    populateModelDropdown(provider, defaultModel);

    // Load base URL for this provider if saved
    const ai = await settingsManager.get("ai");
    if (baseUrlInput) {
      baseUrlInput.value = ai.base_url || "";
    }
  });

  // Form submit handler
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const provider = providerSelect?.value || "openai";
    const model = modelSelect?.value || "gpt-4o-mini";
    const apiKey = apiKeyInput?.value?.trim() || "";
    const baseUrl = baseUrlInput?.value?.trim() || "";

    // Don't save if it's the masked placeholder
    if (apiKey.includes("...") && apiKeyInput.dataset.hasKey === "true") {
      if (status) {
        status.className = "settings-status";
        status.textContent = "No changes made to API key.";
        setTimeout(() => {
          status.textContent = "";
          status.className = "";
        }, 3000);
      }
      // Still save other fields
      try {
        await settingsManager.batch((draft) => {
          draft.ai.provider = provider;
          draft.ai.model = model;
          draft.ai.base_url = baseUrl;
        });
      } catch (e) {
        console.error("Failed to save AI settings:", e);
      }
      return;
    }

    try {
      // Batch save all AI settings
      await settingsManager.batch((draft) => {
        draft.ai.provider = provider;
        draft.ai.model = model;
        draft.ai.api_key = apiKey;
        draft.ai.base_url = baseUrl;
        // Keep backward compatibility
        if (provider === "openai") {
          draft.ai.openai_api_key = apiKey;
        }
      });

      if (status) {
        status.className = "settings-status success";
        status.textContent = apiKey
          ? `✓ Saved. ${
              PROVIDER_INFO[provider]?.hint.includes("href")
                ? provider.charAt(0).toUpperCase() + provider.slice(1)
                : "API"
            } settings updated.`
          : "✓ Saved. API key cleared.";

        // Update input to masked value
        if (apiKey && apiKeyInput) {
          const maskedKey = apiKey.substring(0, 3) + "..." + apiKey.slice(-4);
          apiKeyInput.value = maskedKey;
          apiKeyInput.dataset.hasKey = "true";
        } else if (apiKeyInput) {
          apiKeyInput.value = "";
          apiKeyInput.dataset.hasKey = "false";
        }

        setTimeout(() => {
          status.textContent = "";
          status.className = "";
        }, 3000);
      }

      // Dispatch event so other parts of the app can react
      const event = new CustomEvent("ai-settings-updated", {
        detail: { provider, model, hasKey: Boolean(apiKey) },
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
  const clearBtn = root.querySelector("#ai-api-key-clear-btn");
  clearBtn?.addEventListener("click", () => {
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.dataset.hasKey = "false";
      apiKeyInput.focus();
    }
  });
}
