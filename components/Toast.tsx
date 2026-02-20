
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
        success: 'bg-emerald-50/90 text-emerald-800 border-emerald-200/50',
        error: 'bg-rose-50/90 text-rose-800 border-rose-200/50',
        warn: 'bg-amber-50/90 text-amber-800 border-amber-200/50',
        info: 'bg-blue-50/90 text-blue-800 border-blue-200/50'
    };

    const iconStyles = {
        success: 'bg-emerald-100 text-emerald-600',
        error: 'bg-rose-100 text-rose-600',
        warn: 'bg-amber-100 text-amber-600',
        info: 'bg-blue-100 text-blue-600'
    };

    const icons = {
        success: <CheckCircle2 size={18} strokeWidth={2.5} />,
        error: <AlertCircle size={18} strokeWidth={2.5} />,
        warn: <AlertTriangle size={18} strokeWidth={2.5} />,
        info: <Info size={18} strokeWidth={2.5} />
    };

    return (
        <AnimatePresence>
            {message && (
                <motion.div 
                    key="toast"
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl shadow-slate-200/50 border ${styles[type]} font-medium backdrop-blur-xl`}
                >
                    <div className={`p-1.5 rounded-xl ${iconStyles[type]} shadow-sm`}>
                        {icons[type]}
                    </div>
                    <span className="text-sm font-bold tracking-tight pr-2">{message}</span>
                    <button 
                        onClick={onClose} 
                        className="ml-auto p-1 text-current opacity-40 hover:opacity-100 hover:bg-black/5 rounded-lg transition-all"
                    >
                        <X size={16} strokeWidth={3} />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default Toast;
