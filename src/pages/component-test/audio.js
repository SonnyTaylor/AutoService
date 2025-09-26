/**
 * Audio testing functionality (microphone and speakers) using Tone.js
 * @module audio
 */
import { qs, supportsAPI } from "./utils.js";
import * as Tone from "tone";

/**
 * Audio test state
 * @type {Object}
 */
let audioState = {
  // Microphone elements
  micSel: null,
  micStart: null,
  micStop: null,
  micMonitor: null,
  micMeter: null,
  micCanvas: null, // optional canvas visualizer
  micCanvasCtx: null,
  micVizPlaceholder: null,
  micKpiLevel: null,
  micKpiClip: null,
  micStatus: null,

  // Speaker elements
  spkSel: null,
  spkLeft: null,
  spkRight: null,
  spkBoth: null,
  spkSweep: null,
  spkStop: null,
  spkVol: null,
  spkStatus: null,
  spkNote: null,
  spkFreq: null, // frequency selector
  spkAltToggle: null,
  spkAltSpeed: null,
  spkAltSpeedLabel: null,
  spkAltTimer: 0,

  // Tone.js objects
  synth: null, // Main synthesizer for speaker testing
  panner: null, // Stereo panner for channel routing
  // Native Web Audio for microphone
  micContext: null,
  micStream: null,
  micSourceNode: null,
  analyserNode: null,
  monitorGainNode: null,
  micRafId: 0, // Animation frame for microphone analysis
  vizRafId: 0, // Animation frame for canvas visualizer

  // Microphone analysis state
  clipCount: 0,
  levelDbVu: -Infinity, // VU-like RMS in dBFS with ballistics
  peakDbInstant: -Infinity, // instantaneous peak (linear->dB)
  peakDbHold: -Infinity, // peak-hold display with decay
  // Ballistics, clip debounce, calibration
  lastClipAt: 0,
  clipHoldUntil: 0,
  monitorConnected: false,
  // Config (tunable)
  vuAttackMs: 80, // faster rise for responsiveness
  vuReleaseMs: 400, // slower fall for readability
  peakHoldMs: 1200, // hold peak for readability
  peakDecayDbPerSec: 6, // decay of peak-hold after hold period
  clipThreshold: 0.98, // near full scale
  clipMinSamples: 8, // require n clipped samples within buffer
};

/**
 * Initialize audio testing functionality
 * Sets up DOM elements, Tone.js objects, and event listeners
 */
export async function initAudio() {
  if (!supportsAPI("webAudio")) {
    console.warn("Web Audio API not supported - audio tests will be limited");
  }

  // Get microphone elements
  audioState.micSel = qs("#mic-select");
  audioState.micStart = qs("#mic-start");
  audioState.micStop = qs("#mic-stop");
  audioState.micMonitor = qs("#mic-monitor");
  audioState.micMeter = qs("#mic-meter");
  audioState.micCanvas = qs("#mic-canvas") || qs("#mic-visualizer");
  if (audioState.micCanvas && audioState.micCanvas.getContext) {
    audioState.micCanvasCtx = audioState.micCanvas.getContext("2d");
  }
  audioState.micVizPlaceholder = qs("#mic-viz-placeholder");
  audioState.micKpiLevel = qs("#mic-kpi-level");
  audioState.micKpiClip = qs("#mic-kpi-clip");
  audioState.micStatus = qs("#mic-status");

  // Get speaker elements
  audioState.spkSel = qs("#spk-select");
  audioState.spkLeft = qs("#spk-left");
  audioState.spkRight = qs("#spk-right");
  audioState.spkBoth = qs("#spk-both");
  audioState.spkSweep = qs("#spk-sweep");
  audioState.spkStop = qs("#spk-stop");
  audioState.spkVol = qs("#spk-volume");
  audioState.spkStatus = qs("#spk-status");
  audioState.spkNote = qs("#spk-note");
  audioState.spkFreq = qs("#spk-freq");
  audioState.spkAltToggle = qs("#spk-alt-toggle");
  audioState.spkAltSpeed = qs("#spk-alt-speed");
  audioState.spkAltSpeedLabel = qs("#spk-alt-speed-label");

  // Initialize Tone.js synthesizer for speaker testing
  initializeToneSynth();

  // Set up event listeners
  setupAudioEventListeners();
}

/**
 * Initialize Tone.js synthesizer for speaker testing
 * Kept simple (single Synth -> Destination) because output-device routing
 * is OS-controlled in most browsers/embedders. Volume is set from slider.
 */
function initializeToneSynth() {
  try {
    // Create main synthesizer for speaker testing
    audioState.synth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 1,
        release: 0.1,
      },
    });

    // Fixed at 0 dB; users adjust system volume
    audioState.synth.volume.value = 0;

    // Create stereo panner and route synth -> panner -> destination
    audioState.panner = new Tone.Panner(0).toDestination();
    audioState.synth.connect(audioState.panner);

    console.log("Tone.js synthesizer initialized");
  } catch (error) {
    console.error("Failed to initialize Tone.js synthesizer:", error);
  }
}

/**
 * Set up all audio test event listeners
 */
function setupAudioEventListeners() {
  // Microphone controls
  audioState.micStart?.addEventListener("click", startMic);
  audioState.micStop?.addEventListener("click", stopMic);
  audioState.micMonitor?.addEventListener("change", updateMonitoring);

  // Speaker controls - simplified with Tone.js
  audioState.spkLeft?.addEventListener("click", () =>
    playTone("C4", "4n", "Left")
  );
  audioState.spkRight?.addEventListener("click", () =>
    playTone("C4", "4n", "Right")
  );
  audioState.spkBoth?.addEventListener("click", () =>
    playTone("C4", "4n", "Both")
  );
  audioState.spkStop?.addEventListener("click", stopAllTones);
  audioState.spkSweep?.addEventListener("click", startSweepTone);

  // Volume control removed; synth fixed at 0 dB (use system volume)
  audioState.spkFreq?.addEventListener("change", () => {
    // No-op until next tone; sweep uses its own path
  });
  audioState.spkAltToggle?.addEventListener("click", toggleAlternateLR);
  audioState.spkAltSpeed?.addEventListener("input", onAltSpeedChange);

  // Speaker selection (limited support with Tone.js)
  audioState.spkSel?.addEventListener("change", applySpeakerSelection);
}

/**
 * Play a tone using Tone.js synthesizer
 * @param {string} note - Note to play (e.g., 'C4', 'A4')
 * @param {string} duration - Duration (e.g., '4n', '8n', '1n')
 * @param {string} channel - 'Left', 'Right', or 'Both'
 */
async function playTone(note, duration, channel) {
  if (!audioState.synth) return;

  try {
    // Start Tone.js context if needed
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    // Pan based on channel selection
    if (audioState.panner) {
      let pan = 0;
      if (channel === "Left") pan = -1;
      else if (channel === "Right") pan = 1;
      else pan = 0; // Both -> center
      audioState.panner.pan.value = pan;
    }

    // Use selected frequency if note equals 'A4' default and frequency picker is set
    const selected = audioState.spkFreq?.value || note;
    audioState.synth.triggerAttackRelease(selected, duration);

    // Update status
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = `Playing ${channel} (${note})`;
    }
  } catch (error) {
    console.error("Failed to play tone:", error);
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = "Error playing tone";
    }
  }
}

/**
 * Start microphone capture and real-time analysis.
 * We use a waveform analyser to compute RMS (perceived loudness proxy)
 * and PEAK (for dBFS peak-hold) in the linear domain, then convert to dBFS.
 * Clipping is detected when peak exceeds ~0.98 FS and debounced to avoid
 * counting every animation frame as a separate clip.
 */
async function startMic() {
  try {
    if (audioState.micStatus) {
      audioState.micStatus.textContent = "Starting…";
      audioState.micStatus.className = "badge";
    }

    // Ensure AudioContext
    if (!audioState.micContext) {
      audioState.micContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    // Build constraints (device selection optional)
    const constraints = {
      audio: audioState.micSel?.value
        ? { deviceId: { exact: audioState.micSel.value } }
        : true,
      video: false,
    };

    // getUserMedia must be called outside of AudioContext in some environments, but
    // here it is user-initiated, so it should be fine
    audioState.micStream = await navigator.mediaDevices.getUserMedia(
      constraints
    );

    // Create nodes
    audioState.micSourceNode = audioState.micContext.createMediaStreamSource(
      audioState.micStream
    );
    audioState.analyserNode = audioState.micContext.createAnalyser();
    audioState.analyserNode.fftSize = 2048;
    audioState.analyserNode.smoothingTimeConstant = 0.0; // no built-in smoothing for true math

    // Optional monitor routing via gain node
    audioState.monitorGainNode = audioState.micContext.createGain();
    audioState.monitorGainNode.gain.value = 1.0;

    // Wiring: source -> analyser (always)
    audioState.micSourceNode.connect(audioState.analyserNode);
    // Monitoring connection is toggled in updateMonitoring
    audioState.monitorConnected = false;

    // Reset analysis state
    audioState.clipCount = 0;
    audioState.levelDbVu = -Infinity;
    audioState.peakDbInstant = -Infinity;
    audioState.peakDbHold = -Infinity;
    audioState.lastClipAt = 0;
    audioState.clipHoldUntil = 0;

    const timeData = new Float32Array(audioState.analyserNode.fftSize);
    let lastNow = performance.now();

    const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

    const updateUi = (levelDbVu, clipCount, peakPercent) => {
      // Meter map: -60 dBFS .. 0 dBFS -> 0 .. 100 %
      const minDb = -60;
      const maxDb = 0;
      const clamped = Math.max(minDb, Math.min(levelDbVu, maxDb));
      const meterPercent = Math.round(
        ((clamped - minDb) / (maxDb - minDb)) * 100
      );

      if (audioState.micMeter) {
        audioState.micMeter.style.width = `${meterPercent}%`;
      }
      if (audioState.micKpiLevel) {
        audioState.micKpiLevel.textContent = Number.isFinite(levelDbVu)
          ? `${levelDbVu.toFixed(1)} dBFS`
          : "-∞ dBFS";
      }
      if (audioState.micKpiClip) {
        audioState.micKpiClip.textContent = String(clipCount);
      }
    };

    const drawVisualizer = (buf, meterPercent) => {
      const ctx = audioState.micCanvasCtx;
      const canvas = audioState.micCanvas;
      if (!ctx || !canvas) return;
      const w = canvas.width | 0;
      const h = canvas.height | 0;
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = "#1b2733";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform
      ctx.strokeStyle = "#4cc2ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(buf.length / w));
      for (let x = 0, i = 0; x < w; x++, i += step) {
        const s = buf[Math.min(i, buf.length - 1)] || 0;
        const y = (0.5 - s * 0.48) * h;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // VU bar at bottom
      const barH = 8;
      const filled = Math.round((meterPercent / 100) * w);
      ctx.fillStyle =
        meterPercent > 90
          ? "#ff6b6b"
          : meterPercent > 75
          ? "#ffd166"
          : "#2dd4bf";
      ctx.fillRect(0, h - barH, filled, barH);
      ctx.fillStyle = "#0f1720";
      ctx.fillRect(filled, h - barH, w - filled, barH);
    };

    // Analysis + visualizer loop
    const loop = () => {
      audioState.analyserNode.getFloatTimeDomainData(timeData);

      let sumSq = 0;
      let peakAbs = 0;
      let clippedSamples = 0;
      for (let i = 0; i < timeData.length; i++) {
        const s = timeData[i];
        const a = Math.abs(s);
        sumSq += s * s;
        if (a > peakAbs) peakAbs = a;
        if (a >= audioState.clipThreshold) clippedSamples++;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const now = performance.now();
      const dtSec = Math.max(0.001, (now - lastNow) / 1000);
      lastNow = now;

      // Convert to dBFS
      const levelDbInst = toDb(rms);
      audioState.peakDbInstant = toDb(peakAbs);

      // VU ballistics
      const attack = Math.max(0.001, audioState.vuAttackMs / 1000);
      const release = Math.max(0.001, audioState.vuReleaseMs / 1000);
      const tau = levelDbInst > audioState.levelDbVu ? attack : release;
      const alpha = 1 - Math.exp(-dtSec / tau);
      if (!Number.isFinite(audioState.levelDbVu))
        audioState.levelDbVu = levelDbInst;
      audioState.levelDbVu =
        audioState.levelDbVu + alpha * (levelDbInst - audioState.levelDbVu);

      // Peak-hold with decay
      if (audioState.peakDbInstant > audioState.peakDbHold) {
        audioState.peakDbHold = audioState.peakDbInstant;
        audioState.clipHoldUntil = now + audioState.peakHoldMs;
      } else if (now > audioState.clipHoldUntil) {
        audioState.peakDbHold = Math.max(
          audioState.peakDbInstant,
          audioState.peakDbHold - audioState.peakDecayDbPerSec * dtSec
        );
      }

      // Clip detection (contiguous-event style)
      if (
        clippedSamples >= audioState.clipMinSamples &&
        now - audioState.lastClipAt > 200
      ) {
        audioState.clipCount++;
        audioState.lastClipAt = now;
      }

      // Update UI
      const minDb = -60;
      const maxDb = 0;
      const clamped = Math.max(minDb, Math.min(audioState.levelDbVu, maxDb));
      const meterPercent = Math.round(
        ((clamped - minDb) / (maxDb - minDb)) * 100
      );
      updateUi(audioState.levelDbVu, audioState.clipCount, meterPercent);
      drawVisualizer(timeData, meterPercent);

      audioState.micRafId = requestAnimationFrame(loop);
    };

    loop();

    // Update UI state
    if (audioState.micStatus) {
      audioState.micStatus.textContent = "Listening";
      audioState.micStatus.className = "badge ok";
    }
    if (audioState.micCanvas) audioState.micCanvas.style.display = "block";
    if (audioState.micVizPlaceholder)
      audioState.micVizPlaceholder.style.display = "none";

    // Apply monitor setting if requested
    updateMonitoring();

    if (audioState.micStart) audioState.micStart.disabled = true;
    if (audioState.micStop) audioState.micStop.disabled = false;
  } catch (error) {
    const message = error?.message || "Unknown error";
    if (audioState.micStatus) {
      audioState.micStatus.textContent = `Error: ${message}`;
      audioState.micStatus.className = "badge warn";
    }
    console.error("Microphone start failed:", error);
  }
}

/**
 * Stop microphone recording
 */
function stopMic() {
  if (audioState.micRafId) {
    cancelAnimationFrame(audioState.micRafId);
    audioState.micRafId = 0;
  }
  if (audioState.vizRafId) {
    cancelAnimationFrame(audioState.vizRafId);
    audioState.vizRafId = 0;
  }

  // Tear down Web Audio nodes and stream
  try {
    if (audioState.micSourceNode) {
      try {
        audioState.micSourceNode.disconnect();
      } catch {}
      audioState.micSourceNode = null;
    }
    if (audioState.analyserNode) {
      try {
        audioState.analyserNode.disconnect();
      } catch {}
      audioState.analyserNode = null;
    }
    if (audioState.monitorGainNode) {
      try {
        audioState.monitorGainNode.disconnect();
      } catch {}
      audioState.monitorGainNode = null;
    }
    if (audioState.micStream) {
      for (const track of audioState.micStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      audioState.micStream = null;
    }
    if (audioState.micContext) {
      const ctx = audioState.micContext;
      audioState.micContext = null;
      // Close asynchronously to release device promptly
      ctx.close().catch(() => {});
    }
  } catch {}

  // Reset UI
  if (audioState.micMeter) audioState.micMeter.style.width = "0%";
  // Toggle visualizer visibility
  if (audioState.micCanvas) {
    const ctx = audioState.micCanvasCtx;
    if (ctx) {
      ctx.clearRect(
        0,
        0,
        audioState.micCanvas.width,
        audioState.micCanvas.height
      );
    }
    audioState.micCanvas.style.display = "none";
  }
  if (audioState.micVizPlaceholder)
    audioState.micVizPlaceholder.style.display = "flex";

  if (audioState.micStatus) {
    audioState.micStatus.textContent = "Stopped";
    audioState.micStatus.className = "badge";
  }

  if (audioState.micStart) audioState.micStart.disabled = false;
  if (audioState.micStop) audioState.micStop.disabled = true;
}

/**
 * Update microphone monitoring state (Tone.js handles this automatically)
 */
function updateMonitoring() {
  // Toggle routing the mic input to the system output based on checkbox state.
  // We connect/disconnect explicitly to avoid unintended feedback.
  if (
    !audioState.micSourceNode ||
    !audioState.monitorGainNode ||
    !audioState.micMonitor
  )
    return;
  try {
    const shouldMonitor = !!audioState.micMonitor.checked;
    if (shouldMonitor && !audioState.monitorConnected) {
      audioState.micSourceNode.connect(audioState.monitorGainNode);
      audioState.monitorGainNode.connect(audioState.micContext.destination);
      audioState.monitorConnected = true;
    } else if (!shouldMonitor && audioState.monitorConnected) {
      audioState.monitorGainNode.disconnect();
      audioState.monitorConnected = false;
    }
  } catch (err) {
    console.warn("Unable to toggle mic monitoring:", err);
  }
}

/**
 * Stop current tone playback
 */
function stopAllTones() {
  if (audioState.synth) {
    audioState.synth.triggerRelease();
  }
  if (audioState.panner) {
    // Reset to center after stopping
    audioState.panner.pan.value = 0;
  }
  // Stop alternator if running
  if (audioState.spkAltTimer) {
    clearInterval(audioState.spkAltTimer);
    audioState.spkAltTimer = 0;
    if (audioState.spkAltToggle)
      audioState.spkAltToggle.classList.remove("active");
  }

  if (audioState.spkStatus) {
    audioState.spkStatus.textContent = "Idle";
  }
}

// Legacy function name for compatibility
function stopTone() {
  stopAllTones();
}

/**
 * Start stereo sweep tone using Tone.js
 */
async function startSweepTone() {
  if (!audioState.synth) return;

  try {
    // Start Tone.js context if needed
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    stopAllTones();

    const duration = 4; // seconds

    // Schedule frequency sweep from C3 to C6
    audioState.synth.frequency.setValueAtTime("C3", Tone.now());
    audioState.synth.frequency.exponentialRampToValueAtTime(
      "C6",
      Tone.now() + duration
    );

    // Trigger the note
    audioState.synth.triggerAttack("C3", Tone.now());
    audioState.synth.triggerRelease(Tone.now() + duration);

    // Update status
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = "Frequency sweep";
    }

    // Reset status after sweep completes
    setTimeout(() => {
      if (audioState.spkStatus) {
        audioState.spkStatus.textContent = "Idle";
      }
    }, duration * 1000 + 100);
  } catch (error) {
    console.error("Failed to start sweep tone:", error);
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = "Error starting sweep";
    }
  }
}

// Volume control removed; synth uses system volume

/**
 * Alternate tones between L and R at a configurable interval
 */
function toggleAlternateLR() {
  if (!audioState.synth) return;
  if (audioState.spkAltTimer) {
    clearInterval(audioState.spkAltTimer);
    audioState.spkAltTimer = 0;
    if (audioState.spkAltToggle)
      audioState.spkAltToggle.classList.remove("active");
    if (audioState.spkStatus) audioState.spkStatus.textContent = "Idle";
    return;
  }
  const getMs = () => parseInt(audioState.spkAltSpeed?.value || "500", 10);
  let left = true;
  const tick = () => {
    const n = audioState.spkFreq?.value || "A4";
    // short blip on each side
    playTone(n, "8n", left ? "Left" : "Right");
    if (audioState.spkStatus)
      audioState.spkStatus.textContent = `Alternating ${left ? "L" : "R"}`;
    left = !left;
  };
  tick();
  audioState.spkAltTimer = setInterval(tick, getMs());
  if (audioState.spkAltToggle) audioState.spkAltToggle.classList.add("active");
}

/** Update label for alternator speed */
function onAltSpeedChange() {
  if (audioState.spkAltSpeedLabel && audioState.spkAltSpeed) {
    const v = parseInt(audioState.spkAltSpeed.value || "500", 10);
    audioState.spkAltSpeedLabel.textContent = `${v} ms`;
  }
  // If running, restart interval with new speed
  if (audioState.spkAltTimer) {
    clearInterval(audioState.spkAltTimer);
    audioState.spkAltTimer = 0;
    toggleAlternateLR();
  }
}

/**
 * Apply speaker device selection
 * Note: Tone.js has limited support for output device selection
 */
async function applySpeakerSelection() {
  if (audioState.spkNote) {
    audioState.spkNote.textContent =
      "Note: Output device selection is limited with Tone.js. " +
      "Use your system audio settings for device selection.";
  }
}

/**
 * Clean up audio resources using Tone.js
 * Should be called when leaving the page
 */
export function cleanupAudio() {
  stopMic();
  stopAllTones();

  // Dispose of Tone.js objects
  if (audioState.synth) {
    audioState.synth.dispose();
    audioState.synth = null;
  }
  if (audioState.panner) {
    audioState.panner.dispose();
    audioState.panner = null;
  }

  // Close Tone.js context
  try {
    Tone.context.close();
  } catch (error) {
    console.warn("Error closing Tone.js context:", error);
  }
}
