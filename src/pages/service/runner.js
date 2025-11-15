import { getToolStatuses } from "../../utils/tools.js";
import { promptServiceMetadata } from "../../utils/service-metadata-modal.js";
import { isAutoSaveEnabled, autoSaveReport } from "../../utils/reports.js";
import {
  initRunState,
  updateTaskStatus as updateGlobalTaskStatus,
  updateProgress as updateGlobalProgress,
  cleanup as cleanupGlobalState,
} from "../../utils/task-state.js";
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

// Live log highlighting helpers
const MAX_LOG_LINES = 2000;
/** @type {string[]} */
let rawLogLines = [];
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
function highlightLogLine(line) {
  const safe = escapeHtml(line);
  const tagMatch = safe.match(/^(\[[A-Z_]+(?:\])(?:\s*\[[A-Z_]+\])*)\s*/);
  let rest = safe;
  let tagsHtml = "";
  if (tagMatch) {
    const tags = tagMatch[1]
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^\[|\]$/g, ""));
    rest = safe.slice(tagMatch[0].length);
    tagsHtml = tags
      .map((t) => {
        const upper = t.toUpperCase();
        let cls = "log-tag";
        if (upper === "INFO") cls += " log-level-info";
        else if (upper === "SUCCESS") cls += " log-level-success";
        else if (upper === "ERROR" || upper === "FAIL" || upper === "FAILED")
          cls += " log-level-error";
        else if (upper === "WARN" || upper === "WARNING")
          cls += " log-level-warn";
        else if (upper === "SR") cls += " log-tag-sr";
        else if (upper === "PROGRESS") cls += " log-tag-progress";
        else if (upper.startsWith("TASK")) cls += " log-tag-task";
        return `<span class="${cls}">[${t}]</span>`;
      })
      .join(" ");
  }
  const filepathRe =
    /(?:(?:[A-Za-z]:\\|\\\\)[^:*?"<>|\r\n]+(?:\\[^:*?"<>|\r\n]+)*)/g;
  const withPaths = rest.replace(
    filepathRe,
    (m) => `<span class="log-filepath">${m}</span>`
  );
  return `<span class="log-line">${tagsHtml}${
    tagsHtml ? " " : ""
  }${withPaths}</span>`;
}

// Shared appender for live log (module-level so all sources use consistent rendering)
function appendToLiveLog(message) {
  const logEl = document.getElementById("svc-log");
  if (!logEl) return;
  const hadAny = rawLogLines.length > 0;
  rawLogLines.push(String(message));
  if (rawLogLines.length > MAX_LOG_LINES) {
    rawLogLines = rawLogLines.slice(-MAX_LOG_LINES);
  }
  logEl.innerHTML = rawLogLines.map(highlightLogLine).join("\n");
  logEl.scrollTop = logEl.scrollHeight;
  if (!hadAny) {
    const overlay = document.getElementById("svc-log-overlay");
    if (overlay) overlay.hidden = true;
  }
  try {
    sessionStorage.setItem("service.runnerLog", rawLogLines.join("\n"));
  } catch {}
}

// Module-level flag to track if native events have been registered globally
// This persists across page navigations to prevent duplicate listener registration
let _globalEventsRegistered = false;

// Module-level unlisten functions to clean up event listeners if needed
let _unlistenLine = null;
let _unlistenDone = null;

// Module-level log polling state
let _logPoll = { timer: null, lastTextLen: 0, busy: false, path: null };

// Module-level task status sync timer for parallel execution
let _taskStatusSyncTimer = null;

/**
 * Helper function to check if a run is currently active (running or paused).
 * This is the single source of truth for determining if a run is in progress.
 * @param {Object} [state] - Optional state object. If not provided, fetches from global state.
 * @returns {boolean}
 */
function isRunActive(state = null) {
  if (state === null) {
    try {
      state = getRunState();
    } catch (e) {
      console.warn("[Runner] Failed to get run state:", e);
      return false;
    }
  }
  return state && (
    state.overallStatus === "running" ||
    state.overallStatus === "paused"
  );
}

/**
 * Sync task statuses from global state to DOM (for parallel execution)
 * This catches any tasks that completed before their DOM elements were ready
 */
async function syncTaskStatusesFromGlobal() {
  const taskListEl = document.getElementById("svc-task-status");
  if (!taskListEl) return;
  
  try {
    const { getRunState } = await import("../../utils/task-state.js");
    const runState = getRunState();
    if (runState?.tasks && Array.isArray(runState.tasks)) {
      runState.tasks.forEach((task, idx) => {
        if (task?.status) {
          const tasks = Array.from(taskListEl.children);
          if (tasks[idx]) {
            const taskElement = tasks[idx];
            const statusMap = {
              success: "success",
              error: "failure",
              warning: "failure",
              skip: "skipped",
              running: "running",
              pending: "pending",
            };
            const domStatus = statusMap[task.status] || task.status;
            
            // Only update if status actually changed (avoid unnecessary DOM updates)
            const currentStatus = taskElement.className.match(/task-status\s+(\w+)/)?.[1];
            if (currentStatus !== domStatus) {
              taskElement.className = taskElement.className
                .split(" ")
                .filter((c) => !["pending", "running", "success", "failure", "skipped"].includes(c))
                .join(" ");
              taskElement.className = `${taskElement.className} task-status ${domStatus}`.trim();
              const badge = taskElement.querySelector(".right");
              if (badge) {
                if (domStatus === "success") {
                  badge.innerHTML = '<span class="badge ok">Success</span>';
                } else if (domStatus === "failure") {
                  badge.innerHTML = '<span class="badge fail">Failure</span>';
                } else if (domStatus === "skipped") {
                  badge.innerHTML = '<span class="badge skipped">Skipped</span>';
                } else if (domStatus === "running") {
                  badge.innerHTML = '<span class="badge running"><span class="dot"></span> Running</span>';
                } else if (domStatus === "pending") {
                  badge.innerHTML = '<span class="badge pending">Pending</span>';
                }
              }
            }
          }
        }
      });
    }
  } catch (e) {
    // Ignore sync errors
  }
}

/**
 * Start periodic task status sync (for parallel execution)
 */
function startTaskStatusSync() {
  // Clear any existing timer
  if (_taskStatusSyncTimer) {
    clearInterval(_taskStatusSyncTimer);
  }
  
  // Sync every 500ms while running (catches fast parallel tasks)
  _taskStatusSyncTimer = setInterval(() => {
    if (_isRunning) {
      syncTaskStatusesFromGlobal();
    } else {
      // Stop syncing when run is complete
      stopTaskStatusSync();
    }
  }, 500);
}

/**
 * Stop periodic task status sync
 */
function stopTaskStatusSync() {
  if (_taskStatusSyncTimer) {
    clearInterval(_taskStatusSyncTimer);
    _taskStatusSyncTimer = null;
  }
}

/**
 * Process status line markers from Python runner (module-level for event persistence)
 * @param {string} line - Log line to process
 */
async function processStatusLine(line) {
  // CRITICAL: Always update global state first, regardless of DOM presence
  // This ensures widget and restored pages show accurate progress even when not on runner page

  // Import global state updater
  let updateGlobalTaskStatus = null;
  try {
    const taskStateModule = await import("../../utils/task-state.js");
    updateGlobalTaskStatus = taskStateModule.updateTaskStatus;
  } catch (e) {
    console.warn("Failed to import task-state module:", e);
  }

  // Get DOM references (may be null if not on runner page)
  const logEl = document.getElementById("svc-log");
  const taskListEl = document.getElementById("svc-task-status");

  // Helper to append to log with fresh DOM reference
  const appendToLog = (message) => {
    appendToLiveLog(message);
  };

  // Helper to update task status DOM
  // Uses requestAnimationFrame to ensure DOM updates happen even with rapid parallel updates
  const updateTaskStatusDom = (taskIndex, status) => {
    if (!taskListEl) return; // Skip if not on page

    // Use requestAnimationFrame to batch rapid updates and ensure DOM is ready
    requestAnimationFrame(() => {
      // Re-query the element list in case it changed
      const tasks = Array.from(taskListEl.children);
      if (tasks[taskIndex]) {
        const taskElement = tasks[taskIndex];
        // Update class name
        taskElement.className = taskElement.className
          .split(" ")
          .filter(
            (c) =>
              !["pending", "running", "success", "failure", "skipped"].includes(
                c
              )
          )
          .join(" ");
        taskElement.className =
          `${taskElement.className} task-status ${status}`.trim();

        // Update badge
        const badge = taskElement.querySelector(".right");
        if (badge) {
          if (status === "running") {
            badge.innerHTML =
              '<span class="badge running"><span class="dot"></span> Running</span>';
          } else if (status === "success") {
            badge.innerHTML = '<span class="badge ok">Success</span>';
          } else if (status === "failure") {
            badge.innerHTML = '<span class="badge fail">Failure</span>';
          } else if (status === "skipped") {
            badge.innerHTML = '<span class="badge skipped">Skipped</span>';
          } else if (status === "pending") {
            badge.innerHTML = '<span class="badge pending">Pending</span>';
          }
        }
      }
    });
  };

  // Helper to update the summary UI from global state metrics (when on runner page)
  const updateSummaryFromGlobal = async () => {
    const summaryEl = document.getElementById("svc-summary");
    if (!summaryEl) return; // Only when runner page is visible
    try {
      const { getProgressMetrics, getRunState } = await import(
        "../../utils/task-state.js"
      );
      const metrics = getProgressMetrics();
      const runState = getRunState();
      const total = metrics.total || 0;
      const completed = metrics.completed || 0;
      const runningName = metrics.currentTask
        ? metrics.currentTask.label
        : null;

      // Check if run is completed - don't update if so (let showSummary handle it)
      const overallStatus = runState?.overallStatus;
      if (
        overallStatus === "completed" ||
        overallStatus === "error" ||
        overallStatus === "stopped"
      ) {
        // Run is finished, don't overwrite the completion message
        return;
      }

      const summaryTitleEl = document.getElementById("svc-summary-title");
      const summarySubEl = document.getElementById("svc-summary-sub");
      const summaryIconEl = document.getElementById("svc-summary-icon");
      const summaryProgBar = document.getElementById(
        "svc-summary-progress-bar"
      );

      summaryEl.hidden = false;
      summaryEl.classList.remove("ok", "fail");
      if (summaryIconEl) {
        summaryIconEl.innerHTML =
          '<span class="spinner" aria-hidden="true"></span>';
      }

      if (runningName) {
        const currentIndex = Math.min(metrics.currentTask?.id || 0, total - 1);
        const taskNum = currentIndex + 1;
        if (summaryTitleEl)
          summaryTitleEl.textContent = `Running Task ${taskNum}/${total}`;
        if (summarySubEl) summarySubEl.textContent = `${runningName}`;
      } else if (completed > 0 && completed < total) {
        if (summaryTitleEl)
          summaryTitleEl.textContent = `Progress: ${completed}/${total} completed`;
        if (summarySubEl) summarySubEl.textContent = "Preparing next task…";
      } else if (completed === total && total > 0) {
        // All tasks completed but run not marked as finished yet
        if (summaryTitleEl)
          summaryTitleEl.textContent = `Progress: ${completed}/${total} completed`;
        if (summarySubEl) summarySubEl.textContent = "Finalizing…";
      } else {
        if (summaryTitleEl) summaryTitleEl.textContent = "Starting…";
        if (summarySubEl)
          summarySubEl.textContent = "Initializing service run…";
      }

      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      if (summaryProgBar) summaryProgBar.style.width = `${pct}%`;
    } catch (e) {
      console.warn("Failed to update summary from global state:", e);
    }
  };

  // Parse status markers
  const startMatch = line.match(/^TASK_START:(\d+):(.+)$/);
  if (startMatch) {
    const taskIndex = parseInt(startMatch[1]);
    const taskType = startMatch[2];

    // Update global state FIRST (always happens)
    if (updateGlobalTaskStatus) {
      updateGlobalTaskStatus(taskIndex, "running");
    }

    // Then update DOM if available
    updateTaskStatusDom(taskIndex, "running");
    appendToLog(`[INFO] Started: ${taskType}`);
    await updateSummaryFromGlobal();
    return;
  }

  const okMatch = line.match(/^TASK_OK:(\d+):(.+)$/);
  if (okMatch) {
    const taskIndex = parseInt(okMatch[1]);
    const taskType = okMatch[2];

    // Update global state FIRST (always happens)
    if (updateGlobalTaskStatus) {
      updateGlobalTaskStatus(taskIndex, "success");
    }

    // Then update DOM immediately (don't wait for requestAnimationFrame for completion)
    // This ensures fast tasks update immediately, even if they complete before TASK_START is processed
    if (taskListEl) {
      // Use a small retry mechanism in case DOM isn't ready yet (for very fast parallel tasks)
      const updateDom = (retries = 5) => {
        const tasks = Array.from(taskListEl.children);
        if (tasks[taskIndex]) {
          const taskElement = tasks[taskIndex];
          taskElement.className = taskElement.className
            .split(" ")
            .filter(
              (c) =>
                !["pending", "running", "success", "failure", "skipped"].includes(
                  c
                )
            )
            .join(" ");
          taskElement.className =
            `${taskElement.className} task-status success`.trim();
          const badge = taskElement.querySelector(".right");
          if (badge) {
            badge.innerHTML = '<span class="badge ok">Success</span>';
          }
        } else if (retries > 0) {
          // DOM element not ready yet, retry after a short delay
          setTimeout(() => updateDom(retries - 1), 100);
        }
      };
      updateDom();
    }

    appendToLog(`[SUCCESS] Completed: ${taskType}`);
    await updateSummaryFromGlobal();
    return;
  }

  const failMatch = line.match(/^TASK_FAIL:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
  if (failMatch) {
    const taskIndex = parseInt(failMatch[1]);
    const taskType = failMatch[2];
    const reason = failMatch[3] || "Failed";

    // Update global state FIRST (always happens)
    if (updateGlobalTaskStatus) {
      updateGlobalTaskStatus(taskIndex, "error");
    }

    // Then update DOM immediately with retry for fast parallel tasks
    if (taskListEl) {
      const updateDom = (retries = 5) => {
        const tasks = Array.from(taskListEl.children);
        if (tasks[taskIndex]) {
          const taskElement = tasks[taskIndex];
          taskElement.className = taskElement.className
            .split(" ")
            .filter(
              (c) =>
                !["pending", "running", "success", "failure", "skipped"].includes(
                  c
                )
            )
            .join(" ");
          taskElement.className =
            `${taskElement.className} task-status failure`.trim();
          const badge = taskElement.querySelector(".right");
          if (badge) {
            badge.innerHTML = '<span class="badge fail">Failure</span>';
          }
        } else if (retries > 0) {
          setTimeout(() => updateDom(retries - 1), 100);
        }
      };
      updateDom();
    }

    appendToLog(`[ERROR] Failed: ${taskType} - ${reason}`);
    await updateSummaryFromGlobal();
    return;
  }

  const skipMatch = line.match(/^TASK_SKIP:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
  if (skipMatch) {
    const taskIndex = parseInt(skipMatch[1]);
    const taskType = skipMatch[2];
    const reason = skipMatch[3] || "Skipped";

    // Update global state FIRST (always happens)
    if (updateGlobalTaskStatus) {
      updateGlobalTaskStatus(taskIndex, "skip");
    }

    // Then update DOM immediately with retry for fast parallel tasks
    if (taskListEl) {
      const updateDom = (retries = 5) => {
        const tasks = Array.from(taskListEl.children);
        if (tasks[taskIndex]) {
          const taskElement = tasks[taskIndex];
          taskElement.className = taskElement.className
            .split(" ")
            .filter(
              (c) =>
                !["pending", "running", "success", "failure", "skipped"].includes(
                  c
                )
            )
            .join(" ");
          taskElement.className =
            `${taskElement.className} task-status skipped`.trim();
          const badge = taskElement.querySelector(".right");
          if (badge) {
            badge.innerHTML = '<span class="badge skipped">Skipped</span>';
          }
        } else if (retries > 0) {
          setTimeout(() => updateDom(retries - 1), 100);
        }
      };
      updateDom();
    }

    appendToLog(`[WARNING] Skipped: ${taskType} - ${reason}`);
    await updateSummaryFromGlobal();
    return;
  }

  // Handle run control signals
  const stoppedMatch = line.match(/^RUN_STOPPED:(.+)$/);
  if (stoppedMatch) {
    const reason = stoppedMatch[1] || "User requested";
    appendToLog(`[INFO] Run stopped: ${reason}`);
    // Update global state
    let updateGlobalProgress = null;
    try {
      const taskStateModule = await import("../../utils/task-state.js");
      updateGlobalProgress = taskStateModule.updateProgress;
    } catch (e) {
      console.warn("Failed to import task-state module:", e);
    }
    if (updateGlobalProgress) {
      updateGlobalProgress({ overallStatus: "stopped" });
    }
    // Update status indicator directly
    const runnerStatus = document.getElementById("svc-runner-status");
    const statusIcon = document.getElementById("svc-status-icon");
    const statusText = document.getElementById("svc-status-text");
    const pauseResumeBtn = document.getElementById("svc-pause-resume-btn");
    if (runnerStatus && statusIcon && statusText) {
      statusIcon.innerHTML =
        '<i class="ph ph-stop-circle" style="color: var(--muted-color)"></i>';
      statusText.textContent = "Stopped";
      runnerStatus.className = "runner-status-indicator stopped";
    }
    if (pauseResumeBtn) pauseResumeBtn.disabled = true;
    await updateSummaryFromGlobal();
    return;
  }

  const pausedMatch = line.match(/^RUN_PAUSED:(.+)$/);
  if (pausedMatch) {
    const reason = pausedMatch[1] || "User requested";
    appendToLog(`[INFO] Run paused: ${reason}`);
    // Update global state
    let updateGlobalProgress = null;
    try {
      const taskStateModule = await import("../../utils/task-state.js");
      updateGlobalProgress = taskStateModule.updateProgress;
    } catch (e) {
      console.warn("Failed to import task-state module:", e);
    }
    if (updateGlobalProgress) {
      updateGlobalProgress({ overallStatus: "paused" });
    }
    // Update status indicator directly
    const runnerStatus = document.getElementById("svc-runner-status");
    const statusIcon = document.getElementById("svc-status-icon");
    const statusText = document.getElementById("svc-status-text");
    const pauseResumeBtn = document.getElementById("svc-pause-resume-btn");
    if (runnerStatus && statusIcon && statusText) {
      statusIcon.innerHTML =
        '<i class="ph ph-pause-circle" style="color: var(--warning-color)"></i>';
      statusText.textContent = "Paused";
      runnerStatus.className = "runner-status-indicator paused";
    }
    if (pauseResumeBtn) {
      pauseResumeBtn.className = "control-btn resume";
      pauseResumeBtn.title = "Resume paused run";
      pauseResumeBtn.innerHTML =
        '<i class="ph ph-play-circle"></i><span class="btn-text">Resume</span>';
      pauseResumeBtn.disabled = false;
    }
    await updateSummaryFromGlobal();
    return;
  }

  const resumedMatch = line.match(/^RUN_RESUMED:(.+)$/);
  if (resumedMatch) {
    const reason = resumedMatch[1] || "User requested";
    appendToLog(`[INFO] Run resumed: ${reason}`);
    // Update global state
    let updateGlobalProgress = null;
    try {
      const taskStateModule = await import("../../utils/task-state.js");
      updateGlobalProgress = taskStateModule.updateProgress;
    } catch (e) {
      console.warn("Failed to import task-state module:", e);
    }
    if (updateGlobalProgress) {
      updateGlobalProgress({ overallStatus: "running" });
    }
    // Update status indicator directly
    const runnerStatus = document.getElementById("svc-runner-status");
    const statusIcon = document.getElementById("svc-status-icon");
    const statusText = document.getElementById("svc-status-text");
    const pauseResumeBtn = document.getElementById("svc-pause-resume-btn");
    if (runnerStatus && statusIcon && statusText) {
      statusIcon.innerHTML = '<i class="ph ph-spinner spinner-icon"></i>';
      statusText.textContent = "Running";
      runnerStatus.className = "runner-status-indicator running";
    }
    if (pauseResumeBtn) {
      pauseResumeBtn.className = "control-btn pause";
      pauseResumeBtn.title = "Pause run after current task completes";
      pauseResumeBtn.innerHTML =
        '<i class="ph ph-pause-circle"></i><span class="btn-text">Pause</span>';
      pauseResumeBtn.disabled = false;
    }
    await updateSummaryFromGlobal();
    return;
  }

  // Handle progress JSON updates
  if (
    line.startsWith("PROGRESS_JSON:") ||
    line.startsWith("PROGRESS_JSON_FINAL:")
  ) {
    const isFinal = line.startsWith("PROGRESS_JSON_FINAL:");
    const jsonPart = line
      .slice(isFinal ? "PROGRESS_JSON_FINAL:".length : "PROGRESS_JSON:".length)
      .trim();

    try {
      const obj = JSON.parse(jsonPart);

      // Update global state with task statuses from progress JSON
      if (
        obj?.tasks_status &&
        Array.isArray(obj.tasks_status) &&
        updateGlobalTaskStatus
      ) {
        obj.tasks_status.forEach((taskResult, idx) => {
          const status = taskResult.status;
          const statusMap = {
            success: "success",
            error: "error",
            warning: "warning",
            skip: "skip",
            running: "running",
          };
          if (status && statusMap[status]) {
            updateGlobalTaskStatus(idx, statusMap[status]);
            // Also update DOM immediately for parallel execution
            updateTaskStatusDom(idx, statusMap[status]);
          }
        });
      }

      // Also sync from results array if available (for parallel execution)
      // This is critical for parallel execution where tasks complete out of order
      if (obj?.results && Array.isArray(obj.results) && taskListEl) {
        obj.results.forEach((result, idx) => {
          if (result?.task_type) {
            let status = "pending";
            const resultStatus = result.status?.toLowerCase();
            if (resultStatus === "success") {
              status = "success";
            } else if (resultStatus === "failure" || resultStatus === "error") {
              status = "failure";
            } else if (resultStatus === "skipped") {
              status = "skipped";
            }
            // Only update if we have a valid status
            if (status !== "pending") {
              // Update immediately (synchronously) to catch fast tasks
              const tasks = Array.from(taskListEl.children);
              if (tasks[idx]) {
                const taskElement = tasks[idx];
                taskElement.className = taskElement.className
                  .split(" ")
                  .filter((c) => !["pending", "running", "success", "failure", "skipped"].includes(c))
                  .join(" ");
                taskElement.className = `${taskElement.className} task-status ${status}`.trim();
                const badge = taskElement.querySelector(".right");
                if (badge) {
                  if (status === "success") {
                    badge.innerHTML = '<span class="badge ok">Success</span>';
                  } else if (status === "failure") {
                    badge.innerHTML = '<span class="badge fail">Failure</span>';
                  } else if (status === "skipped") {
                    badge.innerHTML = '<span class="badge skipped">Skipped</span>';
                  }
                }
              }
            }
          }
        });
      }

      // Update DOM elements if available
      const finalJsonEl = document.getElementById("svc-final-json");

      if (finalJsonEl) {
        const pretty = JSON.stringify(obj, null, 2);
        const highlighted = hljs.highlight(pretty, { language: "json" }).value;
        finalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
      }

      if (isFinal) {
        const summaryEl = document.getElementById("svc-summary");
        const summaryTitleEl = document.getElementById("svc-summary-title");
        const summarySubEl = document.getElementById("svc-summary-sub");
        const summaryIconEl = document.getElementById("svc-summary-icon");

        if (summaryEl) {
          const ok = obj?.overall_status === "success";
          summaryEl.hidden = false;
          if (summaryTitleEl) {
            summaryTitleEl.textContent = ok
              ? "All tasks completed"
              : "Completed with errors";
          }
          if (summarySubEl) {
            summarySubEl.textContent = ok
              ? "Review the final report below."
              : "Check the log and JSON report for details.";
          }
          if (summaryIconEl) {
            summaryIconEl.textContent = ok ? "✔" : "!";
          }
          summaryEl.classList.toggle("ok", !!ok);
          summaryEl.classList.toggle("fail", !ok);
          // Hide progress bar when completed
          const summaryProgWrap = document.getElementById(
            "svc-summary-progress"
          );
          if (summaryProgWrap)
            summaryProgWrap.setAttribute("aria-hidden", "true");
        }
      } else {
        // Non-final progress JSON: update summary to reflect current progress
        await updateSummaryFromGlobal();
      }

      // Sync all task statuses from global state to DOM (for parallel execution)
      // This ensures UI stays in sync even with rapid updates
      if (taskListEl && updateGlobalTaskStatus) {
        try {
          const { getRunState } = await import("../../utils/task-state.js");
          const runState = getRunState();
          if (runState?.tasks && Array.isArray(runState.tasks)) {
            runState.tasks.forEach((task, idx) => {
              if (task?.status) {
                const statusMap = {
                  success: "success",
                  error: "failure",
                  warning: "failure",
                  skip: "skipped",
                  running: "running",
                  pending: "pending",
                };
                const domStatus = statusMap[task.status] || task.status;
                updateTaskStatusDom(idx, domStatus);
              }
            });
          }
        } catch (e) {
          // Ignore sync errors
        }
      }
    } catch (e) {
      console.warn("Failed to parse progress JSON:", e);
    }
    return;
  }
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
  // Import global state management
  const {
    initRunState,
    updateTaskStatus: updateGlobalTaskStatus,
    updateProgress: updateGlobalProgress,
    getRunState,
  } = await import("../../utils/task-state.js");
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
  const runnerControls = document.getElementById("svc-runner-controls");
  const runnerStatus = document.getElementById("svc-runner-status");
  const statusIcon = document.getElementById("svc-status-icon");
  const statusText = document.getElementById("svc-status-text");
  const stopBtn = document.getElementById("svc-stop-btn");
  const pauseResumeBtn = document.getElementById("svc-pause-resume-btn");
  const skipBtn = document.getElementById("svc-skip-btn");
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
        bottom: 100px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 9998;
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

  backBtn?.addEventListener("click", (e) => {
    console.log("[BackBtn] Click event fired", {
      isRunning: _isRunning,
      buttonDisabled: backBtn?.disabled,
      buttonElement: backBtn,
      currentHash: window.location.hash,
    });

    // Mark run state as dismissed so presets page doesn't redirect back
    try {
      const state = getRunState();
      console.log("[BackBtn] Current run state:", {
        runId: state?.runId,
        overallStatus: state?.overallStatus,
        hasState: !!state,
      });

      if (state && state.runId) {
        console.log("[BackBtn] Marking run as dismissed:", state.runId);
        sessionStorage.setItem("taskWidget.dismissedRunId", state.runId);

        // Verify it was set
        const verify = sessionStorage.getItem("taskWidget.dismissedRunId");
        console.log("[BackBtn] Dismissal set and verified:", {
          expected: state.runId,
          actual: verify,
          matches: verify === state.runId,
        });
      } else {
        console.warn("[BackBtn] No state or runId to dismiss");
      }
    } catch (err) {
      console.error("[BackBtn] Failed to mark run as dismissed:", err);
    }

    // Navigate back to presets page
    try {
      console.log("[BackBtn] Attempting to navigate to #/service", {
        currentHash: window.location.hash,
        sessionStorageKeys: Object.keys(sessionStorage),
      });
      window.location.hash = "#/service";
      console.log(
        "[BackBtn] Navigation hash set, waiting for route change event"
      );
    } catch (err) {
      console.error("[BackBtn] Navigation failed:", err);
    }
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

  // Check if AI summary is enabled and add it as a task
  let aiSummaryEnabled = false;
  try {
    const pendingRunRaw = sessionStorage.getItem("service.pendingRun");
    if (pendingRunRaw) {
      const pendingRun = JSON.parse(pendingRunRaw);
      aiSummaryEnabled = pendingRun.ai_summary_enabled === true;
    }
  } catch (e) {
    // Ignore
  }

  if (aiSummaryEnabled) {
    taskState.push({
      id: taskState.length,
      type: "ai_summary",
      label: "AI Summary Generation",
      status: "pending",
    });
  }

  // Check if there's an active or completed run in global state and restore UI
  // ONLY restore state if we're reconnecting to an existing run (no new pendingRun)
  const globalState = getRunState();
  const hasNewPendingRun =
    tasks.length > 0 && sessionStorage.getItem("service.pendingRun");

  if (
    !hasNewPendingRun &&
    globalState &&
    (globalState.overallStatus === "running" ||
      globalState.overallStatus === "completed" ||
      globalState.overallStatus === "error") &&
    globalState.tasks.length > 0
  ) {
    // Restore task statuses from global state
    globalState.tasks.forEach((globalTask, idx) => {
      if (taskState[idx]) {
        const statusMap = {
          pending: "pending",
          running: "running",
          success: "success",
          error: "failure",
          warning: "failure",
          skip: "skipped",
        };
        taskState[idx].status = statusMap[globalTask.status] || "pending";
      }
    });

    // Try to restore log from sessionStorage
    try {
      const savedLog = sessionStorage.getItem("service.runnerLog");
      if (savedLog && logEl) {
        rawLogLines = String(savedLog).split("\n");
        logEl.innerHTML = rawLogLines.map(highlightLogLine).join("\n");
        // Scroll to bottom
        logEl.scrollTop = logEl.scrollHeight;
      }
    } catch {}
  } else if (hasNewPendingRun) {
    // Starting a new service run - clear all previous state
    console.log("[Init] New service run detected, clearing previous state");
    clearFinalReportCache();
    try {
      sessionStorage.removeItem("service.runnerLog");
      sessionStorage.removeItem("service.notifiedRunId");
      sessionStorage.removeItem("taskWidget.dismissedRunId");
    } catch {}
    // Clear live log DOM and buffer
    rawLogLines = [];
    if (logEl) logEl.innerHTML = "";
  }

  renderTaskList();

  container.hidden = false;

  // Initialize status indicator and disable buttons until run starts
  updateRunnerStatus("idle");
  if (stopBtn) stopBtn.disabled = true;
  if (pauseResumeBtn) pauseResumeBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  // If reconnecting to an active run, update status
  if (runnerControls && !runnerControls.hidden) {
    const currentState = getRunState();
    const status = currentState?.overallStatus || "idle";
    updateRunnerStatus(status);
    // Re-enable buttons if run is active (use helper for consistency)
    if (isRunActive(currentState)) {
      if (stopBtn) stopBtn.disabled = false;
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
    }
  }

  // Initialize task status tracking
  let taskStatuses = {};
  tasks.forEach((task, index) => {
    taskStatuses[index] = taskState[index]?.status || "pending";
  });

  // Track whether a run is currently in progress to prevent duplicate clicks
  // Always derive from global state (source of truth) - will be synced below
  let _isRunning = false;
  // Hold results for client-only tasks (not executed by Python runner)
  let _clientResults = [];
  // Prevent duplicate notifications per run - track in sessionStorage to persist across page loads
  let _notifiedOnce = false;
  try {
    const notifiedRunId = sessionStorage.getItem("service.notifiedRunId");
    if (notifiedRunId && globalState && globalState.runId === notifiedRunId) {
      _notifiedOnce = true; // Already notified for this run
      console.log("[Init] Notifications already sent for run:", notifiedRunId);
    }
  } catch {}

  // Try to rehydrate from cached final report so navigation back preserves results
  // ONLY restore if not starting a new service run
  if (!hasNewPendingRun) {
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
          showSummary(ok, false); // Cached results - don't trigger alerts
          try {
            if (viewResultsBtn) {
              viewResultsBtn.removeAttribute("disabled");
            }
          } catch {}
        } catch {}
      }
    } catch {}
  } else {
    // Starting a new service - ensure UI is in clean initial state
    lastFinalJsonString = "{}";
    finalJsonEl.textContent = "";
    summaryEl.hidden = true;
    if (viewResultsBtn) {
      viewResultsBtn.setAttribute("disabled", "");
    }
  }

  // Check global state to determine if run is active (derive from source of truth)
  // Cache the state to avoid multiple calls
  const currentGlobalState = getRunState();
  const isRunActiveFromGlobal = isRunActive(currentGlobalState);
  
  // Sync module-level _isRunning with global state
  _isRunning = isRunActiveFromGlobal;

  // If we're reconnecting to an active run, wire up native events and update UI
  if (_isRunning) {
    // CRITICAL: Always ensure listeners are registered when reconnecting
    // Even if _globalEventsRegistered is true, call wireNativeEvents() to ensure
    // DOM references are fresh and listeners are properly established
    wireNativeEvents();
    
    // Restart task status sync timer for active runs
    startTaskStatusSync();
    
    showOverlay(false);
    updateSummaryDuringRun();
    // Disable run button while running (but keep back button enabled)
    runBtn.disabled = true;
    runBtn.setAttribute("disabled", "");
    runBtn.setAttribute("aria-disabled", "true");
    // Show control buttons and update status
    if (runnerControls) runnerControls.hidden = false;
    // Use the actual state from global state, default to "running" if not set
    const status = currentGlobalState?.overallStatus || "running";
    updateRunnerStatus(status);
    // Enable control buttons if run is active (use helper for consistency)
    if (isRunActive(currentGlobalState)) {
      if (stopBtn) stopBtn.disabled = false;
      if (pauseResumeBtn) pauseResumeBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
    }
    // Keep back button enabled so users can navigate away during run
  } else {
    // Hide control buttons when not running
    if (runnerControls) runnerControls.hidden = true;
    // Set status to idle when not running
    updateRunnerStatus("idle");
    // Disable buttons
    if (stopBtn) stopBtn.disabled = true;
    if (pauseResumeBtn) pauseResumeBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
  }

  // Wire up control button handlers
  stopBtn?.addEventListener("click", async () => {
    // Check global state directly to avoid stale local flag
    if (!isRunActive()) return;
    try {
      const { core } = window.__TAURI__ || {};
      const { invoke: invokeCmd } = core || {};
      if (!invokeCmd) {
        appendLog("[ERROR] Tauri invoke not available");
        return;
      }
      await invokeCmd("stop_service_run");
      appendLog(
        "[INFO] Stop signal sent. Current task will finish, then run will stop."
      );
    } catch (e) {
      appendLog(`[ERROR] Failed to send stop signal: ${e}`);
    }
  });

  pauseResumeBtn?.addEventListener("click", async () => {
    try {
      const { core } = window.__TAURI__ || {};
      const { invoke: invokeCmd } = core || {};
      if (!invokeCmd) {
        appendLog("[ERROR] Tauri invoke not available");
        return;
      }
      const state = getRunState();
      if (state.overallStatus === "paused") {
        await invokeCmd("resume_service_run");
        appendLog("[INFO] Resume signal sent. Run will resume.");
      } else {
        // Check global state directly to avoid stale local flag
        if (!isRunActive(state)) return;
        await invokeCmd("pause_service_run");
        appendLog(
          "[INFO] Pause signal sent. Current task will finish, then run will pause."
        );
      }
    } catch (e) {
      appendLog(`[ERROR] Failed to send pause/resume signal: ${e}`);
    }
  });

  skipBtn?.addEventListener("click", async () => {
    // Check global state directly to avoid stale local flag
    if (!isRunActive()) return;
    try {
      const { core } = window.__TAURI__ || {};
      const { invoke: invokeCmd } = core || {};
      if (!invokeCmd) {
        appendLog("[ERROR] Tauri invoke not available");
        return;
      }
      await invokeCmd("skip_current_task");
      appendLog(
        "[INFO] Skip signal sent. Current task will be skipped immediately."
      );
    } catch (e) {
      appendLog(`[ERROR] Failed to send skip signal: ${e}`);
    }
  });

  // Helper function to update status indicator and pause/resume button
  function updateRunnerStatus(status) {
    if (!runnerStatus || !statusIcon || !statusText || !pauseResumeBtn) {
      // Elements not available yet, skip update
      return;
    }

    switch (status) {
      case "running":
        statusIcon.innerHTML = '<i class="ph ph-spinner spinner-icon"></i>';
        statusText.textContent = "Running";
        runnerStatus.className = "runner-status-indicator running";
        // Force update button to pause state
        pauseResumeBtn.className = "control-btn pause";
        pauseResumeBtn.title = "Pause run after current task completes";
        pauseResumeBtn.innerHTML =
          '<i class="ph ph-pause-circle"></i><span class="btn-text">Pause</span>';
        pauseResumeBtn.disabled = false;
        break;
      case "paused":
        statusIcon.innerHTML =
          '<i class="ph ph-pause-circle" style="color: var(--warning-color)"></i>';
        statusText.textContent = "Paused";
        runnerStatus.className = "runner-status-indicator paused";
        // Force update button to resume state
        pauseResumeBtn.className = "control-btn resume";
        pauseResumeBtn.title = "Resume paused run";
        pauseResumeBtn.innerHTML =
          '<i class="ph ph-play-circle"></i><span class="btn-text">Resume</span>';
        pauseResumeBtn.disabled = false;
        break;
      case "stopped":
        statusIcon.innerHTML =
          '<i class="ph ph-stop-circle" style="color: var(--muted-color)"></i>';
        statusText.textContent = "Stopped";
        runnerStatus.className = "runner-status-indicator stopped";
        pauseResumeBtn.disabled = true;
        break;
      case "completed":
        statusIcon.innerHTML =
          '<i class="ph ph-check-circle" style="color: var(--success-color)"></i>';
        statusText.textContent = "Completed";
        runnerStatus.className = "runner-status-indicator completed";
        pauseResumeBtn.disabled = true;
        break;
      case "error":
        statusIcon.innerHTML =
          '<i class="ph ph-x-circle" style="color: var(--error-color)"></i>';
        statusText.textContent = "Error";
        runnerStatus.className = "runner-status-indicator error";
        pauseResumeBtn.disabled = true;
        break;
      default:
        statusIcon.innerHTML = '<i class="ph ph-clock"></i>';
        statusText.textContent = "Idle";
        runnerStatus.className = "runner-status-indicator idle";
        pauseResumeBtn.disabled = true;
    }
  }

  runBtn?.addEventListener("click", async () => {
    if (!tasks.length) return;
    // Check global state directly to avoid stale local flag
    if (isRunActive()) return; // guard against double clicks

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
    // Hard-disable run button during run
    runBtn.disabled = true;
    runBtn.setAttribute("disabled", "");
    runBtn.setAttribute("aria-disabled", "true");
    // Show control buttons and update status
    if (runnerControls) runnerControls.hidden = false;
    updateRunnerStatus("running");
    // Enable control buttons
    if (stopBtn) stopBtn.disabled = false;
    if (pauseResumeBtn) pauseResumeBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    
    // Start periodic task status sync for parallel execution
    // This ensures fast tasks that complete before DOM is ready get updated
    startTaskStatusSync();
    // Keep back button enabled so users can navigate away during run
    // New service: clear any previously cached results so navigating back won't show stale data
    clearFinalReportCache();
    lastFinalJsonString = "{}";
    _notifiedOnce = false;
    // Clear notification flag for new run
    try {
      sessionStorage.removeItem("service.notifiedRunId");
      sessionStorage.removeItem("taskWidget.dismissedRunId");
      console.log("[RunBtn] Cleared notification flags for new run");
    } catch {}
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

    // Check if AI summary is enabled and add it to global state
    let aiSummaryEnabled = false;
    try {
      const pendingRunRaw = sessionStorage.getItem("service.pendingRun");
      if (pendingRunRaw) {
        const pendingRun = JSON.parse(pendingRunRaw);
        aiSummaryEnabled = pendingRun.ai_summary_enabled === true;
      }
    } catch (e) {
      // Ignore
    }

    // Build tasks array for global state (include AI summary if enabled)
    const tasksForGlobalState = [...tasks];
    if (aiSummaryEnabled) {
      tasksForGlobalState.push({
        type: "ai_summary",
        ui_label: "AI Summary Generation",
      });
    }

    // Initialize global task state for persistent widget tracking
    initRunState(tasksForGlobalState, {
      title: runnerTitle?.textContent || "Service Run",
      description: runnerDesc?.textContent || "",
    });

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
        console.log(
          "[Runner] Client-only tasks completed, generating final report"
        );
        const finalReport = buildFinalReportFromClient(_clientResults);
        handleFinalResult(finalReport);

        // Update global state to mark run as completed
        updateGlobalProgress({
          overallStatus:
            finalReport?.overall_status === "success" ? "completed" : "error",
        });

        _isRunning = false;
        stopTaskStatusSync();
        console.log("[Runner] Client-only run completed, re-enabling controls");
        showOverlay(false);
        backBtn.disabled = false;
        runBtn.disabled = false;
        runBtn.removeAttribute("aria-disabled");
        runBtn.removeAttribute("disabled");
        backBtn.removeAttribute("disabled");
        console.log("[Runner] Controls re-enabled after client-only run", {
          backBtnDisabled: backBtn.disabled,
          runBtnDisabled: runBtn.disabled,
        });
        return;
      }

      let startedNatively = false;
      // Build run plan with metadata
      const runPlanPayload = {
        tasks: runnerTasks,
      };

      // Include pause_between_tasks and parallel_execution preferences if enabled in the pending run
      try {
        const pendingRunRaw = sessionStorage.getItem("service.pendingRun");
        if (pendingRunRaw) {
          const pendingRun = JSON.parse(pendingRunRaw);
          if (pendingRun.pause_between_tasks === true) {
            runPlanPayload.pause_between_tasks = true;
          }
          if (pendingRun.parallel_execution === true) {
            runPlanPayload.parallel_execution = true;
          }
        }
      } catch (e) {
        console.warn(
          "[Runner] Failed to include execution preferences in plan:",
          e
        );
      }

      // Add metadata if available
      if (serviceMetadata) {
        runPlanPayload.metadata = {
          technician_name: serviceMetadata.technicianName,
          customer_name: serviceMetadata.customerName,
          skipped: serviceMetadata.skipped || false,
        };
      }

      // Add Sentry configuration from settings
      try {
        const settings = await invoke("load_app_settings");
        const sentryEnabled = settings?.sentry_enabled !== false; // default true
        const sentryPii = settings?.sentry?.send_default_pii !== false; // default true
        const sentryPerformance = settings?.sentry?.traces_sample_rate !== 0.0; // default true (1.0)
        const sentrySystemInfo = settings?.sentry?.send_system_info !== false; // default true
        const sentryEnvironment = settings?.sentry?.environment || "production"; // default production

        runPlanPayload.sentry_config = {
          enabled: sentryEnabled,
          send_default_pii: sentryPii,
          traces_sample_rate: sentryPerformance ? 1.0 : 0.0,
          send_system_info: sentrySystemInfo,
          environment: sentryEnvironment,
        };
      } catch (err) {
        console.warn("Failed to load Sentry settings, using defaults:", err);
        // Fallback to defaults (all enabled, production environment)
        runPlanPayload.sentry_config = {
          enabled: true,
          send_default_pii: true,
          traces_sample_rate: 1.0,
          send_system_info: true,
          environment: "production",
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
          console.error("[Runner] Native runner failed, falling back:", err);
          const result = await runRunner(jsonArg); // fallback
          handleFinalResult(mergeClientWithRunner(_clientResults, result));
          // Fallback is synchronous to completion; re-enable controls now
          _isRunning = false;
          stopTaskStatusSync();
          console.log("[Runner] Fallback completed, re-enabling controls");
          showOverlay(false);
          if (runnerControls) runnerControls.hidden = true;
          backBtn.disabled = false;
          runBtn.disabled = false;
          runBtn.removeAttribute("aria-disabled");
          runBtn.removeAttribute("disabled");
          backBtn.removeAttribute("disabled");
          console.log("[Runner] Controls re-enabled after fallback", {
            backBtnDisabled: backBtn.disabled,
            runBtnDisabled: runBtn.disabled,
          });
        }
      } else {
        console.log("[Runner] No invoke available, using shell fallback");
        const result = await runRunner(jsonArg);
        handleFinalResult(mergeClientWithRunner(_clientResults, result));
        _isRunning = false;
        stopTaskStatusSync();
        console.log("[Runner] Shell fallback completed, re-enabling controls");
        showOverlay(false);
        if (runnerControls) runnerControls.hidden = true;
        backBtn.disabled = false;
        runBtn.disabled = false;
        runBtn.removeAttribute("aria-disabled");
        runBtn.removeAttribute("disabled");
        backBtn.removeAttribute("disabled");
        console.log("[Runner] Controls re-enabled after shell fallback", {
          backBtnDisabled: backBtn.disabled,
          runBtnDisabled: runBtn.disabled,
        });
      }
    } catch (e) {
      appendLog(`[ERROR] ${new Date().toLocaleTimeString()} ${String(e)}`);
      console.error("[Runner] Caught error during run:", e);
      showSummary(false, true); // Error during run - trigger alerts
      _isRunning = false;
      stopTaskStatusSync();
      console.log("[Runner] Error handler re-enabling controls");
      showOverlay(false);
      if (runnerControls) runnerControls.hidden = true;
      backBtn.disabled = false;
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-disabled");
      runBtn.removeAttribute("disabled");
      backBtn.removeAttribute("disabled");
      console.log("[Runner] Controls re-enabled after error", {
        backBtnDisabled: backBtn.disabled,
        runBtnDisabled: runBtn.disabled,
      });
    }
  });

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
    // Make this function idempotent - safe to call multiple times
    // Always ensures listeners are registered and DOM references are fresh
    if (!window.__TAURI__?.event?.listen) return;
    const { listen } = window.__TAURI__.event;

    // Register global listeners only once (idempotent check)
    // If already registered, skip registration but function still completes successfully
    if (!_globalEventsRegistered) {
      _globalEventsRegistered = true;

      // Store unlisten functions for cleanup if needed
      listen("service_runner_line", (evt) => {
        try {
          const payload = evt?.payload || {};
          const line = payload.line || "";
          if (!line) return;

          // CRITICAL: Always process status line first to update global state
          // This happens regardless of whether we're on the runner page
          try {
            processStatusLine(line);
          } catch (e) {
            console.warn("processStatusLine error", e);
          }

          // CRITICAL: Always save to sessionStorage, even when not on page
          // This ensures full log capture when running in background
          try {
            const existingLog =
              sessionStorage.getItem("service.runnerLog") || "";

            // Format the line for storage
            let lineToStore;
            if (
              line.startsWith("PROGRESS_JSON:") ||
              line.startsWith("PROGRESS_JSON_FINAL:")
            ) {
              lineToStore = summarizeProgressLine(line);
            } else {
              lineToStore = `[SR] ${line}`;
            }

            if (lineToStore) {
              const updatedLog =
                existingLog + (existingLog ? "\n" : "") + lineToStore;
              sessionStorage.setItem("service.runnerLog", updatedLog);
            }
          } catch (e) {
            console.warn("Failed to save log to sessionStorage:", e);
          }

          // Then update DOM elements if available (optional, only when on page)
          const currentLogEl = document.getElementById("svc-log");
          if (!currentLogEl) return; // Not on runner page, but state and log were already updated above

          // Replace verbose progress JSON lines with concise summary
          if (
            line.startsWith("PROGRESS_JSON:") ||
            line.startsWith("PROGRESS_JSON_FINAL:")
          ) {
            const summary = summarizeProgressLine(line);
            if (summary) {
              appendToLiveLog(summary);
            }
          } else {
            appendToLiveLog(`[SR] ${line}`);
          }
        } catch (e) {
          console.warn("service_runner_line listener failed", e);
        }
      }).then((unlisten) => {
        _unlistenLine = unlisten;
      });

      listen("service_runner_done", async (evt) => {
        const payload = evt?.payload || {};
        const finalReport = payload.final_report || payload.finalReport || {};

        try {
          // Capture task durations for time estimation
          // Check if task time estimates are enabled in settings
          try {
            const { settingsManager } = await import("../../utils/settings-manager.js");
            const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
            if (!enabled) {
              console.log("[Task Time] Recording disabled in settings, skipping capture");
            } else {
              try {
                const { normalizeTaskParams, isParameterBasedTask } = await import(
                  "../../utils/task-time-estimates.js"
                );
                const { core } = window.__TAURI__ || {};
                const { invoke } = core || {};

                if (invoke && Array.isArray(finalReport.results)) {
                  // Get original task definitions from run plan
                  let originalTasks = [];
                  try {
                    const pendingRunRaw =
                      sessionStorage.getItem("service.pendingRun");
                    if (pendingRunRaw) {
                      const pendingRun = JSON.parse(pendingRunRaw);
                      originalTasks = Array.isArray(pendingRun.tasks)
                        ? pendingRun.tasks
                        : [];
                    }
                  } catch (e) {
                    console.warn(
                      "[Task Time] Failed to load original tasks for time capture:",
                      e
                    );
                  }

                  const timeRecords = [];
                  const timestamp = Math.floor(Date.now() / 1000);

                  console.log(
                    `[Task Time] Processing ${finalReport.results.length} results for time capture`
                  );

                  // Match results to original tasks by index
                  finalReport.results.forEach((result, idx) => {
                    // Only save successful tasks
                    const status = String(result?.status || "").toLowerCase();
                    if (status !== "success") {
                      console.log(
                        `[Task Time] Skipping task ${idx}: status=${status}`
                      );
                      return;
                    }

                    // Get task type
                    const taskType = result?.task_type || originalTasks[idx]?.type;
                    if (!taskType) {
                      console.log(`[Task Time] Skipping task ${idx}: no task type`);
                      return;
                    }

                    // Skip logging for parameter-based tasks (duration is exactly determined by parameters)
                    // These tasks don't need historical data since duration can be calculated directly from params
                    if (isParameterBasedTask(taskType)) {
                      console.log(
                        `[Task Time] Skipping parameter-based task ${taskType}: duration is determined by parameters`
                      );
                      return;
                    }

                    // Extract duration
                    const duration = result?.summary?.duration_seconds;
                    // Allow very small durations (>= 0.001) to account for rounding
                    // Tasks that round to 0.00 are still valid (just very fast)
                    if (!Number.isFinite(duration) || duration < 0) {
                      console.log(
                        `[Task Time] Skipping task ${idx}: invalid duration=${duration}`
                      );
                      return;
                    }

                    // If duration is 0 or very small, use a minimum of 0.01 for storage
                    // This ensures we capture fast tasks while avoiding true 0 values
                    const durationToSave = Math.max(0.01, duration);

                    // Get original task for params
                    const originalTask = originalTasks[idx] || {};
                    const paramsHash = normalizeTaskParams(originalTask);
                    let paramsJson;
                    try {
                      paramsJson = JSON.parse(paramsHash);
                    } catch (e) {
                      console.warn(
                        `[Task Time] Failed to parse params hash for ${taskType}:`,
                        e
                      );
                      paramsJson = {};
                    }

                    const paramsStr = JSON.stringify(paramsJson);
                    console.log(
                      `[Task Time] Capturing: ${taskType}, duration=${duration}s, params=`,
                      paramsJson,
                      `paramsStr=`,
                      paramsStr
                    );

                    timeRecords.push({
                      task_type: taskType,
                      params: paramsJson,
                      duration_seconds: Number(durationToSave),
                      timestamp: timestamp,
                    });
                  });

                  // Save records if any
                  if (timeRecords.length > 0) {
                    try {
                      await invoke("save_task_time", { records: timeRecords });
                      console.log(
                        `[Task Time] Successfully saved ${timeRecords.length} duration record(s)`
                      );

                      // Clear cache so estimates refresh
                      try {
                        const { clearTaskTimeCache } = await import(
                          "../../utils/task-time-estimates.js"
                        );
                        clearTaskTimeCache();
                      } catch (e) {
                        // Ignore cache clear errors
                      }
                    } catch (saveError) {
                      console.error(
                        "[Task Time] Failed to save duration records:",
                        saveError
                      );
                    }
                  } else {
                    console.log("[Task Time] No valid duration records to save");
                  }
                } else {
                  console.log(
                    "[Task Time] No invoke available or results not an array"
                  );
                }
              } catch (error) {
                console.error(
                  "[Task Time] Failed to capture task durations:",
                  error
                );
                // Don't block report processing if time capture fails
              }
            }
          } catch (error) {
            console.error(
              "[Task Time] Failed to check task time estimates setting:",
              error
            );
            // If we can't check the setting, skip recording to be safe
          }

          // Get fresh DOM references
          const currentFinalJsonEl = document.getElementById("svc-final-json");
          const currentViewResultsBtn =
            document.getElementById("svc-view-results");
          const currentSummaryEl = document.getElementById("svc-summary");
          const currentBackBtn = document.getElementById("svc-report-back");
          const currentRunBtn = document.getElementById("svc-report-run");
          const currentOverlay = document.getElementById("svc-log-overlay");

          // Check if AI summary is enabled in the run plan
          let aiSummaryEnabled = false;
          try {
            const pendingRunRaw = sessionStorage.getItem("service.pendingRun");
            if (pendingRunRaw) {
              const pendingRun = JSON.parse(pendingRunRaw);
              aiSummaryEnabled = pendingRun.ai_summary_enabled === true;
              console.log(
                "[AI Summary] Checked preference:",
                aiSummaryEnabled,
                "from plan:",
                Object.keys(pendingRun)
              );
            } else {
              console.log(
                "[AI Summary] No pending run found in sessionStorage"
              );
            }
          } catch (e) {
            console.warn("[AI Summary] Failed to check preference:", e);
          }

          // Generate AI summary if enabled (before persisting)
          let aiSummaryPromise = null;
          const aiSummaryTaskIndex = aiSummaryEnabled
            ? taskState.findIndex((t) => t.type === "ai_summary")
            : -1;

          if (aiSummaryEnabled) {
            try {
              const { aiClient } = await import("../../utils/ai-client.js");
              const isConfigured = await aiClient.isConfigured();

              if (isConfigured) {
                console.log("[AI Summary] Starting generation...");

                // Update AI summary task status to "running"
                if (aiSummaryTaskIndex >= 0) {
                  // Update local task state
                  updateTaskStatus(aiSummaryTaskIndex, "running");
                  renderTaskList();
                  // Update global task state (AI summary is at index = number of Python tasks)
                  if (updateGlobalTaskStatus) {
                    const pythonTaskCount =
                      finalReport?.results?.length || tasks.length;
                    updateGlobalTaskStatus(pythonTaskCount, "running");
                  }
                  // Update summary UI to show progress with AI summary running
                  if (currentSummaryEl) {
                    const total = taskState.length;
                    const completed = taskState.filter((t) =>
                      ["success", "failure", "skipped"].includes(t.status)
                    ).length;
                    const summaryTitleEl =
                      document.getElementById("svc-summary-title");
                    const summarySubEl =
                      document.getElementById("svc-summary-sub");
                    const summaryIconEl =
                      document.getElementById("svc-summary-icon");
                    const summaryProgWrap = document.getElementById(
                      "svc-summary-progress"
                    );
                    const summaryProgBar = document.getElementById(
                      "svc-summary-progress-bar"
                    );
                    if (summaryTitleEl) {
                      summaryTitleEl.textContent = `Progress: ${completed}/${total} completed`;
                    }
                    if (summarySubEl) {
                      summarySubEl.textContent = "Generating AI summary...";
                    }
                    if (summaryIconEl) {
                      summaryIconEl.innerHTML =
                        '<span class="spinner" aria-hidden="true"></span>';
                    }
                    if (summaryProgWrap)
                      summaryProgWrap.removeAttribute("aria-hidden");
                    if (summaryProgBar) {
                      const pct =
                        total > 0 ? Math.round((completed / total) * 100) : 0;
                      summaryProgBar.style.width = `${pct}%`;
                    }
                    currentSummaryEl.classList.remove("ok", "fail");
                  }
                }

                // Generate summary - store promise to wait for it
                aiSummaryPromise = aiClient
                  .generateServiceSummary(finalReport)
                  .then((summary) => {
                    console.log(
                      "[AI Summary] Generated successfully, length:",
                      summary.length
                    );
                    // Add summary to report object
                    finalReport.ai_summary = summary;

                    // Update AI summary task status to "success"
                    if (aiSummaryTaskIndex >= 0) {
                      // Update local task state
                      updateTaskStatus(aiSummaryTaskIndex, "success");
                      renderTaskList();
                      // Update global task state (AI summary is at index = number of Python tasks)
                      if (updateGlobalTaskStatus) {
                        const pythonTaskCount =
                          finalReport?.results?.length || tasks.length;
                        updateGlobalTaskStatus(pythonTaskCount, "success");
                      }
                    }

                    // Update persisted report
                    const updatedJson = JSON.stringify(finalReport, null, 2);
                    persistFinalReport(updatedJson);
                    lastFinalJsonString = updatedJson;

                    // Update displayed JSON
                    if (currentFinalJsonEl) {
                      const highlighted = hljs.highlight(updatedJson, {
                        language: "json",
                      }).value;
                      currentFinalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
                    }

                    // Dispatch event to notify results page that report was updated
                    window.dispatchEvent(
                      new CustomEvent("service-report-updated", {
                        detail: { report: finalReport },
                      })
                    );

                    console.log("[AI Summary] Report updated with summary");
                  })
                  .catch((error) => {
                    console.error("[AI Summary] Failed to generate:", error);

                    // Extract user-friendly error message
                    let errorMessage = "Failed to generate summary";
                    if (error?.message) {
                      if (error.message.includes("API key")) {
                        errorMessage = "AI API key not configured";
                      } else if (
                        error.message.includes("connect") ||
                        error.message.includes("network")
                      ) {
                        errorMessage = "Network error - check connection";
                      } else if (
                        error.message.includes("rate limit") ||
                        error.message.includes("quota")
                      ) {
                        errorMessage = "API rate limit exceeded";
                      } else {
                        errorMessage = error.message;
                      }
                    }

                    // Update AI summary task status to "failure"
                    if (aiSummaryTaskIndex >= 0) {
                      // Update local task state
                      updateTaskStatus(aiSummaryTaskIndex, "failure");
                      renderTaskList();
                      // Update global task state (AI summary is at index = number of Python tasks)
                      if (updateGlobalTaskStatus) {
                        const pythonTaskCount =
                          finalReport?.results?.length || tasks.length;
                        updateGlobalTaskStatus(pythonTaskCount, "error");
                      }
                    }

                    // Log user-friendly error
                    appendLog(`[WARNING] AI Summary: ${errorMessage}`);

                    // Don't block report display - continue without summary
                  });
              } else {
                console.warn("[AI Summary] Requested but AI is not configured");
                // Mark as failed if not configured
                if (aiSummaryTaskIndex >= 0) {
                  // Update local task state
                  updateTaskStatus(aiSummaryTaskIndex, "failure");
                  renderTaskList();
                  // Update global task state (AI summary is at index = number of Python tasks)
                  if (updateGlobalTaskStatus) {
                    const pythonTaskCount =
                      finalReport?.results?.length || tasks.length;
                    updateGlobalTaskStatus(pythonTaskCount, "error");
                  }
                }
              }
            } catch (error) {
              console.error(
                "[AI Summary] Error checking AI configuration:",
                error
              );
              if (aiSummaryTaskIndex >= 0) {
                // Update local task state
                updateTaskStatus(aiSummaryTaskIndex, "failure");
                renderTaskList();
                // Update global task state (AI summary is at index = number of Python tasks)
                if (updateGlobalTaskStatus) {
                  const pythonTaskCount =
                    finalReport?.results?.length || tasks.length;
                  updateGlobalTaskStatus(pythonTaskCount, "error");
                }
              }
            }
          } else {
            console.log("[AI Summary] Not enabled for this run");
          }

          lastFinalJsonString = JSON.stringify(finalReport, null, 2);

          if (currentFinalJsonEl) {
            const highlighted = hljs.highlight(lastFinalJsonString, {
              language: "json",
            }).value;
            currentFinalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
          }

          applyFinalStatusesFromReport(finalReport);
          const ok = finalReport?.overall_status === "success";

          // Function to update summary UI
          const updateSummaryUI = (isAIGenerating = false) => {
            if (currentSummaryEl) {
              const summaryTitleEl =
                document.getElementById("svc-summary-title");
              const summarySubEl = document.getElementById("svc-summary-sub");
              const summaryIconEl = document.getElementById("svc-summary-icon");
              const summaryProgWrap = document.getElementById(
                "svc-summary-progress"
              );
              const summaryProgBar = document.getElementById(
                "svc-summary-progress-bar"
              );

              currentSummaryEl.hidden = false;

              // Calculate progress including AI summary task
              const total = taskState.length;
              const completed = taskState.filter((t) =>
                ["success", "failure", "skipped"].includes(t.status)
              ).length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

              if (isAIGenerating) {
                // Show progress while AI summary is being created
                if (summaryTitleEl) {
                  summaryTitleEl.textContent = `Progress: ${completed}/${total} completed`;
                }
                if (summarySubEl) {
                  summarySubEl.textContent = "Generating AI summary...";
                }
                if (summaryIconEl) {
                  summaryIconEl.innerHTML =
                    '<span class="spinner" aria-hidden="true"></span>';
                }
                // Keep progress bar visible and update it
                if (summaryProgWrap)
                  summaryProgWrap.removeAttribute("aria-hidden");
                if (summaryProgBar) summaryProgBar.style.width = `${pct}%`;
                // Don't turn green yet - still running
                currentSummaryEl.classList.remove("ok", "fail");
              } else {
                // Show final completion state
                if (summaryTitleEl) {
                  summaryTitleEl.textContent = ok
                    ? "All tasks completed"
                    : "Completed with errors";
                }
                if (summarySubEl) {
                  summarySubEl.textContent = ok
                    ? "Review the final report below."
                    : "Check the log and JSON report for details.";
                }
                if (summaryIconEl) {
                  summaryIconEl.textContent = ok ? "✔" : "!";
                }
                // Hide progress bar when fully completed
                if (summaryProgWrap)
                  summaryProgWrap.setAttribute("aria-hidden", "true");
                // Now we can turn green/red
                currentSummaryEl.classList.toggle("ok", !!ok);
                currentSummaryEl.classList.toggle("fail", !ok);
              }
            }
          };

          // Show summary UI - if AI summary is generating, show progress state
          if (aiSummaryPromise) {
            updateSummaryUI(true); // Show progress state with spinner
            // Update to final state after AI summary completes
            aiSummaryPromise
              .then(() => {
                updateSummaryUI(false); // Show final completion state
              })
              .catch(() => {
                updateSummaryUI(false); // Show final completion state even if AI fails
              });
          } else {
            updateSummaryUI(false); // No AI summary, show final state immediately
          }

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

          // Note: Auto-save is now handled in the results page for better positioning

          // Enable "View Results" button only after AI summary completes (if enabled)
          if (aiSummaryPromise) {
            // Wait for AI summary to complete before enabling button
            aiSummaryPromise
              .then(() => {
                if (currentViewResultsBtn) {
                  currentViewResultsBtn.removeAttribute("disabled");
                  console.log(
                    "[AI Summary] View Results button enabled after summary completion"
                  );
                }
              })
              .catch(() => {
                // Even if AI summary fails, enable the button
                if (currentViewResultsBtn) {
                  currentViewResultsBtn.removeAttribute("disabled");
                  console.log(
                    "[AI Summary] View Results button enabled (summary failed)"
                  );
                }
              });
          } else {
            // No AI summary, enable button immediately
            if (currentViewResultsBtn) {
              currentViewResultsBtn.removeAttribute("disabled");
            }
          }

          // Function to mark run as completed (only after AI summary if enabled)
          const markRunCompleted = () => {
            const finalStatus =
              finalReport?.overall_status === "success" ? "completed" : "error";
            updateGlobalProgress({
              overallStatus: finalStatus,
            });
            // Update status indicator and disable buttons
            updateRunnerStatus(finalStatus);
            if (stopBtn) stopBtn.disabled = true;
            if (pauseResumeBtn) pauseResumeBtn.disabled = true;
            if (skipBtn) skipBtn.disabled = true;
          };

          // Only mark as completed after AI summary finishes (if enabled)
          if (aiSummaryPromise) {
            // Wait for AI summary to complete before marking as done
            aiSummaryPromise
              .then(() => {
                markRunCompleted();
              })
              .catch(() => {
                // Even if AI summary fails, mark as completed
                markRunCompleted();
              });
          } else {
            // No AI summary, mark as completed immediately
            markRunCompleted();
          }

          // Send notification if not already sent and user is not on the page
          if (!_notifiedOnce) {
            _notifiedOnce = true;
            const currentHash = window.location.hash || "";
            const onRunnerPage = currentHash.startsWith("#/service-report");

            if (!onRunnerPage) {
              // User is on another page - send notification (if enabled)
              (async () => {
                try {
                  // Check if notifications are enabled in settings first
                  const { core } = window.__TAURI__ || {};
                  const settings = await core?.invoke?.("load_app_settings");
                  const enabled =
                    settings?.reports?.notifications_enabled === true;

                  if (!enabled) {
                    console.log(
                      "[Notification] Notifications disabled in settings, skipping background notification"
                    );
                    return;
                  }

                  const api = await ensureNotificationApi();
                  if (!api) return;

                  let granted = await api.isPermissionGranted();
                  if (!granted) {
                    const permission = await api.requestPermission();
                    granted = permission === "granted";
                  }

                  if (granted) {
                    const title = ok
                      ? "Service Run Complete"
                      : "Service Run Completed with Errors";
                    const completed = finalReport?.completed_count || 0;
                    const total = finalReport?.total_count || 0;
                    const body = `Completed ${completed}/${total} tasks`;
                    api.sendNotification({ title, body });
                  }
                } catch (e) {
                  console.warn("Failed to send completion notification:", e);
                }
              })();
            }
          }

          // Native run completed – re-enable UI controls
          _isRunning = false;
          stopTaskStatusSync();
          console.log(
            "[service_runner_done] Run completed, re-enabling controls",
            {
              currentBackBtn: !!currentBackBtn,
              currentRunBtn: !!currentRunBtn,
              hasOverlay: !!currentOverlay,
            }
          );
          const currentRunnerControls = document.getElementById(
            "svc-runner-controls"
          );
          if (currentRunnerControls) {
            currentRunnerControls.hidden = true;
          }
          if (currentOverlay) {
            currentOverlay.hidden = true;
            console.log("[service_runner_done] Overlay hidden");
          }
          if (currentBackBtn) {
            currentBackBtn.disabled = false;
            currentBackBtn.removeAttribute("disabled");
            console.log("[service_runner_done] Back button re-enabled", {
              disabled: currentBackBtn.disabled,
              hasDisabledAttr: currentBackBtn.hasAttribute("disabled"),
            });
          }
          if (currentRunBtn) {
            currentRunBtn.disabled = false;
            currentRunBtn.removeAttribute("aria-disabled");
            currentRunBtn.removeAttribute("disabled");
            console.log("[service_runner_done] Run button re-enabled");
          }
        } catch (e) {
          const currentFinalJsonEl = document.getElementById("svc-final-json");
          if (currentFinalJsonEl) {
            currentFinalJsonEl.textContent = String(e);
          }

          const currentSummaryEl = document.getElementById("svc-summary");
          if (currentSummaryEl) {
            const summaryTitleEl = document.getElementById("svc-summary-title");
            const summaryIconEl = document.getElementById("svc-summary-icon");
            currentSummaryEl.hidden = false;
            if (summaryTitleEl) {
              summaryTitleEl.textContent = "Completed with errors";
            }
            if (summaryIconEl) {
              summaryIconEl.textContent = "!";
            }
            currentSummaryEl.classList.remove("ok");
          }

          // Update global state to mark run as error
          updateGlobalProgress({ overallStatus: "error" });
          // Update status indicator and disable buttons
          updateRunnerStatus("error");
          if (stopBtn) stopBtn.disabled = true;
          if (pauseResumeBtn) pauseResumeBtn.disabled = true;
          if (skipBtn) skipBtn.disabled = true;
        }
      }).then((unlisten) => {
        _unlistenDone = unlisten;
      });
    }
  }

  async function handleFinalResult(result) {
    try {
      const obj = typeof result === "string" ? JSON.parse(result) : result;

      // Check if AI summary is enabled in the run plan
      let aiSummaryEnabled = false;
      try {
        const pendingRunRaw = sessionStorage.getItem("service.pendingRun");
        if (pendingRunRaw) {
          const pendingRun = JSON.parse(pendingRunRaw);
          aiSummaryEnabled = pendingRun.ai_summary_enabled === true;
          console.log(
            "[AI Summary] Checked preference:",
            aiSummaryEnabled,
            "from plan:",
            pendingRun
          );
        }
      } catch (e) {
        console.warn("[AI Summary] Failed to check preference:", e);
      }

      // Generate AI summary if enabled
      if (aiSummaryEnabled) {
        try {
          const { aiClient } = await import("../../utils/ai-client.js");
          const isConfigured = await aiClient.isConfigured();

          if (isConfigured) {
            console.log("[AI Summary] Starting generation...");
            // Generate summary asynchronously (don't block UI)
            aiClient
              .generateServiceSummary(obj)
              .then((summary) => {
                console.log(
                  "[AI Summary] Generated successfully, length:",
                  summary.length
                );
                // Add summary to report object
                obj.ai_summary = summary;

                // Update persisted report
                const updatedJson = JSON.stringify(obj, null, 2);
                persistFinalReport(updatedJson);

                // Update displayed JSON
                const highlighted = hljs.highlight(updatedJson, {
                  language: "json",
                }).value;
                finalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;

                // Dispatch event to notify results page that report was updated
                window.dispatchEvent(
                  new CustomEvent("service-report-updated", {
                    detail: { report: obj },
                  })
                );

                console.log("[AI Summary] Report updated with summary");
              })
              .catch((error) => {
                console.error("[AI Summary] Failed to generate:", error);
                // Don't block report display - continue without summary
              });
          } else {
            console.warn("[AI Summary] Requested but AI is not configured");
          }
        } catch (error) {
          console.error("Error checking AI configuration:", error);
        }
      }

      lastFinalJsonString = JSON.stringify(obj, null, 2);
      const highlighted = hljs.highlight(lastFinalJsonString, {
        language: "json",
      }).value;
      finalJsonEl.innerHTML = `<code class="hljs language-json">${highlighted}</code>`;
      applyFinalStatusesFromReport(obj);
      const ok = obj?.overall_status === "success";
      showSummary(ok, true); // Actual completion - trigger alerts
      persistFinalReport(lastFinalJsonString);

      // Update global state
      const finalStatus = ok ? "completed" : "error";
      updateGlobalProgress({
        overallStatus: finalStatus,
      });
      // Update status indicator and disable buttons
      updateRunnerStatus(finalStatus);
      if (stopBtn) stopBtn.disabled = true;
      if (pauseResumeBtn) pauseResumeBtn.disabled = true;
      if (skipBtn) skipBtn.disabled = true;
    } catch {
      finalJsonEl.textContent = String(result || "");
      showSummary(false, true); // Error parsing result - trigger alerts

      // Update global state on error
      updateGlobalProgress({ overallStatus: "error" });
      // Update status indicator and disable buttons
      updateRunnerStatus("error");
      if (stopBtn) stopBtn.disabled = true;
      if (pauseResumeBtn) pauseResumeBtn.disabled = true;
      if (skipBtn) skipBtn.disabled = true;
    }
  }

  function renderTaskList() {
    taskListEl.innerHTML = "";
    taskState.forEach((t, idx) => {
      const li = document.createElement("li");
      const isAISummary = t.type === "ai_summary";
      const isLastTask = idx === taskState.length - 1;
      li.className = `task-status ${t.status}${
        isAISummary ? " ai-summary-task" : ""
      }${isLastTask && isAISummary ? " ai-summary-separated" : ""}`;
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

    // Update global task state for persistent widget
    if (updateGlobalTaskStatus) {
      const globalStatusMap = {
        pending: "pending",
        running: "running",
        success: "success",
        failure: "error",
        skipped: "skip",
      };
      updateGlobalTaskStatus(index, globalStatusMap[status] || status);
    }

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
    rawLogLines = [];
    if (logEl) logEl.innerHTML = "";
    // Clear saved log when starting new run
    try {
      sessionStorage.removeItem("service.runnerLog");
    } catch {}
  }
  function appendLog(line) {
    appendToLiveLog(line);
    showOverlay(false);
  }
  function showOverlay(show) {
    // If showing, ensure it's visible; otherwise hide.
    logOverlay.hidden = !show;
  }
  function showSummary(ok, triggerAlerts = false) {
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

    // Only fire notifications/sounds when explicitly requested (from actual completion, not cached results)
    if (triggerAlerts) {
      console.log(
        "[showSummary] Triggering completion alerts (notifications + sound)"
      );

      // Fire a desktop notification if enabled in settings
      triggerCompletionNotification(ok).catch((e) =>
        console.warn("Failed to trigger notification:", e)
      );

      // Play completion sound if enabled in settings
      triggerCompletionSound(ok).catch((e) =>
        console.warn("Failed to play completion sound:", e)
      );
    } else {
      console.log(
        "[showSummary] Not triggering alerts (displaying cached results)"
      );
    }
  }
  // Navigate to results page with stored final report
  viewResultsBtn?.addEventListener("click", () => {
    if (lastFinalJsonString && lastFinalJsonString.length > 2) {
      persistFinalReport(lastFinalJsonString);
    }

    // Mark this run as dismissed since user is viewing results
    const state = getRunState();
    if (state && state.runId) {
      try {
        sessionStorage.setItem("taskWidget.dismissedRunId", state.runId);
      } catch {}
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
        showSummary(ok, true); // Final progress marker - trigger alerts
      }
    } catch {}
  }

  async function triggerCompletionNotification(ok) {
    // Check if _notifiedOnce is defined (may not be during state restoration)
    if (typeof _notifiedOnce !== "undefined" && _notifiedOnce) {
      console.log("[Notification] Already notified for this run, skipping");
      return;
    }
    // Load setting
    try {
      const { core } = window.__TAURI__ || {};
      const settings = await core?.invoke?.("load_app_settings");
      const enabled = settings?.reports?.notifications_enabled === true;
      console.log("[Notification] Settings check:", {
        enabled,
        settings: settings?.reports,
      });
      if (!enabled) {
        console.log("[Notification] Notifications disabled in settings");
        return;
      }
    } catch (e) {
      // If settings can't be loaded, do nothing silently
      console.warn("[Notification] Failed to load settings:", e);
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
      // Mark this run as notified
      if (typeof _notifiedOnce !== "undefined") {
        _notifiedOnce = true;
        // Save to sessionStorage to prevent duplicate notifications on page reload
        try {
          const state = getRunState();
          if (state && state.runId) {
            sessionStorage.setItem("service.notifiedRunId", state.runId);
            console.log("[Notification] Marked run as notified:", state.runId);
          }
        } catch {}
      }
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }

  async function triggerCompletionSound(ok) {
    // Check if _notifiedOnce is defined (may not be during state restoration)
    if (typeof _notifiedOnce !== "undefined" && _notifiedOnce) {
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

      // Mark this run as notified
      if (typeof _notifiedOnce !== "undefined") {
        _notifiedOnce = true;
        // Save to sessionStorage to prevent duplicate sounds on page reload
        try {
          const state = getRunState();
          if (state && state.runId) {
            sessionStorage.setItem("service.notifiedRunId", state.runId);
            console.log(
              "[CompletionSound] Marked run as notified:",
              state.runId
            );
          }
        } catch {}
      }
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
      processStatusLine(s);
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
        processStatusLine(s);
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
  // Note: _logPoll is defined at module level for cleanup access

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
        processStatusLine(line);
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

/**
 * Cleanup function to be called when leaving the runner page.
 * Removes native event listeners to prevent memory leaks.
 * Preserves global event listeners if a run is still active.
 */
export async function cleanupPage() {
  console.log("[Runner] Cleaning up page resources...");

  // Check if there's an active run - preserve listeners if so
  // Use helper function for consistency
  let runIsActive = false;
  try {
    const { getRunState } = await import("../../utils/task-state.js");
    const state = getRunState();
    runIsActive = isRunActive(state);
  } catch (e) {
    console.warn("[Runner] Failed to check run state during cleanup:", e);
    // On error, assume run is not active to avoid resource leaks
    runIsActive = false;
  }

  // Stop task status sync timer (always stop, will restart if needed on return)
  stopTaskStatusSync();

  // Only unregister global event listeners if run is NOT active
  // If run is active, keep listeners so they continue updating global state
  if (!runIsActive) {
    // Unlisten native event listeners
    if (_unlistenLine) {
      _unlistenLine();
      _unlistenLine = null;
    }

    if (_unlistenDone) {
      _unlistenDone();
      _unlistenDone = null;
    }

    // Reset the registration flag only if run is complete
    _globalEventsRegistered = false;
  } else {
    console.log("[Runner] Run is active, preserving global event listeners");
  }

  // Clear log polling timer if active (this is page-specific, always clear)
  if (_logPoll && _logPoll.timer) {
    clearInterval(_logPoll.timer);
    _logPoll.timer = null;
    _logPoll.busy = false;
    _logPoll.lastTextLen = 0;
    _logPoll.path = null;
  }
}
