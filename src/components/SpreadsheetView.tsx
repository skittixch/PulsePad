import React from 'react';
import type { Grid, Note, RowConfig } from '../types';

interface SpreadsheetViewProps {
    grid: Grid;
    rowConfigs: RowConfig[];
    onUpdateNote: (r: number, c: number, data: Partial<Note>) => void;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ grid, rowConfigs, onUpdateNote }) => {
    const notesInPattern: { r: number; c: number; note: Note; rowLabel: string }[] = [];

    grid.forEach((row, rIdx) => {
        row.forEach((note, cIdx) => {
            if (note) {
                notesInPattern.push({
                    r: rIdx,
                    c: cIdx,
                    note,
                    rowLabel: rowConfigs[rIdx].label
                });
            }
        });
    });

    return (
        <div className="bg-slate-900/50 rounded-xl border border-white/5 overflow-hidden h-full flex flex-col">
            <div className="p-4 border-b border-white/5 bg-slate-900/80 flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Note Spreadsheet</h3>
                <span className="text-[10px] text-slate-500 font-mono">{notesInPattern.length} Notes</span>
            </div>
            <div className="overflow-auto flex-1 no-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-900 z-10 text-[9px] uppercase tracking-tighter text-slate-500 font-bold border-b border-white/5">
                        <tr>
                            <th className="p-3 pl-6">Row</th>
                            <th className="p-3">Step</th>
                            <th className="p-3 text-center">Duration</th>
                            <th className="p-3 text-center">Offset</th>
                            <th className="p-3 text-center">Octave</th>
                            <th className="p-3">Color</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px] font-mono">
                        {notesInPattern.map((item) => (
                            <tr key={`${item.r}-${item.c}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="p-3 pl-6 text-slate-400">{item.rowLabel}</td>
                                <td className="p-3">{item.c}</td>
                                <td className="p-3 text-center">
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={item.note.d}
                                        onChange={(e) => onUpdateNote(item.r, item.c, { d: parseFloat(e.target.value) })}
                                        className="bg-slate-800/50 rounded border-none focus:ring-1 focus:ring-sky-500/50 px-2 py-1 w-16 text-center text-sky-400"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={item.note.o || 0}
                                        onChange={(e) => onUpdateNote(item.r, item.c, { o: parseFloat(e.target.value) })}
                                        className="bg-slate-800/50 rounded border-none focus:ring-1 focus:ring-sky-500/50 px-2 py-1 w-16 text-center text-slate-400"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input
                                        type="number"
                                        value={item.note.oct || 0}
                                        onChange={(e) => onUpdateNote(item.r, item.c, { oct: parseInt(e.target.value) })}
                                        className="bg-slate-800/50 rounded border-none focus:ring-1 focus:ring-sky-500/50 px-2 py-1 w-16 text-center text-slate-400"
                                    />
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={item.note.rgb || '#0ea5e9'}
                                            onChange={(e) => onUpdateNote(item.r, item.c, { rgb: e.target.value })}
                                            className="w-5 h-5 rounded overflow-hidden bg-transparent cursor-pointer border-none p-0"
                                        />
                                        <span className="text-[9px] text-slate-500 uppercase">{item.note.rgb || '#0EA5E9'}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {notesInPattern.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-600 italic">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="8" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="16" y2="17" />
                        <line x1="8" y1="9" x2="10" y2="9" />
                    </svg>
                    <span className="text-xs">No notes in this pattern</span>
                </div>
            )}
        </div>
    );
};
