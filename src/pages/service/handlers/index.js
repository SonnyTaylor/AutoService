/**
 * Service Handler Registry
 * ---------------------------------------------------------------------------
 * Central registry that aggregates all service handlers.
 *
 * Each handler is a self-contained module that exports:
 * - definition: Service catalog definition (id, label, build function, etc.)
 * - renderTech: Technician view renderer function
 * - extractCustomerMetrics: (optional) Customer metric extractor function
 *
 * This registry provides unified access to all handler components for use
 * by the catalog, renderers, and print system.
 */

/**
 * @typedef {import('./types').ServiceHandler} ServiceHandler
 * @typedef {import('./types').ServiceDefinition} ServiceDefinition
 */

// =============================================================================
// HANDLER IMPORTS
// =============================================================================

// Import handlers here as they are migrated.
// Example:
// import * as speedtest from './speedtest/index.js';

import * as diskSpaceReport from "./disk_space_report/index.js";
import * as pingTest from "./ping_test/index.js";
import * as speedtest from "./speedtest/index.js";
import * as sfcScan from "./sfc_scan/index.js";
import * as smartctlReport from "./smartctl_report/index.js";
import * as dismHealthCheck from "./dism_health_check/index.js";
import * as chkdskScan from "./chkdsk_scan/index.js";
import * as bleachbitClean from "./bleachbit_clean/index.js";
import * as adwcleanerClean from "./adwcleaner_clean/index.js";
import * as kvrtScan from "./kvrt_scan/index.js";
import * as windowsUpdate from "./windows_update/index.js";
import * as heavyloadStressCpu from "./heavyload_stress_cpu/index.js";
import * as heavyloadStressMemory from "./heavyload_stress_memory/index.js";
import * as heavyloadStressGpu from "./heavyload_stress_gpu/index.js";
import * as furmarkStressTest from "./furmark_stress_test/index.js";
import * as iperfTest from "./iperf_test/index.js";
import * as winsatDisk from "./winsat_disk/index.js";
import * as whynotwin11Check from "./whynotwin11_check/index.js";
import * as aiStartupDisable from "./ai_startup_disable/index.js";
import * as aiBrowserNotificationDisable from "./ai_browser_notification_disable/index.js";
import * as batteryHealthReport from "./battery_health_report/index.js";
import * as drivecleanupClean from "./drivecleanup_clean/index.js";

// =============================================================================
// REGISTRY CONSTRUCTION
// =============================================================================

/**
 * Map of handler ID to handler module.
 * @type {Record<string, ServiceHandler>}
 */
const HANDLERS = {
  // Add handlers here as they are migrated.
  // Example:
  // speedtest: speedtest,

  disk_space_report: diskSpaceReport,
  ping_test: pingTest,
  speedtest: speedtest,
  sfc_scan: sfcScan,
  smartctl_report: smartctlReport,
  dism_health_check: dismHealthCheck,
  chkdsk_scan: chkdskScan,
  bleachbit_clean: bleachbitClean,
  adwcleaner_clean: adwcleanerClean,
  kvrt_scan: kvrtScan,
  windows_update: windowsUpdate,
  heavyload_stress_cpu: heavyloadStressCpu,
  heavyload_stress_memory: heavyloadStressMemory,
  heavyload_stress_gpu: heavyloadStressGpu,
  furmark_stress_test: furmarkStressTest,
  iperf_test: iperfTest,
  winsat_disk: winsatDisk,
  whynotwin11_check: whynotwin11Check,
  ai_startup_disable: aiStartupDisable,
  ai_browser_notification_disable: aiBrowserNotificationDisable,
  battery_health_report: batteryHealthReport,
  drivecleanup_clean: drivecleanupClean,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get all registered service handlers.
 * @returns {Record<string, ServiceHandler>} Map of handler ID to handler module
 */
export function getHandlers() {
  return HANDLERS;
}

/**
 * Get a specific handler by ID.
 * @param {string} id - Service handler ID
 * @returns {ServiceHandler|null} Handler module or null if not found
 */
export function getHandler(id) {
  return HANDLERS[id] || null;
}

/**
 * Get all service definitions from registered handlers.
 * @returns {Record<string, ServiceDefinition>} Map of service ID to definition
 */
export function getServiceDefinitions() {
  const definitions = {};
  for (const [id, handler] of Object.entries(HANDLERS)) {
    if (handler.definition) {
      definitions[id] = handler.definition;
    }
  }
  return definitions;
}

/**
 * Get all tech renderers from registered handlers.
 * Wraps handler renderTech functions to match legacy signature (result, index).
 * @returns {Record<string, Function>} Map of service ID to tech renderer function
 */
export function getTechRenderers() {
  const renderers = {};
  for (const [id, handler] of Object.entries(HANDLERS)) {
    if (handler.renderTech) {
      // Wrap to convert from (result, index) to ({ result, index })
      renderers[id] = (result, index) => handler.renderTech({ result, index });
    }
  }
  return renderers;
}

/**
 * Get all customer metric extractors from registered handlers.
 * @returns {Record<string, Function>} Map of service ID to extractor function
 */
export function getCustomerMetricExtractors() {
  const extractors = {};
  for (const [id, handler] of Object.entries(HANDLERS)) {
    if (handler.extractCustomerMetrics) {
      extractors[id] = handler.extractCustomerMetrics;
    }
  }
  return extractors;
}

/**
 * Get all print CSS from registered handlers.
 * Returns a concatenated string of all service-specific print CSS rules.
 * @returns {string} Combined CSS string
 */
export function getHandlerPrintCSS() {
  const cssChunks = [];
  for (const [id, handler] of Object.entries(HANDLERS)) {
    if (handler.printCSS && typeof handler.printCSS === "string") {
      // Add a comment to identify the source handler
      cssChunks.push(`/* CSS from handler: ${id} */`);
      cssChunks.push(handler.printCSS);
      cssChunks.push(""); // blank line for readability
    }
  }
  return cssChunks.join("\n");
}

/**
 * Check if a handler is registered.
 * @param {string} id - Service handler ID
 * @returns {boolean} True if handler exists
 */
export function hasHandler(id) {
  return id in HANDLERS;
}

/**
 * Get list of all registered handler IDs.
 * @returns {string[]} Array of handler IDs
 */
export function listHandlerIds() {
  return Object.keys(HANDLERS);
}
