// -----------------------------------------------------------------------------
// Page Cache Utility
// -----------------------------------------------------------------------------
// Generic caching utility for page data (programs, reports, scripts, etc.)
// Uses sessionStorage to cache data within the current tab session.
//
// Responsibilities:
// - Cache data arrays with timestamps
// - Provide immediate cache retrieval for instant page display
// - Support background refresh to detect changes
// - Cache invalidation helpers
// -----------------------------------------------------------------------------

/**
 * @template T
 * @typedef {Object} CacheEntry
 * @property {T} data - The cached data array
 * @property {number} timestamp - When cached (ms)
 * @property {string} version - Cache version for invalidation
 */

/**
 * Get cached data from sessionStorage.
 * @template T
 * @param {string} cacheKey - Cache key (e.g., "programs.cache.v1")
 * @returns {CacheEntry<T> | null} Cached entry or null
 */
export function getCache(cacheKey) {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate structure
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.data) &&
      typeof parsed.timestamp === "number" &&
      typeof parsed.version === "string"
    ) {
      return /** @type {CacheEntry<T>} */ (parsed);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save data to cache in sessionStorage.
 * @template T
 * @param {string} cacheKey - Cache key (e.g., "programs.cache.v1")
 * @param {T} data - Data array to cache
 * @param {string} version - Cache version (e.g., "v1")
 */
export function setCache(cacheKey, data, version) {
  try {
    const entry = {
      data,
      timestamp: Date.now(),
      version,
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    console.warn(`Failed to save cache for ${cacheKey}:`, error);
  }
}

/**
 * Clear cached data from sessionStorage.
 * @param {string} cacheKey - Cache key to clear
 */
export function clearCache(cacheKey) {
  try {
    sessionStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn(`Failed to clear cache for ${cacheKey}:`, error);
  }
}

/**
 * Load data with caching support: show cached data immediately, then refresh in background.
 * @template T
 * @param {Object} options - Options object
 * @param {string} options.cacheKey - Cache key
 * @param {string} options.version - Cache version
 * @param {() => Promise<T>} options.fetchFn - Function to fetch fresh data
 * @param {(cached: T, fresh: T) => void} options.onCached - Callback when cached data is available (for immediate display)
 * @param {(fresh: T) => void} options.onFresh - Callback when fresh data arrives (for update if changed)
 * @param {boolean} [options.force=false] - When true, bypass cache and fetch fresh
 * @returns {Promise<T>} Fresh data (or cached if force=false and cache exists)
 */
export async function refreshWithCache({
  cacheKey,
  version,
  fetchFn,
  onCached,
  onFresh,
  force = false,
}) {
  // Try to get cached data first (unless forcing refresh)
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached && cached.version === version) {
      // Show cached data immediately
      if (onCached) {
        onCached(cached.data);
      }
      // Refresh in background
      fetchFn()
        .then((fresh) => {
          // Check if data changed (simple comparison by length and IDs)
          const changed = hasDataChanged(cached.data, fresh);
          if (changed) {
            // Update cache
            setCache(cacheKey, fresh, version);
            // Notify of fresh data
            if (onFresh) {
              onFresh(fresh);
            }
          }
        })
        .catch((error) => {
          console.warn(`Background refresh failed for ${cacheKey}:`, error);
        });
      // Return cached data immediately
      return cached.data;
    }
  }

  // No cache or force refresh: fetch fresh data
  const fresh = await fetchFn();
  setCache(cacheKey, fresh, version);
  if (onFresh) {
    onFresh(fresh);
  }
  return fresh;
}

/**
 * Simple heuristic to detect if data has changed.
 * Compares array length and IDs (if items have id property).
 * @template T
 * @param {T} oldData - Previous data
 * @param {T} newData - New data
 * @returns {boolean} True if data appears to have changed
 */
function hasDataChanged(oldData, newData) {
  if (!Array.isArray(oldData) || !Array.isArray(newData)) {
    return oldData !== newData;
  }
  if (oldData.length !== newData.length) {
    return true;
  }
  // If items have IDs, compare by ID
  if (oldData.length > 0 && oldData[0]?.id) {
    const oldIds = new Set(oldData.map((item) => item.id));
    const newIds = new Set(newData.map((item) => item.id));
    if (oldIds.size !== newIds.size) return true;
    for (const id of oldIds) {
      if (!newIds.has(id)) return true;
    }
  }
  // Fallback: assume changed if we can't determine
  // (This is conservative - better to refresh than miss changes)
  return false;
}

