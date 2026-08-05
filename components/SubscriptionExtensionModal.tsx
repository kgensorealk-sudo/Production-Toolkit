import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, ShieldCheck, CheckCircle2, ArrowRight, X, Award } from 'lucide-react';
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
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity"
                onClick={handleAcknowledge}
            />

            {/* Modal Card */}
            <div className="relative z-10 bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden ring-1 ring-slate-900/10 animate-scale-in">
                
                {/* Header Decoration */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white p-8 relative overflow-hidden text-center">
                    {/* Background glow effects */}
                    <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

                    {/* Top Close Button */}
                    <button 
                        onClick={handleAcknowledge}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
                        aria-label="Close modal"
                    >
                        <X size={16} />
                    </button>

                    {/* Celebration Badge Icon */}
                    <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4 rounded-3xl bg-gradient-to-tr from-indigo-500 to-emerald-400 p-0.5 shadow-xl shadow-indigo-500/30">
                        <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center">
                            <Sparkles size={36} className="text-emerald-400 animate-pulse" />
                        </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-2">
                        <CheckCircle2 size={12} />
                        <span>Subscription Extended</span>
                    </div>

                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                        Access Pass Updated!
                    </h2>
                    <p className="text-xs text-indigo-200/80 font-medium mt-1">
                        Your account validity has been extended
                    </p>
                </div>

                {/* Content Details */}
                <div className="p-8 space-y-6 bg-slate-50/50">
                    
                    {/* Expiry Card Highlight */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                        <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-3">
                            <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Target Account</span>
                            <span className="font-mono font-bold text-slate-800 text-[11px] truncate max-w-[200px]">
                                {user?.email}
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                                    <Calendar size={18} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Expiry Date</span>
                                    <span className="text-base font-black text-slate-900 tracking-tight">
                                        {notice.newExpiry}
                                    </span>
                                </div>
                            </div>

                            {notice.extensionLabel && (
                                <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 font-black text-[10px] uppercase tracking-wider">
                                    {notice.extensionLabel}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Details Message */}
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/60 text-emerald-900">
                        <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium leading-relaxed">
                            You have full, unrestricted access to all production toolkits, XML normalizers, and experimental tools.
                        </p>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleAcknowledge}
                        disabled={isDismissing}
                        className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 transition-all flex items-center justify-center gap-2 group"
                    >
                        <span>{isDismissing ? 'Updating...' : 'Got it! Continue to Workspace'}</span>
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
