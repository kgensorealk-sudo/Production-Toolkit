
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
    ChevronDown
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
                    if (currentGroup.length > 1) newGroups.push({ id: groupId++, items: currentGroup, selectedId: currentGroup[0].id });
                }
                if (newGroups.length === 0) { setToast({ msg: "No duplicates found!", type: "success" }); setIsLoading(false); return; }
                setStats(s => ({ ...s, totalRefs: refs.length }));
                setGroups(newGroups); setStep('resolve'); setIsLoading(false);
            } catch (error: any) { setIsLoading(false); }
        }, 600);
    };

    const handleSelection = (groupId: number, selectedRefId: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, selectedId: selectedRefId } : g));
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
        <div className="max-w-full mx-auto px-2 py-12 sm:px-4 lg:px-6 font-sans architect-grid">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-zinc-800 pb-12"
            >
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-none bg-zinc-900 flex items-center justify-center border border-zinc-800">
                            <GitCompare className="h-6 w-6 text-zinc-100" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Module_Ref_024</span>
                            <span className="text-[10px] font-bold text-zinc-100 uppercase tracking-widest">Structural Node Architect v3.2</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-bold text-zinc-100 tracking-tighter uppercase leading-none">
                        Reference <span className="text-zinc-500">Dupe Remover</span>
                    </h1>
                    <p className="text-xs text-zinc-500 mt-4 font-mono uppercase tracking-widest max-w-2xl leading-relaxed">
                        Precision-engineered XML citation re-linking engine. Automated duplicate detection with manual resolution matrix and full audit transparency.
                    </p>
                </div>

                <div className="flex items-center bg-zinc-900 p-1 border border-zinc-800">
                    {[
                        { id: 'input', label: '01_Input', icon: FileText },
                        { id: 'resolve', label: '02_Resolve', icon: Layers },
                        { id: 'result', label: '03_Audit', icon: ShieldCheck }
                    ].map((s, idx) => (
                        <React.Fragment key={s.id}>
                            <div className={`flex items-center gap-3 px-6 py-3 transition-all duration-200 ${step === s.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <s.icon size={14} strokeWidth={2.5} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
                            </div>
                            {idx < 2 && <div className="w-px h-4 bg-zinc-800 mx-1"></div>}
                        </React.Fragment>
                    ))}
                </div>
            </motion.div>

            <div className="bg-zinc-950 border border-zinc-800 min-h-[800px] flex flex-col relative shadow-[20px_20px_0px_rgba(0,0,0,0.3)]">
                {/* Technical Grid Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
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
                            <div className="bg-zinc-900 px-8 py-4 border-b border-zinc-800 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-none bg-zinc-100"></div>
                                        <span className="text-[11px] font-bold text-zinc-100 uppercase tracking-widest">Input_Stream_Active</span>
                                    </div>
                                    <div className="h-4 w-px bg-zinc-800"></div>
                                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 uppercase">
                                        <span className="text-zinc-100/50">Refs:</span> {inputStats.refCount}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={loadSample}
                                        className="architect-button"
                                    >
                                        <FileCode size={12} /> Load_Sample
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="architect-button"
                                    >
                                        <UploadCloud size={12} /> Upload_XML
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileUpload} 
                                        accept=".xml,text/xml" 
                                        className="hidden" 
                                    />
                                    <button onClick={handlePaste} className="architect-button">
                                        <Clipboard size={12} /> Paste_Buffer
                                    </button>
                                    <button 
                                        onClick={() => setInput('')} 
                                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border border-zinc-800 bg-zinc-900 text-zinc-500 hover:bg-rose-950 hover:text-rose-400"
                                    >
                                        <Trash2 size={12} /> Reset_Module
                                    </button>
                                </div>
                            </div>
                            <div 
                                className={`flex-grow flex flex-col relative overflow-hidden transition-all duration-500 ${isDragging ? 'bg-emerald-500/5' : 'bg-transparent'}`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                            >
                                <AnimatePresence>
                                    {isDragging && (
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 z-20 bg-emerald-500/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none border-4 border-dashed border-emerald-500/30 m-4 rounded-xl"
                                        >
                                            <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-emerald-500/20 flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                                    <UploadCloud size={32} />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-black text-white uppercase tracking-widest">Ingest XML Stream</p>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Release to begin similarity analysis</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                
                                {!input && !isDragging && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 pointer-events-none">
                                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 border border-slate-800 bg-slate-900/50 text-slate-600 shadow-inner">
                                            <FileCode size={32} strokeWidth={1.5} />
                                        </div>
                                        <p className="font-black text-[10px] uppercase tracking-[0.4em] mb-2 text-slate-500">
                                            Awaiting Data Payload
                                        </p>
                                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                                            Drop XML file or paste content to initialize
                                        </p>
                                    </div>
                                )}
                                <textarea 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)} 
                                    className={`w-full h-full p-10 text-[12px] font-mono text-emerald-400/90 border-0 focus:ring-0 outline-none resize-none bg-transparent leading-relaxed custom-scrollbar-emerald overflow-y-auto transition-opacity placeholder:text-slate-700 ${isDragging ? 'opacity-10' : 'opacity-100'}`} 
                                    spellCheck={false} 
                                    placeholder="<!-- Paste XML bibliography here -->"
                                />
                            </div>
                            <div className="p-8 border-t border-zinc-800 bg-zinc-900 flex justify-between items-center relative z-10">
                                <div className="flex gap-12">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Payload_Size</span>
                                        <span className="text-[11px] font-mono text-zinc-100">{(new Blob([input]).size / 1024).toFixed(2)} KB</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Ref_Count</span>
                                        <span className="text-[11px] font-mono text-zinc-100">{inputStats.refCount} detected</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={analyzeReferences} 
                                    disabled={!inputStats.isValid || inputStats.refCount === 0} 
                                    className="architect-button px-12 py-4 text-xs"
                                >
                                    <Zap size={14} />
                                    Initialize_Similarity_Scan
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
                            className="flex flex-col h-full bg-slate-900/50 relative z-10"
                        >
                            <div className="relative px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 z-10">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 w-full lg:w-auto">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-2 h-2 rounded-none bg-zinc-100"></div>
                                            <h3 className="text-lg font-bold text-zinc-100 uppercase tracking-tight">Resolution_Matrix</h3>
                                        </div>
                                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Select primary reference nodes for conflict resolution</p>
                                    </div>
                                    <div className="relative group w-full sm:w-72">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-zinc-100 transition-colors">
                                            <Search size={14} />
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="Filter_Conflict_Stream..." 
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="bg-zinc-950 border border-zinc-800 py-3 pl-11 pr-6 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-700 focus:border-zinc-100 outline-none w-full transition-all"
                                        />
                                        {searchQuery && (
                                            <button 
                                                onClick={() => setSearchQuery('')}
                                                className="absolute inset-y-0 right-4 flex items-center text-zinc-500 hover:text-rose-400"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <button 
                                    onClick={processMerge} 
                                    className="architect-button px-12 py-4 text-xs"
                                >
                                    <CheckCircle2 size={14} />
                                    Execute_System_Relink
                                </button>
                            </div>
                            <div className="flex-grow overflow-auto p-8 space-y-6 custom-scrollbar-emerald">
                                {filteredGroups.length === 0 && searchQuery && (
                                    <div className="h-64 flex flex-col items-center justify-center text-slate-600 bg-slate-800/20 rounded-3xl border border-dashed border-slate-800">
                                        <Filter size={32} className="mb-4 opacity-10" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">No matching conflict nodes detected</p>
                                    </div>
                                )}
                                {filteredGroups.map((group, gIdx) => (
                                    <motion.div 
                                        key={group.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: gIdx * 0.05 }}
                                        className="bg-zinc-900/50 border border-zinc-800 rounded-none overflow-hidden"
                                    >
                                        <div className="bg-zinc-900 px-8 py-3 border-b border-zinc-800 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded-none bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-100 font-mono">
                                                    {group.id.toString().padStart(2, '0')}
                                                </div>
                                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Conflict_Cluster</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-none bg-rose-600"></div>
                                                <span className="text-[10px] font-bold text-rose-500/80 uppercase tracking-widest">
                                                    {group.items.length} Variants_Detected
                                                </span>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-zinc-800/50">
                                            {group.items.map(item => {
                                                const isSelected = item.id === group.selectedId;
                                                return (
                                                    <div 
                                                        key={item.id} 
                                                        onClick={() => handleSelection(group.id, item.id)} 
                                                        className={`p-8 cursor-pointer transition-all flex gap-8 border-l-4 ${isSelected ? 'bg-zinc-100/5 border-zinc-100' : 'hover:bg-zinc-900/80 border-transparent'}`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-none border flex items-center justify-center transition-all shrink-0 ${isSelected ? 'border-zinc-100 bg-zinc-100 text-zinc-950' : 'border-zinc-800 bg-zinc-950 text-zinc-700'}`}>
                                                            {isSelected ? <CheckCircle2 size={16} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-none bg-zinc-800" />}
                                                        </div>
                                                        <div className="flex-grow min-w-0">
                                                            <div className="flex items-center gap-4 mb-3">
                                                                <span className={`text-[10px] font-mono font-bold px-3 py-1 rounded-none border transition-colors ${isSelected ? 'bg-zinc-100/5 border-zinc-100/20 text-zinc-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>
                                                                    UID: {item.id}
                                                                </span>
                                                                {item.author && (
                                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                                                        {item.author} {item.year ? `(${item.year})` : ''}
                                                                    </span>
                                                                )}
                                                                {isSelected && (
                                                                    <span className="flex items-center gap-2 text-[10px] font-bold text-zinc-100 uppercase tracking-widest ml-auto">
                                                                        <ShieldCheck size={12} /> Primary_Node
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className={`text-[11px] leading-relaxed font-mono break-words ${isSelected ? 'text-zinc-100' : 'text-zinc-600'}`}>
                                                                {item.displayContent}
                                                            </p>
                                                            {item.title && isSelected && (
                                                                <div className="mt-4 p-4 rounded-none bg-zinc-950 border border-zinc-800">
                                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Metadata_Extract</p>
                                                                    <p className="text-[11px] text-zinc-400 font-medium leading-relaxed italic">{item.title}</p>
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
                            <div className="relative bg-slate-900/80 backdrop-blur-md px-8 py-6 border-b border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 z-10 shadow-2xl">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-none bg-zinc-900 flex items-center justify-center border border-zinc-800">
                                            <History className="h-5 w-5 text-zinc-100" />
                                        </div>
                                        <div>
                                            <label className="font-bold text-zinc-100 text-[11px] uppercase tracking-widest block mb-0.5">Audit_Summary</label>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System modification log & verification</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-8">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Total_Refs</span>
                                            <span className="text-[11px] font-mono font-bold text-zinc-100 bg-zinc-900 px-3 py-1.5 border border-zinc-800 uppercase tracking-widest">{stats.totalRefs} ITEMS</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Removed</span>
                                            <span className="text-[11px] font-mono font-bold text-rose-500 bg-rose-950/30 px-3 py-1.5 border border-rose-900 uppercase tracking-widest">{stats.removed} PURGED</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Remapped</span>
                                            <span className="text-[11px] font-mono font-bold text-blue-500 bg-blue-950/30 px-3 py-1.5 border border-blue-900 uppercase tracking-widest">{stats.remapped} LINKS</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 w-full lg:w-auto">
                                    <button onClick={copyReport} className="architect-button px-6 py-4 text-[10px]">
                                        <Clipboard size={14} /> Copy_Report
                                    </button>
                                    <button onClick={copyOutput} className="architect-button px-8 py-4 text-[10px]">
                                        <Copy size={14} /> Copy_Output
                                    </button>
                                </div>
                            </div>
                            <div className="relative bg-zinc-950 px-8 pt-4 border-b border-zinc-800 flex space-x-2 overflow-x-auto no-scrollbar z-20">
                                {[
                                    { id: 'report', label: '01_Audit_Log', icon: History },
                                    { id: 'xml', label: '02_Resulting_XML', icon: FileText },
                                    { id: 'diff', label: '03_Visual_Diff', icon: GitCompare }
                                ].map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => setActiveTab(t.id as any)} 
                                        className={`flex items-center gap-3 px-6 py-4 text-[10px] font-bold uppercase tracking-widest rounded-none transition-all border-t border-x whitespace-nowrap ${activeTab === t.id ? 'bg-zinc-900 text-zinc-100 border-zinc-800 translate-y-[1px]' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'}`}
                                    >
                                        <t.icon size={12} />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-grow bg-zinc-950 overflow-hidden flex flex-col min-h-0 relative z-10">
                                {activeTab === 'xml' && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-grow flex flex-col min-h-0 p-8"
                                    >
                                        <div className="flex-grow p-10 text-[12px] font-mono text-zinc-100 bg-zinc-900 rounded-none border border-zinc-800 shadow-inner overflow-auto custom-scrollbar-emerald whitespace-pre-wrap break-all leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightXml(output) }} />
                                    </motion.div>
                                )}
                                
                                {activeTab === 'report' && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex-grow overflow-auto p-10 space-y-12 max-w-5xl mx-auto custom-scrollbar-emerald"
                                    >
                                        <section>
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="w-8 h-8 rounded-none bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100">
                                                    <Trash2 size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">Bibliography_Purge_List</h3>
                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Duplicate nodes removed from the bibliography stream</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                {mergeLog.bibRemovals.map((rem, idx) => (
                                                    <motion.div 
                                                        key={idx} 
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        className="flex items-center gap-6 p-6 rounded-none bg-zinc-900/30 border border-zinc-800 transition-all hover:bg-zinc-900/60 group"
                                                    >
                                                        <div className="flex flex-col flex-grow min-w-0">
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <span className="text-rose-500/80 font-bold text-xs line-through uppercase tracking-tight truncate">{rem.label}</span>
                                                                <span className="text-[7px] font-mono font-bold bg-rose-950 text-rose-500/70 px-2 py-0.5 rounded-none border border-rose-900 uppercase tracking-widest">Purged</span>
                                                            </div>
                                                            <span className="text-[8px] text-zinc-600 font-mono italic">UID: {rem.id}</span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-zinc-800">
                                                            <ArrowRight size={16} />
                                                        </div>
                                                        <div className="flex flex-col items-end shrink-0">
                                                            <span className="text-[7px] font-bold text-zinc-600 uppercase mb-1.5 tracking-widest">Absorbed_By</span>
                                                            <div className="flex items-center gap-3 bg-zinc-950 px-4 py-2 rounded-none border border-zinc-800">
                                                                <span className="font-bold text-zinc-100 text-[10px] uppercase">{rem.replacedByLabel}</span>
                                                                <span className="text-[8px] font-mono text-zinc-600">({rem.replacedBy})</span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                                {mergeLog.bibRemovals.length === 0 && (
                                                    <div className="text-center py-16 bg-zinc-900/20 rounded-none border border-dashed border-zinc-800">
                                                        <Info className="mx-auto mb-3 text-zinc-700" size={20} />
                                                        <p className="text-zinc-600 font-bold uppercase tracking-widest text-[8px]">No bibliography items were removed.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="w-8 h-8 rounded-none bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100">
                                                    <RefreshCw size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">Citation_Delta_Stream</h3>
                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">In-text cross-references updated to primary nodes</p>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                {mergeLog.citationAudits.map((aud, idx) => (
                                                    <motion.div 
                                                        key={idx} 
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        className="bg-zinc-900/30 border border-zinc-800 rounded-none overflow-hidden"
                                                    >
                                                        <div className="bg-zinc-900 px-8 py-3 border-b border-zinc-800 flex justify-between items-center">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-[8px] font-bold px-3 py-1 rounded-none border uppercase tracking-widest ${
                                                                    aud.type === 'split' ? 'bg-amber-950 text-amber-500/70 border-amber-900' : 
                                                                    aud.type === 'collapsed' ? 'bg-blue-950 text-blue-500/70 border-blue-900' : 
                                                                    aud.type === 'normalized' ? 'bg-indigo-950 text-indigo-500/70 border-indigo-900' :
                                                                    'bg-zinc-950 text-zinc-100 border-zinc-800'
                                                                }`}>
                                                                    {aud.type}
                                                                </span>
                                                            </div>
                                                            <span className="text-[8px] text-zinc-600 font-mono font-bold tracking-widest uppercase">Delta_{idx.toString().padStart(3, '0')}</span>
                                                        </div>
                                                        <div className="p-8 grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-6 items-center">
                                                            <div className="space-y-2">
                                                                <span className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest ml-2">Pre_Process</span>
                                                                <div className="p-4 rounded-none bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-rose-500/50 whitespace-pre-wrap break-all line-through decoration-rose-500/20 leading-relaxed shadow-inner min-h-[50px] flex items-center">
                                                                    {escapeHtml(aud.original)}
                                                                </div>
                                                            </div>
                                                            <div className="flex lg:flex-col items-center justify-center gap-2 text-zinc-800">
                                                                <div className="w-8 h-8 rounded-none bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-100">
                                                                    <ArrowRight className="lg:rotate-0 rotate-90" size={16} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <span className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest ml-2">Post_Process</span>
                                                                <div className="p-4 rounded-none bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-100 whitespace-pre-wrap break-all leading-relaxed shadow-sm font-bold min-h-[50px] flex items-center">
                                                                    {escapeHtml(aud.result)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                                {mergeLog.citationAudits.length === 0 && (
                                                    <div className="text-center py-16 bg-zinc-900/20 rounded-none border border-dashed border-zinc-800">
                                                        <AlertCircle className="mx-auto mb-3 text-zinc-700" size={20} />
                                                        <p className="text-zinc-600 font-bold uppercase tracking-widest text-[8px]">No citations required remapping.</p>
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
                                        className="flex-grow flex flex-col min-h-0 overflow-hidden bg-zinc-950 p-8 relative"
                                    >
                                        {isDiffing ? (
                                            <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                                                <div className="w-10 h-10 border-2 border-zinc-800 border-t-zinc-100 rounded-none animate-spin mb-4"></div>
                                                <p className="text-[9px] font-bold uppercase tracking-[0.3em] animate-pulse">Generating_Differential_Stream...</p>
                                            </div>
                                        ) : diffRows.length > 0 ? (
                                            <>
                                                <div className="border border-zinc-800 rounded-none overflow-hidden bg-zinc-950 flex-grow flex flex-col min-h-0">
                                                    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex justify-between items-center sticky top-0 z-20">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] font-bold text-zinc-100 uppercase tracking-widest">Comparison_Matrix</span>
                                                            <span className="text-[9px] font-mono font-bold text-zinc-100 bg-zinc-950 px-2 py-0.5 border border-zinc-800">
                                                                {diffRows.length} NODES ANALYZED
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div ref={diffContainerRef} className="overflow-auto custom-scrollbar-emerald flex-grow">
                                                        <table className="w-full text-[11px] font-mono border-collapse table-fixed bg-zinc-950">
                                                            <colgroup>
                                                                <col className="w-10 border-r border-zinc-800" />
                                                                <col className="w-[calc(50%-2.5rem)]" />
                                                                <col className="w-10 border-r border-zinc-800 border-l border-zinc-800" />
                                                                <col className="w-[calc(50%-2.5rem)]" />
                                                            </colgroup>
                                                            <tbody>
                                                                {diffRows.map((row) => {
                                                                    let lClass = '';
                                                                    let rClass = '';
                                                                    let lNumClass = 'bg-zinc-950 text-zinc-700'; 
                                                                    let rNumClass = 'bg-zinc-950 text-zinc-700';

                                                                    if (row.type === 'delete') {
                                                                        lClass = 'bg-rose-500/10 text-rose-300/80';
                                                                        lNumClass = 'bg-rose-500/20 text-rose-400';
                                                                    } else if (row.type === 'insert') {
                                                                        rClass = 'bg-emerald-500/10 text-emerald-300/80';
                                                                        rNumClass = 'bg-emerald-500/20 text-emerald-400';
                                                                    } else if (row.type === 'replace') {
                                                                        if (row.leftNum !== null) {
                                                                            lClass = 'bg-rose-500/10 text-rose-300/80';
                                                                            lNumClass = 'bg-rose-500/20 text-rose-400';
                                                                        }
                                                                        if (row.rightNum !== null) {
                                                                            rClass = 'bg-emerald-500/10 text-emerald-300/80';
                                                                            rNumClass = 'bg-emerald-500/20 text-emerald-400';
                                                                        }
                                                                    }

                                                                    return (
                                                                        <tr 
                                                                            key={row.id} 
                                                                            className="border-b border-zinc-800/50 hover:bg-zinc-100/5 transition-colors"
                                                                            data-change-index={row.changeIndex}
                                                                            data-change-index-group={row.isFirstInGroup ? row.changeIndex : undefined}
                                                                            data-type={row.type}
                                                                        >
                                                                            <td className={`w-10 text-right text-[9px] p-1 border-r border-zinc-800 select-none font-mono ${lNumClass}`}>{row.leftNum || ''}</td>
                                                                            <td className={`p-2 font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed ${lClass || 'text-zinc-500'}`} dangerouslySetInnerHTML={{ __html: row.leftContent }}></td>
                                                                            <td className={`w-10 text-right text-[9px] p-1 border-r border-zinc-800 border-l border-zinc-800 select-none font-mono ${rNumClass}`}>{row.rightNum || ''}</td>
                                                                            <td className={`p-2 font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed ${rClass || 'text-zinc-500'}`} dangerouslySetInnerHTML={{ __html: row.rightContent }}></td>
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
                                                            className="absolute bottom-12 right-12 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-none p-2 shadow-[20px_20px_0px_rgba(0,0,0,0.3)] z-30"
                                                        >
                                                            <div className="flex items-center gap-1 pr-2 border-r border-zinc-800">
                                                                <div className="w-8 h-8 rounded-none bg-zinc-100 flex items-center justify-center">
                                                                    <GitCompare className="w-4 h-4 text-zinc-950" strokeWidth={2.5} />
                                                                </div>
                                                                <div className="flex flex-col px-2">
                                                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                                    <span className="text-xs font-bold text-zinc-100 tabular-nums leading-none">
                                                                        {currentChangeIndex} <span className="text-zinc-600 mx-0.5">/</span> {totalChanges}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button 
                                                                    onClick={() => scrollToChange('prev')}
                                                                    className="p-2.5 hover:bg-zinc-800 active:bg-zinc-700 rounded-none transition-all text-zinc-500 hover:text-zinc-100 group"
                                                                    title="Previous Change (Shift+Tab)"
                                                                >
                                                                    <ChevronUp className="w-5 h-5 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => scrollToChange('next')}
                                                                    className="p-2.5 hover:bg-zinc-800 active:bg-zinc-700 rounded-none transition-all text-zinc-500 hover:text-zinc-100 group"
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
                                            <div className="h-full flex flex-col items-center justify-center text-zinc-800">
                                                <GitCompare size={40} className="mb-4 opacity-10" />
                                                <p className="text-[9px] font-bold uppercase tracking-[0.3em]">Differential_Stream_Unavailable</p>
                                                <p className="text-[8px] mt-2 opacity-40">Run similarity scan and merge to generate diff data</p>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </div>
                            <div className="relative p-6 bg-zinc-950 border-t border-zinc-800 flex justify-center z-10">
                                <button 
                                    onClick={() => { setStep('input'); setInput(''); setGroups([]); }} 
                                    className="group flex items-center gap-4 text-zinc-500 hover:text-zinc-100 font-bold text-[10px] uppercase tracking-[0.35em] transition-all"
                                >
                                    <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700" />
                                    Reset_System_Workflow
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
