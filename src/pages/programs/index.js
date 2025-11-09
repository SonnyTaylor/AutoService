// -----------------------------------------------------------------------------
// Programs/index
// -----------------------------------------------------------------------------
// Entry point invoked by the router when navigating to the Programs page.
// Wires the toolbar and list, initializes the editor, and loads data once.
// Also listens for `programs-updated` events from the editor to refresh.
// -----------------------------------------------------------------------------
import { wireEditor } from "./editor.js";
import { wireListActions, loadPrograms, wireToolbar } from "./view.js";
import { initAISearch } from "./ai-search.js";
import { wireStackEditor, openStackEditor } from "./stack-editor.js";
import { wireStackActions, loadStacks } from "./stacks-view.js";
import { $ } from "./state.js";

export async function initPage() {
  wireToolbar();
  wireListActions();
  wireEditor();
  wireStackEditor();
  wireStackActions();
  initAISearch();

  // Wire "Add Stack" button
  const stackAddBtn = /** @type {HTMLButtonElement|null} */ ($("#stack-add-btn"));
  stackAddBtn?.addEventListener("click", () => openStackEditor());

  // Wire stacks section toggle
  const stacksToggle = /** @type {HTMLButtonElement|null} */ ($("#stacks-toggle"));
  const stacksSection = /** @type {HTMLElement|null} */ ($(".stacks-section"));
  if (stacksToggle && stacksSection) {
    // Start collapsed by default
    stacksSection.classList.add("collapsed");
    
    stacksToggle.addEventListener("click", () => {
      stacksSection.classList.toggle("collapsed");
    });
  }

  // Refresh programs list when editor saves
  window.addEventListener(
    "programs-updated",
    () => {
      loadPrograms();
    },
    { once: false }
  );

  // Refresh stacks list when editor saves
  window.addEventListener(
    "stacks-updated",
    () => {
      loadStacks();
    },
    { once: false }
  );

  // Load initial data
  await Promise.all([loadPrograms(), loadStacks()]);
}
