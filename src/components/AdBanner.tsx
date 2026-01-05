import React, { useState } from 'react';

interface AdBannerProps {
    variant?: 'mock' | 'real';
    adClient?: string; // e.g., "ca-pub-XXXXXXXXXXXXXXXX"
    adSlot?: string;   // e.g., "1234567890"
}

export const AdBanner: React.FC<AdBannerProps> = ({ variant = 'mock', adClient, adSlot }) => {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) return null;

    if (variant === 'real') {
        // REAL ADSENSE CODE
        // Usage: <AdBanner variant="real" adClient="ca-pub-YOUR_ID" adSlot="YOUR_SLOT_ID" />
        return (
            <div className="w-full bg-slate-950 border-t border-slate-800 shrink-0 flex items-center justify-center relative py-2">
                <div className="w-full max-w-[728px] h-[90px] bg-slate-900 flex items-center justify-center overflow-hidden">
                    {/* 
                        NOTE TO USER: Uncomment the script below once you have your AdSense account approved.
                        You typically need to add the <script async src="..."> tag to your index.html head as well.
                     */}
                    <ins className="adsbygoogle"
                        style={{ display: 'inline-block', width: '728px', height: '90px' }}
                        data-ad-client={adClient}
                        data-ad-slot={adSlot}></ins>
                    <script>
                        (adsbygoogle = window.adsbygoogle || []).push({ });
                    </script>
                    <span className="text-slate-600 font-mono text-xs">AdSense Code Placeholder (Uncomment in code)</span>
                </div>
                {/* Optional Dismiss for Real Ads? Usually forbidden by Ad networks, so maybe don't include button here */}
            </div>
        );
    }

    return (
        <div className="w-full bg-slate-950 border-t border-slate-800 shrink-0 flex items-center justify-center relative py-2">
            <div className="w-full max-w-[728px] h-[90px] bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-lg shadow-inner">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">Advertisement Space</span>
                <span className="text-slate-600 text-[10px]">728x90 Leaderboard</span>
                <div className="mt-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] rounded-full border border-emerald-500/20">
                    Ads help support PulseStudio (Hidden when Logged In)
                </div>
            </div>

            <button
                onClick={() => setIsVisible(false)}
                className="absolute top-2 right-4 p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                title="Dismiss (In real app, this might require Premium)"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    );
};
