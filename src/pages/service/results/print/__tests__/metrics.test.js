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
    baseResult({ task_type: "kvrt_scan", summary: { detections: [1, 2] } }),
    baseResult({
      task_type: "bleachbit_clean",
      summary: { space_recovered_bytes: 5 * 1024 ** 3, files_deleted: 42 },
    }),
    baseResult({ task_type: "sfc_scan" }),
    baseResult({ task_type: "smartctl_report" }),
    baseResult({ task_type: "heavyload_stress_test" }),
  ];

  const metrics = extractCustomerMetrics(results);
  assert.equal(metrics.length, 5);
  assert.deepEqual(metrics[0], {
    icon: "🛡️",
    label: "Threats Removed",
    value: "2",
    detail: "Viruses, malware, and unwanted software",
    variant: "success",
  });
  assert.equal(metrics[1].value, "5.00 GB");
  assert.equal(metrics[1].detail, "42 junk files removed");
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
