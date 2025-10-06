/**
 * Wait for charts to settle before printing.
 * Currently a simple timeout until chart rendering provides callbacks.
 * @param {HTMLElement} root
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export function waitForChartsRendered(root, timeoutMs = 500) {
  void root; // Placeholder for future chart lifecycle integration.
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
