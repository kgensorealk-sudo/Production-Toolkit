
import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface OtherRefItem {
    id: string;
    label: string;
    rawText: string;
    formattedHtml: string;
    originalLabel: string; 
}

const OtherRefScanner: React.FC = () => {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<OtherRefItem[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    /**
     * CLEANEST TEXT PROTOCOL
     * Strips non-breaking spaces, zero-width markers, and control characters
     * to ensure text behaves like standard typed input in external software.
     */
    const sanitizeForWord = (text: string): string => {
        if (!text) return '';
        return text
            .normalize('NFKC')
            .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const scanForOtherRefs = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found: OtherRefItem[] = [];
                const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const id = match[1];
                    const content = match[2];
                    
                    if (content.includes('<ce:other-ref')) {
                        const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                        const originalLabel = labelMatch ? labelMatch[1].trim() : '';
                        
                        const isNumericLabel = originalLabel.length > 0 && !/[a-zA-Z]/.test(originalLabel);
                        const displayLabel = isNumericLabel ? sanitizeForWord(originalLabel) : '';

                        const otherRefContentMatch = content.match(/<ce:other-ref[^>]*>([\s\S]*?)<\/ce:other-ref>/);
                        let rawInner = otherRefContentMatch ? otherRefContentMatch[1] : content;

                        // 1. Rigorous tag strip + sanitize
                        const cleanText = sanitizeForWord(rawInner.replace(/<[^>]+>/g, ' '));

                        // 2. Formatting markers for clipboard recovery
                        let formattedHtml = rawInner
                            .replace(/<ce:italic[^>]*>/gi, '|ITALIC_OPEN|')
                            .replace(/<\/ce:italic>/gi, '|ITALIC_CLOSE|')
                            .replace(/<ce:bold[^>]*>/gi, '|BOLD_OPEN|')
                            .replace(/<\/ce:bold>/gi, '|BOLD_CLOSE|')
                            .replace(/<ce:sup[^>]*>/gi, '|SUP_OPEN|')
                            .replace(/<\/ce:sup>/gi, '|SUP_CLOSE|')
                            .replace(/<ce:inf[^>]*>/gi, '|SUB_OPEN|')
                            .replace(/<\/ce:inf>/gi, '|SUB_CLOSE|');
                        
                        formattedHtml = formattedHtml.replace(/<[^>]+>/g, ' ');
                        formattedHtml = sanitizeForWord(formattedHtml);

                        formattedHtml = formattedHtml
                            .replace(/\|ITALIC_OPEN\|/g, '<i>').replace(/\|ITALIC_CLOSE\|/g, '</i>')
                            .replace(/\|BOLD_OPEN\|/g, '<b>').replace(/\|BOLD_CLOSE\|/g, '</b>')
                            .replace(/\|SUP_OPEN\|/g, '<sup>').replace(/\|SUP_CLOSE\|/g, '</sup>')
                            .replace(/\|SUB_OPEN\|/g, '<sub>').replace(/\|SUB_CLOSE\|/g, '</sub>');

                        found.push({
                            id,
                            label: displayLabel,
                            originalLabel: originalLabel,
                            rawText: cleanText,
                            formattedHtml: displayLabel ? `<b>${displayLabel}</b> ${formattedHtml}` : formattedHtml
                        });
                    }
                }

                if (found.length === 0) {
                    setToast({ msg: "No <ce:other-ref> items detected.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setSelectedIndices(new Set(found.map((_, i) => i)));
                    setStep('report');
                    setToast({ msg: `Isolated ${found.length} clean items.`, type: "success" });
                    setIsLoading(false);
                }
            } catch (err) {
                setToast({ msg: "Deep scan failed.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const toggleIndex = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    const toggleAll = () => {
        if (selectedIndices.size === results.length) setSelectedIndices(new Set());
        else setSelectedIndices(new Set(results.map((_, i) => i)));
    };

    const copyToWord = (items: OtherRefItem[]) => {
        if (items.length === 0) {
            setToast({ msg: "No items selected.", type: "warn" });
            return;
        }
        try {
            // Minimal HTML wrapper for Word inheritance
            const htmlContent = items.map(item => `<p>${item.formattedHtml}</p>`).join('');
            const plainText = items.map(item => `${item.label ? item.label + ' ' : ''}${item.rawText}`).join('\n');

            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });

            if (typeof ClipboardItem !== 'undefined') {
                const data = [new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })];
                navigator.clipboard.write(data).then(() => {
                    setToast({ msg: `Copied ${items.length} clean items.`, type: "success" });
                });
            } else {
                navigator.clipboard.writeText(plainText);
                setToast({ msg: "Rich text unsupported.", type: "warn" });
            }
        } catch (e) {
            setToast({ msg: "Copy operation failed.", type: "error" });
        }
    };

    const handleCopySelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        copyToWord(selectedItems);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? scanForOtherRefs : handleCopySelected,
        onClear: () => { setInput(''); setResults([]); setStep('input'); setSelectedIndices(new Set()); }
    }, [input, results, step, selectedIndices]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Other-Ref Scanner</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">
                    Isolate unstructured citations. Automated removal of hidden gremlins ensures "manually typed" behavior in MS Word.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative">
                {isLoading && <LoadingOverlay message="Purging hidden artifacts..." color="orange" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-800 text-xs uppercase tracking-widest">Bibliography Source Feed</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-amber-600">Clear</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder="Paste your XML document here. The tool will purge all invisible characters that disrupt Word pasting..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={scanForOtherRefs} className="bg-amber-500 hover:bg-amber-600 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-amber-200 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                Run Deep Audit & Purge
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Clean Extraction Report</h3>
                                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">Sanitized</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                        {selectedIndices.size} of {results.length} selected
                                    </span>
                                    <div className="h-3 w-px bg-slate-200"></div>
                                    <button 
                                        onClick={toggleAll}
                                        className="text-[10px] text-indigo-600 font-black uppercase tracking-wider hover:underline"
                                    >
                                        {selectedIndices.size === results.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => { setStep('input'); setSelectedIndices(new Set()); }} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all">New Scan</button>
                                <button 
                                    onClick={handleCopySelected} 
                                    disabled={selectedIndices.size === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 px-10 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest flex items-center gap-3"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    Copy Safe Text for Docx
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-grow overflow-auto p-10 space-y-6 custom-scrollbar">
                            {results.map((item, idx) => {
                                const isSelected = selectedIndices.has(idx);
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => toggleIndex(idx)}
                                        className={`p-8 bg-white border-2 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all group flex items-start gap-8 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-transparent'}`}
                                    >
                                        <div className="shrink-0 pt-1">
                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                                                {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-center gap-4 mb-4">
                                                <span className="text-[10px] font-mono font-black bg-slate-50 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 uppercase tracking-widest">ID: {item.id}</span>
                                                {item.label ? (
                                                    <span className="text-xs font-black text-slate-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-2">
                                                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                        {item.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 uppercase flex items-center gap-2">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        Omitted: {item.originalLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <div 
                                                className="text-[15px] text-slate-700 leading-relaxed font-serif italic break-words pr-12"
                                                dangerouslySetInnerHTML={{ __html: item.formattedHtml }}
                                            />
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); copyToWord([item]); }}
                                            className="shrink-0 p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 border border-transparent hover:border-indigo-100 transition-all opacity-0 group-hover:opacity-100"
                                            title="Copy this item only"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default OtherRefScanner;
