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
    onCopyMultiNote?: (notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => void;
    onPreviewNote: (r: number, note?: Note) => void;
    onSelectNotes?: (notes: { r: number, c: number }[]) => void;
    selectedNotes?: { r: number, c: number }[];
    playbackStep: number;
    isPlaying: boolean;
    snap: 1 | 2 | 4;
    isUnrolled: boolean;
    scrollTop: number;
    onSetScrollTop: (val: number | ((prev: number) => number)) => void;
}

const LABEL_WIDTH = 80;

export const CanvasSequencer: React.FC<CanvasSequencerProps> = ({
    grid,
    rowConfigs,
    onToggleNote,
    onAddNote,
    onCommitNote,
    onCommitMultiNote,
    onCopyMultiNote,
    onPreviewNote,
    onSelectNotes,
    selectedNotes,
    playbackStep,
    isPlaying,
    snap,
    isUnrolled,
    scrollTop,
    onSetScrollTop
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
    const selectedNotesRef = useRef(selectedNotes || []);
    const rowConfigsRef = useRef(rowConfigs);
    const scrollTopRef = useRef(scrollTop);
    const isUnrolledRef = useRef(isUnrolled);

    useEffect(() => { gridRef.current = grid; }, [grid]);
    useEffect(() => { interactionRef.current = interaction; }, [interaction]);
    useEffect(() => { playbackStepRef.current = playbackStep; }, [playbackStep]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => {
        dimensionsRef.current = dimensions;
    }, [dimensions]);
    useEffect(() => { snapRef.current = snap; }, [snap]);
    useEffect(() => { selectedNotesRef.current = selectedNotes || []; }, [selectedNotes]);
    useEffect(() => { rowConfigsRef.current = rowConfigs; }, [rowConfigs]);
    useEffect(() => { scrollTopRef.current = scrollTop; }, [scrollTop]);
    useEffect(() => { isUnrolledRef.current = isUnrolled; }, [isUnrolled]);

    // Unified Dimension Management (Resize & Scaling)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleResize = (entries: ResizeObserverEntry[]) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;

            // 1. Calculate Horizontal Step Width
            const newStepWidth = (width - LABEL_WIDTH) / STEPS_PER_PATTERN;

            // 2. Calculate Vertical Row Height
            let newRowHeight = 40;
            if (!isUnrolled) {
                newRowHeight = Math.max(24, Math.floor(height / rowConfigs.length));
            }

            // Update State
            setDimensions({ rowHeight: newRowHeight, stepWidth: newStepWidth });

            // Update Canvas Dimensions
            if (canvasRef.current) {
                canvasRef.current.width = width;
                canvasRef.current.height = height;
            }

            // Sync Refs Immediately (for interaction logic during resize)
            dimensionsRef.current = { rowHeight: newRowHeight, stepWidth: newStepWidth };
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(container);

        return () => observer.disconnect();
    }, [isUnrolled, rowConfigs.length]);

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
        const currentScrollTop = scrollTopRef.current;
        const currentRowConfigs = rowConfigsRef.current;

        // 1. Draw Grid Lines
        ctx.strokeStyle = '#1e293b'; // slate-800
        ctx.lineWidth = 1;

        // Rows
        currentRowConfigs.forEach((_, i: number) => {
            const y = i * rH - currentScrollTop;
            ctx.beginPath();
            ctx.moveTo(LABEL_WIDTH, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        });

        // Columns
        for (let i = 0; i <= STEPS_PER_PATTERN; i++) {
            const x = LABEL_WIDTH + i * sW;
            ctx.beginPath();
            ctx.moveTo(x, 0 - currentScrollTop);
            ctx.lineTo(x, height + currentScrollTop);
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
        currentGrid.forEach((row, r: number) => {
            row.forEach((note, c: number) => {
                if (!note) return;
                // If we are MOVING (and not cloning), we hide the original note to show the preview only.
                // If we are CLONING, we keep the original visible.
                if (currentInteraction.activeNote &&
                    currentInteraction.activeNote.startR === r &&
                    currentInteraction.activeNote.startC === c &&
                    !currentInteraction.isCloning) return;

                const x = LABEL_WIDTH + c * sW + 2;
                const y = r * rH + 2 - currentScrollTop;
                const w = note.d * sW - 4;
                const h = rH - 4;

                const config = currentRowConfigs[r];
                if (!config) return;

                const baseColor = note.rgb || getColorHex(config.activeColor);
                const borderColor = getBorderColorHex(config.activeColor);
                const isSelected = currentSelected.some((sn: { r: number, c: number }) => sn.r === r && sn.c === c);

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
            const y = currentR * rH + 2 - currentScrollTop;
            const w = currentD * sW - 4;
            const h = rH - 4;
            const config = currentRowConfigs[startR];
            if (!config) return;
            const baseColor = note.rgb || getColorHex(config.activeColor);
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
            currentSelected.forEach(({ r, c }: { r: number, c: number }) => {
                const note = currentGrid[r][c];
                if (!note) return;
                const newR = Math.max(0, Math.min(currentRowConfigs.length - 1, r + deltaR));
                const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - note.d, c + deltaC));
                const x = LABEL_WIDTH + newC * sW + 2;
                const y = newR * rH + 2 - currentScrollTop;
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
            const y = r * rH + 2 - currentScrollTop;
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
            ctx.moveTo(headX, 0 - currentScrollTop);
            ctx.lineTo(headX, height + currentScrollTop);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }, [getColorHex, getBorderColorHex, adjustColor]);

    useEffect(() => {
        let animationFrameId: number;
        const loop = () => {
            drawFrame();
            animationFrameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(animationFrameId);
    }, [drawFrame]);


    const getInteractionAt = (e: React.MouseEvent | MouseEvent) => {
        if (!canvasRef.current) return { type: 'empty', r: 0, c: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = (e.clientY - rect.top) + scrollTopRef.current; // Adjust for scroll

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
        if (hit.r < 0 || !rowConfigsRef.current[hit.r]) return;

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
        const isHitSelected = selectedNotesRef.current.some((sn: { r: number, c: number }) => sn.r === hit.r && sn.c === hit.c);
        if (isHitSelected && (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right')) {
            setInteraction({
                type: 'moving-group',
                startX: e.clientX,
                startY: e.clientY,
                deltaR: 0,
                deltaC: 0,
                isCloning: e.altKey
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
            if (selectedNotesRef.current.length > 0) {
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
        const currentInteraction = interactionRef.current; // Use Ref
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = (e.clientY - rect.top) + scrollTopRef.current; // Adjust for scroll

        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const currentR = Math.floor(y / rH);
        const currentC = Math.floor(x / sW);

        if (currentInteraction.type === 'idle') {
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

        if (currentInteraction.type === 'strumming') {
            if (currentR !== currentInteraction.lastStrummedR && currentR >= 0 && rowConfigsRef.current[currentR]) {
                onPreviewNote(currentR);
                setInteraction(prev => ({
                    ...prev,
                    lastStrummedR: currentR,
                    hoveredRow: currentR
                }));
            }
            return;
        }

        if (currentInteraction.type === 'drawing' && currentInteraction.tempNote) {
            const currentSnap = snapRef.current;
            let newD = Math.max(1, currentC - currentInteraction.tempNote.c + 1);
            if (currentSnap > 1) {
                newD = Math.ceil(newD / currentSnap) * currentSnap;
            }
            setInteraction(prev => ({
                ...prev,
                tempNote: prev.tempNote ? { ...prev.tempNote, d: newD } : undefined
            }));
        }

        else if (currentInteraction.activeNote) {
            if (currentInteraction.type === 'moving') {
                const { stepWidth: currentSW, rowHeight: currentRH } = dimensionsRef.current;
                const deltaC = currentC - Math.floor(((currentInteraction.startX - rect.left) - LABEL_WIDTH) / currentSW);
                const deltaR = currentR - Math.floor(((currentInteraction.startY - rect.top) + scrollTopRef.current) / currentRH);

                const newR = Math.max(0, Math.min(rowConfigsRef.current.length - 1, currentInteraction.activeNote.startR + deltaR));
                if (!rowConfigsRef.current[newR]) return;
                const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - currentInteraction.activeNote.note.d, currentInteraction.activeNote.startC + deltaC));

                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentR: newR, currentC: newC } : undefined
                }));
            }

            else if (currentInteraction.type === 'resizing-right') {
                const currentSnap = snapRef.current;
                let newD = Math.max(1, currentC - currentInteraction.activeNote.startC + 1);
                if (currentSnap > 1) {
                    newD = Math.ceil(newD / currentSnap) * currentSnap;
                }
                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentD: newD } : undefined
                }));
            }

            else if (currentInteraction.type === 'resizing-left') {
                const originalEnd = currentInteraction.activeNote.startC + currentInteraction.activeNote.note.d;
                const newC = Math.max(0, Math.min(originalEnd - 1, currentC));
                const newD = originalEnd - newC;
                setInteraction(prev => ({
                    ...prev,
                    activeNote: prev.activeNote ? { ...prev.activeNote, currentC: newC, currentD: newD } : undefined
                }));
            }
        }

        else if (currentInteraction.type === 'moving-group') {
            const { stepWidth: currentSW, rowHeight: currentRH } = dimensionsRef.current;
            const deltaC = currentC - Math.floor(((currentInteraction.startX - rect.left) - LABEL_WIDTH) / currentSW);
            const deltaR = currentR - Math.floor(((currentInteraction.startY - rect.top) + scrollTopRef.current) / currentRH);

            setInteraction(prev => ({
                ...prev,
                deltaR,
                deltaC
            }));
        }

        else if (currentInteraction.type === 'selecting') {
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            setInteraction(prev => ({
                ...prev,
                selectionRect: prev.selectionRect ? { ...prev.selectionRect, x2: currentX, y2: currentY } : undefined
            }));
        }
    }, [onPreviewNote]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        const currentInteraction = interactionRef.current; // Use Ref
        if (currentInteraction.type === 'drawing' && currentInteraction.tempNote) {
            onAddNote(currentInteraction.tempNote.r, currentInteraction.tempNote.c, currentInteraction.tempNote.d);
        } else if (currentInteraction.activeNote) {
            const { startR, startC, currentR, currentC, currentD } = currentInteraction.activeNote;
            const deltaX = Math.abs(e.clientX - currentInteraction.startX);
            const deltaY = Math.abs(e.clientY - currentInteraction.startY);

            if (deltaX < 3 && deltaY < 3) {
                onToggleNote(startR, startC);
            } else if (currentInteraction.isCloning) {
                const clonedNote = {
                    ...currentInteraction.activeNote.note,
                    d: currentD
                };
                onAddNote(currentR, currentC, currentD, clonedNote as any);
            } else {
                onCommitNote(startR, startC, currentR, currentC, { d: currentD });
            }
        }

        else if (currentInteraction.type === 'moving-group' && currentInteraction.deltaR !== undefined && currentInteraction.deltaC !== undefined) {
            const { deltaR, deltaC } = currentInteraction;
            if (deltaR !== 0 || deltaC !== 0) {
                const movements = selectedNotesRef.current
                    .map(({ r, c }: { r: number, c: number }) => {
                        const note = gridRef.current[r]?.[c];
                        if (!note) return null;
                        const newR = Math.max(0, Math.min(rowConfigsRef.current.length - 1, r + deltaR));
                        const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - note.d, c + deltaC));
                        return { fromR: r, fromC: c, toR: newR, toC: newC, data: {} };
                    })
                    .filter((m): m is NonNullable<typeof m> => m !== null);

                if (movements.length > 0) {
                    if (currentInteraction.isCloning) {
                        onCopyMultiNote?.(movements);
                    } else {
                        onCommitMultiNote?.(movements);
                    }
                }
            }
        }

        else if (currentInteraction.type === 'selecting' && currentInteraction.selectionRect) {
            const { x1, y1, x2, y2 } = currentInteraction.selectionRect;
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);

            const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
            const currentScrollTop = scrollTopRef.current;
            const selected: { r: number, c: number }[] = [];

            gridRef.current.forEach((row, r: number) => {
                const rowY = r * rH - currentScrollTop;
                const rowBottomY = (r + 1) * rH - currentScrollTop;
                if (rowBottomY > minY && rowY < maxY) {
                    row.forEach((note, c: number) => {
                        const cellX = LABEL_WIDTH + c * sW;
                        const cellRightX = cellX + (note ? note.d * sW : sW);
                        if (cellRightX > minX && cellX < maxX) {
                            selected.push({ r, c });
                        }
                    });
                }
            });
            onSelectNotes?.(selected);
        }
        setInteraction({ type: 'idle', startX: 0, startY: 0 });
    }, [onAddNote, onToggleNote, onCommitNote, onSelectNotes, onCommitMultiNote, onCopyMultiNote]);

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

    const handleWheel = (e: React.WheelEvent) => {
        if (!isUnrolledRef.current) return;
        onSetScrollTop(prev => {
            const rowCount = rowConfigsRef.current.length;
            const containerHeight = containerRef.current?.clientHeight || 600;
            const maxScroll = Math.max(0, (rowCount * 40) - containerHeight);
            let next = prev + e.deltaY;
            return Math.max(0, Math.min(next, maxScroll));
        });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative cursor-crosshair overflow-hidden touch-none"
            onWheel={handleWheel}
        >
            <div className="absolute left-0 top-0 bottom-0 w-[80px] bg-slate-900/90 z-10 border-r border-white/5 pointer-events-none" style={{ transform: `translateY(-${scrollTop}px)` }}>
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
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};
