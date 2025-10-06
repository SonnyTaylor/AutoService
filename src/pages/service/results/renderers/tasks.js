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

export const RENDERERS = {
  speedtest: renderSpeedtest,
  battery_health: renderBatteryHealth,
  sfc_scan: renderSfc,
  dism_health_check: renderDism,
  smartctl_report: renderSmartctl,
  kvrt_scan: renderKvrt,
  adwcleaner_clean: renderAdwCleaner,
  ping_test: renderPing,
  chkdsk_scan: renderChkdsk,
  bleachbit_clean: renderBleachBit,
  furmark_stress_test: renderFurmark,
  heavyload_stress_test: renderHeavyload,
  iperf_test: renderIperf,
  whynotwin11_check: renderWhyNotWin11,
  windows_update: renderWindowsUpdate,
  winsat_disk: renderWinSAT,
};

export function renderGeneric(res, index) {
  return html`
    <div class="result generic">
      ${renderHeader(res.ui_label || res.task_type, res.status)}
      ${renderList(res.summary || {})}
    </div>
  `;
}

function renderSpeedtest(res, index) {
  const h = res.summary?.human_readable || {};
  const chartId = `speedtest-chart-${index}`;

  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const download = toNumber(h.download_mbps);
  const upload = toNumber(h.upload_mbps);

  const speeds = [
    { label: "Download", value: download, color: "#4f8cff" },
    { label: "Upload", value: upload, color: "#8bd17c" },
  ].filter((s) => s.value != null && s.value >= 0);

  setTimeout(() => {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || speeds.length === 0) return;
    if (chartEl.dataset.rendered === "true") return;
    chartEl.dataset.rendered = "true";

    const seriesData = speeds.map((s) => Number(s.value.toFixed(2)));
    const categories = speeds.map((s) => s.label);
    const colors = speeds.map((s) => s.color);

    const options = {
      chart: {
        type: "bar",
        height: 220,
        width: "100%",
        toolbar: { show: false },
        animations: { enabled: false },
      },
      series: [
        {
          name: "Speed",
          data: seriesData,
        },
      ],
      plotOptions: {
        bar: {
          columnWidth: "50%",
          borderRadius: 10,
          distributed: true,
          dataLabels: { position: "top" },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: {
          colors: ["#ffffff"],
          fontSize: "12px",
          fontFamily: "Inter, sans-serif",
        },
        formatter: (val) => `${Number(val ?? 0).toFixed(1)} Mbps`,
      },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
        },
      },
      yaxis: {
        min: 0,
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
          formatter: (val) => `${Number(val ?? 0).toFixed(0)} Mbps`,
        },
      },
      grid: { borderColor: "#2a3140" },
      tooltip: {
        theme: "dark",
        y: {
          formatter: (val) => `${Number(val ?? 0).toFixed(2)} Mbps`,
        },
      },
      colors,
      responsive: [
        {
          breakpoint: 1000,
          options: {
            chart: {
              height: 200,
            },
          },
        },
      ],
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
  }, 0);

  const verdictRaw = typeof h.verdict === "string" ? h.verdict : "";
  const verdictLabel = verdictRaw
    ? verdictRaw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : "-";
  const verdictVariant = (() => {
    const lower = verdictRaw.toLowerCase();
    if (!lower) return undefined;
    if (lower.includes("excellent")) return "ok";
    if (lower.includes("good")) return "info";
    if (lower.includes("fair")) return "warn";
    if (lower.includes("poor") || lower.includes("bad")) return "fail";
    return undefined;
  })();

  const metaRows = [
    h.isp ? { label: "ISP", value: h.isp } : null,
    h.server_description
      ? { label: "Server", value: h.server_description }
      : null,
    res.summary?.results?.timestamp
      ? {
          label: "Timestamp",
          value: new Date(res.summary.results.timestamp).toLocaleString(),
        }
      : null,
  ].filter(Boolean);

  const notes = Array.isArray(h.notes) ? h.notes : [];
  const notePills = notes
    .map((note) => {
      if (note == null) return null;
      const text = String(note);
      const lower = text.toLowerCase();
      let variant = "info";
      if (lower.includes("excellent") || lower.includes("great")) {
        variant = "ok";
      } else if (
        lower.includes("unstable") ||
        lower.includes("issue") ||
        lower.includes("poor")
      ) {
        variant = "fail";
      } else if (lower.includes("moderate") || lower.includes("average")) {
        variant = "warn";
      }
      return pill(text, variant);
    })
    .filter(Boolean);

  return html`
    <div class="card speedtest">
      ${renderHeader("Internet Speed Test", res.status)}
      <div class="speedtest-layout">
        <div class="speedtest-kpis">
          <div class="speedtest-kpi-grid">
            ${kpiBox("Download", fmtMbps(h.download_mbps))}
            ${kpiBox("Upload", fmtMbps(h.upload_mbps))}
            ${kpiBox("Ping", fmtMs(h.ping_ms))}
            ${kpiBox("Verdict", verdictLabel, verdictVariant)}
          </div>
          ${metaRows.length
            ? html`
                <div class="speedtest-meta muted small">
                  ${metaRows.map(
                    (row) => html`
                      <div class="speedtest-meta-row">
                        <span class="lab">${row.label}</span>
                        <span class="val">${row.value}</span>
                      </div>
                    `
                  )}
                </div>
              `
            : ""}
        </div>
        <div class="speedtest-chart">
          ${speeds.length
            ? html`<div id=${chartId}></div>`
            : html`<div class="muted small">
                No download/upload data available for chart.
              </div>`}
        </div>
      </div>
      ${notePills.length ? html`<div class="pill-row">${notePills}</div>` : ""}
    </div>
  `;
}

function renderBatteryHealth(res, index) {
  const s = res.summary || {};
  const info = {
    Batteries: s.count_batteries,
    "Average SOH %": s.average_soh_percent,
    "Low‑health batteries": s.low_health_batteries,
    Verdict: s.human_readable?.verdict,
  };
  return html`
    <div class="result battery">
      ${renderHeader("Battery Health", res.status)}
      <div class="kpi-row">
        ${kpiBox("Batteries", info.Batteries ?? "-")}
        ${kpiBox(
          "Avg SOH",
          info["Average SOH %"] != null ? `${info["Average SOH %"]}%` : "-"
        )}
        ${kpiBox("Low Health", info["Low‑health batteries"] ?? "-")}
        ${kpiBox(
          "Verdict",
          (info.Verdict || "").toString(),
          info.Verdict?.toLowerCase().includes("fail") ? "fail" : undefined
        )}
      </div>
    </div>
  `;
}

function renderSfc(res, index) {
  const s = res.summary || {};
  const violations = s.integrity_violations;
  const repairs = s.repairs_attempted;
  const success = s.repairs_successful;

  let icon, message;
  if (violations === false) {
    icon = html`<i class="ph-fill ph-check-circle ok"></i>`;
    message = "No integrity violations found.";
  } else if (violations === true) {
    icon = html`<i class="ph-fill ph-warning-circle fail"></i>`;
    message = "System file integrity violations were found.";
  } else {
    icon = html`<i class="ph-fill ph-question"></i>`;
    message = "Scan result could not be determined.";
  }

  return html`
    <div class="card sfc">
      ${renderHeader("System File Checker (SFC)", res.status)}
      <div class="sfc-layout">
        <div class="sfc-icon">${icon}</div>
        <div class="sfc-details">
          <div class="sfc-verdict">${message}</div>
          ${violations
            ? html`
                <div class="sfc-repair muted">
                  ${repairs
                    ? `Repairs were attempted. Result: ${
                        success ? "Success" : "Failed"
                      }`
                    : "Repairs were not attempted."}
                </div>
              `
            : ""}
        </div>
      </div>
    </div>
  `;
}

function renderDism(res, index) {
  const s = res.summary || {};
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const getStep = (action) =>
    steps.find((step) => step.action === action)?.parsed;

  const checkHealth = getStep("checkhealth");
  const scanHealth = getStep("scanhealth");
  const restoreHealth = getStep("restorehealth");

  const isHealthy =
    checkHealth?.health_state === "healthy" &&
    scanHealth?.health_state === "healthy";
  const isRepairable =
    checkHealth?.health_state === "repairable" ||
    scanHealth?.health_state === "repairable";

  let verdict = "Unknown";
  if (isHealthy) {
    verdict = "Healthy";
  } else if (isRepairable) {
    const repaired = restoreHealth?.message
      ?.toLowerCase()
      .includes("operation completed successfully");
    verdict = repaired ? "Repaired" : "Corruption Found";
  } else if (res.status === "fail") {
    verdict = "Scan Failed";
  }

  const fmtHealth = (h) => {
    if (!h) return "N/A";
    if (h.health_state === "healthy") return "Healthy";
    if (h.health_state === "repairable") return "Corrupt";
    return "Unknown";
  };

  const fmtRestore = (h) => {
    if (!h) return "N/A";
    if (h.message?.toLowerCase().includes("operation completed successfully")) {
      return isRepairable ? "Repaired" : "Success";
    }
    if (h.repair_success === false) return "Failed";
    return "Unknown";
  };

  return html`
    <div class="card dism">
      ${renderHeader("Windows Image Health (DISM)", res.status)}
      <div class="kpi-row">
        ${kpiBox("Verdict", verdict)}
        ${kpiBox("CheckHealth", fmtHealth(checkHealth))}
        ${kpiBox("ScanHealth", fmtHealth(scanHealth))}
        ${kpiBox("RestoreHealth", fmtRestore(restoreHealth))}
      </div>
    </div>
  `;
}

function renderSmartctl(res, index) {
  const s = res.summary || {};
  const drives = Array.isArray(s.drives) ? s.drives : [];
  return html`
    <div class="card smartctl">
      ${renderHeader("Drive Health (smartctl)", res.status)}
      <div class="drive-list">
        ${drives.length > 0
          ? map(drives, (d) => {
              // Calculate health percentage and variant
              const healthPercent =
                d.wear_level_percent_used != null
                  ? 100 - d.wear_level_percent_used
                  : null;
              const healthVariant = (() => {
                if (healthPercent == null) return undefined;
                if (healthPercent >= 90) return "ok";
                if (healthPercent >= 70) return "warn";
                return "fail";
              })();

              return html`
                <div class="drive-card">
                  <div class="drive-head">
                    <div class="drive-model">
                      ${d.model_name || d.name || "Drive"}
                      <span class="muted small">
                        (SN: ${d.serial_number || "?"}, FW:
                        ${d.firmware_version || "?"})
                      </span>
                    </div>
                    <span class="badge ${d.health_passed ? "ok" : "fail"}"
                      >${d.health_passed ? "PASSED" : "FAILED"}</span
                    >
                  </div>
                  <div class="kpi-row">
                    ${healthPercent != null
                      ? kpiBox(
                          "Drive Health",
                          `${healthPercent}%`,
                          healthVariant
                        )
                      : ""}
                    ${kpiBox("Temp", d.temperature || "-")}
                    ${d.media_errors != null
                      ? kpiBox(
                          "Media Errors",
                          String(d.media_errors),
                          d.media_errors > 0 ? "fail" : undefined
                        )
                      : ""}
                    ${d.error_log_entries != null
                      ? kpiBox(
                          "Error Log",
                          String(d.error_log_entries),
                          d.error_log_entries > 0 ? "warn" : undefined
                        )
                      : ""}
                    ${d.unsafe_shutdowns != null
                      ? kpiBox(
                          "Unsafe Shutdowns",
                          String(d.unsafe_shutdowns),
                          d.unsafe_shutdowns > 0 ? "warn" : undefined
                        )
                      : ""}
                    ${kpiBox(
                      "Power On Hrs",
                      d.power_on_hours != null ? String(d.power_on_hours) : "-"
                    )}
                    ${kpiBox(
                      "Power Cycles",
                      d.power_cycles != null ? String(d.power_cycles) : "-"
                    )}
                    ${d.data_written_human
                      ? kpiBox("Data Written", d.data_written_human)
                      : ""}
                    ${d.data_read_human
                      ? kpiBox("Data Read", d.data_read_human)
                      : ""}
                  </div>
                </div>
              `;
            })
          : html`<div class="muted">No drive data</div>`}
      </div>
    </div>
  `;
}

function renderKvrt(res, index) {
  const s = res.summary || {};
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
      ${renderHeader("Kaspersky Virus Removal Tool", res.status)}
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

function renderAdwCleaner(res, index) {
  const s = res.summary || {};
  const getLen = (a) => (Array.isArray(a) ? a.length : 0);
  const browserHits = Object.values(s.browsers || {}).reduce(
    (sum, v) => sum + (Array.isArray(v) ? v.length : 0),
    0
  );
  const lines = [
    ...(s.registry || []),
    ...(s.files || []),
    ...(s.folders || []),
    ...(s.services || []),
    ...(s.tasks || []),
    ...(s.shortcuts || []),
    ...(s.dlls || []),
    ...(s.wmi || []),
    ...(s.preinstalled || []),
  ].map(String);
  const needsReboot = lines.some((t) => /reboot/i.test(t));
  const problems =
    (s.failed || 0) > 0 || lines.some((t) => /not deleted|failed/i.test(t));

  const categories = {
    Registry: getLen(s.registry),
    Files: getLen(s.files),
    Folders: getLen(s.folders),
    Services: getLen(s.services),
    Tasks: getLen(s.tasks),
    Shortcuts: getLen(s.shortcuts),
    DLLs: getLen(s.dlls),
    WMI: getLen(s.wmi),
    "Browser Items": browserHits,
    Preinstalled: { count: getLen(s.preinstalled), variant: "warn" },
  };

  return html`
    <div class="card adwcleaner">
      ${renderHeader("AdwCleaner Cleanup", res.status)}
      <div class="kpi-row">
        ${kpiBox("Cleaned", s.cleaned != null ? String(s.cleaned) : "-")}
        ${kpiBox("Failed", s.failed != null ? String(s.failed) : "-")}
        ${kpiBox("Browser Items", browserHits)}
        ${getLen(s.preinstalled)
          ? kpiBox("Preinstalled", getLen(s.preinstalled))
          : ""}
      </div>

      ${needsReboot || problems
        ? html`
            <div class="pill-row">
              ${needsReboot ? pill("Reboot Required", "warn") : ""}
              ${(s.failed || 0) > 0 ? pill(`Failed ${s.failed}`, "fail") : ""}
            </div>
          `
        : ""}

      <div class="tag-grid">
        ${map(Object.entries(categories), ([label, data]) => {
          const count = typeof data === "object" ? data.count : data;
          const variant = typeof data === "object" ? data.variant : undefined;
          return count > 0 ? pill(`${label} ${count}`, variant) : "";
        })}
      </div>
    </div>
  `;
}

function renderPing(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const lat = s.latency_ms || {};
  const stats = s.interval_stats || {};
  const loss = s.packets?.loss_percent;
  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const stabilityScore = toNumber(hr.stability_score);
  const stabilityVariant = (() => {
    if (stabilityScore == null) return undefined;
    if (stabilityScore >= 85) return "ok";
    if (stabilityScore >= 70) return "info";
    if (stabilityScore >= 50) return "warn";
    return "fail";
  })();
  const stabilityDisplay = (() => {
    if (stabilityScore == null) return "-";
    const score =
      Number.isInteger(stabilityScore) || Math.abs(stabilityScore % 1) < 0.05
        ? stabilityScore.toFixed(0)
        : stabilityScore.toFixed(1);
    return `${score}/100`;
  })();

  setTimeout(() => {
    const chartEl = document.getElementById(`ping-chart-${index}`);
    if (chartEl && lat.avg != null) {
      if (chartEl.dataset.rendered === "true") return;
      chartEl.dataset.rendered = "true";
      const getPingColor = (ping) => {
        if (ping == null) return "#4f8cff";
        if (ping < 30) return "#2f6b4a";
        if (ping < 60) return "#4f8cff";
        if (ping < 100) return "#6b422b";
        return "#7a3333";
      };

      const options = {
        chart: {
          type: "bar",
          height: 180,
          width: "100%",
          toolbar: { show: false },
          animations: { enabled: false },
        },
        series: [{ name: "Average", data: [lat.avg.toFixed(1)] }],
        plotOptions: {
          bar: { horizontal: true, barHeight: "35%", distributed: false },
        },
        colors: [getPingColor(lat.avg)],
        xaxis: {
          categories: [""],
          max: Math.max(120, Math.ceil((lat.max || 0) / 20) * 20),
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val} ms`,
          },
        },
        yaxis: { labels: { show: false } },
        grid: { borderColor: "#2a3140", padding: { left: 20, right: 20 } },
        tooltip: {
          theme: "dark",
          y: { title: { formatter: () => "Average Ping" } },
        },
        annotations: {
          xaxis: [
            {
              x: 0,
              x2: 30,
              fillColor: "#2f6b4a",
              opacity: 0.1,
              label: {
                text: "Excellent",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 30,
              x2: 60,
              fillColor: "#4f8cff",
              opacity: 0.1,
              label: {
                text: "Good",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 60,
              x2: 100,
              fillColor: "#6b422b",
              opacity: 0.1,
              label: {
                text: "Fair",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
            {
              x: 100,
              x2: 999,
              fillColor: "#7a3333",
              opacity: 0.1,
              label: {
                text: "Poor",
                position: "top",
                style: {
                  background: "transparent",
                  color: "#fff",
                  fontSize: "10px",
                },
              },
            },
          ],
        },
      };
      const chart = new ApexCharts(chartEl, options);
      chart.render();
    }
  }, 0);

  return html`
    <div class="card ping">
      ${renderHeader(`Ping Test: ${s.host || ""}`, res.status)}
      <div class="ping-layout">
        <div class="ping-kpis">
          ${kpiBox("Average Latency", fmtMs(lat.avg))}
          ${kpiBox("Packet Loss", loss != null ? `${loss}%` : "-")}
          ${kpiBox("Stability", stabilityDisplay, stabilityVariant)}
          ${kpiBox(
            "Jitter (StDev)",
            stats.stdev != null ? fmtMs(stats.stdev) : "-"
          )}
        </div>
        <div class="ping-chart">
          ${lat.avg != null
            ? html`
                <div class="ping-chart-shell">
                  <div id="ping-chart-${index}"></div>
                </div>
              `
            : html`<div class="muted">No latency data for chart.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderChkdsk(res, index) {
  const s = res.summary || {};
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toBytes = (kb) => {
    const val = toNumber(kb);
    return val != null ? val * 1024 : null;
  };
  const formatBytes = (kb) => {
    const bytes = toBytes(kb);
    return bytes != null ? prettyBytes(bytes) : "-";
  };
  const totalKb = toNumber(s.total_disk_kb);
  const availKb = toNumber(s.available_kb);
  const usedKb =
    totalKb != null && availKb != null ? Math.max(totalKb - availKb, 0) : null;
  const systemUseKb = toNumber(s.system_use_kb);
  const durationSec = toNumber(s.duration_seconds);
  const pct = (part, whole) => {
    if (part == null || whole == null || whole === 0) return null;
    return Math.round((part / whole) * 100);
  };
  const usedPct = pct(usedKb, totalKb);
  const freePct = pct(availKb, totalKb);
  const verdict = (() => {
    if (s.volume_in_use) return "Volume in use";
    if (s.prompted_schedule_or_dismount) return "Requires schedule";
    if (s.made_corrections) return "Corrections applied";
    if (s.found_no_problems === true) return "No issues found";
    if (s.return_code != null && Number(s.return_code) !== 0)
      return "Completed with warnings";
    return "Review output";
  })();
  const formatDuration = (seconds) => {
    if (seconds == null) return "-";
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };
  const capitalize = (str) =>
    str ? str.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "-";
  const pills = [];
  if (s.found_no_problems === true) pills.push(pill("Clean", "ok"));
  if (s.made_corrections) pills.push(pill("Corrections Made", "warn"));
  if (s.bad_sectors_kb && Number(s.bad_sectors_kb) > 0)
    pills.push(pill(`Bad Sectors ${formatBytes(s.bad_sectors_kb)}`, "fail"));
  if (s.prompted_schedule_or_dismount)
    pills.push(pill("Prompted to Schedule / Dismount", "warn"));
  if (s.volume_in_use) pills.push(pill("Volume In Use", "warn"));

  return html`
    <div class="card chkdsk">
      ${renderHeader("File System Check (CHKDSK)", res.status)}
      <div class="kpi-row">
        ${kpiBox("Drive", s.drive || "-")}
        ${kpiBox("Mode", capitalize(s.mode || ""))}
        ${kpiBox("Duration", formatDuration(durationSec))}
        ${kpiBox("Total Size", formatBytes(totalKb))}
        ${kpiBox(
          "Used",
          usedKb != null
            ? `${formatBytes(usedKb)}${usedPct != null ? ` (${usedPct}%)` : ""}`
            : "-"
        )}
        ${kpiBox(
          "Free",
          availKb != null
            ? `${formatBytes(availKb)}${
                freePct != null ? ` (${freePct}%)` : ""
              }`
            : "-"
        )}
        ${systemUseKb != null
          ? kpiBox("System Use", formatBytes(systemUseKb))
          : ""}
        ${kpiBox(
          "Return Code",
          s.return_code != null ? String(s.return_code) : "-"
        )}
        ${kpiBox("Verdict", verdict)}
      </div>
      ${pills.length ? html`<div class="pill-row">${pills}</div>` : ""}
      ${s.output
        ? html`
            <details class="output">
              <summary>View raw CHKDSK output</summary>
              <pre>${s.output}</pre>
            </details>
          `
        : ""}
    </div>
  `;
}

function renderBleachBit(res, index) {
  const s = res.summary || {};
  const recovered = s.space_recovered_bytes;
  return html`
    <div class="card bleachbit">
      ${renderHeader("Disk Cleanup (BleachBit)", res.status)}
      <div class="kpi-row">
        ${kpiBox(
          "Space Recovered",
          recovered != null ? prettyBytes(recovered) : "-"
        )}
        ${kpiBox("Files Deleted", s.files_deleted ?? "-")}
        ${kpiBox("Errors", s.errors ?? "-")}
        ${s.special_operations
          ? kpiBox("Special Ops", s.special_operations)
          : ""}
      </div>
    </div>
  `;
}

function renderFurmark(res, index) {
  return renderGeneric(res, index);
}

function renderHeavyload(res, index) {
  const s = res.summary || {};
  const modes = [
    s.stress_cpu ? "CPU" : "",
    s.stress_memory ? "RAM" : "",
    s.stress_gpu ? "GPU" : "",
    s.stress_disk ? "Disk" : "",
  ].filter(Boolean);
  const label = modes.length
    ? `${modes.join(" + ")} Stress (HeavyLoad)`
    : "HeavyLoad Stress";

  const exitCode = s.exit_code;
  const durationMinutes = s.duration_minutes;
  const durationStr = (() => {
    if (durationMinutes == null) return "-";
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes)) return String(durationMinutes);
    if (minutes < 1) {
      return `${Math.round(minutes * 60)} sec`;
    }
    const whole = Math.floor(minutes);
    const remainder = minutes - whole;
    const seconds = Math.round(remainder * 60);
    return seconds > 0 ? `${whole}m ${seconds}s` : `${whole} min`;
  })();

  const verdictInfo = (() => {
    if (res.status === "fail") {
      return { label: "Failed", variant: "fail" };
    }
    if (exitCode == null) {
      return { label: "Completed", variant: "ok" };
    }
    if (exitCode === 0) {
      return { label: "Completed", variant: "ok" };
    }
    if (exitCode > 0) {
      return { label: `Exited (${exitCode})`, variant: "warn" };
    }
    return { label: "Unknown", variant: "info" };
  })();

  return html`
    <div class="card heavyload">
      ${renderHeader(label, res.status)}
      <div class="kpi-row">
        ${kpiBox("Verdict", verdictInfo.label, verdictInfo.variant)}
        ${kpiBox("Duration", durationStr)}
        ${kpiBox("Exit Code", exitCode != null ? String(exitCode) : "-")}
      </div>
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>View HeavyLoad output</summary>
              ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
              ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
            </details>
          `
        : ""}
    </div>
  `;
}

function renderIperf(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const throughput = hr.throughput || {};
  const throughput_over_time = s.throughput_over_time_mbps || [];

  setTimeout(() => {
    const chartEl = document.getElementById(`iperf-chart-${index}`);
    if (chartEl && throughput_over_time.length > 0) {
      const options = {
        chart: {
          type: "area",
          height: 200,
          width: "100%",
          toolbar: { show: false },
          animations: { enabled: false },
        },
        series: [
          {
            name: "Throughput",
            data: throughput_over_time.map((d) => d?.toFixed(1) ?? 0),
          },
        ],
        colors: ["#4f8cff"],
        xaxis: {
          type: "numeric",
          tickAmount: 10,
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val}s`,
          },
          axisBorder: { show: false },
        },
        yaxis: {
          min: 0,
          labels: {
            style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
            formatter: (val) => `${val} Mbps`,
          },
        },
        grid: { borderColor: "#2a3140" },
        dataLabels: { enabled: false },
        tooltip: {
          theme: "dark",
          x: { formatter: (val) => `Interval: ${val}s` },
        },
        stroke: { curve: "smooth", width: 2 },
        fill: {
          type: "gradient",
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.4,
            opacityTo: 0.1,
            stops: [0, 90, 100],
          },
        },
        responsive: [
          {
            breakpoint: 1000,
            options: {
              chart: {
                height: 180,
              },
            },
          },
        ],
      };
      const chart = new ApexCharts(chartEl, options);
      chart.render();
    }
  }, 0);

  const durationMin = s.duration_seconds
    ? Math.round(s.duration_seconds / 60)
    : null;

  return html`
    <div class="card iperf">
      ${renderHeader("Network Throughput (iPerf)", res.status)}
      <div class="kpi-row">
        ${(() => {
          const verdictRaw = hr.verdict ? String(hr.verdict) : "";
          const verdict = verdictRaw
            ? verdictRaw.charAt(0).toUpperCase() + verdictRaw.slice(1)
            : "-";
          const lower = verdictRaw.toLowerCase();
          let variant = "";
          if (lower.includes("excellent")) variant = "info";
          else if (lower.includes("good")) variant = "ok";
          else if (lower.includes("fair")) variant = "warn";
          else if (lower.includes("poor")) variant = "fail";
          return html`<div class="kpi verdict${variant ? ` ${variant}` : ""}">
            <span class="lab">Verdict</span>
            <span class="val">${verdict}</span>
          </div>`;
        })()}
        ${kpiBox(
          "Avg Throughput",
          `${throughput.mean?.toFixed(1) || "?"} Mbps`
        )}
        ${kpiBox("Stability", `${hr.stability_score || "?"}/100`)}
        ${kpiBox(
          "Direction",
          hr.direction
            ? hr.direction.charAt(0).toUpperCase() + hr.direction.slice(1)
            : "-"
        )}
        ${kpiBox("Protocol", hr.protocol ? hr.protocol.toUpperCase() : "-")}
        ${kpiBox("Time", durationMin ? `${durationMin} min` : "-")}
      </div>
      ${Array.isArray(hr.notes) && hr.notes.length
        ? html`<div class="pill-row">
            ${map(hr.notes, (n) => {
              const note = String(n || "").toLowerCase();
              let variant = "warn";
              if (
                note.includes("low variability") ||
                note.includes("low variation")
              ) {
                variant = "ok";
              } else if (
                note.includes("high variability") ||
                note.includes("high variation") ||
                note.includes("unstable")
              ) {
                variant = "fail";
              } else if (
                note.includes("medium variability") ||
                note.includes("moderate variability")
              ) {
                variant = "warn";
              }
              return pill(n, variant);
            })}
          </div>`
        : ""}
      <div class="chart-container">
        ${throughput_over_time.length > 0
          ? html`<div id="iperf-chart-${index}"></div>`
          : html`<div class="muted">
              No interval data available for chart.
            </div>`}
      </div>
    </div>
  `;
}

function renderWhyNotWin11(res, index) {
  const s = res.summary || {};
  const hr = s.human_readable || {};
  const failing = Array.isArray(s.failing_checks) ? s.failing_checks.length : 0;
  const passing = Array.isArray(s.passing_checks) ? s.passing_checks.length : 0;
  const total = failing + passing;

  // Calculate compatibility percentage
  const compatPercent = total > 0 ? Math.round((passing / total) * 100) : 0;

  // Determine readiness variant
  const readyVariant = s.ready ? "ok" : "fail";
  const readyText = s.ready ? "Yes ✓" : "No ✗";

  // Group checks by category if possible (common Win11 requirement names)
  const criticalChecks = [];
  const warningChecks = [];

  (s.failing_checks || []).forEach((check) => {
    const checkLower = String(check).toLowerCase();
    if (
      checkLower.includes("tpm") ||
      checkLower.includes("secure boot") ||
      checkLower.includes("cpu") ||
      checkLower.includes("processor")
    ) {
      criticalChecks.push(check);
    } else {
      warningChecks.push(check);
    }
  });

  return html`
    <div class="card wn11">
      ${renderHeader("Windows 11 Compatibility Check", res.status)}

      <!-- Main compatibility status -->
      <div class="wn11-status-banner ${s.ready ? "ready" : "not-ready"}">
        <div class="wn11-status-icon">
          ${s.ready
            ? html`<i class="ph-fill ph-check-circle"></i>`
            : html`<i class="ph-fill ph-x-circle"></i>`}
        </div>
        <div class="wn11-status-content">
          <div class="wn11-status-title">
            ${s.ready
              ? "This PC meets Windows 11 requirements"
              : "This PC does not meet Windows 11 requirements"}
          </div>
          <div class="wn11-status-subtitle">
            ${s.hostname ? `Computer: ${s.hostname}` : ""}
            ${compatPercent > 0 ? ` • ${compatPercent}% compatible` : ""}
          </div>
        </div>
      </div>

      <!-- KPI Stats -->
      <div class="kpi-row">
        ${kpiBox("Windows 11 Ready", readyText, readyVariant)}
        ${kpiBox(
          "Compatibility",
          `${compatPercent}%`,
          compatPercent >= 100
            ? "ok"
            : compatPercent >= 80
            ? "info"
            : compatPercent >= 50
            ? "warn"
            : "fail"
        )}
        ${kpiBox(
          "Passing Checks",
          String(passing),
          passing > 0 ? "ok" : undefined
        )}
        ${kpiBox(
          "Failing Checks",
          String(failing),
          failing > 0 ? "fail" : "ok"
        )}
      </div>

      <!-- Failing checks section -->
      ${failing > 0
        ? html`
            <div class="wn11-checks-section">
              <div class="section-title">
                <i class="ph ph-warning-circle"></i> Requirements Not Met
              </div>

              ${criticalChecks.length > 0
                ? html`
                    <div class="wn11-check-group">
                      <div class="wn11-check-group-title">
                        Critical Requirements
                      </div>
                      <div class="pill-row">
                        ${map(criticalChecks, (c) => pill(c, "fail"))}
                      </div>
                    </div>
                  `
                : ""}
              ${warningChecks.length > 0
                ? html`
                    <div class="wn11-check-group">
                      <div class="wn11-check-group-title">
                        ${criticalChecks.length > 0
                          ? "Other Requirements"
                          : "Failed Requirements"}
                      </div>
                      <div class="pill-row">
                        ${map(warningChecks, (c) => pill(c, "fail"))}
                      </div>
                    </div>
                  `
                : ""}
              ${criticalChecks.length === 0 && warningChecks.length === 0
                ? html`
                    <div class="pill-row">
                      ${map(s.failing_checks || [], (c) => pill(c, "fail"))}
                    </div>
                  `
                : ""}
            </div>
          `
        : ""}

      <!-- Passing checks section -->
      ${passing > 0
        ? html`
            <div class="wn11-checks-section">
              <div class="section-title">
                <i class="ph ph-check-circle"></i> Requirements Met (${passing})
              </div>
              <details class="wn11-passing-details">
                <summary>Show all passing checks</summary>
                <div class="pill-row">
                  ${map(s.passing_checks || [], (c) => pill(c, "ok"))}
                </div>
              </details>
            </div>
          `
        : ""}

      <!-- Recommendations -->
      ${!s.ready && failing > 0
        ? html`
            <div class="wn11-recommendations">
              <div class="wn11-rec-title">
                <i class="ph ph-lightbulb"></i> Recommendations
              </div>
              <ul class="wn11-rec-list">
                ${criticalChecks.some((c) => c.toLowerCase().includes("tpm"))
                  ? html`<li>
                      <strong>TPM 2.0:</strong> Enable TPM in BIOS/UEFI settings
                      or check if motherboard supports TPM module
                    </li>`
                  : ""}
                ${criticalChecks.some((c) =>
                  c.toLowerCase().includes("secure boot")
                )
                  ? html`<li>
                      <strong>Secure Boot:</strong> Enable Secure Boot in
                      BIOS/UEFI settings (may require converting MBR to GPT)
                    </li>`
                  : ""}
                ${criticalChecks.some(
                  (c) =>
                    c.toLowerCase().includes("cpu") ||
                    c.toLowerCase().includes("processor")
                )
                  ? html`<li>
                      <strong>CPU:</strong> CPU is not on Microsoft's compatible
                      list. Consider hardware upgrade for Windows 11
                    </li>`
                  : ""}
                ${criticalChecks.length === 0 && failing > 0
                  ? html`<li>
                      Review the failed requirements above and consult
                      manufacturer documentation or BIOS settings
                    </li>`
                  : ""}
              </ul>
            </div>
          `
        : ""}
    </div>
  `;
}

function renderWindowsUpdate(res, index) {
  return renderGeneric(res, index);
}

function renderWinSAT(res, index) {
  const s = res.summary || {};
  const r = s.results || {};
  const hr = s.human_readable || {};
  const chartId = `winsat-chart-${index}`;

  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  // Prepare chart data - showing throughput metrics
  const metrics = [
    {
      label: "Random Read",
      value: toNumber(r.random_read_mbps),
      score: toNumber(r.random_read_score),
      color: "#4f8cff",
    },
    {
      label: "Sequential Read",
      value: toNumber(r.sequential_read_mbps),
      score: toNumber(r.sequential_read_score),
      color: "#8bd17c",
    },
    {
      label: "Sequential Write",
      value: toNumber(r.sequential_write_mbps),
      score: toNumber(r.sequential_write_score),
      color: "#f4a261",
    },
  ].filter((m) => m.value != null && m.value >= 0);

  // Render chart after DOM update
  setTimeout(() => {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || metrics.length === 0) return;
    if (chartEl.dataset.rendered === "true") return;
    chartEl.dataset.rendered = "true";

    const seriesData = metrics.map((m) => Number(m.value.toFixed(2)));
    const categories = metrics.map((m) => m.label);
    const colors = metrics.map((m) => m.color);

    const options = {
      chart: {
        type: "bar",
        height: 240,
        width: "100%",
        toolbar: { show: false },
        animations: { enabled: false },
      },
      series: [
        {
          name: "Throughput",
          data: seriesData,
        },
      ],
      plotOptions: {
        bar: {
          columnWidth: "60%",
          borderRadius: 8,
          distributed: true,
          dataLabels: { position: "top" },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -20,
        style: {
          colors: ["#ffffff"],
          fontSize: "12px",
          fontFamily: "Inter, sans-serif",
          fontWeight: "600",
        },
        formatter: (val) => `${Number(val ?? 0).toFixed(1)} MB/s`,
      },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
        },
      },
      yaxis: {
        min: 0,
        labels: {
          style: { colors: "#a3adbf", fontFamily: "Inter, sans-serif" },
          formatter: (val) => `${Number(val ?? 0).toFixed(0)} MB/s`,
        },
      },
      grid: { borderColor: "#2a3140" },
      tooltip: {
        theme: "dark",
        y: {
          formatter: (val) => `${Number(val ?? 0).toFixed(2)} MB/s`,
        },
      },
      colors,
      legend: { show: false },
      responsive: [
        {
          breakpoint: 1000,
          options: {
            chart: {
              height: 220,
            },
          },
        },
      ],
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
  }, 0);

  const verdictRaw = typeof hr.verdict === "string" ? hr.verdict : "";
  const verdictLabel = verdictRaw
    ? verdictRaw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : "-";
  const verdictVariant = (() => {
    const lower = verdictRaw.toLowerCase();
    if (!lower) return undefined;
    if (lower.includes("excellent")) return "ok";
    if (lower.includes("good")) return "info";
    if (lower.includes("fair")) return "warn";
    if (lower.includes("poor") || lower.includes("bad")) return "fail";
    return undefined;
  })();

  const testModeLabel =
    {
      full: "Full Benchmark",
      random_read: "Random Read Only",
      sequential_read: "Sequential Read Only",
      sequential_write: "Sequential Write Only",
      flush: "Flush Test",
    }[s.test_mode] || s.test_mode;

  // Helper functions with performance-based color variants
  const formatMBps = (val) => {
    if (val == null) return "-";
    const num = Number(val);
    if (!Number.isFinite(num)) return "-";
    return `${num.toFixed(1)} MB/s`;
  };

  const getSpeedVariant = (mbps, type = "sequential") => {
    if (mbps == null) return undefined;
    const speed = Number(mbps);
    if (!Number.isFinite(speed)) return undefined;

    if (type === "sequential") {
      // Sequential thresholds for repair technicians
      if (speed >= 3000) return "ok"; // NVMe Gen3+ (3000+ MB/s)
      if (speed >= 500) return "info"; // SATA SSD (500-3000 MB/s)
      if (speed >= 250) return "warn"; // Slow SSD or fast HDD (250-500 MB/s)
      return "fail"; // HDD or failing drive (< 250 MB/s)
    } else {
      // Random read thresholds
      if (speed >= 500) return "ok"; // Excellent random performance
      if (speed >= 100) return "info"; // Good SSD performance
      if (speed >= 50) return "warn"; // Marginal performance
      return "fail"; // Poor/HDD-like performance
    }
  };

  const formatLatency = (val) => {
    if (val == null) return "-";
    const num = Number(val);
    if (!Number.isFinite(num)) return "-";
    return `${num.toFixed(3)} ms`;
  };

  const getLatencyVariant = (latency) => {
    if (latency == null) return undefined;
    const ms = Number(latency);
    if (!Number.isFinite(ms)) return undefined;

    // Latency thresholds (lower is better)
    if (ms <= 0.5) return "ok"; // Excellent (NVMe)
    if (ms <= 2.0) return "info"; // Good (SATA SSD)
    if (ms <= 10.0) return "warn"; // Marginal (slow SSD)
    return "fail"; // Poor (HDD or failing drive)
  };

  const formatScore = (val) => {
    if (val == null) return "-";
    const num = Number(val);
    if (!Number.isFinite(num)) return "-";
    return num.toFixed(1);
  };

  const getOverallScoreVariant = (score) => {
    if (score == null) return undefined;
    const s = Number(score);
    if (!Number.isFinite(s)) return undefined;

    // Overall score thresholds (0-100 scale)
    if (s >= 85) return "ok"; // Excellent
    if (s >= 70) return "info"; // Good
    if (s >= 50) return "warn"; // Fair/concerning
    return "fail"; // Poor/needs attention
  };

  const notes = Array.isArray(hr.notes) ? hr.notes : [];
  const notePills = notes
    .map((note) => {
      if (note == null) return null;
      const text = String(note);
      const lower = text.toLowerCase();
      let variant = "info";
      if (lower.includes("excellent") || lower.includes("great")) {
        variant = "ok";
      } else if (
        lower.includes("slow") ||
        lower.includes("poor") ||
        lower.includes("high latency")
      ) {
        variant = "fail";
      } else if (lower.includes("hdd")) {
        variant = "warn";
      }
      return pill(text, variant);
    })
    .filter(Boolean);

  return html`
    <div class="card winsat">
      ${renderHeader(`Disk Benchmark (WinSAT) - ${s.drive || ""}`, res.status)}
      <div class="winsat-layout">
        <div class="winsat-kpis">
          <div class="winsat-meta muted small">
            <div class="winsat-meta-row">
              <span class="lab">Test Mode</span>
              <span class="val">${testModeLabel}</span>
            </div>
            <div class="winsat-meta-row">
              <span class="lab">Duration</span>
              <span class="val"
                >${s.duration_seconds != null
                  ? `${s.duration_seconds}s`
                  : "-"}</span
              >
            </div>
          </div>
          <div class="winsat-kpi-grid">
            ${kpiBox(
              "Overall Score",
              hr.score != null ? `${hr.score}/100` : "-",
              getOverallScoreVariant(hr.score)
            )}
            ${kpiBox("Verdict", verdictLabel, verdictVariant)}
            ${r.random_read_mbps != null
              ? kpiBox(
                  "Random Read",
                  formatMBps(r.random_read_mbps),
                  getSpeedVariant(r.random_read_mbps, "random")
                )
              : ""}
            ${r.sequential_read_mbps != null
              ? kpiBox(
                  "Sequential Read",
                  formatMBps(r.sequential_read_mbps),
                  getSpeedVariant(r.sequential_read_mbps, "sequential")
                )
              : ""}
            ${r.sequential_write_mbps != null
              ? kpiBox(
                  "Sequential Write",
                  formatMBps(r.sequential_write_mbps),
                  getSpeedVariant(r.sequential_write_mbps, "sequential")
                )
              : ""}
          </div>
        </div>
        <div class="winsat-chart">
          ${metrics.length
            ? html`<div id=${chartId}></div>`
            : html`<div class="muted small">
                No throughput data available for chart.
              </div>`}
        </div>
      </div>

      ${notePills.length ? html`<div class="pill-row">${notePills}</div>` : ""}
      ${r.latency_95th_percentile_ms != null ||
      r.latency_max_ms != null ||
      r.avg_read_time_seq_writes_ms != null
        ? html`
            <div class="winsat-latency">
              <div class="section-title small">Latency Metrics</div>
              <div class="kpi-row">
                ${r.latency_95th_percentile_ms != null
                  ? kpiBox(
                      "95th Percentile",
                      formatLatency(r.latency_95th_percentile_ms),
                      getLatencyVariant(r.latency_95th_percentile_ms)
                    )
                  : ""}
                ${r.latency_max_ms != null
                  ? kpiBox(
                      "Max Latency",
                      formatLatency(r.latency_max_ms),
                      getLatencyVariant(r.latency_max_ms)
                    )
                  : ""}
                ${r.avg_read_time_seq_writes_ms != null
                  ? kpiBox(
                      "Avg Read (Seq Writes)",
                      formatLatency(r.avg_read_time_seq_writes_ms),
                      getLatencyVariant(r.avg_read_time_seq_writes_ms)
                    )
                  : ""}
                ${r.avg_read_time_random_writes_ms != null
                  ? kpiBox(
                      "Avg Read (Random Writes)",
                      formatLatency(r.avg_read_time_random_writes_ms),
                      getLatencyVariant(r.avg_read_time_random_writes_ms)
                    )
                  : ""}
              </div>
            </div>
          `
        : ""}
      ${r.random_read_score != null ||
      r.sequential_read_score != null ||
      r.sequential_write_score != null
        ? html`
            <div class="winsat-scores">
              <div class="section-title small">WinSAT Scores</div>
              <div class="kpi-row">
                ${r.random_read_score != null
                  ? kpiBox("Random Read", formatScore(r.random_read_score))
                  : ""}
                ${r.sequential_read_score != null
                  ? kpiBox(
                      "Sequential Read",
                      formatScore(r.sequential_read_score)
                    )
                  : ""}
                ${r.sequential_write_score != null
                  ? kpiBox(
                      "Sequential Write",
                      formatScore(r.sequential_write_score)
                    )
                  : ""}
                ${r.avg_read_time_seq_writes_score != null
                  ? kpiBox(
                      "Seq Writes",
                      formatScore(r.avg_read_time_seq_writes_score)
                    )
                  : ""}
                ${r.latency_95th_percentile_score != null
                  ? kpiBox(
                      "95th %ile",
                      formatScore(r.latency_95th_percentile_score)
                    )
                  : ""}
                ${r.latency_max_score != null
                  ? kpiBox("Max Latency", formatScore(r.latency_max_score))
                  : ""}
                ${r.avg_read_time_random_writes_score != null
                  ? kpiBox(
                      "Random Writes",
                      formatScore(r.avg_read_time_random_writes_score)
                    )
                  : ""}
              </div>
            </div>
          `
        : ""}
      ${s.stdout_excerpt || s.stderr_excerpt
        ? html`
            <details class="output">
              <summary>View WinSAT raw output</summary>
              ${s.stdout_excerpt ? html`<pre>${s.stdout_excerpt}</pre>` : ""}
              ${s.stderr_excerpt ? html`<pre>${s.stderr_excerpt}</pre>` : ""}
            </details>
          `
        : ""}
    </div>
  `;
}
