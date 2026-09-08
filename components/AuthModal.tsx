
import React, { useState, useEffect } from 'react';
/* Import useNavigate from react-router to resolve potential named export issues in react-router-dom types */
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ToolId } from '../types';
import { getDeviceId } from '../utils/device';

interface AuthModalProps {
    toolId: ToolId;
    toolDisplayName: string;
    onSuccess: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ toolId, toolDisplayName, onSuccess }) => {
    const { user, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Escape to go back
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') navigate('/dashboard');
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [navigate]);

    const validateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const keyString = key.trim().toUpperCase();
        if (!keyString || !user) return;

        setLoading(true);
        try {
            const currentDeviceId = getDeviceId();

            // Atomic RPC redemption (enforces exact string lookup, tool compatibility, and single-user binding)
            const { data, error: rpcError } = await supabase.rpc('redeem_access_key', {
                key_code: keyString,
                device_id_input: currentDeviceId,
                target_tool_input: toolId
            });

            if (rpcError) {
                throw new Error(rpcError.message || "Invalid access key.");
            }

            // Success
            await refreshProfile();
            onSuccess();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Verification Failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-sm w-full border border-slate-200 text-center animate-scale-in relative ring-4 ring-slate-900/5">
                <div className="mb-10">
                    <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-indigo-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Locked Module</h2>
                    <p className="text-slate-500 mt-2 text-xs font-bold uppercase tracking-widest">Activation Required: {toolDisplayName}</p>
                </div>

                <form onSubmit={validateKey} className="space-y-6">
                    <div className="relative">
                        <input 
                            type="text" 
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            className="w-full px-4 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 focus:ring-0 focus:border-indigo-500 transition-all text-center text-xl tracking-[0.3em] font-mono shadow-inner outline-none uppercase" 
                            placeholder="XXXX-XXXX" 
                            autoComplete="off"
                            disabled={loading}
                            autoFocus
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <button 
                            type="submit" 
                            disabled={loading || !key}
                            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-4 px-4 rounded-2xl shadow-xl shadow-slate-200 transform transition active:scale-95 uppercase tracking-widest text-xs"
                        >
                            {loading ? 'Verifying...' : 'Unlock Module'}
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-3 text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.2em] transition-colors"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </form>

                {error && (
                    <div className="mt-6 p-3 bg-rose-50 border border-rose-100 rounded-xl animate-shake">
                        <p className="text-rose-600 text-xs font-bold uppercase tracking-wider">{error}</p>
                    </div>
                )}
                
                <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em]">Hardware-Locked Session</p>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
