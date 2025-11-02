/**
 * Task Progress Widget Component
 *
 * Persistent, globally-visible widget that tracks service run progress.
 * Remains visible across all tabs and allows users to click through to the runner.
 */

import {
  subscribe,
  getRunState,
  getProgressMetrics,
  isRunActive,
} from "../utils/task-state.js";

let widgetContainer = null;
let unsubscribe = null;
let isVisible = false;
let completionTimeout = null;
let timerInterval = null;

/**
 * Initialize and mount the widget.
 * Should be called once at app boot.
 */
export function initWidget() {
  // Create widget container if it doesn't exist
  if (!widgetContainer) {
    widgetContainer = document.createElement("div");
    widgetContainer.id = "task-progress-widget";
    widgetContainer.className = "task-progress-widget hidden";
    document.body.appendChild(widgetContainer);
  }

  // Subscribe to state changes
  if (unsubscribe) {
    unsubscribe();
  }

  unsubscribe = subscribe((state) => {
    handleStateChange(state);
  });

  // Initial render based on current state
  const state = getRunState();
  handleStateChange(state);
}

/**
 * Handle state changes from the global state manager.
 * @param {Object} state - Current run state
 */
function handleStateChange(state) {
  // Check if we're on the service-report page - don't show widget there
  const currentHash = window.location.hash || "";
  const onRunnerPage = currentHash.startsWith("#/service-report");

  if (state.overallStatus === "running") {
    // Only show widget if NOT on the runner page
    if (!onRunnerPage) {
      showWidget();
      renderWidget(state);

      // Start timer to update widget every second
      if (!timerInterval) {
        timerInterval = setInterval(() => {
          const currentState = getRunState();
          if (currentState.overallStatus === "running") {
            renderWidget(currentState);
          }
        }, 1000);
      }
    } else {
      hideWidget();
      // Stop timer when on runner page
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  } else if (
    state.overallStatus === "completed" ||
    state.overallStatus === "error"
  ) {
    // Stop timer on completion
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (!onRunnerPage) {
      renderWidget(state);
      showWidget(); // Keep widget visible after completion

      // Auto-hide after 10 seconds on completion (increased from 5s)
      if (completionTimeout) {
        clearTimeout(completionTimeout);
      }
      completionTimeout = setTimeout(() => {
        hideWidget();
      }, 10000);
    } else {
      hideWidget();
    }
  } else {
    // idle state - hide widget and stop timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    hideWidget();
  }
}

/**
 * Handle hash change to show/hide widget based on current route.
 */
function handleHashChange() {
  const state = getRunState();
  handleStateChange(state);
}

// Listen for hash changes to show/hide widget appropriately
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", handleHashChange);
}

/**
 * Render the widget UI.
 * @param {Object} state - Current run state
 */
function renderWidget(state) {
  if (!widgetContainer) return;

  const metrics = getProgressMetrics();
  const { currentTask, percentComplete, elapsedMs, completed, total } = metrics;

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const statusIcon = getStatusIcon(state.overallStatus);
  const statusText = getStatusText(state.overallStatus, currentTask);

  widgetContainer.innerHTML = `
    <div class="widget-content" role="status" aria-live="polite">
      <div class="widget-header">
        <div class="widget-icon">${statusIcon}</div>
        <div class="widget-title">
          <div class="widget-status">${statusText}</div>
          <div class="widget-meta">
            ${completed}/${total} tasks · ${timeStr}
          </div>
        </div>
        ${
          state.overallStatus === "running" ||
          state.overallStatus === "completed" ||
          state.overallStatus === "error"
            ? `
          <button class="widget-close" aria-label="View results" title="Go to runner page">
            <i class="ph ph-arrow-square-out"></i>
          </button>
        `
            : ""
        }
      </div>
      <div class="widget-progress">
        <div class="widget-progress-bar" style="width: ${percentComplete}%" role="progressbar" 
             aria-valuenow="${percentComplete}" aria-valuemin="0" aria-valuemax="100"></div>
      </div>
      ${
        currentTask && state.overallStatus === "running"
          ? `
        <div class="widget-current-task">
          ${getTaskStatusIcon(currentTask.status)} ${escapeHtml(
              currentTask.label
            )}
        </div>
      `
          : ""
      }
    </div>
  `;

  // Wire up click handler
  const closeBtn = widgetContainer.querySelector(".widget-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", handleWidgetClick);
  }

  // Make entire widget clickable during active run or after completion
  if (
    state.overallStatus === "running" ||
    state.overallStatus === "completed" ||
    state.overallStatus === "error"
  ) {
    widgetContainer.style.cursor = "pointer";
    widgetContainer.addEventListener("click", handleWidgetClick);
  } else {
    widgetContainer.style.cursor = "default";
    widgetContainer.removeEventListener("click", handleWidgetClick);
  }
}

/**
 * Get status icon based on overall status.
 * @param {string} status - Overall status
 * @returns {string} Icon HTML
 */
function getStatusIcon(status) {
  switch (status) {
    case "running":
      return '<i class="ph ph-spinner spinner-icon"></i>';
    case "completed":
      return '<i class="ph ph-check-circle" style="color: var(--success-color)"></i>';
    case "error":
      return '<i class="ph ph-x-circle" style="color: var(--error-color)"></i>';
    default:
      return '<i class="ph ph-clock"></i>';
  }
}

/**
 * Get status text based on overall status and current task.
 * @param {string} status - Overall status
 * @param {Object|null} currentTask - Current task info
 * @returns {string} Status text
 */
function getStatusText(status, currentTask) {
  switch (status) {
    case "running":
      return "Running diagnostics...";
    case "completed":
      return "Run completed";
    case "error":
      return "Run completed with errors";
    default:
      return "Idle";
  }
}

/**
 * Get task status icon.
 * @param {string} status - Task status
 * @returns {string} Icon HTML
 */
function getTaskStatusIcon(status) {
  switch (status) {
    case "running":
      return '<i class="ph ph-spinner spinner-icon"></i>';
    case "success":
      return '<i class="ph ph-check" style="color: var(--success-color)"></i>';
    case "error":
      return '<i class="ph ph-x" style="color: var(--error-color)"></i>';
    case "warning":
      return '<i class="ph ph-warning" style="color: var(--warning-color)"></i>';
    case "skip":
      return '<i class="ph ph-minus" style="color: var(--muted-color)"></i>';
    default:
      return '<i class="ph ph-clock"></i>';
  }
}

/**
 * Show the widget with animation.
 */
function showWidget() {
  if (isVisible || !widgetContainer) return;

  isVisible = true;
  widgetContainer.classList.remove("hidden");

  // Force reflow for animation
  void widgetContainer.offsetWidth;

  widgetContainer.classList.add("visible");
}

/**
 * Hide the widget with animation.
 */
function hideWidget() {
  if (!isVisible || !widgetContainer) return;

  isVisible = false;
  widgetContainer.classList.remove("visible");

  // Wait for animation to complete before hiding
  setTimeout(() => {
    if (!isVisible) {
      widgetContainer.classList.add("hidden");
    }
  }, 300);
}

/**
 * Handle widget click - navigate to runner page.
 */
function handleWidgetClick(e) {
  // Don't navigate if clicking the close button
  if (e.target.closest(".widget-close")) {
    e.stopPropagation();
  }

  window.location.hash = "#/service-report";
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clean up the widget.
 */
export function destroyWidget() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (completionTimeout) {
    clearTimeout(completionTimeout);
    completionTimeout = null;
  }

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (widgetContainer) {
    widgetContainer.remove();
    widgetContainer = null;
  }

  isVisible = false;
}
