/**
 * Audio testing functionality (microphone and speakers) using Tone.js
 * @module audio
 */

import { qs, supportsAPI } from './utils.js';
import * as Tone from 'tone';

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

  // Tone.js objects
  synth: null, // Main synthesizer for speaker testing
  mic: null, // Microphone input
  meter: null, // Audio meter for microphone analysis
  analyser: null, // Analyser for microphone data
  micRafId: 0, // Animation frame for microphone updates

  // Microphone analysis state
  clipCount: 0,
  peakDb: -Infinity
};

/**
 * Initialize audio testing functionality
 * Sets up DOM elements, Tone.js objects, and event listeners
 */
export async function initAudio() {
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

  // Initialize Tone.js synthesizer for speaker testing
  initializeToneSynth();

  // Set up event listeners
  setupAudioEventListeners();
}

/**
 * Initialize Tone.js synthesizer for speaker testing
 */
function initializeToneSynth() {
  try {
    // Create main synthesizer for speaker testing
    audioState.synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 1,
        release: 0.1
      }
    });

    // Set initial volume based on slider
    const initialVolume = parseFloat(audioState.spkVol?.value || '0.5');
    audioState.synth.volume.value = Tone.gainToDb(initialVolume);

    // Connect to destination (speakers)
    audioState.synth.toDestination();

    console.log('Tone.js synthesizer initialized');
  } catch (error) {
    console.error('Failed to initialize Tone.js synthesizer:', error);
  }
}

/**
 * Set up all audio test event listeners
 */
function setupAudioEventListeners() {
  // Microphone controls
  audioState.micStart?.addEventListener('click', startMic);
  audioState.micStop?.addEventListener('click', stopMic);
  audioState.micMonitor?.addEventListener('change', updateMonitoring);

  // Speaker controls - simplified with Tone.js
  audioState.spkLeft?.addEventListener('click', () => playTone('C4', '4n', 'Left'));
  audioState.spkRight?.addEventListener('click', () => playTone('C4', '4n', 'Right'));
  audioState.spkBoth?.addEventListener('click', () => playTone('C4', '4n', 'Both'));
  audioState.spkStop?.addEventListener('click', stopAllTones);
  audioState.spkSweep?.addEventListener('click', startSweepTone);

  // Volume control
  audioState.spkVol?.addEventListener('input', updateMasterVolume);

  // Speaker selection (limited support with Tone.js)
  audioState.spkSel?.addEventListener('change', applySpeakerSelection);
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
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    // Play the note
    audioState.synth.triggerAttackRelease(note, duration);

    // Update status
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = `Playing ${channel} (${note})`;
    }

  } catch (error) {
    console.error('Failed to play tone:', error);
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = 'Error playing tone';
    }
  }
}

/**
 * Start microphone recording and analysis using Tone.js
 */
async function startMic() {
  try {
    if (audioState.micStatus) {
      audioState.micStatus.textContent = 'Starting…';
      audioState.micStatus.className = 'badge';
    }

    // Start Tone.js context if needed
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    // Create microphone input
    audioState.mic = new Tone.UserMedia();

    // Create meter for level detection
    audioState.meter = new Tone.Meter();
    audioState.analyser = new Tone.Analyser('fft', 2048);

    // Connect microphone to analyser and meter
    audioState.mic.connect(audioState.analyser);
    audioState.mic.connect(audioState.meter);

    // Open microphone with device selection
    const constraints = audioState.micSel?.value
      ? { deviceId: { exact: audioState.micSel.value } }
      : true;

    await audioState.mic.open(constraints);

    // Reset analysis state
    audioState.peakDb = -Infinity;
    audioState.clipCount = 0;

    // Start analysis loop
    const loop = () => {
      // Get current level from meter
      const level = audioState.meter.getValue();
      const levelDb = Tone.gainToDb(Math.abs(level) + 0.001); // Add small offset to avoid -∞

      // Get FFT data for peak detection
      const fftData = audioState.analyser.getValue();
      let peak = 0;
      let clipped = false;

      // Find peak in FFT data
      for (let i = 0; i < fftData.length; i++) {
        const magnitude = Math.abs(fftData[i]);
        if (magnitude > peak) peak = magnitude;
        if (magnitude > 0.98) clipped = true;
      }

      const peakDbNow = Tone.gainToDb(peak + 0.001);

      // Update peak tracking
      if (peakDbNow > audioState.peakDb) audioState.peakDb = peakDbNow;
      if (clipped) audioState.clipCount++;

      // Update UI
      if (audioState.micMeter) {
        const meterPercent = Math.max(0, Math.min(100, Math.round(Math.abs(level) * 140)));
        audioState.micMeter.style.width = `${meterPercent}%`;
      }

      if (audioState.micKpiLevel) {
        audioState.micKpiLevel.textContent = Number.isFinite(levelDb)
          ? `${levelDb.toFixed(1)} dB`
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

      audioState.micRafId = requestAnimationFrame(loop);
    };

    loop();

    // Update UI state
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
  if (audioState.micRafId) {
    cancelAnimationFrame(audioState.micRafId);
    audioState.micRafId = 0;
  }

  // Close microphone
  if (audioState.mic) {
    audioState.mic.close();
    audioState.mic = null;
  }

  // Dispose of Tone.js objects
  if (audioState.meter) {
    audioState.meter.dispose();
    audioState.meter = null;
  }

  if (audioState.analyser) {
    audioState.analyser.dispose();
    audioState.analyser = null;
  }

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
 * Update microphone monitoring state (Tone.js handles this automatically)
 */
function updateMonitoring() {
  // With Tone.js, monitoring is handled by the connections
  // The mic is already connected to the destination when monitoring is enabled
}

/**
 * Stop current tone playback
 */
function stopAllTones() {
  if (audioState.synth) {
    audioState.synth.triggerRelease();
  }

  if (audioState.spkStatus) {
    audioState.spkStatus.textContent = 'Idle';
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
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    stopAllTones();

    const duration = 4; // seconds

    // Schedule frequency sweep from C3 to C6
    audioState.synth.frequency.setValueAtTime('C3', Tone.now());
    audioState.synth.frequency.exponentialRampToValueAtTime('C6', Tone.now() + duration);

    // Trigger the note
    audioState.synth.triggerAttack('C3', Tone.now());
    audioState.synth.triggerRelease(Tone.now() + duration);

    // Update status
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = 'Frequency sweep';
    }

    // Reset status after sweep completes
    setTimeout(() => {
      if (audioState.spkStatus) {
        audioState.spkStatus.textContent = 'Idle';
      }
    }, duration * 1000 + 100);

  } catch (error) {
    console.error('Failed to start sweep tone:', error);
    if (audioState.spkStatus) {
      audioState.spkStatus.textContent = 'Error starting sweep';
    }
  }
}

/**
 * Update master volume for synthesizer
 */
function updateMasterVolume() {
  if (audioState.synth) {
    const volume = parseFloat(audioState.spkVol?.value || '0.5');
    audioState.synth.volume.value = Tone.gainToDb(volume);
  }
}

/**
 * Apply speaker device selection
 * Note: Tone.js has limited support for output device selection
 */
async function applySpeakerSelection() {
  if (audioState.spkNote) {
    audioState.spkNote.textContent =
      'Note: Output device selection is limited with Tone.js. ' +
      'Use your system audio settings for device selection.';
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

  // Close Tone.js context
  try {
    Tone.context.close();
  } catch (error) {
    console.warn('Error closing Tone.js context:', error);
  }
}
