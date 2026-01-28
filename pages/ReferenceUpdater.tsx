import React, { useState } from 'react';
import { diffLines, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefBlock {
    fullTag: string;
    id: string;
    label: string;
    content: string;
    fingerprint: string;
}

const ReferenceUpdater: React.FC = () => {
    const [originalXml, setOriginalXml] = useState('');
    const [updatedXml, setUpdatedXml] = useState('');
    const [output, setOutput] = useState('');
    const [preserveIds, setPreserveIds] = useState(true);
    const [renumberInternal, setRenumberInternal] = useState(true);
    const [isNumberedMode, setIsNumberedMode] = useState(false);
    const [convertAndToAmp, setConvertAndToAmp] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatLabel = (label: string) => {
        if (!label) return label;
        return convertAndToAmp ? label.replace(/\b(and)\b/gi, '&amp;') : label;
    };

    const getSimilarity = (s1: string, s2: string): number => {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        const costs = new Array();
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) costs[j] = j;
                else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longer.length - costs[shorter.length]) / longer.length;
    };

    const parseReferences = (xml: string): RefBlock[] => {
        const refs: RefBlock[] = [];
        const regex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
            const content = match[2];
            const idMatch = match[1].match(/id="([^"]+)"/);
            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            const surnameMatch = content.match(/<(?:ce|sb):surname>(.*?)<\/(?:ce|sb):surname>/);
            const author = surnameMatch ? surnameMatch[1].toLowerCase().replace(/[^a-z]/g, '') : '';
            const dateMatch = content.match(/<(?:ce|sb):year>(.*?)<\/(?:ce|sb):year>/) || 
                             content.match(/<(?:ce|sb):date>(.*?)<\/(?:ce|sb):date>/);
            const year = dateMatch ? dateMatch[1].replace(/\D/g, '') : '';
            const titleMatch = content.match(/<(?:ce|sb):title>(.*?)<\/(?:ce|sb):title>/);
            const title = titleMatch ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            
            refs.push({
                fullTag: match[0],
                id: idMatch ? idMatch[1] : '',
                label: labelMatch ? labelMatch[1].trim() : '',
                content,
                fingerprint: author || year || title ? `meta|${author}|${year}|${title.substring(0, 50)}` : 
                             `text|${content.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 150)}`
            });
        }
        return refs;
    };

    const runMerge = () => {
        if (!originalXml.trim() || !updatedXml.trim()) {
            setToast({ msg: "Paste both Original and Updated XML.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                
                const getNextId = (xml: string, prefix: string, start: number) => {
                    const regex = new RegExp(`id="${prefix}(\\d+)"`, 'g');
                    let max = start;
                    let m; while ((m = regex.exec(xml)) !== null) {
                        const val = parseInt(m[1]);
                        if (val >= max) max = Math.ceil((val + 5) / 5) * 5;
                    }
                    return max;
                };

                let bbStart = getNextId(originalXml, 'bb', 3000);
                let rfCounter = getNextId(originalXml, 'rf', 3000);
                let seCounter = getNextId(originalXml, 'se', 3000);
                let irCounter = getNextId(originalXml, 'ir', 3000);
                let orCounter = getNextId(originalXml, 'or', 3000);
                let trCounter = getNextId(originalXml, 'tr', 3000);

                const usedUpdateIdx = new Set<number>();
                const finalBlocks: string[] = [];

                origRefs.forEach(origRef => {
                    let matchIdx = -1;
                    if (!isNumberedMode) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.label === origRef.label && u.label !== '');
                    } else {
                        let bestScore = 0;
                        updatedRefs.forEach((u, idx) => {
                            if (!usedUpdateIdx.has(idx)) {
                                const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                                if (score > 0.85 && score > bestScore) {
                                    bestScore = score; matchIdx = idx;
                                }
                            }
                        });
                    }

                    if (matchIdx !== -1) {
                        usedUpdateIdx.add(matchIdx);
                        const u = updatedRefs[matchIdx];
                        let finalTag = u.fullTag;
                        
                        const finalLabel = formatLabel(u.label);
                        finalTag = finalTag.replace(/<ce:label>.*?<\/ce:label>/, `<ce:label>${finalLabel}</ce:label>`);

                        if (preserveIds) {
                            let idToUse = origRef.id;
                            if (idToUse.startsWith('bib')) { idToUse = `bb${bbStart}`; bbStart += 5; }
                            finalTag = finalTag.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);
                        }

                        if (renumberInternal) {
                            finalTag = finalTag.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                                let prefix = p1.includes('ce:source-text') ? 'se' : p1.includes('inter-ref') ? 'ir' : p1.includes('ce:other-ref') ? 'or' : p1.includes('ce:textref') ? 'tr' : 'rf';
                                let counter = prefix === 'se' ? seCounter : prefix === 'ir' ? irCounter : prefix === 'or' ? orCounter : prefix === 'tr' ? trCounter : rfCounter;
                                const res = `${p1}id="${prefix}${counter}"${p2}`;
                                if (prefix === 'se') seCounter += 5; else if (prefix === 'ir') irCounter += 5; else if (prefix === 'or') orCounter += 5; else if (prefix === 'tr') trCounter += 5; else rfCounter += 5;
                                return res;
                            });
                        }
                        finalBlocks.push(finalTag);
                    } else {
                        finalBlocks.push(origRef.fullTag);
                    }
                });

                const result = finalBlocks.join('\n');
                setOutput(result);
                setToast({ msg: "Merge complete.", type: "success" });
            } catch (e) {
                setToast({ msg: "Process failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    useKeyboardShortcuts({
        onPrimary: runMerge,
        onClear: () => { setOriginalXml(''); setUpdatedXml(''); setOutput(''); }
    }, [originalXml, updatedXml]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Reference Updater</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Directly merge proofreading corrections into original XML bibliography.</p>
            </div>

            <div className="flex justify-center mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={isNumberedMode} onChange={(e) => setIsNumberedMode(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">Numbered (Fuzzy)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={preserveIds} onChange={(e) => setPreserveIds(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">Preserve IDs</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={renumberInternal} onChange={(e) => setRenumberInternal(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">Renumber se/rf/ir</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={convertAndToAmp} onChange={(e) => setConvertAndToAmp(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">and to &amp;amp;</span>
                    </label>
                    <button onClick={runMerge} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2 px-6 rounded-lg shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest ml-4">Process Merge</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[700px]">
                <div className="flex flex-col gap-6 h-full">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <span className="font-bold text-slate-700 text-xs uppercase tracking-widest">Original XML Source</span>
                            <button onClick={() => setOriginalXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>
                        </div>
                        <textarea value={originalXml} onChange={e => setOriginalXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste full article reference list..." spellCheck={false} />
                    </div>
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <span className="font-bold text-slate-700 text-xs uppercase tracking-widest">Updated Corrections</span>
                            <button onClick={() => setUpdatedXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>
                        </div>
                        <textarea value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste corrected items..." spellCheck={false} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <span className="font-bold text-slate-700 text-xs uppercase tracking-widest">Merged Result</span>
                        {output && <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} className="text-xs font-bold text-indigo-600 hover:underline">Copy All</button>}
                    </div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                        {isLoading && <LoadingOverlay message="Synchronizing Data..." color="indigo" />}
                        <textarea value={output} readOnly className="w-full h-full p-6 text-xs font-mono bg-transparent border-0 focus:ring-0 outline-none resize-none leading-relaxed" placeholder="Final merged XML will appear here..." />
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;