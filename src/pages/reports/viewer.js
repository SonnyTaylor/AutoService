// -----------------------------------------------------------------------------
// Reports/viewer
// -----------------------------------------------------------------------------
// Opens a modal overlay to display a saved report using the same rendering
// components as the service results page. Reuses renderResultsSummary,
// renderResultsSections, and setupTabs from service/results/index.js.
// -----------------------------------------------------------------------------
import {
  loadReportFromDisk,
  getReportTitle,
  formatReportDateTime,
} from "../../utils/reports.js";
import { state } from "./state.js";
import {
  renderResultsSummary,
  renderResultsSections,
  setupTabs,
} from "../service/results/index.js";
import {
  buildPrintableDocumentHtml,
  buildCustomerPrintDocumentHtml,
  waitForChartsRendered,
} from "../service/results/print.js";
import printJS from "print-js";

/**
 * Opens the report viewer for a specific report
 * @param {Object} item - Report item from list
 */
export async function openViewer(item) {
  const viewerEl = document.getElementById("report-viewer");
  if (!viewerEl) {
    console.error("Report viewer element not found");
    return;
  }

  // Show loading state
  viewerEl.hidden = false;
  viewerEl.innerHTML = `
    <div class="viewer-overlay">
      <div class="viewer-content loading">
        <div class="spinner"></div>
        <p>Loading report...</p>
      </div>
    </div>
  `;

  try {
    // Load full report data
    const loaded = await loadReportFromDisk(item.folder_name);
    state.viewing = { ...item, ...loaded };

    // Render viewer with loaded data
    renderViewer(loaded);
  } catch (error) {
    console.error("Failed to load report:", error);
    viewerEl.innerHTML = `
      <div class="viewer-overlay">
        <div class="viewer-content error">
          <i class="ph ph-warning" style="font-size: 48px; color: #ef4444;"></i>
          <p>Failed to load report</p>
          <p class="muted">${error.message || error}</p>
          <button onclick="window.closeReportViewer()" class="primary">Close</button>
        </div>
      </div>
    `;
  }
}

/**
 * Renders the full report viewer
 */
function renderViewer(loaded) {
  const viewerEl = document.getElementById("report-viewer");
  const { report, metadata, folderName } = loaded;

  const title = getReportTitle(metadata);
  const dateStr = formatReportDateTime(metadata.timestamp);

  // Reuse the service results HTML structure
  viewerEl.innerHTML = `
    <div class="viewer-overlay" onclick="window.handleViewerOverlayClick(event)">
      <div class="viewer-content" onclick="event.stopPropagation()">
        <div class="viewer-header">
          <div class="viewer-title">
            <h2>${title}</h2>
            <p class="muted">${dateStr}</p>
          </div>
          <button class="ghost" onclick="window.closeReportViewer()">
            <i class="ph ph-x"></i> Close
          </button>
        </div>

        <!-- Reuse service results structure -->
        <nav class="subtabs" role="tablist" id="viewer-tabs">
          <button role="tab" data-tab="results" aria-selected="true" tabindex="0">
            <i class="ph ph-list-checks" style="margin-right: 6px; vertical-align: -2px;"></i> Results
          </button>
          <button role="tab" data-tab="tech-print" aria-selected="false" tabindex="-1">
            <i class="ph ph-file-text" style="margin-right: 6px; vertical-align: -2px;"></i> Technician Print
          </button>
          <button role="tab" data-tab="customer-print" aria-selected="false" tabindex="-1">
            <i class="ph ph-newspaper" style="margin-right: 6px; vertical-align: -2px;"></i> Customer Print
          </button>
        </nav>

        <div class="viewer-panels">
          <section id="viewer-panel-results" class="viewer-panel" role="tabpanel">
            <div id="viewer-results-summary" class="results-summary"></div>
            <div id="viewer-results-sections" class="results-sections"></div>
          </section>

          <section id="viewer-panel-tech-print" class="viewer-panel" role="tabpanel" hidden>
            <div class="preview-card">
              <div class="preview-head">
                <div class="section-title">Technician Print Preview</div>
                <button id="viewer-print-tech" class="ghost small">
                  <i class="ph ph-printer" style="margin-right: 4px; vertical-align: -1px;"></i> Print
                </button>
              </div>
              <div id="viewer-tech-preview" class="preview-body">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;">
                  <div style="text-align:center;">
                    <div class="spinner" style="width:24px;height:24px;border:3px solid #cbd5e1;border-top-color:#475569;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
                    <div style="font-size:14px;">Preparing preview...</div>
                  </div>
                </div>
              </div>
            </div>
            <div id="viewer-tech-container" style="display: none;"></div>
          </section>

          <section id="viewer-panel-customer-print" class="viewer-panel" role="tabpanel" hidden>
            <div class="preview-card">
              <div class="preview-head">
                <div class="section-title">Customer Print Preview</div>
                <button id="viewer-print-customer" class="ghost small">
                  <i class="ph ph-printer" style="margin-right: 4px; vertical-align: -1px;"></i> Print
                </button>
              </div>
              <div id="viewer-customer-preview" class="preview-body">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;">
                  <div style="text-align:center;">
                    <div class="spinner" style="width:24px;height:24px;border:3px solid #cbd5e1;border-top-color:#475569;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
                    <div style="font-size:14px;">Preparing preview...</div>
                  </div>
                </div>
              </div>
            </div>
            <div id="viewer-customer-container" style="display: none;"></div>
          </section>
        </div>
      </div>
    </div>
  `;

  // Initialize tabs
  setupTabs("#viewer-tabs [role='tab']", ".viewer-panel");

  // Render report content (reuse existing renderers)
  const summaryEl = document.getElementById("viewer-results-summary");
  const sectionsEl = document.getElementById("viewer-results-sections");

  if (summaryEl && sectionsEl) {
    renderResultsSummary(report, summaryEl);
    renderResultsSections(report, sectionsEl);
  }

  // Setup print handlers
  setupViewerPrintHandlers(report, sectionsEl);
}

/**
 * Set up print handlers for the viewer
 */
function setupViewerPrintHandlers(report, sectionsEl) {
  const techPrintBtn = document.getElementById("viewer-print-tech");
  const customerPrintBtn = document.getElementById("viewer-print-customer");

  // Technician print handler
  techPrintBtn?.addEventListener("click", async () => {
    await doPrint(techPrintBtn, "AutoService – Technician Report", async () => {
      await waitForChartsRendered(sectionsEl, 300);
      return buildPrintableDocumentHtml(report, sectionsEl);
    });
  });

  // Customer print handler
  customerPrintBtn?.addEventListener("click", async () => {
    await doPrint(
      customerPrintBtn,
      "AutoService – Service Summary",
      async () => {
        return await buildCustomerPrintDocumentHtml(report, { layout: "list" });
      }
    );
  });
}

/**
 * Generic print handler for viewer
 */
async function doPrint(button, title, getDocHtml) {
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.innerHTML =
    '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;"></span>Preparing...';

  try {
    const docHtml = await getDocHtml();
    await new Promise((resolve) => setTimeout(resolve, 50));

    printJS({
      type: "raw-html",
      printable: docHtml,
      scanStyles: false,
      documentTitle: "",
      honorColor: true,
      onPrintDialogClose: () => {
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      },
    });
  } catch (error) {
    console.error("Print error:", error);
    button.textContent = "Print Failed";
    button.style.background = "#7a2e2e";
    setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
        button.style.background = "";
      }
    }, 2000);
  }
}

// Global functions for close and overlay click handling
window.closeReportViewer = function () {
  const viewerEl = document.getElementById("report-viewer");
  if (viewerEl) {
    viewerEl.hidden = true;
    viewerEl.innerHTML = "";
  }
  state.viewing = null;
};

window.handleViewerOverlayClick = function (event) {
  // Close if clicking directly on the overlay (not the content)
  if (event.target.classList.contains("viewer-overlay")) {
    window.closeReportViewer();
  }
};
