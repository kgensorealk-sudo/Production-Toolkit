import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';

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
            
            if (error) {
                console.warn("Free tools fetch error (non-fatal):", error.message);
                return;
            }

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
            // Use maybeSingle to prevent exceptions if profile doesn't exist yet
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            
            if (profileError) {
                console.error("Profile fetch error:", profileError.message);
                return;
            }

            // If no profile record found yet, set a minimal guest profile
            if (!profileData) {
                setProfile({
                    id: userId,
                    email: user?.email || '',
                    role: 'user',
                    is_subscribed: false,
                    unlocked_tools: []
                });
                return;
            }

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
            console.error("Critical error in fetchProfile:", err);
        }
    };

    const refreshProfile = async () => { if (user?.id) await fetchProfile(user.id); };

    useEffect(() => {
        let mounted = true;
        
        const init = async () => {
            try {
                // Ensure the loading state is active initially
                setLoading(true);
                
                // Fetch public tools config first
                await fetchFreeTools();
                
                // Get session
                const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
                
                if (sessionError) throw sessionError;

                if (currentSession?.user && mounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    lastUserId.current = currentSession.user.id;
                    resetInactivityTimestamp();
                    // Fetch profile but don't block the entire app if it fails
                    await fetchProfile(currentSession.user.id);
                }
            } catch (err) {
                console.error("Auth initialization failed:", err);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!mounted) return;
            
            if (event === 'SIGNED_OUT') {
                setProfile(null); 
                setUser(null); 
                setSession(null);
                lastUserId.current = null;
            } else if (newSession?.user) {
                setSession(newSession); 
                setUser(newSession.user);
                if (newSession.user.id !== lastUserId.current) {
                    lastUserId.current = newSession.user.id;
                    await fetchProfile(newSession.user.id);
                }
            }
            
            // If we're still "loading", onAuthStateChange provides a signal to stop
            setLoading(false);
        });

        return () => { 
            mounted = false; 
            subscription.unsubscribe(); 
        };
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