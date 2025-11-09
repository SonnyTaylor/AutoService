/**
 * Global Task State Manager
 *
 * Centralized reactive state management for service runs.
 * Maintains single source-of-truth for current run state, persists to sessionStorage,
 * and provides pub-sub event system for UI components to subscribe to changes.
 */

import { z } from "zod";

const SESSION_KEY = "autoservice.task-state";
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Zod schemas for validation
const TaskInfoSchema = z.object({
  id: z.number(),
  type: z.string(),
  label: z.string(),
  status: z.enum(["pending", "running", "success", "error", "warning", "skip"]),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
});

const RunStateSchema = z.object({
  runId: z.string().nullable(),
  tasks: z.array(TaskInfoSchema),
  currentTaskIndex: z.number().nullable(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
  overallStatus: z.enum(["idle", "running", "completed", "error", "paused", "stopped"]),
  metadata: z.record(z.unknown()).default({}),
  lastActivityTime: z.number().optional(),
});

/**
 * @typedef {Object} TaskInfo
 * @property {number} id - Task index
 * @property {string} type - Task type identifier
 * @property {string} label - Display label
 * @property {"pending"|"running"|"success"|"error"|"warning"|"skip"} status - Current status
 * @property {number|null} startTime - Unix timestamp when task started
 * @property {number|null} endTime - Unix timestamp when task finished
 */

/**
 * @typedef {Object} RunState
 * @property {string} runId - Unique identifier for this run
 * @property {TaskInfo[]} tasks - Array of task information
 * @property {number|null} currentTaskIndex - Index of currently executing task
 * @property {number} startTime - Unix timestamp when run started
 * @property {number|null} endTime - Unix timestamp when run completed
 * @property {"idle"|"running"|"completed"|"error"|"paused"|"stopped"} overallStatus - Overall run status
 * @property {Object} metadata - Additional run metadata (title, description, etc.)
 */

let currentState = {
  runId: null,
  tasks: [],
  currentTaskIndex: null,
  startTime: null,
  endTime: null,
  overallStatus: "idle",
  metadata: {},
};

// Pub-sub subscribers
const subscribers = new Set();

// Persistence timer
let persistTimer = null;
let lastActivityTime = Date.now();

/**
 * Initialize a new run session.
 * @param {Array} taskArray - Array of task definitions
 * @param {Object} [metadata={}] - Optional metadata (title, description, etc.)
 * @returns {string} runId - Unique identifier for this run
 */
export function initRunState(taskArray, metadata = {}) {
  const runId = `run_${Date.now()}`;

  currentState = {
    runId,
    tasks: taskArray.map((task, index) => ({
      id: index,
      type: task.type || "unknown",
      label: task.ui_label || task.type || `Task ${index + 1}`,
      status: "pending",
      startTime: null,
      endTime: null,
    })),
    currentTaskIndex: null,
    startTime: Date.now(),
    endTime: null,
    overallStatus: "running",
    metadata,
  };

  lastActivityTime = Date.now();
  persistState();
  notifySubscribers();

  return runId;
}

/**
 * Update a specific task's status.
 * @param {number} taskIndex - Index of task to update
 * @param {"pending"|"running"|"success"|"error"|"warning"|"skip"} status - New status
 */
export function updateTaskStatus(taskIndex, status) {
  if (taskIndex < 0 || taskIndex >= currentState.tasks.length) {
    console.warn(`Invalid task index: ${taskIndex}`);
    return;
  }

  const task = currentState.tasks[taskIndex];
  const prevStatus = task.status;
  task.status = status;

  // Update timestamps
  if (status === "running" && prevStatus === "pending") {
    task.startTime = Date.now();
    currentState.currentTaskIndex = taskIndex;
  } else if (
    ["success", "error", "warning", "skip"].includes(status) &&
    prevStatus === "running"
  ) {
    task.endTime = Date.now();
  }

  lastActivityTime = Date.now();
  persistState();
  notifySubscribers();
}

/**
 * Update overall progress metrics.
 * @param {Object} metrics - Progress metrics
 * @param {number} [metrics.currentTaskIndex] - Current task index
 * @param {"idle"|"running"|"completed"|"error"|"paused"|"stopped"} [metrics.overallStatus] - Overall status
 */
export function updateProgress(metrics) {
  if (metrics.currentTaskIndex !== undefined) {
    currentState.currentTaskIndex = metrics.currentTaskIndex;
  }

  if (metrics.overallStatus !== undefined) {
    currentState.overallStatus = metrics.overallStatus;

    if (["completed", "error", "stopped", "paused"].includes(metrics.overallStatus)) {
      currentState.endTime = Date.now();
    }
  }

  lastActivityTime = Date.now();
  persistState();
  notifySubscribers();
}

/**
 * Get current state snapshot.
 * @returns {RunState} Current state
 */
export function getRunState() {
  return { ...currentState };
}

/**
 * Check if there's an active run in progress.
 * @returns {boolean}
 */
export function isRunActive() {
  return currentState.overallStatus === "running";
}

/**
 * Subscribe to state changes.
 * @param {Function} callback - Called with new state on each change
 * @returns {Function} unsubscribe function
 */
export function subscribe(callback) {
  subscribers.add(callback);

  // Immediately call with current state
  callback(getRunState());

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Clean up current run session.
 * @param {boolean} [clearSession=true] - Whether to clear sessionStorage
 */
export function cleanup(clearSession = true) {
  currentState = {
    runId: null,
    tasks: [],
    currentTaskIndex: null,
    startTime: null,
    endTime: null,
    overallStatus: "idle",
    metadata: {},
  };

  if (clearSession) {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn("Failed to clear task state from sessionStorage:", e);
    }
  }

  notifySubscribers();
}

/**
 * Restore state from sessionStorage if available.
 * @returns {boolean} true if state was restored
 */
export function restoreFromSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return false;

    const parsed = JSON.parse(stored);

    // Validate stored data structure with Zod
    const validationResult = RunStateSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.warn(
        "Stored task state has invalid structure, clearing:",
        validationResult.error.errors
      );
      cleanup(true);
      return false;
    }

    const validated = validationResult.data;

    // Check inactivity timeout
    const timeSinceActivity = Date.now() - (validated.lastActivityTime || 0);
    if (timeSinceActivity > INACTIVITY_TIMEOUT) {
      console.log("Stored task state expired due to inactivity");
      cleanup(true);
      return false;
    }

    // Only restore if run was actually in progress (running or paused)
    if (!["running", "paused"].includes(validated.overallStatus)) {
      return false;
    }

    currentState = {
      runId: validated.runId,
      tasks: validated.tasks,
      currentTaskIndex: validated.currentTaskIndex,
      startTime: validated.startTime,
      endTime: validated.endTime,
      overallStatus: validated.overallStatus,
      metadata: validated.metadata,
    };

    lastActivityTime = validated.lastActivityTime || Date.now();
    notifySubscribers();

    return true;
  } catch (e) {
    console.warn("Failed to restore task state from sessionStorage:", e);
    cleanup(true);
    return false;
  }
}

/**
 * Persist current state to sessionStorage.
 */
function persistState() {
  // Debounce persistence
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    try {
      const toStore = {
        ...currentState,
        lastActivityTime,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.warn("Failed to persist task state to sessionStorage:", e);
    }
  }, 500);
}

/**
 * Notify all subscribers of state change.
 */
function notifySubscribers() {
  const state = getRunState();
  subscribers.forEach((callback) => {
    try {
      callback(state);
    } catch (e) {
      console.error("Error in task state subscriber:", e);
    }
  });
}

/**
 * Get computed progress metrics.
 * @returns {Object} Progress metrics
 */
export function getProgressMetrics() {
  const total = currentState.tasks.length;
  const completed = currentState.tasks.filter((t) =>
    ["success", "error", "warning", "skip"].includes(t.status)
  ).length;
  const successful = currentState.tasks.filter(
    (t) => t.status === "success"
  ).length;
  const failed = currentState.tasks.filter((t) => t.status === "error").length;

  const elapsedMs = currentState.startTime
    ? (currentState.endTime || Date.now()) - currentState.startTime
    : 0;

  const currentTask =
    currentState.currentTaskIndex !== null
      ? currentState.tasks[currentState.currentTaskIndex]
      : null;

  return {
    total,
    completed,
    successful,
    failed,
    remaining: total - completed,
    percentComplete: total > 0 ? (completed / total) * 100 : 0,
    elapsedMs,
    currentTask,
  };
}

// Auto-restore on module load
restoreFromSession();
