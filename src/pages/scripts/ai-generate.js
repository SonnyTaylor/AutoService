// -----------------------------------------------------------------------------
// Scripts/ai-generate
// -----------------------------------------------------------------------------
// AI-powered script generation: allows users to describe what they need and
// AI generates a complete script with name, description, runner type, and code.
// -----------------------------------------------------------------------------
import { $ } from "./utils.js";
import { state } from "./state.js";
import { openEditor } from "./editor.js";
import { aiClient } from "../../utils/ai-client.js";

const BTN_ID = "script-ai-generate-btn";
const MODAL_ID = "ai-generate-script-modal";

/**
 * Initialize AI Generate functionality.
 * Sets up the AI button and wires event handlers.
 */
export function initAIGenerate() {
  const toolbar = /** @type {HTMLElement|null} */ (
    document.querySelector(".programs-toolbar")
  );
  if (!toolbar) return;

  // Ensure the button exists (insert before the Add button)
  let btn = /** @type {HTMLButtonElement|null} */ (
    document.getElementById(BTN_ID)
  );
  if (!btn) {
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.innerHTML = '<i class="ph ph-robot" aria-hidden="true"></i> AI Generate';
    // Insert before Add button if present, else append at end
    const addBtn = toolbar.querySelector("#script-add-btn");
    if (addBtn && addBtn.parentElement === toolbar) {
      toolbar.insertBefore(btn, addBtn);
    } else {
      toolbar.appendChild(btn);
    }
  }

  // Ensure modal exists in DOM
  let modal = /** @type {HTMLDialogElement|null} */ (
    document.getElementById(MODAL_ID)
  );
  if (!modal) {
    modal = document.createElement("dialog");
    modal.id = MODAL_ID;
    modal.className = "ai-generate-script-modal";
    modal.innerHTML = `
      <form method="dialog" class="ai-generate-script-form">
        <h3 class="ai-generate-script-title"><i class="ph ph-robot" aria-hidden="true"></i> AI Script Generation</h3>
        <p class="ai-generate-script-description muted">Describe what you need, and AI will generate a complete script with name, description, runner type, and code.</p>
        <div class="ai-generate-script-input-wrap">
          <textarea 
            id="ai-generate-script-input" 
            class="ai-generate-script-input" 
            rows="5" 
            placeholder="e.g., list all installed programs, check disk space, find large files, backup registry keys"
          ></textarea>
        </div>
        <div id="ai-generate-script-error" class="ai-generate-script-error" role="alert" style="display:none"></div>
        <div class="ai-generate-script-actions">
          <button type="button" id="ai-generate-script-run" class="primary">Generate</button>
          <button type="button" id="ai-generate-script-cancel" class="ghost">Cancel</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);
  }

  // Button behavior
  btn.onclick = () => openModal();

  // Modal behaviors
  const runBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("ai-generate-script-run")
  );
  const cancelBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("ai-generate-script-cancel")
  );
  const input = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("ai-generate-script-input")
  );
  const err = /** @type {HTMLDivElement} */ (
    document.getElementById("ai-generate-script-error")
  );

  runBtn?.addEventListener("click", async () => {
    // Validate input
    const q = (input.value || "").trim();
    hideError();
    if (!q) return showError("Enter a description of what you need.");
    if (q.length > 500) return showError("Keep description under 500 characters.");

    // Disable while generating
    runBtn.disabled = true;
    runBtn.textContent = "Generating…";
    try {
      const suggestion = await generateScriptSuggestion(q);
      modal?.close();
      applyAISuggestions(suggestion);
    } catch (e) {
      console.error(e);
      showError(e?.message || "Failed to generate script.");
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Generate";
    }
  });

  cancelBtn?.addEventListener("click", () => {
    modal?.close();
  });

  // Close on backdrop click
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.close();
    }
  });

  // Enable/disable button based on presence of API key
  updateButtonState(btn);
  // React to settings changes
  window.addEventListener("ai-settings-updated", () => updateButtonState(btn));
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
    btn.title = `Generate scripts with AI (${providerName})`;
  } else {
    btn.title = "Configure AI API key in Settings";
  }
}

/**
 * Call AI provider to generate script suggestions.
 * @param {string} query - User's description of what they need
 * @returns {Promise<{name: string, description: string, runner: string, inline: string}>}
 */
async function generateScriptSuggestion(query) {
  const systemPrompt = `You are a Windows system administrator helping users create scripts.
Given a user's task description, generate a complete Windows script with:
1. A concise, descriptive script name (2-5 words)
2. A brief description explaining what the script does (1-2 sentences)
3. The appropriate runner type: "powershell", "powershell-admin", "cmd", or "cmd-admin"
   - Use "powershell" for most tasks (default)
   - Use "powershell-admin" if the script requires administrator privileges
   - Use "cmd" or "cmd-admin" only if specifically needed for batch commands
4. The actual script code that accomplishes the task

Script Guidelines:
- Write clean, well-commented code
- Use PowerShell syntax unless CMD is specifically required
- Include error handling where appropriate
- Make scripts safe and non-destructive when possible
- For admin operations, use appropriate elevation checks

Return valid JSON with this exact structure:
{
  "name": "string",
  "description": "string",
  "runner": "powershell" | "powershell-admin" | "cmd" | "cmd-admin",
  "inline": "string (the script code)"
}`;

  const userPrompt = `User task: ${query}

Generate a complete Windows script for this task.`;

  const result = await aiClient.generateJSON({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    maxTokens: 3000,
    requiredFields: ["name", "description", "runner", "inline"],
    schema: {
      name: "string",
      description: "string",
      runner: "string",
      inline: "string",
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

  if (
    !result.runner ||
    typeof result.runner !== "string" ||
    !["powershell", "powershell-admin", "cmd", "cmd-admin"].includes(
      result.runner
    )
  ) {
    throw new Error("Malformed AI response (missing or invalid runner)");
  }

  if (!result.inline || typeof result.inline !== "string") {
    throw new Error("Malformed AI response (missing or invalid inline code)");
  }

  return {
    name: result.name.trim(),
    description: result.description.trim(),
    runner: result.runner.trim(),
    inline: result.inline.trim(),
  };
}

/**
 * Apply AI suggestions to the script editor form.
 * @param {{name: string, description: string, runner: string, inline: string}} suggestion
 */
export function applyAISuggestions(suggestion) {
  // Create a new script object with AI-generated values
  const newScript = {
    id: crypto.randomUUID(),
    name: suggestion.name,
    version: "",
    description: suggestion.description,
    runner: suggestion.runner,
    source: "inline",
    path: "",
    url: "",
    inline: suggestion.inline,
    run_count: 0,
  };

  // Update state and open editor with pre-filled values
  state.editing = newScript;
  openEditor(newScript);
}

function openModal() {
  const modal = /** @type {HTMLDialogElement|null} */ (
    document.getElementById(MODAL_ID)
  );
  if (!modal?.open) modal?.showModal();
  const input = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("ai-generate-script-input")
  );
  input?.focus();
  // Clear previous input
  if (input) input.value = "";
  hideError();
}

function showError(msg) {
  const err = /** @type {HTMLDivElement} */ (
    document.getElementById("ai-generate-script-error")
  );
  if (!err) return;
  err.textContent = msg;
  err.style.display = "block";
}

function hideError() {
  const err = /** @type {HTMLDivElement} */ (
    document.getElementById("ai-generate-script-error")
  );
  if (!err) return;
  err.textContent = "";
  err.style.display = "none";
}

