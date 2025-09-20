/**
 * UI utilities for system information display
 */

import { formatTimeShort } from "./formatters.js";

/**
 * Simple DOM query selector with optional root element.
 * @param {string} selector - CSS selector
 * @param {Element} root - Root element to search in (defaults to document)
 * @returns {Element|null} Found element or null
 */
export function $(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Creates HTML for a collapsible section.
 * @param {string} title - Section title
 * @param {string} contentHtml - HTML content for the section body
 * @returns {string} Complete HTML string for the collapsible section
 */
export function makeCollapsible(title, contentHtml) {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="collapsible" data-id="${id}">
      <div class="collapsible-header" role="button" tabindex="0" aria-expanded="true">
        <span class="chevron" aria-hidden="true" style="display:inline-block; width:1.2em;">▾</span>
        <span class="title">${title}</span>
      </div>
      <div class="collapsible-body">
        ${contentHtml}
      </div>
    </div>
  `;
}

/**
 * Initializes collapsible functionality for all headers in a container.
 * @param {Element} container - Container element containing collapsible sections
 */
export function initCollapsibles(container) {
  const headers = container.querySelectorAll(".collapsible-header");
  headers.forEach((header) => {
    const onToggle = () => {
      const body = header.nextElementSibling;
      const chevron = header.querySelector(".chevron");
      const expanded = header.getAttribute("aria-expanded") === "true";
      header.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (body) body.style.display = expanded ? "none" : "";
      if (chevron) chevron.textContent = expanded ? "▸" : "▾";
    };
    header.addEventListener("click", onToggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    });
  });
}

/**
 * Updates the "last refreshed" label in the UI.
 * @param {Element} container - Container element to search for the label
 * @param {number} ms - Timestamp in milliseconds
 */
export function setLastRefreshedLabel(container, ms) {
  const el = container.querySelector("#sysinfo-last-refreshed");
  if (!el) return;
  if (!ms) {
    el.textContent = "";
    return;
  }
  el.textContent = `Updated ${formatTimeShort(ms)}`;
}

/**
 * Sets up the toggle all functionality for collapsible sections.
 * @param {Element} section - The section containing collapsible headers
 */
export function setupToggleAll(section) {
  const toggleAllBtn = section.querySelector("#sysinfo-toggle-all-btn");
  const headers = Array.from(section.querySelectorAll(".collapsible-header"));

  const updateToggleAllLabel = () => {
    const allExpanded =
      headers.length &&
      headers.every((h) => h.getAttribute("aria-expanded") === "true");
    if (toggleAllBtn)
      toggleAllBtn.textContent = allExpanded ? "Collapse all" : "Expand all";
  };

  updateToggleAllLabel();

  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      const allExpanded =
        headers.length &&
        headers.every((h) => h.getAttribute("aria-expanded") === "true");
      const target = !allExpanded;
      headers.forEach((header) => {
        header.setAttribute("aria-expanded", target ? "true" : "false");
        const body = header.nextElementSibling;
        const chevron = header.querySelector(".chevron");
        if (body) body.style.display = target ? "" : "none";
        if (chevron) chevron.textContent = target ? "▾" : "▸";
      });
      updateToggleAllLabel();
    });

    // Keep toggle label in sync when individual sections are toggled
    section.addEventListener("click", (e) => {
      if (e.target.closest(".collapsible-header"))
        setTimeout(updateToggleAllLabel, 0);
    });
    section.addEventListener("keydown", (e) => {
      if (
        (e.key === "Enter" || e.key === " ") &&
        e.target.closest(".collapsible-header")
      )
        setTimeout(updateToggleAllLabel, 0);
    });
  }
}
