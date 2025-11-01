/**
 * Business settings utility for retrieving business/technician mode configuration.
 *
 * This module now uses the centralized settings manager for improved caching,
 * validation, and consistency.
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

import { settingsManager } from "./settings-manager.js";

/**
 * @typedef {Object} BusinessSettings
 * @property {boolean} enabled - Whether technician/business mode is enabled.
 * @property {string} name - Business name (empty string if not set).
 * @property {string} logo - Business logo URL or file path (empty string if not set).
 * @property {string} address - Business address (empty string if not set).
 * @property {string} phone - Business phone number (empty string if not set).
 * @property {string} email - Business email address (empty string if not set).
 * @property {string} website - Business website (empty string if not set).
 * @property {string} tfn - Tax File Number (empty string if not set).
 * @property {string} abn - Australian Business Number (empty string if not set).
 * @property {string[]} technician_names - Array of saved technician names (empty array if not set).
 */

/**
 * Get business settings from app settings.
 * Returns normalized business settings with caching via settings manager.
 *
 * @param {boolean} [force=false] - When true, bypass cache and refresh.
 * @returns {Promise<BusinessSettings>}
 */
export async function getBusinessSettings(force = false) {
  try {
    const business = await settingsManager.get("business");

    // Normalize for backwards compatibility
    const normalized = {
      enabled: business.technician_mode === true,
      name: String(business.name || "").trim(),
      logo: String(business.logo || "").trim(),
      address: String(business.address || "").trim(),
      phone: String(business.phone || "").trim(),
      email: String(business.email || "").trim(),
      website: String(business.website || "").trim(),
      tfn: String(business.tfn || "").trim(),
      abn: String(business.abn || "").trim(),
      technician_names: Array.isArray(business.technician_names)
        ? business.technician_names
        : [],
    };

    return normalized;
  } catch (err) {
    console.error("Failed to load business settings:", err);
    return {
      enabled: false,
      name: "",
      logo: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      tfn: "",
      abn: "",
      technician_names: [],
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
  settingsManager.clearCache();
}
