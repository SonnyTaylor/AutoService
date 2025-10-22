/**
 * Service Presets Configuration
 * ---------------------------------------------------------------------------
 * Simplified preset system for easy management of service selections.
 * Define presets by explicitly listing services, with optional filtering.
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

// =============================================================================
// PRESET DEFINITIONS - EASY TO MODIFY
// =============================================================================

/**
 * Preset service lists with optional per-service parameters.
 * Simply add/remove service IDs to customize each preset.
 * Use GPU_PARENT_ID instead of individual GPU stress tests.
 *
 * Service params override defaults and allow customizing durations, modes, etc.
 * Example: { id: "iperf_test", params: { minutes: 1 } }
 *
 * @type {Record<string, {description: string, services: (string|{id: string, params: Record<string, any>})[]}>}
 */
const PRESETS = {
  general: {
    description: "Common maintenance and diagnostics",
    services: [
      // SERVICES:
      "adwcleaner_clean",
      "kvrt_scan",
      "bleachbit_clean",

      // DIAGNOSTICS:
      "smartctl_report",
      "speedtest",
      "whynotwin11_check",
      "disk_space_report",
    ],
  },

  complete: {
    description: "Full diagnostic suite with stress tests",
    services: [
      // Security & Cleanup
      "adwcleaner_clean",
      "bleachbit_clean",
      "kvrt_scan",
      "drivecleanup_clean",
      // System Integrity
      "sfc_scan",
      "dism_health_check",
      "chkdsk_scan",
      "smartctl_report",
      // Diagnostics
      "disk_space_report",
      "windows_update",
      "battery_health_report",
      "whynotwin11_check",
      // Network & Performance
      "ping_test",
      "speedtest",
      "winsat_disk",
      // Stress Tests (using GPU parent)
      GPU_PARENT_ID,
      "heavyload_stress_cpu",
      "heavyload_stress_memory",
    ],
  },

  diagnostics: {
    description: "System health checks only (built-in tools)",
    services: [
      "smartctl_report",
      "disk_space_report",
      "winsat_disk",
      "battery_health_report",
      // Hide integrity tests for now, they take too long
      // "sfc_scan",
      // "dism_health_check",
      // "chkdsk_scan",
      "whynotwin11_check",
      "ping_test",
      "speedtest",

      // Hide iperf test for now, until we can add option to pass in time duration
      // TODO: Add feature to pass in params from presets
      //"iperf_test",
    ],
  },

  custom: {
    description: "Start with empty selection",
    services: [],
  },
};

// =============================================================================
// PUBLIC API - SIMPLE & DIRECT
// =============================================================================

/**
 * Get all available preset names.
 * @returns {string[]} Array of preset names
 */
export function getPresetNames() {
  return Object.keys(PRESETS);
}

/**
 * Get services for a preset.
 * @param {string} presetName - Name of preset
 * @returns {string[]} Array of service IDs (normalized, params removed)
 */
export function getPresetServices(presetName) {
  const services = PRESETS[presetName]?.services ?? [];
  return services.map((item) => (typeof item === "string" ? item : item.id));
}

/**
 * Get preset description.
 * @param {string} presetName - Name of preset
 * @returns {string} Description of preset
 */
export function getPresetDescription(presetName) {
  return PRESETS[presetName]?.description ?? "";
}

/**
 * Get complete preset info.
 * @param {string} presetName - Name of preset
 * @returns {Object|null} Preset object or null
 */
export function getPreset(presetName) {
  return PRESETS[presetName] ?? null;
}

/**
 * Add or update a preset.
 * @param {string} presetName - Name of preset
 * @param {string} description - Preset description
 * @param {string[]} services - Array of service IDs
 */
export function setPreset(presetName, description, services) {
  PRESETS[presetName] = { description, services };
}

/**
 * Remove a preset.
 * @param {string} presetName - Name of preset
 */
export function removePreset(presetName) {
  delete PRESETS[presetName];
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
 * Get service parameters for a specific service in a preset.
 * @param {string} presetName - Name of preset
 * @param {string} serviceId - Service ID to get params for
 * @returns {Record<string, any>|null} Service params or null if none defined
 */
export function getPresetServiceParams(presetName, serviceId) {
  const preset = PRESETS[presetName];
  if (!preset || !preset.services) return null;

  const item = preset.services.find((s) =>
    typeof s === "string" ? s === serviceId : s.id === serviceId
  );

  if (!item || typeof item === "string") return null;
  return item.params || null;
}

/**
 * Get all service params for a preset.
 * Returns a map of service IDs to their parameter overrides.
 * @param {string} presetName - Name of preset
 * @returns {Record<string, Record<string, any>>} Map of service ID to params
 */
export function getPresetAllServiceParams(presetName) {
  const preset = PRESETS[presetName];
  if (!preset || !preset.services) return {};

  const result = {};
  preset.services.forEach((item) => {
    if (typeof item !== "string" && item.params) {
      result[item.id] = item.params;
    }
  });
  return result;
}

/**
 * Legacy preset map for backwards compatibility.
 * Dynamically generates normalized task lists (service IDs only) when accessed.
 * For params, use getPresetServiceParams() or getPresetAllServiceParams().
 *
 * @example
 * const generalTasks = PRESET_MAP.general;
 * const completeTasks = PRESET_MAP["complete"];
 * // To get params, use getPresetAllServiceParams("complete")
 */
export const PRESET_MAP = new Proxy(
  {},
  {
    get(target, prop) {
      if (typeof prop === "string" && PRESETS[prop]) {
        return getPresetServices(prop);
      }
      return [];
    },
  }
);
