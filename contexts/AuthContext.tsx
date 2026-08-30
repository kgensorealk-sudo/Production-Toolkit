import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
    isWakingUp: boolean;
    signOut: (isAuto?: boolean) => Promise<void>;
    updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
    deleteAccount: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    refreshFreeTools: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';
const SECONDARY_ADMIN_EMAIL = 'kgenso.realK@gmail.com';
const HEARTBEAT_INTERVAL = 60 * 1000; 
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 Hours Hard Cutoff

/**
 * Resiliency Protocol: withTimeout
 * Ensures a promise doesn't hang indefinitely.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 20000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs)
        )
    ]);
}

/**
 * Resiliency Protocol: withRetry
 * Updated to handle Auth Failures gracefully and include a global timeout.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1500): Promise<T> {
    try {
        return await withTimeout(fn());
    } catch (err: any) {
        const status = err.status || err.code;
        const errorMsg = err.message?.toLowerCase() || '';

        if (errorMsg === 'request_timeout') {
            console.warn("REQUEST_TIMEOUT: Operation exceeded time limit.");
            if (retries > 0) {
                console.warn(`RETRYING after timeout... (${retries} left)`);
                await new Promise(r => setTimeout(r, delay));
                return withRetry(fn, retries - 1, delay * 1.5);
            }
            throw err;
        }

        const isAuthFailure = 
            status === 401 || 
            status === 403 || 
            errorMsg.includes('jwt') || 
            errorMsg.includes('expired') || 
            errorMsg.includes('unauthorized') ||
            errorMsg.includes('token') ||
            errorMsg.includes('refresh') ||
            errorMsg.includes('invalid_grant');

        if (isAuthFailure) {
            console.error("CRITICAL_AUTH_FAILURE: Terminating retry loop.", err);
            if (errorMsg.includes('refresh') || errorMsg.includes('invalid_grant')) {
                try {
                    Object.keys(localStorage).forEach(key => { 
                        if (key.includes('sb-') || key === 'auth_login_at') localStorage.removeItem(key); 
                    });
                } catch (e) {}
            }
            throw err;
        }

        const isAborted = errorMsg.includes('abort') || errorMsg.includes('signal');
        const isNetwork = errorMsg === 'failed to fetch' || errorMsg.includes('network');
        const isServerErr = !status || status >= 500;

        const shouldRetry = isAborted || isNetwork || isServerErr;
        
        if (retries > 0 && shouldRetry) {
            console.warn(`RETRIEVING NODE SIGNAL... (${retries} left). Reason: ${errorMsg}`);
            await new Promise(r => setTimeout(r, delay));
            return withRetry(fn, retries - 1, delay * 1.5);
        }
        throw err;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [freeTools, setFreeTools] = useState<string[]>([]);
    const [freeToolsData, setFreeToolsData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isWakingUp, setIsWakingUp] = useState(false);
    
    const refreshingPromise = useRef<Promise<void> | null>(null);
    const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wakeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastWakeSyncRef = useRef<number>(0);
    const WAKE_SYNC_COOLDOWN = 5 * 60 * 1000; // 5 Minutes

    const isAdmin = (
        user?.email === SUPER_ADMIN_EMAIL ||
        user?.email === SECONDARY_ADMIN_EMAIL ||
        user?.app_metadata?.role?.toLowerCase() === 'admin' ||
        profile?.role?.toLowerCase() === 'admin'
    );

    const updateLastSeen = async (uid: string) => {
        try {
            await withRetry(async () => await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid), 2);
        } catch (err) {}
    };

    const signOut = useCallback(async (isAuto: boolean = false) => {
        setLoading(true);
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        try {
            await withTimeout((supabase.auth as any).signOut({ scope: 'local' }), 5000);
        } catch (e) {
            console.warn("Sign out timed out or failed, proceeding with local cleanup.");
        } finally {
            Object.keys(localStorage).forEach(key => { if (key.includes('sb-') || key === 'auth_login_at') localStorage.removeItem(key); });
            setProfile(null); setSession(null); setUser(null);
            if (isAuto) sessionStorage.setItem('session_expired', 'true');
            setLoading(false);
        }
    }, []);

    const checkHardExpiry = useCallback(() => {
        const loginAt = localStorage.getItem('auth_login_at');
        if (loginAt) {
            const age = Date.now() - parseInt(loginAt, 10);
            if (age > MAX_SESSION_AGE) {
                console.warn("Hard session age limit reached. Terminating session...");
                signOut(true);
                return true;
            }
        }
        return false;
    }, [signOut]);

    const warmUpDatabase = async () => {
        try {
            await withRetry(async () => {
                const { error } = await supabase.from('system_settings').select('id').eq('id', 'global').limit(1).single();
                if (error) throw error;
            }, 2);
        } catch (e) {
            console.warn("Waking up database node failed or timed out.");
        }
    };

    const processFreeToolsPayload = (payload: any) => {
        if (payload?.free_tools_data) {
            const now = new Date();
            const activeMap: Record<string, string> = {};
            const activeIds: string[] = [];
            Object.entries(payload.free_tools_data).forEach(([tid, expiry]) => {
                if (new Date(expiry as string) > now) {
                    activeMap[tid] = expiry as string;
                    activeIds.push(tid);
                }
            });
            setFreeTools(activeIds);
            setFreeToolsData(activeMap);
        } else {
            setFreeTools([]);
            setFreeToolsData({});
        }
    };

    const fetchFreeTools = useCallback(async () => {
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('system_settings').select('free_tools_data').eq('id', 'global').maybeSingle();
                if (error) throw error;
                return data;
            });
            processFreeToolsPayload(data);
        } catch (err) {}
    }, []);

    const fetchProfile = useCallback(async (userId: string, email?: string, force: boolean = false) => {
        if (!userId) return;
        if (force) refreshingPromise.current = null;
        if (refreshingPromise.current) return refreshingPromise.current;

        refreshingPromise.current = (async () => {
            try {
                if (!profile) setIsWakingUp(true);
                await warmUpDatabase();

                let profileData: any = null;
                try {
                    profileData = await withRetry(async () => {
                        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
                        if (error) throw error;
                        
                        if (!data) {
                            const { data: newData, error: createError } = await supabase.from('profiles').upsert([{ 
                                id: userId, 
                                email: email || '', 
                                role: (email === SUPER_ADMIN_EMAIL || email === SECONDARY_ADMIN_EMAIL) ? 'admin' : 'user' 
                            }]).select().maybeSingle();
                            if (createError) throw createError;
                            return newData;
                        }
                        
                        // If profile exists but role is not admin for admin emails, fix it
                        if ((email === SUPER_ADMIN_EMAIL || email === SECONDARY_ADMIN_EMAIL) && data.role !== 'admin') {
                            const { data: updatedData, error: updateError } = await supabase.from('profiles').update({ 
                                role: 'admin' 
                            }).eq('id', userId).select().maybeSingle();
                            if (!updateError && updatedData) return updatedData;
                        }

                        return data;
                    }, 3);
                } catch (dbErr) {
                    console.warn("Profile fetch/creation encountered an issue, using fallback profile:", dbErr);
                    profileData = {
                        id: userId,
                        email: email || '',
                        role: (email === SUPER_ADMIN_EMAIL || email === SECONDARY_ADMIN_EMAIL) ? 'admin' : 'user',
                        display_name: email ? email.split('@')[0] : 'User',
                        is_subscribed: true,
                        created_at: new Date().toISOString(),
                        last_seen: new Date().toISOString()
                    };
                }

                if (!profileData) {
                    profileData = {
                        id: userId,
                        email: email || '',
                        role: (email === SUPER_ADMIN_EMAIL || email === SECONDARY_ADMIN_EMAIL) ? 'admin' : 'user',
                        display_name: email ? email.split('@')[0] : 'User',
                        is_subscribed: true,
                        created_at: new Date().toISOString(),
                        last_seen: new Date().toISOString()
                    };
                }

                let unlockedTools: string[] = [];
                try {
                    const { data: keysData } = await withRetry(async () => {
                        const { data, error } = await supabase.from('access_keys').select('tool').eq('user_id', userId).eq('is_used', true);
                        if (error) throw error;
                        return { data };
                    });
                    if (keysData) {
                        unlockedTools = keysData.map((k: any) => k.tool);
                    }
                } catch (keysErr) {
                    console.warn("Access keys sync notice:", keysErr);
                }

                let isActive = profileData.is_subscribed ?? true;
                if (email === SUPER_ADMIN_EMAIL || profileData.email === SUPER_ADMIN_EMAIL) isActive = true;
                else if (profileData.subscription_end && new Date(profileData.subscription_end) < new Date()) isActive = false;

                const localTermsAccepted = localStorage.getItem(`terms_accepted_${userId}`) === 'true';
                const isTermsAccepted = Boolean(
                    profileData.terms_accepted || 
                    profileData.accepted_terms_at || 
                    localTermsAccepted || 
                    email === SUPER_ADMIN_EMAIL || 
                    email === SECONDARY_ADMIN_EMAIL
                );

                setProfile({ 
                    ...profileData, 
                    is_subscribed: isActive, 
                    unlocked_tools: unlockedTools,
                    terms_accepted: isTermsAccepted,
                    accepted_terms_at: profileData.accepted_terms_at || (isTermsAccepted ? (profileData.created_at || new Date().toISOString()) : undefined)
                });
                updateLastSeen(userId).catch(() => {});
            } catch (e) {
                console.warn("Profile sync notice:", e);
            } finally {
                setIsWakingUp(false);
                refreshingPromise.current = null;
            }
        })();

        return refreshingPromise.current;
    }, []);

    // Global interceptor for unhandled invalid refresh token rejections
    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            const msg = (reason?.message || reason?.error_description || String(reason || '')).toLowerCase();
            if (
                msg.includes('invalid refresh token') ||
                msg.includes('refresh token not found') ||
                msg.includes('refresh_token_not_found') ||
                msg.includes('invalid_grant') ||
                msg.includes('token_not_found')
            ) {
                console.warn("Global Interceptor: Intercepted invalid refresh token rejection. Purging local auth state.");
                event.preventDefault();
                try {
                    Object.keys(localStorage).forEach(key => { 
                        if (key.includes('sb-') || key === 'auth_login_at') localStorage.removeItem(key); 
                    });
                    (supabase.auth as any).signOut({ scope: 'local' }).catch(() => {});
                } catch (e) {}
                setSession(null);
                setUser(null);
                setProfile(null);
                setLoading(false);
            }
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    useEffect(() => {
        const handleWake = () => {
            if (document.visibilityState === 'visible' && user?.id) {
                if (checkHardExpiry()) return;
                
                // Cooldown check to prevent aggressive refreshing
                const now = Date.now();
                if (now - lastWakeSyncRef.current < WAKE_SYNC_COOLDOWN) {
                    return;
                }
                
                if (wakeDebounceRef.current) clearTimeout(wakeDebounceRef.current);
                wakeDebounceRef.current = setTimeout(async () => {
                    try {
                        const { data, error } = await (supabase.auth as any).getSession();
                        if (error || !data?.session) {
                            console.warn("Wake sync: Refresh token expired/invalid. Purging session.");
                            Object.keys(localStorage).forEach(key => { 
                                if (key.includes('sb-') || key === 'auth_login_at') localStorage.removeItem(key); 
                            });
                            (supabase.auth as any).signOut({ scope: 'local' }).catch(() => {});
                            setSession(null);
                            setUser(null);
                            setProfile(null);
                        } else if (data?.session) {
                            if (data.session.access_token !== session?.access_token) {
                                lastWakeSyncRef.current = Date.now();
                                setSession(data.session);
                                setUser(data.session.user);
                                await Promise.allSettled([fetchProfile(data.session.user.id, data.session.user.email), fetchFreeTools()]);
                            }
                        }
                    } catch (err) {
                        console.warn("Wake sync failed.");
                    }
                }, 1000); 
            }
        };

        window.addEventListener('visibilitychange', handleWake);
        return () => {
            window.removeEventListener('visibilitychange', handleWake);
            if (wakeDebounceRef.current) clearTimeout(wakeDebounceRef.current);
        };
    }, [user?.id, session?.access_token, fetchProfile, fetchFreeTools, signOut, checkHardExpiry]);

    useEffect(() => {
        let mounted = true;
        
        const init = async () => {
            try {
                if (checkHardExpiry()) return;

                initTimeoutRef.current = setTimeout(() => { 
                    if (mounted && loading) {
                        console.warn("Auth initialization timed out. Forcing loading to false.");
                        setLoading(false);
                    }
                }, 15000); 

                const { data, error } = await withRetry(async () => {
                    const result = await (supabase.auth as any).getSession();
                    if (result.error) throw result.error;
                    return result;
                });
                
                const currentSession = data?.session;
                if (currentSession && mounted) {
                    setSession(currentSession);
                    setUser(currentSession.user);
                    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                    heartbeatTimerRef.current = setInterval(() => updateLastSeen(currentSession.user.id), HEARTBEAT_INTERVAL);
                    await Promise.allSettled([fetchProfile(currentSession.user.id, currentSession.user.email), fetchFreeTools()]);

                    // Real-time synchronization for system settings & user profile
                    const settingsChannel = supabase
                        .channel('system_settings_sync')
                        .on('postgres_changes', { 
                            event: '*', 
                            schema: 'public', 
                            table: 'system_settings',
                            filter: 'id=eq.global'
                        }, (payload) => {
                            if (payload.new) processFreeToolsPayload(payload.new);
                        })
                        .subscribe();

                    const profileChannel = supabase
                        .channel(`profile_sync_${currentSession.user.id}`)
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${currentSession.user.id}`
                        }, () => {
                            fetchProfile(currentSession.user.id, currentSession.user.email, true);
                        })
                        .subscribe();
                    
                    return () => {
                        supabase.removeChannel(settingsChannel);
                        supabase.removeChannel(profileChannel);
                    };
                }
            } catch (err: any) {
                console.error("INIT_FAILED:", err);
                const errStr = (err?.message || err?.error_description || String(err)).toLowerCase();
                if (errStr.includes('refresh') || errStr.includes('invalid_grant') || errStr.includes('token not found') || errStr.includes('token')) {
                    console.warn("Invalid refresh token detected during initialization. Clearing local storage session.");
                    try {
                        Object.keys(localStorage).forEach(key => { 
                            if (key.includes('sb-') || key === 'auth_login_at') localStorage.removeItem(key); 
                        });
                        await (supabase.auth as any).signOut({ scope: 'local' }).catch(() => {});
                    } catch (e) {}
                    setSession(null);
                    setUser(null);
                    setProfile(null);
                }
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
            
            if (event === 'SIGNED_OUT' || !newSession?.user) {
                if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
                setProfile(null); setUser(null); setSession(null);
                localStorage.removeItem('auth_login_at');
                setLoading(false);
            } else if (newSession?.user) {
                if (!localStorage.getItem('auth_login_at')) {
                    localStorage.setItem('auth_login_at', Date.now().toString());
                }
                setSession(newSession); 
                setUser(newSession.user);
                
                // Trigger profile fetch but don't block loading state if we already have a user
                fetchProfile(newSession.user.id, newSession.user.email).catch(() => {});
                fetchFreeTools().catch(() => {});
                setLoading(false);
            }
        });

        return () => { 
            mounted = false; 
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
            if (authListener?.subscription) authListener.subscription.unsubscribe(); 
        };
    }, [fetchFreeTools, fetchProfile, signOut, checkHardExpiry]);

    const updateProfile = async (updates: Partial<UserProfile>) => {
        if (!user?.id || !profile) return;
        
        if (updates.terms_accepted) {
            try {
                localStorage.setItem(`terms_accepted_${user.id}`, 'true');
            } catch (e) {}
        }

        try {
            let data: any = null;
            try {
                data = await withRetry(async () => {
                    const { data: dbData, error } = await supabase
                        .from('profiles')
                        .update(updates)
                        .eq('id', user.id)
                        .select()
                        .single();
                    
                    if (error) throw error;
                    return dbData;
                }, 2);
            } catch (dbErr) {
                console.warn("Direct DB column update fallback triggered:", dbErr);
                // If a column like terms_accepted doesn't exist in the DB schema, remove it and update base fields
                const { terms_accepted, accepted_terms_at, ...cleanUpdates } = updates;
                if (Object.keys(cleanUpdates).length > 0) {
                    data = await withRetry(async () => {
                        const { data: fallbackData, error } = await supabase
                            .from('profiles')
                            .update(cleanUpdates)
                            .eq('id', user.id)
                            .select()
                            .single();
                        if (error) throw error;
                        return fallbackData;
                    }, 2);
                }
            }
            
            setProfile({
                ...profile,
                ...(data || {}),
                ...updates,
                unlocked_tools: profile.unlocked_tools,
                is_subscribed: profile.is_subscribed
            });
        } catch (err) {
            console.error("Profile Update Failed:", err);
            // Even if network fails, apply updates locally if it's terms acceptance
            if (updates.terms_accepted) {
                setProfile({
                    ...profile,
                    ...updates,
                    unlocked_tools: profile.unlocked_tools,
                    is_subscribed: profile.is_subscribed
                });
            } else {
                throw err;
            }
        }
    };

    const deleteAccount = async () => {
        if (!user?.id) return;
        try {
            // In a real app, you'd call a server-side function to delete the auth user.
            // For now, we'll delete the profile and sign out.
            await withRetry(async () => {
                const { error } = await supabase.from('profiles').delete().eq('id', user.id);
                if (error) throw error;
            });
            await signOut();
        } catch (err) {
            console.error("Account Decommissioning Failed:", err);
            throw err;
        }
    };

    const refreshProfile = useCallback(() => {
        return user ? fetchProfile(user.id, user.email, true) : Promise.resolve();
    }, [user?.id, user?.email, fetchProfile]);

    return (
        <AuthContext.Provider value={{ 
            session, user, profile, freeTools, freeToolsData, loading, isAdmin, isWakingUp,
            signOut, updateProfile, deleteAccount,
            refreshProfile, 
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