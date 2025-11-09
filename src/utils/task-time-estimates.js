/**
 * Task Time Estimation Utilities
 * 
 * Provides functions for loading, calculating, and formatting task time estimates
 * based on historical execution data. Estimates use median calculation to resist outliers.
 */

// Cache for task time records (invalidated on clear or after 5 minutes)
let _recordsCache = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Mapping from handler IDs to actual task types returned by Python services.
 * Some handlers build tasks with different types than their handler ID.
 */
const HANDLER_TO_TASK_TYPE = {
  // HeavyLoad handlers all return "heavyload_stress_test"
  heavyload_stress_cpu: "heavyload_stress_test",
  heavyload_stress_memory: "heavyload_stress_test",
  heavyload_stress_gpu: "heavyload_stress_test",
  // Add more mappings as needed
};

/**
 * Get the actual task type for a handler ID, trying both the ID and known mappings.
 * @param {string} handlerId - Handler ID
 * @param {string} builtTaskType - Task type from built task (if available)
 * @returns {string[]} Array of possible task types to try
 */
function getPossibleTaskTypes(handlerId, builtTaskType) {
  const types = new Set();
  
  // Add the built task type if available (most accurate)
  if (builtTaskType) {
    types.add(builtTaskType);
  }
  
  // Add handler ID (in case it matches)
  if (handlerId) {
    types.add(handlerId);
  }
  
  // Add mapped type if exists
  if (HANDLER_TO_TASK_TYPE[handlerId]) {
    types.add(HANDLER_TO_TASK_TYPE[handlerId]);
  }
  
  return Array.from(types);
}

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
  
  // For flat structures, params are at the top level of the task object
  // For nested structures, params are in task.params
  // Merge both to handle all cases
  const flatParams = { ...task };
  delete flatParams.type;
  delete flatParams.task_type;
  delete flatParams.ui_label;
  delete flatParams.executable_path;
  delete flatParams.extra_args;
  delete flatParams.command;
  
  const nestedParams = task.params || {};
  const params = { ...flatParams, ...nestedParams };
  
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
  
  // For FurMark tasks, check for duration_seconds directly (can be at top level or in params)
  if (taskType === "furmark_stress_test") {
    if (typeof params.duration_seconds === "number") {
      relevantParams.duration_seconds = params.duration_seconds;
    }
  }
  
  // For HeavyLoad stress tests, check for duration_minutes
  if (taskType === "heavyload_stress_test" || taskType === "heavyload_stress_cpu" || 
      taskType === "heavyload_stress_memory" || taskType === "heavyload_stress_gpu") {
    if (typeof params.duration_minutes === "number") {
      relevantParams.duration_minutes = params.duration_minutes;
    }
  }
  
  // For tasks with detail_level (like smartctl_report), it might affect duration
  if (typeof params.detail_level === "string") {
    relevantParams.detail_level = params.detail_level;
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
 * Uses caching to avoid repeated backend calls.
 * 
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} Array of task time records
 */
export async function loadTaskTimeEstimates(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if still valid
  if (!forceRefresh && _recordsCache && (now - _cacheTimestamp) < CACHE_TTL) {
    return _recordsCache;
  }
  
  try {
    const { core } = window.__TAURI__ || {};
    const { invoke } = core || {};
    if (!invoke) {
      console.warn("Tauri invoke not available");
      return [];
    }
    const records = await invoke("load_task_times");
    const recordsArray = Array.isArray(records) ? records : [];
    
    // Update cache
    _recordsCache = recordsArray;
    _cacheTimestamp = now;
    
    return recordsArray;
  } catch (error) {
    console.warn("Failed to load task time estimates:", error);
    return [];
  }
}

/**
 * Clear the task time records cache.
 * Call this after saving new records or clearing all records.
 */
export function clearTaskTimeCache() {
  _recordsCache = null;
  _cacheTimestamp = 0;
}

/**
 * Get time estimate for a specific task type and parameters.
 * Calculates median from matching historical records.
 * Tries multiple task type variations to handle handler ID vs actual task type mismatches.
 * 
 * @param {string} taskType - Task type identifier (handler ID or actual task type)
 * @param {Object} taskParams - Task parameters object
 * @param {string} [builtTaskType] - Actual task type from built task (if available)
 * @returns {Promise<{estimate: number, sampleCount: number} | null>} Estimate and sample count, or null if insufficient data
 */
export async function getEstimate(taskType, taskParams, builtTaskType = null) {
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

    // Try multiple task type variations (handler ID, built type, mapped type)
    const possibleTypes = getPossibleTaskTypes(taskType, builtTaskType);
    
    let bestEstimate = null;
    let bestSampleCount = 0;
    
    for (const tryType of possibleTypes) {
      try {
        // Get estimate from Rust backend (which calculates median)
        const estimate = await invoke("get_task_time_estimate", {
          taskType: tryType,
          params: paramsJson,
        });

        if (estimate !== null && estimate !== undefined) {
          // Get sample count by loading all records and filtering
          const allRecords = await loadTaskTimeEstimates();
          const matching = allRecords.filter((r) => {
            if (r.task_type !== tryType) return false;
            // Compare normalized params
            const rParamsHash = normalizeTaskParams({ type: r.task_type, params: r.params });
            return rParamsHash === paramsHash;
          });

          const sampleCount = matching.length;
          
          // Use the estimate with the most samples
          if (sampleCount > bestSampleCount) {
            bestEstimate = Number(estimate);
            bestSampleCount = sampleCount;
          }
        }
      } catch (error) {
        // Continue trying other types
        continue;
      }
    }

    if (bestEstimate === null) {
      return null;
    }

    return {
      estimate: bestEstimate,
      sampleCount: bestSampleCount,
    };
  } catch (error) {
    console.warn("Failed to get task time estimate:", error);
    return null;
  }
}

/**
 * Format duration in seconds as human-readable string (e.g., "~2m 30s").
 * Handles very small durations (< 1s) with special formatting.
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  // Handle very small durations (< 1 second)
  if (seconds < 1) {
    if (seconds < 0.1) {
      return "< 1s";
    }
    // Show milliseconds for very fast tasks
    const ms = Math.round(seconds * 1000);
    return `~${ms}ms`;
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

    // Use the task's actual type if available (from built task)
    const builtTaskType = task.type || task.task_type;
    const taskParams = task.params || {};
    
    // Pass built task type to help with type matching
    const estimate = await getEstimate(taskType, taskParams, builtTaskType);
    
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

