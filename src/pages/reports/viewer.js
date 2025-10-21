// -----------------------------------------------------------------------------
// Reports/viewer
// -----------------------------------------------------------------------------
// Loads a saved report and navigates to the service results page to display it.
// Much simpler than the modal approach - just loads the data and uses the
// existing results page infrastructure.
// -----------------------------------------------------------------------------
import { loadReportFromDisk } from "../../utils/reports.js";
import { invoke } from "./state.js";
import { state } from "./state.js";

/**
 * Opens the report viewer for a specific report
 * Loads the report data and navigates to the results page
 * @param {Object} item - Report item from list
 */
export async function openViewer(item) {
  try {
    // Show loading indicator in the button that was clicked
    const row = document.querySelector(`[data-folder="${item.folder_name}"]`);
    const viewBtn = row?.querySelector('[data-action="view"]');
    if (viewBtn) {
      viewBtn.disabled = true;
      viewBtn.textContent = "Loading...";
    }

    // Load full report data
    let loaded;
    try {
      // Prefer local API by folder name
      loaded = await loadReportFromDisk(item.folder_name);
    } catch (e) {
      // If that fails and we have an absolute path (network), try loading from path
      if (item.folder_path) {
        const res = await invoke("load_report_from_path", {
          folderPath: item.folder_path,
        });
        loaded = {
          report: JSON.parse(res.report_json),
          metadata: res.metadata,
          executionLog: res.execution_log,
          runPlan: res.run_plan ? JSON.parse(res.run_plan) : null,
          folderName: item.folder_name,
        };
      } else {
        throw e;
      }
    }
    state.viewing = { ...item, ...loaded };

    // Store report in sessionStorage for results page to pick up
    sessionStorage.setItem(
      "service.finalReport",
      JSON.stringify(loaded.report)
    );

    // Mark that we're viewing from reports page (for back button behavior)
    sessionStorage.setItem("service.viewingFromReports", "true");

    // Navigate to results page
    window.location.hash = "#/service-results";
  } catch (error) {
    console.error("Failed to load report:", error);
    alert(`Failed to load report: ${error.message || error}`);

    // Reset button state
    const row = document.querySelector(`[data-folder="${item.folder_name}"]`);
    const viewBtn = row?.querySelector('[data-action="view"]');
    if (viewBtn) {
      viewBtn.disabled = false;
      viewBtn.textContent = "View";
    }
  }
}
