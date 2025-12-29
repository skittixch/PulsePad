export const STEPS_PER_PATTERN = 16;

export const PRESETS: Record<string, { kick?: number[], snare?: number[], hat?: number[], bass?: number[], chord?: number[] }> = {
    "simple": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "techno": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [0, 2, 4, 6, 8, 10, 12, 14] },
    "house": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 3, 6, 9] },
    "hip hop": { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "trap": { kick: [0, 8], snare: [8], hat: [0, 1, 2, 4, 5, 6, 8, 9, 10] },
    "rock": { kick: [0, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
};

export const FREQS: Record<string, number> = {
    'E5': 659.25, 'D#5': 622.25, 'D5': 587.33, 'C#5': 554.37,
    'C5': 523.25, 'B4': 493.88, 'A#4': 466.16, 'A4': 440.00, 'G#4': 415.30, 'G4': 392.00,
    'F#4': 369.99, 'F4': 349.23, 'E4': 329.63, 'D#4': 311.13, 'D4': 293.66, 'C#4': 277.18, 'C4': 261.63,
    'A3': 220.00, 'G3': 196.00
};

export const SCALES: Record<string, { labels: string[] }> = {
    'C Maj Pent': { labels: ['E5', 'D5', 'C5', 'A4', 'G4', 'E4', 'D4', 'C4'] },
    'A Min Pent': { labels: ['C5', 'A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'G3'] },
    'C Major': { labels: ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'] },
    'A Minor': { labels: ['A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'] },
    'Blues': { labels: ['G4', 'F#4', 'F4', 'D#4', 'D4', 'C4', 'A#3', 'A3'] },
    'Phrygian': { labels: ['C5', 'A#4', 'G#4', 'G4', 'F4', 'D#4', 'C#4', 'C4'] }
};

export const CHROMATIC_LABELS = ['C5', 'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4'];

export const DEFAULT_DRUM_ROWS = [
    { label: 'Hi-Hat', color: 'bg-amber-500/5', activeColor: 'bg-amber-500', type: 'hat', freq: 8000, gain: 0.8 },
    { label: 'Snare', color: 'bg-orange-500/5', activeColor: 'bg-orange-500', type: 'snare', freq: 1200, gain: 0.8 },
    { label: 'Kick', color: 'bg-rose-500/5', activeColor: 'bg-rose-500', type: 'kick', freq: 150, gain: 0.8 }
] as const;

export const DEFAULT_SOUND_CONFIG = {
    synth: { type: 'sawtooth' as OscillatorType, attack: 0.01, release: 0.1, filter: 3000 },
    kick: { freq: 150, decay: 0.4 },
    snare: { freq: 1200, decay: 0.15, mix: 0.5 },
    hat: { freq: 8000, decay: 0.04 }
};
