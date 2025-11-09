/**
 * Task Time Estimation Utilities
 * 
 * Provides functions for loading, calculating, and formatting task time estimates
 * based on historical execution data. Estimates use median calculation to resist outliers.
 */

/**
 * Normalize task parameters to create a consistent hash key for grouping.
 * Extracts relevant parameters that affect duration and creates a sorted JSON string.
 * 
 * @param {Object} task - Task definition object (may have params nested or flat)
 * @returns {string} Normalized parameter hash string
 */
export function normalizeTaskParams(task) {
  if (!task || typeof task !== "object") {
    return "{}";
  }

  // Extract relevant parameters that affect duration
  // Handle both nested (task.params) and flat (task.minutes, etc.) structures
  const relevantParams = {};
  
  // Get task type and params object - could be nested or flat
  const taskType = task.type || task.task_type || "";
  const params = task.params || task;
  
  // Common duration parameters (affect execution time)
  if (typeof params.minutes === "number") {
    relevantParams.minutes = params.minutes;
  }
  if (typeof params.seconds === "number") {
    relevantParams.seconds = params.seconds;
  }
  if (typeof params.duration_seconds === "number") {
    relevantParams.duration_seconds = params.duration_seconds;
  }
  
  // Task-specific parameters that affect duration
  if (taskType === "ping_test") {
    // Ping count affects duration (more pings = longer time)
    if (typeof params.count === "number") {
      relevantParams.count = params.count;
    }
    // Host doesn't significantly affect duration, so we don't include it
  }
  
  if (taskType === "iperf_test") {
    // Duration is the main parameter
    if (typeof params.minutes === "number") {
      relevantParams.minutes = params.minutes;
    }
    // Protocol might affect duration slightly, but not significantly
  }
  
  // For FurMark tasks, check for duration_seconds directly
  if (taskType === "furmark_stress_test" && typeof params.duration_seconds === "number") {
    relevantParams.duration_seconds = params.duration_seconds;
  }

  // For GPU parent tasks, include sub-task durations (handled separately in builder)
  if (taskType === "gpu_stress_parent" || task._gpu_config) {
    if (task.furmarkMinutes !== undefined) {
      relevantParams.furmarkMinutes = task.furmarkMinutes;
    }
    if (task.heavyloadMinutes !== undefined) {
      relevantParams.heavyloadMinutes = task.heavyloadMinutes;
    }
  }

  // Sort keys and create consistent JSON string
  const sortedKeys = Object.keys(relevantParams).sort();
  const normalized = {};
  for (const key of sortedKeys) {
    const value = relevantParams[key];
    // Only include non-null, non-undefined values
    if (value !== null && value !== undefined) {
      normalized[key] = value;
    }
  }

  return JSON.stringify(normalized);
}

/**
 * Load all task time records from the Rust backend.
 * 
 * @returns {Promise<Array>} Array of task time records
 */
export async function loadTaskTimeEstimates() {
  try {
    const { core } = window.__TAURI__ || {};
    const { invoke } = core || {};
    if (!invoke) {
      console.warn("Tauri invoke not available");
      return [];
    }
    const records = await invoke("load_task_times");
    return Array.isArray(records) ? records : [];
  } catch (error) {
    console.warn("Failed to load task time estimates:", error);
    return [];
  }
}

/**
 * Get time estimate for a specific task type and parameters.
 * Calculates median from matching historical records.
 * 
 * @param {string} taskType - Task type identifier
 * @param {Object} taskParams - Task parameters object
 * @returns {Promise<{estimate: number, sampleCount: number} | null>} Estimate and sample count, or null if insufficient data
 */
export async function getEstimate(taskType, taskParams) {
  if (!taskType) {
    return null;
  }

  try {
    const { core } = window.__TAURI__ || {};
    const { invoke } = core || {};
    if (!invoke) {
      return null;
    }

    // Normalize params to JSON value
    const paramsHash = normalizeTaskParams({ params: taskParams || {} });
    const paramsJson = JSON.parse(paramsHash);

    // Get estimate from Rust backend (which calculates median)
    const estimate = await invoke("get_task_time_estimate", {
      taskType,
      params: paramsJson,
    });

    if (estimate === null || estimate === undefined) {
      return null;
    }

    // Also get sample count by loading all records and filtering
    const allRecords = await loadTaskTimeEstimates();
    const matching = allRecords.filter(
      (r) => r.task_type === taskType && JSON.stringify(r.params) === paramsHash
    );

    return {
      estimate: Number(estimate),
      sampleCount: matching.length,
    };
  } catch (error) {
    console.warn("Failed to get task time estimate:", error);
    return null;
  }
}

/**
 * Format duration in seconds as human-readable string (e.g., "~2m 30s").
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return `~${parts.join(" ")}`;
}

/**
 * Check if there are enough samples for a reliable estimate.
 * 
 * @param {Array} records - Array of task time records
 * @returns {boolean} True if >= 1 sample exists
 */
export function hasEnoughSamples(records) {
  return Array.isArray(records) && records.length >= 1;
}

/**
 * Calculate total estimated time for a list of tasks.
 * 
 * @param {Array<{type: string, params?: Object}>} tasks - Array of task objects with type and optional params
 * @returns {Promise<{totalSeconds: number, hasPartial: boolean, estimatedCount: number, totalCount: number}>}
 *   Total time in seconds, whether some tasks lack estimates, and counts
 */
export async function calculateTotalTime(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      totalSeconds: 0,
      hasPartial: false,
      estimatedCount: 0,
      totalCount: 0,
    };
  }

  let totalSeconds = 0;
  let estimatedCount = 0;
  let totalCount = tasks.length;

  for (const task of tasks) {
    const taskType = task.type || task.task_type || task.id;
    if (!taskType) continue;

    const taskParams = task.params || {};
    const estimate = await getEstimate(taskType, taskParams);
    
    if (estimate && estimate.sampleCount >= 1) {
      totalSeconds += estimate.estimate;
      estimatedCount++;
    }
  }

  return {
    totalSeconds,
    hasPartial: estimatedCount > 0 && estimatedCount < totalCount,
    estimatedCount,
    totalCount,
  };
}

