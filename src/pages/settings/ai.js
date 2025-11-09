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
 * Fetch installed models from Ollama instance
 * @param {string} baseUrl - Ollama base URL (defaults to http://localhost:11434)
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
async function fetchOllamaModels(baseUrl = "http://localhost:11434") {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.models || !Array.isArray(data.models)) {
      throw new Error("Invalid response format from Ollama API");
    }

    // Transform Ollama models into dropdown options
    return data.models.map((model) => {
      const name = model.name || "";
      const details = model.details || {};
      const paramSize = details.parameter_size || "";
      const family = details.family || "";
      
      // Create a descriptive label
      let label = name;
      if (paramSize) {
        label += ` (${paramSize}`;
        if (family) {
          label += `, ${family}`;
        }
        label += ")";
      } else if (family) {
        label += ` (${family})`;
      }
      
      return {
        value: name,
        label: label,
      };
    });
  } catch (error) {
    console.error("Failed to fetch Ollama models:", error);
    throw error;
  }
}

/**
 * Populate model dropdown based on selected provider
 * @param {string} provider - Provider name
 * @param {string} currentModel - Currently selected model
 * @param {string} baseUrl - Base URL (for Ollama)
 */
async function populateModelDropdown(provider, currentModel, baseUrl = "") {
  const modelSelect = document.getElementById("ai-model-select");
  if (!modelSelect) return;

  // Show loading state for Ollama
  if (provider === "ollama") {
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelSelect.disabled = true;
    
    try {
      const ollamaBaseUrl = baseUrl || "http://localhost:11434";
      const models = await fetchOllamaModels(ollamaBaseUrl);
      
      modelSelect.innerHTML = "";
      modelSelect.disabled = false;
      
      if (models.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No models found";
        modelSelect.appendChild(option);
        return;
      }
      
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
    } catch (error) {
      // On error, show fallback options and allow manual entry
      modelSelect.innerHTML = "";
      modelSelect.disabled = false;
      
      // Show error option
      const errorOption = document.createElement("option");
      errorOption.value = "";
      errorOption.textContent = `Error: ${error.message}`;
      modelSelect.appendChild(errorOption);
      
      // Add common Ollama models as fallback
      const fallbackModels = PROVIDER_MODELS.ollama || [];
      fallbackModels.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.value;
        option.textContent = model.label;
        if (model.value === currentModel) {
          option.selected = true;
        }
        modelSelect.appendChild(option);
      });
      
      // Always allow custom entry
      if (currentModel && !fallbackModels.find((m) => m.value === currentModel)) {
        const option = document.createElement("option");
        option.value = currentModel;
        option.textContent = `${currentModel} (Custom)`;
        option.selected = true;
        modelSelect.appendChild(option);
      }
    }
    return;
  }

  // For non-Ollama providers, use static list
  const models = PROVIDER_MODELS[provider] || [];
  modelSelect.innerHTML = "";
  modelSelect.disabled = false;

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

  const providerSelect = root.querySelector("#ai-provider-select");
  const modelSelect = root.querySelector("#ai-model-select");
  const apiKeyInput = root.querySelector("#ai-api-key-input");
  const baseUrlInput = root.querySelector("#ai-base-url-input");
  const status = root.querySelector("#ai-settings-status");

  // Load current settings
  const ai = await settingsManager.get("ai");
  const currentProvider = ai.provider || "openai";
  const currentModel = ai.model || "gpt-4o-mini";

  // Get provider-specific keys and base URLs
  const providerKeys = ai.provider_keys || {};
  const providerBaseUrls = ai.provider_base_urls || {};

  // Load current provider's key and base URL
  const currentKey =
    providerKeys[currentProvider] || ai.api_key || ai.openai_api_key || "";
  const currentBaseUrl = providerBaseUrls[currentProvider] || ai.base_url || "";

  // Set provider
  if (providerSelect) {
    providerSelect.value = currentProvider;
  }

  // Populate models and set current (async for Ollama)
  await populateModelDropdown(currentProvider, currentModel, currentBaseUrl);

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
    apiKeyInput.dataset.originalKey = currentKey; // Store for comparison
  }

  /**
   * Save AI settings with status feedback
   * @param {Object} options - Save options
   * @param {boolean} [options.suppressStatus=false] - Don't show status message
   */
  async function saveAISettings(options = {}) {
    const provider = providerSelect?.value || "openai";
    const model = modelSelect?.value || "gpt-4o-mini";
    const apiKey = apiKeyInput?.value?.trim() || "";
    const baseUrl = baseUrlInput?.value?.trim() || "";

    // Check if API key was changed (not just the masked placeholder)
    const isKeyUnchanged =
      apiKey.includes("...") && apiKeyInput?.dataset.hasKey === "true";
    const actualKey = isKeyUnchanged
      ? apiKeyInput?.dataset.originalKey || ""
      : apiKey;

    try {
      // Batch save all AI settings
      await settingsManager.batch((draft) => {
        // Ensure provider_keys and provider_base_urls objects exist
        if (!draft.ai.provider_keys) {
          draft.ai.provider_keys = {};
        }
        if (!draft.ai.provider_base_urls) {
          draft.ai.provider_base_urls = {};
        }

        // Save current provider settings
        draft.ai.provider = provider;
        draft.ai.model = model;
        draft.ai.api_key = actualKey;
        draft.ai.base_url = baseUrl;

        // Save provider-specific key and base URL
        draft.ai.provider_keys[provider] = actualKey;
        draft.ai.provider_base_urls[provider] = baseUrl;

        // Keep backward compatibility
        if (provider === "openai") {
          draft.ai.openai_api_key = actualKey;
        }
      });

      if (!options.suppressStatus && status) {
        status.className = "settings-status success";
        status.style.display = "inline-block";
        if (!isKeyUnchanged) {
          status.textContent = actualKey
            ? `✓ Saved. ${
                provider.charAt(0).toUpperCase() + provider.slice(1)
              } settings updated.`
            : "✓ Saved. API key cleared.";
        } else {
          status.textContent = `✓ Saved. Settings updated.`;
        }

        // Update input to masked value
        if (actualKey && apiKeyInput) {
          const maskedKey =
            actualKey.substring(0, 3) + "..." + actualKey.slice(-4);
          apiKeyInput.value = maskedKey;
          apiKeyInput.dataset.hasKey = "true";
          apiKeyInput.dataset.originalKey = actualKey;
        } else if (apiKeyInput) {
          apiKeyInput.value = "";
          apiKeyInput.dataset.hasKey = "false";
          apiKeyInput.dataset.originalKey = "";
        }

        setTimeout(() => {
          status.textContent = "";
          status.className = "";
          status.style.display = "none";
        }, 3000);
      }

      // Dispatch event so other parts of the app can react
      const event = new CustomEvent("ai-settings-updated", {
        detail: { provider, model, hasKey: Boolean(actualKey) },
      });
      dispatchEvent(event);
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
      throw e;
    }
  }

  // Provider change handler - auto-save
  providerSelect?.addEventListener("change", async (e) => {
    const provider = e.target.value;
    updateProviderUI(provider);

    // Load saved API key and base URL for this provider
    const ai = await settingsManager.get("ai");
    const providerKeys = ai.provider_keys || {};
    const providerBaseUrls = ai.provider_base_urls || {};

    const savedKey = providerKeys[provider] || "";
    const savedBaseUrl = providerBaseUrls[provider] || "";

    // Update API key input
    if (apiKeyInput) {
      if (savedKey) {
        const maskedKey = savedKey.substring(0, 3) + "..." + savedKey.slice(-4);
        apiKeyInput.value = maskedKey;
        apiKeyInput.dataset.hasKey = "true";
        apiKeyInput.dataset.originalKey = savedKey;
      } else {
        apiKeyInput.value = "";
        apiKeyInput.dataset.hasKey = "false";
        apiKeyInput.dataset.originalKey = "";
      }
    }

    // Update base URL input
    if (baseUrlInput) {
      baseUrlInput.value = savedBaseUrl;
    }

    // For Ollama, fetch models from the instance
    if (provider === "ollama") {
      const ollamaBaseUrl = savedBaseUrl || "http://localhost:11434";
      await populateModelDropdown(provider, "", ollamaBaseUrl);
    } else {
      // Load default model for other providers
      const models = PROVIDER_MODELS[provider] || [];
      const defaultModel = models.length > 0 ? models[0].value : "";
      await populateModelDropdown(provider, defaultModel);
    }

    // Auto-save provider change
    await saveAISettings();
  });

  // Model change handler - auto-save
  modelSelect?.addEventListener("change", async () => {
    await saveAISettings();
  });

  // API key blur handler - auto-save
  apiKeyInput?.addEventListener("blur", async () => {
    await saveAISettings();
  });

  // Base URL blur handler - auto-save (and refetch Ollama models if needed)
  baseUrlInput?.addEventListener("blur", async () => {
    const provider = providerSelect?.value || "openai";
    if (provider === "ollama") {
      const baseUrl = baseUrlInput.value.trim() || "http://localhost:11434";
      const currentModel = modelSelect?.value || "";
      await populateModelDropdown(provider, currentModel, baseUrl);
    }
    await saveAISettings();
  });

  // Clear button - auto-save after clearing
  const clearBtn = root.querySelector("#ai-api-key-clear-btn");
  clearBtn?.addEventListener("click", async () => {
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.dataset.hasKey = "false";
      apiKeyInput.dataset.originalKey = "";
      apiKeyInput.focus();
      await saveAISettings();
    }
  });
}
