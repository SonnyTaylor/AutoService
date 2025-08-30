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

  // Ensure the log overlay is hidden on initial load
  const forceHideOverlay = () => {
    try { showOverlay(false); } catch {}
  };
  forceHideOverlay();

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
    label: (t && t.ui_label) || friendlyTaskLabel(t.type),
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
    // Prefer a label embedded in task spec via ui_label when building the plan
    return type;
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

    // Resolve directories and preferred runner path under data/resources/bin
    let planFile = null;
    let runnerPath = null;
    try {
      const dirs = await core.invoke("get_data_dirs");
      const reportsDir = dirs?.reports || "./data/reports";
      const resourcesDir = dirs?.resources || "./data/resources";
      const name = `run_plan_${Date.now()}.json`;
      planFile = `${reportsDir.replace(/[\\/]+$/, "")}/${name}`;
      runnerPath = `${String(resourcesDir).replace(/[\\/]+$/, "")}/bin/service_runner.exe`;
    } catch {}

    if (planFile) {
      try {
        await writeFile(planFile, jsonArg);
      } catch {}
    }

    // Always pass the plan file path to avoid quoting issues during elevation (JSON contains double quotes)
    const args = [planFile || jsonArg];
    if (!planFile) {
      appendLog(`[WARN] ${new Date().toLocaleTimeString()} Plan file could not be created; passing raw JSON may fail if UAC elevation occurs.`);
    }

    // Request it writes a log file alongside the plan.
    const runnerLog = planFile ? planFile.replace(/\.json$/, ".log.txt") : `run_${Date.now()}.log.txt`;
    let cmd;
    let created = false;
    // Primary: launch from data/resources/bin via PowerShell (capability already granted)
    if (runnerPath) {
      try {
        const pwshScript = (() => {
          const exe = escapePwshArg(runnerPath);
          const a0 = escapePwshArg(args[0]);
          const logArg = escapePwshArg(runnerLog);
          return `$ErrorActionPreference='Stop'; & ${exe} ${a0} --log-file ${logArg}`;
        })();
        cmd = Command.create("powershell", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          pwshScript,
        ]);
        created = true;
      } catch (e1) {
        appendLog(`[WARN] ${new Date().toLocaleTimeString()} Failed to create PowerShell runner: ${e1}`);
      }
    }
    // Fallback: use capability-registered command name (binaries/service_runner.exe)
    if (!created) {
      try {
        cmd = Command.create("service_runner", [args[0], "--log-file", runnerLog]);
        created = true;
      } catch (e2) {
        appendLog(`[ERROR] ${new Date().toLocaleTimeString()} Failed to create runner command: ${e2}`);
        throw e2;
      }
    }

    // Track per-task phases by parsing known JSON lines or brackets
    let finalJson = "";
    let currentTaskIndex = 0;

    cmd.on("close", (data) => {
      // no-op; final JSON already collected from stdout buffer
    });
    const maybeProcessStatus = (s) => {
      // Match lines with prefixes like '2025-.. - INFO - TASK START: ...'
      if (/TASK\s+START:/i.test(s)) updateTaskStatus(currentTaskIndex, "running");
      if (/TASK\s+OK:/i.test(s)) { updateTaskStatus(currentTaskIndex, "success"); currentTaskIndex++; }
      if (/TASK\s+FAIL:/i.test(s)) { updateTaskStatus(currentTaskIndex, "failure"); currentTaskIndex++; }
      if (/TASK\s+SKIP:/i.test(s)) { updateTaskStatus(currentTaskIndex, "skipped"); currentTaskIndex++; }
    };

    cmd.stdout.on("data", (line) => {
      const s = String(line).trimEnd();
      const stamp = new Date().toLocaleTimeString();
      if (!s) return;
      appendLog(`[${stamp}] ${s}`);
      // Try to capture final JSON block (stdout only)
      if (s.startsWith("{") || (finalJson && !s.startsWith("[ERROR"))) {
        finalJson += (finalJson ? "\n" : "") + s;
      }
      maybeProcessStatus(s);
    });
    cmd.stderr.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;
      const stamp = new Date().toLocaleTimeString();
      appendLog(`[${stamp}] ${s}`);
      maybeProcessStatus(s);
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
  // Single-line script; embed content as single quoted string. Write UTF-8 without BOM to ensure Python json.load() is happy.
  const escaped = contents.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop'; $p=${escapePwshArg(path)}; $c='${escaped}'; New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($p)) -Force | Out-Null; $enc = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($p, $c, $enc)`;
  // Use capability-registered PowerShell command name 'powershell'.
  const cmd = Command.create("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    await cmd.execute();
  }
}


