import React from 'react';

interface LoadingOverlayProps {
    message?: string;
    color?: 'indigo' | 'purple' | 'teal' | 'emerald' | 'orange' | 'rose' | 'blue' | 'pink';
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Processing...', color = 'indigo' }) => {
    const themes = {
        indigo: { bg: 'bg-indigo-600', border: 'border-indigo-600', text: 'text-indigo-600' },
        purple: { bg: 'bg-purple-600', border: 'border-purple-600', text: 'text-purple-600' },
        teal: { bg: 'bg-teal-600', border: 'border-teal-600', text: 'text-teal-600' },
        emerald: { bg: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-emerald-600' },
        orange: { bg: 'bg-orange-600', border: 'border-orange-600', text: 'text-orange-600' },
        rose: { bg: 'bg-rose-600', border: 'border-rose-600', text: 'text-rose-600' },
        blue: { bg: 'bg-blue-600', border: 'border-blue-600', text: 'text-blue-600' },
        pink: { bg: 'bg-pink-600', border: 'border-pink-600', text: 'text-pink-600' }
    };

    const theme = themes[color];

    return (
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-[2px] flex items-center justify-center rounded-2xl animate-fade-in transition-all duration-300">
            <div className="flex flex-col items-center">
                <div className="relative w-16 h-16 mb-5">
                    <div className={`absolute inset-0 rounded-full border-[3px] opacity-20 ${theme.border}`}></div>
                    <div className={`absolute inset-0 rounded-full border-[3px] border-t-transparent animate-spin ${theme.border}`}></div>
                    <div className={`absolute inset-0 m-auto w-2 h-2 rounded-full animate-ping ${theme.bg}`}></div>
                </div>
                <div className="flex flex-col items-center space-y-1">
                    <span className={`text-sm font-bold tracking-wider uppercase ${theme.text} animate-pulse`}>{message}</span>
                    <div className="flex gap-1 h-1">
                        <div className={`w-1 h-1 rounded-full ${theme.bg} animate-bounce`} style={{animationDelay: '0ms'}}></div>
                        <div className={`w-1 h-1 rounded-full ${theme.bg} animate-bounce`} style={{animationDelay: '150ms'}}></div>
                        <div className={`w-1 h-1 rounded-full ${theme.bg} animate-bounce`} style={{animationDelay: '300ms'}}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadingOverlay;