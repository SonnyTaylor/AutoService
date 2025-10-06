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
 * Initializes the results page, loads the report, and renders all content.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = document.getElementById("svc-results-container");
  const tabsNav = document.getElementById("svc-results-tabs");
  const backBtn = document.getElementById("svc-results-back");
  const summaryEl = document.getElementById("svc-results-summary");
  const sectionsEl = document.getElementById("svc-results-sections");

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-report";
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

  // Summary header
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

  // Build sections modularly (fault-tolerant per task)
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

  // Set up print handlers
  setupPrintHandlers(report, sectionsEl);

  if (container) container.hidden = false;
  if (tabsNav) tabsNav.hidden = false;
}

/**
 * Set up tab switching functionality
 */
function setupTabs() {
  const tabButtons = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      // Update aria-selected and classes
      tabButtons.forEach((btn) => {
        const isSelected = btn.dataset.tab === targetTab;
        btn.setAttribute("aria-selected", isSelected);
        btn.classList.toggle("active", isSelected);
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
    setTimeout(async () => {
      try {
        const customerHtml = buildCustomerPrintHtml(report);
        if (customerContainer) customerContainer.innerHTML = customerHtml;
        if (customerPreview) {
          renderPreviewIntoIframeFallback(
            customerPreview,
            buildCustomerPrintDocumentHtml(report)
          );
        }
      } catch (error) {
        console.error("Customer preview generation error:", error);
        if (customerPreview) {
          customerPreview.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;text-align:center;padding:20px;">Preview unavailable. Use Print button to generate report.</div>';
        }
      }
    }, 0);
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
      () => buildCustomerPrintDocumentHtml(report),
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

    const docHtml = getDocHtml();

    await new Promise((resolve) => setTimeout(resolve, 50));

    printJS({
      type: "raw-html",
      printable: docHtml,
      scanStyles: false,
      documentTitle: title,
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
  } catch {
    previewEl.innerHTML = docHtml;
  }
}
