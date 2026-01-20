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
    // Fixed: Use ReturnType<typeof setTimeout> instead of NodeJS.Timeout to avoid namespace issues in browser environments
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        } catch (err) {
            console.warn("Auth: Profile fetch suppressed", err);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        try {
            setLoading(true); 
            console.info(isAuto ? "Auth: Auto-signing out due to inactivity..." : "Auth: User signing out...");
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

    const resetInactivityTimer = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        
        // Only track inactivity if a user is actually logged in
        if (session && user) {
            inactivityTimer.current = setTimeout(() => {
                signOut(true);
            }, INACTIVITY_LIMIT);
        }
    };

    const refreshProfile = async () => { if (user?.id) await fetchProfile(user.id); };

    // Inactivity Event Listeners
    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        
        const handleInteraction = () => {
            resetInactivityTimer();
        };

        if (session && user) {
            events.forEach(event => window.addEventListener(event, handleInteraction));
            resetInactivityTimer(); // Start timer on login
        }

        return () => {
            events.forEach(event => window.removeEventListener(event, handleInteraction));
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [session, user]);

    useEffect(() => {
        let mounted = true;
        
        const watchdog = setTimeout(() => {
            if (mounted && loading) {
                console.error("Auth: Initialization watchdog triggered.");
                setLoading(false);
            }
        }, 10000);

        const init = async () => {
            try {
                const results = await withTimeout(
                    Promise.allSettled([
                        fetchFreeTools(),
                        supabase.auth.getSession()
                    ]),
                    10000,
                    'timeout' as any
                );

                if (results === 'timeout') {
                    if (mounted) setLoading(false);
                    return;
                }

                const sessionRes = results[1];
                if (sessionRes.status === 'fulfilled' && sessionRes.value.data.session) {
                    const currentSession = sessionRes.value.data.session;
                    if (mounted) {
                        setSession(currentSession);
                        setUser(currentSession.user);
                        lastUserId.current = currentSession.user.id;
                        fetchProfile(currentSession.user.id);
                    }
                }
            } catch (err) {
                console.error("Auth: Initialization exception", err);
            } finally {
                if (mounted) {
                    clearTimeout(watchdog);
                    setLoading(false);
                }
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (!mounted) return;
            
            if (event === 'SIGNED_OUT') {
                setProfile(null); setUser(null); setSession(null);
                setLoading(false);
            } else if (newSession?.user) {
                setSession(newSession); 
                setUser(newSession.user);
                setLoading(false); 
                
                if (newSession.user.id !== lastUserId.current) {
                    lastUserId.current = newSession.user.id;
                    fetchProfile(newSession.user.id);
                }
            } else {
                setLoading(false);
            }
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