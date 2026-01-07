
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
    cleanContent?: string; // Used for comparison
}

interface ScanItem {
    label: string;
    id: string;
    status: 'update' | 'unchanged' | 'orphan';
    preview: string;
    isSynthetic?: boolean;
    similarityMatch?: {
        label: string;
        score: number;
    };
}

interface ConflictGroup {
    label: string;
    updateRef: RefBlock;
    candidates: {
        index: number; // Index in the original array
        ref: RefBlock;
    }[];
}

const ReferenceUpdater: React.FC = () => {
    const [originalXml, setOriginalXml] = useState('');
    const [updatedXml, setUpdatedXml] = useState('');
    const [output, setOutput] = useState('');
    const [preserveIds, setPreserveIds] = useState(true);
    const [renumberInternal, setRenumberInternal] = useState(true);
    const [activeTab, setActiveTab] = useState<'report' | 'result' | 'diff'>('result');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [stats, setStats] = useState({ total: 0, updated: 0, unchanged: 0, skipped: 0 });
    const [scanResults, setScanResults] = useState<ScanItem[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [showOrphansOnly, setShowOrphansOnly] = useState(false);

    // Conflict Resolution State
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
    const [resolutions, setResolutions] = useState<Map<number, 'update' | 'ignore'>>(new Map());

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Simple Levenshtein for similarity check
    const getSimilarity = (s1: string, s2: string): number => {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
        
        const costs = new Array();
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longerLength - costs[shorter.length]) / longerLength;
    };

    const parseReferences = (xml: string): RefBlock[] => {
        const refs: RefBlock[] = [];
        // Regex matches the whole ce:bib-reference block
        const regex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
            const fullTag = match[0];
            const attrs = match[1];
            const content = match[2];
            
            // Extract ID
            const idMatch = attrs.match(/id="([^"]+)"/);
            const id = idMatch ? idMatch[1] : '';

            // Extract Label
            const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
            let label = '';
            let isSynthetic = false;

            if (labelMatch) {
                label = labelMatch[1].trim();
            } else {
                // Fallback for Name-Date: Try to extract Surname + Year
                const surnameMatch = content.match(/<ce:surname>(.*?)<\/ce:surname>/);
                // Try simple year or sb:date tag
                const yearMatch = content.match(/<ce:year>(.*?)<\/ce:year>/) || content.match(/<sb:date>(.*?)<\/sb:date>/);
                
                if (surnameMatch && yearMatch) {
                    label = `${surnameMatch[1]}, ${yearMatch[1]}`;
                    isSynthetic = true;
                }
            }

            // Clean content for comparison (remove tags, lower case, whitespace)
            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

            // Only push if we found a way to identify it (Label or Name-Date)
            if (label) {
                refs.push({ fullTag, id, label, content, isSynthetic, cleanContent });
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
                    <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75 group">
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
                    <colgroup>
                        <col className="w-10 bg-slate-50 border-r border-slate-200" />
                        <col className="w-[calc(50%-2.5rem)]" />
                        <col className="w-10 bg-slate-50 border-r border-slate-200 border-l border-slate-200" />
                        <col className="w-[calc(50%-2.5rem)]" />
                    </colgroup>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const runAnalysis = () => {
        if (!originalXml.trim() || !updatedXml.trim()) {
            setToast({ msg: "Please provide both Original and Updated XML.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                
                const updateMap = new Map<string, RefBlock>();
                updatedRefs.forEach(ref => updateMap.set(ref.label, ref));

                const analysis: ScanItem[] = [];
                let updateCount = 0;
                let unchangedCount = 0;
                const unchangedRefs: RefBlock[] = []; 
                const usedLabels = new Set<string>();

                // Check Original vs Updated
                origRefs.forEach(origRef => {
                    const update = updateMap.get(origRef.label);
                    if (update) {
                        updateCount++;
                        usedLabels.add(origRef.label);
                        analysis.push({
                            label: origRef.label,
                            id: origRef.id,
                            status: 'update',
                            preview: update.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...',
                            isSynthetic: origRef.isSynthetic
                        });
                    } else {
                        unchangedCount++;
                        unchangedRefs.push(origRef);
                        analysis.push({
                            label: origRef.label,
                            id: origRef.id,
                            status: 'unchanged',
                            preview: origRef.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...',
                            isSynthetic: origRef.isSynthetic
                        });
                    }
                });

                // Check Orphans
                let skippedCount = 0;
                updateMap.forEach((val, key) => {
                    if (!usedLabels.has(key)) {
                        skippedCount++;
                        let bestMatchLabel = '';
                        let bestMatchScore = 0;

                        if (val.cleanContent) {
                            unchangedRefs.forEach(ur => {
                                if (ur.cleanContent) {
                                    const score = getSimilarity(val.cleanContent!, ur.cleanContent!);
                                    if (score > bestMatchScore) {
                                        bestMatchScore = score;
                                        bestMatchLabel = ur.label;
                                    }
                                }
                            });
                        }

                        analysis.push({
                            label: val.label,
                            id: 'N/A',
                            status: 'orphan',
                            preview: val.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...',
                            isSynthetic: val.isSynthetic,
                            similarityMatch: bestMatchScore > 0.85 ? { label: bestMatchLabel, score: bestMatchScore } : undefined
                        });
                    }
                });

                setScanResults(analysis);
                setStats({ 
                    total: origRefs.length, 
                    updated: updateCount, 
                    unchanged: unchangedCount, 
                    skipped: skippedCount 
                });
                setActiveTab('report');
                setToast({ msg: "Analysis complete.", type: "success" });

            } catch (e) {
                console.error(e);
                setToast({ msg: "Analysis failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    // Phase 1: Check inputs and potential conflicts
    const initiateUpdate = () => {
        if (!originalXml.trim() || !updatedXml.trim()) {
            setToast({ msg: "Please provide both Original and Updated XML.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const origRefs = parseReferences(originalXml);
            const updatedRefs = parseReferences(updatedXml);

            // Group Original indices by Label
            const origLabelMap = new Map<string, number[]>();
            origRefs.forEach((ref, idx) => {
                const indices = origLabelMap.get(ref.label) || [];
                indices.push(idx);
                origLabelMap.set(ref.label, indices);
            });

            // Detect Conflicts
            const newConflicts: ConflictGroup[] = [];
            updatedRefs.forEach(updateRef => {
                const indices = origLabelMap.get(updateRef.label);
                if (indices && indices.length > 1) {
                    newConflicts.push({
                        label: updateRef.label,
                        updateRef: updateRef,
                        candidates: indices.map(idx => ({ index: idx, ref: origRefs[idx] }))
                    });
                }
            });

            if (newConflicts.length > 0) {
                setConflicts(newConflicts);
                // Pre-fill resolutions with 'ignore' initially or leave undefined to force choice
                setResolutions(new Map());
                setShowConflictModal(true);
                setIsLoading(false);
            } else {
                // No conflicts, proceed immediately
                executeMerge(origRefs, updatedRefs, new Map());
            }
        }, 400);
    };

    // Phase 2: Execute Merge (called directly or after modal)
    const executeMerge = (origRefs: RefBlock[], updatedRefs: RefBlock[], conflictResolutions: Map<number, 'update' | 'ignore'>) => {
        try {
            // Helper to find safe start IDs from original text
            const getNextId = (xml: string, prefix: string, start: number) => {
                const regex = new RegExp(`id="${prefix}(\\d+)"`, 'g');
                let max = start;
                let m;
                while ((m = regex.exec(xml)) !== null) {
                    const val = parseInt(m[1]);
                    if (val >= max) max = Math.ceil((val + 5) / 5) * 5;
                }
                return max;
            };

            let bbStart = getNextId(originalXml, 'bb', 3000);
            let rfCounter = getNextId(originalXml, 'rf', 3000);
            let stCounter = getNextId(originalXml, 'st', 3000);
            let irCounter = getNextId(originalXml, 'ir', 3000);
            
            const updateMap = new Map<string, RefBlock>();
            updatedRefs.forEach(ref => updateMap.set(ref.label, ref));

            let updateCount = 0;
            let unchangedCount = 0;
            const usedUpdateLabels = new Set<string>();
            
            const finalRefs: string[] = [];
            
            origRefs.forEach((origRef, idx) => {
                let shouldUpdate = false;
                let updateContent: RefBlock | undefined = undefined;

                // Check resolution map first (High Priority for conflicts)
                if (conflictResolutions.has(idx)) {
                    if (conflictResolutions.get(idx) === 'update') {
                        updateContent = updateMap.get(origRef.label);
                        shouldUpdate = !!updateContent;
                    }
                } 
                // Default logic for non-conflicting items
                else {
                    updateContent = updateMap.get(origRef.label);
                    shouldUpdate = !!updateContent;
                }
                
                if (shouldUpdate && updateContent) {
                    updateCount++;
                    usedUpdateLabels.add(origRef.label);
                    let finalTag = updateContent.fullTag;
                    
                    if (preserveIds) {
                        let idToUse = origRef.id;
                        if (idToUse.startsWith('bib')) {
                            idToUse = `bb${bbStart}`;
                            bbStart += 5;
                        }
                        if (idToUse) {
                            finalTag = finalTag.replace(/id="[^"]*"\s*/, '');
                            finalTag = finalTag.replace('<ce:bib-reference', `<ce:bib-reference id="${idToUse}"`);
                        }
                    }

                    if (renumberInternal) {
                        finalTag = finalTag.replace(/(<sb:reference\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (match, p1, idAttr, p2) => {
                            const newIdAttr = `id="rf${rfCounter}"`;
                            rfCounter += 5;
                            return `${p1}${newIdAttr}${p2}`;
                        });
                        finalTag = finalTag.replace(/(<ce:source-text\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (match, p1, idAttr, p2) => {
                            const newIdAttr = `id="st${stCounter}"`;
                            stCounter += 5;
                            return `${p1}${newIdAttr}${p2}`;
                        });
                        finalTag = finalTag.replace(/(<ce:inter-ref\b[^>]*?)(\bid="[^"]+")([^>]*?>)/g, (match, p1, idAttr, p2) => {
                            const newIdAttr = `id="ir${irCounter}"`;
                            irCounter += 5;
                            return `${p1}${newIdAttr}${p2}`;
                        });
                    }

                    finalRefs.push(finalTag);
                } else {
                    unchangedCount++;
                    finalRefs.push(origRef.fullTag);
                }
            });

            const joinedResult = finalRefs.join('\n');
            
            setOutput(joinedResult);
            
            setStats({ 
                total: origRefs.length, 
                updated: updateCount, 
                unchanged: unchangedCount, 
                skipped: updatedRefs.length - usedUpdateLabels.size 
            });
            
            generateDiff(originalXml, joinedResult);
            setActiveTab('result');
            
            if (updateCount === 0) {
                setToast({ msg: "No matching labels found to update.", type: "warn" });
            } else {
                setToast({ msg: `Merged ${updateCount} references.`, type: "success" });
            }
            
        } catch (e) {
            console.error(e);
            setToast({ msg: "An error occurred during processing.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConflictAction = (index: number, action: 'update' | 'ignore') => {
        setResolutions(prev => new Map(prev).set(index, action));
    };

    const applyResolutions = () => {
        // Check if all conflicts are handled? Optional. 
        // We assume un-handled ones default to 'ignore' logic in executeMerge if not in map.
        // But better to ensure user made choices.
        // For now, allow proceeding.
        setShowConflictModal(false);
        setIsLoading(true);
        // Defer to let modal close
        setTimeout(() => {
            const origRefs = parseReferences(originalXml);
            const updatedRefs = parseReferences(updatedXml);
            executeMerge(origRefs, updatedRefs, resolutions);
        }, 100);
    };

    useKeyboardShortcuts({
        onPrimary: initiateUpdate,
        onCopy: () => {
            if (output && activeTab === 'result') {
                navigator.clipboard.writeText(output);
                setToast({ msg: "Copied output!", type: "success" });
            }
        },
        onClear: () => {
            setOriginalXml('');
            setUpdatedXml('');
            setOutput('');
            setScanResults([]);
            setResolutions(new Map());
            setToast({ msg: "Inputs cleared.", type: "warn" });
        }
    }, [originalXml, updatedXml, output, renumberInternal]);

    const displayResults = showOrphansOnly ? scanResults.filter(r => r.status === 'orphan') : scanResults;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Reference Updater</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Merge corrected references into your existing XML list while maintaining ID integrity.</p>
            </div>

            {/* Config Panel */}
            <div className="flex justify-center mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                checked={preserveIds} 
                                onChange={(e) => setPreserveIds(e.target.checked)}
                                className="sr-only" 
                            />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${preserveIds ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${preserveIds ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Preserve Original IDs</span>
                            <span className="text-[10px] text-slate-400 font-medium">Prevents broken cross-refs</span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                checked={renumberInternal} 
                                onChange={(e) => setRenumberInternal(e.target.checked)}
                                className="sr-only" 
                            />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${renumberInternal ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${renumberInternal ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Reset Internal IDs</span>
                            <span className="text-[10px] text-slate-400 font-medium">Auto-fix IDs in updates</span>
                        </div>
                    </label>

                    <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
                    
                    <button 
                        onClick={runAnalysis}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <span>Analyze Changes</span>
                    </button>

                    <button 
                        onClick={initiateUpdate}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-indigo-500/20 transform transition-all active:scale-95 flex items-center gap-2"
                    >
                        <span>Merge Updates</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                {/* Input Column */}
                <div className="flex flex-col gap-6 h-full">
                    {/* Original XML */}
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded bg-white border border-slate-200 text-[10px] text-slate-500 font-mono shadow-sm">1</span>
                                Current XML (Original)
                            </label>
                            {originalXml && <button onClick={() => setOriginalXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea 
                            value={originalXml}
                            onChange={(e) => setOriginalXml(e.target.value)}
                            className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 outline-none resize-none placeholder-slate-300" 
                            placeholder='<ce:bib-reference id="bib1">...</ce:bib-reference>'
                            spellCheck={false}
                        />
                    </div>

                    {/* Updated XML */}
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-xs flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded bg-white border border-slate-200 text-[10px] text-emerald-600 font-mono shadow-sm">2</span>
                                Updated XML (Corrections)
                            </label>
                            {updatedXml && <button onClick={() => setUpdatedXml('')} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
                        </div>
                        <textarea 
                            value={updatedXml}
                            onChange={(e) => setUpdatedXml(e.target.value)}
                            className="w-full h-full p-4 text-xs font-mono text-slate-700 border-0 focus:ring-0 outline-none resize-none placeholder-slate-300" 
                            placeholder='<ce:bib-reference id="bib1">...</ce:bib-reference>'
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Result Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative h-full">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-xs flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white border border-slate-200 text-[10px] text-indigo-600 font-mono shadow-sm">3</span>
                            Result
                        </label>
                        <div className="flex gap-2">
                            {output && activeTab === 'result' && (
                                <button onClick={() => {navigator.clipboard.writeText(output); setToast({msg:'Copied!',type:'success'})}} className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded border border-transparent hover:border-indigo-100 transition-colors">
                                    Copy Result
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         <button 
                            onClick={() => setActiveTab('report')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'report' 
                                ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Scan Report {stats.updated > 0 && activeTab !== 'report' && <span className="ml-1 bg-amber-100 text-amber-700 px-1.5 rounded-full text-[9px]">!</span>}
                         </button>
                         <button 
                            onClick={() => setActiveTab('result')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'result' 
                                ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Merged XML {stats.updated > 0 && output && <span className="ml-1 bg-emerald-100 text-emerald-700 px-1.5 rounded-full text-[9px]">{stats.updated} Updated</span>}
                         </button>
                         <button 
                            onClick={() => setActiveTab('diff')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'diff' 
                                ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Diff View
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                        {isLoading && <LoadingOverlay message="Processing References..." color="indigo" />}
                        
                        {activeTab === 'report' && (
                            <div className="flex flex-col h-full bg-white">
                                {scanResults.length > 0 ? (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-100 bg-slate-50">
                                            <div className="bg-white border border-slate-200 rounded p-2 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">Updates</div>
                                                <div className="text-lg font-bold text-amber-600">{stats.updated}</div>
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded p-2 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">Unchanged</div>
                                                <div className="text-lg font-bold text-slate-600">{stats.unchanged}</div>
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded p-2 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">Orphans</div>
                                                <div className={`text-lg font-bold ${stats.skipped > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{stats.skipped}</div>
                                            </div>
                                        </div>
                                        
                                        <div className="px-3 py-2 bg-white border-b border-slate-100 flex justify-between items-center">
                                            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={showOrphansOnly} 
                                                    onChange={(e) => setShowOrphansOnly(e.target.checked)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                Show Orphans Only
                                            </label>
                                            <span className="text-[10px] text-slate-400 italic">
                                                Orphans are references in Update list not found in Original.
                                            </span>
                                        </div>

                                        <div className="flex-grow overflow-auto custom-scrollbar">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                                    <tr>
                                                        <th className="p-3 font-semibold text-slate-500 border-b border-slate-200">Label (Key)</th>
                                                        <th className="p-3 font-semibold text-slate-500 border-b border-slate-200">ID</th>
                                                        <th className="p-3 font-semibold text-slate-500 border-b border-slate-200">Status</th>
                                                        <th className="p-3 font-semibold text-slate-500 border-b border-slate-200">New Content Preview</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {displayResults.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-3 font-mono font-bold text-slate-700 align-top">
                                                                {item.label}
                                                                {item.isSynthetic && (
                                                                    <span className="ml-2 bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded text-[9px] border border-indigo-100 font-normal">Name-Date</span>
                                                                )}
                                                                {item.similarityMatch && (
                                                                    <div className="mt-1 flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-1 rounded border border-amber-200">
                                                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                        <span>
                                                                            Similar to: <span className="font-bold">{item.similarityMatch.label}</span> ({Math.round(item.similarityMatch.score * 100)}%)
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-3 font-mono text-slate-500 align-top">{item.id}</td>
                                                            <td className="p-3 align-top">
                                                                <span className={`px-2 py-1 rounded border font-bold text-[10px] uppercase ${
                                                                    item.status === 'update' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                    item.status === 'orphan' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                    'bg-slate-100 text-slate-500 border-slate-200'
                                                                }`}>
                                                                    {item.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-slate-600 truncate max-w-[150px] align-top" title={item.preview}>
                                                                {item.preview}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <p className="text-sm">Click "Analyze Changes" to see a report.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'result' && (
                             <textarea 
                                value={output}
                                readOnly
                                className="w-full h-full p-4 text-xs font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed placeholder-slate-400" 
                                placeholder="Merged output will appear here..."
                            />
                        )}

                        {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-auto custom-scrollbar bg-white">
                                 {diffElements ? diffElements : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <p className="text-sm">Run update to view differences</p>
                                    </div>
                                 )}
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Conflict Resolution Modal */}
            {showConflictModal && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
                        <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-start gap-4">
                            <div className="p-3 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-100">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Duplicate References Detected</h3>
                                <p className="text-sm text-slate-600 mt-1">Some labels in your Original XML appear multiple times. Please choose which instances to update.</p>
                            </div>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto p-6 bg-slate-50 space-y-6">
                            {conflicts.map((conflict, groupIdx) => (
                                <div key={groupIdx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Label Conflict: <span className="text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 ml-1">{conflict.label}</span></span>
                                    </div>
                                    
                                    <div className="p-4 grid gap-6">
                                        <div className="space-y-2">
                                            <span className="text-xs font-bold text-emerald-600 uppercase flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                New Content (Update Source)
                                            </span>
                                            <div className="text-xs font-mono text-slate-700 bg-emerald-50/50 p-3 rounded border border-emerald-100 leading-relaxed">
                                                {conflict.updateRef.content.replace(/<[^>]+>/g, '').substring(0, 300)}...
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                Original Candidates ({conflict.candidates.length} found)
                                            </span>
                                            {conflict.candidates.map((cand, cIdx) => {
                                                const currentAction = resolutions.get(cand.index);
                                                return (
                                                    <div key={cIdx} className={`p-3 rounded-lg border transition-all ${currentAction === 'update' ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300' : 'bg-white border-slate-200'}`}>
                                                        <div className="flex items-start gap-4">
                                                            <div className="flex flex-col gap-2 pt-1">
                                                                <button 
                                                                    onClick={() => handleConflictAction(cand.index, 'update')}
                                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${currentAction === 'update' ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300 hover:text-amber-600'}`}
                                                                >
                                                                    Update This
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleConflictAction(cand.index, 'ignore')}
                                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${currentAction === 'ignore' ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-white text-slate-400 border-slate-100 hover:text-slate-600'}`}
                                                                >
                                                                    Keep Original
                                                                </button>
                                                            </div>
                                                            <div className="flex-grow">
                                                                <div className="text-[10px] text-slate-400 font-mono mb-1">ID: {cand.ref.id}</div>
                                                                <div className="text-xs font-mono text-slate-600 leading-relaxed">
                                                                    {cand.ref.content.replace(/<[^>]+>/g, '').substring(0, 200)}...
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 bg-white border-t border-slate-200 flex justify-end gap-3">
                            <button 
                                onClick={() => { setShowConflictModal(false); setIsLoading(false); }}
                                className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors text-sm"
                            >
                                Cancel Merge
                            </button>
                            <button 
                                onClick={applyResolutions}
                                className="px-8 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 text-sm"
                            >
                                Confirm & Merge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;
