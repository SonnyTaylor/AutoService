// Component Test Page Controller
// Provides tests for: Camera, Keyboard, Mouse/Trackpad, Network, Display, Audio

export async function initPage() {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Sub-tabs ----------
  const tabButtons = qsa(".subtabs [role=tab]");
  const panels = {
    camera: qs("#panel-camera"),
    audio: qs("#panel-audio"),
    keyboard: qs("#panel-keyboard"),
    mouse: qs("#panel-mouse"),
    network: qs("#panel-network"),
    display: qs("#panel-display"),
  };
  function activateTab(name) {
    tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
    Object.entries(panels).forEach(([n, el]) => {
      if (!el) return;
      if (n === name) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    // Do not persist tab selection
  }
  function initialTab() {
    // Always start on the default tab
    const defaultTab = "camera";
    const name = panels[defaultTab]
      ? defaultTab
      : Object.keys(panels).find((n) => panels[n]) || defaultTab;
    activateTab(name);
    const btn = tabButtons.find((b) => b.dataset.tab === name);
    btn?.focus({ preventScroll: true });
  }
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    btn.addEventListener("keydown", (e) => {
      const idx = tabButtons.indexOf(btn);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        tabButtons[(idx + 1) % tabButtons.length].click();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        tabButtons[(idx - 1 + tabButtons.length) % tabButtons.length].click();
      }
      if (e.key === "Home") {
        e.preventDefault();
        tabButtons[0].click();
      }
      if (e.key === "End") {
        e.preventDefault();
        tabButtons[tabButtons.length - 1].click();
      }
    });
  });

  // ---------- Camera ----------
  const video = qs("#camera-video");
  const camSel = qs("#camera-select");
  const camStart = qs("#camera-start");
  const camStop = qs("#camera-stop");
  const camStatus = qs("#camera-status");
  let camStream = null;

  async function listDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      const mics = devices.filter((d) => d.kind === "audioinput");
      const outs = devices.filter((d) => d.kind === "audiooutput");
      // populate camera select
      camSel.innerHTML = "";
      cams.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i + 1}`;
        camSel.appendChild(opt);
      });
      // populate mic select
      const micSel = qs("#mic-select");
      if (micSel) {
        micSel.innerHTML = "";
        const def = document.createElement("option");
        def.value = "";
        def.textContent = "System default";
        micSel.appendChild(def);
        mics.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Microphone ${i + 1}`;
          micSel.appendChild(opt);
        });
      }
      // populate speakers (note: labels may require permissions)
      const spkSel = qs("#spk-select");
      if (spkSel) {
        spkSel.innerHTML = "";
        const def = document.createElement("option");
        def.value = "";
        def.textContent = "System default";
        spkSel.appendChild(def);
        outs.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Speakers ${i + 1}`;
          spkSel.appendChild(opt);
        });
      }
    } catch (e) {
      console.error("enumerateDevices failed", e);
    }
  }

  async function startCamera() {
    try {
      camStatus.textContent = "Requesting camera…";
      const constraints = {
        video: camSel.value ? { deviceId: { exact: camSel.value } } : true,
        audio: false,
      };
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = camStream;
      await video.play();
      camStart.disabled = true;
      camStop.disabled = false;
      camStatus.textContent = "Camera streaming";
    } catch (e) {
      camStatus.textContent = "Camera error: " + e.message;
      console.error(e);
    }
  }
  function stopCamera() {
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null;
    }
    video.srcObject = null;
    camStart.disabled = false;
    camStop.disabled = true;
    camStatus.textContent = "Camera stopped";
  }

  camStart?.addEventListener("click", startCamera);
  camStop?.addEventListener("click", stopCamera);

  // ---------- Keyboard ----------
  const kbCurrent = qs("#keyboard-current"); // may be null if UI streamlining removed it
  const kbPressed = qs("#keyboard-pressed");
  const kbClear = qs("#keyboard-clear");
  const kbCapture = qs("#keyboard-capture");
  const kbLastKey = qs("#kb-last-key");
  const kbLastCode = qs("#kb-last-code");
  const kbLastLoc = qs("#kb-last-loc");
  const kbLastRepeat = qs("#kb-last-repeat");
  const modCtrl = qs("#mod-ctrl");
  const modShift = qs("#mod-shift");
  const modAlt = qs("#mod-alt");
  const modMeta = qs("#mod-meta");
  const kbModeInternal = qs("#kb-mode-internal");
  const kbModeExternal = qs("#kb-mode-external");
  const kbInternalWrap = qs("#keyboard-internal");
  const kbExternalWrap = qs("#keyboard-external");
  const kbIframe = qs("#kb-iframe");
  const kbOpen = qs("#kb-open");
  const down = new Set();

  function renderPressed() {
    kbPressed.innerHTML = "";
    down.forEach((k) => {
      const el = document.createElement("span");
      el.className = "key";
      el.textContent = k;
      kbPressed.appendChild(el);
    });
  }

  function onKeyDown(e) {
    if (!kbCapture?.checked) return;
    down.add(e.code);
    if (kbCurrent)
      kbCurrent.textContent =
        `${e.key} (${e.code})` + (e.repeat ? " [repeat]" : "");
    if (kbLastKey) kbLastKey.textContent = String(e.key);
    if (kbLastCode) kbLastCode.textContent = String(e.code);
    if (kbLastLoc) {
      const locMap = { 0: "Standard", 1: "Left", 2: "Right", 3: "Numpad" };
      kbLastLoc.textContent = locMap[e.location] || String(e.location);
    }
    if (kbLastRepeat) kbLastRepeat.textContent = e.repeat ? "Yes" : "No";
    if (modCtrl) modCtrl.classList.toggle("active", e.ctrlKey);
    if (modShift) modShift.classList.toggle("active", e.shiftKey);
    if (modAlt) modAlt.classList.toggle("active", e.altKey);
    if (modMeta) modMeta.classList.toggle("active", e.metaKey);
    renderPressed();
    // prevent space from scrolling within test area
    if (e.code === "Space") e.preventDefault();
  }
  function onKeyUp(e) {
    if (!kbCapture?.checked) return;
    down.delete(e.code);
    if (modCtrl) modCtrl.classList.toggle("active", e.ctrlKey);
    if (modShift) modShift.classList.toggle("active", e.shiftKey);
    if (modAlt) modAlt.classList.toggle("active", e.altKey);
    if (modMeta) modMeta.classList.toggle("active", e.metaKey);
    renderPressed();
  }
  kbClear?.addEventListener("click", () => {
    down.clear();
    renderPressed();
    if (kbCurrent) kbCurrent.textContent = "";
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Keyboard mode switching
  function setKbMode(mode) {
    const internal = mode !== "external";
    if (kbInternalWrap) kbInternalWrap.hidden = !internal;
    if (kbExternalWrap) kbExternalWrap.hidden = internal;
    if (kbOpen) kbOpen.style.display = internal ? "none" : "";
    // Toggle internal capture availability
    if (kbCapture) {
      if (internal) {
        kbCapture.disabled = false;
      } else {
        kbCapture.checked = false;
        kbCapture.disabled = true;
        // Clear any internal state/readouts when switching away
        down.clear();
        renderPressed();
        if (kbCurrent) kbCurrent.textContent = "";
      }
    }
    try {
      localStorage.setItem("ct.kbMode", internal ? "internal" : "external");
    } catch {}
  }
  function initKbMode() {
    let mode = "internal";
    try {
      mode = localStorage.getItem("ct.kbMode") || mode;
    } catch {}
    if (kbModeInternal && kbModeExternal) {
      kbModeInternal.checked = mode === "internal";
      kbModeExternal.checked = mode === "external";
    }
    setKbMode(mode);
  }
  kbModeInternal?.addEventListener("change", () => setKbMode("internal"));
  kbModeExternal?.addEventListener("change", () => setKbMode("external"));
  initKbMode();

  // ---------- Mouse / Trackpad ----------
  const mouseArea = qs("#mouse-area");
  const mousePos = qs("#mouse-pos");
  const mouseButtons = qs("#mouse-buttons");
  const mouseWheel = qs("#mouse-wheel");
  const mouseWheelBar = qs("#mouse-wheel-bar");
  const mouseSpeed = qs("#mouse-speed");
  const mouseReset = qs("#mouse-reset");
  const dblBtn = qs("#dblclick-test");
  const dblReadout = qs("#dblclick-time");
  const dblBadge = qs("#dblclick-badge");
  const cursorDot = qs("#cursor-dot");
  const coordTag = qs("#coord-tag");
  const btnL = qs("#btn-left");
  const btnM = qs("#btn-middle");
  const btnR = qs("#btn-right");
  let wheelAccum = 0;
  let lastClick = 0;
  let lastMove = null; // {x,y,t}
  let speedIdleTimer = null;

  function buttonsToText(b) {
    const labels = ["L", "R", "M", "X1", "X2"];
    const active = [];
    labels.forEach((name, i) => {
      if (b & (1 << i)) active.push(name);
    });
    return active.join(", ") || "none";
  }
  function updateButtonVisuals(buttonMask) {
    const arr = [btnL, btnR, btnM];
    arr.forEach((el, idx) => {
      if (!el) return;
      el.classList.toggle("active", !!(buttonMask & (1 << idx)));
    });
  }

  mouseArea?.addEventListener("mousemove", (e) => {
    const rect = mouseArea.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    mousePos.textContent = `${x}, ${y}`;
    mouseButtons.textContent = buttonsToText(e.buttons);
    updateButtonVisuals(e.buttons);
    if (cursorDot) {
      cursorDot.hidden = false;
      cursorDot.style.left = `${x}px`;
      cursorDot.style.top = `${y}px`;
    }
    if (coordTag) {
      coordTag.textContent = `${x}, ${y}`;
    }
    const tNow = performance.now();
    if (lastMove) {
      const dx = x - lastMove.x;
      const dy = y - lastMove.y;
      const dt = (tNow - lastMove.t) / 1000;
      if (dt > 0) {
        const v = Math.round(Math.hypot(dx, dy) / dt);
        if (mouseSpeed) mouseSpeed.textContent = `${v} px/s`;
      }
    }
    lastMove = { x, y, t: tNow };
    // reset any pending idle timer
    if (speedIdleTimer) {
      clearTimeout(speedIdleTimer);
      speedIdleTimer = null;
    }
    speedIdleTimer = setTimeout(() => {
      if (mouseSpeed) mouseSpeed.textContent = "0 px/s";
    }, 300);
  });
  mouseArea?.addEventListener("mousedown", (e) => {
    mouseButtons.textContent = buttonsToText(e.buttons);
    updateButtonVisuals(e.buttons);
    const tNow = performance.now();
    const dt = tNow - lastClick;
    lastClick = tNow;
    if (dt < 400) {
      const ms = Math.round(dt);
      dblReadout.textContent = String(ms);
      if (dblBadge) dblBadge.textContent = `${ms} ms`;
    }
  });
  mouseArea?.addEventListener("mouseup", (e) => {
    mouseButtons.textContent = buttonsToText(e.buttons);
    updateButtonVisuals(e.buttons);
  });
  mouseArea?.addEventListener(
    "wheel",
    (e) => {
      wheelAccum += e.deltaY;
      mouseWheel.textContent = String(Math.round(wheelAccum));
      if (mouseWheelBar) {
        const w = Math.max(-2000, Math.min(2000, wheelAccum));
        const pct = Math.round((w + 2000) / 40); // 0..100 with center at 50%
        mouseWheelBar.style.width = `${pct}%`;
      }
    },
    { passive: true }
  );
  mouseReset?.addEventListener("click", () => {
    wheelAccum = 0;
    mouseWheel.textContent = "0";
    if (mouseWheelBar) mouseWheelBar.style.width = "50%";
    if (mouseSpeed) mouseSpeed.textContent = "0 px/s";
    lastMove = null;
    if (speedIdleTimer) {
      clearTimeout(speedIdleTimer);
      speedIdleTimer = null;
    }
    cursorDot && (cursorDot.hidden = true);
    coordTag && (coordTag.textContent = "0, 0");
    updateButtonVisuals(0);
  });
  dblBtn?.addEventListener("click", () => {
    const tNow = performance.now();
    const dt = tNow - lastClick;
    lastClick = tNow;
    if (dt < 400) {
      const ms = Math.round(dt);
      dblReadout.textContent = String(ms);
      if (dblBadge) dblBadge.textContent = `${ms} ms`;
    }
  });
  mouseArea?.addEventListener("mouseleave", () => {
    if (mouseSpeed) mouseSpeed.textContent = "0 px/s";
    if (speedIdleTimer) {
      clearTimeout(speedIdleTimer);
      speedIdleTimer = null;
    }
  });
  // ---------- Network ----------
  const netBtn = qs("#network-quick");
  const netBtnExt = qs("#network-extended");
  const netStatus = qs("#network-status");
  const netInfo = qs("#network-info");
  const netResults = qs("#network-results");
  const netHealth = qs("#network-health");
  const netSummary = qs("#network-summary");
  const kpiMed = qs("#net-kpi-med");
  const kpiAvg = qs("#net-kpi-avg");
  const kpiLoss = qs("#net-kpi-loss");
  const kpiDl = qs("#net-kpi-dl");

  async function networkQuickTest() {
    // Clear UI and mark as running
    netStatus.textContent = "Running…";
    netStatus.className = "badge info";
    netInfo.innerHTML = "";
    netResults.innerHTML = "";
    netHealth.textContent = "Testing…";
    netHealth.className = "badge";
    netSummary.textContent = "";

    // Connection info
    const items = [];
    const nav = navigator;
    items.push(["User Agent", nav.userAgent]);
    if ("connection" in nav) {
      const c = nav.connection;
      items.push(["Downlink (Mb/s)", c.downlink]);
      items.push(["Effective Type", c.effectiveType]);
      items.push(["RTT (ms)", c.rtt]);
    }
    items.push(["Online", String(navigator.onLine)]);
    items.forEach(([k, v]) => {
      const li = document.createElement("li");
      li.textContent = `${k}: ${v}`;
      netInfo.appendChild(li);
    });

    // Latency/connectivity tests
    const urls = [
      "https://cloudflare.com/cdn-cgi/trace",
      "https://www.google.com/generate_204",
      "https://httpbin.org/get",
    ];
    const timings = []; // all timings (success/fail durations)
    const successTimes = []; // only successful request durations
    let successCount = 0;
    for (const url of urls) {
      const li = document.createElement("li");
      li.textContent = `GET ${url} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        await fetch(url, { cache: "no-store", mode: "no-cors" });
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        successTimes.push(t);
        successCount++;
        li.textContent = `GET ${url} → OK (${t} ms)`;
        li.classList.add("pass");
      } catch (e) {
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        li.textContent = `GET ${url} → FAIL (${t} ms): ${e.message}`;
        li.classList.add("fail");
      }
    }
    // DNS check via image fetch (different domain)
    const dnsUrl = "https://i.imgur.com/favicon.ico";
    {
      const li = document.createElement("li");
      li.textContent = `DNS check ${dnsUrl} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        const res = await fetch(dnsUrl, { cache: "no-store", mode: "no-cors" });
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        successTimes.push(t);
        successCount++;
        li.textContent = `DNS ${dnsUrl} → OK (${t} ms)`;
        li.classList.add("pass");
      } catch (e) {
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        li.textContent = `DNS ${dnsUrl} → FAIL (${t} ms): ${e.message}`;
        li.classList.add("fail");
      }
    }

    // Basic WebSocket test (cloudflare echo)
    await new Promise((resolve) => {
      const li = document.createElement("li");
      li.textContent = "WebSocket echo …";
      netResults.appendChild(li);
      let done = false;
      try {
        const ws = new WebSocket("wss://ws.postman-echo.com/raw");
        const t0 = performance.now();
        ws.onopen = () => {
          ws.send("ping");
        };
        ws.onmessage = () => {
          const t = Math.round(performance.now() - t0);
          successCount++;
          timings.push(t);
          successTimes.push(t);
          li.textContent = `WebSocket → OK (${t} ms)`;
          li.classList.add("pass");
          done = true;
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          const t = Math.round(performance.now() - t0);
          timings.push(t);
          li.textContent = `WebSocket → FAIL (${t} ms)`;
          li.classList.add("fail");
          if (!done) {
            done = true;
            resolve();
          }
        };
      } catch (e) {
        li.textContent = `WebSocket → Not supported: ${e.message}`;
        li.classList.add("note");
        resolve();
      }
      setTimeout(() => {
        if (!done) {
          li.textContent = "WebSocket → TIMEOUT";
          resolve();
        }
      }, 4000);
    });

    // Compute health
    // Stats on successful checks only to avoid skew from failures/timeouts
    const avg = successTimes.length
      ? Math.round(
          successTimes.reduce((a, b) => a + b, 0) / successTimes.length
        )
      : 0;
    const median = (arr) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    };
    const med = median(successTimes);
    const online = navigator.onLine;
    const total = urls.length + 2; // + DNS + WebSocket
    let grade = "Unknown";
    let cls = "badge";
    if (!online || successCount === 0) {
      grade = "Poor";
      cls += " warn";
    } else if (successCount === total && med <= 200) {
      grade = "Good";
      cls += "ok" in {} ? " ok" : " ok";
    } else if (successCount >= Math.ceil(total * 0.6) && med <= 450) {
      grade = "Fair";
    } else if (successCount === total && med > 450) {
      // All checks passed, but latency high → consider Fair rather than Poor
      grade = "Fair";
    } else {
      grade = "Poor";
      cls += " warn";
    }
    netHealth.textContent = grade;
    netHealth.className = cls;
    netSummary.textContent = `${successCount}/${total} checks passed • median ${med} ms, avg ${avg} ms`;
    if (kpiMed) kpiMed.textContent = `${med} ms`;
    if (kpiAvg) kpiAvg.textContent = `${avg} ms`;
    if (kpiLoss)
      kpiLoss.textContent = `${Math.max(
        0,
        Math.round(100 - (successCount / total) * 100)
      )}%`;

    // Finalize status with clearer outcome
    if (successCount === total) {
      netStatus.textContent = "Completed: All checks passed";
      netStatus.className = "badge ok";
    } else if (successCount > 0) {
      netStatus.textContent = `Completed: ${total - successCount} failed`;
      netStatus.className = "badge warn";
    } else {
      netStatus.textContent = "Completed: All checks failed";
      netStatus.className = "badge error";
    }
  }
  netBtn?.addEventListener("click", async () => {
    if (netBtn) netBtn.disabled = true;
    if (netBtnExt) netBtnExt.disabled = true;
    try {
      await networkQuickTest();
    } finally {
      if (netBtn) netBtn.disabled = false;
      if (netBtnExt) netBtnExt.disabled = false;
    }
  });

  // Extended test: runs quick test plus multiple pings and download throughput sample
  netBtnExt?.addEventListener("click", async () => {
    netBtnExt.disabled = true;
    if (netBtn) netBtn.disabled = true;
    await networkQuickTest();
    const header = document.createElement("li");
    header.textContent = "--- Extended ---";
    netResults.appendChild(header);

    // Multi-sample latency to a single endpoint
    const url = "https://www.google.com/generate_204";
    const samples = 5;
    const times = [];
    for (let i = 0; i < samples; i++) {
      const li = document.createElement("li");
      li.textContent = `Sample ${i + 1}/${samples} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        await fetch(url, { cache: "no-store", mode: "no-cors" });
        const t = Math.round(performance.now() - t0);
        times.push(t);
        li.textContent = `Sample ${i + 1} → ${t} ms`;
        li.classList.add("pass");
      } catch {
        const t = Math.round(performance.now() - t0);
        times.push(t);
        li.textContent = `Sample ${i + 1} → FAIL (${t} ms)`;
        li.classList.add("fail");
      }
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const liAvg = document.createElement("li");
    liAvg.textContent = `Avg latency over ${samples} samples: ${avg} ms`;
    netResults.appendChild(liAvg);

    // Simple throughput estimate by downloading a known-size blob
    // Using Cloudflare CDN test file (approx 100KB)
    const dlLi = document.createElement("li");
    netResults.appendChild(dlLi);
    try {
      const dlUrl = "https://speed.cloudflare.com/__down?bytes=100000";
      const t0 = performance.now();
      const res = await fetch(dlUrl, { cache: "no-store" });
      const buf = await res.arrayBuffer();
      const dt = (performance.now() - t0) / 1000;
      const mbps = (buf.byteLength * 8) / 1_000_000 / dt; // Mb/s
      dlLi.textContent = `Throughput sample: ${mbps.toFixed(2)} Mb/s`;
      dlLi.classList.add("pass");
      if (kpiDl) kpiDl.textContent = `${mbps.toFixed(2)} Mb/s`;
    } catch (e) {
      dlLi.textContent = `Throughput sample: FAIL (${e.message})`;
      dlLi.classList.add("fail");
    }
    netBtnExt.disabled = false;
    if (netBtn) netBtn.disabled = false;
  });

  // ---------- Display ----------
  const dispArea = qs("#display-area");
  const dispGradient = qs("#disp-gradient");
  const dispChecker = qs("#disp-checker");
  const dispCycle = qs("#disp-cycle");
  const dispFullscreen = qs("#disp-fullscreen");

  function setDisplayColor(color) {
    dispArea.style.background = color;
  }
  qsa(".disp-color").forEach((btn) =>
    btn.addEventListener("click", () => setDisplayColor(btn.dataset.color))
  );

  dispGradient?.addEventListener("click", () => {
    dispArea.style.background = "linear-gradient(90deg, #000, #fff)";
  });
  dispChecker?.addEventListener("click", () => {
    const size = 16;
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${
        size * 2
      }">` +
        `<rect width="100%" height="100%" fill="white"/>` +
        `<rect x="0" y="0" width="${size}" height="${size}" fill="black"/>` +
        `<rect x="${size}" y="${size}" width="${size}" height="${size}" fill="black"/>` +
        `</svg>`
    );
    dispArea.style.background = `url("data:image/svg+xml,${svg}") repeat`;
    dispArea.style.backgroundSize = `${size * 2}px ${size * 2}px`;
  });

  let cycleTimer = null;
  dispCycle?.addEventListener("click", () => {
    if (cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
      dispCycle.textContent = "Cycle colors";
      return;
    }
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#000000", "#ffffff"];
    let i = 0;
    setDisplayColor(colors[i]);
    cycleTimer = setInterval(() => {
      i = (i + 1) % colors.length;
      setDisplayColor(colors[i]);
    }, 1000);
    dispCycle.textContent = "Stop cycling";
  });

  dispFullscreen?.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await dispArea.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  });

  // Audio test removed.
  // ---------- Audio ----------
  const micSel = qs("#mic-select");
  const micStart = qs("#mic-start");
  const micStop = qs("#mic-stop");
  const micMonitor = qs("#mic-monitor");
  const micMeter = qs("#mic-meter");
  const micKpiLevel = qs("#mic-kpi-level");
  const micKpiPeak = qs("#mic-kpi-peak");
  const micKpiClip = qs("#mic-kpi-clip");
  const micStatus = qs("#mic-status");

  const spkSel = qs("#spk-select");
  const spkLeft = qs("#spk-left");
  const spkRight = qs("#spk-right");
  const spkBoth = qs("#spk-both");
  const spkSweep = qs("#spk-sweep");
  const spkStop = qs("#spk-stop");
  const spkVol = qs("#spk-volume");
  const spkStatus = qs("#spk-status");
  const spkNote = qs("#spk-note");

  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let micSource = null;
  let monitorNode = null; // Gain node for monitoring
  let rafId = 0;
  let clipCount = 0;
  let peakDb = -Infinity;

  function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function setOutputDeviceFor(el, deviceId) {
    // setSinkId is not supported in all browsers; try and note result
    if (typeof el.setSinkId === "function") {
      return el
        .setSinkId(deviceId)
        .then(() => true)
        .catch(() => false);
    }
    return Promise.resolve(false);
  }

  async function startMic() {
    try {
      micStatus.textContent = "Starting…";
      micStatus.className = "badge";
      const constraints = {
        audio: micSel?.value ? { deviceId: { exact: micSel.value } } : true,
        video: false,
      };
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = ensureAudioContext();
      micSource = ctx.createMediaStreamSource(micStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      micSource.connect(analyser);

      // Monitoring chain
      monitorNode = ctx.createGain();
      monitorNode.gain.value = micMonitor?.checked ? 0.6 : 0.0;
      micSource.connect(monitorNode);
      monitorNode.connect(ctx.destination);

      const data = new Float32Array(analyser.fftSize);
      peakDb = -Infinity;
      clipCount = 0;
      const loop = () => {
        analyser.getFloatTimeDomainData(data);
        // RMS
        let sum = 0,
          peak = 0,
          clipped = false;
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          sum += v * v;
          const a = Math.abs(v);
          if (a > peak) peak = a;
          if (a > 0.98) clipped = true;
        }
        const rms = Math.sqrt(sum / data.length) || 0;
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        const peakDbNow = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        if (peakDbNow > peakDb) peakDb = peakDbNow;
        if (clipped) clipCount++;

        if (micMeter)
          micMeter.style.width = `${Math.max(
            0,
            Math.min(100, Math.round(rms * 140))
          )}%`;
        if (micKpiLevel)
          micKpiLevel.textContent = Number.isFinite(rmsDb)
            ? `${rmsDb.toFixed(1)} dB`
            : "-∞ dB";
        if (micKpiPeak)
          micKpiPeak.textContent = Number.isFinite(peakDb)
            ? `${peakDb.toFixed(1)} dB`
            : "-∞ dB";
        if (micKpiClip) micKpiClip.textContent = String(clipCount);

        rafId = requestAnimationFrame(loop);
      };
      loop();
      micStatus.textContent = "Listening";
      micStatus.className = "badge ok";
      micStart.disabled = true;
      micStop.disabled = false;
    } catch (e) {
      micStatus.textContent = `Error: ${e.message}`;
      micStatus.className = "badge warn";
      console.error(e);
    }
  }

  function stopMic() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    try {
      micSource && micSource.disconnect();
    } catch {}
    try {
      analyser && analyser.disconnect();
    } catch {}
    try {
      monitorNode && monitorNode.disconnect();
    } catch {}
    micSource = null;
    analyser = null;
    monitorNode = null;
    if (micMeter) micMeter.style.width = "0%";
    if (micStatus) {
      micStatus.textContent = "Stopped";
      micStatus.className = "badge";
    }
    micStart && (micStart.disabled = false);
    micStop && (micStop.disabled = true);
  }

  micStart?.addEventListener("click", startMic);
  micStop?.addEventListener("click", stopMic);
  micMonitor?.addEventListener("change", () => {
    if (monitorNode) monitorNode.gain.value = micMonitor.checked ? 0.6 : 0.0;
  });

  // Speaker tests
  let osc = null,
    gainL = null,
    gainR = null,
    merger = null,
    masterGain = null;
  let msDest = null,
    audioEl = null; // For selectable output via setSinkId

  function getOutputNode() {
    const ctx = ensureAudioContext();
    const canSetSink =
      typeof HTMLMediaElement !== "undefined" &&
      typeof HTMLMediaElement.prototype.setSinkId === "function";
    if (canSetSink) {
      if (!msDest) {
        msDest = ctx.createMediaStreamDestination();
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.srcObject = msDest.stream;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
        // Ensure playback starts when created (Chromium may require explicit play)
        audioEl.play?.().catch(() => {});
      }
      const deviceId = spkSel?.value || "default";
      if (deviceId) {
        audioEl
          .setSinkId(deviceId)
          .then(() => {
            if (spkNote) spkNote.textContent = "";
            audioEl.play?.().catch(() => {});
          })
          .catch((err) => {
            if (spkNote)
              spkNote.textContent = `Output select failed: ${err.message}`;
          });
      }
      return msDest;
    }
    return ctx.destination;
  }

  function stopTone() {
    try {
      osc && osc.stop();
    } catch {}
    try {
      osc && osc.disconnect();
    } catch {}
    try {
      gainL && gainL.disconnect();
    } catch {}
    try {
      gainR && gainR.disconnect();
    } catch {}
    try {
      merger && merger.disconnect();
    } catch {}
    try {
      masterGain && masterGain.disconnect();
    } catch {}
    osc = null;
    gainL = null;
    gainR = null;
    merger = null;
    masterGain = null;
    if (spkStatus) spkStatus.textContent = "Idle";
  }

  function startTone({ left = 0, right = 0, freq = 440 }) {
    const ctx = ensureAudioContext();
    // Resume context on user gesture if needed
    try {
      ctx.resume?.();
    } catch {}
    stopTone();
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    gainL = ctx.createGain();
    gainR = ctx.createGain();
    gainL.gain.value = left ? 1 : 0;
    gainR.gain.value = right ? 1 : 0;
    merger = ctx.createChannelMerger(2);
    osc.connect(gainL).connect(merger, 0, 0);
    osc.connect(gainR).connect(merger, 0, 1);
    masterGain = ctx.createGain();
    masterGain.gain.value = parseFloat(spkVol?.value || "0.5");
    merger.connect(masterGain).connect(getOutputNode());
    try {
      osc.start();
    } catch {}
    if (spkStatus)
      spkStatus.textContent =
        left && right
          ? "Playing (Both)"
          : left
          ? "Playing (Left)"
          : "Playing (Right)";
  }

  spkVol?.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = parseFloat(spkVol.value);
  });

  spkLeft?.addEventListener("click", () =>
    startTone({ left: 1, right: 0, freq: 440 })
  );
  spkRight?.addEventListener("click", () =>
    startTone({ left: 0, right: 1, freq: 440 })
  );
  spkBoth?.addEventListener("click", () =>
    startTone({ left: 1, right: 1, freq: 440 })
  );
  spkStop?.addEventListener("click", stopTone);

  spkSweep?.addEventListener("click", () => {
    const ctx = ensureAudioContext();
    try {
      ctx.resume?.();
    } catch {}
    stopTone();
    const duration = 4; // seconds
    const start = ctx.currentTime;
    const end = start + duration;
    osc = ctx.createOscillator();
    osc.type = "sine";
    gainL = ctx.createGain();
    gainR = ctx.createGain();
    merger = ctx.createChannelMerger(2);
    const vol = 1.0; // channel gains; overall volume via masterGain
    gainL.gain.value = vol;
    gainR.gain.value = vol;
    osc.connect(gainL).connect(merger, 0, 0);
    osc.connect(gainR).connect(merger, 0, 1);
    masterGain = ctx.createGain();
    masterGain.gain.value = parseFloat(spkVol?.value || "0.5");
    merger.connect(masterGain).connect(getOutputNode());
    osc.frequency.setValueAtTime(200, start);
    osc.frequency.exponentialRampToValueAtTime(2000, end);
    osc.start(start);
    if (spkStatus) spkStatus.textContent = "Stereo sweep";
    // Pan from left to right using periodic gain automation
    const panSteps = 40;
    for (let i = 0; i <= panSteps; i++) {
      const t = start + (i / panSteps) * duration;
      const p = i / panSteps; // 0..1
      // equal-power panning
      const l = Math.cos((p * Math.PI) / 2);
      const r = Math.sin((p * Math.PI) / 2);
      gainL.gain.setValueAtTime(vol * l, t);
      gainR.gain.setValueAtTime(vol * r, t);
    }
    osc.stop(end);
    setTimeout(() => {
      stopTone();
    }, duration * 1000 + 100);
  });

  // Try to honor output device selection when supported by the browser environment
  async function applySpeakerSelection() {
    const can =
      typeof HTMLMediaElement !== "undefined" &&
      typeof HTMLMediaElement.prototype.setSinkId === "function";
    if (!can) {
      spkNote.textContent =
        "Note: Selecting specific output may be limited by browser.";
      return;
    }
    // Ensure audio element exists and apply sink id
    getOutputNode();
  }
  spkSel?.addEventListener("change", applySpeakerSelection);

  // Initial device list (requires permission in some browsers to reveal labels)
  await listDevices();
  // If permissions are needed for labels, trigger a minimal getUserMedia to unlock labels
  try {
    // Request video and audio to populate labels for all device types
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    s.getTracks().forEach((t) => t.stop());
    await listDevices();
    await applySpeakerSelection();
  } catch (e) {
    // ignore
  }

  // Cleanup when navigating away
  const cleanup = () => {
    stopCamera();
    stopMic();
    stopTone();
    // ensure keyboard iframe stops loading if present
    if (kbIframe) kbIframe.src = "about:blank";
    window.removeEventListener("beforeunload", cleanup);
  };
  window.addEventListener("beforeunload", cleanup, { once: true });

  // Also cleanup on client-side route change away from this page
  const onRouteChange = () => {
    const route = (location.hash || "").slice(2);
    if (route !== "component-test") {
      cleanup();
      window.removeEventListener("hashchange", onRouteChange);
    }
  };
  window.addEventListener("hashchange", onRouteChange);

  // Init sub-tabs last so the UI starts correctly
  initialTab();
}
