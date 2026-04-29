import React, { useState, useMemo, useRef, useEffect } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { 
    ChevronUp, 
    ChevronDown, 
    GitCompare, 
    GitMerge,
    ShieldCheck,
    Info,
    AlertCircle, 
    CheckCircle2, 
    Eye, 
    X, 
    AlertTriangle,
    Check,
    RotateCcw,
    Copy,
    ChevronRight,
    ChevronLeft,
    ArrowRight,
    RefreshCw,
    Search,
    FileText,
    Lightbulb,
    Scissors
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { SmartSuggestion, ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';

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
    author?: string;
    year?: string;
    title?: string;
    doi?: string;
    rawAuthor?: string;
    rawYear?: string;
    rawTitle?: string;
}

interface ScanCandidate {
    index: number;
    score: number;
    matchType: string;
    label: string;
    preview: string;
}

interface ScanItem {
    uid: string;
    label: string;
    id: string;
    status: 'update' | 'unchanged' | 'orphan' | 'smart_match' | 'add' | 'conflict' | 'potential_duplicate';
    preview: string;
    matchType?: 'ID' | 'Label' | 'Content' | 'Fuzzy' | 'DOI' | 'Surname-Year';
    matchScore?: number;
    isSynthetic?: boolean;
    selected: boolean;
    reviewed?: boolean;
    sortKey: string;
    originalIndex: number | null; 
    updatedIndex: number | null;
    candidates?: ScanCandidate[];
    potentialMatches?: ScanCandidate[];
}

const ReferenceUpdater: React.FC = () => {
    const navigate = useNavigate();
    const [originalXml, setOriginalXml] = useLocalStorage<string>('ref_updater_original_xml', '');
    const [updatedXml, setUpdatedXml] = useLocalStorage<string>('ref_updater_updated_xml', '');
    const [output, setOutput] = useLocalStorage<string>('ref_updater_output', '');
    const [lastProcessedOriginal, setLastProcessedOriginal] = useLocalStorage<string>('ref_updater_last_original', '');
    const [lastProcessedUpdated, setLastProcessedUpdated] = useLocalStorage<string>('ref_updater_last_updated', '');
    const [preserveIds, setPreserveIds] = useState(true);
    const [renumberInternal, setRenumberInternal] = useState(true);
    const [addOrphans, setAddOrphans] = useState(true);
    const [sortAlphabetically, setSortAlphabetically] = useState(false);
    const [convertAndToAmp, setConvertAndToAmp] = useState(false);
    const [autoUpdateSmartMatch, setAutoUpdateSmartMatch] = useState(false);
    const [activeTab, setActiveTab] = useLocalStorage<'scan' | 'sequence' | 'result' | 'diff' | 'report'>('ref_updater_active_tab', 'scan');
    const [isLoading, setIsLoading] = useState(false);
    const [reviewingItem, setReviewingItem] = useState<ScanItem | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [scanResults, setScanResults] = useLocalStorage<ScanItem[]>('ref_updater_scan_results', []);
    const [filterStatus, setFilterStatus] = useState<'all' | 'review' | 'conflict' | 'add' | 'duplicate'>('all');
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

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

    const generateDiffAsync = async (original: string, modified: string) => {
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const diff = diffLines(original, modified);
                let rows: React.ReactNode[] = [];
                let leftLineNum = 1, rightLineNum = 1, i = 0;
                let changeCount = 0;

                while(i < diff.length) {
                    const current = diff[i];
                    let type = 'equal', leftVal = '', rightVal = '';
                    if (current.removed && diff[i+1]?.added) {
                        type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
                        changeCount++;
                    } else if (current.removed) {
                        type = 'delete'; leftVal = current.value; i++;
                        changeCount++;
                    } else if (current.added) {
                        type = 'insert'; rightVal = current.value; i++;
                        changeCount++;
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
                            <tr 
                                key={`${i}-${r}`} 
                                className="hover:bg-slate-50 transition-colors duration-75 group border-b border-slate-100/30 last:border-0"
                                data-change-row={type !== 'equal' ? "true" : undefined}
                                data-change-index={type !== 'equal' ? changeCount : undefined}
                                data-change-index-group={type !== 'equal' ? changeCount : undefined}
                            >
                                <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 select-none bg-slate-50/80 font-mono ${lClass}`}>{lNum}</td>
                                <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                                <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 border-l select-none bg-slate-50/80 font-mono ${rClass}`}>{rNum}</td>
                                <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                            </tr>
                         );
                    }
                }

                setTotalChanges(changeCount);
                setCurrentChangeIndex(changeCount > 0 ? 1 : 0);

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

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || totalChanges === 0) return;

        let nextIndex = direction === 'next' ? currentChangeIndex + 1 : currentChangeIndex - 1;
        if (nextIndex > totalChanges) nextIndex = 1;
        if (nextIndex < 1) nextIndex = totalChanges;

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current || currentChangeIndex === 0) return;

        const allRows = diffContainerRef.current.querySelectorAll('tr[data-change-index-group]');
        allRows.forEach(row => row.classList.remove('bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10', 'relative'));

        const activeRows = diffContainerRef.current.querySelectorAll(`tr[data-change-index-group="${currentChangeIndex}"]`);
        activeRows.forEach(row => {
            row.classList.add('bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10', 'relative');
        });
    }, [currentChangeIndex]);

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
            
            const surnameMatch = content.match(/<(?:ce|sb):surname\b[^>]*>([\s\S]*?)<\/(?:ce|sb):surname>/i);
            const author = surnameMatch ? surnameMatch[1].toLowerCase().replace(/[^a-z]/g, '') : '';
            
            const dateMatch = content.match(/<(?:ce|sb):year\b[^>]*>([\s\S]*?)<\/(?:ce|sb):year>/i) || 
                              content.match(/<(?:ce|sb):date\b[^>]*>([\s\S]*?)<\/(?:ce|sb):date>/i);
            const year = dateMatch ? dateMatch[1].replace(/\D/g, '') : '';
            
            const titleMatch = content.match(/<(?:ce|sb):title\b[^>]*>([\s\S]*?)<\/(?:ce|sb):title>/i);
            const titleRaw = titleMatch ? titleMatch[1] : '';
            let title = titleRaw.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

            const doiMatch = content.match(/<(?:ce|sb):doi\b[^>]*>([\s\S]*?)<\/(?:ce|sb):doi>/i);
            const doi = doiMatch ? doiMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : '';
            
            const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            const contentHash = cleanContent.replace(/[^a-z0-9]/g, '');

            // Enhanced metadata extraction for unstructured references (ce:other-ref)
            let finalAuthor = author;
            let finalYear = year;
            let finalTitle = title;

            if (!finalAuthor || !finalYear || !finalTitle) {
                const textOnly = content.replace(/<[^>]+>/g, ' ');
                if (!finalYear) {
                    const yMatch = textOnly.match(/\b(19|20)\d{2}\b/) || label.match(/\b(19|20)\d{2}\b/);
                    if (yMatch) finalYear = yMatch[0];
                }
                if (!finalAuthor) {
                    const aMatch = label.match(/^([A-Za-z'’\u00C0-\u017F]+)/) || textOnly.trim().match(/^([A-Za-z'’\u00C0-\u017F]+)/);
                    if (aMatch) finalAuthor = aMatch[1].toLowerCase().replace(/[^a-z]/g, '');
                }
                if (!finalTitle && textOnly.length > 20) {
                    // Try to remove author/year from the start to get a better title proxy
                    let titleProxy = textOnly.trim();
                    const yearInParens = textOnly.match(/\((19|20)\d{2}[^)]*\)/);
                    if (yearInParens) {
                        const index = textOnly.indexOf(yearInParens[0]);
                        titleProxy = textOnly.substring(index + yearInParens[0].length).replace(/^[.,\s]+/, '').trim();
                        
                        // Heuristic: titles in unstructured refs often end before "In ", "Journal", etc.
                        const hostIndicators = [/\bIn\b/i, /\bJournal\b/i, /\bProc\b/i, /\bConference\b/i, /\bVol\b/i];
                        let earliestIndicator = -1;
                        hostIndicators.forEach(regex => {
                            const m = titleProxy.match(regex);
                            if (m && m.index !== undefined) {
                                if (earliestIndicator === -1 || m.index < earliestIndicator) {
                                    earliestIndicator = m.index;
                                }
                            }
                        });
                        if (earliestIndicator !== -1 && earliestIndicator > 10) {
                            titleProxy = titleProxy.substring(0, earliestIndicator).replace(/[.,\s]+$/, '').trim();
                        }
                    } else {
                        // Fallback: remove label if it's at the start
                        if (label && titleProxy.startsWith(label)) {
                            titleProxy = titleProxy.substring(label.length).trim();
                        }
                    }
                    finalTitle = titleProxy.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 100);
                }
            }

            // Capture raw segments for comparative UI
            const rawAuthor = surnameMatch ? surnameMatch[1] : (label.match(/^[A-Za-z'’\u00C0-\u017F]+/) ? label.match(/^[A-Za-z'’\u00C0-\u017F]+/)?.[0] : undefined);
            const rawYear = finalYear;
            const rawTitle = titleRaw || undefined;
            
            let fingerprint = finalAuthor || finalYear || finalTitle || doi
                ? `meta|${finalAuthor}|${finalYear}|${doi}|${finalTitle.substring(0, 100)}` 
                : `text|${contentHash.substring(0, 150)}`;
            
            if (!label && finalAuthor && finalYear) { label = `${finalAuthor}, ${finalYear}`; isSynthetic = true; }
            let sortKey = label || content.replace(/<[^>]+>/g, '').trim().substring(0, 60);
            
            if (label || finalAuthor || cleanContent.length > 5) {
                refs.push({ 
                    fullTag: match[0], 
                    id, label, content, isSynthetic, cleanContent, fingerprint, contentHash, sortKey,
                    author: finalAuthor,
                    year: finalYear,
                    title: finalTitle,
                    doi,
                    rawAuthor,
                    rawYear,
                    rawTitle
                });
            }
        }
        return refs;
    };

    const runAnalysis = () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste both Original and Updated XML.", type: "warn" }); return; }
        setIsLoading(true);
        setSuggestions([]);
        
        setTimeout(() => {
            try {
                const origRefs = parseReferences(originalXml);
                const updatedRefs = parseReferences(updatedXml);
                const analysis: ScanItem[] = [];
                const usedUpdateIdx = new Set<number>();
                
                origRefs.forEach((origRef, oIdx) => {
                    const candidates: ScanCandidate[] = [];
                    
                    // 1. Content Hash Match
                    updatedRefs.forEach((u, idx) => {
                        if (u.contentHash === origRef.contentHash) {
                            candidates.push({ index: idx, score: 100, matchType: 'Content', label: u.label, preview: u.content.substring(0, 60) });
                        }
                    });

                    // 2. DOI Match
                    if (candidates.length === 0 && origRef.doi) {
                        updatedRefs.forEach((u, idx) => {
                            if (u.doi === origRef.doi && u.doi !== '') {
                                candidates.push({ index: idx, score: 100, matchType: 'DOI', label: u.label, preview: u.content.substring(0, 60) });
                            }
                        });
                    }

                    // 3. Label Match
                    if (candidates.length === 0 && origRef.label) {
                        const normOrigLabel = origRef.label.toLowerCase().replace(/['’]/g, "'");
                        updatedRefs.forEach((u, idx) => {
                            if (u.label && u.label.toLowerCase().replace(/['’]/g, "'") === normOrigLabel) {
                                candidates.push({ index: idx, score: 100, matchType: 'Label', label: u.label, preview: u.content.substring(0, 60) });
                            }
                        });
                    }

                    // 4. Fingerprint Match
                    if (candidates.length === 0) {
                        updatedRefs.forEach((u, idx) => {
                            if (u.fingerprint === origRef.fingerprint) {
                                candidates.push({ index: idx, score: 100, matchType: 'Content', label: u.label, preview: u.content.substring(0, 60) });
                            }
                        });
                    }

                    // 5. Fuzzy Match & Surname-Year Heuristic
                    if (candidates.length === 0) {
                        updatedRefs.forEach((u, idx) => {
                            const authMatch = (origRef.author && u.author && origRef.author === u.author);
                            const yearMatch = (origRef.year && u.year && origRef.year === u.year);
                            
                            if (authMatch && yearMatch) {
                                let score = 75;
                                const titleSim = getSimilarity(origRef.title || '', u.title || '');
                                score += (titleSim * 25);
                                candidates.push({ index: idx, score: Math.round(score), matchType: 'Surname-Year', label: u.label, preview: u.content.substring(0, 60) });
                                return;
                            }

                            // Regular Fuzzy logic for Smart Matches
                            if (u.year && origRef.year && u.year !== origRef.year) {
                                const yearSim = getSimilarity(u.year, origRef.year);
                                if (yearSim < 0.75) return; 
                            }

                            if (u.author && origRef.author && u.author !== origRef.author) {
                                const authSim = getSimilarity(u.author, origRef.author);
                                if (authSim < 0.6) return;
                            }

                            const score = getSimilarity(u.fingerprint, origRef.fingerprint);
                            if (score > 0.82) {
                                candidates.push({ index: idx, score: Math.round(score * 100), matchType: 'Fuzzy', label: u.label, preview: u.content.substring(0, 60) });
                            }
                        });
                    }

                    if (candidates.length > 0) {
                        // Sort candidates by score
                        candidates.sort((a, b) => b.score - a.score);
                        
                        const best = candidates[0];
                        const isConflict = candidates.length > 1 && candidates[1].score > 90;

                        analysis.push({ 
                            uid: Math.random().toString(36).substring(2, 15),
                            label: formatLabel(origRef.label || updatedRefs[best.index].label), 
                            id: origRef.id, 
                            status: isConflict ? 'conflict' : (best.matchType === 'Surname-Year' ? 'potential_duplicate' : (best.matchType === 'Fuzzy' ? 'smart_match' : 'update')), 
                            reviewed: false,
                            matchType: best.matchType as any, 
                            matchScore: best.score, 
                            preview: updatedRefs[best.index].content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...', 
                            isSynthetic: origRef.isSynthetic, 
                            selected: !isConflict, 
                            sortKey: updatedRefs[best.index].sortKey, 
                            originalIndex: oIdx, 
                            updatedIndex: best.index,
                            candidates: candidates.length > 1 ? candidates : undefined,
                            potentialMatches: best.matchType === 'Surname-Year' ? candidates.map(c => ({
                                index: c.index,
                                score: c.score,
                                matchType: c.matchType,
                                label: origRefs[oIdx].label,
                                preview: origRefs[oIdx].content.substring(0, 60).replace(/<[^>]+>/g, '')
                            })) : undefined
                        });
                        usedUpdateIdx.add(best.index);
                    } else {
                        analysis.push({ 
                            uid: Math.random().toString(36).substring(2, 15),
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

                // Post-process to detect shared updates (multiple originals claiming same update)
                const updateToOrigMap = new Map<number, number[]>();
                analysis.forEach((item, aIdx) => {
                    if (item.updatedIndex !== null && (item.status === 'update' || item.status === 'smart_match' || item.status === 'conflict')) {
                        const list = updateToOrigMap.get(item.updatedIndex) || [];
                        list.push(aIdx);
                        updateToOrigMap.set(item.updatedIndex, list);
                    }
                });

                updateToOrigMap.forEach((origIndices) => {
                    if (origIndices.length > 1) {
                        origIndices.forEach(aIdx => {
                            analysis[aIdx].status = 'conflict';
                            analysis[aIdx].selected = false;
                        });
                    }
                });

                updatedRefs.forEach((val, idx) => {
                    if (!usedUpdateIdx.has(idx)) {
                        analysis.push({ 
                            uid: Math.random().toString(36).substring(2, 15),
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

                // Secondary Scan: Detect potential duplicates for 'add' items
                analysis.forEach((item, aIdx) => {
                    if (item.status === 'add' && item.updatedIndex !== null) {
                        const u = updatedRefs[item.updatedIndex];
                        const potentials: ScanCandidate[] = [];

                        origRefs.forEach((o, oIdx) => {
                            // Enhanced Duplicate Detection: Surname-Year Heuristic
                            let score = 0;
                            let matchType = '';

                            if (o.doi && u.doi && o.doi === u.doi) {
                                score = 100; matchType = 'DOI';
                            } else {
                                const authMatch = (o.author && u.author && o.author === u.author);
                                const yearMatch = (o.year && u.year && o.year === u.year);
                                
                                if (authMatch && yearMatch) {
                                    // FIRST AUTHOR SURNAME & YEAR IDENTICAL -> 75% Base Score
                                    score = 75; 
                                    matchType = 'Surname-Year';
                                    
                                    // Add weight if titles show partial overlaps
                                    const titleSim = getSimilarity(o.title || '', u.title || '');
                                    score += (titleSim * 25);
                                } else if (authMatch || yearMatch) {
                                    const sim = getSimilarity(o.fingerprint, u.fingerprint);
                                    score = Math.round(sim * 100);
                                    matchType = 'Fuzzy';
                                }
                            }

                            if (score > 60) {
                                potentials.push({
                                    index: oIdx,
                                    score: Math.round(score),
                                    matchType: matchType,
                                    label: o.label,
                                    preview: (o.cleanContent || o.content.replace(/<[^>]+>/g, '')).substring(0, 60)
                                });
                            }
                        });

                        if (potentials.length > 0) {
                            potentials.sort((a, b) => b.score - a.score);
                            item.potentialMatches = potentials;
                            item.status = 'potential_duplicate';
                            item.reviewed = false;
                            item.originalIndex = potentials[0].index;
                        }
                    }
                });

                setScanResults(analysis); 
                setActiveTab('scan'); 
                setToast({ msg: `Analysis complete. Found ${analysis.filter(a => a.updatedIndex !== null).length} potential updates.`, type: "success" });
            } catch (e) { 
                console.error(e);
                setToast({ msg: "Analysis failed.", type: "error" }); 
            } finally { setIsLoading(false); }
        }, 300);
    };

    const mergeDuplicate = (addUid: string, originalIndex: number) => {
        const addItem = scanResults.find(r => r.uid === addUid);
        if (!addItem || addItem.updatedIndex === null) return;
        
        // Find the original reference node. 
        // In primary scan matches (Surname-Year), the status is 'potential_duplicate'.
        // In secondary scan matches (orphan detection), the target is usually 'unchanged'.
        const originalTarget = scanResults.find(r => r.originalIndex === originalIndex && (r.status === 'unchanged' || r.status === 'update' || r.status === 'conflict' || r.status === 'potential_duplicate' || r.status === 'orphan'));
        
        if (!originalTarget) {
             setToast({ msg: "Target original reference not found in scan set.", type: "error" });
             return;
        }

        if (addItem.uid === originalTarget.uid) {
            // Single item merge (Primary Scan)
            setScanResults((prev: ScanItem[]) => prev.map(r => r.uid === addItem.uid ? {
                ...r,
                status: 'update' as const,
                reviewed: true,
                selected: true
            } : r));
        } else {
            // Dual item merge (Secondary Scan)
            setScanResults((prev: ScanItem[]) => {
                return prev
                    .filter(r => r.uid !== addUid)
                    .map(r => r.uid === originalTarget.uid ? {
                        ...r,
                        status: 'update' as const,
                        updatedIndex: addItem.updatedIndex,
                        preview: addItem.preview,
                        reviewed: true,
                        selected: true
                    } : r);
            });
        }

        setReviewingItem(null);
        setToast({ msg: "References merged into update cycle.", type: "success" });
    };

    const splitMatch = (item: ScanItem) => {
        setScanResults((prev: ScanItem[]) => {
            if (item.originalIndex !== null && item.updatedIndex !== null) {
                // Check if the original index is already represented by another item
                const isOrigRepresented = prev.some(it => it.uid !== item.uid && it.originalIndex === item.originalIndex);
                
                let nextResults = prev.map(it => it.uid === item.uid ? {
                    ...it,
                    status: 'add' as const,
                    originalIndex: null,
                    reviewed: true,
                    selected: true
                } : it);

                if (!isOrigRepresented) {
                    const originalRef = parsedOriginalRefs[item.originalIndex!];
                    const originalEntry: ScanItem = {
                        uid: Math.random().toString(36).substring(2, 15),
                        label: originalRef.label || item.label,
                        id: originalRef.id,
                        status: 'unchanged',
                        preview: originalRef.content.substring(0, 100).replace(/<[^>]+>/g, '').trim() + '...',
                        isSynthetic: originalRef.isSynthetic,
                        selected: true,
                        sortKey: originalRef.sortKey,
                        originalIndex: item.originalIndex,
                        updatedIndex: null
                    };
                    nextResults = [...nextResults, originalEntry];
                }
                return nextResults;
            }

            // Fallback for already split items or other statuses
            return prev.map(it => it.uid === item.uid ? { ...it, reviewed: true, status: it.status === 'potential_duplicate' ? 'add' : it.status } : it);
        });

        setReviewingItem(null);
        setToast({ msg: "References split: Keeping both original and update.", type: "success" });
    };

    const initiateUpdate = async () => {
        if (!originalXml.trim() || !updatedXml.trim()) { setToast({ msg: "Paste XML.", type: "warn" }); return; }
        if (scanResults.length === 0) { runAnalysis(); return; }
        setIsLoading(true);
        await executeMergeAsync(parseReferences(originalXml), parseReferences(updatedXml));
    };

    const executeMergeAsync = async (origRefs: RefBlock[], updatedRefs: RefBlock[]) => {
        const unreviewed = scanResults.filter(r => {
            if (r.reviewed) return false;
            // Potential duplicates and conflicts ALWAYS require manual review
            if (r.status === 'conflict' || r.status === 'potential_duplicate') return true;
            // Smart matches only require review if auto-confirm is OFF
            if (r.status === 'smart_match') return !autoUpdateSmartMatch;
            return false;
        });

        if (unreviewed.length > 0) {
            setToast({ msg: `Review required for ${unreviewed.length} pending items before merging.`, type: "warn" });
            setActiveTab('scan');
            setIsLoading(false);
            return;
        }

        try {
            const getNextIdMap = (xml1: string, xml2: string) => {
                const prefixes = ['bb', 'rf', 'se', 'ir', 'ca', 'cf', 'or', 'tr'];
                const map: Record<string, number> = { bb: 3000, rf: 3000, se: 3000, ir: 3000, ca: 3000, cf: 3000, or: 3000, tr: 3000 };
                const combined = xml1 + ' ' + xml2;
                prefixes.forEach(prefix => {
                    const regex = new RegExp(`id="${prefix}(\\d{4})"`, 'g');
                    let m;
                    while ((m = regex.exec(combined)) !== null) {
                        const val = parseInt(m[1]);
                        if (val >= map[prefix]) map[prefix] = val + 1;
                    }
                });
                return map;
            };

            const idCounters = getNextIdMap(originalXml, updatedXml);
            const finalBlocks: string[] = [];
            const sequence = projectedSequence;
            const CHUNK_SIZE = 20;

            for (let i = 0; i < sequence.length; i += CHUNK_SIZE) {
                const chunk = sequence.slice(i, i + CHUNK_SIZE);
                chunk.forEach(item => {
                    let blockMarkup = '';
                    let targetId = '';
                    let isTrulyUnchanged = item.status === 'unchanged';

                    if (item.originalIndex !== null) {
                        const origRef = origRefs[item.originalIndex];
                        if (item.selected && item.updatedIndex !== null && (item.status === 'update' || (item.status === 'smart_match' && (autoUpdateSmartMatch || item.reviewed)))) {
                            blockMarkup = updatedRefs[item.updatedIndex].fullTag;
                            targetId = origRef.id;
                            isTrulyUnchanged = false;
                        } else {
                            // IF UNCHANGED: Use original markup exactly to preserve all IDs
                            blockMarkup = origRef.fullTag;
                            targetId = origRef.id;
                            isTrulyUnchanged = true;
                        }
                    } else if (item.updatedIndex !== null && item.selected) {
                        const orphan = updatedRefs[item.updatedIndex];
                        blockMarkup = orphan.fullTag;
                        targetId = `bb${idCounters.bb.toString().padStart(4, '0')}`;
                        idCounters.bb += 5;
                        isTrulyUnchanged = false;
                    }

                    if (blockMarkup) {
                        // ONLY re-process IDs if the reference has actually changed
                        if (!isTrulyUnchanged) {
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
                        }
                        finalBlocks.push(blockMarkup);
                    }
                });
                await new Promise(r => setTimeout(r, 0));
            }

            const joinedResult = finalBlocks.join('\n');
            setOutput(joinedResult);

            // Post-execution check for alphabetical order (Name-date format)
            const resultRefs = parseReferences(joinedResult);
            const newSuggestions: SmartSuggestion[] = [];
            
            // Refined Name-date detection: Matches "Name, Year" or "Name (Year)"
            const nameDateRefs = resultRefs.filter(r => r.label && r.label.match(/^[A-Za-z\u00C0-\u017F]+.*[ ,]\(?\d{4}\)?[a-z]?$/));
            const isNameDate = nameDateRefs.length > resultRefs.length / 2 && resultRefs.length > 1;

            if (isNameDate && !sortAlphabetically) {
                let isSorted = true;
                const cleanForSort = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

                for (let i = 0; i < resultRefs.length - 1; i++) {
                    const a = resultRefs[i];
                    const b = resultRefs[i+1];
                    
                    // 1. Primary Sort: Author Surname (or content fallback)
                    const authorA = cleanForSort(a.author || a.cleanContent || '');
                    const authorB = cleanForSort(b.author || b.cleanContent || '');
                    const authorCompare = authorA.localeCompare(authorB, undefined, { sensitivity: 'base', numeric: true });
                    
                    if (authorCompare > 0) {
                        isSorted = false;
                        break;
                    }
                    if (authorCompare < 0) continue;

                    // 2. Secondary Sort: Year (Oldest to Newest)
                    const yearA = parseInt((a.year || '').replace(/\D/g, '') || '0') || 0;
                    const yearB = parseInt((b.year || '').replace(/\D/g, '') || '0') || 0;
                    
                    if (yearA > yearB) {
                        isSorted = false;
                        break;
                    }
                    if (yearA < yearB) continue;

                // 3. Tertiary Sort: Title (Relaxed to only trigger if clearly different and out of order)
                const titleA = cleanForSort(a.title || '');
                const titleB = cleanForSort(b.title || '');
                if (titleA && titleB && titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true }) > 0) {
                    // Only flag if authors and years are exactly the same
                    if (authorA === authorB && yearA === yearB) {
                        isSorted = false;
                        break;
                    }
                }
            }
                
                if (!isSorted) {
                    newSuggestions.push({
                        id: 'ref-sorter-suggest',
                        toolName: 'Reference Sorter',
                        description: 'Result not in alphabetical order? Fix it with Reference Sorter.',
                        path: '/refSorter',
                        icon: <Lightbulb size={14} />,
                        condition: 'Unsorted output detected'
                    });
                }
            }
            setSuggestions(newSuggestions);

            setLastProcessedOriginal(originalXml);
            setLastProcessedUpdated(updatedXml);
            setActiveTab('result');
            await generateDiffAsync(originalXml, joinedResult);
            setToast({ msg: "Merge Protocol Executed. Unchanged references preserved.", type: "success" });
        } catch (e) { setToast({ msg: "Merge Protocol Failure.", type: "error" }); } finally { setIsLoading(false); }
    };

    const bulkSelect = (selected: boolean) => {
        setScanResults((prev: ScanItem[]) => prev.map((item: ScanItem) => {
            const matchesFilter = filterStatus === 'all' || 
                (filterStatus === 'review' && (item.status === 'smart_match' || item.status === 'conflict') && !item.reviewed) ||
                (filterStatus === 'conflict' && item.status === 'conflict') ||
                (filterStatus === 'add' && (item.status === 'add' || item.status === 'orphan'));
            
            return matchesFilter ? { ...item, selected } : item;
        }));
    };

    const parsedOriginalRefs = useMemo(() => parseReferences(originalXml), [originalXml]);
    const parsedUpdatedRefs = useMemo(() => parseReferences(updatedXml), [updatedXml]);

    const projectedSequence = useMemo(() => {
        if (scanResults.length === 0) return [];
        let selectedList = scanResults.filter(r => r.selected);
        const cleanForSort = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();

        if (sortAlphabetically) {
            return [...selectedList].sort((a, b) => cleanForSort(a.sortKey).localeCompare(cleanForSort(b.sortKey), undefined, { sensitivity: 'base', numeric: true }));
        } else {
            const result = selectedList.filter(r => r.originalIndex !== null).sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
            const orphans = selectedList.filter(r => r.originalIndex === null).sort((a, b) => cleanForSort(a.sortKey).localeCompare(cleanForSort(b.sortKey), undefined, { sensitivity: 'base', numeric: true }));
            orphans.forEach(orphan => {
                const orphanLabel = cleanForSort(orphan.label);
                let insertIdx = result.findIndex(existing => cleanForSort(existing.label).localeCompare(orphanLabel, undefined, { sensitivity: 'base', numeric: true }) > 0);
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
        const newList = [...scanResults];
        const absoluteIdxMove = newList.findIndex(r => r === itemToMove);
        newList.splice(absoluteIdxMove, 1);
        const absoluteIdxTarget = newList.findIndex(r => r === visibleItems[dropIndex]);
        newList.splice(absoluteIdxTarget, 0, itemToMove);
        setScanResults(newList.map((item, idx) => ({ ...item, originalIndex: idx })));
        setDraggedItemIndex(null);
        setSortAlphabetically(false);
    };

    const isStale = output && (originalXml !== lastProcessedOriginal || updatedXml !== lastProcessedUpdated);

    const clearAll = () => {
        setOriginalXml('');
        setUpdatedXml('');
        setOutput('');
        setLastProcessedOriginal('');
        setLastProcessedUpdated('');
        setScanResults([]);
        setSuggestions([]);
        setToast({ msg: "All data cleared", type: "warn" });
    };

    useKeyboardShortcuts({
        onPrimary: initiateUpdate,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({ msg: "Copied!", type: "success" }); } },
        onClear: clearAll
    }, [originalXml, updatedXml, output, scanResults, lastProcessedOriginal, lastProcessedUpdated]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-8 text-center animate-fade-in"><h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase">Reference Updater</h1><p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic leading-relaxed">High-performance bulk merging. Optimized to preserve unchanged IDs and prevent sequence collisions.</p></div>
            
            <div className="flex justify-center mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-12">
                    <Switch id="toggle-orphans" label="Auto-Add" subLabel="New Items" checked={addOrphans} onChange={setAddOrphans} color="emerald" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <Switch id="toggle-smart-match" label="Auto-Confirm" subLabel="Smart Matches" checked={autoUpdateSmartMatch} onChange={setAutoUpdateSmartMatch} color="purple" />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <div className="flex gap-3">
                        <button onClick={runAnalysis} className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-6 rounded-xl border border-slate-200 transition-all active:scale-95 shadow-sm">Analyze Set</button>
                        <button 
                            onClick={initiateUpdate} 
                            className={`relative font-black py-2.5 px-8 rounded-xl shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest flex items-center gap-2 ${
                                scanResults.some(r => (r.status === 'smart_match' || r.status === 'potential_duplicate' || r.status === 'conflict') && !r.reviewed && !autoUpdateSmartMatch)
                                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20 ring-2 ring-amber-500 ring-offset-2'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                            }`}
                        >
                            {scanResults.some(r => (r.status === 'smart_match' || r.status === 'potential_duplicate' || r.status === 'conflict') && !r.reviewed && !autoUpdateSmartMatch) && (
                                <AlertTriangle size={14} className="animate-pulse" />
                            )}
                            Execute Merge
                            {scanResults.some(r => (r.status === 'smart_match' || r.status === 'potential_duplicate' || r.status === 'conflict') && !r.reviewed && !autoUpdateSmartMatch) && (
                                <span className="absolute -top-2 -right-2 bg-rose-600 text-white text-[8px] px-1.5 py-0.5 rounded-full ring-2 ring-white">
                                    {scanResults.filter(r => (r.status === 'smart_match' || r.status === 'potential_duplicate' || r.status === 'conflict') && !r.reviewed && !autoUpdateSmartMatch).length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[700px]">
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-[10px] uppercase tracking-widest">Original XML Source</label>
                            <button onClick={clearAll} title="Alt+Delete" className="text-[10px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest flex items-center gap-1">
                                <RotateCcw size={10} />
                                Clear All
                            </button>
                        </div>
                        <textarea value={originalXml} onChange={e => setOriginalXml(e.target.value)} className="w-full h-full p-6 text-[13px] font-mono text-slate-700 border-0 focus:ring-0 resize-none bg-transparent" placeholder="Paste full article reference list..." spellCheck={false} />
                    </div>
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-[10px] uppercase tracking-widest">Updated Corrections Set</label>
                        </div>
                        <textarea value={updatedXml} onChange={e => setUpdatedXml(e.target.value)} className="w-full h-full p-6 text-[13px] font-mono text-slate-700 border-0 focus:ring-0 resize-none bg-transparent" placeholder="Paste corrections or new items..." spellCheck={false} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative h-full">
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">{[{ id: 'scan', label: 'Match Matrix' }, { id: 'sequence', label: 'Output Queue' }, { id: 'result', label: 'Merged Stream' }, { id: 'diff', label: 'Audit Log' }, { id: 'report', label: 'Change Report' }].map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === tab.id ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:bg-slate-50'}`}>{tab.label}</button>))}</div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                        {isLoading && <LoadingOverlay message="Executing Protocol Batch..." color="indigo" />}
                        
                        {activeTab === 'scan' && (
                            <div className="h-full overflow-hidden flex flex-col bg-white">
                                <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                                    <div className="flex items-center gap-3 pl-2">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter:</span>
                                        <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                                            {(['all', 'review', 'duplicate', 'conflict', 'add'] as const).map(f => {
                                                const count = scanResults.filter(item => {
                                                    if (f === 'review') return (item.status === 'smart_match' || item.status === 'conflict' || item.status === 'potential_duplicate') && !item.reviewed;
                                                    if (f === 'duplicate') return item.status === 'potential_duplicate';
                                                    if (f === 'conflict') return item.status === 'conflict';
                                                    if (f === 'add') return item.status === 'add' || item.status === 'orphan';
                                                    return true;
                                                }).length;
                                                
                                                return (
                                                    <button 
                                                        key={f}
                                                        onClick={() => setFilterStatus(f)}
                                                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all flex items-center gap-1.5 ${filterStatus === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        {f}
                                                        {count > 0 && <span className={`px-1 rounded-sm ${filterStatus === f ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {scanResults.filter(r => (r.status === 'smart_match' || r.status === 'conflict' || r.status === 'potential_duplicate') && !r.reviewed && !autoUpdateSmartMatch).length > 0 && (
                                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[9px] font-black uppercase animate-pulse">
                                                <AlertCircle size={10} />
                                                {scanResults.filter(r => (r.status === 'smart_match' || r.status === 'conflict' || r.status === 'potential_duplicate') && !r.reviewed && !autoUpdateSmartMatch).length} Pending Review
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => bulkSelect(true)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Select All</button>
                                        <span className="text-slate-300">|</span>
                                        <button onClick={() => bulkSelect(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">None</button>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10"><tr><th className="p-4 font-bold text-slate-400 uppercase w-8"></th><th className="p-4 font-bold text-slate-500 uppercase w-32 tracking-wider">Node ID</th><th className="p-4 font-bold text-slate-500 uppercase w-24 tracking-wider">Status</th><th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Logic Preview</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scanResults.length === 0 ? (
                                                <tr><td colSpan={4} className="p-20 text-center text-slate-300 uppercase tracking-[0.2em] font-black italic">Awaiting Set Scan...</td></tr>
                                            ) : (
                                                scanResults
                                                .filter(item => {
                                                    if (filterStatus === 'review') return (item.status === 'smart_match' || item.status === 'conflict' || item.status === 'potential_duplicate') && !item.reviewed;
                                                    if (filterStatus === 'duplicate') return item.status === 'potential_duplicate';
                                                    if (filterStatus === 'conflict') return item.status === 'conflict';
                                                    if (filterStatus === 'add') return item.status === 'add' || item.status === 'orphan';
                                                    return true;
                                                })
                                                .map((item) => {
                                                    const isSmartMatch = item.status === 'smart_match' || item.status === 'conflict' || item.status === 'potential_duplicate';
                                                    const needsReview = isSmartMatch && !item.reviewed && !autoUpdateSmartMatch;
                                                    const isConflict = item.status === 'conflict';
                                                    const isPotentialDupe = item.status === 'potential_duplicate';
                                                    
                                                    return (
                                                        <tr 
                                                            key={item.uid} 
                                                            className={`transition-all duration-300 ${needsReview ? 'bg-purple-50/80 border-l-4 border-purple-600 shadow-sm relative z-10' : 'hover:bg-slate-50/50'} ${!item.selected ? 'opacity-30 grayscale' : ''}`}
                                                        >
                                                            <td className="p-4 text-center">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={item.selected} 
                                                                    onChange={() => setScanResults((prev: ScanItem[]) => prev.map((it: ScanItem) => it.uid === item.uid ? { ...it, selected: !it.selected } : it))} 
                                                                    className="rounded border-slate-300 text-indigo-600 h-4 w-4" 
                                                                />
                                                            </td>
                                                            <td className="p-4 font-mono">
                                                                <div className="font-bold text-slate-800 truncate max-w-[140px]">{item.label}</div>
                                                                <div className="text-[9px] text-slate-400 uppercase tracking-tighter">ID: {item.id}</div>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border block text-center ${
                                                                            item.status === 'smart_match' 
                                                                            ? (item.reviewed || autoUpdateSmartMatch ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-purple-600 text-white border-purple-600 shadow-sm') 
                                                                            : item.status === 'conflict' ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                                                            : item.status === 'potential_duplicate' ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                                                            : item.status === 'update' ? 'bg-amber-50 text-amber-600 border-amber-200' 
                                                                            : item.status === 'add' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                                                                            : item.status === 'orphan' ? 'bg-rose-50 text-rose-600 border-rose-200' 
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                        }`}>
                                                                            {item.status === 'potential_duplicate' && !item.reviewed ? "Action Needed" : item.status.replace('_', ' ')}
                                                                        </span>
                                                                        {(needsReview || isConflict || isPotentialDupe) && <AlertCircle size={12} className={isConflict || isPotentialDupe ? "text-rose-600 animate-pulse" : "text-purple-600 animate-pulse"} />}
                                                                        {item.reviewed && !autoUpdateSmartMatch && <CheckCircle2 size={12} className="text-emerald-500" />}
                                                                    </div>
                                                                    {item.matchType && (
                                                                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                                                                            {item.matchType} ({item.matchScore}%)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex items-center justify-between gap-4">
                                                                    <div className="text-slate-500 leading-relaxed font-serif italic line-clamp-1 flex-grow">
                                                                        {item.preview}
                                                                    </div>
                                                                    {isSmartMatch && (
                                                                        <div className="flex items-center gap-2">
                                                                            <button 
                                                                                onClick={() => setReviewingItem(item)}
                                                                                className={`p-1.5 rounded-lg transition-all ${isConflict || isPotentialDupe ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                                                                title={isConflict ? "Resolve Conflict" : isPotentialDupe ? "Analyze Similarity" : "Compare Details"}
                                                                            >
                                                                                {isConflict || isPotentialDupe ? <AlertTriangle size={16} /> : <Eye size={16} />}
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => {
                                                                                    if (isConflict || isPotentialDupe || !item.reviewed) {
                                                                                        setReviewingItem(item);
                                                                                    } else {
                                                                                        setScanResults((prev: ScanItem[]) => prev.map((it: ScanItem) => it.uid === item.uid ? { ...it, reviewed: !it.reviewed } : it));
                                                                                    }
                                                                                }}
                                                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                                                                                    item.reviewed 
                                                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                                                                    : (isConflict || isPotentialDupe ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200')
                                                                                }`}
                                                                            >
                                                                                {item.reviewed ? (
                                                                                    <span className="flex items-center gap-1">
                                                                                        <Check size={10} strokeWidth={3} />
                                                                                        Confirmed
                                                                                    </span>
                                                                                ) : (isConflict ? 'Resolve' : 'Review Similarity')}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
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
                                                                <div key={`${ref.uid}`} draggable onDragStart={() => setDraggedItemIndex(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(idx)} className={`flex items-center gap-6 p-5 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm hover:border-indigo-400 transition-all group cursor-grab active:cursor-grabbing ${draggedItemIndex === idx ? 'opacity-40 scale-95' : ''}`}>
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors border border-slate-100 shadow-inner">{idx + 1}</div>
                                            <div className="flex-grow min-w-0"><div className="text-sm font-bold text-slate-800 truncate tracking-tight">{ref.label}</div><div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">TARGET_ID: {ref.id}</div></div>
                                            <span className={`text-[8px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-[0.15em] ${ref.status === 'smart_match' ? 'bg-purple-50 text-purple-600 border-purple-100' : (ref.status === 'add' || ref.status === 'orphan') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : (ref.status === 'update') ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{ref.status === 'add' ? 'NEW' : ref.status === 'smart_match' ? 'SMART' : (ref.status === 'unchanged' ? 'UNTOUCHED' : 'PINNED')}</span>
                                        </div>
                                    )))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'result' && (
                             <div className="h-full relative flex flex-col bg-white">
                                 {suggestions.length > 0 && (
                                     <div className="p-4 bg-indigo-50/30 border-b border-indigo-100">
                                         <div className="flex items-center gap-2 mb-3">
                                             <Lightbulb className="w-3 h-3 text-indigo-600" />
                                             <h4 className="text-[9px] font-black text-indigo-900 uppercase tracking-widest">Post-Execution Recommendations</h4>
                                         </div>
                                         <div className="grid grid-cols-1 gap-2">
                                             {suggestions.map(sug => (
                                                 <button 
                                                     key={sug.id}
                                                     onClick={() => {
                                                         setToast({ msg: `Transferring Merged XML to ${sug.toolName}...`, type: 'success' });
                                                         setTimeout(() => {
                                                             navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Reference Updater' } });
                                                         }, 600);
                                                     }}
                                                     className="flex items-center gap-3 p-3 bg-white border border-indigo-100 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                                 >
                                                     <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                                         {sug.icon}
                                                     </div>
                                                     <div className="flex-grow">
                                                         <div className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                                         <div className="text-[9px] text-indigo-500 font-medium leading-tight">{sug.description}</div>
                                                     </div>
                                                     <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                                 </button>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                                 <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                     <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                                             <Check size={16} strokeWidth={3} />
                                         </div>
                                         <div>
                                             <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Merged XML Stream</h4>
                                             {isStale && (
                                                 <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                                     <AlertTriangle size={10} />
                                                     Stale Output
                                                 </span>
                                             )}
                                         </div>
                                     </div>
                                     <button 
                                         onClick={() => {
                                             navigator.clipboard.writeText(output);
                                             setToast({ msg: "Copied!", type: "success" });
                                         }}
                                         className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border ${
                                             isStale 
                                             ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' 
                                             : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'
                                         }`}
                                     >
                                         <Copy size={12} />
                                         {isStale ? 'Copy Stale XML' : 'Copy XML'}
                                     </button>
                                 </div>
                                 <div className="flex-grow relative flex flex-col min-h-0 bg-white">
                                     {output ? (
                                         <textarea value={output} readOnly className="w-full h-full p-8 text-[11px] font-mono text-slate-700 bg-white border-0 focus:ring-0 resize-none leading-loose custom-scrollbar" placeholder="Merged XML stream will be emitted here..." />
                                     ) : (
                                         <div className="flex-grow flex flex-col items-center justify-center p-12 text-center">
                                             <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-6 font-mono text-xl font-black shadow-inner">?</div>
                                             <h5 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-2">No Output Generated</h5>
                                             <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed italic">The merge protocol has not been executed or the resulting set is empty.</p>
                                             <button onClick={runAnalysis} className="mt-8 px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95">Start Setup Scan</button>
                                         </div>
                                     )}
                                 </div>
                             </div>
                        )}

                        {activeTab === 'diff' && (
                             <div className="flex-grow relative flex flex-col overflow-hidden h-full">
                                 <div 
                                    ref={diffContainerRef}
                                    className="absolute inset-0 overflow-auto bg-white custom-scrollbar"
                                 >
                                     {diffElements || <div className="h-full flex items-center justify-center text-slate-400 uppercase tracking-widest text-[10px] font-black">Differential Audit Pending...</div>}
                                 </div>

                                 <AnimatePresence>
                                     {totalChanges > 0 && (
                                         <motion.div 
                                             initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                             animate={{ opacity: 1, y: 0, scale: 1 }}
                                             exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                             className="absolute bottom-8 right-8 flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
                                         >
                                             <div className="flex items-center gap-1 pr-2 border-r border-slate-100">
                                                 <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                     <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                 </div>
                                                 <div className="flex flex-col px-2">
                                                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                     <span className="text-xs font-black text-slate-900 tabular-nums leading-none">
                                                         {currentChangeIndex} <span className="text-slate-300 mx-0.5">/</span> {totalChanges}
                                                     </span>
                                                 </div>
                                             </div>
                                             <div className="flex items-center gap-1">
                                                 <button 
                                                     onClick={() => scrollToChange('prev')}
                                                     className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                     title="Previous Change (Shift+Tab)"
                                                 >
                                                     <ChevronUp className="w-5 h-5 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                 </button>
                                                 <button 
                                                     onClick={() => scrollToChange('next')}
                                                     className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                     title="Next Change (Tab)"
                                                 >
                                                     <ChevronDown className="w-5 h-5 group-active:translate-y-0.5 transition-transform" strokeWidth={3} />
                                                 </button>
                                             </div>
                                         </motion.div>
                                     )}
                                 </AnimatePresence>
                             </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="h-full overflow-auto p-10 bg-white custom-scrollbar">
                                <div className="max-w-2xl mx-auto space-y-10">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                                        <div>
                                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Change Report</h3>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Audit Log of Reference Updates</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-black text-indigo-600 leading-none">{scanResults.length}</div>
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Total Nodes</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                            <div className="text-lg font-black text-amber-600 leading-none">{scanResults.filter(r => r.status === 'update').length}</div>
                                            <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mt-1">Updates</div>
                                        </div>
                                        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                            <div className="text-lg font-black text-purple-600 leading-none">{scanResults.filter(r => r.status === 'smart_match' || r.status === 'potential_duplicate').length}</div>
                                            <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mt-1">Smart/Dupe</div>
                                        </div>
                                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                            <div className="text-lg font-black text-rose-600 leading-none">{scanResults.filter(r => r.status === 'conflict').length}</div>
                                            <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mt-1">Conflicts</div>
                                        </div>
                                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                            <div className="text-lg font-black text-emerald-600 leading-none">{scanResults.filter(r => r.status === 'add').length}</div>
                                            <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-1">New</div>
                                        </div>
                                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                            <div className="text-lg font-black text-rose-600 leading-none">{scanResults.filter(r => r.status === 'orphan').length}</div>
                                            <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mt-1">Orphans</div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="text-lg font-black text-slate-600 leading-none">{scanResults.filter(r => r.status === 'unchanged').length}</div>
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Static</div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Detailed Ledger</h4>
                                        <div className="space-y-2">
                                            {scanResults.filter(r => r.status !== 'unchanged').map((r, i) => (
                                                <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-2 h-2 rounded-full ${
                                                            r.status === 'update' ? 'bg-amber-400' : 
                                                            r.status === 'smart_match' ? 'bg-purple-400' : 
                                                            r.status === 'conflict' ? 'bg-rose-500' :
                                                            r.status === 'add' ? 'bg-emerald-400' :
                                                            'bg-rose-400'
                                                        }`}></div>
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-800">{r.label}</div>
                                                            <div className="text-[9px] text-slate-400 font-mono uppercase">ID: {r.id}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-[9px] font-black uppercase tracking-widest ${
                                                            r.status === 'update' ? 'text-amber-600' : 
                                                            r.status === 'smart_match' ? 'text-purple-600' : 
                                                            r.status === 'conflict' ? 'text-rose-600' :
                                                            r.status === 'add' ? 'text-emerald-600' :
                                                            'text-rose-600'
                                                        }`}>
                                                            {r.status.replace('_', ' ')}
                                                        </div>
                                                        {r.matchScore && <div className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">{r.matchType} {r.matchScore}%</div>}
                                                    </div>
                                                </div>
                                            ))}
                                            {scanResults.filter(r => r.status !== 'unchanged').length === 0 && (
                                                <div className="py-12 text-center text-slate-300 uppercase tracking-widest text-[10px] font-black italic">No modifications detected in current set.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <AnimatePresence>
                {reviewingItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setReviewingItem(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center">
                                        <GitCompare className="text-purple-600" size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                            {reviewingItem.status === 'potential_duplicate' ? 'Duplicate Detection Review' : 'Smart Match Review'}
                                        </h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                            {reviewingItem.status === 'potential_duplicate' ? 'Investigate potential redundancy' : 'Verify fuzzy logic connection'}
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setReviewingItem(null)}
                                    className="p-3 hover:bg-slate-200 rounded-2xl transition-all text-slate-400 hover:text-slate-600"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-grow overflow-auto p-8 custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Column 1: Original */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Original Record</span>
                                            <span className="text-[10px] font-mono text-slate-400">ID: {reviewingItem.id}</span>
                                        </div>
                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 font-serif italic text-slate-600 leading-relaxed text-sm">
                                            {parsedOriginalRefs[reviewingItem.originalIndex!]?.content?.replace(/<[^>]+>/g, ' ') || 'No content available'}
                                        </div>

                                        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
                                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2 mb-2">Metadata Comparison</h4>
                                            
                                            <div className="space-y-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black text-slate-300 uppercase">Primary Authors</span>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className={`text-[11px] leading-tight ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawAuthor !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawAuthor ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                                                            {parsedOriginalRefs[reviewingItem.originalIndex!]?.rawAuthor || '—'}
                                                        </div>
                                                        <div className={`text-[11px] leading-tight font-bold ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawAuthor !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawAuthor ? 'text-amber-700' : 'text-slate-900'}`}>
                                                            {parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawAuthor || '—'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black text-slate-300 uppercase">Publication Year</span>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className={`text-[11px] leading-tight ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawYear !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawYear ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                                                            {parsedOriginalRefs[reviewingItem.originalIndex!]?.rawYear || '—'}
                                                        </div>
                                                        <div className={`text-[11px] leading-tight font-bold ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawYear !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawYear ? 'text-amber-700' : 'text-slate-900'}`}>
                                                            {parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawYear || '—'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black text-slate-300 uppercase">Article Title</span>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className={`text-[11px] leading-tight line-clamp-2 ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawTitle !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawTitle ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                                                            {parsedOriginalRefs[reviewingItem.originalIndex!]?.rawTitle?.replace(/<[^>]+>/g, ' ') || '—'}
                                                        </div>
                                                        <div className={`text-[11px] leading-tight font-bold line-clamp-2 ${parsedOriginalRefs[reviewingItem.originalIndex!]?.rawTitle !== parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawTitle ? 'text-amber-700' : 'text-slate-900'}`}>
                                                            {parsedUpdatedRefs[reviewingItem.updatedIndex!]?.rawTitle?.replace(/<[^>]+>/g, ' ') || '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Revised/Added */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${reviewingItem.status === 'conflict' ? 'text-rose-600' : (reviewingItem.status === 'potential_duplicate' ? 'text-amber-600' : 'text-purple-600')}`}>
                                                {reviewingItem.status === 'conflict' ? 'Conflict Detected' : (reviewingItem.status === 'potential_duplicate' ? 'Candidate Duplicate' : 'Smart Suggestion')}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${reviewingItem.status === 'conflict' ? 'bg-rose-100 text-rose-700' : (reviewingItem.status === 'potential_duplicate' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700')}`}>
                                                {reviewingItem.matchScore}% Score
                                            </span>
                                        </div>
                                        <div className={`p-6 rounded-3xl border font-serif italic text-slate-700 leading-relaxed text-sm ring-1 ${reviewingItem.status === 'conflict' ? 'bg-rose-50/50 border-rose-200 ring-rose-500/5 shadow-inner' : (reviewingItem.status === 'potential_duplicate' ? 'bg-amber-50/50 border-amber-200 ring-amber-500/5 shadow-inner' : 'bg-purple-50/50 border-purple-200 ring-purple-500/5 shadow-inner')}`}>
                                            {parsedUpdatedRefs[reviewingItem.updatedIndex!]?.content?.replace(/<[^>]+>/g, ' ') || 'No revised content available'}
                                        </div>

                                        {(reviewingItem.candidates || (reviewingItem.status === 'potential_duplicate' ? reviewingItem.potentialMatches : undefined)) && (
                                            <div className="mt-6 space-y-3">
                                                <div className="flex items-center gap-2 px-2">
                                                    < GitMerge size={12} className="text-slate-400" />
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ">
                                                        {reviewingItem.status === 'potential_duplicate' ? 'Merge Search Results' : 'System Candidates'}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {(reviewingItem.candidates || (reviewingItem.status === 'potential_duplicate' ? reviewingItem.potentialMatches : undefined))!.map((cand: ScanCandidate, cIdx: number) => (
                                                        <button 
                                                            key={cIdx}
                                                            onClick={() => {
                                                                if (reviewingItem.status === 'potential_duplicate') {
                                                                    setReviewingItem(prev => prev ? { ...prev, originalIndex: cand.index, matchScore: cand.score, matchType: cand.matchType as any } : null);
                                                                    setScanResults(prev => prev.map(it => it.uid === reviewingItem.uid ? { ...it, originalIndex: cand.index, matchScore: cand.score, matchType: cand.matchType as any } : it));
                                                                } else {
                                                                    setReviewingItem(prev => prev ? { ...prev, updatedIndex: cand.index, matchScore: cand.score, matchType: cand.matchType as any, label: formatLabel(cand.label), preview: cand.preview + '...' } : null);
                                                                    setScanResults(prev => prev.map(it => it.uid === reviewingItem.uid ? { ...it, updatedIndex: cand.index, matchScore: cand.score, matchType: cand.matchType as any, label: formatLabel(cand.label), preview: cand.preview + '...' } : it));
                                                                }
                                                            }}
                                                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${(reviewingItem.status === 'potential_duplicate' ? reviewingItem.originalIndex === cand.index : reviewingItem.updatedIndex === cand.index) ? 'bg-white border-indigo-400 shadow-md ring-1 ring-indigo-50' : 'bg-slate-50 border-transparent hover:border-slate-200 hover:bg-white'}`}
                                                        >
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{cand.label}</span>
                                                                <span className="text-[9px] text-slate-400 font-serif italic line-clamp-1">{cand.preview}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-[10px] font-black text-indigo-600">{cand.score}%</span>
                                                                    <span className="text-[7px] font-bold text-slate-300 uppercase tracking-tighter">{cand.matchType}</span>
                                                                </div>
                                                                {(reviewingItem.status === 'potential_duplicate' ? reviewingItem.originalIndex === cand.index : reviewingItem.updatedIndex === cand.index) && <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200"><Check size={10} className="text-white" strokeWidth={4} /></div>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8 p-6 bg-slate-900 rounded-[2rem] shadow-2xl shadow-indigo-500/10 active:scale-[0.99] transition-transform">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2.5 bg-indigo-500 rounded-2xl">
                                            <ShieldCheck size={20} className="text-white" />
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-black text-white uppercase tracking-tight">Merge Intelligence Report</h4>
                                                <span className="px-2 py-0.5 bg-indigo-400/20 text-indigo-300 rounded text-[8px] font-black uppercase tracking-widest border border-indigo-500/30">Similarity Breakdown</span>
                                            </div>
                                            <p className="text-[11px] text-slate-300 mt-2 leading-relaxed font-medium">
                                                Algorithm: <strong>{reviewingItem.matchType || 'Heuristic'} Validation</strong> ({reviewingItem.matchScore}%). 
                                                {reviewingItem.status === 'potential_duplicate' 
                                                    ? (reviewingItem.matchType === 'Surname-Year' 
                                                        ? "Flagged via First Author & Year Match. While author lists or titles may vary in detail, the core metadata points to identical registration." 
                                                        : "This entry was flagged because it significantly overlaps with a record in your original XML set. Merging prevents bibliography inflation.") 
                                                    : "Compare metadata above to verify mapping accuracy. Once confirmed, this update will be committed to the XML output pipe."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
                                <button 
                                    onClick={() => setReviewingItem(null)}
                                    className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-all"
                                >
                                    Dismiss
                                </button>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => splitMatch(reviewingItem)}
                                        className="px-8 py-3 bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                                    >
                                        <Scissors size={14} className="text-slate-400" />
                                        Split Reference
                                    </button>
                                    {reviewingItem.status === 'potential_duplicate' && reviewingItem.originalIndex !== null ? (
                                        <button 
                                            onClick={() => mergeDuplicate(reviewingItem.uid, reviewingItem.originalIndex!)}
                                            className="px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2"
                                        >
                                            <GitMerge size={16} strokeWidth={3} />
                                            Keep as Merge
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => {
                                                setScanResults((prev: ScanItem[]) => prev.map((it: ScanItem) => it.uid === reviewingItem.uid ? { ...it, reviewed: true, status: it.status === 'conflict' ? 'smart_match' : it.status } : it));
                                                setReviewingItem(null);
                                            }}
                                            className={`px-8 py-3 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2 ${reviewingItem.status === 'conflict' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'}`}
                                        >
                                            <Check size={16} strokeWidth={3} />
                                            {reviewingItem.status === 'conflict' ? 'Resolve & Merge' : 'Keep as Merge'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceUpdater;