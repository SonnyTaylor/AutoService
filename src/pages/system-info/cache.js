/**
 * Cache management for system information
 *
 * Uses:
 * - store2: safer sessionStorage access with automatic fallbacks
 * - zod: light runtime validation for cached payloads
 */

import store from "store2";
import { z } from "zod";

// Cache management constants and variables
const CACHE_KEY = "sysinfo.cache.v1";
const CACHE_TS_KEY = "sysinfo.cache.ts.v1";

/**
 * Accept any plain object as system info (shape evolves over time).
 * - Rejects null/array/primitive values.
 */
const SysInfoSchema = z.object({}).passthrough();
const TsSchema = z.number().finite().nonnegative();

/** @type {Record<string, unknown> | null} Cached system info object */
let sysinfoCache = null;
/** @type {number | null} Timestamp of cache in milliseconds */
let sysinfoCacheTs = null;
/** @type {Promise<unknown> | null} Background fetch promise */
let prewarmPromise = null;

/**
 * Load cached system info from sessionStorage (via store2).
 * - Resilient to storage unavailability and JSON errors.
 * - Validates shape before accepting.
 */
export function loadCache() {
  try {
    const rawInfo = store.session.get(CACHE_KEY);
    const rawTs = store.session.get(CACHE_TS_KEY);

    const parsedInfo = (() => {
      try {
        // store2 returns values as-is; ensure it's a plain object
        return rawInfo !== undefined ? SysInfoSchema.parse(rawInfo) : null;
      } catch {
        return null;
      }
    })();

    const parsedTs = (() => {
      try {
        return rawTs !== undefined ? TsSchema.parse(rawTs) : null;
      } catch {
        // Attempt to coerce numeric strings
        const n = Number(rawTs);
        return Number.isFinite(n) && n >= 0 ? n : null;
      }
    })();

    sysinfoCache = parsedInfo;
    sysinfoCacheTs = parsedTs;
  } catch (error) {
    console.warn("Failed to load system info cache:", error);
  }
}

/**
 * Save system info to cache and sessionStorage.
 * @param {Record<string, unknown>} info - System info object to cache
 * @param {number} ts - Timestamp in milliseconds
 */
export function saveCache(info, ts) {
  try {
    const validInfo = SysInfoSchema.parse(info);
    const validTs = TsSchema.parse(ts);

    sysinfoCache = validInfo;
    sysinfoCacheTs = validTs;

    store.session.set(CACHE_KEY, validInfo);
    store.session.set(CACHE_TS_KEY, validTs);
  } catch (error) {
    console.warn("Failed to save system info cache:", error);
  }
}

/**
 * Get the current cached system info.
 * @returns {Record<string, unknown> | null} Cached system info or null
 */
export function getCache() {
  return sysinfoCache;
}

/**
 * Get the cache timestamp.
 * @returns {number | null} Cache timestamp or null
 */
export function getCacheTimestamp() {
  return sysinfoCacheTs;
}

/**
 * Set the prewarm promise for background fetching.
 * @param {Promise<unknown>} promise - The prewarm promise
 */
export function setPrewarmPromise(promise) {
  prewarmPromise = promise;
}

/**
 * Get the current prewarm promise.
 * @returns {Promise<unknown> | null} Current prewarm promise or null
 */
export function getPrewarmPromise() {
  return prewarmPromise;
}
