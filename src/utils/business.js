/**
 * Business settings utility for retrieving business/technician mode configuration.
 *
 * Usage:
 * ```javascript
 * import { getBusinessSettings, isBusinessModeEnabled } from '@/utils/business.js';
 *
 * const business = await getBusinessSettings();
 * if (business.enabled) {
 *   console.log('Business:', business.name);
 *   console.log('Logo:', business.logo);
 * }
 *
 * // Or use the helper
 * if (await isBusinessModeEnabled()) {
 *   // Show business branding
 * }
 * ```
 */

const { invoke } = window.__TAURI__.core;

/** Cache key for business settings */
const CACHE_KEY = "business.settings.cache.v1";
const CACHE_DURATION = 60000; // 1 minute

/**
 * @typedef {Object} BusinessSettings
 * @property {boolean} enabled - Whether technician/business mode is enabled.
 * @property {string} name - Business name (empty string if not set).
 * @property {string} logo - Business logo URL or file path (empty string if not set).
 */

/**
 * Get cached business settings if still valid.
 * @returns {BusinessSettings | null}
 */
function getCachedSettings() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data = JSON.parse(cached);
    const age = Date.now() - data.timestamp;

    if (age < CACHE_DURATION) {
      return data.settings;
    }

    // Expired cache
    sessionStorage.removeItem(CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Cache business settings for the current session.
 * @param {BusinessSettings} settings
 */
function cacheSettings(settings) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        settings,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Silently fail if sessionStorage is unavailable
  }
}

/**
 * Get business settings from app settings.
 * Returns normalized business settings with caching.
 *
 * @param {boolean} [force=false] - When true, bypass cache and refresh.
 * @returns {Promise<BusinessSettings>}
 */
export async function getBusinessSettings(force = false) {
  // Try cache first
  if (!force) {
    const cached = getCachedSettings();
    if (cached) return cached;
  }

  try {
    const settings = await invoke("load_app_settings");
    const business = settings.business || {};

    const normalized = {
      enabled: business.technician_mode === true,
      name: String(business.name || "").trim(),
      logo: String(business.logo || "").trim(),
    };

    cacheSettings(normalized);
    return normalized;
  } catch (err) {
    console.error("Failed to load business settings:", err);
    return {
      enabled: false,
      name: "",
      logo: "",
    };
  }
}

/**
 * Check if business/technician mode is enabled.
 * Convenience helper that only checks the enabled flag.
 *
 * @param {boolean} [force=false] - When true, bypass cache.
 * @returns {Promise<boolean>}
 */
export async function isBusinessModeEnabled(force = false) {
  const settings = await getBusinessSettings(force);
  return settings.enabled;
}

/**
 * Clear the business settings cache.
 * Useful after updating settings to force a refresh.
 */
export function clearBusinessCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Silently fail
  }
}
