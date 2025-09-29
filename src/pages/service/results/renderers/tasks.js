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
  return html`
    <div class="card speedtest">
      ${renderHeader("Internet Speed Test", res.status)}
      <div class="kpi-row">
        ${kpiBox("Download", fmtMbps(h.download_mbps))}
        ${kpiBox("Upload", fmtMbps(h.upload_mbps))}
        ${kpiBox("Ping", fmtMs(h.ping_ms))}
        ${kpiBox("Jitter", h.jitter_ms == null ? "-" : fmtMs(h.jitter_ms))}
        ${kpiBox("Rating", h.rating_stars != null ? `${h.rating_stars}★` : "-")}
      </div>
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
        ${kpiBox("Verdict", (info.Verdict || "").toString())}
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
          ? map(
              drives,
              (d) => html`
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
                    ${kpiBox("Temp", d.temperature || "-")}
                    ${kpiBox(
                      "Power On Hrs",
                      d.power_on_hours != null ? String(d.power_on_hours) : "-"
                    )}
                    ${kpiBox(
                      "Power Cycles",
                      d.power_cycles != null ? String(d.power_cycles) : "-"
                    )}
                    ${d.wear_level_percent_used != null
                      ? kpiBox(
                          "Drive Health",
                          `${100 - d.wear_level_percent_used}%`
                        )
                      : ""}
                    ${d.data_written_human
                      ? kpiBox("Data Written", d.data_written_human)
                      : ""}
                    ${d.data_read_human
                      ? kpiBox("Data Read", d.data_read_human)
                      : ""}
                    ${d.media_errors != null
                      ? kpiBox("Media Errors", String(d.media_errors))
                      : ""}
                    ${d.unsafe_shutdowns != null
                      ? kpiBox("Unsafe Shutdowns", String(d.unsafe_shutdowns))
                      : ""}
                    ${d.error_log_entries != null
                      ? kpiBox("Error Log", String(d.error_log_entries))
                      : ""}
                  </div>
                </div>
              `
            )
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

  setTimeout(() => {
    const chartEl = document.getElementById(`ping-chart-${index}`);
    if (chartEl && lat.avg != null) {
      const getPingColor = (ping) => {
        if (ping == null) return "#4f8cff";
        if (ping < 30) return "#2f6b4a";
        if (ping < 60) return "#4f8cff";
        if (ping < 100) return "#6b422b";
        return "#7a3333";
      };

      const options = {
        chart: { type: "bar", height: 120, toolbar: { show: false } },
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
          ${kpiBox("Stability", `${hr.stability_score || "?"}/100`)}
          ${kpiBox(
            "Jitter (StDev)",
            stats.stdev != null ? fmtMs(stats.stdev) : "-"
          )}
        </div>
        <div class="ping-chart">
          ${lat.avg != null
            ? html`<div id="ping-chart-${index}"></div>`
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
  const label = s.stress_cpu
    ? "CPU Stress (HeavyLoad)"
    : s.stress_memory
    ? "RAM Stress (HeavyLoad)"
    : s.stress_gpu
    ? "GPU Stress (HeavyLoad)"
    : "HeavyLoad Stress";
  return html`
    <div class="card heavyload">
      ${renderHeader(label, res.status)}
      <div class="kpi-row">
        ${kpiBox(
          "Duration",
          s.duration_minutes != null ? `${s.duration_minutes} min` : "-"
        )}
        ${kpiBox("Exit Code", s.exit_code != null ? String(s.exit_code) : "-")}
      </div>
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
  return html`
    <div class="card wn11">
      ${renderHeader("Windows 11 Compatibility", res.status)}
      <div class="kpi-row">
        ${kpiBox("Hostname", s.hostname || "-")}
        ${kpiBox("Ready", s.ready ? "Yes" : "No")} ${kpiBox("Passing", passing)}
        ${kpiBox("Failing", failing)}
      </div>
      <div class="pill-row">
        ${map(s.failing_checks || [], (c) => pill(c, "fail"))}
        ${map(s.passing_checks || [], (c) => pill(c, "ok"))}
      </div>
    </div>
  `;
}

function renderWindowsUpdate(res, index) {
  return renderGeneric(res, index);
}
