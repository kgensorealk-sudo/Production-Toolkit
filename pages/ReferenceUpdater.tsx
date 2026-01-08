import React, { useState } from 'react';
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
}

interface ScanItem {
    label: string;
    id: string;
    status: 'update' | 'unchanged' | 'orphan' | 'smart_match' | 'add';
    preview: string;
    matchType?: 'Label' | 'Content';
    matchScore?: number;
    isSynthetic?: boolean;
}

interface ConflictGroup {
    label: string;
    updateRef: RefBlock;
    candidates: {
        index: number;
        ref: RefBlock;
        score: number;
    }[];
}

const ReferenceUpdater: React.FC = () => {
    const [originalXml, setOriginalXml] = useState('');
    const [updatedXml, setUpdatedXml] = useState('');
    const [output, setOutput] = useState('');
    const [preserveIds, setPreserveIds] = useState(true);
    const [renumberInternal, setRenumberInternal] = useState(true);
    const [addOrphans, setAddOrphans] = useState(false);
    const [isNumberedMode, setIsNumberedMode] = useState(false);
    const [activeTab, setActiveTab] = useState<'report' | 'result' | 'diff'>('result');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [stats, setStats] = useState({ total: 0, updated: 0, unchanged: 0, skipped: 0, added: 0 });
    const [scanResults, setScanResults] = useState<ScanItem[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    const [showConflictModal, setShowConflictModal] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
    const [resolutions, setResolutions] = useState<Map<number, 'update' | 'ignore'>>(new Map());

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
            
            // Smart Fingerprinting
            let fingerprint = '';
            if (author || year || title) {
                // Structured Reference Logic
                fingerprint = `meta|${author}|${year}|${title.substring(0, 50)}`;
            } else {
                // Unstructured (ce:other-ref) Logic: Use normalized text content
                fingerprint = `text|${cleanContent.replace(/[^a-z0-9]/g, '').substring(0, 150)}`;
            }

            if (!label && author && year) {
                label = `${author}, ${year}`;
                isSynthetic = true;
            }

            if (label || author || cleanContent.length > 5) {
                refs.push({ fullTag, id, label, content, isSynthetic, cleanContent, fingerprint });
            }
        }
        return refs;
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
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white m-2 shadow-sm">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-10 bg-slate-50" /><col className="w-[calc(50%-2.5rem)]" /><col className="w-10 bg-slate-50 border-l" /><col className="w-[calc(50%-2.5rem)]" /></colgroup>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const runAnalysis = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste both Original and Updated XML.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                const analysis: ScanItem[] = [];
                let updateCount = 0, unchangedCount = 0, orphanCount = 0;
                const usedUpdateIdx = new Set<number>();

                origRefs.forEach(origRef => {
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
                        
                        if (bestFuzzyScore > 0.82) { // 82% threshold for high-accuracy smart match
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
                        updateCount++; usedUpdateIdx.add(matchIdx);
                        analysis.push({ label: origRef.label, id: origRef.id, status: matchType === 'Content' ? 'smart_match' : 'update', matchType, matchScore, preview: updatedRefs[matchIdx].content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', isSynthetic: origRef.isSynthetic });
                    } else {
                        unchangedCount++;
                        analysis.push({ label: origRef.label, id: origRef.id, status: 'unchanged', preview: origRef.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', isSynthetic: origRef.isSynthetic });
                    }
                });

                updatedRefs.forEach((val, idx) => {
                    if (!usedUpdateIdx.has(idx)) {
                        orphanCount++;
                        analysis.push({ label: val.label || 'Unlabeled', id: 'N/A', status: addOrphans ? 'add' : 'orphan', preview: val.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', isSynthetic: val.isSynthetic });
                    }
                });

                setScanResults(analysis);
                setStats({ total: origRefs.length, updated: updateCount, unchanged: unchangedCount, skipped: !addOrphans ? orphanCount : 0, added: addOrphans ? orphanCount : 0 });
                setActiveTab('report');
                setToast({ msg: "Analysis complete.", type: "success" });
            } catch (e) { setToast({ msg: "Analysis failed.", type: "error" }); } finally { setIsLoading(false); }
        }, 500);
    };

    const initiateUpdate = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste both Original and Updated XML.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            const origRefs = parseReferences(originalXml);
            const updatedRefs = parseReferences(updatedXml);
            
            // Conflict Detection only runs in Label mode (OFF)
            if (!isNumberedMode) {
                const origLabelMap = new Map<string, number[]>();
                origRefs.forEach((ref, idx) => { const indices = origLabelMap.get(ref.label) || []; indices.push(idx); origLabelMap.set(ref.label, indices); });
                const newConflicts: ConflictGroup[] = [];
                updatedRefs.forEach(updateRef => {
                    const indices = origLabelMap.get(updateRef.label);
                    if (indices && indices.length > 1) {
                        newConflicts.push({ label: updateRef.label, updateRef: updateRef, candidates: indices.map(idx => ({ index: idx, ref: origRefs[idx], score: 100 })) });
                    }
                });
                if (newConflicts.length > 0) { setConflicts(newConflicts); setShowConflictModal(true); setIsLoading(false); return; }
            }
            executeMerge(origRefs, updatedRefs, new Map());
        }, 400);
    };

    const executeMerge = (origRefs: RefBlock[], updatedRefs: RefBlock[], conflictResolutions: Map<number, 'update' | 'ignore'>) => {
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
            
            const usedUpdateIdx = new Set<number>();
            const finalRefs: string[] = [];
            let updateCount = 0, unchangedCount = 0, addedCount = 0;
            
            origRefs.forEach((origRef, idx) => {
                let matchIdx = -1;
                if (conflictResolutions.has(idx)) {
                    if (conflictResolutions.get(idx) === 'update') matchIdx = updatedRefs.findIndex((u, i) => !usedUpdateIdx.has(i) && u.label === origRef.label);
                } else {
                    if (!isNumberedMode) {
                         matchIdx = updatedRefs.findIndex((u, i) => !usedUpdateIdx.has(i) && u.label === origRef.label && u.label !== '');
                    } else {
                        let bestIdx = -1, bestScore = 0;
                        updatedRefs.forEach((u, i) => {
                            if (!usedUpdateIdx.has(i)) {
                                const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                                if (score > bestScore) { bestScore = score; bestIdx = i; }
                            }
                        });
                        if (bestScore > 0.82) matchIdx = bestIdx;
                        else matchIdx = updatedRefs.findIndex((u, i) => !usedUpdateIdx.has(i) && u.label === origRef.label && u.label !== '');
                    }
                }
                
                if (matchIdx !== -1) {
                    updateCount++; usedUpdateIdx.add(matchIdx);
                    let finalTag = updatedRefs[matchIdx].fullTag;
                    if (preserveIds) {
                        let idToUse = origRef.id;
                        if (idToUse.startsWith('bib')) { idToUse = `bb${bbStart}`; bbStart += 5; }
                        finalTag = finalTag.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);
                    }
                    if (renumberInternal) {
                        finalTag = finalTag.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                            let prefix = 'rf';
                            if (p1.includes('ce:source-text')) prefix = 'st';
                            else if (p1.includes('inter-ref')) prefix = 'ir';
                            else if (p1.includes('ce:other-ref')) prefix = 'or';
                            else if (p1.includes('ce:textref')) prefix = 'tr';
                            
                            let counter = rfCounter;
                            if (prefix === 'st') counter = stCounter;
                            else if (prefix === 'ir') counter = irCounter;
                            else if (prefix === 'or') counter = orCounter;
                            else if (prefix === 'tr') counter = trCounter;

                            const res = `${p1}id="${prefix}${counter}"${p2}`;
                            
                            if (prefix === 'st') stCounter += 5;
                            else if (prefix === 'ir') irCounter += 5;
                            else if (prefix === 'or') orCounter += 5;
                            else if (prefix === 'tr') trCounter += 5;
                            else rfCounter += 5;

                            return res;
                        });
                    }
                    finalRefs.push(finalTag);
                } else {
                    unchangedCount++; finalRefs.push(origRef.fullTag);
                }
            });

            if (addOrphans) {
                updatedRefs.forEach((u, i) => {
                    if (!usedUpdateIdx.has(i)) {
                        addedCount++;
                        let finalTag = u.fullTag;
                        const idToUse = `bb${bbStart}`;
                        bbStart += 5;
                        finalTag = finalTag.replace(/id="[^"]*"\s*/, '').replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);

                        finalTag = finalTag.replace(/(<(?:sb:reference|ce:source-text|ce:inter-ref|sb:inter-ref|ce:other-ref|ce:textref)\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (m, p1, idAttr, p2) => {
                            let prefix = 'rf';
                            if (p1.includes('ce:source-text')) prefix = 'st';
                            else if (p1.includes('inter-ref')) prefix = 'ir';
                            else if (p1.includes('ce:other-ref')) prefix = 'or';
                            else if (p1.includes('ce:textref')) prefix = 'tr';
                            
                            let counter = rfCounter;
                            if (prefix === 'st') counter = stCounter;
                            else if (prefix === 'ir') counter = irCounter;
                            else if (prefix === 'or') counter = orCounter;
                            else if (prefix === 'tr') counter = trCounter;

                            const res = `${p1}id="${prefix}${counter}"${p2}`;
                            
                            if (prefix === 'st') stCounter += 5;
                            else if (prefix === 'ir') irCounter += 5;
                            else if (prefix === 'or') orCounter += 5;
                            else if (prefix === 'tr') trCounter += 5;
                            else rfCounter += 5;

                            return res;
                        });
                        
                        finalRefs.push(finalTag);
                    }
                });
            }

            const joinedResult = finalRefs.join('\n');
            setOutput(joinedResult);
            setStats({ total: origRefs.length, updated: updateCount, unchanged: unchangedCount, skipped: !addOrphans ? updatedRefs.length - usedUpdateIdx.size : 0, added: addedCount });
            generateDiff(originalXml, joinedResult);
            setActiveTab('result');
            setToast({ msg: `Merged ${updateCount} and added ${addedCount} references.`, type: "success" });
        } catch (e) { setToast({ msg: "Merge failed.", type: "error" }); } finally { setIsLoading(false); }
    };

    useKeyboardShortcuts({
        onPrimary: initiateUpdate,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({ msg: "Copied!", type: "success" }); } },
        onClear: () => { setOriginalXml(''); setUpdatedXml(''); setOutput(''); setScanResults([]); setResolutions(new Map()); }
    }, [originalXml, updatedXml, output]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase">Reference Updater</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Smart-merge corrections into existing lists using exact labels or fuzzy content fingerprinting.</p>
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
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Smart Fingerprinting ON</span>
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
                            <span className="text-sm font-bold text-slate-700">Add New Orphans</span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Append non-matches</span>
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
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Fix body links</span>
                        </div>
                    </label>

                    <button onClick={runAnalysis} className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-lg border border-slate-200 transition-colors">Analyze</button>
                    <button onClick={initiateUpdate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg active:scale-95 transition-all">Merge Updates</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                <div className="flex flex-col gap-6 h-full">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs uppercase">Original XML Source</label>
                            {originalXml && <button onClick={() => setOriginalXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea value={originalXml} onChange={e => setOriginalXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste full article reference list..." spellCheck={false} />
                    </div>
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs uppercase">Updated Corrections</label>
                            {updatedXml && <button onClick={() => setUpdatedXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 resize-none" placeholder="Paste corrections or new items..." spellCheck={false} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative h-full">
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                        {['report', 'result', 'diff'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === tab ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-500 border-transparent hover:bg-slate-50'}`}>
                                {tab === 'report' ? 'Scan Log' : tab === 'result' ? 'Merged XML' : 'Diff View'}
                            </button>
                        ))}
                    </div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                        {isLoading && <LoadingOverlay message="Processing..." color="indigo" />}
                        {activeTab === 'report' && (
                            <div className="h-full overflow-auto custom-scrollbar bg-white">
                                <table className="w-full text-left text-[11px]">
                                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                                        <tr><th className="p-3 font-bold text-slate-500 uppercase">Ref</th><th className="p-3 font-bold text-slate-500 uppercase">Method</th><th className="p-3 font-bold text-slate-500 uppercase">Status</th><th className="p-3 font-bold text-slate-500 uppercase">Preview</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {scanResults.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 font-mono font-bold text-slate-700">{item.label}</td>
                                                <td className="p-3">
                                                    {item.matchType && <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.matchType === 'Label' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>{item.matchType === 'Label' ? 'Strict' : `Smart (${item.matchScore}%)`}</span>}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${
                                                        item.status === 'update' || item.status === 'smart_match' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                                                        item.status === 'add' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                        item.status === 'orphan' ? 'bg-rose-100 text-rose-700 border-rose-200' : 
                                                        'bg-slate-100 text-slate-500 border border-slate-200'
                                                    }`}>{item.status.replace('_', ' ')}</span>
                                                </td>
                                                <td className="p-3 truncate max-w-[120px] text-slate-500 italic">{item.preview}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {activeTab === 'result' && <textarea value={output} readOnly className="w-full h-full p-4 text-xs font-mono bg-transparent border-0 focus:ring-0 outline-none" placeholder="Results will appear here..." />}
                        {activeTab === 'diff' && <div className="absolute inset-0 overflow-auto bg-white p-2">{diffElements || <div className="h-full flex items-center justify-center text-slate-400">Run merge to see diff.</div>}</div>}
                    </div>
                </div>
            </div>

            {showConflictModal && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
                        <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-start gap-4">
                            <div className="p-3 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                            <div><h3 className="text-lg font-bold text-slate-800">Resolve Ambiguous Matches</h3><p className="text-sm text-slate-600 mt-1">Found multiple original references sharing the same label. Choose which one to update.</p></div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-6 bg-slate-50 space-y-6">
                            {conflicts.map((conflict, gIdx) => (
                                <div key={gIdx} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                    <div className="mb-4 font-bold text-indigo-600 text-xs tracking-widest uppercase">Target Update: {conflict.label}</div>
                                    <div className="space-y-3">
                                        {conflict.candidates.map((cand, cIdx) => (
                                            <div key={cIdx} className={`p-4 rounded-lg border transition-all flex items-center justify-between ${resolutions.get(cand.index) === 'update' ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300' : 'bg-white border-slate-200'}`}>
                                                <div className="flex-grow pr-4">
                                                    <div className="text-[10px] font-mono text-slate-400 mb-1">ID: {cand.ref.id} | Match: {Math.round(cand.score * 100)}%</div>
                                                    <div className="text-xs text-slate-700 italic line-clamp-2">{cand.ref.content.replace(/<[^>]+>/g, '')}</div>
                                                </div>
                                                <button onClick={() => setResolutions(new Map(resolutions).set(cand.index, resolutions.get(cand.index) === 'update' ? 'ignore' : 'update'))} className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all shadow-sm ${resolutions.get(cand.index) === 'update' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}>
                                                    {resolutions.get(cand.index) === 'update' ? 'SELECTED' : 'SELECT TARGET'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-white border-t border-slate-200 flex justify-end gap-3">
                            <button onClick={() => {setShowConflictModal(false); setIsLoading(false);}} className="px-6 py-2 text-slate-500 font-bold hover:text-slate-700">Cancel</button>
                            <button onClick={() => {setShowConflictModal(false); executeMerge(parseReferences(originalXml), parseReferences(updatedXml), resolutions);}} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold shadow-lg active:scale-95 transition-all">Apply Choices & Merge</button>
                        </div>
                    </div>
                </div>
            )}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;