import React, { useEffect, useState } from 'react';

interface WelcomeOverlayProps {
    songName: string;
    authorName?: string;
    authorPhotoUrl?: string;
    linerNotes?: string;
    onDismiss: () => void;
}

export const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({
    songName,
    authorName,
    authorPhotoUrl,
    linerNotes,
    onDismiss
}) => {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        const timer = setTimeout(() => setVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setExiting(true);
        setTimeout(onDismiss, 500); // Wait for exit animation
    };

    return (
        <div
            className={`fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl transition-opacity duration-500 ${visible && !exiting ? 'opacity-100' : 'opacity-0'}`}
        >
            <div
                className={`max-w-2xl w-full mx-4 p-8 text-center transform transition-all duration-700 ease-out ${visible && !exiting ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}
            >
                {/* Author Photo */}
                {authorPhotoUrl && (
                    <div className="mb-6 relative inline-block">
                        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.4)] mx-auto relative z-10">
                            <img src={authorPhotoUrl} alt={authorName} className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-20 animate-pulse" />
                    </div>
                )}

                {/* Song Title */}
                <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 mb-2 tracking-tight drop-shadow-2xl">
                    {songName}
                </h1>

                {/* Author Name */}
                {authorName && (
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em] mb-8">
                        Created by <span className="text-slate-200">{authorName}</span>
                    </p>
                )}

                {/* Liner Notes */}
                {linerNotes && (
                    <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 mb-8 backdrop-blur-sm shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-sky-500 to-indigo-500 opacity-50" />
                        <p className="text-slate-300 text-lg leading-relaxed font-light italic">
                            "{linerNotes}"
                        </p>
                    </div>
                )}

                {/* Dismiss Button */}
                <button
                    onClick={handleDismiss}
                    className="group relative px-8 py-4 bg-white text-slate-950 rounded-full font-black text-lg tracking-wide hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] overflow-hidden"
                >
                    <span className="relative z-10 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ENTER STUDIO
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-sky-200 to-indigo-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </div>
        </div>
    );
};
