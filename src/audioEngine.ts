import type { SoundConfig, Grid, RowConfig, FXGraph, FXNode } from './types';
import { DEFAULT_SOUND_CONFIG } from './constants';

export class AudioEngine {
    ctx: AudioContext | null = null;
    masterGain: GainNode | null = null;
    analyser: AnalyserNode | null = null;
    sequencerOutput: GainNode | null = null;
    soundConfig: SoundConfig = { ...DEFAULT_SOUND_CONFIG };
    activeFXNodes: Map<string, any> = new Map();
    avgColor: { r: number, g: number, b: number, bright: number } = { r: 0, g: 0, b: 0, bright: 0 };
    currentFXGraph: FXGraph | null = null;
    lfoStartTime: number = 0;
    bpm: number = 120;
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

        this.sequencerOutput = this.ctx.createGain();
        // Default connection
        this.sequencerOutput.connect(this.masterGain);

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

    createKick(time: number, rowGain = 0.8, config?: SoundConfig) {
        if (!this.ctx || !this.sequencerOutput) return;
        const conf = config ? config.kick : this.soundConfig.kick;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sequencerOutput);

        osc.frequency.setValueAtTime(conf.freq, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + conf.decay);

        gain.gain.setValueAtTime(rowGain, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + conf.decay);

        osc.start(time);
        osc.stop(time + conf.decay);
    }

    createSnare(time: number, rowGain = 0.8, config?: SoundConfig) {
        if (!this.ctx || !this.sequencerOutput) return;
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
        gain.connect(this.sequencerOutput);
        noise.start(time);

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        oscGain.gain.setValueAtTime((1 - conf.mix) * rowGain, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(oscGain);
        oscGain.connect(this.sequencerOutput);
        osc.start(time);
        osc.stop(time + 0.15);
    }

    createHiHat(time: number, rowGain = 0.8, config?: SoundConfig) {
        if (!this.ctx || !this.sequencerOutput) return;
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
        gain.connect(this.sequencerOutput);
        noise.start(time);
    }

    createSynth(freq: number, time: number, durationSteps = 1, bpm: number, rowGain = 0.8, config?: SoundConfig) {
        const secondsPerStep = 60.0 / bpm / 4;
        const durationSecs = durationSteps * secondsPerStep;
        const voice = this.triggerSynth(freq, rowGain, time, config);
        if (!voice) return;

        const conf = config ? config.synth : this.soundConfig.synth;
        const release = Math.max(0.05, Math.min(durationSecs, conf.release));
        voice.gain.gain.setValueAtTime(0.1 * rowGain, time + durationSecs - 0.01);
        voice.gain.gain.exponentialRampToValueAtTime(0.01, time + durationSecs + release);
        voice.osc.stop(time + durationSecs + release + 0.1);
    }

    triggerSynth(freq: number, rowGain = 0.8, startTime?: number, config?: SoundConfig): any {
        if (!this.ctx || !this.sequencerOutput) return null;
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
        gain.connect(this.sequencerOutput);

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

    playStep(grid: Grid, stepIndex: number, time: number, configs: RowConfig[], bpm: number, trackGain: number = 1.0, soundConfig?: SoundConfig) {
        if (!this.ctx) return;

        let totalR = 0, totalG = 0, totalB = 0, count = 0;

        grid.forEach((row, rowIndex) => {
            const note = row[stepIndex];
            if (note) {
                const config = configs[rowIndex];
                const finalGain = (config.gain ?? 0.8) * trackGain;
                const freq = config.type === 'synth' ? config.freq * Math.pow(2, note.oct || 0) : config.freq;

                if (config.type === 'synth') {
                    this.createSynth(freq, time, note.d, bpm, finalGain, soundConfig);
                } else if (config.type === 'kick' || config.type === 'snare' || config.type === 'hat') {
                    if (note.d > 1) {
                        const totalHits = note.d * 2;
                        const subtickSecs = (60 / bpm / 4) / 2;
                        for (let i = 0; i < totalHits; i++) {
                            const hitTime = time + (i * subtickSecs);
                            const velocity = 0.7 + (i / (totalHits - 1)) * 0.3;
                            const hitGain = finalGain * velocity;
                            if (config.type === 'kick') this.createKick(hitTime, hitGain, soundConfig);
                            else if (config.type === 'snare') this.createSnare(hitTime, hitGain, soundConfig);
                            else if (config.type === 'hat') this.createHiHat(hitTime, hitGain, soundConfig);
                        }
                    } else {
                        if (config.type === 'kick') this.createKick(time, finalGain, soundConfig);
                        else if (config.type === 'snare') this.createSnare(time, finalGain, soundConfig);
                        else if (config.type === 'hat') this.createHiHat(time, finalGain, soundConfig);
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
        if (!this.sequencerOutput || !this.masterGain) return;

        // 1. Prepare new nodes
        const newFXNodes = new Map<string, any>();
        graph.nodes.forEach(nData => {
            let node;
            if (nData.type === 'source') {
                node = { input: this.sequencerOutput, output: this.sequencerOutput };
            } else if (nData.type === 'output') {
                node = { input: this.masterGain, output: this.masterGain };
            } else {
                node = this.createFXNode(nData);
            }
            if (node) newFXNodes.set(nData.id, node);
        });

        // 2. Map internal connections (don't connect to source/output yet)
        graph.connections.forEach(conn => {
            if (conn.source === 'src' || conn.target === 'out') return;
            const src = newFXNodes.get(conn.source);
            const dst = newFXNodes.get(conn.target);
            if (src && dst) {
                const srcNode = src.output || src;
                const dstNode = dst.input || dst;
                try { srcNode.connect(dstNode); } catch (e) { }
            }
        });

        // 3. Prepare final stage (connect to masterGain)
        graph.connections.forEach(conn => {
            if (conn.target === 'out') {
                const src = newFXNodes.get(conn.source);
                if (src) {
                    const srcNode = src.output || src;
                    try { srcNode.connect(this.masterGain); } catch (e) { }
                }
            }
        });

        // 4. ATOMIC SWAP: Disconnect sequencer and connect to new entry points
        // We disconnect but immediately reconnect to the new chain to minimize the gap.
        this.sequencerOutput.disconnect();

        // 5. Connect entry points
        let hasEntryConnection = false;
        graph.connections.forEach(conn => {
            if (conn.source === 'src') {
                const dst = newFXNodes.get(conn.target);
                if (dst) {
                    const dstNode = dst.input || dst;
                    try {
                        this.sequencerOutput!.connect(dstNode);
                        hasEntryConnection = true;
                    } catch (e) { }
                }
            }
        });

        // 6. Safety fallback: if nothing is downstream of source, connect to master
        if (!hasEntryConnection) {
            try { this.sequencerOutput.connect(this.masterGain); } catch (e) { }
        }

        // 7. Cleanup old nodes (Web Audio nodes are GC'd when disconnected and unreferenced)
        this.activeFXNodes.forEach(node => {
            if (node.disconnect) node.disconnect(); // Some custom nodes have cleanup
        });
        this.activeFXNodes = newFXNodes;
    }

    private createFXNode(nData: FXNode) {
        if (!this.ctx) return null;
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

                return { input, output, delay, feedback, wet, dry, type: 'delay' };
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

                return { input, output, convolver, dry, wet, type: 'reverb' };
            }
            case 'compressor': {
                const comp = this.ctx.createDynamicsCompressor();
                comp.threshold.value = (p.threshold ?? 0.5) * -100;
                comp.ratio.value = (p.ratio ?? 0.5) * 20;
                comp.attack.value = (p.attack ?? 0.1);
                comp.release.value = (p.release ?? 0.2);
                return comp;
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
        }
    }
}

export const audioEngine = new AudioEngine();
