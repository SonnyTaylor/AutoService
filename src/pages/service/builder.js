/**
 * Service Run Builder (run.js)
 * --------------------------------------------------------------
 * @file
 * UI logic for building an ordered queue of diagnostic/maintenance tasks.
 * Produces a JSON spec the Python runner understands, with light validation
 * against available tools. This module is browser-side (Tauri webview).
 *
 * Responsibilities:
 *  - Present list of available maintenance/stress tasks.
 *  - Allow selecting & ordering tasks (keyboard + mouse drag reordering).
 *  - Expose per-task parameter controls (durations) inline.
 *  - Provide GPU Stress parent task with sub-options (FurMark / HeavyLoad) where FurMark defaults on.
 *  - Generate JSON spec (similar to test_all.json) stored in sessionStorage for next page.
 *  - Resolve tool executable paths via tools.js (no hard-coded versioned paths).
 *  - Internal documentation for future contributors.
 *
 * Notes for contributors:
 *  - Do not hard-code versioned paths to executables. Use `resolveToolPath` provided
 *    to service builders, which in turn uses `getToolStatuses()`/saved programs.
 *  - Keep this file free of business logic for executing tasks; only build the spec.
 *  - If you add a new service, register it in services.js and it will show here.
 */

import { getToolPath, getToolStatuses } from "../../utils/tools.js";
import Fuse from "fuse.js";
import Sortable from "sortablejs";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import "highlight.js/styles/github-dark.css";
hljs.registerLanguage("json", jsonLang);
import {
  SERVICES,
  listServiceIds,
  getServiceById,
  toolKeysForService,
} from "./catalog.js";

/**
 * @typedef {Object} ToolStatus
 * @property {string} key - Logical tool key (e.g., "bleachbit", "furmark").
 * @property {boolean} exists - Whether the tool was found on disk.
 * @property {string=} path - Resolved executable path if available.
 */

/**
 * @typedef {Object} ProgramEntry
 * @property {string} name - Display/program name.
 * @property {string=} description - Optional description.
 * @property {string} exe_path - Relative or absolute path to the executable.
 * @property {boolean} exe_exists - Whether the exe is present.
 */

/**
 * @typedef {Object} DataDirs
 * @property {string=} data - Root of the data directory (usually `data/`).
 * @property {string=} programs - Convenience pointer to `data/programs/`.
 */

// ---- Constants ------------------------------------------------------------
const GPU_PARENT_ID = "gpu_stress_parent";
const PERSIST_KEY = "service.run.builder.v1";

const PRESET_MAP = {
  general: [
    "adwcleaner_clean",
    "bleachbit_clean",
    "sfc_scan",
    "dism_health_check",
    "smartctl_report",
    "battery_health",
    "speedtest",
  ],
  complete: [
    "adwcleaner_clean",
    "bleachbit_clean",
    "dism_health_check",
    "sfc_scan",
    "smartctl_report",
    GPU_PARENT_ID,
    "heavyload_stress_cpu",
    "heavyload_stress_memory",
    "battery_health",
    "speedtest",
  ],
  custom: [],
  diagnostics: ["sfc_scan", "dism_health_check", "smartctl_report"],
};

// ---- Utility Helpers ------------------------------------------------------
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

let TOOL_CACHE = null;
let PROGRAMS_CACHE = null;
let DATA_DIRS_CACHE = null;

/**
 * Resolve a tool's absolute executable path using multiple strategies
 */
async function toolPath(keyOrKeys) {
  if (!TOOL_CACHE) TOOL_CACHE = await getToolStatuses();
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  for (const k of keys) {
    const hit = TOOL_CACHE.find((t) => t.key === k);
    if (hit?.path) return hit.path;
  }
  const progs = await listPrograms();
  const dirs = await getDataDirs();
  if (Array.isArray(progs)) {
    for (const k of keys) {
      const lower = String(k || "").toLowerCase();
      const entry = progs.find((p) => {
        const hay = `${p.name} ${p.description} ${p.exe_path}`.toLowerCase();
        return p.exe_exists && hay.includes(lower);
      });
      if (entry && entry.exe_path) {
        return resolveProgramFullPath(entry.exe_path, dirs);
      }
    }
  }
  return null;
}

async function listPrograms() {
  if (PROGRAMS_CACHE) return PROGRAMS_CACHE;
  try {
    const { core } = window.__TAURI__ || {};
    const inv = core?.invoke;
    PROGRAMS_CACHE = inv ? await inv("list_programs") : [];
  } catch {
    PROGRAMS_CACHE = [];
  }
  return PROGRAMS_CACHE;
}

async function getDataDirs() {
  if (DATA_DIRS_CACHE) return DATA_DIRS_CACHE;
  try {
    const { core } = window.__TAURI__ || {};
    const inv = core?.invoke;
    DATA_DIRS_CACHE = inv ? await inv("get_data_dirs") : {};
  } catch {
    DATA_DIRS_CACHE = {};
  }
  return DATA_DIRS_CACHE;
}

function resolveProgramFullPath(exePath, dirs) {
  if (!exePath) return null;
  if (/^[a-zA-Z]:\\|^\\\\/.test(exePath)) return exePath;
  const dataRoot = dirs?.data;
  const programsDir = dirs?.programs;
  if (dataRoot) {
    return dataRoot.replace(/[\\/]+$/, "") + "/" + exePath.replace(/^\/+/, "");
  }
  if (programsDir) {
    return (
      programsDir.replace(/[\\/]+$/, "") + "/" + exePath.replace(/^\/+/, "")
    );
  }
  return exePath;
}

// ---- Service Queue Builder Class ------------------------------------------
/**
 * Manages the service queue builder state and operations
 */
class ServiceQueueBuilder {
  constructor(preset = null, mode = null) {
    this.preset = preset;
    this.mode = mode;

    // Core state
    this.order = [];
    this.selection = new Set();
    this.taskParams = {};
    this.gpuConfig = {
      subs: { furmark: true, heavyload: false },
      params: { furmarkMinutes: 1, heavyloadMinutes: 1 },
    };
    this.toolStatuses = [];

    // Search state
    this.fuse = null;
    this.filterQuery = "";

    // UI elements
    this.elements = {};

    // Sortable instance
    this.sortableInstance = null;
  }

  /**
   * Initialize with DOM elements
   */
  setElements(elements) {
    this.elements = elements;
  }

  /**
   * Initialize default task parameters from service definitions
   */
  initializeDefaultParams() {
    listServiceIds().forEach((id) => {
      const def = getServiceById(id);
      if (!def) return;
      if (!this.taskParams[id] && def.defaultParams) {
        this.taskParams[id] = { params: { ...def.defaultParams } };
      }
    });
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName) {
    const base = PRESET_MAP[presetName] || PRESET_MAP.custom;
    base.forEach((id) => {
      this.selection.add(id);
      this.order.push(id);
    });
  }

  /**
   * Save current state to sessionStorage
   */
  persist() {
    try {
      const data = {
        preset: this.preset || this.mode || null,
        order: this.order,
        selection: [...this.selection],
        state: this.taskParams,
        gpuSubs: this.gpuConfig.subs,
        gpuParams: this.gpuConfig.params,
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data));
    } catch {}
  }

  /**
   * Restore state from sessionStorage
   * @returns {boolean} true if restored successfully
   */
  restore() {
    try {
      const raw = sessionStorage.getItem(PERSIST_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.order)) return false;

      const currentPreset = this.preset || this.mode || null;
      if (data.preset !== currentPreset) {
        return false;
      }

      this.order = data.order;
      this.selection.clear();
      (data.selection || []).forEach((id) => this.selection.add(id));
      Object.assign(this.taskParams, data.state || {});
      Object.assign(this.gpuConfig.subs, data.gpuSubs || {});
      Object.assign(this.gpuConfig.params, data.gpuParams || {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset to default state
   */
  reset() {
    sessionStorage.removeItem(PERSIST_KEY);
    this.order = [];
    this.selection.clear();
    Object.keys(this.taskParams).forEach((k) => delete this.taskParams[k]);
    this.gpuConfig.subs = { furmark: true, heavyload: false };
    this.gpuConfig.params = { furmarkMinutes: 1, heavyloadMinutes: 1 };

    const base = this.preset
      ? PRESET_MAP[this.preset]
      : PRESET_MAP[this.mode] || PRESET_MAP.custom;
    base.forEach((id) => {
      this.selection.add(id);
      this.order.push(id);
    });

    this.initializeDefaultParams();
  }

  /**
   * Add a task to the selection
   */
  addTask(id) {
    this.selection.add(id);
    if (!this.order.includes(id)) {
      this.order.push(id);
    }
  }

  /**
   * Remove a task from the selection
   */
  removeTask(id) {
    this.selection.delete(id);
    // Keep in order for position preservation
  }

  /**
   * Select all tasks
   */
  selectAll() {
    const all = listServiceIds().concat(GPU_PARENT_ID);
    all.forEach((id) => this.selection.add(id));
    all.forEach((id) => {
      if (!this.order.includes(id)) this.order.push(id);
    });
  }

  /**
   * Deselect all tasks
   */
  deselectAll() {
    this.selection.clear();
  }

  /**
   * Move a task in the order array
   */
  moveInOrder(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const id = this.order.splice(fromIndex, 1)[0];
    this.order.splice(toIndex, 0, id);
  }

  /**
   * Update task parameters
   */
  updateTaskParam(taskId, paramKey, paramValue) {
    if (!this.taskParams[taskId]) {
      this.taskParams[taskId] = { params: {} };
    }
    this.taskParams[taskId].params[paramKey] = paramValue;
  }

  /**
   * Update GPU sub-task configuration
   */
  updateGpuSub(subKey, enabled) {
    this.gpuConfig.subs[subKey] = enabled;
  }

  /**
   * Update GPU parameter
   */
  updateGpuParam(paramKey, value) {
    this.gpuConfig.params[paramKey] = value;
  }

  /**
   * Build fuzzy search index
   */
  buildSearchIndex() {
    const items = listServiceIds().map((id) => {
      const def = getServiceById(id) || {};
      return {
        id,
        label: def.label || id,
        group: def.group || "",
        keywords: [],
      };
    });
    items.push({
      id: GPU_PARENT_ID,
      label: "GPU Stress",
      group: "Stress",
      keywords: ["gpu", "stress", "graphics", "furmark", "heavyload"],
    });
    this.fuse = new Fuse(items, {
      keys: [
        { name: "label", weight: 0.6 },
        { name: "id", weight: 0.2 },
        { name: "group", weight: 0.1 },
        { name: "keywords", weight: 0.1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  /**
   * Apply search filter to task IDs
   */
  applyFilter(ids) {
    if (!this.filterQuery) return ids;
    if (!this.fuse) this.buildSearchIndex();
    const results = this.fuse.search(this.filterQuery);
    const allowed = new Set(results.map((r) => r.item.id));
    return ids.filter((id) => allowed.has(id));
  }

  /**
   * Set search query
   */
  setFilterQuery(query) {
    this.filterQuery = query;
  }

  /**
   * Get display order with filtering applied
   */
  getDisplayOrder() {
    const allTasks = listServiceIds().concat(GPU_PARENT_ID);
    const displayOrder = [];
    const seen = new Set();

    // Add existing order first
    for (const id of this.order) {
      if (!allTasks.includes(id)) continue;
      if (["furmark_stress_test", "heavyload_stress_gpu"].includes(id))
        continue;
      if (!seen.has(id)) {
        seen.add(id);
        displayOrder.push(id);
      }
    }

    // Add remaining tasks
    for (const id of allTasks) {
      if (["furmark_stress_test", "heavyload_stress_gpu"].includes(id))
        continue;
      if (!seen.has(id)) {
        seen.add(id);
        displayOrder.push(id);
      }
    }

    // Apply filter
    if (this.filterQuery) {
      const base = displayOrder.filter((id) => id !== GPU_PARENT_ID);
      const filtered = this.applyFilter(base);
      if (this.applyFilter([GPU_PARENT_ID]).includes(GPU_PARENT_ID)) {
        filtered.push(GPU_PARENT_ID);
      }
      return filtered;
    }

    return displayOrder;
  }

  /**
   * Generate tasks array for JSON export
   */
  async generateTasksArray() {
    const result = [];
    for (const id of this.order) {
      if (!this.selection.has(id)) continue;

      if (id === GPU_PARENT_ID) {
        if (this.gpuConfig.subs.furmark) {
          const furmarkDef = getServiceById("furmark_stress_test");
          if (furmarkDef) {
            result.push(
              await furmarkDef.build({
                params: { minutes: this.gpuConfig.params.furmarkMinutes },
                resolveToolPath: toolPath,
                getDataDirs,
              })
            );
          }
        }
        if (this.gpuConfig.subs.heavyload) {
          const heavyloadDef = getServiceById("heavyload_stress_gpu");
          if (heavyloadDef) {
            result.push(
              await heavyloadDef.build({
                params: { minutes: this.gpuConfig.params.heavyloadMinutes },
                resolveToolPath: toolPath,
                getDataDirs,
              })
            );
          }
        }
        continue;
      }

      const def = getServiceById(id);
      if (!def) continue;
      const built = await def.build({
        params: (this.taskParams[id] && this.taskParams[id].params) || {},
        resolveToolPath: toolPath,
        getDataDirs,
      });
      result.push(built);
    }

    return result.filter(
      (t) => !("executable_path" in t) || !!t.executable_path
    );
  }

  /**
   * Count runnable tasks
   */
  countRunnableTasks() {
    const tasks = this.order.filter((id) => this.selection.has(id));
    let count = 0;

    for (const id of tasks) {
      if (id === GPU_PARENT_ID) {
        const furmarkRunnable =
          this.gpuConfig.subs.furmark &&
          this.isToolAvailable(["furmark", "furmark2"]);
        const heavyloadRunnable =
          this.gpuConfig.subs.heavyload && this.isToolAvailable(["heavyload"]);
        if (furmarkRunnable || heavyloadRunnable) {
          count++;
        }
        continue;
      }

      const key = toolKeysForService(id);
      if (Array.isArray(key) && key.length === 0) {
        count++;
      } else if (!key || this.isToolAvailable(key)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if a tool is available
   */
  isToolAvailable(keyOrKeys) {
    if (!keyOrKeys) return true;
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

    const okByStatus = keys.some((k) => {
      const hit = this.toolStatuses.find((t) => t.key === k);
      return !!(hit && hit.exists);
    });
    if (okByStatus) return true;

    const list = Array.isArray(PROGRAMS_CACHE) ? PROGRAMS_CACHE : [];
    return keys.some((k) => {
      const key = String(k).toLowerCase();
      return list.some((p) => {
        if (!p.exe_exists) return false;
        const hay = `${p.name} ${p.description} ${p.exe_path}`.toLowerCase();
        return hay.includes(key);
      });
    });
  }

  /**
   * Load tool statuses
   */
  async loadToolStatuses() {
    this.toolStatuses = await getToolStatuses();
    try {
      const { core } = window.__TAURI__ || {};
      const inv = core?.invoke;
      PROGRAMS_CACHE = inv ? await inv("list_programs") : [];
    } catch {
      PROGRAMS_CACHE = [];
    }
  }
}

// ---- UI Controller Class --------------------------------------------------
/**
 * Manages the UI for the Service Queue Builder
 */
class BuilderUI {
  constructor(builder) {
    this.builder = builder;
    this.elements = {};
    this.lastJsonString = "{}";
    this.sortableInstance = null;
  }

  /**
   * Initialize UI elements and event listeners
   */
  initialize() {
    // Get DOM elements
    this.elements = {
      desc: document.getElementById("svc-run-desc"),
      title: document.getElementById("svc-run-title"),
      palette: document.getElementById("svc-task-palette"),
      builder: document.getElementById("svc-run-builder"),
      json: document.getElementById("svc-json"),
      nextBtn: document.getElementById("svc-run-next"),
      backBtn: document.getElementById("svc-run-back"),
      btnSelectAll: document.getElementById("svc-select-all"),
      btnDeselectAll: document.getElementById("svc-deselect-all"),
      btnReset: document.getElementById("svc-reset"),
      btnCopyJson: document.getElementById("svc-copy-json"),
      searchInput: document.getElementById("svc-search"),
      searchClear: document.getElementById("svc-search-clear"),
    };

    this.builder.setElements(this.elements);
    this.setupEventListeners();
    this.setTitle();
  }

  /**
   * Set page title based on preset/mode
   */
  setTitle() {
    if (this.builder.preset) {
      this.elements.title.textContent = `Preset: ${capitalize(
        this.builder.preset
      )} – Build Run Queue`;
      this.elements.desc.textContent =
        "Reorder or tweak tasks before execution.";
    } else if (this.builder.mode === "custom") {
      this.elements.title.textContent = "Custom Service – Build Run Queue";
      this.elements.desc.textContent = "Pick tasks, arrange order, then Next.";
    } else {
      this.elements.title.textContent = "Build Run Queue";
      this.elements.desc.textContent = "Select tasks for this run.";
    }
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    this.elements.backBtn?.addEventListener("click", () => {
      window.location.hash = "#/service";
    });

    this.elements.nextBtn?.addEventListener("click", () => {
      sessionStorage.setItem(
        "service.pendingRun",
        this.elements.json.textContent || "{}"
      );
      window.location.hash = "#/service-report";
    });

    this.elements.searchInput?.addEventListener("input", () => {
      this.builder.setFilterQuery(
        (this.elements.searchInput.value || "").trim()
      );
      this.render();
    });

    this.elements.searchClear?.addEventListener("click", () => {
      this.builder.setFilterQuery("");
      if (this.elements.searchInput) this.elements.searchInput.value = "";
      this.render();
    });

    this.elements.btnSelectAll?.addEventListener("click", () => {
      this.builder.selectAll();
      this.builder.persist();
      this.render();
    });

    this.elements.btnDeselectAll?.addEventListener("click", () => {
      this.builder.deselectAll();
      this.builder.persist();
      this.render();
    });

    this.elements.btnReset?.addEventListener("click", () => {
      this.builder.reset();
      this.render();
    });

    this.elements.btnCopyJson?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.lastJsonString || "{}");
        this.elements.btnCopyJson.textContent = "Copied";
        setTimeout(
          () => (this.elements.btnCopyJson.textContent = "Copy JSON"),
          1200
        );
      } catch {}
    });

    // Keyboard reordering
    this.elements.palette?.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      const row = e.target?.closest?.(".task-item");
      if (!row) return;
      const id = row.dataset.id;
      if (!id) return;
      const idx = this.builder.order.indexOf(id);
      if (e.key === "ArrowUp" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.builder.moveInOrder(idx, Math.max(0, idx - 1));
        this.builder.persist();
        this.render();
      } else if (e.key === "ArrowDown" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.builder.moveInOrder(
          idx,
          Math.min(this.builder.order.length - 1, idx + 1)
        );
        this.builder.persist();
        this.render();
      }
    });
  }

  /**
   * Render parameter controls for a task
   */
  renderParamControls(id, params) {
    const wrapper = document.createElement("div");
    wrapper.className = "param-controls";

    [
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "pointerdown",
      "touchstart",
    ].forEach((evt) => {
      wrapper.addEventListener(evt, (e) => e.stopPropagation());
    });

    // Special UI for CHKDSK
    if (id === "chkdsk_scan") {
      const driveVal = params?.drive ?? "C:";
      const modeVal = params?.mode ?? "read_only";
      const schedVal = !!params?.schedule_if_busy;
      wrapper.innerHTML = `
        <label class="tiny-lab" style="margin-right:8px;">
          <span class="lab">Drive</span>
          <input type="text" class="text-input" data-param="drive" value="${driveVal}" size="4" aria-label="Drive letter (e.g., C:)" />
        </label>
        <label class="tiny-lab" style="margin-right:8px;">
          <span class="lab">Mode</span>
          <select data-param="mode" aria-label="CHKDSK mode">
            <option value="read_only" ${
              modeVal === "read_only" ? "selected" : ""
            }>Read-only</option>
            <option value="fix_errors" ${
              modeVal === "fix_errors" ? "selected" : ""
            }>Fix errors (/f)</option>
            <option value="comprehensive" ${
              modeVal === "comprehensive" ? "selected" : ""
            }>Comprehensive (/f /r)</option>
          </select>
        </label>
        <label class="tiny-lab">
          <input type="checkbox" data-param="schedule_if_busy" ${
            schedVal ? "checked" : ""
          } />
          <span class="lab">Schedule if busy</span>
        </label>
      `;

      const driveInput = wrapper.querySelector('input[data-param="drive"]');
      const modeSelect = wrapper.querySelector('select[data-param="mode"]');
      const schedCb = wrapper.querySelector(
        'input[data-param="schedule_if_busy"]'
      );

      [driveInput, modeSelect, schedCb].forEach((el) => {
        ["mousedown", "pointerdown", "click"].forEach((evt) => {
          el.addEventListener(evt, (e) => e.stopPropagation());
        });
      });

      driveInput.addEventListener("change", () => {
        this.builder.updateTaskParam(
          id,
          "drive",
          (driveInput.value || "C:").trim()
        );
        this.updateJson();
      });
      modeSelect.addEventListener("change", () => {
        this.builder.updateTaskParam(id, "mode", modeSelect.value);
        this.updateJson();
      });
      schedCb.addEventListener("change", () => {
        this.builder.updateTaskParam(id, "schedule_if_busy", !!schedCb.checked);
        this.updateJson();
      });

      return wrapper;
    }

    // KVRT options
    if (id === "kvrt_scan") {
      const allVolumesVal = !!params?.allVolumes;
      const processLevelVal = Number.isFinite(params?.processLevel)
        ? Math.max(0, Math.min(3, parseInt(params.processLevel, 10)))
        : 2;

      wrapper.innerHTML = `
        <label class="tiny-lab" style="margin-right:12px;" title="Add all volumes to scan">
          <input type="checkbox" data-param="allVolumes" ${
            allVolumesVal ? "checked" : ""
          } />
          <span class="lab">Scan all volumes</span>
        </label>
        <label class="tiny-lab" style="margin-right:12px;" title="Set the level of danger of objects to be neutralized">
          <span class="lab">Process level</span>
          <select data-param="processLevel" aria-label="KVRT process level">
            <option value="0" ${
              processLevelVal === 0 ? "selected" : ""
            }>0: Skip all</option>
            <option value="1" ${
              processLevelVal === 1 ? "selected" : ""
            }>1: High</option>
            <option value="2" ${
              processLevelVal === 2 ? "selected" : ""
            }>2: High+Medium</option>
            <option value="3" ${
              processLevelVal === 3 ? "selected" : ""
            }>3: High+Medium+Low</option>
          </select>
        </label>
      `;

      wrapper.style.display = "flex";
      wrapper.style.flexWrap = "wrap";
      wrapper.style.alignItems = "center";
      wrapper.style.columnGap = "12px";
      wrapper.style.rowGap = "6px";

      wrapper.querySelectorAll("input, select").forEach((el) => {
        ["mousedown", "pointerdown", "click"].forEach((evt) => {
          el.addEventListener(evt, (e) => e.stopPropagation());
        });
      });

      if (!this.builder.taskParams[id]) {
        this.builder.taskParams[id] = { params: {} };
      }
      this.builder.taskParams[id].params.allVolumes = allVolumesVal;
      this.builder.taskParams[id].params.processLevel = processLevelVal;
      this.builder.taskParams[id].params.details = true;

      const cbAll = wrapper.querySelector('input[data-param="allVolumes"]');
      const selProc = wrapper.querySelector(
        'select[data-param="processLevel"]'
      );

      cbAll?.addEventListener("change", () => {
        this.builder.updateTaskParam(id, "allVolumes", !!cbAll.checked);
        this.updateJson();
      });
      selProc?.addEventListener("change", () => {
        const v = parseInt(selProc.value, 10);
        this.builder.updateTaskParam(
          id,
          "processLevel",
          Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : 2
        );
        this.updateJson();
      });

      return wrapper;
    }

    // Generic duration controls
    Object.entries(params).forEach(([key, value]) => {
      if (key === "seconds") {
        wrapper.innerHTML += `<label class="tiny-lab"><span class="lab">Duration</span> <input type="number" class="minutes-input" min="10" max="3600" step="10" data-param="seconds" value="${value}" aria-label="Duration in seconds" /> <span class="unit">sec</span></label>`;
      } else if (key === "minutes") {
        wrapper.innerHTML += `<label class="tiny-lab"><span class="lab">Duration</span> <input type="number" class="minutes-input" min="1" max="240" step="1" data-param="minutes" value="${value}" aria-label="Duration in minutes" /> <span class="unit">min</span></label>`;
      }
    });

    wrapper.querySelectorAll("input").forEach((inp) => {
      ["mousedown", "pointerdown", "click"].forEach((evt) => {
        inp.addEventListener(evt, (e) => e.stopPropagation());
      });
      inp.addEventListener("change", () => {
        this.builder.updateTaskParam(
          id,
          inp.dataset.param,
          Number(inp.value) ||
            this.builder.taskParams[id]?.params[inp.dataset.param]
        );
        this.updateJson();
      });
    });

    return wrapper;
  }

  /**
   * Render GPU sub-options
   */
  renderGpuSubOptions() {
    const div = document.createElement("div");
    div.className = "gpu-sub";
    div.innerHTML = `
      <div class="gpu-line">
        <label class="gpu-check"><input type="checkbox" data-sub="furmark" ${
          this.builder.gpuConfig.subs.furmark ? "checked" : ""
        }> FurMark</label>
        <span class="sep">•</span> <span class="lab">Duration</span>
        <input type="number" class="dur" data-sub-dur="furmarkMinutes" value="${
          this.builder.gpuConfig.params.furmarkMinutes
        }" min="1" max="240" step="1" aria-label="FurMark duration in minutes"/>
        <span class="unit">min</span>
      </div>
      <div class="gpu-line">
        <label class="gpu-check"><input type="checkbox" data-sub="heavyload" ${
          this.builder.gpuConfig.subs.heavyload ? "checked" : ""
        }> HeavyLoad</label>
        <span class="sep">•</span> <span class="lab">Duration</span>
        <input type="number" class="dur" data-sub-dur="heavyloadMinutes" value="${
          this.builder.gpuConfig.params.heavyloadMinutes
        }" min="1" max="240" step="1" aria-label="HeavyLoad duration in minutes"/>
        <span class="unit">min</span>
      </div>
    `;

    div.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        this.builder.updateGpuSub(cb.dataset.sub, cb.checked);
        this.updateJson();
      })
    );

    div.querySelectorAll("input.dur").forEach((inp) => {
      ["mousedown", "pointerdown", "click", "dblclick", "touchstart"].forEach(
        (evt) => {
          inp.addEventListener(evt, (e) => e.stopPropagation());
        }
      );
      inp.addEventListener("change", () => {
        this.builder.updateGpuParam(
          inp.dataset.subDur,
          Number(inp.value) || this.builder.gpuConfig.params[inp.dataset.subDur]
        );
        this.updateJson();
      });
    });

    return div;
  }

  /**
   * Render a single task item
   */
  renderItem(id) {
    const isGpuParent = id === GPU_PARENT_ID;
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.id = id;

    const selected = this.builder.selection.has(id);
    let orderIdx = null;
    if (selected) {
      const selectedOrder = this.builder.order.filter((x) =>
        this.builder.selection.has(x)
      );
      const idx = selectedOrder.indexOf(id);
      orderIdx = idx >= 0 ? idx + 1 : null;
    }

    const svcDef = getServiceById(id);
    const label = isGpuParent ? "GPU Stress" : svcDef?.label || id;
    const group = isGpuParent ? "Stress" : svcDef?.group || "";

    li.innerHTML = `
      <div class="task-row">
        <input type="checkbox" ${
          selected ? "checked" : ""
        } aria-label="Select task ${label}">
        <span class="grab" aria-hidden="true">⋮⋮</span>
        <span class="main">
          <span class="name">${label}</span>
          <span class="meta">${group} ${this.renderAvailabilityBadge(id)}</span>
        </span>
      </div>
    `;

    const row = li.querySelector(".task-row");
    const checkbox = row.querySelector("input");

    if (orderIdx) {
      const pill = document.createElement("span");
      pill.className = "order-pill";
      pill.textContent = orderIdx;
      row.appendChild(pill);
    }

    if (!isGpuParent && selected && getServiceById(id)?.defaultParams) {
      const p = this.builder.taskParams[id]?.params || {};
      const hasGenericParams =
        Object.prototype.hasOwnProperty.call(p, "minutes") ||
        Object.prototype.hasOwnProperty.call(p, "seconds") ||
        id === "chkdsk_scan" ||
        id === "kvrt_scan";
      if (hasGenericParams) {
        row.appendChild(this.renderParamControls(id, p));
      }
    }

    if (isGpuParent && selected) {
      row.appendChild(this.renderGpuSubOptions());
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.builder.addTask(id);
      } else {
        this.builder.removeTask(id);
      }
      this.builder.persist();
      this.render();
    });

    return li;
  }

  /**
   * Render availability badge
   */
  renderAvailabilityBadge(id) {
    if (
      id === "sfc_scan" ||
      id === "dism_health_check" ||
      id === "chkdsk_scan"
    ) {
      return '<span class="badge ok" title="Built-in Windows tool">Built-in</span>';
    }

    if (id === GPU_PARENT_ID) {
      const okF = this.builder.isToolAvailable(["furmark", "furmark2"]);
      const okH = this.builder.isToolAvailable(["heavyload"]);
      const any = okF || okH;
      const title = `FurMark: ${okF ? "Available" : "Missing"} | HeavyLoad: ${
        okH ? "Available" : "Missing"
      }`;
      return `<span class="badge ${any ? "ok" : "missing"}" title="${title}">${
        any ? "Available" : "Missing"
      }</span>`;
    }

    const key = toolKeysForService(id);
    if (Array.isArray(key) && key.length === 0) {
      return '<span class="badge ok" title="Built-in">Built-in</span>';
    }
    if (!key) return "";

    const ok = this.builder.isToolAvailable(key);
    return `<span class="badge ${ok ? "ok" : "missing"}">${
      ok ? "Available" : "Missing"
    }</span>`;
  }

  /**
   * Render the complete palette
   */
  render() {
    this.elements.palette.innerHTML = "";

    // Destroy old Sortable
    if (this.elements.palette.__sortable) {
      try {
        this.elements.palette.__sortable.destroy();
      } catch {}
      this.elements.palette.__sortable = null;
    }

    const finalOrder = this.builder.getDisplayOrder();
    const selectedIds = finalOrder.filter((id) =>
      this.builder.selection.has(id)
    );
    const unselectedIds = finalOrder.filter(
      (id) => !this.builder.selection.has(id)
    );

    const getCategory = (id) => {
      if (id === GPU_PARENT_ID) return "Stress";
      const def = getServiceById(id) || {};
      return def.category || def.group || "Other";
    };

    // Render Queue block
    const queueBlock = document.createElement("div");
    queueBlock.className = "group-block queue-block";
    queueBlock.innerHTML = `
      <div class="group-title">Queue</div>
      <ul id="svc-queue-list" class="task-list queue-list" aria-label="Selected tasks"></ul>
    `;
    this.elements.palette.appendChild(queueBlock);
    const queueListEl = queueBlock.querySelector("#svc-queue-list");
    selectedIds.forEach((id) => queueListEl.appendChild(this.renderItem(id)));

    if (selectedIds.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "queue-empty";
      placeholder.innerHTML = `
        <span class="icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect x="40" y="56" width="176" height="24" rx="6"/>
            <rect x="40" y="116" width="176" height="24" rx="6" opacity="0.75"/>
            <rect x="40" y="176" width="120" height="24" rx="6" opacity="0.5"/>
          </svg>
        </span>
        <span class="text">No tasks selected. Click a task below to add it to the queue.</span>
      `;
      queueBlock.appendChild(placeholder);
    }

    // Build category map
    const catMap = new Map();
    unselectedIds.forEach((id) => {
      const cat = getCategory(id);
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(id);
    });

    // Render categories
    const priority = [
      "Antivirus",
      "System Integrity",
      "Stress",
      "Diagnostics",
      "Network",
      "Other",
    ];
    const rank = (name) => {
      const idx = priority.findIndex(
        (p) => p.toLowerCase() === String(name || "").toLowerCase()
      );
      return idx === -1 ? priority.length - 1 : idx;
    };
    const categories = Array.from(catMap.keys()).sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra === rb ? String(a).localeCompare(String(b)) : ra - rb;
    });

    categories.forEach((cat) => {
      const block = document.createElement("div");
      block.className = "group-block category-block";
      block.innerHTML = `
        <div class="group-title">${cat}</div>
        <ul class="task-list" aria-label="${cat} tasks"></ul>
      `;
      const ul = block.querySelector("ul");
      catMap.get(cat).forEach((id) => ul.appendChild(this.renderItem(id)));
      this.elements.palette.appendChild(block);
    });

    this.validateNext();
    this.updateJson();

    // Enable Sortable on Queue list
    if (queueListEl) {
      try {
        if (queueListEl.__sortable) queueListEl.__sortable.destroy();
      } catch {}
      queueListEl.__sortable = Sortable.create(queueListEl, {
        animation: 150,
        draggable: ".task-item",
        handle: ".grab",
        ghostClass: "drag-ghost",
        dragClass: "drag-active",
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 5,
        setData: (dt) => {
          try {
            dt.setData("text", "");
          } catch {}
        },
        filter:
          "input, textarea, select, label, button, .param-controls, .gpu-sub",
        preventOnFilter: true,
        onEnd: () => {
          const newQueueOrder = Array.from(
            queueListEl.querySelectorAll(".task-item")
          )
            .map((li) => li.dataset.id)
            .filter(Boolean);
          const selectedSet = new Set(newQueueOrder);
          const rest = this.builder.order.filter((id) => !selectedSet.has(id));
          this.builder.order = newQueueOrder.concat(rest);
          this.builder.persist();
          this.render();
        },
      });
    }
  }

  /**
   * Update JSON preview
   */
  async updateJson() {
    this.elements.json.textContent = "Generating...";
    const tasks = await this.builder.generateTasksArray();
    this.lastJsonString = JSON.stringify({ tasks }, null, 2);
    const highlighted = hljs.highlight(this.lastJsonString, {
      language: "json",
    }).value;
    this.elements.json.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
    this.builder.persist();
    this.validateNext();
  }

  /**
   * Validate next button state
   */
  validateNext() {
    const runnableCount = this.builder.countRunnableTasks();
    this.elements.nextBtn.disabled =
      runnableCount === 0 || this.builder.selection.size === 0;
  }
}

// ---- Page Initialization --------------------------------------------------
/**
 * Initialize the Service Run Builder page
 */
export async function initPage() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const preset = params.get("preset");
  const mode = params.get("mode");

  // Create builder instance
  const builder = new ServiceQueueBuilder(preset, mode);
  builder.buildSearchIndex();

  // Initialize state
  if (!builder.restore()) {
    builder.applyPreset(preset || mode);
  }
  builder.initializeDefaultParams();

  // Load tool statuses
  await builder.loadToolStatuses();

  // Create UI controller
  const ui = new BuilderUI(builder);
  ui.initialize();

  // Initial render
  ui.render();
  document.getElementById("svc-run-builder").hidden = false;
}
