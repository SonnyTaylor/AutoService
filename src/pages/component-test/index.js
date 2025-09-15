/**
 * Component Test Page - Main Entry Point
 *
 * This module provides comprehensive testing capabilities for various computer components:
 * - Camera: Video capture and streaming
 * - Audio: Microphone input analysis and speaker output testing
 * - Keyboard: Key detection, modifier tracking, and input modes
 * - Mouse/Trackpad: Movement tracking, button detection, and wheel monitoring
 * - Network: Connectivity testing, latency measurement, and throughput analysis
 * - Display: Color patterns, fullscreen testing, and visual calibration
 *
 * @module component-test
 */

import { initTabs } from "./tabs.js";
import { initCamera, cleanupCamera, listDevices } from "./camera.js";
import { initAudio, cleanupAudio } from "./audio.js";
import { initKeyboard, cleanupKeyboard } from "./keyboard.js";
import { initMouse, cleanupMouse } from "./mouse.js";
import { initNetwork, cleanupNetwork } from "./network.js";
import { initDisplay, cleanupDisplay } from "./display.js";

/**
 * Initialize the component test page
 * Sets up all test modules and event listeners
 *
 * @async
 * @returns {Promise<void>}
 */
export async function initPage() {
  console.log("Initializing Component Test page...");

  try {
    // Initialize tab system first
    initTabs();

    // Initialize each test module
    initCamera();
    initAudio();
    initKeyboard();
    initMouse();
    initNetwork();
    initDisplay();

    // Populate device lists (shared between camera and audio)
    await listDevices();

    // Set up page-level cleanup
    setupPageCleanup();

    console.log("Component Test page initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Component Test page:", error);
  }
}

/**
 * Set up cleanup handlers for when leaving the page
 * Ensures all resources are properly released
 */
function setupPageCleanup() {
  /**
   * Clean up all test resources
   */
  const cleanup = () => {
    console.log("Cleaning up Component Test resources...");

    // Clean up each module
    cleanupCamera();
    cleanupAudio();
    cleanupKeyboard();
    cleanupMouse();
    cleanupNetwork();
    cleanupDisplay();

    // Remove event listeners
    window.removeEventListener("beforeunload", cleanup);
  };

  // Clean up on page unload
  window.addEventListener("beforeunload", cleanup, { once: true });

  // Clean up on route change away from this page
  const onRouteChange = () => {
    const route = (location.hash || "").slice(2);
    if (route !== "component-test") {
      cleanup();
      window.removeEventListener("hashchange", onRouteChange);
    }
  };

  window.addEventListener("hashchange", onRouteChange);
}

/**
 * Component Test Page Structure:
 *
 * The page is organized into multiple modules for maintainability:
 *
 * - tabs.js: Tab navigation and panel switching
 * - camera.js: Camera capture and video streaming
 * - audio.js: Microphone analysis and speaker testing
 * - keyboard.js: Keyboard input detection and modes
 * - mouse.js: Mouse movement and button tracking
 * - network.js: Network connectivity and performance testing
 * - display.js: Display patterns and fullscreen testing
 * - utils.js: Shared utility functions
 *
 * Each module is self-contained with its own initialization and cleanup functions,
 * allowing for modular development and testing.
 */
