// -----------------------------------------------------------------------------
// Reports/index
// -----------------------------------------------------------------------------
// Entry point invoked by the router when navigating to the Reports page.
// Wires the toolbar and list, and loads data once.
// -----------------------------------------------------------------------------
import { wireToolbar, wireListActions, loadReports } from "./view.js";

export async function initPage() {
  wireToolbar();
  wireListActions();
  await loadReports();
}
