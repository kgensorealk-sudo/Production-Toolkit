
import React, { useState, useEffect, useRef } from 'react';
import { diffLines, diffWordsWithSpace, diffChars, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';

interface DetectedRef {
    tagName: string;
    refid?: string;
    text: string;
    isRestored?: boolean;
}

interface SyncLog {
    id: number;
    paraId: string;
    status: 'success' | 'warning' | 'error';
    message?: string;
    stats?: {
        remapped: number;
        restored: number;
        total: number;
    };
    diffStats?: {
        added: number;
        removed: number;
    };
    detectedRefs: DetectedRef[];
}

const ViewSync: React.FC = () => {
    const [input, setInput] = useLocalStorage<string>('view_sync_input', '');
    const [output, setOutput] = useLocalStorage<string>('view_sync_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('view_sync_last_input', '');
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [syncDirection, setSyncDirection] = useState<'compact-to-extended' | 'extended-to-compact'>('compact-to-extended');
    const [customStartId, setCustomStartId] = useState<string>('');
    
    // View State
    const [activeTab, setActiveTab] = useState<'raw' | 'diff' | 'report' | 'mismatches'>('raw');
    const [mismatches, setMismatches] = useState<{paraId: string, compactText: string, extendedText: string, index: number}[]>([]);
    const [diffRows, setDiffRows] = useState<any[]>([]);
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
        let rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let changeCounter = 0;

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
            const isChange = type !== 'equal';
            if (isChange) changeCounter++;

            for (let r = 0; r < maxRows; r++) {
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : null;
                 const rNum = rContent !== undefined ? rightLineNum++ : null;
                 
                 rows.push({
                    leftNum: lNum,
                    leftContent: lContent || '',
                    rightNum: rNum,
                    rightContent: rContent || '',
                    type,
                    id: `${i}-${r}`,
                    changeIndex: isChange ? changeCounter : null,
                    isFirstInGroup: isChange && r === 0
                 });
            }
        }
        
        setDiffRows(rows);
        setTotalChanges(changeCounter);
        setCurrentChangeIndex(changeCounter > 0 ? 1 : 0);
    };

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (totalChanges === 0) return;
        
        let targetIndex = direction === 'next' ? currentChangeIndex + 1 : currentChangeIndex - 1;
        if (targetIndex > totalChanges) targetIndex = 1;
        if (targetIndex < 1) targetIndex = totalChanges;
        
        const targetRow = diffContainerRef.current?.querySelector(`[data-change-index-group="${targetIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(targetIndex);
        }
    };

    useEffect(() => {
        if (currentChangeIndex > 0 && diffContainerRef.current) {
            const rows = diffContainerRef.current.querySelectorAll(`[data-change-index="${currentChangeIndex}"]`);
            const allRows = diffContainerRef.current.querySelectorAll('[data-change-index]');
            allRows.forEach(r => r.classList.remove('bg-emerald-100', 'bg-rose-100', 'ring-1', 'ring-emerald-400', 'ring-rose-400', 'z-10', 'relative'));
            
            rows.forEach(row => {
                const type = row.getAttribute('data-type');
                if (type === 'insert' || type === 'replace') {
                    row.classList.add('bg-emerald-100', 'ring-1', 'ring-emerald-400', 'z-10', 'relative');
                } else if (type === 'delete') {
                    row.classList.add('bg-rose-100', 'ring-1', 'ring-rose-400', 'z-10', 'relative');
                }
            });
        }
    }, [currentChangeIndex]);

    const stripTags = (xml: string) => {
        if (!xml) return '';
        return xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    };

    const getValidRanges = (text: string) => {
        const sectionsRegex = /<ce:sections\b[^>]*>([\s\S]*?)<\/ce:sections>/g;
        const appendicesRegex = /<ce:appendices\b[^>]*>([\s\S]*?)<\/ce:appendices>/g;
        
        const ranges: {start: number, end: number}[] = [];
        let sectionMatch;
        while ((sectionMatch = sectionsRegex.exec(text)) !== null) {
            const sectionStart = sectionMatch.index;
            const sectionContent = sectionMatch[1];
            const sectionContentStart = sectionStart + sectionMatch[0].indexOf(sectionContent);
            
            // Find appendices within this section
            const appendices: {start: number, end: number}[] = [];
            let appendixMatch;
            while ((appendixMatch = appendicesRegex.exec(sectionContent)) !== null) {
                const appStart = sectionContentStart + appendixMatch.index;
                const appEnd = appStart + appendixMatch[0].length;
                appendices.push({start: appStart, end: appEnd});
            }
            
            // Split section range by appendices
            let currentStart = sectionContentStart;
            appendices.forEach(app => {
                if (app.start > currentStart) {
                    ranges.push({start: currentStart, end: app.start});
                }
                currentStart = app.end;
            });
            
            const sectionContentEnd = sectionContentStart + sectionContent.length;
            if (currentStart < sectionContentEnd) {
                ranges.push({start: currentStart, end: sectionContentEnd});
            }
        }
        return ranges;
    };

    const renderMismatchDiff = (text1: string, text2: string, side: 'compact' | 'extended') => {
        const diff = diffWordsWithSpace(text1, text2);
        return diff.map((part, i) => {
            if (side === 'compact') {
                if (part.removed) return <span key={i} className="bg-rose-100 text-rose-900 px-0.5 rounded">{part.value}</span>;
                if (part.added) return null;
                return <span key={i}>{part.value}</span>;
            } else {
                if (part.added) return <span key={i} className="bg-emerald-100 text-emerald-900 px-0.5 rounded font-medium">{part.value}</span>;
                if (part.removed) return null;
                return <span key={i}>{part.value}</span>;
            }
        });
    };

    const scanForMismatches = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const validRanges = getValidRanges(input);
            const isInsideValidRange = (index: number) => validRanges.some(r => index >= r.start && index < r.end);

            const compactRegex = /<ce:para\b([^>]*?)view="(compact|compact-standard)"([^>]*?)>([\s\S]*?)<\/ce:para>/g;
            const extendedRegex = /<ce:para\b([^>]*?)view="extended"([^>]*?)>([\s\S]*?)<\/ce:para>/g;

            const compactMatches = [...input.matchAll(compactRegex)].filter(m => isInsideValidRange(m.index!));
            const extendedMatches = [...input.matchAll(extendedRegex)].filter(m => isInsideValidRange(m.index!));

            const foundMismatches: {paraId: string, compactText: string, extendedText: string, index: number}[] = [];
            const count = Math.min(compactMatches.length, extendedMatches.length);

            for (let i = 0; i < count; i++) {
                const compactContent = compactMatches[i][4] || '';
                const extendedContent = extendedMatches[i][3] || '';

                const compactText = stripTags(compactContent);
                const extendedText = stripTags(extendedContent);

                if (compactText !== extendedText) {
                    const idMatch = compactMatches[i][0].match(/\bid="([^"]+)"/);
                    foundMismatches.push({
                        paraId: idMatch ? idMatch[1] : `Pair ${i + 1}`,
                        compactText,
                        extendedText,
                        index: i
                    });
                }
            }

            setMismatches(foundMismatches);
            setActiveTab('mismatches');
            setIsLoading(false);
            if (foundMismatches.length === 0) {
                setToast({ msg: "No mismatches found! All pairs are synchronized.", type: "success" });
            } else {
                setToast({ msg: `Found ${foundMismatches.length} unsynchronized paragraph pairs.`, type: "warn" });
            }
        }, 500);
    };

    const processSync = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const newLogs: SyncLog[] = [];
            let logCounter = 1;
            let nextIdNum = 4000;

            if (customStartId && !isNaN(parseInt(customStartId))) {
                nextIdNum = parseInt(customStartId);
            } else {
                // 1. Determine Global Max ID to ensure uniqueness
                // Scans for any pattern like id="abc1234" to find the highest number used.
                // We strictly match 1-4 digit IDs to avoid "self-infection" from long numbers
                const allIdRegex = /\bid="([a-zA-Z]+)(\d{1,4})"/g;
                let maxIdNum = 0;
                let m;
                while ((m = allIdRegex.exec(input)) !== null) {
                    const num = parseInt(m[2], 10);
                    if (!isNaN(num) && num > maxIdNum) {
                        maxIdNum = num;
                    }
                }
                // Start new IDs safely above the max found (or at 4000), ensuring it's a multiple of 5
                nextIdNum = Math.max(4000, Math.ceil((maxIdNum + 10) / 5) * 5);
            }

            // 2. Extract Paragraphs based on direction (Restricted to ce:sections and outside ce:appendices)
            const validRanges = getValidRanges(input);
            const isInsideValidRange = (index: number) => validRanges.some(r => index >= r.start && index < r.end);

            const compactRegex = /<ce:para\b([^>]*?)view="(compact|compact-standard)"([^>]*?)>([\s\S]*?)<\/ce:para>/g;
            const extendedRegex = /<ce:para\b([^>]*?)view="extended"([^>]*?)>([\s\S]*?)<\/ce:para>/g;

            const compactMatches = [...input.matchAll(compactRegex)].filter(m => isInsideValidRange(m.index!));
            const extendedMatches = [...input.matchAll(extendedRegex)].filter(m => isInsideValidRange(m.index!));

            if (compactMatches.length === 0) {
                 setToast({ msg: "No 'compact' paragraphs found.", type: "error" });
                 setIsLoading(false);
                 return;
            }
            if (extendedMatches.length === 0) {
                 setToast({ msg: "No 'extended' paragraphs found.", type: "error" });
                 setIsLoading(false);
                 return;
            }

            // Validation: Mismatched counts
            if (compactMatches.length !== extendedMatches.length) {
                newLogs.push({
                    id: logCounter++,
                    paraId: 'GLOBAL',
                    status: 'warning',
                    message: `Mismatch: ${compactMatches.length} Compact vs ${extendedMatches.length} Extended. Syncing sequential pairs.`,
                    detectedRefs: []
                });
            }

            const count = Math.min(compactMatches.length, extendedMatches.length);
            
            // 3. Build Replacements
            const replacements: {start: number, end: number, replacement: string}[] = [];

            for (let i = 0; i < count; i++) {
                const compactMatch = compactMatches[i];
                const extendedMatch = extendedMatches[i];
                
                let sourceContent = '';
                let targetContent = '';
                let targetFullMatch = '';
                let targetIndex = 0;

                if (syncDirection === 'compact-to-extended') {
                    sourceContent = compactMatch[4] || ''; 
                    targetContent = extendedMatch[3] || ''; 
                    targetFullMatch = extendedMatch[0] || '';
                    targetIndex = extendedMatch.index || 0;
                } else {
                    sourceContent = extendedMatch[3] || ''; 
                    targetContent = compactMatch[4] || '';
                    targetFullMatch = compactMatch[0] || '';
                    targetIndex = compactMatch.index || 0;
                }
                
                const targetOpenTagMatch = targetFullMatch.match(/^<ce:para\b[^>]*>/);
                
                if (!targetOpenTagMatch) {
                    newLogs.push({
                        id: logCounter++,
                        paraId: `Index ${i}`,
                        status: 'error',
                        message: "Could not parse opening tag.",
                        detectedRefs: []
                    });
                    continue;
                }

                const targetOpenTag = targetOpenTagMatch[0];
                const targetIdMatch = targetOpenTag.match(/\bid="([^"]+)"/);
                const targetParaId = targetIdMatch ? targetIdMatch[1] : `Index ${i}`;

                // 4A. Scan TARGET for existing Cross-Refs and e-components
                const targetRefRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/g;
                const targetRefs: {tagName: string, attributes: string, text: string, refid?: string, originalId?: string}[] = [];
                let tm;
                while ((tm = targetRefRegex.exec(targetContent)) !== null) {
                    const tagName = tm[1];
                    const attrs = tm[2];
                    const content = tm[3];
                    const refIdMatch = attrs.match(/refid="([^"]+)"/);
                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    
                    targetRefs.push({ 
                        tagName,
                        attributes: attrs,
                        text: content,
                        refid: refIdMatch ? refIdMatch[1] : undefined,
                        originalId: idMatch ? idMatch[1] : undefined
                    });
                }

                // 4B. Scan SOURCE for existing refs and STRIP them to avoid double-tagging and ID conflicts
                const sourceRefs: {tagName: string, attributes: string, text: string}[] = [];
                let sm;
                const sourceRefRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/g;
                while ((sm = sourceRefRegex.exec(sourceContent)) !== null) {
                    sourceRefs.push({
                        tagName: sm[1],
                        attributes: sm[2],
                        text: sm[3]
                    });
                }
                const cleanSource = sourceContent.replace(sourceRefRegex, '$3');

                // 4C. Content Renumbering (Clean Source)
                let remappedCount = 0;
                let newContent = (cleanSource || '').replace(/\bid="([a-zA-Z]+)(\d+)"/g, (match, prefix, oldNum) => {
                     remappedCount++;
                     const currentVal = nextIdNum;
                     nextIdNum += 5;
                     const newId = `${prefix}${currentVal.toString().padStart(4, '0')}`;
                     return `id="${newId}"`;
                });

                // 4D. Restore References and e-components
                let restoredCount = 0;
                const restoredRefIds = new Set<string>();
                const restoredTagIds = new Set<string>();
                
                // Group refs by text. Target refs take priority for ID retention.
                const refsByText = new Map<string, any[]>();
                
                targetRefs.forEach(ref => {
                    if (!refsByText.has(ref.text)) refsByText.set(ref.text, []);
                    refsByText.get(ref.text)!.push({...ref, priority: 1});
                });
                
                sourceRefs.forEach(ref => {
                    // Only add source refs if they aren't already covered by target refs for the same text
                    // Actually, we add them all but mark them as lower priority
                    if (!refsByText.has(ref.text)) refsByText.set(ref.text, []);
                    refsByText.get(ref.text)!.push({...ref, priority: 2});
                });

                refsByText.forEach((refs, textKey) => {
                    const safeTextKey = textKey || '';
                    const escapedText = safeTextKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // We don't need to worry about insideRestorableTag anymore because we stripped them
                    const tokenRegex = new RegExp(`(${escapedText})`, 'g');
                    
                    newContent = newContent.replace(tokenRegex, (match, textGroup) => {
                        const nextRef = refs.shift(); 
                        if (nextRef) {
                            if (nextRef.refid) restoredRefIds.add(nextRef.refid);
                            if (nextRef.originalId) restoredTagIds.add(nextRef.originalId);
                            restoredCount++;
                            
                            let newTagIdAttr = '';
                            if (nextRef.priority === 1 && nextRef.originalId) {
                                // Retain target ID
                                newTagIdAttr = ` id="${nextRef.originalId}"`;
                            } else {
                                // Generate new ID for source-only refs or target refs without IDs
                                const currentVal = nextIdNum;
                                nextIdNum += 5;
                                const prefixMatch = nextRef.attributes.match(/\bid="([a-zA-Z]+)/);
                                const prefix = prefixMatch ? prefixMatch[1] : (nextRef.tagName.startsWith('ce:cross-ref') ? 'cf' : 'ec');
                                const newId = `${prefix}${currentVal.toString().padStart(4, '0')}`;
                                newTagIdAttr = ` id="${newId}"`;
                            }

                            if (nextRef.tagName.startsWith('ce:cross-ref')) {
                                return `<${nextRef.tagName}${newTagIdAttr} refid="${nextRef.refid || ''}">${textGroup}</${nextRef.tagName}>`;
                            } else {
                                const otherAttrs = (nextRef.attributes || '').replace(/\bid="[^"]*"/, '').trim();
                                const attrStr = otherAttrs ? ` ${otherAttrs}` : '';
                                return `<${nextRef.tagName}${newTagIdAttr}${attrStr}>${textGroup}</${nextRef.tagName}>`;
                            }
                        }
                        return textGroup;
                    });
                });

                // 5. Scan for FINAL Cross-Refs and e-components
                const detectedRefs: DetectedRef[] = [];
                const crossRefRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/g;
                let crMatch;
                while ((crMatch = crossRefRegex.exec(newContent)) !== null) {
                    const tagName = crMatch[1];
                    const attrs = crMatch[2];
                    const text = crMatch[3];
                    const refIdMatch = attrs.match(/refid="([^"]+)"/);
                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    
                    detectedRefs.push({
                        tagName,
                        refid: refIdMatch ? refIdMatch[1] : undefined,
                        text: text,
                        isRestored: !!((refIdMatch && restoredRefIds.has(refIdMatch[1])) || (idMatch && restoredTagIds.has(idMatch[1])))
                    });
                }

                const newBlock = `${targetOpenTag}${newContent}</ce:para>`;
                
                // Diff Stats
                const charDiff = diffChars(targetFullMatch, newBlock);
                let addedChars = 0;
                let removedChars = 0;
                charDiff.forEach(part => {
                    if (part.added) addedChars += part.value.length;
                    if (part.removed) removedChars += part.value.length;
                });

                newLogs.push({
                    id: logCounter++,
                    paraId: targetParaId,
                    status: 'success',
                    stats: {
                        remapped: remappedCount,
                        restored: restoredCount,
                        total: detectedRefs.length
                    },
                    diffStats: {
                        added: addedChars,
                        removed: removedChars
                    },
                    detectedRefs: detectedRefs
                });

                replacements.push({
                    start: targetIndex,
                    end: targetIndex + targetFullMatch.length,
                    replacement: newBlock
                });
            }

            // 6. Apply Replacements
            replacements.sort((a, b) => b.start - a.start);
            let finalOutput = input;
            replacements.forEach(rep => {
                finalOutput = finalOutput.substring(0, rep.start) + rep.replacement + finalOutput.substring(rep.end);
            });

            setOutput(finalOutput);
            setLastProcessedInput(input);
            setLogs(newLogs);
            generateDiff(input, finalOutput);
            setActiveTab('report');
            setToast({ msg: `Successfully synced ${count} paragraph pairs.`, type: "success" });
            setIsLoading(false);

        }, 800);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Result copied!", type: "success" }));
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setLastProcessedInput('');
        setLogs([]);
        setToast({ msg: "All fields cleared.", type: "warn" });
    };

    const isStale = output && input !== lastProcessedInput;

    useKeyboardShortcuts({
        onPrimary: processSync,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, syncDirection, customStartId]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {/* Header */}
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">View Synchronizer</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                    Mirror content between paragraph views while maintaining ID integrity and references.
                </p>
            </div>

            {/* Controls Card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-col md:flex-row gap-8 items-center w-full md:w-auto">
                    <div className="flex flex-col gap-2 w-full md:w-auto">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Synchronization Flow</span>
                        <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setSyncDirection('compact-to-extended')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${syncDirection === 'compact-to-extended' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span>Compact</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                <span>Extended</span>
                            </button>
                            <button 
                                onClick={() => setSyncDirection('extended-to-compact')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${syncDirection === 'extended-to-compact' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span>Extended</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                <span>Compact</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="hidden md:block w-px h-12 bg-slate-100"></div>

                    <div className="flex flex-col gap-2 w-full md:w-auto">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ID Configuration</span>
                        <div className="flex items-center gap-2">
                             <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-mono">#</span>
                                <input 
                                    type="number" 
                                    value={customStartId}
                                    onChange={(e) => setCustomStartId(e.target.value)}
                                    placeholder="Auto (4000)"
                                    className="pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 w-36 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-400"
                                />
                             </div>
                             {customStartId && (
                                <button onClick={() => setCustomStartId('')} className="text-xs text-slate-400 hover:text-red-500 font-medium px-1">
                                    Reset
                                </button>
                             )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
                    <button 
                        onClick={scanForMismatches} 
                        disabled={isLoading}
                        className="flex-shrink-0 group bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait hover:-translate-y-0.5"
                    >
                        <span className="flex items-center gap-2">
                            <Search className="w-5 h-5" />
                            <span>Scan Mismatches</span>
                        </span>
                    </button>

                    <button 
                        onClick={processSync} 
                        disabled={isLoading}
                        title="Ctrl+Enter"
                        className="flex-shrink-0 group bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait hover:-translate-y-0.5"
                    >
                        <span className="flex items-center gap-2">
                            <span>Sync Paragraphs</span>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </span>
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className={`grid gap-6 h-[calc(100vh-320px)] min-h-[600px] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                
                {/* Input Section - Hidden in Diff Mode */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-indigo-100 transition-all ${activeTab === 'diff' ? 'hidden' : 'flex'}`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-indigo-600 font-mono shadow-sm">1</span>
                            Input XML
                        </label>
                        <button onClick={clearAll} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder="Paste XML containing both Compact and Extended paragraphs..."
                        spellCheck={false}
                    />
                </div>
                
                {/* Output Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">2</span>
                            Results
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    STALE
                                </span>
                            )}
                        </label>
                        {output && activeTab === 'raw' && (
                            <div className="flex items-center gap-2">
                                {isStale && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter hidden sm:block">Input changed - Re-sync required</span>}
                                <button 
                                    onClick={copyOutput} 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 hover:bg-emerald-50 border-transparent hover:border-emerald-100'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    {isStale ? 'Copy Stale XML' : 'Copy XML'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         {['raw', 'diff', 'report', 'mismatches'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === tab 
                                    ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'raw' && 'Raw XML'}
                                {tab === 'diff' && 'Diff View'}
                                {tab === 'report' && `Log (${logs.length})`}
                                {tab === 'mismatches' && `Mismatches (${mismatches.length})`}
                             </button>
                         ))}
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                         {isLoading && <LoadingOverlay message="Synchronizing..." color="indigo" />}
                         
                         {activeTab === 'raw' && (
                             <div className="flex-grow relative">
                                 <textarea 
                                    value={output}
                                    readOnly
                                    className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed placeholder-slate-300" 
                                    placeholder="Synchronized XML will appear here..."
                                />
                             </div>
                         )}

                         {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-hidden bg-white flex flex-col">
                                 {diffRows.length > 0 ? (
                                    <>
                                        <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar relative p-2">
                                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                                                <table className="w-full text-sm font-mono border-collapse table-fixed bg-white">
                                                    <colgroup>
                                                        <col className="w-10 bg-slate-50" />
                                                        <col className="w-[calc(50%-2.5rem)]" />
                                                        <col className="w-10 bg-slate-50 border-l border-slate-200" />
                                                        <col className="w-[calc(50%-2.5rem)]" />
                                                    </colgroup>
                                                    <tbody>
                                                        {diffRows.map((row) => {
                                                            let lClass = row.leftNum !== null && row.type === 'delete' ? 'bg-rose-50/50' : (row.type === 'replace' ? 'bg-rose-50/30' : '');
                                                            let rClass = row.rightNum !== null && row.type === 'insert' ? 'bg-emerald-50/50' : (row.type === 'replace' ? 'bg-emerald-50/30' : '');
                                                            if (row.type === 'equal') { lClass = ''; rClass = ''; }

                                                            return (
                                                                <tr 
                                                                    key={row.id} 
                                                                    className="hover:bg-slate-50 transition-colors duration-75 group"
                                                                    data-change-index={row.changeIndex}
                                                                    data-change-index-group={row.isFirstInGroup ? row.changeIndex : undefined}
                                                                    data-type={row.type}
                                                                >
                                                                    <td className={`w-10 text-right text-[10px] text-slate-300 p-1 border-r border-slate-100 select-none bg-slate-50/50 font-mono ${lClass}`}>{row.leftNum || ''}</td>
                                                                    <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: row.leftContent || ''}}></td>
                                                                    <td className={`w-10 text-right text-[10px] text-slate-300 p-1 border-r border-slate-100 border-l select-none bg-slate-50/50 font-mono ${rClass}`}>{row.rightNum || ''}</td>
                                                                    <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: row.rightContent || ''}}></td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Floating Diff Navigation */}
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
                                    </>
                                 ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <GitCompare size={48} strokeWidth={1} className="mb-3 text-slate-300" />
                                        <p className="text-sm font-medium uppercase tracking-widest">Run sync to view differences</p>
                                    </div>
                                 )}
                             </div>
                         )}

                         {activeTab === 'mismatches' && (
                            <div className="h-full bg-white flex flex-col overflow-auto custom-scrollbar p-4">
                                {mismatches.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                            <div>
                                                <h4 className="text-sm font-bold text-amber-900">Unsynchronized Pairs Detected</h4>
                                                <p className="text-xs text-amber-700 mt-1">
                                                    The following paragraphs have differing text content between their Compact and Extended views.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid gap-4">
                                            {mismatches.map((m, i) => (
                                                <div key={i} className="group border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300">
                                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center group-hover:bg-indigo-50 transition-colors">
                                                        <span className="text-xs font-bold text-slate-700 font-mono group-hover:text-indigo-700">ID: {m.paraId}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Pair Index: {m.index}</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                                                        <div className="p-4">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Compact View Text</div>
                                                            <div className="text-xs text-slate-600 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                                                                {renderMismatchDiff(m.compactText, m.extendedText, 'compact')}
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-slate-50/30 group-hover:bg-white transition-colors">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Extended View Text</div>
                                                            <div className="text-xs text-slate-600 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                                                                {renderMismatchDiff(m.compactText, m.extendedText, 'extended')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <CheckCircle size={48} strokeWidth={1} className="mb-3 text-emerald-400" />
                                        <p className="text-sm font-medium uppercase tracking-widest">No mismatches found</p>
                                        <p className="text-xs mt-2">All paragraph pairs are perfectly synchronized.</p>
                                    </div>
                                )}
                            </div>
                         )}

                         {activeTab === 'report' && (
                            <div className="h-full bg-white flex flex-col">
                                <div className="overflow-auto custom-scrollbar p-0 flex-grow">
                                    <table className="min-w-full w-full border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Para ID</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-40">Operations</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">References Handled</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {logs.map(log => (
                                                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-4 py-3 align-top">
                                                        <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 block text-center truncate w-full shadow-sm">
                                                            {log.paraId}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        {log.message ? (
                                                            <span className={`text-xs font-medium ${
                                                                log.status === 'error' ? 'text-rose-600' : 'text-amber-600'
                                                            }`}>
                                                                {log.message}
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex gap-2">
                                                                    {log.stats && log.stats.restored > 0 && (
                                                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                                            {log.stats.restored} Restored
                                                                        </span>
                                                                    )}
                                                                    {log.stats && log.stats.remapped > 0 && (
                                                                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                            {log.stats.remapped} Remapped
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {log.diffStats && (
                                                                    <div className="flex gap-2 text-[10px] font-mono border-t border-dashed border-slate-100 pt-1">
                                                                        <span className="text-emerald-600 font-semibold">+{log.diffStats.added} chars</span>
                                                                        <span className="text-rose-600 font-semibold">-{log.diffStats.removed} chars</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {log.detectedRefs.length > 0 ? (
                                                                log.detectedRefs.map((ref, idx) => (
                                                                    <div 
                                                                        key={idx} 
                                                                        className={`group relative inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] border transition-all ${
                                                                            ref.isRestored 
                                                                            ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-sm' 
                                                                            : 'bg-slate-50 text-slate-600 border-slate-200'
                                                                        }`} 
                                                                    >
                                                                        <span className="font-mono opacity-60">{ref.refid || ref.tagName}</span>
                                                                        <span className={`font-semibold max-w-[100px] truncate ${ref.isRestored ? 'text-amber-700' : 'text-slate-700'}`}>
                                                                            {ref.text}
                                                                        </span>
                                                                        {/* Tooltip */}
                                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[200px] p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg z-20 whitespace-normal break-words text-center">
                                                                            {ref.text}
                                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className="text-[10px] text-slate-300 italic">No references</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {logs.length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-20 text-center flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                        <p className="text-sm">Ready to sync. Paste XML and click Sync.</p>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                         )}
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ViewSync;
