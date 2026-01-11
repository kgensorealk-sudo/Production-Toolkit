
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User, AuthError } from '@supabase/supabase-js';
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
                    // Fix: If we get a "Refresh Token Not Found" or similar, clear storage and proceed to login
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
            
            // Handle fatal auth events
            if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
                setProfile(null);
                setUser(null);
                setSession(null);
                lastUserId.current = null;
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
            clearCorruptedAuth(); // Ensure a clean slate on logout
            setProfile(null);
            setSession(null);
            setUser(null);
            lastUserId.current = null;
        } catch (error) {
            console.error("Sign out error:", error);
            clearCorruptedAuth(); // Force clear if API call fails
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
