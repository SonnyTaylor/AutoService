/**
 * Service Registry (services.js)
 * ---------------------------------------------------------------------------
 * Purpose: Provide a single, modular source of truth for all services that
 * the UI can render and that `service_runner.exe` understands.
 *
 * HOW TO ADD A NEW SERVICE (example: Battery Report)
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
 *
 * Example skeleton:
 * {
 *   id: 'battery_report',
 *   label: 'Battery Health Report',
 *   group: 'Diagnostics',
 *   defaultParams: { minutes: 0 }, // optional
 *   toolKeys: [], // optional, e.g. ['batteryutil'] if an external tool is needed
 *   async build({ params, resolveToolPath }) {
 *     return {
 *       type: 'battery_report',
 *       detail_level: 'basic',
 *       ui_label: 'Battery Health Report'
 *     };
 *   }
 * }
 */

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
 * @property {string[]=} toolKeys
 * @property {(args: ServiceBuildArgs) => Promise<Record<string, any>>} build
 */

/**
 * Central catalog of services available to the run builder.
 * @type {Record<string, ServiceDef>}
 */
export const SERVICES = {
  adwcleaner_clean: {
    id: "adwcleaner_clean",
    label: "Adware Clean (AdwCleaner)",
    group: "Cleanup",
    toolKeys: ["adwcleaner"],
    async build({ resolveToolPath }) {
      return {
        type: "adwcleaner_clean",
        executable_path: await resolveToolPath("adwcleaner"),
        working_path: "..\\data\\logs",
        clean_preinstalled: false,
        ui_label: "Adware Clean (AdwCleaner)",
      };
    },
  },
  bleachbit_clean: {
    id: "bleachbit_clean",
    label: "Junk Cleanup (BleachBit)",
    group: "Cleanup",
    toolKeys: ["bleachbit"],
    async build({ resolveToolPath }) {
      return {
        type: "bleachbit_clean",
        executable_path: await resolveToolPath("bleachbit"),
        options: ["system.tmp", "system.recycle_bin", "system.prefetch"],
        ui_label: "Junk Cleanup (BleachBit)",
      };
    },
  },
  dism_health_check: {
    id: "dism_health_check",
    label: "DISM Health Check",
    group: "System Integrity",
    toolKeys: [],
    async build() {
      return {
        type: "dism_health_check",
        actions: ["checkhealth", "scanhealth", "restorehealth"],
        ui_label: "DISM Health Check",
      };
    },
  },
  sfc_scan: {
    id: "sfc_scan",
    label: "SFC Scan",
    group: "System Integrity",
    toolKeys: [],
    async build() {
      return { type: "sfc_scan", ui_label: "SFC Scan" };
    },
  },
  smartctl_report: {
    id: "smartctl_report",
    label: "Drive Health Report (smartctl)",
    group: "Diagnostics",
    toolKeys: ["smartctl", "gsmartcontrol"],
    async build({ resolveToolPath }) {
      let pSmart = await resolveToolPath(["smartctl", "gsmartcontrol"]);
      if (pSmart && /gsmartcontrol\.exe$/i.test(pSmart)) {
        pSmart = pSmart.replace(/[^\\\/]+$/g, "smartctl.exe");
      }
      return {
        type: "smartctl_report",
        executable_path: pSmart,
        detail_level: "basic",
        ui_label: "Drive Health Report (smartctl)",
      };
    },
  },
  furmark_stress_test: {
    id: "furmark_stress_test",
    label: "GPU Stress (FurMark)",
    group: "Stress",
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
