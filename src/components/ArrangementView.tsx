import React from 'react';
import type { Track } from '../types';
import { STEPS_PER_PATTERN } from '../constants';
import { PartCard } from './PartCard';

interface ArrangementViewProps {
    tracks: Track[];
    editingTrackIndex: number;
    editingPatternIndex: number;
    playbackPatternIndex: number;
    queuedPatternIndex: number;
    trackLoops: (number[] | null)[];
    onSelectPattern: (trackIndex: number, patternIndex: number) => void;
    onInsertPattern: (trackIndex: number, index: number) => void;
    onDeletePattern: (trackIndex: number, index: number) => void;
    onDuplicatePattern: (trackIndex: number, index: number) => void;
    onQueuePattern: (index: number) => void;
    onTrackLoopChange: (trackIndex: number, range: number[] | null) => void;
    onMovePattern: (trackIndex: number, fromIndex: number, toIndex: number) => void;
    onAddTrack: () => void;
    isPlaying: boolean;
    isFollowMode: boolean;
    onToggleFollow: (val: boolean) => void;
    onToggleMute: (trackIdx: number) => void;
    onToggleSolo: (trackIdx: number) => void;
    bpm: number;
    playbackStep: number;
    isPerformanceMode: boolean;
    onSetPerformanceMode: (val: boolean) => void;
    onOpenInstrument: (trackIdx: number) => void;
    onSaveClick: () => void;
    isLoggedIn: boolean;
    selectedPatterns: { tIdx: number, pIdx: number }[];
    onSelectPatterns: (patterns: { tIdx: number, pIdx: number }[]) => void;
    onStretchPatterns: (patterns: { tIdx: number, pIdx: number }[], ratio: number) => void;
    isBuildMode: boolean;
    onToggleBuildMode: (val: boolean) => void;
}

export const ArrangementView: React.FC<ArrangementViewProps> = ({
    tracks,
    editingTrackIndex,
    editingPatternIndex,
    playbackPatternIndex,
    queuedPatternIndex,
    trackLoops,
    onSelectPattern,
    onDeletePattern,
    onQueuePattern,
    onTrackLoopChange,
    onMovePattern,
    onAddTrack,
    isPlaying,
    isFollowMode,
    onToggleFollow,
    onToggleMute,
    onToggleSolo,
    bpm,
    playbackStep,
    isPerformanceMode,
    onSetPerformanceMode,
    onOpenInstrument,
    onSaveClick,
    isLoggedIn,
    selectedPatterns,
    onSelectPatterns,
    onStretchPatterns,
    isBuildMode,
    onToggleBuildMode
}) => {
    const [dropPlaceholder, setDropPlaceholder] = React.useState<{ tIdx: number, pIdx: number } | null>(null);
    const [draggingItem, setDraggingItem] = React.useState<{ tIdx: number, pIdx: number } | null>(null);
    const [mousePos, setMousePos] = React.useState<{ x: number, y: number } | null>(null);
    const [dragVelocity, setDragVelocity] = React.useState(0);
    const [stretching, setStretching] = React.useState<{ startX: number, startWidth: number, patterns: { tIdx: number, pIdx: number }[] } | null>(null);
    const [stretchRatio, setStretchRatio] = React.useState(1.0);
    const lastMouseX = React.useRef(0);
    const itemsRef = React.useRef<(HTMLDivElement | null)[]>([]);

    const trackHeight = 53;
    const partWidth = 132;
    const headerWidth = 118;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const maxLength = Math.max(...tracks.map(t => t.parts.length), 1);
    const totalSeconds = maxLength * STEPS_PER_PATTERN * (60.0 / bpm / 4);
    const currentSeconds = (playbackPatternIndex * STEPS_PER_PATTERN + playbackStep) * (60.0 / bpm / 4);

    const hasSolo = tracks.some(t => t.soloed);
    let trackOffsets: number[] = [];
    if (isBuildMode) {
        let acc = 0;
        trackOffsets = tracks.map(t => {
            const v = acc;
            acc += (t.parts.length || 0);
            return v;
        });
    }

    return (
        <div
            className="w-full h-full bg-slate-900/40 rounded-xl border border-slate-800/60 p-0 flex flex-col backdrop-blur-xl shrink-0 overflow-hidden relative"
            onDragOver={(e) => {
                e.preventDefault();
                // Update mouse pos and velocity for custom cursor
                const delta = e.clientX - lastMouseX.current;
                // Simple exponential decay or clamping for rotation tilt
                setDragVelocity(prev => (prev * 0.8) + (delta * 0.5));
                lastMouseX.current = e.clientX;
                setMousePos({ x: e.clientX, y: e.clientY });
            }}
            onMouseMove={(e) => {
                if (stretching) {
                    const deltaX = e.clientX - stretching.startX;
                    const newRatio = Math.max(0.1, (stretching.startWidth + deltaX) / stretching.startWidth);
                    setStretchRatio(newRatio);
                }
            }}
            onMouseUp={() => {
                if (stretching) {
                    onStretchPatterns(stretching.patterns, stretchRatio);
                    setStretching(null);
                    setStretchRatio(1.0);
                }
            }}
        >
            {/* Custom Drag Overlay */}
            {draggingItem && mousePos && (
                <div
                    className="fixed pointer-events-none z-[100]"
                    style={{
                        left: mousePos.x,
                        top: mousePos.y,
                        transform: `translate(-50%, -50%) rotate(${Math.max(-15, Math.min(15, dragVelocity))}deg)`,
                        transition: 'transform 0.1s cubic-bezier(0.2, 0, 0.2, 1)'
                    }}
                >
                    <PartCard
                        part={tracks[draggingItem.tIdx].parts[draggingItem.pIdx]}
                        trackIndex={draggingItem.tIdx}
                        partIndex={draggingItem.pIdx}
                        isEditing={true} // Force highlight style
                        isInLoop={false}
                        isLoopStart={false}
                        isLoopEnd={false}
                        isQueued={false}
                        isPlayingPattern={false}
                        playbackStep={-1}
                        onClick={() => { }}
                        onMouseDown={() => { }}
                        onDoubleClick={() => { }}
                        onContextMenu={() => { }}
                        onDelete={() => { }}
                        isOverlay={true}
                    />
                </div>
            )}

            <div className="p-1 px-3 border-b border-slate-800/60 flex justify-between items-center shrink-0">
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
                    <button
                        onClick={() => onToggleBuildMode(!isBuildMode)}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${isBuildMode
                            ? 'bg-amber-500 border-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                            }`}
                        title="Build Mode: Tracks enter sequentially"
                    >
                        Build Mode {isBuildMode ? 'ON' : 'OFF'}
                    </button>

                    <button
                        onClick={onSaveClick}
                        className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-all flex items-center gap-2"
                    >
                        {isLoggedIn ? 'Save / Share' : 'Login to Save'}
                    </button>

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

            <div
                className="flex-1 overflow-y-auto relative"
                onMouseDown={() => {
                    onSelectPatterns([]);
                }}
            >
                {tracks.map((track, tIdx) => (
                    <div key={track.id} style={{ height: trackHeight }} className="flex items-center p-0.5 border-b border-white/5 last:border-0 min-w-max hover:bg-white/[0.02] transition-colors relative box-border">
                        {/* Track Header */}
                        <div
                            className={`w-28 shrink-0 flex flex-col justify-start p-1 border-r border-slate-800 mr-1 cursor-context-menu ${tIdx === editingTrackIndex ? 'opacity-100' : 'opacity-60 hover:opacity-100 transition-opacity'}`}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onTrackLoopChange(tIdx, null);
                            }}
                            title="Right-click to clear loop"
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-tighter truncate max-w-[50px] ${tIdx === editingTrackIndex ? 'text-sky-400' : 'text-slate-500'}`} title={track.name}>
                                    {track.name}
                                </span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => onToggleMute(tIdx)}
                                        className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center border transition-all ${track.muted ? 'bg-rose-500 border-rose-400 text-white shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                                    >
                                        M
                                    </button>
                                    <button
                                        onClick={() => onToggleSolo(tIdx)}
                                        className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center border transition-all ${track.soloed ? 'bg-amber-500 border-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                                        title="Solo"
                                    >
                                        S
                                    </button>
                                    <button
                                        onClick={() => onOpenInstrument(tIdx)}
                                        className="w-4 h-4 rounded bg-slate-800 border border-slate-700 text-slate-500 hover:text-sky-400 flex items-center justify-center transition-all hover:bg-slate-700 hover:border-slate-600"
                                        title="Instrument Settings"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className={`h-[1px] w-full mt-1.5 rounded-full ${tIdx === editingTrackIndex ? 'bg-sky-500/50' : 'bg-slate-800'}`} />
                        </div>

                        {/* Parts */}
                        <div
                            ref={el => { itemsRef.current[tIdx] = el; }}
                            className="flex items-center relative h-full"
                            onDragOver={(e) => {
                                e.preventDefault();
                                // Track-level drag over to handle end-of-list drops
                                // If dragging over empty space at end
                                if (itemsRef.current[tIdx]?.lastChild) {
                                    const lastChild = itemsRef.current[tIdx].lastChild as HTMLElement;
                                    const lastRect = lastChild.getBoundingClientRect();
                                    if (e.clientX > lastRect.right) {
                                        if (dropPlaceholder?.pIdx !== track.parts.length || dropPlaceholder?.tIdx !== tIdx) {
                                            setDropPlaceholder({ tIdx, pIdx: track.parts.length });
                                        }
                                    }
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                    if (data.tIdx === tIdx && dropPlaceholder) {
                                        onMovePattern(tIdx, data.pIdx, dropPlaceholder.pIdx);
                                    }
                                } catch (err) { }
                                setDropPlaceholder(null);
                            }}
                        >
                            {track.parts.map((part, pIdx) => {
                                const isEditing = tIdx === editingTrackIndex && pIdx === editingPatternIndex;
                                const isSelected = isEditing || selectedPatterns.some(sp => sp.tIdx === tIdx && sp.pIdx === pIdx);
                                const myLoop = trackLoops[tIdx];
                                const isInLoop = myLoop && pIdx >= myLoop[0] && pIdx <= myLoop[1];
                                const isLoopStart = myLoop && pIdx === myLoop[0];
                                const isLoopEnd = myLoop && pIdx === myLoop[1];

                                let effectiveGlobalPattern = playbackPatternIndex;
                                if (isBuildMode) {
                                    const offset = trackOffsets[tIdx] || 0;
                                    if (playbackPatternIndex < offset) {
                                        effectiveGlobalPattern = -1; // Not playing yet
                                    } else {
                                        effectiveGlobalPattern = playbackPatternIndex - offset;
                                    }
                                }

                                let activePartIdx = -1;
                                if (effectiveGlobalPattern !== -1) {
                                    if (myLoop) {
                                        const [start, end] = myLoop;
                                        const loopLen = (end - start) + 1;
                                        activePartIdx = start + (effectiveGlobalPattern % loopLen);
                                    } else {
                                        activePartIdx = effectiveGlobalPattern % (track.parts.length || 1);
                                    }
                                }

                                const isWaitingBuild = isBuildMode && (playbackPatternIndex < (trackOffsets[tIdx] || 0));
                                const isTrackMuted = track.muted || (hasSolo && !track.soloed);
                                const isEligible = !isWaitingBuild && !isTrackMuted;

                                const isPlayingPattern = isEligible && isPlaying && pIdx === activePartIdx;
                                const isQueued = pIdx === queuedPatternIndex;

                                const showPlaceholderBefore = dropPlaceholder?.tIdx === tIdx && dropPlaceholder?.pIdx === pIdx;
                                const isBeingDragged = draggingItem?.tIdx === tIdx && draggingItem?.pIdx === pIdx;

                                return (
                                    <React.Fragment key={pIdx}>
                                        {/* Drop Placeholder */}
                                        <div
                                            className={`transition-all duration-200 ease-out bg-transparent flex items-center justify-center
                                                ${showPlaceholderBefore ? 'w-32 mr-1 opacity-100' : 'w-0 opacity-0 overflow-hidden'}
                                            `}
                                        >
                                            {showPlaceholderBefore && (
                                                <div className="w-full h-12 rounded-lg border-2 border-dashed border-sky-500/50 bg-sky-500/10 backdrop-blur-sm animate-pulse flex items-center justify-center">
                                                    <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center">
                                                        <span className="text-sky-400 font-bold">+</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            draggable
                                            className={`transition-all duration-300 ${isBeingDragged ? 'w-0 opacity-0 m-0 overflow-hidden' : 'w-auto opacity-100 mr-1'}`}
                                            onClick={(e) => {
                                                onToggleFollow(false);
                                                if (e.shiftKey) {
                                                    // Range Selection (using editingPatternIndex as anchor)
                                                    const start = Math.min(editingPatternIndex, pIdx);
                                                    const end = Math.max(editingPatternIndex, pIdx);

                                                    const newSelection: { tIdx: number, pIdx: number }[] = [];
                                                    for (let i = start; i <= end; i++) {
                                                        newSelection.push({ tIdx, pIdx: i });
                                                    }
                                                    onSelectPatterns(newSelection);
                                                } else {
                                                    // Normal Selection
                                                    onSelectPattern(tIdx, pIdx);
                                                    onSelectPatterns([{ tIdx, pIdx }]);
                                                }
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                if (e.button === 1) { // Middle Click
                                                    e.preventDefault();
                                                    onDeletePattern(tIdx, pIdx);
                                                }
                                            }}
                                            onDragStart={(e) => {
                                                // Native Drag Setup
                                                e.dataTransfer.setData('text/plain', JSON.stringify({ tIdx, pIdx }));
                                                e.dataTransfer.effectAllowed = 'move';

                                                // Create a transparent drag image to hide native ghost
                                                const img = new Image();
                                                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent
                                                e.dataTransfer.setDragImage(img, 0, 0);

                                                // Delay state update to allow drag to initialize properly before DOM shifts
                                                requestAnimationFrame(() => {
                                                    setDraggingItem({ tIdx, pIdx });
                                                    setMousePos({ x: e.clientX, y: e.clientY });
                                                    lastMouseX.current = e.clientX;
                                                });
                                            }}
                                            onDragEnd={() => {
                                                setDraggingItem(null);
                                                setDropPlaceholder(null);
                                                setMousePos(null);
                                                setDragVelocity(0);
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                // Allow bubbling so container can track mousePos

                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const mid = rect.left + rect.width / 2;
                                                const insertIdx = e.clientX > mid ? pIdx + 1 : pIdx;
                                                if (!isBeingDragged && (dropPlaceholder?.pIdx !== insertIdx || dropPlaceholder?.tIdx !== tIdx)) {
                                                    setDropPlaceholder({ tIdx, pIdx: insertIdx });
                                                }
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                try {
                                                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                                    if (data.tIdx === tIdx && dropPlaceholder) {
                                                        onMovePattern(tIdx, data.pIdx, dropPlaceholder.pIdx);
                                                    }
                                                } catch (err) { }
                                                setDropPlaceholder(null);
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                onTrackLoopChange(tIdx, isInLoop ? null : [pIdx, pIdx]);
                                            }}
                                        >
                                            <PartCard
                                                part={part}
                                                trackIndex={tIdx}
                                                partIndex={pIdx}
                                                isEditing={isSelected}
                                                isInLoop={!!isInLoop}
                                                isLoopStart={!!isLoopStart}
                                                isLoopEnd={!!isLoopEnd}
                                                isQueued={isQueued}
                                                isPlayingPattern={isPlayingPattern}
                                                className={!isEligible ? 'opacity-40 grayscale' : ''}
                                                playbackStep={playbackStep}
                                                onClick={() => { }}
                                                onMouseDown={() => { }}
                                                onDoubleClick={() => onQueuePattern(pIdx)}
                                                onContextMenu={() => { }}
                                                onDelete={(e) => {
                                                    e.stopPropagation();
                                                    onDeletePattern(tIdx, pIdx);
                                                }}
                                            />
                                        </div>

                                        {/* End of list placeholder */}
                                        {pIdx === track.parts.length - 1 && (
                                            <div
                                                className={`transition-all duration-200 ease-out bg-transparent flex items-center justify-center
                                                    ${dropPlaceholder?.tIdx === tIdx && dropPlaceholder?.pIdx === track.parts.length ? 'w-32 ml-1 opacity-100' : 'w-0 opacity-0 overflow-hidden'}
                                                `}
                                            >
                                                {dropPlaceholder?.tIdx === tIdx && dropPlaceholder?.pIdx === track.parts.length && (
                                                    <div className="w-full h-12 rounded-lg border-2 border-dashed border-sky-500/50 bg-sky-500/10 backdrop-blur-sm animate-pulse flex items-center justify-center">
                                                        <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center">
                                                            <span className="text-sky-400 font-bold">+</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}

                        </div>
                    </div>
                ))}

                {/* Transform Box Overlay */}
                {selectedPatterns.length >= 1 && !draggingItem && (
                    (() => {
                        let minT = Infinity, maxT = -Infinity, minP = Infinity, maxP = -Infinity;
                        selectedPatterns.forEach(({ tIdx, pIdx }) => {
                            minT = Math.min(minT, tIdx);
                            maxT = Math.max(maxT, tIdx);
                            minP = Math.min(minP, pIdx);
                            maxP = Math.max(maxP, pIdx);
                        });

                        if (minT === Infinity) return null;

                        const x1 = headerWidth + minP * partWidth;
                        const x2 = headerWidth + (maxP + 1) * partWidth;
                        const y1 = minT * trackHeight;
                        const y2 = (maxT + 1) * trackHeight;

                        const numPatterns = (maxP - minP) + 1;
                        const actualX2 = stretching ? x1 + (x2 - x1) * stretchRatio : x2;

                        // Snapped preview: Round the ratio so the total width is an integer multiple of patterns
                        const snappedNumPatterns = Math.max(1, Math.round(numPatterns * (stretching ? stretchRatio : 1)));
                        const snappedX2 = x1 + snappedNumPatterns * partWidth;

                        return (
                            <>
                                {/* Snapped Outline (Dashed) */}
                                {stretching && (
                                    <div
                                        className="absolute pointer-events-none z-20"
                                        style={{
                                            left: x1,
                                            top: y1,
                                            width: snappedX2 - x1,
                                            height: y2 - y1,
                                            border: '2px dashed rgba(255, 255, 255, 0.4)',
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderRadius: '8px',
                                        }}
                                    >
                                        <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none flex flex-col">
                                            {selectedPatterns.map(({ tIdx, pIdx }) => {
                                                const track = tracks[tIdx];
                                                const part = track?.parts[pIdx];
                                                if (!part) return null;
                                                const pDisp = pIdx - minP;
                                                const tDisp = tIdx - minT;
                                                const snappedRatio = (snappedNumPatterns * STEPS_PER_PATTERN) / (numPatterns * STEPS_PER_PATTERN);

                                                return (
                                                    <div
                                                        key={`${tIdx}-${pIdx}-snapped`}
                                                        className="absolute"
                                                        style={{
                                                            left: 0,
                                                            right: 0,
                                                            top: tDisp * trackHeight,
                                                            height: trackHeight
                                                        }}
                                                    >
                                                        {part.grid.map((row, r) => (
                                                            row.map((note, c) => {
                                                                if (!note) return null;
                                                                const globalStep = (pDisp * STEPS_PER_PATTERN) + c;
                                                                const left = (Math.round(globalStep * snappedRatio) / (snappedNumPatterns * STEPS_PER_PATTERN)) * 100;
                                                                const width = (Math.max(1, Math.round(note.d * snappedRatio)) / (snappedNumPatterns * STEPS_PER_PATTERN)) * 100;
                                                                return (
                                                                    <div
                                                                        key={`${r}-${c}-snapped`}
                                                                        className="absolute bg-white h-1.5 rounded-full"
                                                                        style={{
                                                                            left: `${left}%`,
                                                                            width: `${width}%`,
                                                                            top: `${(r / part.grid.length) * 100}%`
                                                                        }}
                                                                    />
                                                                );
                                                            })
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Fluid Ghost & Interaction Box */}
                                <div
                                    className="absolute pointer-events-none z-30"
                                    style={{
                                        left: x1,
                                        top: y1,
                                        width: actualX2 - x1,
                                        height: y2 - y1,
                                        border: '2px solid #22d3ee',
                                        backgroundColor: 'rgba(34, 211, 238, 0.05)',
                                        borderRadius: '8px',
                                        boxShadow: '0 0 20px rgba(34, 211, 238, 0.2)'
                                    }}
                                >
                                    <div className="absolute top-0 left-0 bg-sky-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-br-md leading-none uppercase tracking-widest">
                                        Transform {stretching && `(${stretchRatio.toFixed(2)}x -> ${snappedNumPatterns} Parts)`}
                                    </div>

                                    {/* Mini-Note Visualization (Optimized) */}
                                    {stretching && (
                                        <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none flex flex-col">
                                            {selectedPatterns.map(({ tIdx, pIdx }) => {
                                                const track = tracks[tIdx];
                                                const part = track?.parts[pIdx];
                                                if (!part) return null;
                                                const pDisp = pIdx - minP;
                                                const tDisp = tIdx - minT;

                                                return (
                                                    <div
                                                        key={`${tIdx}-${pIdx}`}
                                                        className="absolute"
                                                        style={{
                                                            left: 0,
                                                            right: 0,
                                                            top: tDisp * trackHeight,
                                                            height: trackHeight
                                                        }}
                                                    >
                                                        {part.grid.map((row, r) => (
                                                            row.map((note, c) => {
                                                                if (!note) return null;
                                                                const globalStep = (pDisp * STEPS_PER_PATTERN) + c;
                                                                const left = (globalStep / (numPatterns * STEPS_PER_PATTERN)) * 100;
                                                                const width = (note.d / (numPatterns * STEPS_PER_PATTERN)) * 100;
                                                                return (
                                                                    <div
                                                                        key={`${r}-${c}`}
                                                                        className="absolute bg-sky-400 h-1 rounded-full"
                                                                        style={{
                                                                            left: `${left}%`,
                                                                            width: `${width}%`,
                                                                            top: `${(r / part.grid.length) * 100}%`
                                                                        }}
                                                                    />
                                                                );
                                                            })
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Stretch Handle Right */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize pointer-events-auto hover:bg-sky-400 group flex items-center justify-center transition-colors"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setStretching({
                                                startX: e.clientX,
                                                startWidth: x2 - x1,
                                                patterns: [...selectedPatterns]
                                            });
                                        }}
                                    >
                                        <div className="w-1 h-8 bg-sky-300 rounded-full group-hover:bg-white opacity-50" />
                                    </div>
                                </div>
                            </>
                        );
                    })()
                )}

                {/* Add Track Button (Aligned to Header) */}
                <div className="flex items-center p-0.5 min-w-max relative mt-2 mb-8 group">
                    <div className="w-28 shrink-0 flex justify-center mr-1">
                        <button
                            onClick={onAddTrack}
                            className="w-full py-2 border-2 border-dashed border-slate-700/50 rounded-lg text-slate-500 hover:text-sky-400 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 group-hover:scale-105 active:scale-95"
                            title="Add New Track"
                        >
                            <span className="text-sm leading-none">+</span> Track
                        </button>
                    </div>
                    {/* Empty Grid Area - Visual continuation if needed, or just space */}
                    <div className="flex-1 h-full opacity-0 pointer-events-none border-b border-transparent" />
                </div>
            </div>
        </div >
    );
};
