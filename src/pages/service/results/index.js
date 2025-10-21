import printJS from "print-js";
import { html, render } from "lit-html";
import { map } from "lit-html/directives/map.js";

import { RENDERERS, renderGeneric } from "./renderers/tasks.js";
import { fmtMs, fmtMbps } from "./renderers/common.js";
import {
  buildPrintableHtml,
  buildPrintableDocumentHtml,
  buildCustomerPrintHtml,
  buildCustomerPrintDocumentHtml,
  waitForChartsRendered,
} from "./print.js";

/**
 * Render the summary header for a report
 * Exported for reuse by reports viewer
 * @param {Object} report - Report data
 * @param {HTMLElement} summaryEl - Container element
 */
export function renderResultsSummary(report, summaryEl) {
  const overall = String(report.overall_status || "").toLowerCase();
  const summaryTemplate = html`
    <div class="summary-head ${overall === "success" ? "ok" : "warn"}">
      <div class="left">
        <div class="title">
          Overall:
          ${overall === "success" ? "Success" : "Completed with errors"}
        </div>
        <div class="muted small">${report.results.length} task(s)</div>
      </div>
    </div>
  `;
  render(summaryTemplate, summaryEl);
}

/**
 * Render the results sections for a report
 * Exported for reuse by reports viewer
 * @param {Object} report - Report data
 * @param {HTMLElement} sectionsEl - Container element
 */
export function renderResultsSections(report, sectionsEl) {
  const sectionsTemplate = html`
    ${map(report.results, (res, index) => {
      const type = res?.task_type || res?.type || "unknown";
      const renderer = RENDERERS[type] || renderGeneric;
      let content;
      try {
        content = renderer(res, index);
      } catch (e) {
        console.error("Failed to render result section:", res, e);
        content = renderGeneric(res, index);
      }
      return html`<section class="result-section">${content}</section>`;
    })}
  `;
  render(sectionsTemplate, sectionsEl);
}

/**
 * Initializes the results page, loads the report, and renders all content.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = document.getElementById("svc-results-container");
  const tabsNav = document.getElementById("svc-results-tabs");
  const backBtn = document.getElementById("svc-results-back");
  const saveBtn = document.getElementById("svc-results-save");
  const summaryEl = document.getElementById("svc-results-summary");
  const sectionsEl = document.getElementById("svc-results-sections");

  // Check if we're viewing from reports page or from runner
  const viewingFromReports = sessionStorage.getItem(
    "service.viewingFromReports"
  );

  // Customize UI based on context
  if (viewingFromReports) {
    // Hide save button (report is already saved)
    if (saveBtn) saveBtn.hidden = true;

    // Change back button text
    if (backBtn) {
      backBtn.textContent = "Back to Reports";
    }
  } else {
    // Show save button for fresh reports
    if (saveBtn) saveBtn.hidden = false;

    // Ensure back button says "Back to Runner"
    if (backBtn) {
      backBtn.textContent = "Back to Runner";
    }
  }

  backBtn?.addEventListener("click", () => {
    if (viewingFromReports) {
      // Go back to reports page
      sessionStorage.removeItem("service.viewingFromReports");
      window.location.hash = "#/reports";
    } else {
      // Go back to runner
      window.location.hash = "#/service-report";
    }
  });

  // Set up tab switching
  setupTabs();

  let report = null;
  try {
    const raw =
      sessionStorage.getItem("service.finalReport") ||
      localStorage.getItem("service.finalReport") ||
      "{}";
    report = JSON.parse(raw);
  } catch {
    report = null;
  }

  if (!report || !Array.isArray(report.results)) {
    render(
      html`<div class="muted">No report found. Run a service first.</div>`,
      summaryEl
    );
    if (container) container.hidden = false;
    if (tabsNav) tabsNav.hidden = false;
    return;
  }

  // Render summary and sections using exported functions
  renderResultsSummary(report, summaryEl);
  renderResultsSections(report, sectionsEl);

  // Set up print handlers
  setupPrintHandlers(report, sectionsEl);

  // Set up save handler
  setupSaveHandler(report, saveBtn);

  if (container) container.hidden = false;
  if (tabsNav) tabsNav.hidden = false;
}

/**
 * Set up tab switching functionality
 * Exported for reuse by reports viewer
 * @param {string} [tabsSelector='[role="tab"]'] - CSS selector for tab buttons
 * @param {string} [panelsSelector='[role="tabpanel"]'] - CSS selector for panels
 */
export function setupTabs(
  tabsSelector = '[role="tab"]',
  panelsSelector = '[role="tabpanel"]'
) {
  const tabButtons = document.querySelectorAll(tabsSelector);
  const panels = document.querySelectorAll(panelsSelector);

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      // Update aria-selected and tabindex for accessibility
      tabButtons.forEach((btn) => {
        const isSelected = btn.dataset.tab === targetTab;
        btn.setAttribute("aria-selected", isSelected);
        btn.setAttribute("tabindex", isSelected ? "0" : "-1");
      });

      // Show/hide panels
      panels.forEach((panel) => {
        const panelTab = panel.id.replace("panel-", "");
        panel.hidden = panelTab !== targetTab;
      });
    });
  });
}

/**
 * Set up print handlers for both technician and customer prints
 */
function setupPrintHandlers(report, sectionsEl) {
  const techPrintBtn = document.getElementById("svc-print-tech");
  const customerPrintBtn = document.getElementById("svc-print-customer");
  const techPreview = document.getElementById("svc-print-tech-preview");
  const customerPreview = document.getElementById("svc-print-customer-preview");
  const techContainer = document.getElementById("svc-print-tech-container");
  const customerContainer = document.getElementById(
    "svc-print-customer-container"
  );
  const customerLayoutSelect = document.getElementById(
    "svc-print-customer-layout"
  );
  const customerDiagnosticsToggle = document.getElementById(
    "svc-print-customer-diagnostics"
  );
  const customerLayouts = ["list", "two", "three", "masonry"];
  let currentCustomerLayout = customerLayouts.includes(
    customerLayoutSelect?.value || ""
  )
    ? customerLayoutSelect.value
    : "list";
  let currentShowDiagnostics = customerDiagnosticsToggle?.checked ?? true;

  // Prepare technician print preview
  if (techPreview) {
    techPreview.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;"><div style="text-align:center;"><div class="spinner" style="width:24px;height:24px;border:3px solid #cbd5e1;border-top-color:#475569;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div><div style="font-size:14px;">Preparing preview...</div></div></div>';
    setTimeout(async () => {
      try {
        await waitForChartsRendered(sectionsEl, 300);
        const printableHtml = buildPrintableHtml(report, sectionsEl);
        if (techContainer) techContainer.innerHTML = printableHtml;
        if (techPreview) {
          renderPreviewIntoIframeFallback(
            techPreview,
            buildPrintableDocumentHtml(report, sectionsEl)
          );
        }
      } catch (error) {
        console.error("Technician preview generation error:", error);
        if (techPreview) {
          techPreview.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;text-align:center;padding:20px;">Preview unavailable. Use Print button to generate report.</div>';
        }
      }
    }, 0);
  }

  // Prepare customer print preview
  if (customerPreview) {
    customerPreview.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;"><div style="text-align:center;"><div class="spinner" style="width:24px;height:24px;border:3px solid #cbd5e1;border-top-color:#475569;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div><div style="font-size:14px;">Preparing preview...</div></div></div>';
    const renderCustomerPreview = async () => {
      if (!customerPreview) return;
      try {
        const customerHtml = await buildCustomerPrintHtml(report, {
          layout: currentCustomerLayout,
          showDiagnostics: currentShowDiagnostics,
        });
        if (customerContainer) customerContainer.innerHTML = customerHtml;
        renderPreviewIntoIframeFallback(
          customerPreview,
          await buildCustomerPrintDocumentHtml(report, {
            layout: currentCustomerLayout,
            showDiagnostics: currentShowDiagnostics,
          })
        );
      } catch (error) {
        console.error("Customer preview generation error:", error);
        customerPreview.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;text-align:center;padding:20px;">Preview unavailable. Use Print button to generate report.</div>';
      }
    };
    setTimeout(async () => {
      await renderCustomerPreview();
    }, 0);

    customerLayoutSelect?.addEventListener("change", (event) => {
      const next = event.target.value;
      if (!customerLayouts.includes(next)) return;
      currentCustomerLayout = next;
      renderCustomerPreview();
    });

    customerDiagnosticsToggle?.addEventListener("change", (event) => {
      currentShowDiagnostics = event.target.checked;
      renderCustomerPreview();
    });
  }

  // Technician print handler
  techPrintBtn?.addEventListener("click", async () => {
    await doPrint(
      techPrintBtn,
      "AutoService – Technician Report",
      () => buildPrintableDocumentHtml(report, sectionsEl),
      techContainer,
      report,
      sectionsEl
    );
  });

  // Customer print handler
  customerPrintBtn?.addEventListener("click", async () => {
    await doPrint(
      customerPrintBtn,
      "AutoService – Service Summary",
      async () =>
        await buildCustomerPrintDocumentHtml(report, {
          layout: currentCustomerLayout,
          showDiagnostics: currentShowDiagnostics,
        }),
      customerContainer,
      report
    );
  });
}

/**
 * Generic print handler
 */
async function doPrint(
  button,
  title,
  getDocHtml,
  container,
  report,
  sectionsEl = null
) {
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.innerHTML =
    '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;"></span>Preparing...';

  try {
    if (sectionsEl) {
      await waitForChartsRendered(sectionsEl, 200);
    }

    const docHtml = await getDocHtml();

    await new Promise((resolve) => setTimeout(resolve, 50));

    printJS({
      type: "raw-html",
      printable: docHtml,
      scanStyles: false,
      documentTitle: "", // Empty to avoid browser header text
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

// Local lightweight fallback for preview injection to avoid a circular import from print.js
function renderPreviewIntoIframeFallback(previewEl, docHtml) {
  try {
    let iframe = previewEl.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Print Preview");
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "1px solid rgba(148, 163, 184, 0.3)";
      iframe.style.background = "#fff";
      previewEl.innerHTML = "";
      previewEl.appendChild(iframe);
    }
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      previewEl.innerHTML = docHtml;
      return;
    }
    doc.open();
    doc.write(docHtml);
    doc.close();

    const initializePagedPreview = () => {
      try {
        enhancePrintPreviewDocument(doc);
      } catch (err) {
        console.error("Preview pagination failed:", err);
      }
    };

    if (iframe.contentWindow?.document?.readyState === "complete") {
      initializePagedPreview();
    } else {
      iframe.addEventListener("load", initializePagedPreview, { once: true });
      doc.addEventListener(
        "readystatechange",
        () => {
          if (doc.readyState === "complete") {
            initializePagedPreview();
          }
        },
        { once: true }
      );
    }
  } catch {
    previewEl.innerHTML = docHtml;
  }
}

function enhancePrintPreviewDocument(doc) {
  if (!doc?.body || doc.body.dataset.previewInitialized === "true") {
    return;
  }

  const previewStyleId = "autoservice-preview-style";
  if (!doc.getElementById(previewStyleId)) {
    const style = doc.createElement("style");
    style.id = previewStyleId;
    style.textContent = `
      body.print-preview-mode {
        margin: 0;
        background: #e2e8f0;
        font-family: inherit;
      }

      .preview-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        padding: 24px 0 48px;
      }

      .preview-page {
        position: relative;
        width: 210mm;
        min-height: 297mm;
        box-sizing: border-box;
        padding: 14mm;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 12px 36px rgba(15, 23, 42, 0.22);
        overflow: hidden;
      }

      .preview-page::after {
        content: attr(data-page-number);
        position: absolute;
        right: 12mm;
        bottom: 8mm;
        font-size: 10pt;
        color: #94a3b8;
        letter-spacing: 0.2px;
      }

      .preview-page--overflow::before {
        content: "Content truncated";
        position: absolute;
        top: 6mm;
        right: 12mm;
        background: rgba(239, 68, 68, 0.9);
        color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      @media screen and (max-width: 900px) {
        .preview-page {
          transform: scale(0.85);
          transform-origin: top center;
        }
      }

      @media print {
        body.print-preview-mode {
          background: #ffffff;
        }

        .preview-container {
          padding: 0;
        }

        .preview-page {
          width: auto;
          min-height: auto;
          margin: 0;
          border-radius: 0;
          box-shadow: none;
          page-break-after: always;
        }

        .preview-page:last-of-type {
          page-break-after: auto;
        }

        .preview-page::after,
        .preview-page--overflow::before {
          display: none;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  const originalRoot = doc.body.firstElementChild;
  if (!originalRoot) {
    return;
  }

  // If this is a customer print document, do not split the DOM into multiple
  // pages. Instead, wrap the original content in a single page-styled
  // container to restore the page look while preserving the existing layout
  // structure (so layout toggles and gaps continue to work in preview).
  const isCustomerPrint = originalRoot.classList?.contains("customer-print");
  if (isCustomerPrint) {
    // Build preview container + one page shell
    const container = doc.createElement("div");
    container.className = "preview-container";
    const page = doc.createElement("section");
    page.className = "preview-page";
    page.setAttribute("data-page-number", "Page 1");
    doc.body.innerHTML = "";
    doc.body.appendChild(container);
    container.appendChild(page);
    doc.body.classList.add("print-preview-mode");

    // Move the existing customer print root into the page shell
    page.appendChild(originalRoot);

    // Mark as initialized
    doc.body.dataset.previewInitialized = "true";
    return;
  }

  let nodes = Array.from(originalRoot.childNodes);
  const container = doc.createElement("div");
  container.className = "preview-container";

  doc.body.innerHTML = "";
  doc.body.appendChild(container);
  doc.body.classList.add("print-preview-mode");

  const pages = [];
  const createPage = () => {
    const page = doc.createElement("section");
    page.className = "preview-page";
    pages.push(page);
    container.appendChild(page);
    return page;
  };

  const DPI = 96;
  const PAGE_HEIGHT = Math.round((297 / 25.4) * DPI);
  const HEIGHT_TOLERANCE = 8; // px buffer to reduce overflows from rounding
  let currentPage = createPage();

  nodes.forEach((node) => {
    if (!node) return;
    if (
      node.nodeType === doc.defaultView.Node.TEXT_NODE &&
      !node.textContent?.trim()
    ) {
      return;
    }

    let target = node;
    if (node.nodeType === doc.defaultView.Node.TEXT_NODE) {
      const wrapper = doc.createElement("p");
      wrapper.textContent = node.textContent || "";
      target = wrapper;
    }

    currentPage.appendChild(target);

    const pageRect = currentPage.getBoundingClientRect();
    if (
      pageRect.height > PAGE_HEIGHT + HEIGHT_TOLERANCE &&
      currentPage.childNodes.length > 1
    ) {
      currentPage.removeChild(target);
      currentPage = createPage();
      currentPage.appendChild(target);
      const overflowRect = currentPage.getBoundingClientRect();
      if (overflowRect.height > PAGE_HEIGHT + HEIGHT_TOLERANCE) {
        currentPage.classList.add("preview-page--overflow");
      }
    } else if (pageRect.height > PAGE_HEIGHT + HEIGHT_TOLERANCE) {
      currentPage.classList.add("preview-page--overflow");
    }
  });

  pages.forEach((page, index) => {
    page.setAttribute("data-page-number", `Page ${index + 1}`);
  });

  doc.body.dataset.previewInitialized = "true";
}

/**
 * Set up the save report handler
 */
function setupSaveHandler(report, saveBtn) {
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    try {
      // Disable button during save
      saveBtn.disabled = true;
      const originalHTML = saveBtn.innerHTML;
      saveBtn.innerHTML =
        '<i class="ph ph-circle-notch" style="margin-right: 6px; vertical-align: -2px; animation: spin 1s linear infinite;"></i>Saving...';

      // Get system info for hostname
      let hostname = "Unknown_PC";
      try {
        const { core } = window.__TAURI__ || {};
        const sysInfo = await core?.invoke("get_system_info");
        hostname = sysInfo?.hostname || hostname;
      } catch (e) {
        console.warn("Could not fetch hostname:", e);
      }

      // Get metadata from sessionStorage (if business mode was used)
      let customerName = null;
      let technicianName = null;
      try {
        const metadataRaw = sessionStorage.getItem("service.metadata");
        if (metadataRaw) {
          const metadata = JSON.parse(metadataRaw);
          customerName = metadata.customerName || null;
          technicianName = metadata.technicianName || null;
        }
      } catch (e) {
        console.warn("Could not load service metadata:", e);
      }

      // Get plan and log file paths from sessionStorage (if available)
      let planFilePath = null;
      let logFilePath = null;
      try {
        const runnerDataRaw = sessionStorage.getItem("service.runnerData");
        if (runnerDataRaw) {
          const runnerData = JSON.parse(runnerDataRaw);
          planFilePath = runnerData.planFile || null;
          logFilePath = runnerData.logFile || null;
        }
      } catch (e) {
        console.warn("Could not load runner data:", e);
      }

      // Prepare report JSON
      const reportJson = JSON.stringify(report, null, 2);

      // Call Rust backend to save
      const { core } = window.__TAURI__ || {};
      const response = await core?.invoke("save_report", {
        request: {
          report_json: reportJson,
          plan_file_path: planFilePath,
          log_file_path: logFilePath,
          hostname: hostname,
          customer_name: customerName,
          technician_name: technicianName,
        },
      });

      if (response.success) {
        // Show success message
        saveBtn.innerHTML =
          '<i class="ph ph-check" style="margin-right: 6px; vertical-align: -2px;"></i>Saved!';
        saveBtn.classList.add("success");
        setTimeout(() => {
          saveBtn.innerHTML = originalHTML;
          saveBtn.classList.remove("success");
          saveBtn.disabled = false;
        }, 2000);

        // Show notification with folder path
        if (response.report_folder) {
          showNotification(
            `Report saved successfully to: ${response.report_folder}`,
            "success"
          );
        }
      } else {
        throw new Error(response.error || "Unknown error");
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      const originalHTML = saveBtn.innerHTML;
      saveBtn.innerHTML =
        '<i class="ph ph-x" style="margin-right: 6px; vertical-align: -2px;"></i>Save Failed';
      saveBtn.classList.add("error");
      setTimeout(() => {
        saveBtn.innerHTML = originalHTML;
        saveBtn.classList.remove("error");
        saveBtn.disabled = false;
      }, 2000);

      showNotification(
        `Failed to save report: ${error.message || error}`,
        "error"
      );
    }
  });
}

/**
 * Show a temporary notification message
 */
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 16px 24px;
    background: ${
      type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6"
    };
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 400px;
    font-size: 14px;
    line-height: 1.5;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 5000);
}
