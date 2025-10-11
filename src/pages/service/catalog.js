/**
 * Service Registry (catalog.js)
 * ---------------------------------------------------------------------------
 * Central catalog of all available service handlers.
 *
 * All services are now defined using the handler system in handlers/.
 * Each handler is a self-contained module with service definition, tech renderer,
 * and customer metrics extractor.
 *
 * HOW TO ADD A NEW SERVICE:
 * 1. Create a handler in src/pages/service/handlers/[service_id]/
 * 2. Use the template at handlers/_TEMPLATE/index.js
 * 3. Register in handlers/index.js
 * 4. Handler will automatically appear in this catalog
 *
 * See docs/HANDLER_MIGRATION_GUIDE.md for detailed instructions.
 */

// =============================================================================
// HANDLER INTEGRATION
// =============================================================================

import { getServiceDefinitions } from "./handlers/index.js";

/**
 * @typedef {Object} ServiceBuildArgs
 * @property {Object<string, any>=} params - UI parameters for this service.
 * @property {(keyOrKeys: string|string[]) => Promise<string|null>} resolveToolPath - Resolve tool executable path(s).
 * @property {() => Promise<Record<string, string>>} getDataDirs - Resolve data directories (reports, programs, etc.).
 */

/**
 * @typedef {Object} ServiceDef
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {Object<string, any>=} defaultParams
 * @property {string=} category - UI category used for grouping in the picker
 * @property {string[]=} toolKeys
 * @property {(args: ServiceBuildArgs) => Promise<Record<string, any>>} build
 */

/**
 * Central catalog of services available to the run builder.
 * All services are loaded from handlers.
 *
 * @type {Record<string, ServiceDef>}
 */
export const SERVICES = getServiceDefinitions();

/**
 * @returns {string[]} All service IDs in display order.
 */
export function listServiceIds() {
  return Object.keys(SERVICES);
}

/**
 * @param {string} id
 * @returns {ServiceDef|null}
 */
export function getServiceById(id) {
  return SERVICES[id] || null;
}

/**
 * @param {string} id
 * @returns {string[]} Tool keys this service depends on (may be empty).
 */
export function toolKeysForService(id) {
  const s = getServiceById(id);
  return (s && s.toolKeys) || [];
}
