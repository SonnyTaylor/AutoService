/**
 * Centralized AI Client Utility
 *
 * Provides a unified interface for AI operations across the application:
 * - Multi-provider support (OpenAI, Anthropic, Google, Ollama, Groq, XAI, Azure)
 * - Automatic provider model creation
 * - JSON response parsing with markdown code block stripping
 * - Comprehensive error handling with user-friendly messages
 * - Settings integration via settingsManager
 *
 * Usage:
 * ```javascript
 * import { aiClient } from '@/utils/ai-client.js';
 *
 * // Check if AI is configured
 * const isConfigured = await aiClient.isConfigured();
 *
 * // Call AI with text generation
 * const result = await aiClient.generateText({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "What is 2+2?",
 *   temperature: 0.7,
 *   maxTokens: 1000
 * });
 *
 * // Call AI expecting JSON response
 * const jsonResult = await aiClient.generateJSON({
 *   systemPrompt: "Return JSON only.",
 *   userPrompt: "List 3 colors",
 *   schema: { colors: ["string"] }
 * });
 * ```
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { settingsManager } from "./settings-manager.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * @typedef {Object} AISettings
 * @property {string} provider - Provider name (openai, anthropic, google, ollama, etc.)
 * @property {string} model - Model identifier
 * @property {string} apiKey - API key for the provider
 * @property {string} baseUrl - Base URL (for Ollama, Azure, etc.)
 * @property {boolean} hasKey - Whether API key/base URL is configured
 * @property {string} [error] - Error message if settings load failed
 */

/**
 * @typedef {Object} GenerateTextOptions
 * @property {string} systemPrompt - System prompt/instructions
 * @property {string} userPrompt - User prompt/query
 * @property {number} [temperature=0.7] - Temperature for generation
 * @property {number} [maxTokens=2000] - Maximum tokens to generate
 */

/**
 * @typedef {Object} GenerateJSONOptions
 * @property {string} systemPrompt - System prompt/instructions
 * @property {string} userPrompt - User prompt/query
 * @property {number} [temperature=0.2] - Temperature (lower for structured output)
 * @property {number} [maxTokens=2000] - Maximum tokens to generate
 * @property {Object} [schema] - Expected JSON schema (for validation hints)
 * @property {string[]} [requiredFields] - Required fields in response
 */

// ============================================================================
// PROVIDER MODEL CREATION
// ============================================================================

/**
 * Create AI provider model instance based on settings
 * @param {AISettings} settings - AI settings
 * @returns {any} Provider model instance
 */
function createProviderModel(settings) {
  const { provider, model, apiKey, baseUrl } = settings;

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      return openai(model);
    }

    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
      });
      return anthropic(model);
    }

    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey,
      });
      return google(model);
    }

    case "ollama": {
      // Ollama provides an OpenAI-compatible API endpoint at /v1
      const ollamaBaseUrl = baseUrl || "http://localhost:11434";
      const openai = createOpenAI({
        apiKey: "ollama", // Ollama doesn't require a real API key, but the SDK expects one
        baseURL: `${ollamaBaseUrl.replace(/\/$/, "")}/v1`, // Ollama's OpenAI-compatible endpoint
      });
      // Remove any provider prefix from model name for Ollama
      const modelName = model.includes("/") ? model.split("/")[1] : model;
      return openai(modelName);
    }

    case "groq":
    case "xai":
    case "azure":
    default: {
      // For providers without official SDK support, use OpenAI-compatible endpoint
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      // Use model name directly (may need provider prefix removed)
      const modelName = model.includes("/") ? model.split("/")[1] : model;
      return openai(modelName);
    }
  }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Load AI settings from app settings
 * @returns {Promise<AISettings>}
 */
async function loadAISettings() {
  try {
    const ai = await settingsManager.get("ai");
    const provider = ai.provider || "openai";
    const model = ai.model || "gpt-4o-mini";

    // Get provider-specific keys and base URLs
    const providerKeys = ai.provider_keys || {};
    const providerBaseUrls = ai.provider_base_urls || {};

    // Get current provider's key and base URL
    const apiKey =
      providerKeys[provider] || ai.api_key || ai.openai_api_key || "";
    const baseUrl = providerBaseUrls[provider] || ai.base_url || "";

    // Ollama doesn't need an API key, but needs base_url
    const hasKey = provider === "ollama" ? Boolean(baseUrl) : Boolean(apiKey);

    return {
      provider,
      model,
      apiKey,
      baseUrl,
      hasKey,
    };
  } catch (e) {
    return {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
      baseUrl: "",
      hasKey: false,
      error: "Unable to load app settings.",
    };
  }
}

// ============================================================================
// JSON PARSING UTILITIES
// ============================================================================

/**
 * Strip markdown code block markers from text
 * Handles cases like ```json\n{...}\n``` or ```\n{...}\n```
 * @param {string} input - Text potentially wrapped in markdown code blocks
 * @returns {string} Cleaned text
 */
function stripMarkdownCodeBlocks(input) {
  let cleaned = input.trim();
  // Remove opening code block markers (```json, ```, etc.)
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "");
  // Remove closing code block markers
  cleaned = cleaned.replace(/\n?```$/i, "");
  return cleaned.trim();
}

/**
 * Parse JSON from AI response, handling markdown code blocks and extraction
 * @param {string} text - Raw response text
 * @returns {Object} Parsed JSON object
 * @throws {Error} If JSON cannot be parsed
 */
function parseJSONResponse(text) {
  if (!text || !text.trim()) {
    throw new Error("Empty response from AI provider");
  }

  // First, try parsing directly
  try {
    return JSON.parse(text);
  } catch (parseError) {
    // If direct parse fails, try stripping markdown code blocks
    let cleanedText = stripMarkdownCodeBlocks(text);

    try {
      return JSON.parse(cleanedText);
    } catch (secondParseError) {
      // Check if response looks like plain text (not JSON)
      const trimmedText = cleanedText.trim();
      const looksLikePlainText =
        !trimmedText.startsWith("{") && !trimmedText.startsWith("[");

      if (looksLikePlainText) {
        // Model didn't follow JSON instructions - likely a capability issue
        console.error(
          "Model returned plain text instead of JSON. Response:",
          text.substring(0, 500)
        );
        throw new Error("MODEL_INSTRUCTION_FAILURE");
      }

      // Try to extract JSON object from stray text
      const match = cleanedText.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("Failed to parse JSON. Response text:", text);
        throw new Error(
          `Failed to parse response as JSON. Response: ${text.substring(
            0,
            200
          )}`
        );
      }
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        console.error("Failed to parse extracted JSON. Match:", match[0]);
        throw new Error(`Failed to parse extracted JSON. ${e.message}`);
      }
    }
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Transform AI provider errors into user-friendly messages
 * @param {Error} error - Original error
 * @param {AISettings} settings - AI settings used for the request
 * @returns {Error} User-friendly error
 */
function transformError(error, settings) {
  // Handle specific error types
  if (
    error.message?.includes("401") ||
    error.message?.includes("Unauthorized")
  ) {
    return new Error(`Invalid ${settings.provider} API key`);
  }

  if (
    error.message?.includes("ENOTFOUND") ||
    error.message?.includes("ECONNREFUSED") ||
    error.message?.includes("fetch failed")
  ) {
    if (settings.provider === "ollama") {
      return new Error(
        "Cannot connect to Ollama. Make sure Ollama is running on your machine."
      );
    }
    return new Error(`Cannot connect to ${settings.provider} API`);
  }

  // For Ollama, provide more helpful error messages
  if (settings.provider === "ollama") {
    if (error.message === "MODEL_INSTRUCTION_FAILURE") {
      return new Error(
        `The Ollama model "${settings.model}" did not follow JSON format instructions. ` +
          `This model may not be capable enough for structured responses.\n\n` +
          `Try using a more capable model like:\n` +
          `• llama3.2 (or newer)\n` +
          `• mistral\n` +
          `• mixtral\n` +
          `• qwen2.5\n\n` +
          `Smaller models often struggle with strict JSON formatting.`
      );
    }
    if (
      error.message?.includes("Failed to parse") ||
      error.message?.includes("parse")
    ) {
      return new Error(
        `Ollama model "${settings.model}" returned an invalid response. ` +
          `The model may not be following instructions properly. ` +
          `Try using a more capable model or check if the model is installed correctly.`
      );
    }
    if (
      error.message?.includes("404") ||
      error.message?.includes("Not Found")
    ) {
      return new Error(
        `Ollama model "${settings.model}" not found. Make sure the model is installed.`
      );
    }
  }

  // Re-throw with provider context
  return new Error(
    `${settings.provider} error: ${error.message || "Unknown error"}`
  );
}

// ============================================================================
// AI CLIENT API
// ============================================================================

/**
 * Centralized AI Client
 */
export const aiClient = {
  /**
   * Check if AI is properly configured
   * @returns {Promise<boolean>}
   */
  async isConfigured() {
    const settings = await loadAISettings();
    return settings.hasKey && !settings.error;
  },

  /**
   * Get current AI settings
   * @returns {Promise<AISettings>}
   */
  async getSettings() {
    return await loadAISettings();
  },

  /**
   * Generate text using AI
   * @param {GenerateTextOptions} options - Generation options
   * @returns {Promise<string>} Generated text
   * @throws {Error} If AI call fails or not configured
   */
  async generateText(options) {
    const {
      systemPrompt,
      userPrompt,
      temperature = 0.7,
      maxTokens = 2000,
    } = options;

    const settings = await loadAISettings();

    if (settings.error) {
      throw new Error(settings.error);
    }

    if (!settings.hasKey) {
      const providerName =
        settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);
      throw new Error(
        `${providerName} API key is missing. Configure it in Settings.`
      );
    }

    try {
      const model = createProviderModel(settings);

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature,
        maxTokens,
      });

      if (!result.text) {
        throw new Error("Empty response from AI provider");
      }

      return result.text;
    } catch (error) {
      console.error("AI provider error:", error);
      throw transformError(error, settings);
    }
  },

  /**
   * Generate JSON response using AI
   * @param {GenerateJSONOptions} options - Generation options
   * @returns {Promise<Object>} Parsed JSON object
   * @throws {Error} If AI call fails, not configured, or JSON parsing fails
   */
  async generateJSON(options) {
    const {
      systemPrompt,
      userPrompt,
      temperature = 0.2,
      maxTokens = 2000,
      schema,
      requiredFields,
    } = options;

    const settings = await loadAISettings();

    if (settings.error) {
      throw new Error(settings.error);
    }

    if (!settings.hasKey) {
      const providerName =
        settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);
      throw new Error(
        `${providerName} API key is missing. Configure it in Settings.`
      );
    }

    // Enhance system prompt with JSON instructions
    let enhancedSystemPrompt = systemPrompt;
    if (schema || requiredFields) {
      enhancedSystemPrompt += "\n\nReturn valid JSON only.";
      if (requiredFields) {
        enhancedSystemPrompt += `\nRequired fields: ${requiredFields.join(
          ", "
        )}`;
      }
      if (schema) {
        enhancedSystemPrompt += `\nExpected structure: ${JSON.stringify(
          schema,
          null,
          2
        )}`;
      }
    }

    try {
      const model = createProviderModel(settings);

      const result = await generateText({
        model,
        system: enhancedSystemPrompt,
        prompt: userPrompt,
        temperature,
        maxTokens,
      });

      const parsed = parseJSONResponse(result.text);

      // Validate required fields if specified
      if (requiredFields && Array.isArray(requiredFields)) {
        for (const field of requiredFields) {
          if (!(field in parsed)) {
            throw new Error(`Missing required field in AI response: ${field}`);
          }
        }
      }

      return parsed;
    } catch (error) {
      console.error("AI provider error:", error);
      throw transformError(error, settings);
    }
  },
};
