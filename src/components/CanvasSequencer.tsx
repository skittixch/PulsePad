import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Note, RowConfig } from '../types';
import { STEPS_PER_PATTERN } from '../constants';

interface InteractionState {
    type: 'idle' | 'drawing' | 'resizing-left' | 'resizing-right' | 'moving' | 'strumming' | 'selecting' | 'moving-group';
    startX: number;
    startY: number;
    activeNote?: {
        startR: number;
        startC: number;
        note: Note;
        currentR: number;
        currentC: number;
        currentD: number;
    };
    deltaR?: number;
    deltaC?: number;
    tempNote?: { r: number; c: number; d: number };
    hoveredHit?: { type: string; r: number; c: number; note?: Note };
    lastStrummedR?: number;
    hoveredRow?: number;
    isCloning?: boolean;
    selectionRect?: { x1: number; y1: number; x2: number; y2: number };
}

interface CanvasSequencerProps {
    grid: (Note | null)[][];
    rowConfigs: RowConfig[];
    onToggleNote: (r: number, c: number) => void;
    onAddNote: (r: number, c: number, d: number, data?: Partial<Note>) => void;
    onCommitNote: (fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note>) => void;
    onCommitMultiNote?: (notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => void;
    onPreviewNote: (r: number) => void;
    onSelectNotes?: (notes: { r: number, c: number }[]) => void;
    selectedNotes?: { r: number, c: number }[];
    playbackStep: number;
    isPlaying: boolean;
    snap: 1 | 2 | 4;
}

const LABEL_WIDTH = 80;

export const CanvasSequencer: React.FC<CanvasSequencerProps> = ({
    grid,
    rowConfigs,
    onToggleNote,
    onAddNote,
    onCommitNote,
    onCommitMultiNote,
    onPreviewNote,
    onSelectNotes,
    selectedNotes = [],
    playbackStep,
    isPlaying,
    snap
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle', startX: 0, startY: 0 });
    const [dimensions, setDimensions] = useState({ rowHeight: 40, stepWidth: 60 });
    const { rowHeight } = dimensions;

    // Refs for stable render loop (flicker-free)
    const gridRef = useRef(grid);
    const interactionRef = useRef(interaction);
    const playbackStepRef = useRef(playbackStep);
    const isPlayingRef = useRef(isPlaying);
    const dimensionsRef = useRef(dimensions);
    const snapRef = useRef(snap);
    const selectedNotesRef = useRef(selectedNotes);

    useEffect(() => {
        gridRef.current = grid;
        interactionRef.current = interaction;
        playbackStepRef.current = playbackStep;
        isPlayingRef.current = isPlaying;
        dimensionsRef.current = dimensions;
        snapRef.current = snap;
        selectedNotesRef.current = selectedNotes;
    }, [grid, interaction, playbackStep, isPlaying, dimensions, snap, selectedNotes]);

    const getColorHex = (colorClass: string) => {
        if (colorClass.includes('rose-500')) return '#f43f5e';
        if (colorClass.includes('orange-500')) return '#f97316';
        if (colorClass.includes('amber-500')) return '#f59e0b';
        if (colorClass.includes('sky-500')) return '#0ea5e9';
        return '#0ea5e9';
    };

    const adjustColor = (hex: string, percent: number) => {
        const num = parseInt(hex.replace("#", ""), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = (num >> 8 & 0x00FF) + amt,
            B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    };

    const getBorderColorHex = (colorClass: string) => {
        if (colorClass.includes('rose-500')) return '#fb7185';
        if (colorClass.includes('orange-500')) return '#fb923c';
        if (colorClass.includes('amber-500')) return '#fbbf24';
        if (colorClass.includes('sky-500')) return '#38bdf8';
        return '#38bdf8';
    };

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        // Use refs to avoid closure stale-ness
        const currentGrid = gridRef.current;
        const currentInteraction = interactionRef.current;
        const currentStep = playbackStepRef.current;
        const currentIsPlaying = isPlayingRef.current;
        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const currentSnap = snapRef.current;
        const currentSelected = selectedNotesRef.current;

        // 1. Draw Grid Lines
        ctx.strokeStyle = '#1e293b'; // slate-800
        ctx.lineWidth = 1;

        // Rows
        rowConfigs.forEach((_, i) => {
            const y = i * rH;
            ctx.beginPath();
            ctx.moveTo(LABEL_WIDTH, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        });

        // Columns
        for (let i = 0; i <= STEPS_PER_PATTERN; i++) {
            const x = LABEL_WIDTH + i * sW;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Highlight beat boundaries
            if (i % 4 === 0) {
                ctx.strokeStyle = '#334155';
                ctx.stroke();
                ctx.strokeStyle = '#1e293b';
            } else if (currentSnap > 1 && i % currentSnap === 0) {
                ctx.save();
                ctx.strokeStyle = '#1e293b';
                ctx.setLineDash([2, 4]);
                ctx.stroke();
                ctx.restore();
            }
        }

        // 2. Draw Notes
        currentGrid.forEach((row, r) => {
            row.forEach((note, c) => {
                if (!note) return;
                // If we are MOVING (and not cloning), we hide the original note to show the preview only.
                // If we are CLONING, we keep the original visible.
                if (currentInteraction.activeNote &&
                    currentInteraction.activeNote.startR === r &&
                    currentInteraction.activeNote.startC === c &&
                    !currentInteraction.isCloning) return;

                const x = LABEL_WIDTH + c * sW + 2;
                const y = r * rH + 2;
                const w = note.d * sW - 4;
                const h = rH - 4;

                const baseColor = note.rgb || getColorHex(rowConfigs[r].activeColor);
                const borderColor = getBorderColorHex(rowConfigs[r].activeColor);
                const isSelected = currentSelected.some(sn => sn.r === r && sn.c === c);

                const gradient = ctx.createLinearGradient(x, y, x, y + h);
                gradient.addColorStop(0, baseColor);
                gradient.addColorStop(1, adjustColor(baseColor, -20));
                ctx.fillStyle = gradient;

                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 4);
                ctx.fill();

                if (isSelected) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }

                // Inner Highlight
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(x + 1, y + 1, w - 2, h / 2, 4);
                ctx.stroke();

                // Octave Strips
                if (note.oct !== undefined && note.oct !== 0) {
                    const opacity = 0.3 + (Math.min(3, Math.abs(note.oct)) * 0.2);
                    ctx.fillStyle = note.oct > 0 ? `rgba(255, 255, 255, ${opacity})` : `rgba(0, 0, 0, ${opacity})`;
                    ctx.beginPath();
                    ctx.roundRect(x, y, 6, h, [4, 0, 0, 4]);
                    ctx.fill();
                }

                ctx.strokeStyle = isSelected ? '#fff' : borderColor;
                ctx.lineWidth = isSelected ? 3 : 1;
                if (isSelected) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#fff';
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // Handles
                const isHovered = currentInteraction.type === 'idle' && currentInteraction.hoveredHit?.r === r && currentInteraction.hoveredHit?.c === c;
                const HANDLE_WIDTH = 12;

                ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
                ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;

                ctx.beginPath();
                ctx.roundRect(x, y, HANDLE_WIDTH, h, [4, 0, 0, 4]);
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.roundRect(x + w - HANDLE_WIDTH, y, HANDLE_WIDTH, h, [0, 4, 4, 0]);
                ctx.fill();
                ctx.stroke();

                // Grip lines
                ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                [4, 8].forEach(off => {
                    ctx.beginPath();
                    ctx.moveTo(x + off, y + 8); ctx.lineTo(x + off, y + h - 8); ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x + w - off, y + 8); ctx.lineTo(x + w - off, y + h - 8); ctx.stroke();
                });
            });
        });

        // 3. Draw Interaction Preview
        if (currentInteraction.activeNote) {
            const { currentR, currentC, currentD, startR, note } = currentInteraction.activeNote;
            const x = LABEL_WIDTH + currentC * sW + 2;
            const y = currentR * rH + 2;
            const w = currentD * sW - 4;
            const h = rH - 4;
            const baseColor = note.rgb || getColorHex(rowConfigs[startR].activeColor);
            ctx.fillStyle = baseColor;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 4);
            ctx.fill();
            if (note.oct !== undefined && note.oct !== 0) {
                const opacity = 0.3 + (Math.min(3, Math.abs(note.oct)) * 0.2);
                ctx.fillStyle = note.oct > 0 ? `rgba(255, 255, 255, ${opacity})` : `rgba(0, 0, 0, ${opacity})`;
                ctx.beginPath();
                ctx.roundRect(x, y, 6, h, [4, 0, 0, 4]);
                ctx.fill();
            }
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
        } else if (currentInteraction.type === 'moving-group' && currentInteraction.deltaR !== undefined && currentInteraction.deltaC !== undefined) {
            const { deltaR, deltaC } = currentInteraction;
            currentSelected.forEach(({ r, c }) => {
                const note = currentGrid[r][c];
                if (!note) return;
                const newR = Math.max(0, Math.min(rowConfigs.length - 1, r + deltaR));
                const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - note.d, c + deltaC));
                const x = LABEL_WIDTH + newC * sW + 2;
                const y = newR * rH + 2;
                const w = note.d * sW - 4;
                const h = rH - 4;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 4);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        } else if (currentInteraction.type === 'drawing' && currentInteraction.tempNote) {
            const { r, c, d } = currentInteraction.tempNote;
            const x = LABEL_WIDTH + c * sW + 2;
            const y = r * rH + 2;
            const w = d * sW - 4;
            const h = rH - 4;
            ctx.fillStyle = 'rgba(14, 165, 233, 0.5)';
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 4);
            ctx.fill();
        } else if (currentInteraction.type === 'selecting' && currentInteraction.selectionRect) {
            const { x1, y1, x2, y2 } = currentInteraction.selectionRect;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            ctx.setLineDash([]);
        }

        // 4. Draw Playback Head
        if (currentIsPlaying && currentStep >= 0) {
            const headX = LABEL_WIDTH + currentStep * sW;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0ea5e9';
            ctx.beginPath();
            ctx.moveTo(headX, 0);
            ctx.lineTo(headX, height);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }, [rowConfigs, getColorHex, getBorderColorHex, adjustColor]);

    useEffect(() => {
        let animationFrameId: number;
        const loop = () => {
            drawFrame();
            animationFrameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(animationFrameId);
    }, [drawFrame]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;

            const newStepWidth = (width - LABEL_WIDTH) / STEPS_PER_PATTERN;
            const newRowHeight = height / rowConfigs.length;

            setDimensions({ rowHeight: newRowHeight, stepWidth: newStepWidth });

            if (canvasRef.current) {
                canvasRef.current.width = width;
                canvasRef.current.height = height;

                // Keep dimensions ref in sync immediately
                dimensionsRef.current = { rowHeight: newRowHeight, stepWidth: newStepWidth };
                // Redraw immediately to prevent flicker when browser clears on .width set
                drawFrame();
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [rowConfigs.length, drawFrame]);

    const getInteractionAt = (e: React.MouseEvent | MouseEvent) => {
        if (!canvasRef.current) return { type: 'empty', r: 0, c: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = e.clientY - rect.top;

        // Use refs for dimension calculations to stay in sync during active resize
        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const r = Math.floor(y / rH);

        // Check for gutter interaction (Strumming)
        if (screenX < LABEL_WIDTH) {
            return { type: 'strumming', r, c: -1 };
        }

        // Quantize C based on snap
        const currentSnap = snapRef.current;
        let c = Math.floor(x / sW);
        if (currentSnap > 1) {
            c = Math.floor(c / currentSnap) * currentSnap;
        }

        // Check if we're hitting an existing note
        const currentGrid = gridRef.current;
        if (r >= 0 && r < currentGrid.length) {
            for (let checkC = 0; checkC <= c; checkC++) {
                const note = currentGrid[r][checkC];
                if (note && checkC + note.d > c) {
                    const noteStartX = checkC * sW;
                    const relativeX = x - noteStartX;
                    const EDGE_THRESHOLD = 15;
                    if (relativeX < EDGE_THRESHOLD) return { type: 'resizing-left', r, c: checkC, note };
                    if (relativeX > note.d * sW - EDGE_THRESHOLD) return { type: 'resizing-right', r, c: checkC, note };
                    return { type: 'moving', r, c: checkC, note };
                }
            }
        }

        return { type: 'empty', r, c };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const hit = getInteractionAt(e);
        if (hit.r < 0 || hit.r >= rowConfigs.length) return;

        // MARQUEE SELECTION PRIORITY
        if (e.ctrlKey || e.metaKey) {
            const rect = canvasRef.current!.getBoundingClientRect();
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            setInteraction({
                type: 'selecting',
                startX: e.clientX,
                startY: e.clientY,
                selectionRect: { x1: startX, y1: startY, x2: startX, y2: startY }
            });
            return;
        }

        // Check if we hit a selected note for group movement
        const isHitSelected = selectedNotes.some(sn => sn.r === hit.r && sn.c === hit.c);
        if (isHitSelected && (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right')) {
            setInteraction({
                type: 'moving-group',
                startX: e.clientX,
                startY: e.clientY,
                deltaR: 0,
                deltaC: 0
            });
            return;
        }

        if (hit.type === 'strumming') {
            onPreviewNote(hit.r);
            setInteraction({
                type: 'strumming',
                startX: e.clientX,
                startY: e.clientY,
                lastStrummedR: hit.r
            });
            return;
        }

        if (hit.c < 0 || hit.c >= STEPS_PER_PATTERN) return;

        if (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right') {
            setInteraction({
                type: hit.type as any,
                startX: e.clientX,
                startY: e.clientY,
                activeNote: {
                    startR: hit.r,
                    startC: hit.c!,
                    note: hit.note!,
                    currentR: hit.r,
                    currentC: hit.c!,
                    currentD: hit.note!.d
                },
                isCloning: e.altKey
            });
        } else if (hit.type === 'empty') {
            if (selectedNotes.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                onSelectNotes?.([]);
                setInteraction({ type: 'idle', startX: e.clientX, startY: e.clientY });
                return;
            }
            setInteraction({
                type: 'drawing',
                startX: e.clientX,
                startY: e.clientY,
                tempNote: { r: hit.r, c: hit.c, d: 1 }
            });
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = e.clientY - rect.top;

        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const currentR = Math.floor(y / rH);
        const currentC = Math.floor(x / sW);

        if (interaction.type === 'idle') {
            const hit = getInteractionAt(e);
            if (hit.type === 'resizing-left' || hit.type === 'resizing-right') canvasRef.current.style.cursor = 'ew-resize';
            else if (hit.type === 'moving') canvasRef.current.style.cursor = 'grab';
            else if (hit.type === 'strumming') canvasRef.current.style.cursor = 'ns-resize';
            else canvasRef.current.style.cursor = 'crosshair';

            setInteraction(prev => ({
                ...prev,
                hoveredHit: hit as any,
                hoveredRow: hit.type === 'strumming' ? hit.r : undefined
            }));
            return;
        }

        if (interaction.type === 'strumming') {
            if (currentR !== interaction.lastStrummedR && currentR >= 0 && currentR < rowConfigs.length) {
                onPreviewNote(currentR);
                setInteraction(prev => ({
                    ...prev,
                    lastStrummedR: currentR,
                    hoveredRow: currentR
                }));
            }
            return;
        }

        if (interaction.type === 'drawing' && interaction.tempNote) {
            const currentSnap = snapRef.current;
            let newD = Math.max(1, currentC - interaction.tempNote.c + 1);
            if (currentSnap > 1) {
                newD = Math.ceil(newD / currentSnap) * currentSnap;
            }
            setInteraction(prev => ({
                ...prev,
                tempNote: prev.tempNote ? { ...prev.tempNote, d: newD } : undefined
            }));
        }

        else if (interaction.activeNote) {
            if (interaction.type === 'moving') {
                const { stepWidth: currentSW, rowHeight: currentRH } = dimensionsRef.current;
                const deltaC = currentC - Math.floor((interaction.startX - rect.left - LABEL_WIDTH) / currentSW);
                const deltaR = currentR - Math.floor((interaction.startY - rect.top) / currentRH);

                const newR = Math.max(0, Math.min(rowConfigs.length - 1, interaction.activeNote.startR + deltaR));
                const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - interaction.activeNote.note.d, interaction.activeNote.startC + deltaC));

                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentR: newR, currentC: newC } : undefined
                }));
            }

            else if (interaction.type === 'resizing-right') {
                const currentSnap = snapRef.current;
                let newD = Math.max(1, currentC - interaction.activeNote.startC + 1);
                if (currentSnap > 1) {
                    newD = Math.ceil(newD / currentSnap) * currentSnap;
                }
                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentD: newD } : undefined
                }));
            }

            else if (interaction.type === 'resizing-left') {
                const originalEnd = interaction.activeNote.startC + interaction.activeNote.note.d;
                const newC = Math.max(0, Math.min(originalEnd - 1, currentC));
                const newD = originalEnd - newC;
                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentC: newC, currentD: newD } : undefined
                }));
            }
        }

        else if (interaction.type === 'moving-group') {
            const { stepWidth: currentSW, rowHeight: currentRH } = dimensionsRef.current;
            const deltaC = currentC - Math.floor((interaction.startX - rect.left - LABEL_WIDTH) / currentSW);
            const deltaR = currentR - Math.floor((interaction.startY - rect.top) / currentRH);

            setInteraction(prev => ({
                ...prev,
                deltaR,
                deltaC
            }));
        }

        else if (interaction.type === 'selecting') {
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            setInteraction(prev => ({
                ...prev,
                selectionRect: prev.selectionRect ? { ...prev.selectionRect, x2: currentX, y2: currentY } : undefined
            }));
        }
    }, [interaction, rowConfigs.length, onPreviewNote]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (interaction.type === 'drawing' && interaction.tempNote) {
            onAddNote(interaction.tempNote.r, interaction.tempNote.c, interaction.tempNote.d);
        } else if (interaction.activeNote) {
            const { startR, startC, currentR, currentC, currentD } = interaction.activeNote;
            const deltaX = Math.abs(e.clientX - interaction.startX);
            const deltaY = Math.abs(e.clientY - interaction.startY);

            if (deltaX < 3 && deltaY < 3) {
                onToggleNote(startR, startC);
            } else if (interaction.isCloning) {
                // If cloning, add a new note at the target location using original metadata
                const clonedNote = {
                    ...interaction.activeNote.note,
                    d: currentD
                };
                onAddNote(currentR, currentC, currentD, clonedNote as any);
            } else {
                // Use atomic commit for any move or resize
                onCommitNote(startR, startC, currentR, currentC, { d: currentD });
            }
        }

        else if (interaction.type === 'moving-group' && interaction.deltaR !== undefined && interaction.deltaC !== undefined) {
            const { deltaR, deltaC } = interaction;
            if (deltaR !== 0 || deltaC !== 0) {
                const movements = selectedNotesRef.current.map(({ r, c }) => {
                    const note = gridRef.current[r][c]!;
                    const newR = Math.max(0, Math.min(rowConfigs.length - 1, r + deltaR));
                    const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - note.d, c + deltaC));
                    return { fromR: r, fromC: c, toR: newR, toC: newC, data: {} };
                });
                onCommitMultiNote?.(movements);
            }
        }

        else if (interaction.type === 'selecting' && interaction.selectionRect) {
            const { x1, y1, x2, y2 } = interaction.selectionRect;
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);

            const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
            const selected: { r: number, c: number }[] = [];

            gridRef.current.forEach((row, r) => {
                const rowY = r * rH;
                const rowBottomY = (r + 1) * rH;
                // Check if row is within Y bounds
                if (rowBottomY > minY && rowY < maxY) {
                    row.forEach((note, c) => {
                        if (note) {
                            const noteX = LABEL_WIDTH + c * sW;
                            const noteRightX = noteX + note.d * sW;
                            if (noteRightX > minX && noteX < maxX) {
                                selected.push({ r, c });
                            }
                        }
                    });
                }
            });
            onSelectNotes?.(selected);
        }
        setInteraction({ type: 'idle', startX: 0, startY: 0 });
    }, [interaction, onAddNote, onToggleNote, onCommitNote, onSelectNotes, onCommitMultiNote]);

    useEffect(() => {
        if (interaction.type !== 'idle') {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [interaction.type, handleMouseMove, handleMouseUp]);

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-auto no-scrollbar bg-slate-900/50 rounded-xl border border-white/5 shadow-inner">
            <div className="absolute left-0 top-0 bottom-0 w-[80px] bg-slate-900/90 z-10 border-r border-white/5 pointer-events-none">
                {rowConfigs.map((config, i) => {
                    const isHovered = (interaction.type === 'idle' && interaction.hoveredRow === i);
                    const isActive = (interaction.type === 'strumming' && interaction.lastStrummedR === i);
                    return (
                        <div
                            key={i}
                            style={{ height: `${rowHeight}px` }}
                            className={`flex items-center justify-end pr-3 text-[10px] font-bold uppercase transition-all duration-75 ${isActive
                                ? 'bg-sky-500 text-white scale-110 shadow-[0_0_15px_rgba(14,165,233,0.5)] z-20'
                                : isHovered
                                    ? 'bg-slate-800 text-slate-200'
                                    : 'text-slate-500'
                                }`}
                        >
                            {config.label}
                        </div>
                    );
                })}
            </div>

            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                className="block"
            />
        </div>
    );
};
