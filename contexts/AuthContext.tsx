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
const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    
    const lastHeartbeat = useRef<number>(0);
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalAuthRef = useRef({ sub: false, admin: false });

    const isAdmin = (
        user?.email === SUPER_ADMIN_EMAIL ||
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const fetchFreeTools = async () => {
        try {
            const { data } = await supabase
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
                setFreeTools(activeIds);
                setFreeToolsData(activeMap);
            }
        } catch (err) {}
    };

    const fetchProfile = async (userId: string) => {
        try {
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
            
            if (user?.email === SUPER_ADMIN_EMAIL) {
                isActive = true;
            } else if (profileData.subscription_end && new Date(profileData.subscription_end) < new Date()) {
                isActive = false;
            }

            const finalProfile = { 
                ...profileData, 
                is_subscribed: isActive,
                unlocked_tools: unlockedTools 
            };

            internalAuthRef.current = {
                sub: isActive,
                admin: (profileData.role === 'admin' || user?.email === SUPER_ADMIN_EMAIL)
            };

            setProfile(finalProfile);
        } catch (err: any) {
            console.error("Auth Profile Fetch Error:", err.message);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        try {
            await (supabase.auth as any).signOut();
        } catch (e) {
        } finally {
            setProfile(null); setSession(null); setUser(null);
            if (isAuto) {
                sessionStorage.setItem('session_expired', 'true');
                window.location.hash = '#/login';
            }
        }
    };

    const resetInactivityTimer = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        if (session && user) {
            inactivityTimer.current = setTimeout(() => signOut(true), INACTIVITY_LIMIT);
        }
    };

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

        const initSession = async () => {
            const { data } = await (supabase.auth as any).getSession();
            if (data?.session && mounted) {
                setSession(data.session);
                setUser(data.session.user);
                await Promise.all([fetchProfile(data.session.user.id), fetchFreeTools()]);
            }
            if (mounted) setLoading(false);
        };

        initSession();

        const { data: authListener } = (supabase.auth as any).onAuthStateChange(async (event: any, newSession: any) => {
            if (!mounted) return;
            if (event === 'SIGNED_OUT') {
                setProfile(null); setUser(null); setSession(null);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (newSession) {
                    setSession(newSession);
                    setUser(newSession.user);
                    await fetchProfile(newSession.user.id);
                }
            }
            setLoading(false);
        });

        return () => { 
            mounted = false; 
            authListener.subscription.unsubscribe();
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