
import React, { useState } from 'react';
import { diffLines, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefItem {
    id: string;
    label: string;
    fullTag: string;
    cleanText: string;
    preview: string;
}

interface MatchResult {
    id: string;
    sourceRef: RefItem;
    matchedBy: 'id' | 'content';
    selected: boolean;
}

const RefListPurger: React.FC = () => {
    const [targetInput, setTargetInput] = useState('');
    const [sourceXml, setSourceXml] = useState('');
    const [output, setOutput] = useState('');
    const [matches, setMatches] = useState<MatchResult[]>([]);
    const [step, setStep] = useState<'input' | 'audit' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    const sanitizeForWord = (text: string): string => {
        if (!text) return '';
        return text.normalize('NFKC')
            .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const parseReferences = (xml: string): RefItem[] => {
        const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
        const items: RefItem[] = [];
        let match;
        while ((match = bibRegex.exec(xml)) !== null) {
            const id = match[1];
            const content = match[2];
            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            const label = labelMatch ? labelMatch[1].trim() : '';
            const cleanText = sanitizeForWord(content.replace(/<[^>]+>/g, ' ')).toLowerCase();
            items.push({
                id,
                label,
                fullTag: match[0],
                cleanText,
                preview: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) + '...'
            });
        }
        return items;
    };

    const runScan = () => {
        if (!targetInput.trim() || !sourceXml.trim()) {
            setToast({ msg: "Please provide both the Target List and Source XML.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const sourceRefs = parseReferences(sourceXml);
                
                // Extract IDs and clean text snippets from Target Input
                const targetIds = new Set(targetInput.match(/(?:bib|bb|ref)\d+/gi)?.map(id => id.toLowerCase()) || []);
                const targetLabels = new Set(targetInput.match(/\[\d+\]/g)?.map(l => l.trim()) || []);
                const targetText = sanitizeForWord(targetInput).toLowerCase();

                const foundMatches: MatchResult[] = [];
                const seenSourceIds = new Set<string>();

                sourceRefs.forEach(ref => {
                    let matched = false;
                    let matchedBy: 'id' | 'content' = 'id';

                    // 1. ID Match
                    if (targetIds.has(ref.id.toLowerCase())) {
                        matched = true;
                        matchedBy = 'id';
                    }
                    // 2. Label Match (e.g. "[1]")
                    else if (ref.label && targetLabels.has(ref.label)) {
                        matched = true;
                        matchedBy = 'content';
                    }
                    // 3. Substring Content Match (Fuzzy-ish)
                    else if (ref.cleanText.length > 20 && targetText.includes(ref.cleanText.substring(0, 50))) {
                        matched = true;
                        matchedBy = 'content';
                    }

                    if (matched) {
                        foundMatches.push({ id: ref.id, sourceRef: ref, matchedBy, selected: true });
                        seenSourceIds.add(ref.id);
                    }
                });

                if (foundMatches.length === 0) {
                    setToast({ msg: "No matches found. Check your IDs or snippets.", type: "warn" });
                    setIsLoading(false);
                } else {
                    setMatches(foundMatches);
                    setStep('audit');
                    setToast({ msg: `Found ${foundMatches.length} candidates for removal.`, type: "success" });
                    setIsLoading(false);
                }
            } catch (e) {
                setToast({ msg: "Scan failed.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const executePurge = () => {
        setIsLoading(true);
        setTimeout(() => {
            let processedXml = sourceXml;
            const purgeIds = new Set(matches.filter(m => m.selected).map(m => m.id));

            matches.forEach(m => {
                if (m.selected) {
                    // Use literal tag replacement to avoid regex escaping hell
                    processedXml = processedXml.split(m.sourceRef.fullTag).join('');
                }
            });

            // Final Punctuation Cleanup
            processedXml = processedXml.replace(/\s+\n/g, '\n').replace(/\n\s*\n/g, '\n').trim();

            setOutput(processedXml);
            generateDiff(sourceXml, processedXml);
            setStep('result');
            setActiveTab('xml');
            setToast({ msg: `Successfully purged ${purgeIds.size} items.`, type: "success" });
            setIsLoading(false);
        }, 800);
    };

    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        const rows: React.ReactNode[] = [];
        let leftLine = 1, rightLine = 1;

        diff.forEach((part, i) => {
            const color = part.added ? 'bg-emerald-50 text-emerald-800' : part.removed ? 'bg-rose-50 text-rose-800 line-through' : 'bg-transparent text-slate-500';
            const lines = part.value.split('\n');
            if (lines[lines.length - 1] === '') lines.pop();

            lines.forEach(line => {
                rows.push(
                    <div key={`${i}-${leftLine}-${rightLine}`} className={`flex border-b border-slate-100 font-mono text-[10px] ${color}`}>
                        <div className="w-10 bg-slate-50 border-r border-slate-200 text-right pr-2 select-none">{part.added ? '' : leftLine++}</div>
                        <div className="w-10 bg-slate-50 border-r border-slate-200 text-right pr-2 select-none">{part.removed ? '' : rightLine++}</div>
                        <div className="flex-grow pl-4 whitespace-pre-wrap py-0.5">{line}</div>
                    </div>
                );
            });
        });
        setDiffElements(<div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">{rows}</div>);
    };

    const toggleMatch = (idx: number) => {
        const next = [...matches];
        next[idx].selected = !next[idx].selected;
        setMatches(next);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runScan : (step === 'audit' ? executePurge : undefined),
        onClear: () => { setTargetInput(''); setSourceXml(''); setStep('input'); setMatches([]); }
    }, [targetInput, sourceXml, step, matches]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Reference List Purger</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">
                    Surgically remove reported uncited items from your XML source. High-precision ID and content matching.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[750px] flex flex-col relative">
                {isLoading && <LoadingOverlay message="Synchronizing System Data..." color="rose" />}

                {step === 'input' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 h-full divide-x divide-slate-100 animate-fade-in">
                        <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
                            <div className="bg-slate-100 px-8 py-4 border-b border-slate-200 flex justify-between items-center">
                                <label className="font-bold text-slate-700 text-xs uppercase tracking-widest">1. Reported Uncited List</label>
                                <span className="text-[10px] text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100 uppercase">Target List</span>
                            </div>
                            <textarea 
                                value={targetInput} 
                                onChange={e => setTargetInput(e.target.value)} 
                                className="flex-grow p-8 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                                placeholder="Paste the list of references or IDs to be removed. Can be IDs like bib1, bb005, or even the reference text itself..."
                                spellCheck={false}
                            />
                        </div>
                        <div className="flex flex-col h-full overflow-hidden relative">
                            <div className="bg-slate-100 px-8 py-4 border-b border-slate-200 flex justify-between items-center">
                                <label className="font-bold text-slate-700 text-xs uppercase tracking-widest">2. Full Bibliography Source</label>
                                <span className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">Master Source</span>
                            </div>
                            <textarea 
                                value={sourceXml} 
                                onChange={e => setSourceXml(e.target.value)} 
                                className="flex-grow p-8 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                                placeholder="Paste the full <ce:bibliography> XML section here..."
                                spellCheck={false}
                            />
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
                                <button 
                                    onClick={runScan} 
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-12 rounded-[2rem] shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-widest"
                                >
                                    Scan & Audit Removal
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'audit' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">Surgical Match Audit</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{matches.filter(m => m.selected).length} items queued for deletion</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setStep('input')} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all">Back to Inputs</button>
                                <button onClick={executePurge} className="bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">Purge Selected Refs</button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {matches.map((m, idx) => (
                                <div 
                                    key={m.id} 
                                    onClick={() => toggleMatch(idx)}
                                    className={`p-6 bg-white border-2 rounded-3xl cursor-pointer transition-all flex items-center gap-6 group ${m.selected ? 'border-rose-500 shadow-md ring-1 ring-rose-100' : 'border-slate-200 opacity-60'}`}
                                >
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${m.selected ? 'bg-rose-600 border-rose-600' : 'border-slate-300'}`}>
                                        {m.selected && <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-[10px] font-mono font-black bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200 uppercase">ID: {m.id}</span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${m.matchedBy === 'id' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                Matched by {m.matchedBy}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 italic truncate pr-4 leading-relaxed">{m.sourceRef.preview}</p>
                                    </div>
                                    <div className={`text-[10px] font-black uppercase transition-colors ${m.selected ? 'text-rose-600' : 'text-slate-400'}`}>
                                        {m.selected ? 'Purging Entry' : 'Keeping Entry'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">Cleaned XML Stream</h3>
                            <button onClick={() => { setStep('input'); setMatches([]); }} className="text-xs font-bold text-indigo-600 hover:underline uppercase tracking-widest">New Session</button>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-4">
                            {['xml', 'diff'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => setActiveTab(t as any)} 
                                    className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === t ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}
                                >
                                    {t === 'xml' ? 'Cleaned XML' : 'Removal Log (Diff)'}
                                </button>
                            ))}
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8">
                                    <div className="absolute top-10 right-10 z-10 flex gap-2">
                                        <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'XML Copied!', type:'success'}); }} className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 shadow-sm transition-all uppercase">Copy Clean XML</button>
                                    </div>
                                    <textarea 
                                        readOnly
                                        value={output}
                                        className="h-full w-full p-10 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner focus:ring-0 resize-none leading-relaxed outline-none"
                                    />
                                </div>
                            )}

                            {activeTab === 'diff' && (
                                <div className="absolute inset-0 overflow-auto custom-scrollbar p-8">
                                    {diffElements}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default RefListPurger;
