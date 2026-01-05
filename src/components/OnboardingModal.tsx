
import React, { useState } from 'react';

export const OnboardingModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [animatingOut, setAnimatingOut] = useState(false);

    const handleClose = () => {
        setAnimatingOut(true);
        setTimeout(onClose, 500);
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl transition-opacity duration-500 ${animatingOut ? 'opacity-0' : 'opacity-100'}`}>
            <div className="max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 relative overflow-hidden flex flex-col items-center text-center">

                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-sky-500 via-rose-500 to-emerald-500" />
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-sky-500/20 rounded-full blur-[100px]" />
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-rose-500/20 rounded-full blur-[100px]" />

                <h1 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tighter">
                    WELCOME TO <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">PULSEPAD</span>
                </h1>

                <div className="flex items-center gap-2 mb-6">
                    <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold uppercase tracking-widest">
                        Early Alpha Preview
                    </span>
                </div>

                <div className="prose prose-invert max-w-2xl mb-8 text-slate-300">
                    <p>
                        You are one of the first to try this tool. Expect bugs, rapid changes, and potential data resets.
                    </p>
                    <p className="text-xl font-medium tracking-tight mt-4 italic opacity-80">
                        "vibe coded with 💖" by Eric Bacus
                    </p>
                </div>

                {/* Video Placeholder */}
                <div className="w-full aspect-video bg-slate-950 rounded-xl border border-slate-800 shadow-inner mb-8 relative group overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-slate-600 font-mono text-sm group-hover:text-sky-500 transition-colors flex flex-col items-center gap-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                            <span>DEMO VIDEO COMING SOON</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <a
                        href="https://github.com/skittixch/PulseStudio"
                        target="_blank"
                        rel="noreferrer"
                        className="px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-bold"
                    >
                        View on GitHub
                    </a>
                    <button
                        onClick={handleClose}
                        className="px-8 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 text-white font-bold shadow-lg hover:shadow-sky-500/25 hover:scale-105 transition-all transform"
                    >
                        Get Started
                    </button>
                </div>

                <div className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                    v0.1.0 • Built with React & WebAudio
                </div>
            </div>
        </div>
    );
};

