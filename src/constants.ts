export const STEPS_PER_PATTERN = 16;

export const PRESETS: Record<string, { kick?: number[], snare?: number[], hat?: number[], bass?: number[], chord?: number[] }> = {
    "simple": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "techno": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [0, 2, 4, 6, 8, 10, 12, 14] },
    "house": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 3, 6, 9] },
    "hip hop": { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    "trap": { kick: [0, 8], snare: [8], hat: [0, 1, 2, 4, 5, 6, 8, 9, 10] },
    "rock": { kick: [0, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
};

export const FREQS: Record<string, number> = {};
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_TO_SEMI: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};
for (let oct = 1; oct <= 8; oct++) {
    NOTES.forEach((note, i) => {
        const label = `${note}${oct}`;
        // MIDI note number = (oct + 1) * 12 + i
        // Freq = 440 * 2^((MIDI - 69) / 12)
        const midi = (oct + 1) * 12 + i;
        FREQS[label] = 440 * Math.pow(2, (midi - 69) / 12);
    });
}

export const CHROMATIC_LABELS: string[] = [];
for (let oct = 8; oct >= 1; oct--) {
    for (let i = 11; i >= 0; i--) {
        CHROMATIC_LABELS.push(`${NOTES[i]}${oct}`);
    }
}

const SCALE_INTERVALS: Record<string, number[]> = {
    'Maj Pent': [0, 2, 4, 7, 9],
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Min Pent': [0, 3, 5, 7, 10],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Blues': [0, 3, 5, 6, 7, 10]
};

export const SCALES: Record<string, { labels: string[] }> = {};

// Generate SCALES for all roots defined in NOTE_TO_SEMI (handles C#, Db, etc.)
Object.keys(NOTE_TO_SEMI).forEach(root => {
    Object.entries(SCALE_INTERVALS).forEach(([type, intervals]) => {
        const scaleName = `${root} ${type}`;
        const labels: string[] = [];

        // Generate note labels for this scale across octaves
        for (let oct = 8; oct >= 1; oct--) {
            // Iterate high to low
            for (let i = intervals.length - 1; i >= 0; i--) {
                const semitone = intervals[i];
                const rootSemi = NOTE_TO_SEMI[root];
                const totalSemi = rootSemi + semitone;

                // Note: We use the standardized sharp-based naming (NOTES) for the rows
                // even if the scale root is "Db".
                const noteName = NOTES[totalSemi % 12];
                const actualOct = oct + Math.floor(totalSemi / 12);

                if (actualOct >= 1 && actualOct <= 8) {
                    labels.push(`${noteName}${actualOct}`);
                }
            }
        }
        SCALES[scaleName] = { labels };
    });
});

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
