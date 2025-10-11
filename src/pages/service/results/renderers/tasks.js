import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";
import prettyBytes from "pretty-bytes";
import ApexCharts from "apexcharts";

import { renderHeader, renderList } from "./common.js";

// =============================================================================
// HANDLER INTEGRATION
// =============================================================================

import { getTechRenderers } from "../../handlers/index.js";

/**
 * All service renderers are now defined in handlers/.
 * Each handler exports a renderTech function that handles the technician view.
 *
 * To add a new service renderer:
 * 1. Create a handler in handlers/[service_id]/
 * 2. Implement the renderTech function
 * 3. Register in handlers/index.js
 *
 * See docs/HANDLER_MIGRATION_GUIDE.md for details.
 */
export const RENDERERS = getTechRenderers();

/**
 * Generic fallback renderer for tasks without specific handlers.
 * Displays basic task information and summary data.
 *
 * @param {object} res - Task result object
 * @param {number} index - Task index in results array
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderGeneric(res, index) {
  return html`
    <div class="result generic">
      ${renderHeader(res.ui_label || res.task_type, res.status)}
      ${renderList(res.summary || {})}
    </div>
  `;
}
