import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    subLabel?: string;
    color?: 'indigo' | 'blue' | 'emerald' | 'amber';
    id: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, subLabel, color = 'indigo', id }) => {
    const themes = {
        indigo: { bg: 'bg-indigo-600', ring: 'peer-focus:ring-indigo-400/50', text: 'text-indigo-500' },
        blue: { bg: 'bg-blue-600', ring: 'peer-focus:ring-blue-400/50', text: 'text-blue-500' },
        emerald: { bg: 'bg-emerald-600', ring: 'peer-focus:ring-emerald-400/50', text: 'text-emerald-500' },
        amber: { bg: 'bg-amber-500', ring: 'peer-focus:ring-amber-400/50', text: 'text-amber-500' },
    };

    const theme = themes[color];

    return (
        <label htmlFor={id} className="flex items-center gap-3 cursor-pointer group select-none">
            <div className="relative">
                <input 
                    type="checkbox" 
                    id={id}
                    checked={checked} 
                    onChange={(e) => onChange(e.target.checked)} 
                    className="sr-only peer"
                    role="switch"
                    aria-checked={checked}
                />
                {/* Track */}
                <div className={`block w-10 h-6 rounded-full transition-all duration-200 border-2 border-transparent peer-focus:ring-4 ${theme.ring} ${checked ? theme.bg : 'bg-slate-200'}`}></div>
                {/* Dot */}
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${checked ? 'translate-x-4' : ''}`}></div>
            </div>
            <div className="flex flex-col min-w-[70px]">
                <span className="text-sm font-bold text-slate-700 leading-tight group-hover:text-slate-900 transition-colors">{label}</span>
                {subLabel && (
                    <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${checked ? theme.text : 'text-slate-400'}`}>
                        {subLabel}
                    </span>
                )}
            </div>
        </label>
    );
};

export default Switch;