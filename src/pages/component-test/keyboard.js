/**
 * Keyboard testing functionality
 * @module keyboard
 */

import { qs } from './utils.js';

/**
 * Keyboard test state
 * @type {Object}
 */
let keyboardState = {
  // Display elements
  kbCurrent: null,
  kbPressed: null,
  kbClear: null,
  kbCapture: null,
  kbLastKey: null,
  kbLastCode: null,
  kbLastLoc: null,
  kbLastRepeat: null,

  // Modifier key elements
  modCtrl: null,
  modShift: null,
  modAlt: null,
  modMeta: null,

  // Mode switching elements
  kbModeInternal: null,
  kbModeExternal: null,
  kbInternalWrap: null,
  kbExternalWrap: null,
  kbIframe: null,
  kbOpen: null,

  // State
  down: new Set(),
  mode: 'internal'
};

/**
 * Initialize keyboard testing functionality
 * Sets up DOM elements and event listeners
 */
export function initKeyboard() {
  // Get display elements
  keyboardState.kbCurrent = qs('#keyboard-current');
  keyboardState.kbPressed = qs('#keyboard-pressed');
  keyboardState.kbClear = qs('#keyboard-clear');
  keyboardState.kbCapture = qs('#keyboard-capture');
  keyboardState.kbLastKey = qs('#kb-last-key');
  keyboardState.kbLastCode = qs('#kb-last-code');
  keyboardState.kbLastLoc = qs('#kb-last-loc');
  keyboardState.kbLastRepeat = qs('#kb-last-repeat');

  // Get modifier key elements
  keyboardState.modCtrl = qs('#mod-ctrl');
  keyboardState.modShift = qs('#mod-shift');
  keyboardState.modAlt = qs('#mod-alt');
  keyboardState.modMeta = qs('#mod-meta');

  // Get mode switching elements
  keyboardState.kbModeInternal = qs('#kb-mode-internal');
  keyboardState.kbModeExternal = qs('#kb-mode-external');
  keyboardState.kbInternalWrap = qs('#keyboard-internal');
  keyboardState.kbExternalWrap = qs('#keyboard-external');
  keyboardState.kbIframe = qs('#kb-iframe');
  keyboardState.kbOpen = qs('#kb-open');

  // Set up event listeners
  keyboardState.kbClear?.addEventListener('click', clearPressedKeys);
  keyboardState.kbModeInternal?.addEventListener('change', () => setKeyboardMode('internal'));
  keyboardState.kbModeExternal?.addEventListener('change', () => setKeyboardMode('external'));

  // Set up global keyboard listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Initialize mode
  initKeyboardMode();
}

/**
 * Handle keydown events
 * @param {KeyboardEvent} e - Keydown event
 */
function handleKeyDown(e) {
  if (!keyboardState.kbCapture?.checked) return;

  keyboardState.down.add(e.code);

  // Update current key display
  if (keyboardState.kbCurrent) {
    keyboardState.kbCurrent.textContent =
      `${e.key} (${e.code})${e.repeat ? ' [repeat]' : ''}`;
  }

  // Update individual key displays
  if (keyboardState.kbLastKey) keyboardState.kbLastKey.textContent = String(e.key);
  if (keyboardState.kbLastCode) keyboardState.kbLastCode.textContent = String(e.code);

  if (keyboardState.kbLastLoc) {
    const locMap = { 0: 'Standard', 1: 'Left', 2: 'Right', 3: 'Numpad' };
    keyboardState.kbLastLoc.textContent = locMap[e.location] || String(e.location);
  }

  if (keyboardState.kbLastRepeat) {
    keyboardState.kbLastRepeat.textContent = e.repeat ? 'Yes' : 'No';
  }

  // Update modifier key visuals
  updateModifierVisuals(e);

  // Render pressed keys
  renderPressedKeys();

  // Prevent space from scrolling
  if (e.code === 'Space') {
    e.preventDefault();
  }
}

/**
 * Handle keyup events
 * @param {KeyboardEvent} e - Keyup event
 */
function handleKeyUp(e) {
  if (!keyboardState.kbCapture?.checked) return;

  keyboardState.down.delete(e.code);

  // Update modifier key visuals
  updateModifierVisuals(e);

  // Render pressed keys
  renderPressedKeys();
}

/**
 * Update modifier key visual states
 * @param {KeyboardEvent} e - Keyboard event with modifier state
 */
function updateModifierVisuals(e) {
  if (keyboardState.modCtrl) {
    keyboardState.modCtrl.classList.toggle('active', e.ctrlKey);
  }
  if (keyboardState.modShift) {
    keyboardState.modShift.classList.toggle('active', e.shiftKey);
  }
  if (keyboardState.modAlt) {
    keyboardState.modAlt.classList.toggle('active', e.altKey);
  }
  if (keyboardState.modMeta) {
    keyboardState.modMeta.classList.toggle('active', e.metaKey);
  }
}

/**
 * Render currently pressed keys
 */
function renderPressedKeys() {
  if (!keyboardState.kbPressed) return;

  keyboardState.kbPressed.innerHTML = '';

  keyboardState.down.forEach((keyCode) => {
    const keyElement = document.createElement('span');
    keyElement.className = 'key';
    keyElement.textContent = keyCode;
    keyboardState.kbPressed.appendChild(keyElement);
  });
}

/**
 * Clear all pressed keys and reset displays
 */
function clearPressedKeys() {
  keyboardState.down.clear();
  renderPressedKeys();

  if (keyboardState.kbCurrent) {
    keyboardState.kbCurrent.textContent = '';
  }
}

/**
 * Set keyboard testing mode
 * @param {string} mode - 'internal' or 'external'
 */
function setKeyboardMode(mode) {
  keyboardState.mode = mode;
  const isInternal = mode === 'internal';

  // Update UI visibility
  if (keyboardState.kbInternalWrap) {
    keyboardState.kbInternalWrap.hidden = !isInternal;
  }
  if (keyboardState.kbExternalWrap) {
    keyboardState.kbExternalWrap.hidden = isInternal;
  }
  if (keyboardState.kbOpen) {
    keyboardState.kbOpen.style.display = isInternal ? 'none' : '';
  }

  // Update capture checkbox
  if (keyboardState.kbCapture) {
    if (isInternal) {
      keyboardState.kbCapture.disabled = false;
    } else {
      keyboardState.kbCapture.checked = false;
      keyboardState.kbCapture.disabled = true;
      // Clear internal state when switching away
      clearPressedKeys();
    }
  }

  // Save preference
  try {
    localStorage.setItem('ct.kbMode', isInternal ? 'internal' : 'external');
  } catch (error) {
    // Ignore localStorage errors
  }
}

/**
 * Initialize keyboard mode from saved preference
 */
function initKeyboardMode() {
  let mode = 'internal';
  try {
    mode = localStorage.getItem('ct.kbMode') || mode;
  } catch (error) {
    // Ignore localStorage errors
  }

  // Update radio buttons
  if (keyboardState.kbModeInternal && keyboardState.kbModeExternal) {
    keyboardState.kbModeInternal.checked = mode === 'internal';
    keyboardState.kbModeExternal.checked = mode === 'external';
  }

  setKeyboardMode(mode);
}

/**
 * Clean up keyboard resources
 * Should be called when leaving the page
 */
export function cleanupKeyboard() {
  // Clear pressed keys
  keyboardState.down.clear();

  // Remove event listeners
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);

  // Clean up iframe if it exists
  if (keyboardState.kbIframe) {
    keyboardState.kbIframe.src = 'about:blank';
  }
}
