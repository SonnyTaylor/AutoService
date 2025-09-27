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
} from "./services.js";

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

/**
 * @typedef {Object} ServiceBuildContext
 * @property {Object} params - Parameter bag for the service (e.g., { minutes: 5 }).
 * @property {(keyOrKeys: string|string[]) => Promise<string|null>} resolveToolPath - Resolver for tool paths.
 * @property {() => Promise<DataDirs>} getDataDirs - Returns data directories for building absolute paths.
 */

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} id - Unique service id.
 * @property {string} label - Human-readable name.
 * @property {string=} group - Grouping label (e.g., "Cleanup", "Stress").
 * @property {Object=} defaultParams - Default params for the service UI controls.
 * @property {(ctx: ServiceBuildContext) => Promise<Object>} build - Produces a Python-runner task spec.
 */

/**
 * @typedef {Object} BuiltTask
 * @description Shape consumed by the Python runner. Minimally, tasks are opaque
 * objects here. A few tasks may contain an `executable_path` which, if empty,
 * indicates the step is not runnable and should be filtered out.
 * @property {string=} executable_path
 */

// ---- Utility Helpers ------------------------------------------------------
/** Capitalizes the first letter of a string */
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

let TOOL_CACHE = null;
let PROGRAMS_CACHE = null;
let DATA_DIRS_CACHE = null;
/**
 * Resolve a tool's absolute executable path using multiple strategies:
 * 1) Preferred: tool status cache (`getToolStatuses`) by logical key.
 * 2) Fallback: scan persisted programs list (from the Rust side) by fuzzy match.
 * 3) If a relative exe_path is returned, make it absolute using data dirs.
 *
 * This is intentionally tolerant: if none of the keys resolve, returns null.
 *
 * @param {string|string[]} keyOrKeys - One or more logical tool keys to try.
 * @returns {Promise<string|null>} Absolute path or null if not found.
 */
async function toolPath(keyOrKeys) {
  if (!TOOL_CACHE) TOOL_CACHE = await getToolStatuses();
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  for (const k of keys) {
    const hit = TOOL_CACHE.find((t) => t.key === k);
    if (hit?.path) return hit.path;
  }
  // Fallback: look up in saved programs if present (e.g., HeavyLoad, FurMark2)
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

/**
 * Retrieve and memoize the list of known programs from the backend.
 *
 * @returns {Promise<ProgramEntry[]>}
 */
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

/**
 * Retrieve and memoize known data directories used for resolving relative paths.
 *
 * @returns {Promise<DataDirs>}
 */
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

/**
 * Convert a relative program exe path into an absolute one using known data dirs.
 * If the path is already absolute (drive letter or UNC), return it as-is.
 *
 * @param {string} exePath - Relative or absolute path to an executable.
 * @param {DataDirs} dirs - Data directories.
 * @returns {string|null} Absolute path or null when input is invalid.
 */
function resolveProgramFullPath(exePath, dirs) {
  if (!exePath) return null;
  if (/^[a-zA-Z]:\\|^\\\\/.test(exePath)) return exePath; // absolute or UNC
  const dataRoot = dirs?.data;
  const programsDir = dirs?.programs;
  if (dataRoot) {
    // Try dataRoot + exePath
    return dataRoot.replace(/[\\/]+$/, "") + "/" + exePath.replace(/^\/+/, "");
  }
  if (programsDir) {
    return (
      programsDir.replace(/[\\/]+$/, "") + "/" + exePath.replace(/^\/+/, "")
    );
  }
  return exePath;
}

// ---- Task Definitions -----------------------------------------------------
// The static definitions have been replaced by the registry in services.js

// GPU parent pseudo-task (virtual grouping item for FurMark/HeavyLoad)
const GPU_PARENT_ID = "gpu_stress_parent";

const PRESET_MAP = {
  general: [
    "adwcleaner_clean",
    "bleachbit_clean",
    "sfc_scan",
    "dism_health_check",
    "smartctl_report",
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
  ],
  custom: [],
  diagnostics: ["sfc_scan", "dism_health_check", "smartctl_report"],
};

// ---- Page Initialization --------------------------------------------------
/**
 * Initialize the Service Run Builder page.
 * - Restores persisted builder state when available.
 * - Applies preset or mode defaults on first load.
 * - Wires up event handlers, SortableJS, and JSON preview.
 *
 * Side effects: Mutates DOM, sessionStorage.
 */
export async function initPage() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const preset = params.get("preset");
  const mode = params.get("mode");

  const descEl = document.getElementById("svc-run-desc");
  const titleEl = document.getElementById("svc-run-title");
  const paletteEl = document.getElementById("svc-task-palette");
  const builder = document.getElementById("svc-run-builder");
  const jsonEl = document.getElementById("svc-json");
  const nextBtn = document.getElementById("svc-run-next");
  const backBtn = document.getElementById("svc-run-back");
  const btnSelectAll = document.getElementById("svc-select-all");
  const btnDeselectAll = document.getElementById("svc-deselect-all");
  const btnReset = document.getElementById("svc-reset");
  const btnCopyJson = document.getElementById("svc-copy-json");
  const searchInput = document.getElementById("svc-search");
  const searchClear = document.getElementById("svc-search-clear");
  // Raw JSON string for copy-to-clipboard while rendering highlighted HTML
  let lastJsonString = "{}";

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service";
  });
  nextBtn?.addEventListener("click", () => {
    sessionStorage.setItem("service.pendingRun", jsonEl.textContent || "{}");
    window.location.hash = "#/service-report";
  });

  // The persistent UI model for the builder
  /** @type {string[]} Order in which task ids appear in the list (selected or not). */
  let order = [];
  /** @type {Set<string>} Currently selected task ids (including GPU parent). */
  const selection = new Set();
  /** @type {Record<string, {params: Record<string, any>}>} Per-task params by id. */
  const state = {};
  /** GPU sub-task toggles under the virtual GPU parent. */
  const gpuSubs = { furmark: true, heavyload: false };
  /** Durations (minutes) for GPU sub-tasks. */
  const gpuParams = { furmarkMinutes: 1, heavyloadMinutes: 1 };
  let toolStatuses = [];

  // Persistence keys
  const PERSIST_KEY = "service.run.builder.v1";

  /** Save current builder state into sessionStorage. */
  function persist() {
    try {
      const data = {
        preset: preset || mode || null,
        order,
        selection: [...selection],
        state,
        gpuSubs,
        gpuParams,
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data));
    } catch {}
  }

  /**
   * Restore builder state from sessionStorage.
   *
   * @returns {boolean} true if a valid state was restored.
   */
  function restore() {
    try {
      const raw = sessionStorage.getItem(PERSIST_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.order)) return false;

      // Check if the saved preset matches the current preset
      const currentPreset = preset || mode || null;
      if (data.preset !== currentPreset) {
        return false; // Different preset, don't restore old state
      }

      order = data.order;
      selection.clear();
      (data.selection || []).forEach((id) => selection.add(id));
      Object.assign(state, data.state || {});
      Object.assign(gpuSubs, data.gpuSubs || {});
      Object.assign(gpuParams, data.gpuParams || {});
      return true;
    } catch {
      return false;
    }
  }

  // Initialize order & selection
  if (!restore()) {
    const base = preset
      ? PRESET_MAP[preset]
      : PRESET_MAP[mode] || PRESET_MAP.custom;
    base.forEach((id) => {
      selection.add(id);
      order.push(id);
    });
  }

  // Copy initial params
  // Initialize default params from registry
  listServiceIds().forEach((id) => {
    const def = getServiceById(id);
    if (!def) return;
    if (!state[id] && def.defaultParams)
      state[id] = { params: { ...def.defaultParams } };
  });

  // Set title/description
  if (preset) {
    titleEl.textContent = `Preset: ${capitalize(preset)} – Build Run Queue`;
    descEl.textContent = "Reorder or tweak tasks before execution.";
  } else if (mode === "custom") {
    titleEl.textContent = "Custom Service – Build Run Queue";
    descEl.textContent = "Pick tasks, arrange order, then Next.";
  } else {
    titleEl.textContent = "Build Run Queue";
    descEl.textContent = "Select tasks for this run.";
  }

  // ---- Search / Filtering --------------------------------------------------
  let fuse = null;
  let filterQuery = "";
  function buildFuseIndex() {
    const items = listServiceIds().map((id) => {
      const def = getServiceById(id) || {};
      return { id, label: def.label || id, group: def.group || "", keywords: [] };
    });
    // Include virtual GPU parent in the index so queries like "gpu" or "stress" match
    items.push({
      id: GPU_PARENT_ID,
      label: "GPU Stress",
      group: "Stress",
      keywords: ["gpu", "stress", "graphics", "furmark", "heavyload"],
    });
    fuse = new Fuse(items, {
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
  buildFuseIndex();

  function applyFilter(ids) {
    if (!filterQuery) return ids;
    if (!fuse) buildFuseIndex();
    const results = fuse.search(filterQuery);
    const allowed = new Set(results.map((r) => r.item.id));
    return ids.filter((id) => allowed.has(id));
  }

  searchInput?.addEventListener("input", () => {
    filterQuery = (searchInput.value || "").trim();
    renderPalette();
  });
  searchClear?.addEventListener("click", () => {
    filterQuery = "";
    if (searchInput) searchInput.value = "";
    renderPalette();
  });

  // ---- Rendering Helpers --------------------------------------------------
  /**
   * Render per-task parameter controls for a given service id.
   * Currently supports "seconds" and "minutes" fields.
   *
   * @param {string} id - Service id.
   * @param {Record<string, number>} params - Current parameter values.
   * @returns {HTMLDivElement}
   */
  function renderParamControls(id, params) {
    const wrapper = document.createElement("div");
    wrapper.className = "param-controls";
    // Prevent clicks within controls from bubbling to row/checkbox/drag
    [
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "pointerdown",
      "touchstart",
    ].forEach((evt) => {
      wrapper.addEventListener(evt, (e) => {
        e.stopPropagation();
      });
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
            <option value="read_only" ${modeVal === "read_only" ? "selected" : ""}>Read-only</option>
            <option value="fix_errors" ${modeVal === "fix_errors" ? "selected" : ""}>Fix errors (/f)</option>
            <option value="comprehensive" ${modeVal === "comprehensive" ? "selected" : ""}>Comprehensive (/f /r)</option>
          </select>
        </label>
        <label class="tiny-lab">
          <input type="checkbox" data-param="schedule_if_busy" ${schedVal ? "checked" : ""} />
          <span class="lab">Schedule if busy</span>
        </label>
      `;
      const driveInput = wrapper.querySelector('input[data-param="drive"]');
      const modeSelect = wrapper.querySelector('select[data-param="mode"]');
      const schedCb = wrapper.querySelector('input[data-param="schedule_if_busy"]');
      [driveInput, modeSelect, schedCb].forEach((el) => {
        ["mousedown", "pointerdown", "click"].forEach((evt) => {
          el.addEventListener(evt, (e) => e.stopPropagation());
        });
      });
      driveInput.addEventListener("change", () => {
        state[id].params.drive = (driveInput.value || "C:").trim();
        updateJson();
      });
      modeSelect.addEventListener("change", () => {
        state[id].params.mode = modeSelect.value;
        updateJson();
      });
      schedCb.addEventListener("change", () => {
        state[id].params.schedule_if_busy = !!schedCb.checked;
        updateJson();
      });
      return wrapper;
    }

    // KVRT options (Malware Scan)
    if (id === "kvrt_scan") {
      const allVolumesVal = !!params?.allVolumes;
      const processLevelVal = Number.isFinite(params?.processLevel)
        ? Math.max(0, Math.min(3, parseInt(params.processLevel, 10)))
        : 2;
      const detailsVal = true;

      wrapper.innerHTML = `
        <label class="tiny-lab" style="margin-right:12px;" title="Add all volumes to scan">
          <input type="checkbox" data-param="allVolumes" ${allVolumesVal ? "checked" : ""} />
          <span class="lab">Scan all volumes</span>
        </label>
        <label class="tiny-lab" style="margin-right:12px;" title="Set the level of danger of objects to be neutralized">
          <span class="lab">Process level</span>
          <select data-param="processLevel" aria-label="KVRT process level">
            <option value="0" ${processLevelVal === 0 ? "selected" : ""}>0: Skip all</option>
            <option value="1" ${processLevelVal === 1 ? "selected" : ""}>1: High</option>
            <option value="2" ${processLevelVal === 2 ? "selected" : ""}>2: High+Medium</option>
            <option value="3" ${processLevelVal === 3 ? "selected" : ""}>3: High+Medium+Low</option>
          </select>
        </label>
      `;

      // Layout horizontally
      try {
        wrapper.style.display = "flex";
        wrapper.style.flexWrap = "wrap";
        wrapper.style.alignItems = "center";
        wrapper.style.columnGap = "12px";
        wrapper.style.rowGap = "6px";
      } catch {}

      // Prevent bubbling from controls
      wrapper.querySelectorAll("input, select").forEach((el) => {
        ["mousedown", "pointerdown", "click"].forEach((evt) => {
          el.addEventListener(evt, (e) => e.stopPropagation());
        });
      });

      // Initialize state if missing
      state[id] = state[id] || { params: {} };
      state[id].params.allVolumes = allVolumesVal;
      state[id].params.processLevel = processLevelVal;
      state[id].params.details = detailsVal;

      // Bind events
      const cbAll = wrapper.querySelector('input[data-param="allVolumes"]');
      const selProc = wrapper.querySelector('select[data-param="processLevel"]');
      const cbDetails = null;

      cbAll?.addEventListener("change", () => {
        state[id].params.allVolumes = !!cbAll.checked;
        updateJson();
      });
      selProc?.addEventListener("change", () => {
        const v = parseInt(selProc.value, 10);
        state[id].params.processLevel = Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : 2;
        updateJson();
      });
      // details always enabled; no UI toggle

      return wrapper;
    }

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
        state[id].params[inp.dataset.param] =
          Number(inp.value) || state[id].params[inp.dataset.param];
        updateJson();
      });
    });
    return wrapper;
  }

  /**
   * Render GPU Stress sub-options (FurMark / HeavyLoad) with duration inputs.
   *
   * @returns {HTMLDivElement}
   */
  function renderGpuSubOptions() {
    const div = document.createElement("div");
    div.className = "gpu-sub";
    div.innerHTML = `
      <div class="gpu-line">
        <label class="gpu-check"><input type="checkbox" data-sub="furmark" ${
          gpuSubs.furmark ? "checked" : ""
        }> FurMark</label>
        <span class="sep">•</span> <span class="lab">Duration</span>
        <input type="number" class="dur" data-sub-dur="furmarkMinutes" value="${
          gpuParams.furmarkMinutes
        }" min="1" max="240" step="1" aria-label="FurMark duration in minutes"/>
        <span class="unit">min</span>
      </div>
      <div class="gpu-line">
        <label class="gpu-check"><input type="checkbox" data-sub="heavyload" ${
          gpuSubs.heavyload ? "checked" : ""
        }> HeavyLoad</label>
        <span class="sep">•</span> <span class="lab">Duration</span>
        <input type="number" class="dur" data-sub-dur="heavyloadMinutes" value="${
          gpuParams.heavyloadMinutes
        }" min="1" max="240" step="1" aria-label="HeavyLoad duration in minutes"/>
        <span class="unit">min</span>
      </div>
    `;
    div.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        gpuSubs[cb.dataset.sub] = cb.checked;
        updateJson();
      })
    );
    div.querySelectorAll("input.dur").forEach((inp) => {
      ["mousedown", "pointerdown", "click", "dblclick", "touchstart"].forEach(
        (evt) => {
          inp.addEventListener(evt, (e) => e.stopPropagation());
        }
      );
      inp.addEventListener("change", () => {
        gpuParams[inp.dataset.subDur] =
          Number(inp.value) || gpuParams[inp.dataset.subDur];
        updateJson();
      });
    });
    return div;
  }

  /**
   * Render a single task row item.
   *
   * - Non-GPU tasks render optional param controls when selected.
   * - GPU parent renders its sub-options when selected.
   * - Drag handle and selection checkbox are included; SortableJS manages DnD.
   *
   * @param {string} id - Service id or the GPU parent id.
   * @returns {HTMLLIElement}
   */
  function renderItem(id) {
    const isGpuParent = id === GPU_PARENT_ID;
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.id = id;
    // Dragging handled by SortableJS

    const selected = selection.has(id);
    let orderIdx = null;
    if (selected) {
      const selectedOrder = order.filter((x) => selection.has(x));
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
          <span class="meta">${group} ${renderAvailabilityBadge(id)}</span>
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
      // Only render inline controls for supported generic params to avoid empty expansion
      const p = state[id]?.params || {};
      const hasGenericParams =
        Object.prototype.hasOwnProperty.call(p, "minutes") ||
        Object.prototype.hasOwnProperty.call(p, "seconds") ||
        id === "chkdsk_scan" ||
        id === "kvrt_scan";
      if (hasGenericParams) {
        row.appendChild(renderParamControls(id, p));
      }
    }

    if (isGpuParent && selected) {
      row.appendChild(renderGpuSubOptions());
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selection.add(id);
        if (!order.includes(id)) order.push(id);
      } else {
        selection.delete(id);
        // Don't remove from order so original position is preserved on reselect
      }
      persist();
      renderPalette();
    });

    // No per-item native DnD; SortableJS will handle list-level drag events

    return li;
  }

  /**
   * Render the full palette in the current unified order.
   *
   * Implementation notes:
   * - We re-create SortableJS instance after each render to bind to fresh DOM.
   * - `order` includes unselected items so reselection preserves position.
   * - GPU sub-services are hidden from the list; only the parent is shown.
   */
  function renderPalette() {
    paletteEl.innerHTML = "";
    // Destroy old Sortable on palette (we will attach to Queue only)
    if (paletteEl.__sortable) {
      try { paletteEl.__sortable.destroy(); } catch {}
      paletteEl.__sortable = null;
    }

    const allTasks = listServiceIds().concat(GPU_PARENT_ID);
    const displayOrder = [];
    const seen = new Set();
    for (const id of order) {
      if (!allTasks.includes(id)) continue;
      if (["furmark_stress_test", "heavyload_stress_gpu"].includes(id)) continue;
      if (!seen.has(id)) { seen.add(id); displayOrder.push(id); }
    }
    for (const id of allTasks) {
      if (["furmark_stress_test", "heavyload_stress_gpu"].includes(id)) continue;
      if (!seen.has(id)) { seen.add(id); displayOrder.push(id); }
    }

    const finalOrder = filterQuery
      ? (() => {
          const base = displayOrder.filter((id) => id !== GPU_PARENT_ID);
          const filtered = applyFilter(base);
          if (applyFilter([GPU_PARENT_ID]).includes(GPU_PARENT_ID)) {
            filtered.push(GPU_PARENT_ID);
          }
          return filtered;
        })()
      : displayOrder;

    // Build Queue (selected) and Category groups
    const selectedIds = finalOrder.filter((id) => selection.has(id));
    const unselectedIds = finalOrder.filter((id) => !selection.has(id));

    // Helper: service category
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
    paletteEl.appendChild(queueBlock);
    const queueListEl = queueBlock.querySelector("#svc-queue-list");
    selectedIds.forEach((id) => queueListEl.appendChild(renderItem(id)));
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

    // Build category map from remaining IDs
    const catMap = new Map();
    unselectedIds.forEach((id) => {
      const cat = getCategory(id);
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(id);
    });

    // Stable category order per spec
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
      return idx === -1 ? priority.length - 1 : idx; // unknowns near end; 'Other' last explicitly
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
      catMap.get(cat).forEach((id) => ul.appendChild(renderItem(id)));
      paletteEl.appendChild(block);
    });

    validateNext(tasksCountRunnable());
    updateJson();

    // Enable Sortable only on Queue list (reordering selected tasks)
    if (queueListEl) {
      try { if (queueListEl.__sortable) queueListEl.__sortable.destroy(); } catch {}
      queueListEl.__sortable = Sortable.create(queueListEl, {
        animation: 150,
        draggable: ".task-item",
        handle: ".grab",
        ghostClass: "drag-ghost",
        dragClass: "drag-active",
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 5,
        setData: (dt) => { try { dt.setData("text", ""); } catch {} },
        filter: "input, textarea, select, label, button, .param-controls, .gpu-sub",
        preventOnFilter: true,
        onEnd: () => {
          // New queue order
          const newQueueOrder = Array.from(queueListEl.querySelectorAll(".task-item"))
            .map((li) => li.dataset.id)
            .filter(Boolean);
          // Rebuild global order: selected in new order + rest in prior order
          const selectedSet = new Set(newQueueOrder);
          const rest = order.filter((id) => !selectedSet.has(id));
          order = newQueueOrder.concat(rest);
          persist();
          renderPalette();
        },
      });
    }
  }

  // ---- JSON Generation ----------------------------------------------------
  /**
   * Build the ordered tasks array expected by the Python runner.
   *
   * - GPU parent expands into one or more concrete tasks depending on toggles.
   * - Tasks with an empty `executable_path` are filtered out as non-runnable.
   *
   * @returns {Promise<BuiltTask[]>}
   */
  async function generateTasksArray() {
    const result = [];
    for (const id of order) {
      if (!selection.has(id)) continue;
      if (id === GPU_PARENT_ID) {
        if (gpuSubs.furmark) {
          const furmarkDef = getServiceById("furmark_stress_test");
          if (furmarkDef) {
            result.push(
              await furmarkDef.build({
                params: { minutes: gpuParams.furmarkMinutes },
                resolveToolPath: toolPath,
                getDataDirs,
              })
            );
          }
        }
        if (gpuSubs.heavyload) {
          const heavyloadDef = getServiceById("heavyload_stress_gpu");
          if (heavyloadDef) {
            result.push(
              await heavyloadDef.build({
                params: { minutes: gpuParams.heavyloadMinutes },
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
        params: (state[id] && state[id].params) || {},
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
   * Regenerate JSON preview and re-validate Next button.
   * Debouncing is intentionally omitted for simplicity as updates are user-driven.
   */
  async function updateJson() {
    jsonEl.textContent = "Generating...";
    const tasks = await generateTasksArray();
    lastJsonString = JSON.stringify({ tasks }, null, 2);
    const highlighted = hljs.highlight(lastJsonString, { language: "json" }).value;
    jsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
    persist();
    // Re-validate Next button whenever JSON changes (e.g., GPU sub-options)
    validateNext(tasksCountRunnable());
  }

  // Availability + controls
  toolStatuses = await getToolStatuses();
  // Also load program list to improve availability detection
  try {
    const { core } = window.__TAURI__ || {};
    const inv = core?.invoke;
    PROGRAMS_CACHE = inv ? await inv("list_programs") : [];
  } catch {
    PROGRAMS_CACHE = [];
  }

  btnSelectAll?.addEventListener("click", () => {
    const all = listServiceIds().concat(GPU_PARENT_ID);
    all.forEach((id) => selection.add(id));
    // Ensure every selected item is represented in order once
    all.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    persist();
    renderPalette();
  });
  btnDeselectAll?.addEventListener("click", () => {
    // Keep all tasks visible but set selection empty
    selection.clear();
    // Keep current order as-is to preserve future reselection positions
    persist();
    renderPalette();
  });
  btnReset?.addEventListener("click", () => {
    sessionStorage.removeItem(PERSIST_KEY);
    order = [];
    selection.clear();
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(gpuSubs, { furmark: true, heavyload: false });
    Object.assign(gpuParams, { furmarkMinutes: 1, heavyloadMinutes: 1 });
    const base = preset
      ? PRESET_MAP[preset]
      : PRESET_MAP[mode] || PRESET_MAP.custom;
    base.forEach((id) => {
      selection.add(id);
      order.push(id);
    });
    listServiceIds().forEach((id) => {
      const def = getServiceById(id);
      if (def && def.defaultParams)
        state[id] = { params: { ...def.defaultParams } };
    });
    renderPalette();
  });
  btnCopyJson?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastJsonString || "{}");
      btnCopyJson.textContent = "Copied";
      setTimeout(() => (btnCopyJson.textContent = "Copy JSON"), 1200);
    } catch {}
  });

  // Keyboard reordering on focused rows (ArrowUp/Down + Ctrl to move)
  paletteEl.addEventListener("keydown", (e) => {
    // Ignore when typing in interactive controls
    const tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const row = e.target?.closest?.(".task-item");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    const idx = order.indexOf(id);
    if (e.key === "ArrowUp" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      moveInOrder(idx, Math.max(0, idx - 1));
      persist();
      renderPalette();
    } else if (e.key === "ArrowDown" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      moveInOrder(idx, Math.min(order.length - 1, idx + 1));
      persist();
      renderPalette();
    }
  });

  renderPalette();
  builder.hidden = false;

  // Helpers
  /**
   * Move an item within the `order` array (bounds-checked, no-op if unchanged).
   *
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  function moveInOrder(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const id = order.splice(fromIndex, 1)[0];
    order.splice(toIndex, 0, id);
  }

  // Native drop indicators removed in favor of SortableJS visuals

  /**
   * Count tasks that are runnable given current availability and selections.
   * - Built-in tools (SFC/DISM) are always considered available.
   * - GPU parent counts as one when at least one available sub-task is enabled.
   *
   * @returns {number}
   */
  function tasksCountRunnable() {
    // Count tasks that have no missing tool dependency
    const tasks = order.filter((id) => selection.has(id));
    let count = 0;
    for (const id of tasks) {
      if (id === GPU_PARENT_ID) {
        // GPU parent is only runnable if at least one sub-option is selected AND available
        const furmarkRunnable =
          gpuSubs.furmark && isToolOk(["furmark", "furmark2"]);
        const heavyloadRunnable = gpuSubs.heavyload && isToolOk(["heavyload"]);
        if (furmarkRunnable || heavyloadRunnable) {
          count++; // Count the GPU parent as one runnable task if it has valid sub-options
        }
        continue;
      }
      const key = toolKeyForTask(id);
      // Handle built-in Windows tools (empty toolKeys array)
      if (Array.isArray(key) && key.length === 0) {
        count++; // Built-in tools are always available
      } else if (!key || isToolOk(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Enable/disable the Next button based on runnable count and selection.
   * @param {number} runnableCount
   */
  function validateNext(runnableCount) {
    nextBtn.disabled = runnableCount === 0 || selection.size === 0;
  }

  /**
   * Determine whether at least one of the given logical tool keys is available.
   * Checks both `toolStatuses` and the saved programs list as a fallback.
   *
   * @param {string|string[]} keyOrKeys
   * @returns {boolean}
   */
  function isToolOk(keyOrKeys) {
    if (!keyOrKeys) return true;
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    // Check by toolStatuses
    const okByStatus = keys.some((k) => {
      const hit = toolStatuses.find((t) => t.key === k);
      return !!(hit && hit.exists);
    });
    if (okByStatus) return true;
    // Fallback: check saved programs list
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
   * Render the availability badge text for a given task id.
   *
   * @param {string} id
   * @returns {string} HTML string for the badge.
   */
  function renderAvailabilityBadge(id) {
    if (id === "sfc_scan" || id === "dism_health_check" || id === "chkdsk_scan") {
      return '<span class="badge ok" title="Built-in Windows tool">Built-in</span>';
    }
    if (id === GPU_PARENT_ID) {
      const okF = isToolOk(["furmark", "furmark2"]);
      const okH = isToolOk(["heavyload"]);
      const any = okF || okH;
      const title = `FurMark: ${okF ? "Available" : "Missing"} | HeavyLoad: ${
        okH ? "Available" : "Missing"
      }`;
      return `<span class="badge ${any ? "ok" : "missing"}" title="${title}">${
        any ? "Available" : "Missing"
      }</span>`;
    }
    const key = toolKeyForTask(id);
    if (Array.isArray(key) && key.length === 0) {
      return '<span class="badge ok" title="Built-in">Built-in</span>';
    }
    if (!key) return "";
    const ok = isToolOk(key);
    return `<span class="badge ${ok ? "ok" : "missing"}">${
      ok ? "Available" : "Missing"
    }</span>`;
  }

  /**
   * Map a service id to its logical tool key(s) used for availability checks.
   * @param {string} id
   * @returns {string|string[]|null}
   */
  function toolKeyForTask(id) {
    return toolKeysForService(id);
  }
}
