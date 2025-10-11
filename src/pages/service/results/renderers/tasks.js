import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import prettyBytes from "pretty-bytes";
import ApexCharts from "apexcharts";

import {
  renderHeader,
  renderList,
  kpiBox,
  pill,
  fmtMs,
  fmtMbps,
} from "./common.js";

// =============================================================================
// HANDLER INTEGRATION (NEW SYSTEM)
// =============================================================================

// Import handler renderers
import { getTechRenderers } from "../../handlers/index.js";
const HANDLER_RENDERERS = getTechRenderers();

// =============================================================================
// LEGACY RENDERERS (TO BE MIGRATED)
// =============================================================================

/**
 * MIGRATION NOTE:
 * Once handlers are migrated, merge them like this:
 * export const RENDERERS = {
 *   ...HANDLER_RENDERERS,  // Migrated handlers
 *   legacy_service: renderLegacyService,  // Remaining legacy renderers
 * };
 *
 * Then remove the individual legacy renderer functions from this file.
 */
/**
 * ALL RENDERERS MIGRATED TO HANDLERS (100%)
 * All 17 services have been migrated to handlers/
 * See handlers/index.js for the complete list
 * Legacy functions below are kept for reference with _OLD suffix
 */
export const RENDERERS = {
  // Merge handler renderers - all 17 services now use handler system
  ...HANDLER_RENDERERS,
};

export function renderGeneric(res, index) {
  return html`
    <div class="result generic">
      ${renderHeader(res.ui_label || res.task_type, res.status)}
      ${renderList(res.summary || {})}
    </div>
  `;
}
