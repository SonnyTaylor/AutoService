/**
 * Display testing functionality
 * @module display
 */

import { qs, qsa, supportsAPI } from './utils.js';

/**
 * Display test state
 * @type {Object}
 */
let displayState = {
  // DOM elements
  dispArea: null,
  dispGradient: null,
  dispChecker: null,
  dispCycle: null,
  dispFullscreen: null,

  // State
  cycleTimer: null,
  cycleColors: ['#ff0000', '#00ff00', '#0000ff', '#000000', '#ffffff'],
  currentCycleIndex: 0,
  _wasMaximizedBeforeFullscreen: false
};

/**
 * Initialize display testing functionality
 * Sets up DOM elements and event listeners
 */
export function initDisplay() {
  if (!supportsAPI('fullscreen')) {
    console.warn('Fullscreen API not supported - fullscreen test will be limited');
  }

  // Get DOM elements
  displayState.dispArea = qs('#display-area');
  displayState.dispGradient = qs('#disp-gradient');
  displayState.dispChecker = qs('#disp-checker');
  displayState.dispCycle = qs('#disp-cycle');
  displayState.dispFullscreen = qs('#disp-fullscreen');

  // Set up event listeners
  setupDisplayEventListeners();

  // Restore maximize if user exits fullscreen via Esc or other means
  document.addEventListener('fullscreenchange', onFullscreenChange);
}

/**
 * Set up all display test event listeners
 */
function setupDisplayEventListeners() {
  // Color buttons
  qsa('.disp-color').forEach((btn) => {
    btn.addEventListener('click', () => setDisplayColor(btn.dataset.color));
  });

  // Pattern buttons
  displayState.dispGradient?.addEventListener('click', () => setGradientPattern());
  displayState.dispChecker?.addEventListener('click', () => setCheckerboardPattern());

  // Cycle button
  displayState.dispCycle?.addEventListener('click', toggleColorCycle);

  // Fullscreen button
  displayState.dispFullscreen?.addEventListener('click', toggleFullscreen);
}

/**
 * Set solid color background
 * @param {string} color - CSS color value
 */
function setDisplayColor(color) {
  if (displayState.dispArea) {
    displayState.dispArea.style.background = color;
  }
}

/**
 * Set gradient pattern
 */
function setGradientPattern() {
  if (displayState.dispArea) {
    displayState.dispArea.style.background = 'linear-gradient(90deg, #000, #fff)';
  }
}

/**
 * Set checkerboard pattern
 */
function setCheckerboardPattern() {
  if (!displayState.dispArea) return;

  const size = 16;
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${size * 2}">` +
      `<rect width="100%" height="100%" fill="white"/>` +
      `<rect x="0" y="0" width="${size}" height="${size}" fill="black"/>` +
      `<rect x="${size}" y="${size}" width="${size}" height="${size}" fill="black"/>` +
    `</svg>`
  );

  displayState.dispArea.style.background = `url("data:image/svg+xml,${svg}") repeat`;
  displayState.dispArea.style.backgroundSize = `${size * 2}px ${size * 2}px`;
}

/**
 * Toggle color cycling animation
 */
function toggleColorCycle() {
  if (!displayState.dispCycle) return;

  if (displayState.cycleTimer) {
    // Stop cycling
    clearInterval(displayState.cycleTimer);
    displayState.cycleTimer = null;
    displayState.dispCycle.textContent = 'Cycle colors';
  } else {
    // Start cycling
    displayState.currentCycleIndex = 0;
    setDisplayColor(displayState.cycleColors[displayState.currentCycleIndex]);

    displayState.cycleTimer = setInterval(() => {
      displayState.currentCycleIndex = (displayState.currentCycleIndex + 1) % displayState.cycleColors.length;
      setDisplayColor(displayState.cycleColors[displayState.currentCycleIndex]);
    }, 1000);

    displayState.dispCycle.textContent = 'Stop cycling';
  }
}

/**
 * Toggle fullscreen mode
 */
async function toggleFullscreen() {
  if (!displayState.dispArea) return;

  try {
    if (!document.fullscreenElement) {
      // If running under Tauri, unmaximize first to avoid Windows taskbar black bar
      const tauriWindowApi = (window.__TAURI__ && window.__TAURI__.window) || null;
      const getCurrentWindow = tauriWindowApi && tauriWindowApi.getCurrentWindow;
      if (getCurrentWindow) {
        try {
          const appWindow = getCurrentWindow();
          const maximized = await appWindow.isMaximized();
          if (maximized) {
            // Remember original state to restore after exiting fullscreen
            displayState._wasMaximizedBeforeFullscreen = true;
            // Prefer toggleMaximize since permission is guaranteed in capabilities
            await appWindow.toggleMaximize();
            // Wait until actually unmaximized (poll up to ~500ms)
            const start = Date.now();
            while (await appWindow.isMaximized()) {
              if (Date.now() - start > 500) break;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } else {
            displayState._wasMaximizedBeforeFullscreen = false;
          }
        } catch {
          // If anything goes wrong with window calls, continue to fullscreen anyway
        }
      }
      // Small additional settle delay to ensure bounds updated before fullscreen request
      await new Promise((resolve) => setTimeout(resolve, 25));
      await displayState.dispArea.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
      // Small delay to let fullscreen exit complete
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Explicitly restore maximize state (fullscreenchange handler is backup for Escape key)
      await restoreMaximizeIfNeeded();
    }
  } catch (error) {
    console.error('Fullscreen toggle failed:', error);
  }
}

/**
 * Restore maximize state if it was maximized before fullscreen
 */
async function restoreMaximizeIfNeeded() {
  const tauriWindowApi = (window.__TAURI__ && window.__TAURI__.window) || null;
  const getCurrentWindow = tauriWindowApi && tauriWindowApi.getCurrentWindow;
  if (!displayState._wasMaximizedBeforeFullscreen || !getCurrentWindow) {
    displayState._wasMaximizedBeforeFullscreen = false;
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    // Give a moment for the system to settle after exiting fullscreen
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Check current state and restore if needed
    const isCurrentlyMaximized = await appWindow.isMaximized();
    if (!isCurrentlyMaximized) {
      // Prefer toggleMaximize() since it's allowed in capabilities; fallback to maximize()
      if (typeof appWindow.toggleMaximize === 'function') {
        await appWindow.toggleMaximize();
      } else {
        try {
          await appWindow.maximize?.();
        } catch {}
      }
      
      // Verify it worked (poll briefly)
      await new Promise((resolve) => setTimeout(resolve, 50));
      const verified = await appWindow.isMaximized();
      if (!verified) {
        try {
          if (typeof appWindow.maximize === 'function') {
            await appWindow.maximize();
          } else if (typeof appWindow.toggleMaximize === 'function') {
            await appWindow.toggleMaximize();
          }
        } catch {}
      }
    }
  } catch (error) {
    console.warn('Failed to restore maximize state:', error);
  } finally {
    displayState._wasMaximizedBeforeFullscreen = false;
  }
}

/**
 * Handle fullscreen state changes to restore maximize if needed
 */
async function onFullscreenChange() {
  // Only handle fullscreen exit (not entry)
  if (document.fullscreenElement) return;
  
  // Restore maximize state when exiting fullscreen (e.g., via Escape key)
  await restoreMaximizeIfNeeded();
}

/**
 * Clean up display resources
 * Should be called when leaving the page
 */
export function cleanupDisplay() {
  // Stop color cycling
  if (displayState.cycleTimer) {
    clearInterval(displayState.cycleTimer);
    displayState.cycleTimer = null;

    if (displayState.dispCycle) {
      displayState.dispCycle.textContent = 'Cycle colors';
    }
  }

  // Exit fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen?.()
      .then(async () => {
        // fullscreenchange handler will restore maximize if needed
      })
      .catch(() => {
        // Ignore fullscreen exit errors
      });
  }

  // Reset display area
  if (displayState.dispArea) {
    displayState.dispArea.style.background = '';
  }

  // Remove event listener
  document.removeEventListener('fullscreenchange', onFullscreenChange);
}
