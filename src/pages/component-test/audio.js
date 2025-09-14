/**
 * Audio testing functionality (microphone and speakers)
 * @module audio
 */

import { qs, supportsAPI } from './utils.js';

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

  // Audio processing
  micStream: null,
  audioCtx: null,
  analyser: null,
  micSource: null,
  monitorNode: null, // Gain node for monitoring
  rafId: 0,
  clipCount: 0,
  peakDb: -Infinity,

  // Speaker processing
  osc: null,
  gainL: null,
  gainR: null,
  merger: null,
  masterGain: null,
  msDest: null,
  audioEl: null // For selectable output via setSinkId
};

/**
 * Initialize audio testing functionality
 * Sets up DOM elements and event listeners
 */
export function initAudio() {
  if (!supportsAPI('webAudio')) {
    console.warn('Web Audio API not supported - audio tests will be limited');
  }

  // Get microphone elements
  audioState.micSel = qs('#mic-select');
  audioState.micStart = qs('#mic-start');
  audioState.micStop = qs('#mic-stop');
  audioState.micMonitor = qs('#mic-monitor');
  audioState.micMeter = qs('#mic-meter');
  audioState.micKpiLevel = qs('#mic-kpi-level');
  audioState.micKpiPeak = qs('#mic-kpi-peak');
  audioState.micKpiClip = qs('#mic-kpi-clip');
  audioState.micStatus = qs('#mic-status');

  // Get speaker elements
  audioState.spkSel = qs('#spk-select');
  audioState.spkLeft = qs('#spk-left');
  audioState.spkRight = qs('#spk-right');
  audioState.spkBoth = qs('#spk-both');
  audioState.spkSweep = qs('#spk-sweep');
  audioState.spkStop = qs('#spk-stop');
  audioState.spkVol = qs('#spk-volume');
  audioState.spkStatus = qs('#spk-status');
  audioState.spkNote = qs('#spk-note');

  // Set up event listeners
  setupAudioEventListeners();
}

/**
 * Set up all audio test event listeners
 */
function setupAudioEventListeners() {
  // Microphone controls
  audioState.micStart?.addEventListener('click', startMic);
  audioState.micStop?.addEventListener('click', stopMic);
  audioState.micMonitor?.addEventListener('change', updateMonitoring);

  // Speaker controls
  audioState.spkLeft?.addEventListener('click', () => startTone({ left: 1, right: 0, freq: 440 }));
  audioState.spkRight?.addEventListener('click', () => startTone({ left: 0, right: 1, freq: 440 }));
  audioState.spkBoth?.addEventListener('click', () => startTone({ left: 1, right: 1, freq: 440 }));
  audioState.spkStop?.addEventListener('click', stopTone);
  audioState.spkSweep?.addEventListener('click', startSweepTone);

  // Volume control
  audioState.spkVol?.addEventListener('input', updateMasterVolume);

  // Speaker selection
  audioState.spkSel?.addEventListener('change', applySpeakerSelection);
}

/**
 * Ensure AudioContext is available and running
 * @returns {AudioContext} Audio context
 */
function ensureAudioContext() {
  if (!audioState.audioCtx || audioState.audioCtx.state === 'closed') {
    audioState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioState.audioCtx;
}

/**
 * Set output device for audio element
 * @param {HTMLMediaElement} el - Audio element
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} Success status
 */
function setOutputDeviceFor(el, deviceId) {
  if (typeof el.setSinkId === 'function') {
    return el
      .setSinkId(deviceId)
      .then(() => true)
      .catch(() => false);
  }
  return Promise.resolve(false);
}

/**
 * Start microphone recording and analysis
 */
async function startMic() {
  try {
    if (audioState.micStatus) {
      audioState.micStatus.textContent = 'Starting…';
      audioState.micStatus.className = 'badge';
    }

    const constraints = {
      audio: audioState.micSel?.value ? { deviceId: { exact: audioState.micSel.value } } : true,
      video: false,
    };

    audioState.micStream = await navigator.mediaDevices.getUserMedia(constraints);

    const ctx = ensureAudioContext();
    audioState.micSource = ctx.createMediaStreamSource(audioState.micStream);
    audioState.analyser = ctx.createAnalyser();
    audioState.analyser.fftSize = 2048;
    audioState.analyser.smoothingTimeConstant = 0.8;

    audioState.micSource.connect(audioState.analyser);

    // Set up monitoring
    audioState.monitorNode = ctx.createGain();
    audioState.monitorNode.gain.value = audioState.micMonitor?.checked ? 0.6 : 0.0;
    audioState.micSource.connect(audioState.monitorNode);
    audioState.monitorNode.connect(ctx.destination);

    const data = new Float32Array(audioState.analyser.fftSize);
    audioState.peakDb = -Infinity;
    audioState.clipCount = 0;

    // Start analysis loop
    const loop = () => {
      audioState.analyser.getFloatTimeDomainData(data);

      // Calculate RMS
      let sum = 0, peak = 0, clipped = false;
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

      if (peakDbNow > audioState.peakDb) audioState.peakDb = peakDbNow;
      if (clipped) audioState.clipCount++;

      // Update UI
      if (audioState.micMeter) {
        audioState.micMeter.style.width = `${Math.max(0, Math.min(100, Math.round(rms * 140)))}%`;
      }

      if (audioState.micKpiLevel) {
        audioState.micKpiLevel.textContent = Number.isFinite(rmsDb)
          ? `${rmsDb.toFixed(1)} dB`
          : '-∞ dB';
      }

      if (audioState.micKpiPeak) {
        audioState.micKpiPeak.textContent = Number.isFinite(audioState.peakDb)
          ? `${audioState.peakDb.toFixed(1)} dB`
          : '-∞ dB';
      }

      if (audioState.micKpiClip) {
        audioState.micKpiClip.textContent = String(audioState.clipCount);
      }

      audioState.rafId = requestAnimationFrame(loop);
    };

    loop();

    if (audioState.micStatus) {
      audioState.micStatus.textContent = 'Listening';
      audioState.micStatus.className = 'badge ok';
    }

    if (audioState.micStart) audioState.micStart.disabled = true;
    if (audioState.micStop) audioState.micStop.disabled = false;

  } catch (error) {
    const message = error.message || 'Unknown error';
    if (audioState.micStatus) {
      audioState.micStatus.textContent = `Error: ${message}`;
      audioState.micStatus.className = 'badge warn';
    }
    console.error('Microphone start failed:', error);
  }
}

/**
 * Stop microphone recording
 */
function stopMic() {
  if (audioState.rafId) {
    cancelAnimationFrame(audioState.rafId);
    audioState.rafId = 0;
  }

  if (audioState.micStream) {
    audioState.micStream.getTracks().forEach((track) => track.stop());
    audioState.micStream = null;
  }

  // Clean up audio nodes
  try {
    audioState.micSource?.disconnect();
  } catch {}
  try {
    audioState.analyser?.disconnect();
  } catch {}
  try {
    audioState.monitorNode?.disconnect();
  } catch {}

  audioState.micSource = null;
  audioState.analyser = null;
  audioState.monitorNode = null;

  // Reset UI
  if (audioState.micMeter) audioState.micMeter.style.width = '0%';

  if (audioState.micStatus) {
    audioState.micStatus.textContent = 'Stopped';
    audioState.micStatus.className = 'badge';
  }

  if (audioState.micStart) audioState.micStart.disabled = false;
  if (audioState.micStop) audioState.micStop.disabled = true;
}

/**
 * Update microphone monitoring state
 */
function updateMonitoring() {
  if (audioState.monitorNode) {
    audioState.monitorNode.gain.value = audioState.micMonitor?.checked ? 0.6 : 0.0;
  }
}

/**
 * Get or create output node for speaker tests
 * @returns {AudioNode} Output node
 */
function getOutputNode() {
  const ctx = ensureAudioContext();
  const canSetSink = typeof HTMLMediaElement !== 'undefined' &&
                     typeof HTMLMediaElement.prototype.setSinkId === 'function';

  if (canSetSink) {
    if (!audioState.msDest) {
      audioState.msDest = ctx.createMediaStreamDestination();
      audioState.audioEl = document.createElement('audio');
      audioState.audioEl.autoplay = true;
      audioState.audioEl.srcObject = audioState.msDest.stream;
      audioState.audioEl.style.display = 'none';
      document.body.appendChild(audioState.audioEl);
      audioState.audioEl.play?.().catch(() => {});
    }

    const deviceId = audioState.spkSel?.value || 'default';
    if (deviceId) {
      audioState.audioEl
        .setSinkId(deviceId)
        .then(() => {
          if (audioState.spkNote) audioState.spkNote.textContent = '';
          audioState.audioEl.play?.().catch(() => {});
        })
        .catch((err) => {
          if (audioState.spkNote) {
            audioState.spkNote.textContent = `Output select failed: ${err.message}`;
          }
        });
    }
    return audioState.msDest;
  }

  return ctx.destination;
}

/**
 * Stop current tone playback
 */
function stopTone() {
  try {
    audioState.osc?.stop();
  } catch {}
  try {
    audioState.osc?.disconnect();
  } catch {}
  try {
    audioState.gainL?.disconnect();
  } catch {}
  try {
    audioState.gainR?.disconnect();
  } catch {}
  try {
    audioState.merger?.disconnect();
  } catch {}
  try {
    audioState.masterGain?.disconnect();
  } catch {}

  audioState.osc = null;
  audioState.gainL = null;
  audioState.gainR = null;
  audioState.merger = null;
  audioState.masterGain = null;

  if (audioState.spkStatus) {
    audioState.spkStatus.textContent = 'Idle';
  }
}

/**
 * Start tone playback
 * @param {Object} options - Tone options
 * @param {number} options.left - Left channel gain (0-1)
 * @param {number} options.right - Right channel gain (0-1)
 * @param {number} options.freq - Frequency in Hz
 */
function startTone({ left = 0, right = 0, freq = 440 }) {
  const ctx = ensureAudioContext();

  // Resume context if needed
  try {
    ctx.resume?.();
  } catch {}

  stopTone();

  audioState.osc = ctx.createOscillator();
  audioState.osc.type = 'sine';
  audioState.osc.frequency.value = freq;

  audioState.gainL = ctx.createGain();
  audioState.gainR = ctx.createGain();
  audioState.gainL.gain.value = left ? 1 : 0;
  audioState.gainR.gain.value = right ? 1 : 0;

  audioState.merger = ctx.createChannelMerger(2);
  audioState.osc.connect(audioState.gainL).connect(audioState.merger, 0, 0);
  audioState.osc.connect(audioState.gainR).connect(audioState.merger, 0, 1);

  audioState.masterGain = ctx.createGain();
  audioState.masterGain.gain.value = parseFloat(audioState.spkVol?.value || '0.5');
  audioState.merger.connect(audioState.masterGain).connect(getOutputNode());

  try {
    audioState.osc.start();
  } catch {}

  if (audioState.spkStatus) {
    audioState.spkStatus.textContent = left && right
      ? 'Playing (Both)'
      : left
      ? 'Playing (Left)'
      : 'Playing (Right)';
  }
}

/**
 * Start stereo sweep tone
 */
function startSweepTone() {
  const ctx = ensureAudioContext();
  try {
    ctx.resume?.();
  } catch {}

  stopTone();

  const duration = 4; // seconds
  const start = ctx.currentTime;
  const end = start + duration;

  audioState.osc = ctx.createOscillator();
  audioState.osc.type = 'sine';

  audioState.gainL = ctx.createGain();
  audioState.gainR = ctx.createGain();
  const vol = 1.0;

  audioState.gainL.gain.value = vol;
  audioState.gainR.gain.value = vol;

  audioState.merger = ctx.createChannelMerger(2);
  audioState.osc.connect(audioState.gainL).connect(audioState.merger, 0, 0);
  audioState.osc.connect(audioState.gainR).connect(audioState.merger, 0, 1);

  audioState.masterGain = ctx.createGain();
  audioState.masterGain.gain.value = parseFloat(audioState.spkVol?.value || '0.5');
  audioState.merger.connect(audioState.masterGain).connect(getOutputNode());

  audioState.osc.frequency.setValueAtTime(200, start);
  audioState.osc.frequency.exponentialRampToValueAtTime(2000, end);

  audioState.osc.start(start);

  if (audioState.spkStatus) {
    audioState.spkStatus.textContent = 'Stereo sweep';
  }

  // Pan from left to right
  const panSteps = 40;
  for (let i = 0; i <= panSteps; i++) {
    const t = start + (i / panSteps) * duration;
    const p = i / panSteps; // 0..1
    const l = Math.cos((p * Math.PI) / 2);
    const r = Math.sin((p * Math.PI) / 2);
    audioState.gainL.gain.setValueAtTime(vol * l, t);
    audioState.gainR.gain.setValueAtTime(vol * r, t);
  }

  audioState.osc.stop(end);
  setTimeout(() => {
    stopTone();
  }, duration * 1000 + 100);
}

/**
 * Update master volume
 */
function updateMasterVolume() {
  if (audioState.masterGain) {
    audioState.masterGain.gain.value = parseFloat(audioState.spkVol?.value || '0.5');
  }
}

/**
 * Apply speaker device selection
 */
async function applySpeakerSelection() {
  const canSetSink = typeof HTMLMediaElement !== 'undefined' &&
                     typeof HTMLMediaElement.prototype.setSinkId === 'function';

  if (!canSetSink) {
    if (audioState.spkNote) {
      audioState.spkNote.textContent =
        'Note: Selecting specific output may be limited by browser.';
    }
    return;
  }

  getOutputNode();
}

/**
 * Clean up audio resources
 * Should be called when leaving the page
 */
export function cleanupAudio() {
  stopMic();
  stopTone();

  // Close audio context
  try {
    audioState.audioCtx?.close();
  } catch {}

  audioState.audioCtx = null;

  // Remove audio element
  if (audioState.audioEl) {
    audioState.audioEl.remove();
    audioState.audioEl = null;
  }
}
