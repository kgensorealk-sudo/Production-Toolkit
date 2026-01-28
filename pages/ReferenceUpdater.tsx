import React, { useState, useMemo, useRef } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefBlock {
    fullTag: string;
    id: string;
    label: string;
    content: string;
    isSynthetic?: boolean;
    cleanContent?: string;
    fingerprint: string; 
    sortKey: string;
}

interface ScanItem {
    label: string;
    id: string;
    status: 'update' | 'unchanged' | 'orphan' | 'smart_match' | 'add';
    preview: string;
    matchType?: 'Label' | 'Content';
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
    const [sortAlphabetically, setSortAlphabetically] = useState(true);
    const [convertAndToAmp, setConvertAndToAmp] = useState(false);
    const [activeTab, setActiveTab] = useState<'scan' | 'sequence' | 'result' | 'diff'>('scan');
    const [isLoading, setIsLoading] = useState(false);
    // Fix: Updated Toast type to include 'info' to resolve line 365 error
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [scanResults, setScanResults] = useState<ScanItem[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    // Drag and Drop State
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Fix: Added missing buildLines helper for generateDiff
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

    // Fix: Added missing generateDiff function to resolve line 319 error
    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;

        let i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';

            if (current.removed && diff[i+1]?.added) {
                type = 'replace';
                leftVal = current.value;
                rightVal = diff[i+1].value;
                i += 2;
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
            } else {
                leftVal = rightVal = current.value;
                i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

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
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : '';
                 const rNum = rContent !== undefined ? rightLineNum++ : '';
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

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
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-400"></span>Original Source</span>
                            </th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>Processed Output</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const formatLabel = (label: string) => {
        if (!label) return label;
        if (convertAndToAmp) {
            return label.replace(/\b(and)\b/gi, '&amp;');
        }
        return label;
    };

    const getSimilarity = (s1: string, s2: string): number => {
        if (!s1 || !s2) return 0;
        if (s1 === s2) return 1.0;
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
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
            const fullTag = match[0];
            const content = match[2];
            const idMatch = match[1].match(/id="([^"]+)"/);
            const id = idMatch ? idMatch[1] : '';

            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            let label = labelMatch ? labelMatch[1].trim() : '';
            let isSynthetic = false;

            const surnameMatch = content.match(/<(?:ce|sb):surname>(.*?)<\/(?:ce|sb):surname>/);
            const author = surnameMatch ? surnameMatch[1].toLowerCase().replace(/[^a-z]/g, '') : '';
            const dateMatch = content.match(/<(?:ce|sb):year>(.*?)<\/(?:ce|sb):year>/) || 
                             content.match(/<(?:ce|sb):date>(.*?)<\/(?:ce|sb):date>/);
            const year = dateMatch ? dateMatch[1].replace(/\D/g, '') : '';
            const titleMatch = content.match(/<(?:ce|sb):title>(.*?)<\/(?:ce|sb):title>/);
            const title = titleMatch ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';

            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            
            let fingerprint = '';
            if (author || year || title) {
                fingerprint = `meta|${author}|${year}|${title.substring(0, 50)}`;
            } else {
                fingerprint = `text|${cleanContent.replace(/[^a-z0-9]/g, '').substring(0, 150)}`;
            }

            if (!label && author && year) {
                label = `${author}, ${year}`;
                isSynthetic = true;
            }

            let sortKey = label;
            if (!sortKey) {
                sortKey = content.replace(/<[^>]+>/g, '').trim().substring(0, 60);
            }

            if (label || author || cleanContent.length > 5) {
                refs.push({ fullTag, id, label, content, isSynthetic, cleanContent, fingerprint, sortKey });
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
                    let matchType: 'Label' | 'Content' | undefined;
                    let matchScore = 0;

                    const labelIdx = updatedRefs.findIndex((u, idx) => !usedUpdateIdx.has(idx) && u.label === origRef.label && u.label !== '');
                    
                    if (!isNumberedMode && labelIdx !== -1) {
                        matchIdx = labelIdx;
                        matchType = 'Label';
                        matchScore = 100;
                    } else if (isNumberedMode) {
                        let bestFuzzyIdx = -1;
                        let bestFuzzyScore = 0;
                        updatedRefs.forEach((u, idx) => {
                            if (!usedUpdateIdx.has(idx)) {
                                const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                                if (score > bestFuzzyScore) { 
                                    bestFuzzyScore = score; 
                                    bestFuzzyIdx = idx; 
                                }
                            }
                        });
                        
                        if (bestFuzzyScore > 0.82) {
                            matchIdx = bestFuzzyIdx;
                            matchType = 'Content';
                            matchScore = Math.round(bestFuzzyScore * 100);
                        } else if (labelIdx !== -1) {
                            matchIdx = labelIdx;
                            matchType = 'Label';
                            matchScore = 100;
                        }
                    }

                    if (matchIdx !== -1) {
                        usedUpdateIdx.add(matchIdx);
                        analysis.push({ 
                            label: formatLabel(origRef.label), 
                            id: origRef.id, 
                            status: matchType === 'Content' ? 'smart_match' : 'update', 
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
                            id: 'N/A', 
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
                setToast({ msg: "Analysis complete. Review results in Scan Audit.", type: "success" });
            } catch (e) { setToast({ msg: "Analysis failed.", type: "error" }); } finally { setIsLoading(false); }
        }, 500);
    };

    const initiateUpdate = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste both Original and Updated XML.", type: "warn" }); return; }
        if (scanResults.length === 0) { runAnalysis(); return; }
        setIsLoading(true);
        setTimeout(() => {
            const origRefs = parseReferences(originalXml);
            const updatedRefs = parseReferences(updatedXml);
            executeMergeFromLog(origRefs, updatedRefs);
        }, 400);
    };

    const executeMergeFromLog = (origRefs: RefBlock[], updatedRefs: RefBlock[]) => {
        try {
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
            let stCounter = getNextId(originalXml, 'st', 3000);
            let irCounter = getNextId(originalXml, 'ir', 3000);
            let orCounter = getNextId(originalXml, 'or', 3000);
            let trCounter = getNextId(originalXml, 'tr', 3000);
            
            // Respect the sequence exactly as displayed in the Sequence tab
            const finalBlocks: RefBlock[] = [];
            const displaySequence = projectedSequence;

            displaySequence.forEach(item => {
                if (item.originalIndex !== null) {
                    const origRef = origRefs[item.originalIndex];
                    if (item.selected && item.updatedIndex !== null && (item.status === 'update' || item.status === 'smart_match')) {
                        let finalTag = updatedRefs[item.updatedIndex].fullTag;
                        let idToUse = origRef.id;
                        
                        const finalLabel = formatLabel(updatedRefs[item.updatedIndex].label);
                        finalTag = finalTag.replace(/<ce:label>.*?<\/ce:label>/, `<ce:label>${finalLabel}</ce:label>`);

                        if (preserveIds) {
                            if (idToUse.startsWith('bib')) { idToUse = `bb${bbStart}`; bbStart += 5; }
                            finalTag = finalTag.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);
                        }
                        if (renumberInternal) {
                            finalTag = finalTag.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                                let prefix = p1.includes('ce:source-text') ? 'st' : p1.includes('inter-ref') ? 'ir' : p1.includes('ce:other-ref') ? 'or' : p1.includes('ce:textref') ? 'tr' : 'rf';
                                let counter = prefix === 'st' ? stCounter : prefix === 'ir' ? irCounter : prefix === 'or' ? orCounter : prefix === 'tr' ? trCounter : rfCounter;
                                const res = `${p1}id="${prefix}${counter}"${p2}`;
                                if (prefix === 'st') stCounter += 5; else if (prefix === 'ir') irCounter += 5; else if (prefix === 'or') orCounter += 5; else if (prefix === 'tr') trCounter += 5; else rfCounter += 5;
                                return res;
                            });
                        }
                        finalBlocks.push({ ...updatedRefs[item.updatedIndex], fullTag: finalTag, id: idToUse });
                    } else {
                        const origLabel = formatLabel(origRef.label);
                        const finalTag = origRef.fullTag.replace(/<ce:label>.*?<\/ce:label>/, `<ce:label>${origLabel}</ce:label>`);
                        finalBlocks.push({ ...origRef, fullTag: finalTag });
                    }
                } 
                else if (item.updatedIndex !== null && item.selected && (item.status === 'add' || item.status === 'orphan')) {
                    const u = updatedRefs[item.updatedIndex];
                    let finalTag = u.fullTag;
                    const finalLabel = formatLabel(u.label);
                    finalTag = finalTag.replace(/<ce:label>.*?<\/ce:label>/, `<ce:label>${finalLabel}</ce:label>`);
                    const idToUse = `bb${bbStart}`;
                    bbStart += 5;
                    finalTag = finalTag.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);
                    if (renumberInternal) {
                        finalTag = finalTag.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                            let prefix = p1.includes('ce:source-text') ? 'st' : p1.includes('inter-ref') ? 'ir' : p1.includes('ce:other-ref') ? 'or' : p1.includes('ce:textref') ? 'tr' : 'rf';
                            let counter = prefix === 'st' ? stCounter : prefix === 'ir' ? irCounter : prefix === 'or' ? orCounter : prefix === 'tr' ? trCounter : rfCounter;
                            const res = `${p1}id="${prefix}${counter}"${p2}`;
                            if (prefix === 'st') stCounter += 5; else if (prefix === 'ir') irCounter += 5; else if (prefix === 'or') orCounter += 5; else if (prefix === 'tr') trCounter += 5; else rfCounter += 5;
                            return res;
                        });
                    }
                    finalBlocks.push({ ...u, fullTag: finalTag, id: idToUse });
                }
            });

            const joinedResult = finalBlocks.map(b => b.fullTag).join('\n');
            setOutput(joinedResult);
            // Fix: generateDiff call now points to the defined function to resolve line 319 error
            generateDiff(originalXml, joinedResult);
            setActiveTab('result');
            setToast({ msg: "Merge complete. Review output XML.", type: "success" });
        } catch (e) { setToast({ msg: "Merge failed.", type: "error" }); } finally { setIsLoading(false); }
    };

    const toggleItem = (idx: number) => {
        setScanResults(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
    };

    const bulkSelect = (selected: boolean) => {
        setScanResults(prev => prev.map(item => ({ ...item, selected })));
    };

    const projectedSequence = useMemo(() => {
        if (scanResults.length === 0) return [];
        
        let list = [...scanResults].filter(r => r.selected);
        
        // Only apply automatic sort if toggle is ON
        if (sortAlphabetically) {
            const hasAuthorLabels = list.some(b => b.label && /[a-zA-Z]/.test(b.label));
            const isNameDate = !isNumberedMode || hasAuthorLabels;
            if (isNameDate) {
                const cleanForSort = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();
                list.sort((a, b) => cleanForSort(a.sortKey).localeCompare(cleanForSort(b.sortKey), undefined, { sensitivity: 'base', numeric: true }));
            }
        }
        
        return list;
    }, [scanResults, isNumberedMode, sortAlphabetically]);

    const handleDragStart = (idx: number) => {
        setDraggedItemIndex(idx);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (dropIndex: number) => {
        if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

        // Turn off auto-sort if user manually reorders
        if (sortAlphabetically) {
            setSortAlphabetically(false);
            setToast({ msg: "Auto-Sort disabled. Manual sequence active.", type: "info" });
        }

        const newList = [...scanResults];
        // We need to find the actual items in scanResults that correspond to the visual indices
        const visibleItems = scanResults.filter(r => r.selected);
        const itemToMove = visibleItems[draggedItemIndex];
        
        // Remove item from scanResults
        const originalScanIdx = scanResults.findIndex(r => r === itemToMove);
        newList.splice(originalScanIdx, 1);
        
        // Find drop target in the full scanResults
        const dropTargetItem = visibleItems[dropIndex];
        const finalDropIdx = newList.findIndex(r => r === dropTargetItem);
        
        newList.splice(finalDropIdx, 0, itemToMove);
        
        setScanResults(newList);
        setDraggedItemIndex(null);
    };

    useKeyboardShortcuts({
        onPrimary: initiateUpdate,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({ msg: "Copied!", type: "success" }); } },
        onClear: () => { setOriginalXml(''); setUpdatedXml(''); setOutput(''); setScanResults([]); }
    }, [originalXml, updatedXml, output, scanResults]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase">Reference Updater</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Smart-merge corrections. Drag and drop in Sequence tab to manually rearrange.</p>
            </div>

            <div className="flex justify-center mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={isNumberedMode} onChange={(e) => setIsNumberedMode(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${isNumberedMode ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isNumberedMode ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Numbered Style</span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Fingerprinting ON</span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={sortAlphabetically} onChange={(e) => setSortAlphabetically(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${sortAlphabetically ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${sortAlphabetically ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Auto-Sort</span>
                            <span className={`text-[10px] font-black uppercase tracking-tighter ${sortAlphabetically ? 'text-indigo-500' : 'text-amber-500'}`}>
                                {sortAlphabetically ? 'Alphabetical' : 'Manual / Original'}
                            </span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={addOrphans} onChange={(e) => setAddOrphans(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${addOrphans ? 'bg-emerald-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${addOrphans ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Add Orphans</span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Interleave Mode</span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={convertAndToAmp} onChange={(e) => setConvertAndToAmp(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${convertAndToAmp ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${convertAndToAmp ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Ampersand</span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">and to &amp;amp;</span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={preserveIds} onChange={(e) => setPreserveIds(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${preserveIds ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${preserveIds ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Preserve IDs</span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Maintain Linking</span>
                        </div>
                    </label>

                    <button onClick={runAnalysis} className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-lg border border-slate-200 transition-colors">Analyze</button>
                    <button onClick={initiateUpdate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg active:scale-95 transition-all">Merge Updates</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[700px]">
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs uppercase">Original XML Source</label>
                            {originalXml && <button onClick={() => setOriginalXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea value={originalXml} onChange={e => setOriginalXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste full article reference list..." spellCheck={false} />
                    </div>
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs uppercase">Updated Corrections</label>
                            {updatedXml && <button onClick={() => setUpdatedXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste corrections or new items..." spellCheck={false} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative h-full">
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                        {[
                            { id: 'scan', label: 'Scan Audit' },
                            { id: 'sequence', label: 'Order Preview' },
                            { id: 'result', label: 'Merged XML' },
                            { id: 'diff', label: 'Diff View' }
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === tab.id ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-500 border-transparent hover:bg-slate-50'}`}>
                                {tab.label}
                                {tab.id === 'scan' && scanResults.length > 0 && <span className="ml-2 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{scanResults.length}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                        {isLoading && <LoadingOverlay message="Processing..." color="indigo" />}
                        
                        {activeTab === 'scan' && (
                            <div className="h-full overflow-hidden flex flex-col bg-white">
                                <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Matching Decisions</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => bulkSelect(true)} className="text-[10px] font-bold text-indigo-600 hover:underline uppercase">All</button>
                                        <span className="text-slate-300">|</span>
                                        <button onClick={() => bulkSelect(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:underline uppercase">None</button>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                                            <tr>
                                                <th className="p-3 font-bold text-slate-500 uppercase w-8"></th>
                                                <th className="p-3 font-bold text-slate-500 uppercase w-32">Target</th>
                                                <th className="p-3 font-bold text-slate-500 uppercase w-24">Action</th>
                                                <th className="p-3 font-bold text-slate-500 uppercase">Logic & Preview</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scanResults.length === 0 ? (
                                                <tr><td colSpan={4} className="p-20 text-center text-slate-400 italic">No analysis data. Click "Analyze" to begin.</td></tr>
                                            ) : (
                                                scanResults.map((item, idx) => (
                                                    <tr key={idx} className={`transition-colors hover:bg-slate-50 ${!item.selected ? 'opacity-40' : ''}`}>
                                                        <td className="p-3 text-center">
                                                            <input type="checkbox" checked={item.selected} onChange={() => toggleItem(idx)} className="rounded border-slate-300 text-indigo-600 h-4 w-4 cursor-pointer" />
                                                        </td>
                                                        <td className="p-3 font-mono">
                                                            <div className="font-bold text-slate-700 truncate max-w-[140px]">{formatLabel(item.label)}</div>
                                                            <div className="text-[9px] text-slate-400 tracking-tighter uppercase">{item.id}</div>
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border block text-center ${
                                                                item.status === 'update' || item.status === 'smart_match' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                                                                item.status === 'add' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                                item.status === 'orphan' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                                                            }`}>{item.status.replace('_', ' ')}</span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="text-slate-500 italic mb-1 line-clamp-1">{item.preview}</div>
                                                            {item.selected && item.matchType && <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter bg-slate-50 px-1 rounded">{item.matchType} MATCH ({item.matchScore}%)</span>}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'sequence' && (
                            <div className="h-full overflow-hidden flex flex-col bg-white">
                                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                    <div>
                                        <div className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">Output Sequence Preview</div>
                                        <div className="text-[10px] text-slate-400 mt-1 font-medium">Drag items to rearrange. Orphans are {sortAlphabetically ? 'sorted' : 'appended to end'}.</div>
                                    </div>
                                    <div className="bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                        <span className="text-[10px] font-black text-indigo-600 uppercase">{projectedSequence.length} Active Items</span>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar p-6 space-y-2.5">
                                    {projectedSequence.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center opacity-30 grayscale"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 6h16M4 12h16M4 18h16" /></svg><p className="text-sm font-bold uppercase tracking-widest">No Selected Outputs</p></div>
                                    ) : (
                                        projectedSequence.map((ref, idx) => (
                                            <div 
                                                key={`${ref.id}-${idx}`}
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragOver={handleDragOver}
                                                onDrop={() => handleDrop(idx)}
                                                className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-all group cursor-grab active:cursor-grabbing ${draggedItemIndex === idx ? 'opacity-40 grayscale scale-95 border-dashed border-indigo-400 bg-indigo-50/20' : ''}`}
                                            >
                                                <div className="flex flex-col items-center gap-1 shrink-0">
                                                    <div className="text-slate-300 group-hover:text-indigo-300">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 8h16M4 16h16" /></svg>
                                                    </div>
                                                    <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-400 transition-colors border border-slate-100">
                                                        {idx + 1}
                                                    </div>
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    <div className="text-sm font-bold text-slate-800 truncate">{ref.label}</div>
                                                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">ID: {ref.id}</div>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${
                                                        ref.status === 'add' || ref.status === 'orphan' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        ref.status === 'update' || ref.status === 'smart_match' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                        'bg-slate-50 text-slate-400 border-slate-200'
                                                    }`}>
                                                        {ref.status === 'add' || ref.status === 'orphan' ? 'NEW' : ref.status === 'update' || ref.status === 'smart_match' ? 'UPD' : 'ORIG'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'result' && <textarea value={output} readOnly className="w-full h-full p-6 text-xs font-mono bg-transparent border-0 focus:ring-0 resize-none leading-relaxed" placeholder="Final merged XML will appear here..." />}
                        {activeTab === 'diff' && <div className="absolute inset-0 overflow-auto bg-white p-2 custom-scrollbar">{diffElements || <div className="h-full flex items-center justify-center text-slate-400">Run merge to generate diff.</div>}</div>}
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;
