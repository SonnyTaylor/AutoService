/**
 * @typedef {import('./types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('./types').CustomerMetric} CustomerMetric
 */

/**
 * Extract customer-friendly metrics from an array of task results.
 * @param {ServiceTaskResult[]} results
 * @returns {CustomerMetric[]}
 */
export function extractCustomerMetrics(results) {
  const metrics = [];

  let totalThreatsRemoved = 0;
  let threatDetails = [];
  let spaceRecovered = 0;
  let filesDeleted = 0;
  let driveHealthData = [];
  let systemHealthIssues = [];
  let performanceResults = [];
  let speedTestResults = null;
  let networkLatency = null;

  results.forEach((result) => {
    const type = result?.task_type || result?.type || "";
    const summary = result?.summary || {};
    const status = result?.status || "";

    // Virus/Malware removal
    if (type === "kvrt_scan") {
      const detections = Array.isArray(summary.detections)
        ? summary.detections
        : [];
      totalThreatsRemoved += detections.length;
      if (detections.length > 0) {
        threatDetails.push({
          source: "Kaspersky Scan",
          count: detections.length,
          threats: detections
            .slice(0, 5)
            .map((d) => d?.threat || "Unknown threat"),
        });
      }
    }

    if (type === "adwcleaner_clean") {
      const quarantined = summary.quarantined || 0;
      totalThreatsRemoved += quarantined;
      if (quarantined > 0) {
        threatDetails.push({
          source: "AdwCleaner",
          count: quarantined,
          types: ["Adware", "PUPs", "Browser hijackers"],
        });
      }
    }

    // Disk cleanup
    if (type === "bleachbit_clean") {
      spaceRecovered += summary.space_recovered_bytes || 0;
      filesDeleted += summary.files_deleted || 0;
    }

    // System health
    if (type === "sfc_scan") {
      if (status === "success") {
        const violations = summary.integrity_violations;
        const repairs = summary.repairs_attempted;
        if (violations === false) {
          systemHealthIssues.push("System files: No issues found");
        } else if (violations === true) {
          systemHealthIssues.push(
            `System files: ${
              repairs ? "Issues found and repaired" : "Issues found"
            }`
          );
        }
      }
    }

    if (type === "dism_health_check") {
      if (status === "success") {
        const steps = Array.isArray(summary.steps) ? summary.steps : [];
        const checkHealth = steps.find(
          (s) => s.action === "checkhealth"
        )?.parsed;
        const restoreHealth = steps.find(
          (s) => s.action === "restorehealth"
        )?.parsed;

        if (checkHealth?.health_state === "healthy") {
          systemHealthIssues.push("Windows image: Healthy");
        } else if (checkHealth?.health_state === "repairable") {
          const repaired = restoreHealth?.message
            ?.toLowerCase()
            .includes("operation completed successfully");
          systemHealthIssues.push(
            `Windows image: ${repaired ? "Repaired" : "Corruption found"}`
          );
        }
      }
    }

    // Drive health
    if (type === "smartctl_report" && status === "success") {
      const drives = Array.isArray(summary.drives) ? summary.drives : [];
      drives.forEach((drive) => {
        const healthPercent =
          drive.wear_level_percent_used != null
            ? 100 - drive.wear_level_percent_used
            : null;
        driveHealthData.push({
          model: drive.model_name || drive.name || "Unknown Drive",
          health: healthPercent,
          passed: drive.health_passed,
          temp: drive.temperature,
          powerOnHours: drive.power_on_hours,
        });
      });
    }

    // Performance tests
    if (type === "heavyload_stress_test" && status === "success") {
      const modes = [];
      if (summary.stress_cpu) modes.push("CPU");
      if (summary.stress_memory) modes.push("RAM");
      if (summary.stress_gpu) modes.push("GPU");
      if (summary.stress_disk) modes.push("Disk");
      performanceResults.push({
        test: "Stress Test",
        components: modes.join(" + "),
        result: summary.exit_code === 0 ? "Passed" : "Completed",
        duration: summary.duration_minutes,
      });
    }

    if (type === "furmark_stress_test" && status === "success") {
      performanceResults.push({
        test: "GPU Stress Test",
        components: "Graphics Card",
        result: "Completed",
      });
    }

    if (type === "winsat_disk" && status === "success") {
      const hr = summary.human_readable || {};
      performanceResults.push({
        test: "Disk Benchmark",
        drive: summary.drive,
        score: hr.score,
        verdict: hr.verdict,
      });
    }

    // Network tests
    if (type === "speedtest" && status === "success") {
      const hr = summary.human_readable || {};
      speedTestResults = {
        download: hr.download_mbps,
        upload: hr.upload_mbps,
        ping: hr.ping_ms,
        verdict: hr.verdict,
      };
    }

    if (type === "ping_test" && status === "success") {
      const lat = summary.latency_ms || {};
      networkLatency = {
        host: summary.host,
        avg: lat.avg,
        loss: summary.packets?.loss_percent,
      };
    }
  });

  // Build metrics array with detailed information
  if (totalThreatsRemoved > 0) {
    const items = threatDetails.map((td) => {
      if (td.threats) {
        return `${td.source}: ${td.threats.join(", ")}${
          td.count > 5 ? ` (+${td.count - 5} more)` : ""
        }`;
      }
      return `${td.source}: ${td.count} items (${td.types?.join(", ")})`;
    });

    metrics.push({
      icon: "🛡️",
      label: "Viruses Removed",
      value: totalThreatsRemoved.toString(),
      detail: threatDetails.map((t) => t.source).join(", "),
      variant: "success",
      items: items.length > 0 ? items : undefined,
    });
  }

  if (spaceRecovered > 0) {
    const gb = (spaceRecovered / 1024 ** 3).toFixed(2);
    metrics.push({
      icon: "🧹",
      label: "Junk Files Cleaned",
      value: `${gb} GB`,
      detail: `${filesDeleted.toLocaleString()} files removed`,
      variant: "success",
    });
  }

  if (driveHealthData.length > 0) {
    const items = driveHealthData.map((d) => {
      const healthStr =
        d.health != null ? `${Math.round(d.health)}% health` : "Health checked";
      const tempStr = d.temp ? `, ${d.temp}` : "";
      const hoursStr = d.powerOnHours ? `, ${d.powerOnHours}h runtime` : "";
      return `${d.model}: ${healthStr}${tempStr}${hoursStr}`;
    });

    const avgHealth =
      driveHealthData.filter((d) => d.health != null).length > 0
        ? Math.round(
            driveHealthData
              .filter((d) => d.health != null)
              .reduce((sum, d) => sum + d.health, 0) /
              driveHealthData.filter((d) => d.health != null).length
          )
        : null;

    metrics.push({
      icon: "💾",
      label: "Hard Drive Health",
      value: avgHealth != null ? `${avgHealth}% avg` : "Checked",
      detail: `${driveHealthData.length} drive${
        driveHealthData.length !== 1 ? "s" : ""
      } analyzed`,
      variant: avgHealth && avgHealth < 80 ? "success" : "info",
      items,
    });
  }

  if (systemHealthIssues.length > 0) {
    metrics.push({
      icon: "✅",
      label: "System Health",
      value: "Verified",
      detail: `${systemHealthIssues.length} check${
        systemHealthIssues.length !== 1 ? "s" : ""
      } performed`,
      variant: "info",
      items: systemHealthIssues,
    });
  }

  if (performanceResults.length > 0) {
    const items = performanceResults.map((p) => {
      if (p.score != null) {
        return `${p.test} (${p.drive}): ${p.score}/100 - ${p.verdict || ""}`;
      }
      const duration = p.duration ? ` for ${p.duration} min` : "";
      return `${p.test} (${p.components}): ${p.result}${duration}`;
    });

    metrics.push({
      icon: "⚡",
      label: "Performance Tests",
      value: `${performanceResults.length} test${
        performanceResults.length !== 1 ? "s" : ""
      }`,
      detail: "System stress tested",
      variant: "info",
      items,
    });
  }

  if (speedTestResults) {
    const items = [
      `Download: ${speedTestResults.download?.toFixed(1) || "?"} Mbps`,
      `Upload: ${speedTestResults.upload?.toFixed(1) || "?"} Mbps`,
      `Ping: ${speedTestResults.ping?.toFixed(0) || "?"} ms`,
    ];
    if (speedTestResults.verdict) {
      items.push(`Quality: ${speedTestResults.verdict}`);
    }

    metrics.push({
      icon: "🌐",
      label: "Internet Speed",
      value:
        speedTestResults.download != null
          ? `${speedTestResults.download.toFixed(1)} Mbps`
          : "Tested",
      detail: "Download speed",
      variant: "info",
      items,
    });
  }

  if (networkLatency) {
    metrics.push({
      icon: "📡",
      label: "Network Latency",
      value:
        networkLatency.avg != null
          ? `${Math.round(networkLatency.avg)} ms`
          : "Tested",
      detail: `Ping to ${networkLatency.host || "server"}`,
      variant: "info",
      items:
        networkLatency.loss != null
          ? [`Packet loss: ${networkLatency.loss}%`]
          : undefined,
    });
  }

  if (metrics.length === 0) {
    metrics.push({
      icon: "✓",
      label: "Service Completed",
      value: `${results.length} tasks`,
      detail: "Maintenance tasks performed",
      variant: "info",
    });
  }

  return metrics;
}

/**
 * Convert task results into a simple customer-facing list.
 * @param {ServiceTaskResult[]} results
 * @returns {string}
 */
export function buildCustomerTaskList(results) {
  const taskNames = {
    bleachbit_clean: "System Cleanup & Junk File Removal",
    adwcleaner_clean: "Adware & Malware Removal",
    kvrt_scan: "Virus Scan & Removal",
    sfc_scan: "System File Integrity Check",
    dism_health_check: "System Health Verification",
    smartctl_report: "Hard Drive Health Analysis",
    chkdsk_scan: "Disk Error Check & Repair",
    heavyload_stress_test: "CPU & RAM Stress Test",
    furmark_stress_test: "Graphics Card Stress Test",
    winsat_disk: "Disk Performance Test",
    speedtest: "Internet Speed Test",
    ping_test: "Network Connectivity Test",
    windows_update: "Windows Updates",
    whynotwin11_check: "Windows 11 Compatibility Check",
    ai_startup_disable: "Startup Optimization",
  };

  return results
    .filter((r) => r.status !== "skipped")
    .map((result) => {
      const type = result?.task_type || result?.type || "unknown";
      const name =
        taskNames[type] ||
        type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      const status = result?.status || "";
      const icon =
        status === "success" ? "✓" : status === "failure" ? "⚠" : "•";
      return `<li><span class="task-icon ${status}">${icon}</span> ${name}</li>`;
    })
    .join("");
}

/**
 * Generate customer-facing recommendations based on task outcomes.
 * @param {ServiceTaskResult[]} results
 * @returns {string}
 */
export function generateRecommendations(results) {
  const recommendations = [];

  const hasFailures = results.some((r) => r.status === "failure");
  const hasThreats = results.some(
    (r) =>
      (r.task_type === "kvrt_scan" && r.summary?.detections?.length > 0) ||
      (r.task_type === "adwcleaner_clean" && r.summary?.quarantined > 0)
  );

  if (hasThreats) {
    recommendations.push(
      "• Run a full system scan regularly to maintain security"
    );
  }

  recommendations.push("• Keep Windows and your applications up to date");
  recommendations.push("• Perform regular maintenance every 3-6 months");
  recommendations.push("• Back up important files regularly");

  if (hasFailures) {
    recommendations.push(
      "• Some tasks encountered issues - contact support if problems persist"
    );
  }

  return recommendations.map((r) => `<p>${r}</p>`).join("");
}
