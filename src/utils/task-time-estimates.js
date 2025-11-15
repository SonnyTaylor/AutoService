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
 * Check if a task's duration is purely parameter-based (not dependent on system performance or network conditions).
 * For these tasks, duration can be calculated directly from parameters without historical data.
 *
 * @param {string} taskType - Task type identifier
 * @returns {boolean} True if task duration is purely parameter-based
 */
export function isParameterBasedTask(taskType) {
  if (!taskType) return false;

  // Tasks where duration is exactly determined by parameters
  const parameterBasedTypes = [
    "iperf_test", // Duration = minutes * 60
    "furmark_stress_test", // Duration = minutes * 60 or duration_seconds
    "heavyload_stress_test", // Duration = duration_minutes * 60
    "system_restore", // Fixed duration (~45 seconds)
  ];

  return parameterBasedTypes.includes(taskType);
}

/**
 * Calculate duration directly from task parameters for parameter-based tasks.
 * Returns null if task is not parameter-based or required parameters are missing.
 *
 * @param {Object} task - Task definition object (may have params nested or flat)
 * @returns {number|null} Duration in seconds, or null if cannot be calculated
 */
export function calculateParameterBasedDuration(task) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const taskType = task.type || task.task_type || "";
  if (!isParameterBasedTask(taskType)) {
    return null;
  }

  // Extract params from both nested and flat structures
  const flatParams = { ...task };
  delete flatParams.type;
  delete flatParams.task_type;
  delete flatParams.ui_label;
  delete flatParams.executable_path;
  delete flatParams.extra_args;
  delete flatParams.command;

  const nestedParams = task.params || {};
  const params = { ...flatParams, ...nestedParams };

  // Calculate duration based on task type
  if (taskType === "iperf_test") {
    // iPerf: duration_minutes parameter
    const minutes = params.duration_minutes || params.minutes;
    if (typeof minutes === "number" && minutes > 0) {
      return minutes * 60;
    }
  } else if (taskType === "furmark_stress_test") {
    // FurMark: duration_seconds (from built task) or minutes (from params)
    if (
      typeof params.duration_seconds === "number" &&
      params.duration_seconds > 0
    ) {
      return params.duration_seconds;
    } else if (typeof params.minutes === "number" && params.minutes > 0) {
      return params.minutes * 60;
    }
  } else if (taskType === "heavyload_stress_test") {
    // HeavyLoad: duration_minutes parameter
    const durationMinutes = params.duration_minutes || params.minutes;
    if (typeof durationMinutes === "number" && durationMinutes > 0) {
      return durationMinutes * 60;
    }
  } else if (taskType === "system_restore") {
    // System Restore: fixed duration (typically 30-60 seconds)
    return 45; // Fixed estimate of 45 seconds
  }

  return null;
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
  // Merge flat params with nested params (nested takes precedence if both exist)
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
    // Handle both string and number (from input fields)
    // Also check the task object directly since built tasks have count at top level
    const countValue =
      params.count !== undefined
        ? params.count
        : task.count !== undefined
        ? task.count
        : undefined;
    if (typeof countValue === "number") {
      relevantParams.count = countValue;
    } else if (typeof countValue === "string") {
      const parsed = parseInt(countValue, 10);
      if (!isNaN(parsed)) {
        relevantParams.count = parsed;
      }
    }
    // Host doesn't significantly affect duration, so we don't include it
  }

  if (taskType === "iperf_test") {
    // Duration is the main parameter
    // Built tasks have duration_minutes at top level, but params may have minutes
    if (typeof params.duration_minutes === "number") {
      relevantParams.duration_minutes = params.duration_minutes;
    } else if (typeof params.minutes === "number") {
      relevantParams.minutes = params.minutes;
    }
    // Protocol might affect duration slightly, but not significantly
  }

  // For FurMark tasks, check for duration_seconds or minutes (minutes gets converted to seconds)
  // Normalize minutes to duration_seconds for consistency since built tasks always have duration_seconds
  if (taskType === "furmark_stress_test") {
    if (typeof params.duration_seconds === "number") {
      relevantParams.duration_seconds = params.duration_seconds;
    } else if (typeof params.minutes === "number") {
      // Convert minutes to seconds for consistent matching (FurMark build converts minutes to duration_seconds)
      relevantParams.duration_seconds = params.minutes * 60;
    }
  }

  // For HeavyLoad stress tests, check for duration_minutes
  if (
    taskType === "heavyload_stress_test" ||
    taskType === "heavyload_stress_cpu" ||
    taskType === "heavyload_stress_memory" ||
    taskType === "heavyload_stress_gpu"
  ) {
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
  if (!forceRefresh && _recordsCache && now - _cacheTimestamp < CACHE_TTL) {
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
 * For parameter-based tasks, calculates duration directly from parameters.
 * For other tasks, calculates median from matching historical records.
 * Tries multiple task type variations to handle handler ID vs actual task type mismatches.
 *
 * @param {string} taskType - Task type identifier (handler ID or actual task type)
 * @param {Object} taskParams - Task parameters object
 * @param {string} [builtTaskType] - Actual task type from built task (if available)
 * @returns {Promise<{estimate: number, sampleCount: number, variance: number, min: number, max: number, isParameterBased?: boolean, confidence?: string} | null>} Estimate with stats, or null if insufficient data
 */
export async function getEstimate(taskType, taskParams, builtTaskType = null) {
  // Check if task time estimates are enabled
  try {
    const { settingsManager } = await import("./settings-manager.js");
    const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
    if (!enabled) {
      return null;
    }
  } catch (error) {
    // If we can't check the setting, continue (fallback behavior)
    console.warn("[Task Time] Failed to check setting, continuing with estimate:", error);
  }

  if (!taskType) {
    return null;
  }

  // Use the built task type if available (most accurate)
  const actualTaskType = builtTaskType || taskType;

  // Check if this is a parameter-based task first
  if (isParameterBasedTask(actualTaskType)) {
    // For parameter-based tasks, we need to reconstruct the task structure
    // taskParams may have duration_minutes (from built task) or minutes (from params)
    // Build a task object that matches the actual built task structure
    const taskForCalculation = {
      type: actualTaskType,
      // Spread taskParams at top level (for flat structures like iPerf with duration_minutes)
      ...taskParams,
      // Also include in params for nested structures
      params: taskParams || {},
    };

    const duration = calculateParameterBasedDuration(taskForCalculation);
    if (duration !== null && duration > 0) {
      return {
        estimate: duration,
        sampleCount: 1, // Always 1 for parameter-based (not from historical data)
        variance: 0,
        min: duration,
        max: duration,
        isParameterBased: true,
        confidence: "high", // Parameter-based estimates are always accurate
      };
    }
    // If calculation failed, fall through to historical lookup (shouldn't happen normally)
  }

  // For non-parameter-based tasks, use historical estimates
  try {
    const { core } = window.__TAURI__ || {};
    const { invoke } = core || {};
    if (!invoke) {
      return null;
    }

    // Normalize params to JSON value
    // IMPORTANT: include the actual task type so task-specific params (e.g., ping_test.count) are considered
    const paramsHash = normalizeTaskParams({
      type: actualTaskType,
      params: taskParams || {},
    });
    const paramsJson = JSON.parse(paramsHash);

    // Try multiple task type variations (handler ID, built type, mapped type)
    const possibleTypes = getPossibleTaskTypes(taskType, builtTaskType);

    let bestEstimate = null;
    let bestSampleCount = 0;
    let bestVariance = 0;
    let bestMin = 0;
    let bestMax = 0;

    for (const tryType of possibleTypes) {
      try {
        // Get estimate from Rust backend (which returns estimate with sample count and variance)
        const estimateData = await invoke("get_task_time_estimate", {
          taskType: tryType,
          params: paramsJson,
        });

        // Debug logging for ping tests
        if (tryType === "ping_test") {
          const paramsStr = JSON.stringify(paramsJson);
          console.log(`[Task Time] Ping test estimate lookup:`, {
            taskType: tryType,
            paramsJson,
            paramsStr,
            estimateData,
          });
        }

        if (estimateData !== null && estimateData !== undefined) {
          // Handle both snake_case (from Rust) and camelCase (if transformed)
          const sampleCount =
            estimateData.sample_count || estimateData.sampleCount || 0;

          // Use the estimate with the most samples
          if (sampleCount > bestSampleCount) {
            bestEstimate = Number(estimateData.estimate);
            bestSampleCount = sampleCount;
            bestVariance = Number(estimateData.variance || 0);
            bestMin = Number(estimateData.min || bestEstimate);
            bestMax = Number(estimateData.max || bestEstimate);
          }
        }
      } catch (error) {
        // Continue trying other types
        continue;
      }
    }

    // Special fallback for ping_test: interpolate/extrapolate by count using historical per-ping rate
    if (bestEstimate === null && actualTaskType === "ping_test") {
      try {
        const allRecords = await loadTaskTimeEstimates();
        const pingRecords = allRecords.filter(
          (r) =>
            r.task_type === "ping_test" &&
            r?.params &&
            typeof r.params.count === "number" &&
            r.params.count > 0 &&
            typeof r.duration_seconds === "number" &&
            r.duration_seconds > 0
        );
        if (pingRecords.length > 0) {
          // Compute per-ping durations and overheads
          const perPingDurations = [];
          const overheads = [];
          for (const r of pingRecords) {
            const c = Number(r.params.count) || 0;
            const d = Number(r.duration_seconds) || 0;
            if (c > 0 && d > 0) {
              perPingDurations.push(d / c);
            }
          }
          // Median helpers
          const median = (arr) => {
            const a = [...arr].sort((x, y) => x - y);
            const n = a.length;
            if (n === 0) return 0;
            return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
          };
          const perPing = median(perPingDurations);
          // Estimate simple overhead as small constant derived from lower percentiles
          // Compute residuals with median per-ping
          for (const r of pingRecords) {
            const c = Number(r.params.count) || 0;
            const d = Number(r.duration_seconds) || 0;
            if (c > 0 && d > 0) {
              overheads.push(Math.max(0, d - perPing * c));
            }
          }
          const overhead = median(overheads);
          const requestedCount =
            Number((taskParams && taskParams.count) || 0) || 4;
          const estimatedSeconds = Math.max(
            0.01,
            perPing * requestedCount + overhead
          );
          bestEstimate = estimatedSeconds;
          bestSampleCount = pingRecords.length;
          // Rough variance approximation from per-ping variance
          const meanPerPing =
            perPingDurations.reduce((s, v) => s + v, 0) /
            perPingDurations.length;
          const varPerPing =
            perPingDurations.reduce(
              (s, v) => s + Math.pow(v - meanPerPing, 2),
              0
            ) / perPingDurations.length;
          bestVariance = varPerPing * requestedCount; // scale with count
          bestMin = Math.max(
            0.01,
            perPing * 0.9 * requestedCount + Math.max(0, overhead * 0.5)
          );
          bestMax = perPing * 1.1 * requestedCount + overhead * 1.5;
        }
      } catch (e) {
        // ignore
      }
    }

    if (bestEstimate === null) {
      return null;
    }

    const confidence = getConfidenceLevel(
      bestSampleCount,
      bestVariance,
      bestEstimate
    );

    return {
      estimate: bestEstimate,
      sampleCount: bestSampleCount,
      variance: bestVariance,
      min: bestMin,
      max: bestMax,
      isParameterBased: false,
      confidence,
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
 * Minimum sample count required for reliable estimates.
 * Historical estimates need at least 3 samples for reliability.
 */
const MIN_SAMPLE_COUNT = 3;

/**
 * Check if there are enough samples for a reliable estimate.
 *
 * @param {number} sampleCount - Number of samples
 * @returns {boolean} True if >= MIN_SAMPLE_COUNT samples exist
 */
export function hasEnoughSamples(sampleCount) {
  return typeof sampleCount === "number" && sampleCount >= MIN_SAMPLE_COUNT;
}

/**
 * Get confidence level based on sample count and variance.
 *
 * @param {number} sampleCount - Number of samples
 * @param {number} variance - Variance of the estimates
 * @param {number} estimate - The median estimate
 * @returns {string} "high" | "medium" | "low"
 */
export function getConfidenceLevel(sampleCount, variance, estimate) {
  if (sampleCount >= 10 && variance < estimate * 0.1) {
    return "high";
  }
  if (sampleCount >= 5 && variance < estimate * 0.25) {
    return "medium";
  }
  if (sampleCount >= MIN_SAMPLE_COUNT) {
    return "low";
  }
  return "very_low";
}

/**
 * Calculate total estimated time for a list of tasks.
 * Uses parameter-based duration calculation for applicable tasks, falls back to historical estimates for others.
 * Batches async calls for better performance.
 *
 * @param {Array<{type: string, params?: Object}>} tasks - Array of task objects with type and optional params
 * @returns {Promise<{totalSeconds: number, hasPartial: boolean, estimatedCount: number, totalCount: number, lowConfidenceCount: number}>}
 *   Total time in seconds, whether some tasks lack estimates, and counts
 */
export async function calculateTotalTime(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      totalSeconds: 0,
      hasPartial: false,
      estimatedCount: 0,
      totalCount: 0,
      lowConfidenceCount: 0,
    };
  }

  // Prepare all estimate requests in parallel
  const estimatePromises = tasks.map(async (task) => {
    const taskType = task.type || task.task_type || task.id;
    if (!taskType) return null;

    // Use the task's actual type if available (from built task)
    const builtTaskType = task.type || task.task_type;

    // Use normalizeTaskParams to extract params from both nested and flat structures
    // This handles tasks where params are at the top level (flat) or nested in task.params
    const normalizedParamsHash = normalizeTaskParams(task);
    let taskParams;
    try {
      taskParams = JSON.parse(normalizedParamsHash);
    } catch (e) {
      // Fallback to task.params if normalization fails
      taskParams = task.params || {};
    }

    // Pass built task type to help with type matching
    try {
      const estimate = await getEstimate(taskType, taskParams, builtTaskType);
      return { task, estimate };
    } catch (error) {
      console.warn(
        `[Task Time] Failed to get estimate for ${taskType}:`,
        error
      );
      return { task, estimate: null };
    }
  });

  // Wait for all estimates in parallel
  const results = await Promise.all(estimatePromises);

  let totalSeconds = 0;
  let estimatedCount = 0;
  let lowConfidenceCount = 0;
  const totalCount = tasks.length;

  for (const result of results) {
    if (!result || !result.estimate) continue;

    const { estimate } = result;

    // Count all estimates (even with low sample counts, they're still useful)
    // Parameter-based estimates are always included
    if (estimate && (estimate.isParameterBased || estimate.sampleCount >= 1)) {
      totalSeconds += estimate.estimate;
      estimatedCount++;

      // Track low confidence estimates (very_low or low confidence)
      if (estimate.confidence === "very_low" || estimate.confidence === "low") {
        lowConfidenceCount++;
      }
    }
  }

  return {
    totalSeconds,
    hasPartial: estimatedCount > 0 && estimatedCount < totalCount,
    estimatedCount,
    totalCount,
    lowConfidenceCount,
  };
}
