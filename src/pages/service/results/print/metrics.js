/**
 * @typedef {import('./types').ServiceTaskResult} ServiceTaskResult
 * @typedef {import('./types').CustomerMetric} CustomerMetric
 */

// =============================================================================
// HANDLER INTEGRATION (NEW SYSTEM)
// =============================================================================

// Import handler metric extractors
import { getCustomerMetricExtractors } from "../../handlers/index.js";

// =============================================================================
// LEGACY PROCESSING FUNCTIONS (TO BE MIGRATED)
// =============================================================================

/**
 * MIGRATION NOTE:
 * As handlers are migrated, the extractCustomerMetrics function below should
 * check for handler-based extractors first, then fall back to legacy processing.
 *
 * See docs/HANDLER_MIGRATION_GUIDE.md section "Update Metrics" for integration pattern.
 */

// =============================================================================
// SECURITY & THREAT PROCESSING
// =============================================================================

/**
 * Process Kaspersky virus scan results.
 * @private
 * @param {object} summary - Task summary containing detection data
 * @returns {{count: number, detail: object|null}} Threat count and details
 */
function processKVRTScan(summary) {
  const detections = Array.isArray(summary.detections)
    ? summary.detections
    : [];

  // Only count actually removed threats (exclude explicitly skipped ones)
  // If no action is specified, assume it was handled
  const removedDetections = detections.filter((d) => {
    const action = d?.action;
    // If action exists and is "Skip", exclude it
    if (action && ["Skip", "skip", "SKIP"].includes(action)) {
      return false;
    }
    // Otherwise include it (either has removal action or no action field means old format/removed)
    return true;
  });

  if (removedDetections.length === 0) {
    return { count: 0, detail: null };
  }

  return {
    count: removedDetections.length,
    detail: {
      source: "Virus Scan",
      count: removedDetections.length,
      detections: removedDetections,
    },
  };
}

/**
 * Process AdwCleaner malware removal results.
 * @private
 * @param {object} summary - Task summary containing quarantine data
 * @returns {{count: number, detail: object|null}} Threat count and details
 */
function processAdwCleanerScan(summary) {
  const cleaned = summary.cleaned || 0;

  if (cleaned === 0) {
    return { count: 0, detail: null };
  }

  // For customer view, trust the cleaned count and show high-level categories
  // Count items in each category (including "Needs Reboot" since they WERE cleaned)
  const getLen = (arr) => (Array.isArray(arr) ? arr.length : 0);

  const browserHits = summary.browsers
    ? Object.values(summary.browsers).reduce(
        (sum, v) => sum + (Array.isArray(v) ? v.length : 0),
        0
      )
    : 0;

  // Build category breakdown - show what was addressed
  const categories = [];
  const registryCount = getLen(summary.registry);
  const filesCount = getLen(summary.files);
  const foldersCount = getLen(summary.folders);
  const servicesCount = getLen(summary.services);
  const tasksCount = getLen(summary.tasks);
  const shortcutsCount = getLen(summary.shortcuts);
  const dllsCount = getLen(summary.dlls);
  const wmiCount = getLen(summary.wmi);
  const preinstalledCount = getLen(summary.preinstalled);

  // Add categories with friendly names
  if (registryCount > 0)
    categories.push({ label: "Registry entries", count: registryCount });
  if (filesCount > 0) categories.push({ label: "Files", count: filesCount });
  if (foldersCount > 0)
    categories.push({ label: "Programs/folders", count: foldersCount });
  if (servicesCount > 0)
    categories.push({ label: "Services", count: servicesCount });
  if (tasksCount > 0)
    categories.push({ label: "Scheduled tasks", count: tasksCount });
  if (shortcutsCount > 0)
    categories.push({ label: "Shortcuts", count: shortcutsCount });
  if (dllsCount > 0)
    categories.push({ label: "System files", count: dllsCount });
  if (wmiCount > 0)
    categories.push({ label: "System entries", count: wmiCount });
  if (browserHits > 0)
    categories.push({ label: "Browser extensions", count: browserHits });
  if (preinstalledCount > 0)
    categories.push({ label: "Unwanted apps", count: preinstalledCount });

  return {
    count: cleaned,
    detail: {
      source: "Adware & PUP Removal",
      count: cleaned,
      categories: categories,
    },
  };
}

// =============================================================================
// DISK & CLEANUP PROCESSING
// =============================================================================

/**
 * Process BleachBit disk cleanup results.
 * @private
 * @param {object} summary - Task summary containing cleanup statistics
 * @returns {{spaceRecovered: number, filesDeleted: number}} Cleanup statistics
 */
function processDiskCleanup(summary) {
  return {
    spaceRecovered: summary.space_recovered_bytes || 0,
    filesDeleted: summary.files_deleted || 0,
  };
}

/**
 * Process CHKDSK disk scan results.
 * @private
 * @param {object} summary - Task summary containing disk scan data
 * @param {string} status - Task execution status
 * @returns {string|null} Human-readable health status
 */
function processCHKDSKScan(summary, status) {
  if (status !== "success") return null;

  const drive = summary.drive || "Unknown drive";
  const mode = summary.mode || "unknown";

  if (summary.found_no_problems) {
    return `${drive}: No problems found`;
  }

  if (summary.made_corrections) {
    return `${drive}: Errors found and corrected`;
  }

  if (summary.scheduled) {
    return `${drive}: Scan scheduled for next boot`;
  }

  // If we have bad sectors or other issues but no corrections made
  if (summary.bad_sectors_kb && summary.bad_sectors_kb > 0) {
    return `${drive}: Bad sectors detected`;
  }

  return null;
}

// =============================================================================
// SYSTEM HEALTH PROCESSING
// =============================================================================

/**
 * Process System File Checker (SFC) scan results.
 * @private
 * @param {object} summary - Task summary containing integrity data
 * @param {string} status - Task execution status
 * @returns {string|null} Human-readable health status
 */
function processSFCScan(summary, status) {
  if (status !== "success") return null;

  const violations = summary.integrity_violations;
  const repairs = summary.repairs_attempted;

  if (violations === false) {
    return "System files: No issues found";
  } else if (violations === true) {
    return `System files: ${
      repairs ? "Issues found and repaired" : "Issues found"
    }`;
  }

  return null;
}

/**
 * Process DISM health check results.
 * @private
 * @param {object} summary - Task summary containing DISM steps
 * @param {string} status - Task execution status
 * @returns {string|null} Human-readable health status
 */
function processDISMHealthCheck(summary, status) {
  if (status !== "success") return null;

  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const checkHealth = steps.find((s) => s.action === "checkhealth")?.parsed;
  const restoreHealth = steps.find((s) => s.action === "restorehealth")?.parsed;

  if (checkHealth?.health_state === "healthy") {
    return "Windows image: Healthy";
  } else if (checkHealth?.health_state === "repairable") {
    const repaired = restoreHealth?.message
      ?.toLowerCase()
      .includes("operation completed successfully");
    return `Windows image: ${repaired ? "Repaired" : "Corruption found"}`;
  }

  return null;
}

// =============================================================================
// DRIVE HEALTH PROCESSING
// =============================================================================

/**
 * Process SMART drive health data.
 * @private
 * @param {object} summary - Task summary containing drive information
 * @param {string} status - Task execution status
 * @returns {Array<object>} Array of drive health data
 */
function processDriveHealth(summary, status) {
  if (status !== "success") return [];

  const drives = Array.isArray(summary.drives) ? summary.drives : [];

  return drives.map((drive) => {
    const healthPercent =
      drive.wear_level_percent_used != null
        ? 100 - drive.wear_level_percent_used
        : null;

    return {
      model: drive.model_name || drive.name || "Unknown Drive",
      health: healthPercent,
      passed: drive.health_passed,
      temp: drive.temperature,
      powerOnHours: drive.power_on_hours,
    };
  });
}

// =============================================================================
// PERFORMANCE TEST PROCESSING
// =============================================================================

/**
 * Process HeavyLoad stress test results.
 * @private
 * @param {object} summary - Task summary containing stress test data
 * @param {string} status - Task execution status
 * @returns {object|null} Performance test result
 */
function processHeavyLoadTest(summary, status) {
  if (status !== "success") return null;

  const modes = [];
  if (summary.stress_cpu) modes.push("CPU");
  if (summary.stress_memory) modes.push("RAM");
  if (summary.stress_gpu) modes.push("GPU");
  if (summary.stress_disk) modes.push("Disk");

  return {
    test: "Stress Test",
    components: modes.join(" + "),
    result: summary.exit_code === 0 ? "Passed" : "Completed",
    duration: summary.duration_minutes,
  };
}

/**
 * Process FurMark GPU stress test results.
 * @private
 * @param {string} status - Task execution status
 * @returns {object|null} Performance test result
 */
function processFurMarkTest(status) {
  if (status !== "success") return null;

  return {
    test: "GPU Stress Test",
    components: "Graphics Card",
    result: "Completed",
  };
}

/**
 * Process WinSAT disk benchmark results.
 * @private
 * @param {object} summary - Task summary containing benchmark data
 * @param {string} status - Task execution status
 * @returns {object|null} Performance test result
 */
function processWinSATDisk(summary, status) {
  if (status !== "success") return null;

  const hr = summary.human_readable || {};

  return {
    test: "Disk Benchmark",
    drive: summary.drive,
    score: hr.score,
    verdict: hr.verdict,
  };
}

// =============================================================================
// NETWORK TEST PROCESSING
// =============================================================================

/**
 * Process internet speed test results.
 * @private
 * @param {object} summary - Task summary containing speed test data
 * @param {string} status - Task execution status
 * @returns {object|null} Speed test results
 */
function processSpeedTest(summary, status) {
  if (status !== "success") return null;

  const hr = summary.human_readable || {};

  return {
    download: hr.download_mbps,
    upload: hr.upload_mbps,
    ping: hr.ping_ms,
    verdict: hr.verdict,
  };
}

// processPingTest: MIGRATED TO handlers/ping_test/index.js

/**
 * Process iPerf network throughput test results.
 * @private
 * @param {object} summary - Task summary containing throughput data
 * @param {string} status - Task execution status
 * @returns {object|null} Network throughput results
 */
function processIPerfTest(summary, status) {
  if (status !== "success") return null;

  const hr = summary.human_readable || {};
  const throughputData = hr.throughput || {};

  return {
    server: summary.server,
    protocol: summary.protocol,
    throughput: throughputData.mean || null,
    stability: hr.stability_score,
    verdict: hr.verdict,
  };
}

// =============================================================================
// STORAGE USAGE PROCESSING
// =============================================================================

// processDiskSpaceReport: MIGRATED TO handlers/disk_space_report/index.js

// =============================================================================
// COMPATIBILITY & UPGRADE PROCESSING
// =============================================================================

/**
 * Process WhyNotWin11 compatibility check results.
 * @private
 * @param {object} summary - Task summary containing compatibility data
 * @param {string} status - Task execution status
 * @returns {object|null} Compatibility check results
 */
function processWhyNotWin11Check(summary, status) {
  if (status !== "success") return null;

  const checks = summary.checks || {};
  const passingCount = Object.values(checks).filter((v) => v === true).length;
  const totalCount = Object.keys(checks).length;

  return {
    ready: summary.ready,
    passingCount,
    totalCount,
    failingChecks: summary.failing_checks || [],
  };
}

/**
 * Process Windows Update results.
 * @private
 * @param {object} summary - Task summary containing update data
 * @param {string} status - Task execution status
 * @returns {object|null} Update installation results
 */
function processWindowsUpdate(summary, status) {
  if (status !== "success" && status !== "completed_with_errors") return null;

  const install = summary.install || {};
  const preScan = summary.pre_scan || {};
  const postScan = summary.post_scan || {};

  return {
    updatesAvailable: preScan.count_total || 0,
    updatesInstalled: install.count_installed || 0,
    updatesFailed: install.count_failed || 0,
    rebootRequired: summary.reboot_required || false,
    windowsUpdates: install.count_windows_installed || 0,
    driverUpdates: install.count_driver_installed || 0,
  };
}

// =============================================================================
// METRIC BUILDERS
// =============================================================================

/**
 * Build threat removal metric card.
 * @private
 * @param {number} totalThreats - Total number of threats removed
 * @param {Array<object>} threatDetails - Detailed threat information
 * @returns {CustomerMetric|null} Metric object or null if no threats
 */
function buildThreatMetric(totalThreats, threatDetails) {
  if (totalThreats === 0) return null;

  const items = [];

  threatDetails.forEach((td) => {
    if (td.detections) {
      // KVRT-style detections - show count and types
      const detectionTypes = new Set();
      td.detections.forEach((d) => {
        const threat = d?.threat || "";
        // Extract type from threat name (e.g., "Trojan", "Backdoor", "Adware")
        const match = threat.match(/^([^.:]+)/);
        if (match) {
          detectionTypes.add(match[1]);
        }
      });

      if (detectionTypes.size > 0) {
        items.push(
          `${td.count} ${Array.from(detectionTypes).join(", ")} threat${
            td.count !== 1 ? "s" : ""
          }`
        );
      } else {
        items.push(
          `${td.count} threat${td.count !== 1 ? "s" : ""} detected and removed`
        );
      }
    } else if (td.categories) {
      // AdwCleaner-style categories - break down by type
      if (td.categories.length > 0) {
        td.categories.forEach((cat) => {
          items.push(`${cat.count} ${cat.label}`);
        });
      }
    } else if (td.types) {
      // Generic types
      items.push(`${td.count} items (${td.types.join(", ")})`);
    } else {
      items.push(`${td.count} items removed`);
    }
  });

  // Create a clean, customer-friendly summary
  const detailParts = [];
  threatDetails.forEach((td) => {
    if (td.source) {
      detailParts.push(td.source);
    }
  });

  return {
    icon: "🛡️",
    label: "Security Threats Removed",
    value: totalThreats.toString(),
    detail: detailParts.join(" • "),
    variant: "success",
    items: items.length > 0 ? items : undefined,
  };
}

/**
 * Build disk cleanup metric card.
 * @private
 * @param {number} spaceRecovered - Bytes of space recovered
 * @param {number} filesDeleted - Number of files deleted
 * @returns {CustomerMetric|null} Metric object or null if no cleanup
 */
function buildCleanupMetric(spaceRecovered, filesDeleted) {
  if (spaceRecovered === 0) return null;

  const gb = (spaceRecovered / 1024 ** 3).toFixed(2);

  return {
    icon: "🧹",
    label: "Junk Files Cleaned",
    value: `${gb} GB`,
    detail: `${filesDeleted.toLocaleString()} files removed`,
    variant: "success",
  };
}

/**
 * Build drive health metric card.
 * @private
 * @param {Array<object>} driveHealthData - Array of drive health information
 * @returns {CustomerMetric|null} Metric object or null if no data
 */
function buildDriveHealthMetric(driveHealthData) {
  if (driveHealthData.length === 0) return null;

  const items = driveHealthData.map((d) => {
    const healthStr =
      d.health != null ? `${Math.round(d.health)}% health` : "Health checked";
    const tempStr = d.temp ? `, ${d.temp}` : "";
    const hoursStr = d.powerOnHours ? `, ${d.powerOnHours}h runtime` : "";
    return `${d.model}: ${healthStr}${tempStr}${hoursStr}`;
  });

  // Calculate average health percentage
  const drivesWithHealth = driveHealthData.filter((d) => d.health != null);
  const avgHealth =
    drivesWithHealth.length > 0
      ? Math.round(
          drivesWithHealth.reduce((sum, d) => sum + d.health, 0) /
            drivesWithHealth.length
        )
      : null;

  return {
    icon: "💾",
    label: "Hard Drive Health",
    value: avgHealth != null ? `${avgHealth}% avg` : "Checked",
    detail: `${driveHealthData.length} drive${
      driveHealthData.length !== 1 ? "s" : ""
    } analyzed`,
    variant: avgHealth && avgHealth < 80 ? "success" : "info",
    items,
  };
}

/**
 * Build system health metric card.
 * @private
 * @param {Array<string>} healthIssues - Array of health check results
 * @returns {CustomerMetric|null} Metric object or null if no checks
 */
function buildSystemHealthMetric(healthIssues) {
  if (healthIssues.length === 0) return null;

  return {
    icon: "✅",
    label: "System Health",
    value: "Verified",
    detail: `${healthIssues.length} check${
      healthIssues.length !== 1 ? "s" : ""
    } performed`,
    variant: "info",
    items: healthIssues,
  };
}

/**
 * Build performance tests metric card.
 * @private
 * @param {Array<object>} performanceResults - Array of performance test results
 * @returns {CustomerMetric|null} Metric object or null if no tests
 */
function buildPerformanceMetric(performanceResults) {
  if (performanceResults.length === 0) return null;

  const items = performanceResults.map((p) => {
    if (p.score != null) {
      return `${p.test} (${p.drive}): ${p.score}/100 - ${p.verdict || ""}`;
    }
    const duration = p.duration ? ` for ${p.duration} min` : "";
    return `${p.test} (${p.components}): ${p.result}${duration}`;
  });

  return {
    icon: "⚡",
    label: "Performance Tests",
    value: `${performanceResults.length} test${
      performanceResults.length !== 1 ? "s" : ""
    }`,
    detail: "System stress tested",
    variant: "info",
    items,
  };
}

/**
 * Build internet speed metric card.
 * @private
 * @param {object|null} speedTestResults - Speed test data
 * @returns {CustomerMetric|null} Metric object or null if no test
 */
function buildSpeedTestMetric(speedTestResults) {
  if (!speedTestResults) return null;

  const items = [
    `Download: ${speedTestResults.download?.toFixed(1) || "?"} Mbps`,
    `Upload: ${speedTestResults.upload?.toFixed(1) || "?"} Mbps`,
    `Ping: ${speedTestResults.ping?.toFixed(0) || "?"} ms`,
  ];

  if (speedTestResults.verdict) {
    items.push(`Quality: ${speedTestResults.verdict}`);
  }

  return {
    icon: "🌐",
    label: "Internet Speed",
    value:
      speedTestResults.download != null
        ? `${speedTestResults.download.toFixed(1)} Mbps`
        : "Tested",
    detail: "Download speed",
    variant: "info",
    items,
    keepAllItems: true,
  };
}

// buildNetworkLatencyMetric: MIGRATED TO handlers/ping_test/index.js

/**
 * Build network throughput metric card.
 * @private
 * @param {object|null} throughputTest - Network throughput data
 * @returns {CustomerMetric|null} Metric object or null if no test
 */
function buildNetworkThroughputMetric(throughputTest) {
  if (!throughputTest) return null;

  const items = [];

  if (throughputTest.throughput != null) {
    const mbps = throughputTest.throughput.toFixed(1);
    items.push(`Throughput: ${mbps} Mbps`);
  }

  if (throughputTest.stability != null) {
    items.push(`Stability: ${throughputTest.stability.toFixed(1)}%`);
  }

  if (throughputTest.verdict) {
    items.push(`Quality: ${throughputTest.verdict}`);
  }

  return {
    icon: "🔄",
    label: "Network Throughput",
    value:
      throughputTest.throughput != null
        ? `${throughputTest.throughput.toFixed(1)} Mbps`
        : "Tested",
    detail: `${throughputTest.protocol?.toUpperCase() || "Network"} to ${
      throughputTest.server || "server"
    }`,
    variant: "info",
    items: items.length > 0 ? items : undefined,
  };
}

/**
 * Build Windows 11 compatibility metric card.
 * @private
 * @param {object|null} compatCheck - Compatibility check data
 * @returns {CustomerMetric|null} Metric object or null if no check
 */
function buildWin11CompatibilityMetric(compatCheck) {
  if (!compatCheck) return null;

  const items = [];

  if (compatCheck.failingChecks && compatCheck.failingChecks.length > 0) {
    items.push(`Failing: ${compatCheck.failingChecks.join(", ")}`);
  }

  return {
    icon: compatCheck.ready ? "✅" : "⚠️",
    label: "Windows 11 Ready",
    value: compatCheck.ready ? "Yes" : "Not Yet",
    detail: `${compatCheck.passingCount}/${compatCheck.totalCount} requirements met`,
    variant: compatCheck.ready ? "success" : "info",
    items: items.length > 0 ? items : undefined,
  };
}

/**
 * Build Windows Update metric card.
 * @private
 * @param {object|null} updateResults - Windows Update data
 * @returns {CustomerMetric|null} Metric object or null if no updates
 */
function buildWindowsUpdateMetric(updateResults) {
  if (!updateResults || updateResults.updatesInstalled === 0) return null;

  const items = [];

  if (updateResults.windowsUpdates > 0) {
    items.push(`${updateResults.windowsUpdates} Windows updates`);
  }

  if (updateResults.driverUpdates > 0) {
    items.push(`${updateResults.driverUpdates} driver updates`);
  }

  if (updateResults.updatesFailed > 0) {
    items.push(`${updateResults.updatesFailed} failed`);
  }

  if (updateResults.rebootRequired) {
    items.push("Reboot required");
  }

  return {
    icon: "🔄",
    label: "Updates Installed",
    value: `${updateResults.updatesInstalled}`,
    detail: updateResults.rebootRequired ? "Reboot required" : "Ready to use",
    variant: updateResults.updatesFailed > 0 ? "warning" : "success",
    items: items.length > 0 ? items : undefined,
  };
}

// buildStorageUsageMetric: MIGRATED TO handlers/disk_space_report/index.js

/**
 * Build default fallback metric when no specific metrics are available.
 * @private
 * @param {number} taskCount - Total number of tasks performed
 * @returns {CustomerMetric} Default metric object
 */
function buildDefaultMetric(taskCount) {
  return {
    icon: "✓",
    label: "Service Completed",
    value: `${taskCount} tasks`,
    detail: "Maintenance tasks performed",
    variant: "info",
  };
}

// =============================================================================
// MAIN AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Aggregate all task results into categorized data structures.
 * @private
 * @param {ServiceTaskResult[]} results - Array of service task results
 * @returns {object} Aggregated data organized by category
 */
function aggregateTaskData(results) {
  const data = {
    threats: { total: 0, details: [] },
    cleanup: { spaceRecovered: 0, filesDeleted: 0 },
    driveHealth: [],
    systemHealth: [],
    performance: [],
    speedTest: null,
    networkLatency: null,
    networkThroughput: null,
    win11Compatibility: null,
    windowsUpdate: null,
    storage: null,
  };

  results.forEach((result) => {
    const type = result?.task_type || result?.type || "";
    const summary = result?.summary || {};
    const status = result?.status || "";

    // Process security/threat tasks
    if (type === "kvrt_scan") {
      const { count, detail } = processKVRTScan(summary);
      data.threats.total += count;
      if (detail) data.threats.details.push(detail);
    } else if (type === "adwcleaner_clean") {
      const { count, detail } = processAdwCleanerScan(summary);
      data.threats.total += count;
      if (detail) data.threats.details.push(detail);
    }

    // Process disk cleanup tasks
    else if (type === "bleachbit_clean") {
      const cleanup = processDiskCleanup(summary);
      data.cleanup.spaceRecovered += cleanup.spaceRecovered;
      data.cleanup.filesDeleted += cleanup.filesDeleted;
    }

    // Process system health tasks
    else if (type === "sfc_scan") {
      const health = processSFCScan(summary, status);
      if (health) data.systemHealth.push(health);
    } else if (type === "dism_health_check") {
      const health = processDISMHealthCheck(summary, status);
      if (health) data.systemHealth.push(health);
    } else if (type === "chkdsk_scan") {
      const health = processCHKDSKScan(summary, status);
      if (health) data.systemHealth.push(health);
    }

    // Process drive health tasks
    else if (type === "smartctl_report") {
      const drives = processDriveHealth(summary, status);
      data.driveHealth.push(...drives);
    }

    // Process performance test tasks
    else if (type === "heavyload_stress_test") {
      const test = processHeavyLoadTest(summary, status);
      if (test) data.performance.push(test);
    } else if (type === "furmark_stress_test") {
      const test = processFurMarkTest(status);
      if (test) data.performance.push(test);
    } else if (type === "winsat_disk") {
      const test = processWinSATDisk(summary, status);
      if (test) data.performance.push(test);
    }

    // Process network test tasks
    else if (type === "speedtest") {
      data.speedTest = processSpeedTest(summary, status);
    }
    // ping_test: MIGRATED TO handlers/ping_test/index.js
    else if (type === "iperf_test") {
      data.networkThroughput = processIPerfTest(summary, status);
    }

    // Process compatibility check tasks
    else if (type === "whynotwin11_check") {
      data.win11Compatibility = processWhyNotWin11Check(summary, status);
    }

    // Process Windows Update tasks
    else if (type === "windows_update") {
      const updates = processWindowsUpdate(summary, status);
      if (updates) {
        data.windowsUpdate = updates;
      }
    }

    // disk_space_report: MIGRATED TO handlers/disk_space_report/index.js
  });

  return data;
}

/**
 * Convert aggregated data into customer-facing metric cards.
 * @private
 * @param {object} data - Aggregated task data
 * @param {number} totalTasks - Total number of tasks for fallback metric
 * @returns {CustomerMetric[]} Array of metric cards
 */
function buildMetricsFromData(data, totalTasks) {
  const metrics = [];

  // Add each metric if data exists
  const threatMetric = buildThreatMetric(
    data.threats.total,
    data.threats.details
  );
  if (threatMetric) metrics.push(threatMetric);

  const cleanupMetric = buildCleanupMetric(
    data.cleanup.spaceRecovered,
    data.cleanup.filesDeleted
  );
  if (cleanupMetric) metrics.push(cleanupMetric);

  const driveMetric = buildDriveHealthMetric(data.driveHealth);
  if (driveMetric) metrics.push(driveMetric);

  const systemMetric = buildSystemHealthMetric(data.systemHealth);
  if (systemMetric) metrics.push(systemMetric);

  const perfMetric = buildPerformanceMetric(data.performance);
  if (perfMetric) metrics.push(perfMetric);

  const speedMetric = buildSpeedTestMetric(data.speedTest);
  if (speedMetric) metrics.push(speedMetric);

  // latencyMetric: MIGRATED TO handlers/ping_test/index.js

  const throughputMetric = buildNetworkThroughputMetric(data.networkThroughput);
  if (throughputMetric) metrics.push(throughputMetric);

  const win11Metric = buildWin11CompatibilityMetric(data.win11Compatibility);
  if (win11Metric) metrics.push(win11Metric);

  const updatesMetric = buildWindowsUpdateMetric(data.windowsUpdate);
  if (updatesMetric) metrics.push(updatesMetric);

  // storageMetric: MIGRATED TO handlers/disk_space_report/index.js

  // Add fallback metric if no specific metrics were generated
  if (metrics.length === 0) {
    metrics.push(buildDefaultMetric(totalTasks));
  }

  return metrics;
}

/**
 * Extract customer-friendly metrics from an array of task results.
 *
 * This function processes service task results and converts them into
 * human-readable metric cards suitable for customer reports. It handles
 * various task types including security scans, disk cleanup, system health
 * checks, performance tests, and network diagnostics.
 *
 * MIGRATION NOTE:
 * As handlers are migrated, this function should check for handler-based
 * extractors first before falling back to legacy processing. See integration
 * example in docs/HANDLER_MIGRATION_GUIDE.md.
 *
 * @param {ServiceTaskResult[]} results - Array of service task execution results
 * @returns {CustomerMetric[]} Array of formatted metric cards for display
 *
 * @example
 * const metrics = extractCustomerMetrics(serviceResults);
 * // Returns: [
 * //   { icon: "🛡️", label: "Viruses Removed", value: "5", ... },
 * //   { icon: "🧹", label: "Junk Files Cleaned", value: "2.5 GB", ... }
 * // ]
 */
export function extractCustomerMetrics(results) {
  const handlerExtractors = getCustomerMetricExtractors();
  const handlerMetrics = [];
  const legacyResults = [];

  // First pass: Try handler extraction for each result
  for (const result of results) {
    const taskType = result.task_type || result.type;
    const summary = result.summary || {};
    const status = result.status || "unknown";

    // Try handler extraction first
    const extractor = handlerExtractors[taskType];
    if (extractor) {
      const extracted = extractor({ summary, status });
      if (extracted) {
        if (Array.isArray(extracted)) {
          handlerMetrics.push(...extracted);
        } else {
          handlerMetrics.push(extracted);
        }
      }
      // Skip legacy processing for this task
      continue;
    }

    // Task hasn't been migrated yet, add to legacy results
    legacyResults.push(result);
  }

  // LEGACY AGGREGATION APPROACH (for unmigrated services)
  // First, aggregate all raw data from unmigrated task results
  const aggregatedData = aggregateTaskData(legacyResults);

  // Then, convert aggregated data into formatted metric cards
  const legacyMetrics = buildMetricsFromData(
    aggregatedData,
    legacyResults.length
  );

  // Combine handler metrics and legacy metrics
  return [...handlerMetrics, ...legacyMetrics];
}

// =============================================================================
// TASK LIST GENERATION
// =============================================================================

/**
 * Map of task type identifiers to customer-friendly display names.
 * @private
 */
const TASK_DISPLAY_NAMES = {
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
  iperf_test: "Network Throughput Test",
  windows_update: "Windows Updates",
  whynotwin11_check: "Windows 11 Compatibility Check",
  ai_startup_disable: "Startup Optimization",
  disk_space_report: "Disk Space Report",
};

/**
 * Get customer-friendly display name for a task type.
 * @private
 * @param {string} taskType - Internal task type identifier
 * @returns {string} Human-readable task name
 */
function getTaskDisplayName(taskType) {
  if (TASK_DISPLAY_NAMES[taskType]) {
    return TASK_DISPLAY_NAMES[taskType];
  }

  // Fallback: convert snake_case to Title Case
  return taskType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Get status icon for a task based on its execution status.
 * @private
 * @param {string} status - Task execution status (success, failure, etc.)
 * @returns {string} Icon character to display
 */
function getStatusIcon(status) {
  switch (status) {
    case "success":
      return "✓";
    case "failure":
      return "⚠";
    default:
      return "•";
  }
}

/**
 * Format a single task result as an HTML list item.
 * @private
 * @param {ServiceTaskResult} result - Task execution result
 * @returns {string} HTML string for list item
 */
function formatTaskListItem(result) {
  const type = result?.task_type || result?.type || "unknown";
  const status = result?.status || "";

  const displayName = getTaskDisplayName(type);
  const icon = getStatusIcon(status);

  return `<li><span class="task-icon ${status}">${icon}</span> ${displayName}</li>`;
}

/**
 * Convert task results into a simple customer-facing HTML list.
 *
 * Creates an HTML unordered list of tasks performed during the service,
 * with status icons and customer-friendly names. Excludes skipped tasks.
 *
 * @param {ServiceTaskResult[]} results - Array of task execution results
 * @returns {string} HTML string containing list items (without <ul> wrapper)
 *
 * @example
 * const listHtml = buildCustomerTaskList(serviceResults);
 * // Returns: "<li><span class='task-icon success'>✓</span> Virus Scan & Removal</li>..."
 */
export function buildCustomerTaskList(results) {
  return results
    .filter((result) => result.status !== "skipped")
    .map(formatTaskListItem)
    .join("");
}

// =============================================================================
// RECOMMENDATIONS GENERATION
// =============================================================================

/**
 * Check if any threats were detected during service execution.
 * @private
 * @param {ServiceTaskResult[]} results - Array of task results
 * @returns {boolean} True if threats were found
 */
function hasThreatsDetected(results) {
  return results.some((result) => {
    const type = result?.task_type || "";
    const summary = result?.summary || {};

    // Check KVRT scan for virus detections
    if (type === "kvrt_scan" && Array.isArray(summary.detections)) {
      return summary.detections.length > 0;
    }

    // Check AdwCleaner for quarantined items
    if (type === "adwcleaner_clean" && summary.quarantined) {
      return summary.quarantined > 0;
    }

    return false;
  });
}

/**
 * Check if any tasks failed during execution.
 * @private
 * @param {ServiceTaskResult[]} results - Array of task results
 * @returns {boolean} True if any failures occurred
 */
function hasFailedTasks(results) {
  return results.some((result) => result.status === "failure");
}

/**
 * Build list of actionable recommendations based on service outcomes.
 * @private
 * @param {boolean} threatsFound - Whether threats were detected
 * @param {boolean} tasksFailed - Whether any tasks failed
 * @returns {string[]} Array of recommendation strings
 */
function buildRecommendationList(threatsFound, tasksFailed) {
  const recommendations = [];

  // Security recommendation if threats were found
  if (threatsFound) {
    recommendations.push(
      "• Run a full system scan regularly to maintain security"
    );
  }

  // Standard maintenance recommendations
  recommendations.push("• Keep Windows and your applications up to date");
  recommendations.push("• Perform regular maintenance every 3-6 months");
  recommendations.push("• Back up important files regularly");

  // Support recommendation if issues occurred
  if (tasksFailed) {
    recommendations.push(
      "• Some tasks encountered issues - contact support if problems persist"
    );
  }

  return recommendations;
}

/**
 * Generate customer-facing recommendations based on task outcomes.
 *
 * Analyzes service results and provides tailored maintenance recommendations.
 * Recommendations are context-aware based on threats detected, task failures,
 * and general best practices.
 *
 * @param {ServiceTaskResult[]} results - Array of task execution results
 * @returns {string} HTML string of recommendation paragraphs
 *
 * @example
 * const recommendations = generateRecommendations(serviceResults);
 * // Returns: "<p>• Keep Windows and your applications up to date</p>..."
 */
export function generateRecommendations(results) {
  const threatsFound = hasThreatsDetected(results);
  const tasksFailed = hasFailedTasks(results);

  const recommendations = buildRecommendationList(threatsFound, tasksFailed);

  // Convert to HTML paragraphs
  return recommendations.map((rec) => `<p>${rec}</p>`).join("");
}
