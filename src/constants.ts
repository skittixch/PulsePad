export const STEPS_PER_PATTERN = 16;


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

for (let oct = 1; oct <= 8; oct++) {
    NOTES.forEach((note, i) => {
        const label = `${note}${oct}`;
        FREQS[label] = 440 * Math.pow(2, ((oct * 12 + i) - 57) / 12);
    });
}

export const CHROMATIC_LABELS: string[] = [];
for (let oct = 8; oct >= 1; oct--) {
    for (let i = NOTES.length - 1; i >= 0; i--) {
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

export const generateBlankGrid = (rows: number) => {
    return Array(rows).fill(null).map(() => Array(STEPS_PER_PATTERN).fill(null));
};

export const getLabelSemitones = (label: string): number => {
    const match = label.match(/^([A-G]#?|Ab|Bb|Db|Eb|Gb)(\d)$/);
    if (!match) return 0;
    const note = match[1];
    const octave = parseInt(match[2]);
    return (octave - 3) * 12 + (NOTE_TO_SEMI[note] || 0);
};

export const getRowConfigs = (scaleName: string, unrolled: boolean) => {
    let labels: string[];
    if (unrolled || scaleName === 'Chromatic') {
        labels = CHROMATIC_LABELS;
    } else {
        // Scaled view: Use full scale labels across all octaves
        const scale = SCALES[scaleName] || SCALES['C Maj Pent'] || { labels: [] };
        labels = scale.labels;
    }

    const synthRows = labels.map((label: string) => ({
        label,
        color: label.includes('#') ? 'bg-slate-900/40' : 'bg-sky-500/5',
        activeColor: 'bg-sky-500',
        freq: FREQS[label] || 261.63,
        gain: 0.8,
        type: 'synth' as const
    }));
    return [...synthRows, ...DEFAULT_DRUM_ROWS];
};
