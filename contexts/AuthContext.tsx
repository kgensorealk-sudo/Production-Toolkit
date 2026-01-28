import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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

const HEARTBEAT_INTERVAL = 90 * 1000;
const SB_STORAGE_KEY = 'sb-jtrvpqxhjqpifglrhbzu-auth-token';
const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    
    const lastHeartbeat = useRef<number>(0);
    const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalAuthRef = useRef({ sub: false, admin: false });

    const isAdmin = (
        user?.email === SUPER_ADMIN_EMAIL ||
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const clearLocalSession = () => {
        try {
            console.warn("Auth: Purging local session storage.");
            localStorage.removeItem(SB_STORAGE_KEY);
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            });
            sessionStorage.clear();
        } catch (e) {
            console.error("Auth: Failed to clear storage", e);
        }
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
            console.warn("Auth: Free tools fetch skipped/failed.");
        }
    };

    const fetchProfile = async (userId: string) => {
        try {
            // Profile fetch with timeout capability via abort controller if needed, 
            // but usually a simple select is fine unless RLS is recursive.
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) throw profileError;
            if (!profileData) return;

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

            const finalProfile = { ...profileData, is_subscribed: isActive, unlocked_tools: unlockedTools };
            internalAuthRef.current = { sub: isActive, admin: (profileData.role === 'admin' || user?.email === SUPER_ADMIN_EMAIL) };
            setProfile(finalProfile);
            lastHeartbeat.current = Date.now();
        } catch (err: any) {
            console.error("Auth: Profile Fetch Error:", err.message);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        try {
            setLoading(true); 
            await (supabase.auth as any).signOut();
        } catch (e) {} finally {
            clearLocalSession();
            setProfile(null); setSession(null); setUser(null);
            internalAuthRef.current = { sub: false, admin: false };
            setLoading(false);
            if (isAuto || !session) window.location.hash = '#/login';
        }
    };

    useEffect(() => {
        let mounted = true;

        // FAIL-SAFE: 5 Second Initialization Timeout
        // If Supabase takes too long, we force the app to try and render anyway.
        initTimeoutRef.current = setTimeout(() => {
            if (mounted && loading) {
                console.error("Auth: Initialization timed out. Forcing ready state.");
                setLoading(false);
            }
        }, 5000);

        const init = async () => {
            try {
                // Step 1: Get Session
                const { data, error } = await (supabase.auth as any).getSession();
                
                if (error) {
                    if (error.message.toLowerCase().includes('refresh_token') || error.status === 400) {
                        clearLocalSession();
                    }
                    throw error;
                }

                const currentSession = data?.session;
                if (currentSession && mounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    
                    // Step 2: Fetch metadata in parallel but don't block the finally block if they hang
                    // We use a local timeout for the profile/metadata fetch specifically
                    await Promise.race([
                        Promise.allSettled([
                            fetchProfile(currentSession.user.id),
                            fetchFreeTools()
                        ]),
                        new Promise(resolve => setTimeout(resolve, 3500))
                    ]);
                }
            } catch (err) {
                console.error("Auth: Init fail", err);
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
                setProfile(null); setUser(null); setSession(null);
                setLoading(false);
            } else if (event === 'SIGNED_IN' && newSession?.user) {
                setSession(newSession); setUser(newSession.user);
                await fetchProfile(newSession.user.id);
                setLoading(false);
            }
        });

        return () => { 
            mounted = false; 
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            if (authListener?.subscription) authListener.subscription.unsubscribe(); 
        };
    }, []);

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