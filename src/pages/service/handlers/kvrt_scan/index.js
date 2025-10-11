/**
 * kvrt_scan Handler
 *
 * Malware Scan using Kaspersky Virus Removal Tool (KVRT).
 * Detects and removes viruses, trojans, and other malware.
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "kvrt_scan",
  label: "Malware Scan (KVRT)",
  group: "Security",
  category: "Antivirus",
  defaultParams: {
    allVolumes: false,
    processLevel: 2,
  },
  toolKeys: ["kvrt"],
  async build({ params, resolveToolPath, getDataDirs }) {
    const p = await resolveToolPath(["kvrt"]);
    const dirs = (await getDataDirs()) || {};
    const dataRoot = (dirs.data || "..\\data")
      .toString()
      .replace(/[\\/]+$/, "");
    const quarantineDir = `${dataRoot}\\logs\\KVRT`;
    const allVolumes = !!params?.allVolumes;
    const processLevel = Number.isFinite(params?.processLevel)
      ? Math.max(0, Math.min(3, parseInt(params.processLevel, 10)))
      : 2;
    const task = {
      type: "kvrt_scan",
      executable_path: p,
      accept_eula: true,
      silent: true,
      details: true,
      dontencrypt: true,
      noads: true,
      fixednames: true,
      processlevel: processLevel,
      quarantine_dir: quarantineDir,
      allvolumes: allVolumes,
      ui_label: `Malware Scan (KVRT${allVolumes ? ": all volumes" : ""})`,
    };
    return task;
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderKvrt in tasks.js)
// =============================================================================

/**
 * Render KVRT malware scan results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const detections = Array.isArray(s.detections) ? s.detections : [];
  const skipCount = detections.filter(
    (d) => (d?.action || "").toLowerCase() === "skip"
  ).length;

  const flagPills = [
    s.silent ? pill("Silent Mode", "info") : "",
    s.details ? pill("Detailed Report", "info") : "",
    s.dontencrypt ? pill("Don't Encrypt", "info") : "",
    s.noads ? pill("No Ads", "info") : "",
    s.fixednames ? pill("Fixed Names", "info") : "",
  ];

  if (s.processlevel != null) {
    flagPills.push(pill(`Process Level ${s.processlevel}`, "info"));
  }

  if (s.quarantine_dir) {
    flagPills.push(pill("Quarantine Enabled", "info"));
  }

  const actionVariant = (action) => {
    const normalized = (action || "").toLowerCase();
    if (
      ["delete", "remove", "disinfect", "cure", "quarantine"].some((v) =>
        normalized.includes(v)
      )
    ) {
      return "ok";
    }
    if (["skip", "ignore", "postpone"].some((v) => normalized.includes(v))) {
      return "warn";
    }
    if (["fail", "error"].some((v) => normalized.includes(v))) {
      return "fail";
    }
    return "info";
  };

  return html`
    <div class="card kvrt">
      ${renderHeader("Kaspersky Virus Removal Tool", result.status)}
      <div class="kpi-row">
        ${kpiBox("Processed", s.processed != null ? String(s.processed) : "-")}
        ${kpiBox(
          "Detected",
          s.detected != null
            ? String(s.detected)
            : detections.length > 0
            ? String(detections.length)
            : "-"
        )}
        ${kpiBox(
          "Removed",
          s.removed_count != null ? String(s.removed_count) : "-"
        )}
        ${kpiBox("Skipped", String(skipCount))}
        ${kpiBox(
          "Errors",
          s.processing_errors != null ? String(s.processing_errors) : "-"
        )}
        ${kpiBox(
          "Password Protected",
          s.password_protected != null ? String(s.password_protected) : "-"
        )}
        ${kpiBox("Corrupted", s.corrupted != null ? String(s.corrupted) : "-")}
        ${kpiBox("Exit Code", s.exit_code != null ? String(s.exit_code) : "-")}
      </div>

      ${flagPills.filter(Boolean).length
        ? html`<div class="pill-row">${flagPills.filter(Boolean)}</div>`
        : ""}
      ${detections.length
        ? html`
            <div class="kvrt-detections">
              <div class="section-title">Detections</div>
              <div class="kvrt-detection-grid">
                ${map(detections, (det, detIdx) => {
                  const threat = det?.threat || "Unknown threat";
                  const objectPath = det?.object_path || "(path not provided)";
                  const actionRaw = det?.action || "Unknown";
                  const actionDisplay = (() => {
                    const normalized = String(actionRaw || "Unknown");
                    return (
                      normalized.charAt(0).toUpperCase() +
                      normalized.slice(1).toLowerCase()
                    );
                  })();
                  return html`
                    <div class="kvrt-detection" data-index=${detIdx}>
                      <div class="kvrt-detection-head">
                        <span class="kvrt-threat" title=${threat}
                          >${threat}</span
                        >
                        ${pill(
                          `Action: ${actionDisplay}`,
                          actionVariant(actionRaw)
                        )}
                      </div>
                      <div class="kvrt-detection-body">
                        <span class="kvrt-label muted small">Location</span>
                        <div class="kvrt-object" title=${objectPath}>
                          ${objectPath}
                        </div>
                      </div>
                    </div>
                  `;
                })}
              </div>
            </div>
          `
        : html`<div class="kvrt-empty muted">No detections reported.</div>`}
      ${s.quarantine_dir
        ? html`
            <div class="kvrt-meta muted small">
              Quarantine directory: ${s.quarantine_dir}
            </div>
          `
        : ""}
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>View KVRT output details</summary>
              ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
              ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
            </details>
          `
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processKVRTScan in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from KVRT scan results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  const detections = Array.isArray(summary.detections)
    ? summary.detections
    : [];

  // Only count actually removed threats (exclude explicitly skipped ones)
  const removedDetections = detections.filter((d) => {
    const action = d?.action;
    if (action && ["Skip", "skip", "SKIP"].includes(action)) {
      return false;
    }
    return true;
  });

  if (removedDetections.length === 0) return [];

  // Extract threat types
  const items = [];
  const detectionTypes = new Set();

  removedDetections.forEach((d) => {
    const threat = d?.threat || "";
    // Extract type from threat name (e.g., "Trojan", "Backdoor", "Adware")
    const match = threat.match(/^([^.:]+)/);
    if (match) {
      detectionTypes.add(match[1]);
    }
  });

  if (detectionTypes.size > 0) {
    items.push(
      `${removedDetections.length} ${Array.from(detectionTypes).join(
        ", "
      )} threat${removedDetections.length !== 1 ? "s" : ""}`
    );
  } else {
    items.push(
      `${removedDetections.length} threat${
        removedDetections.length !== 1 ? "s" : ""
      } detected and removed`
    );
  }

  return [
    buildMetric({
      icon: "🛡️",
      label: "Security Threats Removed",
      value: removedDetections.length.toString(),
      detail: "Virus Scan",
      variant: "success",
      items: items.length > 0 ? items : undefined,
    }),
  ];
}

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* KVRT Detections */
  .kvrt-detections { margin-top: 10px; }
  .kvrt-detection-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .kvrt-detection { 
    background: #fafbfc; border: 1px solid #cbd5e1; 
    border-radius: 6px; padding: 10px; 
  }
  .kvrt-detection-head { display: flex; justify-content: space-between; align-items: start; gap: 10px; margin-bottom: 6px; }
  .kvrt-threat { font-weight: 600; font-size: 10.5pt; color: #92400e; }
  .kvrt-detection-body { font-size: 9.5pt; }
  .kvrt-label { text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5px; color: #64748b; margin-bottom: 2px; }
  .kvrt-object { 
    font-family: 'Consolas', 'Monaco', monospace; 
    font-size: 9pt; color: #334155; 
    word-break: break-all; margin-top: 2px;
  }
  .kvrt-meta { 
    border-top: 1px solid #e5e7eb; padding-top: 8px; 
    margin-top: 8px; font-size: 9pt; color: #64748b; 
  }
`;
