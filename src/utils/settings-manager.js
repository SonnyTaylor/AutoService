/**
 * Centralized Settings Manager
 *
 * Provides a unified interface for managing application settings with:
 * - Type-safe schema validation via Zod
 * - Automatic caching with configurable TTL
 * - Event-driven updates (pub-sub)
 * - Debounced writes to prevent excessive I/O
 * - Rollback on save failures
 * - Batch operations
 *
 * Usage:
 * ```javascript
 * import { settingsManager } from '@/utils/settings-manager.js';
 *
 * // Read settings
 * const business = await settingsManager.get('business');
 *
 * // Write settings (auto-saves with debouncing)
 * await settingsManager.set('business.name', 'Acme Repairs');
 *
 * // Subscribe to changes
 * settingsManager.on('business.name', (newValue) => {
 *   console.log('Business name changed:', newValue);
 * });
 *
 * // Batch updates (single save operation)
 * await settingsManager.batch((draft) => {
 *   draft.business.name = 'New Name';
 *   draft.business.phone = '555-1234';
 * });
 * ```
 */

import { z } from "zod";

const { invoke } = window.__TAURI__.core;

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Business/Technician settings schema
 */
const BusinessSchema = z.object({
  technician_mode: z.boolean().default(false),
  name: z.string().default(""),
  logo: z.string().default(""),
  address: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  website: z.string().or(z.literal("")).default(""),
  tfn: z.string().default(""),
  abn: z.string().default(""),
  technician_names: z.array(z.string()).default([]),
});

/**
 * Reports settings schema
 */
const ReportsSchema = z.object({
  auto_save: z.boolean().default(false),
  notifications_enabled: z.boolean().default(false),
  sound_enabled: z.boolean().default(false),
  sound_volume: z.number().min(0).max(100).default(80),
  sound_id: z.string().default("classic-beep"),
  sound_repeat: z.number().min(1).max(10).default(1),
  ai_summary_enabled: z.boolean().default(false),
  task_time_estimates_enabled: z.boolean().default(true),
});

/**
 * Network sharing settings schema
 */
const NetworkSharingSchema = z.object({
  enabled: z.boolean().default(false),
  unc_path: z.string().default(""),
  save_mode: z.enum(["local", "network", "both"]).default("both"),
});

/**
 * Network settings schema (iperf, ping)
 */
const NetworkSchema = z.object({
  iperf_server: z.string().or(z.literal("")).default(""),
  ping_host: z.string().default("8.8.8.8"),
});

/**
 * AI/API settings schema
 */
const AISchema = z.object({
  provider: z
    .enum([
      "openai",
      "anthropic",
      "azure",
      "google",
      "groq",
      "ollama",
      "xai",
      "mistral",
      "deepseek",
      "cerebras",
    ])
    .default("openai"),
  model: z.string().default("gpt-4o-mini"),
  api_key: z.string().default(""), // Current active API key
  base_url: z.string().optional().default(""),
  // Provider-specific API keys (preserves keys when switching providers)
  provider_keys: z
    .object({
      openai: z.string().default(""),
      anthropic: z.string().default(""),
      azure: z.string().default(""),
      google: z.string().default(""),
      groq: z.string().default(""),
      ollama: z.string().default(""),
      xai: z.string().default(""),
      mistral: z.string().default(""),
      deepseek: z.string().default(""),
      cerebras: z.string().default(""),
    })
    .default({}),
  // Provider-specific base URLs
  provider_base_urls: z
    .object({
      openai: z.string().default(""),
      anthropic: z.string().default(""),
      azure: z.string().default(""),
      google: z.string().default(""),
      groq: z.string().default(""),
      ollama: z.string().default("http://localhost:11434"),
      xai: z.string().default(""),
      mistral: z.string().default(""),
      deepseek: z.string().default(""),
      cerebras: z.string().default(""),
    })
    .default({}),
  // Legacy field for backward compatibility
  openai_api_key: z.string().default(""),
});

/**
 * Sentry settings schema
 */
const SentrySchema = z.object({
  environment: z
    .enum(["development", "staging", "production"])
    .default("production"),
  send_default_pii: z.boolean().default(true),
  traces_sample_rate: z.number().min(0).max(1).default(1.0),
  send_system_info: z.boolean().default(true),
});

/**
 * Technician link schema
 */
const TechnicianLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

/**
 * Root application settings schema
 */
const AppSettingsSchema = z.object({
  business: BusinessSchema.default({}),
  reports: ReportsSchema.default({}),
  network_sharing: NetworkSharingSchema.default({}),
  network: NetworkSchema.default({}),
  ai: AISchema.default({}),
  sentry: SentrySchema.default({}),
  sentry_enabled: z.boolean().default(true),
  technician_links: z.array(TechnicianLinkSchema).default([]),
});

// ============================================================================
// SETTINGS MANAGER CLASS
// ============================================================================

class SettingsManager {
  constructor() {
    /** @type {z.infer<typeof AppSettingsSchema> | null} */
    this._cache = null;
    this._cacheTimestamp = 0;
    this._cacheDuration = 60000; // 1 minute
    this._listeners = new Map(); // Map<string, Set<Function>>
    this._saveDebounceTimer = null;
    this._saveDebounceDelay = 500; // 500ms debounce for rapid changes
    this._pendingSave = false;
    this._rollbackState = null;
  }

  /**
   * Load settings from backend, with caching.
   * @param {boolean} force - Force reload, bypassing cache
   * @returns {Promise<z.infer<typeof AppSettingsSchema>>}
   */
  async load(force = false) {
    const now = Date.now();

    // Return cached data if valid
    if (
      !force &&
      this._cache &&
      now - this._cacheTimestamp < this._cacheDuration
    ) {
      return this._cache;
    }

    try {
      const raw = await invoke("load_app_settings");

      // Validate and apply defaults via Zod schema
      const validated = AppSettingsSchema.parse(raw);

      // Update cache
      this._cache = validated;
      this._cacheTimestamp = now;

      return validated;
    } catch (err) {
      console.error("Failed to load settings:", err);

      // Return defaults on error
      const defaults = AppSettingsSchema.parse({});
      this._cache = defaults;
      this._cacheTimestamp = now;

      return defaults;
    }
  }

  /**
   * Save settings to backend with debouncing.
   * @param {z.infer<typeof AppSettingsSchema>} settings - Settings to save
   * @param {boolean} immediate - Skip debouncing and save immediately
   * @returns {Promise<void>}
   */
  async save(settings, immediate = false) {
    // Store rollback state before save
    this._rollbackState = structuredClone(this._cache);

    // Update cache optimistically
    this._cache = settings;
    this._cacheTimestamp = Date.now();

    // Debounced save
    if (!immediate) {
      if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
      }

      return new Promise((resolve, reject) => {
        this._saveDebounceTimer = setTimeout(async () => {
          try {
            await this._performSave(settings);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, this._saveDebounceDelay);
      });
    }

    // Immediate save
    return this._performSave(settings);
  }

  /**
   * Internal save operation
   * @private
   */
  async _performSave(settings) {
    try {
      this._pendingSave = true;

      // Validate before saving
      const validated = AppSettingsSchema.parse(settings);

      await invoke("save_app_settings", { data: validated });

      // Update cache with validated data
      this._cache = validated;
      this._cacheTimestamp = Date.now();
      this._rollbackState = null;
    } catch (err) {
      console.error("Failed to save settings:", err);

      // Rollback on error
      if (this._rollbackState) {
        this._cache = this._rollbackState;
        this._rollbackState = null;
      }

      throw err;
    } finally {
      this._pendingSave = false;
    }
  }

  /**
   * Get a setting value by path (dot notation).
   * @param {string} path - Setting path (e.g., 'business.name', 'reports.auto_save')
   * @returns {Promise<any>}
   */
  async get(path) {
    const settings = await this.load();
    return this._getByPath(settings, path);
  }

  /**
   * Set a setting value by path (dot notation).
   * @param {string} path - Setting path
   * @param {any} value - Value to set
   * @param {boolean} immediate - Skip debouncing
   * @returns {Promise<void>}
   */
  async set(path, value, immediate = false) {
    // Wait for any pending debounced save before starting new one
    // This prevents race conditions where rapid successive calls could
    // result in settings being saved out of order
    if (this._pendingSave && !immediate) {
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this._pendingSave) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });
    }

    const settings = await this.load();
    const updated = structuredClone(settings);

    this._setByPath(updated, path, value);

    await this.save(updated, immediate);

    // Notify listeners
    this._notifyListeners(path, value);
  }

  /**
   * Batch update multiple settings in a single save operation.
   * @param {(draft: z.infer<typeof AppSettingsSchema>) => void} updater - Function to modify settings
   * @returns {Promise<void>}
   */
  async batch(updater) {
    const settings = await this.load();
    const draft = structuredClone(settings);

    // Apply updates
    updater(draft);

    // Save immediately (batch operations should not be debounced)
    await this.save(draft, true);

    // Notify all listeners (we don't know what changed)
    this._notifyAllListeners(draft);
  }

  /**
   * Subscribe to changes on a specific setting path.
   * @param {string} path - Setting path to watch
   * @param {Function} callback - Callback function (receives new value)
   * @returns {() => void} Unsubscribe function
   */
  on(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }

    this._listeners.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(path);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this._listeners.delete(path);
        }
      }
    };
  }

  /**
   * Remove all listeners for a specific path.
   * @param {string} path - Setting path
   */
  off(path) {
    this._listeners.delete(path);
  }

  /**
   * Clear the cache, forcing next read to load from backend.
   */
  clearCache() {
    this._cache = null;
    this._cacheTimestamp = 0;
  }

  /**
   * Get a nested property by dot notation path.
   * @private
   */
  _getByPath(obj, path) {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Set a nested property by dot notation path.
   * @private
   */
  _setByPath(obj, path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Notify listeners of a specific path change.
   * @private
   */
  _notifyListeners(path, value) {
    // Notify exact path listeners
    const listeners = this._listeners.get(path);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(value);
        } catch (err) {
          console.error(`Error in settings listener for ${path}:`, err);
        }
      });
    }

    // Notify parent path listeners (e.g., 'business' when 'business.name' changes)
    const parts = path.split(".");
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join(".");
      const parentListeners = this._listeners.get(parentPath);

      if (parentListeners) {
        const parentValue = this._getByPath(this._cache, parentPath);
        parentListeners.forEach((callback) => {
          try {
            callback(parentValue);
          } catch (err) {
            console.error(`Error in settings listener for ${parentPath}:`, err);
          }
        });
      }
    }
  }

  /**
   * Notify all listeners (used in batch operations).
   * @private
   */
  _notifyAllListeners(settings) {
    this._listeners.forEach((listeners, path) => {
      const value = this._getByPath(settings, path);
      listeners.forEach((callback) => {
        try {
          callback(value);
        } catch (err) {
          console.error(`Error in settings listener for ${path}:`, err);
        }
      });
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE & EXPORTS
// ============================================================================

/**
 * Global settings manager instance
 */
export const settingsManager = new SettingsManager();

/**
 * Export schemas for external validation if needed
 */
export const schemas = {
  AppSettings: AppSettingsSchema,
  Business: BusinessSchema,
  Reports: ReportsSchema,
  NetworkSharing: NetworkSharingSchema,
  Network: NetworkSchema,
  AI: AISchema,
  Sentry: SentrySchema,
  TechnicianLink: TechnicianLinkSchema,
};

/**
 * Type exports for JSDoc usage
 * @typedef {z.infer<typeof AppSettingsSchema>} AppSettings
 * @typedef {z.infer<typeof BusinessSchema>} BusinessSettings
 * @typedef {z.infer<typeof ReportsSchema>} ReportsSettings
 * @typedef {z.infer<typeof NetworkSharingSchema>} NetworkSharingSettings
 * @typedef {z.infer<typeof NetworkSchema>} NetworkSettings
 * @typedef {z.infer<typeof AISchema>} AISettings
 * @typedef {z.infer<typeof SentrySchema>} SentrySettings
 * @typedef {z.infer<typeof TechnicianLinkSchema>} TechnicianLink
 */
