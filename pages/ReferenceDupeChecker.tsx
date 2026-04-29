
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Search, 
    Trash2, 
    Copy, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    Info, 
    FileText, 
    GitCompare, 
    ArrowRight, 
    ChevronRight, 
    History, 
    LayoutDashboard,
    X,
    Clipboard,
    Zap,
    Layers,
    ShieldCheck,
    ArrowDownWideNarrow,
    Filter,
    UploadCloud,
    FileCode,
    ChevronUp,
    ChevronDown,
    Lightbulb
} from 'lucide-react';
import * as Diff from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefItem {
    id: string;
    label: string;
    fullTag: string;
    cleanTitle: string;
    displayContent: string;
    author?: string;
    year?: string;
    title?: string;
}

interface DupeGroup {
    id: number;
    items: RefItem[];
    selectedId: string;
    resolutionMode: 'merge' | 'ignore';
}

interface CitationChangeAudit {
    type: 'relinked' | 'split' | 'collapsed' | 'normalized';
    original: string;
    result: string;
}

interface BibRemovalAudit {
    id: string;
    label: string;
    replacedBy: string;
    replacedByLabel: string;
}

interface DetailedMergeLog {
    bibRemovals: BibRemovalAudit[];
    citationAudits: CitationChangeAudit[];
}

const ReferenceDupeChecker: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [groups, setGroups] = useState<DupeGroup[]>([]);
    const [step, setStep] = useState<'input' | 'resolve' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [stats, setStats] = useState({ groups: 0, removed: 0, remapped: 0, totalRefs: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [inputStats, setInputStats] = useState({ refCount: 0, isValid: false });

    const [activeTab, setActiveTab] = useState<'xml' | 'report' | 'diff'>('xml');
    const [mergeLog, setMergeLog] = useState<DetailedMergeLog>({ bibRemovals: [], citationAudits: [] });
    const [isDiffing, setIsDiffing] = useState(false);
    const [diffRows, setDiffRows] = useState<any[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Tags
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g,
                '$1<span class="text-slate-400 italic">$2</span><span class="text-slate-500">$3</span><span class="text-emerald-400">$4</span>'
            );
            return `<span class="text-emerald-500 font-bold">${prefix}${tag}</span>${coloredAttrs}<span class="text-emerald-500 font-bold">${suffix}</span>`;
        });

        // Labels
        html = html.replace(/(&lt;ce:label&gt;)(.*?)(&lt;\/ce:label&gt;)/g, '$1<span class="text-emerald-400 font-black bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 shadow-sm">$2</span>$3');
        
        // IDs
        html = html.replace(/(id=&quot;)(.*?)(&quot;)/g, '$1<span class="text-amber-400 font-mono font-bold">$2</span>$3');
        
        // RefIDs
        html = html.replace(/(refid=&quot;)(.*?)(&quot;)/g, '$1<span class="text-blue-400 font-mono font-bold">$2</span>$3');

        return html;
    };

    const buildLines = (diffParts: Diff.Change[], isLeft: boolean) => {
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-500/20 text-rose-300 line-through decoration-rose-500/50');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-500/20 text-emerald-300 font-bold');
            else if (!part.added && !part.removed) append(part.value, null);
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);

        // Remove trailing empty line if it was caused by a trailing newline in the diff data
        if (lines.length > 1 && lines[lines.length - 1].replace(/<[^>]+>/g, '') === '') {
            lines.pop();
        }
        
        return lines;
    };

    const generateDiff = (original: string, modified: string) => {
        if (!original && !modified) {
            setDiffRows([]);
            setTotalChanges(0);
            setCurrentChangeIndex(0);
            return;
        }
        
        setIsDiffing(true);
        // Use a slight delay to allow UI to show loading state
        setTimeout(() => {
            try {
                // Ensure Diff library is available
                const diffLib = Diff as any;
                const diffLinesFn = diffLib.diffLines || (diffLib.default && diffLib.default.diffLines);
                const diffWordsFn = diffLib.diffWordsWithSpace || (diffLib.default && diffLib.default.diffWordsWithSpace);

                if (typeof diffLinesFn !== 'function') {
                    throw new Error("Diff library not properly loaded");
                }

                const diff = diffLinesFn(original || '', modified || '');
                let rows: any[] = [];
                let leftLineNum = 1;
                let rightLineNum = 1;
                let i = 0;
                let changeCounter = 0;
                
                while (i < diff.length) {
                    const current = diff[i];
                    const next = diff[i + 1];
                    
                    let type: 'equal' | 'replace' | 'delete' | 'insert' = 'equal';
                    let leftVal = '', rightVal = '';
                    
                    if (current.removed && next?.added) {
                        type = 'replace'; 
                        leftVal = current.value; 
                        rightVal = next.value; 
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
                        type = 'equal';
                        leftVal = rightVal = current.value; 
                        i++;
                    }

                    let leftLines: string[] = [];
                    let rightLines: string[] = [];

                    if (type === 'replace') {
                        const wordDiff = diffWordsFn(leftVal, rightVal);
                        leftLines = buildLines(wordDiff, true);
                        rightLines = buildLines(wordDiff, false);
                    } else if (type === 'delete') {
                        leftLines = buildLines([{ removed: true, value: leftVal } as Diff.Change], true);
                    } else if (type === 'insert') {
                        rightLines = buildLines([{ added: true, value: rightVal } as Diff.Change], false);
                    } else {
                        const lines = leftVal.split('\n');
                        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
                        leftLines = lines.map(escapeHtml);
                        rightLines = [...leftLines];
                    }

                    const maxRows = Math.max(leftLines.length, rightLines.length);
                    const isChange = type !== 'equal';
                    if (isChange) changeCounter++;

                    for (let r = 0; r < maxRows; r++) {
                        rows.push({
                            leftNum: leftLines[r] !== undefined ? leftLineNum++ : null,
                            leftContent: leftLines[r] || '',
                            rightNum: rightLines[r] !== undefined ? rightLineNum++ : null,
                            rightContent: rightLines[r] || '',
                            type,
                            id: `diff-${i}-${r}-${Math.random().toString(36).substring(2, 7)}`,
                            changeIndex: isChange ? changeCounter : null,
                            isFirstInGroup: isChange && r === 0
                        });
                    }
                }
                setDiffRows(rows);
                setTotalChanges(changeCounter);
                setCurrentChangeIndex(changeCounter > 0 ? 1 : 0);
            } catch (error) {
                console.error("Diff generation failed:", error);
                setToast({ msg: "Failed to generate diff view", type: "error" });
                setDiffRows([]);
                setTotalChanges(0);
                setCurrentChangeIndex(0);
            } finally {
                setIsDiffing(false);
            }
        }, 150);
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
            allRows.forEach(r => r.classList.remove('bg-emerald-500/20', 'bg-rose-500/20', 'ring-1', 'ring-emerald-500/50', 'ring-rose-500/50', 'z-10', 'relative'));
            
            rows.forEach(row => {
                const type = row.getAttribute('data-type');
                if (type === 'insert' || type === 'replace') {
                    row.classList.add('bg-emerald-500/20', 'ring-1', 'ring-emerald-500/50', 'z-10', 'relative');
                } else if (type === 'delete') {
                    row.classList.add('bg-rose-500/20', 'ring-1', 'ring-rose-500/50', 'z-10', 'relative');
                }
            });
        }
    }, [currentChangeIndex]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!input.trim()) {
                setInputStats({ refCount: 0, isValid: false });
                return;
            }
            const refMatches = input.match(/<ce:bib-reference\b/g);
            const count = refMatches ? refMatches.length : 0;
            const isValid = input.trim().startsWith('<') && input.includes('</');
            setInputStats({ refCount: count, isValid });
        }, 300);
        return () => clearTimeout(timer);
    }, [input]);

    const analyzeReferences = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML content.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const regex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
                const refs: RefItem[] = [];
                let match;
                while ((match = regex.exec(input)) !== null) {
                    const fullTag = match[0]; const attrs = match[1]; const content = match[2];
                    const idMatch = attrs.match(/id="([^"]+)"/);
                    const id = idMatch ? idMatch[1] : `gen_${Math.random().toString(36).substring(2, 11)}`;
                    
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                    const label = labelMatch ? labelMatch[1].trim() : '';

                    // Precision: Extract Author and Year to prevent false positives for identical titles
                    const surnameMatch = content.match(/<(?:ce|sb):surname>(.*?)<\/(?:ce|sb):surname>/);
                    const author = surnameMatch ? surnameMatch[1].trim() : '';
                    const authorKey = author.toLowerCase().replace(/[^a-z]/g, '');
                    
                    const dateMatch = content.match(/<(?:ce|sb):year>(.*?)<\/(?:ce|sb):year>/) || 
                                     content.match(/<(?:ce|sb):date>(.*?)<\/(?:ce|sb):date>/);
                    const year = dateMatch ? dateMatch[1].trim() : '';
                    const yearKey = year.replace(/\D/g, '');

                    let title = '';
                    const titleMatch = content.match(/<ce:title>(.*?)<\/ce:title>/) || content.match(/<sb:title>(.*?)<\/sb:title>/);
                    if (titleMatch) title = titleMatch[1].trim();
                    else title = content.replace(/<ce:label>.*?<\/ce:label>/, '').replace(/<[^>]+>/g, ' ').trim();
                    
                    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Combined Key: Author + Year + Title
                    const robustKey = `${authorKey}|${yearKey}|${cleanTitle}`;

                    if (cleanTitle.length > 3) {
                        refs.push({ 
                            id, 
                            label, 
                            fullTag, 
                            cleanTitle: robustKey, 
                            displayContent: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) + '...',
                            author,
                            year,
                            title
                        });
                    }
                }
                const visited = new Set<string>(); const newGroups: DupeGroup[] = []; let groupId = 1;
                for (let i = 0; i < refs.length; i++) {
                    const itemI = refs[i];
                    if (visited.has(itemI.id)) continue;
                    const currentGroup: RefItem[] = [itemI]; 
                    visited.add(itemI.id);
                    for (let j = i + 1; j < refs.length; j++) {
                        const itemJ = refs[j];
                        if (visited.has(itemJ.id)) continue;
                        
                        // Using robust similarity on Author|Year|Title
                        if (getSimilarity(itemI.cleanTitle, itemJ.cleanTitle) > 0.88) { 
                            currentGroup.push(itemJ); 
                            visited.add(itemJ.id); 
                        }
                    }
                    if (currentGroup.length > 1) newGroups.push({ 
                        id: groupId++, 
                        items: currentGroup, 
                        selectedId: currentGroup[0].id,
                        resolutionMode: 'merge'
                    });
                }
                if (newGroups.length === 0) { setToast({ msg: "No duplicates found!", type: "success" }); setIsLoading(false); return; }
                setStats(s => ({ ...s, totalRefs: refs.length }));
                setGroups(newGroups); setStep('resolve'); setIsLoading(false);
            } catch (error: any) { setIsLoading(false); }
        }, 600);
    };

    const handleSelection = (groupId: number, selectedRefId: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, selectedId: selectedRefId, resolutionMode: 'merge' } : g));
    };

    const toggleResolutionMode = (groupId: number, mode: 'merge' | 'ignore') => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, resolutionMode: mode } : g));
    };

    const processMerge = () => {
        setIsLoading(true);
        setTimeout(() => {
            try {
                // 1. Global Mapping Setup
                const globalIdToLabel = new Map<string, string>();
                const allRefsRegex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
                let refMatch;
                while ((refMatch = allRefsRegex.exec(input)) !== null) {
                    const idM = refMatch[1].match(/id="([^"]+)"/);
                    const labelM = refMatch[2].match(/<ce:label>(.*?)<\/ce:label>/);
                    if (idM && labelM) {
                        globalIdToLabel.set(idM[1], labelM[1].trim());
                    }
                }

                /**
                 * Robust Label Formatting:
                 * Ensures numeric labels are bracketed [X], 
                 * while Name-date references are left as-is.
                 */
                const formatCitationLabel = (label: string) => {
                    const clean = label.trim().replace(/[\[\]]/g, '');
                    const isNumeric = /^\d+$/.test(clean);
                    return isNumeric ? `[${clean}]` : clean;
                };

                const remappedIds = new Map<string, string>();
                const bibRemovals: BibRemovalAudit[] = [];
                const citationAudits: CitationChangeAudit[] = [];

                groups.forEach(group => {
                    if (group.resolutionMode === 'ignore') return;
                    
                    const keeper = group.items.find(i => i.id === group.selectedId);
                    if (!keeper) return;
                    group.items.forEach(item => {
                        if (item.id !== keeper.id) {
                            remappedIds.set(item.id, keeper.id);
                            bibRemovals.push({ 
                                id: item.id, 
                                label: item.label, 
                                replacedBy: keeper.id,
                                replacedByLabel: keeper.label
                            });
                        }
                    });
                });

                let cfCounter = 4500;
                // Detect existing cf IDs to avoid collisions
                // We strictly match 1-4 digit IDs to avoid "self-infection" from long numbers
                const existingCfMatches = input.match(/id="cf(\d{1,4})"/g);
                if (existingCfMatches) {
                    const maxId = existingCfMatches.reduce((max, curr) => {
                        const m = curr.match(/id="cf(\d{1,4})"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    cfCounter = Math.ceil((maxId + 10) / 10) * 10;
                }

                let processedXml = input;

                // 2. Robust Citation Processing
                // We combine both single and plural into a unified logic flow for better consistency
                const citationRegex = /<(ce:cross-ref|ce:cross-refs)\b([^>]*?)refid="([^"]+)"([^>]*?)>([\s\S]*?)<\/\1>/g;
                
                processedXml = processedXml.replace(citationRegex, (match: string, tagName: string, before: string, refidAttr: string, after: string, content: string): string => {
                    const originalIds = refidAttr.split(/\s+/).filter(id => id.trim() !== '');
                    const hasRemapped = originalIds.some(id => remappedIds.has(id));
                    
                    // Even if not remapped, we might want to normalize formatting if requested
                    if (!hasRemapped) return match;

                    const updatedIds = originalIds.map(id => remappedIds.get(id) || id);
                    const uniqueIds = [...new Set(updatedIds)];

                    // If it was multiple IDs and now it's one, it becomes a ce:cross-ref
                    const targetTagName = uniqueIds.length === 1 ? 'ce:cross-ref' : 'ce:cross-refs';

                    const citationData = uniqueIds.map(id => {
                        const rawLabel = globalIdToLabel.get(id) || "??";
                        const numericValue = parseInt(rawLabel.replace(/\D/g, ''), 10) || 0;
                        return { id, label: rawLabel, num: numericValue };
                    });

                    // Sort by numeric value for proper range detection
                    citationData.sort((a, b) => a.num - b.num);

                    const chunks: (typeof citationData)[] = [];
                    if (citationData.length > 0) {
                        let currentChunk = [citationData[0]];
                        for (let i = 1; i < citationData.length; i++) {
                            // Check if sequential
                            if (citationData[i].num === citationData[i-1].num + 1 && citationData[i].num !== 0) {
                                currentChunk.push(citationData[i]);
                            } else {
                                chunks.push(currentChunk);
                                currentChunk = [citationData[i]];
                            }
                        }
                        chunks.push(currentChunk);
                    }

                    // Rebuild the citation string
                    const rebuiltFragments = chunks.map(chunk => {
                        const tagId = `cf${cfCounter}`;
                        cfCounter += 5;
                        
                        // Check if all labels in chunk are numeric for range logic
                        const isNumericRange = chunk.every(c => /^\d+$/.test(c.label.replace(/[\[\]]/g, '')));

                        if (chunk.length === 1) {
                            const label = formatCitationLabel(chunk[0].label);
                            return `<ce:cross-ref id="${tagId}" refid="${chunk[0].id}">${label}</ce:cross-ref>`;
                        } else if (chunk.length === 2 || !isNumericRange) {
                            // For 2 items or non-numeric labels, use comma separation
                            const labels = chunk.map(c => formatCitationLabel(c.label)).join(', ');
                            const ids = chunk.map(c => c.id).join(' ');
                            return `<ce:cross-refs id="${tagId}" refid="${ids}">${labels}</ce:cross-refs>`;
                        } else {
                            // For 3+ numeric items, use range [1–5]
                            const ids = chunk.map(item => item.id).join(' ');
                            const start = chunk[0].label.replace(/[\[\]]/g, '');
                            const end = chunk[chunk.length - 1].label.replace(/[\[\]]/g, '');
                            const rangeLabel = `[${start}–${end}]`;
                            return `<ce:cross-refs id="${tagId}" refid="${ids}">${rangeLabel}</ce:cross-refs>`;
                        }
                    });

                    const finalResult = rebuiltFragments.join(', ');
                    
                    // Audit logic
                    let opType: 'relinked' | 'split' | 'collapsed' | 'normalized' = 'relinked';
                    if (rebuiltFragments.length > 1 && originalIds.length === 1) opType = 'split';
                    else if (uniqueIds.length < originalIds.length) opType = 'collapsed';
                    else if (uniqueIds.length === originalIds.length) opType = 'normalized';

                    citationAudits.push({ 
                        type: opType, 
                        original: match, 
                        result: finalResult 
                    });
                    
                    return finalResult;
                });

                // 3. Bibliography Stripping
                bibRemovals.forEach(removal => {
                    const escapedId = removal.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const refRemovalRegex = new RegExp(`<ce:bib-reference\\b[^>]*?\\bid="${escapedId}"[^>]*>[\\s\\S]*?<\\/ce:bib-reference>\\s*`, 'g');
                    processedXml = processedXml.replace(refRemovalRegex, '');
                });

                setOutput(processedXml);
                setStats({ groups: groups.length, removed: bibRemovals.length, remapped: citationAudits.length, totalRefs: stats.totalRefs });
                setMergeLog({ bibRemovals, citationAudits });
                generateDiff(input, processedXml);
                setStep('result');
                setActiveTab('report');
                setToast({ msg: "Audit complete. XML updated with robust citation re-linking.", type: "success" });
            } catch (error: any) {
                console.error(error);
                setToast({ msg: "Error during merge process.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    const handlePaste = async () => { try { setInput(await navigator.clipboard.readText()); setToast({ msg: "Pasted from clipboard", type: "info" }); } catch (err: any) { setToast({ msg: "Clipboard access denied", type: "error" }); } };

    const loadSample = () => {
        const sample = `<?xml version="1.0" encoding="UTF-8"?>
<ce:bibliography>
    <ce:bib-reference id="bib1">
        <ce:label>1</ce:label>
        <sb:reference>
            <sb:contribution>
                <sb:authors>
                    <sb:author><ce:surname>Smith</ce:surname></sb:author>
                </sb:authors>
                <sb:title>A Study on XML Processing</sb:title>
            </sb:contribution>
            <sb:host>
                <sb:issue><sb:series><sb:title>Journal of Data</sb:title></sb:series></sb:issue>
                <sb:date><sb:year>2023</sb:year></sb:date>
            </sb:host>
        </sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib2">
        <ce:label>2</ce:label>
        <sb:reference>
            <sb:contribution>
                <sb:authors>
                    <sb:author><ce:surname>Smith</ce:surname></sb:author>
                </sb:authors>
                <sb:title>A Study on XML Processing</sb:title>
            </sb:contribution>
            <sb:host>
                <sb:issue><sb:series><sb:title>Journal of Data</sb:title></sb:series></sb:issue>
                <sb:date><sb:year>2023</sb:year></sb:date>
            </sb:host>
        </sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib3">
        <ce:label>3</ce:label>
        <sb:reference>
            <sb:contribution>
                <sb:authors>
                    <sb:author><ce:surname>Jones</ce:surname></sb:author>
                </sb:authors>
                <sb:title>Advanced Reference Management</sb:title>
            </sb:contribution>
            <sb:host>
                <sb:issue><sb:series><sb:title>Editorial Review</sb:title></sb:series></sb:issue>
                <sb:date><sb:year>2024</sb:year></sb:date>
            </sb:host>
        </sb:reference>
    </ce:bib-reference>
    <ce:sections>
        <ce:para>As discussed in <ce:cross-ref refid="bib1">1</ce:cross-ref> and <ce:cross-ref refid="bib2">2</ce:cross-ref>, XML is powerful. See also <ce:cross-ref refid="bib3">3</ce:cross-ref>.</ce:para>
    </ce:sections>
</ce:bibliography>`;
        setInput(sample);
        setToast({ msg: "Sample XML loaded", type: "success" });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        readFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        readFile(file);
    };

    const readFile = (file: File) => {
        if (!file.name.toLowerCase().endsWith('.xml') && file.type !== 'text/xml') {
            setToast({ msg: "Please upload an XML file", type: "error" });
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setInput(content);
            setToast({ msg: `Loaded: ${file.name}`, type: "success" });
        };
        reader.onerror = () => setToast({ msg: "Error reading file", type: "error" });
        reader.readAsText(file);
    };
    const copyOutput = () => { navigator.clipboard.writeText(output); setToast({ msg: "Copied XML!", type: "success" }); };

    const copyReport = () => {
        let report = `REFERENCE DUPE REMOVER AUDIT REPORT\n`;
        report += `====================================\n\n`;
        report += `SUMMARY:\n`;
        report += `- Duplicate Groups Found: ${stats.groups}\n`;
        report += `- Bibliography Items Removed: ${stats.removed}\n`;
        report += `- Citations Remapped: ${stats.remapped}\n\n`;
        
        report += `BIBLIOGRAPHY REMOVALS:\n`;
        mergeLog.bibRemovals.forEach(rem => {
            report += `- Removed [${rem.label}] (ID: ${rem.id}) -> Replaced by [${rem.replacedByLabel}] (ID: ${rem.replacedBy})\n`;
        });
        
        report += `\nCITATION REMAPPINGS:\n`;
        mergeLog.citationAudits.forEach((aud, idx) => {
            report += `[${idx}] Type: ${aud.type}\n`;
            report += `    Original: ${aud.original}\n`;
            report += `    Result:   ${aud.result}\n`;
        });

        navigator.clipboard.writeText(report);
        setToast({ msg: "Audit report copied to clipboard!", type: "success" });
    };

    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        const q = searchQuery.toLowerCase();
        return groups.filter(g => 
            g.items.some(item => 
                item.id.toLowerCase().includes(q) || 
                item.label.toLowerCase().includes(q) || 
                item.displayContent.toLowerCase().includes(q) ||
                (item.author && item.author.toLowerCase().includes(q)) ||
                (item.title && item.title.toLowerCase().includes(q))
            )
        );
    }, [groups, searchQuery]);

    useKeyboardShortcuts({
        onClear: () => {
            setInput('');
            setGroups([]);
            setStep('input');
            setToast({ msg: "Cleared", type: "warn" });
        }
    }, [input]);

    return (
        <div className="max-w-full mx-auto px-4 py-12 sm:px-6 lg:px-8 font-sans bg-slate-50/50 min-h-screen">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-200 pb-12"
            >
                <div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-200 ring-4 ring-white">
                            <GitCompare className="h-7 w-7 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Module_Ref_024</span>
                            <span className="text-[11px] font-serif italic text-slate-400 capitalize">Precision editorial workflows</span>
                        </div>
                    </div>
                    <h1 className="text-6xl font-black text-slate-900 tracking-tight uppercase leading-none">
                        Reference <span className="text-indigo-600/40">Dupe</span> <span className="text-slate-900">Relinker</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-6 font-medium max-w-2xl leading-relaxed">
                        Identify and consolidate duplicate bibliography nodes. This engine automatically detects similarities and re-links your in-text citations to a primary reference.
                    </p>
                </div>

                <div className="flex items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                    {[
                        { id: 'input', label: 'Upload', icon: FileText },
                        { id: 'resolve', label: 'Consolidate', icon: Layers },
                        { id: 'result', label: 'Verify', icon: ShieldCheck }
                    ].map((s, idx) => (
                        <React.Fragment key={s.id}>
                            <div className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 ${step === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                                <s.icon size={14} strokeWidth={2.5} />
                                <span className="text-[11px] font-bold uppercase tracking-widest">{s.label}</span>
                            </div>
                            {idx < 2 && <div className="w-px h-6 bg-slate-100 mx-2"></div>}
                        </React.Fragment>
                    ))}
                </div>
            </motion.div>

            <div className="bg-white rounded-[2rem] border border-slate-200 h-[calc(100vh-320px)] min-h-[700px] flex flex-col relative shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] overflow-hidden">
                <AnimatePresence mode="wait">
                    {isLoading && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center"
                        >
                            <div className="relative w-24 h-24 mb-6">
                                <motion.div 
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-0 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Zap className="h-8 w-8 text-emerald-500 animate-pulse" />
                                </div>
                            </div>
                            <p className="text-sm font-black text-white uppercase tracking-[0.3em] animate-pulse">
                                {step === 'input' ? "Scanning duplicates..." : "Relinking citations..."}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {step === 'input' && (
                        <motion.div 
                            key="input"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col h-full flex-grow overflow-hidden relative z-10"
                        >
                            <div className="bg-slate-50 px-8 py-5 border-b border-slate-100 flex justify-between items-center sm:flex-row flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                                        <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Source Document</span>
                                    </div>
                                    <div className="h-4 w-px bg-slate-200"></div>
                                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 uppercase">
                                        <span className="text-slate-900/60">Parsed Nodes:</span> {inputStats.refCount}
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap justify-center">
                                    <button 
                                        onClick={loadSample}
                                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-slate-600"
                                    >
                                        <FileCode size={12} className="text-indigo-500" /> Sample
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center gap-2"
                                    >
                                        <UploadCloud size={12} /> Upload XML
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileUpload} 
                                        accept=".xml,text/xml" 
                                        className="hidden" 
                                    />
                                    <button onClick={handlePaste} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-slate-600">
                                        <Clipboard size={12} className="text-indigo-500" /> Paste
                                    </button>
                                    <button 
                                        onClick={() => setInput('')} 
                                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                    >
                                        <Trash2 size={12} /> Reset
                                    </button>
                                </div>
                            </div>
                            <div 
                                className={`flex-grow flex flex-col relative overflow-hidden transition-all duration-500 rounded-b-[2rem] ${isDragging ? 'bg-indigo-500/5' : 'bg-slate-50/30'}`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                            >
                                <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
                                <AnimatePresence>
                                    {isDragging && (
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 z-30 bg-indigo-600/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none p-12"
                                        >
                                            <div className="bg-white p-12 rounded-[2rem] shadow-2xl shadow-indigo-200 border border-indigo-100 flex flex-col items-center gap-6">
                                                <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-300">
                                                    <UploadCloud size={32} />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-black text-slate-900 uppercase tracking-widest">Ingest XML Stream</p>
                                                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-2">Release to begin similarity analysis</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                
                                {!input && !isDragging && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none z-10">
                                        <div className="w-32 h-32 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-dashed border-slate-200 bg-white/80 shadow-xl shadow-slate-100 text-slate-300 group">
                                            <FileCode size={48} strokeWidth={1} />
                                        </div>
                                        <div className="text-center px-8">
                                            <p className="font-black text-[12px] uppercase tracking-[0.5em] mb-3 text-slate-400">
                                                Awaiting Source Data
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400/60 uppercase tracking-widest leading-loose max-w-xs mx-auto">
                                                Drop XML file, paste bibliography nodes,<br /> or use the sample button above.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <textarea 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)} 
                                    className={`w-full h-full p-16 text-[13px] font-mono text-slate-600 border-0 focus:ring-0 outline-none resize-none bg-transparent leading-relaxed custom-scrollbar overflow-y-auto transition-opacity placeholder:text-slate-400 relative z-20 ${isDragging ? 'opacity-10' : 'opacity-100'}`} 
                                    spellCheck={false} 
                                    placeholder="<!-- Paste XML <ce:bib-reference> nodes here... -->"
                                />
                            </div>
                            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center sm:flex-row flex-col gap-6 relative z-10">
                                <div className="flex gap-12">
                                    <div className="hidden lg:flex flex-col max-w-sm">
                                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1 items-center gap-2 flex">
                                            <Lightbulb size={10} /> Pro Tip
                                        </span>
                                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed uppercase">
                                            For best results, paste the entire <code className="text-indigo-500 font-bold">&lt;ce:bibliography&gt;</code> block including all citation nodes.
                                        </p>
                                    </div>
                                    <div className="h-10 w-px bg-slate-200 hidden lg:block"></div>
                                    <div className="flex gap-16">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stream Complexity</span>
                                            <span className="text-sm font-bold text-slate-900">{(new Blob([input]).size / 1024).toFixed(2)} KB</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Node Density</span>
                                            <span className="text-sm font-bold text-slate-900">{inputStats.refCount} references</span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={analyzeReferences} 
                                    disabled={!inputStats.isValid || inputStats.refCount === 0} 
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-black uppercase tracking-[0.2em] px-12 py-5 rounded-2xl text-[11px] shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center gap-3 group"
                                >
                                    <Zap size={16} className="group-hover:scale-110 transition-transform" />
                                    Initialize Scan
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'resolve' && (
                        <motion.div 
                            key="resolve"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col h-full bg-slate-50/30 relative z-10"
                        >
                            <div className="relative px-10 py-8 border-b border-slate-200 bg-white flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 z-10">
                                <div className="flex flex-col sm:flex-row items-center gap-10 w-full lg:w-auto">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Resolution Matrix</h3>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">Select primary nodes for citation re-linking</p>
                                    </div>
                                    <div className="relative group w-full sm:w-80">
                                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                                            <Search size={16} />
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="Search conflict clusters..." 
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="bg-slate-50 border border-slate-200 py-4 pl-12 pr-6 text-sm font-medium text-slate-700 placeholder:text-slate-400 rounded-2xl focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 outline-none w-full transition-all"
                                        />
                                        {searchQuery && (
                                            <button 
                                                onClick={() => setSearchQuery('')}
                                                className="absolute inset-y-0 right-5 flex items-center text-slate-300 hover:text-rose-500"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <button 
                                    onClick={processMerge} 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] px-12 py-5 rounded-2xl text-[11px] shadow-xl shadow-emerald-100 transition-all active:scale-[0.98] flex items-center gap-3"
                                >
                                    <CheckCircle2 size={16} />
                                    Commit Merges
                                </button>
                            </div>
                            <div className="flex-grow overflow-auto p-10 space-y-8 custom-scrollbar">
                                {filteredGroups.length === 0 && searchQuery && (
                                    <div className="h-64 flex flex-col items-center justify-center text-slate-300 bg-white rounded-3xl border-2 border-dashed border-slate-100 mt-12">
                                        <Filter size={40} className="mb-4 opacity-50" />
                                        <p className="text-[11px] font-black uppercase tracking-[0.3em]">No matching conflict clusters</p>
                                    </div>
                                )}
                                {filteredGroups.map((group, gIdx) => (
                                    <motion.div 
                                        key={group.id}
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: gIdx * 0.05 }}
                                        className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden"
                                    >
                                        <div className="bg-slate-50/80 px-10 py-5 border-b border-slate-100 flex justify-between items-center sm:flex-row flex-col gap-8">
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[11px] font-black text-indigo-600 shadow-sm">
                                                        {group.id}
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Similarity Group</span>
                                                </div>
                                                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                                                <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-[240px]">
                                                    <button 
                                                        onClick={() => toggleResolutionMode(group.id, 'merge')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-[9px] font-black uppercase tracking-widest transition-all ${group.resolutionMode === 'merge' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                                    >
                                                        <GitCompare size={10} /> Consolidate
                                                    </button>
                                                    <button 
                                                        onClick={() => toggleResolutionMode(group.id, 'ignore')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-[9px] font-black uppercase tracking-widest transition-all ${group.resolutionMode === 'ignore' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                                    >
                                                        <Layers size={10} /> Keep Both
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${group.resolutionMode === 'ignore' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${group.resolutionMode === 'ignore' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                                                <span className="text-[11px] font-black uppercase tracking-widest">
                                                    {group.resolutionMode === 'ignore' ? 'Split Action active' : `${group.items.length} Variants found`}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={`divide-y divide-slate-100 transition-opacity duration-300 ${group.resolutionMode === 'ignore' ? 'opacity-40 grayscale pointer-events-none cursor-not-allowed' : 'opacity-100'}`}>
                                            {group.items.map(item => {
                                                const isSelected = item.id === group.selectedId;
                                                return (
                                                    <div 
                                                        key={item.id} 
                                                        onClick={() => handleSelection(group.id, item.id)} 
                                                        className={`p-10 cursor-pointer transition-all flex gap-10 group relative ${isSelected ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                                                    >
                                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600" />}
                                                        <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all shrink-0 ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-200 bg-white text-slate-300 group-hover:border-slate-300'}`}>
                                                            {isSelected ? <CheckCircle2 size={18} strokeWidth={3} /> : <div className="w-2 h-2 rounded-full bg-slate-100 group-hover:bg-slate-200" />}
                                                        </div>
                                                        <div className="flex-grow min-w-0">
                                                            <div className="flex items-center gap-4 mb-4">
                                                                <span className={`text-[10px] font-mono font-black px-3 py-1.5 rounded-lg border transition-all ${isSelected ? 'bg-white border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                                    UID: {item.id}
                                                                </span>
                                                                {item.author && (
                                                                    <span className="text-[11px] font-serif italic text-slate-500">
                                                                        {item.author} {item.year ? `· ${item.year}` : ''}
                                                                    </span>
                                                                )}
                                                                {isSelected && (
                                                                    <span className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-[0.15em] ml-auto">
                                                                        <ShieldCheck size={14} /> Designated Master
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className={`text-[13px] leading-relaxed font-serif italic ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-400 font-normal'}`}>
                                                                {item.displayContent}
                                                            </p>
                                                            {item.title && isSelected && (
                                                                <div className="mt-6 p-6 rounded-3xl bg-white border border-indigo-100 shadow-sm">
                                                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Canonical Title</p>
                                                                    <p className="text-sm text-slate-700 font-semibold leading-relaxed">{item.title}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 'result' && (
                        <motion.div 
                            key="result"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col flex-grow min-h-0 relative z-10"
                        >
                            <div className="relative bg-white px-10 py-8 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10 z-10">
                                <div className="flex flex-col sm:flex-row items-center gap-12">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-200">
                                            <History className="h-6 w-6 text-white" />
                                        </div>
                                        <div>
                                            <label className="font-black text-slate-900 text-[13px] uppercase tracking-tight block mb-0.5">Audit Workspace</label>
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">System verification and verification log</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-12">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nodes Analyzed</span>
                                            <span className="text-sm font-bold text-slate-900">{stats.totalRefs}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Purged Variants</span>
                                            <span className="text-sm font-bold text-rose-600">{stats.removed}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">Re-linked Citations</span>
                                            <span className="text-sm font-bold text-indigo-600">{stats.remapped}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 w-full lg:w-auto">
                                    <button onClick={copyReport} className="px-6 py-4 rounded-xl border border-slate-200 font-bold text-[11px] uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                                        <Clipboard size={14} className="text-indigo-500" /> Copy Report
                                    </button>
                                    <button onClick={copyOutput} className="px-8 py-4 rounded-xl bg-slate-900 text-white font-bold text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center gap-2">
                                        <Copy size={14} /> Copy XML Output
                                    </button>
                                </div>
                            </div>
                            <div className="relative bg-white px-10 pt-4 border-b border-slate-200 flex space-x-2 overflow-x-auto no-scrollbar z-20">
                                {[
                                    { id: 'report', label: 'Modification Log', icon: History },
                                    { id: 'xml', label: 'Resulting XML', icon: FileText },
                                    { id: 'diff', label: 'Visual Differential', icon: GitCompare }
                                ].map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => setActiveTab(t.id as any)} 
                                        className={`flex items-center gap-3 px-8 py-5 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x whitespace-nowrap ${activeTab === t.id ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:text-slate-600'}`}
                                    >
                                        <t.icon size={13} />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-grow bg-slate-50 overflow-hidden flex flex-col min-h-0 relative z-10">
                                {activeTab === 'xml' && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-grow flex flex-col min-h-0 p-10"
                                    >
                                        <div className="flex-grow p-12 text-[13px] font-mono text-slate-600 bg-white rounded-3xl border border-slate-200 shadow-inner overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightXml(output) }} />
                                    </motion.div>
                                )}
                                
                                {activeTab === 'report' && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-grow overflow-auto p-12 space-y-16 max-w-6xl mx-auto custom-scrollbar"
                                    >
                                        <section>
                                            <div className="flex items-center gap-5 mb-10">
                                                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                                                    <Trash2 size={18} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Consolidated Bibliography Nodes</h3>
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Duplicates successfully purged from document stream</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4">
                                                {mergeLog.bibRemovals.map((rem, idx) => (
                                                    <motion.div 
                                                        key={idx} 
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        className="flex items-center gap-10 p-8 rounded-3xl bg-white border border-slate-200 transition-all hover:bg-slate-50 group hover:shadow-lg hover:shadow-slate-100"
                                                    >
                                                        <div className="flex flex-col flex-grow min-w-0">
                                                            <div className="flex items-center gap-4 mb-2">
                                                                <span className="text-rose-600 font-bold text-sm line-through uppercase tracking-tight truncate">{rem.label}</span>
                                                                <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-200 uppercase tracking-[0.1em]">Eliminated</span>
                                                            </div>
                                                            <span className="text-[9px] text-slate-400 font-mono italic">Source ID: {rem.id}</span>
                                                        </div>
                                                        <div className="flex items-center text-slate-200">
                                                            <ArrowRight size={20} />
                                                        </div>
                                                        <div className="flex flex-col items-end shrink-0">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Absorbed By</span>
                                                            <div className="flex items-center gap-4 bg-indigo-50 px-5 py-3 rounded-2xl border border-indigo-100">
                                                                <span className="font-black text-indigo-600 text-[11px] uppercase tracking-tight">{rem.replacedByLabel}</span>
                                                                <span className="text-[9px] font-mono text-indigo-400">({rem.replacedBy})</span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                                {mergeLog.bibRemovals.length === 0 && (
                                                    <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                                                        <Info className="mx-auto mb-4 text-slate-200" size={32} />
                                                        <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No bibliography consolidation required.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-5 mb-10">
                                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                                                    <RefreshCw size={18} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Active Citation Re-Linkings</h3>
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cross-references mapped to canonical master nodes</p>
                                                </div>
                                            </div>
                                            <div className="space-y-6">
                                                {mergeLog.citationAudits.map((aud, idx) => (
                                                    <motion.div 
                                                        key={idx} 
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden"
                                                    >
                                                        <div className="bg-slate-50 px-10 py-4 border-b border-slate-100 flex justify-between items-center">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-[9px] font-black px-4 py-1.5 rounded-xl border uppercase tracking-widest ${
                                                                    aud.type === 'split' ? 'bg-amber-100 text-amber-600 border-amber-200' : 
                                                                    aud.type === 'collapsed' ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 
                                                                    aud.type === 'normalized' ? 'bg-sky-100 text-sky-600 border-sky-200' :
                                                                    'bg-slate-100 text-slate-600 border-slate-200'
                                                                }`}>
                                                                    Action: {aud.type}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] text-slate-300 font-mono font-bold tracking-[0.2em] uppercase overflow-hidden">ENTRY_SEQ_{idx.toString().padStart(3, '0')}</span>
                                                        </div>
                                                        <div className="p-10 grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-10 items-center">
                                                            <div className="space-y-3">
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Legacy Source</span>
                                                                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 text-[11px] font-mono text-rose-400 whitespace-pre-wrap break-all line-through decoration-rose-300/30 leading-relaxed min-h-[60px] flex items-center">
                                                                    {escapeHtml(aud.original)}
                                                                </div>
                                                            </div>
                                                            <div className="flex lg:flex-col items-center justify-center gap-3 text-slate-200">
                                                                <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900 shadow-sm">
                                                                    <ArrowRight className="lg:rotate-0 rotate-90" size={18} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Updated Reference</span>
                                                                <div className="p-6 rounded-3xl bg-indigo-50 border border-indigo-100 text-[11px] font-mono text-indigo-600 whitespace-pre-wrap break-all leading-relaxed shadow-sm font-bold min-h-[60px] flex items-center">
                                                                    {escapeHtml(aud.result)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                                {mergeLog.citationAudits.length === 0 && (
                                                    <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                                                        <AlertCircle className="mx-auto mb-4 text-slate-200" size={32} />
                                                        <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No citation re-mapping detected.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    </motion.div>
                                )}

                                {activeTab === 'diff' && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-grow flex flex-col min-h-0 overflow-hidden bg-slate-50 p-10 relative"
                                    >
                                        {isDiffing ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                                <div className="mb-6">
                                                   <RefreshCw className="w-12 h-12 animate-spin text-indigo-600" />
                                                </div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.3em] animate-pulse">Generating Matrix Comparison...</p>
                                            </div>
                                        ) : diffRows.length > 0 ? (
                                            <>
                                                <div className="border border-slate-200 rounded-[2rem] overflow-hidden bg-white flex-grow flex flex-col min-h-0 shadow-sm">
                                                    <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex justify-between items-center sticky top-0 z-20">
                                                        <div className="flex items-center gap-4">
                                                            <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Structural Differential</span>
                                                            <span className="text-[10px] font-mono font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                                                {diffRows.length} NODES ANALYZED
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div ref={diffContainerRef} className="overflow-auto custom-scrollbar flex-grow">
                                                        <table className="w-full text-[12px] font-mono border-collapse table-fixed bg-white">
                                                            <colgroup>
                                                                <col className="w-12 border-r border-slate-100" />
                                                                <col className="w-[calc(50%-3rem)]" />
                                                                <col className="w-12 border-r border-slate-100 border-l border-slate-100" />
                                                                <col className="w-[calc(50%-3rem)]" />
                                                            </colgroup>
                                                            <tbody>
                                                                {diffRows.map((row) => {
                                                                    let lClass = '';
                                                                    let rClass = '';
                                                                    let lNumClass = 'bg-white text-slate-300'; 
                                                                    let rNumClass = 'bg-white text-slate-300';

                                                                    if (row.type === 'delete') {
                                                                        lClass = 'bg-rose-50 text-rose-600';
                                                                        lNumClass = 'bg-rose-100 text-rose-400';
                                                                    } else if (row.type === 'insert') {
                                                                        rClass = 'bg-indigo-50 text-indigo-600';
                                                                        rNumClass = 'bg-indigo-100 text-indigo-400';
                                                                    } else if (row.type === 'replace') {
                                                                        if (row.leftNum !== null) {
                                                                            lClass = 'bg-rose-50 text-rose-600';
                                                                            lNumClass = 'bg-rose-100 text-rose-400';
                                                                        }
                                                                        if (row.rightNum !== null) {
                                                                            rClass = 'bg-indigo-50 text-indigo-600';
                                                                            rNumClass = 'bg-indigo-100 text-indigo-400';
                                                                        }
                                                                    }

                                                                    return (
                                                                        <tr 
                                                                            key={row.id} 
                                                                            className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                                                                            data-change-index={row.changeIndex}
                                                                            data-change-index-group={row.isFirstInGroup ? row.changeIndex : undefined}
                                                                            data-type={row.type}
                                                                        >
                                                                            <td className={`w-12 text-right text-[10px] p-2 border-r border-slate-100 select-none font-mono ${lNumClass}`}>{row.leftNum || ''}</td>
                                                                            <td className={`p-4 font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed ${lClass || 'text-slate-400 opacity-50'}`} dangerouslySetInnerHTML={{ __html: row.leftContent }}></td>
                                                                            <td className={`w-12 text-right text-[10px] p-2 border-r border-slate-100 border-l border-slate-100 select-none font-mono ${rNumClass}`}>{row.rightNum || ''}</td>
                                                                            <td className={`p-4 font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed ${rClass || 'text-slate-400 opacity-50'}`} dangerouslySetInnerHTML={{ __html: row.rightContent }}></td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                <AnimatePresence>
                                                    {totalChanges > 0 && (
                                                        <motion.div 
                                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                                            className="absolute bottom-16 right-16 flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
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
                                                                    title="Previous Change"
                                                                >
                                                                    <ChevronUp className="w-5 h-5 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => scrollToChange('next')}
                                                                    className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                                    title="Next Change"
                                                                >
                                                                    <ChevronDown className="w-5 h-5 group-active:translate-y-0.5 transition-transform" strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                                <GitCompare size={48} className="mb-6 opacity-20" />
                                                <p className="text-[11px] font-black uppercase tracking-[0.3em]">No adjustments required</p>
                                                <p className="text-[10px] mt-2 font-bold opacity-50">Similarity scan showed no redundancies</p>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </div>
                            <div className="relative p-10 bg-white border-t border-slate-100 flex justify-center z-10">
                                <button 
                                    onClick={() => { setStep('input'); setInput(''); setGroups([]); }} 
                                    className="group flex items-center gap-4 text-slate-400 hover:text-indigo-600 font-black text-[11px] uppercase tracking-[0.4em] transition-all"
                                >
                                    <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-700 text-indigo-400" />
                                    Purge Data & Reset
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceDupeChecker;
