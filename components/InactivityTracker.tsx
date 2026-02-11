
import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { INACTIVITY_LIMIT } from '../constants';

/**
 * INACTIVITY TRACKER (Security Hardening)
 * Monitors low-level DOM events to determine if the operator is active.
 * Triggers a secure session termination after the defined limit.
 */
const InactivityTracker: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { signOut, session } = useAuth();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetTimer = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Only track inactivity if a session is active
        if (session) {
            timeoutRef.current = setTimeout(() => {
                console.log("Inactivity limit reached. Terminating session...");
                signOut(true); // 'true' flag triggers the session_expired message on login page
            }, INACTIVITY_LIMIT);
        }
    };

    useEffect(() => {
        // Events that signify "Activity"
        const events = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart',
            'click'
        ];

        // Initialize timer
        resetTimer();

        // Add listeners
        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        // Cleanup
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [session, signOut]);

    return <>{children}</>;
};

export default InactivityTracker;
