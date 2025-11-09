// -----------------------------------------------------------------------------
// Programs/ai-stack
// -----------------------------------------------------------------------------
// AI-powered stack generation: allows users to describe what they need and
// AI suggests a stack name, description, and relevant programs.
// -----------------------------------------------------------------------------
import { state, $, escapeHtml } from "./state.js";
import { aiClient } from "../../utils/ai-client.js";

/**
 * Prune programs down to lightweight objects for token efficiency.
 * Keep only name + description (truncate) and optional version + id for better matching.
 * @param {import('./state.js').Program[]} programs
 * @returns {Array<{id: string, name: string, version: string, description: string}>}
 */
function pruneForAI(programs) {
  return programs.map((p) => ({
    id: p.id,
    name: p.name || "",
    version: p.version || "",
    description: truncate(p.description || "", 150),
  }));
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/**
 * Call AI provider to generate stack suggestions.
 * @param {string} query - User's description of what they need
 * @param {Array<{id:string,name:string,version:string,description:string}>} pruned - Pruned program list
 * @returns {Promise<{name: string, description: string, program_ids: string[]}>}
 */
export async function generateStackSuggestion(query, pruned) {
  const systemPrompt = `You are a system administrator helping users create program stacks.
A stack is a collection of related programs that can be launched together.

Given a user's task description and a list of available programs, suggest:
1. A concise, descriptive stack name (2-5 words)
2. A brief description explaining what the stack is for (1-2 sentences)
3. A list of 3-8 relevant program IDs that would be useful for this task

Return valid JSON with this exact structure:
{
  "name": "string",
  "description": "string",
  "program_ids": ["string", "string", ...]
}

The program_ids array MUST contain valid program IDs from the provided list.
Prioritize programs that directly address the user's needs.
If no suitable programs are found, return an empty program_ids array.`;

  const userPrompt = `Available programs:
${JSON.stringify(pruned, null, 2)}

User task: ${query}

Suggest a stack name, description, and relevant program IDs for this task.`;

  const result = await aiClient.generateJSON({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    maxTokens: 2000,
    requiredFields: ["name", "description", "program_ids"],
    schema: {
      name: "string",
      description: "string",
      program_ids: ["string"],
    },
  });

  if (!result || typeof result !== "object") {
    throw new Error("Response is not a valid JSON object");
  }

  if (!result.name || typeof result.name !== "string") {
    throw new Error("Malformed AI response (missing or invalid name)");
  }

  if (!result.description || typeof result.description !== "string") {
    throw new Error("Malformed AI response (missing or invalid description)");
  }

  if (!Array.isArray(result.program_ids)) {
    throw new Error("Malformed AI response (missing program_ids array)");
  }

  return {
    name: result.name.trim(),
    description: result.description.trim(),
    program_ids: result.program_ids.filter((id) => typeof id === "string" && id.trim()),
  };
}

/**
 * Map AI-suggested program IDs back to actual program objects.
 * @param {string[]} programIds - Array of program IDs from AI
 * @returns {import('./state.js').Program[]}
 */
export function mapAIProgramIdsToPrograms(programIds) {
  const programs = [];
  for (const id of programIds) {
    const program = state.all.find((p) => p.id === id);
    if (program) {
      programs.push(program);
    }
  }
  return programs;
}

/**
 * Initialize AI Stack functionality.
 * Sets up the AI button and wires event handlers.
 */
export function initAIStack() {
  const btn = /** @type {HTMLButtonElement|null} */ ($("#s-ai-suggest-btn"));
  if (!btn) return;

  // Update button state based on AI configuration
  updateButtonState(btn);

  // React to settings changes
  window.addEventListener("ai-settings-updated", () => updateButtonState(btn));

  // Wire button click handler
  btn.addEventListener("click", handleAISuggestClick);
}

/**
 * Update AI button enablement and tooltip based on key presence.
 * @param {HTMLButtonElement} btn
 */
async function updateButtonState(btn) {
  const isConfigured = await aiClient.isConfigured();
  btn.disabled = !isConfigured;
  if (isConfigured) {
    const settings = await aiClient.getSettings();
    const providerName =
      settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);
    btn.title = `Generate stack suggestions with AI (${providerName})`;
  } else {
    btn.title = "Configure AI API key in Settings";
  }
}

/**
 * Handle AI Suggest button click.
 * Opens a dialog for user input, then generates suggestions.
 */
async function handleAISuggestClick() {
  // Check if AI is configured
  const isConfigured = await aiClient.isConfigured();
  if (!isConfigured) {
    showError("AI is not configured. Please configure an AI API key in Settings.");
    return;
  }

  // Check if there are programs available
  if (state.all.length === 0) {
    showError("No programs available. Add programs first.");
    return;
  }

  // Create input dialog
  const dialog = document.createElement("dialog");
  dialog.className = "ai-stack-input-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="ai-stack-form">
      <h3 class="ai-stack-title"><i class="ph ph-robot" aria-hidden="true"></i> AI Stack Generation</h3>
      <p class="ai-stack-description muted">Describe what you need, and AI will suggest a stack name, description, and relevant programs.</p>
      <div class="ai-stack-input-wrap">
        <textarea 
          id="ai-stack-query" 
          class="ai-stack-input" 
          rows="5" 
          placeholder="e.g., disk cleanup and optimization tools, system diagnostics suite, network troubleshooting utilities"
        ></textarea>
      </div>
      <div id="ai-stack-input-error" class="ai-stack-error" role="alert" style="display:none"></div>
      <div class="ai-stack-actions">
        <button type="button" id="ai-stack-generate" class="primary">Generate</button>
        <button type="button" id="ai-stack-cancel" class="ghost">Cancel</button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  const queryInput = /** @type {HTMLTextAreaElement} */ (
    dialog.querySelector("#ai-stack-query")
  );
  const generateBtn = /** @type {HTMLButtonElement} */ (
    dialog.querySelector("#ai-stack-generate")
  );
  const cancelBtn = /** @type {HTMLButtonElement} */ (
    dialog.querySelector("#ai-stack-cancel")
  );
  const errorDiv = /** @type {HTMLDivElement} */ (
    dialog.querySelector("#ai-stack-input-error")
  );

  // Focus input
  queryInput?.focus();

  // Cleanup function
  const cleanup = () => {
    dialog.close();
    document.body.removeChild(dialog);
  };

  // Cancel handler
  cancelBtn?.addEventListener("click", cleanup);

  // Close on backdrop click
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      cleanup();
    }
  });

  // Generate handler
  generateBtn?.addEventListener("click", async () => {
    const query = (queryInput?.value || "").trim();
    hideInputError();

    if (!query) {
      showInputError("Please describe what you need.");
      return;
    }

    if (query.length > 500) {
      showInputError("Keep description under 500 characters.");
      return;
    }

    // Disable button and show loading
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating…";

    try {
      const pruned = pruneForAI(state.all);
      const suggestion = await generateStackSuggestion(query, pruned);

      cleanup();

      // Check if editing existing stack
      const isExistingStack = state.editingStack && state.editingStack.program_ids.length > 0;

      if (isExistingStack) {
        // Show replace vs add dialog
        const mode = await showReplaceOrAddDialog();
        if (mode === null) return; // User cancelled

        applyAISuggestions(suggestion, mode);
      } else {
        // New stack - just apply suggestions
        applyAISuggestions(suggestion, "replace");
      }
    } catch (e) {
      console.error("AI stack generation error:", e);
      showInputError(e?.message || "Failed to generate stack suggestions.");
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate";
    }
  });

  function showInputError(msg) {
    if (!errorDiv) return;
    errorDiv.textContent = msg;
    errorDiv.style.display = "block";
  }

  function hideInputError() {
    if (!errorDiv) return;
    errorDiv.textContent = "";
    errorDiv.style.display = "none";
  }
}

/**
 * Show dialog asking user to replace or add to existing selection.
 * @returns {Promise<"replace" | "add" | null>}
 */
async function showReplaceOrAddDialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ai-stack-mode-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="ai-stack-form">
        <h3 class="ai-stack-title">Apply AI Suggestions</h3>
        <p class="ai-stack-description muted">This stack already has programs selected. How would you like to apply the AI suggestions?</p>
        <div class="ai-stack-mode-actions">
          <button type="button" id="ai-stack-replace" class="primary">Replace Current Selection</button>
          <button type="button" id="ai-stack-add" class="secondary">Add to Current Selection</button>
          <button type="button" id="ai-stack-mode-cancel" class="ghost">Cancel</button>
        </div>
      </form>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const replaceBtn = dialog.querySelector("#ai-stack-replace");
    const addBtn = dialog.querySelector("#ai-stack-add");
    const cancelBtn = dialog.querySelector("#ai-stack-mode-cancel");

    const cleanup = () => {
      dialog.close();
      document.body.removeChild(dialog);
    };

    replaceBtn?.addEventListener("click", () => {
      cleanup();
      resolve("replace");
    });

    addBtn?.addEventListener("click", () => {
      cleanup();
      resolve("add");
    });

    cancelBtn?.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * Apply AI suggestions to the stack editor form.
 * @param {{name: string, description: string, program_ids: string[]}} suggestion
 * @param {"replace" | "add"} mode
 */
export async function applyAISuggestions(suggestion, mode) {
  if (!state.editingStack) return;

  // Update name and description
  const nameInput = /** @type {HTMLInputElement} */ ($("#s-name"));
  const descInput = /** @type {HTMLTextAreaElement} */ ($("#s-desc"));
  if (nameInput) nameInput.value = suggestion.name;
  if (descInput) descInput.value = suggestion.description;

  // Update program selection
  if (mode === "replace") {
    state.editingStack.program_ids = [...suggestion.program_ids];
  } else {
    // Add mode - merge with existing, avoiding duplicates
    const existing = new Set(state.editingStack.program_ids);
    for (const id of suggestion.program_ids) {
      existing.add(id);
    }
    state.editingStack.program_ids = Array.from(existing);
  }

  // Update the form fields in state
  state.editingStack.name = suggestion.name;
  state.editingStack.description = suggestion.description;

  // Re-render program selector to show updated checkboxes
  const { renderProgramSelector } = await import("./stack-editor.js");
  const searchInput = /** @type {HTMLInputElement} */ ($("#s-program-search"));
  const searchQuery = searchInput?.value || "";
  renderProgramSelector(searchQuery);
  
  hideError();
}


/**
 * Show error message in the stack editor.
 * @param {string} msg
 */
function showError(msg) {
  const err = /** @type {HTMLDivElement|null} */ ($("#s-ai-error"));
  if (!err) return;
  err.textContent = msg;
  err.style.display = "block";
}

/**
 * Hide error message in the stack editor.
 */
function hideError() {
  const err = /** @type {HTMLDivElement|null} */ ($("#s-ai-error"));
  if (!err) return;
  err.textContent = "";
  err.style.display = "none";
}

