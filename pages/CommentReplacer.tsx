import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface CommentRef {
    id: string;
    label: string;
    commentContent: string;
    fullOutput: string;
}

const CommentReplacer: React.FC = () => {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<CommentRef[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    const runExtraction = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found: CommentRef[] = [];
                // Matches <ce:bib-reference> blocks
                const bibRegex = /<ce:bib-reference\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/gi;
                
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const id = match[1];
                    const content = match[2];
                    
                    // Look for <opt_COMMENT> deep within the block
                    const commentMatch = content.match(/<opt_COMMENT\b[^>]*>([\s\S]*?)<\/opt_COMMENT>/i);
                    
                    if (commentMatch) {
                        const labelMatch = content.match(/<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/i);
                        let label = '';
                        
                        if (labelMatch) {
                            // SURGICAL FIX: Strip nested tags (like opt_COMMENT) from label string
                            // This ensures if label is "[165]<opt_COMMENT>...</opt_COMMENT>", we only get "[165]"
                            label = labelMatch[1]
                                .replace(/<opt_COMMENT\b[^>]*>([\s\S]*?)<\/opt_COMMENT>/gi, '') // Remove nested comments
                                .replace(/<[^>]+>/g, '') // Remove any other leftover tags
                                .trim();
                        }
                        
                        // 1. Strip "Replace by: " prefix and normalize whitespace
                        let rawComment = commentMatch[1]
                            .replace(/^Replace by:\s*/i, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        
                        // 2. DOI URL Normalization: Convert https://doi.org/xxx into DOI: xxx
                        rawComment = rawComment.replace(/https?:\/\/(?:dx\.)?doi\.org\//gi, 'DOI: ');
                        
                        // 3. Simple entity decoding for common items to ensure clean Word output
                        const cleanComment = rawComment
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&apos;/g, "'");

                        found.push({
                            id,
                            label,
                            commentContent: cleanComment,
                            fullOutput: `${label ? label + ' ' : ''}${cleanComment}`
                        });
                    }
                }

                if (found.length === 0) {
                    setToast({ msg: "No <opt_COMMENT> tags detected within references.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setStep('report');
                    setToast({ msg: `Extracted ${found.length} reference replacements.`, type: "success" });
                    setIsLoading(false);
                }
            } catch (err) {
                setToast({ msg: "System parsing error.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const copyToClipboard = () => {
        if (results.length === 0) return;
        const text = results.map(r => r.fullOutput).join('\n\n');
        navigator.clipboard.writeText(text).then(() => {
            setToast({ msg: `Copied ${results.length} replacements.`, type: "success" });
        });
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runExtraction : copyToClipboard,
        onClear: () => { setInput(''); setResults([]); setStep('input'); }
    }, [input, results, step]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Comment Replacer</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">
                    Automated isolation of reference replacements buried in XML comment tags.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative transition-all duration-500">
                {isLoading && <LoadingOverlay message="Scanning System Comments..." color="amber" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-widest">Bibliography Source Feed</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-amber-600 uppercase tracking-widest">Clear Input</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder="Paste the <ce:bibliography> or full XML here..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runExtraction} className="bg-amber-500 hover:bg-amber-600 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-amber-200 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                Extract Comment Protocols
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Replacement Report</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">{results.length} Protocols Detected</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => { setStep('input'); setResults([]); }} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all">New Audit</button>
                                <button 
                                    onClick={copyToClipboard} 
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-10 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest flex items-center gap-3"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    Copy for Word
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {results.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    className="p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all group flex items-start gap-8"
                                >
                                    <div className="shrink-0 pt-1">
                                        <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 font-black border border-amber-100 shadow-inner">
                                            {idx + 1}
                                        </div>
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-[10px] font-mono font-black bg-slate-50 text-slate-400 px-3 py-1.5 rounded-xl border border-slate-200 uppercase tracking-widest">ID: {item.id}</span>
                                            {item.label && (
                                                <span className="text-xs font-black text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                                                    Label: {item.label}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[15px] text-slate-700 leading-relaxed font-serif break-words pr-12">
                                            {item.commentContent}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { navigator.clipboard.writeText(item.fullOutput); setToast({msg:'Item Copied!', type:'success'}); }}
                                        className="shrink-0 p-3 bg-slate-50 text-slate-300 rounded-xl hover:bg-amber-50 hover:text-amber-600 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                                        title="Copy single item"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    </button>
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

export default CommentReplacer;