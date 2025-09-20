/**
 * Utility functions for component testing
 * @module utils
 */

/**
 * Query selector utility - shorthand for document.querySelector
 * @param {string} selector - CSS selector
 * @param {Element} [root=document] - Root element to search in
 * @returns {Element|null} Found element or null
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Query selector all utility - shorthand for Array.from(document.querySelectorAll)
 * @param {string} selector - CSS selector
 * @param {Element} [root=document] - Root element to search in
 * @returns {Element[]} Array of found elements
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} [immediate=false] - Call immediately on first invocation
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

/**
 * Throttle function to limit function calls to once per interval
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Format number with specified precision
 * @param {number} num - Number to format
 * @param {number} [precision=1] - Decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(num, precision = 1) {
  return Number.isFinite(num) ? num.toFixed(precision) : '—';
}

/**
 * Clamp a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if browser supports a specific API
 * @param {string} apiName - Name of the API to check
 * @returns {boolean} Whether the API is supported
 */
export function supportsAPI(apiName) {
  switch (apiName) {
    case 'getUserMedia':
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    case 'webAudio':
      return !!(window.AudioContext || window.webkitAudioContext);
    case 'fullscreen':
      return !!(document.documentElement.requestFullscreen ||
                document.documentElement.webkitRequestFullscreen ||
                document.documentElement.msRequestFullscreen);
    case 'webSocket':
      return typeof WebSocket !== 'undefined';
    default:
      return false;
  }
}
