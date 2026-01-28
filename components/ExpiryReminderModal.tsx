
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
/* Import hooks from react-router to resolve potential named export issues in react-router-dom types */
import { useNavigate, useLocation } from 'react-router';

const ExpiryReminderModal: React.FC = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<'soon' | 'expired'>('soon');
    const [daysLeft, setDaysLeft] = useState<number>(0);
    const [isTrial, setIsTrial] = useState(false);

    useEffect(() => {
        // Exit early if no profile or no end date record exists
        if (!profile?.subscription_end) return;

        const checkExpiry = () => {
            const end = new Date(profile.subscription_end!).getTime();
            const now = Date.now();
            const diffMs = end - now;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const isTrialNode = !!profile.trial_end;

            // CASE 1: ALREADY EXPIRED
            if (diffMs <= 0) {
                const today = new Date().toDateString();
                const lastShownExpired = sessionStorage.getItem('last_expired_alert_shown');
                
                // Show expired modal once per session to avoid blocking the landing/login experience repeatedly
                if (lastShownExpired !== today) {
                    setStatus('expired');
                    setIsTrial(isTrialNode);
                    setIsOpen(true);
                    sessionStorage.setItem('last_expired_alert_shown', today);
                }
                return;
            }

            // CASE 2: ENDING SOON (Last 7 days)
            // Only show if user is still marked as subscribed (preventing double modals if TrialTimer already flipped the switch)
            if (profile.is_subscribed && diffDays <= 7 && diffDays > 0) {
                const today = new Date().toDateString();
                const lastShownReminder = localStorage.getItem('last_expiry_reminder_date');

                if (lastShownReminder !== today) {
                    setDaysLeft(diffDays);
                    setStatus('soon');
                    setIsTrial(isTrialNode);
                    setIsOpen(true);
                }
            }
        };

        checkExpiry();
    }, [profile, location.pathname]); // Re-check on navigation to ensure visibility

    const handleClose = () => {
        if (status === 'soon') {
            localStorage.setItem('last_expiry_reminder_date', new Date().toDateString());
        }
        setIsOpen(false);
    };

    const handleContact = () => {
        handleClose();
        // Return to landing page where contact instructions are available
        navigate('/');
    };

    if (!isOpen) return null;

    // Theme logic for visual differentiation
    const getTheme = () => {
        if (status === 'expired') {
            return {
                color: 'rose',
                icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                label: 'Access Expired',
                subLabel: 'Session Authorization Revoked',
                desc: 'Your authorized production term has concluded. Active node operation requires a valid license extension.',
                button: 'Contact Administrator'
            };
        }
        
        return isTrial 
            ? { 
                color: 'amber', 
                icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', 
                label: 'Trial Ending Soon', 
                subLabel: `System Cutoff in ${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'}`,
                desc: 'Your trial period is nearing its term limit. To prevent workflow disruption, please secure a full subscription.',
                button: 'Request Full Access'
              }
            : { 
                color: 'rose', 
                icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', 
                label: 'Renewal Required', 
                subLabel: `Plan expires in ${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'}`,
                desc: 'Your node license is scheduled to expire soon. Please contact your system administrator to renew.',
                button: 'Manage Subscription'
              };
    };

    const theme = getTheme();
    const colorClass = theme.color === 'amber' ? 'text-amber-500 border-amber-100 bg-amber-50' : 'text-rose-500 border-rose-100 bg-rose-50';
    const accentTextClass = theme.color === 'amber' ? 'text-amber-600' : 'text-rose-600';

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in">
            {/* Blurry Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} />
            
            <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden animate-scale-in relative z-10 ring-4 ring-slate-900/5">
                <div className={`p-8 text-center ${theme.color === 'amber' ? 'bg-amber-50/50' : 'bg-rose-50/50'}`}>
                    <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 shadow-sm border bg-white ${colorClass}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={theme.icon} />
                        </svg>
                    </div>
                    
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">{theme.label}</h3>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-3 ${accentTextClass}`}>
                        {theme.subLabel}
                    </p>
                </div>

                <div className="p-10 space-y-6">
                    <p className="text-slate-600 text-sm leading-relaxed text-center font-medium">
                        {theme.desc}
                    </p>

                    <div className="space-y-3">
                        <button 
                            onClick={handleContact}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-widest text-xs"
                        >
                            {theme.button}
                        </button>
                        
                        <button 
                            onClick={handleClose}
                            className="w-full py-3 text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.2em] transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
                
                <div className="bg-slate-50 py-3 border-t border-slate-100">
                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em] text-center">Node Management Protocol</p>
                </div>
            </div>
        </div>
    );
};

export default ExpiryReminderModal;
