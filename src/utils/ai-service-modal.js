/**
 * AI Service Modal Component
 * ---------------------------------------------------------------------------
 * Modal dialog for AI-powered service selection.
 * Prompts user for problem description, shows AI suggestions, and allows confirmation.
 */

import { selectServicesWithAI } from "./ai-service-selector.js";
import { getServiceById } from "../pages/service/catalog.js";
import { GPU_PARENT_ID } from "../pages/service/handlers/presets.js";

const MODAL_ID = "ai-service-modal";

/**
 * @typedef {Object} AIServiceSelection
 * @property {string} id - Service ID
 * @property {Object<string, any>} params - Service parameters
 */

/**
 * @typedef {Object} ModalResult
 * @property {AIServiceSelection[]} services - Selected services
 * @property {string} reasoning - AI's reasoning
 * @property {"replace"|"append"} mode - Whether to replace or append to existing tasks
 */

/**
 * Open the AI service modal and return user's confirmed selections.
 * @param {Function} isToolAvailable - Function to check tool availability (serviceId) => boolean
 * @param {Function} hasExistingTasks - Function to check if there are existing tasks in queue () => boolean
 * @returns {Promise<ModalResult|null>} Selected services with mode or null if cancelled
 */
export async function openAIServiceModal(isToolAvailable, hasExistingTasks) {
  return new Promise((resolve) => {
    // Create or get existing modal
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = MODAL_ID;
      modal.className = "ai-service-modal";
      document.body.appendChild(modal);
    }

    // Reset modal content
    modal.innerHTML = `
      <form method="dialog" class="ai-service-form">
        <h3 class="ai-service-title">
          <i class="ph ph-robot" aria-hidden="true"></i> AI Service Creator
        </h3>
        <p class="ai-service-description muted">
          Describe the problem you're facing or what maintenance you need, and AI will suggest appropriate services.
        </p>
        <div class="ai-service-input-wrap">
          <textarea
            id="ai-service-input"
            class="ai-service-input"
            rows="4"
            placeholder="e.g., My computer is slow, Network connection issues, System errors, Full diagnostic check..."
          ></textarea>
        </div>
        <div id="ai-service-error" class="ai-service-error" role="alert" style="display: none;">
          <div id="ai-service-error-message"></div>
          <button type="button" id="ai-service-retry" class="ghost small" style="display: none; margin-top: 8px;">Retry</button>
        </div>
        <div id="ai-service-loading" class="ai-service-loading" style="display: none;">
          <div class="ai-service-spinner"></div>
          <span>AI is analyzing your request...</span>
        </div>
        <div id="ai-service-preview" class="ai-service-preview" style="display: none;">
          <div class="ai-service-reasoning">
            <strong>AI Reasoning:</strong>
            <p id="ai-service-reasoning-text"></p>
          </div>
          <div class="ai-service-selected">
            <strong>Selected Services:</strong>
            <ul id="ai-service-selected-list"></ul>
          </div>
        </div>
        <div class="ai-service-actions">
          <button type="button" id="ai-service-generate" class="primary">Generate</button>
          <button type="button" id="ai-service-replace" class="primary" style="display: none;">Replace Queue</button>
          <button type="button" id="ai-service-append" class="secondary" style="display: none;">Append to Queue</button>
          <button type="button" id="ai-service-confirm" class="primary" style="display: none;">Apply Services</button>
          <button type="button" id="ai-service-cancel" class="ghost">Cancel</button>
        </div>
      </form>
    `;

    // Get elements
    const input = modal.querySelector("#ai-service-input");
    const error = modal.querySelector("#ai-service-error");
    const errorMessage = modal.querySelector("#ai-service-error-message");
    const retryBtn = modal.querySelector("#ai-service-retry");
    const loading = modal.querySelector("#ai-service-loading");
    const preview = modal.querySelector("#ai-service-preview");
    const reasoningText = modal.querySelector("#ai-service-reasoning-text");
    const selectedList = modal.querySelector("#ai-service-selected-list");
    const generateBtn = modal.querySelector("#ai-service-generate");
    const replaceBtn = modal.querySelector("#ai-service-replace");
    const appendBtn = modal.querySelector("#ai-service-append");
    const confirmBtn = modal.querySelector("#ai-service-confirm");
    const cancelBtn = modal.querySelector("#ai-service-cancel");

    let currentResult = null;
    let hasExisting = false;

    // Helper functions
    const hideError = () => {
      error.style.display = "none";
      if (errorMessage) errorMessage.textContent = "";
      if (retryBtn) retryBtn.style.display = "none";
    };

    const showError = (msg, showRetry = false) => {
      error.style.display = "block";
      if (errorMessage) errorMessage.textContent = msg;
      if (retryBtn) {
        retryBtn.style.display = showRetry ? "block" : "none";
      }
    };

    const showLoading = () => {
      loading.style.display = "flex";
      preview.style.display = "none";
      generateBtn.style.display = "none";
      replaceBtn.style.display = "none";
      appendBtn.style.display = "none";
      confirmBtn.style.display = "none";
      hideError();
    };

    const hideLoading = () => {
      loading.style.display = "none";
    };

    const showPreview = (result) => {
      currentResult = result;
      hideLoading();
      preview.style.display = "block";
      generateBtn.style.display = "none";
      
      // Check if there are existing tasks
      hasExisting = hasExistingTasks ? hasExistingTasks() : false;
      
      if (hasExisting) {
        // Show Replace and Append buttons
        replaceBtn.style.display = "inline-block";
        appendBtn.style.display = "inline-block";
        confirmBtn.style.display = "none";
      } else {
        // Show single Apply button
        replaceBtn.style.display = "none";
        appendBtn.style.display = "none";
        confirmBtn.style.display = "inline-block";
      }

      // Show reasoning
      reasoningText.textContent = result.reasoning || "Services selected based on your description.";

      // Show selected services with better formatting
      selectedList.innerHTML = "";
      result.services.forEach((service) => {
        const li = document.createElement("li");
        const serviceDef =
          service.id === GPU_PARENT_ID
            ? { label: "GPU Stress (FurMark + HeavyLoad)", group: "Stress", category: "Stress" }
            : getServiceById(service.id);

        const label = serviceDef?.label || service.id;
        const group = serviceDef?.group || serviceDef?.category || "";
        
        // Format parameters more nicely
        const params = service.params || {};
        const paramsList = [];
        if (params.minutes) paramsList.push(`${params.minutes} min`);
        if (params.seconds) paramsList.push(`${params.seconds} sec`);
        if (params.furmark !== undefined) paramsList.push(`FurMark: ${params.furmark ? "Yes" : "No"}`);
        if (params.heavyload !== undefined) paramsList.push(`HeavyLoad: ${params.heavyload ? "Yes" : "No"}`);
        if (params.furmarkMinutes) paramsList.push(`FurMark: ${params.furmarkMinutes} min`);
        if (params.heavyloadMinutes) paramsList.push(`HeavyLoad: ${params.heavyloadMinutes} min`);
        if (params.host) paramsList.push(`Host: ${params.host}`);
        if (params.count) paramsList.push(`Count: ${params.count}`);
        
        const paramsStr = paramsList.length > 0 ? paramsList.join(" • ") : "";

        li.innerHTML = `
          <div class="ai-service-item-header">
            <span class="ai-service-item-name">${label}</span>
            <span class="ai-service-item-badge">${group}</span>
          </div>
          ${paramsStr ? `<span class="ai-service-item-params">${paramsStr}</span>` : ""}
        `;
        selectedList.appendChild(li);
      });
    };

    // Generate function (reusable for button and retry)
    const generateServices = async () => {
      const userInput = (input.value || "").trim();
      if (!userInput) {
        showError("Please describe the problem or what you need.");
        input.focus();
        return;
      }

      showLoading();
      hideError();

      try {
        const result = await selectServicesWithAI(userInput, isToolAvailable);
        showPreview(result);
      } catch (err) {
        hideLoading();
        generateBtn.style.display = "inline-block";
        const errorMsg =
          err.message ||
          "Failed to generate service suggestions. Please try again.";
        showError(errorMsg, true); // Show retry button
        console.error("AI service selection error:", err);
      }
    };

    // Generate button handler
    generateBtn.addEventListener("click", generateServices);

    // Retry button handler
    retryBtn?.addEventListener("click", generateServices);

    // Enter key to generate (when input is focused)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateServices();
      }
    });

    // Cleanup function (closes modal without resolving)
    const cleanup = () => {
      if (modal.open) {
        modal.close();
      }
      // Ensure modal is removed from DOM to prevent it from staying visible
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    };

    // Apply result with mode
    const applyResult = (mode) => {
      if (currentResult) {
        console.log(`[AI Service Modal] Applying services with mode "${mode}":`, currentResult);
        cleanup();
        resolve({
          ...currentResult,
          mode,
        });
      } else {
        console.warn("[AI Service Modal] No result to apply");
        cleanup();
        resolve(null);
      }
    };

    // Replace button handler
    replaceBtn.addEventListener("click", () => {
      applyResult("replace");
    });

    // Append button handler
    appendBtn.addEventListener("click", () => {
      applyResult("append");
    });

    // Confirm button handler (when no existing tasks)
    confirmBtn.addEventListener("click", () => {
      applyResult("replace"); // Treat as replace when queue is empty
    });

    // Cancel button handler
    cancelBtn.addEventListener("click", () => {
      console.log("[AI Service Modal] User cancelled");
      cleanup();
      resolve(null);
    });

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        console.log("[AI Service Modal] User closed via backdrop");
        cleanup();
        resolve(null);
      }
    });

    // Prevent scroll propagation to background when scrolling inside modal
    modal.addEventListener("wheel", (e) => {
      // Stop propagation for all wheel events inside the modal
      e.stopPropagation();
    }, { passive: true });

    // Prevent touch scroll propagation
    modal.addEventListener("touchmove", (e) => {
      // Stop propagation for all touch events inside the modal
      e.stopPropagation();
    }, { passive: true });

    // Close on Escape key
    modal.addEventListener("cancel", () => {
      console.log("[AI Service Modal] User closed via Escape");
      cleanup();
      resolve(null);
    });

    // Show modal and focus input
    modal.showModal();
    input.focus();
  });
}

