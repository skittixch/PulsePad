import React, { useEffect, useRef, useState } from 'react';

interface ScalePieMenuProps {
    isOpen: boolean;
    mousePos: { x: number, y: number };
    currentScale: string;
    onSelectScale: (scaleName: string) => void;
    onPreviewChord: (scaleName: string, direction: 'up' | 'down') => void;
    onClose: () => void;
}

const CIRCLE_OF_FIFTHS = [
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'
];

// Map standard notes to our Circle of Fifths positions
const NOTE_ANGLES: { [key: string]: number } = {};
CIRCLE_OF_FIFTHS.forEach((note, i) => {
    NOTE_ANGLES[note] = (i * 30) - 90;
});


export const ScalePieMenu: React.FC<ScalePieMenuProps> = ({ isOpen, mousePos, currentScale, onSelectScale, onPreviewChord, onClose }) => {
    const [hoveredNote, setHoveredNote] = useState<string | null>(null);
    const [hoveredType, setHoveredType] = useState<string>('Maj Pent');
    const menuRef = useRef<HTMLDivElement>(null);

    // Tracking for direction
    const lastMouseState = useRef({ dist: 0, angle: 0, scaleName: '' });

    // Config
    const OUTER_RADIUS = 250;
    const LABEL_RADIUS = 180;

    // Play current chord on open
    useEffect(() => {
        if (isOpen) {
            onPreviewChord(currentScale, 'up');
        }
    }, [isOpen, onPreviewChord, currentScale]); // Play once when opening or if scale changes while open

    // Calculate Hover Logic
    useEffect(() => {
        if (!isOpen) {
            lastMouseState.current = { dist: 0, angle: 0, scaleName: '' };
            return;
        }

        const handleMove = (e: MouseEvent) => {
            if (!menuRef.current) return;
            const dx = e.clientX - mousePos.x;
            const dy = e.clientY - mousePos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const segmentIdx = Math.floor(((angle + 105 + 360) % 360) / 30);
            const note = dist < 60 ? null : CIRCLE_OF_FIFTHS[segmentIdx % 12];

            let type = 'Major';
            if (dist < 100) type = 'Min Pent';
            else if (dist < 150) type = 'Minor';
            else type = 'Major';

            const scaleName = note ? `${note} ${type}` : '';

            // Only trigger if scale changes
            if (scaleName && scaleName !== lastMouseState.current.scaleName) {
                const dDist = dist - lastMouseState.current.dist;

                // Normalizing angle delta to handle -180/180 wrap
                let dAngle = angle - lastMouseState.current.angle;
                if (dAngle > 180) dAngle -= 360;
                if (dAngle < -180) dAngle += 360;

                // Outward (>0) or Clockwise (>0) is 'up'
                const direction = (dDist > 0 || dAngle > 0) ? 'up' : 'down';
                onPreviewChord(scaleName, direction);
            }

            setHoveredNote(note);
            setHoveredType(type);
            lastMouseState.current = { dist, angle, scaleName };
        };

        const handleUp = () => {
            if (hoveredNote) {
                onSelectScale(`${hoveredNote} ${hoveredType}`);
                onClose();
            } else {
                onClose();
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'z') handleUp();
        };
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isOpen, mousePos, hoveredNote, hoveredType, onSelectScale, onPreviewChord, onClose]);


    if (!isOpen) return null;

    return (
        <div
            ref={menuRef}
            className="fixed top-0 left-0 z-[9999] pointer-events-none"
            style={{
                left: mousePos.x,
                top: mousePos.y
            }}
        >
            {/* Centered Container offset by 0,0 since we are absolute positioned at mousePos */}
            <div className="relative -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] flex items-center justify-center">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-indigo-900/40 blur-[100px] rounded-full" />

                <svg width="500" height="500" viewBox="-250 -250 500 500" className="drop-shadow-2xl">
                    {/* Defs for Glows */}
                    <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <radialGradient id="starGradient">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                        </radialGradient>
                    </defs>

                    {/* Background Circle */}
                    <circle r={OUTER_RADIUS} fill="url(#starGradient)" stroke="#4f46e5" strokeWidth="1" strokeOpacity="0.3" />

                    {/* Star Lines (Connecting Fifths? Or Chromatic) */}
                    {/* Connect C to F to Bb... (Fifth circle is continuous) */}
                    {/* Maybe connect notes to form a star? */}

                    {/* Slices */}
                    {CIRCLE_OF_FIFTHS.map((note, i) => {
                        const startAngle = (i * 30 - 105) * (Math.PI / 180);
                        const endAngle = (i * 30 - 75) * (Math.PI / 180);

                        // Large Slice Path
                        const p1x = Math.cos(startAngle) * OUTER_RADIUS;
                        const p1y = Math.sin(startAngle) * OUTER_RADIUS;
                        const p2x = Math.cos(endAngle) * OUTER_RADIUS;
                        const p2y = Math.sin(endAngle) * OUTER_RADIUS;

                        const isHovered = note === hoveredNote;
                        const [currentRoot] = currentScale.split(' ');
                        const isCurrent = note === currentRoot;

                        return (
                            <g key={note}>
                                <path
                                    d={`M 0 0 L ${p1x} ${p1y} A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${p2x} ${p2y} Z`}
                                    fill={isHovered ? '#6366f1' : (isCurrent ? '#6366f1' : 'transparent')}
                                    fillOpacity={isHovered ? 0.2 : (isCurrent ? 0.05 : 0)}
                                    stroke={isCurrent ? '#818cf8' : '#818cf8'}
                                    strokeWidth={isHovered ? 2 : (isCurrent ? 1.5 : 0.5)}
                                    strokeOpacity={isHovered ? 0.6 : (isCurrent ? 0.4 : 0.3)}
                                />
                                {/* Label */}
                                <g transform={`translate(${Math.cos((i * 30 - 90) * Math.PI / 180) * LABEL_RADIUS}, ${Math.sin((i * 30 - 90) * Math.PI / 180) * LABEL_RADIUS})`}>
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill={isHovered ? '#fff' : (isCurrent ? '#a5b4fc' : '#94a3b8')}
                                        className={`text-xl font-black ${isHovered || isCurrent ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]' : ''}`}
                                        style={{
                                            fontSize: isHovered ? '24px' : (isCurrent ? '20px' : '16px'),
                                            transition: 'all 0.1s',
                                            filter: isCurrent && !isHovered ? 'drop-shadow(0 0 5px rgba(129, 140, 248, 0.5))' : 'none'
                                        }}
                                    >
                                        {note}
                                    </text>
                                </g>
                            </g>
                        );
                    })}

                    {/* Rings Visualization (Concentric feedback) */}
                    {/* Inner Ring (Min Pent) */}
                    <circle cx="0" cy="0" r="100" fill="none" stroke="#6366f1" strokeOpacity={currentScale.includes('Min Pent') ? 0.5 : 0.2} strokeDasharray={currentScale.includes('Min Pent') ? "0" : "4 4"} strokeWidth={currentScale.includes('Min Pent') ? 2 : 1} />
                    {/* Middle Ring (Min) */}
                    <circle cx="0" cy="0" r="150" fill="none" stroke="#6366f1" strokeOpacity={currentScale.includes('Minor') && !currentScale.includes('Pent') ? 0.5 : 0.2} strokeDasharray={currentScale.includes('Minor') && !currentScale.includes('Pent') ? "0" : "4 4"} strokeWidth={currentScale.includes('Minor') && !currentScale.includes('Pent') ? 2 : 1} />
                    {/* Outer Border for Major */}
                    <circle cx="0" cy="0" r={OUTER_RADIUS} fill="none" stroke="#6366f1" strokeOpacity={currentScale.includes('Major') || (currentScale.includes('Maj') && !currentScale.includes('Min')) ? 0.5 : 0.2} strokeDasharray={currentScale.includes('Major') ? "0" : "4 4"} strokeWidth={currentScale.includes('Major') ? 2 : 1} />

                    {/* Active Selection Text in Center */}
                    <text
                        x="0" y="0"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-white fill-white text-2xl font-black drop-shadow-lg"
                        filter="url(#glow)"
                    >
                        {hoveredNote ? `${hoveredNote} ${hoveredType}` : currentScale}
                    </text>
                </svg>
            </div>
        </div>
    );
};
