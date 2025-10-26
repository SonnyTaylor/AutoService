import { getToolStatuses } from "../../utils/tools.js";
import { promptServiceMetadata } from "../../utils/service-metadata-modal.js";
import { isAutoSaveEnabled, autoSaveReport } from "../../utils/reports.js";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import "highlight.js/styles/github-dark.css";
hljs.registerLanguage("json", jsonLang);
// Notification plugin helpers (dynamically imported when needed)
let notifyApi = null;
async function ensureNotificationApi() {
  if (notifyApi) return notifyApi;
  try {
    notifyApi = await import("@tauri-apps/plugin-notification");
  } catch (e) {
    console.warn("Notification plugin not available:", e);
    notifyApi = null;
  }
  return notifyApi;
}

/**
 * Service Runner controller.
 *
 * Spawns the Python sidecar (service_runner.exe) via PowerShell, streams live
 * logs into the UI, tracks per-task status markers, and renders the final JSON.
 */
export async function initPage() {
  const { core } = window.__TAURI__ || {};
  const { invoke } = core || {};
  // Lazy import of system-info cache utilities
  let cacheApi = null;
  try {
    cacheApi = await import("../system-info/cache.js");
  } catch {}
  const runnerTitle = document.getElementById("svc-report-title");
  const runnerDesc = document.getElementById("svc-report-desc");
  const backBtn = document.getElementById("svc-report-back");
  const runBtn = document.getElementById("svc-report-run");
  const container = document.getElementById("svc-runner");
  const taskListEl = document.getElementById("svc-task-status");
  const logEl = document.getElementById("svc-log");
  const logOverlay = document.getElementById("svc-log-overlay");
  const finalJsonEl = document.getElementById("svc-final-json");
  const copyFinalBtn = document.getElementById("svc-copy-final");
  const viewResultsBtn = document.getElementById("svc-view-results");
  const summaryEl = document.getElementById("svc-summary");
  const summaryTitleEl = document.getElementById("svc-summary-title");
  const summaryIconEl = document.getElementById("svc-summary-icon");
  const summarySubEl = document.getElementById("svc-summary-sub");
  const summaryProgWrap = document.getElementById("svc-summary-progress");
  const summaryProgBar = document.getElementById("svc-summary-progress-bar");
  // Keep raw JSON for copy-to-clipboard while showing highlighted HTML
  let lastFinalJsonString = "{}";
  // Helper: persist final report to both session and local storage
  function persistFinalReport(jsonString) {
    try {
      sessionStorage.setItem("service.finalReport", jsonString);
    } catch {}
    try {
      localStorage.setItem("service.finalReport", jsonString);
    } catch {}
  }
  // Helper: clear any cached final report (used when starting a new run)
  function clearFinalReportCache() {
    try {
      sessionStorage.removeItem("service.finalReport");
    } catch {}
    try {
      localStorage.removeItem("service.finalReport");
    } catch {}
  }

  // Helper: auto-save report if enabled in settings
  async function handleAutoSave(finalReport, payload) {
    try {
      // Check if auto-save is enabled
      const autoSaveOn = await isAutoSaveEnabled();
      if (!autoSaveOn) {
        console.log("Auto-save disabled, skipping");
        return;
      }

      console.log("Auto-save enabled, saving report...");

      // Get system info for hostname
      let hostname = "Unknown_PC";
      try {
        const sysInfo = await invoke("get_system_info");
        hostname = sysInfo?.hostname || hostname;
      } catch (e) {
        console.warn("Could not fetch hostname for auto-save:", e);
      }

      // Get metadata from sessionStorage
      let customerName = null;
      let technicianName = null;
      try {
        const metadataRaw = sessionStorage.getItem("service.metadata");
        if (metadataRaw) {
          const metadata = JSON.parse(metadataRaw);
          customerName = metadata.customerName || null;
          technicianName = metadata.technicianName || null;
        }
      } catch (e) {
        console.warn("Could not load metadata for auto-save:", e);
      }

      // Auto-save the report
      const response = await autoSaveReport(finalReport, {
        planFilePath: payload.plan_file || null,
        logFilePath: payload.log_file || null,
        hostname,
        customerName,
        technicianName,
      });

      if (response.success) {
        console.log("Report auto-saved successfully:", response.report_folder);
        // Show a subtle notification
        showAutoSaveNotification(response.report_folder);
      } else {
        console.error("Auto-save failed:", response.error);
      }
    } catch (error) {
      console.error("Auto-save error:", error);
    }
  }

  // Helper: show auto-save notification
  function showAutoSaveNotification(folderPath) {
    try {
      const notification = document.createElement("div");
      notification.className = "autosave-notification";
      notification.innerHTML = `
        <i class="ph ph-check-circle" style="margin-right: 8px; vertical-align: -2px;"></i>
        Report auto-saved to: ${folderPath}
      `;
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideInUp 0.3s ease-out;
        max-width: 400px;
      `;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.style.animation = "slideOutDown 0.3s ease-in";
        setTimeout(() => notification.remove(), 300);
      }, 4000);
    } catch (e) {
      console.warn("Could not show auto-save notification:", e);
    }
  }

  // Ensure the log overlay is hidden on initial load
  const forceHideOverlay = () => {
    try {
      showOverlay(false);
    } catch {}
  };
  forceHideOverlay();

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-run";
  });

  copyFinalBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastFinalJsonString || "{}");
      copyFinalBtn.textContent = "Copied";
      setTimeout(() => (copyFinalBtn.textContent = "Copy JSON"), 1200);
    } catch {}
  });

  // Load pending run JSON from session
  let runPlan = {};
  try {
    const raw = sessionStorage.getItem("service.pendingRun") || "{}";
    runPlan = JSON.parse(raw);
  } catch {
    runPlan = {};
  }

  const tasks = Array.isArray(runPlan?.tasks) ? runPlan.tasks : [];
  if (!tasks.length) {
    runnerTitle.textContent = "Service Runner – Nothing to Run";
    runnerDesc.textContent = "Build a run queue first.";
    runBtn.disabled = true;
  } else {
    runnerTitle.textContent = "Service Runner – Ready";
    runnerDesc.textContent = `${tasks.length} task${
      tasks.length === 1 ? "" : "s"
    } queued.`;
  }

  // Render initial task list
  const taskState = tasks.map((t, i) => ({
    id: i,
    type: t.type,
    label: (t && t.ui_label) || friendlyTaskLabel(t.type),
    status: "pending", // pending | running | success | failure | skipped
  }));
  renderTaskList();

  container.hidden = false;

  // Try to rehydrate from cached final report so navigation back preserves results
  try {
    const cachedRaw =
      sessionStorage.getItem("service.finalReport") ||
      localStorage.getItem("service.finalReport");
    if (cachedRaw && cachedRaw.length > 2) {
      lastFinalJsonString = cachedRaw;
      try {
        const obj = JSON.parse(cachedRaw);
        const highlighted = hljs.highlight(cachedRaw, {
          language: "json",
        }).value;
        finalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
        try {
          applyFinalStatusesFromReport(obj);
        } catch {}
        const ok = obj?.overall_status === "success";
        showSummary(ok);
        try {
          if (viewResultsBtn) {
            viewResultsBtn.removeAttribute("disabled");
          }
        } catch {}
      } catch {}
    }
  } catch {}

  // Initialize task status tracking
  let taskStatuses = {};
  tasks.forEach((task, index) => {
    taskStatuses[index] = "pending";
  });

  // Track whether a run is currently in progress to prevent duplicate clicks
  let _isRunning = false;
  // Hold results for client-only tasks (not executed by Python runner)
  let _clientResults = [];
  // Prevent duplicate notifications per run
  let _notifiedOnce = false;

  runBtn?.addEventListener("click", async () => {
    if (!tasks.length) return;
    if (_isRunning) return; // guard against double clicks

    // Prompt for service metadata if business mode is enabled
    const serviceMetadata = await promptServiceMetadata();

    // Handle three cases:
    // - null: business mode disabled, no prompt shown, continue normally
    // - false: user cancelled the prompt, abort
    // - object: user filled in the form, continue with metadata
    if (serviceMetadata === false) {
      // User cancelled - don't start the service
      return;
    }

    // Store metadata in sessionStorage for use in results/print pages (if provided)
    if (serviceMetadata && typeof serviceMetadata === "object") {
      try {
        sessionStorage.setItem(
          "service.metadata",
          JSON.stringify(serviceMetadata)
        );
      } catch {}
    }

    _isRunning = true;
    // Hard-disable UI controls
    runBtn.disabled = true;
    runBtn.setAttribute("disabled", "");
    runBtn.setAttribute("aria-disabled", "true");
    backBtn.disabled = true;
    backBtn.setAttribute("disabled", "");
    // New service: clear any previously cached results so navigating back won't show stale data
    clearFinalReportCache();
    lastFinalJsonString = "{}";
    _notifiedOnce = false;
    if (viewResultsBtn) {
      try {
        viewResultsBtn.setAttribute("disabled", "");
      } catch {}
    }
    // Reset ALL task states to pending for fresh run
    taskState.forEach((task) => {
      task.status = "pending";
    });
    taskStatuses = {};
    tasks.forEach((task, index) => {
      taskStatuses[index] = "pending";
    });
    renderTaskList();
    // Show reactive running summary for this new session
    resetSummaryForNewRun();
    finalJsonEl.textContent = "";
    clearLog();
    showOverlay(true);

    // Give the UI a moment to render the reset state
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      // Split tasks into client-only and runner-bound
      const clientIdx = [];
      const runnerTasks = [];
      tasks.forEach((t, idx) => {
        if (t && t._client_only) clientIdx.push(idx);
        else runnerTasks.push(t);
      });

      // Execute client-only tasks first
      _clientResults = [];
      for (const idx of clientIdx) {
        updateTaskStatus(idx, "running");
        const task = tasks[idx];
        const res = await executeClientTask(task);
        _clientResults.push(res);
        const ok = String(res.status || "").toLowerCase();
        updateTaskStatus(
          idx,
          ok === "failure"
            ? "failure"
            : ok === "skipped"
            ? "skipped"
            : "success"
        );
        appendLog(`[CLIENT] ${task.ui_label || task.type} -> ${res.status}`);
      }

      // If no runner tasks remain, synthesize a final report and finish
      if (!runnerTasks.length) {
        const finalReport = buildFinalReportFromClient(_clientResults);
        handleFinalResult(finalReport);
        _isRunning = false;
        showOverlay(false);
        backBtn.disabled = false;
        runBtn.disabled = false;
        runBtn.removeAttribute("aria-disabled");
        runBtn.removeAttribute("disabled");
        backBtn.removeAttribute("disabled");
        return;
      }

      let startedNatively = false;
      // Build run plan with metadata
      const runPlanPayload = {
        tasks: runnerTasks,
      };

      // Add metadata if available
      if (serviceMetadata) {
        runPlanPayload.metadata = {
          technician_name: serviceMetadata.technicianName,
          customer_name: serviceMetadata.customerName,
        };
      }

      // Add Sentry configuration from settings
      try {
        const settings = await invoke("load_app_settings");
        const sentryEnabled = settings?.sentry_enabled !== false; // default true
        const sentryPii = settings?.sentry?.send_default_pii !== false; // default true
        const sentryPerformance = settings?.sentry?.traces_sample_rate !== 0.0; // default true (1.0)
        const sentrySystemInfo = settings?.sentry?.send_system_info !== false; // default true

        runPlanPayload.sentry_config = {
          enabled: sentryEnabled,
          send_default_pii: sentryPii,
          traces_sample_rate: sentryPerformance ? 1.0 : 0.0,
          send_system_info: sentrySystemInfo,
        };
      } catch (err) {
        console.warn("Failed to load Sentry settings, using defaults:", err);
        // Fallback to defaults (all enabled)
        runPlanPayload.sentry_config = {
          enabled: true,
          send_default_pii: true,
          traces_sample_rate: 1.0,
          send_system_info: true,
        };
      }

      const jsonArg = JSON.stringify(runPlanPayload);
      // Try native streaming command first
      if (invoke) {
        try {
          wireNativeEvents(); // ensure listeners are ready before spawning (avoid missing very fast early lines)
          const planPath = await invoke("start_service_run", {
            planJson: jsonArg,
          });
          appendLog(`[INFO] Started native runner plan: ${planPath}`);
          startedNatively = true;
        } catch (err) {
          appendLog(
            `[WARN] Native runner failed, falling back to shell: ${err}`
          );
          const result = await runRunner(jsonArg); // fallback
          handleFinalResult(mergeClientWithRunner(_clientResults, result));
          // Fallback is synchronous to completion; re-enable controls now
          _isRunning = false;
          showOverlay(false);
          backBtn.disabled = false;
          runBtn.disabled = false;
          runBtn.removeAttribute("aria-disabled");
          runBtn.removeAttribute("disabled");
          backBtn.removeAttribute("disabled");
        }
      } else {
        const result = await runRunner(jsonArg);
        handleFinalResult(mergeClientWithRunner(_clientResults, result));
        _isRunning = false;
        showOverlay(false);
        backBtn.disabled = false;
        runBtn.disabled = false;
        runBtn.removeAttribute("aria-disabled");
        runBtn.removeAttribute("disabled");
        backBtn.removeAttribute("disabled");
      }
    } catch (e) {
      appendLog(`[ERROR] ${new Date().toLocaleTimeString()} ${String(e)}`);
      showSummary(false);
      _isRunning = false;
      showOverlay(false);
      backBtn.disabled = false;
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-disabled");
      runBtn.removeAttribute("disabled");
      backBtn.removeAttribute("disabled");
    }
  });

  let _nativeEventsWired = false;
  // Flag: whether to show raw (full) progress JSON lines in log. Default false for conciseness.
  const SHOW_RAW_PROGRESS_JSON = false;

  function summarizeProgressLine(line) {
    // Accept raw line starting with PROGRESS_JSON or PROGRESS_JSON_FINAL
    if (!line.startsWith("PROGRESS_JSON:")) {
      if (!line.startsWith("PROGRESS_JSON_FINAL:")) return null;
    }
    if (SHOW_RAW_PROGRESS_JSON)
      return `[RAW] ${line.substring(0, 120)}${line.length > 120 ? "…" : ""}`; // truncated raw if enabled
    try {
      const isFinal = line.startsWith("PROGRESS_JSON_FINAL:");
      const jsonPart = line
        .slice(
          isFinal ? "PROGRESS_JSON_FINAL:".length : "PROGRESS_JSON:".length
        )
        .trim();
      const obj = JSON.parse(jsonPart);
      const completed = obj.completed ?? (obj.results ? obj.results.length : 0);
      const total = obj.total ?? "?";
      const overall = obj.overall_status || obj.status || "unknown";
      const last =
        obj.last_result ||
        (obj.results && obj.results[obj.results.length - 1]) ||
        {};
      const lastType = last.task_type || last.task || last.type || "n/a";
      const lastStatus = last.status || "unknown";
      if (isFinal) {
        return `[PROGRESS] Final ${completed}/${total} overall=${overall}`;
      }
      return `[PROGRESS] ${completed}/${total} overall=${overall} last=${lastType}(${lastStatus})`;
    } catch {
      return "[PROGRESS] update";
    }
  }

  function wireNativeEvents() {
    if (_nativeEventsWired) return; // avoid duplicate listeners across reruns
    if (!window.__TAURI__?.event?.listen) return;
    const { listen } = window.__TAURI__.event;
    _nativeEventsWired = true;
    listen("service_runner_line", (evt) => {
      try {
        const payload = evt?.payload || {};
        const line = payload.line || "";
        if (!line) return;
        // Replace verbose progress JSON lines with concise summary
        if (
          line.startsWith("PROGRESS_JSON:") ||
          line.startsWith("PROGRESS_JSON_FINAL:")
        ) {
          const summary = summarizeProgressLine(line);
          if (summary) appendLog(summary);
        } else {
          appendLog(`[SR] ${line}`);
        }
        try {
          maybeProcessStatus(line);
        } catch (e) {
          console.warn("maybeProcessStatus error", e);
        }
      } catch (e) {
        console.warn("service_runner_line listener failed", e);
      }
    });
    listen("service_runner_done", (evt) => {
      const payload = evt?.payload || {};
      const finalReport = payload.final_report || payload.finalReport || {};
      try {
        lastFinalJsonString = JSON.stringify(finalReport, null, 2);
        const highlighted = hljs.highlight(lastFinalJsonString, {
          language: "json",
        }).value;
        finalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
        applyFinalStatusesFromReport(finalReport);
        const ok = finalReport?.overall_status === "success";
        showSummary(ok);
        persistFinalReport(lastFinalJsonString);

        // Store plan and log file paths for later save operation
        try {
          const runnerData = {
            planFile: payload.plan_file || null,
            logFile: payload.log_file || null,
          };
          sessionStorage.setItem(
            "service.runnerData",
            JSON.stringify(runnerData)
          );
        } catch (e) {
          console.warn("Failed to store runner data:", e);
        }

        // Auto-save report if enabled in settings
        handleAutoSave(finalReport, payload);

        try {
          if (viewResultsBtn) {
            viewResultsBtn.removeAttribute("disabled");
          }
        } catch {}
      } catch (e) {
        finalJsonEl.textContent = String(e);
        showSummary(false);
      }
      // Native run completed – re-enable UI controls
      _isRunning = false;
      showOverlay(false);
      backBtn.disabled = false;
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-disabled");
      runBtn.removeAttribute("disabled");
      backBtn.removeAttribute("disabled");
    });
  }

  function handleFinalResult(result) {
    try {
      const obj = typeof result === "string" ? JSON.parse(result) : result;
      lastFinalJsonString = JSON.stringify(obj, null, 2);
      const highlighted = hljs.highlight(lastFinalJsonString, {
        language: "json",
      }).value;
      finalJsonEl.innerHTML = `<code class=\"hljs language-json\">${highlighted}</code>`;
      applyFinalStatusesFromReport(obj);
      const ok = obj?.overall_status === "success";
      showSummary(ok);
      persistFinalReport(lastFinalJsonString);
    } catch {
      finalJsonEl.textContent = String(result || "");
      showSummary(false);
    }
  }

  function renderTaskList() {
    taskListEl.innerHTML = "";
    taskState.forEach((t, idx) => {
      const li = document.createElement("li");
      li.className = `task-status ${t.status}`;
      li.innerHTML = `
        <div class="left">
          <span class="idx">${String(idx + 1).padStart(2, "0")}</span>
          <span class="name">${t.label}</span>
        </div>
        <div class="right">
          ${statusBadge(t.status)}
        </div>
      `;
      taskListEl.appendChild(li);
    });
  }

  function updateTaskStatus(i, status) {
    const index = parseInt(i, 10);

    if (!Number.isInteger(index) || index < 0 || index >= taskState.length) {
      console.error(
        `Invalid task index: ${i} (taskState length: ${taskState.length})`
      );
      return;
    }

    if (!taskState[index]) {
      console.error(`No taskState entry for index ${index}`);
      return;
    }

    const validStatuses = [
      "pending",
      "running",
      "success",
      "failure",
      "skipped",
    ];
    if (!validStatuses.includes(status)) {
      console.warn(
        `Invalid status "${status}" for task ${index}, defaulting to "pending"`
      );
      status = "pending";
    }

    const prevStatus = taskState[index].status;
    taskState[index].status = status;
    taskStatuses[index] = status;

    console.log(
      `Task ${index} (${taskState[index].label}): ${prevStatus} → ${status}`
    );
    renderTaskList();

    // Update summary whenever a task status changes
    if (_isRunning) {
      updateSummaryDuringRun();
    }
  }

  function statusBadge(s) {
    if (s === "running")
      return '<span class="badge running"><span class="dot"></span> Running</span>';
    if (s === "success") return '<span class="badge ok">Success</span>';
    if (s === "failure") return '<span class="badge fail">Failure</span>';
    if (s === "skipped") return '<span class="badge skipped">Skipped</span>';
    return '<span class="badge">Pending</span>';
  }

  function resetSummaryForNewRun() {
    try {
      summaryEl.hidden = false;
      summaryEl.classList.remove("ok", "fail");
      summaryIconEl.innerHTML =
        '<span class="spinner" aria-hidden="true"></span>';
      summaryTitleEl.textContent = "Initializing…";
      if (summarySubEl)
        summarySubEl.textContent = "Preparing to start service run…";
      if (summaryProgWrap) summaryProgWrap.removeAttribute("aria-hidden");
      if (summaryProgBar) summaryProgBar.style.width = "0%";
    } catch (err) {
      console.error("resetSummaryForNewRun error:", err);
    }
  }

  function updateSummaryDuringRun() {
    try {
      const total = taskState.length;
      const completed = taskState.filter((t) =>
        ["success", "failure", "skipped"].includes(t.status)
      ).length;
      const runningTasks = taskState.filter((t) => t.status === "running");
      const runningIdx = taskState.findIndex((t) => t.status === "running");
      const runningName = runningIdx >= 0 ? taskState[runningIdx].label : null;

      summaryEl.hidden = false;
      summaryEl.classList.remove("ok", "fail");

      // Keep spinner visible while running
      summaryIconEl.innerHTML =
        '<span class="spinner" aria-hidden="true"></span>';

      if (runningName) {
        const taskNum = runningIdx + 1;
        summaryTitleEl.textContent = `Running Task ${taskNum}/${total}`;
        if (summarySubEl) {
          summarySubEl.textContent = `${runningName}`;
        }
      } else if (completed > 0 && completed < total) {
        summaryTitleEl.textContent = `Progress: ${completed}/${total} completed`;
        if (summarySubEl) summarySubEl.textContent = "Preparing next task…";
      } else {
        summaryTitleEl.textContent = "Starting…";
        if (summarySubEl)
          summarySubEl.textContent = "Initializing service run…";
      }

      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      if (summaryProgBar) summaryProgBar.style.width = `${pct}%`;
    } catch (err) {
      console.error("updateSummaryDuringRun error:", err);
    }
  }

  function applyFinalStatusesFromReport(obj) {
    const results = Array.isArray(obj?.results) ? obj.results : [];
    // Map results 1:1 to our displayed task order (assumes runner ran in provided order)
    results.forEach((res, idx) => {
      const st = String(res?.status || "").toLowerCase();
      if (st === "success" || st === "ok") updateTaskStatus(idx, "success");
      else if (st === "failure" || st === "error" || st === "failed")
        updateTaskStatus(idx, "failure");
      else if (st === "skipped") updateTaskStatus(idx, "skipped");
      else updateTaskStatus(idx, "success");
    });
  }

  function friendlyTaskLabel(type) {
    // Prefer a label embedded in task spec via ui_label when building the plan
    return type;
  }

  function clearLog() {
    logEl.textContent = "";
  }
  function appendLog(line) {
    const first = !logEl.textContent;
    logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    logEl.scrollTop = logEl.scrollHeight;
    // Auto-hide overlay after first real log line
    if (first) {
      showOverlay(false);
    }
  }
  function showOverlay(show) {
    // If showing, ensure it's visible; otherwise hide.
    logOverlay.hidden = !show;
  }
  function showSummary(ok) {
    summaryEl.hidden = false;
    summaryTitleEl.textContent = ok
      ? "All tasks completed"
      : "Completed with errors";
    summaryIconEl.textContent = ok ? "✔" : "!";
    summaryEl.classList.toggle("ok", !!ok);
    summaryEl.classList.toggle("fail", !ok);
    if (summarySubEl) {
      summarySubEl.textContent = ok
        ? "Review the final report below."
        : "Check the log and JSON report for details.";
    }
    // Hide progress once finished
    if (summaryProgWrap) summaryProgWrap.setAttribute("aria-hidden", "true");
    try {
      if (
        viewResultsBtn &&
        lastFinalJsonString &&
        lastFinalJsonString.length > 2
      ) {
        viewResultsBtn.removeAttribute("disabled");
      }
    } catch {}

    // Fire a desktop notification if enabled in settings
    triggerCompletionNotification(ok).catch((e) =>
      console.warn("Failed to trigger notification:", e)
    );

    // Play completion sound if enabled in settings
    triggerCompletionSound(ok).catch((e) =>
      console.warn("Failed to play completion sound:", e)
    );
  }
  // Navigate to results page with stored final report
  viewResultsBtn?.addEventListener("click", () => {
    if (lastFinalJsonString && lastFinalJsonString.length > 2) {
      persistFinalReport(lastFinalJsonString);
    }
    window.location.hash = "#/service-results";
  });

  // ---- Client-only task execution ----------------------------------------
  async function executeClientTask(task) {
    if (!task || !task.type)
      return {
        task_type: String(task?.type || "unknown"),
        status: "failure",
        summary: { error: "Invalid task" },
      };
    return {
      task_type: task.type,
      status: "skipped",
      summary: { reason: "Client handler not implemented" },
    };
  }

  function buildFinalReportFromClient(results) {
    const ok = results.every(
      (r) => r && r.status && String(r.status).toLowerCase() === "success"
    );
    const overall = ok
      ? "success"
      : results.some((r) => String(r.status).toLowerCase().includes("failure"))
      ? "completed_with_errors"
      : "success";
    return { overall_status: overall, results };
  }

  function mergeClientWithRunner(clientResults, runnerObj) {
    try {
      const obj =
        typeof runnerObj === "string" ? JSON.parse(runnerObj) : runnerObj || {};
      const r = Array.isArray(obj.results) ? obj.results : [];
      const all = [...clientResults, ...r];
      const overall = all.some(
        (x) => String(x.status || "").toLowerCase() === "failure"
      )
        ? "completed_with_errors"
        : obj.overall_status || "success";
      return { overall_status: overall, results: all };
    } catch {
      return runnerObj;
    }
  }

  // Spawn the runner as a Tauri sidecar and capture stdout live.
  // --- Shared status line parser (now hoisted so native events can reuse) ---
  const maybeProcessStatus = (s) => {
    const startMatch = s.match(/^TASK_START:(\d+):(.+)$/);
    if (startMatch) {
      const taskIndex = parseInt(startMatch[1]);
      const taskType = startMatch[2];
      updateTaskStatus(taskIndex, "running");
      appendLog(`[INFO] Started: ${taskType}`);
      return;
    }
    const okMatch = s.match(/^TASK_OK:(\d+):(.+)$/);
    if (okMatch) {
      const taskIndex = parseInt(okMatch[1]);
      const taskType = okMatch[2];
      updateTaskStatus(taskIndex, "success");
      appendLog(`[SUCCESS] Completed: ${taskType}`);
      return;
    }
    const failMatch = s.match(/^TASK_FAIL:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
    if (failMatch) {
      const taskIndex = parseInt(failMatch[1]);
      const taskType = failMatch[2];
      const reason = failMatch[3] || "Failed";
      updateTaskStatus(taskIndex, "failure");
      appendLog(`[ERROR] Failed: ${taskType} - ${reason}`);
      return;
    }
    const skipMatch = s.match(/^TASK_SKIP:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
    if (skipMatch) {
      const taskIndex = parseInt(skipMatch[1]);
      const taskType = skipMatch[2];
      const reason = skipMatch[3] || "Skipped";
      updateTaskStatus(taskIndex, "skipped");
      appendLog(`[WARNING] Skipped: ${taskType} - ${reason}`);
      return;
    }

    // Incremental JSON progress lines from runner
    if (s.startsWith("PROGRESS_JSON:")) {
      const jsonPart = s.slice("PROGRESS_JSON:".length).trim();
      try {
        const obj = JSON.parse(jsonPart);
        renderProgressJson(obj);
        if (_isRunning) updateSummaryDuringRun();
      } catch (e) {
        // Ignore parse failures silently
      }
      return;
    }
    if (s.startsWith("PROGRESS_JSON_FINAL:")) {
      const jsonPart = s.slice("PROGRESS_JSON_FINAL:".length).trim();
      try {
        const obj = JSON.parse(jsonPart);
        renderProgressJson(obj, true);
        // final update handled by showSummary via renderProgressJson
      } catch (e) {}
      return;
    }
  };

  function renderProgressJson(obj, isFinal = false) {
    if (!obj || typeof obj !== "object") return;
    // Only update preview; summary still triggered by final report or final marker
    try {
      const pretty = JSON.stringify(obj, null, 2);
      lastFinalJsonString = pretty;
      const highlighted = hljs.highlight(pretty, { language: "json" }).value;
      finalJsonEl.innerHTML = `<code class=\"hljs language-json\">${highlighted}</code>`;
      if (isFinal) {
        const ok = obj?.overall_status === "success";
        showSummary(ok);
      }
    } catch {}
  }

  async function triggerCompletionNotification(ok) {
    if (_notifiedOnce) return;
    // Load setting
    try {
      const { core } = window.__TAURI__ || {};
      const settings = await core?.invoke?.("load_app_settings");
      const enabled = settings?.reports?.notifications_enabled === true;
      if (!enabled) return;
    } catch (e) {
      // If settings can't be loaded, do nothing silently
      return;
    }

    const api = await ensureNotificationApi();
    if (!api) return;
    try {
      let granted = await api.isPermissionGranted();
      if (!granted) {
        const perm = await api.requestPermission();
        granted = perm === "granted";
      }
      if (!granted) return;

      // Basic payload; keep it short and useful
      const title = ok
        ? "Service Run Complete"
        : "Service Run Completed with Errors";
      const body = ok
        ? "All tasks completed successfully. Click to view results."
        : "Some tasks failed. Click to review details.";
      api.sendNotification({ title, body });
      _notifiedOnce = true;
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }

  async function triggerCompletionSound(ok) {
    if (_notifiedOnce) {
      // Reuse the same guard to avoid multiple alerts per run
      return;
    }
    // Load sound settings
    let enabled = false;
    let volumePct = 80;
    let soundId = "classic-beep";
    let repeat = 1;
    try {
      const { core } = window.__TAURI__ || {};
      const settings = await core?.invoke?.("load_app_settings");
      enabled = settings?.reports?.sound_enabled === true;
      if (Number.isFinite(settings?.reports?.sound_volume)) {
        volumePct = Math.max(
          0,
          Math.min(100, Number(settings.reports.sound_volume))
        );
      }
      soundId = settings?.reports?.sound_id || "classic-beep";
      if (Number.isFinite(settings?.reports?.sound_repeat)) {
        repeat = Math.max(
          1,
          Math.min(10, Number(settings.reports.sound_repeat))
        );
      }
    } catch {
      return;
    }
    if (!enabled) return;

    // Lazy import Tone and notification sounds only when needed
    let Tone;
    let getSoundById;
    let ensureToneStarted;
    try {
      const mod = await import("tone");
      Tone = mod?.default || mod;
      const soundMod = await import("../../utils/notification-sounds.js");
      getSoundById = soundMod.getSoundById;
      ensureToneStarted = soundMod.ensureToneStarted;
    } catch (e) {
      console.warn("Audio modules not available:", e);
      return;
    }

    try {
      // Ensure audio is unlocked (required in some webview contexts)
      await ensureToneStarted(Tone);

      // Get the selected sound
      const sound = getSoundById(soundId);
      if (!sound) {
        console.warn(`Sound "${soundId}" not found`);
        return;
      }

      // Play the selected sound N times sequentially
      for (let i = 0; i < repeat; i++) {
        // eslint-disable-next-line no-await-in-loop
        await sound.play(Tone, volumePct);
      }

      _notifiedOnce = true;
    } catch (e) {
      console.warn("Tone play error:", e);
    }
  }

  async function runRunner(jsonArg) {
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) throw new Error("Shell plugin unavailable");

    // Resolve directories and preferred runner path under data/resources/bin
    let planFile = null;
    let runnerPath = null;
    try {
      const dirs = await core.invoke("get_data_dirs");
      const reportsDir = dirs?.reports || "./data/reports";
      const resourcesDir = dirs?.resources || "./data/resources";
      const name = `run_plan_${Date.now()}.json`;
      planFile = `${reportsDir.replace(/[\\/]+$/, "")}/${name}`;
      runnerPath = `${String(resourcesDir).replace(
        /[\\/]+$/,
        ""
      )}/bin/service_runner.exe`;
    } catch {}

    if (planFile) {
      try {
        await writeFile(planFile, jsonArg);
      } catch {}
    }

    // Always pass the plan file path to avoid quoting issues during elevation (JSON contains double quotes)
    const args = [planFile || jsonArg];
    if (!planFile) {
      appendLog(
        `[WARN] ${new Date().toLocaleTimeString()} Plan file could not be created; passing raw JSON may fail if UAC elevation occurs.`
      );
    }

    // Request it writes a log file alongside the plan.
    const runnerLog = planFile
      ? planFile.replace(/\.json$/, ".log.txt")
      : `run_${Date.now()}.log.txt`;
    let cmd;
    let created = false;
    // Start polling the runner log file for live updates (works even if the process elevates)
    let stopPolling = () => {};
    try {
      stopPolling = startLogPolling(runnerLog);
    } catch {}
    // Primary: launch from data/resources/bin via PowerShell (capability already granted)
    if (runnerPath) {
      try {
        const pwshScript = (() => {
          const exe = escapePwshArg(runnerPath);
          const a0 = escapePwshArg(args[0]);
          const logArg = escapePwshArg(runnerLog);
          return `$ErrorActionPreference='Stop'; & ${exe} ${a0} --log-file ${logArg}`;
        })();
        cmd = Command.create("powershell", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          pwshScript,
        ]);
        created = true;
      } catch (e1) {
        appendLog(
          `[WARN] ${new Date().toLocaleTimeString()} Failed to create PowerShell runner: ${e1}`
        );
      }
    }
    // Fallback: use capability-registered command name (binaries/service_runner.exe)
    if (!created) {
      try {
        cmd = Command.create("service_runner", [
          args[0],
          "--log-file",
          runnerLog,
        ]);
        created = true;
      } catch (e2) {
        appendLog(
          `[ERROR] ${new Date().toLocaleTimeString()} Failed to create runner command: ${e2}`
        );
        throw e2;
      }
    }

    // Track per-task phases by parsing known JSON lines or brackets
    let finalJson = "";

    cmd.on("close", (data) => {
      // no-op; final JSON already collected from stdout buffer
    });

    // Set up event handlers
    console.log("Setting up command event handlers...");

    cmd.stderr.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;

      // Debug: Show raw stderr line
      console.log("Raw stderr line received:", JSON.stringify(s));

      // Process stderr for task status updates and show as live logs
      if (
        s.startsWith("PROGRESS_JSON:") ||
        s.startsWith("PROGRESS_JSON_FINAL:")
      ) {
        const summary = summarizeProgressLine(s);
        if (summary) appendLog(summary);
      } else {
        appendLog(`[STDERR] ${s}`);
      }
      maybeProcessStatus(s);
    });

    cmd.stdout.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;

      // Debug: Show raw stdout line
      console.log("Raw stdout line received:", JSON.stringify(s));

      // Try to capture final JSON block (stdout only)
      if (s.startsWith("{") || (finalJson && !s.startsWith("[ERROR"))) {
        finalJson += (finalJson ? "\n" : "") + s;
      } else {
        // Show other stdout messages as live logs
        if (
          s.startsWith("PROGRESS_JSON:") ||
          s.startsWith("PROGRESS_JSON_FINAL:")
        ) {
          const summary = summarizeProgressLine(s);
          if (summary) appendLog(summary);
        } else {
          appendLog(`[STDOUT] ${s}`);
        }
        // Also check stdout for task status markers
        maybeProcessStatus(s);
      }
    });

    console.log("Event handlers set up, executing command...");

    const out = await cmd.execute();

    // Final poll to flush any remaining log content then stop
    try {
      await pollLogOnce(runnerLog);
    } catch {}
    try {
      stopPolling();
    } catch {}
    // Prefer collected final JSON, else use stdout
    const stdoutStr = (finalJson || String(out.stdout || "")).trim();
    try {
      return JSON.parse(stdoutStr);
    } catch {
      return stdoutStr;
    }
  }

  function escapePwshArg(s) {
    if (s == null) return "''";
    const str = String(s);
    return `'${str.replace(/'/g, "''")}'`;
  }

  async function writeFile(path, contents) {
    // Write file via a tiny PowerShell command to avoid needing a FS plugin
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) return;
    // Single-line script; embed content as single quoted string. Write UTF-8 without BOM to ensure Python json.load() is happy.
    const escaped = contents.replace(/'/g, "''");
    const script = `$ErrorActionPreference='Stop'; $p=${escapePwshArg(
      path
    )}; $c='${escaped}'; New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($p)) -Force | Out-Null; $enc = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($p, $c, $enc)`;
    // Use capability-registered PowerShell command name 'powershell'.
    const cmd = Command.create("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ]);
    await cmd.execute();
  }

  // ----- Live log polling from file (works through UAC elevation) ---------
  let _logPoll = { timer: null, lastTextLen: 0, busy: false, path: null };

  function startLogPolling(path) {
    _logPoll.path = path;
    _logPoll.lastTextLen = 0;
    if (_logPoll.timer) clearInterval(_logPoll.timer);
    _logPoll.timer = setInterval(() => pollLogOnce(path).catch(() => {}), 700);
    return function stop() {
      if (_logPoll.timer) {
        clearInterval(_logPoll.timer);
        _logPoll.timer = null;
      }
    };
  }

  async function pollLogOnce(path) {
    if (_logPoll.busy) return; // avoid overlap
    _logPoll.busy = true;
    try {
      const text = await readFileRaw(path);
      if (typeof text !== "string") {
        _logPoll.busy = false;
        return;
      }
      if (text.length <= _logPoll.lastTextLen) {
        _logPoll.busy = false;
        return;
      }
      const added = text.slice(_logPoll.lastTextLen);
      _logPoll.lastTextLen = text.length;
      const lines = added.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendLog(line);
        maybeProcessStatus(line);
      }
    } finally {
      _logPoll.busy = false;
    }
  }

  async function readFileRaw(path) {
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) return "";
    const ps = Command.create("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$ErrorActionPreference='SilentlyContinue'; $p=${escapePwshArg(
        path
      )}; if (Test-Path -Path $p) { Get-Content -Path $p -Raw -ErrorAction SilentlyContinue }`,
    ]);
    const out = await ps.execute();
    return String(out.stdout || "");
  }
}
