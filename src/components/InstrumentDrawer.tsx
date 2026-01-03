import React from 'react';
import type { Track, SoundConfig } from '../types';
import { DEFAULT_SOUND_CONFIG } from '../constants';

interface InstrumentDrawerProps {
    track: Track | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdateInstrument: (config: SoundConfig) => void;
}

export const InstrumentDrawer: React.FC<InstrumentDrawerProps> = ({
    track,
    isOpen,
    onClose,
    onUpdateInstrument
}) => {
    if (!track) return null;

    const { instrument } = track;
    const { synth, kick, snare, hat } = instrument;

    const updateSynth = (key: keyof typeof synth, val: any) => {
        onUpdateInstrument({
            ...instrument,
            synth: { ...synth, [key]: val }
        });
    };

    const updateKick = (key: keyof typeof kick, val: number) => {
        onUpdateInstrument({
            ...instrument,
            kick: { ...kick, [key]: val }
        });
    };

    const updateSnare = (key: keyof typeof snare, val: number) => {
        onUpdateInstrument({
            ...instrument,
            snare: { ...snare, [key]: val }
        });
    };

    const updateHat = (key: keyof typeof hat, val: number) => {
        onUpdateInstrument({
            ...instrument,
            hat: { ...hat, [key]: val }
        });
    };

    const randomize = () => {
        const types: OscillatorType[] = ['sawtooth', 'square', 'sine', 'triangle'];
        const newConfig: SoundConfig = {
            synth: {
                type: types[Math.floor(Math.random() * types.length)],
                attack: Math.random() * 0.2,
                release: 0.1 + Math.random() * 0.5,
                filter: 500 + Math.random() * 4000
            },
            kick: {
                freq: 50 + Math.random() * 200,
                decay: 0.1 + Math.random() * 0.5
            },
            snare: {
                freq: 400 + Math.random() * 1000,
                decay: 0.1 + Math.random() * 0.3,
                mix: Math.random()
            },
            hat: {
                freq: 4000 + Math.random() * 6000,
                decay: 0.02 + Math.random() * 0.1
            }
        };
        onUpdateInstrument(newConfig);
    };

    return (
        <div
            className={`h-full bg-slate-900 border-r border-white/10 backdrop-blur-xl z-50 transition-all duration-300 transform overflow-y-auto shrink-0`}
            style={{
                width: '320px',
                marginLeft: isOpen ? '0px' : '-320px',
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? 'auto' : 'none'
            }}
        >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-sm font-black uppercase tracking-widest text-white">
                    Instrument <span className="text-slate-500">/</span> {track.name}
                </h2>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div className="p-6 space-y-8">
                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={randomize}
                        className="flex-1 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-fuchsia-900/40"
                    >
                        Randomize Sound
                    </button>
                    <button
                        onClick={() => onUpdateInstrument(DEFAULT_SOUND_CONFIG)}
                        className="px-4 py-2 bg-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                    >
                        Reset
                    </button>
                </div>

                {/* Synth Section */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
                        Lead Synth
                    </h3>

                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/40 rounded-lg">
                        {['sawtooth', 'square', 'sine', 'triangle'].map(t => (
                            <button
                                key={t}
                                onClick={() => updateSynth('type', t)}
                                className={`px-2 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${synth.type === t ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-sky-400 hover:bg-white/5'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <Control
                            label="Attack"
                            value={synth.attack}
                            min={0} max={1} step={0.01}
                            onChange={(v) => updateSynth('attack', v)}
                            suffix="s"
                        />
                        <Control
                            label="Release"
                            value={synth.release}
                            min={0} max={2} step={0.01}
                            onChange={(v) => updateSynth('release', v)}
                            suffix="s"
                        />
                        <Control
                            label="Filter"
                            value={synth.filter}
                            min={20} max={10000} step={10}
                            onChange={(v) => updateSynth('filter', v)}
                            suffix="Hz"
                        />
                    </div>
                </div>

                <div className="h-px bg-white/5" />

                {/* Drums Section */}
                <div className="space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        Percussion
                    </h3>

                    <div className="space-y-2">
                        <Label>Kick Drum</Label>
                        <div className="grid grid-cols-1 gap-2 border-l-2 border-slate-800 pl-3">
                            <Control label="Freq" value={kick.freq} min={40} max={400} onChange={v => updateKick('freq', v)} suffix="Hz" />
                            <Control label="Decay" value={kick.decay} min={0.05} max={2} onChange={v => updateKick('decay', v)} suffix="s" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Snare Drum</Label>
                        <div className="grid grid-cols-1 gap-2 border-l-2 border-slate-800 pl-3">
                            <Control label="Freq" value={snare.freq} min={200} max={2000} onChange={v => updateSnare('freq', v)} suffix="Hz" />
                            <Control label="Tone Mix" value={snare.mix} min={0} max={1} onChange={v => updateSnare('mix', v)} format={v => `${Math.round(v * 100)}%`} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Hi-Hat</Label>
                        <div className="grid grid-cols-1 gap-2 border-l-2 border-slate-800 pl-3">
                            <Control label="Freq" value={hat.freq} min={1000} max={12000} onChange={v => updateHat('freq', v)} suffix="Hz" />
                            <Control label="Decay" value={hat.decay} min={0.01} max={0.5} onChange={v => updateHat('decay', v)} suffix="s" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{children}</div>
);

const Control: React.FC<{
    label: string,
    value: number,
    min: number,
    max: number,
    step?: number,
    onChange: (val: number) => void,
    suffix?: string,
    format?: (val: number) => string
}> = ({ label, value, min, max, step = 0.01, onChange, suffix = '', format }) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px]">
            <span className="text-slate-400 font-medium">{label}</span>
            <span className="text-sky-400 font-mono">{format ? format(value) : `${value.toFixed(2)}${suffix}`}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400"
        />
    </div>
);
