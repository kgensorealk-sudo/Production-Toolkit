import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    updated_at: string;
    created_at: string;
}

const AnnouncementModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);

    const fetchAnnouncement = async (forceOpen = false) => {
        try {
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) return;

            if (data) {
                const typedData = data as Announcement;
                setAnnouncement(typedData);
                
                if (forceOpen) {
                    setIsOpen(true);
                    return;
                }

                const contentHash = btoa(typedData.content.substring(0, 30)).substring(0, 8);
                const seenKey = `ann_seen_${typedData.id}_${contentHash}`;
                const hasSeen = localStorage.getItem(seenKey);
                
                if (!hasSeen) {
                    setIsOpen(true);
                }
            }
        } catch (err) {
            console.warn("Announcement check failed");
        }
    };

    useEffect(() => {
        fetchAnnouncement();

        // Listen for manual trigger from Layout or Dashboard
        const handleManualTrigger = () => fetchAnnouncement(true);
        window.addEventListener('app:show-announcement', handleManualTrigger);
        
        return () => window.removeEventListener('app:show-announcement', handleManualTrigger);
    }, []);

    const close = () => {
        if (announcement) {
            const contentHash = btoa(announcement.content.substring(0, 30)).substring(0, 8);
            localStorage.setItem(`ann_seen_${announcement.id}_${contentHash}`, 'true');
        }
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
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                };
            case 'error':
                return {
                    bg: 'bg-rose-50',
                    header: 'bg-rose-100/50',
                    border: 'border-rose-200',
                    accent: 'bg-rose-500',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
            case 'success':
                return {
                    bg: 'bg-emerald-50',
                    header: 'bg-emerald-100/50',
                    border: 'border-emerald-200',
                    accent: 'bg-emerald-500',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
            default: // info
                return {
                    bg: 'bg-indigo-50',
                    header: 'bg-indigo-100/50',
                    border: 'border-indigo-200',
                    accent: 'bg-indigo-500',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
        }
    };

    const style = getStyles(announcement.type);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-scale-in relative ring-1 ring-black/5 flex flex-col max-h-[85vh]">
                <div className={`h-1.5 w-full ${style.accent}`}></div>
                <div className={`${style.header} py-6 px-8 border-b border-slate-100 flex items-center gap-5`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-white/50 bg-white ${style.accent.replace('bg-', 'text-')}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {style.icon}
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight uppercase">{announcement.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocol Broadcast</span>
                            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(announcement.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div className="p-8 overflow-y-auto custom-scrollbar flex-grow bg-white">
                    <div className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap break-words">
                        {announcement.content}
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100">
                    <button 
                        onClick={close}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-xl transition-all active:scale-95 text-xs uppercase tracking-widest shadow-xl shadow-slate-900/10"
                    >
                        Confirm & Acknowledge
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementModal;