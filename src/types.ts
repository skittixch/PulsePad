export interface Note {
    d: number; // duration
    o: number; // offset
    oct?: number; // octave shift
    rgb?: string; // CSS color string
    hsl?: { h: number; s: number; l: number }; // split color
    tags?: string[]; // metadata
}

export type Grid = (Note | null)[][];

export interface RowConfig {
    label: string;
    color: string;
    activeColor: string;
    freq: number;
    type?: 'synth' | 'kick' | 'snare' | 'hat';
    gain: number;
}

export interface FXNode {
    id: string;
    type: 'delay' | 'filter' | 'distortion' | 'reverb' | 'compressor' | 'source' | 'output' | 'float' | 'int' | 'lfo' | 'setRange';
    x: number;
    y: number;
    params: Record<string, number>;
    modulations?: Record<string, 'red' | 'green' | 'blue' | 'bright' | 'none'>;
}

export interface FXConnection {
    source: string;
    target: string;
    targetPort?: string;
}

export interface FXGraph {
    nodes: FXNode[];
    connections: FXConnection[];
    nextId?: number;
}

export interface SongState {
    song: Grid[][];
    bpm: number;
    currentScale: string;
    patternScales: string[];
    drumRows: RowConfig[];
    soundConfig: SoundConfig;
    masterGain: number;
    synthGains: number[];
    fxGraph: FXGraph;
}

export interface SoundConfig {
    synth: { type: OscillatorType; attack: number; release: number; filter: number };
    kick: { freq: number; decay: number };
    snare: { freq: number; decay: number; mix: number };
    hat: { freq: number; decay: number };
}
