
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Bug, Lightbulb, X, Send } from 'lucide-react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    toolId?: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSuccess, onError, toolId }) => {
    const { user } = useAuth();
    const [type, setType] = useState<'bug' | 'feature'>('bug');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('feedback')
                .insert([
                    { 
                        user_id: user?.id, 
                        tool_id: toolId,
                        type, 
                        content: content.trim() 
                    }
                ]);

            if (error) throw error;

            onSuccess('Feedback submitted successfully! Thank you.');
            setContent('');
            onClose();
        } catch (err: any) {
            console.error('Feedback submission error:', err);
            onError('Failed to submit feedback. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
                onClick={onClose}
            />
            
            {/* Modal Card */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-scale-in relative z-10 ring-4 ring-slate-900/5">
                <div className="p-8">
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                <MessageSquare className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Send Feedback</h3>
                                <div className="h-1 w-12 bg-indigo-500 rounded-full mt-1"></div>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setType('bug')}
                                className={`flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    type === 'bug' 
                                    ? 'border-rose-500 bg-rose-50 text-rose-700' 
                                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                }`}
                            >
                                <Bug className="h-5 w-5" />
                                <span className="text-xs font-black uppercase tracking-widest">Report Bug</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('feature')}
                                className={`flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    type === 'feature' 
                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                }`}
                            >
                                <Lightbulb className="h-5 w-5" />
                                <span className="text-xs font-black uppercase tracking-widest">Suggest Feature</span>
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Description
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={type === 'bug' ? "What went wrong? Please describe the issue..." : "What would you like to see added to the toolkit?"}
                                className="w-full h-40 p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
                                required
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                disabled={isSubmitting || !content.trim()}
                                className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 px-8 rounded-2xl shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                                {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default FeedbackModal;
