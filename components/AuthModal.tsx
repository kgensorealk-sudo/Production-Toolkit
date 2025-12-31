
import React, { useState } from 'react';
import { supabase } from '../supabase';
import { AUTH_PREFIX } from '../constants';
import { ToolId } from '../types';

interface AuthModalProps {
    toolName: ToolId;
    toolDisplayName: string;
    onSuccess: () => void;
    onCancel: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ toolName, toolDisplayName, onSuccess, onCancel }) => {
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const keyString = key.trim().toUpperCase();
        if (!keyString) return;

        setLoading(true);
        try {
            // 1. Check if key exists
            const { data, error: fetchError } = await supabase
                .from('access_keys')
                .select('*')
                .eq('key_code', keyString)
                .single();

            if (fetchError || !data) {
                throw new Error("Invalid Key.");
            }

            // 2. Check Tool Match
            if (data.tool_id !== toolName && data.tool_id !== 'ALL') {
                throw new Error(`Key valid for ${data.tool_id} only.`);
            }
            
            // 3. Check Usage
            // If already used, we deny (unless you implement user-tracking logic, 
            // for now simplistic "one-time use" or "always valid" depending on your logic.
            // Assuming strict one-time use here:
            if (data.is_used) {
                 // You can add logic here to allow re-entry if stored in local storage, 
                 // but typically strict keys are one-time.
                 throw new Error("Key already used.");
            }

            // 4. Consume key
            const { error: updateError } = await supabase
                .from('access_keys')
                .update({ 
                    is_used: true, 
                    used_at: new Date().toISOString() 
                })
                .eq('id', data.id);

            if (updateError) {
                throw new Error("Failed to redeem key.");
            }

            // Success
            localStorage.setItem(AUTH_PREFIX + toolName, 'true');
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Verification Failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4">
            <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200 text-center animate-scale-in">
                <button onClick={onCancel} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="mb-8">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Restricted Access</h2>
                    <p className="text-slate-500 mt-2 text-sm">Enter Access Key for {toolDisplayName}</p>
                </div>
                <form onSubmit={validateKey} className="space-y-4">
                    <input 
                        type="text" 
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-center text-lg tracking-widest font-mono shadow-sm" 
                        placeholder="XXXX-XXXX" 
                        autoComplete="off"
                        disabled={loading}
                    />
                    <button 
                        type="submit" 
                        disabled={loading || !key}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-500/30 transform transition hover:-translate-y-0.5 focus:ring-4 focus:ring-blue-200"
                    >
                        {loading ? 'Verifying...' : 'Unlock Tool'}
                    </button>
                </form>
                {error && <p className="mt-4 text-red-500 text-sm font-medium">{error}</p>}
                <button onClick={onCancel} className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline">Cancel</button>
            </div>
        </div>
    );
};

export default AuthModal;
