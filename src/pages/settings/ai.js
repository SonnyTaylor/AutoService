/**
 * AI/API settings management for the settings page.
 *
 * This module manages AI provider and model selection for AutoService.
 * It is compatible with the Python runner's LiteLLM implementation.
 *
 * **Dynamic Model Discovery:**
 * - Uses Vercel AI SDK Gateway to fetch the latest available models
 * - Falls back to static lists if dynamic discovery fails
 * - Filters models by type (language models only, no embeddings)
 *
 * **Python Backend Compatibility:**
 * - The Python backend expects model names WITHOUT the provider prefix
 * - Settings store provider ("openai") and model ("gpt-5") separately
 * - The Python backend (ai_utils.py) will construct the full model name
 *   as "provider/model" (e.g., "openai/gpt-5") for LiteLLM
 * - If no provider prefix is present, Python backend defaults to OpenAI
 *
 * **Model Values:**
 * Store model names as simple strings without provider prefix:
 * ✓ Correct: "gpt-5", "claude-sonnet-4-20250514", "llama-3.3-70b-versatile"
 * ✗ Wrong: "openai/gpt-5", "anthropic/claude-sonnet-4-20250514"
 */

import { settingsManager } from "../../utils/settings-manager.js";
import { gateway } from "@ai-sdk/gateway";

const { invoke } = window.__TAURI__.core || {};

/**
 * Model options for each provider (updated November 2025)
 * These are fallback options used when dynamic discovery fails.
 * Based on Vercel AI Gateway model list as of November 2025.
 */
const PROVIDER_MODELS = {
  openai: [
    { value: "gpt-5.1", label: "GPT-5.1 (Latest)" },
    { value: "gpt-5.1-chat-latest", label: "GPT-5.1 Chat" },
    { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
    { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-5-codex", label: "GPT-5 Codex" },
    { value: "gpt-5-chat-latest", label: "GPT-5 Chat" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  anthropic: [
    { value: "claude-opus-4-1", label: "Claude Opus 4.1 (Latest)" },
    { value: "claude-opus-4-0", label: "Claude Opus 4.0" },
    { value: "claude-sonnet-4-0", label: "Claude Sonnet 4.0" },
    { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    {
      value: "claude-3-5-sonnet-20241022",
      label: "Claude 3.5 Sonnet (Oct 2024)",
    },
  ],
  groq: [
    {
      value: "meta-llama/llama-4-scout-17b-16e-instruct",
      label: "Llama 4 Scout 17B (Latest)",
    },
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  xai: [
    { value: "grok-4", label: "Grok 4 (Latest)" },
    { value: "grok-3", label: "Grok 3" },
    { value: "grok-3-fast", label: "Grok 3 Fast" },
    { value: "grok-3-mini", label: "Grok 3 Mini" },
    { value: "grok-3-mini-fast", label: "Grok 3 Mini Fast" },
    { value: "grok-2-1212", label: "Grok 2 (Dec 2024)" },
    { value: "grok-2-vision-1212", label: "Grok 2 Vision" },
    { value: "grok-beta", label: "Grok Beta" },
    { value: "grok-vision-beta", label: "Grok Vision Beta" },
  ],
  azure: [
    { value: "gpt-4o", label: "GPT-4o (Azure)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo (Azure)" },
    { value: "gpt-4", label: "GPT-4 (Azure)" },
    { value: "gpt-35-turbo", label: "GPT-3.5 Turbo (Azure)" },
  ],
  google: [
    { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (Experimental)" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  mistral: [
    { value: "pixtral-large-latest", label: "Pixtral Large (Latest)" },
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "mistral-medium-latest", label: "Mistral Medium" },
    { value: "mistral-medium-2505", label: "Mistral Medium 25.05" },
    { value: "mistral-small-latest", label: "Mistral Small" },
    { value: "pixtral-12b-2409", label: "Pixtral 12B" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  cerebras: [
    { value: "llama3.3-70b", label: "Llama 3.3 70B" },
    { value: "llama3.1-70b", label: "Llama 3.1 70B" },
    { value: "llama3.1-8b", label: "Llama 3.1 8B" },
  ],
  ollama: [
    { value: "llama3.2", label: "Llama 3.2" },
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "mistral", label: "Mistral" },
    { value: "mixtral", label: "Mixtral" },
    { value: "phi3", label: "Phi-3" },
    { value: "qwen2.5", label: "Qwen 2.5" },
    { value: "deepseek-r1", label: "DeepSeek R1" },
  ],
};

/**
 * Provider information and hints
 */
const PROVIDER_INFO = {
  openai: {
    hint: 'Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  anthropic: {
    hint: 'Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  groq: {
    hint: 'Get your API key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  xai: {
    hint: 'Get your API key from <a href="https://console.x.ai/" target="_blank" rel="noopener">console.x.ai</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  azure: {
    hint: "Enter your Azure OpenAI API key and configure deployment in base URL",
    showBaseUrl: true,
    supportsGateway: false,
  },
  google: {
    hint: 'Get your API key from <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  mistral: {
    hint: 'Get your API key from <a href="https://console.mistral.ai/" target="_blank" rel="noopener">console.mistral.ai</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  deepseek: {
    hint: 'Get your API key from <a href="https://platform.deepseek.com/" target="_blank" rel="noopener">platform.deepseek.com</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  cerebras: {
    hint: 'Get your API key from <a href="https://cloud.cerebras.ai/" target="_blank" rel="noopener">cloud.cerebras.ai</a>',
    showBaseUrl: false,
    supportsGateway: true,
  },
  ollama: {
    hint: "Ollama runs locally. Make sure Ollama is running on your machine.",
    showBaseUrl: true,
    supportsGateway: false,
  },
};

/**
 * Cache for dynamically fetched models (1 hour TTL)
 */
const modelsCache = {
  data: null,
  timestamp: 0,
  TTL: 3600000, // 1 hour in milliseconds
};

/**
 * Fetch available models from Vercel AI Gateway
 * @returns {Promise<Array<{value: string, label: string, provider: string, description?: string}>>}
 */
async function fetchGatewayModels() {
  try {
    // Check cache first
    const now = Date.now();
    if (modelsCache.data && now - modelsCache.timestamp < modelsCache.TTL) {
      console.log("Using cached gateway models");
      return modelsCache.data;
    }

    console.log("Fetching models from AI Gateway...");
    const availableModels = await gateway.getAvailableModels();

    // Filter to only language models (exclude embeddings)
    const languageModels = availableModels.models.filter(
      (m) => m.modelType === "language"
    );

    // Transform to our format
    const models = languageModels.map((model) => {
      // Extract provider and model name from id (e.g., "openai/gpt-5" -> provider: "openai", name: "gpt-5")
      const [provider, ...modelParts] = model.id.split("/");
      const modelName = modelParts.join("/"); // Handle models with / in name

      return {
        value: modelName, // Store without provider prefix for Python backend compatibility
        label: model.name || modelName,
        provider: provider.toLowerCase(),
        description: model.description,
        pricing: model.pricing,
      };
    });

    // Cache the results
    modelsCache.data = models;
    modelsCache.timestamp = now;

    console.log(`Fetched ${models.length} language models from AI Gateway`);
    return models;
  } catch (error) {
    console.error("Failed to fetch models from AI Gateway:", error);
    return null;
  }
}

/**
 * Get models for a specific provider, with dynamic discovery fallback
 * @param {string} provider - Provider name
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
async function getModelsForProvider(provider) {
  const providerInfo = PROVIDER_INFO[provider];

  // For providers that support Gateway, try dynamic discovery first
  if (providerInfo?.supportsGateway) {
    try {
      const gatewayModels = await fetchGatewayModels();
      if (gatewayModels) {
        // Filter models for this provider
        const providerModels = gatewayModels.filter(
          (m) => m.provider === provider
        );

        if (providerModels.length > 0) {
          console.log(
            `Using ${providerModels.length} dynamic models for ${provider}`
          );
          return providerModels.map((m) => ({
            value: m.value,
            label: m.label, // Use label only, no description
          }));
        }
      }
    } catch (error) {
      console.warn(
        `Dynamic model discovery failed for ${provider}, using fallback:`,
        error
      );
    }
  }

  // Fall back to static list
  console.log(`Using static model list for ${provider}`);
  return PROVIDER_MODELS[provider] || [];
}

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

  // Show loading state
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  modelSelect.disabled = true;

  try {
    let models = [];

    // Special handling for Ollama (local API)
    if (provider === "ollama") {
      const ollamaBaseUrl = baseUrl || "http://localhost:11434";
      models = await fetchOllamaModels(ollamaBaseUrl);
    } else {
      // Use dynamic discovery for other providers
      models = await getModelsForProvider(provider);
    }

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
    // On error, show fallback options
    console.error(`Failed to load models for ${provider}:`, error);
    modelSelect.innerHTML = "";
    modelSelect.disabled = false;

    // Show error option
    const errorOption = document.createElement("option");
    errorOption.value = "";
    errorOption.textContent = `Error: ${error.message}`;
    modelSelect.appendChild(errorOption);

    // Add fallback models
    const fallbackModels = PROVIDER_MODELS[provider] || [];
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
