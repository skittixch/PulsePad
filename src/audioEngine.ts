import type { SoundConfig, Grid, RowConfig, FXGraph, FXNode } from './types';
import { DEFAULT_SOUND_CONFIG } from './constants';

export class AudioEngine {
    ctx: AudioContext | null = null;
    masterGain: GainNode | null = null;
    analyser: AnalyserNode | null = null;
    trackOutputs: GainNode[] = [];
    soundConfig: SoundConfig = { ...DEFAULT_SOUND_CONFIG };
    activeFXNodes: Map<string, any> = new Map();
    avgColor: { r: number, g: number, b: number, bright: number } = { r: 0, g: 0, b: 0, bright: 0 };
    currentFXGraph: FXGraph | null = null;
    lfoStartTime: number = 0;
    bpm: number = 120;
    sequencerMainOut: GainNode | null = null;
    private lastStructStr: string = "";
    private lastParamsStr: string = "";

    constructor() {
        // Initialization happens on user interaction
    }

    private modLoopActive = false;

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.sequencerMainOut = this.ctx.createGain();
        // Disconnect default: we'll connect in rebuildFXGraph
        // this.sequencerMainOut.connect(this.masterGain);

        this.trackOutputs = [];
        for (let i = 0; i < 16; i++) {
            const trackGain = this.ctx.createGain();
            // Default track connection is to sequencerMainOut (for summing)
            // but we'll disconnect/connect explicitly in rebuildFXGraph
            trackGain.connect(this.sequencerMainOut);
            this.trackOutputs.push(trackGain);
        }

        (window as any).audioEngine = this;
        this.startModulationLoop();
    }

    startModulationLoop() {
        if (this.modLoopActive) return;
        this.modLoopActive = true;
        const loop = () => {
            if (!this.modLoopActive) return;
            this.updateModulations();
            requestAnimationFrame(loop);
        };
        loop();
    }

    setMasterVolume(val: number) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(val, this.ctx!.currentTime, 0.05);
        }
    }

    resetLFO() {
        this.lfoStartTime = Date.now() / 1000;
    }

    setBpm(bpm: number) {
        this.bpm = bpm;
        // When BPM changes, we might want to update running delay nodes
        this.activeFXNodes.forEach((node, id) => {
            if (node.type === 'delay') {
                const nodeData = this.currentFXGraph?.nodes.find(n => n.id === id);
                if (nodeData) {
                    const timeParam = nodeData.params.time ?? 0.25;
                    this.updateFXParam(id, 'time', timeParam);
                }
            }
        });
    }

    async resume() {
        if (this.ctx?.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    createKick(time: number, rowGain = 0.8, config?: SoundConfig, trackIdx = 0) {
        if (!this.ctx || !this.trackOutputs[trackIdx]) return;
        const conf = config ? config.kick : this.soundConfig.kick;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.trackOutputs[trackIdx]);

        osc.frequency.setValueAtTime(conf.freq, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + conf.decay);

        gain.gain.setValueAtTime(rowGain, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + conf.decay);

        osc.start(time);
        osc.stop(time + conf.decay);
    }

    createSnare(time: number, rowGain = 0.8, config?: SoundConfig, trackIdx = 0) {
        if (!this.ctx || !this.trackOutputs[trackIdx]) return;
        const conf = config ? config.snare : this.soundConfig.snare;

        const noise = this.ctx.createBufferSource();
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = conf.freq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(conf.mix * rowGain, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + conf.decay);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.trackOutputs[trackIdx]);
        noise.start(time);

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        oscGain.gain.setValueAtTime((1 - conf.mix) * rowGain, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(oscGain);
        oscGain.connect(this.trackOutputs[trackIdx]);
        osc.start(time);
        osc.stop(time + 0.15);
    }

    createHiHat(time: number, rowGain = 0.8, config?: SoundConfig, trackIdx = 0) {
        if (!this.ctx || !this.trackOutputs[trackIdx]) return;
        const conf = config ? config.hat : this.soundConfig.hat;

        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = conf.freq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3 * rowGain, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + conf.decay);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.trackOutputs[trackIdx]);
        noise.start(time);
    }

    createSynth(freq: number, time: number, durationSteps = 1, bpm: number, rowGain = 0.8, config?: SoundConfig, trackIdx = 0) {
        const secondsPerStep = 60.0 / bpm / 4;
        const durationSecs = durationSteps * secondsPerStep;
        const voice = this.triggerSynth(freq, rowGain, time, config, trackIdx);
        if (!voice) return;

        const conf = config ? config.synth : this.soundConfig.synth;
        const release = Math.max(0.05, Math.min(durationSecs, conf.release));
        voice.gain.gain.setValueAtTime(0.1 * rowGain, time + durationSecs - 0.01);
        voice.gain.gain.exponentialRampToValueAtTime(0.01, time + durationSecs + release);
        voice.osc.stop(time + durationSecs + release + 0.1);
    }

    triggerSynth(freq: number, rowGain = 0.8, startTime?: number, config?: SoundConfig, trackIdx = 0): any {
        if (!this.ctx || !this.trackOutputs[trackIdx]) return null;
        const conf = config ? config.synth : this.soundConfig.synth;

        const time = startTime || this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = conf.type;
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(conf.filter, time);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.trackOutputs[trackIdx]);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.1 * rowGain, time + conf.attack);

        osc.start(time);
        return { osc, gain, filter };
    }

    stopSynth(voice: any, config?: SoundConfig) {
        if (!this.ctx || !voice) return;
        const conf = config ? config.synth : this.soundConfig.synth;
        const time = this.ctx.currentTime;
        const release = conf.release;
        try {
            voice.gain.gain.cancelScheduledValues(time);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
            voice.gain.gain.exponentialRampToValueAtTime(0.001, time + release);
            voice.osc.stop(time + release + 0.1);
        } catch (e) {
            // Node might already be stopped
        }
    }

    playStep(grid: Grid, stepIndex: number, time: number, configs: RowConfig[], bpm: number, trackGain: number = 1.0, soundConfig?: SoundConfig, trackIdx = 0) {
        if (!this.ctx) return;

        let totalR = 0, totalG = 0, totalB = 0, count = 0;

        grid.forEach((row, rowIndex) => {
            const note = row[stepIndex];
            if (note) {
                const config = configs[rowIndex];
                const finalGain = (config.gain ?? 0.8) * trackGain;
                const freq = config.type === 'synth' ? config.freq * Math.pow(2, note.oct || 0) : config.freq;

                if (config.type === 'synth') {
                    this.createSynth(freq, time, note.d, bpm, finalGain, soundConfig, trackIdx);
                } else if (config.type === 'kick' || config.type === 'snare' || config.type === 'hat') {
                    if (note.d > 1) {
                        const totalHits = note.d * 2;
                        const subtickSecs = (60 / bpm / 4) / 2;
                        for (let i = 0; i < totalHits; i++) {
                            const hitTime = time + (i * subtickSecs);
                            const velocity = 0.7 + (i / (totalHits - 1)) * 0.3;
                            const hitGain = finalGain * velocity;
                            if (config.type === 'kick') this.createKick(hitTime, hitGain, soundConfig, trackIdx);
                            else if (config.type === 'snare') this.createSnare(hitTime, hitGain, soundConfig, trackIdx);
                            else if (config.type === 'hat') this.createHiHat(hitTime, hitGain, soundConfig, trackIdx);
                        }
                    } else {
                        if (config.type === 'kick') this.createKick(time, finalGain, soundConfig, trackIdx);
                        else if (config.type === 'snare') this.createSnare(time, finalGain, soundConfig, trackIdx);
                        else if (config.type === 'hat') this.createHiHat(time, finalGain, soundConfig, trackIdx);
                    }
                }

                // Color tracking
                if (note.rgb) {
                    const r = parseInt(note.rgb.slice(1, 3), 16) / 255;
                    const g = parseInt(note.rgb.slice(3, 5), 16) / 255;
                    const b = parseInt(note.rgb.slice(5, 7), 16) / 255;
                    totalR += r; totalG += g; totalB += b; count++;
                }
            }
        });

        if (count > 0) {
            this.avgColor = {
                r: totalR / count,
                g: totalG / count,
                b: totalB / count,
                bright: (totalR + totalG + totalB) / (3 * count)
            };
        }
    }

    private getNodeValue(node: FXNode, time: number): number {
        if (node.type === 'float' || node.type === 'int') {
            return node.params.val ?? 0;
        } else if (node.type === 'lfo') {
            const rate = node.params.rate ?? 1;
            const amp = node.params.amp ?? 1;
            const phase_offset = node.params.phase ?? 0;
            const type = Math.round(node.params.type ?? 0);

            // Use relative time for LFO sync
            const lfoTime = Math.max(0, time - this.lfoStartTime);
            const pTime = (lfoTime * rate) + phase_offset;
            const p = pTime % 1;

            let val = 0;
            if (type === 0) val = Math.sin(pTime * Math.PI * 2);
            else if (type === 1) val = (Math.abs((p * 2) - 1) * 2 - 1);
            else if (type === 2) val = (p * 2) - 1;
            else if (type === 3) val = p > 0.5 ? 1 : -1;

            if (node.params.normalize) {
                val = (val + 1) / 2;
            }

            return val * amp;
        } else if (node.type === 'setRange') {
            const inputConn = this.currentFXGraph!.connections.find(c => c.target === node.id && !c.targetPort);
            let inputVal = 0;
            if (inputConn) {
                const src = this.currentFXGraph!.nodes.find(n => n.id === inputConn.source);
                if (src) inputVal = this.getNodeValue(src, time);
            }
            const { oldMin = -1, oldMax = 1, newMin = 0, newMax = 1 } = node.params;
            const range = oldMax - oldMin;
            const pct = range === 0 ? 0 : (inputVal - oldMin) / range;
            return newMin + pct * (newMax - newMin);
        }
        return 0;
    }

    updateModulations() {
        if (!this.currentFXGraph || !this.ctx) return;
        const time = Date.now() / 1000;

        // 1. Handle Node-to-Node Modulations (LFO, Float, setRange, etc.)
        this.currentFXGraph.connections.forEach(conn => {
            if (!conn.targetPort) return;

            const srcNode = this.currentFXGraph!.nodes.find(n => n.id === conn.source);
            if (!srcNode) return;

            const val = this.getNodeValue(srcNode, time);

            // Apply driven value (Clamped 0-1 for safety on most audio params)
            const clampedVal = Math.max(0, Math.min(1, val));
            this.updateFXParam(conn.target, conn.targetPort, clampedVal);
        });

        // 2. Handle Color Modulations
        this.applyColorModulation();
    }

    applyColorModulation() {
        if (!this.currentFXGraph) return;

        this.currentFXGraph.nodes.forEach(node => {
            if (node.modulations) {
                Object.entries(node.modulations).forEach(([paramId, source]) => {
                    if (source === 'none') return;

                    let modValue = 0;
                    if (source === 'red') modValue = this.avgColor.r;
                    else if (source === 'green') modValue = this.avgColor.g;
                    else if (source === 'blue') modValue = this.avgColor.b;
                    else if (source === 'bright') modValue = this.avgColor.bright;

                    // Apply modulation on top of base param
                    const baseVal = node.params[paramId] || 0;
                    const finalVal = Math.max(0, Math.min(1, baseVal + (modValue * 0.5)));
                    this.updateFXParam(node.id, paramId, finalVal);
                });
            }
        });
    }

    private createReverbBuffer(duration: number, decay: number) {
        if (!this.ctx) return null;
        const length = this.ctx.sampleRate * Math.max(0.1, duration);
        const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, Math.max(0.1, decay));
            }
        }
        return buffer;
    }

    rebuildFXGraph(graph: FXGraph) {
        if (!this.ctx) return;

        // Structural comparison: Only rebuild if IDs or Types change, or connections change.
        const struct = {
            nodes: graph.nodes.map(n => ({ id: n.id, type: n.type })),
            connections: graph.connections
        };
        const structStr = JSON.stringify(struct);
        // OPTIMIZATION: Check params too.
        // If structure AND params match, do nothing (avoids artifacts on drag when only X/Y changes).
        const paramsStr = JSON.stringify(graph.nodes.map(n => ({ id: n.id, params: n.params })));

        if (this.lastStructStr === structStr) {
            // Structure matched. Did params change?
            if (this.lastParamsStr === paramsStr) {
                // Nothing relevant changed.
                this.currentFXGraph = graph;
                return;
            }

            // Params changed. Update them.
            this.lastParamsStr = paramsStr;
            this.currentFXGraph = graph;
            graph.nodes.forEach(nData => {
                const params = nData.params || {};
                Object.entries(params).forEach(([pId, val]) => {
                    this.updateFXParam(nData.id, pId, val);
                });
            });
            return;
        }

        this.lastStructStr = structStr;
        this.lastParamsStr = paramsStr;
        this.currentFXGraph = graph;
        if (!this.trackOutputs.length || !this.masterGain) return;

        // 0. Disconnect EVERYTHING to start from a clean state (Strict Routing)
        this.sequencerMainOut?.disconnect();
        this.trackOutputs.forEach(t => t.disconnect());

        // 0b. Cleanup OLD nodes explicitly (before they are cleared)
        this.activeFXNodes.forEach(node => {
            if (node.disconnect) {
                node.disconnect();
            } else if (node instanceof AudioNode) {
                node.disconnect();
            }
        });
        this.activeFXNodes.clear();

        // 1. Prepare new nodes
        const newFXNodes = new Map<string, any>();
        graph.nodes.forEach(nData => {
            let node;
            if (nData.type === 'source') {
                node = { isSource: true }; // Placeholder, inputs managed by trackIdx
            } else if (nData.type === 'output') {
                node = { input: this.masterGain, output: this.masterGain };
            } else {
                node = this.createFXNode(nData);
            }
            if (node) newFXNodes.set(nData.id, node);
        });

        // 2. Map internal connections (including source outputs)
        graph.connections.forEach(conn => {
            const dst = newFXNodes.get(conn.target);
            if (!dst) return;
            const dstNode = dst.input || dst;

            if (dst.isBypass) {
                // If bypassed, ONLY allow main audio input (undefined or 'in_0')
                if (conn.targetPort && conn.targetPort !== 'in_0') return;
            }

            if (conn.source === 'src') {
                // trackOutputs logic
                if (conn.sourcePort === 'main') {
                    if (this.sequencerMainOut) {
                        this.sequencerMainOut.connect(dstNode);
                    }
                    return;
                }

                let trackIdx = 0;
                if (conn.sourcePort && conn.sourcePort.startsWith('track_')) {
                    trackIdx = parseInt(conn.sourcePort.split('_')[1]);
                }
                const outputNode = this.trackOutputs[trackIdx];
                if (outputNode) {
                    outputNode.connect(dstNode);
                }
                return;
            }

            const src = newFXNodes.get(conn.source);
            if (src && !src.isSource) {
                const srcNode = src.output || src;
                try { srcNode.connect(dstNode); } catch (e) { }
            }
        });

        // 3. Prepare final stage (out connections handled by step 2 if 'out' is a node)
        const connectedTracks = new Set<number>();

        graph.connections.forEach(c => {
            if (c.source === 'src') {
                // Only count as "connected" if the target node actually exists in the graph
                if (c.sourcePort?.startsWith('track_') && newFXNodes.has(c.target)) {
                    connectedTracks.add(parseInt(c.sourcePort.split('_')[1]));
                }
            }
        });

        // In strict mode, if main is not connected to a node, it stays disconnected.
        // We no longer automatically route to master if not in the graph.

        this.trackOutputs.forEach((output, idx) => {
            if (!connectedTracks.has(idx)) {
                // Tracks not explicitly connected in the graph route to the MIX bus.
                // Note: MIX bus only hits speakers if 'main' port is wired in graph.
                if (this.sequencerMainOut) output.connect(this.sequencerMainOut);
            }
        });

        this.activeFXNodes = newFXNodes;
    }

    private createFXNode(nData: FXNode) {
        if (!this.ctx) return null;

        // PASSTHROUGH / BYPASS LOGIC
        if (nData.bypass) {
            // Return a simple unity gain node acting as a wire
            const pass = this.ctx.createGain();
            pass.gain.value = 1.0;
            return {
                input: pass,
                output: pass,
                type: 'bypass',
                isBypass: true, // Marker for connection filtering
                disconnect: () => pass.disconnect()
            };
        }

        const p = nData.params || {};

        switch (nData.type) {
            case 'delay': {
                const input = this.ctx.createGain();
                const output = this.ctx.createGain();
                const delay = this.ctx.createDelay(1.0);
                const feedback = this.ctx.createGain();
                const wet = this.ctx.createGain();
                const dry = this.ctx.createGain();

                const beatTime = 60 / this.bpm;
                delay.delayTime.value = (p.time ?? 0.25) * beatTime;
                feedback.gain.value = p.feedback ?? 0.4;
                wet.gain.value = p.mix ?? 0.5;
                dry.gain.value = 1.0 - (p.mix ?? 0.5);

                input.connect(dry);
                dry.connect(output);
                input.connect(delay);
                delay.connect(feedback);
                feedback.connect(delay);
                delay.connect(wet);
                wet.connect(output);

                const node = {
                    input, output, delay, feedback, wet, dry, type: 'delay',
                    disconnect: () => {
                        input.disconnect();
                        output.disconnect();
                        delay.disconnect();
                        feedback.disconnect();
                        wet.disconnect();
                        dry.disconnect();
                    }
                };
                return node;
            }
            case 'filter': {
                const f = this.ctx.createBiquadFilter();
                f.type = 'lowpass';
                f.frequency.value = (p.freq ?? 0.5) * 5000 + 100;
                f.Q.value = (p.q ?? 0.1) * 20;
                return f;
            }
            case 'distortion': {
                const dist = this.ctx.createWaveShaper();
                dist.curve = this.makeDistortionCurve((p.drive ?? 0.5) * 400);
                dist.oversample = '4x';
                return dist;
            }
            case 'reverb': {
                const convolver = this.ctx.createConvolver();
                convolver.buffer = this.createReverbBuffer((p.time ?? 0.5) * 4, (p.decay ?? 0.5) * 10);
                const dry = this.ctx.createGain();
                const wet = this.ctx.createGain();
                const input = this.ctx.createGain();
                const output = this.ctx.createGain();

                wet.gain.value = p.mix ?? 0.5;
                dry.gain.value = 1 - (p.mix ?? 0.5);

                input.connect(convolver);
                convolver.connect(wet);
                wet.connect(output);
                input.connect(dry);
                dry.connect(output);

                const node = {
                    input, output, convolver, dry, wet, type: 'reverb',
                    disconnect: () => {
                        input.disconnect();
                        output.disconnect();
                        convolver.disconnect();
                        dry.disconnect();
                        wet.disconnect();
                    }
                };
                return node;
            }
            case 'compressor': {
                const comp = this.ctx.createDynamicsCompressor();
                comp.threshold.value = (p.threshold ?? 0.5) * -100;
                comp.ratio.value = (p.ratio ?? 0.5) * 20;
                comp.attack.value = (p.attack ?? 0.1);
                comp.release.value = (p.release ?? 0.2);
                return comp;
            }
            case 'mixer': {
                const input = this.ctx.createGain();
                const output = this.ctx.createGain();
                input.gain.value = 1.0;
                input.connect(output);
                const node = {
                    input, output, type: 'mixer',
                    disconnect: () => {
                        input.disconnect();
                        output.disconnect();
                    }
                };
                return node;
            }
            case 'parametricEQ': {
                const input = this.ctx.createGain();
                const output = this.ctx.createGain();
                const low = this.ctx.createBiquadFilter();
                const mid = this.ctx.createBiquadFilter();
                const high = this.ctx.createBiquadFilter();

                low.type = 'lowshelf';
                mid.type = 'peaking';
                high.type = 'highshelf';

                low.frequency.value = (p.lowFreq ?? 0.2) * 500;
                low.gain.value = (p.lowGain ?? 0.5) * 40 - 20;

                mid.frequency.value = (p.midFreq ?? 0.5) * 4000 + 500;
                mid.gain.value = (p.midGain ?? 0.5) * 40 - 20;
                mid.Q.value = (p.midQ ?? 0.1) * 10;

                high.frequency.value = (p.highFreq ?? 0.8) * 10000 + 4000;
                high.gain.value = (p.highGain ?? 0.5) * 40 - 20;

                input.connect(low);
                low.connect(mid);
                mid.connect(high);
                high.connect(output);

                const node = {
                    input, output, low, mid, high, type: 'parametricEQ',
                    disconnect: () => {
                        input.disconnect();
                        output.disconnect();
                        low.disconnect();
                        mid.disconnect();
                        high.disconnect();
                    }
                };
                return node;
            }
            default:
                return this.ctx.createGain();
        }
    }

    private makeDistortionCurve(amount: number) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; i++) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    updateFXParam(nodeId: string, param: string, value: number) {
        const node = this.activeFXNodes.get(nodeId);
        if (!node || !this.ctx) return;

        if (node.type === 'delay') {
            if (param === 'time') {
                const beatTime = 60 / this.bpm;
                node.delay.delayTime.setTargetAtTime(value * beatTime, this.ctx.currentTime, 0.05);
            }
            if (param === 'feedback') node.feedback.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
            if (param === 'mix') {
                node.wet.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                node.dry.gain.setTargetAtTime(1 - value, this.ctx.currentTime, 0.05);
            }
        } else if (node instanceof BiquadFilterNode) {
            if (param === 'freq') node.frequency.setTargetAtTime(value * 5000 + 100, this.ctx.currentTime, 0.05);
            if (param === 'q') node.Q.setTargetAtTime(value * 20, this.ctx.currentTime, 0.05);
        } else if (node instanceof WaveShaperNode) {
            if (param === 'drive') node.curve = this.makeDistortionCurve(value * 400);
        } else if (node.type === 'reverb') {
            if (param === 'mix') {
                node.wet.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                node.dry.gain.setTargetAtTime(1 - value, this.ctx.currentTime, 0.05);
            }
            if (param === 'time' || param === 'decay') {
                // Convolver buffer can't be changed in real-time easily without clicks,
                // but we can try to re-generate it. Actually, for performance/smoothness, 
                // we'll mostly modulate the mix. Changing time/decay will rebuild it.
                const time = param === 'time' ? value * 4 : (node.time || 0.5) * 4;
                const decay = param === 'decay' ? value * 10 : (node.decay || 0.5) * 10;
                node.convolver.buffer = this.createReverbBuffer(time, decay);
            }
        } else if (node instanceof DynamicsCompressorNode) {
            if (param === 'threshold') node.threshold.setTargetAtTime(value * -100, this.ctx.currentTime, 0.05);
            if (param === 'ratio') node.ratio.setTargetAtTime(value * 20, this.ctx.currentTime, 0.05);
            if (param === 'attack') node.attack.setTargetAtTime(value, this.ctx.currentTime, 0.05);
            if (param === 'release') node.release.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        } else if (node.type === 'mixer') {
            if (param === 'gain') node.input.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        } else if (node.type === 'parametricEQ') {
            if (param === 'lowFreq') node.low.frequency.setTargetAtTime(value * 500, this.ctx.currentTime, 0.05);
            if (param === 'lowGain') node.low.gain.setTargetAtTime(value * 40 - 20, this.ctx.currentTime, 0.05);
            if (param === 'midFreq') node.mid.frequency.setTargetAtTime(value * 4000 + 500, this.ctx.currentTime, 0.05);
            if (param === 'midGain') node.mid.gain.setTargetAtTime(value * 40 - 20, this.ctx.currentTime, 0.05);
            if (param === 'midQ') node.mid.Q.setTargetAtTime(value * 10, this.ctx.currentTime, 0.05);
            if (param === 'highFreq') node.high.frequency.setTargetAtTime(value * 10000 + 4000, this.ctx.currentTime, 0.05);
            if (param === 'highGain') node.high.gain.setTargetAtTime(value * 40 - 20, this.ctx.currentTime, 0.05);
        }
    }
}

export const audioEngine = new AudioEngine();
