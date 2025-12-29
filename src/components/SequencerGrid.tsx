import React, { useState, useRef } from 'react';
import type { Grid, RowConfig, Note } from '../types';
import { STEPS_PER_PATTERN } from '../constants';

interface Props {
    grid: Grid;
    rowConfigs: RowConfig[];
    onToggleNote: (r: number, c: number) => void;
    onUpdateNote: (r: number, c: number, data: Partial<Note>) => void;
    onMoveNote: (fromR: number, fromC: number, toR: number, toC: number) => void;
    playbackStep: number;
    isPlaying: boolean;
}

export const SequencerGrid: React.FC<Props> = ({
    grid,
    rowConfigs,
    onToggleNote,
    onUpdateNote,
    onMoveNote,
    playbackStep,
    isPlaying
}) => {
    const [dragging, setDragging] = useState<{ r: number, c: number, startX: number, startY: number, hasMoved: boolean } | null>(null);

    const gridRef = useRef<HTMLDivElement>(null);

    const getStepWidth = () => {
        if (!gridRef.current) return 40;
        const firstStep = gridRef.current.querySelector('.step-cell');
        return firstStep ? firstStep.getBoundingClientRect().width : 40;
    };

    const getStepHeight = () => {
        if (!gridRef.current) return 32;
        const firstStep = gridRef.current.querySelector('.step-cell');
        return firstStep ? firstStep.getBoundingClientRect().height : 32;
    };

    const resizingRef = useRef<{
        r: number,
        c: number,
        currentC: number,
        edge: 'left' | 'right',
        startX: number,
        startDuration: number,
        startOffset: number,
        absStart: number,
        absEnd: number
    } | null>(null);

    const handleMouseMove = (e: MouseEvent) => {
        if (resizingRef.current) {
            const { r, currentC, edge, startX, absStart, absEnd } = resizingRef.current;
            const stepWidth = getStepWidth();
            const deltaSteps = (e.clientX - startX) / stepWidth;

            if (edge === 'right') {
                let newAbsEnd = absEnd + deltaSteps;
                newAbsEnd = Math.round(newAbsEnd);
                let newDuration = Math.max(1, newAbsEnd - absStart);
                onUpdateNote(r, currentC, { d: newDuration, o: 0 });
            } else {
                let newAbsStart = absStart + deltaSteps;
                newAbsStart = Math.round(newAbsStart);

                // Don't let start cross end
                if (newAbsStart >= absEnd) newAbsStart = absEnd - 1;

                const targetC = newAbsStart;
                const targetDuration = absEnd - newAbsStart;

                if (targetC !== resizingRef.current.currentC) {
                    onMoveNote(r, resizingRef.current.currentC, r, targetC);
                    resizingRef.current.currentC = targetC;
                }
                onUpdateNote(r, targetC, { o: 0, d: targetDuration });
            }
        } else if (dragging) {
            const stepWidth = getStepWidth();
            const stepHeight = getStepHeight();
            const deltaC = Math.round((e.clientX - dragging.startX) / stepWidth);
            const deltaR = Math.round((e.clientY - dragging.startY) / stepHeight);

            if (deltaC !== 0 || deltaR !== 0) {
                if (!dragging.hasMoved) setDragging(prev => prev ? { ...prev, hasMoved: true } : null);
                const targetR = Math.max(0, Math.min(rowConfigs.length - 1, dragging.r + deltaR));
                const targetC = Math.max(0, Math.min(STEPS_PER_PATTERN - 1, dragging.c + deltaC));

                if (targetR !== dragging.r || targetC !== dragging.c) {
                    onMoveNote(dragging.r, dragging.c, targetR, targetC);
                    setDragging({ ...dragging, r: targetR, c: targetC, startX: e.clientX, startY: e.clientY, hasMoved: true });
                }
            }
        }
    };

    const handleMouseUp = () => {
        if (dragging && !dragging.hasMoved) {
            onToggleNote(dragging.r, dragging.c);
        }
        resizingRef.current = null;
        setDragging(null);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    const startResizing = (e: React.MouseEvent, r: number, c: number, edge: 'left' | 'right') => {
        e.stopPropagation();
        const note = grid[r][c]!;
        resizingRef.current = {
            r, c,
            currentC: c,
            edge,
            startX: e.clientX,
            startDuration: note.d,
            startOffset: note.o || 0,
            absStart: c + (note.o || 0),
            absEnd: c + (note.o || 0) + note.d
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const startDragging = (e: React.MouseEvent, r: number, c: number) => {
        e.stopPropagation();
        setDragging({ r, c, startX: e.clientX, startY: e.clientY, hasMoved: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            ref={gridRef}
            className="grid gap-1 p-4 bg-slate-900/50 rounded-xl border border-white/5 overflow-x-auto"
            style={{
                gridTemplateColumns: `80px repeat(${STEPS_PER_PATTERN}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rowConfigs.length}, 28px)`,
                minWidth: '850px'
            }}
        >
            {rowConfigs.map((config, r) => (
                <React.Fragment key={r}>
                    {/* Label */}
                    <div className="flex items-center justify-end pr-3 text-[10px] font-bold text-slate-500 uppercase select-none w-20">
                        {config.label}
                    </div>

                    {/* Steps */}
                    {Array.from({ length: STEPS_PER_PATTERN }).map((_, c) => {
                        const note = grid[r] ? grid[r][c] : null;
                        const isPlaybackActive = isPlaying && playbackStep === c;

                        return (
                            <div
                                key={c}
                                className={`step-cell relative rounded border border-white/5 transition-colors cursor-pointer group
                  ${config.color} 
                  ${isPlaybackActive ? 'ring-1 ring-white/20' : ''}
                `}
                                onMouseDown={() => !note && onToggleNote(r, c)}
                                style={{ gridColumn: c + 2, gridRow: r + 1 }}
                            >
                                {note && (
                                    <div
                                        className={`absolute inset-0 z-10 rounded shadow-lg transition-all active-note
                      ${config.activeColor} 
                      ${config.activeColor.includes('amber') ? 'shadow-amber-500/20' : config.activeColor.includes('rose') ? 'shadow-rose-500/20' : 'shadow-sky-500/20'}
                    `}
                                        style={{
                                            width: `${note.d * 100}%`,
                                            left: `0%`,
                                        }}
                                        onMouseDown={(ev) => startDragging(ev, r, c)}
                                    >
                                        {/* Handles */}
                                        <div
                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-white/40 z-20 transition-all rounded-l"
                                            onMouseDown={(e) => startResizing(e, r, c, 'left')}
                                            title="Resize Start"
                                        />
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-white/40 z-20 transition-all rounded-r"
                                            onMouseDown={(e) => startResizing(e, r, c, 'right')}
                                            title="Resize End"
                                        />

                                        {/* Delete Toggle */}
                                        <div
                                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
                                            onClick={(e) => { e.stopPropagation(); onToggleNote(r, c); }}
                                        >
                                            <span className="text-white/40 text-[10px]">✕</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
};
