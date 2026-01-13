
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
    
    const lastUserId = useRef<string | null>(null);
    const lastUpdateRef = useRef<number>(0);

    // Heartbeat: Updates 'last_seen' in the DB to keep Online status accurate
    const updatePresence = async (userId: string) => {
        const now = Date.now();
        // Throttle updates to once every 4 minutes to save database resources
        // Admin console considers users online if seen within last 5 mins.
        if (now - lastUpdateRef.current < 4 * 60 * 1000) return;

        try {
            await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', userId);
            
            lastUpdateRef.current = now;
        } catch (err) {
            console.warn("Presence update failed silently:", err);
        }
    };

    // Storage Sanitizer: Clears Supabase specific local storage if it's corrupted
    const clearCorruptedAuth = () => {
        console.warn("Clearing corrupted auth storage...");
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
                localStorage.removeItem(key);
            }
        }
    };

    const fetchProfile = async (userId: string) => {
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 10000)
            );

            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
            const { data, error } = result;
            
            if (error) throw error;

            let isActive = data.is_subscribed;
            let shouldUpdateDb = false;
            
            if (data.subscription_end) {
                const endDate = new Date(data.subscription_end);
                if (endDate < new Date()) {
                    isActive = false;
                    if (data.is_subscribed) shouldUpdateDb = true;
                }
            }

            if (shouldUpdateDb) {
                supabase.from('profiles').update({ is_subscribed: false }).eq('id', userId)
                    .then(({ error }) => { if (error) console.warn("Sync failed:", error.message); });
            }

            const finalProfile = { ...data, is_subscribed: isActive };
            setProfile(finalProfile);
            localStorage.setItem(`profile_cache_${userId}`, JSON.stringify(finalProfile));

            // Initial presence update upon login/load
            updatePresence(userId);

        } catch (err: any) {
            console.warn("Using cached profile due to network/fetch error:", err.message);
            const cachedStr = localStorage.getItem(`profile_cache_${userId}`);
            if (cachedStr) {
                const cachedProfile = JSON.parse(cachedStr);
                setProfile(cachedProfile);
            } else {
                setProfile({ id: userId, email: '', role: 'user', is_subscribed: false });
            }
        }
    };

    // Presence Heartbeat Loop
    useEffect(() => {
        if (!user?.id) return;

        const intervalId = setInterval(() => {
            updatePresence(user.id);
        }, 60 * 1000); // Check every minute, updatePresence throttles it to 4 mins

        return () => clearInterval(intervalId);
    }, [user?.id]);

    useEffect(() => {
        if (profile?.is_subscribed && profile.subscription_end) {
            const endDate = new Date(profile.subscription_end).getTime();
            const now = new Date().getTime();
            const timeLeft = endDate - now;
            if (timeLeft > 0 && timeLeft < 2147483647) {
                const timerId = setTimeout(() => { window.location.reload(); }, timeLeft);
                return () => clearTimeout(timerId);
            }
        }
    }, [profile]);

    useEffect(() => {
        let mounted = true;

        const initSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error) {
                    if (error.message.includes('Refresh Token') || error.message.includes('not found')) {
                        clearCorruptedAuth();
                        if (mounted) setLoading(false);
                        return;
                    }
                    throw error;
                }

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
                if (mounted) setLoading(false);
            }
        };

        initSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;
            
            if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
                setProfile(null);
                setUser(null);
                setSession(null);
                lastUserId.current = null;
                lastUpdateRef.current = 0;
            } else if (session?.user) {
                setSession(session);
                setUser(session.user);
                if (session.user.id !== lastUserId.current) {
                    lastUserId.current = session.user.id;
                    await fetchProfile(session.user.id);
                }
            }
            setLoading(false);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        try {
            setLoading(true); 
            if (user?.id) localStorage.removeItem(`profile_cache_${user.id}`);
            await supabase.auth.signOut();
            clearCorruptedAuth();
            setProfile(null);
            setSession(null);
            setUser(null);
            lastUserId.current = null;
            lastUpdateRef.current = 0;
        } catch (error) {
            console.error("Sign out error:", error);
            clearCorruptedAuth();
        } finally {
            setLoading(false);
        }
    };

    const value = { session, user, profile, loading, signOut };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
