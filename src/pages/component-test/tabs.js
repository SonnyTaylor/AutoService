/**
 * Tab management functionality for component test page
 * @module tabs
 */

import { qs, qsa } from './utils.js';

/**
 * Available test panels
 * @typedef {Object} TestPanels
 * @property {HTMLElement} camera - Camera test panel
 * @property {HTMLElement} audio - Audio test panel
 * @property {HTMLElement} keyboard - Keyboard test panel
 * @property {HTMLElement} mouse - Mouse test panel
 * @property {HTMLElement} network - Network test panel
 * @property {HTMLElement} display - Display test panel
 */

/**
 * Tab management state
 * @type {Object}
 */
let tabState = {
  tabButtons: null,
  panels: null,
  currentTab: 'camera'
};

/**
 * Initialize tab system
 * Sets up event listeners and initial state
 */
export function initTabs() {
  // Get tab buttons and panels
  tabState.tabButtons = qsa('.subtabs [role=tab]');
  tabState.panels = {
    camera: qs('#panel-camera'),
    audio: qs('#panel-audio'),
    keyboard: qs('#panel-keyboard'),
    mouse: qs('#panel-mouse'),
    network: qs('#panel-network'),
    display: qs('#panel-display'),
  };

  // Set up event listeners
  tabState.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', handleTabKeydown);
  });

  // Set initial tab
  setInitialTab();
}

/**
 * Activate a specific tab
 * @param {string} tabName - Name of the tab to activate
 */
export function activateTab(tabName) {
  if (!tabState.tabButtons || !tabState.panels) return;

  // Update tab button states
  tabState.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
  });

  // Update panel visibility
  Object.entries(tabState.panels).forEach(([name, panel]) => {
    if (!panel) return;

    if (name === tabName) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  tabState.currentTab = tabName;
}

/**
 * Set the initial active tab
 * Always starts with camera tab
 */
function setInitialTab() {
  const defaultTab = 'camera';
  const availableTab = tabState.panels[defaultTab]
    ? defaultTab
    : Object.keys(tabState.panels).find((name) => tabState.panels[name]) || defaultTab;

  activateTab(availableTab);

  // Focus the active tab button
  const activeBtn = tabState.tabButtons.find((btn) => btn.dataset.tab === availableTab);
  activeBtn?.focus({ preventScroll: true });
}

/**
 * Handle keyboard navigation for tabs
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleTabKeydown(e) {
  const btn = e.target;
  const buttons = tabState.tabButtons;
  const currentIndex = buttons.indexOf(btn);

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % buttons.length;
      buttons[nextIndex].click();
      break;

    case 'ArrowLeft':
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[prevIndex].click();
      break;

    case 'Home':
      e.preventDefault();
      buttons[0].click();
      break;

    case 'End':
      e.preventDefault();
      buttons[buttons.length - 1].click();
      break;
  }
}

/**
 * Get the currently active tab name
 * @returns {string} Current tab name
 */
export function getCurrentTab() {
  return tabState.currentTab;
}

/**
 * Get all available panels
 * @returns {TestPanels} Object containing all test panels
 */
export function getPanels() {
  return tabState.panels;
}
