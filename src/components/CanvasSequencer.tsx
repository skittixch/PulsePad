import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Note, RowConfig } from '../types';
import { STEPS_PER_PATTERN } from '../constants';

interface InteractionState {
    type: 'idle' | 'drawing' | 'resizing-left' | 'resizing-right' | 'moving' | 'strumming' | 'selecting' | 'moving-group' | 'resizing-left-group' | 'resizing-right-group' | 'stretching' | 'rolling-edit';
    startX: number;
    startY: number;
    startTime: number;
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
    tempNote?: { r: number; c: number; d: number; oct?: number };
    hoveredHit?: { type: string; r: number; c: number; note?: Note };
    lastStrummedR?: number;
    lastStrummedOctave?: number;
    groupOctaveDelta?: number;
    octaveChanged?: boolean;
    hoveredRow?: number;
    isCloning?: boolean;
    selectionRect?: { x1: number; y1: number; x2: number; y2: number };
    rollingEdit?: {
        r: number;
        note1: { c: number, note: Note };
        note2: { c: number, note: Note };
        initialSplitC: number;
        currentSplitC: number;
    };
    stretchRatio?: number;
    stretchOriginC?: number;
    stretchSide?: 'left' | 'right';
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
    onStopPreviewNote: () => void;
    onSelectNotes?: (notes: { r: number, c: number }[]) => void;
    selectedNotes?: { r: number, c: number }[];
    playbackStep: number;
    isPlaying: boolean;
    snap: 1 | 2 | 4;
    isUnrolled: boolean;
    scrollTop: number;
    onSetScrollTop: (val: number | ((prev: number) => number)) => void;
    activeRowsByKeyboard?: Record<number, boolean>;
    playheadDistance?: number;
    paused?: boolean;
    isResizing?: boolean;
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
    onStopPreviewNote,
    onSelectNotes,
    selectedNotes,
    playbackStep,
    playheadDistance = 0,
    isPlaying,
    snap,
    isUnrolled,
    scrollTop,
    onSetScrollTop,
    activeRowsByKeyboard = {},
    paused = false,
    isResizing = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle', startX: 0, startY: 0, startTime: 0 });
    const [isRazorMode, setIsRazorMode] = useState(false);
    const [isPenMode, setIsPenMode] = useState(false);
    const [smoothing, setSmoothing] = useState(0);
    const [dimensions, setDimensions] = useState({ rowHeight: 40, stepWidth: 60 });
    const { rowHeight } = dimensions;

    // Refs for stable render loop (flicker-free)
    const gridRef = useRef(grid);
    const interactionRef = useRef(interaction);
    const playbackStepRef = useRef(playbackStep);
    const playheadDistanceRef = useRef(playheadDistance);
    const isPlayingRef = useRef(isPlaying);
    const dimensionsRef = useRef(dimensions);
    const snapRef = useRef(snap);
    const selectedNotesRef = useRef(selectedNotes || []);
    const isRazorModeRef = useRef(isRazorMode);
    const isPenModeRef = useRef(isPenMode);
    const smoothingRef = useRef(smoothing);
    const smoothedPos = useRef({ x: 0, y: 0 });
    const lastPenPos = useRef<{ r: number, c: number } | null>(null);
    const rowConfigsRef = useRef(rowConfigs);
    const scrollTopRef = useRef(scrollTop);
    const isUnrolledRef = useRef(isUnrolled);

    // Transform: Auto-enabled for multi-selection

    const activePointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
    const initialPinchDistanceRef = useRef<number | null>(null);

    useEffect(() => { gridRef.current = grid; }, [grid]);

    useEffect(() => { interactionRef.current = interaction; }, [interaction]);
    useEffect(() => { playbackStepRef.current = playbackStep; }, [playbackStep]);
    useEffect(() => { playheadDistanceRef.current = playheadDistance; }, [playheadDistance]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => {
        dimensionsRef.current = dimensions;
    }, [dimensions]);
    useEffect(() => { snapRef.current = snap; }, [snap]);
    useEffect(() => { selectedNotesRef.current = selectedNotes || []; }, [selectedNotes]);
    useEffect(() => { isRazorModeRef.current = isRazorMode; }, [isRazorMode]);
    useEffect(() => { isPenModeRef.current = isPenMode; }, [isPenMode]);
    useEffect(() => { smoothingRef.current = smoothing; }, [smoothing]);
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

            // Skip expensive recalculations during active resizing interaction
            if (isResizing) return;

            const { width, height } = entry.contentRect;

            // 1. Calculate Horizontal Step Width
            const newStepWidth = (width - LABEL_WIDTH) / STEPS_PER_PATTERN;

            // 2. Calculate Vertical Row Height
            let newRowHeight = 40; // Fixed height for consistent scrolling
            // if (!isUnrolled) {
            //     newRowHeight = Math.max(24, Math.floor(height / rowConfigs.length));
            // }

            // Update State
            setDimensions({ rowHeight: newRowHeight, stepWidth: newStepWidth });

            // Update Canvas Dimensions
            if (canvasRef.current) {
                canvasRef.current.width = width * window.devicePixelRatio;
                canvasRef.current.height = height * window.devicePixelRatio;
            }

            // Sync Refs Immediately (for interaction logic during resize)
            dimensionsRef.current = { rowHeight: newRowHeight, stepWidth: newStepWidth };
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(container);

        return () => observer.disconnect();
    }, [isUnrolled, rowConfigs.length, isResizing]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            const key = e.key.toLowerCase();
            if (key === 'c') setIsRazorMode(true);
            if (key === 'v') setIsRazorMode(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getColorHex = useCallback((colorClass: string) => {
        if (colorClass.includes('rose-500')) return '#f43f5e';
        if (colorClass.includes('orange-500')) return '#f97316';
        if (colorClass.includes('amber-500')) return '#f59e0b';
        if (colorClass.includes('sky-500')) return '#0ea5e9';
        return '#0ea5e9';
    }, []);

    const adjustColor = useCallback((hex: string, percent: number) => {
        const num = parseInt(hex.replace("#", ""), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = (num >> 8 & 0x00FF) + amt,
            B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }, []);

    const getBorderColorHex = useCallback((colorClass: string) => {
        if (colorClass.includes('rose-500')) return '#fb7185';
        if (colorClass.includes('orange-500')) return '#fb923c';
        if (colorClass.includes('amber-500')) return '#fbbf24';
        if (colorClass.includes('sky-500')) return '#38bdf8';
        return '#38bdf8';
    }, []);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        const dpr = window.devicePixelRatio;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const cssWidth = width / dpr;
        const cssHeight = height / dpr;

        ctx.clearRect(0, 0, cssWidth, cssHeight);

        // Use refs to avoid closure stale-ness
        const currentGrid = gridRef.current;
        const currentInteraction = interactionRef.current;
        const currentStep = playbackStepRef.current;
        const currentDistance = playheadDistanceRef.current; // Get current distance
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
            if (y < 0 || y > cssHeight) return;
            ctx.beginPath();
            ctx.moveTo(LABEL_WIDTH, y);
            ctx.lineTo(cssWidth, y);
            ctx.stroke();
        });

        // Columns
        for (let i = 0; i <= STEPS_PER_PATTERN; i++) {
            const x = LABEL_WIDTH + i * sW;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, cssHeight);
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
            const y = r * rH - currentScrollTop;
            if (y + rH < 0 || y > cssHeight) return;

            row.forEach((note, c: number) => {
                if (!note) return;
                if (currentInteraction.activeNote &&
                    currentInteraction.activeNote.startR === r &&
                    currentInteraction.activeNote.startC === c &&
                    !currentInteraction.isCloning) return;

                const config = currentRowConfigs[r];
                if (!config) return;

                const x = LABEL_WIDTH + c * sW + 2;
                const w = note.d * sW - 4;
                const h = rH - 4;

                const baseColor = note.rgb || getColorHex(config.activeColor);
                const borderColor = getBorderColorHex(config.activeColor);
                const isSelected = currentSelected.some((sn: { r: number, c: number }) => sn.r === r && sn.c === c);

                const gradient = ctx.createLinearGradient(x, y + 2, x, y + 2 + h);
                gradient.addColorStop(0, baseColor);
                gradient.addColorStop(1, adjustColor(baseColor, -20));
                ctx.fillStyle = gradient;

                ctx.beginPath();
                ctx.roundRect(x, y + 2, w, h, 4);
                ctx.fill();

                if (isSelected) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }

                ctx.strokeStyle = isSelected ? '#fff' : borderColor;
                ctx.lineWidth = isSelected ? 3 : 1;
                ctx.stroke();

                // Handles
                const isHovered = currentInteraction.type === 'idle' && currentInteraction.hoveredHit?.r === r && currentInteraction.hoveredHit?.c === c;
                if (isHovered || isSelected) {
                    const HANDLE_WIDTH = 8;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.beginPath();
                    ctx.roundRect(x, y + 2, HANDLE_WIDTH, h, [4, 0, 0, 4]);
                    ctx.roundRect(x + w - HANDLE_WIDTH, y + 2, HANDLE_WIDTH, h, [0, 4, 4, 0]);
                    ctx.fill();
                }
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
            if (config) {
                const baseColor = note.rgb || getColorHex(config.activeColor);
                ctx.fillStyle = baseColor;
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 4);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        } else if (currentInteraction.type === 'moving-group' && currentInteraction.deltaR !== undefined && currentInteraction.deltaC !== undefined) {
            const { deltaR, deltaC, groupOctaveDelta = 0 } = currentInteraction;
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

                // Visual cue for octave shifts in group
                if (groupOctaveDelta !== 0) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px Inter';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${groupOctaveDelta > 0 ? '+' : ''}${groupOctaveDelta}`, x + w / 2, y + h / 2 + 4);
                }
            });
        } else if ((currentInteraction.type === 'resizing-left-group' || currentInteraction.type === 'resizing-right-group') && currentInteraction.deltaC !== undefined) {
            const { deltaC, type: itype } = currentInteraction;
            currentSelected.forEach(({ r, c }: { r: number, c: number }) => {
                const note = currentGrid[r][c];
                if (!note) return;

                let newC = c;
                let newD = note.d;

                if (itype === 'resizing-right-group') {
                    newD = Math.max(1, note.d + deltaC);
                } else {
                    newC = Math.max(0, Math.min(c + note.d - 1, c + deltaC));
                    newD = note.d + (c - newC);
                }

                const x = LABEL_WIDTH + newC * sW + 2;
                const y = r * rH + 2 - currentScrollTop;
                const w = newD * sW - 4;
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
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            ctx.setLineDash([]);
        } else if (currentInteraction.type === 'stretching' && currentInteraction.stretchRatio !== undefined && currentInteraction.stretchOriginC !== undefined) {
            const { stretchRatio, stretchOriginC } = currentInteraction;

            // Draw Ghost Notes & Target Notes
            currentSelected.forEach(({ r, c }: { r: number, c: number }) => {
                const note = currentGrid[r]?.[c];
                if (!note) return;

                // Ghost Calculation (Unquantized)
                const ghostC = stretchOriginC + (c - stretchOriginC) * stretchRatio;
                const ghostD = note.d * stretchRatio;

                const gX = LABEL_WIDTH + ghostC * sW + 2;
                const gY = r * rH + 2 - currentScrollTop;
                const gW = ghostD * sW - 4;
                const h = rH - 4;

                // Ghost Draw
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                ctx.roundRect(gX, gY, gW, h, 4);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Target Calculation (Quantized)
                let targetC = stretchOriginC + (c - stretchOriginC) * stretchRatio;
                let targetD = note.d * stretchRatio;

                // Snap logic
                if (currentSnap > 1) {
                    // Round start and duration
                    // But stretching implies relative positions snap too?
                    // Simple approach: Snap calculated C and D
                    targetC = Math.round(targetC / currentSnap) * currentSnap;
                    targetD = Math.max(currentSnap, Math.round(targetD / currentSnap) * currentSnap);
                } else {
                    targetC = Math.round(targetC);
                    targetD = Math.max(1, Math.round(targetD));
                }

                const tX = LABEL_WIDTH + targetC * sW + 2;
                const tW = targetD * sW - 4;

                // Solid Target Draw
                ctx.strokeStyle = '#22d3ee'; // cyan-400
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(tX, gY, tW, h, 4);
                ctx.stroke();
                ctx.lineWidth = 1;
            });
        }

        // Rolling Edit Preview
        if (currentInteraction.type === 'rolling-edit' && currentInteraction.rollingEdit) {
            const { r, note1, note2, currentSplitC } = currentInteraction.rollingEdit;
            const h = rH - 4;
            const gY = r * rH + 2 - currentScrollTop;

            // Target 1
            const tX1 = LABEL_WIDTH + note1.c * sW + 2;
            const tW1 = (currentSplitC - note1.c) * sW - 4;
            ctx.strokeStyle = '#fff';
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(tX1, gY, tW1, h);

            // Target 2
            const tX2 = LABEL_WIDTH + currentSplitC * sW + 2;
            const tW2 = ((note2.c + note2.note.d) - currentSplitC) * sW - 4;
            ctx.strokeRect(tX2, gY, tW2, h);
            ctx.setLineDash([]);
        }

        // Transform Box Overlay
        // Show automatically if more than 1 note is selected
        if (currentSelected.length > 1 && currentInteraction.type !== 'stretching') {
            // Calculate bounds
            let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
            currentSelected.forEach(({ r, c }) => {
                const note = currentGrid[r]?.[c];
                if (!note) return;
                minC = Math.min(minC, c);
                maxC = Math.max(maxC, c + note.d);
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
            });

            if (minC !== Infinity) {
                const x1 = LABEL_WIDTH + minC * sW;
                const x2 = LABEL_WIDTH + maxC * sW;
                const y1 = minR * rH - currentScrollTop;
                const y2 = (maxR + 1) * rH - currentScrollTop;

                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 2;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                // Left Handle
                ctx.beginPath();
                ctx.arc(x1, y1 + (y2 - y1) / 2, 6, 0, Math.PI * 2);
                ctx.fill();

                // Right Handle
                ctx.beginPath();
                ctx.arc(x2, y1 + (y2 - y1) / 2, 6, 0, Math.PI * 2);
                ctx.fill();

                // Label
                ctx.fillStyle = '#22d3ee';
                ctx.font = 'bold 10px Inter';
                ctx.fillText("TRANSFORM", x1 + 4, y1 - 4);
            }
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
            ctx.lineTo(headX, cssHeight);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 5. Draw Off-Screen Pulse Indicator
        if (currentIsPlaying && currentDistance !== 0) {
            const isLeft = currentDistance < 0;
            // Abs distance determines "closeness". Closer = Faster Pulse.
            // Exponential frequency: 
            // base speed when far = 0.5Hz
            // speed when close (dist=1) = very fast
            const absDist = Math.abs(currentDistance);

            // Formula: Base + (Scaling / (dist ^ power))
            // When dist is 1, speed is high. When dist is 10, speed is low.
            const speed = 2 + (50 / Math.pow(absDist, 1.5));

            const pulse = (Math.sin(Date.now() / 1000 * speed) + 1) / 2; // 0 to 1

            const indX = isLeft ? LABEL_WIDTH : cssWidth - 4;

            // "Way less glow" - reduced opacity and blur
            ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + pulse * 0.3})`; // Max 0.4 opacity
            ctx.shadowBlur = 2 + pulse * 5; // Max 7px blur
            ctx.shadowColor = '#fff';
            ctx.fillRect(indX, 0, 4, cssHeight);

            // Subtle gradient to bleed into the view - heavily reduced
            const grad = ctx.createLinearGradient(isLeft ? indX : indX - 40, 0, isLeft ? indX + 40 : indX + 4, 0);
            grad.addColorStop(isLeft ? 0 : 1, `rgba(14, 165, 233, ${pulse * 0.1})`); // Max 0.1 opacity
            grad.addColorStop(isLeft ? 1 : 0, 'rgba(14, 165, 233, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(isLeft ? indX : indX - 40, 0, 40, cssHeight);

            ctx.shadowBlur = 0;
        }

    }, [getColorHex, getBorderColorHex, adjustColor]);

    useEffect(() => {
        if (paused) return;
        let animationFrameId: number;
        const loop = () => {
            drawFrame();
            animationFrameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(animationFrameId);
    }, [drawFrame, paused]);

    const getInteractionAt = (e: React.PointerEvent | PointerEvent) => {
        if (!canvasRef.current) return { type: 'empty', r: 0, c: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = (e.clientY - rect.top) + scrollTopRef.current;

        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const r = Math.floor(y / rH);

        if (screenX < LABEL_WIDTH) return { type: 'strumming', r, c: -1 };

        // Transform Handle Detection - Prioritize OVER individual note interactions
        if (selectedNotesRef.current.length > 1) {
            let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
            selectedNotesRef.current.forEach(({ r, c }: { r: number, c: number }) => {
                const note = gridRef.current[r]?.[c];
                if (!note) return;
                minC = Math.min(minC, c);
                maxC = Math.max(maxC, c + note.d);
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
            });

            if (minC !== Infinity) {
                const x1 = LABEL_WIDTH + minC * sW;
                const x2 = LABEL_WIDTH + maxC * sW;
                const y1 = minR * rH - scrollTopRef.current;
                const y2 = (maxR + 1) * rH - scrollTopRef.current;
                const handleY = y1 + (y2 - y1) / 2;

                // Check proximity to right handle
                if (Math.abs(screenX - x2) < 20 && Math.abs((e.clientY - rect.top) - handleY) < 20) {
                    return { type: 'stretching', r: -1, c: minC, side: 'right' };
                }
                // Check proximity to left handle
                if (Math.abs(screenX - x1) < 20 && Math.abs((e.clientY - rect.top) - handleY) < 20) {
                    return { type: 'stretching', r: -1, c: maxC, side: 'left' };
                }
            }
        }

        const currentSnap = snapRef.current;
        let c = Math.floor(x / sW);
        if (currentSnap > 1) c = Math.floor(c / currentSnap) * currentSnap;

        const currentGrid = gridRef.current;
        if (r >= 0 && r < currentGrid.length) {
            for (let checkC = 0; checkC <= c; checkC++) {
                const note = currentGrid[r][checkC];
                if (note && checkC + note.d > c) {
                    const noteStartX = checkC * sW;
                    const relativeX = x - noteStartX;
                    const EDGE_THRESHOLD = 15;
                    if (relativeX < EDGE_THRESHOLD) {
                        // Check for Rolling Edit (Left Edge)
                        if (checkC > 0) {
                            // Find any note in this row that ends at checkC
                            for (let pC = 0; pC < checkC; pC++) {
                                const pn = currentGrid[r][pC];
                                if (pn && pC + pn.d === checkC) {
                                    return { type: 'rolling-edit', r, c: checkC, note, secondNote: { c: pC, note: pn } };
                                }
                            }
                        }
                        return { type: 'resizing-left', r, c: checkC, note };
                    }
                    if (relativeX > note.d * sW - EDGE_THRESHOLD) {
                        // Check for Rolling Edit (Right Edge)
                        const nextStart = checkC + note.d;
                        if (nextStart < STEPS_PER_PATTERN) {
                            const nextNote = currentGrid[r][nextStart];
                            if (nextNote) {
                                return { type: 'rolling-edit', r, c: checkC, note, secondNote: { c: nextStart, note: nextNote } };
                            }
                        }
                        return { type: 'resizing-right', r, c: checkC, note };
                    }
                    return { type: 'moving', r, c: checkC, note };
                }
            }
        }



        return { type: 'empty', r, c };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        // Track pointers for multi-touch
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        const hit = getInteractionAt(e);
        const startTime = Date.now();


        if (e.button === 1) {
            if (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right') {
                onToggleNote(hit.r, hit.c!);
            }
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            const rect = canvasRef.current!.getBoundingClientRect();
            setInteraction({
                type: 'selecting',
                startX: e.clientX,
                startY: e.clientY,
                startTime,
                selectionRect: {
                    x1: e.clientX - rect.left,
                    y1: e.clientY - rect.top,
                    x2: e.clientX - rect.left,
                    y2: e.clientY - rect.top
                }
            });
            return;
        }

        if (hit.type === 'stretching') {
            setInteraction({
                type: 'stretching',
                startX: e.clientX,
                startY: e.clientY,
                startTime,
                stretchOriginC: hit.c,
                stretchRatio: 1,
                stretchSide: (hit as any).side
            });
            return;
        }

        if (hit.type === 'rolling-edit') {
            const { r, note, secondNote } = hit as any;
            // note1 is always the one on the left
            const note1 = hit.c < secondNote.c ? { c: hit.c, note: note! } : { c: secondNote.c, note: secondNote.note };
            const note2 = hit.c < secondNote.c ? { c: secondNote.c, note: secondNote.note } : { c: hit.c, note: note! };

            // Preview the primary note of the boundary
            onPreviewNote(r, note1.note);

            setInteraction({
                type: 'rolling-edit',
                startX: e.clientX,
                startY: e.clientY,
                startTime,
                rollingEdit: {
                    r,
                    note1,
                    note2,
                    initialSplitC: note2.c,
                    currentSplitC: note2.c
                }
            });
            return;
        }

        if (hit.r < 0 || !rowConfigsRef.current[hit.r]) return;

        // Razor Tool Split Logic
        if (isRazorModeRef.current && (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right')) {
            const { r, c, note } = hit;
            const rect = canvasRef.current!.getBoundingClientRect();
            const x = e.clientX - rect.left - LABEL_WIDTH;
            const { stepWidth: sW } = dimensionsRef.current;
            const currentSnap = snapRef.current;
            let splitC = Math.floor(x / sW);
            if (currentSnap > 1) splitC = Math.floor(splitC / currentSnap) * currentSnap;

            // Only split if within note bounds and not at edges
            if (note && splitC > c && splitC < c + note.d) {
                const note1D = splitC - c;
                const note2D = note.d - note1D;

                // Update original d, then onAddNote for second part.
                onCommitNote(r, c, r, c, { ...note, d: note1D });
                onAddNote(r, splitC, note2D, { ...note, d: note2D });
            }
            return;
        }



        const isHitSelected = selectedNotesRef.current.some((sn: { r: number, c: number }) => sn.r === hit.r && sn.c === hit.c);
        if (isHitSelected) {
            if (isRazorModeRef.current) {
                // Already handled split above, but if we want to support multi-split later we can add it here.
            } else if (hit.type === 'moving') {
                onPreviewNote(hit.r, hit.note);
                setInteraction({ type: 'moving-group', startX: e.clientX, startY: e.clientY, startTime, deltaR: 0, deltaC: 0, isCloning: e.altKey, lastStrummedR: hit.r, lastStrummedOctave: hit.note?.oct || 0, groupOctaveDelta: 0 });
                return;
            } else if (hit.type === 'resizing-left') {
                setInteraction({ type: 'resizing-left-group', startX: e.clientX, startY: e.clientY, startTime, deltaC: 0 });
                return;
            } else if (hit.type === 'resizing-right') {
                setInteraction({ type: 'resizing-right-group', startX: e.clientX, startY: e.clientY, startTime, deltaC: 0 });
                return;
            }
        }

        if (hit.type === 'strumming') {
            onPreviewNote(hit.r, { d: 1, o: 0, oct: 0 });
            setInteraction({ type: 'strumming', startX: e.clientX, startY: e.clientY, startTime, lastStrummedR: hit.r, lastStrummedOctave: 0 });
            return;
        }

        if (hit.c < 0 || hit.c >= STEPS_PER_PATTERN) return;

        if (hit.type === 'moving' || hit.type === 'resizing-left' || hit.type === 'resizing-right') {
            onPreviewNote(hit.r, hit.note);
            setInteraction({
                type: hit.type as any,
                startX: e.clientX,
                startY: e.clientY,
                startTime,
                activeNote: { startR: hit.r, startC: hit.c!, note: hit.note!, currentR: hit.r, currentC: hit.c!, currentD: hit.note!.d },
                isCloning: e.altKey,
                lastStrummedR: hit.r,
                lastStrummedOctave: hit.note!.oct || 0
            });
        } else if (hit.type === 'empty') {
            if (isPenModeRef.current) {
                // Pen Mode Init
                const rect = canvasRef.current!.getBoundingClientRect();
                const startX = e.clientX - rect.left - LABEL_WIDTH;
                const startY = e.clientY - rect.top + scrollTopRef.current;

                smoothedPos.current = { x: startX, y: startY };
                lastPenPos.current = { r: hit.r, c: hit.c! };

                onAddNote(hit.r, hit.c!, 1, { oct: 0, v: 0.8 }); // Default velocity
                setInteraction({ type: 'drawing', startX: e.clientX, startY: e.clientY, startTime });
            } else {
                if (selectedNotesRef.current.length > 0) {
                    onSelectNotes?.([]);
                }
                onPreviewNote(hit.r, { d: 1, o: 0, oct: 0 });
                setInteraction({ type: 'drawing', startX: e.clientX, startY: e.clientY, startTime, tempNote: { r: hit.r, c: hit.c, d: 1, oct: 0 }, lastStrummedR: hit.r, lastStrummedOctave: 0 });
            }
        }
    };


    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!canvasRef.current) return;

        // Update pointer position
        if (activePointersRef.current.has(e.pointerId)) {
            activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        // Handle Pinch Logic
        if (activePointersRef.current.size === 2) {
            const pointers = Array.from(activePointersRef.current.values());
            const dist = Math.abs(pointers[0].x - pointers[1].x);

            if (initialPinchDistanceRef.current === null) {
                initialPinchDistanceRef.current = dist;
                // Initialize stretch if notes are selected
                if (selectedNotesRef.current.length > 0) {
                    let minC = Infinity; // Pivot
                    selectedNotesRef.current.forEach(({ c }: { r: number, c: number }) => minC = Math.min(minC, c));
                    setInteraction({
                        type: 'stretching',
                        startX: 0, // Not used for pinch
                        startY: 0,
                        startTime: Date.now(),
                        stretchOriginC: minC,
                        stretchRatio: 1
                    });
                }
            } else {
                const ratio = Math.max(0.1, dist / (initialPinchDistanceRef.current || 1));
                // Only update if we successfully started a stretch interaction
                if (interactionRef.current.type === 'stretching') {
                    setInteraction(prev => ({ ...prev, stretchRatio: ratio }));
                }
            }
            return;
        }

        const currentInteraction = interactionRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const x = screenX - LABEL_WIDTH;
        const y = (e.clientY - rect.top) + scrollTopRef.current;

        const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
        const currentR = Math.floor(y / rH);
        const currentC = Math.floor(x / sW);

        if (currentInteraction.type === 'idle') {
            const hit = getInteractionAt(e);
            if (isRazorModeRef.current) {
                canvasRef.current.style.cursor = 'cell'; // Razor icon stand-in
            } else if (hit.type === 'resizing-left' || hit.type === 'resizing-right') canvasRef.current.style.cursor = 'ew-resize';
            else if (hit.type === 'moving') canvasRef.current.style.cursor = 'grab';
            else if (hit.type === 'strumming') canvasRef.current.style.cursor = 'ns-resize';
            else if (hit.type === 'stretching') canvasRef.current.style.cursor = 'ew-resize';
            else canvasRef.current.style.cursor = 'crosshair';
            setInteraction(prev => ({ ...prev, hoveredHit: hit as any, hoveredRow: hit.type === 'strumming' ? hit.r : undefined }));
            return;
        }

        // Shared Strumming/Pitch Follow logic
        if (currentInteraction.type === 'strumming' || currentInteraction.type === 'moving' || currentInteraction.type === 'drawing' || currentInteraction.type === 'moving-group') {
            if (currentR !== currentInteraction.lastStrummedR && currentR >= 0 && rowConfigsRef.current[currentR]) {
                let noteToPreview: Note | undefined = undefined;
                if (currentInteraction.type === 'moving') noteToPreview = currentInteraction.activeNote?.note;
                else noteToPreview = { d: 1, o: 0, oct: currentInteraction.lastStrummedOctave || 0 };

                onPreviewNote(currentR, noteToPreview);
                setInteraction(prev => ({ ...prev, lastStrummedR: currentR, hoveredRow: currentR }));
            }
        }

        const hit = getInteractionAt(e);
        if (canvasRef.current) {
            if (hit.type === 'rolling-edit') canvasRef.current.style.cursor = 'col-resize';
            else if (hit.type === 'resizing-left' || hit.type === 'resizing-right') canvasRef.current.style.cursor = 'ew-resize';
            else canvasRef.current.style.cursor = 'default';
        }

        if (currentInteraction.type === 'drawing') {
            if (isPenModeRef.current) {
                // PEN MODE LOGIC
                const targetX = screenX - LABEL_WIDTH;
                const targetY = (e.clientY - rect.top) + scrollTopRef.current;

                // Smoothing (EMA)
                const smoothFactor = Math.max(0.01, 1 - smoothingRef.current);
                smoothedPos.current.x += (targetX - smoothedPos.current.x) * smoothFactor;
                smoothedPos.current.y += (targetY - smoothedPos.current.y) * smoothFactor;

                const penR = Math.floor(smoothedPos.current.y / rH);
                const penC = Math.floor(smoothedPos.current.x / sW);

                // Bresenham-like Interpolation
                if (lastPenPos.current) {
                    const startR = lastPenPos.current.r;
                    const startC = lastPenPos.current.c;
                    const dr = penR - startR;
                    const dc = penC - startC;
                    const dist = Math.max(Math.abs(dr), Math.abs(dc));

                    for (let i = 1; i <= dist; i++) {
                        const r = Math.round(startR + (dr * i) / dist);
                        const c = Math.round(startC + (dc * i) / dist);

                        if (r >= 0 && r < rowConfigsRef.current.length && c >= 0 && c < STEPS_PER_PATTERN) {
                            // Only add if not same as last added (simple check, backend handles dups usually)
                            onAddNote(r, c, 1, { oct: 0, v: 0.8 });
                        }
                    }
                    lastPenPos.current = { r: penR, c: penC };
                }
            } else if (currentInteraction.tempNote) {
                const currentSnap = snapRef.current;
                let newD = Math.max(1, currentC - currentInteraction.tempNote.c + 1);
                if (currentSnap > 1) newD = Math.ceil(newD / currentSnap) * currentSnap;
                setInteraction(prev => ({ ...prev, tempNote: prev.tempNote ? { ...prev.tempNote, d: newD } : undefined }));
            }
        } else if (currentInteraction.activeNote) {
            if (currentInteraction.type === 'moving') {
                const deltaC = currentC - Math.floor(((currentInteraction.startX - rect.left) - LABEL_WIDTH) / sW);
                const deltaR = currentR - Math.floor(((currentInteraction.startY - rect.top) + scrollTopRef.current) / rH);
                const newR = Math.max(0, Math.min(rowConfigsRef.current.length - 1, currentInteraction.activeNote.startR + deltaR));
                const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - currentInteraction.activeNote.note.d, currentInteraction.activeNote.startC + deltaC));
                setInteraction(prev => ({ ...prev, activeNote: prev.activeNote ? { ...prev.activeNote, currentR: newR, currentC: newC } : undefined }));
            } else if (currentInteraction.type === 'resizing-right') {
                let newD = Math.max(1, currentC - currentInteraction.activeNote.startC + 1);
                if (snapRef.current > 1) newD = Math.ceil(newD / snapRef.current) * snapRef.current;
                setInteraction(prev => ({ ...prev, activeNote: prev.activeNote ? { ...prev.activeNote, currentD: newD } : undefined }));
            } else if (currentInteraction.type === 'resizing-left') {
                const originalEnd = currentInteraction.activeNote.startC + currentInteraction.activeNote.note.d;
                const newC = Math.max(0, Math.min(originalEnd - 1, currentC));
                const newD = originalEnd - newC;
                setInteraction(prev => ({ ...prev, activeNote: prev.activeNote ? { ...prev.activeNote, currentC: newC, currentD: newD } : undefined }));
            }
        } else if (currentInteraction.type === 'moving-group') {
            const deltaC = currentC - Math.floor(((currentInteraction.startX - rect.left) - LABEL_WIDTH) / sW);
            const deltaR = currentR - Math.floor(((currentInteraction.startY - rect.top) + scrollTopRef.current) / rH);
            setInteraction(prev => ({ ...prev, deltaR, deltaC }));
        } else if (currentInteraction.type === 'resizing-left-group' || currentInteraction.type === 'resizing-right-group') {
            const deltaC = currentC - Math.floor(((currentInteraction.startX - rect.left) - LABEL_WIDTH) / sW);
            setInteraction(prev => ({ ...prev, deltaC }));
        } else if (currentInteraction.type === 'rolling-edit' && currentInteraction.rollingEdit) {
            const { rollingEdit } = currentInteraction;
            const initialXInCols = (currentInteraction.startX - rect.left - LABEL_WIDTH) / sW;
            const currentXInCols = x / sW;
            const deltaC = Math.round(currentXInCols - initialXInCols);
            let newSplitC = rollingEdit.initialSplitC + deltaC;

            // Snap
            if (snapRef.current > 1) {
                newSplitC = Math.round(newSplitC / snapRef.current) * snapRef.current;
            }

            // Constrain
            const minC = rollingEdit.note1.c + 1;
            const maxC = rollingEdit.note2.c + rollingEdit.note2.note.d - 1;
            const constrainedSplitC = Math.max(minC, Math.min(maxC, newSplitC));

            setInteraction(prev => ({
                ...prev,
                rollingEdit: prev.rollingEdit ? { ...prev.rollingEdit, currentSplitC: constrainedSplitC } : undefined
            }));
            if (canvasRef.current) canvasRef.current.style.cursor = 'col-resize';
        } else if (currentInteraction.type === 'stretching') {
            const { startX, stretchOriginC } = currentInteraction;
            if (stretchOriginC === undefined) return;

            const pivotX = LABEL_WIDTH + stretchOriginC * sW;
            const initialWidth = startX - rect.left - pivotX;
            const currentWidth = e.clientX - rect.left - pivotX;

            // Avoid divide by zero. Use a small epsilon if width is 0.
            const denom = initialWidth === 0 ? 1 : initialWidth;
            const ratio = Math.max(0.1, currentWidth / denom);
            setInteraction(prev => ({ ...prev, stretchRatio: ratio }));
            if (canvasRef.current) canvasRef.current.style.cursor = 'ew-resize';
        } else if (currentInteraction.type === 'selecting') {
            setInteraction(prev => ({ ...prev, selectionRect: prev.selectionRect ? { ...prev.selectionRect, x2: e.clientX - rect.left, y2: e.clientY - rect.top } : undefined }));
        }
    }, [onPreviewNote]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        activePointersRef.current.delete(e.pointerId);
        if (activePointersRef.current.size < 2) {
            initialPinchDistanceRef.current = null;
        }

        const currentInteraction = interactionRef.current;
        const isQuickClick = Date.now() - currentInteraction.startTime < 250;

        if (currentInteraction.type === 'drawing' && currentInteraction.tempNote) {
            onAddNote(currentInteraction.tempNote.r, currentInteraction.tempNote.c, currentInteraction.tempNote.d, { oct: currentInteraction.tempNote.oct });
        } else if (currentInteraction.activeNote) {
            const { startR, startC, currentR, currentC, currentD, note } = currentInteraction.activeNote;
            const moved = Math.abs(e.clientX - currentInteraction.startX) >= 3 || Math.abs(e.clientY - currentInteraction.startY) >= 3;

            if (!moved && !currentInteraction.octaveChanged) {
                // IMPORTANT: Only toggle selection if it was a quick click.
                // If it was a long hold (even without moving), do NOT select.
                if (isQuickClick) {
                    // Mobile: Tap (Touch) to delete, since there's no middle-click/delete key.
                    // Desktop: Click to select.
                    if (e.pointerType === 'touch') {
                        onToggleNote(startR, startC);
                    } else {
                        onSelectNotes?.([{ r: startR, c: startC }]);
                    }
                }
            } else if (currentInteraction.isCloning) {
                onAddNote(currentR, currentC, currentD, { ...note, d: currentD });
            } else {
                onCommitNote(startR, startC, currentR, currentC, { d: currentD, oct: note.oct });
            }
        } else if (currentInteraction.type === 'moving-group' && currentInteraction.deltaR !== undefined && currentInteraction.deltaC !== undefined) {
            const { deltaR, deltaC, octaveChanged, groupOctaveDelta = 0 } = currentInteraction;

            if (deltaR !== 0 || deltaC !== 0 || octaveChanged) {
                const movements = selectedNotesRef.current
                    .map(({ r, c }) => {
                        const note = gridRef.current[r]?.[c];
                        if (!note) return null;
                        const newR = Math.max(0, Math.min(rowConfigsRef.current.length - 1, r + deltaR));
                        const newC = Math.max(0, Math.min(STEPS_PER_PATTERN - note.d, c + deltaC));
                        const newOct = (note.oct || 0) + groupOctaveDelta;
                        return { fromR: r, fromC: c, toR: newR, toC: newC, data: { oct: newOct } };
                    })
                    .filter((m): m is NonNullable<typeof m> => m !== null);
                if (movements.length > 0) {
                    if (currentInteraction.isCloning) onCopyMultiNote?.(movements);
                    else onCommitMultiNote?.(movements);
                }
            }
        } else if ((currentInteraction.type === 'resizing-left-group' || currentInteraction.type === 'resizing-right-group') && currentInteraction.deltaC !== undefined) {
            const { deltaC, type: itype } = currentInteraction;
            if (deltaC !== 0) {
                const movements = selectedNotesRef.current
                    .map(({ r, c }) => {
                        const note = gridRef.current[r]?.[c];
                        if (!note) return null;

                        let newC = c;
                        let newD = note.d;

                        if (itype === 'resizing-right-group') {
                            newD = Math.max(1, note.d + deltaC);
                        } else {
                            newC = Math.max(0, Math.min(c + note.d - 1, c + deltaC));
                            newD = note.d + (c - newC);
                        }

                        return { fromR: r, fromC: c, toR: r, toC: newC, data: { d: newD } };
                    })
                    .filter((m): m is NonNullable<typeof m> => m !== null);
                if (movements.length > 0) {
                    onCommitMultiNote?.(movements);
                }
            }
        } else if (currentInteraction.type === 'selecting' && currentInteraction.selectionRect) {
            const { x1, y1, x2, y2 } = currentInteraction.selectionRect;
            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            const { rowHeight: rH, stepWidth: sW } = dimensionsRef.current;
            const selected: { r: number, c: number }[] = [];
            gridRef.current.forEach((row, r) => {
                const rowY = r * rH - scrollTopRef.current;
                if (rowY + rH > minY && rowY < maxY) {
                    row.forEach((note, c) => {
                        const cellX = LABEL_WIDTH + c * sW;
                        const cellRightX = cellX + (note ? note.d * sW : sW);
                        if (cellRightX > minX && cellX < maxX) selected.push({ r, c });
                    });
                }
            });
            onSelectNotes?.(selected);
        } else if (currentInteraction.type === 'stretching' && currentInteraction.stretchRatio && currentInteraction.stretchOriginC !== undefined) {
            const { stretchRatio, stretchOriginC } = currentInteraction;
            const currentSnap = snapRef.current;

            const movements = selectedNotesRef.current.map(({ r, c }) => {
                const note = gridRef.current[r]?.[c];
                if (!note) return null;

                let targetC = stretchOriginC + (c - stretchOriginC) * stretchRatio;
                let targetD = note.d * stretchRatio;

                if (currentSnap > 1) {
                    targetC = Math.round(targetC / currentSnap) * currentSnap;
                    targetD = Math.max(currentSnap, Math.round(targetD / currentSnap) * currentSnap);
                } else {
                    targetC = Math.round(targetC);
                    targetD = Math.max(1, Math.round(targetD));
                }

                // Only adding if changed?
                return { fromR: r, fromC: c, toR: r, toC: targetC, data: { d: targetD, oct: note.oct } };
            }).filter((m): m is NonNullable<typeof m> => m !== null);

            if (movements.length > 0) {
                onCommitMultiNote?.(movements);
            }
        } else if (currentInteraction.type === 'rolling-edit' && currentInteraction.rollingEdit) {
            const { rollingEdit } = currentInteraction;
            const { r, note1, note2, currentSplitC } = rollingEdit;

            if (currentSplitC !== rollingEdit.initialSplitC) {
                const movements = [
                    {
                        fromR: r, fromC: note1.c, toR: r, toC: note1.c,
                        data: { d: currentSplitC - note1.c, oct: note1.note.oct }
                    },
                    {
                        fromR: r, fromC: note2.c, toR: r, toC: currentSplitC,
                        data: { d: (note2.c + note2.note.d) - currentSplitC, oct: note2.note.oct }
                    }
                ];
                onCommitMultiNote?.(movements);
            }
        }

        // Stop audio for all sustained interaction types
        const sustainedTypes = ['strumming', 'drawing', 'moving', 'moving-group', 'resizing-left', 'resizing-right', 'resizing-left-group', 'resizing-right-group', 'rolling-edit'];
        if (sustainedTypes.includes(currentInteraction.type)) {
            onStopPreviewNote();
        }

        // Deselect if octave was changed (already verified requirement)
        if (currentInteraction.octaveChanged) {
            onSelectNotes?.([]);
        }

        setInteraction({ type: 'idle', startX: 0, startY: 0, startTime: 0 });
    }, [onAddNote, onCommitNote, onSelectNotes, onCommitMultiNote, onCopyMultiNote, onStopPreviewNote]);

    useEffect(() => {
        if (interaction.type !== 'idle') {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [interaction.type, handlePointerMove, handlePointerUp]);

    const handleWheel = (e: React.WheelEvent) => {
        const currentInteraction = interactionRef.current;
        if (currentInteraction.type !== 'idle') {
            e.preventDefault();
            const octDelta = e.deltaY < 0 ? 1 : -1;

            setInteraction(prev => {
                const next = { ...prev };
                next.octaveChanged = true;

                if (prev.type === 'drawing' && prev.tempNote) {
                    const newOct = Math.max(-3, Math.min(3, (prev.tempNote.oct || 0) + octDelta));
                    next.tempNote = { ...prev.tempNote, oct: newOct };
                    onPreviewNote(prev.tempNote.r, { d: 1, o: 0, oct: newOct });
                } else if (prev.type === 'moving' && prev.activeNote) {
                    const newOct = Math.max(-3, Math.min(3, (prev.activeNote.note.oct || 0) + octDelta));
                    const updatedNote = { ...prev.activeNote.note, oct: newOct };
                    next.activeNote = { ...prev.activeNote, note: updatedNote };
                    onPreviewNote(prev.activeNote.currentR, updatedNote);
                } else if (prev.type === 'strumming' && prev.lastStrummedR !== undefined) {
                    const newOct = Math.max(-3, Math.min(3, (prev.lastStrummedOctave || 0) + octDelta));
                    next.lastStrummedOctave = newOct;
                    onPreviewNote(prev.lastStrummedR, { d: 1, o: 0, oct: newOct });
                } else if (prev.type === 'moving-group' && prev.lastStrummedR !== undefined) {
                    const newDelta = Math.max(-3, Math.min(3, (prev.groupOctaveDelta || 0) + octDelta));
                    next.groupOctaveDelta = newDelta;
                    // Preview using lead note offset
                    const leadNote = gridRef.current[prev.lastStrummedR]?.[prev.activeNote?.startC || 0] || { oct: 0 };
                    onPreviewNote(prev.lastStrummedR, { d: 1, o: 0, oct: (leadNote.oct || 0) + newDelta });
                }
                return next;
            });
            return;
        }

        if (!isUnrolledRef.current) return;
        onSetScrollTop(prev => {
            const maxScroll = Math.max(0, (rowConfigsRef.current.length * 40) - (containerRef.current?.clientHeight || 600));
            return Math.max(0, Math.min(prev + e.deltaY, maxScroll));
        });
    };

    return (
        <div ref={containerRef} className="w-full h-full relative cursor-crosshair overflow-hidden touch-none" onWheel={handleWheel}>
            {/* Toolbar Overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-2 z-50 pointer-events-auto">
                <button
                    onClick={() => { setIsPenMode(!isPenMode); setIsRazorMode(false); }}
                    className={`p-1.5 rounded-lg border backdrop-blur-sm transition-all text-xs font-bold uppercase flex items-center gap-2 ${isPenMode ? 'bg-sky-500/20 border-sky-400 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.3)]' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'}`}
                    title="Pen Tool (P)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    <span>Pen</span>
                </button>
                {isPenMode && (
                    <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-slate-700 backdrop-blur-sm">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Smooth</span>
                        <input
                            type="range"
                            min="0"
                            max="0.95"
                            step="0.05"
                            value={smoothing}
                            onChange={(e) => setSmoothing(parseFloat(e.target.value))}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-16 accent-sky-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] text-sky-400 w-6 text-right font-mono">{(smoothing * 100).toFixed(0)}%</span>
                    </div>
                )}
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-[80px] bg-slate-900/90 z-10 border-r border-white/5 pointer-events-none" style={{ transform: `translateY(-${scrollTop}px)` }}>
                {rowConfigs.map((config, i) => (
                    <div key={i} style={{ height: `${rowHeight}px` }} className={`flex items-center justify-end pr-3 text-[10px] font-bold uppercase transition-all duration-75 ${activeRowsByKeyboard[i] ? 'bg-white text-slate-900 scale-110 shadow-[0_0_20px_white] z-30' : interaction.type === 'strumming' && interaction.lastStrummedR === i ? 'bg-sky-500 text-white scale-110 shadow-[0_0_15px_#0ea5e9] z-20' : interaction.hoveredRow === i ? 'bg-slate-800 text-slate-200' : 'text-slate-500'}`}>
                        {config.label}
                    </div>
                ))}
            </div>
            <canvas ref={canvasRef} onPointerDown={handlePointerDown} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
    );
};
