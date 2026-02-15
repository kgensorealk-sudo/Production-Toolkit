import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { INACTIVITY_WARNING, INACTIVITY_LIMIT } from '../constants';

/**
 * INACTIVITY TRACKER (Hardened Security Protocol)
 * Implements a two-stage security sequence:
 * 1. Warning Phase: Triggered at 15 minutes of silence.
 * 2. Termination Phase: Triggered at 20 minutes of silence.
 */
const InactivityTracker: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { signOut, session } = useAuth();
    const [showWarning, setShowWarning] = useState(false);
    
    const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    }, []);

    const resetTimer = useCallback(() => {
        clearTimers();
        setShowWarning(false);

        // Only track inactivity if a session is active
        if (session) {
            // Stage 1: Warning
            warningTimerRef.current = setTimeout(() => {
                setShowWarning(true);
            }, INACTIVITY_WARNING);

            // Stage 2: Termination
            logoutTimerRef.current = setTimeout(() => {
                console.log("Inactivity limit reached. Executing terminal exit protocol...");
                signOut(true);
            }, INACTIVITY_LIMIT);
        }
    }, [session, signOut, clearTimers]);

    useEffect(() => {
        // High-frequency events signifying operator presence
        const events = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart',
            'click'
        ];

        resetTimer();

        const handleActivity = () => {
            // Only reset if we aren't already in warning state, 
            // or if the event is a specific interaction that should dismiss the warning.
            resetTimer();
        };

        events.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        return () => {
            clearTimers();
            events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [resetTimer, clearTimers]);

    return (
        <>
            {children}
            
            {/* INACTIVITY WARNING MODAL */}
            {showWarning && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
                    
                    <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden animate-scale-in relative z-10 ring-4 ring-amber-500/10">
                        <div className="p-8 text-center bg-amber-50/50">
                            <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-amber-100 bg-white text-amber-500 relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full animate-ping opacity-75"></span>
                            </div>
                            
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Security Alert</h3>
                            <div className="text-[10px] font-bold text-amber-600 mt-3 uppercase tracking-[0.2em]">Inactivity Protocol Initialized</div>
                        </div>

                        <div className="p-10 space-y-6">
                            <p className="text-slate-600 text-sm leading-relaxed text-center font-medium">
                                You have been inactive for <span className="font-bold text-slate-900">15 minutes</span>. 
                                For your security, this session will be terminated in <span className="font-bold text-rose-600 underline">5 minutes</span> unless you resume activity.
                            </p>

                            <button 
                                onClick={resetTimer}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                I'm Still Here
                            </button>
                        </div>
                        
                        <div className="bg-slate-50 py-3 border-t border-slate-100">
                            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em] text-center">Node Safety Guard Active</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default InactivityTracker;