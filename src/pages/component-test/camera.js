/**
 * Camera testing functionality
 * @module camera
 */

import { qs, supportsAPI } from './utils.js';

/**
 * Camera test state
 * @type {Object}
 */
let cameraState = {
  video: null,
  camSel: null,
  camStart: null,
  camStop: null,
  camStatus: null,
  camStream: null
};

/**
 * Initialize camera testing functionality
 * Sets up DOM elements and event listeners
 */
export function initCamera() {
  if (!supportsAPI('getUserMedia')) {
    console.warn('Camera testing not supported - getUserMedia not available');
    return;
  }

  // Get DOM elements
  cameraState.video = qs('#camera-video');
  cameraState.camSel = qs('#camera-select');
  cameraState.camStart = qs('#camera-start');
  cameraState.camStop = qs('#camera-stop');
  cameraState.camStatus = qs('#camera-status');

  // Set up event listeners
  cameraState.camStart?.addEventListener('click', startCamera);
  cameraState.camStop?.addEventListener('click', stopCamera);

  // Populate device list
  listDevices();
}

/**
 * List available media devices and populate camera select
 * Also handles microphone and speaker device population for other modules
 */
export async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const outs = devices.filter((d) => d.kind === 'audiooutput');

    // Populate camera select
    if (cameraState.camSel) {
      cameraState.camSel.innerHTML = '';
      cams.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        cameraState.camSel.appendChild(option);
      });
    }

    // Populate microphone select (for audio module)
    const micSel = qs('#mic-select');
    if (micSel) {
      micSel.innerHTML = '';
      const defaultMic = document.createElement('option');
      defaultMic.value = '';
      defaultMic.textContent = 'System default';
      micSel.appendChild(defaultMic);

      mics.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        micSel.appendChild(option);
      });
    }

    // Populate speakers select (for audio module)
    const spkSel = qs('#spk-select');
    if (spkSel) {
      spkSel.innerHTML = '';
      const defaultSpk = document.createElement('option');
      defaultSpk.value = '';
      defaultSpk.textContent = 'System default';
      spkSel.appendChild(defaultSpk);

      outs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Speakers ${index + 1}`;
        spkSel.appendChild(option);
      });
    }
  } catch (error) {
    console.error('enumerateDevices failed:', error);
  }
}

/**
 * Start camera streaming
 * Requests camera access and begins video stream
 */
async function startCamera() {
  try {
    if (!cameraState.camStatus) return;

    cameraState.camStatus.textContent = 'Requesting camera…';
    cameraState.camStatus.className = 'badge info';

    const constraints = {
      video: cameraState.camSel?.value
        ? { deviceId: { exact: cameraState.camSel.value } }
        : true,
      audio: false,
    };

    cameraState.camStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (cameraState.video) {
      cameraState.video.srcObject = cameraState.camStream;
      await cameraState.video.play();
    }

    // Update UI state
    if (cameraState.camStart) cameraState.camStart.disabled = true;
    if (cameraState.camStop) cameraState.camStop.disabled = false;

    cameraState.camStatus.textContent = 'Camera streaming';
    cameraState.camStatus.className = 'badge ok';

  } catch (error) {
    const message = error.message || 'Unknown error';
    cameraState.camStatus.textContent = `Camera error: ${message}`;
    cameraState.camStatus.className = 'badge error';
    console.error('Camera start failed:', error);
  }
}

/**
 * Stop camera streaming
 * Stops all tracks and cleans up the stream
 */
function stopCamera() {
  if (cameraState.camStream) {
    cameraState.camStream.getTracks().forEach((track) => track.stop());
    cameraState.camStream = null;
  }

  if (cameraState.video) {
    cameraState.video.srcObject = null;
  }

  // Update UI state
  if (cameraState.camStart) cameraState.camStart.disabled = false;
  if (cameraState.camStop) cameraState.camStop.disabled = true;

  if (cameraState.camStatus) {
    cameraState.camStatus.textContent = 'Camera stopped';
    cameraState.camStatus.className = 'badge';
  }
}

/**
 * Clean up camera resources
 * Should be called when leaving the page
 */
export function cleanupCamera() {
  stopCamera();
}
