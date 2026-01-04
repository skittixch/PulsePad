
import React from 'react';

interface VirtualKeyboardProps {
    rowConfigs: { label: string, isRoot: boolean }[];
    onNoteStart: (rowIndex: number) => void;
    onNoteStop: (rowIndex: number) => void;
    activeRows?: Record<number, boolean>;
    visible: boolean;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
    rowConfigs,
    onNoteStart,
    onNoteStop,
    activeRows = {},
    visible
}) => {
    if (!visible) return null;

    // rowConfigs are Top->Bottom (High->Low)
    // We want Keyboard Left->Right (Low->High)
    // So we map them in reverse order
    const keys = [...rowConfigs].map((config, originalIndex) => ({
        ...config,
        originalIndex
    })).reverse();

    return (
        <div className="h-24 md:h-32 w-full bg-slate-900 border-t border-white/10 flex touch-none shrink-0 overflow-x-auto no-scrollbar relative z-40">
            {keys.map((key) => {
                const isActive = activeRows[key.originalIndex];
                const isRoot = key.isRoot;

                return (
                    <button
                        key={key.originalIndex}
                        className={`
                            flex-1 min-w-[36px] md:min-w-[48px] relative group touch-none select-none
                            border-r border-slate-800 last:border-r-0
                            flex flex-col justify-end items-center pb-2
                            transition-all duration-75 active:scale-95
                            ${isActive
                                ? 'bg-sky-500 text-white shadow-[0_0_20px_#0ea5e9] z-10'
                                : isRoot
                                    ? 'bg-slate-800 text-slate-300'
                                    : 'bg-slate-900 text-slate-500 hover:bg-slate-800'
                            }
                        `}
                        onPointerDown={(e) => {
                            e.currentTarget.releasePointerCapture(e.pointerId); // Allow slide?
                            onNoteStart(key.originalIndex);
                        }}
                        onPointerUp={() => onNoteStop(key.originalIndex)}
                        onPointerLeave={() => onNoteStop(key.originalIndex)}
                        onPointerEnter={(e) => {
                            if (e.buttons > 0) onNoteStart(key.originalIndex);
                        }}
                    >
                        <span className="text-[10px] md:text-xs font-bold font-mono pointer-events-none">
                            {key.label}
                        </span>
                        {isRoot && (
                            <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/20" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
