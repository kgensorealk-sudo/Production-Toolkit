
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';
import { getDeviceId } from '../utils/device';

interface FreeToolStatus {
    id: string;
    expires_at: string;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    freeTools: string[];
    freeToolsData: Record<string, string>; // Maps ID to Expiry ISO string
    loading: boolean;
    signOut: (isAuto?: boolean) => Promise<void>;
    refreshProfile: () => Promise<void>;
    refreshFreeTools: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_LIMIT = 4 * 60 * 60 * 1000; 
const ACTIVITY_STORAGE_KEY = 'prod_toolkit_last_active';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    
    const lastUserId = useRef<string | null>(null);

    const resetInactivityTimestamp = () => {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString());
    };

    const fetchFreeTools = async () => {
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
            console.error("Failed to fetch free tools:", err);
        }
    };

    const signOut = async (isAuto: boolean = false) => {
        try {
            setLoading(true); 
            if (user?.id) localStorage.removeItem(`profile_cache_${user.id}`);
            await supabase.auth.signOut();
            localStorage.removeItem(ACTIVITY_STORAGE_KEY);
            if (isAuto) sessionStorage.setItem('session_expired', 'true');
            setProfile(null);
            setSession(null);
            setUser(null);
            lastUserId.current = null;
        } catch (error) {
            console.error("Sign out error:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProfile = async (userId: string) => {
        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (profileError) throw profileError;

            const { data: keysData } = await supabase
                .from('access_keys')
                .select('tool')
                .eq('user_id', userId)
                .eq('is_used', true);

            const unlockedTools = keysData ? keysData.map(k => k.tool) : [];

            let isActive = profileData.is_subscribed;
            if (profileData.subscription_end) {
                const endDate = new Date(profileData.subscription_end);
                if (endDate < new Date()) isActive = false;
            }

            const finalProfile: UserProfile = { 
                ...profileData, 
                is_subscribed: isActive,
                unlocked_tools: unlockedTools 
            };

            setProfile(finalProfile);
        } catch (err: any) {
            console.error("Profile fetch error:", err);
        }
    };

    const refreshProfile = async () => { if (user?.id) await fetchProfile(user.id); };

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            await fetchFreeTools();
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && mounted) {
                setSession(session);
                setUser(session.user);
                lastUserId.current = session.user.id;
                resetInactivityTimestamp();
                await fetchProfile(session.user.id);
            }
            if (mounted) setLoading(false);
        };
        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;
            if (event === 'SIGNED_OUT') {
                setProfile(null); setUser(null); setSession(null);
            } else if (session?.user) {
                setSession(session); setUser(session.user);
                if (session.user.id !== lastUserId.current) {
                    lastUserId.current = session.user.id;
                    await fetchProfile(session.user.id);
                }
            }
        });

        return () => { mounted = false; subscription.unsubscribe(); };
    }, []);

    const value = { 
        session, 
        user, 
        profile, 
        freeTools, 
        freeToolsData,
        loading, 
        signOut, 
        refreshProfile, 
        refreshFreeTools: fetchFreeTools 
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
