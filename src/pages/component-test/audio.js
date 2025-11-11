/**
 * Audio testing functionality (microphone and speakers) using Tone.js
 * @module audio
 */
import { qs, supportsAPI } from "./utils.js";
import * as Tone from "tone";

/**
 * Manages microphone testing with real-time analysis and visualization
 */
class MicrophoneTester {
  constructor() {
    // DOM elements
    this.elements = {
      select: null,
      startBtn: null,
      stopBtn: null,
      monitorCheckbox: null,
      meter: null,
      canvas: null,
      vizPlaceholder: null,
      kpiLevel: null,
      kpiClip: null,
      status: null,
    };

    // Web Audio objects
    this.context = null;
    this.stream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.monitorGainNode = null;
    this.canvasCtx = null;

    // Animation frame IDs
    this.rafId = 0;

    // Analysis state
    this.clipCount = 0;
    this.levelDbVu = -Infinity;
    this.peakDbInstant = -Infinity;
    this.peakDbHold = -Infinity;
    this.lastClipAt = 0;
    this.clipHoldUntil = 0;
    this.monitorConnected = false;

    // Configuration (tunable)
    this.config = {
      vuAttackMs: 80,
      vuReleaseMs: 400,
      peakHoldMs: 1200,
      peakDecayDbPerSec: 6,
      clipThreshold: 0.98,
      clipMinSamples: 8,
    };
  }

  /**
   * Initialize DOM elements and event listeners
   */
  initialize() {
    // Get DOM elements
    this.elements.select = qs("#mic-select");
    this.elements.startBtn = qs("#mic-start");
    this.elements.stopBtn = qs("#mic-stop");
    this.elements.monitorCheckbox = qs("#mic-monitor");
    this.elements.meter = qs("#mic-meter");
    this.elements.canvas = qs("#mic-canvas") || qs("#mic-visualizer");
    this.elements.vizPlaceholder = qs("#mic-viz-placeholder");
    this.elements.kpiLevel = qs("#mic-kpi-level");
    this.elements.kpiClip = qs("#mic-kpi-clip");
    this.elements.status = qs("#mic-status");

    // Initialize canvas context
    if (this.elements.canvas?.getContext) {
      this.canvasCtx = this.elements.canvas.getContext("2d");
    }

    // Set up event listeners
    this.elements.startBtn?.addEventListener("click", () => this.start());
    this.elements.stopBtn?.addEventListener("click", () => this.stop());
    this.elements.monitorCheckbox?.addEventListener("change", () =>
      this.updateMonitoring()
    );
  }

  /**
   * Start microphone capture and real-time analysis
   */
  async start() {
    try {
      this.setStatus("Starting…", "badge");

      // Create AudioContext if needed
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Build constraints with optional device selection
      const constraints = {
        audio: this.elements.select?.value
          ? { deviceId: { exact: this.elements.select.value } }
          : true,
        video: false,
      };

      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create Web Audio nodes
      this.sourceNode = this.context.createMediaStreamSource(this.stream);
      this.analyserNode = this.context.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.0;

      this.monitorGainNode = this.context.createGain();
      this.monitorGainNode.gain.value = 1.0;

      // Connect nodes
      this.sourceNode.connect(this.analyserNode);
      this.monitorConnected = false;

      // Reset analysis state
      this.resetAnalysisState();

      // Start analysis loop
      this.startAnalysisLoop();

      // Update UI state
      this.setStatus("Listening", "badge ok");
      if (this.elements.canvas) this.elements.canvas.style.display = "block";
      if (this.elements.vizPlaceholder)
        this.elements.vizPlaceholder.style.display = "none";

      this.updateMonitoring();

      if (this.elements.startBtn) this.elements.startBtn.disabled = true;
      if (this.elements.stopBtn) this.elements.stopBtn.disabled = false;
    } catch (error) {
      const message = error?.message || "Unknown error";
      this.setStatus(`Error: ${message}`, "badge warn");
      console.error("Microphone start failed:", error);
    }
  }

  /**
   * Stop microphone recording and clean up resources
   */
  stop() {
    // Cancel animation frame
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    // Disconnect and clean up Web Audio nodes
    this.disconnectNodes();

    // Stop all tracks
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      this.stream = null;
    }

    // Close AudioContext
    if (this.context) {
      const ctx = this.context;
      this.context = null;
      ctx.close().catch(() => {});
    }

    // Reset UI
    this.resetUI();
    this.setStatus("Stopped", "badge");

    if (this.elements.startBtn) this.elements.startBtn.disabled = false;
    if (this.elements.stopBtn) this.elements.stopBtn.disabled = true;
  }

  /**
   * Update microphone monitoring state (route to speakers)
   */
  updateMonitoring() {
    if (
      !this.sourceNode ||
      !this.monitorGainNode ||
      !this.elements.monitorCheckbox
    )
      return;

    try {
      const shouldMonitor = !!this.elements.monitorCheckbox.checked;

      if (shouldMonitor && !this.monitorConnected) {
        this.sourceNode.connect(this.monitorGainNode);
        this.monitorGainNode.connect(this.context.destination);
        this.monitorConnected = true;
      } else if (!shouldMonitor && this.monitorConnected) {
        this.monitorGainNode.disconnect();
        this.monitorConnected = false;
      }
    } catch (err) {
      console.warn("Unable to toggle mic monitoring:", err);
    }
  }

  /**
   * Reset analysis state
   */
  resetAnalysisState() {
    this.clipCount = 0;
    this.levelDbVu = -Infinity;
    this.peakDbInstant = -Infinity;
    this.peakDbHold = -Infinity;
    this.lastClipAt = 0;
    this.clipHoldUntil = 0;
  }

  /**
   * Start the real-time analysis loop
   */
  startAnalysisLoop() {
    const timeData = new Float32Array(this.analyserNode.fftSize);
    let lastNow = performance.now();

    const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

    const loop = () => {
      this.analyserNode.getFloatTimeDomainData(timeData);

      // Calculate RMS and peak
      let sumSq = 0;
      let peakAbs = 0;
      let clippedSamples = 0;

      for (let i = 0; i < timeData.length; i++) {
        const s = timeData[i];
        const a = Math.abs(s);
        sumSq += s * s;
        if (a > peakAbs) peakAbs = a;
        if (a >= this.config.clipThreshold) clippedSamples++;
      }

      const rms = Math.sqrt(sumSq / timeData.length);
      const now = performance.now();
      const dtSec = Math.max(0.001, (now - lastNow) / 1000);
      lastNow = now;

      // Convert to dBFS
      const levelDbInst = toDb(rms);
      this.peakDbInstant = toDb(peakAbs);

      // Apply VU ballistics
      this.applyVUBallistics(levelDbInst, dtSec);

      // Apply peak-hold with decay
      this.applyPeakHold(now);

      // Detect clipping
      this.detectClipping(clippedSamples, now);

      // Update UI
      const meterPercent = this.calculateMeterPercent(this.levelDbVu);
      this.updateUI(this.levelDbVu, this.clipCount);
      this.drawVisualizer(timeData, meterPercent);

      this.rafId = requestAnimationFrame(loop);
    };

    loop();
  }

  /**
   * Apply VU meter ballistics (attack/release)
   */
  applyVUBallistics(levelDbInst, dtSec) {
    const attack = Math.max(0.001, this.config.vuAttackMs / 1000);
    const release = Math.max(0.001, this.config.vuReleaseMs / 1000);
    const tau = levelDbInst > this.levelDbVu ? attack : release;
    const alpha = 1 - Math.exp(-dtSec / tau);

    if (!Number.isFinite(this.levelDbVu)) {
      this.levelDbVu = levelDbInst;
    }

    this.levelDbVu = this.levelDbVu + alpha * (levelDbInst - this.levelDbVu);
  }

  /**
   * Apply peak-hold with decay
   */
  applyPeakHold(now) {
    if (this.peakDbInstant > this.peakDbHold) {
      this.peakDbHold = this.peakDbInstant;
      this.clipHoldUntil = now + this.config.peakHoldMs;
    } else if (now > this.clipHoldUntil) {
      this.peakDbHold = Math.max(
        this.peakDbInstant,
        this.peakDbHold -
          (this.config.peakDecayDbPerSec * (now - this.clipHoldUntil)) / 1000
      );
    }
  }

  /**
   * Detect clipping events
   */
  detectClipping(clippedSamples, now) {
    if (
      clippedSamples >= this.config.clipMinSamples &&
      now - this.lastClipAt > 200
    ) {
      this.clipCount++;
      this.lastClipAt = now;
    }
  }

  /**
   * Calculate meter percentage from dB value
   */
  calculateMeterPercent(levelDbVu) {
    const minDb = -60;
    const maxDb = 0;
    const clamped = Math.max(minDb, Math.min(levelDbVu, maxDb));
    return Math.round(((clamped - minDb) / (maxDb - minDb)) * 100);
  }

  /**
   * Update UI elements with current values
   */
  updateUI(levelDbVu, clipCount) {
    const meterPercent = this.calculateMeterPercent(levelDbVu);

    if (this.elements.meter) {
      this.elements.meter.style.width = `${meterPercent}%`;
    }

    if (this.elements.kpiLevel) {
      this.elements.kpiLevel.textContent = Number.isFinite(levelDbVu)
        ? `${levelDbVu.toFixed(1)} dBFS`
        : "-∞ dBFS";
    }

    if (this.elements.kpiClip) {
      this.elements.kpiClip.textContent = String(clipCount);
    }
  }

  /**
   * Draw waveform visualizer on canvas
   */
  drawVisualizer(buffer, meterPercent) {
    if (!this.canvasCtx || !this.elements.canvas) return;

    const ctx = this.canvasCtx;
    const canvas = this.elements.canvas;
    const w = canvas.width | 0;
    const h = canvas.height | 0;

    // Clear canvas
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
    const step = Math.max(1, Math.floor(buffer.length / w));
    for (let x = 0, i = 0; x < w; x++, i += step) {
      const s = buffer[Math.min(i, buffer.length - 1)] || 0;
      const y = (0.5 - s * 0.48) * h;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // VU bar at bottom
    const barH = 8;
    const filled = Math.round((meterPercent / 100) * w);
    ctx.fillStyle =
      meterPercent > 90 ? "#ff6b6b" : meterPercent > 75 ? "#ffd166" : "#2dd4bf";
    ctx.fillRect(0, h - barH, filled, barH);
    ctx.fillStyle = "#0f1720";
    ctx.fillRect(filled, h - barH, w - filled, barH);
  }

  /**
   * Set status message and class
   */
  setStatus(message, className = "badge") {
    if (this.elements.status) {
      this.elements.status.textContent = message;
      this.elements.status.className = className;
    }
  }

  /**
   * Disconnect all Web Audio nodes
   */
  disconnectNodes() {
    const nodes = [this.sourceNode, this.analyserNode, this.monitorGainNode];
    for (const node of nodes) {
      if (node) {
        try {
          node.disconnect();
        } catch {}
      }
    }
    this.sourceNode = null;
    this.analyserNode = null;
    this.monitorGainNode = null;
  }

  /**
   * Reset UI to default state
   */
  resetUI() {
    if (this.elements.meter) this.elements.meter.style.width = "0%";

    if (this.elements.canvas) {
      if (this.canvasCtx) {
        this.canvasCtx.clearRect(
          0,
          0,
          this.elements.canvas.width,
          this.elements.canvas.height
        );
      }
      this.elements.canvas.style.display = "none";
    }

    if (this.elements.vizPlaceholder) {
      this.elements.vizPlaceholder.style.display = "flex";
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.stop();
  }
}

/**
 * Manages speaker/tone testing using Tone.js
 */
class SpeakerTester {
  constructor() {
    // DOM elements
    this.elements = {
      select: null,
      leftBtn: null,
      rightBtn: null,
      bothBtn: null,
      sweepBtn: null,
      stopBtn: null,
      status: null,
      note: null,
      freqSelect: null,
      altToggle: null,
      altSpeed: null,
      altSpeedLabel: null,
    };

    // Tone.js objects
    this.synth = null;
    this.panner = null;

    // State
    this.altTimer = 0;
  }

  /**
   * Initialize DOM elements, Tone.js, and event listeners
   */
  initialize() {
    // Get DOM elements
    this.elements.select = qs("#spk-select");
    this.elements.leftBtn = qs("#spk-left");
    this.elements.rightBtn = qs("#spk-right");
    this.elements.bothBtn = qs("#spk-both");
    this.elements.sweepBtn = qs("#spk-sweep");
    this.elements.stopBtn = qs("#spk-stop");
    this.elements.status = qs("#spk-status");
    this.elements.note = qs("#spk-note");
    this.elements.freqSelect = qs("#spk-freq");
    this.elements.altToggle = qs("#spk-alt-toggle");
    this.elements.altSpeed = qs("#spk-alt-speed");
    this.elements.altSpeedLabel = qs("#spk-alt-speed-label");

    // Initialize Tone.js
    this.initializeSynth();

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize Tone.js synthesizer
   */
  initializeSynth() {
    try {
      // Create main synthesizer
      this.synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.01,
          decay: 0.1,
          sustain: 1,
          release: 0.1,
        },
      });

      // Fixed at 0 dB; users adjust system volume
      this.synth.volume.value = 0;

      // Create stereo panner
      this.panner = new Tone.Panner(0).toDestination();
      this.synth.connect(this.panner);

      console.log("Tone.js synthesizer initialized");
    } catch (error) {
      console.error("Failed to initialize Tone.js synthesizer:", error);
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.elements.leftBtn?.addEventListener("click", () =>
      this.playTone("C4", "4n", "Left")
    );
    this.elements.rightBtn?.addEventListener("click", () =>
      this.playTone("C4", "4n", "Right")
    );
    this.elements.bothBtn?.addEventListener("click", () =>
      this.playTone("C4", "4n", "Both")
    );
    this.elements.stopBtn?.addEventListener("click", () => this.stopAll());
    this.elements.sweepBtn?.addEventListener("click", () => this.startSweep());
    this.elements.altToggle?.addEventListener("change", () =>
      this.toggleAlternate()
    );
    this.elements.altSpeed?.addEventListener("input", () =>
      this.onAltSpeedChange()
    );
    this.elements.select?.addEventListener("change", () =>
      this.applySelection()
    );
  }

  /**
   * Play a tone on specified channel
   */
  async playTone(note, duration, channel) {
    if (!this.synth) return;

    try {
      // Start Tone.js context if needed
      if (Tone.context.state !== "running") {
        await Tone.start();
      }

      // Set pan based on channel
      if (this.panner) {
        let pan = 0;
        if (channel === "Left") pan = -1;
        else if (channel === "Right") pan = 1;
        else pan = 0; // Both -> center
        this.panner.pan.value = pan;
      }

      // Use selected frequency if available
      const selected = this.elements.freqSelect?.value || note;
      this.synth.triggerAttackRelease(selected, duration);

      this.setStatus(`Playing ${channel} (${note})`);
    } catch (error) {
      console.error("Failed to play tone:", error);
      this.setStatus("Error playing tone");
    }
  }

  /**
   * Start frequency sweep
   */
  async startSweep() {
    if (!this.synth) return;

    try {
      // Start Tone.js context if needed
      if (Tone.context.state !== "running") {
        await Tone.start();
      }

      this.stopAll();

      const duration = 4; // seconds

      // Schedule frequency sweep from C3 to C6
      this.synth.frequency.setValueAtTime("C3", Tone.now());
      this.synth.frequency.exponentialRampToValueAtTime(
        "C6",
        Tone.now() + duration
      );

      // Trigger the note
      this.synth.triggerAttack("C3", Tone.now());
      this.synth.triggerRelease(Tone.now() + duration);

      this.setStatus("Frequency sweep");

      // Reset status after sweep completes
      setTimeout(() => {
        this.setStatus("Idle");
      }, duration * 1000 + 100);
    } catch (error) {
      console.error("Failed to start sweep tone:", error);
      this.setStatus("Error starting sweep");
    }
  }

  /**
   * Stop all tone playback
   */
  stopAll() {
    if (this.synth) {
      this.synth.triggerRelease();
    }

    if (this.panner) {
      this.panner.pan.value = 0; // Reset to center
    }

    // Stop alternator if running
    if (this.altTimer) {
      clearInterval(this.altTimer);
      this.altTimer = 0;
      if (this.elements.altToggle) {
        this.elements.altToggle.checked = false;
      }
    }

    this.setStatus("Idle");
  }

  /**
   * Toggle alternating L/R playback
   */
  toggleAlternate() {
    if (!this.synth) return;

    const isChecked = this.elements.altToggle?.checked || false;

    if (!isChecked) {
      // Stopping alternator
      if (this.altTimer) {
        clearInterval(this.altTimer);
        this.altTimer = 0;
      }
      this.setStatus("Idle");
      return;
    }

    // Starting alternator
    const getMs = () => parseInt(this.elements.altSpeed?.value || "500", 10);

    let left = true;
    const tick = () => {
      if (!this.elements.altToggle?.checked) {
        // Checkbox was unchecked, stop
        if (this.altTimer) {
          clearInterval(this.altTimer);
          this.altTimer = 0;
        }
        this.setStatus("Idle");
        return;
      }
      const note = this.elements.freqSelect?.value || "A4";
      this.playTone(note, "8n", left ? "Left" : "Right");
      this.setStatus(`Alternating ${left ? "L" : "R"}`);
      left = !left;
    };

    tick();
    this.altTimer = setInterval(tick, getMs());
  }

  /**
   * Handle alternator speed change
   */
  onAltSpeedChange() {
    if (this.elements.altSpeedLabel && this.elements.altSpeed) {
      const v = parseInt(this.elements.altSpeed.value || "500", 10);
      this.elements.altSpeedLabel.textContent = `${v} ms`;
    }

    // If running, restart interval with new speed
    if (this.altTimer && this.elements.altToggle?.checked) {
      clearInterval(this.altTimer);
      this.altTimer = 0;
      this.toggleAlternate();
    }
  }

  /**
   * Apply speaker device selection
   */
  applySelection() {
    if (this.elements.note) {
      this.elements.note.textContent =
        "Note: Output device selection is limited with Tone.js. " +
        "Use your system audio settings for device selection.";
    }
  }

  /**
   * Set status message
   */
  setStatus(message) {
    if (this.elements.status) {
      this.elements.status.textContent = message;
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.stopAll();

    // Dispose of Tone.js objects
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }

    if (this.panner) {
      this.panner.dispose();
      this.panner = null;
    }

    // Close Tone.js context
    try {
      Tone.context.close();
    } catch (error) {
      console.warn("Error closing Tone.js context:", error);
    }
  }
}

/**
 * Main audio tester that coordinates microphone and speaker testing
 */
class AudioTester {
  constructor() {
    this.micTester = new MicrophoneTester();
    this.speakerTester = new SpeakerTester();
  }

  /**
   * Initialize both microphone and speaker testers
   */
  initialize() {
    if (!supportsAPI("webAudio")) {
      console.warn("Web Audio API not supported - audio tests will be limited");
    }

    this.micTester.initialize();
    this.speakerTester.initialize();
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.micTester.cleanup();
    this.speakerTester.cleanup();
  }
}

// Create singleton instance
const audioTester = new AudioTester();

/**
 * Initialize audio testing functionality
 * Sets up DOM elements, Tone.js objects, and event listeners
 */
export async function initAudio() {
  audioTester.initialize();
}

/**
 * Clean up audio resources using Tone.js
 * Should be called when leaving the page
 */
export function cleanupAudio() {
  audioTester.cleanup();
}
