/**
 * drivecleanup_clean Handler
 * ---------------------------------------------------------------------------
 * Removes stale device instances and registry entries using DriveCleanup.
 * Supports preview mode (test-only) and category filtering.
 */

import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import { renderHeader, kpiBox, pill } from "../common/ui.js";
import { buildMetric, getStatusVariant } from "../common/metrics.js";

// =============================================================================
// SERVICE DEFINITION
// =============================================================================

export const definition = {
  id: "drivecleanup_clean",
  label: "Device Cleanup (DriveCleanup)",
  group: "Cleanup",
  category: "Devices",
  defaultParams: {
    testOnly: false,
    includeItems: false,
    categories: [
      "usb",
      "hubs",
      "disks",
      "cdroms",
      "floppies",
      "volumes",
      "wpd",
      "registry",
    ],
  },
  toolKeys: ["drivecleanup"],
  async build({ params, resolveToolPath }) {
    const exec = await resolveToolPath("drivecleanup");

    const ALL = [
      "usb",
      "hubs",
      "disks",
      "cdroms",
      "floppies",
      "volumes",
      "wpd",
      "registry",
    ];
    const selected = Array.isArray(params?.categories)
      ? params.categories
          .map((c) => String(c).trim().toLowerCase())
          .filter(Boolean)
      : [];
    // If all categories are selected, omit them to run "cleanup all" per tool semantics
    const categories = selected.length === ALL.length ? [] : selected;

    const task = {
      type: "drivecleanup_clean",
      executable_path: exec,
      test_only: !!params?.testOnly,
      include_items: !!params?.includeItems,
      // Only include categories when explicitly chosen; otherwise run cleanup-all
      ...(categories.length ? { categories } : {}),
      ui_label: `Device Cleanup (${params?.testOnly ? "Preview" : "Apply"})`,
    };
    return task;
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

export function renderTech({ result, index }) {
  const s = result.summary || {};
  const counts = s.counts || {};
  const intent = s.intent || {};
  const removedTotal = s.removed_items_total ?? null;
  const items = Array.isArray(s.removed_items) ? s.removed_items : [];

  const categoryPills = [];
  const pretty = (b) => (b ? "Yes" : "No");
  if (intent.cleanup_all) {
    categoryPills.push(pill("All Categories", "info"));
  } else {
    if (intent.usb_storage_only) categoryPills.push(pill("USB", "info"));
    if (intent.hubs_only) categoryPills.push(pill("USB Hubs", "info"));
    if (intent.disks_only) categoryPills.push(pill("Disks", "info"));
    if (intent.cdroms_only) categoryPills.push(pill("CDROMs", "info"));
    if (intent.floppies_only) categoryPills.push(pill("Floppies", "info"));
    if (intent.volumes_only) categoryPills.push(pill("Volumes", "info"));
    if (intent.wpd_only) categoryPills.push(pill("WPD", "info"));
    if (intent.registry_only) categoryPills.push(pill("Registry", "info"));
  }
  if (intent.test_only) categoryPills.push(pill("Test Only", "warn"));

  return html`
    <div class="card drivecleanup">
      ${renderHeader(
        result.ui_label || "Device Cleanup (DriveCleanup)",
        result.status
      )}
      <div class="kpi-row">
        ${kpiBox(
          "Disks Removed",
          counts.disk_devices_removed != null
            ? String(counts.disk_devices_removed)
            : "-"
        )}
        ${kpiBox(
          "Volumes Removed",
          counts.storage_volumes_removed != null
            ? String(counts.storage_volumes_removed)
            : "-"
        )}
        ${kpiBox(
          "USB Devices",
          counts.usb_devices_removed != null
            ? String(counts.usb_devices_removed)
            : "-"
        )}
        ${kpiBox(
          "Registry Items",
          counts.registry_items_removed != null
            ? String(counts.registry_items_removed)
            : "-"
        )}
      </div>

      ${categoryPills.length
        ? html`<div class="pill-row">${categoryPills}</div>`
        : ""}
      ${Number.isFinite(removedTotal)
        ? html`<div class="muted small">
            Parsed removed entries: ${removedTotal}
            ${s.removed_items_truncated ? "(truncated)" : ""}
          </div>`
        : ""}
      ${items.length
        ? html`<details class="removed-items">
            <summary>Removed items list</summary>
            <div class="removed-grid">
              ${map(items, (it) => {
                const cat = (it?.category || "").replace(/_/g, " ");
                const id = it?.id || "(unknown)";
                return html`<div class="removed-item">
                  <div class="cat">${cat}</div>
                  <div class="id" title=${id}>${id}</div>
                </div>`;
              })}
            </div>
          </details>`
        : ""}
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`<details class="output">
            <summary>View DriveCleanup output</summary>
            ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
            ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
          </details>`
        : ""}
    </div>
  `;
}

// =============================================================================
// CUSTOMER METRICS EXTRACTION
// =============================================================================

export function extractCustomerMetrics({ result }) {
  const s = result.summary || {};
  const counts = s.counts || {};
  // Sum of primary removals (devices + volumes + registry)
  const total = [
    counts.usb_devices_removed,
    counts.usb_hubs_removed,
    counts.disk_devices_removed,
    counts.cdrom_devices_removed,
    counts.floppy_devices_removed,
    counts.storage_volumes_removed,
    counts.wpd_devices_removed,
    counts.registry_items_removed,
  ]
    .map((n) => (Number.isFinite(n) ? Number(n) : 0))
    .reduce((a, b) => a + b, 0);

  if (total <= 0) return null;

  return buildMetric({
    icon: "🧹",
    label: "Device Entries Cleaned",
    value: total.toString(),
    detail: "Stale devices and registry entries removed",
    variant: getStatusVariant(result.status),
  });
}

// =============================================================================
// PARAMETER CONTROLS (Builder UI)
// =============================================================================

export function renderParamControls({ params, updateParam }) {
  const p = params || {};
  const selected = new Set(
    Array.isArray(p.categories) ? p.categories.map((c) => String(c)) : []
  );

  const makeCheckbox = (id, label) => {
    const el = document.createElement("label");
    el.className = "tiny-lab";
    el.style.marginRight = "10px";
    el.innerHTML = `
      <input type="checkbox" data-id="${id}" ${
      selected.has(id) ? "checked" : ""
    } />
      <span class="lab">${label}</span>
    `;
    const input = el.querySelector("input");
    ["mousedown", "pointerdown", "click"].forEach((evt) =>
      input.addEventListener(evt, (e) => e.stopPropagation())
    );
    input.addEventListener("change", () => {
      const next = new Set(
        Array.isArray(params?.categories)
          ? params.categories.map((c) => String(c))
          : []
      );
      if (input.checked) next.add(id);
      else next.delete(id);
      updateParam("categories", Array.from(next));
    });
    return el;
  };

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexWrap = "wrap";
  wrap.style.alignItems = "center";
  wrap.style.columnGap = "12px";
  wrap.style.rowGap = "6px";

  // Test-only toggle
  const labTest = document.createElement("label");
  labTest.className = "tiny-lab";
  labTest.style.marginRight = "16px";
  labTest.title = "Preview only (no changes)";
  labTest.innerHTML = `
    <input type="checkbox" data-id="testOnly" ${p.testOnly ? "checked" : ""} />
    <span class="lab">Test only</span>
  `;
  const cbTest = labTest.querySelector("input");
  ["mousedown", "pointerdown", "click"].forEach((evt) =>
    cbTest.addEventListener(evt, (e) => e.stopPropagation())
  );
  cbTest.addEventListener("change", () =>
    updateParam("testOnly", cbTest.checked)
  );

  wrap.appendChild(labTest);

  // Category checkboxes
  const pairs = [
    ["usb", "USB"],
    ["hubs", "USB Hubs"],
    ["disks", "Disks"],
    ["cdroms", "CDROMs"],
    ["floppies", "Floppies"],
    ["volumes", "Volumes"],
    ["wpd", "WPD"],
    ["registry", "Registry"],
  ];
  pairs.forEach(([id, label]) => wrap.appendChild(makeCheckbox(id, label)));

  // Include item list (detailed)
  const labItems = document.createElement("label");
  labItems.className = "tiny-lab";
  labItems.title = "Include per-item details";
  labItems.innerHTML = `
    <input type="checkbox" data-id="includeItems" ${
      p.includeItems ? "checked" : ""
    } />
    <span class="lab">Include item list</span>
  `;
  const cbItems = labItems.querySelector("input");
  ["mousedown", "pointerdown", "click"].forEach((evt) =>
    cbItems.addEventListener(evt, (e) => e.stopPropagation())
  );
  cbItems.addEventListener("change", () =>
    updateParam("includeItems", cbItems.checked)
  );
  wrap.appendChild(labItems);

  return wrap;
}

// =============================================================================
// VIEW CSS (Technician web view)
// =============================================================================

export const viewCSS = `
/* DriveCleanup (technician screen styles) */
.drivecleanup .removed-items { margin-top: 8px; }
.drivecleanup .removed-grid { display: grid; grid-template-columns: 1fr; gap: 6px; }
.drivecleanup .removed-item { background: #0f172a0d; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; }
.drivecleanup .removed-item .cat { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.drivecleanup .removed-item .id { font-family: Consolas, Monaco, monospace; font-size: 9pt; color: #cbd5e1; word-break: break-all; }
`;
