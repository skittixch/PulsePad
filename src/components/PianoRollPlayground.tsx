import React, { useState, useRef, useCallback } from 'react';

interface Note {
    id: string;
    r: number; // Row index
    c: number; // Column index (integer)
    d: number; // Duration (integer steps for whole-note stabilization)
}

const ROWS = 8;
const COLS = 16;
const CELL_SIZE = 40;
const ROW_HEIGHT = 40;

export const PianoRollPlayground: React.FC = () => {
    const [notes, setNotes] = useState<Note[]>([
        { id: '1', r: 2, c: 4, d: 2 },
        { id: '2', r: 5, c: 8, d: 1 }
    ]);

    const [interaction, setInteraction] = useState<{
        type: 'dragging' | 'resizing-left' | 'resizing-right';
        noteId: string;
        startX: number;
        startY: number;
        startC: number;
        startR: number;
        startD: number;
    } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent, type: 'dragging' | 'resizing-left' | 'resizing-right', note: Note) => {
        e.stopPropagation();
        setInteraction({
            type,
            noteId: note.id,
            startX: e.clientX,
            startY: e.clientY,
            startC: note.c,
            startR: note.r,
            startD: note.d
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!interaction) return;

        const deltaX = e.clientX - interaction.startX;
        const deltaY = e.clientY - interaction.startY;
        const deltaC = Math.round(deltaX / CELL_SIZE);
        const deltaR = Math.round(deltaY / ROW_HEIGHT);

        setNotes(prev => prev.map(n => {
            if (n.id !== interaction.noteId) return n;

            if (interaction.type === 'dragging') {
                return {
                    ...n,
                    c: Math.max(0, Math.min(COLS - n.d, interaction.startC + deltaC)),
                    r: Math.max(0, Math.min(ROWS - 1, interaction.startR + deltaR))
                };
            }

            if (interaction.type === 'resizing-right') {
                const newD = Math.max(1, Math.min(COLS - n.c, interaction.startD + deltaC));
                return { ...n, d: newD };
            }

            if (interaction.type === 'resizing-left') {
                const newStartC = Math.max(0, Math.min(interaction.startC + interaction.startD - 1, interaction.startC + deltaC));
                const newD = interaction.startC + interaction.startD - newStartC;
                return { ...n, c: newStartC, d: newD };
            }

            return n;
        }));
    }, [interaction]);

    const handleMouseUp = useCallback(() => {
        setInteraction(null);
    }, []);

    React.useEffect(() => {
        if (interaction) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [interaction, handleMouseMove, handleMouseUp]);

    const toggleNote = (r: number, c: number) => {
        const existing = notes.find(n => n.r === r && n.c === c);
        if (existing) {
            setNotes(notes.filter(n => n.id !== existing.id));
        } else {
            setNotes([...notes, { id: Math.random().toString(36).substr(2, 9), r, c, d: 1 }]);
        }
    };

    return (
        <div className="p-8 bg-slate-950 min-h-screen text-white font-sans">
            <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                Sequencer Interaction Playground
            </h1>
            <p className="text-slate-400 mb-8 text-sm">
                Isolated test area for perfecting DAW-style note movement and resizing. All notes snap to whole grid cells.
            </p>

            <div
                ref={containerRef}
                className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none"
                style={{ width: COLS * CELL_SIZE, height: ROWS * ROW_HEIGHT }}
                onMouseDown={(e) => {
                    const rect = containerRef.current!.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    toggleNote(Math.floor(y / ROW_HEIGHT), Math.floor(x / CELL_SIZE));
                }}
            >
                {/* Grid Background */}
                <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: ROWS }).map((_, r) => (
                        <div key={r} className="border-b border-slate-800/50" style={{ height: ROW_HEIGHT }} />
                    ))}
                    <div className="absolute inset-0 flex">
                        {Array.from({ length: COLS }).map((_, c) => (
                            <div key={c} className="border-r border-slate-800/50 h-full" style={{ width: CELL_SIZE }} />
                        ))}
                    </div>
                </div>

                {/* Notes */}
                {notes.map(note => (
                    <div
                        key={note.id}
                        className="absolute bg-sky-500 rounded-md border border-sky-400 shadow-lg group transition-colors hover:bg-sky-400"
                        style={{
                            top: note.r * ROW_HEIGHT + 2,
                            left: note.c * CELL_SIZE + 2,
                            width: note.d * CELL_SIZE - 4,
                            height: ROW_HEIGHT - 4,
                            cursor: 'move'
                        }}
                        onMouseDown={(e) => handleMouseDown(e, 'dragging', note)}
                    >
                        {/* Left Edge Handle */}
                        <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l transition-colors"
                            onMouseDown={(e) => handleMouseDown(e, 'resizing-left', note)}
                        />
                        {/* Right Edge Handle */}
                        <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r transition-colors"
                            onMouseDown={(e) => handleMouseDown(e, 'resizing-right', note)}
                        />

                        {/* Note ID debug LABEL */}
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold opacity-30 pointer-events-none">
                            {note.d}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-8 p-6 bg-slate-900/50 border border-slate-800 rounded-xl">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Interactions</h2>
                <ul className="text-sm text-slate-300 space-y-2">
                    <li>• <b>Click empty cell</b>: Add 1-step note</li>
                    <li>• <b>Click note</b>: Remove note</li>
                    <li>• <b>Drag note center</b>: Move note (snaps to grid)</li>
                    <li>• <b>Drag left/right handle</b>: Resize note (snaps to grid)</li>
                </ul>
            </div>
        </div>
    );
};
