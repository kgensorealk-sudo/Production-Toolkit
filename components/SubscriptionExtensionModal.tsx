import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, ShieldCheck, CheckCircle2, ArrowRight, X, Award, Zap, Lock, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

interface PendingExtensionNotice {
    id: string;
    title?: string;
    email?: string;
    newExpiry: string;
    extensionLabel: string;
    extendedAt: string;
    isRead?: boolean;
}

export const SubscriptionExtensionModal: React.FC = () => {
    const { user, profile, updateProfile, refreshProfile } = useAuth();
    const [notice, setNotice] = useState<PendingExtensionNotice | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    useEffect(() => {
        if (!user || !profile) {
            setNotice(null);
            setIsVisible(false);
            return;
        }

        let prefs: any = profile.notification_preferences;
        if (typeof prefs === 'string') {
            try {
                prefs = JSON.parse(prefs);
            } catch (e) {
                prefs = {};
            }
        }

        const pendingNotice = prefs?.pending_extension_notice as PendingExtensionNotice | undefined;

        if (pendingNotice && pendingNotice.newExpiry) {
            const ackKey = `ack_ext_notice_${user.id}_${pendingNotice.id}`;
            const isAckedLocally = localStorage.getItem(ackKey) === 'true';

            if (!pendingNotice.isRead && !isAckedLocally) {
                setNotice(pendingNotice);
                setIsVisible(true);
            }
        } else {
            setNotice(null);
            setIsVisible(false);
        }
    }, [user, profile]);

    // Listen for realtime subscription extension events dispatched in local session
    useEffect(() => {
        const handleSync = (e: Event) => {
            const customEv = e as CustomEvent;
            if (customEv?.detail?.notice) {
                const targetEmail = customEv.detail.notice.email;
                if (!targetEmail || targetEmail.toLowerCase() === user?.email?.toLowerCase()) {
                    setNotice(customEv.detail.notice);
                    setIsVisible(true);
                }
            }
            if (refreshProfile) refreshProfile();
        };
        window.addEventListener('app:subscription-extended', handleSync);
        return () => window.removeEventListener('app:subscription-extended', handleSync);
    }, [refreshProfile, user?.email]);

    const handleAcknowledge = async () => {
        if (!notice || !user) return;
        setIsDismissing(true);

        try {
            // Save local acknowledgment
            const ackKey = `ack_ext_notice_${user.id}_${notice.id}`;
            localStorage.setItem(ackKey, 'true');

            // Clear notice from profile notification_preferences in Supabase
            if (profile) {
                const currentPrefs = (profile.notification_preferences as any) || {};
                const updatedNotice = { ...notice, isRead: true };
                const updatedPrefs = {
                    ...currentPrefs,
                    pending_extension_notice: updatedNotice
                };

                await supabase
                    .from('profiles')
                    .update({ notification_preferences: updatedPrefs })
                    .eq('id', user.id);

                if (updateProfile) {
                    await updateProfile({ notification_preferences: updatedPrefs });
                }
            }
        } catch (err) {
            console.warn('[SubscriptionExtensionModal] Error acknowledging extension:', err);
        } finally {
            setIsDismissing(false);
            setIsVisible(false);
            setNotice(null);
        }
    };

    if (!isVisible || !notice) return null;

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 animate-fade-in">
            {/* Dark Blur Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-lg transition-opacity"
                onClick={handleAcknowledge}
            />

            {/* Modal Card */}
            <div className="relative z-10 bg-white rounded-[2.5rem] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] max-w-md w-full border border-slate-100/80 overflow-hidden ring-1 ring-slate-900/10 animate-scale-in">
                
                {/* Premium Gradient Header */}
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 text-white p-8 relative overflow-hidden text-center">
                    {/* Background Ambient Glow & Particles */}
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
                    <div className="absolute -bottom-12 -left-12 w-44 h-44 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute top-10 left-8 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-75" />
                    <div className="absolute bottom-12 right-10 w-1.5 h-1.5 bg-indigo-300 rounded-full animate-ping opacity-50" />

                    {/* Top Close Button */}
                    <button 
                        onClick={handleAcknowledge}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all border border-white/10"
                        aria-label="Close modal"
                    >
                        <X size={16} />
                    </button>

                    {/* Glowing Crest / Icon */}
                    <div className="relative inline-flex items-center justify-center mb-4">
                        <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" />
                        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500 via-emerald-400 to-indigo-300 p-0.5 shadow-2xl shadow-emerald-500/30">
                            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-emerald-900/30" />
                                <Sparkles size={38} className="text-emerald-400 relative z-10 animate-pulse" />
                            </div>
                        </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
                        <CheckCircle2 size={12} className="text-emerald-400" />
                        <span>Pass Extended & Authorized</span>
                    </div>

                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                        Subscription Updated!
                    </h2>
                    <p className="text-xs text-indigo-200/80 font-medium mt-1">
                        Your account validity has been successfully renewed
                    </p>
                </div>

                {/* Content Details */}
                <div className="p-7 space-y-5 bg-gradient-to-b from-slate-50/80 to-white">
                    
                    {/* Expiry Card Highlight */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3.5">
                        <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-3">
                            <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1">
                                <Lock size={11} className="text-slate-400" />
                                Account Identity
                            </span>
                            <span className="font-mono font-bold text-slate-800 text-[11px] truncate max-w-[210px] bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/50">
                                {user?.email}
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
                                    <Calendar size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Expiry Date</span>
                                    <span className="text-lg font-black text-slate-900 tracking-tight">
                                        {notice.newExpiry}
                                    </span>
                                </div>
                            </div>

                            {notice.extensionLabel && (
                                <span className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 text-emerald-700 font-black text-[10px] uppercase tracking-wider shadow-xs">
                                    {notice.extensionLabel}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Features Included Checklist */}
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-2.5">
                        <div className="flex items-center gap-2 text-emerald-950 font-black text-[11px] uppercase tracking-wider border-b border-emerald-200/50 pb-2">
                            <Zap size={14} className="text-emerald-600" />
                            <span>Unrestricted Workspace Perks</span>
                        </div>
                        <ul className="grid grid-cols-1 gap-1.5 text-xs text-slate-700">
                            <li className="flex items-center gap-2 text-[11px] font-medium text-emerald-900">
                                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                <span>Full access to Production Tools & XML Pipelines</span>
                            </li>
                            <li className="flex items-center gap-2 text-[11px] font-medium text-emerald-900">
                                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                <span>Unlimited Batch Processing & Intelligence DNA</span>
                            </li>
                            <li className="flex items-center gap-2 text-[11px] font-medium text-emerald-900">
                                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                <span>Priority server execution & zero telemetry lockouts</span>
                            </li>
                        </ul>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleAcknowledge}
                        disabled={isDismissing}
                        className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/25 transition-all flex items-center justify-center gap-2 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-white/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                        <ShieldCheck size={16} className="text-emerald-400" />
                        <span>{isDismissing ? 'Syncing Account...' : 'Continue to Workspace'}</span>
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {/* Footer Tag */}
                <div className="bg-slate-100/80 py-2.5 border-t border-slate-200/60 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
                        <Award size={11} className="text-indigo-500" />
                        Production Toolkit Pro • Official Access Confirmation
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionExtensionModal;
