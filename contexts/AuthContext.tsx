import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    freeTools: string[];
    freeToolsData: Record<string, string>;
    loading: boolean;
    signOut: (isAuto?: boolean) => Promise<void>;
    refreshProfile: () => Promise<void>;
    refreshFreeTools: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVITY_STORAGE_KEY = 'prod_toolkit_last_active';

// Helper to wrap Supabase calls in a timeout
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

    const fetchFreeTools = async () => {
        try {
            console.info("Auth: Fetching system config...");
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
                    const expiryDate = new Date(expiry as string);
                    if (expiryDate > now) {
                        activeMap[tid] = expiry as string;
                        activeIds.push(tid);
                    }
                });

                setFreeTools(activeIds);
                setFreeToolsData(activeMap);
                console.info(`Auth: Config loaded. ${activeIds.length} free tools.`);
            }
        } catch (err) {
            console.warn("Auth: Free tools fetch suppressed", err);
        }
    };

    const fetchProfile = async (userId: string) => {
        try {
            console.info(`Auth: Loading profile for ${userId}...`);
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            
            if (profileError) throw profileError;

            if (!profileData) {
                console.info("Auth: No profile record found. Using guest defaults.");
                setProfile({ id: userId, email: user?.email || '', role: 'user', is_subscribed: false, unlocked_tools: [] });
                return;
            }

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

            setProfile({ 
                ...profileData, 
                is_subscribed: isActive,
                unlocked_tools: unlockedTools 
            });
            console.info("Auth: Profile fully resolved.");
        } catch (err) {
            console.warn("Auth: Profile fetch suppressed", err);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        try {
            setLoading(true); 
            console.info("Auth: Signing out...");
            await supabase.auth.signOut();
            localStorage.removeItem(ACTIVITY_STORAGE_KEY);
            if (isAuto) sessionStorage.setItem('session_expired', 'true');
            setProfile(null);
            setSession(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const refreshProfile = async () => { if (user?.id) await fetchProfile(user.id); };

    useEffect(() => {
        let mounted = true;
        console.info("Auth: Starting system initialization...");
        
        // 1. Fail-safe Watchdog (Aggressive 5 seconds)
        const watchdog = setTimeout(() => {
            if (mounted && loading) {
                console.error("Auth: Initialization watchdog triggered! Forcing UI unlock.");
                setLoading(false);
            }
        }, 5000);

        const init = async () => {
            try {
                // Fetch basic state and session in parallel with a 4s timeout
                console.info("Auth: Requesting session...");
                const results = await withTimeout(
                    Promise.allSettled([
                        fetchFreeTools(),
                        supabase.auth.getSession()
                    ]),
                    4000,
                    'timeout' as any
                );

                if (results === 'timeout') {
                    console.error("Auth: Supabase connection timed out.");
                    if (mounted) setLoading(false);
                    return;
                }

                const sessionRes = results[1];
                if (sessionRes.status === 'fulfilled' && sessionRes.value.data.session) {
                    const currentSession = sessionRes.value.data.session;
                    console.info("Auth: Valid session found.");
                    if (mounted) {
                        setSession(currentSession);
                        setUser(currentSession.user);
                        lastUserId.current = currentSession.user.id;
                        await fetchProfile(currentSession.user.id);
                    }
                } else {
                    console.info("Auth: No active session.");
                }
            } catch (err) {
                console.error("Auth: Initialization error", err);
            } finally {
                if (mounted) {
                    clearTimeout(watchdog);
                    setLoading(false);
                }
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            console.info(`Auth: State change event: ${event}`);
            if (!mounted) return;
            
            if (event === 'SIGNED_OUT') {
                setProfile(null); setUser(null); setSession(null);
            } else if (newSession?.user) {
                setSession(newSession); setUser(newSession.user);
                if (newSession.user.id !== lastUserId.current) {
                    lastUserId.current = newSession.user.id;
                    await fetchProfile(newSession.user.id);
                }
            }
            setLoading(false);
        });

        return () => { 
            mounted = false; 
            clearTimeout(watchdog);
            subscription.unsubscribe(); 
        };
    }, []);

    const value = { session, user, profile, freeTools, freeToolsData, loading, signOut, refreshProfile, refreshFreeTools: fetchFreeTools };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
    return context;
};