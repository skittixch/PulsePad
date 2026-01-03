import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

interface SongListModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onLoadSong: (songData: any, songId: string) => void;
}

export const SongListModal: React.FC<SongListModalProps> = ({ isOpen, onClose, user, onLoadSong }) => {
    const [songs, setSongs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && user) {
            fetchSongs();
        }
    }, [isOpen, user]);

    const fetchSongs = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const q = query(
                collection(db, 'songs'),
                where('userId', '==', user.uid),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const songList = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));
            setSongs(songList);
        } catch (error) {
            console.error("Error fetching songs:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, songId: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this song?")) return;

        setDeletingId(songId);
        try {
            await deleteDoc(doc(db, 'songs', songId));
            setSongs(prev => prev.filter(s => s.id !== songId));
        } catch (error) {
            console.error("Error deleting song:", error);
            alert("Failed to delete song.");
        } finally {
            setDeletingId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                        My Saved Songs
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading songs...</div>
                    ) : songs.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                            <p>No saved songs found.</p>
                            <p className="text-xs mt-2">Create something awesome and save it!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {songs.map(song => (
                                <div
                                    key={song.id}
                                    onClick={() => {
                                        try {
                                            const data = JSON.parse(song.data);
                                            onLoadSong(data, song.id);
                                            onClose();
                                        } catch (e) {
                                            console.error("Error parsing song data", e);
                                            alert("Error loading song data.");
                                        }
                                    }}
                                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-sky-500/50 hover:bg-slate-900 transition-all cursor-pointer group flex items-center justify-between"
                                >
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white truncate group-hover:text-sky-400 transition-colors">{song.name}</h3>
                                        <p className="text-xs text-slate-500">
                                            {song.createdAt?.toDate ? song.createdAt.toDate().toLocaleDateString() : 'Unknown date'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, song.id)}
                                        disabled={deletingId === song.id}
                                        className="p-2 text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Delete Song"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
