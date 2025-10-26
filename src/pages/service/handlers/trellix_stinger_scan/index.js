/**
 * trellix_stinger_scan Handler
 *
 * Antivirus Scan using Trellix Stinger.
 * A specialized standalone antivirus scanner for removing prevalent malware.
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION (replaces catalog.js entry)
// =============================================================================

export const definition = {
  id: "trellix_stinger_scan",
  label: "Antivirus Scan (Trellix Stinger)",
  group: "Security",
  category: "Antivirus",
  defaultParams: {
    action: "delete",
    include_pups: false,
  },
  toolKeys: ["trellix_stinger"],
  async build({ params, resolveToolPath }) {
    const p = await resolveToolPath(["trellix_stinger"]);
    const action = params?.action || "delete";
    const includePups = !!params?.include_pups;

    const task = {
      type: "trellix_stinger_scan",
      executable_path: p,
      action,
      include_pups: includePups,
      ui_label: `Antivirus Scan (Trellix Stinger${
        action === "report" ? ": report only" : ""
      })`,
    };
    return task;
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER (replaces renderTrellixStinger in tasks.js)
// =============================================================================

/**
 * Render Trellix Stinger scan results for technician view.
 *
 * @param {object} options - Render options
 * @param {object} options.result - Full task result object
 * @param {number} options.index - Task index in results array
 * @returns {import("lit-html").TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};
  const infections = Array.isArray(s.infections) ? s.infections : [];
  const intent = s.intent || {};

  const flagPills = [];

  if (intent.silent) {
    flagPills.push(pill("Silent Mode", "info"));
  }

  if (intent.action === "delete") {
    flagPills.push(pill("Delete Mode", "warn"));
  } else if (intent.action === "report") {
    flagPills.push(pill("Report Only", "info"));
  }

  if (intent.include_pups) {
    flagPills.push(pill("PUP Detection", "info"));
  }

  if (intent.scan_path) {
    flagPills.push(pill(`Folder Scan: ${intent.scan_path}`, "info"));
    if (intent.scan_subdirectories === false) {
      flagPills.push(pill("No Subdirs", "info"));
    }
  } else if (intent.scan_scope === "all_local_drives") {
    flagPills.push(pill("All Local Drives", "info"));
  }

  return html`
    <div class="card trellix-stinger">
      ${renderHeader("Trellix Stinger Antivirus Scan", result.status)}
      ${s.version
        ? html`
            <div class="stinger-version-info muted small">
              <div><strong>Version:</strong> ${s.version}</div>
              ${s.engine_version
                ? html`<div><strong>Engine:</strong> ${s.engine_version}</div>`
                : ""}
              ${s.virus_data_version && s.virus_count != null
                ? html`<div>
                    <strong>Virus Definitions:</strong> ${s.virus_data_version}
                    (${s.virus_count.toLocaleString()} signatures)
                  </div>`
                : ""}
            </div>
          `
        : ""}

      <div class="kpi-row">
        ${kpiBox(
          "Total Files",
          s.total_files != null ? s.total_files.toLocaleString() : "-"
        )}
        ${kpiBox(
          "Clean",
          s.clean_files != null ? s.clean_files.toLocaleString() : "-"
        )}
        ${kpiBox(
          "Not Scanned",
          s.not_scanned != null ? s.not_scanned.toLocaleString() : "-"
        )}
        ${kpiBox(
          "Infected",
          s.infected_files != null
            ? String(s.infected_files)
            : infections.length > 0
            ? String(infections.length)
            : "-"
        )}
        ${kpiBox("Exit Code", s.exit_code != null ? String(s.exit_code) : "-")}
      </div>

      ${flagPills.length ? html`<div class="pill-row">${flagPills}</div>` : ""}
      ${s.scan_start_time || s.scan_end_time
        ? html`
            <div class="stinger-scan-times muted small">
              ${s.scan_start_time
                ? html`<div>
                    <strong>Started:</strong> ${s.scan_start_time}
                  </div>`
                : ""}
              ${s.scan_end_time
                ? html`<div>
                    <strong>Completed:</strong> ${s.scan_end_time}
                  </div>`
                : ""}
            </div>
          `
        : ""}
      ${infections.length
        ? html`
            <div class="stinger-infections">
              <div class="section-title">Infections (${infections.length})</div>
              <div class="stinger-infection-grid">
                ${map(infections, (infection, infIdx) => {
                  const threatName = infection?.threat_name || "Unknown threat";
                  const filePath =
                    infection?.file_path || "(path not provided)";
                  const md5 = infection?.md5 || "";

                  return html`
                    <div class="stinger-infection" data-index=${infIdx}>
                      <div class="stinger-infection-head">
                        <span class="stinger-threat" title=${threatName}>
                          ${threatName}
                        </span>
                        ${intent.action === "delete"
                          ? pill("Deleted", "ok")
                          : pill("Detected", "warn")}
                      </div>
                      <div class="stinger-infection-body">
                        <span class="stinger-label muted small">Location</span>
                        <div class="stinger-path" title=${filePath}>
                          ${filePath}
                        </div>
                        ${md5
                          ? html`
                              <span class="stinger-label muted small">MD5</span>
                              <div class="stinger-md5" title=${md5}>${md5}</div>
                            `
                          : ""}
                      </div>
                    </div>
                  `;
                })}
              </div>
            </div>
          `
        : html`<div class="stinger-empty muted">No infections detected.</div>`}
      ${s.log_file
        ? html`
            <div class="stinger-meta muted small">Log file: ${s.log_file}</div>
          `
        : ""}
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>View Stinger output details</summary>
              ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
              ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
            </details>
          `
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION (replaces processTrellixStinger in metrics.js)
// =============================================================================

/**
 * Extract customer-friendly metrics from Trellix Stinger scan results.
 *
 * @param {object} options - Extraction options
 * @param {object} options.result - Full task result object
 * @returns {Array<import("../common/metrics.js").CustomerMetric>} Customer metrics
 */
export function extractCustomerMetrics({ result }) {
  const { summary, status } = result;

  const infections = Array.isArray(summary.infections)
    ? summary.infections
    : [];

  // Only show metric if infections were found and action was delete
  const action = summary.intent?.action || "delete";
  if (infections.length === 0 || action !== "delete") return [];

  // Extract threat types
  const items = [];
  const detectionTypes = new Set();

  infections.forEach((inf) => {
    const threat = inf?.threat_name || "";
    // Extract type from threat name (e.g., "EICAR", "Artemis", "Trojan")
    const match = threat.match(/^([^!.:]+)/);
    if (match) {
      detectionTypes.add(match[1]);
    }
  });

  if (detectionTypes.size > 0) {
    items.push(
      `${infections.length} ${Array.from(detectionTypes).join(", ")} threat${
        infections.length !== 1 ? "s" : ""
      }`
    );
  } else {
    items.push(
      `${infections.length} threat${
        infections.length !== 1 ? "s" : ""
      } detected and removed`
    );
  }

  return [
    buildMetric({
      icon: "🛡️",
      label: "Security Threats Removed",
      value: infections.length.toString(),
      detail: "Trellix Stinger Scan",
      variant: "success",
      items: items.length > 0 ? items : undefined,
    }),
  ];
}

// =============================================================================
// PRINT CSS (service-specific styles for technician reports)
// =============================================================================

export const printCSS = `
  /* Trellix Stinger Version Info */
  .stinger-version-info { 
    margin-bottom: 10px; padding: 8px; 
    background: #f8fafc; border: 1px solid #e2e8f0; 
    border-radius: 6px; display: flex; flex-wrap: wrap; gap: 12px;
  }
  .stinger-version-info > div { font-size: 9pt; }

  /* Trellix Stinger Scan Times */
  .stinger-scan-times { 
    margin-top: 8px; padding: 6px 8px; 
    background: #f8fafc; border-radius: 4px; 
    display: flex; flex-wrap: wrap; gap: 12px;
  }

  /* Trellix Stinger Infections */
  .stinger-infections { margin-top: 10px; }
  .stinger-infection-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .stinger-infection { 
    background: #fef3c7; border: 1px solid #fbbf24; 
    border-radius: 6px; padding: 10px; 
  }
  .stinger-infection-head { 
    display: flex; justify-content: space-between; 
    align-items: start; gap: 10px; margin-bottom: 6px; 
  }
  .stinger-threat { 
    font-weight: 600; font-size: 10.5pt; color: #92400e; 
  }
  .stinger-infection-body { font-size: 9.5pt; }
  .stinger-label { 
    text-transform: uppercase; font-size: 8.5pt; 
    letter-spacing: 0.5px; color: #64748b; 
    margin-bottom: 2px; display: block; margin-top: 6px;
  }
  .stinger-label:first-child { margin-top: 0; }
  .stinger-path, .stinger-md5 { 
    font-family: 'Consolas', 'Monaco', monospace; 
    font-size: 9pt; color: #334155; 
    word-break: break-all; margin-top: 2px;
  }
  .stinger-meta { 
    border-top: 1px solid #e5e7eb; padding-top: 8px; 
    margin-top: 8px; font-size: 9pt; color: #64748b; 
  }
  .stinger-empty { margin-top: 8px; color: #16a34a; font-weight: 500; }
`;

// =============================================================================
// VIEW CSS (service-specific styles for technician web view)
// =============================================================================

export const viewCSS = `
  .card.trellix-stinger { display: flex; flex-direction: column; gap: 12px; }
  
  .card.trellix-stinger .stinger-version-info {
    padding: 10px 14px;
    background: var(--panel-accent);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
    line-height: 1.6;
  }
  
  .card.trellix-stinger .stinger-scan-times {
    padding: 8px 12px;
    background: var(--panel-accent);
    border-radius: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 12px;
  }
  
  .card.trellix-stinger .stinger-infections { 
    display: flex; flex-direction: column; gap: 10px; 
  }
  
  .card.trellix-stinger .stinger-infection-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); 
    gap: 16px; 
  }
  
  .card.trellix-stinger .stinger-infection {
    background: #854d0e20;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
  
  .card.trellix-stinger .stinger-infection:hover { 
    border-color: #f59e0b; 
    transform: translateY(-1px); 
  }
  
  .card.trellix-stinger .stinger-infection-head { 
    display: flex; 
    justify-content: space-between; 
    align-items: flex-start; 
    gap: 12px; 
  }
  
  .card.trellix-stinger .stinger-threat { 
    font-weight: 600; 
    color: #fbbf24; 
    word-break: break-word; 
  }
  
  .card.trellix-stinger .stinger-infection-body { 
    display: flex; 
    flex-direction: column; 
    gap: 4px; 
  }
  
  .card.trellix-stinger .pill-row { margin-top: 2px; }
  
  .card.trellix-stinger .stinger-label { 
    text-transform: uppercase; 
    letter-spacing: 0.06em; 
    margin-top: 8px;
    display: block;
  }
  
  .card.trellix-stinger .stinger-label:first-child { margin-top: 0; }
  
  .card.trellix-stinger .stinger-path,
  .card.trellix-stinger .stinger-md5 {
    font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
    font-size: 13px; 
    line-height: 1.4; 
    color: #e3e9f8; 
    word-break: break-all;
  }
  
  .card.trellix-stinger .stinger-meta { 
    border-top: 1px solid var(--border); 
    padding-top: 8px; 
    font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace; 
    font-size: 12px; 
    opacity: 0.8; 
  }
  
  .card.trellix-stinger .stinger-empty { 
    margin-top: 4px; 
    color: #4ade80; 
    font-weight: 500; 
  }
`;

// =============================================================================
// PARAMETER CONTROLS RENDERER (for builder UI)
// =============================================================================

/**
 * Render custom parameter controls for Trellix Stinger configuration.
 * @param {object} context - Parameter control context
 * @param {object} context.params - Current parameter values
 * @param {function} context.updateParam - Callback to update parameters
 * @returns {HTMLElement} DOM element with controls
 */
export function renderParamControls({ params, updateParam }) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.alignItems = "center";
  wrapper.style.columnGap = "12px";
  wrapper.style.rowGap = "6px";

  const actionVal = params?.action || "delete";
  const includePupsVal = !!params?.include_pups;

  wrapper.innerHTML = `
    <label class="tiny-lab" style="margin-right:12px;" title="Action to take on detected threats">
      <span class="lab">Action</span>
      <select data-param="action" aria-label="Action on threats">
        <option value="delete" ${
          actionVal === "delete" ? "selected" : ""
        }>Delete threats</option>
        <option value="report" ${
          actionVal === "report" ? "selected" : ""
        }>Report only</option>
      </select>
    </label>
    <label class="tiny-lab" style="margin-right:12px;" title="Detect potentially unwanted programs">
      <input type="checkbox" data-param="include_pups" ${
        includePupsVal ? "checked" : ""
      } />
      <span class="lab">Detect PUPs</span>
    </label>
  `;

  // Stop event propagation to prevent drag-and-drop interference
  wrapper.querySelectorAll("input, select").forEach((el) => {
    ["mousedown", "pointerdown", "click"].forEach((evt) => {
      el.addEventListener(evt, (e) => e.stopPropagation());
    });
  });

  const selAction = wrapper.querySelector('select[data-param="action"]');
  const cbPups = wrapper.querySelector('input[data-param="include_pups"]');

  selAction?.addEventListener("change", () => {
    updateParam("action", selAction.value);
  });

  cbPups?.addEventListener("change", () => {
    updateParam("include_pups", cbPups.checked);
  });

  return wrapper;
}
