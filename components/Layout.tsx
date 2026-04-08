import React, { useState, useEffect } from 'react';
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
    FlaskConical,
    MessageCircle,
    Mail
} from 'lucide-react';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import TrialTimer from './TrialTimer';
import ExpiryReminderModal from './ExpiryReminderModal';
import LoadingOverlay from './LoadingOverlay';
import FeedbackModal from './FeedbackModal';
import Toast from './Toast';
import { MessageSquare } from 'lucide-react';

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
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    
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
                    .select('id, content, category')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false });

                if (data && data.length > 0) {
                    // Filter based on user preferences
                    const filtered = data.find(a => {
                        if (!profile) return true; // Show all if profile not loaded
                        const prefs = profile.notification_preferences || {
                            system_alerts: true,
                            security_updates: true,
                            maintenance_windows: true
                        };
                        const category = (a.category || 'system_alerts') as keyof typeof prefs;
                        return prefs[category] !== false;
                    });

                    if (filtered) {
                        setHasActiveAnnouncement(true);
                        const contentHash = btoa(filtered.content.substring(0, 30)).substring(0, 8);
                        const seenKey = `ann_seen_${filtered.id}_${contentHash}`;
                        setIsAnnouncementUnread(!localStorage.getItem(seenKey));
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

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [profile?.notification_preferences]);

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

    useEffect(() => {
        if (!user?.id || authLoading) return;

        let isMounted = true;
        const checkUnread = async () => {
            if (!isMounted) return;
            try {
                // 1. Check Direct Messages
                const { count: dmCount, error: dmError } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('receiver_id', user.id)
                    .eq('is_read', false);

                if (dmError) throw dmError;

                if (dmCount && dmCount > 0) {
                    if (isMounted) setHasNewMessages(true);
                    return;
                }

                // 2. Check Global Chat
                const lastGlobalRead = profile?.last_global_read_at || '1970-01-01T00:00:00Z';
                const { count: globalCount, error: globalError } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .is('receiver_id', null)
                    .is('channel_id', null)
                    .gt('created_at', lastGlobalRead)
                    .neq('sender_id', user.id);

                if (globalError) throw globalError;

                if (globalCount && globalCount > 0) {
                    if (isMounted) setHasNewMessages(true);
                    return;
                }

                // 3. Check Channel Messages
                const { data: memberships, error: memError } = await supabase
                    .from('channel_members')
                    .select('channel_id, last_read_at')
                    .eq('user_id', user.id);

                if (memError) throw memError;

                if (memberships && memberships.length > 0) {
                    for (const membership of memberships) {
                        const lastRead = membership.last_read_at || '1970-01-01T00:00:00Z';
                        const { count: chanCount, error: chanError } = await supabase
                            .from('messages')
                            .select('*', { count: 'exact', head: true })
                            .eq('channel_id', membership.channel_id)
                            .gt('created_at', lastRead)
                            .neq('sender_id', user.id);

                        if (chanError) throw chanError;

                        if (chanCount && chanCount > 0) {
                            if (isMounted) setHasNewMessages(true);
                            return;
                        }
                    }
                }

                if (isMounted) setHasNewMessages(false);
            } catch (e) {
                console.error('Error checking unread messages:', e);
            }
        };

        // Initial check
        checkUnread();

        // Set up real-time subscription
        const channel = supabase
            .channel(`unread-monitor-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages'
                },
                (payload) => {
                    const msg = payload.new;
                    // Trigger check if message is for this user or in a channel they belong to
                    // Or if it's a global message
                    if (msg.sender_id !== user.id) {
                        checkUnread();
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${user.id}`
                },
                () => checkUnread()
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'channel_members',
                    filter: `user_id=eq.${user.id}`
                },
                () => checkUnread()
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'channel_members',
                    filter: `user_id=eq.${user.id}`
                },
                () => checkUnread()
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'channel_members',
                    filter: `user_id=eq.${user.id}`
                },
                () => checkUnread()
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${user.id}`
                },
                () => checkUnread()
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    checkUnread(); // Re-check once subscribed to be safe
                }
            });

        // Periodic check as a fallback
        const interval = setInterval(checkUnread, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [user?.id, authLoading, profile?.last_global_read_at]);

    const isMessaging = location.pathname === '/messaging';
    const isTrial = !!profile?.trial_end;
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
                                    title="Dashboard"
                                >
                                    <LayoutDashboard size={18} />
                                </button>
                            )}


                            {!isLanding && !isExiting && (
                                <button 
                                    onClick={() => navigate('/messaging')} 
                                    className={`p-2 rounded-xl transition-all relative ${location.pathname === '/messaging' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-indigo-600'}`}
                                    title="Messaging"
                                >
                                    <MessageCircle size={18} />
                                    {hasNewMessages && (
                                        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[7px] font-black px-1 py-0.5 rounded-md shadow-lg shadow-rose-200 animate-bounce uppercase tracking-tighter">
                                            New
                                        </span>
                                    )}
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

            <main className={`flex-grow w-full relative z-10 ${isMessaging ? 'overflow-hidden' : 'overflow-y-auto'} min-h-0 custom-scrollbar ${isExiting ? 'pointer-events-none blur-[2px]' : ''}`}>
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

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <footer className="bg-white border-t border-slate-200/60 py-4 mt-auto">
                <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    <p>&copy; 2025 Editorial Systems Pro • Precision Engineering</p>
                    <div className="flex items-center gap-6">
                        {!isExiting && (
                            <button 
                                onClick={() => setIsFeedbackOpen(true)}
                                className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 group"
                            >
                                <MessageSquare size={10} className="group-hover:scale-110 transition-transform" />
                                <span>Feedback</span>
                            </button>
                        )}
                        <span className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            Status: {isOnline ? 'Synchronized' : 'Offline Mode'}
                        </span>
                        <span>v1.8.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
