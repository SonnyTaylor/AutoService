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

// ---- Utility Helpers ------------------------------------------------------
/** Capitalizes the first letter of a string */
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

let TOOL_CACHE = null;
/** Fetches tool path by key with caching */
async function toolPath(key) {
  if (!TOOL_CACHE) TOOL_CACHE = await getToolStatuses();
  const hit = TOOL_CACHE.find((t) => t.key === key);
  return hit?.path || null;
}

// ---- Task Definitions -----------------------------------------------------
const ATOMIC_TASKS = {
  adwcleaner_clean: {
    label: "Adware Clean (AdwCleaner)",
    group: "Cleanup",
    async build() {
      return {
        type: "adwcleaner_clean",
        executable_path: await toolPath("adwcleaner"),
        working_path: "..\\data\\logs",
        clean_preinstalled: false,
      };
    },
  },
  bleachbit_clean: {
    label: "Junk Cleanup (BleachBit)",
    group: "Cleanup",
    async build() {
      return {
        type: "bleachbit_clean",
        executable_path: await toolPath("bleachbit"),
        options: ["system.tmp", "system.recycle_bin", "system.prefetch"],
      };
    },
  },
  dism_health_check: {
    label: "DISM Health Check",
    group: "System Integrity",
    async build() {
      return {
        type: "dism_health_check",
        actions: ["checkhealth", "scanhealth", "restorehealth"],
      };
    },
  },
  sfc_scan: {
    label: "SFC Scan",
    group: "System Integrity",
    async build() {
      return { type: "sfc_scan" };
    },
  },
  smartctl_report: {
    label: "Drive Health Report (smartctl)",
    group: "Diagnostics",
    async build() {
      // Prefer an explicit smartctl entry if present (smartctl.exe). Fall back to GSmartControl.
      const pSmart = await toolPath("smartctl");
      const pGsc = await toolPath("gsmartcontrol");
      return {
        type: "smartctl_report",
        executable_path: pSmart || pGsc,
        detail_level: "basic",
      };
    },
  },
  furmark_stress_test: {
    label: "GPU Stress (FurMark)",
    group: "Stress",
    params: { minutes: 1 },
    async build(state) {
      const p = await toolPath("furmark");
      return {
        type: "furmark_stress_test",
        executable_path: p,
        duration_minutes: state.params.minutes || 1,
        width: 1920,
        height: 1080,
        demo: "furmark-gl",
        extra_args: ["--no-gui"],
      };
    },
  },
  heavyload_stress_cpu: {
    label: "CPU Stress (HeavyLoad)",
    group: "Stress",
    params: { minutes: 1 },
    async build(state) {
      const p = await toolPath("heavyload");
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: state.params.minutes || 1,
        headless: false,
        stress_cpu: true,
        stress_memory: false,
        stress_gpu: false,
      };
    },
  },
  heavyload_stress_memory: {
    label: "RAM Stress (HeavyLoad)",
    group: "Stress",
    params: { minutes: 1 },
    async build(state) {
      const p = await toolPath("heavyload");
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: state.params.minutes || 1,
        headless: false,
        stress_cpu: false,
        stress_memory: true,
        stress_gpu: false,
      };
    },
  },
  heavyload_stress_gpu: {
    label: "GPU Stress (HeavyLoad)",
    group: "Stress",
    params: { minutes: 1 },
    async build(state) {
      const p = await toolPath("heavyload");
      return {
        type: "heavyload_stress_test",
        executable_path: p,
        duration_minutes: state.params.minutes || 1,
        headless: false,
        stress_cpu: false,
        stress_memory: false,
        stress_gpu: true,
      };
    },
  },
};

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

  // Initialize order & selection
  const base = preset
    ? PRESET_MAP[preset]
    : PRESET_MAP[mode] || PRESET_MAP.custom;
  base.forEach((id) => {
    selection.add(id);
    order.push(id);
  });

  // Copy initial params
  Object.entries(ATOMIC_TASKS).forEach(([id, def]) => {
    if (def.params) state[id] = { params: { ...def.params } };
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
        wrapper.innerHTML += `<label class="tiny-lab">Sec <input type="number" min="10" max="3600" step="10" data-param="seconds" value="${value}" /></label>`;
      } else if (key === "minutes") {
        wrapper.innerHTML += `<label class="tiny-lab">Min <input type="number" min="1" max="240" step="1" data-param="minutes" value="${value}" /></label>`;
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
      }> FurMark <input type="number" class="dur" data-sub-dur="furmarkMinutes" value="${
      gpuParams.furmarkMinutes
    }" min="1" max="240" step="1"/></label>
      <label><input type="checkbox" data-sub="heavyload" ${
        gpuSubs.heavyload ? "checked" : ""
      }> HeavyLoad <input type="number" class="dur" data-sub-dur="heavyloadMinutes" value="${
      gpuParams.heavyloadMinutes
    }" min="1" max="240" step="1"/></label>
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
    li.draggable = false;

    const selected = selection.has(id);
    const orderIdx = selected ? [...order].indexOf(id) + 1 : null;
    const label = isGpuParent ? "GPU Stress" : ATOMIC_TASKS[id]?.label || id;
    const group = isGpuParent ? "Stress" : ATOMIC_TASKS[id]?.group || "";

    li.innerHTML = `
      <div class="task-row">
        <input type="checkbox" ${
          selected ? "checked" : ""
        } aria-label="Select task ${label}">
        <span class="grab" aria-hidden="true">⋮⋮</span>
        <span class="main">
          <span class="name">${label}</span>
          <span class="meta">${group}</span>
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

    if (!isGpuParent && selected && ATOMIC_TASKS[id]?.params) {
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
      renderPalette();
    });

    return li;
  }

  function renderPalette() {
    paletteEl.innerHTML = "";
    order.forEach((id) => {
      if (!["furmark_stress_test", "heavyload_stress_gpu"].includes(id))
        paletteEl.appendChild(renderItem(id));
    });
    Object.keys(ATOMIC_TASKS)
      .concat(GPU_PARENT_ID)
      .forEach((id) => {
        if (
          !["furmark_stress_test", "heavyload_stress_gpu"].includes(id) &&
          !selection.has(id)
        )
          paletteEl.appendChild(renderItem(id));
      });
    nextBtn.disabled = selection.size === 0;
    updateJson();
  }

  // ---- JSON Generation ----------------------------------------------------
  async function generateTasksArray() {
    const result = [];
    for (const id of order) {
      if (!selection.has(id)) continue;
      if (id === GPU_PARENT_ID) {
        if (gpuSubs.furmark)
          result.push(
            await ATOMIC_TASKS.furmark_stress_test.build({
              params: { minutes: gpuParams.furmarkMinutes },
            })
          );
        if (gpuSubs.heavyload)
          result.push(
            await ATOMIC_TASKS.heavyload_stress_gpu.build({
              params: { minutes: gpuParams.heavyloadMinutes },
            })
          );
        continue;
      }
      const def = ATOMIC_TASKS[id];
      if (!def) continue;
      result.push(await def.build(state[id] || { params: {} }));
    }
    return result.filter(
      (t) => !("executable_path" in t) || !!t.executable_path
    );
  }

  async function updateJson() {
    jsonEl.textContent = "Generating...";
    const tasks = await generateTasksArray();
    jsonEl.textContent = JSON.stringify({ tasks }, null, 2);
  }

  renderPalette();
  builder.hidden = false;
}
