import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { 
    FileCode, 
    Play, 
    RotateCcw, 
    Copy, 
    Check, 
    AlertCircle, 
    Zap,
    History,
    FileText,
    ArrowRight,
    Clipboard,
    Hash,
    Search,
    Split,
    Cpu,
    ChevronUp,
    ChevronDown,
    GitCompare
} from 'lucide-react';
import Toast from '../components/Toast';

interface AffiliationIssue {
    index: number;
    originalId: string;
    expectedId: string;
    currentLabel: string;
    expectedLabel: string;
    isIdWrong: boolean;
    isLabelWrong: boolean;
}

interface AuditLine {
    text: string;
    isChanged: boolean;
    isHeader?: boolean;
    isDivider?: boolean;
}

const AffiliationSequencer: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [activeTab, setActiveTab] = useState<'xml' | 'report' | 'diff'>('xml');
    const [report, setReport] = useState<AuditLine[]>([]);
    const [step, setStep] = useState(1); // 1: Input/Analysis, 2: Result
    const [issues, setIssues] = useState<AffiliationIssue[]>([]);
    const [authorGroupContent, setAuthorGroupContent] = useState('');

    const [isDragging, setIsDragging] = useState(false);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'text/xml' || file.name.endsWith('.xml') || file.type === 'application/xml')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                setInput(content);
                setIssues([]);
                setToast({ msg: 'XML file loaded successfully', type: 'success' });
            };
            reader.readAsText(file);
        } else {
            setToast({ msg: 'Please drop a valid XML file', type: 'error' });
        }
    };

    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const getLabel = (index: number) => {
        let label = "";
        let n = index;
        while (n >= 0) {
            label = alphabet[n % 26] + label;
            n = Math.floor(n / 26) - 1;
        }
        return label;
    };

    const analyzeXml = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        // Extract author-group
        const authorGroupRegex = /<ce:author-group\b[^>]*>([\s\S]*?)<\/ce:author-group>/;
        const groupMatch = input.match(authorGroupRegex);
        
        if (!groupMatch) {
            setToast({ msg: "No <ce:author-group> found in the provided XML.", type: "error" });
            return;
        }

        const content = groupMatch[1];
        setAuthorGroupContent(content);

        const affRegex = /<ce:affiliation[^>]*\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/ce:affiliation>/g;
        const foundIssues: AffiliationIssue[] = [];
        let match;
        let index = 0;

        while ((match = affRegex.exec(content)) !== null) {
            const originalId = match[1];
            const affContent = match[2];
            const labelMatch = affContent.match(/<ce:label>([^<]*)<\/ce:label>/);
            const currentLabel = labelMatch ? labelMatch[1].trim() : '';
            
            const expectedId = `af${((index + 1) * 5).toString().padStart(4, '0')}`;
            const expectedLabel = getLabel(index);

            const isIdWrong = originalId !== expectedId;
            const isLabelWrong = currentLabel !== expectedLabel;

            if (isIdWrong || isLabelWrong) {
                foundIssues.push({
                    index: index + 1,
                    originalId,
                    expectedId,
                    currentLabel,
                    expectedLabel,
                    isIdWrong,
                    isLabelWrong
                });
            }
            index++;
        }

        setIssues(foundIssues);
        if (foundIssues.length === 0 && index > 0) {
            setToast({ msg: "All affiliations match the expected sequence!", type: "success" });
        } else if (index === 0) {
            setToast({ msg: "No affiliations found within author-group.", type: "warn" });
        }
    };

    const processXml = () => {
        if (!input.trim()) return;
        setIsProcessing(true);
        const auditLog: AuditLine[] = [];

        try {
            const authorGroupRegex = /<ce:author-group\b([^>]*)>([\s\S]*?)<\/ce:author-group>/;
            const groupMatch = input.match(authorGroupRegex);
            if (!groupMatch) throw new Error("No author-group found");

            const groupAttrs = groupMatch[1];
            const groupInner = groupMatch[2];
            let processedInner = groupInner;

            // 1. Find all affiliations in the group
            const affRegex = /<ce:affiliation[^>]*\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/ce:affiliation>/g;
            const affiliations: { originalId: string; fullTag: string; content: string }[] = [];
            let match;
            while ((match = affRegex.exec(groupInner)) !== null) {
                affiliations.push({
                    originalId: match[1],
                    fullTag: match[0],
                    content: match[2]
                });
            }

            // 2. Map old IDs to new sequential IDs and labels
            const idMap: Record<string, { newId: string; newLabel: string }> = {};
            const referencedIds = new Set<string>();
            affiliations.forEach((aff, index) => {
                const newId = `af${((index + 1) * 5).toString().padStart(4, '0')}`;
                const newLabel = getLabel(index);
                idMap[aff.originalId] = { newId, newLabel };
            });

            // 3. Build detailed audit log by author
            const authorRegex = /<ce:author\b[^>]*>([\s\S]*?)<\/ce:author>/g;
            let authorMatch;
            let authorIndex = 1;
            
            const getOrdinal = (n: number) => {
                const s = ["th", "st", "nd", "rd"], v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };

            while ((authorMatch = authorRegex.exec(groupInner)) !== null) {
                const authorFullTag = authorMatch[0];
                const authorInner = authorMatch[1];
                
                const givenName = authorInner.match(/<ce:given-name>([^<]*)<\/ce:given-name>/)?.[1] || '';
                const surname = authorInner.match(/<ce:surname>([^<]*)<\/ce:surname>/)?.[1] || '';
                const fullName = `${givenName} ${surname}`.trim();
                
                const crRegex = /<ce:cross-ref[^>]*refid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:cross-ref>/g;
                let crMatch;
                const authorMappings: AuditLine[] = [];
                const currentLabels: string[] = [];
                const seenRefIds = new Set<string>();
                const duplicateLinks: string[] = [];

                while ((crMatch = crRegex.exec(authorFullTag)) !== null) {
                    const refid = crMatch[1];
                    if (idMap[refid]) {
                        referencedIds.add(refid);
                        
                        if (seenRefIds.has(refid)) {
                            duplicateLinks.push(refid);
                        }
                        seenRefIds.add(refid);

                        const mapping = idMap[refid];
                        const supMatch = crMatch[2].match(/<ce:sup>([^<]*)<\/ce:sup>/);
                        const currentLabel = supMatch ? supMatch[1] : '';
                        currentLabels.push(currentLabel);
                        
                        const isChanged = refid !== mapping.newId || currentLabel !== mapping.newLabel;
                        authorMappings.push({
                            text: `Mapping: ${refid} -> ${mapping.newId} (Label: ${mapping.newLabel})`,
                            isChanged
                        });
                    }
                }

                if (fullName || authorMappings.length > 0) {
                    auditLog.push({ text: `${getOrdinal(authorIndex)} author: ${fullName || 'Unknown'}`, isChanged: false, isHeader: true });
                    if (currentLabels.length > 0) {
                        auditLog.push({ text: `Affiliated to: ${currentLabels.join(', ')}`, isChanged: false });
                    }
                    if (duplicateLinks.length > 0) {
                        auditLog.push({ text: `⚠️ Duplicate links found for: ${duplicateLinks.join(', ')}`, isChanged: true });
                    }
                    authorMappings.forEach(m => auditLog.push(m));
                    auditLog.push({ text: `=======`, isChanged: false, isDivider: true });
                    authorIndex++;
                }
            }

            // 4. Add Integrity & Linking Status Summary
            const unlinkedAffs = affiliations.filter(aff => !referencedIds.has(aff.originalId));
            
            // Check for redundant affiliations (identical content)
            const contentMap: Record<string, string[]> = {};
            affiliations.forEach(aff => {
                const normalized = aff.content.replace(/<ce:label>.*?<\/ce:label>/g, '').replace(/\s+/g, '').toLowerCase();
                if (!contentMap[normalized]) contentMap[normalized] = [];
                contentMap[normalized].push(aff.originalId);
            });
            const redundantGroups = Object.values(contentMap).filter(ids => ids.length > 1);

            auditLog.push({ text: `INTEGRITY & LINKING SUMMARY`, isChanged: false, isHeader: true });
            
            // Unlinked check
            if (unlinkedAffs.length === 0) {
                auditLog.push({ text: `✅ All affiliations are linked to at least one author.`, isChanged: false });
            } else {
                auditLog.push({ text: `⚠️ Found ${unlinkedAffs.length} unlinked affiliation(s):`, isChanged: true });
                unlinkedAffs.forEach(aff => {
                    const mapping = idMap[aff.originalId];
                    auditLog.push({ text: `• Unlinked: ${aff.originalId} (Label: ${mapping.newLabel})`, isChanged: true });
                });
            }

            // Redundant check
            if (redundantGroups.length === 0) {
                auditLog.push({ text: `✅ No redundant affiliations (identical content) detected.`, isChanged: false });
            } else {
                auditLog.push({ text: `⚠️ Found ${redundantGroups.length} group(s) of redundant affiliations:`, isChanged: true });
                redundantGroups.forEach((ids, idx) => {
                    const labels = ids.map(id => idMap[id]?.newLabel || '?').join(', ');
                    auditLog.push({ text: `• Group ${idx + 1}: IDs [${ids.join(', ')}] share labels [${labels}]`, isChanged: true });
                });
            }
            
            auditLog.push({ text: `=======`, isChanged: false, isDivider: true });

            // 5. Replace affiliation IDs and labels
            affiliations.forEach((aff) => {
                const mapping = idMap[aff.originalId];
                let newAffTag = aff.fullTag.replace(/\s+id="([^"]+)"/, ` id="${mapping.newId}"`);
                
                const labelRegex = /<ce:label>([^<]*)<\/ce:label>/;
                if (newAffTag.match(labelRegex)) {
                    newAffTag = newAffTag.replace(labelRegex, `<ce:label>${mapping.newLabel}</ce:label>`);
                } else {
                    // Prepend label if missing? Usually it exists in this context
                    newAffTag = newAffTag.replace(/(<ce:affiliation[^>]*>)/, `$1<ce:label>${mapping.newLabel}</ce:label>`);
                }

                const placeholder = `__AFF_PLACEHOLDER_${aff.originalId}__`;
                processedInner = processedInner.replace(aff.fullTag, placeholder);
            });

            // 5. Update cross-references within the group
            const crossRefRegex = /<ce:cross-ref[^>]*refid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:cross-ref>/g;
            processedInner = processedInner.replace(crossRefRegex, (fullTag, refid, inner) => {
                if (idMap[refid]) {
                    const mapping = idMap[refid];
                    let updatedTag = fullTag.replace(`refid="${refid}"`, `refid="${mapping.newId}"`);
                    const supRegex = /<ce:sup>([^<]*)<\/ce:sup>/;
                    if (updatedTag.match(supRegex)) {
                        updatedTag = updatedTag.replace(supRegex, `<ce:sup>${mapping.newLabel}</ce:sup>`);
                    }
                    return updatedTag;
                }
                return fullTag;
            });

            // 5. Restore affiliations
            affiliations.forEach((aff) => {
                const mapping = idMap[aff.originalId];
                let newAffTag = aff.fullTag.replace(/\s+id="([^"]+)"/, ` id="${mapping.newId}"`);
                const labelRegex = /<ce:label>([^<]*)<\/ce:label>/;
                if (newAffTag.match(labelRegex)) {
                    newAffTag = newAffTag.replace(labelRegex, `<ce:label>${mapping.newLabel}</ce:label>`);
                } else {
                    newAffTag = newAffTag.replace(/(<ce:affiliation[^>]*>)/, `$1<ce:label>${mapping.newLabel}</ce:label>`);
                }

                const placeholder = `__AFF_PLACEHOLDER_${aff.originalId}__`;
                processedInner = processedInner.replace(placeholder, newAffTag);
            });

            // Reconstruct full XML
            const finalXml = input.replace(authorGroupRegex, `<ce:author-group${groupAttrs}>${processedInner}</ce:author-group>`);

            setOutput(finalXml);
            setReport(auditLog);
            setStep(2);
            setToast({ msg: "Affiliations sequenced successfully.", type: "success" });
        } catch (error: any) {
            console.error(error);
            setToast({ msg: `Processing error: ${error.message}`, type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    const copyOutput = () => {
        navigator.clipboard.writeText(output);
        setToast({ msg: "Resulting XML copied to clipboard.", type: "success" });
    };

    const reset = () => {
        setInput('');
        setOutput('');
        setReport([]);
        setStep(1);
        setActiveTab('xml');
        setCurrentChangeIndex(0);
        setTotalChanges(0);
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

    const diffRows = useMemo(() => {
        if (!input || !output) return [];
        const diff = diffLines(input, output);
        const rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let changeCount = 0;

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
                changeCount++;
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
                changeCount++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
                changeCount++;
            } else {
                leftVal = rightVal = current.value;
                i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

            if (type === 'replace') {
                const wordDiff = diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildDiffLines(wordDiff, true);
                rightLines = buildDiffLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildDiffLines([{removed: true, value: leftVal} as Change], true);
            } else if (type === 'insert') {
                rightLines = buildDiffLines([{added: true, value: rightVal} as Change], false);
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
                
                let lClass = '';
                let rClass = '';
                let lNumClass = 'bg-slate-50'; 
                let rNumClass = 'bg-slate-50';

                if (type === 'delete') {
                    lClass = 'bg-rose-50';
                    lNumClass = 'bg-rose-100';
                } else if (type === 'insert') {
                    rClass = 'bg-emerald-50';
                    rNumClass = 'bg-emerald-100';
                } else if (type === 'replace') {
                    if (lContent !== undefined) {
                        lClass = 'bg-rose-50';
                        lNumClass = 'bg-rose-100';
                    }
                    if (rContent !== undefined) {
                        rClass = 'bg-emerald-50';
                        rNumClass = 'bg-emerald-100';
                    }
                }

                rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                        data-change-row={type !== 'equal' ? "true" : undefined}
                        data-change-index={type !== 'equal' ? changeCount : undefined}
                        data-change-index-group={type !== 'equal' ? changeCount : undefined}
                    >
                        <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none font-mono ${lNumClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none font-mono ${rNumClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setTotalChanges(changeCount);
        setCurrentChangeIndex(changeCount > 0 ? 1 : 0);
        return rows;
    }, [input, output]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const buildDiffLines = (diffParts: Change[], isLeft: boolean) => {
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-200 text-rose-900 line-through decoration-rose-900/50');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-900 font-bold');
            else if (!part.added && !part.removed) append(part.value, null);
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const highlightXml = (xml: string) => {
        return xml
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/(&lt;ce:affiliation.*?&gt;)/g, '<span class="text-emerald-400 font-bold">$1</span>')
            .replace(/(&lt;ce:cross-ref.*?&gt;)/g, '<span class="text-amber-400 font-bold">$1</span>')
            .replace(/(id="[^"]+")/g, '<span class="text-sky-400">$1</span>')
            .replace(/(refid="[^"]+")/g, '<span class="text-sky-400">$1</span>');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-emerald-500/30">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200 rotate-3 group-hover:rotate-0 transition-transform duration-500">
                            <Hash className="text-emerald-400 h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                                Affiliation <span className="text-emerald-500">Sequencer</span>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full border border-slate-200 font-bold tracking-widest">v1.0.0</span>
                            </h1>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Sequential ID & Cross-Ref Normalization Engine</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                        <button 
                            onClick={() => setStep(1)}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${step === 1 ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            01. Input Source
                        </button>
                        <div className="w-4 h-px bg-slate-200"></div>
                        <button 
                            disabled={!output}
                            onClick={() => setStep(2)}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${step === 2 ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600 disabled:opacity-30'}`}
                        >
                            02. Processed Result
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-grow flex flex-col max-w-7xl w-full mx-auto p-8 gap-8">
                <AnimatePresence mode="wait">
                    {step === 1 ? (
                        <motion.div 
                            key="input"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex-grow flex flex-col gap-6"
                        >
                            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col flex-grow">
                                <div className="bg-slate-50 px-10 py-6 border-b border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                                            <FileCode className="text-slate-400 h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Source XML Buffer</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Paste your raw author-group XML here</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setInput('')}
                                        className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                                    >
                                        <RotateCcw size={18} />
                                    </button>
                                </div>
                                
                                <div 
                                    className={`flex-grow relative group flex flex-col transition-all duration-300 ${isDragging ? 'bg-emerald-50/50' : ''}`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    <textarea 
                                        value={input}
                                        onChange={(e) => {
                                            setInput(e.target.value);
                                            setIssues([]);
                                        }}
                                        placeholder="Paste full XML here (must contain <ce:author-group>)..."
                                        className={`w-full flex-grow p-10 text-sm font-mono text-slate-600 bg-transparent focus:outline-none resize-none placeholder:text-slate-200 leading-relaxed custom-scrollbar transition-all ${isDragging ? 'opacity-20' : ''}`}
                                    />

                                    {isDragging && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-300">
                                            <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-200 animate-bounce">
                                                <FileCode className="text-white h-10 w-10" />
                                            </div>
                                            <p className="mt-6 text-emerald-600 font-black uppercase tracking-widest text-sm">Drop XML File Here</p>
                                            <p className="mt-2 text-emerald-400 font-bold uppercase tracking-[0.2em] text-[10px]">Release to load content</p>
                                        </div>
                                    )}
                                    
                                    {issues.length > 0 && !isDragging && (
                                        <div className="mx-10 mb-10 p-6 bg-amber-50 rounded-2xl border border-amber-100 max-h-60 overflow-auto custom-scrollbar">
                                            <div className="flex items-center gap-3 mb-4">
                                                <AlertCircle className="text-amber-500" size={16} />
                                                <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Sequence Analysis Issues</h4>
                                            </div>
                                            <div className="space-y-3">
                                                {issues.map((issue, i) => (
                                                    <div key={i} className="flex flex-col gap-1 text-[10px] font-mono border-l-2 border-amber-200 pl-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-amber-700 font-bold">Affiliation #{issue.index}:</span>
                                                            <span className="text-slate-500">Label: <span className={issue.isLabelWrong ? "text-rose-500 font-bold" : "text-emerald-600"}>{issue.currentLabel || '(none)'}</span></span>
                                                            {issue.isLabelWrong && <span className="text-slate-400">→ Expecting <span className="text-emerald-600 font-bold">{issue.expectedLabel}</span></span>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-500">ID: <span className={issue.isIdWrong ? "text-rose-500 font-bold" : "text-emerald-600"}>{issue.originalId}</span></span>
                                                            {issue.isIdWrong && <span className="text-slate-400">→ Expecting <span className="text-emerald-600 font-bold">{issue.expectedId}</span></span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="absolute bottom-8 right-8 flex gap-3">
                                        <button 
                                            onClick={analyzeXml}
                                            disabled={!input.trim()}
                                            className="flex items-center gap-4 px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            <Search size={14} />
                                            Analyze XML
                                        </button>
                                        <button 
                                            onClick={processXml}
                                            disabled={isProcessing || !input.trim()}
                                            className="flex items-center gap-4 px-10 py-5 bg-slate-900 text-emerald-400 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none group/btn"
                                        >
                                            {isProcessing ? (
                                                <RotateCcw className="animate-spin" size={16} />
                                            ) : (
                                                <Play size={16} className="group-hover:translate-x-1 transition-transform" />
                                            )}
                                            {isProcessing ? 'Sequencing...' : 'Execute Sequence'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {[
                                    { icon: Hash, title: "Sequential IDs", desc: "Re-maps all affiliation IDs to af0001, af0002... format." },
                                    { icon: Zap, title: "Cross-Ref Sync", desc: "Updates all author cross-references to point to new IDs." },
                                    { icon: Check, title: "Label Normalization", desc: "Automatically updates superscript labels (a, b, c...) in sync." }
                                ].map((feature, i) => (
                                    <div key={i} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-5">
                                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shrink-0">
                                            <feature.icon className="text-emerald-500 h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1">{feature.title}</h4>
                                            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">{feature.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="output"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            className="flex-grow flex flex-col bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden"
                        >
                            <div className="px-10 py-8 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                                        <Check className="text-emerald-400 h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-widest">Sequence Complete</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Integrity Verified</span>
                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{report.length} operations logged</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={reset} className="flex items-center gap-3 text-[9px] font-black text-slate-400 bg-slate-800 hover:bg-slate-700 px-6 py-4 rounded-xl border border-slate-700 transition-all uppercase tracking-widest active:scale-95">
                                        <RotateCcw size={14} /> New Process
                                    </button>
                                    <button onClick={copyOutput} className="flex items-center gap-3 text-[9px] font-black text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-8 py-4 rounded-xl border border-emerald-500/30 transition-all uppercase tracking-widest active:scale-95 shadow-lg shadow-emerald-500/5">
                                        <Copy size={14} /> Copy XML
                                    </button>
                                </div>
                            </div>

                            <div className="relative bg-slate-900 px-10 pt-4 border-b border-slate-800 flex space-x-2 overflow-x-auto no-scrollbar z-20">
                                {[
                                    { id: 'xml', label: 'Resulting XML', icon: FileText },
                                    { id: 'diff', label: 'Diff View', icon: Split },
                                    { id: 'report', label: 'Audit Log', icon: History }
                                ].map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => setActiveTab(t.id as any)} 
                                        className={`flex items-center gap-3 px-8 py-5 text-[9px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x whitespace-nowrap ${activeTab === t.id ? 'bg-slate-800 text-emerald-400 border-slate-700 translate-y-[1px]' : 'bg-transparent text-slate-500 border-transparent hover:text-slate-300'}`}
                                    >
                                        <t.icon size={12} />
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-grow bg-slate-900/50 overflow-hidden flex flex-col min-h-0 relative z-10">
                                <AnimatePresence mode="wait">
                                    {activeTab === 'xml' ? (
                                        <motion.div 
                                            key="xml-view"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex-grow flex flex-col min-h-0 p-10"
                                        >
                                            <div className="flex-grow p-10 text-[13px] font-mono text-emerald-400/80 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-inner overflow-auto custom-scrollbar-emerald whitespace-pre-wrap break-all leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightXml(output) }} />
                                        </motion.div>
                                    ) : activeTab === 'diff' ? (
                                        <motion.div 
                                            key="diff-view"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex-grow flex flex-col min-h-0 bg-white"
                                        >
                                            <div className="grid grid-cols-[3rem_1fr_3rem_1fr] bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                                                <div className="col-span-2 px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200 flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-rose-500/50" />
                                                    Original Source
                                                </div>
                                                <div className="col-span-2 px-6 py-3 text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                                                    Modified Result
                                                </div>
                                            </div>
                                            <div className="flex-grow overflow-auto custom-scrollbar">
                                                <table className="w-full text-[11px] font-mono border-collapse table-fixed">
                                                    <colgroup>
                                                        <col className="w-12 border-r border-slate-200" />
                                                        <col className="w-[calc(50%-3rem)]" />
                                                        <col className="w-12 border-r border-slate-200 border-l border-slate-200" />
                                                        <col className="w-[calc(50%-3rem)]" />
                                                    </colgroup>
                                                    <tbody>
                                                        {(() => {
                                                            const diff = diffLines(input, output);
                                                            const rows: any[] = [];
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
                                                                    leftLines = buildDiffLines(wordDiff, true);
                                                                    rightLines = buildDiffLines(wordDiff, false);
                                                                } else if (type === 'delete') {
                                                                    leftLines = buildDiffLines([{removed: true, value: leftVal} as Change], true);
                                                                } else if (type === 'insert') {
                                                                    rightLines = buildDiffLines([{added: true, value: rightVal} as Change], false);
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
                                                                    
                                                                    let lClass = '';
                                                                    let rClass = '';
                                                                    let lNumClass = 'bg-slate-50'; 
                                                                    let rNumClass = 'bg-slate-50';

                                                                    if (type === 'delete') {
                                                                        lClass = 'bg-rose-50';
                                                                        lNumClass = 'bg-rose-100';
                                                                    } else if (type === 'insert') {
                                                                        rClass = 'bg-emerald-50';
                                                                        rNumClass = 'bg-emerald-100';
                                                                    } else if (type === 'replace') {
                                                                        if (lContent !== undefined) {
                                                                            lClass = 'bg-rose-50';
                                                                            lNumClass = 'bg-rose-100';
                                                                        }
                                                                        if (rContent !== undefined) {
                                                                            rClass = 'bg-emerald-50';
                                                                            rNumClass = 'bg-emerald-100';
                                                                        }
                                                                    }

                                                                    rows.push(
                                                                        <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                                            <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none font-mono ${lNumClass}`}>{lNum}</td>
                                                                            <td className={`p-1 font-mono text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                                                                            <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none font-mono ${rNumClass}`}>{rNum}</td>
                                                                            <td className={`p-1 font-mono text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                                                                        </tr>
                                                                    );
                                                                }
                                                            }
                                                            return rows;
                                                        })()}
                                                    </tbody>
                                                </table>
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
                                        </motion.div>
                                    ) : (
                                        <motion.div 
                                            key="report-view"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex-grow p-10 overflow-auto custom-scrollbar"
                                        >
                                            <div className="space-y-3">
                                                {report.map((log, i) => (
                                                    <div key={i} className={`flex items-start gap-4 text-[11px] font-mono group ${log.isHeader ? 'mt-8 first:mt-0' : ''}`}>
                                                        <span className="text-slate-700 shrink-0 mt-0.5">[{i.toString().padStart(3, '0')}]</span>
                                                        <span className={`transition-colors ${
                                                            log.isHeader ? 'text-emerald-400 font-black uppercase tracking-wider' : 
                                                            log.isDivider ? 'text-slate-800' :
                                                            log.isChanged ? 'text-amber-400 font-bold' : 'text-slate-500'
                                                        }`}>
                                                            {log.text}
                                                            {log.isChanged && <span className="ml-3 text-[9px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-tighter">Changed</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AffiliationSequencer;
