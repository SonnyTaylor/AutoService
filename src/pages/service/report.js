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
    try {
      showOverlay(false);
    } catch {}
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
    runnerDesc.textContent = `${tasks.length} task${
      tasks.length === 1 ? "" : "s"
    } queued.`;
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

  // Initialize task status tracking
  let taskStatuses = {};
  tasks.forEach((task, index) => {
    taskStatuses[index] = "pending";
  });

  runBtn?.addEventListener("click", async () => {
    if (!tasks.length) return;
    runBtn.disabled = true;
    backBtn.disabled = true;
    summaryEl.hidden = true;
    finalJsonEl.textContent = "";
    clearLog();
    showOverlay(true);
    // Fallback: mark the first pending task as running so the UI shows progress even if no markers are emitted
    const firstPendingIdx = taskState.findIndex((t) => t.status === "pending");
    if (firstPendingIdx >= 0) updateTaskStatus(firstPendingIdx, "running");
    try {
      const jsonArg = JSON.stringify({ tasks });
      console.log("Sending tasks to Python runner:", tasks);
      console.log("JSON argument:", jsonArg);
      const result = await runRunner(jsonArg);
      // Pretty print final JSON
      try {
        const obj = typeof result === "string" ? JSON.parse(result) : result;
        finalJsonEl.textContent = JSON.stringify(obj, null, 2);
        // Apply final statuses as a fallback if live markers weren't detected
        try {
          applyFinalStatusesFromReport(obj);
        } catch {}
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
    console.log(`updateTaskStatus called with index ${i}, status ${status}`);
    console.log(
      `taskState length: ${taskState.length}, taskState[${i}]:`,
      taskState[i]
    );

    if (!taskState[i]) {
      console.error(`No taskState entry for index ${i}`);
      return;
    }

    taskState[i].status = status;
    taskStatuses[i] = status; // Also update the tracking object

    console.log(`Updated task ${i} to status ${status}`);
    renderTaskList();
  }

  function statusBadge(s) {
    if (s === "running")
      return '<span class="badge running"><span class="dot"></span> Running</span>';
    if (s === "success") return '<span class="badge ok">Success</span>';
    if (s === "failure") return '<span class="badge fail">Failure</span>';
    if (s === "skipped") return '<span class="badge skipped">Skipped</span>';
    return '<span class="badge">Pending</span>';
  }

  function applyFinalStatusesFromReport(obj) {
    const results = Array.isArray(obj?.results) ? obj.results : [];
    // Map results 1:1 to our displayed task order (assumes runner ran in provided order)
    results.forEach((res, idx) => {
      const st = String(res?.status || "").toLowerCase();
      if (st === "success" || st === "ok") updateTaskStatus(idx, "success");
      else if (st === "failure" || st === "error" || st === "failed")
        updateTaskStatus(idx, "failure");
      else if (st === "skipped") updateTaskStatus(idx, "skipped");
      else updateTaskStatus(idx, "success");
    });
  }

  function friendlyTaskLabel(type) {
    // Prefer a label embedded in task spec via ui_label when building the plan
    return type;
  }

  function clearLog() {
    logEl.textContent = "";
  }
  function appendLog(line) {
    logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function showOverlay(show) {
    logOverlay.hidden = !show;
  }
  function showSummary(ok) {
    summaryEl.hidden = false;
    summaryTitleEl.textContent = ok
      ? "All tasks completed"
      : "Completed with errors";
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
      runnerPath = `${String(resourcesDir).replace(
        /[\\/]+$/,
        ""
      )}/bin/service_runner.exe`;
    } catch {}

    if (planFile) {
      try {
        await writeFile(planFile, jsonArg);
      } catch {}
    }

    // Always pass the plan file path to avoid quoting issues during elevation (JSON contains double quotes)
    const args = [planFile || jsonArg];
    if (!planFile) {
      appendLog(
        `[WARN] ${new Date().toLocaleTimeString()} Plan file could not be created; passing raw JSON may fail if UAC elevation occurs.`
      );
    }

    // Request it writes a log file alongside the plan.
    const runnerLog = planFile
      ? planFile.replace(/\.json$/, ".log.txt")
      : `run_${Date.now()}.log.txt`;
    let cmd;
    let created = false;
    // Start polling the runner log file for live updates (works even if the process elevates)
    let stopPolling = () => {};
    try {
      stopPolling = startLogPolling(runnerLog);
    } catch {}
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
        appendLog(
          `[WARN] ${new Date().toLocaleTimeString()} Failed to create PowerShell runner: ${e1}`
        );
      }
    }
    // Fallback: use capability-registered command name (binaries/service_runner.exe)
    if (!created) {
      try {
        cmd = Command.create("service_runner", [
          args[0],
          "--log-file",
          runnerLog,
        ]);
        created = true;
      } catch (e2) {
        appendLog(
          `[ERROR] ${new Date().toLocaleTimeString()} Failed to create runner command: ${e2}`
        );
        throw e2;
      }
    }

    // Track per-task phases by parsing known JSON lines or brackets
    let finalJson = "";

    cmd.on("close", (data) => {
      // no-op; final JSON already collected from stdout buffer
    });

    const maybeProcessStatus = (s) => {
      // Debug: Log what we're processing
      console.log("Processing log line:", JSON.stringify(s));

      // Parse new format: TASK_START:0:task_type or TASK_OK:0:task_type
      const startMatch = s.match(/^TASK_START:(\d+):(.+)$/);
      if (startMatch) {
        const taskIndex = parseInt(startMatch[1]);
        const taskType = startMatch[2];
        console.log(`Found TASK_START for task ${taskIndex}: ${taskType}`);
        updateTaskStatus(taskIndex, "running");
        appendLog(`[INFO] Started: ${taskType}`);
        return;
      }

      const okMatch = s.match(/^TASK_OK:(\d+):(.+)$/);
      if (okMatch) {
        const taskIndex = parseInt(okMatch[1]);
        const taskType = okMatch[2];
        console.log(`Found TASK_OK for task ${taskIndex}: ${taskType}`);
        updateTaskStatus(taskIndex, "success");
        appendLog(`[SUCCESS] Completed: ${taskType}`);
        return;
      }

      const failMatch = s.match(/^TASK_FAIL:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
      if (failMatch) {
        const taskIndex = parseInt(failMatch[1]);
        const taskType = failMatch[2];
        const reason = failMatch[3] || "Failed";
        console.log(
          `Found TASK_FAIL for task ${taskIndex}: ${taskType} - ${reason}`
        );
        updateTaskStatus(taskIndex, "failure");
        appendLog(`[ERROR] Failed: ${taskType} - ${reason}`);
        return;
      }

      const skipMatch = s.match(/^TASK_SKIP:(\d+):(.+?)(?:\s*-\s*(.+))?$/);
      if (skipMatch) {
        const taskIndex = parseInt(skipMatch[1]);
        const taskType = skipMatch[2];
        const reason = skipMatch[3] || "Skipped";
        console.log(
          `Found TASK_SKIP for task ${taskIndex}: ${taskType} - ${reason}`
        );
        updateTaskStatus(taskIndex, "skipped");
        appendLog(`[WARNING] Skipped: ${taskType} - ${reason}`);
        return;
      }

      // Also handle the old format for backward compatibility
      if (/TASK\s+START:/i.test(s)) {
        console.log("Found old format TASK START");
        // Find the first pending task
        const pendingTasks = Object.entries(taskStatuses).filter(
          ([_, status]) => status === "pending"
        );
        if (pendingTasks.length > 0) {
          const taskIndex = parseInt(pendingTasks[0][0]);
          updateTaskStatus(taskIndex, "running");
        }
      }
      if (/TASK\s+OK:/i.test(s)) {
        console.log("Found old format TASK OK");
        // Find the first running task
        const runningTasks = Object.entries(taskStatuses).filter(
          ([_, status]) => status === "running"
        );
        if (runningTasks.length > 0) {
          const taskIndex = parseInt(runningTasks[0][0]);
          updateTaskStatus(taskIndex, "success");
        }
      }
      if (/TASK\s+FAIL:/i.test(s)) {
        console.log("Found old format TASK FAIL");
        // Find the first running task
        const runningTasks = Object.entries(taskStatuses).filter(
          ([_, status]) => status === "running"
        );
        if (runningTasks.length > 0) {
          const taskIndex = parseInt(runningTasks[0][0]);
          updateTaskStatus(taskIndex, "failure");
        }
      }
      if (/TASK\s+SKIP:/i.test(s)) {
        console.log("Found old format TASK SKIP");
        // Find the first running task
        const runningTasks = Object.entries(taskStatuses).filter(
          ([_, status]) => status === "running"
        );
        if (runningTasks.length > 0) {
          const taskIndex = parseInt(runningTasks[0][0]);
          updateTaskStatus(taskIndex, "skipped");
        }
      }
    };

    // Set up event handlers
    console.log("Setting up command event handlers...");

    cmd.stderr.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;

      // Debug: Show raw stderr line
      console.log("Raw stderr line received:", JSON.stringify(s));

      // Process stderr for task status updates and show as live logs
      appendLog(`[STDERR] ${s}`);
      maybeProcessStatus(s);
    });

    cmd.stdout.on("data", (line) => {
      const s = String(line).trimEnd();
      if (!s) return;

      // Debug: Show raw stdout line
      console.log("Raw stdout line received:", JSON.stringify(s));

      // Try to capture final JSON block (stdout only)
      if (s.startsWith("{") || (finalJson && !s.startsWith("[ERROR"))) {
        finalJson += (finalJson ? "\n" : "") + s;
      } else {
        // Show other stdout messages as live logs
        appendLog(`[STDOUT] ${s}`);
        // Also check stdout for task status markers
        maybeProcessStatus(s);
      }
    });

    console.log("Event handlers set up, executing command...");

    const out = await cmd.execute();

    // Final poll to flush any remaining log content then stop
    try {
      await pollLogOnce(runnerLog);
    } catch {}
    try {
      stopPolling();
    } catch {}
    // Prefer collected final JSON, else use stdout
    const stdoutStr = (finalJson || String(out.stdout || "")).trim();
    try {
      return JSON.parse(stdoutStr);
    } catch {
      return stdoutStr;
    }
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
    const script = `$ErrorActionPreference='Stop'; $p=${escapePwshArg(
      path
    )}; $c='${escaped}'; New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($p)) -Force | Out-Null; $enc = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($p, $c, $enc)`;
    // Use capability-registered PowerShell command name 'powershell'.
    const cmd = Command.create("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ]);
    await cmd.execute();
  }

  // ----- Live log polling from file (works through UAC elevation) ---------
  let _logPoll = { timer: null, lastTextLen: 0, busy: false, path: null };

  function startLogPolling(path) {
    _logPoll.path = path;
    _logPoll.lastTextLen = 0;
    if (_logPoll.timer) clearInterval(_logPoll.timer);
    _logPoll.timer = setInterval(() => pollLogOnce(path).catch(() => {}), 700);
    return function stop() {
      if (_logPoll.timer) {
        clearInterval(_logPoll.timer);
        _logPoll.timer = null;
      }
    };
  }

  async function pollLogOnce(path) {
    if (_logPoll.busy) return; // avoid overlap
    _logPoll.busy = true;
    try {
      const text = await readFileRaw(path);
      if (typeof text !== "string") {
        _logPoll.busy = false;
        return;
      }
      if (text.length <= _logPoll.lastTextLen) {
        _logPoll.busy = false;
        return;
      }
      const added = text.slice(_logPoll.lastTextLen);
      _logPoll.lastTextLen = text.length;
      const lines = added.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendLog(line);
        maybeProcessStatus(line);
      }
    } finally {
      _logPoll.busy = false;
    }
  }

  async function readFileRaw(path) {
    const { shell } = window.__TAURI__ || {};
    const { Command } = shell || {};
    if (!Command) return "";
    const ps = Command.create("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$ErrorActionPreference='SilentlyContinue'; $p=${escapePwshArg(
        path
      )}; if (Test-Path -Path $p) { Get-Content -Path $p -Raw -ErrorAction SilentlyContinue }`,
    ]);
    const out = await ps.execute();
    return String(out.stdout || "");
  }
}
