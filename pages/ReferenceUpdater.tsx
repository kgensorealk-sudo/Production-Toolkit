import React, { useState, useMemo } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefBlock {
    fullTag: string;
    id: string;
    label: string;
    cleanLabel: string; // "8" instead of "[8]"
    content: string;
    isSynthetic?: boolean;
    cleanContent?: string;
    fingerprint: string; 
    contentHash: string; 
    sortKey: string;
}

interface ScanItem {
    label: string;
    id: string;
    status: 'update' | 'unchanged' | 'orphan' | 'smart_match' | 'add';
    preview: string;
    matchType?: 'Label' | 'Content' | 'Fuzzy' | 'ID';
    matchScore?: number;
    isSynthetic?: boolean;
    selected: boolean;
    sortKey: string;
    originalIndex: number | null; 
    updatedIndex: number | null;
}

const ReferenceUpdater: React.FC = () => {
    const [originalXml, setOriginalXml] = useState('');
    const [updatedXml, setUpdatedXml] = useState('');
    const [output, setOutput] = useState('');
    const [preserveIds, setPreserveIds] = useState(true);
    const [renumberInternal, setRenumberInternal] = useState(true);
    const [addOrphans, setAddOrphans] = useState(false);
    const [trustIds, setTrustIds] = useState(false); // Default false to prevent the overlap error
    const [sortAlphabetically, setSortAlphabetically] = useState(false);
    const [convertAndToAmp, setConvertAndToAmp] = useState(false);
    const [activeTab, setActiveTab] = useState<'scan' | 'sequence' | 'result' | 'diff'>('scan');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [scanResults, setScanResults] = useState<ScanItem[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const getSimilarity = (s1: string, s2: string): number => {
        if (!s1 || !s2) return 0;
        if (s1 === s2) return 1.0;
        const longer = s1.length > s2.length ? s1 : s2, shorter = s1.length > s2.length ? s2 : s1;
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
            const id = idMatch ? idMatch[1] : '';
            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            let label = labelMatch ? labelMatch[1].trim() : '';
            const cleanLabel = label.replace(/[^\d]/g, ''); // Extract just the number
            
            const titleMatch = content.match(/<(?:ce|sb):maintitle>(.*?)<\/(?:ce|sb):maintitle>/i) || 
                               content.match(/<(?:ce|sb):title>(.*?)<\/(?:ce|sb):title>/i);
            const title = titleMatch ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            
            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            const contentHash = cleanContent.replace(/[^a-z0-9]/g, '');
            
            // Fingerprint for fuzzy matching: Title + First few authors
            const fingerprint = title.substring(0, 100) + contentHash.substring(0, 50);
            
            refs.push({ 
                fullTag: match[0], id, label, cleanLabel, content, 
                cleanContent, fingerprint, contentHash, 
                sortKey: label || cleanContent.substring(0, 60) 
            });
        }
        return refs;
    };

    const runAnalysis = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste XML sources.", type: "warn" }); return; }
        setIsLoading(true);
        
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                const analysis: ScanItem[] = [];
                const usedUpdateIdx = new Set<number>();
                
                origRefs.forEach((origRef, oIdx) => {
                    let matchIdx = -1;
                    let matchType: 'Label' | 'Content' | 'Fuzzy' | 'ID' | undefined;
                    let matchScore = 0;

                    // 1. LABEL MATCHING (Priority 1)
                    // If Label matches [8] == [8], it's almost certainly the target
                    if (origRef.cleanLabel) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.cleanLabel === origRef.cleanLabel);
                        if (matchIdx !== -1) { matchType = 'Label'; matchScore = 100; }
                    }

                    // 2. CONTENT HASH MATCH (Priority 2)
                    if (matchIdx === -1) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.contentHash === origRef.contentHash);
                        if (matchIdx !== -1) { matchType = 'Content'; matchScore = 100; }
                    }

                    // 3. FUZZY TITLE MATCH (Priority 3)
                    if (matchIdx === -1) {
                        let bestFuzzyIdx = -1;
                        let bestFuzzyScore = 0;
                        updatedRefs.forEach((u, idx) => {
                            if (!usedUpdateIdx.has(idx)) {
                                const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                                if (score > bestFuzzyScore) { bestFuzzyScore = score; bestFuzzyIdx = idx; }
                            }
                        });
                        if (bestFuzzyScore > 0.75) { 
                            matchIdx = bestFuzzyIdx; 
                            matchType = 'Fuzzy'; 
                            matchScore = Math.round(bestFuzzyScore * 100); 
                        }
                    }

                    // 4. ID MATCHING (Only if trustIds is enabled)
                    if (matchIdx === -1 && trustIds && origRef.id) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.id === origRef.id);
                        if (matchIdx !== -1) { matchType = 'ID'; matchScore = 100; }
                    }

                    if (matchIdx !== -1) {
                        usedUpdateIdx.add(matchIdx);
                        analysis.push({ 
                            label: origRef.label, id: origRef.id, 
                            status: 'update', matchType, matchScore, 
                            preview: updatedRefs[matchIdx].cleanContent.substring(0, 100) + '...', 
                            selected: true, sortKey: origRef.sortKey, 
                            originalIndex: oIdx, updatedIndex: matchIdx 
                        });
                    } else {
                        analysis.push({ 
                            label: origRef.label, id: origRef.id, 
                            status: 'unchanged', 
                            preview: origRef.cleanContent.substring(0, 100) + '...', 
                            selected: true, sortKey: origRef.sortKey, 
                            originalIndex: oIdx, updatedIndex: null 
                        });
                    }
                });

                updatedRefs.forEach((val, idx) => {
                    if (!usedUpdateIdx.has(idx)) {
                        analysis.push({ 
                            label: val.label, id: val.id, 
                            status: addOrphans ? 'add' : 'orphan', 
                            preview: val.cleanContent.substring(0, 100) + '...', 
                            selected: addOrphans, sortKey: val.sortKey, 
                            originalIndex: null, updatedIndex: idx 
                        });
                    }
                });

                setScanResults(analysis); 
                setActiveTab('scan');
                setToast({ msg: "Analysis complete. Review matches.", type: "success" });
            } catch (e) { 
                setToast({ msg: "Analysis failed.", type: "error" }); 
            } finally { 
                setIsLoading(false); 
            }
        }, 200);
    };

    const executeMerge = async () => {
        setIsLoading(true);
        const origRefs = parseReferences(originalXml);
        const updatedRefs = parseReferences(updatedXml);
        
        // Start high-range IDs for updates to prevent conflicts
        const idMap = { bb: 3000, rf: 3000, se: 3000, ir: 3000, or: 3000, tr: 3000 };
        
        const finalBlocks: string[] = [];
        const sequence = scanResults.filter(r => r.selected);

        sequence.forEach(item => {
            let blockMarkup = '';
            let targetBibId = '';

            if (item.originalIndex !== null) {
                const orig = origRefs[item.originalIndex];
                targetBibId = orig.id;
                if (item.updatedIndex !== null) {
                    // It's an update - use new content but keep original bb ID
                    blockMarkup = updatedRefs[item.updatedIndex].fullTag;
                } else {
                    // Unchanged
                    blockMarkup = orig.fullTag;
                }
            } else if (item.updatedIndex !== null) {
                // Orphan/Add
                blockMarkup = updatedRefs[item.updatedIndex].fullTag;
                targetBibId = `bb${idMap.bb.toString().padStart(4, '0')}`;
                idMap.bb += 5;
            }

            if (blockMarkup) {
                // 1. Force the bib-reference ID to be the correct one (from original)
                blockMarkup = blockMarkup.replace(/<ce:bib-reference id="[^"]+"/, `<ce:bib-reference id="${targetBibId}"`);
                
                // 2. Renumber internal IDs if requested
                if (renumberInternal) {
                    blockMarkup = blockMarkup.replace(/(id=")(rf|se|ir|or|tr)(\d+)(")/g, (m, p1, prefix, val, p4) => {
                        const newId = `${prefix}${idMap[prefix as keyof typeof idMap].toString().padStart(4, '0')}`;
                        idMap[prefix as keyof typeof idMap] += 5;
                        return `${p1}${newId}${p4}`;
                    });
                }
                finalBlocks.push(blockMarkup);
            }
        });

        const result = finalBlocks.join('\n');
        setOutput(result);
        setActiveTab('result');
        setIsLoading(false);
        setToast({ msg: "Merge Protocol Complete.", type: "success" });
    };

    const buildDiff = () => {
        const diff = diffLines(originalXml, output);
        setDiffElements(
            <div className="p-4 font-mono text-xs whitespace-pre-wrap">
                {diff.map((part, i) => (
                    <span key={i} className={part.added ? 'bg-green-100 text-green-800' : part.removed ? 'bg-red-100 text-red-800 line-through' : ''}>
                        {part.value}
                    </span>
                ))}
            </div>
        );
        setActiveTab('diff');
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8 text-center uppercase tracking-widest">
                <h1 className="text-2xl font-black">Reference Reconciler v2</h1>
                <p className="text-xs text-slate-400 mt-2">Label-Priority Matching System</p>
            </div>
            
            <div className="flex justify-center mb-8 gap-8 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <Switch id="trust-ids" label="Trust XML IDs" subLabel="Risk of Overwrite" checked={trustIds} onChange={setTrustIds} color="amber" />
                <Switch id="internal-id" label="High-Range IDs" subLabel="3000+ Series" checked={renumberInternal} onChange={setRenumberInternal} color="blue" />
                <div className="flex gap-2">
                    <button onClick={runAnalysis} className="px-6 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors">1. Analyze</button>
                    <button onClick={executeMerge} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">2. Execute</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                <div className="flex flex-col gap-4">
                    <div className="flex-1 flex flex-col border rounded-xl overflow-hidden bg-white">
                        <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-500 border-b uppercase">Original XML</div>
                        <textarea className="flex-1 p-4 font-mono text-[11px] outline-none resize-none" value={originalXml} onChange={e => setOriginalXml(e.target.value)} />
                    </div>
                    <div className="flex-1 flex flex-col border rounded-xl overflow-hidden bg-white">
                        <div className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-500 border-b uppercase">Update Set</div>
                        <textarea className="flex-1 p-4 font-mono text-[11px] outline-none resize-none" value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} />
                    </div>
                </div>

                <div className="flex flex-col border rounded-xl overflow-hidden bg-white shadow-xl">
                    <div className="flex bg-slate-100 p-1 gap-1">
                        {['scan', 'result', 'diff'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded ${activeTab === tab ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{tab}</button>
                        ))}
                    </div>
                    <div className="flex-1 overflow-auto bg-white">
                        {activeTab === 'scan' && (
                            <table className="w-full text-left text-[11px]">
                                <thead className="bg-slate-50 border-b sticky top-0">
                                    <tr>
                                        <th className="p-3 w-8"></th>
                                        <th className="p-3">Reference</th>
                                        <th className="p-3">Match Logic</th>
                                        <th className="p-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scanResults.map((item, idx) => (
                                        <tr key={idx} className={`border-b hover:bg-slate-50 ${!item.selected ? 'opacity-40' : ''}`}>
                                            <td className="p-3"><input type="checkbox" checked={item.selected} onChange={() => setScanResults(prev => prev.map((it, i) => i === idx ? {...it, selected: !it.selected} : it))} /></td>
                                            <td className="p-3 font-bold">{item.label} <span className="text-[9px] text-slate-400 font-normal">({item.id})</span></td>
                                            <td className="p-3">
                                                {item.matchType && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">{item.matchType} Match</span>}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${item.status === 'update' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400'}`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {activeTab === 'result' && <textarea readOnly className="w-full h-full p-4 font-mono text-[11px] outline-none resize-none" value={output} />}
                        {activeTab === 'diff' && diffElements}
                    </div>
                </div>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;