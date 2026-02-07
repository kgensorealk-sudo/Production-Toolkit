import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import LoadingOverlay from './LoadingOverlay';

interface Tip {
    id: string;
    content: string;
    created_at: string;
}

interface ToolTipsModalProps {
    toolId: string;
    toolName: string;
    isOpen: boolean;
    onClose: () => void;
}

const ToolTipsModal: React.FC<ToolTipsModalProps> = ({ toolId, toolName, isOpen, onClose }) => {
    const { isAdmin, user } = useAuth();
    const [tips, setTips] = useState<Tip[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [newTip, setNewTip] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isTableMissing, setIsTableMissing] = useState(false);

    const fetchTips = async () => {
        setLoading(true);
        setIsTableMissing(false);
        try {
            const { data, error } = await supabase
                .from('tool_tips')
                .select('*')
                .eq('tool_id', toolId)
                .order('created_at', { ascending: true });
            
            if (error) {
                if (error.code === 'PGRST205' || error.message?.includes('tool_tips')) {
                    setIsTableMissing(true);
                } else {
                    throw error;
                }
                return;
            }
            setTips(data || []);
            // Reset index if current index is out of bounds after a change
            if (data && currentIndex >= data.length) {
                setCurrentIndex(Math.max(0, data.length - 1));
            }
        } catch (err) {
            console.error("Fetch Tips Error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchTips();
    }, [isOpen, toolId]);

    const handleNext = useCallback(() => {
        if (tips.length <= 1) return;
        setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, [tips.length]);

    const handlePrev = useCallback(() => {
        if (tips.length <= 1) return;
        setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
    }, [tips.length]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleNext, handlePrev, onClose]);

    const handleSave = async () => {
        if (!newTip.trim()) return;
        setLoading(true);
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('tool_tips')
                    .update({ content: newTip })
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('tool_tips')
                    .insert([{ tool_id: toolId, content: newTip, author_id: user?.id }]);
                if (error) throw error;
            }
            setNewTip('');
            setEditingId(null);
            await fetchTips();
        } catch (err: any) {
            console.error(err);
            if (err.code === 'PGRST205') setIsTableMissing(true);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this expert protocol?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('tool_tips').delete().eq('id', id);
            if (error) throw error;
            await fetchTips();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const currentTip = tips[currentIndex];
    const totalTips = tips.length;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-scale-in relative ring-4 ring-slate-900/5 flex flex-col max-h-[90vh]">
                
                {/* Header Block */}
                <div className="bg-indigo-600 p-8 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-16 -mt-16"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30 shadow-lg shadow-indigo-700/20">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight leading-none">Editorial Protocols</h3>
                                <p className="text-[10px] font-bold text-indigo-200 mt-1 uppercase tracking-widest">{toolName}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Progress Bar (Visual indicator of how many tips) */}
                {totalTips > 0 && (
                    <div className="h-1 w-full bg-slate-100 shrink-0">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                            style={{ width: `${((currentIndex + 1) / totalTips) * 100}%` }}
                        ></div>
                    </div>
                )}

                {/* Focused Content Area */}
                <div className="flex-grow overflow-y-auto p-10 custom-scrollbar relative min-h-[250px] flex flex-col">
                    {loading && <LoadingOverlay message="Synchronizing..." color="indigo" />}
                    
                    {isTableMissing ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 flex-grow">
                            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-100">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">System Node Offline</h4>
                                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed px-6">
                                    The Pro-Tip database table has not been initialized.
                                </p>
                            </div>
                        </div>
                    ) : totalTips === 0 ? (
                        <div className="text-center py-10 flex flex-col items-center justify-center flex-grow opacity-40">
                             <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Manual Empty</p>
                            <p className="text-xs font-medium text-slate-400 mt-1">No protocols listed for this node.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* Tip Viewer Card */}
                            <div key={currentTip.id} className="animate-fade-in flex flex-col flex-grow">
                                <div className="flex items-center justify-between mb-8">
                                    <span className="inline-flex items-center px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                                        Protocol Step {currentIndex + 1} of {totalTips}
                                    </span>
                                    
                                    {isAdmin && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => { setEditingId(currentTip.id); setNewTip(currentTip.content); }} 
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100"
                                                title="Edit current step"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(currentTip.id)} 
                                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-100"
                                                title="Delete current step"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100 flex-grow shadow-inner">
                                    <p className="text-base text-slate-700 leading-relaxed font-medium whitespace-pre-wrap break-words">
                                        {currentTip.content}
                                    </p>
                                </div>

                                {/* Navigation Controls */}
                                <div className="flex items-center justify-between mt-10">
                                    <button 
                                        onClick={handlePrev}
                                        disabled={totalTips <= 1}
                                        className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                                        Previous
                                    </button>

                                    <div className="flex gap-1.5">
                                        {tips.map((_, i) => (
                                            <div 
                                                key={i}
                                                onClick={() => setCurrentIndex(i)}
                                                className={`w-2 h-2 rounded-full cursor-pointer transition-all duration-300 ${i === currentIndex ? 'bg-indigo-600 w-5' : 'bg-slate-200 hover:bg-slate-300'}`}
                                            ></div>
                                        ))}
                                    </div>

                                    <button 
                                        onClick={handleNext}
                                        disabled={totalTips <= 1}
                                        className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-slate-200 active:scale-95"
                                    >
                                        Next
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Admin Input Panel */}
                {isAdmin && !isTableMissing && (
                    <div className="p-8 bg-slate-50 border-t border-slate-100 shrink-0">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                            {editingId ? 'Modify Knowledge Node' : 'Broadcast New Protocol'}
                        </label>
                        <div className="flex flex-col gap-4">
                            <textarea 
                                value={newTip}
                                onChange={(e) => setNewTip(e.target.value)}
                                className="w-full p-4 rounded-2xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none bg-white h-24 shadow-sm"
                                placeholder="Enter expert advice for this tool..."
                            />
                            <div className="flex gap-3">
                                {editingId && (
                                    <button 
                                        onClick={() => { setEditingId(null); setNewTip(''); }}
                                        className="flex-1 py-3 text-xs font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest transition-colors"
                                    >
                                        Discard
                                    </button>
                                )}
                                <button 
                                    onClick={handleSave}
                                    disabled={!newTip.trim()}
                                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-black py-4 px-6 rounded-2xl transition-all active:scale-95 shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px]"
                                >
                                    {editingId ? 'Update Step' : 'Publish Protocol Step'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Footer */}
                <div className="p-6 bg-white border-t border-slate-100 flex justify-center shrink-0">
                    <button onClick={onClose} className="px-10 py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-[0.2em] transition-colors flex items-center gap-2">
                        Close Manual
                        <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ESC</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ToolTipsModal;