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
    type: 'delay' | 'filter' | 'distortion' | 'reverb' | 'compressor' | 'source' | 'output' | 'float' | 'int' | 'lfo' | 'setRange' | 'mixer' | 'parametricEQ';
    x: number;
    y: number;
    params: Record<string, number>;
    modulations?: Record<string, 'red' | 'green' | 'blue' | 'bright' | 'none'>;
}

export interface FXConnection {
    source: string;
    target: string;
    sourcePort?: string;
    targetPort?: string;
}

export interface FXGraph {
    nodes: FXNode[];
    connections: FXConnection[];
    nextId?: number;
}

export interface TrackPart {
    grid: Grid;
    scale: string;
}

export interface Track {
    id: string;
    name: string;
    parts: TrackPart[];
    isLooping: boolean;
    volume: number;
    muted: boolean;
    soloed: boolean;
    instrument: SoundConfig;
}

export interface SongState {
    tracks: Track[];
    bpm: number;
    masterGain: number;
    fxGraph: FXGraph;
    isPerformanceMode: boolean;
}

export interface SoundConfig {
    synth: { type: OscillatorType; attack: number; release: number; filter: number };
    kick: { freq: number; decay: number };
    snare: { freq: number; decay: number; mix: number };
    hat: { freq: number; decay: number };
}

