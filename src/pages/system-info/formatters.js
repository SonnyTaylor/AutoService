import prettyBytes from "pretty-bytes";
import humanizeDuration from "humanize-duration";
import escapeHtmlLib from "escape-html";

/**
 * Formatting utilities for system information display
 */

/**
 * Formats a timestamp to short time string (HH:MM).
 * @param {number} ms - Timestamp in milliseconds
 * @returns {string} Formatted time string or empty string
 */
export function formatTimeShort(ms) {
  if (!ms) return "";
  try {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (error) {
    console.warn("Failed to format timestamp:", error);
    return "";
  }
}

/**
 * Formats bytes into human-readable units (B, KB, MB, etc.).
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string or "-" if invalid
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  return prettyBytes(bytes);
}

/**
 * Formats a ratio as a percentage.
 * @param {number} n - Numerator
 * @param {number} total - Denominator
 * @returns {string} Percentage string or "-" if invalid
 */
export function formatPct(n, total) {
  if (!total) return "-";
  return `${Math.round((n / total) * 100)}%`;
}

/**
 * Formats duration in seconds to human-readable string.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string or "-" if null
 */
export function formatDuration(seconds) {
  if (seconds == null) return "-";
  return humanizeDuration(seconds * 1000, {
    units: ["h", "m", "s"],
    round: true,
  });
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  return escapeHtmlLib(str ?? "");
}
