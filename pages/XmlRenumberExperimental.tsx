import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, Change, diffWordsWithSpace } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useSessionStorage from '../hooks/useSessionStorage';
import { 
    ChevronUp, ChevronDown, Sparkles, Wand2, Search, Sliders, 
    CheckCircle2, FileCode, Copy, RotateCcw, Download,
    Layers, AlertCircle, FileText, Eraser, Link as LinkIcon,
    ListChecks, Eye, GitCompare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion } from '../types';

interface BibItemNode {
    id: string;
    originalId: string;
    newId: string;
    originalLabel: string;
    newLabel: string;
    fullTag: string;
    content: string;
    isOtherRef: boolean;
    authorSortKey: string;
    citationCount: number;
    status: 'renumbered' | 'other_ref' | 'custom' | 'excluded';
}

interface DetailedChangeRecord {
    id: string;
    originalId: string;
    type: 'bib-label' | 'cross-ref' | 'cross-refs';
    originalValue: string;
    newValue: string;
    changed: boolean;
}

interface DiagnosticStats {
    totalRefs: number;
    renumberedCount: number;
    crossRefsUpdatedCount: number;
    otherRefsCount: number;
    uncitedCount: number;
}

function formatNumberList(numbers: number[], compress: boolean, prefix: string, suffix: string): string {
    if (numbers.length === 0) return '';
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    if (!compress || sorted.length <= 2) {
        return `${prefix}${sorted.join(',')}${suffix}`;
    }
    
    const ranges: string[] = [];
    let i = 0;
    while (i < sorted.length) {
        let start = sorted[i];
        let end = start;
        while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
            end = sorted[i + 1];
            i++;
        }
        if (start === end) {
            ranges.push(`${start}`);
        } else if (end - start === 1) {
            ranges.push(`${start}`);
            ranges.push(`${end}`);
        } else {
            ranges.push(`${start}–${end}`);
        }
        i++;
    }
    return `${prefix}${ranges.join(',')}${suffix}`;
}

const XmlRenumberExperimental: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Session-persisted states
    const [input, setInput] = useSessionStorage<string>('xml_renumber_exp_input', '');
    const [output, setOutput] = useSessionStorage<string>('xml_renumber_exp_output', '');
    const [bibNodes, setBibNodes] = useSessionStorage<BibItemNode[]>('xml_renumber_exp_bib_nodes', []);
    const [step, setStep] = useSessionStorage<'input' | 'matrix' | 'result'>('xml_renumber_exp_step', 'input');
    const [prefix, setPrefix] = useSessionStorage<string>('xml_renumber_exp_prefix', '[');
    const [suffix, setSuffix] = useSessionStorage<string>('xml_renumber_exp_suffix', ']');
    const [startIndex, setStartIndex] = useSessionStorage<number>('xml_renumber_exp_start_idx', 1);
    const [idPrefix, setIdPrefix] = useSessionStorage<string>('xml_renumber_exp_id_prefix', 'bb');
    const [idStep, setIdStep] = useSessionStorage<number>('xml_renumber_exp_id_step', 5);
    const [autoSortAlphabetical, setAutoSortAlphabetical] = useSessionStorage<boolean>('xml_renumber_exp_sort_alpha', false);
    const [compressRanges, setCompressRanges] = useSessionStorage<boolean>('xml_renumber_exp_compress', true);
    const [preserveRefIds, setPreserveRefIds] = useSessionStorage<boolean>('xml_renumber_exp_preserve_ids', true);
    const [diagnostics, setDiagnostics] = useSessionStorage<DiagnosticStats>('xml_renumber_exp_diagnostics', {
        totalRefs: 0,
        renumberedCount: 0,
        crossRefsUpdatedCount: 0,
        otherRefsCount: 0,
        uncitedCount: 0
    });

    // Local transient UI states
    const [isLoading, setIsLoading] = useState(false);
    const [processLabel, setProcessLabel] = useState('');
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [activeTab, setActiveTab] = useState<'changes' | 'xml' | 'diff'>('changes');
    
    // Matrix Filter & Search
    const [matrixFilter, setMatrixFilter] = useState<'all' | 'modified_only' | 'renumbered' | 'other_ref' | 'uncited'>('all');
    const [matrixSearch, setMatrixSearch] = useState('');

    // Detailed Audit Log State
    const [changesList, setChangesList] = useState<DetailedChangeRecord[]>([]);
    const [changesFilter, setChangesFilter] = useState<'all' | 'changed' | 'unchanged'>('all');
    const [changesSearch, setChangesSearch] = useState('');

    // Diff View State
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [compactDiffOnly, setCompactDiffOnly] = useState(false);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Import from other tools via location state
    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setStep('input');
            setToast({ 
                message: `Source XML imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput, setStep]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const extractAuthorYearKey = (content: string, label: string) => {
        const surnameMatches = Array.from(content.matchAll(/<(?:ce:)?surname\b[^>]*>([\s\S]*?)<\/(?:ce:)?surname>/gi))
            .map(m => m[1].replace(/<[^>]+>/g, '').trim())
            .filter(Boolean);
        
        if (surnameMatches.length === 0) {
            const collabMatches = Array.from(content.matchAll(/<(?:ce:)?collaboration\b[^>]*>([\s\S]*?)<\/(?:ce:)?collaboration>/gi))
                .map(m => m[1].replace(/<[^>]+>/g, '').trim())
                .filter(Boolean);
            if (collabMatches.length > 0) {
                surnameMatches.push(collabMatches[0]);
            }
        }

        const yearMatch = content.match(/\b((?:18|19|20)\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : '9999';

        const authorPart = surnameMatches.length > 0 
            ? surnameMatches.join('_').toLowerCase() 
            : label.replace(/<[^>]+>/g, '').replace(/[^\w]/g, '').toLowerCase() || 'zzz';

        return `${authorPart}_${year}`;
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-200 text-rose-950 font-extrabold px-1 rounded border border-rose-300 line-through decoration-rose-900/60');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-950 font-extrabold px-1 rounded border border-emerald-300 shadow-2xs');
            else if (!part.added && !part.removed) append(part.value, null);
        });
        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const generateDiff = (original: string, modified: string, compact: boolean = compactDiffOnly) => {
        if (!original || !modified) return;
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1, rightLineNum = 1, i = 0;
        let changeCount = 0;

        type Block = {
            type: string;
            leftVal: string;
            rightVal: string;
            isChange: boolean;
            changeIndex: number;
        };
        const blocks: Block[] = [];

        while (i < diff.length) {
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

            const isChange = type !== 'equal';
            if (isChange) changeCount++;
            blocks.push({
                type,
                leftVal,
                rightVal,
                isChange,
                changeIndex: isChange ? changeCount - 1 : -1
            });
        }

        setTotalChanges(changeCount);

        for (let b = 0; b < blocks.length; b++) {
            const block = blocks[b];
            const { type, leftVal, rightVal, isChange, changeIndex } = block;

            if (compact && !isChange) {
                const lines = leftVal.split('\n');
                const lineCount = (lines.length > 0 && lines[lines.length - 1] === '') ? lines.length - 1 : lines.length;
                if (lineCount > 0) {
                    leftLineNum += lineCount;
                    rightLineNum += lineCount;
                    rows.push(
                        <tr key={`collapsed-${b}`} className="bg-slate-100/60 border-y border-slate-200 text-center">
                            <td colSpan={4} className="py-1.5 font-mono text-[10px] text-slate-500 font-bold bg-slate-100/80 tracking-wide">
                                ⋯ Collapsed {lineCount} unchanged {lineCount === 1 ? 'line' : 'lines'} ⋯
                            </td>
                        </tr>
                    );
                }
                continue;
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
                let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/80 font-medium' : (type === 'replace' ? 'bg-rose-50/40' : '');
                let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/80 font-medium' : (type === 'replace' ? 'bg-emerald-50/40' : '');

                rows.push(
                    <tr 
                        key={`${b}-${r}`} 
                        className="hover:bg-slate-50 transition-colors duration-75 group border-b border-slate-100/40 last:border-0"
                        data-change-row={isChange ? 'true' : undefined}
                        data-change-index={isChange && r === 0 ? changeIndex : undefined}
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
        setDiffElements(
            <div className="bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-14" /><col className="w-[calc(50%-3.5rem)]" /><col className="w-14 border-l border-slate-200" /><col className="w-[calc(50%-3.5rem)]" /></colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">Original XML Source</th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">Normalized Renumbered Output</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const loadSampleData = () => {
        const sample = `<ce:article>
  <ce:title>Automated Citation Normalization in XML Publishing</ce:title>
  
  <ce:sections>
    <ce:section id="sec0010">
      <ce:section-title>1. Introduction</ce:section-title>
      <ce:para>Previous benchmarks demonstrate significant speedups in XML processing <ce:cross-ref refid="bib0030">[3]</ce:cross-ref>, <ce:cross-ref refid="bib0010">[1]</ce:cross-ref>, and <ce:cross-ref refid="bib0020">[2]</ce:cross-ref>. Multiple references are frequently cited together <ce:cross-refs refid="bib0010 bib0020 bib0030">[1,2,3]</ce:cross-refs>.</ce:para>
      <ce:para>Unstructured background references are also cataloged <ce:cross-ref refid="bib0040">[4]</ce:cross-ref>.</ce:para>
    </ce:section>
  </ce:sections>

  <ce:bibliography id="bib0010" sec-type="references">
    <ce:section-title>References</ce:section-title>
    <ce:bib-reference id="bib0010">
      <ce:label>[1]</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>Alice</ce:given-name><ce:surname>Zimmerman</ce:surname></sb:author></sb:authors><sb:title><sb:maint>High-throughput XML pipelines</sb:maint></sb:title></sb:contribution><sb:host><sb:issue><date>2022</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib0020">
      <ce:label>[2]</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>Bob</ce:given-name><ce:surname>Adams</ce:surname></sb:author></sb:authors><sb:title><sb:maint>Citation graph auditing</sb:maint></sb:title></sb:contribution><sb:host><sb:issue><date>2019</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib0030">
      <ce:label>[3]</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>Charlie</ce:given-name><ce:surname>Brown</ce:surname></sb:author></sb:authors><sb:title><sb:maint>Parsing cross-references safely</sb:maint></sb:title></sb:contribution><sb:host><sb:issue><date>2020</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib0040">
      <ce:label>[4]</ce:label>
      <other-ref>World Health Organization. Global health report on editorial standards, Geneva, 2021.</other-ref>
    </ce:bib-reference>
    <ce:bib-reference id="bib0050">
      <ce:label>[5]</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>David</ce:given-name><ce:surname>Evans</ce:surname></sb:author></sb:authors><sb:title><sb:maint>Uncited secondary source example</sb:maint></sb:title></sb:contribution><sb:host><sb:issue><date>2023</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
  </ce:bibliography>
</ce:article>`;
        setInput(sample);
        setStep('input');
        setToast({ message: "Loaded experimental sample XML with out-of-order citations.", type: "success" });
    };

    const handleTogglePreserveIds = (val: boolean) => {
        setPreserveRefIds(val);
        if (bibNodes.length > 0) {
            let stdSeq = startIndex;
            setBibNodes(prev => prev.map(node => {
                const proposedId = val 
                    ? node.originalId 
                    : `${idPrefix}${(stdSeq * idStep).toString().padStart(4, '0')}`;
                stdSeq++;
                return {
                    ...node,
                    newId: val ? node.originalId : proposedId
                };
            }));
        }
    };

    const runAnalysis = () => {
        if (!input.trim()) {
            setToast({ message: "Please paste XML source text to analyze.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setProcessLabel('Scanning & Auditing Bibliography Nodes...');

        setTimeout(() => {
            try {
                const nodes: BibItemNode[] = [];
                const bibRegex = /<(?:ce:)?bib-reference\b([^>]*?)>([\s\S]*?)<\/(?:ce:)?bib-reference>/gi;
                let match;

                // Count citations in body text using refid="..."
                const crossRefCounts = new Map<string, number>();
                const refidRegex = /\brefid=["']([^"']+)["']/gi;
                let refMatch;
                while ((refMatch = refidRegex.exec(input)) !== null) {
                    const refs = refMatch[1].split(/\s+/).filter(Boolean);
                    refs.forEach(r => crossRefCounts.set(r, (crossRefCounts.get(r) || 0) + 1));
                }

                while ((match = bibRegex.exec(input)) !== null) {
                    const fullTag = match[0];
                    const attrs = match[1];
                    const content = match[2];

                    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
                    const originalId = idMatch ? idMatch[1] : `bib_${nodes.length + 1}`;

                    const labelMatch = content.match(/<(?:ce:)?label\b[^>]*>([\s\S]*?)<\/(?:ce:)?label>/i);
                    const originalLabel = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                    const isOtherRef = /<(?:ce:)?other-ref\b/i.test(content) || !/<(?:ce:)?sb:reference\b|<sb:reference\b/i.test(content);
                    const authorSortKey = extractAuthorYearKey(content, originalLabel);
                    const citationCount = crossRefCounts.get(originalId) || 0;

                    nodes.push({
                        id: `node_${nodes.length}`,
                        originalId,
                        newId: '',
                        originalLabel,
                        newLabel: '',
                        fullTag,
                        content,
                        isOtherRef,
                        authorSortKey,
                        citationCount,
                        status: isOtherRef ? 'other_ref' : 'renumbered'
                    });
                }

                if (nodes.length === 0) {
                    setToast({ message: "No <ce:bib-reference> tags found in XML.", type: "warn" });
                    setIsLoading(false);
                    return;
                }

                // Optionally Sort Alphabetically
                let orderedNodes = [...nodes];
                if (autoSortAlphabetical) {
                    orderedNodes.sort((a, b) => {
                        if (a.isOtherRef && !b.isOtherRef) return 1;
                        if (!a.isOtherRef && b.isOtherRef) return -1;
                        return a.authorSortKey.localeCompare(b.authorSortKey);
                    });
                }

                // Assign Proposed IDs and Labels
                let stdSeq = startIndex;

                orderedNodes = orderedNodes.map((node) => {
                    const proposedNumStr = `${stdSeq}`;
                    const proposedId = preserveRefIds 
                        ? node.originalId 
                        : `${idPrefix}${(stdSeq * idStep).toString().padStart(4, '0')}`;
                    const proposedLabel = `${prefix}${proposedNumStr}${suffix}`;
                    stdSeq++;

                    return {
                        ...node,
                        newId: preserveRefIds ? node.originalId : (node.newId || proposedId),
                        newLabel: node.newLabel || proposedLabel
                    };
                });

                setBibNodes(orderedNodes);
                setStep('matrix');
                setToast({ 
                    message: `Audited ${orderedNodes.length} references (${orderedNodes.filter(n => n.isOtherRef).length} unstructured/other-ref).`, 
                    type: "info" 
                });

            } catch (e) {
                setToast({ message: "Analysis failed. Check XML format.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    const executeRenumbering = () => {
        setIsLoading(true);
        setProcessLabel('Renumbering Bibliography & Updating Cross-References...');

        setTimeout(() => {
            try {
                let result = input;
                const idMap = new Map<string, { newId: string, newLabelNum: string, newLabel: string }>();
                const recordedChanges: DetailedChangeRecord[] = [];

                // 1. Build Replacement Map & Record Bibliography Label Changes
                bibNodes.forEach(node => {
                    const digitsOnly = node.newLabel.replace(/[^\d]/g, '');
                    idMap.set(node.originalId, {
                        newId: node.newId,
                        newLabelNum: digitsOnly || node.newLabel,
                        newLabel: node.newLabel
                    });

                    recordedChanges.push({
                        id: node.originalId,
                        originalId: node.originalId,
                        type: 'bib-label',
                        originalValue: node.originalLabel || '—',
                        newValue: node.newLabel,
                        changed: (node.originalLabel || '').trim() !== node.newLabel.trim()
                    });
                });

                // 2. Re-order and update <ce:bib-reference> blocks
                const updatedTags: string[] = [];

                bibNodes.forEach(node => {
                    let updatedTag = node.fullTag;

                    // Update outer id attribute on <ce:bib-reference>
                    updatedTag = updatedTag.replace(/^<(ce:)?bib-reference\b([^>]*)>/i, (openTag, p1, attrs) => {
                        const tagPrefix = p1 || 'ce:';
                        let newAttrs = attrs;
                        if (/\bid=["'][^"']*["']/i.test(newAttrs)) {
                            newAttrs = newAttrs.replace(/\bid=["'][^"']*["']/i, `id="${node.newId}"`);
                        } else {
                            newAttrs = ` id="${node.newId}"` + newAttrs;
                        }
                        return `<${tagPrefix}bib-reference${newAttrs}>`;
                    });

                    // Update or insert <ce:label>
                    if (/<(?:ce:)?label\b/i.test(updatedTag)) {
                        updatedTag = updatedTag.replace(/<(ce:)?label\b[^>]*>([\s\S]*?)<\/\1label>/gi, `<$1label>${node.newLabel}</$1label>`);
                    } else {
                        updatedTag = updatedTag.replace(/(<(?:ce:)?bib-reference\b[^>]*>)/i, `$1\n      <ce:label>${node.newLabel}</ce:label>`);
                    }

                    updatedTags.push(updatedTag);
                });

                // Splice back into <ce:bibliography> without losing original container attributes
                const bibBlockMatch = result.match(/(<(?:ce:)?bibliography\b[^>]*>)([\s\S]*?)(<\/(?:ce:)?bibliography>)/i);
                if (bibBlockMatch) {
                    const fullMatch = bibBlockMatch[0];
                    const openTag = bibBlockMatch[1]; // Includes leading '<'
                    const innerContent = bibBlockMatch[2];
                    const closeTag = bibBlockMatch[3];

                    const firstBibRefIdx = innerContent.search(/<(?:ce:)?bib-reference\b/i);
                    const lastBibRefEndIdx = innerContent.toLowerCase().lastIndexOf('</bib-reference>');
                    const altLastBibRefEndIdx = innerContent.toLowerCase().lastIndexOf('</ce:bib-reference>');
                    const maxEndIdx = Math.max(lastBibRefEndIdx, altLastBibRefEndIdx);

                    if (firstBibRefIdx !== -1 && maxEndIdx !== -1) {
                        const closingTagLength = innerContent.substring(maxEndIdx).indexOf('>') + 1;
                        const headerBeforeRefs = innerContent.substring(0, firstBibRefIdx);
                        const footerAfterRefs = innerContent.substring(maxEndIdx + closingTagLength);

                        // Detect original indentation before the first <ce:bib-reference> tag
                        const indentMatch = headerBeforeRefs.match(/\n([ \t]*)$/);
                        const refIndent = indentMatch ? indentMatch[1] : '  ';

                        const updatedBibContent = updatedTags.join(`\n${refIndent}`);
                        const newBibInner = `${headerBeforeRefs}${updatedBibContent}${footerAfterRefs}`;
                        result = result.replace(fullMatch, `${openTag}${newBibInner}${closeTag}`);
                    } else {
                        const updatedBibContent = updatedTags.join('\n  ');
                        result = result.replace(fullMatch, `${openTag}\n  ${updatedBibContent}\n${closeTag}`);
                    }
                } else {
                    bibNodes.forEach(node => {
                        result = result.replace(node.fullTag, () => {
                            let tag = node.fullTag;
                            tag = tag.replace(/^<(ce:)?bib-reference\b([^>]*)>/i, (openTag, p1, attrs) => {
                                const tagPrefix = p1 || 'ce:';
                                let newAttrs = attrs;
                                if (/\bid=["'][^"']*["']/i.test(newAttrs)) {
                                    newAttrs = newAttrs.replace(/\bid=["'][^"']*["']/i, `id="${node.newId}"`);
                                } else {
                                    newAttrs = ` id="${node.newId}"` + newAttrs;
                                }
                                return `<${tagPrefix}bib-reference${newAttrs}>`;
                            });
                            tag = tag.replace(/<(ce:)?label\b[^>]*>([\s\S]*?)<\/\1label>/gi, `<$1label>${node.newLabel}</$1label>`);
                            return tag;
                        });
                    });
                }

                // 3. Update Cross-References in Body Text
                let updatedCrossRefCount = 0;

                // A. Single <ce:cross-ref> updates
                const singleRefRegex = /(?:\[\s*)?<(ce:)?cross-ref\b([^>]*)>([\s\S]*?)<\/\1cross-ref>(?:\s*\])?/gi;
                result = result.replace(singleRefRegex, (fullMatch, p1, attrs, text) => {
                    const tagPrefix = p1 || 'ce:';
                    const refidMatch = attrs.match(/\brefid=["']([^"']+)["']/i);
                    if (!refidMatch) return fullMatch;

                    const originalRefid = refidMatch[1].trim();
                    const mappedInfo = idMap.get(originalRefid);

                    if (mappedInfo) {
                        updatedCrossRefCount++;
                        const newAttrs = attrs.replace(/\brefid=["'][^"']*["']/i, `refid="${mappedInfo.newId}"`);
                        
                        let labelText = mappedInfo.newLabel;
                        if (prefix && suffix && !labelText.startsWith(prefix) && !labelText.endsWith(suffix)) {
                            labelText = `${prefix}${labelText}${suffix}`;
                        }

                        const cleanText = text.replace(/<[^>]+>/g, '').trim();
                        recordedChanges.push({
                            id: originalRefid,
                            originalId: originalRefid,
                            type: 'cross-ref',
                            originalValue: cleanText || text.trim() || '—',
                            newValue: labelText,
                            changed: cleanText !== labelText
                        });
                        
                        return `<${tagPrefix}cross-ref${newAttrs}>${labelText}</${tagPrefix}cross-ref>`;
                    }
                    return fullMatch;
                });

                // B. Grouped <ce:cross-refs> updates with ascending sort and range compression
                const groupRefRegex = /(?:\[\s*)?<(ce:)?cross-refs\b([^>]*)>([\s\S]*?)<\/\1cross-refs>(?:\s*\])?/gi;
                result = result.replace(groupRefRegex, (fullMatch, p1, attrs, text) => {
                    const tagPrefix = p1 || 'ce:';
                    const refidMatch = attrs.match(/\brefid=["']([^"']+)["']/i);
                    if (!refidMatch) return fullMatch;

                    const originalIds = refidMatch[1].split(/\s+/).filter(Boolean);
                    type MappedItem = { newId: string; newLabelNum: string; newLabel: string };
                    const mappedItems = originalIds
                        .map((id: string) => idMap.get(id))
                        .filter((item: MappedItem | undefined): item is MappedItem => item !== undefined);

                    if (mappedItems.length > 0) {
                        updatedCrossRefCount++;

                        mappedItems.sort((a: MappedItem, b: MappedItem) => {
                            const numA = parseInt(a.newLabelNum);
                            const numB = parseInt(b.newLabelNum);
                            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                            return a.newId.localeCompare(b.newId);
                        });

                        const newRefids = mappedItems.map((m: MappedItem) => m.newId).join(' ');
                        const newAttrs = attrs.replace(/\brefid=["'][^"']*["']/i, `refid="${newRefids}"`);

                        const nums = mappedItems
                            .map((m: MappedItem) => parseInt(m.newLabelNum))
                            .filter((n: number) => !isNaN(n));

                        let labelText = '';
                        if (nums.length === mappedItems.length) {
                            labelText = formatNumberList(nums, compressRanges, prefix, suffix);
                        } else {
                            const joinedLabels = mappedItems.map((m: MappedItem) => m.newLabel.replace(/^\[|\]$/g, '')).join(',');
                            labelText = `${prefix}${joinedLabels}${suffix}`;
                        }

                        const cleanText = text.replace(/<[^>]+>/g, '').trim();
                        recordedChanges.push({
                            id: originalIds.join(' '),
                            originalId: originalIds.join(' '),
                            type: 'cross-refs',
                            originalValue: cleanText || text.trim() || '—',
                            newValue: labelText,
                            changed: cleanText !== labelText
                        });

                        return `<${tagPrefix}cross-refs${newAttrs}>${labelText}</${tagPrefix}cross-refs>`;
                    }
                    return fullMatch;
                });

                setOutput(result);
                setChangesList(recordedChanges);
                setActiveTab('changes');
                generateDiff(input, result);

                // Update Diagnostics
                const renumberedCount = bibNodes.filter(n => !n.isOtherRef).length;
                const otherRefsCount = bibNodes.filter(n => n.isOtherRef).length;
                const uncitedCount = bibNodes.filter(n => n.citationCount === 0).length;

                setDiagnostics({
                    totalRefs: bibNodes.length,
                    renumberedCount,
                    crossRefsUpdatedCount: updatedCrossRefCount,
                    otherRefsCount,
                    uncitedCount
                });

                // Smart Suggestions
                const newSuggestions: SmartSuggestion[] = [];
                if (uncitedCount > 0) {
                    newSuggestions.push({
                        id: 'uncited-cleaner',
                        toolName: 'Uncited Ref Cleaner',
                        description: `Detected ${uncitedCount} references with no body citations. Purge safely while preserving document integrity.`,
                        path: '/uncitedCleaner',
                        icon: <Eraser className="w-4 h-4" />,
                        condition: 'Uncited references present'
                    });
                }

                newSuggestions.push({
                    id: 'citation-linker-exp',
                    toolName: 'Citation Linker Pro (Experimental)',
                    description: 'Auto-scan orphan citations and link them using multi-entity matching.',
                    path: '/citationLinkerExp',
                    icon: <LinkIcon className="w-4 h-4" />,
                    condition: 'Citation auditing available'
                });

                setSuggestions(newSuggestions);
                setStep('result');
                setActiveTab('xml');
                setToast({ message: "XML renumbering & cross-reference normalization completed!", type: "success" });

            } catch (e) {
                setToast({ message: "Renumbering failed during XML processing.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 600);
    };

    const updateNodeLabel = (id: string, newLabelVal: string) => {
        setBibNodes(prev => prev.map(n => n.id === id ? { ...n, newLabel: newLabelVal, status: 'custom' } : n));
    };

    const updateNodeId = (id: string, newIdVal: string) => {
        setBibNodes(prev => prev.map(n => n.id === id ? { ...n, newId: newIdVal, status: 'custom' } : n));
    };

    const filteredMatrixNodes = useMemo(() => {
        return bibNodes.filter(node => {
            const isLabelOrIdModified = (node.originalLabel || '').trim() !== (node.newLabel || '').trim() || node.originalId !== node.newId;
            if (matrixFilter === 'modified_only' && !isLabelOrIdModified) return false;
            if (matrixFilter === 'renumbered' && node.isOtherRef) return false;
            if (matrixFilter === 'other_ref' && !node.isOtherRef) return false;
            if (matrixFilter === 'uncited' && node.citationCount > 0) return false;

            if (matrixSearch.trim()) {
                const q = matrixSearch.toLowerCase();
                return node.originalId.toLowerCase().includes(q) ||
                    node.newId.toLowerCase().includes(q) ||
                    node.originalLabel.toLowerCase().includes(q) ||
                    node.newLabel.toLowerCase().includes(q) ||
                    node.content.toLowerCase().includes(q);
            }
            return true;
        });
    }, [bibNodes, matrixFilter, matrixSearch]);

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current) return;
        const changeRows = diffContainerRef.current.querySelectorAll('[data-change-row="true"][data-change-index]');
        if (changeRows.length === 0) return;

        let nextIndex = currentChangeIndex;
        if (direction === 'next') {
            if (currentChangeIndex < 0 || currentChangeIndex >= changeRows.length - 1) {
                nextIndex = 0;
            } else {
                nextIndex = currentChangeIndex + 1;
            }
        } else {
            if (currentChangeIndex <= 0) {
                nextIndex = changeRows.length - 1;
            } else {
                nextIndex = currentChangeIndex - 1;
            }
        }

        const targetRow = changeRows[nextIndex] as HTMLElement;
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current) return;
        
        // Remove old highlights
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-blue-100/70', 'ring-2', 'ring-blue-400', 'ring-inset', 'z-10'));

        if (currentChangeIndex === -1) return;

        // Add new highlights
        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-blue-100/70', 'ring-2', 'ring-blue-400', 'ring-inset', 'z-10'));
    }, [currentChangeIndex, diffElements]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (activeTab === 'diff') {
                if (e.key === 'ArrowDown' || (e.altKey && e.key.toLowerCase() === 'n')) {
                    e.preventDefault();
                    scrollToChange('next');
                } else if (e.key === 'ArrowUp' || (e.altKey && e.key.toLowerCase() === 'p')) {
                    e.preventDefault();
                    scrollToChange('prev');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, currentChangeIndex, totalChanges]);

    const handleDownloadXml = () => {
        if (!output) return;
        const blob = new Blob([output], { type: 'application/xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'renumbered_normalized.xml';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setToast({ message: "Downloaded normalized XML file.", type: "success" });
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAnalysis : (step === 'matrix' ? executeRenumbering : undefined),
        onClear: () => { setInput(''); setBibNodes([]); setStep('input'); }
    }, [input, step, bibNodes, prefix, suffix, startIndex, idPrefix, autoSortAlphabetical, compressRanges]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header Title */}
            <div className="mb-8 text-center animate-fade-in relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-800 text-xs font-black uppercase tracking-widest mb-3">
                    <Sparkles size={13} className="text-blue-600" />
                    <span>Experimental Normalizer Protocol v2.5</span>
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">
                    XML Normalizer Pro <span className="text-blue-600">(Experimental)</span>
                </h1>
                <p className="text-slate-500 max-w-3xl mx-auto font-medium text-sm leading-relaxed">
                    Advanced sequential citation renumbering with alphabetical sorting, range compression, and normalized cross-references.
                </p>
            </div>

            {/* Configuration Controls */}
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 mb-8 transition-all">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Sliders size={15} className="text-blue-600" /> Renumbering Rules & Formatting Options
                    </span>
                    <button 
                        onClick={loadSampleData}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        <Wand2 size={13} /> Load Out-of-Order Sample
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Label Enclosure:</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="text" 
                                value={prefix} 
                                onChange={e => setPrefix(e.target.value)}
                                className="w-1/2 p-2 border border-slate-200 rounded-xl text-center font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" 
                                placeholder="[" 
                            />
                            <span className="text-xs font-bold text-slate-400">#</span>
                            <input 
                                type="text" 
                                value={suffix} 
                                onChange={e => setSuffix(e.target.value)}
                                className="w-1/2 p-2 border border-slate-200 rounded-xl text-center font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" 
                                placeholder="]" 
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Start Index & Step:</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={startIndex} 
                                onChange={e => setStartIndex(parseInt(e.target.value) || 1)}
                                className="w-1/2 p-2 border border-slate-200 rounded-xl text-center font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" 
                                min={1}
                            />
                            <span className="text-xs font-bold text-slate-400">Step</span>
                            <input 
                                type="number" 
                                value={idStep} 
                                onChange={e => setIdStep(parseInt(e.target.value) || 5)}
                                className="w-1/2 p-2 border border-slate-200 rounded-xl text-center font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" 
                                min={1}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bib ID Prefix:</label>
                        <input 
                            type="text" 
                            value={idPrefix} 
                            onChange={e => setIdPrefix(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-xl text-center font-mono text-sm font-bold bg-slate-50 focus:bg-white focus:border-blue-500 outline-none" 
                            placeholder="bb" 
                        />
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <Switch id="exp-toggle-sort" label="Alphabetical Order" subLabel="Sort author surname prior to renumbering" checked={autoSortAlphabetical} onChange={setAutoSortAlphabetical} color="blue" />
                    <Switch id="exp-toggle-range" label="Compress Ranges" subLabel="Convert [1,2,3] -> [1–3]" checked={compressRanges} onChange={setCompressRanges} color="indigo" />
                    <Switch id="exp-toggle-preserve-ids" label="Preserve Ref IDs" subLabel="Keep original id=&quot;...&quot; values intact" checked={preserveRefIds} onChange={handleTogglePreserveIds} color="emerald" />
                </div>
            </div>

            {/* STEP 1: Input Area */}
            {step === 'input' && (
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <FileCode size={14} className="text-blue-600" /> Source XML Stream
                        </span>
                        <div className="flex items-center gap-2">
                            {input && (
                                <button 
                                    onClick={() => setInput('')}
                                    className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors"
                                >
                                    Clear Input
                                </button>
                            )}
                        </div>
                    </div>
                    <textarea 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Paste your document XML with <ce:bib-reference> and <ce:cross-ref> tags..."
                        rows={16}
                        className="w-full p-4 font-mono text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                    />

                    <div className="mt-6 flex justify-end">
                        <button 
                            onClick={runAnalysis}
                            disabled={isLoading || !input.trim()}
                            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <Search size={16} /> Audit & Plan Renumbering
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Renumber Audit Matrix */}
            {step === 'matrix' && (
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                                <Layers className="text-blue-600" size={20} /> Bibliography Renumbering Audit Matrix
                            </h2>
                            <p className="text-xs font-medium text-slate-500 mt-1">
                                Review proposed IDs and sequential labels. Adjust manual overrides before applying changes to the XML stream.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setStep('input')}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5"
                            >
                                <RotateCcw size={14} /> Back to Input
                            </button>
                            <button 
                                onClick={executeRenumbering}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                            >
                                <CheckCircle2 size={14} /> Apply Renumbering Protocol
                            </button>
                        </div>
                    </div>

                    {/* Matrix Filters */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            <button 
                                onClick={() => setMatrixFilter('all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${matrixFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                All ({bibNodes.length})
                            </button>
                            <button 
                                onClick={() => setMatrixFilter('modified_only')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${matrixFilter === 'modified_only' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'}`}
                            >
                                <CheckCircle2 size={13} /> Label Modified ({bibNodes.filter(n => (n.originalLabel || '').trim() !== (n.newLabel || '').trim() || n.originalId !== n.newId).length})
                            </button>
                            <button 
                                onClick={() => setMatrixFilter('renumbered')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${matrixFilter === 'renumbered' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Standard Refs ({bibNodes.filter(n => !n.isOtherRef).length})
                            </button>
                            <button 
                                onClick={() => setMatrixFilter('other_ref')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${matrixFilter === 'other_ref' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Other-Refs ({bibNodes.filter(n => n.isOtherRef).length})
                            </button>
                            <button 
                                onClick={() => setMatrixFilter('uncited')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${matrixFilter === 'uncited' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Uncited ({bibNodes.filter(n => n.citationCount === 0).length})
                            </button>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                value={matrixSearch} 
                                onChange={e => setMatrixSearch(e.target.value)}
                                placeholder="Search ID or label..."
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Matrix Table */}
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                                    <th className="p-3 w-12 text-center">#</th>
                                    <th className="p-3">Original ID</th>
                                    <th className="p-3">Original Label</th>
                                    <th className="p-3">Proposed ID</th>
                                    <th className="p-3">Proposed Label</th>
                                    <th className="p-3 text-center">Renumber Action</th>
                                    <th className="p-3 text-center">Body Citations</th>
                                    <th className="p-3">Reference Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredMatrixNodes.map((node, idx) => {
                                    const isMod = (node.originalLabel || '').trim() !== (node.newLabel || '').trim() || node.originalId !== node.newId;
                                    return (
                                        <tr key={node.id} className={`transition-colors ${isMod ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500 hover:bg-emerald-50/70' : 'hover:bg-slate-50/80'}`}>
                                            <td className="p-3 font-mono text-center text-slate-400 font-bold">{idx + 1}</td>
                                            <td className="p-3 font-mono text-slate-600 font-medium">{node.originalId}</td>
                                            <td className="p-3 font-mono text-slate-800 font-bold">{node.originalLabel || '—'}</td>
                                            <td className="p-3">
                                                <input 
                                                    type="text" 
                                                    value={node.newId} 
                                                    onChange={e => updateNodeId(node.id, e.target.value)}
                                                    className={`w-28 p-1 font-mono text-xs border rounded-lg focus:border-blue-500 outline-none ${isMod ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200'}`} 
                                                />
                                            </td>
                                            <td className="p-3">
                                                {isMod ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="line-through text-rose-500 text-xs font-mono font-semibold">{node.originalLabel || '—'}</span>
                                                        <span className="text-emerald-700 font-bold">→</span>
                                                        <input 
                                                            type="text" 
                                                            value={node.newLabel} 
                                                            onChange={e => updateNodeLabel(node.id, e.target.value)}
                                                            className="w-24 p-1 font-mono text-xs font-black border border-emerald-400 bg-emerald-100/90 text-emerald-950 rounded-lg focus:border-blue-500 outline-none shadow-2xs" 
                                                        />
                                                    </div>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        value={node.newLabel} 
                                                        onChange={e => updateNodeLabel(node.id, e.target.value)}
                                                        className="w-24 p-1 font-mono text-xs font-bold border border-slate-200 rounded-lg bg-white focus:border-blue-500 outline-none" 
                                                    />
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                {isMod ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold shadow-2xs uppercase tracking-wide">
                                                        <CheckCircle2 size={11} /> Label Renumbered
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-medium">
                                                        Unchanged
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${node.citationCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                    {node.citationCount} {node.citationCount === 1 ? 'citation' : 'citations'}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {node.isOtherRef ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                                                        <AlertCircle size={10} /> Other-Ref / Unstructured
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold">
                                                        <CheckCircle2 size={10} /> Structured Reference
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* STEP 3: Results & Diff View */}
            {step === 'result' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Diagnostics Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total References</span>
                            <span className="text-xl font-black text-slate-900">{diagnostics.totalRefs}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Renumbered</span>
                            <span className="text-xl font-black text-blue-600">{diagnostics.renumberedCount}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cross-Refs Updated</span>
                            <span className="text-xl font-black text-indigo-600">{diagnostics.crossRefsUpdatedCount}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Other-Refs Isolated</span>
                            <span className="text-xl font-black text-amber-600">{diagnostics.otherRefsCount}</span>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Uncited Warnings</span>
                            <span className="text-xl font-black text-rose-600">{diagnostics.uncitedCount}</span>
                        </div>
                    </div>

                    {/* Main Tabs Container */}
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                                <button 
                                    onClick={() => setActiveTab('changes')}
                                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${activeTab === 'changes' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
                                >
                                    <ListChecks size={14} /> Audit Changes Log ({changesList.filter(c => c.changed).length} changed)
                                </button>
                                <button 
                                    onClick={() => setActiveTab('xml')}
                                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${activeTab === 'xml' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
                                >
                                    Normalized XML Output
                                </button>
                                <button 
                                    onClick={() => {
                                        setActiveTab('diff');
                                        if (!diffElements) generateDiff(input, output);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${activeTab === 'diff' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}
                                >
                                    Visual Diff View
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => { setStep('input'); setOutput(''); }}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1"
                                >
                                    <RotateCcw size={13} /> New Document
                                </button>
                                <button 
                                    onClick={handleDownloadXml}
                                    className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all flex items-center gap-1"
                                >
                                    <Download size={13} /> Export File
                                </button>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(output);
                                        setToast({ message: "Normalized XML copied to clipboard!", type: "success" });
                                    }}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                                >
                                    <Copy size={13} /> Copy XML
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Audit Changes Log Tab */}
                            {activeTab === 'changes' && (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setChangesFilter('all')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${changesFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                                            >
                                                All Records ({changesList.length})
                                            </button>
                                            <button 
                                                onClick={() => setChangesFilter('changed')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${changesFilter === 'changed' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                                            >
                                                Modified Only ({changesList.filter(c => c.changed).length})
                                            </button>
                                            <button 
                                                onClick={() => setChangesFilter('unchanged')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${changesFilter === 'unchanged' ? 'bg-slate-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                                            >
                                                Unchanged ({changesList.filter(c => !c.changed).length})
                                            </button>
                                        </div>

                                        <div className="relative w-full sm:w-64">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="text" 
                                                value={changesSearch} 
                                                onChange={e => setChangesSearch(e.target.value)}
                                                placeholder="Filter changes by ID or label..."
                                                className="w-full pl-9 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[500px]">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px] z-10">
                                                <tr>
                                                    <th className="p-3 w-12 text-center">#</th>
                                                    <th className="p-3">Reference ID</th>
                                                    <th className="p-3">Type</th>
                                                    <th className="p-3">Original Value</th>
                                                    <th className="p-3">Updated Value</th>
                                                    <th className="p-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {changesList
                                                    .filter(item => {
                                                        if (changesFilter === 'changed' && !item.changed) return false;
                                                        if (changesFilter === 'unchanged' && item.changed) return false;
                                                        if (changesSearch.trim()) {
                                                            const q = changesSearch.toLowerCase();
                                                            return item.originalId.toLowerCase().includes(q) ||
                                                                item.originalValue.toLowerCase().includes(q) ||
                                                                item.newValue.toLowerCase().includes(q);
                                                        }
                                                        return true;
                                                    })
                                                    .map((item, idx) => (
                                                        <tr key={`${item.id}-${idx}`} className={`transition-colors ${item.changed ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500 hover:bg-emerald-50/70' : 'hover:bg-slate-50/80 opacity-75'}`}>
                                                            <td className="p-3 font-mono text-center text-slate-400 font-bold">{idx + 1}</td>
                                                            <td className="p-3 font-mono text-slate-700 font-bold">{item.originalId}</td>
                                                            <td className="p-3">
                                                                <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                                                                    item.type === 'bib-label' ? 'bg-blue-100 text-blue-900 border border-blue-200' : 
                                                                    item.type === 'cross-ref' ? 'bg-purple-100 text-purple-900 border border-purple-200' : 
                                                                    'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                                                }`}>
                                                                    {item.type === 'bib-label' ? 'Bib Label' : item.type === 'cross-ref' ? 'Cross-Ref' : 'Cross-Refs Range'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-mono">
                                                                {item.changed ? (
                                                                    <span className="inline-flex items-center gap-1 font-mono text-rose-950 font-bold bg-rose-100 border border-rose-300 px-2.5 py-1 rounded-lg text-xs line-through decoration-rose-600">
                                                                        <span className="text-[9px] text-rose-700 font-normal uppercase">Old:</span> {item.originalValue}
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-mono text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-lg text-xs">
                                                                        {item.originalValue}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 font-mono">
                                                                {item.changed ? (
                                                                    <span className="inline-flex items-center gap-1.5 font-mono text-emerald-950 font-black bg-emerald-200 border border-emerald-400 px-2.5 py-1 rounded-lg text-xs shadow-2xs">
                                                                        <span className="text-[9px] text-emerald-800 font-bold uppercase">New:</span> {item.newValue}
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-mono text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-lg text-xs">
                                                                        {item.newValue}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                {item.changed ? (
                                                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black shadow-2xs uppercase tracking-wide">
                                                                        <CheckCircle2 size={11} /> Renumbered
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-medium">
                                                                        Unchanged
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Raw XML Tab */}
                            {activeTab === 'xml' && (
                                <textarea 
                                    value={output}
                                    readOnly
                                    rows={18}
                                    className="w-full p-4 font-mono text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none text-slate-800"
                                />
                            )}

                            {/* Diff View Tab */}
                            {activeTab === 'diff' && (
                                <div className="space-y-3 relative">
                                    <div className="flex items-center justify-between px-2">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-slate-500">
                                                Total Modified Sections: <span className="text-blue-600 font-extrabold">{totalChanges}</span>
                                            </span>
                                            <button 
                                                onClick={() => {
                                                    const newCompact = !compactDiffOnly;
                                                    setCompactDiffOnly(newCompact);
                                                    generateDiff(input, output, newCompact);
                                                }}
                                                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                                                    compactDiffOnly 
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' 
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <Eye size={13} /> {compactDiffOnly ? 'Compact Mode (Changes Only)' : 'Show Full Context'}
                                            </button>
                                        </div>

                                        {totalChanges > 0 && (
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                                                <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
                                                    <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                                                        <GitCompare className="w-3 h-3 text-blue-600" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Changes:</span>
                                                        <span className="text-xs font-black text-slate-900 font-mono tabular-nums">
                                                            {currentChangeIndex >= 0 ? currentChangeIndex + 1 : 0} <span className="text-slate-300">/</span> {totalChanges}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => scrollToChange('prev')}
                                                        className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded transition-all text-slate-600 hover:text-blue-600 group"
                                                        title="Previous Change (Up Arrow / Alt+P)"
                                                    >
                                                        <ChevronUp className="w-4 h-4 group-active:-translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                                    </button>
                                                    <button 
                                                        onClick={() => scrollToChange('next')}
                                                        className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded transition-all text-slate-600 hover:text-blue-600 group"
                                                        title="Next Change (Down Arrow / Alt+N)"
                                                    >
                                                        <ChevronDown className="w-4 h-4 group-active:translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <div ref={diffContainerRef} className="max-h-[550px] overflow-y-auto border border-slate-200 rounded-2xl">
                                            {diffElements}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Smart Recommendations */}
                    {suggestions.length > 0 && (
                        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-6 rounded-[2.5rem] border border-blue-100/80 shadow-sm">
                            <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Sparkles size={15} className="text-blue-600" /> Next Tool Recommendations
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {suggestions.map(sugg => (
                                    <div 
                                        key={sugg.id}
                                        onClick={() => navigate(sugg.path, { state: { transferredXml: output, sourceTool: 'XML Normalizer Pro (Exp)' } })}
                                        className="bg-white p-4 rounded-2xl border border-blue-200/60 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                                                    {sugg.icon} {sugg.toolName}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 leading-relaxed">{sugg.description}</p>
                                        </div>
                                        <span className="mt-3 text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg self-start">
                                            {sugg.condition}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isLoading && <LoadingOverlay message={processLabel} color="blue" />}
        </div>
    );
};

export default XmlRenumberExperimental;
