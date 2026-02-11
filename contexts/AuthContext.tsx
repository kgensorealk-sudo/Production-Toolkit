
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
    isWakingUp: boolean;
    signOut: (isAuto?: boolean) => Promise<void>;
    refreshProfile: () => Promise<void>;
    refreshFreeTools: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';
const HEARTBEAT_INTERVAL = 120 * 1000; 

/**
 * Advanced Resiliency: withRetry
 * Specifically tuned for Supabase cold starts and high-latency desktop environments.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 4, delay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        // Retry on network failures, 5xx server errors, or generic "fetch" errors
        const shouldRetry = !err.status || err.status >= 500 || err.message === 'Failed to fetch';
        if (retries > 0 && shouldRetry) {
            await new Promise(r => setTimeout(r, delay));
            // Exponential backoff
            return withRetry(fn, retries - 1, delay * 1.5);
        }
        throw err;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isWakingUp, setIsWakingUp] = useState(false);
    
    const refreshingPromise = useRef<Promise<void> | null>(null);
    const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isAdmin = (
        user?.email === SUPER_ADMIN_EMAIL ||
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const updateLastSeen = async (uid: string) => {
        try {
            await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid);
        } catch (err) {}
    };

    /**
     * DATABASE WARM-UP
     * Fires a lightweight request to "wake up" the database if it's on a free tier/idle.
     */
    const warmUpDatabase = async () => {
        try {
            const { error } = await supabase.from('system_settings').select('id').eq('id', 'global').limit(1).single();
            if (error) throw error;
        } catch (e) {
            console.warn("Warm-up ping failed, system might still be waking up.");
        }
    };

    const fetchFreeTools = useCallback(async () => {
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('system_settings').select('free_tools_data').eq('id', 'global').maybeSingle();
                if (error) throw error;
                return data;
            });
            
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
                setFreeTools(activeIds);
                setFreeToolsData(activeMap);
            }
        } catch (err) {}
    }, []);

    const fetchProfile = useCallback(async (userId: string) => {
        if (!userId) return;
        if (refreshingPromise.current) return refreshingPromise.current;

        refreshingPromise.current = (async () => {
            try {
                setIsWakingUp(true);
                // Ensure DB is alive before heavy profile calls
                await warmUpDatabase();

                const profileData = await withRetry(async () => {
                    let { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
                    if (error) throw error;
                    if (!data) {
                        const { data: newData, error: createError } = await supabase.from('profiles').insert([{ id: userId, email: user?.email, role: 'user' }]).select().maybeSingle();
                        if (createError) throw createError;
                        data = newData;
                    }
                    return data;
                });

                if (!profileData) return;

                const { data: keysData } = await withRetry(async () => {
                    const { data, error } = await supabase.from('access_keys').select('tool').eq('user_id', userId).eq('is_used', true);
                    if (error) throw error;
                    return { data };
                });

                const unlockedTools = keysData ? keysData.map(k => k.tool) : [];
                let isActive = profileData.is_subscribed;
                if (user?.email === SUPER_ADMIN_EMAIL) isActive = true;
                else if (profileData.subscription_end && new Date(profileData.subscription_end) < new Date()) isActive = false;

                setProfile({ ...profileData, is_subscribed: isActive, unlocked_tools: unlockedTools });
                updateLastSeen(userId);
            } catch (e) {
                console.error("Critical Auth Sync Error:", e);
            } finally {
                setIsWakingUp(false);
                refreshingPromise.current = null;
            }
        })();

        return refreshingPromise.current;
    }, [user?.email]);

    const signOut = useCallback(async (isAuto: boolean = false) => {
        setLoading(true);
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        try {
            supabase.removeAllChannels();
            await (supabase.auth as any).signOut();
        } catch (e) {
        } finally {
            Object.keys(localStorage).forEach(key => { if (key.includes('sb-')) localStorage.removeItem(key); });
            setProfile(null); setSession(null); setUser(null);
            if (isAuto) sessionStorage.setItem('session_expired', 'true');
            window.location.replace(window.location.href.split('#')[0]);
        }
    }, []);

    const resetIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (session) idleTimerRef.current = setTimeout(() => signOut(true), INACTIVITY_LIMIT);
    }, [session, signOut]);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                initTimeoutRef.current = setTimeout(() => { if (mounted && loading) setLoading(false); }, 15000); 

                const { data, error } = await withRetry(async () => {
                    const result = await (supabase.auth as any).getSession();
                    if (result.error) throw result.error;
                    return result;
                });
                
                const currentSession = data?.session;
                if (currentSession && mounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                    heartbeatTimerRef.current = setInterval(() => updateLastSeen(currentSession.user.id), HEARTBEAT_INTERVAL);
                    await Promise.allSettled([fetchProfile(currentSession.user.id), fetchFreeTools()]);
                }
            } catch (err) {
                console.error("Auth Init Failure:", err);
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
                setProfile(null); setUser(null); setSession(null);
                setLoading(false);
            } else if (event === 'SIGNED_IN' && newSession?.user) {
                setSession(newSession); setUser(newSession.user);
                await fetchProfile(newSession.user.id);
                await fetchFreeTools();
                setLoading(false);
            }
        });

        return () => { 
            mounted = false; 
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
            if (authListener?.subscription) authListener.subscription.unsubscribe(); 
        };
    }, [fetchFreeTools, fetchProfile]);

    return (
        <AuthContext.Provider value={{ 
            session, user, profile, freeTools, freeToolsData, loading, isAdmin, isWakingUp,
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
