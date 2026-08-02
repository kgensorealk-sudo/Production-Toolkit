import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, Info, CheckCircle2, AlertCircle, X, Bell, Zap, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    category: 'system_alerts' | 'security_updates' | 'maintenance_windows';
    is_mandatory: boolean;
    updated_at: string;
    created_at: string;
}

const AnnouncementModal: React.FC = () => {
    const { profile, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);

    const fetchAnnouncement = async (forceOpen = false) => {
        try {
            // Safer query that handles potential schema mismatch
            let { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            // Fallback for older schemas if the first query fails due to missing columns
            if (error) {
                console.warn("[AnnouncementSystem] Primary fetch failed, attempting legacy schema fallback...", error);
                const fallback = await supabase
                    .from('announcements')
                    .select('id, title, content, type, created_at, updated_at')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false });
                
                data = fallback.data;
                error = fallback.error;
            }

            if (error) {
                console.warn("[AnnouncementSystem] Broadcast retrieval unavailable.", error?.message || error);
                return;
            }

            if (data && data.length > 0) {
                const announcements = data as Announcement[];
                
                // Filter based on user preferences
                const filtered = announcements.find(a => {
                    if (!profile) return true; 
                    const prefs = profile.notification_preferences || {
                        system_alerts: true,
                        security_updates: true,
                        maintenance_windows: true
                    };
                    const category = (a.category || 'system_alerts') as keyof typeof prefs;
                    return prefs[category] !== false;
                });

                if (filtered) {
                    console.log("[AnnouncementSystem] Active broadcast detected:", filtered.id);
                    setAnnouncement(filtered);
                    
                    if (forceOpen) {
                        console.log("[AnnouncementSystem] Force-opening modal.");
                        setIsOpen(true);
                        return;
                    }

                    // 1. Check LocalStorage (Fast check)
                    const seenKey = `ann_seen_${filtered.id}_${filtered.created_at}`;
                    const hasSeenLocally = localStorage.getItem(seenKey);
                    
                    if (!hasSeenLocally) {
                        console.log("[AnnouncementSystem] Not seen locally. Verifying with database...");
                        // 2. Check Database (Source of Truth)
                        if (user?.id) {
                            try {
                                const { data: readData, error: readError } = await supabase
                                    .from('announcement_reads')
                                    .select('id')
                                    .eq('announcement_id', filtered.id)
                                    .eq('user_id', user.id)
                                    .maybeSingle();

                                if (readError) {
                                    console.warn("[AnnouncementSystem] Database read check failed (likely table missing). Falling back to show.", readError);
                                    setIsOpen(true);
                                } else if (!readData) {
                                    console.log("[AnnouncementSystem] Database confirms unread status. Displaying broadcast.");
                                    setIsOpen(true);
                                } else {
                                    console.log("[AnnouncementSystem] Database confirms already read. Syncing local storage.");
                                    localStorage.setItem(seenKey, 'true');
                                }
                            } catch (fallbackErr) {
                                console.warn("[AnnouncementSystem] Critical error in read check. Falling back to show.", fallbackErr);
                                setIsOpen(true);
                            }
                        } else {
                            console.log("[AnnouncementSystem] No user session. Displaying broadcast as guest.");
                            setIsOpen(true);
                        }
                    } else {
                        console.log("[AnnouncementSystem] Broadcast already acknowledged locally.");
                    }
                } else {
                    console.log("[AnnouncementSystem] No broadcast found matching user preferences.");
                }
            }
        } catch (err) {
            console.warn("Announcement check failed", err);
        }
    };

    useEffect(() => {
        fetchAnnouncement();

        // Listen for manual trigger from Layout or Dashboard
        const handleManualTrigger = () => fetchAnnouncement(true);
        window.addEventListener('app:show-announcement', handleManualTrigger);
        
        return () => window.removeEventListener('app:show-announcement', handleManualTrigger);
    }, [profile?.notification_preferences, user?.id]);

    const acknowledge = async () => {
        if (announcement && user?.id) {
            const seenKey = `ann_seen_${announcement.id}_${announcement.created_at}`;
            localStorage.setItem(seenKey, 'true');
            
            // Persist to database so it stays "read" on all devices
            try {
                await supabase.from('announcement_reads').upsert([{
                    announcement_id: announcement.id,
                    user_id: user.id
                }], { onConflict: 'announcement_id,user_id' });
            } catch (e) {
                console.warn("Failed to persist read state");
            }

            // Sync with other components (like Header)
            window.dispatchEvent(new CustomEvent('app:announcement-sync'));
        }
        setIsOpen(false);
    };

    const dismiss = () => {
        // Just close the modal without marking it as seen/read.
        // It will reappear on next session/trigger.
        window.dispatchEvent(new CustomEvent('app:announcement-sync'));
        setIsOpen(false);
    };

    if (!isOpen || !announcement) return null;

    const getStyles = (type: string) => {
        switch (type) {
            case 'warning':
                return {
                    bg: 'bg-amber-50',
                    header: 'bg-amber-100/50',
                    border: 'border-amber-200',
                    accent: 'bg-amber-500',
                    secondary: 'text-amber-600',
                    glow: 'shadow-amber-500/20',
                    icon: <AlertTriangle className="w-6 h-6" />
                };
            case 'error':
                return {
                    bg: 'bg-rose-50',
                    header: 'bg-rose-100/50',
                    border: 'border-rose-200',
                    accent: 'bg-rose-500',
                    secondary: 'text-rose-600',
                    glow: 'shadow-rose-500/20',
                    icon: <AlertCircle className="w-6 h-6" />
                };
            case 'success':
                return {
                    bg: 'bg-emerald-50',
                    header: 'bg-emerald-100/50',
                    border: 'border-emerald-200',
                    accent: 'bg-emerald-500',
                    secondary: 'text-emerald-600',
                    glow: 'shadow-emerald-500/20',
                    icon: <CheckCircle2 className="w-6 h-6" />
                };
            default: // info
                return {
                    bg: 'bg-indigo-50',
                    header: 'bg-indigo-100/50',
                    border: 'border-indigo-200',
                    accent: 'bg-indigo-500',
                    secondary: 'text-indigo-600',
                    glow: 'shadow-indigo-500/20',
                    icon: <Info className="w-6 h-6" />
                };
        }
    };

    const style = getStyles(announcement.type);

    return (
        <AnimatePresence>
            {isOpen && announcement && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-hidden" role="dialog" aria-modal="true">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !announcement.is_mandatory && dismiss()}
                        className={`absolute inset-0 bg-slate-900/60 backdrop-blur-md ${announcement.is_mandatory ? 'cursor-default' : 'cursor-pointer'}`} 
                    />
                    
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] max-w-lg w-full border border-slate-200 overflow-hidden relative ring-1 ring-black/5 flex flex-col max-h-[85vh] z-10"
                    >
                        {/* Header Section */}
                        <div className="relative overflow-hidden">
                            <div className={`h-1.5 w-full ${style.accent} relative z-20`}>
                                <motion.div 
                                    className="absolute inset-0 bg-white/40"
                                    animate={{ 
                                        x: ['-100%', '100%'],
                                    }}
                                    transition={{ 
                                        duration: 2, 
                                        repeat: Infinity,
                                        ease: "linear"
                                    }}
                                />
                            </div>
                            
                            <div className={`${style.header} py-8 px-10 border-b border-slate-100 flex items-center gap-6 relative z-10`}>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border border-white bg-white ${style.accent.replace('bg-', 'text-')} ${style.glow}`}>
                                    {style.icon}
                                </div>
                                
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 text-white rounded-md">
                                            <Radio size={10} className="animate-pulse" />
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">LIVE_FEED</span>
                                        </div>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{announcement.category?.replace('_', ' ') || 'SYSTEM_PROTOCOL'}</span>
                                        {announcement.is_mandatory && (
                                            <span className="text-[7px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 uppercase tracking-tighter animate-pulse">
                                                Required Reading
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight uppercase whitespace-pre-wrap break-words">{announcement.title}</h3>
                                </div>

                                {!announcement.is_mandatory && (
                                    <button onClick={dismiss} className="p-2 hover:bg-slate-200/50 rounded-xl transition-colors text-slate-400">
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="p-10 overflow-y-auto custom-scrollbar flex-grow bg-white">
                            <div className="prose prose-slate prose-sm max-w-none prose-headings:uppercase prose-headings:tracking-tighter prose-headings:font-black prose-p:leading-relaxed prose-p:text-slate-600 prose-p:font-medium prose-strong:text-slate-900 prose-strong:font-black prose-code:font-mono prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded">
                                <ReactMarkdown>
                                    {announcement.content}
                                </ReactMarkdown>
                            </div>
                            
                            <div className="mt-10 pt-8 border-t border-slate-50 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.25em] mb-1">Packet Timestamp</span>
                                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-tight">
                                        {new Date(announcement.created_at).toISOString().replace('T', ' ').substring(0, 19)}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.25em] mb-1">Signal Authority</span>
                                    <span className="text-[10px] font-bold text-slate-900 uppercase">Administrator Node_01</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer Section */}
                        <div className="p-8 bg-slate-50/80 border-t border-slate-100 backdrop-blur-sm">
                            <button 
                                onClick={acknowledge}
                                className="w-full relative group"
                            >
                                <div className={`absolute -inset-1 rounded-2xl blur-lg transition opacity-50 group-hover:opacity-80 ${style.accent}`} />
                                <div className="relative flex items-center justify-center gap-4 bg-slate-900 hover:bg-slate-800 text-white font-black py-5 px-8 rounded-2xl transition-all active:scale-[0.98] text-xs uppercase tracking-[0.4em] shadow-2xl">
                                    <Zap size={14} className={announcement.type === 'error' || announcement.type === 'warning' ? 'animate-bounce' : ''} />
                                    Acknowledge Transmission
                                </div>
                            </button>
                            {!announcement.is_mandatory && (
                                <button 
                                    onClick={dismiss}
                                    className="w-full mt-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                                >
                                    Dismiss for Now
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AnnouncementModal;