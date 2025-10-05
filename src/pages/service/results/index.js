import printJS from "print-js";
import { html, render } from "lit-html";
import { map } from "lit-html/directives/map.js";

import { RENDERERS, renderGeneric } from "./renderers/tasks.js";
import { fmtMs, fmtMbps } from "./renderers/common.js";
import {
  buildPrintableHtml,
  buildPrintableDocumentHtml,
  waitForChartsRendered,
} from "./print.js";

/**
 * Initializes the results page, loads the report, and renders all content.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = document.getElementById("svc-results");
  const backBtn = document.getElementById("svc-results-back");
  const printSideBtn = document.getElementById("svc-results-print-side");
  const summaryEl = document.getElementById("svc-results-summary");
  const sectionsEl = document.getElementById("svc-results-sections");
  const printContainer = document.getElementById("svc-print-container");
  const printPreview = document.getElementById("svc-print-preview");

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-report";
  });

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

  // Prepare printable HTML content (wait for charts & DOM to settle)
  if (printPreview) {
    printPreview.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;"><div style="text-align:center;"><div class="spinner" style="width:24px;height:24px;border:3px solid #cbd5e1;border-top-color:#475569;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div><div style="font-size:14px;">Preparing preview...</div></div></div>';
  }

  // Build preview asynchronously to avoid blocking page load
  setTimeout(async () => {
    try {
      await waitForChartsRendered(sectionsEl, 300);
      const printableHtml = buildPrintableHtml(report, sectionsEl);
      if (printContainer) printContainer.innerHTML = printableHtml;
      if (printPreview) {
        renderPreviewIntoIframeFallback(
          printPreview,
          buildPrintableDocumentHtml(report, sectionsEl)
        );
      }
    } catch (error) {
      console.error("Preview generation error:", error);
      if (printPreview) {
        printPreview.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;text-align:center;padding:20px;">Preview unavailable. Use Print button to generate report.</div>';
      }
    }
  }, 0);

  const doPrint = async () => {
    if (!printSideBtn) return;

    // Disable button and show loading state
    const originalText = printSideBtn.textContent;
    printSideBtn.disabled = true;
    printSideBtn.innerHTML =
      '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;"></span>Preparing...';

    try {
      // Brief wait for DOM to settle (charts are hidden in print)
      await waitForChartsRendered(sectionsEl, 200);

      // Rebuild printable HTML
      const htmlNow = buildPrintableHtml(report, sectionsEl);
      const docHtml = buildPrintableDocumentHtml(report, sectionsEl);
      if (printContainer) printContainer.innerHTML = htmlNow;

      // Brief delay to ensure DOM is settled
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Trigger print dialog
      printJS({
        type: "raw-html",
        printable: docHtml,
        scanStyles: false,
        documentTitle: "AutoService – Service Results",
        honorColor: true,
        onPrintDialogClose: () => {
          // Reset button after print dialog closes
          if (printSideBtn) {
            printSideBtn.disabled = false;
            printSideBtn.textContent = originalText;
          }
        },
      });
    } catch (error) {
      console.error("Print error:", error);
      // Show error state briefly
      printSideBtn.textContent = "Print Failed";
      printSideBtn.style.background = "#7a2e2e";
      setTimeout(() => {
        if (printSideBtn) {
          printSideBtn.disabled = false;
          printSideBtn.textContent = originalText;
          printSideBtn.style.background = "";
        }
      }, 2000);
    }
  };

  printSideBtn?.addEventListener("click", doPrint);

  if (container) container.hidden = false;
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
