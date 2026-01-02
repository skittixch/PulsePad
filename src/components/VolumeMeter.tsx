import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../audioEngine';

export const VolumeMeter: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const peakRef = useRef<number>(0);
    const peakHoldRef = useRef<number>(0);
    const lastPeakTimeRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const analyser = audioEngine.analyser;
        if (!analyser) {
            // Wait for audio engine to be initialized
            rafRef.current = requestAnimationFrame(() => { });
            return;
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const render = () => {
            if (!canvas || !ctx) return;

            analyser.getByteTimeDomainData(dataArray);

            // Calculate RMS or Peak
            let max = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const val = Math.abs(dataArray[i] / 128 - 1);
                if (val > max) max = val;
            }

            // Smooth the level
            peakRef.current = peakRef.current * 0.8 + max * 0.2;

            // Peak hold logic
            const now = Date.now();
            if (max >= 0.99) {
                peakHoldRef.current = 1;
                lastPeakTimeRef.current = now;
            } else if (now - lastPeakTimeRef.current > 1000) {
                peakHoldRef.current *= 0.95;
            }

            // Draw
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = '#0f172a'; // slate-900
            ctx.fillRect(0, 0, w, h);

            // Level Bar
            const barHeight = peakRef.current * h;
            const gradient = ctx.createLinearGradient(0, h, 0, 0);
            gradient.addColorStop(0, '#0ea5e9'); // sky-500
            gradient.addColorStop(0.7, '#0ea5e9');
            gradient.addColorStop(0.9, '#f59e0b'); // amber-500
            gradient.addColorStop(1, '#f43f5e'); // rose-500

            ctx.fillStyle = gradient;
            ctx.fillRect(2, h - barHeight, w - 4, barHeight);

            // Peak Indicator
            if (peakHoldRef.current > 0.01) {
                ctx.fillStyle = `rgba(244, 63, 94, ${peakHoldRef.current})`;
                ctx.fillRect(2, 0, w - 4, 3);
            }

            // Markings
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.font = '7px Inter';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';

            const dbs = [
                { db: 0, label: '0' },
                { db: -3, label: '-3' },
                { db: -6, label: '-6' },
                { db: -12, label: '-12' },
                { db: -24, label: '-24' }
            ];

            dbs.forEach(mark => {
                // dB to linear: 10^(db/20)
                const linear = Math.pow(10, mark.db / 20);
                const y = h - (linear * h);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
                if (mark.label) {
                    ctx.fillText(mark.label, w - 12, y + 8);
                }
            });

            rafRef.current = requestAnimationFrame(render);
        };

        render();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <div className="h-full w-6 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-1 relative">
            <canvas
                ref={canvasRef}
                width={24}
                height={200}
                className="w-full h-full"
            />
        </div>
    );
};
