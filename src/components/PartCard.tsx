import React from 'react';
import type { TrackPart } from '../types';
import { STEPS_PER_PATTERN, getRowConfigs } from '../constants';

interface PartCardProps {
    part: TrackPart;
    trackIndex: number;
    partIndex: number;
    isEditing: boolean;
    isInLoop: boolean;
    isLoopStart: boolean;
    isLoopEnd: boolean;
    isQueued: boolean;
    isPlayingPattern: boolean;
    playbackStep: number;
    onClick: (e: React.MouseEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onDoubleClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
    className?: string; // For additional tailwind classes (layout anims)
    isOverlay?: boolean; // If true, render as visual-only overlay
}

export const PartCard: React.FC<PartCardProps> = ({
    part,
    partIndex,
    isEditing,
    isInLoop,
    isLoopStart,
    isLoopEnd,
    isQueued,
    isPlayingPattern,
    playbackStep,
    onClick,
    onMouseDown,
    onDoubleClick,
    onContextMenu,
    onDelete,
    style,
    className = '',
    isOverlay = false
}) => {
    const configs = getRowConfigs(part.scale, false);

    return (
        <div
            className={`relative flex flex-col justify-between p-1 border transition-all cursor-pointer w-32 h-12 shrink-0 group overflow-hidden
                ${isEditing ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.1)] z-10' : 'border-white/10 bg-slate-950/40 hover:border-white/20'}
                ${isInLoop ? 'border-amber-500/50 bg-amber-500/5 z-10' : ''}
                ${isLoopStart ? 'border-l-amber-500' : ''}
                ${isLoopEnd ? 'border-r-amber-500' : ''}
                ${isQueued ? 'border-violet-500/50 shadow-[0_0_10px_rgba(167,139,250,0.1)] z-10' : ''}
                ${isOverlay ? 'shadow-2xl scale-105 z-50 pointer-events-none' : ''}
                rounded-lg ${className}
            `}
            style={style}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
        >
            <div className="flex justify-between items-start leading-none mb-1">
                <div className="flex flex-col">
                    <span className={`text-[8px] font-black uppercase tracking-tighter ${isEditing ? 'text-sky-400' : 'text-slate-500'}`}>
                        Part {partIndex + 1}
                    </span>
                    <span className="text-[6px] text-slate-600 font-bold uppercase">{part.scale}</span>
                </div>
                {!isOverlay && (
                    <button
                        onClick={onDelete}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-rose-500 transition-all font-bold text-[10px]"
                    >
                        ×
                    </button>
                )}
            </div>

            <div className="relative h-5 w-full bg-black/40 rounded-md overflow-hidden border border-white/5 pointer-events-none">
                {part.grid.map((row: any[], r: number) =>
                    row.map((note: any, c: number) => {
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
    );
};
