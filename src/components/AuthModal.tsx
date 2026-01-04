import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, user }) => {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleLogin = async (provider: any) => {
        setLoading(true);
        setError(null);
        try {
            await signInWithPopup(auth, provider);
            onClose();
        } catch (err: any) {
            console.error("Login failed", err);
            setError(err.message || "Failed to log in");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                        {user ? 'Account' : 'Sign In'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {user ? (
                        <div className="text-center space-y-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full mx-auto flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    user.email?.[0].toUpperCase() || 'U'
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">{user.displayName}</h3>
                                <p className="text-slate-400 text-sm">{user.email}</p>
                            </div>
                            <button
                                onClick={() => auth.signOut()}
                                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold transition-all border border-slate-700 hover:border-slate-500"
                            >
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <p className="text-slate-300">Sign in to save your cloud creations and share them with the world.</p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => handleLogin(googleProvider)}
                                    disabled={loading}
                                    className="w-full py-3 px-4 bg-white text-slate-900 hover:bg-slate-100 rounded-lg font-bold flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                                    Sign in with Google
                                </button>

                            </div>

                            {error && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm text-center">
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {loading && (
                    <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-10 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                )}
            </div>
        </div>
    );
};
