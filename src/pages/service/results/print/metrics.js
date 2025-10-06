/**
 * @typedef {import('./types').ServiceTaskResult} ServiceTaskResult
 */

/**
 * Extract customer-friendly metrics from an array of task results.
 * @param {ServiceTaskResult[]} results
 * @returns {Array<{icon: string, label: string, value: string, detail?: string, variant: 'success' | 'info'}>}
 */
export function extractCustomerMetrics(results) {
  const metrics = [];

  let totalThreatsRemoved = 0;
  let spaceRecovered = 0;
  let filesDeleted = 0;
  let systemHealthChecked = false;
  let driveHealthChecked = false;
  let performanceTest = false;

  results.forEach((result) => {
    const type = result?.task_type || result?.type || "";
    const summary = result?.summary || {};
    const status = result?.status || "";

    if (type === "kvrt_scan" && summary.detections) {
      totalThreatsRemoved += Array.isArray(summary.detections)
        ? summary.detections.length
        : 0;
    }

    if (type === "adwcleaner_clean" && summary.quarantined) {
      totalThreatsRemoved += summary.quarantined || 0;
    }

    if (type === "bleachbit_clean" && summary.space_recovered_bytes) {
      spaceRecovered += summary.space_recovered_bytes || 0;
      filesDeleted += summary.files_deleted || 0;
    }

    if (
      (type === "sfc_scan" || type === "dism_health_check") &&
      status === "success"
    ) {
      systemHealthChecked = true;
    }

    if (type === "smartctl_report" && status === "success") {
      driveHealthChecked = true;
    }

    if (
      (type === "winsat_disk" ||
        type === "heavyload_stress_test" ||
        type === "furmark_stress_test") &&
      status === "success"
    ) {
      performanceTest = true;
    }
  });

  if (totalThreatsRemoved > 0) {
    metrics.push({
      icon: "🛡️",
      label: "Threats Removed",
      value: totalThreatsRemoved.toString(),
      detail: "Viruses, malware, and unwanted software",
      variant: "success",
    });
  }

  if (spaceRecovered > 0) {
    const gb = (spaceRecovered / 1024 ** 3).toFixed(2);
    metrics.push({
      icon: "🧹",
      label: "Space Recovered",
      value: `${gb} GB`,
      detail: `${filesDeleted.toLocaleString()} junk files removed`,
      variant: "success",
    });
  }

  if (systemHealthChecked) {
    metrics.push({
      icon: "✅",
      label: "System Health",
      value: "Verified",
      detail: "System files checked and repaired",
      variant: "info",
    });
  }

  if (driveHealthChecked) {
    metrics.push({
      icon: "💾",
      label: "Drive Health",
      value: "Checked",
      detail: "Storage drives analyzed",
      variant: "info",
    });
  }

  if (performanceTest) {
    metrics.push({
      icon: "⚡",
      label: "Performance",
      value: "Tested",
      detail: "System performance verified",
      variant: "info",
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
