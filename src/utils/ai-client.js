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
// REPORT SUMMARIZATION FOR AI
// ============================================================================

/**
 * Configuration constants for report summarization
 */
const MAX_ARRAY_SIZE_BEFORE_SUMMARY = 50; // Arrays larger than this get summarized
const ARRAY_SAMPLE_SIZE = 3; // Number of sample items to include
const MAX_STRING_LENGTH = 500; // Truncate very long strings if needed

/**
 * Summarize large arrays in a report object for AI processing
 * Recursively processes the report and replaces large arrays with compact summaries
 * @param {any} value - The value to process (can be object, array, or primitive)
 * @param {string} [key] - The key name (for context)
 * @returns {any} Processed value with large arrays summarized
 */
function summarizeReportForAI(value, key = "") {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // If array is small, process each item recursively but keep the array
    if (value.length <= MAX_ARRAY_SIZE_BEFORE_SUMMARY) {
      return value.map((item, index) => summarizeReportForAI(item, `${key}[${index}]`));
    }

    // Large array - create summary
    const sample = value.slice(0, ARRAY_SAMPLE_SIZE).map((item) =>
      summarizeReportForAI(item, `${key}[sample]`)
    );

    // Calculate total_size_bytes if items have size_bytes property
    let totalSizeBytes = null;
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      const hasSizeBytes = value.some(
        (item) => typeof item === "object" && item !== null && "size_bytes" in item
      );
      if (hasSizeBytes) {
        totalSizeBytes = value.reduce((sum, item) => {
          if (typeof item === "object" && item !== null && typeof item.size_bytes === "number") {
            return sum + item.size_bytes;
          }
          return sum;
        }, 0);
      }
    }

    // Create a descriptive note
    const itemType = key.includes("file") ? "files" : "items";
    const note = `${value.length} ${itemType}${key.includes("deleted") ? " deleted" : ""} (showing ${ARRAY_SAMPLE_SIZE} samples)`;

    return {
      _summary_type: "array_summary",
      count: value.length,
      sample,
      ...(totalSizeBytes !== null && { total_size_bytes: totalSizeBytes }),
      note,
    };
  }

  // Handle objects
  if (typeof value === "object") {
    const summarized = {};
    for (const [objKey, objValue] of Object.entries(value)) {
      // Preserve important scalar values and metadata
      if (
        typeof objValue !== "object" ||
        objValue === null ||
        Array.isArray(objValue)
      ) {
        summarized[objKey] = summarizeReportForAI(objValue, objKey);
      } else {
        // Recursively process nested objects
        summarized[objKey] = summarizeReportForAI(objValue, objKey);
      }
    }
    return summarized;
  }

  // Handle strings - truncate if too long
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return value.substring(0, MAX_STRING_LENGTH) + "... (truncated)";
  }

  // Return primitives as-is
  return value;
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

  /**
   * Generate a customer-friendly summary of a service report
   * @param {Object} report - The full service report object
   * @returns {Promise<string>} Customer-friendly summary text
   * @throws {Error} If AI call fails or not configured
   */
  async generateServiceSummary(report) {
    if (!report || !report.results || !Array.isArray(report.results)) {
      throw new Error("Invalid report data");
    }

    // Summarize the report to handle large arrays before processing
    const summarizedReport = summarizeReportForAI(report);

    // Build a summary of what was done (using original report for counts)
    const taskCount = report.results.length;
    const successfulTasks = report.results.filter(
      (r) => r.status === "success"
    ).length;
    const errorTasks = report.results.filter((r) => r.status === "error").length;
    const warningTasks = report.results.filter(
      (r) => r.status === "warning"
    ).length;

    // Extract task types and their outcomes from summarized report
    // This ensures we don't include massive arrays in the task summaries
    const taskSummaries = summarizedReport.results.map((result) => {
      const taskType = result.task_type || "unknown";
      const status = result.status || "unknown";
      
      // Extract only essential summary data (counts, totals) - avoid large arrays
      const summary = result.summary?.human_readable || {};
      const essentialSummary = {};
      
      // Preserve important scalar values and totals
      for (const [key, value] of Object.entries(summary)) {
        // Keep scalar values, small arrays, and important totals
        if (
          typeof value !== "object" ||
          value === null ||
          (Array.isArray(value) && value.length <= 10) ||
          key.includes("bytes") ||
          key.includes("count") ||
          key.includes("total") ||
          key.includes("files_deleted") ||
          key.includes("space_recovered")
        ) {
          essentialSummary[key] = value;
        } else if (typeof value === "object" && value._summary_type === "array_summary") {
          // Include array summaries (they're already compact)
          essentialSummary[key] = value;
        }
        // Skip large arrays that weren't summarized (shouldn't happen, but safety check)
      }
      
      const duration = result.duration_seconds
        ? `${Math.round(result.duration_seconds)}s`
        : "";

      return {
        type: taskType,
        status,
        summary: essentialSummary,
        duration,
      };
    });

    // Create a customer-friendly prompt with better structure
    const systemPrompt = `You are a helpful assistant that creates brief, friendly summaries of computer maintenance work for customers. 
Write in plain language that non-technical people can understand. Keep it SHORT - 2-3 sentences maximum.
Focus on what was done and any important findings. Use a warm, professional tone.
Do not include technical jargon or error codes. Write as if speaking directly to the customer.`;

    // Build a more structured task summary for better AI understanding
    // Include key metrics from summaries (like space recovered, files deleted, etc.)
    const taskDescriptions = taskSummaries
      .slice(0, 10) // Limit to first 10 tasks to avoid token limits
      .map((task) => {
        const taskName = task.type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        const status = task.status === "success" ? "completed successfully" : 
                      task.status === "error" ? "encountered errors" :
                      task.status === "warning" ? "completed with warnings" : "completed";
        
        // Add key metrics if available
        const metrics = [];
        const summary = task.summary || {};
        
        // Check for space recovered (in bytes, convert to MB/GB)
        if (summary.space_recovered_bytes) {
          const mb = (summary.space_recovered_bytes / (1024 * 1024)).toFixed(1);
          metrics.push(`${mb}MB freed`);
        }
        
        // Check for files deleted count
        if (summary.files_deleted !== undefined) {
          metrics.push(`${summary.files_deleted} files removed`);
        } else if (summary.deleted_files?._summary_type === "array_summary") {
          metrics.push(`${summary.deleted_files.count} files removed`);
        }
        
        // Check for array summaries with counts
        for (const [key, value] of Object.entries(summary)) {
          if (value?._summary_type === "array_summary" && key !== "deleted_files") {
            metrics.push(`${value.count} ${key.replace(/_/g, " ")}`);
          }
        }
        
        const metricsStr = metrics.length > 0 ? ` (${metrics.join(", ")})` : "";
        return `- ${taskName}: ${status}${metricsStr}`;
      })
      .join("\n");

    const userPrompt = `Please create a BRIEF customer-friendly summary (2-3 sentences maximum) of the following computer maintenance work:

Total Tasks Completed: ${taskCount}
Successful: ${successfulTasks}
With Errors: ${errorTasks}
With Warnings: ${warningTasks}

Tasks Performed:
${taskDescriptions}
${taskCount > 10 ? `\n(and ${taskCount - 10} more tasks)` : ""}

Overall Status: ${report.overall_status || "unknown"}

Provide a SHORT, friendly summary (2-3 sentences) that:
1. Briefly explains what maintenance work was performed
2. Mentions any important findings or issues (if any)
3. Provides overall system health status

Write in a warm, professional tone as if speaking directly to the customer. Avoid technical jargon.`;

    try {
      const summary = await this.generateText({
        systemPrompt,
        userPrompt,
        temperature: 0.7,
        maxTokens: 250, // Slightly increased for better quality
      });

      const trimmed = summary.trim();
      
      // Validate summary quality
      if (!trimmed || trimmed.length < 20) {
        throw new Error("AI returned an empty or too-short summary");
      }
      
      // Remove any markdown formatting that might slip through
      const cleaned = trimmed
        .replace(/^#+\s*/gm, "") // Remove markdown headers
        .replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold
        .replace(/\*(.+?)\*/g, "$1") // Remove italic
        .trim();
      
      return cleaned;
    } catch (error) {
      console.error("Failed to generate AI summary:", error);
      throw error;
    }
  },
};
