import React, { useEffect, useRef, useState } from 'react';

interface ScalePieMenuProps {
    isOpen: boolean;
    mousePos: { x: number, y: number };
    currentScale: string;
    onSelectScale: (scaleName: string) => void;
    onClose: () => void;
}

const CIRCLE_OF_FIFTHS = [
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'
];

// Map standard notes to our Circle of Fifths positions
const NOTE_ANGLES: { [key: string]: number } = {};
CIRCLE_OF_FIFTHS.forEach((note, i) => {
    // 0 degrees is usually East (3pm). Music circle usually puts C at Top (12pm).
    // So C = -90 deg.
    // Each step is 360/12 = 30 deg.
    // Index 0 (C) -> -90
    // Index 1 (G) -> -60
    NOTE_ANGLES[note] = (i * 30) - 90;
});

const SCALE_TYPES = ['Maj Pent', 'Min Pent', 'Maj', 'Min', 'Blues']; // Kept for reference or future expansion

export const ScalePieMenu: React.FC<ScalePieMenuProps> = ({ isOpen, mousePos, currentScale, onSelectScale, onClose }) => {
    const [hoveredNote, setHoveredNote] = useState<string | null>(null);
    const [hoveredType, setHoveredType] = useState<string>('Maj Pent');
    const menuRef = useRef<HTMLDivElement>(null);

    // Config
    const OUTER_RADIUS = 250;

    const LABEL_RADIUS = 180;

    // Calculate Hover Logic
    useEffect(() => {
        if (!isOpen) return;

        const handleMove = (e: MouseEvent) => {
            if (!menuRef.current) return;
            // Relative to center of menu (which is centered on initial mousePos, but fixed?)
            // Actually, usually radial menus spawn centered on mouse.
            // But if we move mouse, we calculate angle/dist from center of MENU.
            // So we need to store the CENTER position. 
            // Here `mousePos` prop is the center of the menu.

            const dx = e.clientX - mousePos.x;
            const dy = e.clientY - mousePos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Angle (-180 to 180), 0 is East.
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);

            // Map to our Circle indices
            // C is at -90. so angle should be normalized relative to -90?
            // Angle increases CW (y positive down).

            // 12 segments = 30 deg each.
            // Slice 0 (C) centers at -90. So covers -105 to -75.

            // Normalize angle to 0-360 starting from -105?
            // (angle + 105 + 360) % 360 / 30

            // Let's debug: C is Top (-90). G is 1 o'clock (-60).
            // So slice C is [-105, -75].
            // Add 105. -> [0, 30].
            // So index = floor((angle + 105 + 360) % 360 / 30).

            const segmentIdx = Math.floor(((angle + 105 + 360) % 360) / 30);
            const note = CIRCLE_OF_FIFTHS[segmentIdx % 12];
            setHoveredNote(note);

            // Distance determines Type?
            // 3 Bands?
            // > 140: Major / Minor (Toggle?)
            // < 140: Pentatonic?
            // Let's keep it simple: Just Root selection for now, 
            // and maybe Type is selected by MODIFIERS or hovering concentric rings?

            // Let's implement Rings:
            // R < 100: Pentatonic
            // 100 < R < 160: Minor
            // R > 160: Major

            if (dist < 100) setHoveredType('Min Pent'); // Inner
            else if (dist < 150) setHoveredType('Minor'); // Middle
            else setHoveredType('Major'); // Outer

            // Wait, Pentatonic is usually favored?
            // Let's make:
            // Center (Dead Zone): No Selection
            // Ring 1 (60-120): Pentatonic
            // Ring 2 (120-180): Natural (Maj/Min)
            // Ring 3 (180+): Blues?

            if (dist < 60) {
                setHoveredNote(null);
            }
        };

        const handleUp = () => {
            if (hoveredNote) {
                // Construct scale name
                // e.g. "C Maj Pent"
                // Or "C Maj"

                // If Ring 1 (Pent):
                // If Ring 2 (Natural):

                // Wait, Minor Pentatonic vs Major Pentatonic?
                // Usually "C Min Pent" is distinct from "C Maj Pent".
                // Relative minor? A Min Pent == C Maj Pent.
                // Let's stick to Root + Type.

                // Logic:
                // "Maj" or "Min" depends on... maybe click?
                // Or maybe split rings into:
                // Inner: Major Pent
                // Mid: Minor Pent
                // Outer: Major
                // Far Outer: Minor

                // This is getting complex.
                // Blender pie menus are 2D fast.
                // Let's default to "Maj Pent" if inner, "Min Pent" if mid, "Maj" outer?

                // SIMPLIFIED ZODIAC:
                // 12 Slices.
                // Radial distance controls variety?
                // Inner: Pentatonic
                // Outer: Diatonic (7-note)

                // If we hold Shift -> Minor?
                // The user said "creative way".

                // Let's try:
                // Ring 1 (Inner): Major Pentatonic
                // Ring 2 (Mid): Minor Pentatonic
                // Ring 3 (Outer): Major (Diatonic)
                // Ring 4 (Edge): Minor (Diatonic)

                // Or just use the hoveredType I set above.
                // For now:
                // < 100: Min Pent
                // < 150: Min
                // > 150: Maj

                let finalType = hoveredType;
                // Hack for refinement later

                onSelectScale(`${hoveredNote} ${finalType}`);
                onClose();
            } else {
                onClose();
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        // Also listen for KeyUp of 'z'
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'z') handleUp();
        };
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isOpen, mousePos, hoveredNote, hoveredType, onSelectScale, onClose]);

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

                        return (
                            <g key={note}>
                                <path
                                    d={`M 0 0 L ${p1x} ${p1y} A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${p2x} ${p2y} Z`}
                                    fill={isHovered ? '#6366f1' : 'transparent'}
                                    fillOpacity={isHovered ? 0.2 : 0}
                                    stroke="#818cf8"
                                    strokeWidth={isHovered ? 2 : 0.5}
                                    strokeOpacity={0.3}
                                />
                                {/* Label */}
                                <g transform={`translate(${Math.cos((i * 30 - 90) * Math.PI / 180) * LABEL_RADIUS}, ${Math.sin((i * 30 - 90) * Math.PI / 180) * LABEL_RADIUS})`}>
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill={isHovered ? '#fff' : '#94a3b8'}
                                        className={`text-xl font-black ${isHovered ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : ''}`}
                                        style={{ fontSize: isHovered ? '24px' : '16px', transition: 'all 0.1s' }}
                                    >
                                        {note}
                                    </text>
                                </g>
                            </g>
                        );
                    })}

                    {/* Rings Visualization (Concentric feedback) */}
                    {/* Inner Ring (Min Pent) */}
                    <circle cx="0" cy="0" r="100" fill="none" stroke="#6366f1" strokeOpacity="0.2" strokeDasharray="4 4" />
                    {/* Middle Ring (Min) */}
                    <circle cx="0" cy="0" r="150" fill="none" stroke="#6366f1" strokeOpacity="0.2" strokeDasharray="4 4" />

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
