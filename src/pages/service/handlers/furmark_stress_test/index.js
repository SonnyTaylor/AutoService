/**
 * FurMark GPU Stress Test Handler
 * ---------------------------------------------------------------------------
 * Stress tests GPU using FurMark to validate graphics card stability and thermal performance.
 *
 * This handler provides:
 * - Service definition for the catalog
 * - Technician view renderer with stress test results
 * - Customer metrics extractor showing performance test completion
 */

import { html } from "lit-html";
import { renderHeader, kpiBox } from "../common/ui.js";
import { map } from "lit-html/directives/map.js";
import { buildMetric } from "../common/metrics.js";

/**
 * @typedef {import('../types').ServiceDefinition} ServiceDefinition
 * @typedef {import('../types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('../types').CustomerMetric} CustomerMetric
 * @typedef {import('../types').TechRendererContext} TechRendererContext
 * @typedef {import('../types').CustomerMetricsContext} CustomerMetricsContext
 */

// =============================================================================
// SERVICE DEFINITION
// =============================================================================

/**
 * Service catalog definition.
 * @type {ServiceDefinition}
 */
export const definition = {
  id: "furmark_stress_test",
  label: "GPU Stress (FurMark)",
  group: "Stress",
  category: "Stress",
  defaultParams: { minutes: 1 },
  toolKeys: ["furmark", "furmark2"],
  async build({ params, resolveToolPath }) {
    let p = await resolveToolPath(["furmark", "furmark2"]);
    if (p && /furmark_gui\.exe$/i.test(p))
      p = p.replace(/[^\\\/]+$/g, "furmark.exe");
    return {
      type: "furmark_stress_test",
      executable_path: p,
      duration_seconds: (params?.minutes || 1) * 60,
      width: 1920,
      height: 1080,
      demo: "furmark-gl",
      extra_args: ["--no-gui"],
      ui_label: "GPU Stress (FurMark)",
    };
  },
};

// =============================================================================
// TECHNICIAN VIEW RENDERER
// =============================================================================

/**
 * Render technician view for FurMark GPU stress test.
 * Displays performance metrics (FPS, duration, temps) and GPU details.
 *
 * @param {TechRendererContext} context - Render context
 * @returns {import('lit-html').TemplateResult} Rendered HTML
 */
export function renderTech({ result, index }) {
  const s = result.summary || {};

  // Format duration from milliseconds
  const formatDuration = (ms) => {
    if (ms == null) return "-";
    const seconds = Math.round(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Format FPS metrics
  const fps = s.fps || {};
  const fpsStr =
    fps.avg != null ? `${fps.avg} (min: ${fps.min}, max: ${fps.max})` : "-";

  // Determine verdict based on GPU temps
  const getTemperatureVariant = () => {
    if (!s.gpus || s.gpus.length === 0) return "info";
    const temps = s.gpus
      .map((g) => g.max_temperature_c)
      .filter((t) => t != null);
    if (temps.length === 0) return "info";
    const maxTemp = Math.max(...temps);
    if (maxTemp > 85) return "warn";
    if (maxTemp > 95) return "fail";
    return "ok";
  };

  return html`
    <div class="card furmark">
      ${renderHeader(result.ui_label || "GPU Stress (FurMark)", result.status)}

      <div class="kpi-row">
        ${s.gpus && s.gpus.length > 0
          ? map(
              s.gpus,
              (gpu) => html`
                ${kpiBox("GPU", gpu.name)}
                ${kpiBox("Duration", formatDuration(s.duration_ms))}
                ${gpu.max_temperature_c != null
                  ? kpiBox("Max Temp", `${gpu.max_temperature_c}°C`)
                  : ""}
                ${gpu.max_core_clock_mhz != null
                  ? kpiBox("Max Clock", `${gpu.max_core_clock_mhz} MHz`)
                  : ""}
                ${gpu.max_usage_percent != null
                  ? kpiBox("Max Usage", `${gpu.max_usage_percent}%`)
                  : ""}
                ${kpiBox(
                  "Avg FPS",
                  s.fps?.avg != null ? String(s.fps.avg) : "-"
                )}
                ${kpiBox("Frames", s.frames != null ? String(s.frames) : "-")}
                ${kpiBox("API", s.api || "-")}
                ${kpiBox(
                  "Resolution",
                  s.resolution
                    ? `${s.resolution.width}x${s.resolution.height}`
                    : "-"
                )}
                ${kpiBox("GPU ID", gpu.id)}
              `
            )
          : html`
              ${kpiBox("API", s.api || "-")}
              ${kpiBox(
                "Resolution",
                s.resolution
                  ? `${s.resolution.width}x${s.resolution.height}`
                  : "-"
              )}
              ${kpiBox("Duration", formatDuration(s.duration_ms))}
              ${kpiBox("Frames", s.frames != null ? String(s.frames) : "-")}
              ${kpiBox("Avg FPS", s.fps?.avg != null ? String(s.fps.avg) : "-")}
            `}
      </div>
    </div>
  `;
}

// =============================================================================
// TECHNICIAN PRINT CSS
// =============================================================================

/**
 * Print-specific CSS for FurMark stress test cards.
 * Scoped to .card.furmark to avoid conflicts with other handlers.
 */
export const printCSS = `
  .card.furmark {
    page-break-inside: avoid;
  }

  .card.furmark .gpu-metrics {
    display: contents;
  }

  @media print {
    .card.furmark .kpi-row {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }
`;

// =============================================================================
// CUSTOMER METRICS EXTRACTOR
// =============================================================================

/**
 * Extract customer-friendly stress test metrics.
 * Shows that GPU stress test was performed.
 *
 * @param {CustomerMetricsContext} context - Extraction context
 * @returns {CustomerMetric|null} Customer metric or null
 */
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;

  const frames = summary?.frames;
  const duration = summary?.duration_ms;
  const avgFps = summary?.fps?.avg;

  let detail = "Graphics card tested";
  if (frames && duration) {
    const durationSec = Math.round(duration / 1000);
    detail = `${frames} frames rendered in ${durationSec}s`;
    if (avgFps) {
      detail += ` @ ${avgFps} FPS avg`;
    }
  }

  return buildMetric({
    icon: "🎮",
    label: "GPU Stress Test",
    value: "Completed",
    detail,
    variant: "info",
  });
}
