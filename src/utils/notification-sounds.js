/**
 * Notification sound library with various melodic tunes and patterns.
 * Each sound is defined as a sequence of notes that can be played with Tone.js
 */

/**
 * @typedef {Object} SoundDefinition
 * @property {string} id - Unique identifier for the sound
 * @property {string} name - Display name for the sound
 * @property {Function} play - Async function that plays the sound (receives Tone, masterVolume)
 */

/**
 * Play a note sequence with Tone.js
 * @param {Object} Tone - Tone.js library
 * @param {number} masterVolume - Volume in dB
 * @param {Array<{note: string, duration: string, time: number}>} notes - Notes to play
 * @param {Object} options - Synth options
 */
async function playNoteSequence(Tone, masterVolume, notes, options = {}) {
  setMasterVolume(Tone, masterVolume);

  const defaultOptions = {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
    ...options,
  };

  const synth = new Tone.Synth(defaultOptions).toDestination();
  const now = Tone.now();

  notes.forEach(({ note, duration, time }) => {
    synth.triggerAttackRelease(note, duration, now + time);
  });

  const totalTime =
    notes[notes.length - 1]?.time +
      Tone.Time(notes[notes.length - 1]?.duration).toSeconds() || 1;

  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        synth.dispose();
      } catch {}
      resolve();
    }, (totalTime + 0.2) * 1000);
  });
}

/**
 * Set master volume for Tone.js
 * @param {Object} Tone - Tone.js library
 * @param {number} dB - Volume in decibels
 */
function setMasterVolume(Tone, dB) {
  if (Tone.getDestination && Tone.getDestination().volume) {
    Tone.getDestination().volume.value = dB;
  } else if (Tone.Destination) {
    Tone.Destination.volume.value = dB;
  }
}

/**
 * Convert percentage volume (0-100) to decibels
 * @param {number} volumePct - Volume percentage (0-100)
 * @returns {number} Volume in decibels
 */
function volumePercentToDb(volumePct) {
  const normalized = Math.max(0, Math.min(100, volumePct)) / 100;
  return normalized <= 0
    ? -Infinity
    : Math.max(-60, 20 * Math.log10(normalized));
}

/**
 * Notification sounds library
 * @type {Array<SoundDefinition>}
 */
export const NOTIFICATION_SOUNDS = [
  {
    id: "classic-beep",
    name: "Classic Beep",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      setMasterVolume(Tone, dB);
      const synth = new Tone.Synth({
        oscillator: { type: "square" },
      }).toDestination();
      const now = Tone.now();
      synth.triggerAttackRelease(880, 0.2, now);
      synth.triggerAttackRelease(880, 0.2, now + 0.35);
      synth.triggerAttackRelease(1174.66, 0.8, now + 0.8);
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            synth.dispose();
          } catch {}
          resolve();
        }, 2500);
      });
    },
  },

  {
    id: "gentle-chime",
    name: "Gentle Chime",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "C5", duration: "16n", time: 0 },
          { note: "E5", duration: "16n", time: 0.125 },
          { note: "G5", duration: "8n", time: 0.25 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 },
        }
      );
    },
  },

  {
    id: "success-bells",
    name: "Success Bells",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "G4", duration: "8n", time: 0 },
          { note: "G5", duration: "8n", time: 0.15 },
          { note: "D5", duration: "4n", time: 0.3 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.4, sustain: 0, release: 0.1 },
        }
      );
    },
  },

  {
    id: "uplifting-tone",
    name: "Uplifting Tone",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "E4", duration: "16n", time: 0 },
          { note: "G4", duration: "16n", time: 0.1 },
          { note: "C5", duration: "16n", time: 0.2 },
          { note: "E5", duration: "8n", time: 0.3 },
        ],
        {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.15 },
        }
      );
    },
  },

  {
    id: "digital-pop",
    name: "Digital Pop",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      setMasterVolume(Tone, dB);
      const synth = new Tone.Synth({
        oscillator: { type: "square" },
      }).toDestination();
      const now = Tone.now();
      synth.triggerAttackRelease(800, 0.15, now);
      synth.triggerAttackRelease(1200, 0.15, now + 0.2);
      synth.triggerAttackRelease(1600, 0.3, now + 0.4);
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            synth.dispose();
          } catch {}
          resolve();
        }, 2000);
      });
    },
  },

  {
    id: "magical-sparkle",
    name: "Magical Sparkle",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "A5", duration: "32n", time: 0 },
          { note: "E5", duration: "32n", time: 0.06 },
          { note: "C#5", duration: "32n", time: 0.12 },
          { note: "A4", duration: "16n", time: 0.18 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.3, sustain: 0, release: 0.1 },
        }
      );
    },
  },

  {
    id: "completion-fanfare",
    name: "Completion Fanfare",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "C5", duration: "16n", time: 0 },
          { note: "C5", duration: "16n", time: 0.1 },
          { note: "E5", duration: "16n", time: 0.2 },
          { note: "G5", duration: "8n", time: 0.3 },
          { note: "C6", duration: "4n", time: 0.5 },
        ],
        {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 },
        }
      );
    },
  },

  {
    id: "soft-chime",
    name: "Soft Chime",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "F5", duration: "8n", time: 0 },
          { note: "A5", duration: "8n", time: 0.15 },
          { note: "F6", duration: "8n", time: 0.3 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.5, sustain: 0, release: 0.2 },
        }
      );
    },
  },

  {
    id: "ascending-tones",
    name: "Ascending Tones",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "G4", duration: "16n", time: 0 },
          { note: "A4", duration: "16n", time: 0.125 },
          { note: "B4", duration: "16n", time: 0.25 },
          { note: "D5", duration: "8n", time: 0.375 },
        ],
        {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 },
        }
      );
    },
  },

  {
    id: "robotic-beep",
    name: "Robotic Beep",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      setMasterVolume(Tone, dB);
      const synth = new Tone.Synth({
        oscillator: { type: "sawtooth" },
      }).toDestination();
      const now = Tone.now();
      synth.triggerAttackRelease(600, 0.1, now);
      synth.triggerAttackRelease(900, 0.1, now + 0.15);
      synth.triggerAttackRelease(1200, 0.2, now + 0.3);
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            synth.dispose();
          } catch {}
          resolve();
        }, 2000);
      });
    },
  },

  {
    id: "playful-ping",
    name: "Playful Ping",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "B5", duration: "32n", time: 0 },
          { note: "A5", duration: "32n", time: 0.05 },
          { note: "B5", duration: "16n", time: 0.1 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.2, sustain: 0, release: 0.05 },
        }
      );
    },
  },

  {
    id: "deep-notify",
    name: "Deep Notify",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "D3", duration: "16n", time: 0 },
          { note: "D4", duration: "16n", time: 0.125 },
          { note: "G4", duration: "8n", time: 0.25 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.35, sustain: 0, release: 0.1 },
        }
      );
    },
  },

  {
    id: "triple-chime",
    name: "Triple Chime",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      await playNoteSequence(
        Tone,
        dB,
        [
          { note: "E5", duration: "16n", time: 0 },
          { note: "E5", duration: "16n", time: 0.15 },
          { note: "E5", duration: "8n", time: 0.3 },
        ],
        {
          oscillator: { type: "sine" },
          envelope: { attack: 0, decay: 0.4, sustain: 0, release: 0.15 },
        }
      );
    },
  },

  {
    id: "sparkly-glimmer",
    name: "Sparkly Glimmer",
    async play(Tone, volumePct) {
      const dB = volumePercentToDb(volumePct);
      setMasterVolume(Tone, dB);
      const synth = new Tone.Synth({
        oscillator: { type: "triangle" },
      }).toDestination();
      const now = Tone.now();
      // Glittery pattern
      synth.triggerAttackRelease("F#6", "32n", now);
      synth.triggerAttackRelease("D6", "32n", now + 0.07);
      synth.triggerAttackRelease("A5", "32n", now + 0.14);
      synth.triggerAttackRelease("F#6", "16n", now + 0.21);
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            synth.dispose();
          } catch {}
          resolve();
        }, 1500);
      });
    },
  },
];

/**
 * Get a sound definition by ID
 * @param {string} soundId - The sound ID
 * @returns {SoundDefinition|null} The sound definition or null if not found
 */
export function getSoundById(soundId) {
  return NOTIFICATION_SOUNDS.find((s) => s.id === soundId) || null;
}

/**
 * Get all available sound IDs
 * @returns {Array<string>} Array of sound IDs
 */
export function getAllSoundIds() {
  return NOTIFICATION_SOUNDS.map((s) => s.id);
}

/**
 * Ensure Tone.js audio context is started
 * @param {Object} Tone - Tone.js library
 * @returns {Promise<void>}
 */
export async function ensureToneStarted(Tone) {
  if (typeof Tone.start === "function") {
    try {
      await Tone.start();
    } catch {}
  }
}
