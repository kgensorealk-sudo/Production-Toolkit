import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    LayoutDashboard, 
    LogOut, 
    Bell, 
    Wifi, 
    WifiOff, 
    ShieldCheck, 
    Shield,
    Cloud, 
    Monitor,
    FlaskConical
} from 'lucide-react';
import { ToolId } from '../types';
import AnnouncementModal from './AnnouncementModal';
import SubscriptionExtensionModal from './SubscriptionExtensionModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import TrialTimer from './TrialTimer';
import ExpiryReminderModal from './ExpiryReminderModal';
import LoadingOverlay from './LoadingOverlay';
import FeedbackModal from './FeedbackModal';
import TermsModal from './TermsModal';
import TermsGateModal from './TermsGateModal';
import Toast from './Toast';
import AIAssistantBubble from './AIAssistantBubble';
import { MessageSquare, Scale } from 'lucide-react';

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
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isTermsOpen, setIsTermsOpen] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [isKeeperOpen, setIsKeeperOpen] = useState(false);
    const [isKeeperUnread, setIsKeeperUnread] = useState(false);
    
    const isVercel = window.location.hostname.includes('vercel.app');

    useEffect(() => {
        const handleKeeperStatus = (e: any) => {
            if (e.detail) {
                setIsKeeperOpen(Boolean(e.detail.isOpen));
                setIsKeeperUnread(Boolean(e.detail.hasUnread));
            }
        };
        window.addEventListener('app:keeper-status', handleKeeperStatus);
        return () => window.removeEventListener('app:keeper-status', handleKeeperStatus);
    }, []);

    const handleToggleKeeper = () => {
        window.dispatchEvent(new CustomEvent('app:toggle-keeper'));
    };

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

    const profileRef = useRef(profile);
    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkBroadcastStatus = async () => {
            try {
                const currentProfile = profileRef.current;
                let { data, error } = await supabase
                    .from('announcements')
                    .select('id, content, category, created_at, is_mandatory')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false });

                if (error) {
                    const fallback = await supabase
                        .from('announcements')
                        .select('id, content, created_at')
                        .eq('is_active', true)
                        .order('created_at', { ascending: false });
                    data = fallback.data as any;
                }

                if (data && data.length > 0) {
                    // Filter based on user preferences
                    const filtered = data.find(a => {
                        if (!currentProfile) return true; // Show all if profile not loaded
                        const prefs = currentProfile.notification_preferences || {
                            system_alerts: true,
                            security_updates: true,
                            maintenance_windows: true
                        };
                        const category = (a.category || 'system_alerts') as keyof typeof prefs;
                        return prefs[category] !== false;
                    });

                    if (filtered) {
                        setHasActiveAnnouncement(true);
                        const seenKey = `ann_seen_${filtered.id}_${filtered.created_at}`;
                        const hasSeenLocally = localStorage.getItem(seenKey);
                        
                        if (hasSeenLocally) {
                            setIsAnnouncementUnread(false);
                            return;
                        }

                        // Source of Truth check
                        if (user?.id) {
                            const { data: readData } = await supabase
                                .from('announcement_reads')
                                .select('id')
                                .eq('announcement_id', filtered.id)
                                .eq('user_id', user.id)
                                .maybeSingle();

                            if (readData) {
                                localStorage.setItem(seenKey, 'true');
                                setIsAnnouncementUnread(false);
                            } else {
                                setIsAnnouncementUnread(true);
                            }
                        } else {
                            setIsAnnouncementUnread(true);
                        }
                    } else {
                        setHasActiveAnnouncement(false);
                    }
                } else {
                    setHasActiveAnnouncement(false);
                }
            } catch (e) {}
        };

        checkBroadcastStatus();
        const interval = setInterval(checkBroadcastStatus, 60000 * 5);
        const handleSync = () => checkBroadcastStatus();
        const handleShowTerms = () => setIsTermsOpen(true);
        window.addEventListener('app:announcement-sync', handleSync);
        window.addEventListener('app:show-terms', handleShowTerms);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('app:announcement-sync', handleSync);
            window.removeEventListener('app:show-terms', handleShowTerms);
            clearInterval(interval);
        };
    }, [user?.id]);

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

    const isTrial = !!(profile?.trial_end && profile.trial_end === profile.subscription_end);
    const headerClass = isLanding 
    ? "bg-transparent py-6" 
    : "glass-header py-3 shadow-sm";

    return (
        <div className={`h-screen flex flex-col font-sans text-slate-900 bg-slate-50 selection:bg-indigo-100 overflow-hidden ${isExiting ? 'grayscale cursor-wait' : ''}`}>
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
                            {/* Announcements Bell Icon */}
                            {!isExiting && (
                                <button 
                                    id="announcements-bell-btn"
                                    onClick={triggerAnnouncement}
                                    className={`p-2 rounded-xl transition-all relative cursor-pointer ${
                                        isAnnouncementUnread 
                                            ? 'text-indigo-600 bg-white shadow-sm ring-2 ring-indigo-300' 
                                            : 'text-slate-400 hover:text-indigo-600 hover:bg-white/60'
                                    }`}
                                    title={hasActiveAnnouncement ? (isAnnouncementUnread ? "New Announcements & Alerts" : "System Announcements") : "System Announcements"}
                                >
                                    <Bell size={18} />
                                    {isAnnouncementUnread && (
                                        <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full ring-2 ring-white animate-ping" />
                                    )}
                                    {isAnnouncementUnread && (
                                        <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full ring-2 ring-white" />
                                    )}
                                </button>
                            )}

                            {/* Dedicated Keeper AI Assistant Floater Icon */}
                            {!isExiting && (
                                <button 
                                    id="keeper-header-toggle-btn"
                                    onClick={handleToggleKeeper}
                                    className={`p-1.5 rounded-xl transition-all relative group flex items-center justify-center cursor-pointer ${
                                        isKeeperOpen 
                                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80 ring-2 ring-indigo-400/40' 
                                            : 'text-slate-400 hover:text-indigo-600 hover:bg-white/70'
                                    }`}
                                    title={isKeeperOpen ? "Keeper AI Assistant (Open - Click to minimize)" : "Keeper AI Assistant (Click to open chat floater)"}
                                    aria-label="Toggle Keeper AI Chat Floater"
                                >
                                    <div className="relative w-5 h-5 rounded-full overflow-hidden border border-indigo-200 shadow-2xs shrink-0 bg-slate-900">
                                        <img 
                                            src="/keeper_avatar.jpg" 
                                            alt="Keeper Dog Mascot" 
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                        />
                                        <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-white" />
                                    </div>
                                    {isKeeperUnread && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-bounce" />
                                    )}
                                </button>
                            )}

                            {!isLanding && !isExiting && (
                                <button 
                                    onClick={() => navigate('/dashboard')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/dashboard' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-indigo-600'}`}
                                    title="Dashboard"
                                >
                                    <LayoutDashboard size={18} />
                                </button>
                            )}

                            {!isLanding && !isExiting && (
                                <button 
                                    onClick={() => navigate('/experimental')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/experimental' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-amber-600'}`}
                                    title="Experimental Protocols"
                                >
                                    <FlaskConical size={18} />
                                </button>
                            )}

                            {isAdmin && !isExiting && (
                                <button 
                                    onClick={() => navigate('/admin')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/admin' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-indigo-600'}`}
                                    title="Admin Control"
                                >
                                    <Shield size={18} />
                                </button>
                            )}

                            
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>

                            {!isExiting && (
                                <div 
                                    onClick={() => navigate('/settings')}
                                    className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-slate-200/50 transition-all cursor-pointer group"
                                    title="View Profile"
                                >
                                    <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden flex-shrink-0 group-hover:border-indigo-200 transition-all">
                                        {profile?.avatar_url ? (
                                            <img 
                                                src={profile.avatar_url} 
                                                alt="Avatar" 
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase">
                                                {profile?.display_name?.substring(0, 2) || profile?.email?.substring(0, 2) || '??'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="hidden lg:flex flex-col items-start">
                                        <span className="text-[9px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[80px]">
                                            {profile?.display_name || 'User'}
                                        </span>
                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">
                                            {profile?.role || 'Member'}
                                        </span>
                                    </div>
                                </div>
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

            <main className={`flex-grow w-full relative z-10 overflow-y-auto min-h-0 custom-scrollbar ${isExiting ? 'pointer-events-none blur-[2px]' : ''}`}>
                <AnnouncementModal />
                <SubscriptionExtensionModal />
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

            <FeedbackModal 
                isOpen={isFeedbackOpen} 
                onClose={() => setIsFeedbackOpen(false)}
                onSuccess={(msg) => setToast({ msg, type: 'success' })}
                onError={(msg) => setToast({ msg, type: 'error' })}
                toolId={currentTool}
            />

            <TermsModal 
                isOpen={isTermsOpen}
                onClose={() => setIsTermsOpen(false)}
            />

            <TermsGateModal 
                isOpen={Boolean(user && profile && !profile.terms_accepted && !isAdmin && location.pathname !== '/terms')}
            />

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {!isExiting && <AIAssistantBubble currentTool={currentTool} />}

            <footer className="bg-white border-t border-slate-200/60 py-4 mt-auto">
                <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    <p>&copy; 2026 Editorial Systems Pro. All rights reserved.</p>
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setIsTermsOpen(true)}
                            className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 group"
                            title="Terms and Conditions of Use"
                        >
                            <Scale size={10} className="group-hover:scale-110 transition-transform" />
                            <span>TERMS & CONDITIONS</span>
                        </button>
                        {!isExiting && (
                            <button 
                                onClick={() => setIsFeedbackOpen(true)}
                                className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 group"
                            >
                                <MessageSquare size={10} className="group-hover:scale-110 transition-transform" />
                                <span>FEEDBACK</span>
                            </button>
                        )}
                        <span className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            STATUS: {isOnline ? 'SYNCHRONIZED' : 'OFFLINE MODE'}
                        </span>
                        <span>V1.8.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
