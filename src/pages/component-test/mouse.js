/**
 * Mouse/Trackpad testing functionality
 * @module mouse
 */

import { qs } from './utils.js';

/**
 * Mouse test state
 * @type {Object}
 */
let mouseState = {
  // DOM elements
  mouseArea: null,
  mousePos: null,
  mouseWheel: null,
  mouseWheelBar: null,
  mouseSpeed: null,
  mouseReset: null,
  dblBtn: null,
  dblReadout: null,
  cursorDot: null,
  btnL: null,
  btnM: null,
  btnR: null,

  // State variables
  wheelAccum: 0,
  lastClick: 0,
  lastMove: null, // {x, y, t}
  speedIdleTimer: null
};

/**
 * Initialize mouse testing functionality
 * Sets up DOM elements and event listeners
 */
export function initMouse() {
  // Get DOM elements
  mouseState.mouseArea = qs('#mouse-area');
  mouseState.mousePos = qs('#mouse-pos');
  mouseState.mouseWheel = qs('#mouse-wheel');
  mouseState.mouseWheelBar = qs('#mouse-wheel-bar');
  mouseState.mouseSpeed = qs('#mouse-speed');
  mouseState.mouseReset = qs('#mouse-reset');
  mouseState.dblBtn = qs('#dblclick-test');
  mouseState.dblReadout = qs('#dblclick-time');
  mouseState.cursorDot = qs('#cursor-dot');
  mouseState.btnL = qs('#btn-left');
  mouseState.btnM = qs('#btn-middle');
  mouseState.btnR = qs('#btn-right');

  // Set up event listeners
  setupMouseEventListeners();
}

/**
 * Set up all mouse event listeners
 */
function setupMouseEventListeners() {
  // Mouse movement
  mouseState.mouseArea?.addEventListener('mousemove', handleMouseMove);

  // Mouse button events
  mouseState.mouseArea?.addEventListener('mousedown', handleMouseDown);
  mouseState.mouseArea?.addEventListener('mouseup', handleMouseUp);

  // Mouse wheel
  mouseState.mouseArea?.addEventListener('wheel', handleMouseWheel, { passive: true });

  // Double-click test button
  mouseState.dblBtn?.addEventListener('click', handleDoubleClickTest);

  // Reset button
  mouseState.mouseReset?.addEventListener('click', resetMouseTest);

  // Mouse leave (for speed display)
  mouseState.mouseArea?.addEventListener('mouseleave', handleMouseLeave);
}

/**
 * Handle mouse movement
 * @param {MouseEvent} e - Mouse move event
 */
function handleMouseMove(e) {
  const rect = mouseState.mouseArea.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);

  // Update position display
  if (mouseState.mousePos) {
    mouseState.mousePos.textContent = `${x}, ${y}`;
  }

  // Update button visuals
  updateButtonVisuals(e.buttons);

  // Update cursor dot
  if (mouseState.cursorDot) {
    mouseState.cursorDot.hidden = false;
    mouseState.cursorDot.style.left = `${x}px`;
    mouseState.cursorDot.style.top = `${y}px`;
  }

  // Calculate and display speed
  calculateMouseSpeed(x, y);
}

/**
 * Handle mouse button down
 * @param {MouseEvent} e - Mouse down event
 */
function handleMouseDown(e) {
  updateButtonVisuals(e.buttons);

  // Check for double-click
  const tNow = performance.now();
  const dt = tNow - mouseState.lastClick;
  mouseState.lastClick = tNow;

  if (dt < 400) {
    const ms = Math.round(dt);
    if (mouseState.dblReadout) {
      mouseState.dblReadout.textContent = String(ms);
    }
  }
}

/**
 * Handle mouse button up
 * @param {MouseEvent} e - Mouse up event
 */
function handleMouseUp(e) {
  updateButtonVisuals(e.buttons);
}

/**
 * Handle mouse wheel events
 * @param {WheelEvent} e - Wheel event
 */
function handleMouseWheel(e) {
  mouseState.wheelAccum += e.deltaY;

  if (mouseState.mouseWheel) {
    mouseState.mouseWheel.textContent = String(Math.round(mouseState.wheelAccum));
  }

  if (mouseState.mouseWheelBar) {
    const w = Math.max(-2000, Math.min(2000, mouseState.wheelAccum));
    const pct = Math.round((w + 2000) / 40); // 0..100 with center at 50%
    mouseState.mouseWheelBar.style.width = `${pct}%`;
  }
}

/**
 * Handle double-click test button click
 */
function handleDoubleClickTest() {
  const tNow = performance.now();
  const dt = tNow - mouseState.lastClick;
  mouseState.lastClick = tNow;

  if (dt < 400) {
    const ms = Math.round(dt);
    if (mouseState.dblReadout) {
      mouseState.dblReadout.textContent = String(ms);
    }
  }
}

/**
 * Handle mouse leaving the test area
 */
function handleMouseLeave() {
  if (mouseState.mouseSpeed) {
    mouseState.mouseSpeed.textContent = '0 px/s';
  }

  if (mouseState.speedIdleTimer) {
    clearTimeout(mouseState.speedIdleTimer);
    mouseState.speedIdleTimer = null;
  }
}

/**
 * Calculate and display mouse speed
 * @param {number} x - Current X coordinate
 * @param {number} y - Current Y coordinate
 */
function calculateMouseSpeed(x, y) {
  const tNow = performance.now();

  if (mouseState.lastMove) {
    const dx = x - mouseState.lastMove.x;
    const dy = y - mouseState.lastMove.y;
    const dt = (tNow - mouseState.lastMove.t) / 1000;

    if (dt > 0) {
      const v = Math.round(Math.hypot(dx, dy) / dt);
      if (mouseState.mouseSpeed) {
        mouseState.mouseSpeed.textContent = `${v} px/s`;
      }
    }
  }

  mouseState.lastMove = { x, y, t: tNow };

  // Reset idle timer
  if (mouseState.speedIdleTimer) {
    clearTimeout(mouseState.speedIdleTimer);
    mouseState.speedIdleTimer = null;
  }

  mouseState.speedIdleTimer = setTimeout(() => {
    if (mouseState.mouseSpeed) {
      mouseState.mouseSpeed.textContent = '0 px/s';
    }
  }, 300);
}

/**
 * Update visual state of button indicators
 * @param {number} buttonMask - Bitmask of pressed buttons
 */
function updateButtonVisuals(buttonMask) {
  const buttons = [mouseState.btnL, mouseState.btnR, mouseState.btnM];

  buttons.forEach((button, index) => {
    if (!button) return;
    button.classList.toggle('active', !!(buttonMask & (1 << index)));
  });
}

/**
 * Reset mouse test to initial state
 */
function resetMouseTest() {
  mouseState.wheelAccum = 0;

  if (mouseState.mouseWheel) {
    mouseState.mouseWheel.textContent = '0';
  }

  if (mouseState.mouseWheelBar) {
    mouseState.mouseWheelBar.style.width = '50%';
  }

  if (mouseState.mouseSpeed) {
    mouseState.mouseSpeed.textContent = '0 px/s';
  }

  mouseState.lastMove = null;

  if (mouseState.speedIdleTimer) {
    clearTimeout(mouseState.speedIdleTimer);
    mouseState.speedIdleTimer = null;
  }

  if (mouseState.cursorDot) {
    mouseState.cursorDot.hidden = true;
  }

  updateButtonVisuals(0);
}

/**
 * Clean up mouse resources
 * Should be called when leaving the page
 */
export function cleanupMouse() {
  if (mouseState.speedIdleTimer) {
    clearTimeout(mouseState.speedIdleTimer);
    mouseState.speedIdleTimer = null;
  }

  // Reset cursor dot
  if (mouseState.cursorDot) {
    mouseState.cursorDot.hidden = true;
  }
}
