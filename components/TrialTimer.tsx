
import React, { useState, useEffect, useRef } from 'react';
/* Import useNavigate from react-router to resolve potential named export issues in react-router-dom types */
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

interface TrialTimerProps {
    endDate: string;
    label?: string;
    isTrial?: boolean;
}

const TrialTimer: React.FC<TrialTimerProps> = ({ endDate, label = "Trial", isTrial = true }) => {
    const { user, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isUrgent, setIsUrgent] = useState(false);
    const [showExpiredModal, setShowExpiredModal] = useState(false);
    const hasTriggeredSync = useRef(false);

    // Effect to handle the actual sync when time expires
    useEffect(() => {
        const handleExpiration = async () => {
            if (timeLeft === "Expired" && !hasTriggeredSync.current && user?.id) {
                hasTriggeredSync.current = true;
                
                try {
                    // Update database to immediately restrict access
                    await supabase
                        .from('profiles')
                        .update({ 
                            is_subscribed: false,
                            subscription_end: null,
                            trial_start: null,
                            trial_end: null
                        })
                        .eq('id', user.id);
                } catch (err) {
                    console.error("Sync Error:", err);
                }

                // Force refresh the internal context profile state
                await refreshProfile();
                
                // Show the modal instead of auto-refreshing
                setShowExpiredModal(true);
            }
        };

        handleExpiration();
    }, [timeLeft, user?.id, refreshProfile]);

    useEffect(() => {
        const calculateTime = () => {
            const end = new Date(endDate).getTime();
            const now = new Date().getTime();
            const diff = end - now;

            if (diff <= 0) {
                return "Expired";
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const urgencyThreshold = isTrial ? 1000 * 60 * 60 : 1000 * 60 * 60 * 48;
            setIsUrgent(diff < urgencyThreshold);

            if (days > 0) return `${days}d ${hours}h`;
            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m ${seconds}s`;
        };

        const initialVal = calculateTime();
        setTimeLeft(initialVal);

        const interval = setInterval(() => {
            const val = calculateTime();
            setTimeLeft(val);
            if (val === "Expired") {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [endDate, isTrial]);

    const handleExit = () => {
        setShowExpiredModal(false);
        navigate('/');
        window.location.reload();
    };

    if (!timeLeft) return null;

    let colorClass = '';
    if (timeLeft === "Expired" || isUrgent) {
        colorClass = 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse';
    } else if (isTrial) {
        colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
        colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }

    return (
        <>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border shadow-sm transition-all select-none ${colorClass}`}>
                {isTrial ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )}
                <span>{label}: {timeLeft}</span>
            </div>

            {showExpiredModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
                    
                    <div className="bg-white rounded-[2.5rem] shadow-2xl max-sm w-full border border-slate-200 overflow-hidden animate-scale-in relative z-10 ring-4 ring-rose-500/10">
                        <div className="p-8 text-center bg-rose-50">
                            <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-rose-100 bg-white text-rose-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Access Expired</h3>
                            <div className="text-[10px] font-bold text-rose-600 mt-3 uppercase tracking-[0.2em]">Session Authorization Revoked</div>
                        </div>

                        <div className="p-10 space-y-6">
                            <p className="text-slate-600 text-sm leading-relaxed text-center font-medium">
                                Your authorized term has concluded. Active production nodes require a valid license for continued operation.
                            </p>

                            <div className="space-y-3">
                                <button 
                                    onClick={handleExit}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-widest text-xs"
                                >
                                    Exit to Dashboard
                                </button>
                                
                                <button 
                                    onClick={() => navigate('/')}
                                    className="w-full py-3 text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.2em] transition-colors"
                                >
                                    Contact Support
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 py-3 border-t border-slate-100">
                            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em] text-center">Reference: Terminal Status Code 403</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TrialTimer;
