/**
 * Service Run Builder
 * --------------------------------------------------------------
 * @file
 * UI logic for building an ordered queue of diagnostic/maintenance tasks.
 * Produces a JSON spec the Python runner understands, with validation
 * against available tools. This module is browser-side (Tauri webview).
 *
 * Architecture:
 *  - Services are defined in handlers/ (see handlers/index.js)
 *  - Each handler can optionally export renderParamControls() for custom UI
 *  - Generic duration controls (minutes/seconds) rendered automatically
 *  - Tool availability checked via handler's toolKeys definition
 *
 * Responsibilities:
 *  - Present list of available maintenance/stress tasks from handlers
 *  - Allow selecting & ordering tasks (keyboard + mouse drag reordering)
 *  - Render parameter controls (handler-provided or generic duration)
 *  - Provide GPU Stress parent task with sub-options (FurMark + HeavyLoad)
 *  - Generate JSON spec stored in sessionStorage for runner
 *  - Resolve tool executable paths dynamically (no hard-coded paths)
 *
 * Notes for contributors:
 *  - Add new services by creating handlers in handlers/ directory
 *  - Use handler.renderParamControls() for custom parameter UI
 *  - Don't hard-code service IDs - use handler system instead
 *  - Tool paths resolved via resolveToolPath() using service's toolKeys
 *  - GPU parent (gpu_stress_parent) is a special UI-only meta-service
 */

import { getToolPath, getToolStatuses } from "../../utils/tools.js";
import Fuse from "fuse.js";
import Sortable from "sortablejs";
import {
  SERVICES,
  listServiceIds,
  getServiceById,
  toolKeysForService,
} from "./catalog.js";
import { getHandler } from "./handlers/index.js";
import {
  PRESET_MAP,
  GPU_PARENT_ID,
  isGpuChild,
  getPresetServiceParams,
  getPresetAllServiceParams,
} from "./handlers/presets.js";

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

const PERSIST_KEY = "service.run.builder.v1";

// ---- Utility Helpers ------------------------------------------------------
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/**
 * Show a temporary success notification
 */
function showSuccessNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification notification-success";
  notification.innerHTML = `<i class="ph ph-check-circle" style="margin-right: 8px; vertical-align: -2px;"></i>${message}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: #10b981;
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 400px;
    font-size: 14px;
    line-height: 1.5;
    animation: slideIn 0.3s ease-out;
    display: flex;
    align-items: center;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      try {
        notification.remove();
      } catch {}
    }, 300);
  }, 3000);
}

/**
 * Get handler module for a service ID
 */
function getHandlerModule(id) {
  return getHandler(id);
}

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
      
      // Special handling for "err" tool - must start with "Err" (case-insensitive)
      // This prevents matching other tools that might contain "err" in their name/path
      if (k === "err") {
        const entry = progs.find((p) => {
          if (!p.exe_exists || !p.exe_path) return false;
          // Extract just the filename from the path
          const exeName = p.exe_path.split(/[\\/]/).pop() || "";
          // Must start with "Err" (case-insensitive)
          return exeName.toLowerCase().startsWith("err");
        });
        if (entry && entry.exe_path) {
          return resolveProgramFullPath(entry.exe_path, dirs);
        }
        // If no match found, don't fall through to fuzzy search
        continue;
      }
      
      // Default fuzzy matching for other tools
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
    this.aiSummaryEnabled = false;
    this.systemRestoreEnabled = false;
    this.pauseBetweenTasks = false;
    this.parallelExecution = false;

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
    // Apply preset parameters (including GPU) after adding selection/order
    this.applyPresetParams(presetName);
  }

  /**
   * Apply only the parameter overrides from a preset without changing selection/order
   */
  applyPresetParams(presetName) {
    if (!presetName) return;
    const presetParams = getPresetAllServiceParams(presetName);
    Object.entries(presetParams).forEach(([serviceId, params]) => {
      if (serviceId === GPU_PARENT_ID) {
        // GPU parent: merge booleans and durations
        if (Object.prototype.hasOwnProperty.call(params, "furmark")) {
          this.gpuConfig.subs.furmark = !!params.furmark;
        }
        if (Object.prototype.hasOwnProperty.call(params, "heavyload")) {
          this.gpuConfig.subs.heavyload = !!params.heavyload;
        }
        if (
          Object.prototype.hasOwnProperty.call(params, "furmarkMinutes") &&
          Number.isFinite(Number(params.furmarkMinutes))
        ) {
          this.gpuConfig.params.furmarkMinutes = Number(params.furmarkMinutes);
        }
        if (
          Object.prototype.hasOwnProperty.call(params, "heavyloadMinutes") &&
          Number.isFinite(Number(params.heavyloadMinutes))
        ) {
          this.gpuConfig.params.heavyloadMinutes = Number(
            params.heavyloadMinutes
          );
        }
        return;
      }

      // Regular service parameters go to taskParams
      if (!this.taskParams[serviceId]) {
        this.taskParams[serviceId] = { params: {} };
      }
      this.taskParams[serviceId].params = {
        ...this.taskParams[serviceId].params,
        ...params,
      };
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
        aiSummaryEnabled: this.aiSummaryEnabled,
        systemRestoreEnabled: this.systemRestoreEnabled,
        pauseBetweenTasks: this.pauseBetweenTasks,
        parallelExecution: this.parallelExecution,
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
      if (typeof data.aiSummaryEnabled === "boolean") {
        this.aiSummaryEnabled = data.aiSummaryEnabled;
      }
      if (typeof data.systemRestoreEnabled === "boolean") {
        this.systemRestoreEnabled = data.systemRestoreEnabled;
      }
      if (typeof data.pauseBetweenTasks === "boolean") {
        this.pauseBetweenTasks = data.pauseBetweenTasks;
      }
      if (typeof data.parallelExecution === "boolean") {
        this.parallelExecution = data.parallelExecution;
      }
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

    // Add GPU parent meta-service to search index
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
      if (isGpuChild(id)) continue; // Skip GPU children (shown via parent)
      if (!seen.has(id)) {
        seen.add(id);
        displayOrder.push(id);
      }
    }

    // Add remaining tasks
    for (const id of allTasks) {
      if (isGpuChild(id)) continue; // Skip GPU children (shown via parent)
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
   * Expands GPU parent into individual FurMark/HeavyLoad tasks based on selection
   * If system restore is enabled, injects it at position 0
   */
  async generateTasksArray() {
    const result = [];
    
    // If system restore is enabled, inject it at the beginning
    if (this.systemRestoreEnabled) {
      result.push({
        type: "system_restore",
        ui_label: "Create System Restore point",
      });
    }
    
    for (const id of this.order) {
      if (!this.selection.has(id)) continue;

      // Special handling: GPU parent expands to real service tasks
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
    this.timeEstimates = null; // Cache for time estimates
  }

  /**
   * Initialize UI elements and event listeners
   */
  async initialize() {
    // Get DOM elements
    this.elements = {
      desc: document.getElementById("svc-run-desc"),
      title: document.getElementById("svc-run-title"),
      palette: document.getElementById("svc-task-palette"),
      builder: document.getElementById("svc-run-builder"),
      nextBtn: document.getElementById("svc-run-next"),
      backBtn: document.getElementById("svc-run-back"),
      btnSelectAll: document.getElementById("svc-select-all"),
      btnDeselectAll: document.getElementById("svc-deselect-all"),
      btnReset: document.getElementById("svc-reset"),
      btnAICreate: document.getElementById("svc-ai-create"),
      searchInput: document.getElementById("svc-search"),
      searchClear: document.getElementById("svc-search-clear"),
      aiSummaryToggle: document.getElementById("svc-ai-summary-toggle"),
      aiSummaryWarning: document.getElementById("svc-ai-summary-warning"),
      systemRestoreToggle: document.getElementById("svc-system-restore-toggle"),
      pauseBetweenToggle: document.getElementById("svc-pause-between-toggle"),
      parallelExecutionToggle: document.getElementById("svc-parallel-execution-toggle"),
      totalTime: document.getElementById("svc-total-time"),
    };

    this.builder.setElements(this.elements);
    this.setupEventListeners();
    this.setTitle();
    this.setupAISummaryToggle();
    this.setupSystemRestoreToggle();
    this.setupPauseBetweenToggle();
    this.setupParallelExecutionToggle();
    this.setupAICreateButton();
    
    // Load time estimates asynchronously
    this.loadTimeEstimates();
  }

  /**
   * Load task time estimates from backend
   */
  async loadTimeEstimates() {
    try {
      const { settingsManager } = await import("../../utils/settings-manager.js");
      const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
      if (!enabled) {
        this.timeEstimates = [];
        return;
      }
      const { loadTaskTimeEstimates } = await import("../../utils/task-time-estimates.js");
      this.timeEstimates = await loadTaskTimeEstimates();
    } catch (error) {
      console.warn("Failed to load time estimates:", error);
      this.timeEstimates = [];
    }
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

    this.elements.nextBtn?.addEventListener("click", async () => {
      // Get the actual JSON string (not the highlighted HTML)
      const jsonString = this.lastJsonString || "{}";
      console.log("[Builder] Saving run plan with AI summary enabled:", this.builder.aiSummaryEnabled);
      console.log("[Builder] Run plan JSON:", jsonString.substring(0, 200) + "...");
      sessionStorage.setItem("service.pendingRun", jsonString);
      window.location.hash = "#/service-report";
    });

    // Listen for AI settings changes to refresh availability
    window.addEventListener("ai-settings-updated", () => {
      console.log("AI settings updated, refreshing service availability...");
      this.render(); // Re-render to trigger availability checks
    });

    // Listen for task times cleared to refresh estimates
    window.addEventListener("task-times-cleared", () => {
      console.log("Task times cleared, refreshing estimates...");
      this.render(); // Re-render to update estimates
      this.updateTotalTime(); // Refresh total time
    });

    // Listen for task time estimates toggle to update UI in real-time
    window.addEventListener("task-time-estimates-toggled", async (e) => {
      const enabled = e.detail?.enabled !== false;
      console.log(`[Builder] Task time estimates ${enabled ? "enabled" : "disabled"}, updating UI...`);
      // Re-render to show/hide badges
      this.render();
      // Update total time display
      await this.updateTotalTime();
    });

    this.elements.searchInput?.addEventListener("input", () => {
      const query = (this.elements.searchInput.value || "").trim();
      this.builder.setFilterQuery(query);
      
      // Show/hide clear button
      if (this.elements.searchClear) {
        this.elements.searchClear.style.display = query ? "flex" : "none";
      }
      
      this.render();
    });

    this.elements.searchClear?.addEventListener("click", () => {
      this.builder.setFilterQuery("");
      if (this.elements.searchInput) this.elements.searchInput.value = "";
      if (this.elements.searchClear) this.elements.searchClear.style.display = "none";
      this.render();
    });

    this.elements.btnSelectAll?.addEventListener("click", () => {
      this.builder.selectAll();
      this.builder.persist();
      this.render();
      this.updateTotalTime();
    });

    this.elements.btnDeselectAll?.addEventListener("click", () => {
      this.builder.deselectAll();
      this.builder.persist();
      this.render();
      this.updateTotalTime();
    });

    this.elements.btnReset?.addEventListener("click", () => {
      this.builder.reset();
      this.render();
      this.updateTotalTime();
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
   * Setup AI summary toggle and check AI configuration
   */
  async setupAISummaryToggle() {
    const toggle = this.elements.aiSummaryToggle;
    const warning = this.elements.aiSummaryWarning;
    if (!toggle) return;

    // Check AI configuration
    try {
      const { aiClient } = await import("../../utils/ai-client.js");
      const isConfigured = await aiClient.isConfigured();
      
      if (!isConfigured) {
        toggle.disabled = true;
        if (warning) warning.style.display = "block";
      } else {
        toggle.disabled = false;
        if (warning) warning.style.display = "none";
      }
    } catch (e) {
      console.warn("Failed to check AI configuration:", e);
      toggle.disabled = true;
      if (warning) warning.style.display = "block";
    }

    // Set initial state from builder
    toggle.checked = this.builder.aiSummaryEnabled;
    console.log("[Builder] AI summary toggle initialized, checked:", toggle.checked);

    // Listen for changes
    toggle.addEventListener("change", () => {
      this.builder.aiSummaryEnabled = toggle.checked;
      console.log("[Builder] AI summary toggle changed to:", toggle.checked);
      this.builder.persist();
      this.updateJson();
    });
  }

  /**
   * Setup System Restore toggle
   */
  setupSystemRestoreToggle() {
    const toggle = this.elements.systemRestoreToggle;
    if (!toggle) return;

    // Set initial state from builder
    toggle.checked = this.builder.systemRestoreEnabled;
    console.log("[Builder] System Restore toggle initialized, checked:", toggle.checked);

    // Listen for changes
    toggle.addEventListener("change", () => {
      this.builder.systemRestoreEnabled = toggle.checked;
      console.log("[Builder] System Restore toggle changed to:", toggle.checked);
      this.builder.persist();
      this.updateJson();
    });
  }

  /**
   * Setup Pause Between Tasks toggle
   */
  setupPauseBetweenToggle() {
    const toggle = this.elements.pauseBetweenToggle;
    if (!toggle) return;

    // Set initial state from builder
    toggle.checked = this.builder.pauseBetweenTasks;
    console.log("[Builder] Pause Between Tasks toggle initialized, checked:", toggle.checked);

    // Listen for changes
    toggle.addEventListener("change", () => {
      this.builder.pauseBetweenTasks = toggle.checked;
      console.log("[Builder] Pause Between Tasks toggle changed to:", toggle.checked);
      this.builder.persist();
      this.updateJson();
    });
  }

  /**
   * Setup Parallel Execution toggle
   */
  setupParallelExecutionToggle() {
    const toggle = this.elements.parallelExecutionToggle;
    if (!toggle) return;

    // Set initial state from builder
    toggle.checked = this.builder.parallelExecution;
    console.log("[Builder] Parallel Execution toggle initialized, checked:", toggle.checked);

    // Listen for changes
    toggle.addEventListener("change", () => {
      this.builder.parallelExecution = toggle.checked;
      console.log("[Builder] Parallel Execution toggle changed to:", toggle.checked);
      this.builder.persist();
      this.updateJson();
    });
  }

  /**
   * Setup AI Create button and check AI configuration
   */
  async setupAICreateButton() {
    const btn = this.elements.btnAICreate;
    if (!btn) return;

    // Check AI configuration
    try {
      const { aiClient } = await import("../../utils/ai-client.js");
      const isConfigured = await aiClient.isConfigured();
      
      if (!isConfigured) {
        btn.disabled = true;
        btn.title = "AI not configured. Configure in Settings to enable.";
      } else {
        btn.disabled = false;
        btn.title = "Use AI to create a service plan based on your problem description";
      }
    } catch (e) {
      console.warn("Failed to check AI configuration:", e);
      btn.disabled = true;
      btn.title = "AI not configured. Configure in Settings to enable.";
    }

    // Listen for AI settings changes
    window.addEventListener("ai-settings-updated", async () => {
      try {
        const { aiClient } = await import("../../utils/ai-client.js");
        const isConfigured = await aiClient.isConfigured();
        btn.disabled = !isConfigured;
        btn.title = isConfigured
          ? "Use AI to create a service plan based on your problem description"
          : "AI not configured. Configure in Settings to enable.";
      } catch (e) {
        console.warn("Failed to refresh AI configuration:", e);
      }
    });

    // Add click handler
    btn.addEventListener("click", () => this.handleAICreate());
  }

  /**
   * Handle AI Create button click
   * Opens modal, gets AI suggestions, and applies them to the builder
   */
  async handleAICreate() {
    try {
      const { openAIServiceModal } = await import("../../utils/ai-service-modal.js");
      
      // Check AI configuration again
      const { aiClient } = await import("../../utils/ai-client.js");
      const isConfigured = await aiClient.isConfigured();
      if (!isConfigured) {
        alert("AI is not configured. Please configure AI settings first.");
        return;
      }

      // Create tool availability checker function
      const isToolAvailable = (serviceId) => {
        if (serviceId === GPU_PARENT_ID) {
          // GPU parent: check if at least one GPU tool is available
          return (
            this.builder.isToolAvailable(["furmark", "furmark2"]) ||
            this.builder.isToolAvailable(["heavyload"])
          );
        }
        const toolKeys = toolKeysForService(serviceId);
        if (!toolKeys || toolKeys.length === 0) return true; // Built-in service
        return this.builder.isToolAvailable(toolKeys);
      };

      // Create function to check if there are existing tasks
      const hasExistingTasks = () => {
        return this.builder.selection.size > 0;
      };

      // Open modal and get result
      console.log("[Builder] Opening AI service modal...");
      const result = await openAIServiceModal(isToolAvailable, hasExistingTasks);
      
      console.log("[Builder] Modal returned result:", result);
      
      if (!result || !result.services || result.services.length === 0) {
        console.log("[Builder] No services to apply (user cancelled or empty result)");
        return; // User cancelled or no services selected
      }

      const mode = result.mode || "replace";
      console.log(`[Builder] Applying ${result.services.length} service(s) from AI with mode "${mode}":`, result.services);

      // If replacing, clear existing selection first
      if (mode === "replace") {
        console.log("[Builder] Replacing existing queue...");
        // Clear all task params
        Object.keys(this.builder.taskParams).forEach((id) => {
          delete this.builder.taskParams[id];
        });
        // Reset GPU config
        this.builder.gpuConfig.subs = { furmark: true, heavyload: false };
        this.builder.gpuConfig.params = { furmarkMinutes: 1, heavyloadMinutes: 1 };
        // Clear selection and order
        this.builder.deselectAll();
        this.builder.order = [];
      } else {
        console.log("[Builder] Appending to existing queue...");
      }

      // Apply services to builder
      for (const service of result.services) {
        console.log(`[Builder] Adding service: ${service.id} with params:`, service.params);
        // Add to selection and order
        this.builder.addTask(service.id);

        // Handle GPU parent specially
        if (service.id === GPU_PARENT_ID) {
          // Apply GPU sub-options and parameters
          if (Object.prototype.hasOwnProperty.call(service.params, "furmark")) {
            this.builder.gpuConfig.subs.furmark = !!service.params.furmark;
          }
          if (Object.prototype.hasOwnProperty.call(service.params, "heavyload")) {
            this.builder.gpuConfig.subs.heavyload = !!service.params.heavyload;
          }
          if (
            Object.prototype.hasOwnProperty.call(service.params, "furmarkMinutes") &&
            Number.isFinite(Number(service.params.furmarkMinutes))
          ) {
            this.builder.gpuConfig.params.furmarkMinutes = Number(
              service.params.furmarkMinutes
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(service.params, "heavyloadMinutes") &&
            Number.isFinite(Number(service.params.heavyloadMinutes))
          ) {
            this.builder.gpuConfig.params.heavyloadMinutes = Number(
              service.params.heavyloadMinutes
            );
          }
        } else {
          // Regular service: set parameters
          if (Object.keys(service.params).length > 0) {
            if (!this.builder.taskParams[service.id]) {
              this.builder.taskParams[service.id] = { params: {} };
            }
            // Merge AI params with existing params
            this.builder.taskParams[service.id].params = {
              ...this.builder.taskParams[service.id].params,
              ...service.params,
            };
          }
        }
      }

      // Persist and re-render
      console.log("[Builder] Persisting builder state...");
      this.builder.persist();
      console.log("[Builder] Re-rendering UI...");
      this.render();
      await this.updateTotalTime();

      // Show success feedback
      console.log(
        `[Builder] Successfully applied ${result.services.length} AI-selected service(s)`,
        result.reasoning
      );
      console.log("[Builder] Current selection:", Array.from(this.builder.selection));
      console.log("[Builder] Current order:", this.builder.order);

      // Show success notification
      showSuccessNotification(
        mode === "replace"
          ? `Replaced queue with ${result.services.length} AI-selected service(s)`
          : `Added ${result.services.length} AI-selected service(s) to queue`
      );
    } catch (error) {
      console.error("[Builder] Failed to handle AI create:", error);
      alert(
        `Failed to create service plan: ${error.message || "Unknown error"}`
      );
    }
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

    // Helper function to refresh individual task estimate after parameter change
    const refreshTaskEstimate = () => {
      // Find the li element by traversing up from wrapper
      let liElement = wrapper.closest("li.task-item");
      if (liElement) {
        // Refresh the estimate for this task
        this.loadAndRenderTimeEstimate(id, liElement);
      }
    };

    // Check if handler provides custom parameter controls
    const handler = getHandlerModule(id);
    if (handler?.renderParamControls) {
      const customControls = handler.renderParamControls({
        params,
        updateParam: async (key, value) => {
          this.builder.updateTaskParam(id, key, value);
          await this.updateJson();
          // Refresh individual task estimate after parameter change
          refreshTaskEstimate();
          // Invalidate cache to ensure fresh estimates
          const { clearTaskTimeCache } = await import("../../utils/task-time-estimates.js");
          clearTaskTimeCache();
        },
      });
      if (customControls) {
        // If handler returns a DOM element, append it
        if (customControls instanceof HTMLElement) {
          wrapper.appendChild(customControls);
          return wrapper;
        }
        // If handler returns HTML string, use it
        if (typeof customControls === "string") {
          wrapper.innerHTML = customControls;
          // Handler is responsible for attaching event listeners
          return wrapper;
        }
      }
    }

    // Generic duration controls (minutes/seconds)
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
      inp.addEventListener("change", async () => {
        this.builder.updateTaskParam(
          id,
          inp.dataset.param,
          Number(inp.value) ||
            this.builder.taskParams[id]?.params[inp.dataset.param]
        );
        await this.updateJson();
        // Refresh individual task estimate after parameter change
        refreshTaskEstimate();
      });
    });

    return wrapper;
  }

  /**
   * Render GPU sub-options for GPU parent meta-service
   * This UI allows selecting which GPU stress tests to run and configuring their durations.
   * The GPU parent expands into real service tasks (furmark_stress_test, heavyload_stress_gpu).
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

    // Helper function to refresh GPU parent estimate after sub-option change
    const refreshGpuParentEstimate = () => {
      // Find the li element by traversing up from div
      let liElement = div.closest("li.task-item");
      if (liElement) {
        // Refresh the estimate for GPU parent
        this.loadGpuParentTimeEstimate(liElement);
      }
    };

    div.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", async () => {
        this.builder.updateGpuSub(cb.dataset.sub, cb.checked);
        await this.updateJson();
        // Refresh GPU parent estimate after sub-option change
        refreshGpuParentEstimate();
      })
    );

    div.querySelectorAll("input.dur").forEach((inp) => {
      ["mousedown", "pointerdown", "click", "dblclick", "touchstart"].forEach(
        (evt) => {
          inp.addEventListener(evt, (e) => e.stopPropagation());
        }
      );
      inp.addEventListener("change", async () => {
        this.builder.updateGpuParam(
          inp.dataset.subDur,
          Number(inp.value) || this.builder.gpuConfig.params[inp.dataset.subDur]
        );
        await this.updateJson();
        // Refresh GPU parent estimate after duration change
        refreshGpuParentEstimate();
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
          <span class="meta">${group} ${this.renderAvailabilityBadge(id)}<span class="time-estimate-placeholder" data-task-id="${id}"></span></span>
        </span>
      </div>
    `;

    // Load time estimate asynchronously and update placeholder (only if enabled)
    // Check setting first to avoid unnecessary calls
    (async () => {
      try {
        const { settingsManager } = await import("../../utils/settings-manager.js");
        const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
        if (enabled) {
          await this.loadAndRenderTimeEstimate(id, li);
        } else {
          // Hide placeholder if disabled
          const placeholder = li.querySelector(`.time-estimate-placeholder[data-task-id="${id}"]`);
          if (placeholder) placeholder.style.display = "none";
        }
      } catch (error) {
        // On error, try to load anyway (fallback behavior)
        await this.loadAndRenderTimeEstimate(id, li);
      }
    })();

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
      // Check if handler provides custom param controls OR if has generic duration params
      const handler = getHandlerModule(id);
      const hasCustomControls =
        handler && typeof handler.renderParamControls === "function";
      const hasGenericParams =
        Object.prototype.hasOwnProperty.call(p, "minutes") ||
        Object.prototype.hasOwnProperty.call(p, "seconds");

      if (hasCustomControls || hasGenericParams) {
        row.appendChild(this.renderParamControls(id, p));
      }
    }

    if (isGpuParent && selected) {
      row.appendChild(this.renderGpuSubOptions());
    }

    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) {
        this.builder.addTask(id);
      } else {
        this.builder.removeTask(id);
      }
      this.builder.persist();
      this.render();
      await this.updateTotalTime();
    });

    return li;
  }

  /**
   * Load and render time estimate for a task
   */
  async loadAndRenderTimeEstimate(id, liElement) {
    // Check if task time estimates are enabled
    try {
      const { settingsManager } = await import("../../utils/settings-manager.js");
      const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
      if (!enabled) {
        // Hide any existing badges and placeholders
        const metaSpan = liElement?.querySelector(".meta");
        if (metaSpan) {
          const placeholder = metaSpan.querySelector(`.time-estimate-placeholder[data-task-id="${id}"]`);
          const existingBadge = metaSpan.querySelector(`.badge.time-estimate`);
          if (placeholder) placeholder.style.display = "none";
          if (existingBadge) existingBadge.style.display = "none";
        }
        return;
      }
    } catch (error) {
      console.warn("[Task Time] Failed to check setting, skipping estimate:", error);
      return;
    }

    // Special handling for GPU parent: calculate combined estimate from child tasks
    if (id === GPU_PARENT_ID) {
      await this.loadGpuParentTimeEstimate(liElement);
      return;
    }

    try {
      const { getEstimate, formatDuration, normalizeTaskParams } = await import("../../utils/task-time-estimates.js");
      
      // Build the actual task to get the full structure
      const def = getServiceById(id);
      if (!def) return;
      
      let taskForEstimate;
      try {
        const params = this.builder.taskParams[id]?.params || {};
        const builtTask = await def.build({
          params: params,
          resolveToolPath: toolPath,
          getDataDirs,
        });
        taskForEstimate = builtTask;
      } catch (error) {
        console.warn(`[Task Time] Failed to build task ${id} for estimate:`, error);
        // Fallback to simple structure
        taskForEstimate = {
          type: id,
          params: this.builder.taskParams[id]?.params || {},
        };
      }
      
      // Normalize params from the full task structure
      const paramsHash = normalizeTaskParams(taskForEstimate);
      const taskParams = JSON.parse(paramsHash);
      
      // Debug logging for ping tests
      if (id === "ping_test" || taskForEstimate.type === "ping_test") {
        console.log(`[Task Time] Ping test params:`, { taskForEstimate, paramsHash, taskParams });
      }
      
      // Get estimate using the task type from the built task (might differ from id)
      const taskType = taskForEstimate.type || id;
      const estimateData = await getEstimate(id, taskParams, taskType);
      
      // Debug logging for ping tests
      if (id === "ping_test" || taskType === "ping_test") {
        console.log(`[Task Time] Ping test estimate result:`, {
          id,
          taskType,
          taskParams,
          estimateData,
        });
      }
      
      // Find placeholder or existing badge element (look within the meta span to avoid matching other badges)
      const metaSpan = liElement?.querySelector(`.meta`);
      const placeholder = metaSpan?.querySelector(`.time-estimate-placeholder[data-task-id="${id}"]`);
      const existingBadge = metaSpan?.querySelector(`.badge.time-estimate`);
      
      // If neither exists, nothing to update
      if (!placeholder && !existingBadge) {
        return;
      }

      if (!estimateData) {
        console.log(`[Task Time] No estimate data for ${id}`);
        if (placeholder) placeholder.remove();
        if (existingBadge) existingBadge.remove();
        return;
      }

      // Show estimates with 1+ samples (parameter-based always OK)
      // We'll mark low sample counts as very low confidence in the UI
      if (!estimateData.isParameterBased && (!estimateData.sampleCount || estimateData.sampleCount < 1)) {
        console.log(`[Task Time] No samples for ${id}`);
        if (placeholder) placeholder.remove();
        if (existingBadge) existingBadge.remove();
        return;
      }
      
      const { formatDuration: formatDurationUtil } = await import("../../utils/task-time-estimates.js");

      const formatted = formatDuration(estimateData.estimate);
      if (!formatted) {
        console.log(`[Task Time] Failed to format duration for ${id}: ${estimateData.estimate}`);
        if (placeholder) placeholder.remove();
        if (existingBadge) existingBadge.remove();
        return;
      }

      // Build tooltip with confidence information
      const confidence = estimateData.confidence || "unknown";
      const confidenceLabels = {
        high: "High confidence",
        medium: "Medium confidence",
        low: "Low confidence",
        very_low: "Very low confidence",
      };
      
      let tooltip = `Estimated time: ${formatted}`;
      if (estimateData.isParameterBased) {
        tooltip += "\nBased on task parameters (exact duration)";
      } else {
        tooltip += `\nBased on ${estimateData.sampleCount} previous run(s)`;
        tooltip += `\n${confidenceLabels[confidence] || "Unknown confidence"}`;
        
        if (estimateData.min !== undefined && estimateData.max !== undefined && estimateData.min !== estimateData.max) {
          const minFormatted = formatDurationUtil(estimateData.min);
          const maxFormatted = formatDurationUtil(estimateData.max);
          tooltip += `\nRange: ${minFormatted} - ${maxFormatted}`;
        }
      }

      console.log(`[Task Time] Displaying estimate for ${id}: ${formatted} (${estimateData.sampleCount} samples, ${confidence} confidence)`);

      // Determine badge class based on confidence
      const badgeClass = `badge time-estimate time-estimate-${confidence}`;

      // Update existing badge or replace placeholder with new badge
      if (existingBadge) {
        // Update existing badge
        existingBadge.textContent = formatted;
        existingBadge.className = badgeClass;
        existingBadge.title = tooltip;
      } else if (placeholder) {
        // Replace placeholder with actual estimate as a badge
        const estimateEl = document.createElement("span");
        estimateEl.className = badgeClass;
        estimateEl.textContent = formatted;
        estimateEl.title = tooltip;
        placeholder.replaceWith(estimateEl);
      }
    } catch (error) {
      console.warn(`[Task Time] Failed to get time estimate for ${id}:`, error);
      const placeholder = liElement?.querySelector(`.time-estimate-placeholder[data-task-id="${id}"]`);
      if (placeholder) {
        placeholder.remove();
      }
    }
  }

  /**
   * Load and render combined time estimate for GPU parent task
   * GPU parent expands to furmark_stress_test and/or heavyload_stress_gpu
   * Uses parameter-based duration calculation for these tasks
   */
  async loadGpuParentTimeEstimate(liElement) {
    // Check if task time estimates are enabled
    try {
      const { settingsManager } = await import("../../utils/settings-manager.js");
      const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
      if (!enabled) {
        // Hide any existing badges and placeholders
        const metaSpan = liElement?.querySelector(".meta");
        if (metaSpan) {
          const placeholder = metaSpan.querySelector(`.time-estimate-placeholder[data-task-id="${GPU_PARENT_ID}"]`);
          const existingBadge = metaSpan.querySelector(`.badge.time-estimate`);
          if (placeholder) placeholder.style.display = "none";
          if (existingBadge) existingBadge.style.display = "none";
        }
        return;
      }
    } catch (error) {
      console.warn("[Task Time] Failed to check setting, skipping GPU estimate:", error);
      return;
    }

    try {
      const { calculateParameterBasedDuration, formatDuration } = await import("../../utils/task-time-estimates.js");
      // getServiceById is already imported at the top of the file from ./catalog.js
      
      // Find placeholder or existing badge element (look within the meta span to avoid matching other badges)
      const metaSpan = liElement?.querySelector(`.meta`);
      if (!metaSpan) {
        console.warn("[Task Time] GPU parent: meta span not found");
        return;
      }
      
      const placeholder = metaSpan.querySelector(`.time-estimate-placeholder[data-task-id="${GPU_PARENT_ID}"]`);
      const existingBadge = metaSpan.querySelector(`.badge.time-estimate`);
      
      // Debug: Log what we found
      console.log("[Task Time] GPU parent elements:", {
        hasPlaceholder: !!placeholder,
        hasExistingBadge: !!existingBadge,
        hasMetaSpan: !!metaSpan
      });
      
      // Note: We'll create badge even if placeholder doesn't exist (it might have been removed earlier)

      let totalSeconds = 0;
      let hasEstimate = false;

      console.log("[Task Time] GPU parent config:", {
        furmark: this.builder.gpuConfig.subs.furmark,
        heavyload: this.builder.gpuConfig.subs.heavyload,
        furmarkMinutes: this.builder.gpuConfig.params.furmarkMinutes,
        heavyloadMinutes: this.builder.gpuConfig.params.heavyloadMinutes,
      });

      // Check FurMark estimate if enabled (parameter-based)
      if (this.builder.gpuConfig.subs.furmark) {
        const furmarkDef = getServiceById("furmark_stress_test");
        if (furmarkDef) {
          try {
            const furmarkMinutes = this.builder.gpuConfig.params.furmarkMinutes || 1;
            const builtFurmark = await furmarkDef.build({
              params: { minutes: furmarkMinutes },
              resolveToolPath: toolPath,
              getDataDirs,
            });
            
            console.log("[Task Time] Built FurMark task:", builtFurmark);
            
            // Calculate duration directly from parameters (parameter-based task)
            const furmarkDuration = calculateParameterBasedDuration(builtFurmark);
            console.log("[Task Time] FurMark duration:", furmarkDuration);
            
            if (furmarkDuration !== null && furmarkDuration > 0) {
              totalSeconds += furmarkDuration;
              hasEstimate = true;
            }
          } catch (error) {
            console.warn("[Task Time] Failed to get FurMark estimate for GPU parent:", error);
          }
        } else {
          console.warn("[Task Time] FurMark handler not found");
        }
      }

      // Check HeavyLoad GPU estimate if enabled (parameter-based)
      if (this.builder.gpuConfig.subs.heavyload) {
        const heavyloadDef = getServiceById("heavyload_stress_gpu");
        if (heavyloadDef) {
          try {
            const heavyloadMinutes = this.builder.gpuConfig.params.heavyloadMinutes || 1;
            const builtHeavyload = await heavyloadDef.build({
              params: { minutes: heavyloadMinutes },
              resolveToolPath: toolPath,
              getDataDirs,
            });
            
            console.log("[Task Time] Built HeavyLoad GPU task:", builtHeavyload);
            
            // Calculate duration directly from parameters (parameter-based task)
            const heavyloadDuration = calculateParameterBasedDuration(builtHeavyload);
            console.log("[Task Time] HeavyLoad GPU duration:", heavyloadDuration);
            
            if (heavyloadDuration !== null && heavyloadDuration > 0) {
              totalSeconds += heavyloadDuration;
              hasEstimate = true;
            }
          } catch (error) {
            console.warn("[Task Time] Failed to get HeavyLoad GPU estimate for GPU parent:", error);
          }
        } else {
          console.warn("[Task Time] HeavyLoad GPU handler not found");
        }
      }

      console.log("[Task Time] GPU parent total:", { totalSeconds, hasEstimate });

      // Only show badge if at least one test is enabled and we have a valid estimate
      if (!hasEstimate || totalSeconds === 0) {
        // If neither test is enabled, remove badge/placeholder
        if (placeholder) placeholder.remove();
        if (existingBadge) existingBadge.remove();
        return;
      }

      const formatted = formatDuration(totalSeconds);
      if (!formatted) {
        if (placeholder) placeholder.remove();
        if (existingBadge) existingBadge.remove();
        return;
      }

      // Build enabled tests list for tooltip
      const enabledTests = [];
      if (this.builder.gpuConfig.subs.furmark) enabledTests.push("FurMark");
      if (this.builder.gpuConfig.subs.heavyload) enabledTests.push("HeavyLoad");
      const tooltip = `Estimated time for GPU stress test (${enabledTests.join(" + ")})\nBased on task parameters (exact duration)`;

      // GPU parent uses parameter-based estimates (always high confidence)
      const badgeClass = "badge time-estimate time-estimate-high";

      // Update existing badge or replace placeholder with new badge
      if (existingBadge) {
        // Update existing badge
        existingBadge.textContent = formatted;
        existingBadge.className = badgeClass;
        existingBadge.title = tooltip;
      } else if (placeholder) {
        // Create badge with combined estimate
        const estimateEl = document.createElement("span");
        estimateEl.className = badgeClass;
        estimateEl.textContent = formatted;
        estimateEl.title = tooltip;
        placeholder.replaceWith(estimateEl);
      } else {
        // Neither placeholder nor badge exists - create badge in meta span
        // This can happen if placeholder was removed earlier
        const estimateEl = document.createElement("span");
        estimateEl.className = badgeClass;
        estimateEl.textContent = formatted;
        estimateEl.title = tooltip;
        // Insert before the availability badge if it exists, otherwise just append
        const availabilityBadge = metaSpan.querySelector(".badge.availability");
        if (availabilityBadge) {
          metaSpan.insertBefore(estimateEl, availabilityBadge.nextSibling);
        } else {
          metaSpan.appendChild(estimateEl);
        }
      }
    } catch (error) {
      console.warn("[Task Time] Failed to get GPU parent time estimate:", error);
      const metaSpan = liElement?.querySelector(`.meta`);
      const placeholder = metaSpan?.querySelector(`.time-estimate-placeholder[data-task-id="${GPU_PARENT_ID}"]`);
      const existingBadge = metaSpan?.querySelector(`.badge.time-estimate`);
      if (placeholder) {
        placeholder.remove();
      }
      if (existingBadge) {
        existingBadge.remove();
      }
    }
  }

  /**
   * Render availability badge
   */
  renderAvailabilityBadge(id) {
    // Special case: GPU parent (meta-service that combines FurMark + HeavyLoad)
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

    // Check for custom availability function (async handlers)
    const handler = getHandlerModule(id);
    if (handler?.definition?.isAvailable) {
      // This will be checked asynchronously - mark as "checking" initially
      // We'll update this after async check completes
      this.checkCustomAvailability(id, handler);
      return (
        '<span class="badge checking" data-service-id="' +
        id +
        '">Checking...</span>'
      );
    }

    // Get tool requirements from service definition
    const key = toolKeysForService(id);

    // Services with no tool dependencies are built-in
    if (Array.isArray(key) && key.length === 0) {
      return '<span class="badge ok" title="Built-in">Built-in</span>';
    }

    // Services without toolKeys defined
    if (!key) return "";

    // Check availability based on toolKeys
    const ok = this.builder.isToolAvailable(key);
    return `<span class="badge ${ok ? "ok" : "missing"}">${
      ok ? "Available" : "Missing"
    }</span>`;
  }

  /**
   * Check custom availability asynchronously and update badge
   */
  async checkCustomAvailability(id, handler) {
    try {
      const isAvailable = await handler.definition.isAvailable();
      const badges = this.elements.palette.querySelectorAll(
        `span.badge[data-service-id="${id}"]`
      );

      badges.forEach((badge) => {
        badge.classList.remove("checking");
        if (isAvailable) {
          badge.classList.add("ok");
          badge.textContent = "Available";
          badge.title = "";
        } else {
          badge.classList.add("missing");
          badge.textContent = "API Key Missing";
          const reason =
            handler.definition.getUnavailableReason?.() || "Not available";
          badge.title = reason;
        }
      });
    } catch (e) {
      console.error(`Failed to check availability for ${id}:`, e);
      const badges = this.elements.palette.querySelectorAll(
        `span.badge[data-service-id="${id}"]`
      );
      badges.forEach((badge) => {
        badge.classList.remove("checking");
        badge.classList.add("missing");
        badge.textContent = "Error";
      });
    }
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
   * Update JSON (generates and stores JSON for runner, no UI preview)
   */
  async updateJson() {
    const tasks = await this.builder.generateTasksArray();
    const plan = {
      tasks,
      ...(this.builder.aiSummaryEnabled && { ai_summary_enabled: true }),
      ...(this.builder.pauseBetweenTasks && { pause_between_tasks: true }),
      ...(this.builder.parallelExecution && { parallel_execution: true }),
    };
    this.lastJsonString = JSON.stringify(plan, null, 2);
    console.log("[Builder] Updated JSON, AI summary enabled:", this.builder.aiSummaryEnabled);
    console.log("[Builder] Plan keys:", Object.keys(plan));
    this.builder.persist();
    this.validateNext();
    
    // Update total time estimate
    await this.updateTotalTime();
  }

  /**
   * Update total time estimate display
   */
  async updateTotalTime() {
    if (!this.elements.totalTime) {
      return;
    }

    // Check if task time estimates are enabled
    try {
      const { settingsManager } = await import("../../utils/settings-manager.js");
      const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
      if (!enabled) {
        this.elements.totalTime.style.display = "none";
        return;
      }
    } catch (error) {
      console.warn("[Task Time] Failed to check setting, hiding total time:", error);
      this.elements.totalTime.style.display = "none";
      return;
    }

    try {
      const { calculateTotalTime, formatDuration } = await import("../../utils/task-time-estimates.js");
      
      // Get selected tasks with their parameters
      // Build actual tasks to get the full structure (not just params)
      const selectedTasks = [];
      for (const id of this.builder.order) {
        if (!this.builder.selection.has(id)) continue;
        
        const def = getServiceById(id);
        if (!def) continue;

        // Build the actual task to get the full structure
        try {
          const params = this.builder.taskParams[id]?.params || {};
          const builtTask = await def.build({
            params: params,
            resolveToolPath: toolPath,
            getDataDirs,
          });
          
          // Use the built task structure (has all params at top level)
          selectedTasks.push(builtTask);
        } catch (error) {
          console.warn(`[Task Time] Failed to build task ${id} for time estimate:`, error);
          // Fallback to simple structure
          selectedTasks.push({
            type: id,
            params: this.builder.taskParams[id]?.params || {},
          });
        }
      }

      if (selectedTasks.length === 0) {
        this.elements.totalTime.style.display = "none";
        return;
      }

      const result = await calculateTotalTime(selectedTasks);

      if (result.totalSeconds > 0) {
        const formatted = formatDuration(result.totalSeconds);
        
        // Update or create badge element
        let badgeEl = this.elements.totalTime.querySelector(".badge.time-estimate");
        if (!badgeEl) {
          badgeEl = document.createElement("span");
          badgeEl.className = "badge time-estimate";
          this.elements.totalTime.appendChild(badgeEl);
        }
        
        // Set badge text with partial indicator if needed
        let badgeText = formatted;
        let badgeTitle = `Estimated time for ${result.totalCount} task(s)`;
        
        if (result.hasPartial) {
          badgeText += " (partial)";
          badgeTitle = `Estimated time - ${result.estimatedCount}/${result.totalCount} tasks have estimates`;
        }
        
        if (result.lowConfidenceCount > 0) {
          badgeTitle += `\n${result.lowConfidenceCount} task(s) have low confidence estimates`;
        }
        
        badgeEl.textContent = badgeText;
        badgeEl.title = badgeTitle;
        
        this.elements.totalTime.style.display = "flex";
        this.elements.totalTime.style.alignItems = "center";
        this.elements.totalTime.style.gap = "8px";
      } else {
        // No estimates available yet
        this.elements.totalTime.style.display = "none";
      }
    } catch (error) {
      console.warn("[Builder] Failed to update total time:", error);
      this.elements.totalTime.style.display = "none";
    }
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
  // Check if there's an active run - if so, redirect to runner page
  try {
    const { getRunState, isRunActive } = await import(
      "../../utils/task-state.js"
    );
    const state = getRunState();
    if (isRunActive() || state.overallStatus === "running") {
      window.location.hash = "#/service-report";
      return;
    }
  } catch (e) {
    console.warn("Failed to check run state:", e);
  }

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

  // Always overlay current preset parameters (GPU, etc.) even if restored
  builder.applyPresetParams(preset || mode);

  // Load tool statuses
  await builder.loadToolStatuses();

  // Create UI controller
  const ui = new BuilderUI(builder);
  await ui.initialize();

  // Initial render
  ui.render();
  document.getElementById("svc-run-builder").hidden = false;
  
  // Clear time estimate cache when page loads to ensure fresh estimates
  // This is important when returning from the runner page after saving new records
  try {
    const { clearTaskTimeCache } = await import("../../utils/task-time-estimates.js");
    clearTaskTimeCache();
    console.log("[Builder] Cleared time estimate cache on page load");
  } catch (e) {
    console.warn("[Builder] Failed to clear time estimate cache:", e);
  }
}
