/**
 * Technician links management for the settings page.
 */

import { escapeHtml } from "./utils.js";
import { settingsManager } from "../../utils/settings-manager.js";

/**
 * Manages technician links functionality.
 * @param {HTMLElement} root - The root element of the settings page.
 */
export async function initializeTechnicianLinks(root) {
  let appSettings = {};

  /**
   * Loads app settings from the backend.
   */
  async function loadSettings() {
    appSettings = await settingsManager.load();
    if (!appSettings.technician_links) appSettings.technician_links = [];
  }

  /**
   * Saves app settings to the backend.
   */
  async function saveSettings() {
    await settingsManager.batch((draft) => {
      draft.technician_links = appSettings.technician_links;
    });
  }

  /**
   * Renders the list of technician links in the UI.
   */
  function renderTechnicianLinks() {
    const listElement = root.querySelector("#tech-links-list");
    if (!listElement) return;

    const links = appSettings.technician_links;
    if (!links.length) {
      listElement.innerHTML = '<div class="muted">No links added.</div>';
      return;
    }

    listElement.innerHTML = links
      .map(
        (link) =>
          `<div class="row" data-id="${link.id}">
            <div class="main">
              <div class="name">${escapeHtml(link.title || link.url)}</div>
              <div class="muted" style="font-size:11px;">${escapeHtml(
                link.url
              )}</div>
            </div>
            <div class="meta" style="display:flex;gap:6px;">
              <button data-action="edit" class="ghost" title="Edit" style="min-width:42px;">Edit</button>
              <button data-action="remove" class="danger" title="Remove" style="min-width:42px;">✕</button>
            </div>
          </div>`
      )
      .join("");

    // Attach event listeners for remove buttons
    listElement
      .querySelectorAll('button[data-action="remove"]')
      .forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const linkId = button.closest(".row").getAttribute("data-id");
          appSettings.technician_links = appSettings.technician_links.filter(
            (link) => link.id !== linkId
          );
          await saveSettings();
          dispatchEvent(new Event("technician-links-updated"));
          renderTechnicianLinks();
        });
      });

    // Setup edit dialog
    const editDialog = root.querySelector("#tech-link-editor");
    const editForm = root.querySelector("#tech-link-edit-form");
    const titleInput = root.querySelector("#t-edit-title");
    const urlInput = root.querySelector("#t-edit-url");
    const cancelButton = root.querySelector("#t-edit-cancel");
    let editingLinkId = null;

    cancelButton?.addEventListener("click", () => editDialog?.close());

    editForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!editingLinkId) return;

      const link = appSettings.technician_links.find(
        (link) => link.id === editingLinkId
      );
      if (!link) return;

      link.title = titleInput.value.trim();
      link.url = urlInput.value.trim();

      await saveSettings();
      editDialog.close();
      dispatchEvent(new Event("technician-links-updated"));
      renderTechnicianLinks();
    });

    // Attach event listeners for edit buttons
    listElement
      .querySelectorAll('button[data-action="edit"]')
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const linkId = button.closest(".row")?.getAttribute("data-id");
          const link = appSettings.technician_links.find(
            (link) => link.id === linkId
          );
          if (!link) return;

          editingLinkId = linkId;
          titleInput.value = link.title || "";
          urlInput.value = link.url || "";
          editDialog.showModal();
          titleInput.focus();
        });
      });
  }

  await loadSettings();
  renderTechnicianLinks();

  // Handle new link form submission
  const addForm = root.querySelector("#tech-link-form");
  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const title = (formData.get("title") || "").toString().trim();
    const url = (formData.get("url") || "").toString().trim();

    if (!title || !url) return;

    appSettings.technician_links.push({
      id: crypto.randomUUID(),
      title,
      url,
    });

    await saveSettings();
    addForm.reset();
    renderTechnicianLinks();
    dispatchEvent(new Event("technician-links-updated"));
  });
}