/**
 * Audio testing functionality (microphone and speakers) using Tone.js
 * @module audio
 */
import { qs, supportsAPI, clamp } from "./utils.js";
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
  micKpiLevel: null,
  micKpiPeak: null,
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
  mic: null, // Microphone input
  meter: null, // Audio meter for microphone analysis
  analyser: null, // Analyser for microphone data
  micRafId: 0, // Animation frame for microphone updates

  // Microphone analysis state
  clipCount: 0,
  peakDb: -Infinity,
  // Smoothing and clip debounce
  levelSmooth: 0,
  lastClipAt: 0,
  monitorConnected: false,
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
  audioState.micKpiLevel = qs("#mic-kpi-level");
  audioState.micKpiPeak = qs("#mic-kpi-peak");
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

    // Set initial volume based on slider
    const initialVolume = parseFloat(audioState.spkVol?.value || "0.5");
    audioState.synth.volume.value = Tone.gainToDb(initialVolume);

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

  // Volume control
  audioState.spkVol?.addEventListener("input", updateMasterVolume);
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

    // Start Tone.js context if needed
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    // Create microphone input
    audioState.mic = new Tone.UserMedia();

    // Create a waveform analyser for time-domain samples
    // Using waveform allows accurate RMS/peak and clipping detection.
    audioState.analyser = new Tone.Analyser("waveform", 1024);

    // Connect microphone to analyser (we do not use Tone.Meter as it can be ambiguous
    // about units; we compute RMS/peak directly from waveform samples).
    audioState.mic.connect(audioState.analyser);

    // Open microphone with device selection (if provided in UI).
    const constraints = audioState.micSel?.value
      ? { deviceId: { exact: audioState.micSel.value } }
      : true;

    await audioState.mic.open(constraints);

    // Reset analysis state
    audioState.peakDb = -Infinity;
    audioState.clipCount = 0;
    audioState.levelSmooth = 0;
    audioState.lastClipAt = 0;
    audioState.monitorConnected = false;

    // Start analysis loop (runs every animation frame ~60 Hz)
    const loop = () => {
      // Pull latest time-domain samples in the linear range [-1, 1]
      const buf = audioState.analyser.getValue();

      // Defensive: ensure we have samples
      if (!buf || buf.length === 0) {
        audioState.micRafId = requestAnimationFrame(loop);
        return;
      }

      // Compute RMS and PEAK from waveform
      let sumSq = 0;
      let peakAbs = 0;
      for (let i = 0; i < buf.length; i++) {
        const s = buf[i];
        const a = Math.abs(s);
        sumSq += s * s;
        if (a > peakAbs) peakAbs = a;
      }
      const rms = Math.sqrt(sumSq / buf.length);

      // Exponential smoothing to stabilize the UI meter
      audioState.levelSmooth = audioState.levelSmooth * 0.85 + rms * 0.15;

      // Convert to dBFS: 0 dBFS == full scale (peakAbs/rms == 1)
      const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
      const levelDb = toDb(rms);
      const peakDbNow = toDb(peakAbs);

      // Track max peak (hold-highest)
      if (peakDbNow > audioState.peakDb) audioState.peakDb = peakDbNow;

      // Clip detection with debounce so we count discrete events, not every frame
      const now = performance.now();
      if (peakAbs >= 0.98 && now - audioState.lastClipAt > 200) {
        audioState.clipCount++;
        audioState.lastClipAt = now;
      }

      // Update UI elements
      if (audioState.micMeter) {
        const meterPercent = Math.round(
          clamp(audioState.levelSmooth * 100, 0, 100)
        );
        audioState.micMeter.style.width = `${meterPercent}%`;
      }

      if (audioState.micKpiLevel) {
        audioState.micKpiLevel.textContent = Number.isFinite(levelDb)
          ? `${levelDb.toFixed(1)} dBFS`
          : "-∞ dBFS";
      }

      if (audioState.micKpiPeak) {
        audioState.micKpiPeak.textContent = Number.isFinite(audioState.peakDb)
          ? `${audioState.peakDb.toFixed(1)} dBFS`
          : "-∞ dBFS";
      }

      if (audioState.micKpiClip) {
        audioState.micKpiClip.textContent = String(audioState.clipCount);
      }

      audioState.micRafId = requestAnimationFrame(loop);
    };

    loop();

    // Update UI state
    if (audioState.micStatus) {
      audioState.micStatus.textContent = "Listening";
      audioState.micStatus.className = "badge ok";
    }

    // Apply monitor setting if requested
    updateMonitoring();

    if (audioState.micStart) audioState.micStart.disabled = true;
    if (audioState.micStop) audioState.micStop.disabled = false;
  } catch (error) {
    const message = error.message || "Unknown error";
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

  // Close microphone
  if (audioState.mic) {
    // Disconnect from destination if we were monitoring
    try {
      if (audioState.monitorConnected) {
        // Disconnect from the master output
        audioState.mic.disconnect(Tone.Destination);
      }
    } catch {}
    audioState.mic.close();
    audioState.mic = null;
  }

  // Dispose of Tone.js objects
  if (audioState.analyser) {
    audioState.analyser.dispose();
    audioState.analyser = null;
  }

  // Reset UI
  if (audioState.micMeter) audioState.micMeter.style.width = "0%";

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
  if (!audioState.mic || !audioState.micMonitor) return;
  try {
    const dest = Tone.Destination; // master output
    if (audioState.micMonitor.checked && !audioState.monitorConnected) {
      audioState.mic.connect(dest);
      audioState.monitorConnected = true;
    } else if (!audioState.micMonitor.checked && audioState.monitorConnected) {
      audioState.mic.disconnect(dest);
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
    if (audioState.spkAltToggle) audioState.spkAltToggle.classList.remove("active");
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

/**
 * Update master volume for synthesizer
 */
function updateMasterVolume() {
  if (audioState.synth) {
    const volume = parseFloat(audioState.spkVol?.value || "0.5");
    audioState.synth.volume.value = Tone.gainToDb(volume);
  }
}

/**
 * Alternate tones between L and R at a configurable interval
 */
function toggleAlternateLR() {
  if (!audioState.synth) return;
  if (audioState.spkAltTimer) {
    clearInterval(audioState.spkAltTimer);
    audioState.spkAltTimer = 0;
    if (audioState.spkAltToggle) audioState.spkAltToggle.classList.remove("active");
    if (audioState.spkStatus) audioState.spkStatus.textContent = "Idle";
    return;
  }
  const getMs = () => parseInt(audioState.spkAltSpeed?.value || "500", 10);
  let left = true;
  const tick = () => {
    const n = audioState.spkFreq?.value || "A4";
    // short blip on each side
    playTone(n, "8n", left ? "Left" : "Right");
    if (audioState.spkStatus) audioState.spkStatus.textContent = `Alternating ${left ? "L" : "R"}`;
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
