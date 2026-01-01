import React from 'react';
import type { RowConfig, Track, TrackPart } from '../types';
import { STEPS_PER_PATTERN, getRowConfigs } from '../constants';

interface ArrangementViewProps {
    tracks: Track[];
    editingTrackIndex: number;
    editingPatternIndex: number;
    playbackPatternIndex: number;
    queuedPatternIndex: number;
    trackLoops: (number[] | null)[];
    onSelectPattern: (trackIndex: number, patternIndex: number) => void;
    onInsertPattern: (index: number) => void;
    onDeletePattern: (index: number) => void;
    onDuplicatePattern: (index: number) => void;
    onQueuePattern: (index: number) => void;
    onTrackLoopChange: (trackIndex: number, range: number[] | null) => void;
    onAddTrack: () => void;
    isPlaying: boolean;
    isFollowMode: boolean;
    onToggleFollow: (val: boolean) => void;
    bpm: number;
    playbackStep: number;
    isPerformanceMode: boolean;
    onSetPerformanceMode: (val: boolean) => void;
}

export const ArrangementView: React.FC<ArrangementViewProps> = ({
    tracks,
    editingTrackIndex,
    editingPatternIndex,
    playbackPatternIndex,
    queuedPatternIndex,
    trackLoops,
    onSelectPattern,
    onInsertPattern,
    onDeletePattern,
    onDuplicatePattern,
    onQueuePattern,
    onTrackLoopChange,
    onAddTrack,
    isPlaying,
    isFollowMode,
    onToggleFollow,
    bpm,
    playbackStep,
    isPerformanceMode,
    onSetPerformanceMode,
}) => {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const maxLength = Math.max(...tracks.map(t => t.parts.length), 1);
    const totalSeconds = maxLength * STEPS_PER_PATTERN * (60.0 / bpm / 4);
    const currentSeconds = (playbackPatternIndex * STEPS_PER_PATTERN + playbackStep) * (60.0 / bpm / 4);

    return (
        <div className="w-full h-full bg-slate-900/40 rounded-2xl border border-slate-800/60 p-0.5 flex flex-col backdrop-blur-xl shrink-0 overflow-hidden">
            <div className="p-2 px-4 border-b border-slate-800/60 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <h3 className="text-slate-400 uppercase tracking-[0.2em] text-[10px] font-black flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="10 8 16 12 10 16 10 8" />
                        </svg>
                        Arrangement
                    </h3>

                    <button
                        onClick={() => onSetPerformanceMode(!isPerformanceMode)}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${isPerformanceMode
                            ? 'bg-rose-500 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                            }`}
                    >
                        Performance Mode {isPerformanceMode ? 'ON' : 'OFF'}
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group select-none">
                        <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider group-hover:text-slate-400 transition-colors">Follow</span>
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={isFollowMode}
                                onChange={(e) => onToggleFollow(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-800 border border-slate-600 rounded-full peer peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-white" />
                        </div>
                    </label>

                    <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest border-l border-slate-700 pl-6">
                        <span className="text-sky-400">{formatTime(currentSeconds)}</span> / <span className="text-slate-400">{formatTime(totalSeconds)}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {tracks.map((track, tIdx) => (
                    <div key={track.id} className="flex items-center p-1 border-b border-white/5 last:border-0 min-w-max hover:bg-white/[0.02] transition-colors relative">
                        {/* Track Header */}
                        <div className={`w-28 shrink-0 flex flex-col justify-start p-2 border-r border-slate-800 mr-1 ${tIdx === editingTrackIndex ? 'opacity-100' : 'opacity-60 hover:opacity-100 transition-opacity'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-tighter ${tIdx === editingTrackIndex ? 'text-sky-400' : 'text-slate-500'}`}>
                                    {track.name}
                                </span>
                                <div className="flex gap-1">
                                    <button className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center border ${track.muted ? 'bg-rose-500 border-rose-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>M</button>
                                    <button className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center border ${track.soloed ? 'bg-amber-500 border-amber-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>S</button>
                                </div>
                            </div>
                            <div className={`h-[1px] w-full mt-1.5 rounded-full ${tIdx === editingTrackIndex ? 'bg-sky-500/50' : 'bg-slate-800'}`} />
                        </div>

                        {/* Parts */}
                        <div className="flex items-center">
                            {track.parts.map((part, pIdx) => {
                                const isEditing = tIdx === editingTrackIndex && pIdx === editingPatternIndex;
                                const isPlayingPattern = isPlaying && pIdx === playbackPatternIndex;
                                const isQueued = pIdx === queuedPatternIndex;

                                const myLoop = trackLoops[tIdx];
                                const isInLoop = myLoop && pIdx >= myLoop[0] && pIdx <= myLoop[1];
                                const isLoopStart = myLoop && pIdx === myLoop[0];
                                const isLoopEnd = myLoop && pIdx === myLoop[1];

                                const configs = getRowConfigs(part.scale, false);

                                return (
                                    <React.Fragment key={pIdx}>
                                        <div
                                            className={`relative flex flex-col justify-between p-1.5 border transition-all cursor-pointer w-44 h-16 shrink-0 group overflow-hidden mr-1 mt-1 mb-1
                                                ${isEditing ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.1)] z-10' : 'border-white/10 bg-slate-950/40 hover:border-white/20'}
                                                ${isInLoop ? 'border-amber-500/50 bg-amber-500/5 z-10' : ''}
                                                ${isLoopStart ? 'border-l-amber-500' : ''}
                                                ${isLoopEnd ? 'border-r-amber-500' : ''}
                                                ${isQueued ? 'border-violet-500/50 shadow-[0_0_10px_rgba(167,139,250,0.1)] z-10' : ''}
                                                rounded-xl
                                            `}
                                            onClick={(e) => {
                                                if (e.shiftKey) {
                                                    const start = Math.min(editingPatternIndex, pIdx);
                                                    const end = Math.max(editingPatternIndex, pIdx);
                                                    onTrackLoopChange(tIdx, [start, end]);
                                                } else {
                                                    onSelectPattern(tIdx, pIdx);
                                                }
                                            }}
                                            onDoubleClick={() => onQueuePattern(pIdx)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                onTrackLoopChange(tIdx, isInLoop ? null : [pIdx, pIdx]);
                                            }}
                                        >
                                            <div className="flex justify-between items-start leading-none mb-1">
                                                <div className="flex flex-col">
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter ${isEditing ? 'text-sky-400' : 'text-slate-500'}`}>
                                                        Part {pIdx + 1}
                                                    </span>
                                                    <span className="text-[6px] text-slate-600 font-bold uppercase">{part.scale}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeletePattern(pIdx);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-rose-500 transition-all font-bold text-[10px]"
                                                >
                                                    ×
                                                </button>
                                            </div>

                                            <div className="relative h-7 w-full bg-black/40 rounded-lg overflow-hidden border border-white/5 pointer-events-none">
                                                {part.grid.map((row, r) =>
                                                    row.map((note, c) => {
                                                        if (!note) return null;
                                                        const rowHeight = 100 / configs.length;
                                                        const stepWidth = 100 / STEPS_PER_PATTERN;

                                                        const getColor = (colorClass: string) => {
                                                            if (colorClass.includes('rose-500')) return '#f43f5e';
                                                            if (colorClass.includes('orange-500')) return '#f97316';
                                                            if (colorClass.includes('amber-500')) return '#f59e0b';
                                                            if (colorClass.includes('sky-500')) return '#0ea5e9';
                                                            return '#64748b';
                                                        };

                                                        const baseColor = (note.rgb || (configs[r] ? getColor(configs[r].activeColor) : '#64748b'));

                                                        return (
                                                            <div
                                                                key={`${r}-${c}`}
                                                                className="absolute rounded-[1px]"
                                                                style={{
                                                                    top: `${r * rowHeight}%`,
                                                                    left: `${c * stepWidth}%`,
                                                                    width: `${note.d * stepWidth}%`,
                                                                    height: `${rowHeight}%`,
                                                                    backgroundColor: baseColor,
                                                                    opacity: 0.8
                                                                }}
                                                            />
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {isPlayingPattern && (
                                                <div
                                                    className="absolute bottom-0 left-0 h-[3px] bg-sky-500 transition-all shadow-[0_0_10px_#0ea5e9]"
                                                    style={{ width: `${(playbackStep + 1) / STEPS_PER_PATTERN * 100}%` }}
                                                />
                                            )}
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            <div className="flex gap-2 ml-4">
                                <button
                                    onClick={() => onInsertPattern(track.parts.length)}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-950/40 border border-white/10 rounded-xl hover:bg-slate-800 hover:text-sky-400 transition-all text-slate-600"
                                    title="Add Empty Part"
                                >
                                    <span className="text-lg font-bold">+</span>
                                </button>
                                <button
                                    onClick={() => onDuplicatePattern(track.parts.length - 1)}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-950/40 border border-white/10 rounded-xl hover:bg-slate-800 hover:text-sky-400 transition-all text-slate-600"
                                    title="Duplicate Last Part"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Add Track Button */}
                <div className="p-4 flex">
                    <button
                        onClick={onAddTrack}
                        className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-800 transition-all group shadow-xl"
                    >
                        <div className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-sky-500 font-bold">+</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-sky-400 transition-colors">New Layer Track</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
