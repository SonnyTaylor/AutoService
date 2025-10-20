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

export async function initPage() {
  wireToolbar();
  wireListActions();
  wireEditor();
  initAISearch();
  // Refresh programs list when editor saves
  window.addEventListener(
    "programs-updated",
    () => {
      loadPrograms();
    },
    { once: false }
  );
  await loadPrograms();
}
