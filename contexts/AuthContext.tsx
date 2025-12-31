
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { UserProfile } from '../types';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    isSubscribed: boolean;
    isTrialing: boolean;
    daysLeft: number | null;
    authError: string | null;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    isAdmin: false,
    isSubscribed: false,
    isTrialing: false,
    daysLeft: null,
    authError: null,
    signOut: async () => {},
    refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    const fetchProfile = useCallback(async (currentUser: User) => {
        setAuthError(null); // Clear previous errors
        try {
            // 15-second timeout for profile check
            const profilePromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timed out (15s)')), 15000)
            );

            const response = await Promise.race([profilePromise, timeoutPromise]) as any;
            const { data, error } = response;

            if (error) {
                // EMERGENCY BYPASS: Infinite Recursion
                const isRecursion = error.message?.toLowerCase().includes('infinite recursion') || error.code === '42P17';
                
                if (isRecursion) {
                    console.warn("Critical DB Policy Error (Recursion). Activating Emergency Admin Access.");
                    setProfile({
                        id: currentUser.id,
                        role: 'admin',
                        is_subscribed: true
                    });
                    setAuthError(`DB Recursion Error Detected. Emergency Access Granted.`);
                    return;
                }

                // Metadata fallback
                const meta = currentUser.user_metadata || {};
                const metaHasRole = meta.role === 'admin' || meta.is_subscribed === true;

                if (metaHasRole) {
                     console.warn("DB Error encountered. Falling back to User Metadata.", error.message);
                     setProfile({
                         id: currentUser.id,
                         role: meta.role || 'user',
                         is_subscribed: meta.is_subscribed || false
                     });
                } else {
                    if (error.code === 'PGRST116') {
                        // Profile missing, create default
                        console.log("Profile missing, creating default entry...");
                        const { data: newProfile, error: createError } = await supabase
                            .from('profiles')
                            .insert([{ id: currentUser.id, role: 'user', is_subscribed: false }])
                            .select()
                            .single();
                        
                        if (createError) {
                            console.error("Failed to create profile:", createError);
                            setAuthError(`Creation Failed: ${createError.message}`);
                            setProfile({ id: currentUser.id, role: 'user', is_subscribed: false });
                        } else {
                            setProfile(newProfile as UserProfile);
                        }
                    } else {
                        // Genuine DB Error
                        console.error("Supabase Error:", error);
                        setAuthError(`DB Error: ${error.message || error.code}`);
                        setProfile({ id: currentUser.id, role: 'user', is_subscribed: false });
                    }
                }
            } else if (data) {
                setProfile(data as UserProfile);
            }
        } catch (err: any) {
            // Network failures also trigger metadata fallback if available
            const meta = currentUser.user_metadata || {};
            if (meta.role === 'admin' || meta.is_subscribed === true) {
                setProfile({
                    id: currentUser.id,
                    role: meta.role || 'user',
                    is_subscribed: meta.is_subscribed || false
                });
            } else {
                console.warn("Profile fetch exception:", err);
                setAuthError(`Network/Client Error: ${err.message}`);
                setProfile({ id: currentUser.id, role: 'user', is_subscribed: false });
            }
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const initSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Session init timeout')), 10000)
                );

                const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any;

                if (mounted) {
                    if (data?.session) {
                        setSession(data.session);
                        setUser(data.session.user);
                        await fetchProfile(data.session.user);
                    }
                }
            } catch (error: any) {
                console.warn('Error fetching session:', error);
                if (mounted) setAuthError(`Session Error: ${error.message}`);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        initSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return;
            
            setSession(session);
            setUser(session?.user ?? null);
            
            if (session?.user) {
                await fetchProfile(session.user);
            } else {
                setProfile(null);
                setAuthError(null);
            }
            
            setLoading(false);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signOut = async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setUser(null);
        setSession(null);
        setAuthError(null);
    };

    const refreshProfile = async () => {
        if (user) {
            await fetchProfile(user);
        }
    };

    // --- Derived Subscription State Logic ---
    const calculateStatus = () => {
        if (!profile) return { isSubscribed: false, isTrialing: false, daysLeft: null };

        const now = new Date();
        const parse = (d: string | null | undefined) => d ? new Date(d) : null;
        
        const subStart = parse(profile.subscription_start);
        const subEnd = parse(profile.subscription_end);
        const trialStart = parse(profile.trial_start);
        const trialEnd = parse(profile.trial_end);

        // 1. Admin Override (Always subscribed)
        if (profile.role === 'admin') {
            return { isSubscribed: true, isTrialing: false, daysLeft: null };
        }

        // 2. Manual DB Boolean Override (Legacy or Permanent Grant)
        if (profile.is_subscribed === true) {
             return { isSubscribed: true, isTrialing: false, daysLeft: null };
        }

        // 3. Paid Subscription Dates
        // Active if: End Date exists AND is in Future AND (Start Date is null OR Start Date is Past)
        const isSubValid = subEnd && subEnd.getTime() > now.getTime();
        const isSubStarted = !subStart || subStart.getTime() <= now.getTime();

        if (isSubValid && isSubStarted) {
             const diff = subEnd!.getTime() - now.getTime();
             const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
             return { isSubscribed: true, isTrialing: false, daysLeft: days };
        }

        // 4. Trial Dates
        // Active if: End Date exists AND is in Future AND (Start Date is null OR Start Date is Past)
        const isTrialValid = trialEnd && trialEnd.getTime() > now.getTime();
        const isTrialStarted = !trialStart || trialStart.getTime() <= now.getTime();

        if (isTrialValid && isTrialStarted) {
             const diff = trialEnd!.getTime() - now.getTime();
             const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
             return { isSubscribed: true, isTrialing: true, daysLeft: days };
        }

        // 5. Default: Not Subscribed
        return { isSubscribed: false, isTrialing: false, daysLeft: null };
    };

    const status = calculateStatus();
    const isAdmin = profile?.role === 'admin';

    return (
        <AuthContext.Provider value={{ 
            session, 
            user, 
            profile, 
            loading, 
            isAdmin, 
            isSubscribed: status.isSubscribed, 
            isTrialing: status.isTrialing,
            daysLeft: status.daysLeft,
            authError, 
            signOut, 
            refreshProfile 
        }}>
            {children}
        </AuthContext.Provider>
    );
};
