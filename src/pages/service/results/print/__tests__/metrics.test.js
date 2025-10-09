import test from "node:test";
import assert from "node:assert/strict";

import {
  extractCustomerMetrics,
  buildCustomerTaskList,
  generateRecommendations,
} from "../metrics.js";

const baseResult = (overrides = {}) => ({
  task_type: "sample_task",
  status: "success",
  summary: {},
  ...overrides,
});

test("extractCustomerMetrics summarises key data points", () => {
  const results = [
    baseResult({
      task_type: "kvrt_scan",
      summary: {
        detections: [
          { threat: "Trojan.Win32.Agent" },
          { threat: "Backdoor.Win32.Rbot" },
        ],
      },
    }),
    baseResult({
      task_type: "bleachbit_clean",
      summary: { space_recovered_bytes: 5 * 1024 ** 3, files_deleted: 42 },
    }),
    baseResult({
      task_type: "sfc_scan",
      summary: { integrity_violations: false },
    }),
    baseResult({
      task_type: "smartctl_report",
      summary: {
        drives: [
          {
            model_name: "Samsung SSD 970 EVO",
            wear_level_percent_used: 5,
            health_passed: true,
            temperature: "35°C",
          },
        ],
      },
    }),
    baseResult({
      task_type: "heavyload_stress_test",
      summary: {
        stress_cpu: true,
        stress_memory: true,
        exit_code: 0,
        duration_minutes: 5,
      },
    }),
  ];

  const metrics = extractCustomerMetrics(results);
  assert.equal(metrics.length, 5);

  // Threats removed with details
  assert.equal(metrics[0].icon, "🛡️");
  assert.equal(metrics[0].label, "Security Threats Removed");
  assert.equal(metrics[0].value, "2");
  assert.equal(metrics[0].variant, "success");
  assert.ok(Array.isArray(metrics[0].items));

  // Junk files cleaned
  assert.equal(metrics[1].value, "5.00 GB");
  assert.equal(metrics[1].detail, "42 files removed");

  // Drive health with details
  assert.equal(metrics[2].label, "Hard Drive Health");
  assert.equal(metrics[2].value, "95% avg");
  assert.ok(Array.isArray(metrics[2].items));

  // System health with details
  assert.equal(metrics[3].label, "System Health");
  assert.ok(Array.isArray(metrics[3].items));

  // Performance tests with details
  assert.equal(metrics[4].label, "Performance Tests");
  assert.ok(Array.isArray(metrics[4].items));
});

test("extractCustomerMetrics falls back to generic summary", () => {
  const metrics = extractCustomerMetrics([baseResult()]);
  assert.equal(metrics.length, 1);
  assert.match(metrics[0].value, /^1 task/);
});

test("buildCustomerTaskList renders friendly names and icons", () => {
  const results = [
    baseResult({ task_type: "bleachbit_clean", status: "success" }),
    baseResult({ task_type: "kvrt_scan", status: "failure" }),
    baseResult({ task_type: "unknown_service", status: "skipped" }),
  ];
  const list = buildCustomerTaskList(results);
  assert.ok(list.includes("System Cleanup & Junk File Removal"));
  assert.ok(list.includes("Virus Scan & Removal"));
  assert.ok(list.includes("task-icon success"));
  assert.ok(list.includes("task-icon failure"));
  assert.ok(!list.includes("unknown_service"));
});

test("generateRecommendations includes threat & failure guidance", () => {
  const results = [
    baseResult({
      task_type: "kvrt_scan",
      summary: { detections: [1] },
    }),
    baseResult({
      task_type: "bleachbit_clean",
      status: "failure",
    }),
  ];
  const recommendations = generateRecommendations(results);
  assert.ok(
    recommendations.includes(
      "• Run a full system scan regularly to maintain security"
    )
  );
  assert.ok(
    recommendations.includes(
      "• Some tasks encountered issues - contact support if problems persist"
    )
  );
});

test("extractCustomerMetrics handles AdwCleaner results correctly", () => {
  const results = [
    baseResult({
      task_type: "adwcleaner_clean",
      summary: {
        browsers: { Chrome: ["extension1", "extension2"] },
        cleaned: 5,
        dlls: [],
        failed: 2,
        files: ["C:\\Temp\\adware.exe", "C:\\Temp\\pup.dll"],
        folders: [
          "Deleted  C:\\ProgramData\\Adware",
          "Needs Reboot  C:\\Program Files\\Sunshine",
        ],
        preinstalled: [],
        registry: [
          "Deleted  HKLM\\Software\\Adware\\Settings",
          "Not Deleted   HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sunshine",
        ],
        services: ["Deleted  AdwareService", "Not Deleted   Updater"],
        shortcuts: [],
        tasks: [],
        wmi: [],
      },
    }),
  ];

  const metrics = extractCustomerMetrics(results);
  assert.equal(metrics.length, 1);

  // Check threat metric for AdwCleaner
  assert.equal(metrics[0].icon, "🛡️");
  assert.equal(metrics[0].label, "Security Threats Removed");
  assert.equal(metrics[0].variant, "success");
  assert.ok(Array.isArray(metrics[0].items));

  // Check detail is customer-friendly
  assert.ok(metrics[0].detail.includes("Adware"));

  // Check items include category breakdown (only successful removals)
  const itemsText = metrics[0].items.join(" ");
  assert.ok(itemsText.includes("Registry") || itemsText.includes("entries"));
  assert.ok(itemsText.includes("Files") || itemsText.includes("Browser"));

  // Should NOT include warnings about failures/reboots for customers
  assert.ok(!itemsText.includes("could not be removed"));
  assert.ok(!itemsText.includes("restart required"));
});

test("extractCustomerMetrics handles CHKDSK scan results", () => {
  const results = [
    baseResult({
      task_type: "chkdsk_scan",
      summary: {
        drive: "C:",
        mode: "read_only",
        found_no_problems: true,
      },
    }),
    baseResult({
      task_type: "chkdsk_scan",
      summary: {
        drive: "D:",
        mode: "fix_errors",
        made_corrections: true,
      },
    }),
  ];

  const metrics = extractCustomerMetrics(results);
  assert.equal(metrics.length, 1);

  // Check system health metric includes CHKDSK results
  assert.equal(metrics[0].label, "System Health");
  assert.ok(metrics[0].items.some((item) => item.includes("C:")));
  assert.ok(metrics[0].items.some((item) => item.includes("D:")));
});

test("extractCustomerMetrics handles Windows Update results", () => {
  const results = [
    baseResult({
      task_type: "windows_update",
      summary: {
        install: {
          count_installed: 5,
          count_windows_installed: 3,
          count_driver_installed: 2,
          count_failed: 0,
        },
        reboot_required: true,
      },
    }),
  ];

  const metrics = extractCustomerMetrics(results);
  assert.equal(metrics.length, 1);

  // Check Windows Update metric
  assert.equal(metrics[0].icon, "🔄");
  assert.equal(metrics[0].label, "Updates Installed");
  assert.equal(metrics[0].value, "5");
  assert.equal(metrics[0].detail, "Reboot required");
  assert.equal(metrics[0].variant, "success");
  assert.ok(Array.isArray(metrics[0].items));
  assert.ok(metrics[0].items.some((item) => item.includes("Windows updates")));
  assert.ok(metrics[0].items.some((item) => item.includes("driver updates")));
  assert.ok(metrics[0].items.some((item) => item.includes("Reboot required")));
});
