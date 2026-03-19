import React, { useState } from 'react';
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
                
                // Refined regex to accurately capture section tags, labels, and titles.
                // We use a negative lookahead (?![a-zA-Z0-9\-]) to ensure <ce:section-title> 
                // is not incorrectly matched by the <ce:section> branch.
                // Group indices:
                // 1: ce: (title prefix)
                // 2: content (title)
                // 3: ce: (label prefix)
                // 4: content (label)
                // 5: ce: (section open prefix)
                // 6: attrs (section open)
                // 7: ce: (section close prefix)
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
                        // Title tag matched
                        const current = sectionStack[sectionStack.length - 1];
                        if (current) current.title = stripTags(tContent);
                    } else if (lContent !== undefined) {
                        // Label tag matched
                        const current = sectionStack[sectionStack.length - 1];
                        if (current) current.label = stripTags(lContent);
                    } else if (isClose) {
                        // Closing section matched
                        sectionStack.pop();
                        depth = Math.max(0, depth - 1);
                    } else {
                        // Opening section matched
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
        }, 600);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAudit : undefined,
        onClear: () => { setInput(''); setSections([]); setStep('input'); }
    }, [input, step]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Section Auditor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic tracking-tight leading-relaxed">
                    Identify and validate section labels, titles, and nesting levels within the XML structure.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[750px] flex flex-col relative transition-all duration-500">
                {isLoading && <LoadingOverlay message="Analyzing Section Hierarchy..." color="indigo" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-6 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Article Source Stream</label>
                            <button onClick={() => setInput('')} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline transition-all">Reset Input</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300" 
                            placeholder="Paste the XML source here. The system will extract section labels, titles, and determine nesting levels..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runAudit} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-20 rounded-[2.5rem] shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.3em]">
                                Audit Section Structure
                            </button>
                        </div>
                    </div>
                )}

                {step === 'audit' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Section Matrix</h3>
                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">
                                    {sections.length} Structural Nodes Mapped
                                </p>
                            </div>
                            <button onClick={() => setStep('input')} className="bg-slate-900 hover:bg-slate-800 text-white font-black py-3 px-10 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                New Audit
                            </button>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {sections.map((sec, idx) => (
                                <div 
                                    key={idx} 
                                    className="p-6 bg-white border border-slate-200 rounded-[2rem] flex items-center gap-8 transition-all hover:shadow-lg group"
                                    style={{ marginLeft: `${(sec.level - 1) * 2}rem` }}
                                >
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner shrink-0 transition-transform group-hover:scale-110 ${
                                        sec.level === 1 ? 'bg-indigo-600 text-white shadow-indigo-200' : 
                                        sec.level === 2 ? 'bg-blue-500 text-white shadow-blue-100' : 
                                        'bg-slate-200 text-slate-600 shadow-slate-100'
                                    }`}>
                                        {sec.level}
                                    </div>
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Level {sec.level}</span>
                                            {sec.id && <span className="text-[9px] font-mono bg-slate-50 text-slate-400 px-2 py-0.5 rounded border border-slate-100 uppercase">ID: {sec.id}</span>}
                                        </div>
                                        <div className="flex items-baseline gap-4">
                                            {sec.label && <span className="text-xl font-black text-indigo-600 shrink-0">{sec.label}</span>}
                                            <h3 className="text-lg font-bold text-slate-800 truncate">
                                                {sec.title || <span className="text-slate-300 italic font-normal">Untitled Section</span>}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="text-[10px] font-mono text-slate-300 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                                            {sec.id || 'NO_ID'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default SectionAuditor;
