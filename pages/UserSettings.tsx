
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    User, 
    Key, 
    Shield, 
    Clock, 
    CheckCircle2, 
    Lock, 
    ChevronRight,
    AlertCircle,
    Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { getDeviceId } from '../utils/device';
import LoadingOverlay from '../components/LoadingOverlay';

const UserSettings: React.FC = () => {
    const { profile, user, refreshProfile, loading } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'keys'>('profile');
    const [keyInput, setKeyInput] = useState('');
    const [keyLoading, setKeyLoading] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [keySuccess, setKeySuccess] = useState<string | null>(null);

    const handleUnlockKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setKeyError(null);
        setKeySuccess(null);
        
        const keyString = keyInput.trim().toUpperCase();
        if (!keyString || !user) return;

        setKeyLoading(true);
        try {
            const currentDeviceId = getDeviceId();

            // 1. Check if key exists
            const { data: keyData, error: fetchError } = await supabase
                .from('access_keys')
                .select('*')
                .eq('key', keyString)
                .single();

            if (fetchError || !keyData) {
                throw new Error("Invalid access key. Please check the code and try again.");
            }

            // 2. Check usage status
            if (keyData.is_used && keyData.user_id !== user.id) {
                throw new Error("This key is already bound to another user account.");
            }

            // 3. Bind to current User AND current Device
            const { error: updateError } = await supabase
                .from('access_keys')
                .update({ 
                    is_used: true, 
                    used_at: new Date().toISOString(),
                    user_id: user.id,
                    device_id: currentDeviceId 
                })
                .eq('id', keyData.id);

            if (updateError) {
                throw new Error("Activation failed. Please try again.");
            }

            // 4. Success
            await refreshProfile();
            setKeySuccess(`Successfully unlocked: ${keyData.tool === 'universal' ? 'All Modules (Universal Access)' : keyData.tool}`);
            setKeyInput('');
        } catch (err: any) {
            console.error(err);
            setKeyError(err.message || "Verification Failed");
        } finally {
            setKeyLoading(false);
        }
    };

    if (loading || !profile) {
        return <LoadingOverlay message="Loading User Environment..." color="indigo" />;
    }

    return (
        <div className="flex-grow p-6 sm:p-10 bg-slate-50">
            <div className="max-w-4xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">User Settings</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs mt-2">Manage your identity and access protocols</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar Tabs */}
                    <div className="lg:col-span-1 space-y-2">
                        <button 
                            onClick={() => setActiveTab('profile')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'profile' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <User size={16} />
                            Profile
                        </button>
                        <button 
                            onClick={() => setActiveTab('keys')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'keys' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <Key size={16} />
                            Access Keys
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="lg:col-span-3">
                        <AnimatePresence mode="wait">
                            {activeTab === 'profile' ? (
                                <motion.div 
                                    key="profile"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200"
                                >
                                    <div className="flex items-center gap-6 mb-10">
                                        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                                            <User size={40} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{profile.email.split('@')[0]}</h2>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{profile.email}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                            <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                <Shield size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Account Role</span>
                                            </div>
                                            <p className="text-lg font-black text-slate-900 uppercase tracking-tight">{profile.role}</p>
                                        </div>

                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                            <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                <Zap size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Subscription</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-lg font-black text-slate-900 uppercase tracking-tight">
                                                    {profile.is_subscribed ? 'Active' : 'Inactive'}
                                                </p>
                                                {profile.is_subscribed && (
                                                    <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Verified</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                            <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                <Clock size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Last Activity</span>
                                            </div>
                                            <p className="text-sm font-bold text-slate-600">
                                                {profile.last_seen ? new Date(profile.last_seen).toLocaleString() : 'N/A'}
                                            </p>
                                        </div>

                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                            <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                <Lock size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">User ID</span>
                                            </div>
                                            <p className="text-[10px] font-mono text-slate-400 break-all uppercase">{profile.id}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="keys"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    {/* Key Input Section */}
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-8">
                                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Activate Module</h2>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Enter an access key to unlock specific tools</p>
                                        </div>

                                        <form onSubmit={handleUnlockKey} className="space-y-6">
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={keyInput}
                                                    onChange={(e) => setKeyInput(e.target.value)}
                                                    placeholder="XXXX-XXXX-XXXX"
                                                    className="w-full px-6 py-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 focus:ring-0 focus:border-indigo-500 transition-all text-xl tracking-[0.3em] font-mono shadow-inner outline-none uppercase placeholder:text-slate-200"
                                                    disabled={keyLoading}
                                                />
                                            </div>

                                            <button 
                                                type="submit"
                                                disabled={keyLoading || !keyInput.trim()}
                                                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-5 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                                            >
                                                {keyLoading ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <CheckCircle2 size={18} />
                                                )}
                                                {keyLoading ? 'Validating...' : 'Activate Key'}
                                            </button>
                                        </form>

                                        {keyError && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600"
                                            >
                                                <AlertCircle size={18} />
                                                <p className="text-[10px] font-black uppercase tracking-widest">{keyError}</p>
                                            </motion.div>
                                        )}

                                        {keySuccess && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600"
                                            >
                                                <CheckCircle2 size={18} />
                                                <p className="text-[10px] font-black uppercase tracking-widest">{keySuccess}</p>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* Unlocked Tools List */}
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-6">
                                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Unlocked Modules</h3>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Tools currently active on your account</p>
                                        </div>

                                        {profile.unlocked_tools.length > 0 ? (
                                            <div className="space-y-3">
                                                {profile.unlocked_tools.includes('universal') ? (
                                                    <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                                                                <Zap size={16} />
                                                            </div>
                                                            <span className="text-xs font-black text-indigo-900 uppercase tracking-widest">Universal Access</span>
                                                        </div>
                                                        <span className="text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Master Key</span>
                                                    </div>
                                                ) : (
                                                    profile.unlocked_tools.map((toolId) => (
                                                        <div key={toolId} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                                                                    <Shield size={16} />
                                                                </div>
                                                                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{toolId}</span>
                                                            </div>
                                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-[2rem]">
                                                <Lock size={32} className="mx-auto text-slate-200 mb-4" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No additional modules unlocked</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
