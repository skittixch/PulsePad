import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { FXGraph, FXNode } from '../types';
import { audioEngine } from '../audioEngine';

interface NodalInterfaceProps {
    graph: FXGraph;
    onUpdateGraph: (graph: FXGraph) => void;
    onCommitGraph: (graph: FXGraph) => void;
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

const NODE_DEFS = {
    source: { name: "Sequencer", color: "border-emerald-500", outType: "audio", params: [] },
    output: { name: "Speakers", color: "border-sky-500", inType: "audio", params: [] },
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
    }
};

export const NodalInterface: React.FC<NodalInterfaceProps> = ({ graph, onUpdateGraph, onCommitGraph }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const minimapRef = useRef<HTMLDivElement>(null);
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isMinimapDragging, setIsMinimapDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [activeCable, setActiveCable] = useState<{ source: string, startX: number, startY: number } | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const [modVals, setModVals] = useState({ r: 0, g: 0, b: 0, bright: 0 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [marqueeRect, setMarqueeRect] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [hoveredConnection, setHoveredConnection] = useState<{ source: string, target: string } | null>(null);
    const [isCutting, setIsCutting] = useState(false);
    const [cutterPath, setCutterPath] = useState<{ x: number, y: number }[]>([]);
    const [editingParam, setEditingParam] = useState<{ nodeId: string, param: string, tempVal: string } | null>(null);
    const [clipboard, setClipboard] = useState<FXNode[]>([]);
    const panningPrevented = useRef(false);

    useEffect(() => {
        let frame: number;
        const update = () => {
            setModVals({ ...audioEngine.avgColor });
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, []);

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

    const NODE_WIDTH = 180;
    const NODE_PADDING = 60;

    const drawCables = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(panOffset.x, panOffset.y);

        graph.connections.forEach(conn => {
            const isHovered = hoveredConnection?.source === conn.source && hoveredConnection?.target === conn.target;
            const srcNode = graph.nodes.find(n => n.id === conn.source);
            const dstNode = graph.nodes.find(n => n.id === conn.target);
            if (srcNode && dstNode) {
                const srcDef = (NODE_DEFS as any)[srcNode.type];
                const dstDef = (NODE_DEFS as any)[dstNode.type];
                const x1 = srcNode.x + NODE_WIDTH;
                const y1 = srcNode.y + 50;
                const x2 = dstNode.x;

                // Calculate target Y based on port
                let targetY = dstNode.y + 50; // Default audio in
                let targetType = dstDef.inType || 'audio';

                if (conn.targetPort) {
                    const pIdx = dstDef.params.findIndex((p: any) => p.id === conn.targetPort);
                    if (pIdx !== -1) {
                        targetY = dstNode.y + 45 + 16 + pIdx * 44 + 16;
                        targetType = dstDef.params[pIdx].type;
                    }
                }

                const srcType = srcDef.outType || 'audio';
                const isCompatible = srcType === targetType || (srcType === 'int' && targetType === 'scalar');

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                const cp1x = x1 + (x2 - x1) / 2;
                const cp2x = x1 + (x2 - x1) / 2;
                ctx.bezierCurveTo(cp1x, y1, cp2x, targetY, x2, targetY);

                const typeColors = {
                    audio: '#6366f1',
                    scalar: '#0ea5e9',
                    int: '#10b981'
                };

                ctx.save();
                if (isHovered) {
                    ctx.strokeStyle = typeColors[srcType as keyof typeof typeColors] || '#6366f1';
                    ctx.lineWidth = 6;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = ctx.strokeStyle;
                } else {
                    ctx.strokeStyle = typeColors[srcType as keyof typeof typeColors] || '#334155';
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 0;
                }

                if (!isCompatible) {
                    ctx.setLineDash([5, 5]);
                    ctx.globalAlpha = 0.5;
                }

                ctx.stroke();

                // Draw slash if incompatible
                if (!isCompatible) {
                    const t = 0.5;
                    const mt = 1 - t;
                    const mx = Math.pow(mt, 3) * x1 + 3 * Math.pow(mt, 2) * t * cp1x + 3 * mt * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * x2;
                    const my = Math.pow(mt, 3) * y1 + 3 * Math.pow(mt, 2) * t * y1 + 3 * mt * Math.pow(t, 2) * targetY + Math.pow(t, 3) * targetY;

                    ctx.beginPath();
                    ctx.setLineDash([]);
                    ctx.lineWidth = 2;
                    ctx.moveTo(mx - 5, my + 8);
                    ctx.lineTo(mx + 5, my - 8);
                    ctx.stroke();
                }
                ctx.restore();
            }
        });

        if (activeCable) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const worldMouseX = mousePos.x - panOffset.x;
            const worldMouseY = mousePos.y - panOffset.y;
            ctx.moveTo(activeCable.startX, activeCable.startY);
            const cp1x = activeCable.startX + (worldMouseX - activeCable.startX) / 2;
            const cp2x = activeCable.startX + (worldMouseX - activeCable.startX) / 2;
            ctx.bezierCurveTo(cp1x, activeCable.startY, cp2x, worldMouseY, worldMouseX, worldMouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (isCutting && cutterPath.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(cutterPath[0].x, cutterPath[0].y);
            for (let i = 1; i < cutterPath.length; i++) {
                ctx.lineTo(cutterPath[i].x, cutterPath[i].y);
            }
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }, [graph, activeCable, mousePos, panOffset, hoveredConnection]);

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
                    const newNodes = graph.nodes.filter(n => !selectedNodeIds.has(n.id));
                    const newConnections = graph.connections.filter(c => !selectedNodeIds.has(c.source) && !selectedNodeIds.has(c.target));
                    onCommitGraph({ ...graph, nodes: newNodes, connections: newConnections });
                    setSelectedNodeIds(new Set());
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
                        const newNodes = graph.nodes.filter(n => !selectedNodeIds.has(n.id));
                        const newConnections = graph.connections.filter(c => !selectedNodeIds.has(c.source) && !selectedNodeIds.has(c.target));
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
                        const pasteX = (mousePos.x - panOffset.x);
                        const pasteY = (mousePos.y - panOffset.y);

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
                }
            }

            if (e.key.toLowerCase() === 'f') frameGraph();
            if (e.key.toLowerCase() === 'l') layoutNodes();
            if (e.key.toLowerCase() === 'y') setIsCutting(true);

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
                            if (!newConns.some(c => c.source === inc.source && c.target === out.target)) {
                                newConns.push({ source: inc.source, target: out.target });
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
                setCutterPath([]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [frameGraph, layoutNodes, draggingNode, graph, onUpdateGraph]);

    useEffect(() => {
        drawCables();
    }, [drawCables]);

    const handleMouseDownPort = (e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) return;
        setActiveCable({
            source: nodeId,
            startX: node.x + NODE_WIDTH,
            startY: node.y + 50
        });
    };

    const handleMouseDownInputPort = (e: React.MouseEvent, nodeId: string, portId?: string) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if there's an existing connection to this port
        const existingConn = graph.connections.find(c => c.target === nodeId && c.targetPort === portId);
        if (existingConn) {
            // Remove the connection and start dragging from its source
            const srcNode = graph.nodes.find(n => n.id === existingConn.source);
            if (srcNode) {
                const newConns = graph.connections.filter(c => c !== existingConn);
                onCommitGraph({ ...graph, connections: newConns });
                setActiveCable({
                    source: existingConn.source,
                    startX: srcNode.x + NODE_WIDTH,
                    startY: srcNode.y + 50
                });
            }
        }
    };

    const handleMouseUpPort = (nodeId: string, portId?: string) => {
        if (activeCable && activeCable.source !== nodeId) {
            // Exclusive input: remove existing connections to this specific target port
            const otherConnections = graph.connections.filter(c => !(c.target === nodeId && c.targetPort === portId));
            const newConnections = [...otherConnections, { source: activeCable.source, target: nodeId, targetPort: portId }];
            onCommitGraph({ ...graph, connections: newConnections });
        }
        setActiveCable(null);
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
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

            // If it was a bridge (A -> Node -> B), reconnect neighbors A -> B (Audio only)
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

    function lineIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return false;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
    }

    const checkCutterIntersections = (path: { x: number, y: number }[]) => {
        if (path.length < 2) return;
        const p1 = path[path.length - 2];
        const p2 = path[path.length - 1];

        const newConnections = graph.connections.filter(conn => {
            const s = graph.nodes.find(n => n.id === conn.source);
            const t = graph.nodes.find(n => n.id === conn.target);
            if (!s || !t) return true;

            const x1 = s.x + NODE_WIDTH, y1 = s.y + 50;
            const x2 = t.x;
            let targetY = t.y + 50;
            const dstDef = (NODE_DEFS as any)[t.type];
            if (conn.targetPort) {
                const pIdx = dstDef.params.findIndex((p: any) => p.id === conn.targetPort);
                if (pIdx !== -1) targetY = t.y + 45 + 16 + pIdx * 44 + 16;
            }

            const cp1x = x1 + (x2 - x1) / 2;
            const cp2x = x1 + (x2 - x1) / 2;

            const SAMPLES = 12;
            for (let i = 0; i < SAMPLES; i++) {
                const t1 = i / SAMPLES;
                const t2 = (i + 1) / SAMPLES;
                const mt1 = 1 - t1, mt2 = 1 - t2;

                const getPt = (tv: number, mtv: number) => ({
                    x: Math.pow(mtv, 3) * x1 + 3 * Math.pow(mtv, 2) * tv * cp1x + 3 * mtv * Math.pow(tv, 2) * cp2x + Math.pow(tv, 3) * x2,
                    y: Math.pow(mtv, 3) * y1 + 3 * Math.pow(mtv, 2) * tv * y1 + 3 * mtv * Math.pow(tv, 2) * targetY + Math.pow(tv, 3) * targetY
                });

                const curveP1 = getPt(t1, mt1);
                const curveP2 = getPt(t2, mt2);

                if (lineIntersect(p1.x, p1.y, p2.x, p2.y, curveP1.x, curveP1.y, curveP2.x, curveP2.y)) return false;
            }
            return true;
        });

        if (newConnections.length !== graph.connections.length) {
            onCommitGraph({ ...graph, connections: newConnections });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        setMousePos({ x: screenX, y: screenY });

        if (draggingNode) {
            const worldX = screenX - panOffset.x;
            const worldY = screenY - panOffset.y;
            const dx = worldX - nodeDragOffset.x - graph.nodes.find(n => n.id === draggingNode)!.x;
            const dy = worldY - nodeDragOffset.y - graph.nodes.find(n => n.id === draggingNode)!.y;

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

            // Handle hover wire detection if shift is held
            if (e.shiftKey) {
                let nearest: { source: string, target: string } | null = null;
                let minDist = 60; // Increased threshold for "magnetic" feel

                graph.connections.forEach(conn => {
                    const s = graph.nodes.find(n => n.id === conn.source);
                    const t = graph.nodes.find(n => n.id === conn.target);
                    if (!s || !t) return;
                    if (conn.source === draggingNode || conn.target === draggingNode) return;

                    // BEZIER PROXIMITY CHECK (Sampled)
                    const x1 = s.x + NODE_WIDTH, y1 = s.y + 50;
                    const x2 = t.x, y2 = t.y + 50;
                    const cp1x = x1 + (x2 - x1) / 2;
                    const cp2x = x1 + (x2 - x1) / 2;

                    // Sample 10 points along the curve
                    const SAMPLES = 10;
                    for (let i = 0; i <= SAMPLES; i++) {
                        const t_val = i / SAMPLES;
                        const mt = 1 - t_val;
                        // Cubic Bezier Formula
                        const px = Math.pow(mt, 3) * x1 + 3 * Math.pow(mt, 2) * t_val * cp1x + 3 * mt * Math.pow(t_val, 2) * cp2x + Math.pow(t_val, 3) * x2;
                        const py = Math.pow(mt, 3) * y1 + 3 * Math.pow(mt, 2) * t_val * y1 + 3 * mt * Math.pow(t_val, 2) * y2 + Math.pow(t_val, 3) * y2;

                        const dist = Math.sqrt(Math.pow(worldX - px, 2) + Math.pow(worldY - py, 2));
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = conn;
                        }
                    }
                });
                setHoveredConnection(nearest);
            } else {
                setHoveredConnection(null);
            }
        } else if (isPanning && !isCutting) {
            setPanOffset(prev => ({
                x: prev.x + (e.clientX - lastMousePos.x),
                y: prev.y + (e.clientY - lastMousePos.y)
            }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        } else if (isSelecting && marqueeRect) {
            setMarqueeRect(prev => prev ? { ...prev, endX: screenX - panOffset.x, endY: screenY - panOffset.y } : null);

            // Real-time selection update
            const m = {
                x1: Math.min(marqueeRect.startX, screenX - panOffset.x),
                y1: Math.min(marqueeRect.startY, screenY - panOffset.y),
                x2: Math.max(marqueeRect.startX, screenX - panOffset.x),
                y2: Math.max(marqueeRect.startY, screenY - panOffset.y)
            };

            const newSelected = new Set<string>();
            graph.nodes.forEach(n => {
                const nx1 = n.x;
                const ny1 = n.y;
                const nx2 = n.x + NODE_WIDTH;
                const ny2 = n.y + 150;
                if (!(nx2 < m.x1 || nx1 > m.x2 || ny2 < m.y1 || ny1 > m.y2)) {
                    newSelected.add(n.id);
                }
            });
            setSelectedNodeIds(newSelected);
        } else if (isCutting && cutterPath.length > 0) {
            const worldX = screenX - panOffset.x;
            const worldY = screenY - panOffset.y;
            const newPath = [...cutterPath, { x: worldX, y: worldY }];
            setCutterPath(newPath);
            checkCutterIntersections(newPath);
        }
    };

    const handleContainerMouseDown = (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldX = (e.clientX - rect.left) - panOffset.x;
        const worldY = (e.clientY - rect.top) - panOffset.y;

        if (e.button === 0) { // Left click on background
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                setIsSelecting(true);
                setMarqueeRect({ startX: worldX, startY: worldY, endX: worldX, endY: worldY });
                setSelectedNodeIds(new Set());
            } else if (!isCutting) {
                setIsPanning(true);
                setLastMousePos({ x: e.clientX, y: e.clientY });
                setSelectedNodeIds(new Set());
            }
        } else if (e.button === 2) { // Right click
            if (e.ctrlKey) {
                e.preventDefault();
                setIsCutting(true);
                setCutterPath([{ x: worldX, y: worldY }]);
            }
        }
    };

    const handleMouseUp = () => {
        if (draggingNode && hoveredConnection) {
            // INSERT NODE INTO CONNECTION
            const { source, target } = hoveredConnection;
            let newConns = graph.connections.filter(c => !(c.source === source && c.target === target));

            // Avoid duplicates
            if (!newConns.some(c => c.source === source && c.target === draggingNode)) {
                newConns.push({ source, target: draggingNode });
            }
            if (!newConns.some(c => c.source === draggingNode && c.target === target)) {
                newConns.push({ source: draggingNode, target });
            }

            // Orderly Push: Move target and all downstream nodes
            const pushedNodeIds = new Set<string>();
            const getDownstream = (id: string) => {
                if (pushedNodeIds.has(id)) return;
                pushedNodeIds.add(id);
                graph.connections.filter(c => c.source === id).forEach(c => getDownstream(c.target));
            };
            getDownstream(target);

            const insertedNode = graph.nodes.find(n => n.id === draggingNode);
            const targetNode = graph.nodes.find(n => n.id === target);

            let pushDelta = 0;
            if (insertedNode && targetNode) {
                const requiredX = insertedNode.x + NODE_WIDTH + NODE_PADDING;
                pushDelta = Math.max(0, requiredX - targetNode.x);
            }

            const newNodes = graph.nodes.map(n => {
                if (pushedNodeIds.has(n.id) && pushDelta > 0) {
                    return { ...n, x: n.x + pushDelta };
                }
                return n;
            });

            onCommitGraph({ ...graph, connections: newConns, nodes: newNodes });
        } else if (draggingNode) {
            // Commit final position after drag
            onCommitGraph(graph);
        }

        setDraggingNode(null);
        setActiveCable(null);
        setIsPanning(false);
        setIsMinimapDragging(false);
        setIsSelecting(false);
        setMarqueeRect(null);
        setHoveredConnection(null);
        if (isCutting) panningPrevented.current = true;
        setIsCutting(false);
        setCutterPath([]);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (panningPrevented.current || e.ctrlKey) {
            panningPrevented.current = false;
            return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const addNode = (type: keyof typeof NODE_DEFS) => {
        if (!contextMenu) return;
        const id = `node_${Date.now()}`;
        const def = NODE_DEFS[type];
        const params: Record<string, number> = {};
        def.params.forEach(p => params[p.id] = p.default);

        // Place node at world coordinates
        const newNode: FXNode = {
            id,
            type: type as any,
            x: contextMenu.x - panOffset.x,
            y: contextMenu.y - panOffset.y,
            params
        };

        onCommitGraph({ ...graph, nodes: [...graph.nodes, newNode] });
        setContextMenu(null);
    };

    const deleteNode = (nodeId: string) => {
        if (nodeId === 'src' || nodeId === 'out') return;

        const inConns = graph.connections.filter(c => c.target === nodeId && !c.targetPort); // Only audio input
        const outConns = graph.connections.filter(c => c.source === nodeId);

        let newConnections = graph.connections.filter(c => c.source !== nodeId && c.target !== nodeId);

        if (inConns.length === 1 && outConns.length === 1) {
            const alreadyExists = newConnections.some(c => c.source === inConns[0].source && c.target === outConns[0].target);
            if (!alreadyExists) {
                newConnections.push({ source: inConns[0].source, target: outConns[0].target });
            }
        }

        onCommitGraph({
            ...graph,
            nodes: graph.nodes.filter(n => n.id !== nodeId),
            connections: newConnections
        });
    };

    const updateParam = (nodeId: string, param: string, val: number) => {
        const newNodes = graph.nodes.map(n => {
            if (n.id === nodeId) {
                return { ...n, params: { ...n.params, [param]: val } };
            }
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

    // Minimap Calculation
    const getGraphBounds = () => {
        if (graph.nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        graph.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_WIDTH);
            maxY = Math.max(maxY, n.y + 150); // Rough height
        });

        // Pad for extra space
        const pad = 500;
        return {
            minX: minX - pad,
            minY: minY - pad,
            maxX: maxX + pad,
            maxY: maxY + pad
        };
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

        setPanOffset({
            x: -(worldX - viewportSize.width / 2),
            y: -(worldY - viewportSize.height / 2)
        });
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
                    className="absolute w-3 h-3 bg-rose-500 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.8)] pointer-events-none z-[1000] transition-transform duration-75"
                    style={{ left: mousePos.x - 6, top: mousePos.y - 6 }}
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
                        className={`absolute bg-slate-900 border ${def.color} rounded-xl shadow-2xl overflow-hidden flex flex-col group transition-shadow ${isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/20' : 'hover:shadow-indigo-500/10'}`}
                        style={{ left: node.x + panOffset.x, top: node.y + panOffset.y, width: NODE_WIDTH, zIndex: draggingNode === node.id ? 100 : 1 }}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        <div
                            className="bg-slate-800 p-3 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 cursor-grab active:cursor-grabbing border-b border-white/5 flex justify-between items-center"
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
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

                                        <div className="relative w-full h-1 bg-slate-800 rounded overflow-hidden">
                                            {pDef.type !== 'bool' && (
                                                <>
                                                    <input
                                                        type="range"
                                                        min={pDef.min} max={pDef.max} step={pDef.step}
                                                        value={node.params[pDef.id] ?? pDef.default}
                                                        disabled={hasInput}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            let finalVal = pDef.type === 'int' ? Math.round(val) : val;

                                                            // MAGNETIC SNAP FOR LFO RATE
                                                            const isShiftHeld = (e.nativeEvent as any).shiftKey;
                                                            if (node.type === 'lfo' && pDef.id === 'rate' && !isShiftHeld) {
                                                                const SNAP_VALUES = [0.125, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0];
                                                                // Find nearest snap
                                                                let closest = SNAP_VALUES[0];
                                                                let minDiff = Infinity;

                                                                for (const s of SNAP_VALUES) {
                                                                    const diff = Math.abs(val - s);
                                                                    if (diff < minDiff) {
                                                                        minDiff = diff;
                                                                        closest = s;
                                                                    }
                                                                }

                                                                // Snap threshold (e.g., within 0.5 units or so, relative to magnitude?)
                                                                // actually, since these are log-like, a fixed threshold might be weird.
                                                                // Let's try a simple distance check.
                                                                if (minDiff < 0.25) {
                                                                    finalVal = closest;
                                                                }
                                                            }

                                                            updateParam(node.id, pDef.id, finalVal);
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        className={`absolute inset-0 w-full accent-indigo-500 h-1 rounded cursor-pointer z-10 ${hasInput ? 'opacity-20 grayscale cursor-not-allowed' : 'opacity-100'}`}
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
                        </div>

                        {node.type !== 'source' && (
                            <div
                                className={`absolute left-0 top-[50px] -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-slate-800 border-2 ${def.inType === 'audio' ? 'border-indigo-500' : 'border-slate-600'} rounded-full hover:bg-sky-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center`}
                                onMouseDown={(e) => handleMouseDownInputPort(e, node.id)}
                                onMouseUp={() => handleMouseUpPort(node.id)}
                                title="Audio Input"
                            >
                                <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                            </div>
                        )}
                        {node.type !== 'output' && (
                            <div
                                className={`absolute right-0 top-[50px] translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-slate-800 border-2 ${def.outType === 'audio' ? 'border-indigo-500' : (def.outType === 'scalar' ? 'border-sky-500' : 'border-emerald-500')} rounded-full hover:bg-indigo-500 transition-colors pointer-events-auto cursor-pointer flex items-center justify-center`}
                                onMouseDown={(e) => handleMouseDownPort(e, node.id)}
                                title={`Output (${def.outType || 'audio'})`}
                            >
                                <div className="w-2 h-2 bg-slate-400 rounded-full opacity-50" />
                            </div>
                        )}
                    </div>
                );
            })}

            {contextMenu && (
                <div
                    className="absolute bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 w-48 z-[200] overflow-hidden backdrop-blur-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
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
        </div>
    );
};
