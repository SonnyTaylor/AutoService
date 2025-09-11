/**
 * Cache management for system information
 */

// Cache management constants and variables
const CACHE_KEY = "sysinfo.cache.v1";
const CACHE_TS_KEY = "sysinfo.cache.ts.v1";
let sysinfoCache = null; // Cached system info object
let sysinfoCacheTs = null; // Timestamp of cache (milliseconds)
let prewarmPromise = null; // Background fetch promise

/**
 * Loads cached system info from sessionStorage.
 */
export function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const ts = Number(sessionStorage.getItem(CACHE_TS_KEY) || "");
    if (raw) {
      sysinfoCache = JSON.parse(raw);
      sysinfoCacheTs = Number.isFinite(ts) ? ts : null;
    }
  } catch (error) {
    console.warn("Failed to load system info cache:", error);
  }
}

/**
 * Saves system info to cache and sessionStorage.
 * @param {Object} info - System info object to cache
 * @param {number} ts - Timestamp in milliseconds
 */
export function saveCache(info, ts) {
  sysinfoCache = info;
  sysinfoCacheTs = ts;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(info));
    sessionStorage.setItem(CACHE_TS_KEY, String(ts));
  } catch (error) {
    console.warn("Failed to save system info cache:", error);
  }
}

/**
 * Gets the current cached system info.
 * @returns {Object|null} Cached system info or null
 */
export function getCache() {
  return sysinfoCache;
}

/**
 * Gets the cache timestamp.
 * @returns {number|null} Cache timestamp or null
 */
export function getCacheTimestamp() {
  return sysinfoCacheTs;
}

/**
 * Sets the prewarm promise for background fetching.
 * @param {Promise} promise - The prewarm promise
 */
export function setPrewarmPromise(promise) {
  prewarmPromise = promise;
}

/**
 * Gets the current prewarm promise.
 * @returns {Promise|null} Current prewarm promise or null
 */
export function getPrewarmPromise() {
  return prewarmPromise;
}
