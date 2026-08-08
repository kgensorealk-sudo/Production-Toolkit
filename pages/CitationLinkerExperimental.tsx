import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, Change, diffWordsWithSpace } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { 
    ChevronUp, ChevronDown, GitCompare, Lightbulb, ArrowRight, Link as LinkIcon, 
    Eraser, Hash, Trash2, RefreshCw, Box, Sparkles, Wand2, Search, Sliders, 
    CheckCircle2, AlertTriangle, HelpCircle, FileCode, Check, Copy, Eye, EyeOff, RotateCcw,
    Layers, Tag, Cpu, ShieldAlert, AlertCircle, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';

interface TargetNode {
    id: string;
    type: 'bib' | 'figure' | 'table' | 'formula' | 'section';
    label: string;
    displayText: string;
    normalized: string;
    authors?: string[];
    year?: string;
}

interface ResolutionItem {
    id: string;
    originalTag: string;
    originalAttrs: string;
    textContent: string;
    formattedText?: string;
    tagType: 'bib' | 'figure' | 'table' | 'formula' | 'section' | 'unknown';
    status: 'resolved' | 'failed' | 'ignored' | 'autotag';
    existingId: string;
    existingRefid: string;
    mappedIds: string[];
    isAutoTagged?: boolean;
    confidenceScore: number; // 0 - 100
    notes?: string;
    originalIsPlural: boolean;
    targetIsPlural: boolean;
    missingRefid: boolean;
    missingId: boolean;
    isDuplicate: boolean;
}

interface DiagnosticStats {
    totalScanned: number;
    resolvedCount: number;
    unlinkedCount: number;
    orphanCount: number;
    autoTaggedCount: number;
    brokenCount: number;
    uncitedCount: number;
}

const CitationLinkerExperimental: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [resolutions, setResolutions] = useState<ResolutionItem[]>([]);
    const [targetNodes, setTargetNodes] = useState<TargetNode[]>([]);
    const [step, setStep] = useState<'input' | 'matrix' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [processLabel, setProcessLabel] = useState('');
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [matrixFilter, setMatrixFilter] = useState<'unlinked' | 'failed' | 'autotag' | 'resolved' | 'all' | 'ignored'>('unlinked');
    const [matrixSearch, setMatrixSearch] = useState('');
    
    // Diff Navigation States
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Manual Target Picker Modal State
    const [editingItem, setEditingItem] = useState<ResolutionItem | null>(null);
    const [pickerSearch, setPickerSearch] = useState('');

    // Diagnostic Stats
    const [diagnostics, setDiagnostics] = useState<DiagnosticStats>({
        totalScanned: 0,
        resolvedCount: 0,
        unlinkedCount: 0,
        orphanCount: 0,
        autoTaggedCount: 0,
        brokenCount: 0,
        uncitedCount: 0
    });

    // Configuration Toggles & Controls
    const [showProtocolToggles, setShowProtocolToggles] = useState<boolean>(true);
    const [targetMissingRefid, setTargetMissingRefid] = useState(true);
    const [targetMissingId, setTargetMissingId] = useState(true);
    const [targetDuplicateId, setTargetDuplicateId] = useState(true);
    const [cleanDoi, setCleanDoi] = useState(true);
    const [resolveFloats, setResolveFloats] = useState(false);
    const [compressFloatRanges, setCompressFloatRanges] = useState(false);
    const [autoTagTextCitations, setAutoTagTextCitations] = useState(false);
    const [fuzzyThreshold, setFuzzyThreshold] = useState<number>(80);
    const [idPrefix, setIdPrefix] = useState('cf');
    const [cfStart, setCfStart] = useState<number>(3000);
    const [doiCount, setDoiCount] = useState(0);
    const [rangeCandidateCount, setRangeCandidateCount] = useState<number>(0);
    const [sampleRangeCandidate, setSampleRangeCandidate] = useState<{ original: string; compressed: string } | null>(null);
    const [floatCandidateCount, setFloatCandidateCount] = useState<number>(0);
    const [sampleFloatCandidate, setSampleFloatCandidate] = useState<{ original: string; mappedIds: string[] } | null>(null);
    const [autoTagCandidateCount, setAutoTagCandidateCount] = useState<number>(0);
    const [sampleAutoTagCandidate, setSampleAutoTagCandidate] = useState<{ rawText: string; mappedIds: string[] } | null>(null);

    // Import from other tools via location state
    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Source XML imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const normalizeCitation = (text: string) => {
        return text
            .replace(/<[^>]+>/g, '') 
            .toLowerCase()
            .replace(/&amp;/g, 'and')
            .replace(/&/g, 'and')
            .replace(/'s\b/gi, '') 
            .replace(/et\s+al\.?/gi, '') 
            .replace(/\bfigures?\b/g, 'fig')
            .replace(/\bfigs?\b/g, 'fig')
            .replace(/\btables?\b/g, 'table')
            .replace(/\bschemes?\b/g, 'scheme')
            .replace(/\bboxes?\b/g, 'box')
            .replace(/[\(\)\[\];]/g, ' ') 
            .replace(/\.(?!\d)/g, ' ')
            .replace(/,(?![a-z]\b)/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const extractYears = (text: string) => {
        const results: string[] = [];
        // Match ranges like 2020-2022
        const rangePattern = /\b((?:18|19|20)\d{2})[\-–—]((?:18|19|20)\d{2})\b/g;
        let rangeMatch;
        while ((rangeMatch = rangePattern.exec(text)) !== null) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            if (start <= end && end - start < 20) {
                for (let y = start; y <= end; y++) {
                    results.push(y.toString());
                }
            }
        }

        const yearPattern = /\b((?:18|19|20)\d{2})([a-z]?)((?:[\s,;&/]+[a-z])*)\b/gi;
        let match;
        while ((match = yearPattern.exec(text)) !== null) {
            const yearBase = match[1];
            const firstSuffix = match[2];
            const extraSuffixes = match[3];

            const y1 = (yearBase + firstSuffix).toLowerCase();
            if (!results.includes(y1)) results.push(y1);

            if (extraSuffixes) {
                const suffixes = extraSuffixes.split(/[\s,;&/]+/).map(s => s.trim()).filter(Boolean);
                suffixes.forEach(s => {
                    const yN = (yearBase + s).toLowerCase();
                    if (!results.includes(yN)) results.push(yN);
                });
            }
        }
        return results;
    };

    const extractFirstAuthor = (text: string) => {
        const clean = normalizeCitation(text);
        const parts = clean.split(/\s+/)
            .map(p => p.replace(/^[^\w]+|[^\w]+$/g, ''))
            .filter(p => p && !['and', 'et', 'al', 'fig', 'table', 'scheme', 'box'].includes(p) && !/^(18|19|20)\d{2}[a-z]?$/.test(p));
        const longParts = parts.filter(p => p.length > 1);
        return longParts.length > 0 ? longParts[0] : parts[0] || '';
    };

    // Levenshtein similarity score (0 to 100)
    const calculateSimilarity = (str1: string, str2: string): number => {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        if (s1 === s2) return 100;
        if (!s1 || !s2) return 0;
        
        const m = s1.length;
        const n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        const maxLen = Math.max(m, n);
        return Math.round(((maxLen - dp[m][n]) / maxLen) * 100);
    };

    const resolveFloatRefIds = (
        text: string, 
        tagType: string, 
        nodes: TargetNode[],
        compressRanges: boolean = false
    ): { mappedIds: string[], formattedText?: string, canCompressRange: boolean, potentialFormattedText?: string } => {
        const cleanText = text.replace(/<[^>]+>/g, '').trim();
        const normText = cleanText.toLowerCase();
        
        let floatType: 'figure' | 'table' | 'formula' | 'section' | null = null;
        if (tagType === 'figure' || /^(fig|figure)/i.test(normText)) floatType = 'figure';
        else if (tagType === 'table' || /^(tbl|table)/i.test(normText)) floatType = 'table';
        else if (tagType === 'formula' || /^(eq|formula|equation)/i.test(normText)) floatType = 'formula';
        else if (tagType === 'section' || /^(sec|section)/i.test(normText)) floatType = 'section';

        const candidateNodes = nodes.filter(n => floatType ? n.type === floatType : n.type !== 'bib');
        if (candidateNodes.length === 0) return { mappedIds: [], canCompressRange: false };

        const numberPart = cleanText.replace(/^(figures?|figs?|tables?|tbls?|schemes?|boxes?|equations?|eqs?|formulas?|sections?|secs?)\b[\.\s]*/i, '').trim();

        const getFloatNodeId = (labelStr: string): string | null => {
            const cleanLabel = labelStr.replace(/[\(\)\[\]]/g, '').trim();
            if (!cleanLabel) return null;

            const exact = candidateNodes.find(n => {
                const nodeLabelClean = n.label.replace(/^(figures?|figs?|tables?|tbls?|schemes?|boxes?|equations?|eqs?|formulas?|sections?|secs?)\b[\.\s]*/i, '').replace(/[\(\)\[\]]/g, '').trim();
                return nodeLabelClean.toLowerCase() === cleanLabel.toLowerCase();
            });
            if (exact) return exact.id;

            const targetDigits = cleanLabel.replace(/\D/g, '');
            if (targetDigits) {
                const numMatch = candidateNodes.find(n => {
                    const nodeDigits = n.label.replace(/\D/g, '') || n.id.replace(/\D/g, '');
                    return nodeDigits && (parseInt(nodeDigits) === parseInt(targetDigits));
                });
                if (numMatch) return numMatch.id;
            }

            const normMatch = candidateNodes.find(n => n.normalized.endsWith(cleanLabel.toLowerCase()));
            if (normMatch) return normMatch.id;

            return null;
        };

        const matchedIdsSet = new Set<string>();
        const matchedNumbers: number[] = [];

        const tokens = numberPart.split(/[,;&]|\band\b|\bor\b/i).map(t => t.trim()).filter(Boolean);

        tokens.forEach(tok => {
            const rangeMatch = tok.match(/^[\(\[]?\s*(\d+)\s*[\)\]]?\s*(?:[\-–—\u2013\u2014]|to|through)\s*[\(\[]?\s*(\d+)\s*[\)\]]?$/i);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                if (!isNaN(start) && !isNaN(end) && start <= end && end - start <= 50) {
                    for (let n = start; n <= end; n++) {
                        matchedNumbers.push(n);
                        const id = getFloatNodeId(n.toString());
                        if (id) matchedIdsSet.add(id);
                    }
                }
            } else {
                const numVal = parseInt(tok.replace(/\D/g, ''));
                if (!isNaN(numVal)) matchedNumbers.push(numVal);

                const id = getFloatNodeId(tok);
                if (id) matchedIdsSet.add(id);
            }
        });

        if (matchedIdsSet.size === 0) {
            const normClean = normText.replace(/[\(\)\[\]]/g, '');
            const floatCandidate = candidateNodes.find(n => n.normalized === normClean || normClean.includes(n.normalized) || n.normalized.includes(normClean));
            if (floatCandidate) matchedIdsSet.add(floatCandidate.id);
        }

        const mappedIds = Array.from(matchedIdsSet);

        let potentialFormattedText: string | undefined = undefined;
        if (mappedIds.length > 1 && matchedNumbers.length > 1) {
            const uniqueNums = Array.from(new Set(matchedNumbers)).sort((a, b) => a - b);
            const isConsecutive = uniqueNums.length > 1 && uniqueNums.every((num, idx) => idx === 0 || num === uniqueNums[idx - 1] + 1);

            let prefix = '';
            if (floatType === 'figure' || /^(fig|figure)/i.test(cleanText)) prefix = 'Figs.';
            else if (floatType === 'table' || /^(tbl|table)/i.test(cleanText)) prefix = 'Tables';
            else if (floatType === 'formula' || /^(eq|formula|equation)/i.test(cleanText)) prefix = 'Eqs.';
            else if (floatType === 'section' || /^(sec|section)/i.test(cleanText)) prefix = 'Sections';

            if (prefix) {
                if (isConsecutive && uniqueNums.length >= 2) {
                    potentialFormattedText = `${prefix} ${uniqueNums[0]}–${uniqueNums[uniqueNums.length - 1]}`;
                } else if (uniqueNums.length === 2) {
                    potentialFormattedText = `${prefix} ${uniqueNums[0]} and ${uniqueNums[1]}`;
                } else if (uniqueNums.length > 2) {
                    potentialFormattedText = `${prefix} ${uniqueNums.slice(0, -1).join(', ')}, and ${uniqueNums[uniqueNums.length - 1]}`;
                }
            }
        }

        const canCompressRange = !!(potentialFormattedText && potentialFormattedText !== cleanText);
        const formattedText = compressRanges ? potentialFormattedText : undefined;

        return { mappedIds, formattedText, canCompressRange, potentialFormattedText };
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/30 font-medium');
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
        let leftLineNum = 1, rightLineNum = 1, i = 0;
        let changeCount = 0;

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

            const isChange = type !== 'equal';
            if (isChange) changeCount++;
            const currentBlockIdx = isChange ? changeCount - 1 : -1;

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
                        data-change-row={isChange ? 'true' : undefined}
                        data-change-index={isChange && r === 0 ? currentBlockIdx : undefined}
                        data-change-index-group={isChange ? currentBlockIdx : undefined}
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
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">Original Source Stream</th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">Experimental Linked Output</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const loadSampleData = () => {
        const sample = `<ce:article>
  <ce:title>Experimental Multi-Entity Citation Analysis in Automated XML Workflows</ce:title>
  
  <ce:sections>
    <ce:section id="sec0010">
      <ce:section-title>1. Introduction</ce:section-title>
      <ce:para>In recent studies, automated citation linking has evolved significantly (Smith et al., 2020; Johnson &amp; Lee 2021). As demonstrated in <ce:cross-ref>Fig. 1</ce:cross-ref> and detailed in <ce:cross-ref>Table 1</ce:cross-ref>, structure validation improves throughput. See also Equation 1 for mathematical formulation.</ce:para>
      <ce:para>For further references, consider <ce:cross-ref id="cf0010">Brown and Davis 2019</ce:cross-ref> and unlinked citation <ce:cross-ref>Miller et al., 2022a,b</ce:cross-ref>.</ce:para>
    </ce:section>
  </ce:sections>

  <ce:floats>
    <ce:figure id="fig0010">
      <ce:label>Fig. 1</ce:label>
      <ce:caption><ce:para>System architecture layout.</ce:para></ce:caption>
    </ce:figure>
    <ce:table id="tbl0010">
      <ce:label>Table 1</ce:label>
      <ce:caption><ce:para>Benchmark results across datasets.</ce:para></ce:caption>
    </ce:table>
    <ce:display-formula id="form0010">
      <ce:label>(1)</ce:label>
    </ce:display-formula>
  </ce:floats>

  <ce:bibliography id="bib0010">
    <ce:section-title>References</ce:section-title>
    <ce:bib-reference id="bib1010">
      <ce:label>[1]</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>John</ce:given-name><ce:surname>Smith</ce:surname></sb:author></sb:authors><sb:title><sb:maint>Automated metadata processing</sb:maint></sb:title></sb:contribution><sb:host><sb:issue><sb:series><title>J. Publ.</title></sb:series><date>2020</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib1020">
      <ce:label>Johnson and Lee 2021</ce:label>
      <sb:reference><sb:contribution><sb:authors><sb:author><ce:given-name>A.</ce:given-name><ce:surname>Johnson</ce:surname></sb:author><sb:author><ce:given-name>B.</ce:given-name><ce:surname>Lee</ce:surname></sb:author></sb:authors></sb:contribution><sb:host><sb:issue><date>2021</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib1030">
      <ce:label>Brown &amp; Davis 2019</ce:label>
      <sb:reference><sb:host><sb:issue><date>2019</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib1040">
      <ce:label>Miller et al., 2022a</ce:label>
      <sb:reference><sb:host><sb:issue><date>2022</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
    <ce:bib-reference id="bib1050">
      <ce:label>Miller et al., 2022b</ce:label>
      <sb:reference><sb:host><sb:issue><date>2022</date></sb:issue></sb:host></sb:reference>
    </ce:bib-reference>
  </ce:bibliography>
</ce:article>`;
        setInput(sample);
        setToast({ msg: "Loaded comprehensive experimental sample XML.", type: "success" });
    };

    const runAnalysis = (overrides?: { overrideCompress?: boolean; overrideFloats?: boolean; overrideAutoTag?: boolean } | boolean | React.MouseEvent) => {
        if (!input.trim()) { 
            setToast({ msg: "Please paste XML source text to analyze.", type: "warn" }); 
            return; 
        }

        let activeCompress = compressFloatRanges;
        let activeFloats = resolveFloats;
        let activeAutoTag = autoTagTextCitations;

        if (typeof overrides === 'boolean') {
            activeCompress = overrides;
            setCompressFloatRanges(overrides);
        } else if (overrides && typeof overrides === 'object' && !('nativeEvent' in overrides)) {
            if (overrides.overrideCompress !== undefined) {
                activeCompress = overrides.overrideCompress;
                setCompressFloatRanges(overrides.overrideCompress);
            }
            if (overrides.overrideFloats !== undefined) {
                activeFloats = overrides.overrideFloats;
                setResolveFloats(overrides.overrideFloats);
            }
            if (overrides.overrideAutoTag !== undefined) {
                activeAutoTag = overrides.overrideAutoTag;
                setAutoTagTextCitations(overrides.overrideAutoTag);
            }
        }

        setIsLoading(true);
        setProcessLabel('Scanning Multi-Entity Nodes & Citation Structures...');

        setTimeout(() => {
            try {
                const nodes: TargetNode[] = [];
                const idCounts = new Map<string, number>();
                let detectedRangeCandidates = 0;
                let firstSample: { original: string; compressed: string } | null = null;
                let detectedFloatCandidates = 0;
                let firstFloatSample: { original: string; mappedIds: string[] } | null = null;
                let detectedAutoTagCandidates = 0;
                let firstAutoTagSample: { rawText: string; mappedIds: string[] } | null = null;

                // 1. Scan Bibliography Entries
                const bibRegex = /<(?:ce:)?bib-reference\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ce:)?bib-reference>/gi;
                let bibMatch;
                while ((bibMatch = bibRegex.exec(input)) !== null) {
                    const id = bibMatch[1];
                    const content = bibMatch[2];
                    idCounts.set(id, (idCounts.get(id) || 0) + 1);

                    const labelMatch = content.match(/<(?:ce:)?label>(.*?)<\/(?:ce:)?label>/i);
                    const labelText = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                    const surnameMatches = Array.from(content.matchAll(/<(?:ce:)?surname>(.*?)<\/(?:ce:)?surname>/gi)).map(m => m[1].trim());
                    const years = extractYears(content);

                    const firstAuthor = surnameMatches.length > 0 ? surnameMatches[0] : extractFirstAuthor(labelText);
                    const mainYear = years.length > 0 ? years[0] : '';

                    nodes.push({
                        id,
                        type: 'bib',
                        label: labelText || id,
                        displayText: labelText ? `${labelText} (${id})` : id,
                        normalized: normalizeCitation(labelText || content),
                        authors: surnameMatches.length > 0 ? surnameMatches : [firstAuthor].filter(Boolean),
                        year: mainYear
                    });
                }

                // 2. Scan Figures
                const figRegex = /<(?:ce:)?figure\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ce:)?figure>/gi;
                let figMatch;
                while ((figMatch = figRegex.exec(input)) !== null) {
                    const id = figMatch[1];
                    const content = figMatch[2];
                    idCounts.set(id, (idCounts.get(id) || 0) + 1);
                    const labelMatch = content.match(/<(?:ce:)?label>(.*?)<\/(?:ce:)?label>/i);
                    const labelText = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : id;
                    nodes.push({
                        id,
                        type: 'figure',
                        label: labelText,
                        displayText: `${labelText} [Figure]`,
                        normalized: normalizeCitation(labelText)
                    });
                }

                // 3. Scan Tables
                const tblRegex = /<(?:ce:)?table\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ce:)?table>/gi;
                let tblMatch;
                while ((tblMatch = tblRegex.exec(input)) !== null) {
                    const id = tblMatch[1];
                    const content = tblMatch[2];
                    idCounts.set(id, (idCounts.get(id) || 0) + 1);
                    const labelMatch = content.match(/<(?:ce:)?label>(.*?)<\/(?:ce:)?label>/i);
                    const labelText = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : id;
                    nodes.push({
                        id,
                        type: 'table',
                        label: labelText,
                        displayText: `${labelText} [Table]`,
                        normalized: normalizeCitation(labelText)
                    });
                }

                // 4. Scan Formulas
                const formRegex = /<(?:ce:)?display-formula\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ce:)?display-formula>/gi;
                let formMatch;
                while ((formMatch = formRegex.exec(input)) !== null) {
                    const id = formMatch[1];
                    const content = formMatch[2];
                    idCounts.set(id, (idCounts.get(id) || 0) + 1);
                    const labelMatch = content.match(/<(?:ce:)?label>(.*?)<\/(?:ce:)?label>/i);
                    const labelText = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : id;
                    nodes.push({
                        id,
                        type: 'formula',
                        label: labelText,
                        displayText: `${labelText} [Formula]`,
                        normalized: normalizeCitation(labelText)
                    });
                }

                // 5. Scan Sections
                const secRegex = /<(?:ce:)?section\b[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:ce:)?section>/gi;
                let secMatch;
                while ((secMatch = secRegex.exec(input)) !== null) {
                    const id = secMatch[1];
                    const content = secMatch[2];
                    idCounts.set(id, (idCounts.get(id) || 0) + 1);
                    const titleMatch = content.match(/<(?:ce:)?section-title>(.*?)<\/(?:ce:)?section-title>/i);
                    const titleText = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : id;
                    nodes.push({
                        id,
                        type: 'section',
                        label: titleText,
                        displayText: `${titleText} [Section]`,
                        normalized: normalizeCitation(titleText)
                    });
                }

                setTargetNodes(nodes);

                // Scan DOI count
                let foundDoiLabelsCount = 0;
                if (cleanDoi) {
                    const doiPattern = /<sb:host>[\s\S]*?<\/sb:host>\s*<sb:host>\s*<sb:e-host>\s*<ce:inter-ref\b[^>]*xlink:href="https?:\/\/doi\.org\/[^"]+"[^>]*>[\s\S]*?<\/ce:inter-ref>\s*<\/sb:e-host>\s*<\/sb:host>/i;
                    const bibs = input.match(/<(?:ce:)?bib-reference\b[\s\S]*?<\/(?:ce:)?bib-reference>/gi) || [];
                    bibs.forEach(b => { if (doiPattern.test(b)) foundDoiLabelsCount++; });
                }
                setDoiCount(foundDoiLabelsCount);

                const items: ResolutionItem[] = [];

                // A. Scan Existing Tagged Cross-refs
                const tagRegex = /<(ce:)?(cross-refs?|intra-refs?|inter-refs?)\b([^>]*)>([\s\S]*?)<\/\1\2>/gi;
                let tagMatch;
                while ((tagMatch = tagRegex.exec(input)) !== null) {
                    const fullTag = tagMatch[0];
                    const prefix = tagMatch[1] || '';
                    const baseTag = tagMatch[2];
                    const attrs = tagMatch[3];
                    const text = tagMatch[4].trim();
                    const originalIsPlural = baseTag.endsWith('s');

                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    const refidMatch = attrs.match(/\brefid="([^"]+)"/);
                    const existingId = idMatch ? idMatch[1] : '';
                    const existingRefid = refidMatch ? refidMatch[1] : '';

                    const missingId = !existingId;
                    const missingRefid = !existingRefid;
                    const isDuplicate = !!existingId && (idCounts.get(existingId) || 0) > 1;

                    const isInterRef = baseTag.toLowerCase().includes('inter-ref');
                    if (isInterRef) continue; // inter-ref tags are for external references (URLs, DOIs, external articles) and do NOT link internally

                    let mappedIds: string[] = existingRefid ? existingRefid.split(/\s+/).filter(Boolean) : [];
                    let status: 'resolved' | 'failed' | 'ignored' | 'autotag' = 'failed';
                    let confidenceScore = 100;
                    let notes = '';

                    // Categorize Tag Type
                    const normText = normalizeCitation(text);
                    let tagType: 'bib' | 'figure' | 'table' | 'formula' | 'section' | 'unknown' = 'unknown';
                    if (/^(fig|figure)/i.test(normText)) tagType = 'figure';
                    else if (/^(tbl|table)/i.test(normText)) tagType = 'table';
                    else if (/^(eq|formula|equation)/i.test(normText)) tagType = 'formula';
                    else if (/^(sec|section)/i.test(normText)) tagType = 'section';
                    else tagType = 'bib';

                    let formattedText: string | undefined = undefined;

                    if (missingRefid) {
                        const matchedIdsSet = new Set<string>();

                        // 1. Try Float Matching if enabled or test candidate
                        if (tagType !== 'bib' || /^(fig|table|scheme|box|eq)/i.test(normText)) {
                            const floatRes = resolveFloatRefIds(text, tagType, nodes, activeCompress);
                            if (floatRes.mappedIds.length > 0) {
                                detectedFloatCandidates++;
                                if (!firstFloatSample) {
                                    firstFloatSample = { original: text, mappedIds: floatRes.mappedIds };
                                }

                                if (activeFloats) {
                                    floatRes.mappedIds.forEach(id => matchedIdsSet.add(id));
                                    confidenceScore = 95;
                                    notes = `Matched ${floatRes.mappedIds.length} float node(s): ${floatRes.mappedIds.join(', ')}`;
                                    formattedText = floatRes.formattedText;
                                }

                                if (floatRes.canCompressRange && floatRes.potentialFormattedText) {
                                    detectedRangeCandidates++;
                                    if (!firstSample) {
                                        firstSample = { original: text, compressed: floatRes.potentialFormattedText };
                                    }
                                }
                            }
                        }

                        // 2. Try Bibliography Matching
                        if (matchedIdsSet.size === 0) {
                            const authorName = extractFirstAuthor(text);
                            const years = extractYears(text);

                            // Direct Label Match
                            const exactLabelMatch = nodes.filter(n => n.type === 'bib' && n.normalized === normText);
                            if (exactLabelMatch.length > 0) {
                                exactLabelMatch.forEach(m => matchedIdsSet.add(m.id));
                                confidenceScore = 100;
                                notes = 'Exact label match';
                            } else {
                                // Author + Year Match
                                const bibNodes = nodes.filter(n => n.type === 'bib');
                                bibNodes.forEach(bNode => {
                                    let isMatch = false;
                                    if (authorName && bNode.authors?.some(a => a.toLowerCase() === authorName.toLowerCase())) {
                                        if (years.length === 0 || (bNode.year && years.includes(bNode.year))) {
                                            isMatch = true;
                                        }
                                    }
                                    // Fuzzy score fallback
                                    if (!isMatch && normText.length > 3) {
                                        const score = calculateSimilarity(normText, bNode.normalized);
                                        if (score >= fuzzyThreshold) {
                                            isMatch = true;
                                            confidenceScore = score;
                                            notes = `Fuzzy matched (${score}% similarity)`;
                                        }
                                    }
                                    if (isMatch) matchedIdsSet.add(bNode.id);
                                });
                            }
                        }

                        mappedIds = Array.from(matchedIdsSet);
                        if (mappedIds.length > 0) {
                            status = 'resolved';
                        } else {
                            notes = 'No candidate matching confidence threshold';
                        }
                    } else {
                        status = 'resolved';
                    }

                    items.push({
                        id: `item_${items.length}`,
                        originalTag: fullTag,
                        originalAttrs: attrs,
                        textContent: text,
                        formattedText,
                        tagType,
                        status,
                        existingId,
                        existingRefid,
                        mappedIds,
                        confidenceScore: mappedIds.length > 0 ? confidenceScore : 0,
                        notes,
                        originalIsPlural,
                        targetIsPlural: mappedIds.length > 1,
                        missingId,
                        missingRefid,
                        isDuplicate
                    });
                }

                // B. Auto-tag Plain Text Citations (Scan candidates and tag if active)
                const plainCitationRegex = /\((?:[A-Z][a-zA-Z\s\-']+(?:\s+et\s+al\.?)?(?:,\s*|\s+)\b(?:18|19|20)\d{2}[a-z]?(?:[\s,;&/]+[a-z])*\b)\)/g;
                const paraRegex = /<(ce:)?para\b[^>]*>([\s\S]*?)<\/\1para>/gi;
                let paraMatch;

                while ((paraMatch = paraRegex.exec(input)) !== null) {
                    const paraContent = paraMatch[2];
                    let plainMatch;
                    while ((plainMatch = plainCitationRegex.exec(paraContent)) !== null) {
                        const rawText = plainMatch[0];
                        const innerText = rawText.slice(1, -1).trim(); // stripped parens
                        
                        // Check if this text is already wrapped in a cross-ref tag
                        const matchIndex = plainMatch.index;
                        const beforeCtx = paraContent.slice(Math.max(0, matchIndex - 50), matchIndex);
                        if (beforeCtx.includes('<ce:cross-ref') || beforeCtx.includes('<cross-ref')) {
                            continue;
                        }

                        const authorName = extractFirstAuthor(innerText);
                        const years = extractYears(innerText);
                        const matchedIdsSet = new Set<string>();

                        nodes.filter(n => n.type === 'bib').forEach(bNode => {
                            if (authorName && bNode.authors?.some(a => a.toLowerCase() === authorName.toLowerCase())) {
                                if (years.length === 0 || (bNode.year && years.includes(bNode.year))) {
                                    matchedIdsSet.add(bNode.id);
                                }
                            }
                        });

                        const mappedIds = Array.from(matchedIdsSet);
                        if (mappedIds.length > 0) {
                            detectedAutoTagCandidates++;
                            if (!firstAutoTagSample) {
                                firstAutoTagSample = { rawText, mappedIds };
                            }
                        }

                        if (activeAutoTag) {
                            items.push({
                                id: `autotag_${items.length}`,
                                originalTag: rawText,
                                originalAttrs: '',
                                textContent: innerText,
                                tagType: 'bib',
                                status: mappedIds.length > 0 ? 'autotag' : 'failed',
                                existingId: '',
                                existingRefid: '',
                                mappedIds,
                                isAutoTagged: true,
                                confidenceScore: mappedIds.length > 0 ? 85 : 0,
                                notes: mappedIds.length > 0 ? 'Plain-text citation auto-detected' : 'Untagged citation candidate',
                                originalIsPlural: false,
                                targetIsPlural: mappedIds.length > 1,
                                missingId: true,
                                missingRefid: true,
                                isDuplicate: false
                            });
                        }
                    }
                }

                // C. Calculate Diagnostics
                const totalScanned = items.length;
                const unlinkedCount = items.filter(i => i.missingRefid || i.status === 'failed').length;
                const resolvedCount = items.filter(i => i.status === 'resolved' && !i.missingRefid).length;
                const autoMappedCount = items.filter(i => (i.status === 'resolved' || i.status === 'autotag') && i.missingRefid && i.mappedIds.length > 0).length;
                const orphanCount = items.filter(i => i.status === 'failed').length;
                const autoTaggedCount = items.filter(i => i.status === 'autotag').length;

                // Broken links check: existingRefid pointing to id that does not exist in nodes
                const allNodeIds = new Set(nodes.map(n => n.id));
                const brokenCount = items.filter(i => i.existingRefid && !i.existingRefid.split(/\s+/).some(ref => allNodeIds.has(ref))).length;

                // Uncited bib references check
                const citedRefIds = new Set<string>();
                items.forEach(i => i.mappedIds.forEach(m => citedRefIds.add(m)));
                const uncitedCount = nodes.filter(n => n.type === 'bib' && !citedRefIds.has(n.id)).length;

                setDiagnostics({
                    totalScanned,
                    resolvedCount,
                    unlinkedCount,
                    orphanCount,
                    autoTaggedCount,
                    brokenCount,
                    uncitedCount
                });

                setRangeCandidateCount(detectedRangeCandidates);
                setSampleRangeCandidate(firstSample);

                setFloatCandidateCount(detectedFloatCandidates);
                setSampleFloatCandidate(firstFloatSample);

                setAutoTagCandidateCount(detectedAutoTagCandidates);
                setSampleAutoTagCandidate(firstAutoTagSample);

                setResolutions(items);
                setStep('matrix');
                setToast({ 
                    msg: `Protocol scan complete: ${unlinkedCount} unlinked citation(s) detected (${autoMappedCount} auto-matched, ${orphanCount} unresolved).`, 
                    type: "info" 
                });

            } catch (e) {
                setToast({ msg: "Analysis failure. Ensure valid XML structure.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 600);
    };

    const executeLink = () => {
        setIsLoading(true);
        setProcessLabel('Surgically Injecting & Normalizing Cross-References...');

        setTimeout(() => {
            try {
                let cfCounter = cfStart;
                let result = input;

                // Ensure cf counter starts safely above highest existing ID
                const allExistingCf = input.match(new RegExp(`\\b${idPrefix}(\\d{1,5})\\b`, 'g'));
                if (allExistingCf) {
                    const maxExisting = allExistingCf.reduce((m, c) => {
                        const num = parseInt(c.replace(/\D/g, ''));
                        return isNaN(num) ? m : Math.max(m, num);
                    }, 0);
                    const nextVal = (Math.floor(maxExisting / 5) + 1) * 5;
                    cfCounter = Math.max(cfCounter, nextVal);
                }

                resolutions.forEach(res => {
                    if (res.status === 'ignored') return;

                    let targetId = res.existingId;
                    if ((targetMissingId && res.missingId) || (targetDuplicateId && res.isDuplicate)) {
                        targetId = `${idPrefix}${cfCounter.toString().padStart(4, '0')}`;
                        cfCounter += 5;
                    }

                    let targetRefid = res.existingRefid;
                    if (targetMissingRefid && res.missingRefid && (res.status === 'resolved' || res.status === 'autotag') && res.mappedIds.length > 0) {
                        targetRefid = res.mappedIds.join(' ');
                    }

                    const idAttr = targetId ? ` id="${targetId}"` : '';
                    const refidAttr = targetRefid ? ` refid="${targetRefid}"` : '';

                    const isPluralTag = res.mappedIds.length > 1 || res.originalIsPlural || res.targetIsPlural;
                    const contentToUse = (res.formattedText && res.mappedIds.length > 1) ? res.formattedText : res.textContent;

                    if (res.isAutoTagged) {
                        // Replace plain text citation with wrapped cross-ref
                        const tagName = isPluralTag ? 'ce:cross-refs' : 'ce:cross-ref';
                        const wrapped = `<${tagName}${idAttr}${refidAttr}>${contentToUse}</${tagName}>`;
                        result = result.replace(`(${res.textContent})`, `(${wrapped})`);
                    } else {
                        // Clean original attributes
                        let cleanAttrs = res.originalAttrs
                            .replace(/\bid="[^"]*"/g, '')
                            .replace(/\brefid="[^"]*"/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();

                        const otherAttrs = cleanAttrs ? ` ${cleanAttrs}` : '';
                        const tagMatch = res.originalTag.match(/^<((?:ce:)?)(cross-refs?|intra-refs?|inter-refs?)/i);
                        const prefix = tagMatch ? tagMatch[1] : 'ce:';
                        const baseName = tagMatch ? tagMatch[2].replace(/s$/, '') : 'cross-ref';
                        const tagName = isPluralTag ? `${prefix}${baseName}s` : `${prefix}${baseName}`;

                        const origTagNameMatch = res.originalTag.match(/^<([^\s>]+)/);
                        const origTagName = origTagNameMatch ? origTagNameMatch[1] : '';

                        // If nothing has changed for this tag (ID, refid, text content, and tag name are identical), do not touch it
                        if (
                            targetId === res.existingId &&
                            targetRefid === res.existingRefid &&
                            contentToUse === res.textContent &&
                            origTagName.toLowerCase() === tagName.toLowerCase()
                        ) {
                            return;
                        }

                        const newTag = `<${tagName}${idAttr}${refidAttr}${otherAttrs}>${contentToUse}</${tagName}>`;
                        result = result.replace(res.originalTag, newTag);
                    }
                });

                if (cleanDoi) {
                    result = result.replace(/<sb:host>([\s\S]*?)<\/sb:host>\s*<sb:host>\s*<sb:e-host>\s*<ce:inter-ref\b[^>]*xlink:href="https?:\/\/doi\.org\/([^"]+)"[^>]*>[\s\S]*?<\/ce:inter-ref>\s*<\/sb:e-host>\s*<\/sb:host>/gi, '<sb:host>$1<ce:doi>$2</ce:doi></sb:host>');
                }

                setOutput(result);
                generateDiff(input, result);

                // Build Smart Tool Suggestions
                const newSuggestions: SmartSuggestion[] = [];

                if (result.includes('<ce:bib-reference')) {
                    newSuggestions.push({
                        id: 'xml-renumber',
                        toolName: 'XML Normalizer',
                        description: 'Renumber bibliography entries sequentially and update all cross-references.',
                        path: '/xmlRenumber',
                        icon: <Hash className="w-4 h-4" />,
                        condition: 'Bibliography detected'
                    });
                }

                if (diagnostics.uncitedCount > 0) {
                    newSuggestions.push({
                        id: 'uncited-cleaner',
                        toolName: 'Uncited Ref Cleaner',
                        description: `${diagnostics.uncitedCount} references have no body citations. Purge uncited bibliography entries safely.`,
                        path: '/uncitedCleaner',
                        icon: <Eraser className="w-4 h-4" />,
                        condition: 'Uncited references detected'
                    });
                }

                if (result.includes('<ce:source-text') || !result.includes('<sb:reference')) {
                    newSuggestions.push({
                        id: 'structural-architect',
                        toolName: 'Reference Structure Repair v3.2',
                        description: 'Audit and repair structural bibliography nodes, authors, and source-text.',
                        path: '/structuralArchitect',
                        icon: <Box className="w-4 h-4" />,
                        condition: 'Structural node overhaul recommended'
                    });
                }

                setSuggestions(newSuggestions);
                setStep('result');
                setToast({ msg: "Experimental Citation Linker protocol applied successfully!", type: "success" });

            } catch (e) {
                setToast({ msg: "Injection error.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 700);
    };

    // Filtered Resolutions in Matrix
    const filteredResolutions = useMemo(() => {
        return resolutions.filter(item => {
            if (matrixFilter === 'unlinked') {
                const isUnlinkedOrIssue = item.missingRefid || item.status === 'failed' || item.status === 'autotag' || item.missingId || item.isDuplicate;
                if (!isUnlinkedOrIssue) return false;
            } else if (matrixFilter === 'resolved') {
                if (item.status !== 'resolved' || item.missingRefid) return false;
            } else if (matrixFilter === 'failed') {
                if (item.status !== 'failed') return false;
            } else if (matrixFilter === 'autotag') {
                if (item.status !== 'autotag') return false;
            } else if (matrixFilter === 'ignored') {
                if (item.status !== 'ignored') return false;
            }

            if (matrixSearch.trim()) {
                const q = matrixSearch.toLowerCase();
                const matchTag = item.originalTag.toLowerCase().includes(q);
                const matchText = item.textContent.toLowerCase().includes(q);
                const matchRefid = item.existingRefid.toLowerCase().includes(q);
                const matchMapped = item.mappedIds.some(m => m.toLowerCase().includes(q));
                return matchTag || matchText || matchRefid || matchMapped;
            }
            return true;
        });
    }, [resolutions, matrixFilter, matrixSearch]);

    // Filtered Target Nodes for Picker Modal
    const filteredPickerNodes = useMemo(() => {
        if (!pickerSearch.trim()) return targetNodes;
        const q = pickerSearch.toLowerCase();
        return targetNodes.filter(n => 
            n.id.toLowerCase().includes(q) || 
            n.label.toLowerCase().includes(q) || 
            n.displayText.toLowerCase().includes(q)
        );
    }, [targetNodes, pickerSearch]);

    const toggleMappedId = (targetId: string) => {
        if (!editingItem) return;
        setResolutions(prev => prev.map(item => {
            if (item.id === editingItem.id) {
                const exists = item.mappedIds.includes(targetId);
                const updated = exists 
                    ? item.mappedIds.filter(id => id !== targetId)
                    : [...item.mappedIds, targetId];
                return {
                    ...item,
                    mappedIds: updated,
                    status: updated.length > 0 ? (item.isAutoTagged ? 'autotag' : 'resolved') : 'failed',
                    targetIsPlural: updated.length > 1
                };
            }
            return item;
        }));
        setEditingItem(prev => prev ? {
            ...prev,
            mappedIds: prev.mappedIds.includes(targetId) 
                ? prev.mappedIds.filter(id => id !== targetId)
                : [...prev.mappedIds, targetId],
            status: prev.mappedIds.includes(targetId) && prev.mappedIds.length === 1 ? 'failed' : (prev.isAutoTagged ? 'autotag' : 'resolved')
        } : null);
    };

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
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-indigo-100/70', 'ring-2', 'ring-indigo-400', 'ring-inset', 'z-10'));

        if (currentChangeIndex === -1) return;

        // Add new highlights
        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-indigo-100/70', 'ring-2', 'ring-indigo-400', 'ring-inset', 'z-10'));
    }, [currentChangeIndex, diffElements]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (step === 'result' && activeTab === 'diff') {
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
    }, [step, activeTab, currentChangeIndex, totalChanges]);

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAnalysis : (step === 'matrix' ? executeLink : undefined),
        onClear: () => { setInput(''); setResolutions([]); setStep('input'); }
    }, [input, step, resolutions, targetMissingId, targetMissingRefid, cfStart]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header Title */}
            <div className="mb-8 text-center animate-fade-in relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-xs font-black uppercase tracking-widest mb-3">
                    <Sparkles size={13} className="text-amber-600" />
                    <span>Experimental Protocol v2.5</span>
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">
                    Citation Linker Pro MAX
                </h1>
                <p className="text-slate-500 max-w-3xl mx-auto font-medium text-sm leading-relaxed mb-6">
                    Advanced multi-entity citation matching engine with fuzzy author/year resolution, float cross-reference linking, auto-detection of plain text citations, and interactive candidate selection.
                </p>

                {/* Purpose Explanation Banner */}
                <div className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-purple-500/10 p-4 rounded-2xl border border-indigo-200/60 max-w-3xl mx-auto text-left shadow-2xs">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-600 text-white rounded-xl shrink-0 mt-0.5">
                            <LinkIcon size={18} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider mb-1">
                                What does Citation Linker Pro MAX do?
                            </h4>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Scans your XML document for <strong>unlinked citations & floats</strong> (references, figures, tables, equations, sections) missing <code>refid="..."</code> attributes, as well as untagged plain text citations like <em>(Smith et al., 2020)</em>, and automatically matches them to target XML nodes.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Configuration Panel */}
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 mb-8 transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowProtocolToggles(prev => !prev)}
                            className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider hover:text-indigo-600 transition-colors group text-left focus:outline-none"
                            title={showProtocolToggles ? "Hide Protocol Toggles & Matching Logic" : "View Protocol Toggles & Matching Logic"}
                        >
                            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                                <Sliders size={15} />
                            </div>
                            <span>Protocol Toggles & Matching Logic</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                                showProtocolToggles 
                                    ? 'bg-slate-100 text-slate-600 group-hover:bg-slate-200' 
                                    : 'bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200'
                            }`}>
                                {showProtocolToggles ? (
                                    <>
                                        <EyeOff size={12} />
                                        <span>Hide</span>
                                    </>
                                ) : (
                                    <>
                                        <Eye size={12} />
                                        <span>View</span>
                                    </>
                                )}
                            </span>
                        </button>

                        {!showProtocolToggles && (
                            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60 animate-fade-in">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                                <span className="font-bold text-slate-700">
                                    {[
                                        targetMissingRefid && 'Refids',
                                        resolveFloats && 'Floats',
                                        compressFloatRanges && 'Compress',
                                        autoTagTextCitations && 'Auto-Tag',
                                        targetMissingId && 'IDs',
                                        targetDuplicateId && 'Dups',
                                        cleanDoi && 'DOIs'
                                    ].filter(Boolean).length} Active
                                </span>
                                <span className="text-slate-400">|</span>
                                <span className="truncate max-w-[280px]">
                                    {[
                                        targetMissingRefid && 'Refids',
                                        resolveFloats && 'Floats',
                                        compressFloatRanges && 'Compress',
                                        autoTagTextCitations && 'Auto-Tag',
                                        targetMissingId && 'IDs',
                                        targetDuplicateId && 'Dups',
                                        cleanDoi && 'DOIs'
                                    ].filter(Boolean).join(', ') || 'None'}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            type="button"
                            onClick={() => setShowProtocolToggles(prev => !prev)}
                            className="text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 active:scale-95"
                        >
                            {showProtocolToggles ? (
                                <>
                                    <EyeOff size={13} className="text-slate-500" />
                                    <span>Hide Toggles</span>
                                </>
                            ) : (
                                <>
                                    <Eye size={13} className="text-indigo-600" />
                                    <span>View Toggles</span>
                                </>
                            )}
                        </button>

                        <button 
                            onClick={loadSampleData}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition-all flex items-center gap-1.5 active:scale-95"
                        >
                            <Wand2 size={13} /> Load Experimental Sample
                        </button>
                    </div>
                </div>

                <AnimatePresence>
                    {showProtocolToggles && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="pt-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                    <Switch 
                                        id="exp-toggle-refid" 
                                        label="Resolve Refids" 
                                        subLabel="Link citation to refid" 
                                        checked={targetMissingRefid} 
                                        onChange={setTargetMissingRefid} 
                                        color="indigo" 
                                        tooltip="Scans <ce:cross-ref> tags missing refid attributes and automatically links them to target nodes."
                                    />
                                    <Switch 
                                        id="exp-toggle-floats" 
                                        label="Resolve Floats" 
                                        subLabel={floatCandidateCount > 0 && !resolveFloats ? `⚡ Candidate found (${floatCandidateCount})` : "Figs, Tables, Eqs, Secs"} 
                                        checked={resolveFloats} 
                                        onChange={(val) => {
                                            setResolveFloats(val);
                                            if (resolutions.length > 0) {
                                                runAnalysis({ overrideFloats: val });
                                            }
                                        }} 
                                        color="blue" 
                                        tooltip="Matches float references like 'Figure 1', 'Table 2', 'Eq. 3', or 'Section 4' in text to XML element IDs."
                                    />
                                    <Switch 
                                        id="exp-toggle-compress-floats" 
                                        label="Compress Ranges" 
                                        subLabel={rangeCandidateCount > 0 && !compressFloatRanges ? `⚡ Candidate found (${rangeCandidateCount})` : "e.g. Figs. 3–5 vs Fig. 3, 4, 5"} 
                                        checked={compressFloatRanges} 
                                        onChange={(val) => {
                                            setCompressFloatRanges(val);
                                            if (resolutions.length > 0) {
                                                runAnalysis({ overrideCompress: val });
                                            }
                                        }} 
                                        color="indigo" 
                                        tooltip="Automatically formats sequential float references into compressed ranges (e.g. 'Figures 3, 4, 5' ➔ 'Figures 3–5')."
                                    />
                                    <Switch 
                                        id="exp-toggle-autotag" 
                                        label="Auto-Tag Text" 
                                        subLabel={autoTagCandidateCount > 0 && !autoTagTextCitations ? `⚡ Candidate found (${autoTagCandidateCount})` : "Convert (Smith 2020)"} 
                                        checked={autoTagTextCitations} 
                                        onChange={(val) => {
                                            setAutoTagTextCitations(val);
                                            if (resolutions.length > 0) {
                                                runAnalysis({ overrideAutoTag: val });
                                            }
                                        }} 
                                        color="purple" 
                                        tooltip="Detects plain untagged author-year citations in text (e.g. '(Smith et al., 2020)') and converts them into linked <ce:cross-ref refid='...'> elements."
                                    />
                                    <Switch 
                                        id="exp-toggle-id" 
                                        label="Enforce IDs" 
                                        subLabel="Inject cfXXXX IDs" 
                                        checked={targetMissingId} 
                                        onChange={setTargetMissingId} 
                                        color="blue" 
                                        tooltip="Injects generated unique id='cfXXXX' attributes onto <ce:cross-ref> tags missing an element ID."
                                    />
                                    <Switch 
                                        id="exp-toggle-dup" 
                                        label="Fix Duplicates" 
                                        subLabel="Re-assign duplicate IDs" 
                                        checked={targetDuplicateId} 
                                        onChange={setTargetDuplicateId} 
                                        color="amber" 
                                        tooltip="Detects duplicate id='...' attributes across <ce:cross-ref> elements and re-assigns unique IDs."
                                    />
                                    <Switch 
                                        id="exp-toggle-doi" 
                                        label="Clean DOIs" 
                                        subLabel="Inter-ref to ce:doi" 
                                        checked={cleanDoi} 
                                        onChange={setCleanDoi} 
                                        color="emerald" 
                                        tooltip="Converts inter-ref links or raw DOI strings in bibliography entries into standardized <ce:doi> XML tags."
                                    />
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-6 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">ID Prefix:</label>
                                            <input 
                                                type="text"
                                                value={idPrefix}
                                                onChange={(e) => setIdPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                                className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 w-20 outline-none focus:ring-2 focus:ring-indigo-100"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Start #:</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs font-mono font-bold">{idPrefix}</span>
                                                <input 
                                                    type="number" 
                                                    value={cfStart}
                                                    onChange={(e) => setCfStart(Math.max(1, parseInt(e.target.value) || 0))}
                                                    className="pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 w-24 outline-none focus:ring-2 focus:ring-indigo-100"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fuzzy Match Sensitivity:</label>
                                            <input 
                                                type="range" 
                                                min="60" 
                                                max="100" 
                                                value={fuzzyThreshold}
                                                onChange={(e) => setFuzzyThreshold(parseInt(e.target.value))}
                                                className="w-28 accent-indigo-600 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono font-black text-indigo-600">{fuzzyThreshold}%</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => { setInput(''); setResolutions([]); setStep('input'); setOutput(''); }} 
                                        className="text-xs font-bold text-slate-400 hover:text-rose-600 uppercase tracking-wider px-3 py-1 transition-colors"
                                    >
                                        Reset All
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Smart Suggestions on Completion */}
            {suggestions.length > 0 && step === 'result' && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-6 bg-indigo-50/40 border-2 border-indigo-100 rounded-[2rem] border-dashed">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em]">Next Recommended Protocols</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Citation Linker Pro (Experimental)' } });
                                    }}
                                    className="flex items-center gap-3.5 p-4 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-2xs"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-xs font-black text-indigo-900 uppercase tracking-wider mb-0.5">{sug.toolName}</div>
                                        <div className="text-[10px] text-slate-500 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Workspace Container */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[720px] flex flex-col relative transition-all duration-500">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex items-center justify-center rounded-2xl animate-fade-in flex-col">
                        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-2">{processLabel}</span>
                    </div>
                )}

                {/* Step 1: Input Text */}
                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                                <FileCode size={16} className="text-indigo-600" />
                                XML Source Stream Input
                            </label>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setInput('')} className="text-xs font-bold text-rose-500 hover:text-rose-700 uppercase tracking-wider">Clear</button>
                            </div>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-8 font-mono text-xs sm:text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300 outline-none" 
                            placeholder="Paste the full manuscript XML document here... The experimental protocol will scan citations, figures, tables, formulas, sections, and untagged text."
                            spellCheck={false}
                        />
                        <div className="p-6 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button 
                                onClick={runAnalysis} 
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 px-14 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-2"
                            >
                                <Sparkles size={15} />
                                Run Experimental Multi-Entity Scan
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Resolution Matrix */}
                {step === 'matrix' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        {/* Diagnostics & Matrix Topbar */}
                        <div className="px-8 py-4 border-b border-slate-200 bg-white flex flex-wrap justify-between items-center gap-4 shadow-2xs z-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                    <Layers size={18} className="text-indigo-600" /> Resolution Matrix V2
                                </h3>
                                <div className="flex items-center gap-3 mt-1 text-xs font-semibold text-slate-500 flex-wrap">
                                    <span>Scanned: <strong className="text-slate-800">{diagnostics.totalScanned}</strong></span>
                                    <span>•</span>
                                    <span className="text-amber-600 font-bold">Unlinked (Missing Refid): <strong>{diagnostics.unlinkedCount}</strong></span>
                                    <span>•</span>
                                    <span className="text-emerald-600 font-bold">Auto-Matched: <strong>{resolutions.filter(i => (i.status === 'resolved' || i.status === 'autotag') && i.missingRefid && i.mappedIds.length > 0).length}</strong></span>
                                    {diagnostics.autoTaggedCount > 0 && (
                                        <>
                                            <span>•</span>
                                            <span className="text-purple-600 font-bold">Auto-Tagged: <strong>{diagnostics.autoTaggedCount}</strong></span>
                                        </>
                                    )}
                                    {diagnostics.orphanCount > 0 && (
                                        <>
                                            <span>•</span>
                                            <span className="text-rose-600 font-bold">Unresolved: <strong>{diagnostics.orphanCount}</strong></span>
                                        </>
                                    )}
                                    {doiCount > 0 && cleanDoi && (
                                        <>
                                            <span>•</span>
                                            <span className="text-emerald-700">DOIs: <strong>{doiCount}</strong></span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button onClick={() => setStep('input')} className="px-5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider">
                                    Back to Input
                                </button>
                                <button onClick={executeLink} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-10 rounded-xl shadow-lg active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-1.5">
                                    <CheckCircle2 size={15} /> Apply Protocols
                                </button>
                            </div>
                        </div>

                        {/* Range Compression Candidate Notification Tab */}
                        {rangeCandidateCount > 0 && !compressFloatRanges && (
                            <div className="mx-8 mt-4 p-4 bg-gradient-to-r from-indigo-50/90 via-blue-50/80 to-indigo-50/90 border-2 border-indigo-200/90 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-start sm:items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                                        <Sparkles size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                                                Possible Candidate for Range Compression
                                            </span>
                                            <span className="bg-indigo-600 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-full shadow-2xs">
                                                {rangeCandidateCount} Float Citation{rangeCandidateCount > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">
                                            Detected float citation(s) suitable for range formatting
                                            {sampleRangeCandidate ? (
                                                <> (e.g., <span className="font-mono font-bold text-indigo-900 bg-white px-1.5 py-0.5 rounded border border-indigo-200 shadow-2xs">{sampleRangeCandidate.original}</span> ➔ <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs">{sampleRangeCandidate.compressed}</span>)</>
                                            ) : ''}. Turn on <strong className="text-indigo-900 font-extrabold">Compress Ranges</strong> and re-run analysis to format.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideCompress: true })}
                                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
                                >
                                    <RotateCcw size={14} /> Turn On & Re-run Scan
                                </button>
                            </div>
                        )}

                        {rangeCandidateCount > 0 && compressFloatRanges && (
                            <div className="mx-8 mt-4 p-3.5 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                    <span className="font-bold text-emerald-950">
                                        Range Compression Active: {rangeCandidateCount} float citation(s) formatted as compressed ranges
                                        {sampleRangeCandidate ? ` (e.g., "${sampleRangeCandidate.original}" ➔ "${sampleRangeCandidate.compressed}")` : ''}.
                                    </span>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideCompress: false })}
                                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline shrink-0"
                                >
                                    Disable Range Compression
                                </button>
                            </div>
                        )}

                        {/* Float Resolution Candidate Notification Tab */}
                        {floatCandidateCount > 0 && !resolveFloats && (
                            <div className="mx-8 mt-4 p-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-blue-50/90 border-2 border-blue-200/90 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-start sm:items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                                        <Sparkles size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-blue-950 uppercase tracking-wider">
                                                Possible Candidate for Float Resolution
                                            </span>
                                            <span className="bg-blue-600 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-full shadow-2xs">
                                                {floatCandidateCount} Float Citation{floatCandidateCount > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">
                                            Detected unlinked float citation(s) matching figures, tables, formulas, or sections
                                            {sampleFloatCandidate ? (
                                                <> (e.g., <span className="font-mono font-bold text-blue-900 bg-white px-1.5 py-0.5 rounded border border-blue-200 shadow-2xs">{sampleFloatCandidate.original}</span> ➔ <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs">{sampleFloatCandidate.mappedIds.join(', ')}</span>)</>
                                            ) : ''}. Turn on <strong className="text-blue-900 font-extrabold">Resolve Floats</strong> and re-run scan to automatically link them.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideFloats: true })}
                                    className="shrink-0 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center gap-2"
                                >
                                    <RotateCcw size={14} /> Turn On & Re-run Scan
                                </button>
                            </div>
                        )}

                        {floatCandidateCount > 0 && resolveFloats && (
                            <div className="mx-8 mt-4 p-3.5 bg-blue-50/90 border border-blue-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle2 size={18} className="text-blue-600 shrink-0" />
                                    <span className="font-bold text-blue-950">
                                        Resolve Floats Active: {floatCandidateCount} float citation(s) linked to target nodes
                                        {sampleFloatCandidate ? ` (e.g., "${sampleFloatCandidate.original}" ➔ "${sampleFloatCandidate.mappedIds.join(', ')}")` : ''}.
                                    </span>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideFloats: false })}
                                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline shrink-0"
                                >
                                    Disable Float Resolution
                                </button>
                            </div>
                        )}

                        {/* Auto-Tag Text Candidate Notification Tab */}
                        {autoTagCandidateCount > 0 && !autoTagTextCitations && (
                            <div className="mx-8 mt-4 p-4 bg-gradient-to-r from-purple-50/90 via-fuchsia-50/80 to-purple-50/90 border-2 border-purple-200/90 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-start sm:items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
                                        <Sparkles size={20} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-purple-950 uppercase tracking-wider">
                                                Possible Candidate for Auto-Tagging Text
                                            </span>
                                            <span className="bg-purple-600 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-full shadow-2xs">
                                                {autoTagCandidateCount} Untagged Citation{autoTagCandidateCount > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">
                                            Detected plain-text author-year citation(s) in body paragraphs
                                            {sampleAutoTagCandidate ? (
                                                <> (e.g., <span className="font-mono font-bold text-purple-900 bg-white px-1.5 py-0.5 rounded border border-purple-200 shadow-2xs">{sampleAutoTagCandidate.rawText}</span> ➔ <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs">{sampleAutoTagCandidate.mappedIds.join(', ')}</span>)</>
                                            ) : ''}. Turn on <strong className="text-purple-900 font-extrabold">Auto-Tag Text</strong> and re-run scan to automatically convert them into linked <code className="text-purple-900 font-bold">&lt;ce:cross-ref&gt;</code> elements.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideAutoTag: true })}
                                    className="shrink-0 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-500/20 active:scale-95 flex items-center gap-2"
                                >
                                    <RotateCcw size={14} /> Turn On & Re-run Scan
                                </button>
                            </div>
                        )}

                        {autoTagCandidateCount > 0 && autoTagTextCitations && (
                            <div className="mx-8 mt-4 p-3.5 bg-purple-50/90 border border-purple-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in duration-300 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle2 size={18} className="text-purple-600 shrink-0" />
                                    <span className="font-bold text-purple-950">
                                        Auto-Tag Text Active: {autoTagCandidateCount} plain-text author-year citation(s) auto-detected and tagged
                                        {sampleAutoTagCandidate ? ` (e.g., "${sampleAutoTagCandidate.rawText}" ➔ "${sampleAutoTagCandidate.mappedIds.join(', ')}")` : ''}.
                                    </span>
                                </div>
                                <button
                                    onClick={() => runAnalysis({ overrideAutoTag: false })}
                                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline shrink-0"
                                >
                                    Disable Auto-Tag Text
                                </button>
                            </div>
                        )}

                        {/* Filter Tabs & Search Bar */}
                        <div className="px-8 py-3 bg-white border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
                                {(['unlinked', 'failed', 'autotag', 'resolved', 'all', 'ignored'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setMatrixFilter(tab)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                                            matrixFilter === tab 
                                                ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' 
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {tab === 'unlinked' && `Unlinked / Issues (${resolutions.filter(r => r.missingRefid || r.status === 'failed' || r.status === 'autotag' || r.missingId || r.isDuplicate).length})`}
                                        {tab === 'failed' && `Unresolved (${resolutions.filter(r => r.status === 'failed').length})`}
                                        {tab === 'autotag' && `Auto-Tagged (${resolutions.filter(r => r.status === 'autotag').length})`}
                                        {tab === 'resolved' && `Properly Linked (${resolutions.filter(r => r.status === 'resolved' && !r.missingRefid).length})`}
                                        {tab === 'all' && `All Scanned (${resolutions.length})`}
                                        {tab === 'ignored' && `Ignored (${resolutions.filter(r => r.status === 'ignored').length})`}
                                    </button>
                                ))}
                            </div>

                            <div className="relative flex items-center">
                                <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={matrixSearch}
                                    onChange={(e) => setMatrixSearch(e.target.value)}
                                    placeholder="Filter matrix candidates..."
                                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 w-56 outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                        </div>

                        {/* Matrix Table */}
                        <div className="flex-grow overflow-auto p-6 space-y-3 custom-scrollbar">
                            {filteredResolutions.length === 0 ? (
                                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 my-4 shadow-2xs">
                                    <CheckCircle2 size={44} className="mx-auto text-emerald-500 mb-3" />
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1">
                                        {matrixFilter === 'unlinked' ? 'No Unlinked Citations or Missing Refids Found!' : 'No Matching Candidates Found'}
                                    </h4>
                                    <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 font-medium leading-relaxed">
                                        {matrixFilter === 'unlinked' 
                                            ? 'All scanned citations, float tags, figures, and tables in this document are already properly linked with valid refid attributes.' 
                                            : 'Try adjusting your search query or tab filter.'}
                                    </p>
                                    {matrixFilter === 'unlinked' && resolutions.length > 0 && (
                                        <button 
                                            onClick={() => setMatrixFilter('all')}
                                            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all border border-indigo-200"
                                        >
                                            View All {resolutions.length} Scanned Items
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredResolutions.map((item) => (
                                <div 
                                    key={item.id} 
                                    className={`p-4 bg-white border rounded-2xl shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                        item.status === 'resolved' ? 'border-slate-200 hover:border-emerald-300' :
                                        item.status === 'autotag' ? 'border-purple-200 bg-purple-50/20 hover:border-purple-300' :
                                        item.status === 'failed' ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200 opacity-60'
                                    }`}
                                >
                                    <div className="flex flex-col flex-grow min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                                item.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' :
                                                item.status === 'autotag' ? 'bg-purple-100 text-purple-800' :
                                                item.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {item.status}
                                            </span>

                                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                                {item.tagType}
                                            </span>

                                            {item.confidenceScore > 0 && (
                                                <span className="text-[10px] font-mono text-slate-400 font-semibold">
                                                    Match: {item.confidenceScore}%
                                                </span>
                                            )}

                                            {item.notes && (
                                                <span className="text-[10px] text-slate-500 italic truncate">
                                                    • {item.notes}
                                                </span>
                                            )}
                                        </div>

                                        <div className="font-mono text-xs text-slate-800 font-bold break-all flex items-center gap-2 flex-wrap">
                                            <span>{item.textContent}</span>
                                            {item.formattedText && item.formattedText !== item.textContent && (
                                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-mono font-extrabold border border-indigo-200/80 flex items-center gap-1 shadow-2xs">
                                                    ➔ {item.formattedText}
                                                </span>
                                            )}
                                        </div>

                                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                                            {item.originalTag}
                                        </div>
                                    </div>

                                    {/* Mapped Target ID Selector */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                                            {item.mappedIds.length > 0 ? (
                                                item.mappedIds.map(mid => (
                                                    <span key={mid} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-xs font-extrabold rounded-lg flex items-center gap-1">
                                                        {mid}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-rose-500 font-bold italic">No target refid</span>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => { setEditingItem(item); setPickerSearch(''); }}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-1"
                                            title="Manually override or pick target node"
                                        >
                                            <Tag size={13} /> Edit Target
                                        </button>

                                        <button
                                            onClick={() => {
                                                setResolutions(prev => prev.map(r => r.id === item.id ? { ...r, status: r.status === 'ignored' ? 'resolved' : 'ignored' } : r));
                                            }}
                                            className={`p-1.5 rounded-lg border transition-all text-xs ${
                                                item.status === 'ignored' 
                                                    ? 'bg-amber-100 text-amber-700 border-amber-300' 
                                                    : 'bg-white text-slate-400 hover:text-slate-600 border-slate-200'
                                            }`}
                                            title="Toggle Ignore"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            )))}
                        </div>
                    </div>
                )}

                {/* Step 3: Result View */}
                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        {/* Result View Tab Header */}
                        <div className="bg-slate-50 px-8 py-3 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-xl">
                                <button
                                    onClick={() => setActiveTab('xml')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                                        activeTab === 'xml' 
                                            ? 'bg-white text-indigo-700 shadow-2xs' 
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Linked Output XML
                                </button>
                                <button
                                    onClick={() => setActiveTab('diff')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                                        activeTab === 'diff' 
                                            ? 'bg-white text-indigo-700 shadow-2xs' 
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Side-by-Side Diff ({totalChanges} Changes)
                                </button>
                            </div>

                            <div className="flex items-center gap-3">
                                {activeTab === 'diff' && totalChanges > 0 && (
                                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1">
                                        <button 
                                            onClick={() => scrollToChange('prev')}
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600"
                                            title="Previous Change"
                                        >
                                            <ChevronUp size={14} />
                                        </button>
                                        <span className="text-[10px] font-mono font-extrabold text-slate-600 px-1">
                                            {currentChangeIndex >= 0 ? currentChangeIndex + 1 : 0} / {totalChanges}
                                        </span>
                                        <button 
                                            onClick={() => scrollToChange('next')}
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600"
                                            title="Next Change"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(output);
                                        setToast({ msg: "Linked XML copied to clipboard!", type: "success" });
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                >
                                    <Copy size={13} /> Copy XML
                                </button>

                                <button
                                    onClick={() => setStep('matrix')}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all"
                                >
                                    Re-adjust Matrix
                                </button>
                            </div>
                        </div>

                        {/* Result Tab Content */}
                        {activeTab === 'xml' ? (
                            <textarea 
                                readOnly
                                value={output}
                                className="flex-grow p-8 font-mono text-xs sm:text-sm bg-slate-900 text-slate-100 leading-relaxed border-0 focus:ring-0 resize-none outline-none selection:bg-indigo-500"
                                spellCheck={false}
                            />
                        ) : (
                            <div className="relative flex-grow overflow-hidden flex flex-col">
                                <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar">
                                    {diffElements}
                                </div>

                                <AnimatePresence>
                                    {totalChanges > 0 && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                            className="absolute bottom-6 right-8 flex items-center gap-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
                                        >
                                            <div className="flex items-center gap-2 pr-2.5 border-r border-slate-100">
                                                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                    <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                </div>
                                                <div className="flex flex-col px-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                    <span className="text-xs font-black text-slate-900 tabular-nums leading-none">
                                                        {currentChangeIndex >= 0 ? currentChangeIndex + 1 : 0} <span className="text-slate-300 mx-0.5">/</span> {totalChanges}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button 
                                                    onClick={() => scrollToChange('prev')}
                                                    className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group flex items-center gap-1 font-bold text-xs"
                                                    title="Previous Change (Up Arrow / Alt+P)"
                                                >
                                                    <ChevronUp className="w-4 h-4 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                    <span className="hidden sm:inline">Prev</span>
                                                </button>
                                                <button 
                                                    onClick={() => scrollToChange('next')}
                                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl transition-all font-black text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 group"
                                                    title="Next Change (Down Arrow / Alt+N)"
                                                >
                                                    <span>Next Change</span>
                                                    <ChevronDown className="w-4 h-4 group-active:translate-y-0.5 transition-transform" strokeWidth={3} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Manual Candidate Selection Modal */}
            <AnimatePresence>
                {editingItem && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                        onClick={() => setEditingItem(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 max-w-xl w-full p-6 max-h-[80vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                                <div>
                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">Manual Target Node Picker</h4>
                                    <p className="text-xs text-slate-500 font-bold mt-0.5">Citation: "{editingItem.textContent}"</p>
                                </div>
                                <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
                            </div>

                            <div className="py-3">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={pickerSearch}
                                        onChange={(e) => setPickerSearch(e.target.value)}
                                        placeholder="Search by ID, label, author name..."
                                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                            </div>

                            <div className="flex-grow overflow-auto py-2 space-y-2 custom-scrollbar">
                                {filteredPickerNodes.map((n) => {
                                    const isSelected = editingItem.mappedIds.includes(n.id);
                                    return (
                                        <button
                                            key={n.id}
                                            onClick={() => toggleMappedId(n.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                                                isSelected 
                                                    ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' 
                                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-mono text-xs font-black text-slate-800">{n.displayText}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">ID: {n.id} • Type: {n.type}</span>
                                            </div>
                                            {isSelected && (
                                                <Check size={16} className="text-indigo-600 shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CitationLinkerExperimental;
