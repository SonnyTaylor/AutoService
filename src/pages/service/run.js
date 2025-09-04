/**
 * Service Run Builder (run.js)
 * --------------------------------------------------------------
 * Responsibilities:
 *  - Present list of available maintenance/stress tasks.
 *  - Allow selecting & ordering tasks (keyboard + mouse drag reordering).
 *  - Expose per-task parameter controls (durations) inline.
 *  - Provide GPU Stress parent task with sub-options (FurMark / HeavyLoad) where FurMark defaults on.
 *  - Generate JSON spec (similar to test_all.json) stored in sessionStorage for next page.
 *  - Resolve tool executable paths via tools.js (no hard-coded versioned paths).
 *  - Internal documentation for future contributors.
 */

import { getToolPath, getToolStatuses } from "../../utils/tools.js";
import {
  SERVICES,
  listServiceIds,
  getServiceById,
  toolKeysForService,
} from "./services.js";

// ---- Utility Helpers ------------------------------------------------------
/** Capitalizes the first letter of a string */
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

let TOOL_CACHE = null;
let PROGRAMS_CACHE = null;
let DATA_DIRS_CACHE = null;
/** Fetches tool path by key (or keys) with caching and fallback to saved programs */
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

// GPU parent pseudo-task
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
  custom: [
    "adwcleaner_clean",
    "bleachbit_clean",
    "dism_health_check",
    "sfc_scan",
    "smartctl_report",
  ],
};

// ---- Page Initialization --------------------------------------------------
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

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service";
  });
  nextBtn?.addEventListener("click", () => {
    sessionStorage.setItem("service.pendingRun", jsonEl.textContent || "{}");
    window.location.hash = "#/service-report";
  });

  let order = [];
  const selection = new Set();
  const state = {};
  const gpuSubs = { furmark: true, heavyload: false };
  const gpuParams = { furmarkMinutes: 1, heavyloadMinutes: 1 };
  let toolStatuses = [];

  // Persistence keys
  const PERSIST_KEY = "service.run.builder.v1";

  function persist() {
    try {
      const data = {
        order,
        selection: [...selection],
        state,
        gpuSubs,
        gpuParams,
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data));
    } catch {}
  }

  function restore() {
    try {
      const raw = sessionStorage.getItem(PERSIST_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.order)) return false;
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

  // ---- Rendering Helpers --------------------------------------------------
  function renderParamControls(id, params) {
    const wrapper = document.createElement("div");
    wrapper.className = "param-controls";
    Object.entries(params).forEach(([key, value]) => {
      if (key === "seconds") {
        wrapper.innerHTML += `<label class="tiny-lab"><span class="lab">Duration</span> <input type="number" class="minutes-input" min="10" max="3600" step="10" data-param="seconds" value="${value}" aria-label="Duration in seconds" /> <span class="unit">sec</span></label>`;
      } else if (key === "minutes") {
        wrapper.innerHTML += `<label class="tiny-lab"><span class="lab">Duration</span> <input type="number" class="minutes-input" min="1" max="240" step="1" data-param="minutes" value="${value}" aria-label="Duration in minutes" /> <span class="unit">min</span></label>`;
      }
    });
    wrapper.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        state[id].params[inp.dataset.param] =
          Number(inp.value) || state[id].params[inp.dataset.param];
        updateJson();
      });
    });
    return wrapper;
  }

  function renderGpuSubOptions() {
    const div = document.createElement("div");
    div.className = "gpu-sub";
    div.innerHTML = `
      <label><input type="checkbox" data-sub="furmark" ${
        gpuSubs.furmark ? "checked" : ""
      }> FurMark <span class="sep">•</span> <span class="lab">Duration</span> <input type="number" class="dur" data-sub-dur="furmarkMinutes" value="${
      gpuParams.furmarkMinutes
    }" min="1" max="240" step="1" aria-label="FurMark duration in minutes"/> <span class="unit">min</span></label>
      <label><input type="checkbox" data-sub="heavyload" ${
        gpuSubs.heavyload ? "checked" : ""
      }> HeavyLoad <span class="sep">•</span> <span class="lab">Duration</span> <input type="number" class="dur" data-sub-dur="heavyloadMinutes" value="${
      gpuParams.heavyloadMinutes
    }" min="1" max="240" step="1" aria-label="HeavyLoad duration in minutes"/> <span class="unit">min</span></label>
    `;
    div.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        gpuSubs[cb.dataset.sub] = cb.checked;
        updateJson();
      })
    );
    div.querySelectorAll("input.dur").forEach((inp) =>
      inp.addEventListener("change", () => {
        gpuParams[inp.dataset.subDur] =
          Number(inp.value) || gpuParams[inp.dataset.subDur];
        updateJson();
      })
    );
    return div;
  }

  function renderItem(id) {
    const isGpuParent = id === GPU_PARENT_ID;
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.id = id;
    li.draggable = true;

    const selected = selection.has(id);
    const orderIdx = selected ? [...order].indexOf(id) + 1 : null;
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
      row.appendChild(renderParamControls(id, state[id].params));
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
        order = order.filter((x) => x !== id);
      }
      persist();
      renderPalette();
    });

    // Drag & drop
    li.addEventListener("dragstart", (e) => {
      li.classList.add("dragging");
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      clearDropIndicators();
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      const bounds = li.getBoundingClientRect();
      const halfway = bounds.top + bounds.height / 2;
      showDropIndicator(li, e.clientY < halfway ? "top" : "bottom");
      e.dataTransfer.dropEffect = "move";
    });
    li.addEventListener("dragleave", () => clearDropIndicators());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      clearDropIndicators();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === id) return;
      const targetIndex = order.indexOf(id);
      const draggedIndex = order.indexOf(draggedId);
      const bounds = li.getBoundingClientRect();
      const insertAfter = e.clientY >= bounds.top + bounds.height / 2;
      const newIndex = insertAfter ? targetIndex + 1 : targetIndex;
      moveInOrder(draggedIndex, newIndex);
      persist();
      renderPalette();
    });

    return li;
  }

  function renderPalette() {
    paletteEl.innerHTML = "";
    // Always render all tasks in consistent order:
    // 1. Selected tasks in their execution order first
    // 2. Then unselected tasks
    const allTasks = listServiceIds().concat(GPU_PARENT_ID);
    const selectedTasks = order.filter(
      (id) => selection.has(id) && allTasks.includes(id)
    );
    const unselectedTasks = allTasks.filter(
      (id) => !selection.has(id) && !selectedTasks.includes(id)
    );

    // Render selected tasks first (in execution order)
    selectedTasks.forEach((id) => {
      if (!["furmark_stress_test", "heavyload_stress_gpu"].includes(id)) {
        paletteEl.appendChild(renderItem(id));
      }
    });

    // Render unselected tasks after
    unselectedTasks.forEach((id) => {
      if (!["furmark_stress_test", "heavyload_stress_gpu"].includes(id)) {
        paletteEl.appendChild(renderItem(id));
      }
    });

    validateNext(tasksCountRunnable());
    updateJson();
  }

  // ---- JSON Generation ----------------------------------------------------
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

  async function updateJson() {
    jsonEl.textContent = "Generating...";
    const tasks = await generateTasksArray();
    jsonEl.textContent = JSON.stringify({ tasks }, null, 2);
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
    // Ensure `order` still covers all tasks so re-selecting doesn't lose position
    const all = listServiceIds().concat(GPU_PARENT_ID);
    all.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
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
      await navigator.clipboard.writeText(jsonEl.textContent || "{}");
      btnCopyJson.textContent = "Copied";
      setTimeout(() => (btnCopyJson.textContent = "Copy JSON"), 1200);
    } catch {}
  });

  // Keyboard reordering on focused rows (ArrowUp/Down + Ctrl to move)
  paletteEl.addEventListener("keydown", (e) => {
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
  function moveInOrder(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const id = order.splice(fromIndex, 1)[0];
    order.splice(toIndex, 0, id);
  }

  function showDropIndicator(li, where) {
    clearDropIndicators();
    const bar = document.createElement("div");
    bar.className =
      "drop-indicator " + (where === "top" ? "drop-top" : "drop-bottom");
    li.appendChild(bar);
  }
  function clearDropIndicators() {
    paletteEl.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
  }

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

  function validateNext(runnableCount) {
    nextBtn.disabled = runnableCount === 0 || selection.size === 0;
  }

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

  function renderAvailabilityBadge(id) {
    if (id === "sfc_scan" || id === "dism_health_check") {
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
    if (!key) return "";
    const ok = isToolOk(key);
    return `<span class="badge ${ok ? "ok" : "missing"}">${
      ok ? "Available" : "Missing"
    }</span>`;
  }

  function toolKeyForTask(id) {
    return toolKeysForService(id);
  }
}
