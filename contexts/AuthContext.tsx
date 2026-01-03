
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Ref to track the last user ID we fetched profile for.
    const lastUserId = useRef<string | null>(null);

    const fetchProfile = async (userId: string) => {
        try {
            // Create a promise that rejects after 15 seconds to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 15000)
            );

            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            // Race the fetch against the timeout
            const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
            const { data, error } = result;
            
            if (error) throw error;

            // Logic to check validity: Trust DB boolean BUT override if expired
            let isActive = data.is_subscribed;
            let shouldUpdateDb = false;
            
            if (data.subscription_end) {
                const endDate = new Date(data.subscription_end);
                const now = new Date();
                // STRICT CHECK: If expired, revoke access regardless of boolean
                if (endDate < now) {
                    isActive = false;
                    // If DB thinks they are active but date is past, sync DB state
                    if (data.is_subscribed) {
                        shouldUpdateDb = true;
                    }
                }
            }

            if (shouldUpdateDb) {
                supabase.from('profiles')
                    .update({ is_subscribed: false })
                    .eq('id', userId)
                    .then(({ error }) => {
                        if (error) console.warn("Could not sync expired status to DB:", error.message);
                    });
            }

            const finalProfile = { ...data, is_subscribed: isActive };
            setProfile(finalProfile);
            
            // CACHE PROFILE FOR OFFLINE USAGE
            try {
                localStorage.setItem(`profile_cache_${userId}`, JSON.stringify(finalProfile));
            } catch (e) {
                console.warn("Failed to cache profile locally");
            }

        } catch (err: any) {
            console.warn("Profile fetch failed (possibly offline). Attempting to load from cache.", err);
            
            // ATTEMPT TO LOAD FROM CACHE
            const cachedStr = localStorage.getItem(`profile_cache_${userId}`);
            if (cachedStr) {
                try {
                    const cachedProfile = JSON.parse(cachedStr);
                    // Re-validate expiry on cached data
                    let isActive = cachedProfile.is_subscribed;
                    if (cachedProfile.subscription_end) {
                        const endDate = new Date(cachedProfile.subscription_end);
                        if (endDate < new Date()) isActive = false;
                    }
                    setProfile({ ...cachedProfile, is_subscribed: isActive });
                    console.log("Loaded profile from local cache.");
                } catch (parseErr) {
                    console.error("Failed to parse cached profile", parseErr);
                    setProfile({ id: userId, email: '', role: 'user', is_subscribed: false });
                }
            } else {
                // No cache, default to safe fallback
                setProfile({ id: userId, email: '', role: 'user', is_subscribed: false });
            }
        }
    };

    // Watch for trial expiration and force refresh
    useEffect(() => {
        if (profile?.is_subscribed && profile.subscription_end) {
            const endDate = new Date(profile.subscription_end).getTime();
            const now = new Date().getTime();
            const timeLeft = endDate - now;

            if (timeLeft > 0 && timeLeft < 2147483647) { // Ensure valid timeout range
                const timerId = setTimeout(() => {
                    console.log("Subscription expired during active session. Forcing refresh...");
                    window.location.reload(); 
                }, timeLeft);
                return () => clearTimeout(timerId);
            }
        }
    }, [profile]);

    // Heartbeat for Online Status (Last Seen)
    useEffect(() => {
        if (!user) return;

        const updateLastSeen = async () => {
            await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
        };

        // Initial update
        updateLastSeen();

        // Update every 2 minutes
        const interval = setInterval(updateLastSeen, 120000); 

        return () => clearInterval(interval);
    }, [user]);

    useEffect(() => {
        let mounted = true;

        const safetyTimeout = setTimeout(() => {
            if (mounted && loading) {
                console.warn("Auth initialization timed out. Forcing app load.");
                setLoading(false);
            }
        }, 16000);

        const initSession = async () => {
            try {
                // getSession() retrieves session from localStorage, works offline
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error) throw error;

                if (mounted) {
                    setSession(session);
                    setUser(session?.user ?? null);
                    if (session?.user) {
                        lastUserId.current = session.user.id;
                        await fetchProfile(session.user.id);
                    }
                }
            } catch (err) {
                console.error("Session initialization failed:", err);
            } finally {
                if (mounted) {
                    setLoading(false);
                    clearTimeout(safetyTimeout);
                }
            }
        };

        initSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return;
            
            setSession(session);
            setUser(session?.user ?? null);
            
            if (session?.user) {
                // Prevent redundant profile fetches on token refreshes
                if (session.user.id !== lastUserId.current) {
                    lastUserId.current = session.user.id;
                    await fetchProfile(session.user.id);
                }
            } else {
                setProfile(null);
                lastUserId.current = null;
            }
            setLoading(false);
        });

        return () => {
            mounted = false;
            clearTimeout(safetyTimeout);
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        try {
            setLoading(true); 
            // Clear cache on sign out
            if (user?.id) localStorage.removeItem(`profile_cache_${user.id}`);
            
            await supabase.auth.signOut();
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

    const value = {
        session,
        user,
        profile,
        loading,
        signOut
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
