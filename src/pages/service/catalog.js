/**
 * Service Registry (catalog.js)
 * ---------------------------------------------------------------------------
 * Purpose: Provide a single, modular source of truth for all services that
 * the UI can render and that `service_runner.exe` understands.
 *
 * MIGRATION IN PROGRESS:
 * Services are being migrated to the new handler system in handlers/.
 * See docs/HANDLER_MIGRATION_GUIDE.md for full instructions.
 *
 * HOW TO ADD A NEW SERVICE:
 *
 * NEW WAY (Recommended):
 * 1. Create a handler in src/pages/service/handlers/[service_id]/
 * 2. Use the template at handlers/_TEMPLATE/index.js
 * 3. Register in handlers/index.js
 *
 * OLD WAY (Legacy - being phased out):
 * 1) Create a new entry in `SERVICES` with a unique `id` (e.g. "battery_report").
 * 2) Fill in: `label`, `group`, optional `defaultParams`, `toolKeys` (if any
 *    external tool is required), and a `build` function that returns the JSON
 *    payload expected by service_runner.
 * 3) The `build` signature is: async ({ params, resolveToolPath, getDataDirs })
 *    - `params` holds UI-configurable parameters (pre-populated from
 *      `defaultParams` when present)
 *    - `resolveToolPath(keys)` resolves an executable path given one or more
 *      tool keys (see tools.js and saved programs)
 *    - `getDataDirs()` returns the data directories from the backend
 * 4) If your runner expects a specific `type`, have the `build` function set
 *    that string; attach an optional `ui_label` to control how the item appears
 *    in the UI without affecting the runner.
 */

// =============================================================================
// HANDLER INTEGRATION (NEW SYSTEM)
// =============================================================================

// Import handler definitions
import { getServiceDefinitions } from "./handlers/index.js";
const HANDLER_DEFINITIONS = getServiceDefinitions();

// =============================================================================
// LEGACY SERVICE DEFINITIONS (TO BE MIGRATED)
// =============================================================================

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
 * @property {string=} category // UI category used for grouping in the picker
 * @property {string[]=} toolKeys
 * @property {(args: ServiceBuildArgs) => Promise<Record<string, any>>} build
 */

/**
 * Central catalog of services available to the run builder.
 *
 * MIGRATION NOTE:
 * Once handlers are migrated, merge them like this:
 * export const SERVICES = {
 *   ...HANDLER_DEFINITIONS,  // Migrated handlers
 *   legacy_service: { ... }  // Remaining legacy definitions
 * };
 *
 * @type {Record<string, ServiceDef>}
 */
export const SERVICES = {
  // Merge handler definitions
  ...HANDLER_DEFINITIONS,

  // ===== ALL SERVICES MIGRATED TO HANDLERS =====

  // All service definitions have been migrated to handlers/
  // See handlers/index.js for the complete list
  // Legacy definitions below are kept for reference only

  /* MIGRATED SERVICES:
  - battery_health: handlers/battery_health/
  - disk_space_report: handlers/disk_space_report/
  - ping_test: handlers/ping_test/
  - speedtest: handlers/speedtest/
  - sfc_scan: handlers/sfc_scan/
  - smartctl_report: handlers/smartctl_report/
  - dism_health_check: handlers/dism_health_check/
  - chkdsk_scan: handlers/chkdsk_scan/
  - bleachbit_clean: handlers/bleachbit_clean/
  - adwcleaner_clean: handlers/adwcleaner_clean/
  - kvrt_scan: handlers/kvrt_scan/
  - windows_update: handlers/windows_update/
  - heavyload_stress_cpu: handlers/heavyload_stress_cpu/
  - heavyload_stress_memory: handlers/heavyload_stress_memory/
  - heavyload_stress_gpu: handlers/heavyload_stress_gpu/
  - furmark_stress_test: handlers/furmark_stress_test/
  - iperf_test: handlers/iperf_test/
  - winsat_disk: handlers/winsat_disk/
  - whynotwin11_check: handlers/whynotwin11_check/
  */
};

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
