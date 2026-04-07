import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Database, 
    FileText, 
    Eraser, 
    ChevronRight, 
    Hash, 
    Layers, 
    Copy, 
    CheckCircle2, 
    AlertCircle,
    ArrowLeft,
    Search,
    Info
} from 'lucide-react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface SectionItem {
    id: string;
    level: number;
    label: string;
    title: string;
    fullTag: string;
}

const SectionAuditor: React.FC = () => {
    const [input, setInput] = useState('');
    const [sections, setSections] = useState<SectionItem[]>([]);
    const [step, setStep] = useState<'input' | 'audit'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const stripTags = (xml: string) => xml.replace(/<[^>]+>/g, '').trim();

    const runAudit = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML source.", type: "warn" });
            return;
        }
        setIsLoading(true);

        setTimeout(() => {
            try {
                const detectedSections: SectionItem[] = [];
                const regex = /<(ce:)?(?:section-title|title)\b[^>]*>([\s\S]*?)<\/(?:ce:)?(?:section-title|title)>|<(ce:)?label\b[^>]*>([\s\S]*?)<\/(?:ce:)?label>|<(ce:)?section(?![a-zA-Z0-9\-])\b([^>]*)>|<\/(ce:)?section>/gi;
                
                let match;
                let depth = 0;
                const sectionStack: SectionItem[] = [];

                while ((match = regex.exec(input)) !== null) {
                    const fullMatch = match[0];
                    const tContent = match[2];
                    const lContent = match[4];
                    const sAttrs = match[6];
                    const isClose = match[7] !== undefined || fullMatch.startsWith('</');
                    
                    if (tContent !== undefined) {
                        const current = sectionStack[sectionStack.length - 1];
                        if (current) current.title = stripTags(tContent);
                    } else if (lContent !== undefined) {
                        const current = sectionStack[sectionStack.length - 1];
                        if (current) current.label = stripTags(lContent);
                    } else if (isClose) {
                        sectionStack.pop();
                        depth = Math.max(0, depth - 1);
                    } else {
                        depth++;
                        const idMatch = sAttrs ? sAttrs.match(/id="([^"]+)"/) : null;
                        const newSection: SectionItem = {
                            id: idMatch ? idMatch[1] : '',
                            level: depth,
                            label: '',
                            title: '',
                            fullTag: fullMatch
                        };
                        detectedSections.push(newSection);
                        sectionStack.push(newSection);
                    }
                }

                if (detectedSections.length === 0) {
                    setToast({ msg: "No structural sections detected.", type: "warn" });
                } else {
                    setSections(detectedSections);
                    setStep('audit');
                    setToast({ msg: `Successfully mapped ${detectedSections.length} section nodes.`, type: "success" });
                }
            } catch (e) {
                console.error(e);
                setToast({ msg: "Audit process failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    const copyAudit = () => {
        const text = sections.map(s => `${'  '.repeat(s.level - 1)}[L${s.level}] ${s.label ? s.label + ' ' : ''}${s.title || 'Untitled'} (ID: ${s.id || 'None'})`).join('\n');
        navigator.clipboard.writeText(text);
        setToast({ msg: "Audit report copied to clipboard.", type: "success" });
    };

    const filteredSections = useMemo(() => {
        if (!searchTerm.trim()) return sections;
        const low = searchTerm.toLowerCase();
        return sections.filter(s => 
            s.title.toLowerCase().includes(low) || 
            s.label.toLowerCase().includes(low) || 
            s.id.toLowerCase().includes(low)
        );
    }, [sections, searchTerm]);

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAudit : undefined,
        onClear: () => { setInput(''); setSections([]); setStep('input'); }
    }, [input, step]);

    return (
        <div className="max-w-full mx-auto px-2 py-12 sm:px-4 lg:px-6 font-sans selection:bg-indigo-100 selection:text-indigo-900">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 text-center"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">
                    <Database size={12} />
                    Structure Protocol
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter sm:text-6xl mb-4 uppercase leading-none">
                    Section <span className="text-indigo-600">Auditor</span>
                </h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed">
                    Identify and validate section labels, titles, and nesting levels within the XML structure.
                </p>
            </motion.div>

            <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden h-[800px] flex flex-col relative transition-all duration-700">
                <AnimatePresence mode="wait">
                    {isLoading && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50"
                        >
                            <LoadingOverlay message="Analyzing Section Hierarchy..." color="indigo" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {step === 'input' ? (
                        <motion.div 
                            key="input-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex flex-col h-full"
                        >
                            <div className="bg-slate-50/50 px-12 py-8 border-b border-slate-100 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                        <FileText size={16} />
                                    </div>
                                    <label className="font-black text-slate-800 text-[11px] uppercase tracking-[0.2em]">Source Stream</label>
                                </div>
                                <button 
                                    onClick={() => setInput('')} 
                                    className="group flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-all"
                                >
                                    <Eraser size={14} className="group-hover:rotate-12 transition-transform" />
                                    Clear Buffer
                                </button>
                            </div>
                            <div className="relative flex-grow group">
                                <textarea 
                                    value={input} 
                                    onChange={e => setInput(e.target.value)} 
                                    className="w-full h-full p-12 font-mono text-[14px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300 transition-all" 
                                    placeholder="Paste the XML source here. The system will extract section labels, titles, and determine nesting levels..."
                                    spellCheck={false}
                                />
                                {!input && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                                        <div className="text-center">
                                            <Layers size={120} className="mx-auto mb-4 text-slate-200" />
                                            <p className="font-black text-slate-300 uppercase tracking-[0.5em] text-sm">Awaiting XML Input</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-10 border-t border-slate-100 flex justify-center bg-slate-50/30 backdrop-blur-sm">
                                <button 
                                    onClick={runAudit} 
                                    disabled={!input.trim()}
                                    className="group relative bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 text-white font-black py-5 px-24 rounded-full shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.3em] overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center gap-3">
                                        Audit Structure
                                        <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="audit-step"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col h-full bg-slate-50/50"
                        >
                            <div className="px-12 py-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-center gap-6 shadow-sm z-10">
                                <div className="flex items-center gap-6">
                                    <button 
                                        onClick={() => setStep('input')} 
                                        className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all active:scale-90"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Section Matrix</h3>
                                            <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest">
                                                {sections.length} Nodes
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                            Hierarchical structural validation
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    <div className="relative flex-grow sm:w-64">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            type="text"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            placeholder="Filter nodes..."
                                            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                    <button 
                                        onClick={copyAudit} 
                                        className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-black py-3 px-6 rounded-2xl shadow-sm active:scale-95 transition-all uppercase text-[10px] tracking-widest"
                                    >
                                        <Copy size={14} />
                                        Export
                                    </button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-auto p-12 space-y-4 custom-scrollbar">
                                {filteredSections.length > 0 ? (
                                    filteredSections.map((sec, idx) => (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            key={`${sec.id}-${idx}`} 
                                            className="group relative p-8 bg-white border border-slate-200 rounded-[2.5rem] flex items-center gap-10 transition-all hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.08)] hover:border-indigo-200"
                                            style={{ marginLeft: `${(sec.level - 1) * 3}rem` }}
                                        >
                                            {/* Level Indicator */}
                                            <div className={`relative w-16 h-16 rounded-3xl flex items-center justify-center font-black text-xl shadow-inner shrink-0 transition-all group-hover:scale-110 ${
                                                sec.level === 1 ? 'bg-slate-900 text-white shadow-slate-400' : 
                                                sec.level === 2 ? 'bg-indigo-600 text-white shadow-indigo-200' : 
                                                sec.level === 3 ? 'bg-blue-500 text-white shadow-blue-100' :
                                                'bg-slate-100 text-slate-400 shadow-slate-50'
                                            }`}>
                                                {sec.level}
                                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border-2 border-current flex items-center justify-center">
                                                    <div className="w-1 h-1 rounded-full bg-current" />
                                                </div>
                                            </div>

                                            <div className="min-w-0 flex-grow">
                                                <div className="flex items-center gap-4 mb-3">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        <Layers size={12} />
                                                        Level {sec.level}
                                                    </div>
                                                    {sec.id && (
                                                        <div className="flex items-center gap-1.5 text-[10px] font-mono bg-slate-50 text-indigo-500 px-3 py-1 rounded-full border border-slate-100 uppercase font-bold">
                                                            <Hash size={10} />
                                                            {sec.id}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-5">
                                                    {sec.label && (
                                                        <span className="text-2xl font-black text-indigo-600 shrink-0 tracking-tighter italic">
                                                            {sec.label}
                                                        </span>
                                                    )}
                                                    <h3 className="text-xl font-bold text-slate-800 truncate tracking-tight">
                                                        {sec.title || <span className="text-slate-300 italic font-normal">Untitled Section Node</span>}
                                                    </h3>
                                                </div>
                                            </div>

                                            {/* Status / Meta */}
                                            <div className="shrink-0 flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                    {!sec.title && (
                                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-amber-500 bg-amber-50 px-3 py-1 rounded-full border border-amber-100 uppercase tracking-widest">
                                                            <AlertCircle size={10} />
                                                            No Title
                                                        </div>
                                                    )}
                                                    {!sec.id && (
                                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full border border-rose-100 uppercase tracking-widest">
                                                            <AlertCircle size={10} />
                                                            No ID
                                                        </div>
                                                    )}
                                                    {sec.title && sec.id && (
                                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                                                            <CheckCircle2 size={10} />
                                                            Valid
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                                                    Node_{idx.toString().padStart(3, '0')}
                                                </div>
                                            </div>

                                            {/* Connector Line */}
                                            {sec.level > 1 && (
                                                <div 
                                                    className="absolute top-1/2 -left-12 w-12 h-[1px] bg-slate-200"
                                                    style={{ left: `-${(sec.level - 1) * 3}rem`, width: `${(sec.level - 1) * 3}rem` }}
                                                />
                                            )}
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-6">
                                        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                                            <Search size={40} />
                                        </div>
                                        <div className="text-center">
                                            <h4 className="text-lg font-black text-slate-400 uppercase tracking-widest">No Matches Found</h4>
                                            <p className="text-sm font-medium text-slate-400 mt-2">Try adjusting your filter criteria</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-8 bg-white border-t border-slate-100 flex justify-between items-center px-12">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Info size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Audit completed via Structural Engine v2.4</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-slate-900" />
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">L1</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">L2</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">L3+</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default SectionAuditor;
