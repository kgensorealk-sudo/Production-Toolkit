import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    subLabel?: string;
    color?: 'indigo' | 'blue' | 'emerald' | 'amber' | 'purple';
    id: string;
    tooltip?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, subLabel, color = 'indigo', id, tooltip }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const themes = {
        indigo: { bg: 'bg-indigo-600', ring: 'peer-focus:ring-indigo-400/50', text: 'text-indigo-500' },
        blue: { bg: 'bg-blue-600', ring: 'peer-focus:ring-blue-400/50', text: 'text-blue-500' },
        emerald: { bg: 'bg-emerald-600', ring: 'peer-focus:ring-emerald-400/50', text: 'text-emerald-500' },
        amber: { bg: 'bg-amber-500', ring: 'peer-focus:ring-amber-400/50', text: 'text-amber-500' },
        purple: { bg: 'bg-purple-600', ring: 'peer-focus:ring-purple-400/50', text: 'text-purple-500' },
    };

    const theme = themes[color];

    return (
        <div 
            className="relative group/switch inline-block"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <label htmlFor={id} className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative shrink-0">
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
                    <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-slate-700 leading-tight group-hover/switch:text-slate-900 transition-colors">
                            {label}
                        </span>
                        {tooltip && (
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400 group-hover/switch:text-indigo-600 transition-colors shrink-0" />
                        )}
                    </div>
                    {subLabel && (
                        <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${checked ? theme.text : 'text-slate-400'}`}>
                            {subLabel}
                        </span>
                    )}
                </div>
            </label>

            {/* Hover Tooltip Popup */}
            {tooltip && showTooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-xl z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150 border border-slate-700/50">
                    <div className="leading-snug">{tooltip}</div>
                    {/* Tooltip Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                </div>
            )}
        </div>
    );
};

export default Switch;