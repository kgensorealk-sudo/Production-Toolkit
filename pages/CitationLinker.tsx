import React, { useState } from 'react';
import { diffLines, Change, diffWordsWithSpace } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ResolutionItem {
    id: string;
    originalTag: string;
    textContent: string;
    status: 'resolved' | 'failed' | 'ignored';
    existingId: string;
    existingRefid: string;
    mappedIds: string[];
    originalIsPlural: boolean;
    targetIsPlural: boolean;
    missingRefid: boolean;
    missingId: boolean;
}

const CitationLinker: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [resolutions, setResolutions] = useState<ResolutionItem[]>([]);
    const [step, setStep] = useState<'input' | 'matrix' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [processLabel, setProcessLabel] = useState('');
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    // Configuration States
    const [targetMissingRefid, setTargetMissingRefid] = useState(true);
    const [targetMissingId, setTargetMissingId] = useState(true);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/30 font-medium');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-100 text-emerald-900 font-bold');
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
                const lNum = lContent !== undefined ? leftLineNum++ : '';
                const rNum = rContent !== undefined ? rightLineNum++ : '';
                let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/70' : (type === 'replace' ? 'bg-rose-50/30' : '');
                let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/70' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                rows.push(
                    <tr key={`${i}-${r}`} className="hover:bg-slate-50 transition-colors duration-75 group border-b border-slate-100/30 last:border-0">
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 select-none bg-slate-50/80 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 border-l select-none bg-slate-50/80 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setDiffElements(
            <div className="bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-14" /><col className="w-[calc(50%-3.5rem)]" /><col className="w-14 border-l border-slate-200" /><col className="w-[calc(50%-3.5rem)]" /></colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">Baseline XML</th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">Linked XML</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const runAnalysis = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML source.", type: "warn" }); return; }
        setIsLoading(true);
        setProcessLabel('Mapping Bibliography Nodes...');

        setTimeout(() => {
            try {
                // 1. Build Label-to-ID Map
                const labelMap = new Map<string, string>();
                const bibRegex = /<ce:bib-reference\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/gi;
                let bibMatch;
                while ((bibMatch = bibRegex.exec(input)) !== null) {
                    const id = bibMatch[1];
                    const content = bibMatch[2];
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/i);
                    if (labelMatch) {
                        const label = labelMatch[1].replace(/[\[\]]/g, '').trim();
                        labelMap.set(label, id);
                    }
                }

                // 2. Locate Orphan Tags
                const orphans: ResolutionItem[] = [];
                const tagRegex = /<ce:cross-refs?\b([^>]*)>([\s\S]*?)<\/ce:cross-refs?>/gi;
                let tagMatch;
                while ((tagMatch = tagRegex.exec(input)) !== null) {
                    const fullTag = tagMatch[0];
                    const attrs = tagMatch[1];
                    const text = tagMatch[2].trim();
                    const originalIsPlural = fullTag.includes('cross-refs');

                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    const refidMatch = attrs.match(/\brefid="([^"]+)"/);
                    
                    const existingId = idMatch ? idMatch[1] : '';
                    const existingRefid = refidMatch ? refidMatch[1] : '';

                    const missingId = !existingId;
                    const missingRefid = !existingRefid;

                    // Filter based on configuration
                    const shouldProcess = (targetMissingRefid && missingRefid) || (targetMissingId && missingId);
                    if (!shouldProcess) continue;

                    let mappedIds: string[] = existingRefid ? existingRefid.split(/\s+/).filter(Boolean) : [];
                    let status: 'resolved' | 'failed' | 'ignored' = 'failed';

                    // Always parse text for potential multiple IDs to support singular-to-plural conversion
                    if (missingRefid) {
                        const parts = text.split(/[,;]|\band\b/i);
                        const detectedIds: string[] = [];
                        parts.forEach(part => {
                            const trimmed = part.replace(/[\[\]]/g, '').trim();
                            if (/[\-–—]/.test(trimmed)) {
                                const rangeParts = trimmed.split(/[\-–—]/);
                                if (rangeParts.length === 2) {
                                    const startStr = rangeParts[0].replace(/\D/g, '');
                                    const endStr = rangeParts[1].replace(/\D/g, '');
                                    const start = parseInt(startStr);
                                    const end = parseInt(endStr);
                                    if (!isNaN(start) && !isNaN(end)) {
                                        for (let n = start; n <= end; n++) {
                                            const id = labelMap.get(n.toString());
                                            if (id) detectedIds.push(id);
                                        }
                                    }
                                }
                            } else {
                                const id = labelMap.get(trimmed);
                                if (id) detectedIds.push(id);
                            }
                        });
                        mappedIds = detectedIds;
                    }

                    const targetIsPlural = mappedIds.length > 1;

                    if ((missingRefid && mappedIds.length > 0) || !missingRefid) {
                        status = 'resolved';
                    }

                    orphans.push({
                        id: `orphan_${orphans.length}`,
                        originalTag: fullTag,
                        textContent: text,
                        status,
                        existingId,
                        existingRefid,
                        mappedIds,
                        originalIsPlural,
                        targetIsPlural,
                        missingId,
                        missingRefid
                    });
                }

                if (orphans.length === 0) {
                    setToast({ msg: "No matching citation tags detected based on current configuration.", type: "info" });
                    setIsLoading(false);
                    return;
                }

                setResolutions(orphans);
                setStep('matrix');
                setToast({ msg: `System detected ${orphans.length} candidates for protocol injection.`, type: "info" });
            } catch (e) {
                setToast({ msg: "Resolution failure.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    const executeLink = async () => {
        setIsLoading(true);
        setProcessLabel('Surgically Injecting Attributes...');

        setTimeout(() => {
            try {
                let cfCounter = 4000;
                const existingCf = input.match(/id="cf(\d+)"/g);
                if (existingCf) {
                    const max = existingCf.reduce((m, c) => Math.max(m, parseInt(c.match(/\d+/)![0])), 0);
                    cfCounter = Math.ceil((max + 10) / 10) * 10;
                }

                let result = input;
                const activeResolutions = resolutions.filter(r => r.status === 'resolved');

                activeResolutions.forEach(res => {
                    let targetId = res.existingId;
                    if (res.missingId) {
                        targetId = `cf${cfCounter.toString().padStart(4, '0')}`;
                        cfCounter += 5;
                    }

                    const refidValue = res.mappedIds.join(' ');
                    const tagName = res.targetIsPlural ? 'ce:cross-refs' : 'ce:cross-ref';
                    const newTag = `<${tagName} id="${targetId}" refid="${refidValue}">${res.textContent}</${tagName}>`;
                    
                    // Use split/join for literal safety
                    result = result.split(res.originalTag).join(newTag);
                });

                setOutput(result);
                generateDiff(input, result);
                setStep('result');
                setToast({ msg: `Successfully processed ${activeResolutions.length} nodes.`, type: "success" });
            } catch (e) {
                setToast({ msg: "Injection failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAnalysis : (step === 'matrix' ? executeLink : undefined),
        onClear: () => { setInput(''); setResolutions([]); setStep('input'); }
    }, [input, step, resolutions, targetMissingId, targetMissingRefid]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Citation Linker Pro</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic leading-relaxed">
                    Automated resolution and ID enforcement for <code>ce:cross-ref</code> tags. Intelligent range expansion and DTD alignment.
                </p>
            </div>

            {/* Protocol Configuration Bar */}
            <div className="flex justify-center mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-12">
                    <Switch id="toggle-refid" label="Resolve Links" subLabel="Missing refid" checked={targetMissingRefid} onChange={setTargetMissingRefid} color="indigo" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <Switch id="toggle-id" label="Enforce IDs" subLabel="Missing id (cfxxxx)" checked={targetMissingId} onChange={setTargetMissingId} color="blue" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <div className="flex gap-3">
                         <button onClick={() => { setInput(''); setResolutions([]); setStep('input'); }} className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest px-4">Clear All</button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative transition-all duration-500">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md flex items-center justify-center rounded-2xl animate-fade-in flex-col">
                        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-2">{processLabel}</span>
                    </div>
                )}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-widest">Article Source Stream</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-rose-500 uppercase tracking-widest hover:underline">Clear Protocol</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300" 
                            placeholder="Paste the full article XML. The system will scan for citation tags based on your configuration toggles above..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runAnalysis} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-16 rounded-[2rem] shadow-2xl shadow-indigo-500/20 transition-all active:scale-95 uppercase text-xs tracking-widest">
                                Scan Source for Protocols
                            </button>
                        </div>
                    </div>
                )}

                {step === 'matrix' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Resolution Matrix</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{resolutions.filter(r => r.status === 'resolved').length} nodes ready for processing</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setStep('input')} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all tracking-widest">Abort</button>
                                <button onClick={executeLink} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                    Apply Protocols
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {resolutions.map((res, idx) => (
                                <div 
                                    key={idx} 
                                    className={`p-6 bg-white border-2 rounded-[2rem] flex items-center gap-8 transition-all hover:shadow-lg ${res.status === 'resolved' ? 'border-emerald-100' : 'border-rose-100 opacity-60'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full shrink-0 ${res.status === 'resolved' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="flex gap-1">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${res.originalIsPlural ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                    {res.originalIsPlural ? 'Plural' : 'Singular'}
                                                </span>
                                                {res.status === 'resolved' && !res.originalIsPlural && res.targetIsPlural && (
                                                    <span className="text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest bg-amber-50 text-amber-600 border-amber-100 animate-pulse">
                                                        &rarr; Convert to Plural
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                {res.missingId && <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase">New ID Needed</span>}
                                                {res.missingRefid && <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">New Link Needed</span>}
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400 font-bold ml-auto">TXT: "{res.textContent}"</span>
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-500 truncate bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            {res.originalTag}
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end">
                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${res.status === 'resolved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {res.status === 'resolved' ? 'Protocol Ready' : 'Protocol Failed'}
                                        </div>
                                        {res.status === 'resolved' && (
                                            <div className="flex gap-1">
                                                {res.mappedIds.slice(0, 2).map(id => (
                                                    <span key={id} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">{id}</span>
                                                ))}
                                                {res.mappedIds.length > 2 && <span className="text-[10px] text-slate-400 font-black">+{res.mappedIds.length - 2}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">Validated Protocol Stream</h3>
                            <div className="flex gap-4">
                                <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} className="bg-emerald-600 text-white border border-emerald-700 px-6 py-2.5 rounded-xl text-[10px] font-black hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-widest">Export Result</button>
                                <button onClick={() => { setStep('input'); setResolutions([]); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Start New Session</button>
                            </div>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-4">
                            <button onClick={() => setActiveTab('xml')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'xml' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Corrected XML</button>
                            <button onClick={() => setActiveTab('diff')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'diff' ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Audit Log (Diff)</button>
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8">
                                    <textarea 
                                        readOnly
                                        value={output}
                                        className="h-full w-full p-10 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner focus:ring-0 resize-none leading-relaxed outline-none"
                                    />
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

export default CitationLinker;