/**
 * Service Presets Configuration
 * ---------------------------------------------------------------------------
 * Defines preset task configurations for common service run scenarios.
 * Uses dynamic queries based on service metadata (groups, categories, toolKeys)
 * instead of hardcoded service ID lists.
 *
 * This makes presets maintainable - new services automatically appear in
 * appropriate presets based on their handler definitions.
 */

import { listHandlerIds, getHandler } from "./index.js";

/**
 * GPU_PARENT_ID is a special UI-only meta-service that groups GPU stress tests.
 * It's not a real handler, but provides a convenient way to configure both
 * FurMark and HeavyLoad GPU stress tests together in the UI.
 */
export const GPU_PARENT_ID = "gpu_stress_parent";

/**
 * GPU child services that are hidden from direct selection.
 * These are accessed through the GPU parent meta-service.
 */
export const GPU_CHILDREN = ["furmark_stress_test", "heavyload_stress_gpu"];

/**
 * Preset configurations for common service run scenarios.
 * Each preset defines inclusion rules based on service metadata.
 *
 * @typedef {Object} PresetConfig
 * @property {string} description - Human-readable preset description
 * @property {Object} include - Inclusion rules for this preset
 * @property {string[]} [include.groups] - Service groups to include
 * @property {string[]} [include.exclude] - Service IDs to explicitly exclude
 * @property {Function} [include.filter] - Custom filter function
 * @property {string[]} [include.addSpecial] - Special items to add (like GPU parent)
 * @property {boolean} [include.none] - If true, start with empty selection
 */
const PRESET_CONFIGS = {
  general: {
    description: "Common maintenance and diagnostics",
    include: {
      groups: ["Security", "Cleanup", "System Integrity", "Diagnostics"],
      // Only include commonly used services
      filter: (def) => {
        const commonServices = [
          "adwcleaner_clean",
          "bleachbit_clean",
          "sfc_scan",
          "dism_health_check",
          "smartctl_report",
          "speedtest",
        ];
        return commonServices.includes(def.id);
      },
    },
  },

  complete: {
    description: "Full diagnostic suite with stress tests",
    include: {
      groups: [
        "Security",
        "Cleanup",
        "System Integrity",
        "Diagnostics",
        "Stress",
        "Network",
      ],
      // Exclude specialized/advanced tools
      exclude: ["whynotwin11_check", "iperf_test"],
      // Include GPU parent instead of individual GPU stress tests
      addSpecial: [GPU_PARENT_ID],
    },
  },

  diagnostics: {
    description: "System health checks only",
    include: {
      groups: ["System Integrity", "Diagnostics"],
      // Only built-in Windows tools for quick diagnostics
      filter: (def) => {
        return !def.toolKeys || def.toolKeys.length === 0;
      },
    },
  },

  custom: {
    description: "Start with empty selection",
    include: { none: true },
  },
};

/**
 * Build preset task list dynamically from service definitions.
 * Queries handlers based on preset rules and generates service ID array.
 *
 * @param {string} presetName - Name of preset from PRESET_CONFIGS
 * @returns {string[]} Array of service IDs to include in preset
 *
 * @example
 * const tasks = buildPresetTaskList("general");
 * // Returns: ["adwcleaner_clean", "bleachbit_clean", "sfc_scan", ...]
 */
export function buildPresetTaskList(presetName) {
  const config = PRESET_CONFIGS[presetName];
  if (!config) return [];

  const include = config.include || {};

  // Empty preset (custom mode)
  if (include.none) return [];

  const result = [];
  const allHandlerIds = listHandlerIds();

  // Add services matching criteria
  for (const id of allHandlerIds) {
    const handler = getHandler(id);
    if (!handler || !handler.definition) continue;

    const def = handler.definition;

    // Skip GPU children (they're accessed via GPU parent meta-service)
    if (GPU_CHILDREN.includes(id)) continue;

    // Check group inclusion
    if (include.groups && !include.groups.includes(def.group)) continue;

    // Check exclusion list
    if (include.exclude && include.exclude.includes(id)) continue;

    // Apply custom filter function
    if (include.filter && !include.filter(def)) continue;

    result.push(id);
  }

  // Add special items (like GPU parent)
  if (include.addSpecial) {
    result.push(...include.addSpecial);
  }

  return result;
}

/**
 * Get all available preset names.
 * @returns {string[]} Array of preset names
 */
export function getPresetNames() {
  return Object.keys(PRESET_CONFIGS);
}

/**
 * Get preset configuration by name.
 * @param {string} presetName - Name of preset
 * @returns {PresetConfig|null} Preset configuration or null
 */
export function getPresetConfig(presetName) {
  return PRESET_CONFIGS[presetName] || null;
}

/**
 * Check if a service ID is a GPU child (hidden from direct selection).
 * @param {string} id - Service ID
 * @returns {boolean} True if service is a GPU child
 */
export function isGpuChild(id) {
  return GPU_CHILDREN.includes(id);
}

/**
 * Legacy preset map for backwards compatibility.
 * Dynamically generates task lists when accessed.
 *
 * @example
 * const generalTasks = PRESET_MAP.general;
 * const completeTasks = PRESET_MAP["complete"];
 */
export const PRESET_MAP = new Proxy(
  {},
  {
    get(target, prop) {
      if (typeof prop === "string" && PRESET_CONFIGS[prop]) {
        return buildPresetTaskList(prop);
      }
      return [];
    },
  }
);
