// Component Test Page Controller
// Provides tests for: Camera, Keyboard, Mouse/Trackpad, Network, Display, Audio

export async function initPage() {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Sub-tabs ----------
  const tabButtons = qsa('.subtabs [role=tab]');
  const panels = {
    camera: qs('#panel-camera'),
    keyboard: qs('#panel-keyboard'),
    mouse: qs('#panel-mouse'),
    network: qs('#panel-network'),
    display: qs('#panel-display'),
    audio: qs('#panel-audio'),
  };
  function activateTab(name) {
    tabButtons.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
    Object.entries(panels).forEach(([n, el]) => {
      if (!el) return;
      if (n === name) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
    });
    // Persist
    try { localStorage.setItem('ct.subtab', name); } catch {}
  }
  function initialTab() {
    let name = 'camera';
    try { name = localStorage.getItem('ct.subtab') || name; } catch {}
    if (!panels[name]) name = 'camera';
    activateTab(name);
    const btn = tabButtons.find(b => b.dataset.tab === name);
    btn?.focus({ preventScroll: true });
  }
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      const idx = tabButtons.indexOf(btn);
      if (e.key === 'ArrowRight') { e.preventDefault(); tabButtons[(idx+1)%tabButtons.length].click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); tabButtons[(idx-1+tabButtons.length)%tabButtons.length].click(); }
      if (e.key === 'Home') { e.preventDefault(); tabButtons[0].click(); }
      if (e.key === 'End') { e.preventDefault(); tabButtons[tabButtons.length-1].click(); }
    });
  });

  // ---------- Camera ----------
  const video = qs('#camera-video');
  const camSel = qs('#camera-select');
  const camStart = qs('#camera-start');
  const camStop = qs('#camera-stop');
  const camStatus = qs('#camera-status');
  let camStream = null;

  async function listDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      const outs = devices.filter(d => d.kind === 'audiooutput');
      // populate camera select
      camSel.innerHTML = '';
      cams.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i + 1}`;
        camSel.appendChild(opt);
      });
      // audio selects
      const micSel = qs('#mic-select');
      const outSel = qs('#out-select');
      if (micSel) {
        micSel.innerHTML = '';
        mics.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Microphone ${i + 1}`;
          micSel.appendChild(opt);
        });
      }
      if (outSel) {
        outSel.innerHTML = '';
        outs.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Speaker ${i + 1}`;
          outSel.appendChild(opt);
        });
        // Note: setSinkId requires HTTPS or secure context; Tauri provides secure context.
      }
    } catch (e) {
      console.error('enumerateDevices failed', e);
    }
  }

  async function startCamera() {
    try {
      camStatus.textContent = 'Requesting camera…';
      const constraints = { video: camSel.value ? { deviceId: { exact: camSel.value } } : true, audio: false };
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = camStream;
      await video.play();
      camStart.disabled = true;
      camStop.disabled = false;
      camStatus.textContent = 'Camera streaming';
    } catch (e) {
      camStatus.textContent = 'Camera error: ' + e.message;
      console.error(e);
    }
  }
  function stopCamera() {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
    }
    video.srcObject = null;
    camStart.disabled = false;
    camStop.disabled = true;
    camStatus.textContent = 'Camera stopped';
  }

  camStart?.addEventListener('click', startCamera);
  camStop?.addEventListener('click', stopCamera);

  // ---------- Keyboard ----------
  const kbCurrent = qs('#keyboard-current');
  const kbPressed = qs('#keyboard-pressed');
  const kbClear = qs('#keyboard-clear');
  const kbCapture = qs('#keyboard-capture');
  const down = new Set();

  function renderPressed() {
    kbPressed.innerHTML = '';
    down.forEach(k => {
      const el = document.createElement('span');
      el.className = 'key';
      el.textContent = k;
      kbPressed.appendChild(el);
    });
  }

  function onKeyDown(e) {
    if (!kbCapture?.checked) return;
    down.add(e.code);
    kbCurrent.textContent = `${e.key} (${e.code})` + (e.repeat ? ' [repeat]' : '');
    renderPressed();
    // prevent space from scrolling within test area
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    if (!kbCapture?.checked) return;
    down.delete(e.code);
    renderPressed();
  }
  kbClear?.addEventListener('click', () => { down.clear(); renderPressed(); kbCurrent.textContent = ''; });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ---------- Mouse / Trackpad ----------
  const mouseArea = qs('#mouse-area');
  const mousePos = qs('#mouse-pos');
  const mouseButtons = qs('#mouse-buttons');
  const mouseWheel = qs('#mouse-wheel');
  const mouseReset = qs('#mouse-reset');
  const dblBtn = qs('#dblclick-test');
  const dblReadout = qs('#dblclick-time');
  let wheelAccum = 0;
  let lastClick = 0;

  function buttonsToText(b) {
    const map = ['L', 'R', 'M', 'X1', 'X2'];
    const active = [];
    map.forEach((name, i) => { if (b & (1 << i)) active.push(name); });
    return active.join(', ') || 'none';
  }

  mouseArea?.addEventListener('mousemove', (e) => {
    const rect = mouseArea.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    mousePos.textContent = `${x}, ${y}`;
    mouseButtons.textContent = buttonsToText(e.buttons);
  });
  mouseArea?.addEventListener('mousedown', (e) => {
    mouseButtons.textContent = buttonsToText(e.buttons);
    const now = performance.now();
    const dt = now - lastClick;
    lastClick = now;
    if (dt < 400) {
      dblReadout.textContent = Math.round(dt).toString();
    }
  });
  mouseArea?.addEventListener('mouseup', (e) => {
    mouseButtons.textContent = buttonsToText(e.buttons);
  });
  mouseArea?.addEventListener('wheel', (e) => {
    wheelAccum += e.deltaY;
    mouseWheel.textContent = String(Math.round(wheelAccum));
  }, { passive: true });
  mouseReset?.addEventListener('click', () => { wheelAccum = 0; mouseWheel.textContent = '0'; });
  dblBtn?.addEventListener('click', () => {
    const now = performance.now();
    const dt = now - lastClick;
    lastClick = now;
    if (dt < 400) {
      dblReadout.textContent = Math.round(dt).toString();
    }
  });

  // ---------- Network ----------
  const netBtn = qs('#network-quick');
  const netBtnExt = qs('#network-extended');
  const netStatus = qs('#network-status');
  const netInfo = qs('#network-info');
  const netResults = qs('#network-results');
  const netHealth = qs('#network-health');
  const netSummary = qs('#network-summary');

  async function networkQuickTest() {
    netStatus.textContent = 'Running…';
    netInfo.innerHTML = '';
    netResults.innerHTML = '';
    netHealth.textContent = 'Testing…';
    netHealth.className = 'badge';
    netSummary.textContent = '';

    // Connection info
    const items = [];
    const nav = navigator;
    items.push(['User Agent', nav.userAgent]);
    if ('connection' in nav) {
      const c = nav.connection;
      items.push(['Downlink (Mb/s)', c.downlink]);
      items.push(['Effective Type', c.effectiveType]);
      items.push(['RTT (ms)', c.rtt]);
    }
    items.push(['Online', String(navigator.onLine)]);
    items.forEach(([k, v]) => {
      const li = document.createElement('li');
      li.textContent = `${k}: ${v}`;
      netInfo.appendChild(li);
    });

    // Latency/connectivity tests
    const urls = [
      'https://cloudflare.com/cdn-cgi/trace',
      'https://www.google.com/generate_204',
      'https://httpbin.org/get'
    ];
  const timings = []; // all timings (success/fail durations)
  const successTimes = []; // only successful request durations
    let successCount = 0;
    for (const url of urls) {
      const li = document.createElement('li');
      li.textContent = `GET ${url} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        await fetch(url, { cache: 'no-store', mode: 'no-cors' });
        const t = Math.round(performance.now() - t0);
  timings.push(t);
  successTimes.push(t);
        successCount++;
        li.textContent = `GET ${url} → OK (${t} ms)`;
      } catch (e) {
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        li.textContent = `GET ${url} → FAIL (${t} ms): ${e.message}`;
      }
    }
    // DNS check via image fetch (different domain)
    const dnsUrl = 'https://i.imgur.com/favicon.ico';
    {
      const li = document.createElement('li');
      li.textContent = `DNS check ${dnsUrl} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        const res = await fetch(dnsUrl, { cache: 'no-store', mode: 'no-cors' });
  const t = Math.round(performance.now() - t0);
  timings.push(t);
  successTimes.push(t);
  successCount++;
        li.textContent = `DNS ${dnsUrl} → OK (${t} ms)`;
      } catch (e) {
        const t = Math.round(performance.now() - t0);
        timings.push(t);
        li.textContent = `DNS ${dnsUrl} → FAIL (${t} ms): ${e.message}`;
      }
    }

    // Basic WebSocket test (cloudflare echo)
    await new Promise((resolve) => {
      const li = document.createElement('li');
      li.textContent = 'WebSocket echo …';
      netResults.appendChild(li);
      let done = false;
      try {
        const ws = new WebSocket('wss://ws.postman-echo.com/raw');
        const t0 = performance.now();
        ws.onopen = () => {
          ws.send('ping');
        };
        ws.onmessage = () => {
          const t = Math.round(performance.now() - t0);
          successCount++;
          timings.push(t);
          successTimes.push(t);
          li.textContent = `WebSocket → OK (${t} ms)`;
          done = true; ws.close(); resolve();
        };
        ws.onerror = () => {
          const t = Math.round(performance.now() - t0);
          timings.push(t);
          li.textContent = `WebSocket → FAIL (${t} ms)`;
          if (!done) { done = true; resolve(); }
        };
      } catch (e) {
        li.textContent = `WebSocket → Not supported: ${e.message}`;
        resolve();
      }
      setTimeout(() => { if (!done) { li.textContent = 'WebSocket → TIMEOUT'; resolve(); } }, 4000);
    });

    // Compute health
    // Stats on successful checks only to avoid skew from failures/timeouts
    const avg = successTimes.length ? Math.round(successTimes.reduce((a,b)=>a+b,0) / successTimes.length) : 0;
    const median = (arr) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a,b)=>a-b);
      const mid = Math.floor(s.length/2);
      return s.length % 2 ? s[mid] : Math.round((s[mid-1] + s[mid]) / 2);
    };
    const med = median(successTimes);
    const online = navigator.onLine;
    const total = urls.length + 2; // + DNS + WebSocket
    let grade = 'Unknown';
    let cls = 'badge';
    if (!online || successCount === 0) {
      grade = 'Poor'; cls += ' warn';
    } else if (successCount === total && med <= 200) {
      grade = 'Good'; cls += 'ok' in {} ? ' ok' : ' ok';
    } else if (successCount >= Math.ceil(total * 0.6) && med <= 450) {
      grade = 'Fair';
    } else if (successCount === total && med > 450) {
      // All checks passed, but latency high → consider Fair rather than Poor
      grade = 'Fair';
    } else {
      grade = 'Poor'; cls += ' warn';
    }
    netHealth.textContent = grade;
    netHealth.className = cls;
    netSummary.textContent = `${successCount}/${total} checks passed • median ${med} ms, avg ${avg} ms`;

    netStatus.textContent = 'Done';
  }
  netBtn?.addEventListener('click', networkQuickTest);

  // Extended test: runs quick test plus multiple pings and download throughput sample
  netBtnExt?.addEventListener('click', async () => {
    netBtnExt.disabled = true;
    await networkQuickTest();
    const header = document.createElement('li');
    header.textContent = '--- Extended ---';
    netResults.appendChild(header);

    // Multi-sample latency to a single endpoint
    const url = 'https://www.google.com/generate_204';
    const samples = 5;
    const times = [];
    for (let i=0;i<samples;i++) {
      const li = document.createElement('li');
      li.textContent = `Sample ${i+1}/${samples} …`;
      netResults.appendChild(li);
      const t0 = performance.now();
      try {
        await fetch(url, { cache: 'no-store', mode: 'no-cors' });
        const t = Math.round(performance.now() - t0);
        times.push(t);
        li.textContent = `Sample ${i+1} → ${t} ms`;
      } catch {
        const t = Math.round(performance.now() - t0);
        times.push(t);
        li.textContent = `Sample ${i+1} → FAIL (${t} ms)`;
      }
    }
    const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
    const liAvg = document.createElement('li');
    liAvg.textContent = `Avg latency over ${samples} samples: ${avg} ms`;
    netResults.appendChild(liAvg);

    // Simple throughput estimate by downloading a known-size blob
    // Using Cloudflare CDN test file (approx 100KB)
    const dlLi = document.createElement('li');
    netResults.appendChild(dlLi);
    try {
      const dlUrl = 'https://speed.cloudflare.com/__down?bytes=100000';
      const t0 = performance.now();
      const res = await fetch(dlUrl, { cache: 'no-store' });
      const buf = await res.arrayBuffer();
      const dt = (performance.now() - t0) / 1000;
      const mbps = (buf.byteLength * 8 / 1_000_000) / dt; // Mb/s
      dlLi.textContent = `Throughput sample: ${mbps.toFixed(2)} Mb/s`;
    } catch (e) {
      dlLi.textContent = `Throughput sample: FAIL (${e.message})`;
    }
    netBtnExt.disabled = false;
  });

  // ---------- Display ----------
  const dispArea = qs('#display-area');
  const dispGradient = qs('#disp-gradient');
  const dispChecker = qs('#disp-checker');
  const dispCycle = qs('#disp-cycle');
  const dispFullscreen = qs('#disp-fullscreen');

  function setDisplayColor(color) { dispArea.style.background = color; }
  qsa('.disp-color').forEach(btn => btn.addEventListener('click', () => setDisplayColor(btn.dataset.color)));

  dispGradient?.addEventListener('click', () => {
    dispArea.style.background = 'linear-gradient(90deg, #000, #fff)';
  });
  dispChecker?.addEventListener('click', () => {
    const size = 16;
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size*2}" height="${size*2}">`+
      `<rect width="100%" height="100%" fill="white"/>`+
      `<rect x="0" y="0" width="${size}" height="${size}" fill="black"/>`+
      `<rect x="${size}" y="${size}" width="${size}" height="${size}" fill="black"/>`+
      `</svg>`
    );
    dispArea.style.background = `url("data:image/svg+xml,${svg}") repeat`;
    dispArea.style.backgroundSize = `${size*2}px ${size*2}px`;
  });

  let cycleTimer = null;
  dispCycle?.addEventListener('click', () => {
    if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; dispCycle.textContent = 'Cycle colors'; return; }
    const colors = ['#ff0000','#00ff00','#0000ff','#000000','#ffffff'];
    let i = 0;
    setDisplayColor(colors[i]);
    cycleTimer = setInterval(() => { i = (i + 1) % colors.length; setDisplayColor(colors[i]); }, 1000);
    dispCycle.textContent = 'Stop cycling';
  });

  dispFullscreen?.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
      await dispArea.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  });

  // ---------- Audio ----------
  const micSel = qs('#mic-select');
  const micStart = qs('#mic-start');
  const micStop = qs('#mic-stop');
  const micStatus = qs('#mic-status');
  const micMeter = qs('#mic-meter');
  const outSel = qs('#out-select');
  const outStatus = qs('#out-status');
  const audioEl = qs('#test-audio');
  const fileInput = qs('#test-file');
  const btnLeft = qs('#test-left');
  const btnRight = qs('#test-right');
  const btnStereo = qs('#test-stereo');
  const btnPlay = qs('#test-play');
  const btnStop = qs('#test-stop');

  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let rafId = null;
  let mediaDest = null; // WebAudio destination to route into <audio>

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Route WebAudio through a MediaStreamDestination into the <audio> element
      mediaDest = audioCtx.createMediaStreamDestination();
      if (audioEl) {
        audioEl.srcObject = mediaDest.stream;
        audioEl.muted = false;
      }
    }
    return audioCtx;
  }

  async function startMic() {
    try {
      micStatus.textContent = 'Requesting microphone…';
      const constraints = { audio: micSel?.value ? { deviceId: { exact: micSel.value } } : true, video: false };
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = ensureAudioCtx();
      const src = ctx.createMediaStreamSource(micStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      // draw/compute RMS level
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const pct = Math.min(100, Math.max(0, Math.round(rms * 200)));
        micMeter.style.width = pct + '%';
        rafId = requestAnimationFrame(loop);
      };
      loop();
      micStart.disabled = true;
      micStop.disabled = false;
      micStatus.textContent = 'Microphone active';
    } catch (e) {
      micStatus.textContent = 'Mic error: ' + e.message;
      console.error(e);
    }
  }
  function stopMic() {
    if (rafId) cancelAnimationFrame(rafId), rafId = null;
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    micStart.disabled = false;
    micStop.disabled = true;
    micStatus.textContent = 'Microphone stopped';
    micMeter.style.width = '0%';
  }
  micStart?.addEventListener('click', startMic);
  micStop?.addEventListener('click', stopMic);

  // Output selection via setSinkId (if supported)
  async function applyOutputDevice() {
    if (!audioEl) return;
    const id = outSel?.value;
    if (audioEl.setSinkId && id) {
      try {
        await audioEl.setSinkId(id);
        outStatus.textContent = 'Output set.';
      } catch (e) {
        outStatus.textContent = 'Cannot set output: ' + e.message;
      }
    } else {
      outStatus.textContent = 'Output selection not supported.';
    }
  }
  outSel?.addEventListener('change', applyOutputDevice);

  // Test tones
  function playChannel(panValue) {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    let dest = mediaDest ? mediaDest : ctx.destination;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = panValue; // -1 left, +1 right
      osc.connect(panner).connect(gain).connect(dest);
    } else {
      osc.connect(gain).connect(dest);
    }
    gain.gain.value = 0.1;
    osc.start();
    setTimeout(() => osc.stop(), 800);
    // try to play element so sinkId routing is honored
    audioEl?.play?.().catch(()=>{});
  }
  btnLeft?.addEventListener('click', () => playChannel(-1));
  btnRight?.addEventListener('click', () => playChannel(1));
  btnStereo?.addEventListener('click', () => {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    let dest = mediaDest ? mediaDest : ctx.destination;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      osc.connect(panner).connect(gain).connect(dest);
      gain.gain.value = 0.1;
      osc.start();
      let t = 0;
      const id = setInterval(() => { panner.pan.value = Math.sin(t); t += 0.2; }, 50);
      setTimeout(() => { clearInterval(id); osc.stop(); }, 2500);
    } else {
      osc.connect(gain).connect(dest);
      gain.gain.value = 0.1;
      osc.start();
      setTimeout(() => osc.stop(), 2000);
    }
    audioEl?.play?.().catch(()=>{});
  });

  // File playback
  btnPlay?.addEventListener('click', async () => {
    if (!audioEl) return;
    if (fileInput?.files?.[0]) {
      const url = URL.createObjectURL(fileInput.files[0]);
  // ensure file playback uses src, not srcObject
  try { audioEl.srcObject = null; } catch {}
      audioEl.src = url;
    } else if (!audioEl.src) {
      // As a fun default, try to play a built-in short beep via data URL
      const ctx = ensureAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.1;
      const dest = mediaDest ? mediaDest : ctx.destination;
      osc.connect(gain).connect(dest);
      osc.start();
      setTimeout(() => osc.stop(), 400);
      return;
    }
    try { await audioEl.play(); } catch (e) { console.error(e); }
  });
  btnStop?.addEventListener('click', () => { audioEl?.pause(); audioEl.currentTime = 0; });

  // Initial device list (requires permission in some browsers to reveal labels)
  await listDevices();
  // If permissions are needed for labels, trigger a minimal getUserMedia to unlock labels
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    s.getTracks().forEach(t => t.stop());
    await listDevices();
  } catch (e) {
    // ignore
  }

  // Cleanup when navigating away
  const cleanup = () => {
    stopCamera();
    stopMic();
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    window.removeEventListener('beforeunload', cleanup);
  };
  window.addEventListener('beforeunload', cleanup, { once: true });

  // Also cleanup on client-side route change away from this page
  const onRouteChange = () => {
    const route = (location.hash || '').slice(2);
    if (route !== 'component-test') {
      cleanup();
      window.removeEventListener('hashchange', onRouteChange);
    }
  };
  window.addEventListener('hashchange', onRouteChange);

  // Init sub-tabs last so the UI starts correctly
  initialTab();
}
