
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    created_at: string;
}

const AnnouncementModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);

    useEffect(() => {
        const fetchAnnouncement = async () => {
            try {
                // Fetch the single active announcement
                const { data, error } = await supabase
                    .from('announcements')
                    .select('*')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    // Ignore "relation does not exist" error (42P01) which happens if SQL hasn't been run yet
                    if (error.code !== '42P01') {
                        console.warn("Failed to fetch announcements:", error.message || error);
                    }
                    return;
                }

                if (data) {
                    // Check if this specific announcement ID has been seen in this session
                    const seenKey = `announcement_seen_${data.id}`;
                    const seen = sessionStorage.getItem(seenKey);
                    
                    if (!seen) {
                        setAnnouncement(data as Announcement);
                        setIsOpen(true);
                    }
                }
            } catch (err: any) {
                // Silent fail for announcement checks to not disrupt user experience
                console.warn("Announcement check failed:", err.message || err);
            }
        };

        fetchAnnouncement();
    }, []);

    const close = () => {
        if (announcement) {
            sessionStorage.setItem(`announcement_seen_${announcement.id}`, 'true');
        }
        setIsOpen(false);
    };

    if (!isOpen || !announcement) return null;

    // Dynamic Styles based on Type
    const getStyles = (type: string) => {
        switch (type) {
            case 'warning':
                return {
                    bg: 'bg-gradient-to-r from-amber-50 to-orange-50',
                    border: 'border-amber-100',
                    iconBg: 'bg-white text-amber-500',
                    title: 'text-slate-900',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                };
            case 'success':
                return {
                    bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
                    border: 'border-emerald-100',
                    iconBg: 'bg-white text-emerald-500',
                    title: 'text-slate-900',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
            case 'error':
                return {
                    bg: 'bg-gradient-to-r from-rose-50 to-red-50',
                    border: 'border-rose-100',
                    iconBg: 'bg-white text-rose-500',
                    title: 'text-slate-900',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
            default: // info
                return {
                    bg: 'bg-gradient-to-r from-blue-50 to-indigo-50',
                    border: 'border-blue-100',
                    iconBg: 'bg-white text-blue-500',
                    title: 'text-slate-900',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                };
        }
    };

    const style = getStyles(announcement.type);

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-scale-in relative ring-4 ring-slate-900/5">
                {/* Header / Banner Area */}
                <div className={`${style.bg} p-6 border-b ${style.border} flex items-start gap-5`}>
                    <div className={`p-3 rounded-xl shadow-sm border ${style.border} flex-shrink-0 ${style.iconBg}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {style.icon}
                        </svg>
                    </div>
                    <div>
                        <h3 className={`text-xl font-extrabold tracking-tight ${style.title}`}>{announcement.title}</h3>
                        <div className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">System Announcement</div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-6 bg-white space-y-4">
                    <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">
                        {announcement.content}
                    </div>
                    
                    <div className="flex justify-end pt-2">
                        <button 
                            onClick={close}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition-all active:scale-95 text-sm shadow-lg shadow-slate-500/20"
                        >
                            I Understand
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementModal;
