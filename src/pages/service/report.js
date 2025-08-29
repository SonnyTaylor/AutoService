import { getToolStatuses } from "../../utils/tools.js";

// Minimal runner controller: spawns service_runner.exe via PowerShell, streams output, shows final JSON
export async function initPage() {
  const { core } = window.__TAURI__ || {};
  const { invoke } = core || {};
  const runnerTitle = document.getElementById("svc-report-title");
  const runnerDesc = document.getElementById("svc-report-desc");
  const backBtn = document.getElementById("svc-report-back");
  const runBtn = document.getElementById("svc-report-run");
  const container = document.getElementById("svc-runner");
  const taskListEl = document.getElementById("svc-task-status");
  const logEl = document.getElementById("svc-log");
  const logOverlay = document.getElementById("svc-log-overlay");
  const finalJsonEl = document.getElementById("svc-final-json");
  const copyFinalBtn = document.getElementById("svc-copy-final");
  const summaryEl = document.getElementById("svc-summary");
  const summaryTitleEl = document.getElementById("svc-summary-title");
  const summaryIconEl = document.getElementById("svc-summary-icon");

  backBtn?.addEventListener("click", () => {
    window.location.hash = "#/service-run";
  });

  copyFinalBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(finalJsonEl.textContent || "{}");
      copyFinalBtn.textContent = "Copied";
      setTimeout(() => (copyFinalBtn.textContent = "Copy JSON"), 1200);
    } catch {}
  });

  // Load pending run JSON from session
  let runPlan = {};
  try {
    const raw = sessionStorage.getItem("service.pendingRun") || "{}";
    runPlan = JSON.parse(raw);
  } catch {
    runPlan = {};
  }

  const tasks = Array.isArray(runPlan?.tasks) ? runPlan.tasks : [];
  if (!tasks.length) {
    runnerTitle.textContent = "Service Runner – Nothing to Run";
    runnerDesc.textContent = "Build a run queue first.";
    runBtn.disabled = true;
  } else {
    runnerTitle.textContent = "Service Runner – Ready";
    runnerDesc.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} queued.`;
  }

  // Render initial task list
  const taskState = tasks.map((t, i) => ({
    id: i,
    type: t.type,
    label: friendlyTaskLabel(t.type),
    status: "pending", // pending | running | success | failure | skipped
  }));
  renderTaskList();

  container.hidden = false;

  runBtn?.addEventListener("click", async () => {
    if (!tasks.length) return;
    runBtn.disabled = true;
    backBtn.disabled = true;
    summaryEl.hidden = true;
    finalJsonEl.textContent = "";
    clearLog();
    showOverlay(true);
    try {
      const jsonArg = JSON.stringify({ tasks });
      const result = await runRunner(jsonArg);
      // Pretty print final JSON
      try {
        const obj = typeof result === "string" ? JSON.parse(result) : result;
        finalJsonEl.textContent = JSON.stringify(obj, null, 2);
        const ok = obj?.overall_status === "success";
        showSummary(ok);
      } catch {
        finalJsonEl.textContent = String(result || "");
        showSummary(false);
      }
    } catch (e) {
      appendLog(`[ERROR] ${new Date().toLocaleTimeString()} ${String(e)}`);
      showSummary(false);
    } finally {
      showOverlay(false);
      backBtn.disabled = false;
      runBtn.disabled = false;
    }
  });

  function renderTaskList() {
    taskListEl.innerHTML = "";
    taskState.forEach((t, idx) => {
      const li = document.createElement("li");
      li.className = `task-status ${t.status}`;
      li.innerHTML = `
        <div class="left">
          <span class="idx">${String(idx + 1).padStart(2, "0")}</span>
          <span class="name">${t.label}</span>
        </div>
        <div class="right">
          ${statusBadge(t.status)}
        </div>
      `;
      taskListEl.appendChild(li);
    });
  }

  function updateTaskStatus(i, status) {
    if (!taskState[i]) return;
    taskState[i].status = status;
    renderTaskList();
  }

  function statusBadge(s) {
    if (s === "running") return '<span class="badge running"><span class="dot"></span> Running</span>';
    if (s === "success") return '<span class="badge ok">Success</span>';
    if (s === "failure") return '<span class="badge fail">Failure</span>';
    if (s === "skipped") return '<span class="badge skipped">Skipped</span>';
    return '<span class="badge">Pending</span>';
  }

  function friendlyTaskLabel(type) {
    switch (type) {
      case "adwcleaner_clean": return "Adware Clean (AdwCleaner)";
      case "bleachbit_clean": return "Junk Cleanup (BleachBit)";
      case "dism_health_check": return "DISM Health Check";
      case "sfc_scan": return "SFC Scan";
      case "smartctl_report": return "Drive Health Report (smartctl)";
      case "furmark_stress_test": return "GPU Stress (FurMark)";
      case "heavyload_stress_test": return "Stress (HeavyLoad)";
      default: return type;
    }
  }

  function clearLog() { logEl.textContent = ""; }
  function appendLog(line) {
    logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function showOverlay(show) {
    logOverlay.hidden = !show;
  }
  function showSummary(ok) {
    summaryEl.hidden = false;
    summaryTitleEl.textContent = ok ? "All tasks completed" : "Completed with errors";
    summaryIconEl.textContent = ok ? "✔" : "!";
    summaryEl.classList.toggle("ok", !!ok);
    summaryEl.classList.toggle("fail", !ok);
  }

  // Spawn the runner as a Tauri sidecar and capture stdout live.
  async function runRunner(jsonArg) {
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) throw new Error("Shell plugin unavailable");

    // Prepare a temporary plan file in the data/reports folder to avoid command-line length limits
    let planFile = null;
    try {
      const dirs = await core.invoke("get_data_dirs");
      const reportsDir = dirs?.reports || "./data/reports";
      const name = `run_plan_${Date.now()}.json`;
      planFile = `${reportsDir.replace(/[\\/]+$/, "")}/${name}`;
    } catch {}

    if (planFile) {
      try {
        await writeFile(planFile, jsonArg);
      } catch {}
    }

    // Prefer passing file path if created; otherwise pass raw JSON string
    const args = [planFile || jsonArg];

    // Start sidecar; request it writes a log file alongside the plan
    const runnerLog = planFile ? planFile.replace(/\.json$/, ".log.txt") : `run_${Date.now()}.log.txt`;
    const cmd = Command.sidecar("binaries/service_runner", [args[0], "--log-file", runnerLog]);

    // Track per-task phases by parsing known JSON lines or brackets
    let finalJson = "";
    let currentTaskIndex = 0;

    cmd.on("close", (data) => {
      // no-op; final JSON already collected from stdout buffer
    });
    cmd.stdout.on("data", (line) => {
      const s = String(line).trimEnd();
      const stamp = new Date().toLocaleTimeString();
      if (!s) return;
      appendLog(`[${stamp}] ${s}`);
      // Try to capture final JSON block (starts with { and likely pretty printed)
      if (s.startsWith("{") || (finalJson && !s.startsWith("[ERROR"))) {
        finalJson += (finalJson ? "\n" : "") + s;
      }
      // Heuristic: update task states when runner logs contain status markers
      if (/^TASK START:/i.test(s)) updateTaskStatus(currentTaskIndex, "running");
      if (/^TASK OK:/i.test(s)) { updateTaskStatus(currentTaskIndex, "success"); currentTaskIndex++; }
      if (/^TASK FAIL:/i.test(s)) { updateTaskStatus(currentTaskIndex, "failure"); currentTaskIndex++; }
      if (/^TASK SKIP:/i.test(s)) { updateTaskStatus(currentTaskIndex, "skipped"); currentTaskIndex++; }
    });
    cmd.stderr.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;
      const stamp = new Date().toLocaleTimeString();
      appendLog(`[${stamp}] ${s}`);
    });

    const out = await cmd.execute();
    // Prefer collected final JSON, else use stdout
    const stdoutStr = (finalJson || String(out.stdout || "")).trim();
    try { return JSON.parse(stdoutStr); } catch { return stdoutStr; }
  }

  function escapePwshArg(s) {
    if (s == null) return "''";
    const str = String(s);
    return `'${str.replace(/'/g, "''")}'`;
  }

  async function writeFile(path, contents) {
    // Write file via a tiny PowerShell command to avoid needing a FS plugin
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) return;
    const script = `$ErrorActionPreference='Stop'; $p=${escapePwshArg(path)}; $c=@'
${contents}
'@; New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($p)) -Force | Out-Null; Set-Content -Path $p -Value $c -Encoding UTF8`;
    const cmd = new Command("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    await cmd.execute();
  }
}


