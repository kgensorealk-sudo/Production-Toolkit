import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Info, CheckCircle2, AlertCircle, X, Bell, Zap, Radio, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [announcementsList, setAnnouncementsList] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const announcement = announcementsList[currentIndex] || null;

    const fetchAnnouncement = async (forceOpen = false, targetAnnouncement?: Announcement) => {
        try {
            if (targetAnnouncement) {
                setAnnouncementsList([targetAnnouncement]);
                setCurrentIndex(0);
                setIsOpen(true);
                return;
            }

            // Query active broadcasts
            let { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('updated_at', { ascending: false });

            // Fallback for older schemas
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
                const broadcasts = data as Announcement[];
                
                // Filter based on user notification preferences
                const filtered = broadcasts.filter(a => {
                    if (!profile) return true; 
                    const prefs = profile.notification_preferences || {
                        system_alerts: true,
                        security_updates: true,
                        maintenance_windows: true
                    };
                    const category = (a.category || 'system_alerts') as keyof typeof prefs;
                    return prefs[category] !== false;
                });

                if (filtered.length > 0) {
                    setAnnouncementsList(filtered);
                    const activeItem = filtered[0];
                    
                    if (forceOpen) {
                        setIsOpen(true);
                        return;
                    }

                    // Version-aware seen check using updated_at or created_at
                    const seenKey = `ann_seen_${activeItem.id}_${activeItem.updated_at || activeItem.created_at}`;
                    const hasSeenLocally = localStorage.getItem(seenKey);
                    
                    if (!hasSeenLocally) {
                        if (user?.id) {
                            try {
                                const { data: readData, error: readError } = await supabase
                                    .from('announcement_reads')
                                    .select('id')
                                    .eq('announcement_id', activeItem.id)
                                    .eq('user_id', user.id)
                                    .maybeSingle();

                                if (readError || !readData) {
                                    setIsOpen(true);
                                } else {
                                    localStorage.setItem(seenKey, 'true');
                                }
                            } catch (fallbackErr) {
                                setIsOpen(true);
                            }
                        } else {
                            setIsOpen(true);
                        }
                    }
                }
            } else {
                setAnnouncementsList([]);
            }
        } catch (err) {
            console.warn("Announcement check failed", err);
        }
    };

    useEffect(() => {
        fetchAnnouncement();

        // Listen for manual trigger from Layout or Dashboard
        const handleManualTrigger = () => fetchAnnouncement(true);
        const handleSpecificTrigger = (e: any) => {
            if (e.detail) {
                fetchAnnouncement(true, e.detail);
            } else {
                fetchAnnouncement(true);
            }
        };

        window.addEventListener('app:show-announcement', handleManualTrigger);
        window.addEventListener('app:show-announcement-detail', handleSpecificTrigger as EventListener);
        
        // Realtime Subscription for live broadcast updates
        const channel = supabase
            .channel('realtime_announcements')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                fetchAnnouncement(false);
                window.dispatchEvent(new CustomEvent('app:announcement-sync'));
            })
            .subscribe();

        return () => {
            window.removeEventListener('app:show-announcement', handleManualTrigger);
            window.removeEventListener('app:show-announcement-detail', handleSpecificTrigger as EventListener);
            supabase.removeChannel(channel);
        };
    }, [profile?.notification_preferences, user?.id]);

    const acknowledge = async () => {
        if (announcement && user?.id) {
            const seenKey = `ann_seen_${announcement.id}_${announcement.updated_at || announcement.created_at}`;
            localStorage.setItem(seenKey, 'true');
            
            try {
                await supabase.from('announcement_reads').upsert([{
                    announcement_id: announcement.id,
                    user_id: user.id
                }], { onConflict: 'announcement_id,user_id' });
            } catch (e) {
                console.warn("Failed to persist read state");
            }

            window.dispatchEvent(new CustomEvent('app:announcement-sync'));
        }

        // If there are more announcements in queue, advance
        if (currentIndex < announcementsList.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsOpen(false);
        }
    };

    const dismiss = () => {
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
                            {announcementsList.length > 1 && (
                                <div className="mb-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                        Transmission {currentIndex + 1} of {announcementsList.length}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            disabled={currentIndex === 0}
                                            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all text-slate-600"
                                            title="Previous Broadcast"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button 
                                            disabled={currentIndex === announcementsList.length - 1}
                                            onClick={() => setCurrentIndex(prev => Math.min(announcementsList.length - 1, prev + 1))}
                                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all text-slate-600"
                                            title="Next Broadcast"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="prose prose-slate prose-sm max-w-none prose-headings:uppercase prose-headings:tracking-tight prose-headings:font-black prose-p:leading-relaxed prose-p:text-slate-600 prose-p:font-medium prose-strong:text-slate-900 prose-strong:font-black prose-code:font-mono prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-50/50 prose-blockquote:p-4 prose-blockquote:rounded-r-2xl prose-blockquote:not-italic prose-blockquote:text-slate-800">
                                <ReactMarkdown 
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: ({ node, ...props }) => (
                                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline" />
                                        )
                                    }}
                                >
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