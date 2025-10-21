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
        ${kpiBox("API", s.api || "-")}
        ${kpiBox(
          "Resolution",
          s.resolution ? `${s.resolution.width}x${s.resolution.height}` : "-"
        )}
        ${kpiBox("Duration", formatDuration(s.duration_ms))}
        ${kpiBox("Frames", s.frames != null ? String(s.frames) : "-")}
        ${kpiBox("Avg FPS", s.fps?.avg != null ? String(s.fps.avg) : "-")}
      </div>

      ${s.gpus && s.gpus.length > 0
        ? html`
            <div class="gpu-section">
              <h4>GPUs Tested</h4>
              <div class="gpu-grid">
                ${map(
                  s.gpus,
                  (gpu) => html`
                    <div class="gpu-card">
                      <div class="gpu-name">${gpu.name}</div>
                      <div class="gpu-id">ID: ${gpu.id}</div>
                      ${gpu.max_temperature_c != null
                        ? html`
                            <div class="gpu-stat">
                              <span class="gpu-label">Max Temp:</span>
                              <span class="gpu-value"
                                >${gpu.max_temperature_c}°C</span
                              >
                            </div>
                          `
                        : ""}
                      ${gpu.max_usage_percent != null
                        ? html`
                            <div class="gpu-stat">
                              <span class="gpu-label">Max Usage:</span>
                              <span class="gpu-value"
                                >${gpu.max_usage_percent}%</span
                              >
                            </div>
                          `
                        : ""}
                      ${gpu.max_core_clock_mhz != null
                        ? html`
                            <div class="gpu-stat">
                              <span class="gpu-label">Max Clock:</span>
                              <span class="gpu-value"
                                >${gpu.max_core_clock_mhz} MHz</span
                              >
                            </div>
                          `
                        : ""}
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : ""}
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

  .card.furmark .gpu-section {
    margin-top: 16px;
  }

  .card.furmark .gpu-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #e3e9f8;
  }

  .card.furmark .gpu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .card.furmark .gpu-card {
    background: var(--panel-accent, #24304a);
    border: 1px solid var(--border, #2a3b55);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card.furmark .gpu-name {
    font-weight: 600;
    color: #f6d8a5;
    font-size: 13px;
  }

  .card.furmark .gpu-id {
    font-size: 11px;
    color: #a3adbf;
    font-family: monospace;
  }

  .card.furmark .gpu-stat {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    line-height: 1.5;
  }

  .card.furmark .gpu-label {
    color: #a3adbf;
    font-weight: 500;
  }

  .card.furmark .gpu-value {
    color: #e3e9f8;
    font-weight: 600;
    font-family: monospace;
  }

  @media print {
    .card.furmark .gpu-grid {
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
