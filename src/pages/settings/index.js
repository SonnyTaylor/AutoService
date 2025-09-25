/**
 * Main entry point for the settings page.
 * Orchestrates all settings functionality.
 */

import { renderRequiredPrograms } from "./tools.js";
import { initializePaneNavigation } from "./navigation.js";
import { initializeTechnicianLinks } from "./links-manager.js";
import { initializeNetworkSettings } from "./network.js";

/**
 * Initializes the settings page functionality.
 * This function sets up the required programs list, pane navigation, and technician links management.
 */
export async function initPage() {
  // Only run on settings page when present
  const root = document.querySelector('[data-page="settings"]');
  if (!root) return;

  // Prevent double-initialization when reloading route
  if (root.dataset.controllerInitialized) return;
  root.dataset.controllerInitialized = "1";

  await renderRequiredPrograms();
  initializePaneNavigation(root);
  await initializeTechnicianLinks(root);
  await initializeNetworkSettings(root);
}
