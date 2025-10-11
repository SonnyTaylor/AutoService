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

  // ===== LEGACY DEFINITIONS (TO BE MIGRATED) =====

  // speedtest: MIGRATED TO handlers/speedtest/
  // battery_health: MIGRATED TO handlers/battery_health/
  whynotwin11_check: {
    id: "whynotwin11_check",
    label: "Windows 11 Upgrade Check",
    group: "Diagnostics",
    category: "Diagnostics",
    toolKeys: ["whynotwin11"],
    async build({ resolveToolPath }) {
      const p = await resolveToolPath(["whynotwin11", "whynotwin11portable"]);
      return {
        type: "whynotwin11_check",
        executable_path: p,
        ui_label: "Windows 11 Upgrade Check",
      };
    },
  },
  // windows_update: MIGRATED TO handlers/windows_update/
  // kvrt_scan: MIGRATED TO handlers/kvrt_scan/
  // adwcleaner_clean: MIGRATED TO handlers/adwcleaner_clean/
  // ping_test: MIGRATED TO handlers/ping_test/
  // chkdsk_scan: MIGRATED TO handlers/chkdsk_scan/
  // bleachbit_clean: MIGRATED TO handlers/bleachbit_clean/
  // sfc_scan: MIGRATED TO handlers/sfc_scan/
  // smartctl_report: MIGRATED TO handlers/smartctl_report/
  // dism_health_check: MIGRATED TO handlers/dism_health_check/
  furmark_stress_test: {
    id: "furmark_stress_test",
    label: "GPU Stress (FurMark)",
    group: "Stress",
    category: "Stress",
    defaultParams: { minutes: 1 },
    toolKeys: ["furmark", "furmark2"],
    async build({ params, resolveToolPath }) {
      let p = await resolveToolPath(["furmark", "furmark2"]);
      if (p && /furmark_gui\.exe$/i.test(p))
        p = p.replace(/[^\\\/]+$/g, "furmark.exe");
      return {
        type: "furmark_stress_test",
        executable_path: p,
        duration_minutes: params?.minutes || 1,
        width: 1920,
        height: 1080,
        demo: "furmark-gl",
        extra_args: ["--no-gui"],
        ui_label: "GPU Stress (FurMark)",
      };
    },
  },
  heavyload_stress_cpu: {
    id: "heavyload_stress_cpu",
    label: "CPU Stress (HeavyLoad)",
    group: "Stress",
    category: "Stress",
    defaultParams: { minutes: 1 },
    toolKeys: ["heavyload"],
    async build({ params, resolveToolPath }) {
      const p = await resolveToolPath(["heavyload"]);
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: params?.minutes || 1,
        headless: false,
        stress_cpu: true,
        stress_memory: false,
        stress_gpu: false,
        ui_label: "CPU Stress (HeavyLoad)",
      };
    },
  },
  heavyload_stress_memory: {
    id: "heavyload_stress_memory",
    label: "RAM Stress (HeavyLoad)",
    group: "Stress",
    category: "Stress",
    defaultParams: { minutes: 1 },
    toolKeys: ["heavyload"],
    async build({ params, resolveToolPath }) {
      const p = await resolveToolPath(["heavyload"]);
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: params?.minutes || 1,
        headless: false,
        stress_cpu: false,
        stress_memory: true,
        stress_gpu: false,
        ui_label: "RAM Stress (HeavyLoad)",
      };
    },
  },
  heavyload_stress_gpu: {
    id: "heavyload_stress_gpu",
    label: "GPU Stress (HeavyLoad)",
    group: "Stress",
    category: "Stress",
    defaultParams: { minutes: 1 },
    toolKeys: ["heavyload"],
    async build({ params, resolveToolPath }) {
      const p = await resolveToolPath(["heavyload"]);
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: params?.minutes || 1,
        headless: false,
        stress_cpu: false,
        stress_memory: false,
        stress_gpu: true,
        ui_label: "GPU Stress (HeavyLoad)",
      };
    },
  },
  iperf_test: {
    id: "iperf_test",
    label: "Network Stability (iPerf3)",
    group: "Network",
    category: "Network",
    defaultParams: { minutes: 10 },
    toolKeys: ["iperf3"],
    async build({ params, resolveToolPath }) {
      const p = await resolveToolPath(["iperf3"]);
      // Load saved iperf server from app settings
      let server = "";
      try {
        const { core } = window.__TAURI__ || {};
        const inv = core?.invoke;
        const settings = inv ? await inv("load_app_settings") : {};
        server = settings?.network?.iperf_server || "";
      } catch {}

      const minutes = params?.minutes || 10;
      return {
        type: "iperf_test",
        executable_path: p,
        server,
        port: 5201,
        duration_minutes: minutes,
        protocol: "tcp",
        reverse: false,
        parallel_streams: 1,
        omit_seconds: 0,
        interval_seconds: 1,
        stability_threshold_mbps: "20Mbps",
        ui_label: `Network Stability (iPerf3)${
          server ? ` – ${server}` : " (server not set)"
        }`,
      };
    },
  },
  winsat_disk: {
    id: "winsat_disk",
    label: "Disk Benchmark (WinSAT)",
    group: "Diagnostics",
    category: "Diagnostics",
    defaultParams: { drive: "C:", test_mode: "full" },
    toolKeys: [],
    async build({ params }) {
      const drive = (params?.drive || "C:").toString().toUpperCase();
      const test_mode = params?.test_mode || "full";
      const modeLabel =
        {
          full: "Full",
          random_read: "Random Read",
          sequential_read: "Sequential Read",
          sequential_write: "Sequential Write",
          flush: "Flush",
        }[test_mode] || "Full";
      return {
        type: "winsat_disk",
        drive,
        test_mode,
        ui_label: `Disk Benchmark (WinSAT) - ${drive} (${modeLabel})`,
      };
    },
  },
  // disk_space_report: MIGRATED TO handlers/disk_space_report/
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
