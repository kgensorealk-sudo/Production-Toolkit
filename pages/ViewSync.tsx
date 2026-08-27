
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffWordsWithSpace, diffChars, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Search, AlertCircle, AlertTriangle, CheckCircle, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box, Maximize2, Minimize2, Sparkles, Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';

interface DetectedRef {
    tagName: string;
    refid?: string;
    text: string;
    isRestored?: boolean;
    isModified?: boolean;
    isAutoTagged?: boolean;
}

export interface RefModification {
    id: string;
    paraId: string;
    type: 'citation_changed' | 'auto_tagged' | 'ref_restored';
    originalRefText?: string;
    newRefText: string;
    originalRefId?: string;
    newRefId?: string;
    targetSnippet?: string;
    resultSnippet: string;
    message: string;
    severity: 'warning' | 'info';
}

interface SyncLog {
    id: number;
    paraId: string;
    status: 'success' | 'warning' | 'error';
    message?: string;
    stats?: {
        remapped: number;
        restored: number;
        autoTagged?: number;
        modified?: number;
        total: number;
    };
    diffStats?: {
        added: number;
        removed: number;
    };
    detectedRefs: DetectedRef[];
}

const ViewSync: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useLocalStorage<string>('view_sync_input', '');
    const [output, setOutput] = useLocalStorage<string>('view_sync_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('view_sync_last_input', '');
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [refModifications, setRefModifications] = useState<RefModification[]>([]);
    const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [syncDirection, setSyncDirection] = useState<'compact-to-extended' | 'extended-to-compact'>('compact-to-extended');
    const [customStartId, setCustomStartId] = useState<string>('');
    const [orphans, setOrphans] = useState<{type: 'compact' | 'extended', id: string, text: string}[]>([]);
    
    // View State
    const [activeTab, setActiveTab] = useState<'raw' | 'diff' | 'audit' | 'report' | 'mismatches' | 'orphans'>('raw');
    const [isExpandedView, setIsExpandedView] = useState(false);
    const [mismatches, setMismatches] = useState<{paraId: string, compactText: string, extendedText: string, index: number}[]>([]);
    const [selectedMismatches, setSelectedMismatches] = useState<Set<number>>(new Set());
    const [diffRows, setDiffRows] = useState<any[]>([]);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);

    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            // Clear the state so it doesn't re-trigger on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput]);

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

    /**
     * Restores missing cross-references and e-components from target view into source content
     * so that supplementary/extended links (like Fig. S1, Table S1, ec####) are never lost.
     */
    const restoreMissingLinks = (
        sourceXml: string,
        targetXml: string,
        isExtendedTarget: boolean
    ): { updatedXml: string; restoredCount: number; restoredRefIds: Set<string> } => {
        const targetTagRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
        
        interface TargetLinkItem {
            tagName: string;
            attrs: string;
            refid?: string;
            innerXml: string;
            plainText: string;
            fullTag: string;
        }

        const targetLinks: TargetLinkItem[] = [];
        let tm;
        while ((tm = targetTagRegex.exec(targetXml)) !== null) {
            const tagName = tm[1];
            const attrs = tm[2];
            const innerXml = tm[3];
            const plainText = stripTags(innerXml).trim();
            const refidMatch = attrs.match(/\brefid="([^"]+)"/);
            const refid = refidMatch ? refidMatch[1] : undefined;

            // If syncing to compact view, skip e-components and ec\d+ links per DTD
            if (!isExtendedTarget) {
                if (tagName === 'e-component' || (refid && /^ec\d+/i.test(refid))) {
                    continue;
                }
            }

            if (plainText.length > 0) {
                targetLinks.push({
                    tagName,
                    attrs,
                    refid,
                    innerXml,
                    plainText,
                    fullTag: tm[0]
                });
            }
        }

        if (targetLinks.length === 0) {
            return { updatedXml: sourceXml, restoredCount: 0, restoredRefIds: new Set<string>() };
        }

        let updated = sourceXml;
        let restoredCount = 0;
        const restoredRefIds = new Set<string>();

        // Token regex to split XML into protected cross-ref/e-component blocks, other XML tags, and plain text
        const tokenRegex = /(<(?:ce:cross-refs?|e-component)\b[^>]*>[\s\S]*?<\/(?:ce:cross-refs?|e-component)>|<[^>]+>)/gi;

        for (const link of targetLinks) {
            const escaped = link.plainText
                .trim()
                .split(/\s+/)
                .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('[\\s\\u00A0]+');

            const startsWithWord = /^[a-zA-Z0-9]/.test(link.plainText.trim());
            const endsWithDigit = /\d$/.test(link.plainText.trim());
            const endsWithLetter = /[a-zA-Z]$/.test(link.plainText.trim());

            const lookbehind = startsWithWord ? '(?<![a-zA-Z0-9])' : '';
            const lookahead = endsWithDigit ? '(?!\d)' : (endsWithLetter ? '(?![a-zA-Z0-9])' : '');

            const matchRegex = new RegExp(`${lookbehind}${escaped}${lookahead}`, 'i');

            const parts = updated.split(tokenRegex);
            let linkRestored = false;

            for (let j = 0; j < parts.length; j++) {
                // Even indices (0, 2, 4...) are plain text outside tags and outside existing cross-ref blocks
                if (j % 2 === 0 && !linkRestored) {
                    if (matchRegex.test(parts[j])) {
                        parts[j] = parts[j].replace(matchRegex, (matched) => {
                            linkRestored = true;
                            const cleanAttrs = link.attrs ? ' ' + link.attrs.trim() : '';
                            return `<${link.tagName}${cleanAttrs}>${matched}</${link.tagName}>`;
                        });
                    }
                }
            }

            if (linkRestored) {
                updated = parts.join('');
                restoredCount++;
                if (link.refid) {
                    restoredRefIds.add(link.refid);
                }
            }
        }

        return { updatedXml: updated, restoredCount, restoredRefIds };
    };

    /**
     * Automatically tags unlinked figure/table/supplementary/scheme citations with <ce:cross-ref>
     * while strictly avoiding tags inside existing cross-refs or other protected XML tags.
     */
    const autoTagUnlinkedCitations = (
        xml: string
    ): { updatedXml: string; autoTaggedCount: number; taggedRefs: { text: string; fullSnippet: string }[] } => {
        // Token regex splits XML into protected cross-ref/e-component blocks, other XML tags, and plain text
        const tokenRegex = /(<(?:ce:cross-refs?|e-component)\b[^>]*>[\s\S]*?<\/(?:ce:cross-refs?|e-component)>|<[^>]+>)/gi;
        const parts = xml.split(tokenRegex);
        let autoTaggedCount = 0;
        const taggedRefs: { text: string; fullSnippet: string }[] = [];

        // Citation regex for Fig./Figure/Table/Scheme/Movie/Supplementary refs
        // Matches e.g. "Fig. S1", "Fig. 1", "Fig. S1B" (captures "Fig. S1"), "Figure S2", "Table S1", etc.
        const citationRegex = /\b((?:Fig(?:ure)?s?\.?|Tables?|Schemes?|Movies?|Videos?|Supplementary\s+(?:Fig(?:ure)?|Table|Data|Note|Movie|Video))\s*S?\d+)/gi;

        for (let i = 0; i < parts.length; i++) {
            // Even indices are plain text outside XML tags and existing cross-refs
            if (i % 2 === 0 && parts[i]) {
                if (citationRegex.test(parts[i])) {
                    citationRegex.lastIndex = 0;
                    parts[i] = parts[i].replace(citationRegex, (match) => {
                        autoTaggedCount++;
                        const cleanText = match.trim();
                        taggedRefs.push({ text: cleanText, fullSnippet: `<ce:cross-ref>${cleanText}</ce:cross-ref>` });
                        return `<ce:cross-ref>${cleanText}</ce:cross-ref>`;
                    });
                }
            }
        }

        return {
            updatedXml: parts.join(''),
            autoTaggedCount,
            taggedRefs
        };
    };

    const getValidRanges = (text: string) => {
        // Expanded to include all structural areas where views typically reside
        const sectionsRegex = /<(ce:sections|ce:caption|ce:biographical-note|ce:abstract|ce:glossary|ce:figure|ce:table|ce:appendix|ce:acknowledgment|ce:bibliography)\b[^>]*>([\s\S]*?)<\/\1>/gi;
        const appendicesRegex = /<ce:appendices\b[^>]*>([\s\S]*?)<\/ce:appendices>/g;
        
        const ranges: {start: number, end: number}[] = [];
        let sectionMatch;
        let foundAnyStructuralArea = false;

        while ((sectionMatch = sectionsRegex.exec(text)) !== null) {
            foundAnyStructuralArea = true;
            const fullMatch = sectionMatch[0];
            const tagName = sectionMatch[1];
            const content = sectionMatch[2];
            
            const sectionStart = sectionMatch.index;
            // Find the actual start of content by looking for the first '>' after the tag name
            const openTagEndIndex = fullMatch.indexOf('>', fullMatch.indexOf(tagName));
            const sectionContentStart = sectionStart + openTagEndIndex + 1;
            const sectionContentEnd = sectionContentStart + content.length;
            
            // Find appendices within this section content
            const appendices: {start: number, end: number}[] = [];
            let appendixMatch;
            while ((appendixMatch = appendicesRegex.exec(content)) !== null) {
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
            
            if (currentStart < sectionContentEnd) {
                ranges.push({start: currentStart, end: sectionContentEnd});
            }
        }

        if (!foundAnyStructuralArea) {
            // Fallback: If no recognized structural areas found, the whole document is valid minus appendices
            let currentStart = 0;
            const globalAppendices: {start: number, end: number}[] = [];
            let appendixMatch;
            while ((appendixMatch = appendicesRegex.exec(text)) !== null) {
                globalAppendices.push({start: appendixMatch.index, end: appendixMatch.index + appendixMatch[0].length});
            }

            globalAppendices.forEach(app => {
                if (app.start > currentStart) {
                    ranges.push({start: currentStart, end: app.start});
                }
                currentStart = app.end;
            });

            if (currentStart < text.length) {
                ranges.push({start: currentStart, end: text.length});
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

    const getPairsAndOrphans = (xml: string) => {
        const structuralAreas = getValidRanges(xml);
        const pairs: {compact: any, extended: any}[] = [];
        const orphans: {type: 'compact' | 'extended', id: string, text: string, match: any}[] = [];
        
        const allViewsRegex = /<ce:(para|simple-para)\b[^>]*?\bview\s*=\s*["'](compact|compact-standard|view|extended)["'][^>]*?>([\s\S]*?)<\/ce:(?:para|simple-para)>/gi;
        const allMatches = [...xml.matchAll(allViewsRegex)];

        const isCompact = (m: any) => m && (m[2] === 'compact' || m[2] === 'compact-standard' || m[2] === 'view');
        const isExtended = (m: any) => m && m[2] === 'extended';

        structuralAreas.forEach(range => {
            const areaMatches = allMatches.filter(m => m.index! >= range.start && m.index! < range.end);
            
            for (let i = 0; i < areaMatches.length; i++) {
                const current = areaMatches[i];
                const next = areaMatches[i + 1];
                
                if (isCompact(current)) {
                    if (next && isExtended(next)) {
                        pairs.push({ compact: current, extended: next });
                        i++; 
                    } else {
                        const idMatch = current[0].match(/\bid="([^"]+)"/);
                        orphans.push({ 
                            type: 'compact', 
                            id: idMatch ? idMatch[1] : 'Unknown', 
                            text: stripTags(current[3]),
                            match: current
                        });
                    }
                } else if (isExtended(current)) {
                    if (next && isCompact(next)) {
                        pairs.push({ compact: next, extended: current });
                        i++;
                    } else {
                        const idMatch = current[0].match(/\bid="([^"]+)"/);
                        orphans.push({ 
                            type: 'extended', 
                            id: idMatch ? idMatch[1] : 'Unknown', 
                            text: stripTags(current[3]),
                            match: current
                        });
                    }
                }
            }
        });
        
        return { pairs, orphans };
    };

    const detectOrphans = (xml: string) => {
        const { orphans } = getPairsAndOrphans(xml);
        return orphans.map(o => ({ type: o.type, id: o.id, text: o.text }));
    };

    const fixOrphans = () => {
        if (!input.trim()) return;
        setIsLoading(true);
        setTimeout(() => {
            const xml = input;
            const { orphans } = getPairsAndOrphans(xml);

            if (orphans.length === 0) {
                setIsLoading(false);
                setToast({ msg: "No orphans to fix.", type: "success" });
                return;
            }

            const allIds = new Set<string>();
            const idMatches = xml.matchAll(/\bid="([^"]+)"/g);
            for (const m of idMatches) {
                allIds.add(m[1]);
            }

            const allViewsRegex = /<ce:(para|simple-para)\b[^>]*?\bview\s*=\s*["'](compact|compact-standard|view|extended)["'][^>]*?>([\s\S]*?)<\/ce:(?:para|simple-para)>/gi;
            const matches = [...xml.matchAll(allViewsRegex)];
            let maxIdNum = 4000;
            matches.forEach(m => {
                const idAttr = m[0].match(/\bid="[a-zA-Z]+(\d+)"/);
                if (idAttr) {
                    const num = parseInt(idAttr[1], 10);
                    if (!isNaN(num) && num > maxIdNum) maxIdNum = num;
                }
            });

            const configId = customStartId ? parseInt(customStartId, 10) : 0;
            const idShift = configId || 3000;
            let nextIdSeed = configId || Math.max(4000, Math.ceil((maxIdNum + 10) / 5) * 5);

            const getUniqueId = (prefix: string, preferredNum: number): string => {
                let num = preferredNum;
                let candidate = `${prefix}${num.toString().padStart(4, '0')}`;
                while (allIds.has(candidate)) {
                    num = nextIdSeed;
                    candidate = `${prefix}${num.toString().padStart(4, '0')}`;
                    nextIdSeed += 5;
                }
                allIds.add(candidate);
                return candidate;
            };

            const replacements: {start: number, end: number, replacement: string}[] = [];

            orphans.forEach(orphan => {
                const match = orphan.match;
                const fullMatch = match[0];
                const tagName = match[1];
                const viewType = match[2];
                const content = match[3];
                const startIndex = match.index!;
                
                if (viewType === 'extended') {
                    let newContent = content.replace(/<e-component\b[^>]*>([\s\S]*?)<\/e-component>/gi, '$1');
                    newContent = newContent.replace(/<ce:cross-refs?\b[^>]*?\brefid=["']ec\d+["'][^>]*?>([\s\S]*?)<\/ce:cross-refs?>/gi, '$1');
                    
                    // Renumber internal IDs in newContent to avoid duplicates
                    newContent = newContent.replace(/\bid="([a-zA-Z]+)(\d+)"/g, (m: string, prefix: string, numStr: string) => {
                        const num = parseInt(numStr, 10);
                        return `id="${getUniqueId(prefix, num + idShift)}"`;
                    });

                    const idMatch = fullMatch.match(/\bid="([a-zA-Z]+)(\d+)"/);
                    let newId = '';
                    if (idMatch) {
                        const prefix = idMatch[1];
                        const oldNum = parseInt(idMatch[2], 10);
                        newId = getUniqueId(prefix, oldNum + idShift);
                    } else {
                        const standardPrefix = tagName === 'simple-para' ? 'sp' : 'p';
                        newId = getUniqueId(standardPrefix, nextIdSeed);
                    }

                    const newBlock = `<ce:${tagName} view="compact-standard" id="${newId}">${newContent}</ce:${tagName}>`;
                    replacements.push({
                        start: startIndex + fullMatch.length,
                        end: startIndex + fullMatch.length,
                        replacement: `\n${newBlock}`
                    });
                } else {
                    const idMatch = fullMatch.match(/\bid="([a-zA-Z]+)(\d+)"/);
                    let newId = '';
                    if (idMatch) {
                        const prefix = idMatch[1];
                        const oldNum = parseInt(idMatch[2], 10);
                        newId = getUniqueId(prefix, Math.max(1, oldNum - idShift));
                    } else {
                        const standardPrefix = tagName === 'simple-para' ? 'sp' : 'p';
                        newId = getUniqueId(standardPrefix, nextIdSeed);
                    }

                    // Renumber internal IDs in content
                    const newContent = content.replace(/\bid="([a-zA-Z]+)(\d+)"/g, (m: string, prefix: string, numStr: string) => {
                        const num = parseInt(numStr, 10);
                        return `id="${getUniqueId(prefix, Math.max(1, num - idShift))}"`;
                    });

                    const newBlock = `<ce:${tagName} view="extended" id="${newId}">${newContent}</ce:${tagName}>`;

                    replacements.push({
                        start: startIndex,
                        end: startIndex,
                        replacement: `${newBlock}\n`
                    });
                }
            });

            replacements.sort((a, b) => b.start - a.start);
            let finalOutput = xml;
            replacements.forEach(rep => {
                finalOutput = finalOutput.substring(0, rep.start) + rep.replacement + finalOutput.substring(rep.end);
            });

            setOutput(finalOutput);
            setLastProcessedInput(xml);
            generateDiff(xml, finalOutput);
            setLogs([{
                id: 1,
                paraId: 'ORPHAN-FIX',
                status: 'success',
                message: `Automatically generated missing counterparts for ${orphans.length} orphans.`,
                detectedRefs: []
            }]);
            setOrphans([]);
            setActiveTab('diff');
            setToast({ msg: `Fixed ${orphans.length} orphans!`, type: "success" });
            setIsLoading(false);
        }, 800);
    };

    const scanForMismatches = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const { pairs, orphans: foundOrphans } = getPairsAndOrphans(input);
            setOrphans(foundOrphans.map(o => ({ type: o.type, id: o.id, text: o.text })));

            const foundMismatches: {paraId: string, compactText: string, extendedText: string, index: number}[] = [];
            
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const compactContent = pair.compact[3] || '';
                const extendedContent = pair.extended[3] || '';

                const compactText = stripTags(compactContent);
                const extendedText = stripTags(extendedContent);

                if (compactText !== extendedText) {
                    const idMatch = pair.compact[0].match(/\bid="([^"]+)"/);
                    foundMismatches.push({
                        paraId: idMatch ? idMatch[1] : `Pair ${i + 1}`,
                        compactText,
                        extendedText,
                        index: i
                    });
                }
            }

            setMismatches(foundMismatches);
            setSelectedMismatches(new Set(foundMismatches.map(m => m.index)));
            setActiveTab(foundOrphans.length > 0 ? 'orphans' : 'mismatches');
            setIsLoading(false);
            
            if (foundOrphans.length > 0) {
                setToast({ msg: `Found ${foundOrphans.length} unpaired views! Please fix these before syncing.`, type: "error" });
            } else if (foundMismatches.length === 0) {
                setToast({ msg: "No mismatches found! All pairs are synchronized.", type: "success" });
            } else {
                setToast({ msg: `Found ${foundMismatches.length} unsynchronized paragraph pairs.`, type: "warn" });
            }
        }, 500);
    };

    const toggleMismatchSelection = (index: number) => {
        const next = new Set(selectedMismatches);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedMismatches(next);
    };

    const processSync = (specificIndices?: Set<number>) => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const newLogs: SyncLog[] = [];
            let logCounter = 1;
            let nextIdNum = 4000;

            const allIds = new Set<string>();
            const idMatches = input.matchAll(/\bid="([^"]+)"/g);
            for (const m of idMatches) {
                allIds.add(m[1]);
            }

            if (customStartId && !isNaN(parseInt(customStartId))) {
                nextIdNum = parseInt(customStartId);
            } else {
                // Determine Global Max ID to ensure uniqueness
                const allIdRegex = /\bid="([a-zA-Z]+)(\d{1,4})"/g;
                let maxIdNum = 0;
                let m;
                while ((m = allIdRegex.exec(input)) !== null) {
                    const num = parseInt(m[2], 10);
                    if (!isNaN(num) && num > maxIdNum) {
                        maxIdNum = num;
                    }
                }
                nextIdNum = Math.max(4000, Math.ceil((maxIdNum + 10) / 5) * 5);
            }

            const getUniqueId = (prefix: string): string => {
                let candidate = `${prefix}${nextIdNum.toString().padStart(4, '0')}`;
                while (allIds.has(candidate)) {
                    nextIdNum += 5;
                    candidate = `${prefix}${nextIdNum.toString().padStart(4, '0')}`;
                }
                allIds.add(candidate);
                nextIdNum += 5;
                return candidate;
            };

            // 2. Extract Paragraph Pairs
            const { pairs, orphans: inputOrphans } = getPairsAndOrphans(input);
            setOrphans(inputOrphans.map(o => ({ type: o.type, id: o.id, text: o.text })));

            if (pairs.length === 0 && inputOrphans.length === 0) {
                 setToast({ msg: "No synchronized pairs or orphans found.", type: "error" });
                 setIsLoading(false);
                 return;
            }

            if (inputOrphans.length > 0) {
                newLogs.push({
                    id: logCounter++,
                    paraId: 'ORPHANS',
                    status: 'error',
                    message: `Critical: ${inputOrphans.length} unpaired view(s) detected. Compact-standard must be paired with Extended.`,
                    detectedRefs: []
                });
            }
            
            // 3. Build Replacements
            const replacements: {start: number, end: number, replacement: string}[] = [];
            const newModifications: RefModification[] = [];
            let modCounter = 1;

            for (let i = 0; i < pairs.length; i++) {
                // If specific indices are provided, only sync those
                if (specificIndices && !specificIndices.has(i)) {
                    continue;
                }

                const pair = pairs[i];
                const compactMatch = pair.compact;
                const extendedMatch = pair.extended;
                
                let sourceContent = '';
                let targetContent = '';
                let targetFullMatch = '';
                let targetIndex = 0;

                let targetView = '';
                if (syncDirection === 'compact-to-extended') {
                    sourceContent = compactMatch[3] || ''; 
                    targetContent = extendedMatch[3] || ''; 
                    targetFullMatch = extendedMatch[0] || '';
                    targetIndex = extendedMatch.index || 0;
                    targetView = 'extended';
                } else {
                    sourceContent = extendedMatch[3] || ''; 
                    targetContent = compactMatch[3] || '';
                    targetFullMatch = compactMatch[0] || '';
                    targetIndex = compactMatch.index || 0;
                    targetView = compactMatch[2] || ''; // compact-standard or compact or view
                }
                
                const targetOpenTagMatch = targetFullMatch.match(/^<(ce:(?:para|simple-para))\b[^>]*>/);
                
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

                const targetTagName = targetOpenTagMatch[1];
                const targetOpenTag = targetOpenTagMatch[0];
                const targetIdMatch = targetOpenTag.match(/\bid="([^"]+)"/);
                const targetParaId = targetIdMatch ? targetIdMatch[1] : `Index ${i}`;

                // --- ROBUST SYNCHRONIZATION STRATEGY ---
                
                // 0. Extract original references from target before sync to monitor changes
                const targetOriginalRefs: { tagName: string; id?: string; refid?: string; text: string; fullSnippet: string }[] = [];
                const tRefScanRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
                let tRefScanMatch;
                while ((tRefScanMatch = tRefScanRegex.exec(targetContent)) !== null) {
                    const tagName = tRefScanMatch[1];
                    const attrs = tRefScanMatch[2];
                    const text = stripTags(tRefScanMatch[3]).trim();
                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    const refidMatch = attrs.match(/\brefid="([^"]+)"/);
                    targetOriginalRefs.push({
                        tagName,
                        id: idMatch ? idMatch[1] : undefined,
                        refid: refidMatch ? refidMatch[1] : undefined,
                        text,
                        fullSnippet: tRefScanMatch[0]
                    });
                }

                // 1. Pre-process source based on target view requirements
                let processedSource = sourceContent || '';
                let restoredCount = 0;
                const restoredRefIds = new Set<string>();
                
                if (targetView !== 'extended') {
                    // Strip e-component tags for non-extended views per DTD
                    processedSource = processedSource.replace(/<e-component\b[^>]*>([\s\S]*?)<\/e-component>/gi, '$1');
                    // Strip cross-ref tags pointing to supplementary files (ecXXXX) for non-extended views per DTD
                    processedSource = processedSource.replace(/<ce:cross-refs?\b[^>]*?\brefid=["']ec\d+["'][^>]*?>([\s\S]*?)<\/ce:cross-refs?>/gi, '$1');
                    
                    // Also restore any standard target cross-refs if unlinked in source
                    const restored = restoreMissingLinks(processedSource, targetContent, false);
                    processedSource = restored.updatedXml;
                    restoredCount += restored.restoredCount;
                    restored.restoredRefIds.forEach(id => restoredRefIds.add(id));
                } else {
                    // When syncing TO extended view, restore ALL cross-references (Fig. S1, Table S1, ec####, figures, tables, etc.)
                    // and e-components that existed in the extended target but are missing/unlinked in the source
                    const restored = restoreMissingLinks(processedSource, targetContent, true);
                    processedSource = restored.updatedXml;
                    restoredCount += restored.restoredCount;
                    restored.restoredRefIds.forEach(id => restoredRefIds.add(id));
                }

                // Auto-tag any unlinked citations (Fig. S1, Table S1, etc.) in source
                const autoTagged = autoTagUnlinkedCitations(processedSource);
                processedSource = autoTagged.updatedXml;

                // 2. Map existing cf IDs from target to preserve them
                const targetCfByRefId = new Map<string, string[]>();
                const targetCfOrderedList: string[] = [];
                const targetExistingIds = new Set<string>();
                
                const tIdMatches = targetFullMatch.matchAll(/\bid="([^"]+)"/g);
                for (const tm of tIdMatches) {
                    targetExistingIds.add(tm[1]);
                }
                
                // Allow target existing IDs to be reused/preserved in the replacement block
                targetExistingIds.forEach(id => allIds.delete(id));

                const tOpenTagRegex = /<(ce:cross-refs?)\b([^>]*?)>/gi;
                let tom;
                while ((tom = tOpenTagRegex.exec(targetContent)) !== null) {
                    const attrs = tom[2];
                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    const refidMatch = attrs.match(/\brefid="([^"]+)"/);
                    if (idMatch) {
                        const id = idMatch[1];
                        targetCfOrderedList.push(id);
                        if (refidMatch) {
                            const refid = refidMatch[1];
                            if (!targetCfByRefId.has(refid)) targetCfByRefId.set(refid, []);
                            targetCfByRefId.get(refid)!.push(id);
                        }
                    }
                }

                // 3. Synchronize IDs while prioritizing preservation of target IDs
                let remappedCount = 0;
                
                // Track IDs used in this specific paragraph to avoid internal collisions
                const usedInCurrentPara = new Set<string>();
                if (targetParaId) {
                    usedInCurrentPara.add(targetParaId);
                    allIds.add(targetParaId);
                }

                let newContent = processedSource.replace(/<(ce:cross-refs?)\b([^>]*?)>([\s\S]*?)<\/ce:cross-refs?>/gi, (match, tagName, attrs, content) => {
                    const refidMatch = attrs.match(/\brefid="([^"]+)"/);
                    const refid = refidMatch ? refidMatch[1] : '';
                    const sourceIdMatch = attrs.match(/\bid="([^"]+)"/);
                    const sourceId = sourceIdMatch ? sourceIdMatch[1] : '';

                    let preservedId: string | null = null;
                    if (refid && targetCfByRefId.has(refid) && targetCfByRefId.get(refid)!.length > 0) {
                        preservedId = targetCfByRefId.get(refid)!.shift()!;
                    } else if (targetCfOrderedList.length > 0) {
                        preservedId = targetCfOrderedList.shift()!;
                    }

                    let assignedId = '';
                    if (preservedId && !usedInCurrentPara.has(preservedId)) {
                        assignedId = preservedId;
                    } else if (sourceId && !allIds.has(sourceId) && !usedInCurrentPara.has(sourceId)) {
                        assignedId = sourceId;
                    } else {
                        // Standard XML DTD prefix for both ce:cross-ref and ce:cross-refs is ALWAYS 'cf' (NEVER 'cfs')
                        assignedId = getUniqueId('cf');
                    }

                    usedInCurrentPara.add(assignedId);
                    allIds.add(assignedId);
                    remappedCount++;

                    const cleanAttrs = attrs.replace(/\bid="[^"]*"/, '').trim();
                    return `<${tagName} id="${assignedId}"${cleanAttrs ? ' ' + cleanAttrs : ''}>${content}</${tagName}>`;
                });

                // Renumber existing IDs for non-cross-refs (anchors, e-components)
                newContent = newContent.replace(/\bid="([a-zA-Z]+)(\d+)"/g, (match, prefix, oldNum) => {
                    const fullId = `${prefix}${oldNum}`;
                    if (usedInCurrentPara.has(fullId)) return match; // Already handled/preserved
                    
                    if (allIds.has(fullId)) {
                        const newId = getUniqueId(prefix);
                        usedInCurrentPara.add(newId);
                        allIds.add(newId);
                        return `id="${newId}"`;
                    }
                    allIds.add(fullId);
                    usedInCurrentPara.add(fullId);
                    return match;
                });

                // Safety: Ensure required tags that might have lost IDs are re-anchored
                newContent = newContent.replace(/<(ce:(?:anchor)|e-component)\b((?:(?!id=)[^>])*)>/g, (match, tagName, attrs) => {
                    const prefix = tagName === 'ce:anchor' ? 'anc' : 'ec';
                    const newId = getUniqueId(prefix);
                    usedInCurrentPara.add(newId);
                    allIds.add(newId);
                    return `<${tagName} id="${newId}"${attrs}>`;
                });

                // 5. Scan for FINAL Cross-Refs and e-components for reporting
                const detectedRefs: DetectedRef[] = [];
                const crossRefRegex = /<(ce:cross-refs?|e-component)\b([^>]*)>([\s\S]*?)<\/\1>/g;
                let crMatch;
                while ((crMatch = crossRefRegex.exec(newContent)) !== null) {
                    const tagName = crMatch[1];
                    const attrs = crMatch[2];
                    const text = crMatch[3];
                    const refIdMatch = attrs.match(/refid="([^"]+)"/);
                    const currentRefId = refIdMatch ? refIdMatch[1] : undefined;
                    const cleanText = stripTags(text).trim();
                    const isRestored = currentRefId ? restoredRefIds.has(currentRefId) : false;
                    
                    detectedRefs.push({
                        tagName,
                        refid: currentRefId,
                        text: cleanText,
                        isRestored: isRestored
                    });
                }

                // 6. Compare target original refs with final detected refs to log modifications
                const maxRefs = Math.max(targetOriginalRefs.length, detectedRefs.length);
                for (let rIdx = 0; rIdx < maxRefs; rIdx++) {
                    const orig = targetOriginalRefs[rIdx];
                    const curr = detectedRefs[rIdx];

                    if (orig && curr) {
                        if (orig.text !== curr.text) {
                            newModifications.push({
                                id: `mod-${modCounter++}`,
                                paraId: targetParaId,
                                type: 'citation_changed',
                                originalRefText: orig.text,
                                newRefText: curr.text,
                                originalRefId: orig.refid,
                                targetSnippet: orig.fullSnippet,
                                resultSnippet: `<${curr.tagName}${curr.refid ? ` refid="${curr.refid}"` : ''}>${curr.text}</${curr.tagName}>`,
                                severity: 'warning',
                                message: `Reference citation changed from "${orig.text}" (target) to "${curr.text}" (source synchronized & tagged)`
                            });
                        }
                    } else if (!orig && curr) {
                        newModifications.push({
                            id: `mod-${modCounter++}`,
                            paraId: targetParaId,
                            type: curr.isRestored ? 'ref_restored' : 'auto_tagged',
                            newRefText: curr.text,
                            newRefId: curr.refid,
                            resultSnippet: `<${curr.tagName}${curr.refid ? ` refid="${curr.refid}"` : ''}>${curr.text}</${curr.tagName}>`,
                            severity: 'info',
                            message: curr.isRestored 
                                ? `Restored reference link for "${curr.text}"` 
                                : `Auto-tagged citation <ce:cross-ref>${curr.text}</ce:cross-ref>`
                        });
                    }
                }

                const newBlock = `${targetOpenTag}${newContent}</${targetTagName}>`;
                
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
            setRefModifications(newModifications);
            generateDiff(input, finalOutput);
            
            // Detect Orphans for background check
            const foundOrphans = detectOrphans(finalOutput);
            setOrphans(foundOrphans);

            // Background Scanner for Smart Suggestions
            const newSuggestions: SmartSuggestion[] = [];
            
            // 0. Orphans Check
            if (foundOrphans.length > 0) {
                newSuggestions.push({
                    id: 'orphans-detected',
                    toolName: 'Orphan Detection',
                    description: `Critical: ${foundOrphans.length} unpaired view(s) detected. Compact-standard views must always be paired with Extended views.`,
                    path: '#', // Stays on same page but indicates issue
                    icon: <AlertCircle className="w-4 h-4" />,
                    condition: 'Unpaired views detected'
                });
            }

            // 1. XML Normalizer (Renumber)
            if (finalOutput.includes('<ce:bib-reference')) {
                newSuggestions.push({
                    id: 'xml-renumber',
                    toolName: 'XML Normalizer',
                    description: 'Bibliography detected. Use this to ensure all references are correctly numbered and cross-references are updated.',
                    path: '/xmlRenumber',
                    icon: <Hash className="w-4 h-4" />,
                    condition: 'Bibliography detected'
                });
            }

            // 2. Other-Refs Scanner
            const otherRefCount = (finalOutput.match(/<ce:other-ref/g) || []).length;
            if (otherRefCount > 0) {
                newSuggestions.push({
                    id: 'other-ref',
                    toolName: 'Other-Ref Scanner',
                    description: `It is found that the XML contains ${otherRefCount} other-ref(s). Please use the Other-Refs Scanner.`,
                    path: '/otherRefScanner',
                    icon: <LinkIcon className="w-4 h-4" />,
                    condition: 'Other-refs detected'
                });
            }

            // 3. XML Tag Cleaner
            const tagMatches = finalOutput.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
            if (tagMatches.length > 0) {
                newSuggestions.push({
                    id: 'tag-cleaner',
                    toolName: 'XML Tag Cleaner',
                    description: `It is found that the XML contains ${tagMatches.length} editorial tag(s) (DEL/INS/Comment). Please use the XML Tag Cleaner.`,
                    path: '/tagCleaner',
                    icon: <Trash2 className="w-4 h-4" />,
                    condition: 'Editorial tags detected'
                });
            }

            // 4. Citation Linker Pro
            const unlinkedCitations = (finalOutput.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
            if (unlinkedCitations > 0) {
                newSuggestions.push({
                    id: 'citation-linker',
                    toolName: 'Citation Linker Pro',
                    description: `It is found that the XML result contains ${unlinkedCitations} unlinked Cross-ref(s). Please use the Citation Linker Pro.`,
                    path: '/citationLinker',
                    icon: <LinkIcon className="w-4 h-4" />,
                    condition: 'Unlinked citations detected'
                });
            }

            // 5. Uncited Ref Cleaner
            if (finalOutput.includes('<ce:bibliography')) {
                newSuggestions.push({
                    id: 'uncited-cleaner',
                    toolName: 'Uncited Ref Cleaner',
                    description: 'Bibliography detected. Use this tool to identify and remove references that are not cited in the text.',
                    path: '/uncitedCleaner',
                    icon: <Eraser className="w-4 h-4" />,
                    condition: 'Bibliography detected'
                });
            }

            // 6. Reference Structure Repair
            if (finalOutput.includes('<ce:source-text') || !finalOutput.includes('<sb:reference')) {
                newSuggestions.push({
                    id: 'structural-architect',
                    toolName: 'Reference Structure Repair v3.2',
                    description: 'Structural overhaul recommended. Use this to transform raw source text into valid structural bibliography nodes.',
                    path: '/structuralArchitect',
                    icon: <Box className="w-4 h-4" />,
                    condition: 'Structural overhaul recommended'
                });
            }

            setSuggestions(newSuggestions);
            
            const changedCount = newModifications.filter(m => m.type === 'citation_changed').length;
            if (changedCount > 0) {
                setActiveTab('audit');
                const sampleChange = newModifications.find(m => m.type === 'citation_changed');
                setToast({ 
                    msg: `Synced ${pairs.length} pair(s). ⚠️ ${changedCount} reference citation changed (${sampleChange?.originalRefText} ➔ ${sampleChange?.newRefText})`, 
                    type: "warn" 
                });
            } else if (newModifications.length > 0) {
                setActiveTab('audit');
                setToast({ msg: `Successfully synced ${pairs.length} paragraph pairs with ${newModifications.length} reference adjustments.`, type: "success" });
            } else {
                setActiveTab('report');
                setToast({ msg: `Successfully synced ${pairs.length} paragraph pairs.`, type: "success" });
            }
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
                        onClick={() => processSync()} 
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

            {/* Smart Suggestions Section */}
            {suggestions.length > 0 && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-4 bg-indigo-50/30 border-2 border-indigo-100 rounded-2xl border-dashed">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-indigo-600" />
                            </div>
                            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'View Synchronizer' } });
                                    }}
                                    className="flex items-center gap-4 p-4 bg-white border border-indigo-100 rounded-xl hover:border-indigo-400 hover:shadow-lg transition-all group text-left shadow-sm ring-1 ring-indigo-50/50"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.15em] mb-1 group-hover:text-indigo-700 transition-colors">{sug.toolName}</div>
                                        <div className="text-[9px] text-slate-500 font-medium leading-relaxed italic line-clamp-2">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-200 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Grid */}
            <div className={`grid gap-6 h-[calc(100vh-320px)] min-h-[600px] transition-all duration-300 ${activeTab === 'diff' || isExpandedView ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                
                {/* Input Section - Hidden in Diff Mode or Expanded Mode */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-indigo-100 transition-all ${activeTab === 'diff' || isExpandedView ? 'hidden' : 'flex'}`}>
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
                    {/* Persistent Change Notification Banner */}
                    {refModifications.length > 0 && (
                        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-2.5 text-white flex items-center justify-between shadow-sm animate-fadeIn">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white animate-pulse">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </span>
                                <div className="text-xs font-medium truncate">
                                    <span className="font-bold">
                                        {refModifications.filter(m => m.type === 'citation_changed').length > 0 
                                            ? `⚠️ ${refModifications.filter(m => m.type === 'citation_changed').length} Reference Citation Change Detected:` 
                                            : `⚡ ${refModifications.length} Reference Adjustment(s):`}
                                    </span>{' '}
                                    <span className="text-amber-100 font-mono text-[11px]">
                                        {refModifications.map(m => m.originalRefText ? `${m.originalRefText} ➔ ${m.newRefText}` : m.newRefText).join(', ')}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setActiveTab('audit')}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                                        activeTab === 'audit' 
                                            ? 'bg-white text-orange-700 shadow-sm' 
                                            : 'bg-white/20 hover:bg-white/30 text-white'
                                    }`}
                                >
                                    Review Audit Log
                                </button>
                                <button
                                    onClick={() => setActiveTab('diff')}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                                        activeTab === 'diff' 
                                            ? 'bg-white text-orange-700 shadow-sm' 
                                            : 'bg-white/20 hover:bg-white/30 text-white'
                                    }`}
                                >
                                    Diff
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
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
                        </div>

                        <div className="flex items-center gap-2">
                            {output && activeTab === 'raw' && (
                                <>
                                    {isStale && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter hidden sm:block">Input changed - Re-sync required</span>}
                                    <button 
                                        onClick={copyOutput} 
                                        className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 hover:bg-emerald-50 border-transparent hover:border-emerald-100'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                        {isStale ? 'Copy Stale XML' : 'Copy XML'}
                                    </button>
                                </>
                            )}
                            {activeTab !== 'diff' && (
                                <button
                                    onClick={() => setIsExpandedView(!isExpandedView)}
                                    className={`text-xs font-bold px-2.5 py-1.5 rounded border transition-all flex items-center gap-1.5 active:scale-95 ${
                                        isExpandedView 
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' 
                                            : 'text-slate-600 hover:bg-slate-100 border-slate-200'
                                    }`}
                                    title={isExpandedView ? 'Collapse to Split View' : 'Expand View to Full Width'}
                                >
                                    {isExpandedView ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                    <span className="hidden sm:inline">{isExpandedView ? 'Split View' : 'Expand View'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1 overflow-x-auto custom-scrollbar">
                         {['raw', 'diff', 'audit', 'report', 'mismatches', 'orphans'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`py-2 px-3 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab 
                                    ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'raw' && 'Raw XML'}
                                {tab === 'diff' && 'Diff View'}
                                {tab === 'audit' && (
                                    <span className="flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        Audit & Changes
                                        {refModifications.length > 0 && (
                                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                                refModifications.some(m => m.type === 'citation_changed') 
                                                    ? 'bg-amber-500 text-white animate-pulse' 
                                                    : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                {refModifications.length}
                                            </span>
                                        )}
                                    </span>
                                )}
                                {tab === 'report' && `Log (${logs.length})`}
                                {tab === 'mismatches' && `Mismatches (${mismatches.length})`}
                                {tab === 'orphans' && `Orphans (${orphans.length})`}
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

                         {activeTab === 'audit' && (
                            <div className="h-full bg-white flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-slate-100 bg-amber-50/40 flex justify-between items-center">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                                Reference Modifications & Auto-Tag Audit Trail
                                            </h4>
                                            <p className="text-[11px] text-slate-500 font-medium">
                                                Explicit change tracking for modified, auto-tagged, and restored cross-references.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => navigate('/citationLinker', { state: { transferredXml: output, sourceTool: 'View Synchronizer' } })}
                                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                        >
                                            <LinkIcon className="w-3.5 h-3.5" />
                                            Citation Linker Pro
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-grow overflow-auto custom-scrollbar p-4 space-y-4">
                                    {refModifications.length > 0 ? (
                                        <div className="grid gap-3.5">
                                            {refModifications.map((mod) => (
                                                <div 
                                                    key={mod.id} 
                                                    className={`border rounded-xl p-4 transition-all shadow-sm ${
                                                        mod.type === 'citation_changed' 
                                                            ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-100' 
                                                            : mod.type === 'auto_tagged'
                                                            ? 'border-indigo-200 bg-indigo-50/20'
                                                            : 'border-emerald-200 bg-emerald-50/20'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3 mb-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                                mod.type === 'citation_changed' 
                                                                    ? 'bg-amber-500 text-white' 
                                                                    : mod.type === 'auto_tagged'
                                                                    ? 'bg-indigo-600 text-white'
                                                                    : 'bg-emerald-600 text-white'
                                                            }`}>
                                                                {mod.type === 'citation_changed' && '⚠️ Citation Changed'}
                                                                {mod.type === 'auto_tagged' && '⚡ Auto-Tagged Citation'}
                                                                {mod.type === 'ref_restored' && '🔗 Reference Restored'}
                                                            </span>
                                                            <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                                                                ID: {mod.paraId}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] font-mono text-slate-400">
                                                            {mod.originalRefId ? `Target refid="${mod.originalRefId}"` : ''}
                                                        </span>
                                                    </div>

                                                    <p className="text-xs text-slate-700 font-medium mb-3">
                                                        {mod.message}
                                                    </p>

                                                    {/* Comparison view */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                                                        {mod.targetSnippet && (
                                                            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-100">
                                                                <div className="text-[10px] font-bold text-rose-700 uppercase mb-1">Target View (Original)</div>
                                                                <div className="text-rose-900 break-all">{mod.targetSnippet}</div>
                                                            </div>
                                                        )}
                                                        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                                                            <div className="text-[10px] font-bold text-emerald-700 uppercase mb-1">Synchronized Output</div>
                                                            <div className="text-emerald-900 break-all">{mod.resultSnippet}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-16">
                                            <CheckCircle size={44} strokeWidth={1.5} className="mb-3 text-emerald-500" />
                                            <p className="text-sm font-semibold text-slate-700">No Reference Discrepancies</p>
                                            <p className="text-xs mt-1 text-slate-500">All cross-references and links matched cleanly during synchronization.</p>
                                        </div>
                                    )}
                                </div>
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
                                                        {diffRows.map((row, rIdx) => {
                                                            let lClass = row.leftNum !== null && row.type === 'delete' ? 'bg-rose-50/50' : (row.type === 'replace' ? 'bg-rose-50/30' : '');
                                                            let rClass = row.rightNum !== null && row.type === 'insert' ? 'bg-emerald-50/50' : (row.type === 'replace' ? 'bg-emerald-50/30' : '');
                                                            if (row.type === 'equal') { lClass = ''; rClass = ''; }

                                                            return (
                                                                <tr 
                                                                    key={`sync-diff-${row.id || ''}-${rIdx}`} 
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
                            <div className="h-full bg-white flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="checkbox" 
                                                checked={mismatches.length > 0 && selectedMismatches.size === mismatches.length}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedMismatches(new Set(mismatches.map(m => m.index)));
                                                    else setSelectedMismatches(new Set());
                                                }}
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-bold text-slate-700">Select All {mismatches.length > 0 ? `(${mismatches.length})` : ''}</span>
                                        </div>
                                        {selectedMismatches.size > 0 && (
                                            <span className="text-[10px] font-black text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-full border border-indigo-100">
                                                {selectedMismatches.size} Selected
                                            </span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => processSync(selectedMismatches)}
                                        disabled={selectedMismatches.size === 0 || isLoading}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                        Sync Selected
                                    </button>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar p-4">
                                    {mismatches.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                                                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                                <div>
                                                    <h4 className="text-sm font-bold text-amber-900">Unsynchronized Pairs Detected</h4>
                                                    <p className="text-xs text-amber-700 mt-1">
                                                        The following paragraphs have differing text content between their Compact and Extended views. Select which ones to synchronize.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid gap-4 pb-8">
                                                {mismatches.map((m, i) => (
                                                    <div 
                                                        key={i} 
                                                        onClick={() => toggleMismatchSelection(m.index)}
                                                        className={`group border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer ${selectedMismatches.has(m.index) ? 'border-indigo-300 ring-2 ring-indigo-50' : 'border-slate-200'}`}
                                                    >
                                                        <div className={`px-4 py-2 border-b flex justify-between items-center transition-colors ${selectedMismatches.has(m.index) ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 group-hover:bg-slate-100'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={selectedMismatches.has(m.index)}
                                                                    onChange={() => {}} // Handled by div click
                                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                                />
                                                                <span className={`text-xs font-bold font-mono ${selectedMismatches.has(m.index) ? 'text-indigo-700' : 'text-slate-700'}`}>ID: {m.paraId}</span>
                                                            </div>
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
                            </div>
                         )}

                         {activeTab === 'orphans' && (
                            <div className="h-full bg-white flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-rose-50/20">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                        <h3 className="text-sm font-bold text-rose-900">Unpaired Views Detected</h3>
                                    </div>
                                    {orphans.length > 0 && (
                                        <button 
                                            onClick={fixOrphans}
                                            disabled={isLoading}
                                            className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm transition-all animate-pulse hover:animate-none"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                            Generate All Missing Partners
                                        </button>
                                    )}
                                    {orphans.length > 0 && (
                                        <span className="text-[10px] font-black text-rose-600 px-2 py-0.5 bg-rose-50 rounded-full border border-rose-100">
                                            {orphans.length} Critical Issues
                                        </span>
                                    )}
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar p-4">
                                    {orphans.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                                                <p className="text-xs text-rose-700">
                                                    The following paragraphs are missing their counterparts. Every <b>compact-standard</b> view must be paired with an <b>extended</b> view.
                                                </p>
                                            </div>
                                            <div className="grid gap-4 pb-8">
                                                {orphans.map((orphan, i) => (
                                                    <div key={i} className="border border-rose-100 rounded-xl overflow-hidden bg-white shadow-sm">
                                                        <div className="px-4 py-2 border-b bg-rose-50/30 flex justify-between items-center">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${orphan.type === 'compact' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                    {orphan.type === 'compact' ? 'Compact Missing Extended' : 'Extended Missing Compact'}
                                                                </span>
                                                                <span className="text-xs font-bold font-mono text-slate-700">Para ID: {orphan.id}</span>
                                                            </div>
                                                        </div>
                                                        <div className="p-4 text-xs text-slate-600 italic line-clamp-3">
                                                            "{orphan.text}"
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                            <CheckCircle size={48} strokeWidth={1} className="mb-3 text-emerald-400" />
                                            <p className="text-sm font-medium uppercase tracking-widest">No orphans found</p>
                                            <p className="text-xs mt-2">All paragraph views are properly paired.</p>
                                        </div>
                                    )}
                                </div>
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
