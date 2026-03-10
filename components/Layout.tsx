import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    LayoutDashboard, 
    Settings, 
    LogOut, 
    Bell, 
    Wifi, 
    WifiOff, 
    ShieldCheck, 
    Cloud, 
    Monitor,
    FlaskConical
} from 'lucide-react';
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
    
    const isVercel = window.location.hostname.includes('vercel.app');

    useEffect(() => {
        if (!currentTool || !user?.id || authLoading) return;

        const logUsage = async (attempt = 1) => {
            try {
                const { error } = await supabase.from('usage_logs').insert([{
                    user_id: user.id,
                    tool_id: currentTool
                }]);
                
                if (error && attempt < 3) {
                    setTimeout(() => logUsage(attempt + 1), 2000);
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
        ? "bg-transparent py-6" 
        : "glass-header py-3 shadow-sm";

    return (
        <div className={`min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50 selection:bg-indigo-100 overflow-x-hidden ${isExiting ? 'grayscale cursor-wait' : ''}`}>
            <ExpiryReminderModal />

            <AnimatePresence>
                {isExiting && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md"
                    >
                        <LoadingOverlay message="Closing Environment..." color="rose" />
                    </motion.div>
                )}
            </AnimatePresence>

            {!isOnline && (
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-1 text-center z-[60] sticky top-0 flex items-center justify-center gap-2"
                >
                    <WifiOff size={10} />
                    System Offline - Local Processing Enabled
                </motion.div>
            )}

            <header className={`${headerClass} transition-all duration-500 z-40 px-4 sm:px-6 lg:px-8`}>
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6">
                         <div 
                            onClick={() => !isExiting && navigate('/')} 
                            className={`flex items-center gap-4 cursor-pointer group ${isExiting ? 'opacity-50 pointer-events-none' : ''}`}
                         >
                            <div className="bg-slate-900 text-white p-2 rounded-xl shadow-lg group-hover:scale-105 transition-all group-hover:shadow-indigo-500/20">
                                <FlaskConical size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase leading-none">Production Toolkit Pro</h1>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full border ${isVercel ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-400 bg-slate-100 border-slate-200'}`}>
                                        <span className="flex items-center gap-1">
                                            {isVercel ? <Cloud size={8} /> : <Monitor size={8} />}
                                            {isVercel ? 'Cloud Node' : 'Web Node'}
                                        </span>
                                    </span>
                                    {isAdmin && (
                                        <span className="text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg animate-pulse ring-1 ring-indigo-300 flex items-center gap-1">
                                            <ShieldCheck size={8} />
                                            Admin
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {profile?.is_subscribed && profile.subscription_end && !isLanding && (
                            <TrialTimer endDate={profile.subscription_end} isTrial={isTrial} label={isTrial ? "Trial" : "Plan"} />
                        )}

                        <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
                            {hasActiveAnnouncement && !isExiting && (
                                <button 
                                    onClick={triggerAnnouncement}
                                    className={`p-2 rounded-xl transition-all relative ${isAnnouncementUnread ? 'text-indigo-600 bg-white shadow-sm' : 'text-slate-400 hover:text-indigo-600'}`}
                                >
                                    <Bell size={18} />
                                    {isAnnouncementUnread && <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full ring-2 ring-white"></span>}
                                </button>
                            )}

                            {!isLanding && !isExiting && (
                                <button 
                                    onClick={() => navigate('/dashboard')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/dashboard' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-indigo-600'}`}
                                >
                                    <LayoutDashboard size={18} />
                                </button>
                            )}

                            {isAdmin && !isExiting && (
                                <button 
                                    onClick={() => navigate('/admin')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/admin' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-indigo-600'}`}
                                >
                                    <Settings size={18} />
                                </button>
                            )}
                            
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            
                            <button 
                                onClick={handleSignOut}
                                disabled={isExiting}
                                className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all ${isExiting ? 'text-indigo-500 animate-pulse' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                            >
                                <LogOut size={14} />
                                <span className="hidden sm:inline">{isExiting ? 'Disconnecting...' : 'Exit'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className={`flex-grow w-full relative z-10 overflow-y-auto custom-scrollbar ${isExiting ? 'pointer-events-none blur-[2px]' : ''}`}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </main>

            <footer className="bg-white border-t border-slate-200/60 py-4 mt-auto">
                <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    <p>&copy; 2025 Editorial Systems Pro • Precision Engineering</p>
                    <div className="flex items-center gap-6">
                        <span className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            Status: {isOnline ? 'Synchronized' : 'Offline Mode'}
                        </span>
                        <span>v1.7.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
