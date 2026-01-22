
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';
import { INACTIVITY_LIMIT } from '../constants';

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

const ACTIVITY_STORAGE_KEY = 'prod_toolkit_last_active';
const HEARTBEAT_INTERVAL = 2 * 60 * 1000;
const SB_STORAGE_KEY = 'sb-jtrvpqxhjqpifglrhbzu-auth-token';

const withTimeout = <T,>(promise: Promise<T>, ms: number, timeoutValue: T): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(timeoutValue), ms))
    ]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    
    const lastUserId = useRef<string | null>(null);
    const lastHeartbeat = useRef<number>(0);
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // SECURITY: isAdmin is derived from the User JWT (app_metadata), 
    // which is signed by Supabase and cannot be modified by the user in memory.
    const isAdmin = (
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const clearLocalSession = () => {
        localStorage.removeItem(SB_STORAGE_KEY);
        localStorage.removeItem(ACTIVITY_STORAGE_KEY);
        lastHeartbeat.current = 0; 
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {}
    };

    const updateLastSeen = async (uid: string, force: boolean = false) => {
        const now = Date.now();
        if (!force && (now - lastHeartbeat.current < HEARTBEAT_INTERVAL)) return;
        
        lastHeartbeat.current = now;
        try {
            await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', uid);
        } catch (err) {}
    };

    const fetchFreeTools = async () => {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('free_tools_data')
                .eq('id', 'global')
                .maybeSingle();
            
            if (error) throw error;
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
        } catch (err) {
            console.warn("Auth: System config sync error");
        }
    };

    const fetchProfile = async (userId: string) => {
        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            
            if (profileError) throw profileError;

            let finalProfile: UserProfile;

            if (!profileData) {
                // Initial creation handled by trigger, but we set a safe default for the local state
                finalProfile = { id: userId, email: user?.email || '', role: 'user', is_subscribed: false, unlocked_tools: [] };
            } else {
                const { data: keysData } = await supabase
                    .from('access_keys')
                    .select('tool')
                    .eq('user_id', userId)
                    .eq('is_used', true);

                const unlockedTools = keysData ? keysData.map(k => k.tool) : [];
                let isActive = profileData.is_subscribed;
                if (profileData.subscription_end && new Date(profileData.subscription_end) < new Date()) {
                    isActive = false;
                }

                finalProfile = { 
                    ...profileData, 
                    is_subscribed: isActive,
                    unlocked_tools: unlockedTools 
                };
            }

            setProfile(finalProfile);
            updateLastSeen(userId, true);
        } catch (err) {
            console.error("Auth: Profile sync error", err);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        const uid = user?.id;
        try {
            setLoading(true); 
            if (isAuto && uid) await updateLastSeen(uid, true);
            await supabase.auth.signOut();
            clearLocalSession();
            setProfile(null); setSession(null); setUser(null);
            lastUserId.current = null;
        } finally {
            setLoading(false);
        }
    };

    const resetInactivityTimer = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (session && user) {
            inactivityTimer.current = setTimeout(() => signOut(true), INACTIVITY_LIMIT);
            updateLastSeen(user.id);
        }
    };

    const refreshProfile = async () => { if (user?.id) await fetchProfile(user.id); };

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        const handleInteraction = () => resetInactivityTimer();
        if (session && user) {
            events.forEach(event => window.addEventListener(event, handleInteraction));
            resetInactivityTimer();
        }
        return () => {
            events.forEach(event => window.removeEventListener(event, handleInteraction));
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [session, user]);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                const results = await withTimeout(
                    Promise.allSettled([fetchFreeTools(), supabase.auth.getSession()]),
                    12000,
                    'timeout' as any
                );

                if (results === 'timeout') {
                    if (mounted) setLoading(false);
                    return;
                }

                const sessionRes = results[1];
                if (sessionRes.status === 'fulfilled') {
                    const { data: { session: currentSession } } = sessionRes.value;
                    if (currentSession && mounted) {
                        setSession(currentSession);
                        setUser(currentSession.user);
                        lastUserId.current = currentSession.user.id;
                        await fetchProfile(currentSession.user.id);
                    }
                }
            } catch (err) {
                clearLocalSession();
            } finally {
                if (mounted) setLoading(false);
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (!mounted) return;
            if (event === 'SIGNED_OUT') {
                setProfile(null); setUser(null); setSession(null);
                setLoading(false);
            } else if (event === 'SIGNED_IN' && newSession?.user) {
                setSession(newSession); setUser(newSession.user);
                fetchProfile(newSession.user.id);
            }
        });

        return () => { mounted = false; subscription.unsubscribe(); };
    }, []);

    const value = { 
        session, user, profile, freeTools, freeToolsData, loading, isAdmin,
        signOut, refreshProfile, refreshFreeTools: fetchFreeTools 
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
