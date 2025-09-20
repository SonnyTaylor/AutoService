// Tool availability helpers shared across pages.
//
// Responsibilities:
// - Cache tool statuses in sessionStorage to avoid repeated backend calls
// - Provide simple helpers to check availability and resolve tool paths

const { invoke } = window.__TAURI__.core;

/** Cache key for the current session. Bump the version when shape changes. */
const CACHE_KEY = "tool.statuses.v1";

/**
 * @typedef {Object} ToolStatus
 * @property {string} key - Stable identifier (e.g., "clamav", "bleachbit").
 * @property {string} name - Human-friendly name.
 * @property {boolean} exists - Whether the tool’s executable exists on disk.
 * @property {string | null | undefined} path - Absolute path if known.
 * @property {string | null | undefined} hint - Optional filename hint.
 */

/**
 * Attempt to parse cached JSON and ensure it is an array of ToolStatus-like objects.
 * Falls back safely on any error.
 * @param {string | null} raw
 * @returns {ToolStatus[]}
 */
function parseCachedStatuses(raw) {
  if (!raw) return [];
  try {
    const val = JSON.parse(raw);
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

/**
 * Normalize statuses returned from the backend to a predictable shape.
 * This is defensive and keeps the rest of the code simple.
 * @param {any} statuses
 * @returns {ToolStatus[]}
 */
function normalizeStatuses(statuses) {
  if (!Array.isArray(statuses)) return [];
  return statuses.map((s) => ({
    key: String(s?.key ?? ""),
    name: String(s?.name ?? ""),
    exists: Boolean(s?.exists),
    path: s?.path ?? null,
    hint: s?.hint ?? null,
  }));
}

/**
 * Get tool statuses from cache or backend.
 * Uses sessionStorage to cache within the current tab session.
 *
 * @param {boolean} [force=false] - When true, bypass the cache and refresh.
 * @returns {Promise<ToolStatus[]>}
 */
export async function getToolStatuses(force = false) {
  if (!force) {
    const cached = parseCachedStatuses(sessionStorage.getItem(CACHE_KEY));
    if (cached.length) return cached;
  }
  try {
    const statuses = await invoke("get_tool_statuses");
    const normalized = normalizeStatuses(statuses || []);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
    } catch {}
    return normalized;
  } catch {
    return [];
  }
}

/**
 * Check if a tool exists by key.
 * @param {string} key - Tool key, e.g., "clamav".
 * @param {boolean} [force=false] - When true, bypass cache.
 * @returns {Promise<boolean>}
 */
export async function isToolAvailable(key, force = false) {
  const list = await getToolStatuses(force);
  const hit = list.find((t) => t.key === key);
  return !!(hit && hit.exists);
}

/**
 * Get a tool’s absolute path if known.
 * @param {string} key - Tool key, e.g., "clamav".
 * @param {boolean} [force=false] - When true, bypass cache.
 * @returns {Promise<string | null>} - Absolute path or null when unknown.
 */
export async function getToolPath(key, force = false) {
  const list = await getToolStatuses(force);
  const hit = list.find((t) => t.key === key);
  return hit?.path || null;
}
