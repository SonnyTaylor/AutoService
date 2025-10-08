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

  // Viruses removed with details
  assert.equal(metrics[0].icon, "🛡️");
  assert.equal(metrics[0].label, "Viruses Removed");
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
