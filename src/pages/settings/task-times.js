/**
 * Task Time Estimates settings management.
 * 
 * Provides UI for viewing statistics and clearing all task time estimates.
 */

import { settingsManager } from "../../utils/settings-manager.js";

const { invoke } = window.__TAURI__.core;

/**
 * Format a timestamp as a readable date string.
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "N/A";
  try {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return "Invalid date";
  }
}

/**
 * Initialize task time estimates settings UI.
 * @param {HTMLElement} root - The settings page root element.
 */
export async function initializeTaskTimesSettings(root) {
  const statsContainer = root.querySelector("#task-times-stats");
  const clearBtn = root.querySelector("#task-times-clear-btn");
  const enabledToggle = root.querySelector("#task-times-enabled-toggle");
  const statusEl = root.querySelector("#task-times-settings-status");
  const totalEl = root.querySelector("#task-times-total");
  const uniqueEl = root.querySelector("#task-times-unique");
  const oldestEl = root.querySelector("#task-times-oldest");
  const newestEl = root.querySelector("#task-times-newest");

  if (!statsContainer || !clearBtn) {
    console.warn("Task times settings UI elements not found");
    return;
  }

  /**
   * Show status message to user.
   * @param {string} message - Message to display.
   * @param {"success" | "error"} [type="success"] - Status type.
   */
  function showStatus(message, type = "success") {
    if (!statusEl) return;
    const icon = type === "success" ? "✓" : "✕";
    statusEl.className = `settings-status ${type}`;
    statusEl.textContent = `${icon} ${message}`;
    statusEl.style.display = "inline-block";
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
      statusEl.style.display = "none";
    }, 3000);
  }

  // Load and set initial toggle state
  if (enabledToggle) {
    try {
      const enabled = await settingsManager.get("reports.task_time_estimates_enabled");
      enabledToggle.checked = enabled !== false; // Default to true if not set
    } catch (err) {
      console.error("Failed to load task time estimates setting:", err);
      enabledToggle.checked = true; // Default to enabled on error
    }

    // Handle toggle changes
    enabledToggle.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      try {
        await settingsManager.set("reports.task_time_estimates_enabled", enabled, true);
        console.log(`[Task Times] Estimates ${enabled ? "enabled" : "disabled"}`);
        
        // Show success message
        showStatus("Settings saved", "success");
        
        // Dispatch event to notify other parts of the app
        window.dispatchEvent(new CustomEvent("task-time-estimates-toggled", {
          detail: { enabled }
        }));
      } catch (err) {
        console.error("Failed to save task time estimates setting:", err);
        // Revert toggle on error
        enabledToggle.checked = !enabled;
        showStatus("Failed to save setting", "error");
      }
    });
  }

  /**
   * Load and display statistics
   */
  async function loadStats() {
    try {
      const records = await invoke("load_task_times");
      
      if (!Array.isArray(records)) {
        totalEl.textContent = "0";
        uniqueEl.textContent = "0";
        oldestEl.textContent = "N/A";
        newestEl.textContent = "N/A";
        return;
      }

      const total = records.length;
      const uniqueTypes = new Set(records.map(r => r.task_type)).size;
      
      let oldestTimestamp = null;
      let newestTimestamp = null;
      
      records.forEach(record => {
        const ts = record.timestamp;
        if (ts) {
          if (oldestTimestamp === null || ts < oldestTimestamp) {
            oldestTimestamp = ts;
          }
          if (newestTimestamp === null || ts > newestTimestamp) {
            newestTimestamp = ts;
          }
        }
      });

      totalEl.textContent = String(total);
      uniqueEl.textContent = String(uniqueTypes);
      oldestEl.textContent = formatTimestamp(oldestTimestamp);
      newestEl.textContent = formatTimestamp(newestTimestamp);
    } catch (error) {
      console.error("Failed to load task times stats:", error);
      totalEl.textContent = "Error";
      uniqueEl.textContent = "Error";
      oldestEl.textContent = "Error";
      newestEl.textContent = "Error";
    }
  }

  /**
   * Clear all task time estimates
   */
  async function clearAllEstimates() {
    if (!confirm("Are you sure you want to clear all task time estimates? This action cannot be undone.")) {
      return;
    }

    try {
      clearBtn.disabled = true;
      const span = clearBtn.querySelector("span");
      if (span) span.textContent = "Clearing...";
      
      await invoke("clear_task_times");
      
      // Reload stats to show empty state
      await loadStats();
      
      if (span) span.textContent = "Clear All Estimates";
      clearBtn.disabled = false;
      
      // Show success message
      showStatus("All task time estimates have been cleared", "success");
      
      // Clear cache and dispatch event to notify other parts of the app
      try {
        const { clearTaskTimeCache } = await import("../../utils/task-time-estimates.js");
        clearTaskTimeCache();
      } catch (e) {
        // Ignore cache clear errors
      }
      
      window.dispatchEvent(new CustomEvent("task-times-cleared"));
    } catch (error) {
      console.error("Failed to clear task times:", error);
      clearBtn.textContent = "Clear All Estimates";
      clearBtn.disabled = false;
      
      alert("Failed to clear task time estimates: " + (error.message || String(error)));
    }
  }

  // Set up event listeners
  clearBtn.addEventListener("click", clearAllEstimates);

  // Load initial stats
  await loadStats();
  
  // Reload stats when this pane becomes visible (in case data changed elsewhere)
  const pane = root.querySelector('[data-pane="task-times"]');
  if (pane) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const isVisible = pane.style.display !== 'none';
          if (isVisible) {
            loadStats();
          }
        }
      });
    });
    
    observer.observe(pane, {
      attributes: true,
      attributeFilter: ['style']
    });
  }
}

