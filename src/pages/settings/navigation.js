/**
 * Pane navigation functionality for the settings page.
 */

/**
 * Initializes sidebar pane navigation.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export function initializePaneNavigation(root) {
  const navigation = root.querySelector("#settings-nav");

  /**
   * Gets all pane elements.
   * @returns {HTMLElement[]} Array of pane elements.
   */
  function getPanes() {
    return Array.from(root.querySelectorAll("[data-pane]"));
  }

  /**
   * Shows the specified pane and updates navigation buttons.
   * @param {string} paneId - The ID of the pane to show.
   */
  function showPane(paneId) {
    getPanes().forEach((pane) => {
      const isVisible = pane.getAttribute("data-pane") === paneId;
      pane.style.display = isVisible ? "" : "none";
    });

    if (navigation) {
      Array.from(navigation.querySelectorAll("button[data-target]")).forEach(
        (button) => {
          button.classList.toggle(
            "active",
            button.getAttribute("data-target") === paneId
          );
        }
      );
    }
  }

  navigation?.addEventListener("click", (event) => {
    const targetButton = event.target.closest("button[data-target]");
    if (!targetButton) return;
    showPane(targetButton.getAttribute("data-target"));
  });

  showPane("programs");
}
