// -----------------------------------------------------------------------------
// Programs/ai-search
// -----------------------------------------------------------------------------
// AI-powered program search: adds a toolbar button, opens a modal, sends a
// pruned program list + user query to AI provider, and renders suggested results
// as standard-looking .program-row cards with working actions.
// -----------------------------------------------------------------------------
import { invoke, state, DEFAULT_LOGO, $, escapeHtml } from "./state.js";
import { openEditor } from "./editor.js";
import { settingsManager } from "../../utils/settings-manager.js";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const BTN_ID = "program-ai-search-btn";
const MODAL_ID = "ai-search-modal";
let resultsClickHandler = null;

/** Initialize AI Search: button + modal wiring */
export function initAISearch() {
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
    btn.innerHTML =
      '<i class="ph ph-open-ai-logo" aria-hidden="true"></i> AI Search';
    // Insert before Add button if present, else append at end
    const addBtn = toolbar.querySelector("#program-add-btn");
    if (addBtn && addBtn.parentElement === toolbar) {
      toolbar.insertBefore(btn, addBtn);
    } else {
      toolbar.appendChild(btn);
    }
  }
  // Always ensure the label uses a generic AI icon (handles pre-existing markup)
  if (btn)
    btn.innerHTML = '<i class="ph ph-robot" aria-hidden="true"></i> AI Search';

  // Ensure modal exists in DOM
  let modal = /** @type {HTMLDialogElement|null} */ (
    document.getElementById(MODAL_ID)
  );
  if (!modal) {
    modal = document.createElement("dialog");
    modal.id = MODAL_ID;
    modal.className = "ai-search-modal";
    modal.innerHTML = `
      <form method="dialog" class="ai-search-form">
        <h3 class="ai-search-title"><i class=\"ph ph-robot\" aria-hidden=\"true\"></i> AI Program Search</h3>
        <div class="ai-search-input-wrap">
          <textarea id="ai-search-input" class="ai-search-input" rows="3" placeholder="e.g., fan speed editor, ISO burner, edit EFI partition"></textarea>
        </div>
        <div id="ai-search-error" class="ai-search-error" role="alert" style="display:none"></div>
        <div class="ai-search-actions">
          <button type="button" id="ai-search-run" class="primary">Search</button>
          <button type="button" id="ai-search-cancel" class="ghost">Cancel</button>
        </div>
        <div id="ai-search-results" class="ai-search-results"></div>
      </form>
    `;
    document.body.appendChild(modal);
  }

  // Button behavior
  btn.onclick = () => openModal();

  // Modal behaviors
  const runBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("ai-search-run")
  );
  const cancelBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("ai-search-cancel")
  );
  const input = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("ai-search-input")
  );
  const results = /** @type {HTMLDivElement} */ (
    document.getElementById("ai-search-results")
  );
  const err = /** @type {HTMLDivElement} */ (
    document.getElementById("ai-search-error")
  );

  runBtn?.addEventListener("click", async () => {
    // Validate input
    const q = (input.value || "").trim();
    hideError();
    results.innerHTML = "";
    if (!q) return showError("Enter a short description of what you need.");
    if (q.length > 500) return showError("Keep query under 500 characters.");

    // Load AI settings from app settings
    const settings = await getAISettings();
    if (settings.error) return showError(settings.error);
    if (!settings.hasKey) {
      const providerName =
        settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);
      return showError(
        `${providerName} API key is missing. Configure it in Settings.`
      );
    }

    // Prepare inputs
    const pruned = pruneForAI(state.all);
    // Disable while searching
    runBtn.disabled = true;
    runBtn.textContent = "Searching…";
    try {
      const ai = await callAIProvider(settings, q, pruned);
      const mapped = mapAIResultsToPrograms(ai?.results || []);
      if (!mapped.length) {
        results.innerHTML = `<div class="muted">No suitable programs found for that task.</div>`;
      } else {
        renderResults(results, mapped);
      }
    } catch (e) {
      console.error(e);
      showError(e?.message || "Failed to run AI search.");
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Search";
    }
  });

  cancelBtn?.addEventListener("click", () => {
    modal?.close();
  });

  // Enable/disable button based on presence of API key
  updateButtonState(btn);
  // React to settings changes
  window.addEventListener("ai-settings-updated", () => updateButtonState(btn));

  // Wire result actions: remove old handler if it exists to prevent duplicates
  if (results) {
    if (resultsClickHandler) {
      results.removeEventListener("click", resultsClickHandler);
    }
    resultsClickHandler = async (e) => {
      const btn = /** @type {HTMLElement|null} */ (
        e.target instanceof HTMLElement
          ? e.target.closest("button[data-action]")
          : null
      );
      if (!btn) return;
      const row = /** @type {HTMLElement|null} */ (btn.closest(".program-row"));
      const id = row?.getAttribute("data-id");
      if (!id) return;
      const prog = state.all.find((p) => p.id === id);
      if (!prog) return;
      const action = btn.getAttribute("data-action");
      if (action === "launch") {
        /** @type {HTMLButtonElement} */ (btn).disabled = true;
        try {
          await invoke("launch_program", { program: prog });
          // notify main list to refresh counts
          window.dispatchEvent(new CustomEvent("programs-updated"));
        } catch (error) {
          console.error("Launch failed:", error);
          // Optionally show error to user
          showError(`Failed to launch ${prog.name}: ${error}`);
        } finally {
          /** @type {HTMLButtonElement} */ (btn).disabled = false;
        }
        return;
      }
      if (action === "edit") {
        openEditor(prog);
        return;
      }
      if (action === "remove") {
        // Re-use view's confirmation if available; otherwise fall back
        const tauriConfirm = window.__TAURI__?.dialog?.confirm;
        let ok = true;
        if (tauriConfirm) {
          try {
            ok = await tauriConfirm(`Remove ${prog.name}?`, {
              title: "Confirm",
              type: "warning",
            });
          } catch {
            ok = window.confirm(`Remove ${prog.name}?`);
          }
        } else {
          ok = window.confirm(`Remove ${prog.name}?`);
        }
        if (!ok) return;
        await invoke("remove_program", { id: prog.id });
        // update local state and remove row
        const idx = state.all.findIndex((p) => p.id === prog.id);
        if (idx >= 0) state.all.splice(idx, 1);
        row?.remove();
        window.dispatchEvent(new CustomEvent("programs-updated"));
      }
    };
    results.addEventListener("click", resultsClickHandler);
  }

  function openModal() {
    if (!modal?.open) modal?.showModal();
    input?.focus();
  }

  function showError(msg) {
    if (!err) return;
    err.textContent = msg;
    err.style.display = "block";
  }
  function hideError() {
    if (!err) return;
    err.textContent = "";
    err.style.display = "none";
  }
}

/** Update AI button enablement and tooltip based on key presence */
async function updateButtonState(btn) {
  const settings = await getAISettings();
  const has = settings.hasKey;
  btn.disabled = !has;
  if (has) {
    const providerName =
      settings.provider.charAt(0).toUpperCase() + settings.provider.slice(1);
    btn.title = `Search programs with AI (${providerName})`;
  } else {
    btn.title = "Configure AI API key in Settings";
  }
}

/** Retrieve AI settings from app settings */
async function getAISettings() {
  try {
    const ai = await settingsManager.get("ai");
    const provider = ai.provider || "openai";
    const model = ai.model || "gpt-4o-mini";

    // Get provider-specific keys and base URLs
    const providerKeys = ai.provider_keys || {};
    const providerBaseUrls = ai.provider_base_urls || {};

    // Get current provider's key and base URL
    const apiKey =
      providerKeys[provider] || ai.api_key || ai.openai_api_key || "";
    const baseUrl = providerBaseUrls[provider] || ai.base_url || "";

    // Ollama doesn't need an API key, but needs base_url
    const hasKey = provider === "ollama" ? Boolean(baseUrl) : Boolean(apiKey);

    return {
      provider,
      model,
      apiKey,
      baseUrl,
      hasKey,
    };
  } catch (e) {
    return {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
      baseUrl: "",
      hasKey: false,
      error: "Unable to load app settings.",
    };
  }
}

/**
 * Strip programs down to lightweight objects for token efficiency.
 * Keep only name + description (truncate) and optional version + id for better matching.
 * @param {import('./state.js').Program[]} programs
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
 * Create AI provider client based on settings
 * @param {{provider: string, model: string, apiKey: string, baseUrl: string}} settings
 * @returns {any} Provider model instance
 */
function createProviderModel(settings) {
  const { provider, model, apiKey, baseUrl } = settings;

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      return openai(model);
    }

    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey,
      });
      return anthropic(model);
    }

    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey,
      });
      return google(model);
    }

    case "ollama": {
      // Ollama provides an OpenAI-compatible API endpoint at /v1
      const ollamaBaseUrl = baseUrl || "http://localhost:11434";
      const openai = createOpenAI({
        apiKey: "ollama", // Ollama doesn't require a real API key, but the SDK expects one
        baseURL: `${ollamaBaseUrl.replace(/\/$/, "")}/v1`, // Ollama's OpenAI-compatible endpoint
      });
      // Remove any provider prefix from model name for Ollama
      const modelName = model.includes("/") ? model.split("/")[1] : model;
      return openai(modelName);
    }

    case "groq":
    case "xai":
    case "azure":
    default: {
      // For providers without official SDK support, use OpenAI-compatible endpoint
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || undefined,
      });
      // Use model name directly (may need provider prefix removed)
      const modelName = model.includes("/") ? model.split("/")[1] : model;
      return openai(modelName);
    }
  }
}

/**
 * Call AI provider using Vercel AI SDK and parse a strict JSON response.
 * @param {{provider: string, model: string, apiKey: string, baseUrl: string}} settings
 * @param {string} query
 * @param {Array<{id:string,name:string,version:string,description:string}>} pruned
 * @returns {Promise<{results:any[]}>}
 */
async function callAIProvider(settings, query, pruned) {
  const system = `You are a system administrator helping users find tools.\nGiven a user's task description and a list of available programs,\nsuggest the top 1-3 most suitable programs from the list.\n\nReturn valid JSON with this exact structure:\n{\n  "results": []\n}\n\nEach result SHOULD include the original program's name, version, and (if available) id for reliable matching.\nOptionally add a short "reason" explaining why it matches.\nReturn an empty results array if no programs match.`;

  const user = `Available programs (pruned):\n${JSON.stringify(
    pruned,
    null,
    2
  )}\n\nUser task: ${query}`;

  try {
    const model = createProviderModel(settings);

    const result = await generateText({
      model,
      system: system,
      prompt: user,
      temperature: 0.2,
      maxTokens: 2000,
    });

    const text = result.text;

    if (!text) {
      throw new Error("Empty response from AI provider");
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      // Try to extract JSON object from stray text
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("Failed to parse JSON. Response text:", text);
        throw new Error(
          `Failed to parse response as JSON. Response: ${text.substring(
            0,
            200
          )}`
        );
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        console.error("Failed to parse extracted JSON. Match:", match[0]);
        throw new Error(`Failed to parse extracted JSON. ${e.message}`);
      }
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Response is not a valid JSON object");
    }

    if (!Array.isArray(parsed.results)) {
      throw new Error("Malformed AI response (missing results array)");
    }

    return parsed;
  } catch (error) {
    console.error("AI provider error:", error);

    // Handle specific error types
    if (
      error.message?.includes("401") ||
      error.message?.includes("Unauthorized")
    ) {
      throw new Error(`Invalid ${settings.provider} API key`);
    }

    if (
      error.message?.includes("ENOTFOUND") ||
      error.message?.includes("ECONNREFUSED") ||
      error.message?.includes("fetch failed")
    ) {
      if (settings.provider === "ollama") {
        throw new Error(
          "Cannot connect to Ollama. Make sure Ollama is running on your machine."
        );
      }
      throw new Error(`Cannot connect to ${settings.provider} API`);
    }

    // For Ollama, provide more helpful error messages
    if (settings.provider === "ollama") {
      if (
        error.message?.includes("Failed to parse") ||
        error.message?.includes("parse")
      ) {
        throw new Error(
          "Ollama returned an invalid response. The model might not be installed or there was a communication error."
        );
      }
      if (
        error.message?.includes("404") ||
        error.message?.includes("Not Found")
      ) {
        throw new Error(
          `Ollama model "${settings.model}" not found. Make sure the model is installed.`
        );
      }
    }

    // Re-throw with provider context
    throw new Error(
      `${settings.provider} error: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Attempt to map AI-returned candidates back to the user's actual program entries.
 * Priority: id match -> name + version -> name only
 * Preserve any optional `reason` string on the mapped object for display.
 * @param {any[]} results
 * @returns {Array<import('./state.js').Program & { __reason?: string }>}
 */
function mapAIResultsToPrograms(results) {
  /** @type {Array<import('./state.js').Program & { __reason?: string }>} */
  const out = [];
  for (const r of results) {
    const rid = String(r?.id || "");
    const rname = String(r?.name || "").trim();
    const rver = String(r?.version || "").trim();
    let match = null;
    if (rid) match = state.all.find((p) => p.id === rid) || null;
    if (!match && rname) {
      const nameEq = (a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
      // Try name + version first
      if (rver) {
        match =
          state.all.find(
            (p) => nameEq(p.name || "", rname) && (p.version || "") === rver
          ) || null;
      }
      // Fallback to name only
      if (!match) {
        match = state.all.find((p) => nameEq(p.name || "", rname)) || null;
      }
    }
    if (match) {
      const m2 = { ...match };
      if (r?.reason) m2.__reason = String(r.reason);
      out.push(m2);
    }
  }
  return out;
}

/** Render result rows inside the modal and wire their actions */
function renderResults(container, items) {
  if (!container) return;
  container.innerHTML = items.map(renderProgramRowWithReason).join("");
}

function renderProgramRowWithReason(p) {
  const reason = p.__reason
    ? `<div class=\"ai-reason\">${escapeHtml(p.__reason)}</div>`
    : "";
  return `
    <div class="program-row ai-result" data-id="${p.id}">
      <div class="program-logo-wrap">
        ${
          p.logo_data_url
            ? `<img class="program-logo" src="${
                p.logo_data_url
              }" alt="${escapeHtml(p.name)} logo"/>`
            : `<i class="program-logo-icon ${DEFAULT_LOGO}" aria-hidden="true"></i>`
        }
        <span class="exe-status ${p.exe_exists ? "ok" : "missing"}" title="${
    p.exe_exists ? "Executable found" : "Executable missing"
  }">${p.exe_exists ? "✓" : "✕"}</span>
      </div>
      <div class="program-main">
        <div class="program-title" title="${escapeHtml(p.name)}${
    p.version ? ` — ${escapeHtml(p.version)}` : ""
  }">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="ver">${escapeHtml(p.version || "")}</span>
          <span class="muted usage" title="Times launched">(${
            p.launch_count || 0
          })</span>
        </div>
        <div class="program-desc" title="${escapeHtml(
          p.description || ""
        )}">${escapeHtml(p.description || "")}</div>
        <div class="program-path muted" title="${escapeHtml(
          p.exe_path
        )}">${escapeHtml(p.exe_path)}</div>
        ${reason}
      </div>
      <div class="program-actions">
        <button data-action="launch" ${
          p.exe_exists ? "" : "disabled"
        }>Launch</button>
        <button data-action="edit" class="secondary">Edit</button>
        <button data-action="remove" class="ghost">Remove</button>
      </div>
    </div>`;
}
