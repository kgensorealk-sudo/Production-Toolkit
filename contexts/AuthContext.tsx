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
 * Resiliency Protocol: withRetry
 * Tuned for Vercel/Edge network conditions and Supabase cold starts.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1500): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        const shouldRetry = !err.status || err.status >= 500 || err.message === 'Failed to fetch' || err.message?.includes('network');
        if (retries > 0 && shouldRetry) {
            await new Promise(r => setTimeout(r, delay));
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

    const warmUpDatabase = async () => {
        try {
            await supabase.from('system_settings').select('id').eq('id', 'global').limit(1).single();
        } catch (e) {
            console.warn("Waking up database node...");
        }
    };

    const processFreeToolsPayload = (payload: any) => {
        if (payload?.free_tools_data) {
            const now = new Date();
            const activeMap: Record<string, string> = {};
            const activeIds: string[] = [];
            Object.entries(payload.free_tools_data).forEach(([tid, expiry]) => {
                if (new Date(expiry as string) > now) {
                    activeMap[tid] = expiry as string;
                    activeIds.push(tid);
                }
            });
            setFreeTools(activeIds);
            setFreeToolsData(activeMap);
        } else {
            setFreeTools([]);
            setFreeToolsData({});
        }
    };

    const fetchFreeTools = useCallback(async () => {
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('system_settings').select('free_tools_data').eq('id', 'global').maybeSingle();
                if (error) throw error;
                return data;
            });
            processFreeToolsPayload(data);
        } catch (err) {}
    }, []);

    const fetchProfile = useCallback(async (userId: string) => {
        if (!userId) return;
        if (refreshingPromise.current) return refreshingPromise.current;

        refreshingPromise.current = (async () => {
            try {
                setIsWakingUp(true);
                await warmUpDatabase();

                const profileData = await withRetry(async () => {
                    let profileRow = null;
                    for (let i = 0; i < 3; i++) {
                        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
                        if (data) { profileRow = data; break; }
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    if (!profileRow) {
                        const { data: newData, error: createError } = await supabase.from('profiles').upsert([{ id: userId, email: user?.email, role: 'user' }]).select().maybeSingle();
                        if (createError) throw createError;
                        profileRow = newData;
                    }
                    return profileRow;
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
                console.error("CRITICAL_SYNC_FAILURE:", e);
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
        try {
            await (supabase.auth as any).signOut();
        } catch (e) {
        } finally {
            Object.keys(localStorage).forEach(key => { if (key.includes('sb-')) localStorage.removeItem(key); });
            setProfile(null); setSession(null); setUser(null);
            if (isAuto) sessionStorage.setItem('session_expired', 'true');
            window.location.replace('/');
        }
    }, []);

    // REAL-TIME PROTOCOL SUBSCRIPTION
    useEffect(() => {
        if (!session) return;

        // Listen for Global System Settings Changes
        const systemChannel = supabase
            .channel('system-logic-sync')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'system_settings', filter: 'id=eq.global' },
                (payload) => {
                    console.log('REALTIME_PROTOCOL_SYNC:', payload.new);
                    processFreeToolsPayload(payload.new);
                }
            )
            .subscribe();

        // Listen for User Profile Changes (forced expirations, admin overrides)
        const profileChannel = supabase
            .channel(`user-sync-${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
                () => {
                    console.log('REALTIME_IDENTITY_SYNC: Triggering profile refresh...');
                    fetchProfile(user.id);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(systemChannel);
            supabase.removeChannel(profileChannel);
        };
    }, [session, user?.id, fetchProfile]);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                initTimeoutRef.current = setTimeout(() => { if (mounted && loading) setLoading(false); }, 20000); 

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
                console.error("INIT_FAILED:", err);
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
