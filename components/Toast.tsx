
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'warn' | 'info';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
    useEffect(() => {
        if (!message) return;
        
        const timer = setTimeout(() => {
            onClose();
        }, 4000);
        
        return () => clearTimeout(timer);
    }, [message, onClose]);

    const styles = {
        success: 'bg-slate-900/90 text-emerald-400 border-emerald-500/20 shadow-emerald-900/20',
        error: 'bg-slate-900/90 text-rose-400 border-rose-500/20 shadow-rose-900/20',
        warn: 'bg-slate-900/90 text-amber-400 border-amber-500/20 shadow-amber-900/20',
        info: 'bg-slate-900/90 text-blue-400 border-blue-500/20 shadow-blue-900/20'
    };

    const iconStyles = {
        success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        error: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        warn: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    };

    const icons = {
        success: <CheckCircle2 size={16} strokeWidth={3} />,
        error: <AlertCircle size={16} strokeWidth={3} />,
        warn: <AlertTriangle size={16} strokeWidth={3} />,
        info: <Info size={16} strokeWidth={3} />
    };

    return (
        <AnimatePresence>
            {message && (
                <motion.div 
                    key={message}
                    initial={{ opacity: 0, y: 50, scale: 0.9, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)', transition: { duration: 0.2 } }}
                    className={`fixed bottom-8 right-8 z-[200] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border ${styles[type]} backdrop-blur-2xl ring-1 ring-white/5`}
                >
                    <div className={`p-2 rounded-xl ${iconStyles[type]} shadow-inner`}>
                        {icons[type]}
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest pr-4">{message}</span>
                    <button 
                        onClick={onClose} 
                        className="ml-auto p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    >
                        <X size={14} strokeWidth={3} />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default Toast;
