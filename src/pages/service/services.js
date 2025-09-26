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
  kvrt_scan: {
    id: "kvrt_scan",
    label: "Malware Scan (KVRT)",
    group: "Security",
    defaultParams: {
      allVolumes: false,
      customPath: "",
      quarantineDir: "..\\data\\logs\\KVRT",
      details: true,
      dontEncrypt: true,
      noAds: true,
      fixedNames: true,
      processLevel: 2,
    },
    toolKeys: ["kvrt"],
    async build({ params, resolveToolPath }) {
      const p = await resolveToolPath(["kvrt"]);
      const allVolumes = !!params?.allVolumes;
      const customPath = (params?.customPath || "").toString().trim();
      const processLevel = Number.isFinite(params?.processLevel)
        ? Math.max(0, Math.min(3, parseInt(params.processLevel, 10)))
        : 2;
      const quarantineDir = (params?.quarantineDir || "..\\data\\logs\\KVRT").toString();
      const task = {
        type: "kvrt_scan",
        executable_path: p,
        accept_eula: true,
        silent: true,
        details: !!params?.details,
        dontencrypt: !!params?.dontEncrypt,
        noads: !!params?.noAds,
        fixednames: !!params?.fixedNames,
        processlevel: processLevel,
        quarantine_dir: quarantineDir,
        allvolumes: allVolumes,
        ui_label: `Malware Scan (KVRT${allVolumes ? ": all volumes" : customPath ? ": custom" : ""})`,
      };
      if (!allVolumes && customPath) {
        task.custom_path = customPath;
      }
      return task;
    },
  },
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
  ping_test: {
    id: "ping_test",
    label: "Ping Test",
    group: "Network",
    defaultParams: { host: "" , count: 4 },
    toolKeys: [],
    async build({ params }) {
      // Load default ping host from app settings if not provided
      let host = (params?.host || "").toString();
      if (!host) {
        try {
          const { core } = window.__TAURI__ || {};
          const inv = core?.invoke;
          const settings = inv ? await inv("load_app_settings") : {};
          host = settings?.network?.ping_host || "google.com";
        } catch {}
      }
      const count = parseInt(params?.count ?? 4, 10) || 4;
      return {
        type: "ping_test",
        host,
        count,
        ui_label: `Ping Test (${host}, ${count}x)`,
      };
    },
  },
  chkdsk_scan: {
    id: "chkdsk_scan",
    label: "File System Check (CHKDSK)",
    group: "System Integrity",
    defaultParams: { drive: "C:", mode: "read_only", schedule_if_busy: false },
    toolKeys: [],
    async build({ params }) {
      const drive = (params?.drive || "C:").toString();
      const mode = params?.mode || "read_only"; // read_only | fix_errors | comprehensive
      const schedule = Boolean(params?.schedule_if_busy);
      return {
        type: "chkdsk_scan",
        drive,
        mode,
        schedule_if_busy: schedule,
        ui_label: `CHKDSK (${drive}, ${mode})`,
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
  iperf_test: {
    id: "iperf_test",
    label: "Network Stability (iPerf3)",
    group: "Network",
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
