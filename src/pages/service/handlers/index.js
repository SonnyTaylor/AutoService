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
// import * as batteryHealth from './battery_health/index.js';

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
  // battery_health: batteryHealth,
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
 * @returns {Record<string, Function>} Map of service ID to tech renderer function
 */
export function getTechRenderers() {
  const renderers = {};
  for (const [id, handler] of Object.entries(HANDLERS)) {
    if (handler.renderTech) {
      renderers[id] = handler.renderTech;
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
