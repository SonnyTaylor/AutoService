// -----------------------------------------------------------------------------
// Programs/ai-search
// -----------------------------------------------------------------------------
// AI-powered program search: adds a toolbar button, opens a modal, sends a
// pruned program list + user query to OpenAI, and renders suggested results
// as standard-looking .program-row cards with working actions.
// -----------------------------------------------------------------------------
/* global fetch */
import { invoke, state, DEFAULT_LOGO, $, escapeHtml } from "./state.js";
import { openEditor } from "./editor.js";

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
  // Always ensure the label uses the OpenAI icon (handles pre-existing markup)
  if (btn)
    btn.innerHTML =
      '<i class="ph ph-open-ai-logo" aria-hidden="true"></i> AI Search';

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
        <h3 class="ai-search-title"><i class=\"ph ph-open-ai-logo\" aria-hidden=\"true\"></i> AI Program Search</h3>
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

    // Load API key from app settings
    const { key, error } = await getOpenAIKey();
    if (error) return showError(error);
    if (!key) return showError("OpenAI API key is missing.");

    // Prepare inputs
    const pruned = pruneForAI(state.all);
    // Disable while searching
    runBtn.disabled = true;
    runBtn.textContent = "Searching…";
    try {
      const ai = await callChatGPT(key, q, pruned);
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
  const { key } = await getOpenAIKey();
  const has = Boolean(key);
  btn.disabled = !has;
  btn.title = has
    ? "Search programs with AI"
    : "Configure OpenAI API key in Settings";
}

/** Retrieve OpenAI key from app settings via Tauri */
async function getOpenAIKey() {
  try {
    const settings = await invoke("load_app_settings");
    const key = settings?.ai?.openai_api_key || "";
    return { key };
  } catch (e) {
    return { key: "", error: "Unable to load app settings." };
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
 * Call OpenAI Chat Completions and parse a strict JSON response.
 * @param {string} apiKey
 * @param {string} query
 * @param {Array<{id:string,name:string,version:string,description:string}>} pruned
 * @returns {Promise<{results:any[]}>}
 */
async function callChatGPT(apiKey, query, pruned) {
  const system = `You are a system administrator helping users find tools.\nGiven a user's task description and a list of available programs,\nsuggest the top 1-3 most suitable programs from the list.\n\nReturn valid JSON with this exact structure:\n{\n  "results": []\n}\n\nEach result SHOULD include the original program's name, version, and (if available) id for reliable matching.\nOptionally add a short \"reason\" explaining why it matches.\nReturn an empty results array if no programs match.`;
  const user = `Available programs (pruned):\n${JSON.stringify(
    pruned,
    null,
    2
  )}\n\nUser task: ${query}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) throw new Error("Invalid OpenAI API key");
    throw new Error(`OpenAI error ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON object from stray text
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse response");
    parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.results)) {
    throw new Error("Malformed AI response (missing results)");
  }
  return parsed;
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
