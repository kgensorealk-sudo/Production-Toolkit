import React, { useState, useMemo, useRef } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefBlock {
    fullTag: string;
    id: string;
    label: string;
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
    matchType?: 'ID' | 'Label' | 'Content' | 'Fuzzy';
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
    const [isNumberedMode, setIsNumberedMode] = useState(false);
    const [sortAlphabetically, setSortAlphabetically] = useState(false);
    const [convertAndToAmp, setConvertAndToAmp] = useState(false);
    const [activeTab, setActiveTab] = useState<'scan' | 'sequence' | 'result' | 'diff'>('scan');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [scanResults, setScanResults] = useState<ScanItem[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

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

    /**
     * Optimized Async Diff Generator
     * Diffing large XML strings (160+ references) is very heavy.
     * We wrap it in a microtask delay so the UI can update first.
     */
    const generateDiffAsync = async (original: string, modified: string) => {
        return new Promise<void>((resolve) => {
            setTimeout(() => {
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
                                    <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">Original Source</th>
                                    <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">Processed Output</th>
                                </tr>
                            </thead>
                            <tbody>{rows}</tbody>
                        </table>
                    </div>
                );
                resolve();
            }, 50);
        });
    };

    const formatLabel = (label: string) => {
        if (!label) return label;
        return convertAndToAmp ? label.replace(/\b(and)\b/gi, '&amp;') : label;
    };

    const getSimilarity = (s1: string, s2: string): number => {
        if (!s1 || !s2) return 0;
        if (s1 === s2) return 1.0;
        const longer = s1.length > s2.length ? s1 : s2, shorter = s1.length > s2.length ? s2 : s1;
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
            const content = match[2], idMatch = match[1].match(/id="([^"]+)"/), id = idMatch ? idMatch[1] : '';
            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            let label = labelMatch ? labelMatch[1].trim() : '', isSynthetic = false;
            
            const surnameMatch = content.match(/<(?:ce|sb):surname>(.*?)<\/(?:ce|sb):surname>/i);
            const author = surnameMatch ? surnameMatch[1].toLowerCase().replace(/[^a-z]/g, '') : '';
            
            const dateMatch = content.match(/<(?:ce|sb):year>(.*?)<\/(?:ce|sb):year>/i) || content.match(/<(?:ce|sb):date>(.*?)<\/(?:ce|sb):date>/i);
            const year = dateMatch ? dateMatch[1].replace(/\D/g, '') : '';
            
            const titleMatch = content.match(/<(?:ce|sb):title>(.*?)<\/(?:ce|sb):title>/i);
            const title = titleMatch ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            
            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            const contentHash = cleanContent.replace(/[^a-z0-9]/g, '');
            
            let fingerprint = author || year || title 
                ? `meta|${author}|${year}|${title.substring(0, 100)}` 
                : `text|${contentHash.substring(0, 150)}`;
            
            if (!label && author && year) { label = `${author}, ${year}`; isSynthetic = true; }
            let sortKey = label || content.replace(/<[^>]+>/g, '').trim().substring(0, 60);
            
            if (label || author || cleanContent.length > 5) {
                refs.push({ fullTag: match[0], id, label, content, isSynthetic, cleanContent, fingerprint, contentHash, sortKey });
            }
        }
        return refs;
    };

    const runAnalysis = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste both Original and Updated XML.", type: "warn" }); return; }
        setIsLoading(true);
        
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                const analysis: ScanItem[] = [];
                const usedUpdateIdx = new Set<number>();
                
                origRefs.forEach((origRef, oIdx) => {
                    let matchIdx = -1;
                    let matchType: 'ID' | 'Label' | 'Content' | 'Fuzzy' | undefined;
                    let matchScore = 0;

                    if (origRef.id) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.id === origRef.id && u.id !== '');
                        if (matchIdx !== -1) { matchType = 'ID'; matchScore = 100; }
                    }

                    if (matchIdx === -1) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.contentHash === origRef.contentHash);
                        if (matchIdx !== -1) { matchType = 'Content'; matchScore = 100; }
                    }

                    if (matchIdx === -1 && origRef.label) {
                        matchIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.label === origRef.label && u.label !== '');
                        if (matchIdx !== -1) { matchType = 'Label'; matchScore = 100; }
                    }

                    if (matchIdx === -1) {
                        let bestFuzzyIdx = -1;
                        let bestFuzzyScore = 0;
                        updatedRefs.forEach((u, idx) => {
                            if (!usedUpdateIdx.has(idx)) {
                                const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                                if (score > bestFuzzyScore) { bestFuzzyScore = score; bestFuzzyIdx = idx; }
                            }
                        });
                        if (bestFuzzyScore > 0.82) { 
                            matchIdx = bestFuzzyIdx; 
                            matchType = 'Fuzzy'; 
                            matchScore = Math.round(bestFuzzyScore * 100); 
                        }
                    }

                    if (matchIdx !== -1) {
                        usedUpdateIdx.add(matchIdx);
                        analysis.push({ 
                            label: formatLabel(origRef.label || updatedRefs[matchIdx].label), 
                            id: origRef.id, 
                            status: matchType === 'Fuzzy' ? 'smart_match' : 'update', 
                            matchType, 
                            matchScore, 
                            preview: updatedRefs[matchIdx].content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', 
                            isSynthetic: origRef.isSynthetic, 
                            selected: true, 
                            sortKey: updatedRefs[matchIdx].sortKey, 
                            originalIndex: oIdx, 
                            updatedIndex: matchIdx 
                        });
                    } else {
                        analysis.push({ 
                            label: formatLabel(origRef.label), 
                            id: origRef.id, 
                            status: 'unchanged', 
                            preview: origRef.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', 
                            isSynthetic: origRef.isSynthetic, 
                            selected: true, 
                            sortKey: origRef.sortKey, 
                            originalIndex: oIdx, 
                            updatedIndex: null 
                        });
                    }
                });

                updatedRefs.forEach((val, idx) => {
                    if (!usedUpdateIdx.has(idx)) {
                        analysis.push({ 
                            label: formatLabel(val.label || 'Unlabeled'), 
                            id: val.id || 'N/A', 
                            status: addOrphans ? 'add' : 'orphan', 
                            preview: val.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', 
                            isSynthetic: val.isSynthetic, 
                            selected: addOrphans, 
                            sortKey: val.sortKey, 
                            originalIndex: null, 
                            updatedIndex: idx 
                        });
                    }
                });

                setScanResults(analysis); 
                setActiveTab('scan'); 
                setToast({ msg: `Found ${analysis.filter(a => a.updatedIndex !== null).length} matches across set.`, type: "success" });
            } catch (e) { 
                setToast({ msg: "Analysis failed.", type: "error" }); 
            } finally { 
                setIsLoading(false); 
            }
        }, 300);
    };

    const initiateUpdate = async () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste XML.", type: "warn" }); return; }
        if (scanResults.length === 0) { runAnalysis(); return; }
        setIsLoading(true);
        // Start async merge process
        await executeMergeAsync(parseReferences(originalXml), parseReferences(updatedXml));
    };

    /**
     * ASYNCHRONOUS CHUNKED MERGE
     * Processes references in batches to keep UI responsive.
     */
    const executeMergeAsync = async (origRefs: RefBlock[], updatedRefs: RefBlock[]) => {
        try {
            // 1. Efficient ID Pre-scanning
            const getNextIdMap = (xml: string) => {
                const prefixes = ['bb', 'rf', 'se', 'ir', 'or', 'tr'];
                const map: Record<string, number> = { bb: 3000, rf: 3000, se: 3000, ir: 3000, or: 3000, tr: 3000 };
                
                prefixes.forEach(prefix => {
                    const regex = new RegExp(`id="${prefix}(\\d+)"`, 'g');
                    let m;
                    while ((m = regex.exec(xml)) !== null) {
                        const val = parseInt(m[1]);
                        if (val >= map[prefix]) map[prefix] = Math.ceil((val + 5) / 5) * 5;
                    }
                });
                return map;
            };

            const idCounters = getNextIdMap(originalXml);
            const finalBlocks: string[] = [];
            const sequence = projectedSequence;
            
            // 2. Batch Processing (Chunked)
            const CHUNK_SIZE = 20;
            for (let i = 0; i < sequence.length; i += CHUNK_SIZE) {
                const chunk = sequence.slice(i, i + CHUNK_SIZE);
                
                chunk.forEach(item => {
                    let blockMarkup = '';
                    let targetId = '';

                    if (item.originalIndex !== null) {
                        const origRef = origRefs[item.originalIndex];
                        if (item.selected && item.updatedIndex !== null && (item.status === 'update' || item.status === 'smart_match')) {
                            blockMarkup = updatedRefs[item.updatedIndex].fullTag;
                            targetId = origRef.id;
                        } else {
                            blockMarkup = origRef.fullTag;
                            targetId = origRef.id;
                        }
                    } else if (item.updatedIndex !== null && item.selected) {
                        const orphan = updatedRefs[item.updatedIndex];
                        blockMarkup = orphan.fullTag;
                        targetId = `bb${idCounters.bb}`;
                        idCounters.bb += 5;
                    }

                    if (blockMarkup) {
                        if (preserveIds) {
                            blockMarkup = blockMarkup.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${targetId}"`);
                        }

                        if (renumberInternal) {
                            blockMarkup = blockMarkup.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                                let prefix = p1.includes('ce:source-text') ? 'se' : p1.includes('inter-ref') ? 'ir' : p1.includes('ce:other-ref') ? 'or' : p1.includes('ce:textref') ? 'tr' : 'rf';
                                let currentVal = idCounters[prefix];
                                idCounters[prefix] += 5;
                                return `${p1}id="${prefix}${currentVal.toString().padStart(4, '0')}"${p2}`;
                            });
                        }

                        const labelMatch = blockMarkup.match(/<ce:label>(.*?)<\/ce:label>/);
                        if (labelMatch) {
                            blockMarkup = blockMarkup.replace(/<ce:label>.*?<\/ce:label>/, `<ce:label>${formatLabel(labelMatch[1])}</ce:label>`);
                        }

                        finalBlocks.push(blockMarkup);
                    }
                });

                // Yield control to main thread every chunk
                await new Promise(r => setTimeout(r, 0));
            }

            const joinedResult = finalBlocks.join('\n');
            setOutput(joinedResult);
            setActiveTab('result');
            setToast({ msg: `Merged ${finalBlocks.length} items. Calculating diff in background...`, type: "info" });
            
            // 3. Deferred heavy diff calculation
            await generateDiffAsync(originalXml, joinedResult);
            
            setToast({ msg: "Protocol executed. Sequence and Diff synchronized.", type: "success" });
        } catch (e) { 
            setToast({ msg: "Merge Protocol Failure.", type: "error" }); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const bulkSelect = (selected: boolean) => setScanResults(prev => prev.map(item => ({ ...item, selected })));

    const projectedSequence = useMemo(() => {
        if (scanResults.length === 0) return [];
        let selectedList = scanResults.filter(r => r.selected);
        const cleanForSort = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();

        if (sortAlphabetically) {
            return [...selectedList].sort((a, b) => 
                cleanForSort(a.sortKey).localeCompare(cleanForSort(b.sortKey), undefined, { sensitivity: 'base', numeric: true })
            );
        } else {
            const existingItems = selectedList
                .filter(r => r.originalIndex !== null)
                .sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
            
            const orphans = selectedList
                .filter(r => r.originalIndex === null)
                .sort((a, b) => 
                    cleanForSort(a.sortKey).localeCompare(cleanForSort(b.sortKey), undefined, { sensitivity: 'base', numeric: true })
                );
            
            const result = [...existingItems];
            orphans.forEach(orphan => {
                const orphanKey = cleanForSort(orphan.sortKey);
                const insertIdx = result.findIndex(existing => 
                    cleanForSort(existing.sortKey).localeCompare(orphanKey, undefined, { sensitivity: 'base', numeric: true }) > 0
                );
                if (insertIdx === -1) result.push(orphan);
                else result.splice(insertIdx, 0, orphan);
            });
            return result;
        }
    }, [scanResults, sortAlphabetically]);

    const handleDrop = (dropIndex: number) => {
        if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
        const visibleItems = projectedSequence;
        const itemToMove = visibleItems[draggedItemIndex];
        const absoluteIdxMove = scanResults.findIndex(r => r === itemToMove);
        const absoluteIdxTarget = scanResults.findIndex(r => r === visibleItems[dropIndex]);
        const newList = [...scanResults];
        newList.splice(absoluteIdxMove, 1);
        newList.splice(absoluteIdxTarget, 0, itemToMove);
        setScanResults(newList.map((item, idx) => ({ ...item, originalIndex: idx })));
        setDraggedItemIndex(null);
        setSortAlphabetically(false);
        setToast({ msg: "Manual Sequence Overwrite Recorded.", type: "info" });
    };

    useKeyboardShortcuts({
        onPrimary: initiateUpdate,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({ msg: "Copied!", type: "success" }); } },
        onClear: () => { setOriginalXml(''); setUpdatedXml(''); setOutput(''); setScanResults([]); }
    }, [originalXml, updatedXml, output, scanResults]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in"><h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase">Reference Updater</h1><p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic leading-relaxed">High-performance bulk merging. Yields thread control to handle massive sets without browser lock-up.</p></div>
            
            <div className="flex justify-center mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-12">
                    <Switch id="toggle-strict" label="Strict Mode" subLabel={isNumberedMode ? "Exact Matching" : "Fuzzy Matching"} checked={isNumberedMode} onChange={setIsNumberedMode} color="blue" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <Switch id="toggle-orphans" label="Auto-Add" subLabel="New Items" checked={addOrphans} onChange={setAddOrphans} color="emerald" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <div className="flex gap-3">
                        <button onClick={runAnalysis} className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-6 rounded-xl border border-slate-200 transition-all active:scale-95 shadow-sm">Analyze Set</button>
                        <button onClick={initiateUpdate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-8 rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all uppercase text-xs tracking-widest">Execute Merge</button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[700px]">
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all"><div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center"><label className="font-bold text-slate-700 text-[10px] uppercase tracking-widest">Original XML Source</label></div><textarea value={originalXml} onChange={e => setOriginalXml(e.target.value)} className="w-full h-full p-6 text-[13px] font-mono text-slate-700 border-0 focus:ring-0 resize-none bg-transparent" placeholder="Paste full article reference list..." spellCheck={false} /></div>
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all"><div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center"><label className="font-bold text-slate-700 text-[10px] uppercase tracking-widest">Updated Corrections Set</label></div><textarea value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} className="w-full h-full p-6 text-[13px] font-mono text-slate-700 border-0 focus:ring-0 resize-none bg-transparent" placeholder="Paste corrections or new items..." spellCheck={false} /></div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative h-full">
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">{[{ id: 'scan', label: 'Match Matrix' }, { id: 'sequence', label: 'Output Queue' }, { id: 'result', label: 'Merged Stream' }, { id: 'diff', label: 'Audit Log' }].map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === tab.id ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:bg-slate-50'}`}>{tab.label}</button>))}</div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                        {isLoading && <LoadingOverlay message="Executing Protocol Batch..." color="indigo" />}
                        
                        {activeTab === 'scan' && (
                            <div className="h-full overflow-hidden flex flex-col bg-white">
                                <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">System Reconciler</span><div className="flex gap-2"><button onClick={() => bulkSelect(true)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Select All</button><span className="text-slate-300">|</span><button onClick={() => bulkSelect(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">None</button></div></div>
                                <div className="flex-grow overflow-auto custom-scrollbar">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10"><tr><th className="p-4 font-bold text-slate-400 uppercase w-8"></th><th className="p-4 font-bold text-slate-500 uppercase w-32 tracking-wider">Node ID</th><th className="p-4 font-bold text-slate-500 uppercase w-24 tracking-wider">Status</th><th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Logic Preview</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scanResults.length === 0 ? (<tr><td colSpan={4} className="p-20 text-center text-slate-300 uppercase tracking-[0.2em] font-black italic">Awaiting Set Scan...</td></tr>) : (scanResults.map((item, idx) => (<tr key={idx} className={`transition-colors hover:bg-slate-50/50 ${!item.selected ? 'opacity-30 grayscale' : ''}`}><td className="p-4 text-center"><input type="checkbox" checked={item.selected} onChange={() => setScanResults(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))} className="rounded border-slate-300 text-indigo-600 h-4 w-4" /></td><td className="p-4 font-mono"><div className="font-bold text-slate-800 truncate max-w-[140px]">{item.label}</div><div className="text-[9px] text-slate-400 uppercase tracking-tighter">ID: {item.id}</div></td><td className="p-4"><div className="flex flex-col gap-1"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border block text-center ${item.status === 'update' || item.status === 'smart_match' ? 'bg-amber-50 text-amber-600 border-amber-200' : item.status === 'add' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : item.status === 'orphan' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{item.status.replace('_', ' ')}</span>{item.matchType && <span className="text-[8px] text-slate-300 text-center font-bold uppercase tracking-widest">{item.matchType} ({item.matchScore}%)</span>}</div></td><td className="p-4"><div className="text-slate-500 leading-relaxed font-serif italic line-clamp-1">{item.preview}</div></td></tr>)))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'sequence' && (
                            <div className="h-full overflow-hidden flex flex-col bg-white animate-fade-in">
                                <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center"><div className="flex flex-col"><div className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">Output Queue Preview</div><div className="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-wider">Drag nodes to override system sorting logic</div></div><span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">{projectedSequence.length} Nodes Queued</span></div>
                                <div className="flex-grow overflow-auto custom-scrollbar p-8 space-y-3 bg-slate-50/30">
                                    {projectedSequence.length === 0 ? (<div className="h-full flex flex-col items-center justify-center opacity-30 grayscale"><p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Queue Ready for Input</p></div>) : (projectedSequence.map((ref, idx) => (
                                        <div key={`${ref.id}-${idx}`} draggable onDragStart={() => setDraggedItemIndex(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(idx)} className={`flex items-center gap-6 p-5 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm hover:border-indigo-400 transition-all group cursor-grab active:cursor-grabbing ${draggedItemIndex === idx ? 'opacity-40 scale-95' : ''}`}>
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors border border-slate-100 shadow-inner">{idx + 1}</div>
                                            <div className="flex-grow min-w-0"><div className="text-sm font-bold text-slate-800 truncate tracking-tight">{ref.label}</div><div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">TARGET_ID: {ref.id}</div></div>
                                            <span className={`text-[8px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-[0.15em] ${(ref.status === 'add' || ref.status === 'orphan') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : (ref.status === 'update' || ref.status === 'smart_match') ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{ref.status === 'add' ? 'NEW' : ref.status === 'smart_match' ? 'SMART' : 'PINNED'}</span>
                                        </div>
                                    )))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'result' && (
                             <div className="h-full relative flex flex-col"><textarea value={output} readOnly className="w-full h-full p-8 text-[11px] font-mono text-slate-700 bg-white border-0 focus:ring-0 resize-none leading-loose custom-scrollbar" placeholder="Merged XML stream will be emitted here..." /></div>
                        )}

                        {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-auto bg-white custom-scrollbar">{diffElements || <div className="h-full flex items-center justify-center text-slate-400 uppercase tracking-widest text-[10px] font-black">Differential Audit Pending...</div>}</div>
                        )}
                    </div>
                </div>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;