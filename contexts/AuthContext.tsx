
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';
import { INACTIVITY_LIMIT } from '../constants';

type Session = any;
type User = any;

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    freeTools: string[];
    freeToolsData: Record<string, string>;
    loading: boolean;
    isAdmin: boolean;
    signOut: (isAuto?: boolean) => Promise<void>;
    refreshProfile: () => Promise<void>;
    refreshFreeTools: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SB_STORAGE_KEY = 'sb-jtrvpqxhjqpifglrhbzu-auth-token';
const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';
const HEARTBEAT_INTERVAL = 120 * 1000; // 2 Minutes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    
    const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const protocolPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isAdmin = (
        user?.email === SUPER_ADMIN_EMAIL ||
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const clearLocalSession = () => {
        try {
            localStorage.removeItem(SB_STORAGE_KEY);
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            });
            sessionStorage.removeItem('session_expired');
        } catch (e) {}
    };

    const updateLastSeen = async (uid: string) => {
        try {
            await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', uid);
        } catch (err) {
            console.warn("Heartbeat failed to sync.");
        }
    };

    const fetchFreeTools = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('free_tools_data')
                .eq('id', 'global')
                .maybeSingle();
            
            if (data?.free_tools_data) {
                const now = new Date();
                const activeMap: Record<string, string> = {};
                const activeIds: string[] = [];
                Object.entries(data.free_tools_data).forEach(([tid, expiry]) => {
                    if (new Date(expiry as string) > now) {
                        activeMap[tid] = expiry as string;
                        activeIds.push(tid);
                    }
                });
                // Only update state if data has actually changed to prevent render loops
                setFreeTools(prev => JSON.stringify(prev) === JSON.stringify(activeIds) ? prev : activeIds);
                setFreeToolsData(prev => JSON.stringify(prev) === JSON.stringify(activeMap) ? prev : activeMap);
            }
        } catch (err) {}
    }, []);

    const fetchProfile = useCallback(async (userId: string) => {
        if (!userId) return;
        try {
            updateLastSeen(userId);

            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError || !profileData) return;

            const { data: keysData } = await supabase
                .from('access_keys')
                .select('tool')
                .eq('user_id', userId)
                .eq('is_used', true);

            const unlockedTools = keysData ? keysData.map(k => k.tool) : [];
            let isActive = profileData.is_subscribed;
            
            if (user?.email === SUPER_ADMIN_EMAIL) isActive = true;
            else if (profileData.subscription_end && new Date(profileData.subscription_end) < new Date()) {
                isActive = false;
            }

            setProfile({ ...profileData, is_subscribed: isActive, unlocked_tools: unlockedTools });
        } catch (e) {
            console.error("Profile sync failure", e);
        }
    }, [user?.email]);

    const signOut = useCallback(async (isAuto: boolean = false) => {
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (protocolPollRef.current) clearInterval(protocolPollRef.current);
        
        try {
            setLoading(true); 
            await (supabase.auth as any).signOut();
        } catch (e) {} finally {
            clearLocalSession();
            if (isAuto) {
                sessionStorage.setItem('session_expired', 'true');
            }
            setProfile(null); setSession(null); setUser(null);
            setLoading(false);
            window.location.hash = '#/login';
        }
    }, []);

    const resetIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (session) {
            idleTimerRef.current = setTimeout(() => {
                signOut(true);
            }, INACTIVITY_LIMIT);
        }
    }, [session, signOut]);

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        const handler = () => resetIdleTimer();

        if (session) {
            events.forEach(event => window.addEventListener(event, handler));
            resetIdleTimer();
        }

        return () => {
            events.forEach(event => window.removeEventListener(event, handler));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [session, resetIdleTimer]);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                initTimeoutRef.current = setTimeout(() => {
                    if (mounted && loading) {
                        setLoading(false);
                    }
                }, 4000);

                const { data, error } = await (supabase.auth as any).getSession();
                
                if (error) {
                    if (error.status === 400 || error.message.toLowerCase().includes('refresh_token')) {
                        clearLocalSession();
                    }
                    throw error;
                }

                const currentSession = data?.session;
                if (currentSession && mounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    
                    updateLastSeen(currentSession.user.id);
                    
                    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                    heartbeatTimerRef.current = setInterval(() => {
                        updateLastSeen(currentSession.user.id);
                    }, HEARTBEAT_INTERVAL);

                    if (protocolPollRef.current) clearInterval(protocolPollRef.current);
                    protocolPollRef.current = setInterval(() => fetchFreeTools(), 300000);

                    await Promise.allSettled([
                        fetchProfile(currentSession.user.id),
                        fetchFreeTools()
                    ]);

                    supabase
                        .channel('system-protocols')
                        .on(
                            'postgres_changes', 
                            { event: 'UPDATE', schema: 'public', table: 'system_settings', filter: 'id=eq.global' },
                            () => {
                                fetchFreeTools();
                            }
                        )
                        .subscribe();
                }
            } catch (err) {
                console.error("Auth: Bootstrap failed", err);
            } finally {
                if (mounted) {
                    if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
                    setLoading(false);
                }
            }
        };

        init();

        const { data: authListener } = (supabase.auth as any).onAuthStateChange(async (event: any, newSession: any) => {
            if (!mounted) return;
            if (event === 'SIGNED_OUT') {
                if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                if (protocolPollRef.current) clearInterval(protocolPollRef.current);
                setProfile(null); setUser(null); setSession(null);
                setLoading(false);
            } else if (event === 'SIGNED_IN' && newSession?.user) {
                setSession(newSession); setUser(newSession.user);
                
                updateLastSeen(newSession.user.id);
                
                if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = setInterval(() => {
                    updateLastSeen(newSession.user.id);
                }, HEARTBEAT_INTERVAL);

                await fetchProfile(newSession.user.id);
                await fetchFreeTools();
                setLoading(false);
            }
        });

        return () => { 
            mounted = false; 
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (protocolPollRef.current) clearInterval(protocolPollRef.current);
            if (authListener?.subscription) authListener.subscription.unsubscribe(); 
            supabase.removeAllChannels();
        };
    }, [fetchFreeTools, fetchProfile]); // Added fetch dependencies to init effect

    return (
        <AuthContext.Provider value={{ 
            session, user, profile, freeTools, freeToolsData, loading, isAdmin,
            signOut, refreshProfile: () => user ? fetchProfile(user.id) : Promise.resolve(), 
            refreshFreeTools: fetchFreeTools 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
