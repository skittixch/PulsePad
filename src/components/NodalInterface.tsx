import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { FXGraph, FXNode, FXConnection } from '../types';
import { audioEngine } from '../audioEngine';

interface NodalInterfaceProps {
    graph: FXGraph;
    onUpdateGraph: (graph: FXGraph) => void;
    onCommitGraph: (graph: FXGraph) => void;
    trackCount?: number;
    trackNames?: string[];
    paused?: boolean;
}



const LFOVisualizer: React.FC<{ rate: number, amp: number, type: number, phase: number, normalize: boolean }> = ({ rate, amp, type, phase, normalize }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame: number;
        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            const time = Date.now() / 1000;

            ctx.clearRect(0, 0, w, h);

            // Draw grid
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#6366f1';

            for (let x = 0; x < w; x++) {
                // Use relative time for visualizer as well
                const relTime = Math.max(0, time - audioEngine.lfoStartTime);
                const t = relTime + (x / w) * (2 / Math.max(0.1, rate));
                let y = 0;
                const pTime = (t * rate) + phase;
                const p = pTime % 1;

                if (type === 0) { // Sine
                    y = Math.sin(pTime * Math.PI * 2);
                } else if (type === 1) { // Triangle
                    y = (Math.abs((p * 2) - 1) * 2 - 1);
                } else if (type === 2) { // Saw
                    y = (p * 2) - 1;
                } else if (type === 3) { // Square
                    y = p > 0.5 ? 1 : -1;
                }

                // Normalization
                if (normalize) {
                    y = (y + 1) / 2;
                }

                const screenY = (h / 2) - (y * amp * (h / 2.5));
                if (normalize) {
                    // Adjust vertical offset for unipolar
                    const uniY = h - (y * amp * (h * 0.8)) - (h * 0.1);
                    if (x === 0) ctx.moveTo(x, uniY);
                    else ctx.lineTo(x, uniY);
                } else {
                    if (x === 0) ctx.moveTo(x, screenY);
                    else ctx.lineTo(x, screenY);
                }
            }
            ctx.stroke();

            frame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(frame);
    }, [rate, amp, type, phase, normalize]);

    return <canvas ref={canvasRef} width={200} height={64} className="w-full h-full" />;
};

const EQVisualizer: React.FC<{ params: any }> = ({ params }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach(p => {
            ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke();
        });

        const lowFreq = (params.lowFreq ?? 0.2);
        const lowGain = (params.lowGain ?? 0.5) * 2 - 1;
        const midFreq = (params.midFreq ?? 0.5);
        const midGain = (params.midGain ?? 0.5) * 2 - 1;
        const midQ = (params.midQ ?? 0.1);
        const highFreq = (params.highFreq ?? 0.8);
        const highGain = (params.highGain ?? 0.5) * 2 - 1;

        ctx.beginPath();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f43f5e';

        for (let x = 0; x < w; x++) {
            const f = x / w;
            let response = 0;

            // Simple approximation of combined filters
            // Low Shelf
            const lowDist = Math.max(0, lowFreq - f) / lowFreq;
            response += lowGain * Math.pow(lowDist, 2);

            // Peaking Mid
            const midWidth = (1.1 - midQ) * 0.4;
            const midDist = Math.abs(f - midFreq);
            if (midDist < midWidth) {
                const midFactor = 1 - (midDist / midWidth);
                response += midGain * Math.sin(midFactor * Math.PI / 2);
            }

            // High Shelf
            const highDist = Math.max(0, f - highFreq) / (1 - highFreq);
            response += highGain * Math.pow(highDist, 2);

            const y = (h / 2) - (response * (h / 3));
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }, [params]);

    return <canvas ref={canvasRef} width={200} height={80} className="w-full h-full" />;
};

const FadeVisualizer: React.FC<{ params: any, onUpdate: (p: any) => void }> = ({ params, onUpdate }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dragging, setDragging] = useState<'p1' | 'p2' | null>(null);

    const cx1 = params.cx1 ?? 0.25;
    const cy1 = params.cy1 ?? 0.1;
    const cx2 = params.cx2 ?? 0.25;
    const cy2 = params.cy2 ?? 1.0;

    const width = 176;
    const height = 64;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            ctx.moveTo(i * width / 4, 0); ctx.lineTo(i * width / 4, height);
            ctx.moveTo(0, i * height / 4); ctx.lineTo(width, i * height / 4);
        }
        ctx.stroke();

        // Draw Bezier Curve
        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
        ctx.moveTo(0, height);
        ctx.bezierCurveTo(cx1 * width, height - (cy1 * height), cx2 * width, height - (cy2 * height), width, 0);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw handles
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height); ctx.lineTo(cx1 * width, height - (cy1 * height));
        ctx.moveTo(width, 0); ctx.lineTo(cx2 * width, height - (cy2 * height));
        ctx.stroke();
        ctx.setLineDash([]);

        // Handle dots
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx1 * width, height - (cy1 * height), 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 * width, height - (cy2 * height), 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath(); ctx.arc(cx1 * width, height - (cy1 * height), 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 * width, height - (cy2 * height), 2.5, 0, Math.PI * 2); ctx.fill();
    }, [cx1, cy1, cx2, cy2]);

    const handleInteraction = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / width));
        const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / height));

        if (dragging === 'p1') onUpdate({ ...params, cx1: x, cy1: y });
        else if (dragging === 'p2') onUpdate({ ...params, cx2: x, cy2: y });
    };

    return (
        <div className="flex flex-col gap-1.5 mt-1">
            <div className="relative group/fade">
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = (e.clientX - rect.left) / width;
                        const y = 1 - (e.clientY - rect.top) / height;
                        const d1 = Math.sqrt((x - cx1) ** 2 + (y - cy1) ** 2);
                        const d2 = Math.sqrt((x - cx2) ** 2 + (y - cy2) ** 2);
                        if (d1 < 0.2) setDragging('p1');
                        else if (d2 < 0.2) setDragging('p2');
                    }}
                    onMouseMove={(e) => {
                        if (dragging) {
                            e.stopPropagation();
                            handleInteraction(e.clientX, e.clientY);
                        }
                    }}
                    onMouseUp={() => setDragging(null)}
                    onMouseLeave={() => setDragging(null)}
                    className="bg-slate-950/80 rounded-lg border border-white/5 cursor-crosshair w-full"
                />
            </div>
            <div className="flex gap-1">
                <button
                    onClick={() => onUpdate({ ...params, cx1: 0, cy1: 0, cx2: 1, cy2: 1 })}
                    className="flex-1 bg-slate-800 hover:bg-sky-500/20 hover:text-sky-400 text-[7px] font-black py-1 rounded-md transition-all uppercase tracking-tighter border border-white/5"
                >
                    Linear
                </button>
                <button
                    onClick={() => onUpdate({ ...params, cx1: 0.4, cy1: 0, cx2: 0.6, cy2: 1 })}
                    className="flex-1 bg-slate-800 hover:bg-sky-500/20 hover:text-sky-400 text-[7px] font-black py-1 rounded-md transition-all uppercase tracking-tighter border border-white/5"
                >
                    Sigmoid
                </button>
            </div>
        </div>
    );
};
export const NODE_WIDTH = 200;
export const NODE_PADDING = 60;

export interface NodalInterfaceRef {
    selectAll: () => void;
}


export const NodalInterface = React.forwardRef<NodalInterfaceRef, NodalInterfaceProps>(({
    graph,
    onUpdateGraph,
    onCommitGraph,
    trackCount = 1,
    trackNames = [],
    paused = false
}, ref) => {
    // ...


    const NODE_DEFS = {
        source: {
            name: "Sequencer", color: "border-emerald-500", outType: "audio", params: [],
            getOutputs: (node: FXNode) => {
                const base = [{ id: 'main', label: 'MIX', type: 'audio' }];
                if (node.params.splitOutputs === 1) {
                    return [...base, ...Array.from({ length: trackCount }, (_, i) => ({
                        id: `track_${i}`,
                        label: trackNames[i] || `Trk ${i + 1}`,
                        type: "audio"
                    }))];
                }
                return base;
            }
        },
        output: { name: "Speakers", color: "border-sky-500", inType: "audio", params: [] },
        mixer: {
            name: "Mixer", color: "border-indigo-500", inType: "audio", outType: "audio",
            params: [],
            isMixer: true
        },
        parametricEQ: {
            name: "EQ", color: "border-rose-500", inType: "audio", outType: "audio",
            params: [
                { id: "lowFreq", label: "Low Freq", min: 0, max: 1, step: 0.01, default: 0.2, type: "scalar" },
                { id: "lowGain", label: "Low Gain", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "midFreq", label: "Mid Freq", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "midGain", label: "Mid Gain", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "midQ", label: "Mid Q", min: 0, max: 1, step: 0.01, default: 0.1, type: "scalar" },
                { id: "highFreq", label: "High Freq", min: 0, max: 1, step: 0.01, default: 0.8, type: "scalar" },
                { id: "highGain", label: "High Gain", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" }
            ]
        },
        delay: {
            name: "Delay", color: "border-violet-500", inType: "audio", outType: "audio",
            params: [
                { id: "time", label: "Time", min: 0, max: 1, step: 0.01, default: 0.25, type: "scalar" },
                { id: "feedback", label: "Feedback", min: 0, max: 0.9, step: 0.01, default: 0.4, type: "scalar" },
                { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" }
            ]
        },
        filter: {
            name: "Filter", color: "border-yellow-500", inType: "audio", outType: "audio",
            params: [
                { id: "freq", label: "Freq", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "q", label: "Q", min: 0, max: 1, step: 0.01, default: 0.1, type: "scalar" }
            ]
        },
        distortion: {
            name: "Distortion", color: "border-orange-500", inType: "audio", outType: "audio",
            params: [
                { id: "drive", label: "Drive", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" }
            ]
        },
        reverb: {
            name: "Reverb", color: "border-pink-500", inType: "audio", outType: "audio",
            params: [
                { id: "time", label: "Time", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "decay", label: "Decay", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" }
            ]
        },
        compressor: {
            name: "Compressor", color: "border-cyan-500", inType: "audio", outType: "audio",
            params: [
                { id: "threshold", label: "Thresh", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "ratio", label: "Ratio", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" },
                { id: "attack", label: "Atk", min: 0, max: 1, step: 0.01, default: 0.1, type: "scalar" },
                { id: "release", label: "Rel", min: 0, max: 1, step: 0.01, default: 0.2, type: "scalar" }
            ]
        },
        float: {
            name: "Float", color: "border-sky-500", outType: "scalar",
            params: [
                { id: "val", label: "Value", min: 0, max: 1, step: 0.01, default: 0.5, type: "scalar" }
            ]
        },
        int: {
            name: "Integer", color: "border-emerald-500", outType: "int",
            params: [
                { id: "val", label: "Value", min: 0, max: 100, step: 1, default: 50, type: "int" }
            ]
        },
        lfo: {
            name: "LFO", color: "border-indigo-400", outType: "scalar",
            params: [
                { id: "rate", label: "Rate", min: 0.1, max: 5, step: 0.001, default: 1.0, type: "scalar" },
                { id: "amp", label: "Amp", min: 0, max: 1, step: 0.01, default: 1.0, type: "scalar" },
                { id: "phase", label: "Phase", min: 0, max: 1, step: 0.01, default: 0, type: "scalar" },
                { id: "normalize", label: "Norm", default: 0, type: "bool" },
                { id: "type", label: "Wave", min: 0, max: 3, step: 1, default: 0, type: "int" } // 0: Sin, 1: Tri, 2: Saw, 3: Sqr
            ]
        },
        setRange: {
            name: "Set Range", color: "border-rose-400", inType: "scalar", outType: "scalar",
            params: [
                { id: "oldMin", label: "In Min", min: -10, max: 10, step: 0.1, default: -1, type: "scalar" },
                { id: "oldMax", label: "In Max", min: -10, max: 10, step: 0.1, default: 1, type: "scalar" },
                { id: "newMin", label: "Out Min", min: -10, max: 10, step: 0.1, default: 0, type: "scalar" },
                { id: "newMax", label: "Out Max", min: -10, max: 10, step: 0.1, default: 1, type: "scalar" }
            ]
        },
        fadeIn: {
            name: "Fade In", color: "border-sky-400", inType: "audio", outType: "audio",
            params: [
                { id: "duration", label: "Time (s)", min: 0.1, max: 10, step: 0.1, default: 2.0, type: "scalar" },
                { id: "cx1", label: "CX1", min: 0, max: 1, step: 0.01, default: 0.25, type: "scalar", hidden: true },
                { id: "cy1", label: "CY1", min: 0, max: 1, step: 0.01, default: 0.1, type: "scalar", hidden: true },
                { id: "cx2", label: "CX2", min: 0, max: 1, step: 0.01, default: 0.25, type: "scalar", hidden: true },
                { id: "cy2", label: "CY2", min: 0, max: 1, step: 0.01, default: 1.0, type: "scalar", hidden: true }
            ]
        }
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const minimapRef = useRef<HTMLDivElement>(null);
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isMinimapDragging, setIsMinimapDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const activeCableRef = useRef<{ source: string, startX: number, startY: number, sourcePort?: string, isReverse?: boolean, targetNodeId?: string, targetPortId?: string } | null>(null);
    const setActiveCable = (val: { source: string, startX: number, startY: number, sourcePort?: string, isReverse?: boolean, targetNodeId?: string, targetPortId?: string } | null) => {
        activeCableRef.current = val;
    };
    const mousePosRef = useRef({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, pendingConnection?: any } | null>(null);
    const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
    const [modVals, setModVals] = useState({ r: 0, g: 0, b: 0, bright: 0 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [marqueeRect, setMarqueeRect] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const hoveredConnectionsRef = useRef<FXConnection[] | null>(null);
    const [isCutting, _setIsCutting] = useState(false);
    const isCuttingRef = useRef(false);
    const setIsCutting = (val: boolean) => {
        isCuttingRef.current = val;
        _setIsCutting(val);
    };
    const cutterPathRef = useRef<{ x: number, y: number }[]>([]);
    const cutterCursorRef = useRef<HTMLDivElement>(null);
    const [editingParam, setEditingParam] = useState<{ nodeId: string, param: string, tempVal: string } | null>(null);
    const [clipboard, setClipboard] = useState<FXNode[]>([]);
    const isCuttingFromKeyboard = useRef(false);
    const panningPrevented = useRef(false);
    const isShiftPressedRef = useRef(false);
    const pendingCutsRef = useRef<FXConnection[]>([]);
    const [draggingParam, setDraggingParam] = useState<{ nodeId: string, paramId: string, min: number, max: number, step: number, width: number } | null>(null);
    const paramDragRef = useRef<{ startX: number, startVal: number, ctrl: boolean } | null>(null);


    // rAF Loop Update
    useEffect(() => {
        let frame: number;
        const update = () => {
            if (!paused) {
                setModVals({ ...audioEngine.avgColor });
                drawCables();

                if (cutterCursorRef.current) {
                    cutterCursorRef.current.style.transform = `translate(${mousePosRef.current.x - 6}px, ${mousePosRef.current.y - 6}px)`;
                }
            }
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [graph, panOffset, paused]);

    React.useImperativeHandle(ref, () => ({
        selectAll: () => {
            const allIds = graph.nodes
                .filter(n => n.type !== 'source' && n.type !== 'output')
                .map(n => n.id);
            setSelectedNodeIds(new Set(allIds));
        }
    }));

    const getNodeOutputs = (node: FXNode) => {
        const def = (NODE_DEFS as any)[node.type];
        if (!def) return [];
        return def.getOutputs ? def.getOutputs(node) : (def.outputs || []);
    };

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current && canvasRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                canvasRef.current.width = rect.width;
                canvasRef.current.height = rect.height;
                setViewportSize({ width: rect.width, height: rect.height });
            }
        };
        const resizeObs = new ResizeObserver(updateSize);
        if (containerRef.current) resizeObs.observe(containerRef.current);
        updateSize();
        return () => resizeObs.disconnect();
    }, []);

    useEffect(() => {
        let frame: number;
        const update = () => {
            setModVals({ ...audioEngine.avgColor });
            drawCables();

            if (cutterCursorRef.current) {
                cutterCursorRef.current.style.transform = `translate(${mousePosRef.current.x - 6}px, ${mousePosRef.current.y - 6}px)`;
            }

            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [graph, panOffset]);

    useEffect(() => {
        const handleDown = (e: KeyboardEvent) => { if (e.key === 'Shift') isShiftPressedRef.current = true; };
        const handleUp = (e: KeyboardEvent) => { if (e.key === 'Shift') isShiftPressedRef.current = false; };
        window.addEventListener('keydown', handleDown);
        window.addEventListener('keyup', handleUp);
        return () => {
            window.removeEventListener('keydown', handleDown);
            window.removeEventListener('keyup', handleUp);
        };
    }, []);

    // Split Outputs Reconciliation
    useEffect(() => {
        const sourceNode = graph.nodes.find(n => n.type === 'source');
        if (sourceNode?.params.splitOutputs === 1) {
            const firstTrackConn = graph.connections.find(c => c.source === sourceNode.id && c.sourcePort?.startsWith('track_'));
            if (firstTrackConn) {
                const mixerId = firstTrackConn.target;
                const mixerNode = graph.nodes.find(n => n.id === mixerId);
                const mixerDef = mixerNode ? (NODE_DEFS as any)[mixerNode.type] : null;

                if (mixerNode && mixerDef?.isMixer) {
                    const neededCount = trackCount;
                    let changed = false;
                    let filteredConns = [...graph.connections];

                    // Remove connections for nonexistent tracks
                    const beforeRemLen = filteredConns.length;
                    filteredConns = filteredConns.filter(c => {
                        if (c.source === sourceNode.id && c.sourcePort?.startsWith('track_')) {
                            const idx = parseInt(c.sourcePort.split('_')[1]);
                            return idx < neededCount;
                        }
                        return true;
                    });
                    if (filteredConns.length !== beforeRemLen) changed = true;

                    // Add missing track connections
                    for (let i = 0; i < neededCount; i++) {
                        const portId = `track_${i}`;
                        const hasConn = filteredConns.some(c => c.source === sourceNode.id && c.sourcePort === portId);
                        if (!hasConn) {
                            filteredConns.push({
                                source: sourceNode.id,
                                sourcePort: portId,
                                target: mixerId,
                                targetPort: `in_${i}`
                            });
                            changed = true;
                        }
                    }

                    if (changed) {
                        onUpdateGraph({ ...graph, connections: filteredConns });
                    }
                }
            }
        }
    }, [trackCount, graph.nodes.length, graph.connections.length]);

    const getDrivenValue = (nodeId: string, paramId: string): number | null => {
        const conn = graph.connections.find(c => c.target === nodeId && c.targetPort === (paramId === '' ? undefined : paramId));
        if (!conn) return null;

        const srcNode = graph.nodes.find(n => n.id === conn.source);
        if (!srcNode) return null;

        let val = 0;
        if (srcNode.type === 'float' || srcNode.type === 'int') {
            val = srcNode.params.val ?? 0;
        } else if (srcNode.type === 'lfo') {
            const rate = srcNode.params.rate ?? 1;
            const amp = srcNode.params.amp ?? 1;
            const phase_offset = srcNode.params.phase ?? 0;
            const type = Math.round(srcNode.params.type ?? 0);
            const time = Date.now() / 1000;
            // Use relative time for LFO sync
            const lfoTime = Math.max(0, time - audioEngine.lfoStartTime);
            const pTime = (lfoTime * rate) + phase_offset;
            const p = pTime % 1;

            if (type === 0) val = Math.sin(pTime * Math.PI * 2);
            else if (type === 1) val = (Math.abs((p * 2) - 1) * 2 - 1);
            else if (type === 2) val = (p * 2) - 1;
            else if (type === 3) val = p > 0.5 ? 1 : -1;

            if (srcNode.params.normalize) {
                val = (val + 1) / 2;
            }

            val *= amp;
        } else if (srcNode.type === 'setRange') {
            const inputConn = graph.connections.find(c => c.target === srcNode.id && !c.targetPort);
            let inputVal = 0;
            if (inputConn) {
                // Recursive lookup for input val
                const recursiveVal = getDrivenValue(srcNode.id, '');
                // Wait, getDrivenValue needs a paramId. If targetPort is null, it's the main input.
                // Let's adjust getDrivenValue to handle main input.
                inputVal = recursiveVal ?? 0;
            }
            const { oldMin, oldMax, newMin, newMax } = srcNode.params;
            const range = (oldMax ?? 1) - (oldMin ?? -1);
            const pct = range === 0 ? 0 : ((inputVal - (oldMin ?? -1)) / range);
            val = (newMin ?? 0) + pct * ((newMax ?? 1) - (newMin ?? 0));
        } else {
            return null;
        }

        // Clamp to parameter range if possible
        const dstDef = (NODE_DEFS as any)[graph.nodes.find(n => n.id === nodeId)?.type || ''];
        if (dstDef) {
            const pDef = dstDef.params.find((p: any) => p.id === paramId);
            if (pDef) {
                val = Math.max(pDef.min, Math.min(pDef.max, val));
            }
        }

        return val;
    };


    const drawCables = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(panOffset.x, panOffset.y);

        const worldMouseX = mousePosRef.current.x - panOffset.x;
        const worldMouseY = mousePosRef.current.y - panOffset.y;

        let hitX = worldMouseX;
        let hitY = worldMouseY;

        if (draggingNode) {
            const dragNodeData = graph.nodes.find(n => n.id === draggingNode);
            if (dragNodeData) {
                hitX = dragNodeData.x;
                hitY = dragNodeData.y + 55;
            }
        }

        const newHovered: FXConnection[] = [];
        let singleNearest: FXConnection | null = null;
        let singleMinDist = 20;

        graph.connections.forEach(conn => {
            const srcNode = graph.nodes.find(n => n.id === conn.source);
            const dstNode = graph.nodes.find(n => n.id === conn.target);
            if (!srcNode || !dstNode) return;

            const srcDef = (NODE_DEFS as any)[srcNode.type];
            const dstDef = (NODE_DEFS as any)[dstNode.type];
            const x1 = srcNode.x + NODE_WIDTH;
            const x2 = dstNode.x;

            let y1 = srcNode.y + 55;
            const srcOutputs = getNodeOutputs(srcNode);
            if (conn.sourcePort && srcOutputs.length > 0) {
                const outIdx = srcOutputs.findIndex((o: any) => o.id === conn.sourcePort);
                if (outIdx !== -1) y1 = srcNode.y + 55 + outIdx * 36;
            }

            let targetY = dstNode.y + 55;
            let targetType = dstDef.inType || 'audio';
            if (conn.targetPort) {
                if (dstDef.isMixer && conn.targetPort.startsWith('in_')) {
                    const inIdx = parseInt(conn.targetPort.split('_')[1]);
                    targetY = dstNode.y + 55 + inIdx * 36;
                } else {
                    const pIdx = dstDef.params.findIndex((p: any) => p.id === conn.targetPort);
                    if (pIdx !== -1) {
                        // Math: 45px header + 12px padding + (idx * 44px spacing) + 16px (half port height)
                        targetY = dstNode.y + 73 + pIdx * 44;
                        targetType = dstDef.params[pIdx].type;
                    }
                }
            }

            const path = new Path2D();
            path.moveTo(x1, y1);
            const cp1x = x1 + (x2 - x1) / 2;
            const cp2x = x1 + (x2 - x1) / 2;
            path.bezierCurveTo(cp1x, y1, cp2x, targetY, x2, targetY);

            // Hit testing for highlight
            ctx.lineWidth = 15; // Hit area
            if (ctx.isPointInStroke(path, hitX, hitY)) {
                if (isShiftPressedRef.current) {
                    newHovered.push(conn);
                } else {
                    // Simple distance check after isPointInStroke to find nearest
                    const dx = hitX - (x1 + x2) / 2;
                    const dy = hitY - (y1 + targetY) / 2;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < singleMinDist) {
                        singleMinDist = d;
                        singleNearest = conn;
                    }
                }
            }

            // Cutter hit testing (Delayed Commitment)
            if (isCuttingRef.current && cutterPathRef.current.length > 1) {
                const pathArr = cutterPathRef.current;

                // Check the last few segments to ensure we don't miss fast movements
                // or if the frame rate lagged slightly behind mouse moves
                const CHECK_SEGMENTS = 10;
                const startIndex = Math.max(1, pathArr.length - CHECK_SEGMENTS);

                let intersected = false;

                // We need to set transform to identity for efficient hit testing 
                // (assuming path coords are world coords and we pass world coords to isPointInStroke)
                // Actually, I already set transform to identity above for hover check.
                // But let's be safe and assume we are in IDENTITY state here as planned.

                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);

                for (let j = startIndex; j < pathArr.length; j++) {
                    const p1 = pathArr[j - 1];
                    const p2 = pathArr[j];

                    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                    const SAMPLES = Math.max(2, Math.ceil(dist / 4)); // Sample every 4 pixels

                    for (let i = 0; i <= SAMPLES; i++) {
                        const t = i / SAMPLES;
                        const sx = p1.x + (p2.x - p1.x) * t;
                        const sy = p1.y + (p2.y - p1.y) * t;

                        ctx.lineWidth = 15; // Generous cutter thickness
                        if (ctx.isPointInStroke(path, sx, sy)) {
                            intersected = true;
                            break;
                        }
                    }
                    if (intersected) break;
                }
                ctx.restore();
                if (intersected) {
                    if (!pendingCutsRef.current.some(pc =>
                        pc.source === conn.source &&
                        pc.target === conn.target &&
                        pc.targetPort === conn.targetPort &&
                        pc.sourcePort === conn.sourcePort
                    )) {
                        pendingCutsRef.current = [...pendingCutsRef.current, conn];
                    }
                }
            }

            // Draw
            const srcType = srcDef.outType || 'audio';
            const isCompatible = srcType === targetType || (srcType === 'int' && targetType === 'scalar');
            const typeColors = { audio: '#6366f1', scalar: '#0ea5e9', int: '#10b981' };

            const isPendingCut = pendingCutsRef.current.some(pc =>
                pc.source === conn.source &&
                pc.target === conn.target &&
                pc.targetPort === conn.targetPort &&
                pc.sourcePort === conn.sourcePort
            );

            const isHovered = isShiftPressedRef.current
                ? newHovered.includes(conn)
                : (singleNearest === conn);

            ctx.save();
            ctx.strokeStyle = isPendingCut ? '#ef4444' : (isHovered ? (typeColors[srcType as keyof typeof typeColors] || '#6366f1') : '#334155');
            ctx.lineWidth = (isHovered || isPendingCut) ? 6 : 3;
            if (isHovered || isPendingCut) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = ctx.strokeStyle;
            }
            if (!isCompatible) {
                ctx.setLineDash([5, 5]);
                ctx.globalAlpha = 0.5;
            }
            ctx.stroke(path);

            if (!isCompatible) {
                // ... compatible slash drawing ...
            }
            ctx.restore();
        });

        hoveredConnectionsRef.current = isShiftPressedRef.current ? (newHovered.length > 0 ? newHovered : null) : (singleNearest ? [singleNearest] : null);

        const cable = activeCableRef.current;
        if (cable) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const worldX = mousePosRef.current.x - panOffset.x;
            const worldY = mousePosRef.current.y - panOffset.y;
            ctx.moveTo(cable.startX, cable.startY);
            const cp1x = cable.startX + (worldX - cable.startX) / 2;
            const cp2x = cable.startX + (worldX - cable.startX) / 2;
            ctx.bezierCurveTo(cp1x, cable.startY, cp2x, worldY, worldX, worldY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (isCuttingRef.current && cutterPathRef.current.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(cutterPathRef.current[0].x, cutterPathRef.current[0].y);
            cutterPathRef.current.forEach(pt => ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }, [graph, panOffset]);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                canvasRef.current.width = w;
                canvasRef.current.height = h;
                setViewportSize({ width: w, height: h });
                drawCables();
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawCables]);

    const frameGraph = useCallback(() => {
        if (graph.nodes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        graph.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_WIDTH);
            maxY = Math.max(maxY, n.y + 150);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        setPanOffset({
            x: -(centerX - viewportSize.width / 2),
            y: -(centerY - viewportSize.height / 2)
        });
    }, [graph.nodes, viewportSize]);

    const layoutNodes = useCallback(() => {
        if (graph.nodes.length === 0) return;

        // Simple linear layout: Start with 'src', then other nodes, end with 'out'
        const sorted = [...graph.nodes];
        sorted.sort((a, b) => {
            if (a.id === 'src') return -1;
            if (b.id === 'src') return 1;
            if (a.id === 'out') return 1;
            if (b.id === 'out') return -1;
            return 0;
        });

        const padding = 100;
        const newNodes = sorted.map((n, i) => ({
            ...n,
            x: i * (NODE_WIDTH + padding),
            y: 0
        }));

        onCommitGraph({ ...graph, nodes: newNodes });
        // Frame will happen manually after state update
        setTimeout(frameGraph, 50);
    }, [graph, onCommitGraph, frameGraph]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement) return;
            // Allow typing in inputs (handled by capturing logic, but double check)
            if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;

            // DELETE
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.size > 0) {
                    const protectedIds = new Set(['src', 'out']);
                    const nodesToDelete = Array.from(selectedNodeIds).filter(id => !protectedIds.has(id));

                    if (nodesToDelete.length > 0) {
                        const newConnections = healConnections(nodesToDelete, graph);
                        const newNodes = graph.nodes.filter(n => !selectedNodeIds.has(n.id) || protectedIds.has(n.id));

                        onCommitGraph({ ...graph, nodes: newNodes, connections: newConnections });
                        setSelectedNodeIds(new Set());
                    }
                }
            }

            // CLIPBOARD
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'c') {
                    const nodesToCopy = graph.nodes.filter(n => selectedNodeIds.has(n.id));
                    if (nodesToCopy.length > 0) {
                        setClipboard(nodesToCopy);
                    }
                } else if (e.key === 'x') {
                    const nodesToCopy = graph.nodes.filter(n => selectedNodeIds.has(n.id));
                    if (nodesToCopy.length > 0) {
                        setClipboard(nodesToCopy);
                        const protectedIds = new Set(['src', 'out']);
                        const newNodes = graph.nodes.filter(n => !selectedNodeIds.has(n.id) || protectedIds.has(n.id));
                        const newConnections = graph.connections.filter(c =>
                            (!selectedNodeIds.has(c.source) || protectedIds.has(c.source)) &&
                            (!selectedNodeIds.has(c.target) || protectedIds.has(c.target))
                        );
                        onCommitGraph({ ...graph, nodes: newNodes, connections: newConnections });
                        setSelectedNodeIds(new Set());
                    }
                } else if (e.key === 'v') {
                    if (clipboard.length > 0) {
                        const newNodes: FXNode[] = [];
                        const idMap = new Map<string, string>();

                        let minX = Infinity, minY = Infinity;
                        clipboard.forEach(n => {
                            minX = Math.min(minX, n.x);
                            minY = Math.min(minY, n.y);
                        });

                        // Paste at mouse position (transformed)
                        const pasteX = (mousePosRef.current.x - panOffset.x);
                        const pasteY = (mousePosRef.current.y - panOffset.y);

                        clipboard.forEach(n => {
                            const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                            idMap.set(n.id, newId);
                            newNodes.push({
                                ...n,
                                id: newId,
                                x: n.x - minX + pasteX,
                                y: n.y - minY + pasteY
                            });
                        });

                        onCommitGraph({ ...graph, nodes: [...graph.nodes, ...newNodes] });
                        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
                    }
                } else if (e.key === 'd') {
                    e.preventDefault();
                    if (selectedNodeIds.size > 0) {
                        const nodesToCopy = graph.nodes.filter(n => selectedNodeIds.has(n.id));
                        const newNodes: FXNode[] = [];
                        nodesToCopy.forEach(n => {
                            const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                            newNodes.push({
                                ...n,
                                id: newId,
                                x: n.x + 20,
                                y: n.y + 20
                            });
                        });
                        onCommitGraph({ ...graph, nodes: [...graph.nodes, ...newNodes] });
                        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
                    }
                } else if (e.key === 'm' || e.key === 'p') {
                    // Toggle Bypass
                    e.preventDefault();
                    if (selectedNodeIds.size > 0) {
                        const newNodes = graph.nodes.map(n => {
                            if (selectedNodeIds.has(n.id)) {
                                return { ...n, bypass: !n.bypass };
                            }
                            return n;
                        });
                        onUpdateGraph({ ...graph, nodes: newNodes });
                    }
                }
            }

            if (e.key.toLowerCase() === 'f') frameGraph();
            if (e.key.toLowerCase() === 'l') layoutNodes();
            if (e.key.toLowerCase() === 'y') {
                setIsCutting(true);
                isCuttingFromKeyboard.current = true;
            }

            // DYNAMIC SHIFT DISCONNECT
            if (e.key === 'Shift' && draggingNode) {
                const nodeId = draggingNode;
                const incoming = graph.connections.filter(c => c.target === nodeId);
                const outgoing = graph.connections.filter(c => c.source === nodeId);

                if (incoming.length > 0 || outgoing.length > 0) {
                    let newConns = graph.connections.filter(c => c.source !== nodeId && c.target !== nodeId);
                    // Only bridge if it's an audio connection (no targetPort)
                    incoming.filter(inc => !inc.targetPort).forEach(inc => {
                        outgoing.forEach(out => {
                            if (!newConns.some(c => c.source === inc.source && c.target === out.target && c.targetPort === out.targetPort)) {
                                newConns.push({
                                    source: inc.source,
                                    sourcePort: inc.sourcePort,
                                    target: out.target,
                                    targetPort: out.targetPort
                                });
                            }
                        });
                    });
                    onCommitGraph({ ...graph, connections: newConns });
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'y') {
                setIsCutting(false);
                isCuttingFromKeyboard.current = false;
                cutterPathRef.current = [];
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [frameGraph, layoutNodes, draggingNode, graph, onCommitGraph, clipboard, panOffset, selectedNodeIds, onUpdateGraph]);

    useEffect(() => {
        drawCables();
    }, [drawCables]);

    const handleMouseDownPort = (e: React.MouseEvent, nodeId: string, portId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setNodeContextMenu(null);

        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return;
        let startY = node.y + 55;

        const outputs = getNodeOutputs(node);
        if (portId && outputs.length > 0) {
            const outIdx = outputs.findIndex((o: any) => o.id === portId);
            if (outIdx !== -1) {
                startY = node.y + 55 + outIdx * 36;
            }
        }

        setActiveCable({
            source: nodeId,
            startX: node.x + NODE_WIDTH,
            startY,
            sourcePort: portId
        });
    };

    const handleMouseDownInputPort = (e: React.MouseEvent, nodeId: string, portId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setNodeContextMenu(null);

        // Check for existing connection to extract
        const existingConn = graph.connections.find(c => c.target === nodeId && (c.targetPort === portId || (!c.targetPort && !portId)));
        if (existingConn) {
            const srcNode = graph.nodes.find(n => n.id === existingConn.source);
            if (srcNode) {
                let startY = srcNode.y + 55;
                const srcOutputs = getNodeOutputs(srcNode);
                if (existingConn.sourcePort && srcOutputs.length > 0) {
                    const outIdx = srcOutputs.findIndex((o: any) => o.id === existingConn.sourcePort);
                    if (outIdx !== -1) {
                        startY = srcNode.y + 55 + outIdx * 36;
                    }
                }

                setActiveCable({
                    source: existingConn.source,
                    startX: srcNode.x + NODE_WIDTH,
                    startY,
                    sourcePort: existingConn.sourcePort
                });
                onUpdateGraph({
                    ...graph,
                    connections: graph.connections.filter(c => c !== existingConn)
                });
                return;
            }
        }

        // Otherwise, start REVERSE drag (Input -> Mouse)
        const rect = containerRef.current?.getBoundingClientRect();
        const startY = (e.clientY - (rect?.top || 0) - panOffset.y);
        const startX = (e.clientX - (rect?.left || 0) - panOffset.x);

        setActiveCable({
            source: "reversed",
            startX: startX,
            startY: startY,
            isReverse: true,
            targetNodeId: nodeId,
            targetPortId: portId
        });
    };

    const handleMouseUpPort = (nodeId: string, portId?: string) => {
        const cable = activeCableRef.current;
        if (!cable) return;
        if (cable.source === nodeId) {
            setActiveCable(null);
            return;
        }

        // Logic for connecting source -> target
        const sourceNode = graph.nodes.find(n => n.id === cable.source);
        const targetNode = graph.nodes.find(n => n.id === nodeId);
        if (!sourceNode || !targetNode) {
            setActiveCable(null);
            return;
        }

        // Validation: No cycles, same node, etc.
        if (sourceNode.id === targetNode.id) {
            setActiveCable(null);
            return;
        }

        const finalTargetPort = portId;

        // Strict Input Constraint: Remove any existing connection to this specific target port
        // Unless it's a Mixer input which might support multiple? No, Mixer inputs are separate ports (in_0, in_1).
        // So yes, strictly remove existing connections to this port.

        const otherConnections = graph.connections.filter(c => !(c.target === nodeId && c.targetPort === finalTargetPort));
        const newConnections = [...otherConnections, { source: cable.source, target: nodeId, sourcePort: cable.sourcePort, targetPort: finalTargetPort }];

        // Update Mixer Dynamic Ports (No state update needed, purely derived)
        onCommitGraph({ ...graph, connections: newConnections });
        setActiveCable(null);
    };

    const handleParamMouseDown = (e: React.MouseEvent, nodeId: string, pDef: any) => {
        if (getDrivenValue(nodeId, pDef.id) !== null) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const node = graph.nodes.find(n => n.id === nodeId);
        const startVal = node?.params[pDef.id] ?? pDef.default;

        setDraggingParam({
            nodeId,
            paramId: pDef.id,
            min: pDef.min,
            max: pDef.max,
            step: pDef.step,
            width: rect.width
        });
        paramDragRef.current = { startX: e.clientX, startVal, ctrl: e.ctrlKey };
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setNodeContextMenu(null);
        setContextMenu(null);

        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const worldX = (e.clientX - rect.left) - panOffset.x;
        const worldY = (e.clientY - rect.top) - panOffset.y;

        if (e.shiftKey) {
            // SHIFT-DISCONNECT (Extraction)
            const incoming = graph.connections.filter(c => c.target === nodeId);
            const outgoing = graph.connections.filter(c => c.source === nodeId);
            let newConns = graph.connections.filter(c => c.source !== nodeId && c.target !== nodeId);

            incoming.filter(inc => !inc.targetPort).forEach(inc => {
                outgoing.forEach(out => {
                    if (!newConns.some(c => c.source === inc.source && c.target === out.target)) {
                        newConns.push({ source: inc.source, target: out.target });
                    }
                });
            });
            onUpdateGraph({ ...graph, connections: newConns });
        }

        setDraggingNode(nodeId);
        setNodeDragOffset({ x: worldX - node.x, y: worldY - node.y });

        if (!selectedNodeIds.has(nodeId)) {
            setSelectedNodeIds(new Set([nodeId]));
        }
    };


    // checkCutterIntersections removed (handled in rAF loop)

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        mousePosRef.current = { x: screenX, y: screenY };

        const worldX = screenX - panOffset.x;
        const worldY = screenY - panOffset.y;

        if (draggingParam) {
            if (!paramDragRef.current || paramDragRef.current.ctrl !== e.ctrlKey) {
                const node = graph.nodes.find(n => n.id === draggingParam.nodeId);
                const currentVal = node?.params[draggingParam.paramId] ?? (draggingParam.min + draggingParam.max) / 2;
                paramDragRef.current = { startX: e.clientX, startVal: currentVal, ctrl: e.ctrlKey };
            }

            const { startX, startVal } = paramDragRef.current;
            const { nodeId, paramId, min, max, step, width } = draggingParam;
            const deltaX = e.clientX - startX;
            const sensitivity = e.ctrlKey ? 0.1 : 1.0;
            const range = max - min;

            let newVal = startVal + (deltaX / width) * range * sensitivity;
            newVal = Math.max(min, Math.min(max, newVal));

            if (step > 0) {
                newVal = Math.round(newVal / step) * step;
            }

            // Magnetic snap for LFO rate
            const node = graph.nodes.find(n => n.id === nodeId);
            if (node?.type === 'lfo' && paramId === 'rate' && !e.shiftKey) {
                const SNAP_VALUES = [0.125, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0];
                let closest = SNAP_VALUES[0];
                let minDiff = Infinity;
                for (const s of SNAP_VALUES) {
                    const diff = Math.abs(newVal - s);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = s;
                    }
                }
                if (minDiff < 0.25) newVal = closest;
            }

            updateParam(nodeId, paramId, newVal);
        } else if (draggingNode) {
            const node = graph.nodes.find(n => n.id === draggingNode);
            if (!node) return;

            const dx = worldX - nodeDragOffset.x - node.x;
            const dy = worldY - nodeDragOffset.y - node.y;

            const newNodes = graph.nodes.map(n => {
                if (n.id === draggingNode) {
                    return { ...n, x: worldX - nodeDragOffset.x, y: worldY - nodeDragOffset.y };
                }
                if (selectedNodeIds.has(n.id)) {
                    return { ...n, x: n.x + dx, y: n.y + dy };
                }
                return n;
            });
            onUpdateGraph({ ...graph, nodes: newNodes });
        } else if (isPanning && !isCuttingRef.current) {
            setPanOffset(prev => ({
                x: prev.x + (e.clientX - lastMousePos.x),
                y: prev.y + (e.clientY - lastMousePos.y)
            }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        } else if (isSelecting && marqueeRect) {
            setMarqueeRect(prev => prev ? { ...prev, endX: screenX - panOffset.x, endY: screenY - panOffset.y } : null);
            const m = {
                x1: Math.min(marqueeRect.startX, screenX - panOffset.x),
                y1: Math.min(marqueeRect.startY, screenY - panOffset.y),
                x2: Math.max(marqueeRect.startX, screenX - panOffset.x),
                y2: Math.max(marqueeRect.startY, screenY - panOffset.y)
            };
            const newSelected = new Set<string>();
            graph.nodes.forEach(n => {
                if (!(n.x + NODE_WIDTH < m.x1 || n.x > m.x2 || n.y + 150 < m.y1 || n.y > m.y2)) {
                    newSelected.add(n.id);
                }
            });
            setSelectedNodeIds(newSelected);
        } else if (isCuttingRef.current && cutterPathRef.current.length > 0) {
            const newPath = [...cutterPathRef.current, { x: worldX, y: worldY }];
            cutterPathRef.current = newPath;
        }
    };

    const handleContainerMouseDown = (e: React.MouseEvent) => {
        if (contextMenu) setContextMenu(null);
        // Assuming nodeContextMenu is defined elsewhere or not relevant to this change
        // if (nodeContextMenu) setNodeContextMenu(null); 

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldX = e.clientX - rect.left - panOffset.x;
        const worldY = e.clientY - rect.top - panOffset.y;

        if (e.button === 0) {
            e.preventDefault();
            if (isCuttingRef.current) {
                cutterPathRef.current = [{ x: worldX, y: worldY }];
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                setIsSelecting(true);
                setMarqueeRect({ startX: worldX, startY: worldY, endX: worldX, endY: worldY });
                setSelectedNodeIds(new Set());
            } else {
                setIsPanning(true);
                setLastMousePos({ x: e.clientX, y: e.clientY });
                setSelectedNodeIds(new Set());
            }
        } else if (e.button === 2) {
            if (e.ctrlKey) {
                e.preventDefault();
                setIsCutting(true);
                cutterPathRef.current = [{ x: worldX, y: worldY }];
                pendingCutsRef.current = []; // Clear previous pending cuts
            }
        } else {
            // Close context menus when clicking on background
            setNodeContextMenu(null);
            setContextMenu(null);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        // Reverse Wiring: Drop on empty space -> Open Context Menu
        if (activeCableRef.current?.isReverse) {
            const cable = activeCableRef.current;
            // If we are over a port, handleMouseUpPort will handle it (or should). 
            // But handleMouseUp generally fires on container if not stopped.
            // Let's assume valid port connection stops propagation or clears activeCable.

            // If we are here, we likely dropped on empty space
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                setContextMenu({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    pendingConnection: {
                        targetNodeId: cable.targetNodeId,
                        targetPortId: cable.targetPortId
                    }
                });
            }
            setActiveCable(null);
            return;
        }

        const hcs = hoveredConnectionsRef.current;
        if (draggingNode && hcs && hcs.length > 0) {
            const draggedNode = graph.nodes.find(n => n.id === draggingNode);
            if (!draggedNode) return;

            let currentConns = [...graph.connections];
            let currentNodes = [...graph.nodes];
            let nextId = graph.nextId || (currentNodes.length + 1);

            // If we have multiple hovered connections, we need to clone the node
            if (hcs.length > 1) {
                const connsToReplace = [...hcs];
                currentNodes = currentNodes.filter(n => n.id !== draggingNode);
                currentConns = currentConns.filter(c => !connsToReplace.some(hc => hc.source === c.source && hc.target === c.target && hc.sourcePort === c.sourcePort && hc.targetPort === c.targetPort));

                connsToReplace.forEach((conn, idx) => {
                    const cloneId = `${draggedNode.type}_${nextId++}`;
                    const spacing = 40;
                    const offset = (idx - (hcs.length - 1) / 2) * spacing;

                    const newNode: FXNode = {
                        ...draggedNode,
                        id: cloneId,
                        y: draggedNode.y + offset
                    };
                    currentNodes.push(newNode);

                    // Re-route connections
                    currentConns = currentConns.filter(c => !(c.source === conn.source && c.target === conn.target && c.sourcePort === conn.sourcePort && c.targetPort === conn.targetPort));
                    currentConns.push({ source: conn.source, sourcePort: conn.sourcePort, target: cloneId });
                    currentConns.push({ source: cloneId, target: conn.target, targetPort: conn.targetPort });
                });
            } else {
                // Single insertion
                const conn = hcs[0];
                currentConns = currentConns.filter(c => !(c.source === conn.source && c.target === conn.target && c.sourcePort === conn.sourcePort && c.targetPort === conn.targetPort));

                if (!currentConns.some(c => c.source === conn.source && c.sourcePort === conn.sourcePort && c.target === draggingNode)) {
                    currentConns.push({ source: conn.source, sourcePort: conn.sourcePort, target: draggingNode });
                }
                if (!currentConns.some(c => c.source === draggingNode && c.target === conn.target && c.targetPort === conn.targetPort)) {
                    currentConns.push({ source: draggingNode, target: conn.target, targetPort: conn.targetPort });
                }
            }

            // Downstream push logic
            const target = hcs[0].target;
            const pushedNodeIds = new Set<string>();
            const getDownstream = (id: string) => {
                if (pushedNodeIds.has(id)) return;
                pushedNodeIds.add(id);
                currentConns.filter(c => c.source === id).forEach(c => getDownstream(c.target));
            };
            getDownstream(target);

            const downstreamTargetNode = currentNodes.find(n => n.id === target);
            let pushDelta = 0;
            if (downstreamTargetNode) {
                const requiredX = draggedNode.x + NODE_WIDTH + NODE_PADDING;
                pushDelta = Math.max(0, requiredX - downstreamTargetNode.x);
            }

            if (pushDelta > 0) {
                currentNodes = currentNodes.map(n => {
                    if (pushedNodeIds.has(n.id)) {
                        return { ...n, x: n.x + pushDelta };
                    }
                    return n;
                });
            }

            onCommitGraph({ ...graph, connections: currentConns, nodes: currentNodes, nextId });
        } else if (draggingNode) {
            onCommitGraph(graph);
        }

        if (draggingParam) {
            onCommitGraph(graph);
        }
        setDraggingParam(null);
        paramDragRef.current = null;
        setDraggingNode(null);
        setActiveCable(null);
        setIsPanning(false);
        setIsMinimapDragging(false);
        setIsSelecting(false);
        setMarqueeRect(null);
        hoveredConnectionsRef.current = null;
        if (isCuttingRef.current) {
            panningPrevented.current = true;

            // COMMIT CUTS
            if (pendingCutsRef.current.length > 0) {
                const toCut = pendingCutsRef.current;
                onCommitGraph({
                    ...graph,
                    connections: graph.connections.filter(c => !toCut.some(pc =>
                        pc.source === c.source &&
                        pc.target === c.target &&
                        pc.targetPort === c.targetPort &&
                        pc.sourcePort === c.sourcePort
                    ))
                });
                pendingCutsRef.current = [];
            }

            cutterPathRef.current = [];
        }
        if (!isCuttingFromKeyboard.current) {
            setIsCutting(false);
        }
        setIsMinimapDragging(false);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (panningPrevented.current || e.ctrlKey) {
            panningPrevented.current = false;
            return;
        }
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const addNode = (type: keyof typeof NODE_DEFS) => {
        if (!contextMenu || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const id = `node_${Date.now()}`;
        const def = (NODE_DEFS as any)[type];
        const params: Record<string, number> = {};
        if (def.params) {
            def.params.forEach((p: any) => params[p.id] = p.default);
        }

        const newNode: FXNode = {
            id,
            type: type as any,
            x: (contextMenu.x - rect.left) - panOffset.x,
            y: (contextMenu.y - rect.top) - panOffset.y,
            params
        };

        let initialConnections = [...graph.connections];
        if (contextMenu.pendingConnection) {
            // Reverse Wiring: New Node's Output -> Pending Connection's Target (which caused the drag)
            // But wait, the drag started from an INPUT port.
            // So we want: New Node [Output] ---> [Input] Target Node (Source of drag)

            // Find a suitable output port on the new node
            // defaultOutput was unused. 
            // Actually best to look at getOutputs logic if available or just assume 'main'/'out'
            // For most nodes, output is implicit or has an 'out' port.
            // Let's assume standard 'audio' connection from 'main' or implicit source.

            // If the target port expects 'scalar', try to find a scalar output?
            // For now, let's just make a default connection from the new node.

            // Note: `source` in connection object is the outputting node.

            initialConnections.push({
                source: id,
                sourcePort: 'main', // Most nodes use 'main' or undefined. Let's start with 'main' and see if it works for standard FX.
                // Actually most FX don't specify sourcePort, or use 'main'.
                // Let's check a standard connection. 'source' usually has no sourcePort for default output?
                // Looking at standard behavior:
                // getOutputs returns [{id: 'main', ...}] for sequencer.
                // For FX nodes like Delay, they have ONE output usually.
                // Let's leave sourcePort undefined if it's a standard single-output FX?
                // Or 'main'? 
                // Let's assume undefined for single-output FX, or 'main' if that's the convention.
                // The renderer uses `getNodeOutputs`. If that returns nothing, it assumes pass-through? No.
                // Let's look at `getNodeOutputs` again.
                // FX nodes like 'delay' have `outType: 'audio'`. 
                // render loop: `const outputs = getNodeOutputs(node)`.
                // `getNodeOutputs` implementation: `def.outType ? [{id: 'main', ...}] : ...`?
                // Let's check `getNodeOutputs` implementation.

                target: contextMenu.pendingConnection.targetNodeId,
                targetPort: contextMenu.pendingConnection.targetPortId
            });
        }

        onCommitGraph({
            ...graph,
            nodes: [...graph.nodes, newNode],
            connections: initialConnections,
            nextId: (graph.nextId || 1) + 1
        });
        setContextMenu(null);
    };

    const healConnections = (nodesToDelete: string[], graphState: FXGraph) => {
        let currentConns = [...graphState.connections];

        nodesToDelete.forEach(nodeId => {
            const incoming = currentConns.filter(c => c.target === nodeId);
            const outgoing = currentConns.filter(c => c.source === nodeId);

            // AUTO-HEAL: Bridge inputs to outputs
            // Only strictly if it's an audio-to-audio path (no targetPort usually)
            // But let's be generous: if I delete a node, I want the 'main' flow to persist.

            incoming.forEach(inc => {
                // Determine if 'inc' is an audio connection (no targetPort or known audio port)
                // const nodeDef = (NODE_DEFS as any)[graphState.nodes.find(n => n.id === nodeId)?.type || ''];
                // If the connection was into a parameter, don't bridge it to audio output
                if (inc.targetPort && !inc.targetPort.startsWith('in_')) return;

                outgoing.forEach(out => {
                    // Only bridge if we aren't creating a duplicate connection
                    if (!currentConns.some(c => c.source === inc.source && c.target === out.target && c.targetPort === out.targetPort)) {
                        // Check for port compatibility/existence
                        // If 'out' came from 'main' (or undefined sourcePort) of the deleted node, it's a candidate
                        // If 'out' came from a split output (track_0), maybe we shouldn't bridge a main input to it? 
                        // Yes, usually we bridge main-in to main-out.

                        const isMainOut = !out.sourcePort || out.sourcePort === 'main';
                        if (isMainOut) {
                            currentConns.push({
                                source: inc.source,
                                sourcePort: inc.sourcePort,
                                target: out.target,
                                targetPort: out.targetPort
                            });
                        }
                    }
                });
            });

            // Remove connections involving deleted node
            currentConns = currentConns.filter(c => c.source !== nodeId && c.target !== nodeId);
        });

        return currentConns;
    }

    const deleteNode = (nodeId: string) => {
        if (nodeId === 'src' || nodeId === 'out') return;

        const newConnections = healConnections([nodeId], graph);
        const newNodes = graph.nodes.filter(n => n.id !== nodeId);

        onCommitGraph({ ...graph, nodes: newNodes, connections: newConnections });
    };

    const updateParam = (nodeId: string, param: string, val: number) => {
        const newNodes = graph.nodes.map(n => {
            if (n.id === nodeId) return { ...n, params: { ...n.params, [param]: val } };
            return n;
        });
        onUpdateGraph({ ...graph, nodes: newNodes });
    };

    const updateModulation = (nodeId: string, param: string, source: 'red' | 'green' | 'blue' | 'bright' | 'none') => {
        const newNodes = graph.nodes.map(n => {
            if (n.id === nodeId) {
                return { ...n, modulations: { ...(n.modulations || {}), [param]: source } };
            }
            return n;
        });
        onCommitGraph({ ...graph, nodes: newNodes });
    };

    const handleSplitOutputs = (nodeId: string) => {
        // ... (No logic needed to change here, but function was in the range)
        const sourceNode = graph.nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;
        const mixerId = `mixer_${Date.now()}`;
        const mixerNode: FXNode = {
            id: mixerId,
            type: 'mixer',
            x: sourceNode.x + NODE_WIDTH + 100,
            y: sourceNode.y,
            params: {}
        };
        const mainConn = graph.connections.find(c => c.source === nodeId && (c.sourcePort === 'main' || !c.sourcePort));
        let newConns = graph.connections.filter(c => c !== mainConn);
        for (let i = 0; i < (trackCount || 1); i++) {
            newConns.push({ source: nodeId, sourcePort: `track_${i}`, target: mixerId, targetPort: `in_${i}` });
        }
        if (mainConn) {
            newConns.push({ source: mixerId, target: mainConn.target, targetPort: mainConn.targetPort });
        }
        const newNodes = graph.nodes.map(n => {
            if (n.id === nodeId) return { ...n, params: { ...n.params, splitOutputs: 1 } };
            if (n.x > sourceNode.x + 50 && n.id !== mixerId) return { ...n, x: n.x + NODE_WIDTH + 100 };
            return n;
        }).concat(mixerNode);
        onCommitGraph({ ...graph, nodes: newNodes, connections: newConns, nextId: (graph.nextId || 1) + 2 });
        setNodeContextMenu(null);
    };

    const handleMergeOutputs = (nodeId: string) => {
        const sourceNode = graph.nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;
        const firstTrackConn = graph.connections.find(c => c.source === nodeId && c.sourcePort?.startsWith('track_'));
        if (!firstTrackConn) return;
        const mixerId = firstTrackConn.target;
        // ...
        const mixerOutConn = graph.connections.find(c => c.source === mixerId);
        const newConns = graph.connections.filter(c => c.source !== nodeId && c.source !== mixerId && c.target !== mixerId);
        if (mixerOutConn) {
            newConns.push({ source: nodeId, sourcePort: 'main', target: mixerOutConn.target, targetPort: mixerOutConn.targetPort });
        }
        const newNodes = graph.nodes.filter(n => n.id !== mixerId).map(n => {
            if (n.id === nodeId) return { ...n, params: { ...n.params, splitOutputs: 0 } };
            return n;
        });
        onCommitGraph({ ...graph, nodes: newNodes, connections: newConns });
        setNodeContextMenu(null);
    };

    const getGraphBounds = () => {
        if (graph.nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        graph.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_WIDTH);
            maxY = Math.max(maxY, n.y + 150);
        });
        const pad = 500;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    };

    const bounds = getGraphBounds();
    const isOffscreen = graph.nodes.some(n => {
        const screenX = n.x + panOffset.x;
        const screenY = n.y + panOffset.y;
        return screenX < 0 || screenX > viewportSize.width - NODE_WIDTH || screenY < 0 || screenY > viewportSize.height - 150;
    });

    const handleMinimapInteraction = (clientX: number, clientY: number) => {
        if (!minimapRef.current) return;
        const mmRect = minimapRef.current.getBoundingClientRect();
        const localX = Math.max(0, Math.min(mmRect.width, clientX - mmRect.left));
        const localY = Math.max(0, Math.min(mmRect.height, clientY - mmRect.top));
        const pctX = localX / mmRect.width;
        const pctY = localY / mmRect.height;
        const worldX = bounds.minX + pctX * (bounds.maxX - bounds.minX);
        const worldY = bounds.minY + pctY * (bounds.maxY - bounds.minY);
        setPanOffset({ x: -(worldX - viewportSize.width / 2), y: -(worldY - viewportSize.height / 2) });
    };

    return (
        <div
            ref={containerRef}
            className={`w-full h-full relative bg-slate-950 overflow-hidden select-none outline-none ${isPanning ? 'cursor-grabbing' : (isCutting ? 'cursor-none' : 'cursor-crosshair')}`}
            tabIndex={0}
            onMouseMove={(e) => {
                handleMouseMove(e);
                if (isMinimapDragging) handleMinimapInteraction(e.clientX, e.clientY);
            }}
            onMouseUp={handleMouseUp}
            onMouseDown={handleContainerMouseDown}
            onContextMenu={handleContextMenu}
            onClick={() => setContextMenu(null)}
            onDragStart={(e) => e.preventDefault()}
        >
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

            {/* Cutter Cursor */}
            {isCutting && (
                <div
                    ref={cutterCursorRef}
                    className="absolute w-3 h-3 bg-rose-500 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.8)] pointer-events-none z-[1000]"
                    style={{ left: 0, top: 0 }}
                />
            )}

            <div
                className="absolute inset-0 grid-background opacity-20 pointer-events-none transition-none"
                style={{
                    backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Minimap (Fusion Style) */}
            {(isOffscreen || isMinimapDragging) && (
                <div
                    ref={minimapRef}
                    className="absolute top-4 right-4 w-48 h-32 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden z-[150] shadow-2xl cursor-pointer pointer-events-auto"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMinimapDragging(true);
                        handleMinimapInteraction(e.clientX, e.clientY);
                    }}
                    onDragStart={(e) => e.preventDefault()}
                >
                    <div className="absolute inset-0 opacity-10 grid-background pointer-events-none" style={{ backgroundSize: '10px 10px' }} />
                    <div className="relative w-full h-full">
                        {graph.nodes.map(n => {
                            const mapX = ((n.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100;
                            const mapY = ((n.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100;
                            const mapW = (NODE_WIDTH / (bounds.maxX - bounds.minX)) * 100;
                            return (
                                <div
                                    key={n.id}
                                    className="absolute bg-white/40 rounded-sm"
                                    style={{ left: `${mapX}%`, top: `${mapY}%`, width: `${mapW}%`, height: '4px' }}
                                />
                            );
                        })}
                        {/* Viewport handle */}
                        <div
                            className="absolute border border-indigo-400 bg-indigo-500/10"
                            style={{
                                left: `${((-panOffset.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
                                top: `${((-panOffset.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`,
                                width: `${(viewportSize.width / (bounds.maxX - bounds.minX)) * 100}%`,
                                height: `${(viewportSize.height / (bounds.maxY - bounds.minY)) * 100}%`
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Selection Marquee */}
            {isSelecting && marqueeRect && (
                <div
                    className="absolute border border-indigo-500 bg-indigo-500/10 pointer-events-none z-[160]"
                    style={{
                        left: Math.min(marqueeRect.startX, marqueeRect.endX) + panOffset.x,
                        top: Math.min(marqueeRect.startY, marqueeRect.endY) + panOffset.y,
                        width: Math.abs(marqueeRect.endX - marqueeRect.startX),
                        height: Math.abs(marqueeRect.endY - marqueeRect.startY)
                    }}
                />
            )}

            {graph.nodes.map(node => {
                const def = (NODE_DEFS as any)[node.type] || NODE_DEFS.filter;
                const isSelected = selectedNodeIds.has(node.id);
                return (
                    <div
                        key={node.id}
                        className={`absolute bg-slate-900 border ${def.color} rounded-xl shadow-2xl flex flex-col group transition-shadow ${isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/20' : 'hover:shadow-indigo-500/10'} ${node.bypass ? 'opacity-50 grayscale' : ''}`}
                        style={{
                            left: node.x + panOffset.x,
                            top: node.y + panOffset.y,
                            width: NODE_WIDTH,
                            zIndex: draggingNode === node.id ? 100 : 1,
                            minHeight: def.isMixer ? (45 + (Math.max(2, graph.connections.filter(c => c.target === node.id && c.targetPort?.startsWith('in_')).reduce((max, c) => Math.max(max, parseInt(c.targetPort?.split('_')[1] || '0')), -1) + 2)) * 36) : (getNodeOutputs(node).length > 0 ? (45 + getNodeOutputs(node).length * 36) : (def.params.length > 0 ? (45 + 12 + def.params.length * 44) : 'auto'))
                        }}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        <div
                            className={`bg-slate-800 p-3 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 cursor-grab active:cursor-grabbing border-b border-white/5 flex justify-between items-center rounded-t-[11px]`}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setNodeContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
                            }}
                        >
                            <span>{def.name}</span>
                            {node.id !== 'src' && node.id !== 'out' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-400"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        <div className="p-3 flex flex-col gap-[12px]" onMouseDown={(e) => e.stopPropagation()}>
                            {def.params.map((pDef: any) => {
                                if (pDef.hidden) return null;
                                const typeColors = { scalar: 'border-sky-500', int: 'border-emerald-500', audio: 'border-indigo-500' };
                                const portColor = typeColors[pDef.type as keyof typeof typeColors] || 'border-slate-600';
                                const drivenVal = getDrivenValue(node.id, pDef.id);
                                const hasInput = drivenVal !== null;

                                return (
                                    <div key={pDef.id} className="relative flex flex-col gap-1 h-[32px]">
                                        {/* Parameter Input Port */}
                                        <div
                                            className={`absolute -left-[20px] top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-800 border-2 ${portColor} rounded-full hover:bg-sky-400 z-50 cursor-pointer transition-colors flex items-center justify-center`}
                                            onMouseDown={(e) => handleMouseDownInputPort(e, node.id, pDef.id)}
                                            onMouseUp={() => handleMouseUpPort(node.id, pDef.id)}
                                            title={`Input: ${pDef.label} (${pDef.type})`}
                                        >
                                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full opacity-50" />
                                        </div>

                                        <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-tighter items-center">
                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                <span>{pDef.label}</span>
                                                <select
                                                    value={node.modulations?.[pDef.id] || 'none'}
                                                    onChange={(e) => updateModulation(node.id, pDef.id, e.target.value as any)}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="bg-transparent border-none text-[8px] text-slate-600 focus:ring-0 cursor-pointer hover:text-sky-400 p-0"
                                                >
                                                    <option value="none">Ø</option>
                                                    <option value="red">R</option>
                                                    <option value="green">G</option>
                                                    <option value="blue">B</option>
                                                    <option value="bright">L</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="flex flex-col items-end">
                                                    {editingParam?.nodeId === node.id && editingParam?.param === pDef.id ? (
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            onFocus={(e) => e.target.select()}
                                                            value={editingParam.tempVal}
                                                            onChange={(e) => setEditingParam({ ...editingParam, tempVal: e.target.value })}
                                                            onBlur={() => {
                                                                const val = parseFloat(editingParam.tempVal);
                                                                if (!isNaN(val)) updateParam(node.id, pDef.id, val);
                                                                setEditingParam(null);
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    const val = parseFloat(editingParam.tempVal);
                                                                    if (!isNaN(val)) updateParam(node.id, pDef.id, val);
                                                                    setEditingParam(null);
                                                                }
                                                            }}
                                                            className="w-12 bg-slate-800 text-sky-400 text-[10px] font-mono font-bold text-right border border-sky-500/50 rounded px-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                                        />
                                                    ) : (
                                                        <span
                                                            className={`text-[10px] cursor-pointer hover:bg-white/10 px-0.5 rounded transition-colors ${hasInput ? 'text-slate-600 line-through opacity-40' : 'text-sky-400'}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!hasInput && pDef.type !== 'bool') {
                                                                    setEditingParam({
                                                                        nodeId: node.id,
                                                                        param: pDef.id,
                                                                        tempVal: (node.params[pDef.id] ?? pDef.default).toString()
                                                                    });
                                                                } else if (pDef.type === 'bool') {
                                                                    // Toggle bool on click of text too, why not
                                                                    updateParam(node.id, pDef.id, node.params[pDef.id] ? 0 : 1);
                                                                }
                                                            }}
                                                        >
                                                            {pDef.type === 'bool' ? (node.params[pDef.id] ? 'ON' : 'OFF') : (node.params[pDef.id] ?? pDef.default).toFixed(pDef.type === 'int' ? 0 : 2)}
                                                        </span>
                                                    )}
                                                    {pDef.type === 'bool' && !hasInput && !editingParam && (
                                                        <div
                                                            className={`w-5 h-2.5 rounded-full relative transition-colors duration-200 cursor-pointer mt-0.5 ${node.params[pDef.id] ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                                            onClick={() => updateParam(node.id, pDef.id, node.params[pDef.id] ? 0 : 1)}
                                                        >
                                                            <div className={`absolute top-0.5 w-1.5 h-1.5 bg-white rounded-full transition-all duration-200 ${node.params[pDef.id] ? 'left-3' : 'left-0.5'}`} />
                                                        </div>
                                                    )}
                                                </div>
                                                {hasInput && (
                                                    <span className="text-[10px] text-sky-300 font-mono font-bold animate-pulse">
                                                        {drivenVal.toFixed(pDef.type === 'int' ? 0 : 2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div
                                            className={`relative w-full h-4 -mt-1.5 flex items-center cursor-pointer group/slider ${hasInput ? 'pointer-events-none' : ''}`}
                                            onMouseDown={(e) => handleParamMouseDown(e, node.id, pDef)}
                                        >
                                            <div className="relative w-full h-1 bg-slate-800 rounded overflow-hidden pointer-events-none">
                                                {pDef.type !== 'bool' && (
                                                    <>
                                                        <input
                                                            type="range"
                                                            min={pDef.min} max={pDef.max} step={pDef.step}
                                                            value={node.params[pDef.id] ?? pDef.default}
                                                            readOnly
                                                            className={`absolute inset-0 w-full accent-indigo-500 h-1 rounded pointer-events-none ${hasInput ? 'opacity-20 grayscale' : 'opacity-100'}`}
                                                        />
                                                        {hasInput ? (
                                                            <div
                                                                className="absolute inset-y-0 bg-sky-400 opacity-50 z-0 transition-opacity duration-75"
                                                                style={{
                                                                    left: 0,
                                                                    width: `${((Math.max(pDef.min, Math.min(pDef.max, drivenVal)) - pDef.min) / (pDef.max - pDef.min)) * 100}%`
                                                                }}
                                                            />
                                                        ) : (
                                                            node.modulations?.[pDef.id] !== 'none' && (
                                                                <div
                                                                    className="absolute inset-y-0 left-0 bg-sky-500/30 transition-all duration-75"
                                                                    style={{
                                                                        width: `${(modVals[node.modulations?.[pDef.id] as keyof typeof modVals] || 0) * 100}%`,
                                                                        boxShadow: '0 0 10px rgba(14, 165, 233, 0.5)'
                                                                    }}
                                                                />
                                                            )
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {node.type === 'lfo' && (
                                <div className="mt-2 w-full h-16 bg-slate-950/50 rounded-lg border border-white/5 relative overflow-hidden">
                                    <LFOVisualizer
                                        rate={node.params.rate || 2}
                                        amp={node.params.amp || 0.5}
                                        type={Math.round(node.params.type || 0)}
                                        phase={node.params.phase || 0}
                                        normalize={!!node.params.normalize}
                                    />
                                </div>
                            )}

                            {node.type === 'parametricEQ' && (
                                <div className="mt-2 w-full h-20 bg-slate-950/50 rounded-lg border border-white/5 relative overflow-hidden">
                                    <EQVisualizer params={node.params} />
                                </div>
                            )}
                            {node.type === 'fadeIn' && (
                                <FadeVisualizer
                                    params={node.params}
                                    onUpdate={(newParams) => {
                                        const newNode = { ...node, params: newParams };
                                        const newNodes = graph.nodes.map(n => n.id === node.id ? newNode : n);
                                        onUpdateGraph({ ...graph, nodes: newNodes });
                                    }}
                                />
                            )}
                        </div>

                        {/* Multi-port logic for source/others */}
                        {
                            (() => {
                                const outputs = getNodeOutputs(node);
                                if (outputs.length === 0) return null;
                                return (
                                    <div className="absolute top-[45px] right-0 flex flex-col gap-[16px] pointer-events-none items-end">
                                        {outputs.map((out: any) => (
                                            <div key={out.id} className="relative flex items-center justify-end">
                                                <span className="mr-2 text-[10px] font-black text-slate-500/80 uppercase tracking-widest pointer-events-none">
                                                    {out.label}
                                                </span>
                                                <div
                                                    className={`w-5 h-5 bg-slate-800 border-2 ${out.type === 'audio' ? 'border-indigo-500' : 'border-sky-500'} rounded-full hover:bg-indigo-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center translate-x-1/2`}
                                                    onMouseDown={(e) => handleMouseDownPort(e, node.id, out.id)}
                                                    title={`${out.label} (${out.type})`}
                                                >
                                                    <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()
                        }

                        {
                            node.type !== 'source' && (
                                <div className="absolute left-0 top-[45px] flex flex-col gap-[16px] pointer-events-none items-start">
                                    {def.isMixer ? (
                                        // Dynamic mixer ports
                                        (() => {
                                            const mixerConns = graph.connections.filter(c => c.target === node.id && c.targetPort?.startsWith('in_'));
                                            const maxIdx = mixerConns.reduce((max, c) => Math.max(max, parseInt(c.targetPort?.split('_')[1] || '0')), -1);
                                            const portCount = Math.max(2, maxIdx + 2);

                                            return Array.from({ length: portCount }).map((_, idx) => (
                                                <div key={`in_${idx}`} className="relative flex items-center">
                                                    <div
                                                        className={`w-5 h-5 bg-slate-800 border-2 border-indigo-500 rounded-full hover:bg-sky-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center -translate-x-1/2`}
                                                        onMouseDown={(e) => handleMouseDownInputPort(e, node.id, `in_${idx}`)}
                                                        onMouseUp={() => handleMouseUpPort(node.id, `in_${idx}`)}
                                                        title={`Mixer Input ${idx + 1}`}
                                                    >
                                                        <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                                                    </div>
                                                    <span className="ml-2 text-[10px] font-black text-slate-500/80 uppercase tracking-widest pointer-events-none">
                                                        IN {idx + 1}
                                                    </span>
                                                </div>
                                            ));
                                        })()
                                    ) : (
                                        <div
                                            className={`w-5 h-5 bg-slate-800 border-2 ${def.inType === 'audio' ? 'border-indigo-500' : 'border-sky-500'} rounded-full hover:bg-sky-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center -translate-x-1/2`}
                                            onMouseDown={(e) => handleMouseDownInputPort(e, node.id, '')}
                                            onMouseUp={() => handleMouseUpPort(node.id, '')}
                                            title={`${def.name} Input`}
                                        >
                                            <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                                        </div>
                                    )}
                                </div>
                            )
                        }
                        {
                            node.type !== 'output' && getNodeOutputs(node).length === 0 && (
                                <div
                                    className={`absolute right-0 top-[55px] translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-slate-800 border-2 ${def.outType === 'audio' ? 'border-indigo-500' : (def.outType === 'scalar' ? 'border-sky-500' : 'border-emerald-500')} rounded-full hover:bg-indigo-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center`}
                                    onMouseDown={(e) => handleMouseDownPort(e, node.id)}
                                    title={`Output (${def.outType || 'audio'})`}
                                >
                                    <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                                </div>
                            )
                        }
                    </div>
                );
            })}

            {contextMenu && (
                <div
                    className="fixed bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 w-48 z-[200] overflow-hidden backdrop-blur-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">Add FX Node</div>
                    {(Object.keys(NODE_DEFS) as Array<keyof typeof NODE_DEFS>).filter(k => k !== 'source' && k !== 'output').map(type => (
                        <button
                            key={type}
                            onClick={() => addNode(type)}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-slate-300 hover:bg-indigo-500 hover:text-white transition-colors uppercase tracking-tight"
                        >
                            {NODE_DEFS[type].name}
                        </button>
                    ))}
                </div>
            )}

            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur border border-white/5 p-2 rounded-lg text-[9px] font-bold text-slate-500 uppercase flex gap-2">
                <span>Right Click to Add Node</span>
            </div>
            {nodeContextMenu && (
                <>
                    <div className="fixed inset-0 z-[200]" onClick={() => setNodeContextMenu(null)} />
                    <div
                        className="fixed bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 w-48 z-[201] overflow-hidden backdrop-blur-xl"
                        style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">Node Options</div>
                        {graph.nodes.find(n => n.id === nodeContextMenu.nodeId)?.type === 'source' && (
                            graph.nodes.find(n => n.id === nodeContextMenu.nodeId)?.params.splitOutputs === 1 ? (
                                <button
                                    onClick={() => handleMergeOutputs(nodeContextMenu.nodeId)}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition-colors uppercase tracking-tight"
                                >
                                    Merge Outputs
                                </button>
                            ) : (
                                (trackCount || 0) > 1 && (
                                    <button
                                        onClick={() => handleSplitOutputs(nodeContextMenu.nodeId)}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500 hover:text-white transition-colors uppercase tracking-tight"
                                    >
                                        Split Outputs
                                    </button>
                                )
                            )
                        )}
                        <button
                            onClick={() => {
                                const newNodes = graph.nodes.filter(n => n.id !== nodeContextMenu.nodeId);
                                const newConns = graph.connections.filter(c => c.source !== nodeContextMenu.nodeId && c.target !== nodeContextMenu.nodeId);
                                onCommitGraph({ ...graph, nodes: newNodes, connections: newConns });
                                setNodeContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-slate-400 hover:bg-red-500 hover:text-white transition-colors uppercase tracking-tight"
                        >
                            Delete Node
                        </button>
                    </div>
                </>
            )}
        </div>
    );
});
