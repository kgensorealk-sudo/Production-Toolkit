import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ExtractedRef {
    id: string;
    label: string;
    rawText: string;
    formattedHtml: string;
    sourceType: 'source-text' | 'other-ref' | 'structured' | 'fallback';
}

const ReferenceExtractor: React.FC = () => {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<ExtractedRef[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    /**
     * CLEANING PROTOCOL
     * Purges artifacts and fixes punctuation spacing.
     */
    const sanitizeForWord = (text: string): string => {
        if (!text) return '';
        let sanitized = text
            .normalize('NFKC')
            .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/\s+,/g, ',')
            .replace(/\s+\./g, '.')
            .replace(/\s+:/g, ':')
            .replace(/\s+;/g, ';')
            .replace(/,\s*,/g, ', ')
            .replace(/,\s*\./g, '.')
            .replace(/\.\s*,/g, '.')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Final Rule: Enforce trailing period
        if (sanitized && !sanitized.endsWith('.')) {
            sanitized += '.';
        }
        
        return sanitized;
    };

    const runExtraction = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found: ExtractedRef[] = [];
                const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const id = match[1];
                    const content = match[2];
                    
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                    const originalLabel = labelMatch ? labelMatch[1].trim() : '';
                    
                    // Supress Name-date labels for clean Word output
                    const isNumericLabel = originalLabel.length > 0 && !/[a-zA-Z]/.test(originalLabel);
                    const displayLabel = isNumericLabel ? originalLabel : '';

                    let bestSource = '';
                    let sourceType: 'source-text' | 'other-ref' | 'structured' | 'fallback' = 'fallback';

                    // 1. Priority: ce:source-text (Contains pre-formatted string)
                    const sourceTextMatch = content.match(/<ce:source-text\b[^>]*>([\s\S]*?)<\/ce:source-text>/i);
                    const otherRefMatch = content.match(/<ce:other-ref[^>]*>([\s\S]*?)<\/ce:other-ref>/i);
                    const structuredMatch = content.match(/<(?:sb|ce):reference[^>]*>([\s\S]*?)<\/(?:sb|ce):reference>/i);

                    if (sourceTextMatch) {
                        bestSource = sourceTextMatch[1];
                        sourceType = 'source-text';
                    } else if (otherRefMatch) {
                        bestSource = otherRefMatch[1];
                        sourceType = 'other-ref';
                    } else if (structuredMatch) {
                        // Manual reconstruction for structured but without source-text
                        let reconstructed = structuredMatch[1]
                            .replace(/\s*<\/c[be]:surname>\s*<c[be]:given-name>/gi, ', ')
                            .replace(/\s*<\/s[be]:author>/gi, ',</sb:author>')
                            .replace(/\s*<\/ce:author>/gi, ',</ce:author>')
                            .replace(/\s*<\/s[be]:maintitle>/gi, '. </sb:maintitle>')
                            .replace(/\s*<\/ce:maintitle>/gi, '. </ce:maintitle>')
                            // Volume and Issue with Comma
                            .replace(/<s[be]:volume-nr\b[^>]*>([\s\S]*?)<\/s[be]:volume-nr>\s*<s[be]:issue-nr\b[^>]*>([\s\S]*?)<\/s[be]:issue-nr>/gi, '$1($2)')
                            .replace(/<s[be]:volume-nr\b[^>]*>([\s\S]*?)<\/s[be]:volume-nr>/gi, '$1,')
                            // Article number prepended with comma if volume exists
                            .replace(/<s[be]:article-number\b[^>]*>([\s\S]*?)<\/s[be]:article-number>/gi, ' $1')
                            .replace(/<s[be]:date\b[^>]*>([\s\S]*?)<\/s[be]:date>/gi, ', $1.')
                            .replace(/<ce:doi\b[^>]*>([\s\S]*?)<\/ce:doi>/gi, '. doi:$1');
                        
                        bestSource = reconstructed;
                        sourceType = 'structured';
                    } else {
                        bestSource = content.replace(/<ce:label>.*?<\/ce:label>/i, '');
                        sourceType = 'fallback';
                    }

                    // Handle Bold/Italic/Sup/Sub markers
                    let processingHtml = bestSource
                        .replace(/<ce:italic[^>]*>/gi, '|ITALIC_OPEN|')
                        .replace(/<\/ce:italic>/gi, '|ITALIC_CLOSE|')
                        .replace(/<ce:bold[^>]*>/gi, '|BOLD_OPEN|')
                        .replace(/<\/ce:bold>/gi, '|BOLD_CLOSE|')
                        .replace(/<ce:sup[^>]*>/gi, '|SUP_OPEN|')
                        .replace(/<\/ce:sup>/gi, '|SUP_CLOSE|')
                        .replace(/<ce:inf[^>]*>/gi, '|SUB_OPEN|')
                        .replace(/<\/ce:inf>/gi, '|SUB_CLOSE|');

                    let cleanRaw = processingHtml.replace(/<[^>]+>/g, ' ');
                    cleanRaw = sanitizeForWord(cleanRaw);

                    let formattedHtml = cleanRaw
                        .replace(/\|ITALIC_OPEN\|/g, '<i>').replace(/\|ITALIC_CLOSE\|/g, '</i>')
                        .replace(/\|BOLD_OPEN\|/g, '<b>').replace(/\|BOLD_CLOSE\|/g, '</b>')
                        .replace(/\|SUP_OPEN\|/g, '<sup>').replace(/\|SUP_CLOSE\|/g, '</sup>')
                        .replace(/\|SUB_OPEN\|/g, '<sub>').replace(/\|SUB_CLOSE\|/g, '</sub>')
                        .replace(/\|[A-Z_]+\|/g, '');

                    found.push({
                        id,
                        label: displayLabel,
                        rawText: cleanRaw.replace(/\|[A-Z_]+\|/g, ''),
                        formattedHtml: displayLabel ? `<b>${displayLabel}</b> ${formattedHtml}` : formattedHtml,
                        sourceType
                    });
                }

                if (found.length === 0) {
                    setToast({ msg: "No items detected.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setSelectedIndices(new Set(found.map((_, i) => i)));
                    setStep('report');
                    setToast({ msg: `Extracted ${found.length} items.`, type: "success" });
                    setIsLoading(false);
                }
            } catch (err) {
                setToast({ msg: "Extraction error.", type: "error" });
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

    const copyToClipboard = (items: ExtractedRef[]) => {
        if (items.length === 0) return;
        try {
            const htmlContent = items.map(item => `<p>${item.formattedHtml}</p>`).join('');
            const plainText = items.map(item => `${item.label ? item.label + ' ' : ''}${item.rawText}`).join('\n');

            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });

            if (typeof ClipboardItem !== 'undefined') {
                const data = [new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })];
                navigator.clipboard.write(data).then(() => setToast({ msg: `Copied ${items.length} items.`, type: "success" }));
            } else {
                navigator.clipboard.writeText(plainText);
                setToast({ msg: "Formatting stripped (Browser limitation).", type: "warn" });
            }
        } catch (e) {
            setToast({ msg: "Clipboard failure.", type: "error" });
        }
    };

    const handleCopySelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        copyToClipboard(selectedItems);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runExtraction : handleCopySelected,
        onClear: () => { setInput(''); setResults([]); setStep('input'); setSelectedIndices(new Set()); }
    }, [input, results, step, selectedIndices]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Bibliography Extractor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">
                    Prioritizing pre-formatted source text with enforced punctuation and trailing periods.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative transition-all duration-500">
                {isLoading && <LoadingOverlay message="Executing precision extraction..." color="indigo" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-widest">Master Source Feed</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Clear Input</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder="Paste your XML document here..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runExtraction} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                Run System Extraction
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Audit Report</h3>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                        {selectedIndices.size} items ready
                                    </span>
                                    <div className="h-3 w-px bg-slate-200"></div>
                                    <button onClick={toggleAll} className="text-[10px] text-indigo-600 font-black uppercase tracking-wider hover:underline">
                                        {selectedIndices.size === results.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => { setStep('input'); setSelectedIndices(new Set()); }} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all">New Session</button>
                                <button 
                                    onClick={handleCopySelected} 
                                    disabled={selectedIndices.size === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 px-10 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest flex items-center gap-3"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    Copy for Word
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {results.map((item, idx) => {
                                const isSelected = selectedIndices.has(idx);
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => toggleIndex(idx)}
                                        className={`p-6 bg-white border-2 rounded-3xl shadow-sm hover:shadow-md transition-all group flex items-start gap-6 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-transparent'}`}
                                    >
                                        <div className="shrink-0 pt-1">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                                                {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-[10px] font-mono font-black bg-slate-50 text-slate-400 px-2 py-1 rounded border border-slate-200 uppercase tracking-tighter">ID: {item.id}</span>
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-widest bg-slate-100 text-slate-500 border-slate-200`}>
                                                    {item.sourceType.replace('-', ' ')}
                                                </span>
                                            </div>
                                            <div 
                                                className="text-[14px] text-slate-700 leading-relaxed font-serif break-words"
                                                dangerouslySetInnerHTML={{ __html: item.formattedHtml }}
                                            />
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); copyToClipboard([item]); }}
                                            className="shrink-0 p-2 bg-slate-50 text-slate-300 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                                            title="Copy single item"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
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

export default ReferenceExtractor;