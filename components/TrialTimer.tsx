
import React, { useState, useEffect } from 'react';

interface TrialTimerProps {
    endDate: string;
    label?: string;
    isTrial?: boolean;
}

const TrialTimer: React.FC<TrialTimerProps> = ({ endDate, label = "Trial", isTrial = true }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isUrgent, setIsUrgent] = useState(false);

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

            // Urgency check (less than 48 hours for plan, less than 1 hour for trial default)
            const urgencyThreshold = isTrial ? 1000 * 60 * 60 : 1000 * 60 * 60 * 48;
            setIsUrgent(diff < urgencyThreshold);

            if (days > 0) return `${days}d ${hours}h`;
            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m ${seconds}s`;
        };

        // Initial call
        const initialVal = calculateTime();
        setTimeLeft(initialVal);

        const interval = setInterval(() => {
            const val = calculateTime();
            setTimeLeft(val);
            if (val === "Expired") clearInterval(interval);
        }, 1000);

        return () => clearInterval(interval);
    }, [endDate, isTrial]);

    if (!timeLeft || timeLeft === "Expired") return null;

    // Determine colors
    // Trial: Amber (Normal), Red (Urgent)
    // Plan: Emerald (Normal), Red (Urgent)
    let colorClass = '';
    if (isUrgent) {
        colorClass = 'bg-red-50 text-red-600 border-red-200 animate-pulse';
    } else if (isTrial) {
        colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
        colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }

    return (
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
    );
};

export default TrialTimer;
