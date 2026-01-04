import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    songData: any;
    currentSongId: string | null;
    onSaveComplete: (newSongId: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
    isOpen,
    onClose,
    user,
    songData,
    currentSongId,
    onSaveComplete
}) => {
    const [songName, setSongName] = useState(songData.name || "My Pulse Song");
    const [linerNotes, setLinerNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    if (!isOpen || !user) return null;

    const handleSave = async () => {
        setLoading(true);
        try {
            const songPayload = {
                userId: user.uid,
                name: songName,
                data: JSON.stringify(songData),
                createdAt: serverTimestamp(),
                isPublic: true,
                authorName: user.displayName || 'Anonymous',
                authorPhotoUrl: user.photoURL,
                linerNotes: linerNotes
            };

            let docRef;
            if (currentSongId) {
                // Update existing
                docRef = doc(db, 'songs', currentSongId);
                await setDoc(docRef, songPayload, { merge: true });
                setSavedId(currentSongId);
            } else {
                // Create new
                const colRef = collection(db, 'songs');
                const doc = await addDoc(colRef, songPayload);
                setSavedId(doc.id);
                onSaveComplete(doc.id);
            }
        } catch (error) {
            console.error("Error saving song:", error);
            alert("Failed to save song. Check console.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = () => {
        if (!savedId) return;
        const link = `${window.location.origin}?song=${savedId}`;
        navigator.clipboard.writeText(link);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                        Save & Share
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {!savedId ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Song Name</label>
                                <input
                                    type="text"
                                    value={songName}
                                    onChange={(e) => setSongName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                                    placeholder="Enter song name..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Liner Notes / Welcome Message</label>
                                <textarea
                                    value={linerNotes}
                                    onChange={(e) => setLinerNotes(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors h-24 resize-none"
                                    placeholder="Tell the listener about this track..."
                                />
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={loading || !songName.trim()}
                                className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-sky-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {loading ? 'Saving to Could...' : 'Save to Cloud'}
                            </button>
                        </>
                    ) : (
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Song Saved!</h3>
                                <p className="text-slate-400 text-sm">Your creation is safe in the cloud.</p>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={`${window.location.origin}?song=${savedId}`}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-400 text-sm truncate focus:outline-none"
                                />
                                <button
                                    onClick={handleCopyLink}
                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all text-white ${copySuccess ? 'bg-green-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                                >
                                    {copySuccess ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
