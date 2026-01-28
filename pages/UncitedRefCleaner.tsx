
import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefItem {
    id: string;
    label: string;
    fullTag: string;
    content: string;
}

const UncitedRefCleaner: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [uncitedRefs, setUncitedRefs] = useState<RefItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [step, setStep] = useState<'input' | 'review' | 'result'>('input');
    const [activeTab, setActiveTab] = useState<'xml' | 'report' | 'diff'>('xml');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' } | null>(null);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g,
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600">$4</span>'
            );
            return `<span class="text-indigo-600 font-medium">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-normal opacity-70">${suffix}</span>`;
        });
        return html;
    };

    const buildLines = (diffParts: Change[], isLeft: boolean) => {
        let lines: string[] = [];
        let currentLine = "";
        let activeClass: string | null = null;
        const append = (text: string, cls: string | null) => {
            if (!text) return;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === '\n') {
                    if (activeClass) currentLine += '</span>';
                    lines.push(currentLine);
                    currentLine = "";
                    if (activeClass) currentLine += `<span class="${activeClass}">`;
                } else {
                    if (cls !== activeClass) {
                        if (activeClass) currentLine += '</span>';
                        activeClass = cls;
                        if (activeClass) currentLine += `<span class="${activeClass}">`;
                    }
                    currentLine += escapeHtml(char);
                }
            }
        };
        diffParts.forEach(part => {
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/30');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-100 text-emerald-900 font-medium');
            else if (!part.added && !part.removed) append(part.value, null);
        });
        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1, rightLineNum = 1, i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal', leftVal = '', rightVal = '';
            if (current.removed && diff[i+1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
            } else {
                leftVal = rightVal = current.value; i++;
            }
            let leftLines: string[] = [], rightLines: string[] = [];
            if (type === 'replace') {
                const wordDiff = diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildLines(wordDiff, true);
                rightLines = buildLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildLines([{removed: true, value: leftVal} as Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{added: true, value: rightVal} as Change], false);
            } else {
                const lines = leftVal.split('\n');
                if (lines.length > 0 && lines[lines.length-1] === '') lines.pop(); 
                leftLines = lines.map(escapeHtml);
                rightLines = [...leftLines];
            }
            const maxRows = Math.max(leftLines.length, rightLines.length);
            for (let r = 0; r < maxRows; r++) {
                const lContent = leftLines[r], rContent = rightLines[r];
                const lNum = lContent !== undefined ? leftLineNum++ : '', rNum = rContent !== undefined ? rightLineNum++ : '';
                let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
                let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                rows.push(
                    <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75">
                        <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setDiffElements(
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-inner m-4">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-10 bg-slate-50" /><col className="w-[calc(50%-2.5rem)]" /><col className="w-10 bg-slate-50 border-l" /><col className="w-[calc(50%-2.5rem)]" /></colgroup>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const scanUncited = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML first.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            try {
                // 1. Get all Bib IDs
                const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                const bibRefs: RefItem[] = [];
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const content = match[2];
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                    bibRefs.push({
                        id: match[1],
                        fullTag: match[0],
                        label: labelMatch ? labelMatch[1].trim() : '',
                        content: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) + '...'
                    });
                }

                // 2. Get all cited refids
                const citedIds = new Set<string>();
                const citeRegex = /\brefid="([^"]+)"/g;
                let cMatch;
                while ((cMatch = citeRegex.exec(input)) !== null) {
                    // Explode space-separated IDs for cross-refs ranges
                    const ids = cMatch[1].split(/\s+/);
                    ids.forEach(id => citedIds.add(id));
                }

                // 3. Find Uncited
                const found = bibRefs.filter(b => !citedIds.has(b.id));

                if (found.length === 0) {
                    setToast({ msg: "No uncited references found!", type: "success" });
                    setIsLoading(false);
                } else {
                    setUncitedRefs(found);
                    setSelectedIds(new Set(found.map(f => f.id)));
                    setStep('review');
                    setIsLoading(false);
                }
            } catch (e) {
                setToast({ msg: "Scan failed.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const toggleRef = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const purgeChecked = () => {
        setIsLoading(true);
        setTimeout(() => {
            let result = input;
            const removed = uncitedRefs.filter(r => selectedIds.has(r.id));
            
            removed.forEach(r => {
                const escaped = r.fullTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped + '\\s*', 'g');
                result = result.replace(regex, '');
            });

            setOutput(result);
            generateDiff(input, result);
            setStep('result');
            setActiveTab('xml');
            setToast({ msg: `Removed ${removed.length} references.`, type: "success" });
            setIsLoading(false);
        }, 800);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? scanUncited : (step === 'review' ? purgeChecked : undefined),
        onClear: () => { setInput(''); setUncitedRefs([]); setStep('input'); }
    }, [input, step, uncitedRefs, selectedIds]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Uncited Reference Cleaner</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Sanitize bibliography lists by identifying and purging references with no body citations.</p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative">
                {isLoading && <LoadingOverlay message="Analyzing Data..." color="rose" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-800 text-xs uppercase tracking-widest">Bibliography Source Feed</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-rose-500">Clear</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent" 
                            placeholder="Paste your XML document here..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center">
                            <button onClick={scanUncited} className="bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-rose-200 transition-all active:scale-95 uppercase text-xs tracking-widest">
                                Scan for Uncited Items
                            </button>
                        </div>
                    </div>
                )}

                {step === 'review' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">Review Purge List</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{selectedIds.size} of {uncitedRefs.length} selected for removal</p>
                            </div>
                            <button onClick={purgeChecked} className="bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                Purge Selected
                            </button>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {uncitedRefs.map(ref => (
                                <div 
                                    key={ref.id} 
                                    onClick={() => toggleRef(ref.id)}
                                    className={`p-6 bg-white border rounded-3xl cursor-pointer transition-all flex items-center gap-6 group ${selectedIds.has(ref.id) ? 'border-rose-300 shadow-md ring-1 ring-rose-100' : 'border-slate-200 opacity-60'}`}
                                >
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.has(ref.id) ? 'bg-rose-600 border-rose-600' : 'border-slate-300'}`}>
                                        {selectedIds.has(ref.id) && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-[10px] font-mono font-black bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">ID: {ref.id}</span>
                                            {ref.label && <span className="text-xs font-bold text-slate-900">{ref.label}</span>}
                                        </div>
                                        <p className="text-sm text-slate-500 italic truncate pr-4">{ref.content}</p>
                                    </div>
                                    <div className={`text-[10px] font-black uppercase transition-colors ${selectedIds.has(ref.id) ? 'text-rose-600' : 'text-slate-400'}`}>
                                        {selectedIds.has(ref.id) ? 'To Delete' : 'Will Keep'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">System Cleanup Audit</h3>
                            <button onClick={() => { setStep('input'); setUncitedRefs([]); }} className="text-xs font-bold text-indigo-600">Start New Scan</button>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-4">
                            {['xml', 'report', 'diff'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => setActiveTab(t as any)} 
                                    className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === t ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}
                                >
                                    {t === 'xml' ? 'Resulting XML' : (t === 'report' ? 'Deletion Log' : 'Diff View')}
                                </button>
                            ))}
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8">
                                    <div className="absolute top-10 right-10 z-10">
                                        <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 shadow-sm transition-all uppercase">Copy All</button>
                                    </div>
                                    <div 
                                        className="h-full p-10 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: highlightXml(output) }}
                                    />
                                </div>
                            )}

                            {activeTab === 'report' && (
                                <div className="h-full overflow-auto p-12 custom-scrollbar space-y-6">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Purged Entries ({selectedIds.size})</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {uncitedRefs.filter(r => selectedIds.has(r.id)).map(r => (
                                            <div key={r.id} className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex flex-col">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-mono text-slate-400">ID: {r.id}</span>
                                                    <span className="text-rose-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700">{r.label || 'No Label'}</p>
                                                <p className="text-[10px] text-slate-400 mt-2 italic line-clamp-2">{r.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'diff' && (
                                <div className="absolute inset-0 overflow-auto custom-scrollbar">
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

export default UncitedRefCleaner;
