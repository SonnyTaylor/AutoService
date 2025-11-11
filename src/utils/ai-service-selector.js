/**
 * AI Service Selector Utility
 * ---------------------------------------------------------------------------
 * Uses AI to analyze user input and intelligently select and configure
 * services from the available catalog based on the problem description.
 */

import { aiClient } from "./ai-client.js";
import { listServiceIds, getServiceById } from "../pages/service/catalog.js";
import { GPU_PARENT_ID } from "../pages/service/handlers/presets.js";

/**
 * @typedef {Object} AIServiceSelection
 * @property {string} id - Service ID
 * @property {Object<string, any>} params - Service parameters
 */

/**
 * @typedef {Object} AIServiceSelectorResponse
 * @property {AIServiceSelection[]} services - Selected services with parameters
 * @property {string} reasoning - Brief explanation of why these services were selected
 */

/**
 * Build a comprehensive description of all available services for the AI prompt.
 * @returns {string} Formatted service catalog description
 */
function buildServiceCatalogDescription() {
  const serviceIds = listServiceIds();
  const descriptions = [];

  descriptions.push("AVAILABLE SERVICES:");
  descriptions.push("");

  // Group services by category
  const byCategory = {};
  serviceIds.forEach((id) => {
    const service = getServiceById(id);
    if (!service) return;
    const category = service.category || service.group || "Other";
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ id, service });
  });

  // Add GPU parent as a special meta-service
  byCategory["Stress"] = byCategory["Stress"] || [];
  byCategory["Stress"].push({
    id: GPU_PARENT_ID,
    service: {
      id: GPU_PARENT_ID,
      label: "GPU Stress (FurMark + HeavyLoad)",
      group: "Stress",
      category: "Stress",
      defaultParams: {
        furmark: true,
        heavyload: false,
        furmarkMinutes: 5,
        heavyloadMinutes: 5,
      },
      toolKeys: ["furmark", "furmark2", "heavyload"],
    },
  });

  // Format each category
  Object.entries(byCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([category, services]) => {
      descriptions.push(`${category}:`);
      services.forEach(({ id, service }) => {
        const params = service.defaultParams || {};
        const paramDesc = Object.keys(params).length > 0
          ? ` (params: ${JSON.stringify(params)})`
          : "";
        const toolDesc = service.toolKeys && service.toolKeys.length > 0
          ? ` [requires: ${service.toolKeys.join(", ")}]`
          : " [built-in]";
        descriptions.push(
          `  - ${id}: ${service.label}${paramDesc}${toolDesc}`
        );
      });
      descriptions.push("");
    });

  return descriptions.join("\n");
}

/**
 * Build parameter schema description for AI understanding.
 * @returns {string} Parameter schema description
 */
function buildParameterSchemaDescription() {
  return `
PARAMETER TYPES:
- minutes: Number (duration in minutes, typically 1-240)
- seconds: Number (duration in seconds, typically 10-3600)
- furmark: Boolean (enable FurMark GPU stress test)
- heavyload: Boolean (enable HeavyLoad GPU stress test)
- furmarkMinutes: Number (FurMark duration in minutes)
- heavyloadMinutes: Number (HeavyLoad duration in minutes)

For GPU Stress (gpu_stress_parent), use:
- furmark: true/false
- heavyload: true/false
- furmarkMinutes: number (1-240)
- heavyloadMinutes: number (1-240)
`;
}

/**
 * Select and configure services using AI based on user input.
 * @param {string} userInput - User's problem description or desired tasks
 * @param {Function} isToolAvailable - Function to check if a tool is available (serviceId) => boolean
 * @returns {Promise<AIServiceSelectorResponse>} Selected services with reasoning
 * @throws {Error} If AI call fails or response is invalid
 */
export async function selectServicesWithAI(userInput, isToolAvailable) {
  if (!userInput || !userInput.trim()) {
    throw new Error("User input is required");
  }

  const serviceCatalog = buildServiceCatalogDescription();
  const paramSchema = buildParameterSchemaDescription();

  const systemPrompt = `You are an expert computer technician assistant. Your task is to analyze a user's problem description and select appropriate diagnostic/maintenance services from the available catalog.

${serviceCatalog}

${paramSchema}

INSTRUCTIONS:
1. Analyze the user's problem description carefully
2. Select ONLY the services that are relevant to solving their problem
3. Set appropriate parameters for each service (use defaultParams as guidance)
4. For stress tests, use reasonable durations (1-10 minutes for quick tests, 10-30 for thorough tests)
5. For GPU stress testing, use the gpu_stress_parent service with appropriate furmark/heavyload settings
6. Prefer built-in services when possible (they don't require external tools)
7. If a service requires tools that might not be available, still include it but note in reasoning
8. Return a JSON object with:
   - services: Array of { id: string, params: object }
   - reasoning: Brief explanation of your selections

EXAMPLES:
- "My computer is slow" → Include cleanup services (bleachbit_clean, drivecleanup_clean), diagnostics (disk_space_report, smartctl_report)
- "Network issues" → Include network tests (ping_test, speedtest, iperf_test)
- "System errors" → Include integrity checks (sfc_scan, dism_health_check, chkdsk_scan)
- "GPU problems" → Include GPU stress test (gpu_stress_parent with furmark: true)
- "Full diagnostic" → Include comprehensive set of diagnostics and health checks

Be selective - don't include every service. Focus on what's needed to address the specific problem.`;

  const userPrompt = `User's problem description:
${userInput.trim()}

Please select the most appropriate services to address this problem. Return your response as JSON with the structure:
{
  "services": [
    { "id": "service_id", "params": {} },
    ...
  ],
  "reasoning": "Brief explanation"
}`;

  try {
    const response = await aiClient.generateJSON({
      systemPrompt,
      userPrompt,
      temperature: 0.3, // Lower temperature for more consistent, focused selections
      maxTokens: 2000,
      requiredFields: ["services", "reasoning"],
      schema: {
        services: [
          {
            id: "string",
            params: "object",
          },
        ],
        reasoning: "string",
      },
    });

    // Validate response structure
    if (!response || !Array.isArray(response.services)) {
      throw new Error("Invalid AI response: missing services array");
    }

    // Validate each service
    const validatedServices = [];
    for (const service of response.services) {
      if (!service.id || typeof service.id !== "string") {
        console.warn("Skipping invalid service entry:", service);
        continue;
      }

      // Check if service exists (or is GPU parent)
      if (service.id !== GPU_PARENT_ID) {
        const serviceDef = getServiceById(service.id);
        if (!serviceDef) {
          console.warn(`Service ${service.id} not found in catalog, skipping`);
          continue;
        }
      }

      // Validate params is an object
      const params = service.params && typeof service.params === "object"
        ? service.params
        : {};

      validatedServices.push({
        id: service.id,
        params,
      });
    }

    if (validatedServices.length === 0) {
      throw new Error(
        "AI did not select any valid services. Please try a different description."
      );
    }

    return {
      services: validatedServices,
      reasoning: response.reasoning || "Services selected based on problem description",
    };
  } catch (error) {
    console.error("AI service selection failed:", error);
    throw error;
  }
}

