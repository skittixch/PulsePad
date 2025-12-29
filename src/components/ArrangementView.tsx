import React from 'react';
import type { Grid, RowConfig } from '../types';
import { STEPS_PER_PATTERN } from '../constants';

interface ArrangementViewProps {
    song: Grid[][];
    editingTrackIndex: number;
    editingPatternIndex: number;
    playbackPatternIndex: number;
    queuedPatternIndex: number;
    loopLockedPatternIndex: number;
    rowConfigs: RowConfig[];
    onSelectPattern: (trackIndex: number, patternIndex: number) => void;
    onInsertPattern: (index: number) => void;
    onDeletePattern: (index: number) => void;
    onDuplicatePattern: (index: number) => void;
    onQueuePattern: (index: number) => void;
    onLoopLockPattern: (index: number) => void;
    onAddTrack: () => void;
    isPlaying: boolean;
    isFollowMode: boolean;
    onToggleFollow: (val: boolean) => void;
    bpm: number;
    playbackStep: number;
}

export const ArrangementView: React.FC<ArrangementViewProps> = ({
    song,
    editingTrackIndex,
    editingPatternIndex,
    playbackPatternIndex,
    queuedPatternIndex,
    loopLockedPatternIndex,
    rowConfigs,
    onSelectPattern,
    onInsertPattern,
    onDeletePattern,
    onDuplicatePattern,
    onQueuePattern,
    onLoopLockPattern,
    onAddTrack,
    isPlaying,
    isFollowMode,
    onToggleFollow,
    bpm,
    playbackStep,
}) => {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const totalSeconds = song[0].length * STEPS_PER_PATTERN * (60.0 / bpm / 4);
    const currentSeconds = (playbackPatternIndex * STEPS_PER_PATTERN + playbackStep) * (60.0 / bpm / 4);

    return (
        <div className="w-full h-full bg-slate-900/40 rounded-2xl border border-slate-800/60 p-0.5 flex flex-col backdrop-blur-xl shrink-0 overflow-hidden">
            <div className="p-2 px-4 border-b border-slate-800/60 flex justify-between items-center shrink-0">
                <h3 className="text-slate-400 uppercase tracking-[0.2em] text-[10px] font-black flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="10 8 16 12 10 16 10 8" />
                    </svg>
                    Arrangement View
                </h3>

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
                {song.map((track, tIdx) => (
                    <div key={tIdx} className="flex items-center p-2 border-b border-slate-800/30 last:border-0 min-w-max">
                        {/* Track Header */}
                        <div className={`w-14 shrink-0 flex flex-col justify-start pt-2 pr-2 border-r border-slate-800 mr-1 ${tIdx === editingTrackIndex ? 'opacity-100' : 'opacity-40 hover:opacity-100 transition-opacity'}`}>
                            <span className={`text-[10px] font-black uppercase tracking-tighter ${tIdx === editingTrackIndex ? 'text-sky-400' : 'text-slate-500'}`}>
                                Trk {tIdx + 1}
                            </span>
                            <div className={`h-[1px] w-full mt-1.5 rounded-full ${tIdx === editingTrackIndex ? 'bg-sky-500/50' : 'bg-slate-800'}`} />
                        </div>

                        {/* Patterns */}
                        <div className="flex items-center gap-2">
                            {track.map((pattern, pIdx) => {
                                const isEditing = tIdx === editingTrackIndex && pIdx === editingPatternIndex;
                                const isPlayingPattern = isPlaying && pIdx === playbackPatternIndex;
                                const isQueued = pIdx === queuedPatternIndex;
                                const isLocked = pIdx === loopLockedPatternIndex;

                                return (
                                    <React.Fragment key={pIdx}>
                                        {/* Inserter (Only in the first track or somehow global? Let's show it in all for redundancy or just first) */}
                                        <div
                                            className="group relative flex items-center justify-center w-6 h-16 cursor-pointer transition-all shrink-0 -mx-1 z-10"
                                            onClick={() => onInsertPattern(pIdx)}
                                        >
                                            <div className="w-[1px] h-full bg-slate-800/50 group-hover:bg-sky-500/50 transition-colors" />
                                            {tIdx === 0 && (
                                                <div className="absolute w-4 h-4 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl">
                                                    <span className="text-sky-500 text-xs font-bold">+</span>
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            className={`relative flex flex-col justify-between p-2 rounded-xl border transition-all cursor-pointer w-44 h-16 shrink-0 group overflow-hidden
                                                ${isEditing ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_20px_rgba(14,165,233,0.1)]' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}
                                                ${isLocked ? 'ring-2 ring-amber-500/30 border-amber-500/50' : ''}
                                                ${isQueued ? 'border-violet-500/50 shadow-[0_0_15px_rgba(167,139,250,0.1)]' : ''}
                                            `}
                                            onClick={() => onSelectPattern(tIdx, pIdx)}
                                            onDoubleClick={() => onQueuePattern(pIdx)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                onLoopLockPattern(pIdx);
                                            }}
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className={`text-[8px] font-black uppercase tracking-tighter ${isEditing ? 'text-sky-400' : 'text-slate-500'}`}>
                                                    Part {pIdx + 1}
                                                </span>
                                                {tIdx === 0 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeletePattern(pIdx);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-rose-500 transition-all font-bold text-[10px]"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>

                                            <div className="relative h-6 w-full mt-1 bg-black/20 rounded-md overflow-hidden border border-white/5">
                                                {pattern.map((row, r) =>
                                                    row.map((note, c) => {
                                                        if (!note) return null;
                                                        const rowHeight = 100 / rowConfigs.length;
                                                        const stepWidth = 100 / STEPS_PER_PATTERN;

                                                        const getColor = (colorClass: string) => {
                                                            if (colorClass.includes('rose-500')) return '#f43f5e';
                                                            if (colorClass.includes('orange-500')) return '#f97316';
                                                            if (colorClass.includes('amber-500')) return '#f59e0b';
                                                            if (colorClass.includes('sky-500')) return '#0ea5e9';
                                                            return '#64748b';
                                                        };

                                                        const baseColor = note.rgb || getColor(rowConfigs[r].activeColor);

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
                                                                    opacity: 0.6
                                                                }}
                                                            />
                                                        );
                                                    })
                                                )}
                                            </div>

                                            <div className="flex gap-1 mt-0.5">
                                                {isPlayingPattern && <div className="bg-emerald-500 text-white text-[6px] font-black px-1 py-0.5 rounded animate-pulse">PLAYING</div>}
                                                {isQueued && <div className="bg-violet-500 text-white text-[6px] font-black px-1 py-0.5 rounded">NEXT</div>}
                                                {isLocked && <div className="bg-amber-500 text-slate-900 text-[6px] font-black px-1 py-0.5 rounded">LOOP</div>}
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

                            {/* End Inserters (Only in first track or header) */}
                            {tIdx === 0 && (
                                <div className="flex flex-col gap-1 w-12 h-16 shrink-0 opacity-40 hover:opacity-100 transition-all ml-2">
                                    <button
                                        onClick={() => onInsertPattern(song[0].length)}
                                        className="flex-1 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-800 hover:text-sky-400 transition-all"
                                        title="Add Empty Slot"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-7-7v14" /></svg>
                                    </button>
                                    <button
                                        onClick={() => onDuplicatePattern(song[0].length - 1)}
                                        className="flex-1 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-800 hover:text-sky-400 transition-all"
                                        title="Duplicate All Tracks at Last Slot"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    </button>
                                </div>
                            )}
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
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-sky-400 transition-colors">Add Layer Track</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
