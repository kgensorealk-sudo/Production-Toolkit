import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import TrialTimer from './TrialTimer';
import ExpiryReminderModal from './ExpiryReminderModal';
import LoadingOverlay from './LoadingOverlay';

interface LayoutProps {
    children: React.ReactNode;
    currentTool?: ToolId;
    isLanding?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, currentTool, isLanding }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { signOut, profile, isAdmin, user, loading: authLoading } = useAuth();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [hasActiveAnnouncement, setHasActiveAnnouncement] = useState(false);
    const [isAnnouncementUnread, setIsAnnouncementUnread] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    
    // Check if running in a browser or Vercel
    const isVercel = window.location.hostname.includes('vercel.app');

    /**
     * CLOUD TELEMETRY:
     * Decoupled from full profile check to ensure clicks are recorded as long as 
     * the auth user ID is present.
     */
    useEffect(() => {
        if (!currentTool || !user?.id || authLoading) return;

        const logUsage = async (attempt = 1) => {
            try {
                // We use user.id directly. RLS allows 'authenticated' inserts for their own ID.
                const { error } = await supabase.from('usage_logs').insert([{
                    user_id: user.id,
                    tool_id: currentTool
                }]);
                
                if (error) {
                    if (attempt < 3) {
                        console.warn(`Telemetry retry ${attempt}/3...`);
                        setTimeout(() => logUsage(attempt + 1), 2000);
                    }
                }
            } catch (e) {
                if (attempt < 3) setTimeout(() => logUsage(attempt + 1), 2000);
            }
        };

        logUsage();
    }, [currentTool, user?.id, authLoading]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkBroadcastStatus = async () => {
            try {
                const { data } = await supabase
                    .from('announcements')
                    .select('id, content')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data) {
                    setHasActiveAnnouncement(true);
                    const contentHash = btoa(data.content.substring(0, 30)).substring(0, 8);
                    const seenKey = `ann_seen_${data.id}_${contentHash}`;
                    setIsAnnouncementUnread(!localStorage.getItem(seenKey));
                } else {
                    setHasActiveAnnouncement(false);
                }
            } catch (e) {}
        };

        checkBroadcastStatus();
        const interval = setInterval(checkBroadcastStatus, 60000 * 5);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    const triggerAnnouncement = () => {
        window.dispatchEvent(new CustomEvent('app:show-announcement'));
        setIsAnnouncementUnread(false);
    };

    const handleSignOut = async () => {
        if (isExiting) return;
        setIsExiting(true);
        try {
            await signOut();
        } catch (e) {
            window.location.reload();
        }
    };

    const isTrial = !!profile?.trial_end;
    const headerClass = isLanding 
        ? "bg-transparent py-4" 
        : "glass-header sticky top-0 py-2 shadow-sm border-b border-slate-200/60";

    return (
        <div className={`min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50 selection:bg-indigo-100 overflow-x-hidden ${isExiting ? 'grayscale cursor-wait' : ''}`}>
            <ExpiryReminderModal />

            {isExiting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
                    <LoadingOverlay message="Closing Environment..." color="rose" />
                </div>
            )}

            {!isOnline && (
                <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-0.5 text-center animate-pulse z-[60] sticky top-0">
                    System Offline - Local Processing Enabled
                </div>
            )}

            <header className={`${headerClass} transition-all duration-500 z-40 px-4 sm:px-6 lg:px-8`}>
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6">
                         <div 
                            onClick={() => !isExiting && navigate('/')} 
                            className={`flex items-center gap-3 cursor-pointer group ${isExiting ? 'opacity-50 pointer-events-none' : ''}`}
                         >
                            <div className="bg-slate-900 text-white p-1.5 rounded-lg shadow-lg group-hover:scale-105 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-xs font-black text-slate-900 tracking-tight uppercase leading-none">Production Toolkit Pro</h1>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-1.5 rounded border ${isVercel ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-400 bg-slate-100 border-slate-200'}`}>
                                        {isVercel ? 'Cloud Node' : 'Web Node'}
                                    </span>
                                    {isAdmin && (
                                        <span className="text-[7px] font-black bg-indigo-600 text-white px-1 py-0.5 rounded uppercase tracking-widest shadow-lg animate-pulse ring-1 ring-indigo-300">Admin</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {profile?.is_subscribed && profile.subscription_end && !isLanding && (
                            <TrialTimer endDate={profile.subscription_end} isTrial={isTrial} label={isTrial ? "Trial" : "Plan"} />
                        )}

                        <div className="flex items-center gap-2">
                            {hasActiveAnnouncement && !isExiting && (
                                <button 
                                    onClick={triggerAnnouncement}
                                    className={`p-1.5 rounded-lg transition-all relative ${isAnnouncementUnread ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    {isAnnouncementUnread && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-600 rounded-full ring-2 ring-white"></span>}
                                </button>
                            )}

                            {!isLanding && !isExiting && (
                                <button onClick={() => navigate('/dashboard')} className={`p-1.5 rounded-lg transition-all ${location.pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:text-indigo-600'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2-2v-2z" /></svg>
                                </button>
                            )}

                            {isAdmin && !isExiting && (
                                <button onClick={() => navigate('/admin')} className={`p-1.5 rounded-lg transition-all ${location.pathname === '/admin' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:text-indigo-600'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                            )}
                            
                            <div className="h-3 w-px bg-slate-200 mx-1"></div>
                            
                            <button 
                                onClick={handleSignOut}
                                disabled={isExiting}
                                className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 transition-all ${isExiting ? 'text-indigo-500 animate-pulse' : 'text-slate-400 hover:text-rose-600'}`}
                            >
                                {isExiting ? 'Disconnecting...' : 'Exit'}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main key={location.pathname} className={`flex-grow w-full relative z-10 animate-fade-in overflow-y-auto custom-scrollbar ${isExiting ? 'pointer-events-none blur-[2px]' : ''}`}>
                {children}
            </main>

            <footer className="bg-white border-t border-slate-200/60 py-2 mt-auto">
                <div className="max-w-7xl mx-auto px-4 flex justify-between items-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                    <p>&copy; 2025 Editorial Systems Pro</p>
                    <div className="flex gap-4">
                        <span>Environment: {isVercel ? 'Cloud Edge' : 'Web Node'}</span>
                        <span>v1.8.0_STABLE</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;