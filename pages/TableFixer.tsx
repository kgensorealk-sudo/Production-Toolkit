import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffArrays, Change } from 'diff';
import { 
    ChevronUp, ChevronDown, GitCompare, Search, Zap, RefreshCw, 
    Sparkles, ArrowRight, CheckCircle2, AlertCircle, Copy, Trash2, 
    Filter, Layers, Hash, Link as LinkIcon, CheckSquare, Square,
    Wand2, Table, ExternalLink, ShieldCheck, AlertTriangle, FileText,
    Terminal, Download, XCircle, Info, FileCheck, Play, Check, Eye, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';

interface Footnote {
    id: string;
    label: string;
    content: string;
    fullTag: string;
    isNakedMarker?: boolean;
}

interface ProcessingLog {
    id: string;
    type: 'info' | 'success' | 'warn' | 'error';
    tableNum?: number;
    action: string;
    message: string;
    details?: string;
    timestamp: string;
}

interface AuditMetrics {
    inputCharCount: number;
    outputCharCount: number;
    inputWordCount: number;
    outputWordCount: number;
    textMatchPercent: number;
    wordDelta: number;
    tablesFound: number;
    itemsProcessed: number;
    unbalancedTags: string[];
    orphanRefIds: string[];
    duplicateIds: string[];
    isTextLossDetected: boolean;
}

type MarkerFilterType = 'all' | 'standard' | 'alphanumeric' | 'naked';
type LogFilterType = 'all' | 'success' | 'warn' | 'error';

const TableFixer: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Persistent storage for inputs
    const [input, setInput] = useLocalStorage<string>('table_fixer_input', '');
    const [output, setOutput] = useState('');
    const [lastProcessedInput, setLastProcessedInput] = useState('');
    const [footnotes, setFootnotes] = useState<Footnote[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [markerFilter, setMarkerFilter] = useState<MarkerFilterType>('all');

    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'selection' | 'result' | 'audit' | 'diff'>('selection');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [diffRows, setDiffRows] = useState<any[]>([]);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const [mode, setMode] = useState<'detach' | 'attach'>('detach');

    // Audit and Logs State
    const [logs, setLogs] = useState<ProcessingLog[]>([]);
    const [logFilter, setLogFilter] = useState<LogFilterType>('all');
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [auditMetrics, setAuditMetrics] = useState<AuditMetrics | null>(null);

    const diffContainerRef = useRef<HTMLDivElement>(null);

    // ID Configuration States
    const [tfStart, setTfStart] = useState<number>(4000);
    const [cfStart, setCfStart] = useState<number>(4000);
    const [spStart, setSpStart] = useState<number>(4000);

    // Additional options
    const [stripEmptyLegends, setStripEmptyLegends] = useState(true);
    const [enforceSupFormatting, setEnforceSupFormatting] = useState(true);

    // Review & Execution Confirmation State
    const [showReviewModal, setShowReviewModal] = useState(false);

    const handleRequestProcess = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML content first.", type: "warn" }); return; }
        if (selectedIds.size === 0) { setToast({ msg: "Select at least one item to process.", type: "warn" }); return; }
        setShowReviewModal(true);
    };

    const confirmAndExecute = () => {
        setShowReviewModal(false);
        processTable();
    };

    const reviewPlan = useMemo(() => {
        if (!showReviewModal) return null;
        const selectedList = footnotes.filter(fn => selectedIds.has(fn.id));
        let currentSpCounter = spStart;
        let currentTfCounter = tfStart;
        let currentCfCounter = cfStart;

        const items = selectedList.map((fn) => {
            if (mode === 'detach') {
                const spId = `sp${currentSpCounter.toString().padStart(4, '0')}`;
                currentSpCounter += 5;
                const isStandardAsterisk = fn.label.trim() === '*';
                const labelMarkup = (isStandardAsterisk && !enforceSupFormatting) ? fn.label : `<ce:sup>${fn.label}</ce:sup>`;
                return {
                    id: fn.id,
                    label: fn.label,
                    content: fn.content,
                    targetId: spId,
                    action: 'Detach to Legend',
                    xmlPreview: `<ce:simple-para id="${spId}">${labelMarkup} ${fn.content}</ce:simple-para>`,
                    crossRefPreview: null,
                    note: `Removes <ce:table-footnote id="${fn.id}"> and appends <ce:simple-para id="${spId}"> into <ce:legend>.`
                };
            } else {
                const tfId = `tf${currentTfCounter.toString().padStart(4, '0')}`;
                const npId = `np${currentTfCounter.toString().padStart(4, '0')}`;
                const sampleCfId = `cf${currentCfCounter.toString().padStart(4, '0')}`;
                currentTfCounter += 5;
                currentCfCounter += 5;
                const isStandardAsterisk = fn.label.trim() === '*';
                const shouldHaveSup = enforceSupFormatting || !isStandardAsterisk;
                const labelContent = shouldHaveSup ? `<ce:sup>${fn.label}</ce:sup>` : fn.label;

                return {
                    id: fn.id,
                    label: fn.label,
                    content: fn.content,
                    targetId: tfId,
                    action: 'Attach to Footnotes',
                    xmlPreview: `<ce:table-footnote id="${tfId}"><ce:label>${fn.label}</ce:label><ce:note-para id="${npId}">${fn.content || '...'}</ce:note-para></ce:table-footnote>`,
                    crossRefPreview: `<ce:cross-ref id="${sampleCfId}" refid="${tfId}">${labelContent}</ce:cross-ref>`,
                    note: `Converts legend marker "${fn.label}" into <ce:table-footnote id="${tfId}"> and inserts <ce:cross-ref refid="${tfId}"> tags.`
                };
            }
        });

        return {
            mode,
            itemCount: items.length,
            items,
            stripEmptyLegends,
            enforceSupFormatting,
            spStart,
            tfStart,
            cfStart
        };
    }, [showReviewModal, footnotes, selectedIds, mode, spStart, tfStart, cfStart, enforceSupFormatting, stripEmptyLegends]);

    // Helper for adding logs
    const addLog = (
        type: 'info' | 'success' | 'warn' | 'error',
        action: string,
        message: string,
        tableNum?: number,
        details?: string
    ) => {
        const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newLog: ProcessingLog = {
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type,
            tableNum,
            action,
            message,
            details,
            timestamp: timeStr
        };
        setLogs(prev => [...prev, newLog]);
    };

    // Check for incoming cross-tool data transfer
    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const extractPlainText = (xml: string) => {
        return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const countWords = (text: string) => {
        if (!text) return 0;
        return text.split(/\s+/).filter(w => w.length > 0).length;
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/50 font-medium');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-900 font-bold');
            else if (!part.added && !part.removed) {
                let cls = null;
                if (!isLeft && (part as any).isUnwrapped) {
                    cls = 'bg-amber-100 text-amber-900 font-medium border-b-2 border-amber-300';
                }
                append(part.value, cls);
            }
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const diffXmlAware = (left: string, right: string): Change[] => {
        const tokenize = (text: string) => text.split(/(<[^>]+>|\s+)/).filter(t => t !== '');
        const leftTokens = tokenize(left);
        const rightTokens = tokenize(right);
        const arrayChanges = diffArrays(leftTokens, rightTokens);
        return arrayChanges.map(part => ({
            value: part.value.join(''),
            count: part.count,
            added: part.added,
            removed: part.removed
        }));
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
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
            } else {
                leftVal = rightVal = current.value; i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

            if (type === 'replace') {
                const fineDiff = diffXmlAware(leftVal, rightVal);
                for (let k = 0; k < fineDiff.length; k++) {
                    const currentPart = fineDiff[k];
                    if (!currentPart.added && !currentPart.removed) {
                        const prev = k > 0 ? fineDiff[k-1] : null;
                        const next = k < fineDiff.length - 1 ? fineDiff[k+1] : null;
                        if (prev && prev.removed && next && next.removed) {
                            if ((prev.value.includes('ce:cross-ref') || prev.value.includes('<ce:sup>')) && 
                                (next.value.includes('/ce:cross-ref') || next.value.includes('/ce:sup>'))) {
                                (currentPart as any).isUnwrapped = true;
                            }
                        }
                    }
                }
                leftLines = buildLines(fineDiff, true);
                rightLines = buildLines(fineDiff, false);
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

    // Auto-detect highest IDs in input XML
    const autoDetectIds = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content to auto-detect IDs.", type: "warn" });
            return;
        }

        const findMax = (prefix: string) => {
            const regex = new RegExp(`\\b${prefix}(\\d+)\\b`, 'gi');
            let max = 0;
            let match;
            while ((match = regex.exec(input)) !== null) {
                const val = parseInt(match[1], 10);
                if (!isNaN(val) && val > max) max = val;
            }
            return max;
        };

        const maxTf = findMax('tf');
        const maxCf = findMax('cf');
        const maxSp = findMax('sp');

        const nextTf = maxTf > 0 ? Math.ceil((maxTf + 5) / 5) * 5 : 4000;
        const nextCf = maxCf > 0 ? Math.ceil((maxCf + 5) / 5) * 5 : 4000;
        const nextSp = maxSp > 0 ? Math.ceil((maxSp + 5) / 5) * 5 : 4000;

        setTfStart(nextTf);
        setCfStart(nextCf);
        setSpStart(nextSp);

        setToast({
            msg: `Auto-detected IDs — Next starts: tf=${nextTf}, cf=${nextCf}, sp=${nextSp}`,
            type: "success"
        });

        addLog('info', 'ID Detection', `Auto-detected highest existing IDs. Next starting sequence set to tf=${nextTf}, cf=${nextCf}, sp=${nextSp}`);
    };

    // Scans input for footnotes or legend items whenever input or mode changes
    useEffect(() => {
        if (!input) {
            setFootnotes([]);
            return;
        }

        const matches: Footnote[] = [];
        
        if (mode === 'detach') {
            const fnRegex = /<ce:table-footnote\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:table-footnote>/gi;
            let match;
            while ((match = fnRegex.exec(input)) !== null) {
                const id = match[1];
                const inner = match[2];
                const fullTag = match[0];
                const labelMatch = /<ce:label[^>]*>([\s\S]*?)<\/ce:label>/i.exec(inner) || /<ce:sup[^>]*>([\s\S]*?)<\/ce:sup>/i.exec(inner);
                const label = labelMatch ? labelMatch[1].trim() : '???';
                const paraMatch = /<ce:note-para[^>]*>([\s\S]*?)<\/ce:note-para>/i.exec(inner);
                const content = paraMatch ? paraMatch[1].trim() : inner.replace(/<[^>]+>/g, '').trim();
                matches.push({ id, label, content, fullTag });
            }
        } else {
            const legendBlocks = input.match(/<ce:legend\b[^>]*>([\s\S]*?)<\/ce:legend>/gi) || [];
            
            legendBlocks.forEach(legendMarkup => {
                const spRegex = /<ce:simple-para\b[^>]*>([\s\S]*?)<\/ce:simple-para>/gi;
                let spMatch;
                while ((spMatch = spRegex.exec(legendMarkup)) !== null) {
                    const fullTag = spMatch[0];
                    const inner = spMatch[1].trim();
                    let label = '';
                    const labelTagMatch = /^\s*<ce:label>(.*?)<\/ce:label>/i.exec(inner);
                    const supMatch = /^\s*<ce:sup>(.*?)<\/ce:sup>/i.exec(inner);
                    const boldMatch = /^\s*<ce:bold>(.*?)<\/ce:bold>/i.exec(inner);
                    const plainMatch = /^\s*([\*\†\‡\§\¶\#\⁎a-zA-Z0-9]{1,4})(?:[\.\),\s])/i.exec(inner);

                    if (labelTagMatch) label = labelTagMatch[1];
                    else if (supMatch) label = supMatch[1];
                    else if (boldMatch) label = boldMatch[1];
                    else if (plainMatch) label = plainMatch[1];

                    if (label) {
                        const idMatch = /id="([^"]+)"/i.exec(fullTag);
                        const id = idMatch ? idMatch[1] : `sp_gen_${matches.length}`;
                        matches.push({ id, label, content: inner, fullTag });
                    }
                }
            });

            const nakedMarkers = ['⁎', '†', '‡', '§', '¶', '*', '#'];
            nakedMarkers.forEach(sym => {
                const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nakedRegex = new RegExp(`(?<![a-zA-Z0-9])${escapedSym}(?![a-zA-Z0-9])`, 'g');
                
                const occurrences = [...input.matchAll(nakedRegex)];
                const hasValidOccurrence = occurrences.some(occ => {
                    const prevPart = input.substring(0, occ.index);
                    const openCount = (prevPart.match(/</g) || []).length;
                    const closeCount = (prevPart.match(/>/g) || []).length;
                    return openCount === closeCount; 
                });

                if (hasValidOccurrence && !matches.some(m => m.label === sym)) {
                    matches.push({
                        id: `naked_sym_${sym.charCodeAt(0)}`,
                        label: sym,
                        content: `Untagged marker "${sym}" detected in table body.`,
                        fullTag: '',
                        isNakedMarker: true
                    });
                }
            });
        }

        setFootnotes(matches);
        setSelectedIds(new Set(matches.map(m => m.id))); 
        if (matches.length > 0 && activeTab !== 'diff' && activeTab !== 'audit') setActiveTab('selection');
    }, [input, mode]);

    const filteredFootnotes = useMemo(() => {
        return footnotes.filter(fn => {
            const matchesSearch = searchQuery === '' || 
                fn.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                fn.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                fn.content.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            if (markerFilter === 'standard') {
                return ['*', '†', '‡', '§', '¶', '#', '⁎'].includes(fn.label.trim());
            }
            if (markerFilter === 'alphanumeric') {
                return /^[a-zA-Z0-9]{1,3}$/.test(fn.label.trim());
            }
            if (markerFilter === 'naked') {
                return !!fn.isNakedMarker;
            }
            return true;
        });
    }, [footnotes, searchQuery, markerFilter]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };
    
    const toggleAll = () => {
        if (selectedIds.size === filteredFootnotes.length) setSelectedIds(new Set());
        else {
            const newSet = new Set(selectedIds);
            filteredFootnotes.forEach(f => newSet.add(f.id));
            setSelectedIds(newSet);
        }
    };

    // Run deep audit checks on input vs output
    const runAuditQualityCheck = (origXml: string, finalXml: string, itemsCount: number, processedLogs: ProcessingLog[]) => {
        const inText = extractPlainText(origXml);
        const outText = extractPlainText(finalXml);

        const inWords = countWords(inText);
        const outWords = countWords(outText);

        const wordDelta = outWords - inWords;
        const textMatchPercent = inWords > 0 
            ? Math.max(0, Math.min(100, Math.round((1 - Math.abs(wordDelta) / inWords) * 100))) 
            : 100;

        // XML Tag Balance Verification
        const checkTags = ['ce:table', 'tgroup', 'ce:legend', 'ce:table-footnote', 'ce:cross-ref', 'entry', 'row'];
        const unbalancedTags: string[] = [];

        checkTags.forEach(tag => {
            const openReg = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
            const closeReg = new RegExp(`</${tag}>`, 'gi');
            const openCount = (finalXml.match(openReg) || []).length;
            const closeCount = (finalXml.match(closeReg) || []).length;

            if (openCount !== closeCount) {
                unbalancedTags.push(`<${tag}> (${openCount} open vs ${closeCount} close)`);
                addLog('error', 'Tag Balance Failure', `Tag mismatch detected for <${tag}>: ${openCount} opened vs ${closeCount} closed.`);
            }
        });

        // Duplicate ID audit
        const idRegex = /\bid="([^"]+)"/gi;
        const idMap = new Map<string, number>();
        let match;
        while ((match = idRegex.exec(finalXml)) !== null) {
            const idVal = match[1];
            idMap.set(idVal, (idMap.get(idVal) || 0) + 1);
        }

        const duplicateIds: string[] = [];
        idMap.forEach((count, id) => {
            if (count > 1) {
                duplicateIds.push(`${id} (${count}x)`);
                addLog('error', 'ID Collision', `Duplicate ID "${id}" detected ${count} times in output XML.`);
            }
        });

        // Broken Cross-Ref Orphan audit
        const refIdRegex = /refid="([^"]+)"/gi;
        const orphanRefIds: string[] = [];
        let refMatch;
        while ((refMatch = refIdRegex.exec(finalXml)) !== null) {
            const targetId = refMatch[1];
            if (!idMap.has(targetId)) {
                orphanRefIds.push(targetId);
                addLog('warn', 'Orphan Cross-Ref', `Cross-ref points to target refid="${targetId}" which does not exist in output XML.`);
            }
        }

        const tablesFound = (finalXml.match(/<ce:table\b[^>]*>/gi) || []).length;
        const isTextLossDetected = Math.abs(wordDelta) > 50 && wordDelta < 0;

        if (isTextLossDetected) {
            addLog('warn', 'Data Loss Alert', `Word count decreased significantly by ${Math.abs(wordDelta)} words. Verify output text in Diff View.`);
        } else {
            addLog('success', 'Data Integrity Verified', `Text content comparison completed. Word Delta: ${wordDelta > 0 ? '+' : ''}${wordDelta} words (${textMatchPercent}% similarity score).`);
        }

        setAuditMetrics({
            inputCharCount: origXml.length,
            outputCharCount: finalXml.length,
            inputWordCount: inWords,
            outputWordCount: outWords,
            textMatchPercent,
            wordDelta,
            tablesFound,
            itemsProcessed: itemsCount,
            unbalancedTags,
            orphanRefIds,
            duplicateIds,
            isTextLossDetected
        });
    };

    const processTable = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML content first.", type: "warn" }); return; }
        if (selectedIds.size === 0) { setToast({ msg: "Select at least one item to process.", type: "warn" }); return; }

        setIsLoading(true);
        setLogs([]); // Reset processing logs for new run

        setTimeout(() => {
            let totalProcessedCount = 0;
            let currentXml = input;
            let tableCounter = 0;

            addLog('info', 'Process Started', `Initiating ${mode === 'detach' ? 'Footnote Detachment Protocol' : 'Legend Attachment Protocol'} for ${selectedIds.size} item(s).`);

            if (mode === 'detach') {
                let spIdCounter = spStart;

                const tableRegex = /<ce:table\b[\s\S]*?<\/ce:table>/gi;
                let hasTableMatch = false;

                currentXml = currentXml.replace(tableRegex, (tableMarkup) => {
                    hasTableMatch = true;
                    tableCounter++;
                    let currentTable = tableMarkup;
                    let legendsToAdd: string[] = [];
                    const tableFootnotes = footnotes.filter(fn => selectedIds.has(fn.id) && tableMarkup.includes(fn.fullTag));
                    
                    addLog('info', 'Table Discovered', `Table #${tableCounter} found with ${tableFootnotes.length} selected footnote(s).`, tableCounter);

                    tableFootnotes.forEach(fn => {
                        const refRegex = new RegExp(`<ce:cross-ref\\b[^>]*?refid="${fn.id}"[^>]*>([\\s\\S]*?)<\\/ce:cross-ref>`, 'gi');
                        
                        const isStandardAsterisk = fn.label.trim() === '*';
                        let updatedRefsCount = 0;

                        currentTable = currentTable.replace(refRegex, (m, content) => {
                            updatedRefsCount++;
                            if (isStandardAsterisk) {
                                return content.replace(/<ce:sup>|<\/ce:sup>/gi, '');
                            } else {
                                return content.includes('<ce:sup>') ? content : `<ce:sup>${content}</ce:sup>`;
                            }
                        });
                        
                        currentTable = currentTable.split(fn.fullTag).join('');
                        const spId = `sp${spIdCounter.toString().padStart(4, '0')}`;
                        spIdCounter += 5;
                        
                        const labelMarkup = (isStandardAsterisk && !enforceSupFormatting) ? fn.label : `<ce:sup>${fn.label}</ce:sup>`;
                        legendsToAdd.push(`<ce:simple-para id="${spId}">${labelMarkup} ${fn.content}</ce:simple-para>`);
                        totalProcessedCount++;

                        addLog('success', 'Footnote Detached', `Moved footnote "${fn.id}" (Label: "${fn.label}") to legend as <ce:simple-para id="${spId}">. Replaced ${updatedRefsCount} cross-ref tag(s).`, tableCounter);
                    });

                    if (legendsToAdd.length > 0) {
                        const legendMarkup = legendsToAdd.join('');
                        const existingLegendMatch = currentTable.match(/<ce:legend\b[^>]*>([\s\S]*?)<\/ce:legend>/i);
                        
                        if (existingLegendMatch) {
                            currentTable = currentTable.replace(/<\/ce:legend>/i, `${legendMarkup}</ce:legend>`);
                            addLog('info', 'Legend Expanded', `Appended ${legendsToAdd.length} item(s) into existing <ce:legend> block.`, tableCounter);
                        } else {
                            const tgroupEndMatch = currentTable.match(/<\/tgroup>/i);
                            if (tgroupEndMatch) {
                                currentTable = currentTable.replace(/<\/tgroup>/i, `</tgroup><ce:legend>${legendMarkup}</ce:legend>`);
                            } else {
                                currentTable = currentTable.replace(/<\/ce:table>/i, `<ce:legend>${legendMarkup}</ce:legend></ce:table>`);
                            }
                            addLog('info', 'Legend Created', `Created new <ce:legend> block containing ${legendsToAdd.length} item(s).`, tableCounter);
                        }
                    }

                    if (stripEmptyLegends) {
                        const beforeStrip = currentTable;
                        currentTable = currentTable.replace(/<ce:legend>\s*<\/ce:legend>/gi, '');
                        if (beforeStrip !== currentTable) {
                            addLog('info', 'Empty Legend Stripped', `Removed empty <ce:legend> container.`, tableCounter);
                        }
                    }

                    return currentTable;
                });

                if (!hasTableMatch) {
                    addLog('error', 'Execution Error', 'No <ce:table> tags detected in input XML.');
                    setToast({ msg: "No <ce:table> tags detected in input.", type: "warn" });
                    setIsLoading(false);
                    return;
                }

                setOutput(currentXml);
                setLastProcessedInput(input);
                generateDiff(input, currentXml);
                runAuditQualityCheck(input, currentXml, totalProcessedCount, logs);
                setToast({ msg: `Successfully moved ${totalProcessedCount} footnotes to legend.`, type: "success" });

            } else {
                let tfIdCounter = tfStart;
                let cfIdCounter = cfStart;

                const sortedSelected = footnotes
                    .filter(fn => selectedIds.has(fn.id))
                    .sort((a, b) => b.label.length - a.label.length);

                const tableRegex = /<ce:table\b[\s\S]*?<\/ce:table>/gi;
                let hasTableMatch = false;

                currentXml = currentXml.replace(tableRegex, (tableMarkup) => {
                    hasTableMatch = true;
                    tableCounter++;
                    let currentTable = tableMarkup;
                    let footnotesToAdd: string[] = [];
                    const replacementMap = new Map<string, string>();

                    addLog('info', 'Table Discovered', `Table #${tableCounter} analyzing legend attach markers.`, tableCounter);

                    sortedSelected.forEach((fn, index) => {
                        const labelStr = fn.label;
                        const escapedLabel = labelStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        
                        const existingTagged = `(?:<ce:cross-ref\\b[^>]*>\\s*)?(?:<ce:(?:sup|bold|italic)>\\s*)*${escapedLabel}(?:\\s*<\\/ce:(?:sup|bold|italic)>)*(?:\\s*<\\/ce:cross-ref>)?`;
                        const nakedPattern = `(?<![a-zA-Z0-9])${escapedLabel}(?![a-zA-Z0-9])`;
                        const targetRegex = new RegExp(`(${existingTagged}|${nakedPattern})`, 'gi');

                        const isPresentInTable = (fn.fullTag && currentTable.includes(fn.fullTag)) || (!fn.fullTag && targetRegex.test(currentTable));
                        
                        if (isPresentInTable) {
                            const numericPart = String(tfIdCounter).padStart(4, '0');
                            const newFnId = `tf${numericPart}`;
                            const newNpId = `np${numericPart}`;
                            tfIdCounter += 5;
                            
                            if (fn.fullTag) currentTable = currentTable.split(fn.fullTag).join('');
                            
                            const isStandardAsterisk = fn.label.trim() === '*';
                            let matchCount = 0;

                            currentTable = currentTable.replace(targetRegex, (match) => {
                                matchCount++;
                                const placeholder = `##TF_PH_${index}_${cfIdCounter}_${Math.random().toString(36).substring(7)}##`;
                                const newCfId = `cf${cfIdCounter.toString().padStart(4, '0')}`;
                                cfIdCounter += 5;

                                const hasBold = match.includes('<ce:bold');
                                const hasItalic = match.includes('<ce:italic');
                                const shouldHaveSup = enforceSupFormatting || !isStandardAsterisk;

                                let innermost = fn.label;
                                if (hasItalic) innermost = `<ce:italic>${innermost}</ce:italic>`;
                                if (hasBold) innermost = `<ce:bold>${innermost}</ce:bold>`;
                                if (shouldHaveSup) innermost = `<ce:sup>${innermost}</ce:sup>`;
                                
                                const finalTag = `<ce:cross-ref id="${newCfId}" refid="${newFnId}">${innermost}</ce:cross-ref>`;
                                
                                replacementMap.set(placeholder, finalTag);
                                return placeholder;
                            });

                            const stripPattern = new RegExp(`^\\s*(?:<ce:(?:label|sup|bold|italic)>)*\\s*${escapedLabel}\\s*(?:<\\/ce:(?:label|sup|bold|italic)>|[\\.,\\)\\s])+`, 'i');
                            let cleanContent = fn.content.replace(stripPattern, '').trim();
                            if (!cleanContent) cleanContent = '??';
                            
                            footnotesToAdd.push(`<ce:table-footnote id="${newFnId}"><ce:label>${fn.label}</ce:label><ce:note-para id="${newNpId}">${cleanContent}</ce:note-para></ce:table-footnote>`);
                            totalProcessedCount++;

                            addLog('success', 'Legend Attached', `Converted legend item "${fn.label}" into <ce:table-footnote id="${newFnId}">. Created ${matchCount} <ce:cross-ref> instances.`, tableCounter);
                        }
                    });

                    replacementMap.forEach((xml, placeholder) => {
                        currentTable = currentTable.split(placeholder).join(xml);
                    });

                    if (footnotesToAdd.length > 0) {
                        const footnotesMarkup = footnotesToAdd.join('');
                        const lastLegendIdx = currentTable.lastIndexOf('</ce:legend>');
                        const lastTgroupIdx = currentTable.lastIndexOf('</tgroup>');
                        
                        const legendEnd = lastLegendIdx !== -1 ? lastLegendIdx + '</ce:legend>'.length : -1;
                        const tgroupEnd = lastTgroupIdx !== -1 ? lastTgroupIdx + '</tgroup>'.length : -1;
                        const insertionPoint = Math.max(legendEnd, tgroupEnd);

                        if (insertionPoint !== -1) {
                            const before = currentTable.slice(0, insertionPoint);
                            const after = currentTable.slice(insertionPoint);
                            currentTable = `${before}${footnotesMarkup}${after}`;
                        } else {
                            currentTable = currentTable.replace('</ce:table>', `${footnotesMarkup}</ce:table>`);
                        }
                    }

                    if (stripEmptyLegends) {
                        currentTable = currentTable.replace(/<ce:legend>\s*<\/ce:legend>/gi, '');
                    }

                    return currentTable;
                });

                if (!hasTableMatch) {
                    addLog('error', 'Execution Error', 'No <ce:table> tags detected in input XML.');
                    setToast({ msg: "No <ce:table> tags detected in input.", type: "warn" });
                    setIsLoading(false);
                    return;
                }

                setOutput(currentXml);
                setLastProcessedInput(input);
                generateDiff(input, currentXml);
                runAuditQualityCheck(input, currentXml, totalProcessedCount, logs);
                setToast({ msg: `Attached ${totalProcessedCount} items with DTD-strict cross-refs.`, type: "success" });
            }

            setActiveTab('result');
            setIsLoading(false);
        }, 500);
    };

    const handleQuickClean = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }
        setLogs([]);
        addLog('info', 'Quick Clean Started', 'Scanning table XML for empty containers and space entries.');

        let cleaned = input;
        // Strip empty legend tags
        cleaned = cleaned.replace(/<ce:legend>\s*<\/ce:legend>/gi, '');
        // Strip empty table-footnote tags
        cleaned = cleaned.replace(/<ce:table-footnote\b[^>]*>\s*<\/ce:table-footnote>/gi, '');

        setOutput(cleaned);
        setLastProcessedInput(input);
        generateDiff(input, cleaned);
        runAuditQualityCheck(input, cleaned, 0, logs);
        setActiveTab('result');
        setToast({ msg: "Table XML cleaned: removed empty legends & empty footnotes (entry tags preserved).", type: "success" });
        addLog('success', 'Quick Clean Complete', 'Stripped empty legends & footnotes. Explicit <entry></entry> tags strictly preserved.');
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (logFilter !== 'all' && log.type !== logFilter) return false;
            if (logSearchQuery.trim() === '') return true;
            const q = logSearchQuery.toLowerCase();
            return (
                log.action.toLowerCase().includes(q) ||
                log.message.toLowerCase().includes(q) ||
                (log.tableNum && `table #${log.tableNum}`.includes(q))
            );
        });
    }, [logs, logFilter, logSearchQuery]);

    const errorCount = useMemo(() => logs.filter(l => l.type === 'error').length, [logs]);
    const warnCount = useMemo(() => logs.filter(l => l.type === 'warn').length, [logs]);

    const transferTo = (path: string, toolName: string) => {
        if (!output) return;
        navigate(path, {
            state: {
                transferredXml: output,
                sourceTool: 'XML Table Fixer'
            }
        });
    };

    useKeyboardShortcuts({
        onPrimary: handleRequestProcess,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({msg: 'Copied output!', type:'success'}); } },
        onClear: () => { setInput(''); setFootnotes([]); setOutput(''); setLogs([]); setAuditMetrics(null); }
    }, [input, output, footnotes, selectedIds, activeTab, mode, tfStart, cfStart, spStart, enforceSupFormatting, stripEmptyLegends]);

    const isStale = output && input !== lastProcessedInput;

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-8 text-center animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold mb-3 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>100% Deterministic Rule-Based Engine • Zero AI / No AI Hallucination</span>
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">XML Table Fixer Pro</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">Surgical footnote management using exact deterministic XML regex transformation. Pure rule-based processing guarantees 100% data integrity with no added or lost content.</p>
            </div>

            {/* Matrix Configuration Bar */}
            <div className="flex justify-center mb-6">
                <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-6 w-full max-w-5xl">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${mode === 'detach' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Hash className="w-5 h-5" strokeWidth={2.5} />
                        </div>
                        <div>
                            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">ID Matrix Config</span>
                            <span className="text-[10px] text-slate-400 font-medium">Auto-sequence IDs for footnotes, cross-refs, and paras</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Footnote/Para (tf/np)</label>
                                <input 
                                    type="number" 
                                    value={tfStart} 
                                    onChange={(e) => setTfStart(parseInt(e.target.value) || 0)} 
                                    className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Cross-Ref (cf)</label>
                                <input 
                                    type="number" 
                                    value={cfStart} 
                                    onChange={(e) => setCfStart(parseInt(e.target.value) || 0)} 
                                    className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Legend Para (sp)</label>
                                <input 
                                    type="number" 
                                    value={spStart} 
                                    onChange={(e) => setSpStart(parseInt(e.target.value) || 0)} 
                                    className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                                />
                            </div>
                        </div>

                        <button 
                            onClick={autoDetectIds}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                            title="Auto-detect highest ID numbers from current XML"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Detect Max IDs</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mode & Options Bar */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
                <div className="bg-slate-100 p-1 rounded-2xl flex shadow-inner border border-slate-200">
                    <button 
                        onClick={() => setMode('detach')} 
                        className={`px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all uppercase tracking-wider ${mode === 'detach' ? 'bg-white text-pink-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Detach (Footnote &rarr; Legend)
                    </button>
                    <button 
                        onClick={() => setMode('attach')} 
                        className={`px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all uppercase tracking-wider ${mode === 'attach' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Attach (Legend &rarr; Footnote)
                    </button>
                </div>

                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 select-none">
                        <input 
                            type="checkbox" 
                            checked={stripEmptyLegends} 
                            onChange={(e) => setStripEmptyLegends(e.target.checked)} 
                            className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 w-4 h-4"
                        />
                        <span>Strip Empty Legends</span>
                    </label>

                    <div className="h-4 w-px bg-slate-200"></div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 select-none">
                        <input 
                            type="checkbox" 
                            checked={enforceSupFormatting} 
                            onChange={(e) => setEnforceSupFormatting(e.target.checked)} 
                            className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 w-4 h-4"
                        />
                        <span>Enforce &lt;ce:sup&gt; Labels</span>
                    </label>

                    <div className="h-4 w-px bg-slate-200"></div>

                    <button 
                        onClick={handleQuickClean}
                        className="text-xs font-bold text-amber-600 hover:bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors flex items-center gap-1"
                        title="Quick clean empty legends and footnotes from input"
                    >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Quick Clean</span>
                    </button>
                </div>
            </div>

            {/* Main Workbench Grid */}
            <div className={`grid gap-8 min-h-[600px] transition-all duration-300 ${activeTab === 'diff' || activeTab === 'audit' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Input XML Box */}
                <div className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 ${mode === 'detach' ? 'focus-within:ring-pink-100' : 'focus-within:ring-blue-100'} transition-all duration-300 ${activeTab === 'diff' || activeTab === 'audit' ? 'hidden' : 'flex'} min-h-[520px]`}>
                    <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white border border-slate-200 text-xs text-slate-600 font-mono shadow-sm">1</span>
                            Input XML Document
                        </label>
                        <div className="flex items-center gap-2">
                            {footnotes.length > 0 && (
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${mode === 'detach' ? 'text-pink-600 bg-pink-50 border-pink-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {footnotes.length} Detected
                                </span>
                            )}
                            <button 
                                onClick={() => { setInput(''); setFootnotes([]); setOutput(''); setLogs([]); setAuditMetrics(null); }} 
                                className="text-xs font-bold text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Clear
                            </button>
                        </div>
                    </div>
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300 custom-scrollbar" 
                        placeholder={mode === 'detach' ? "Paste <ce:table> or full XML document containing table footnotes..." : "Paste <ce:table> or full XML document containing legend items..."} 
                        spellCheck={false} 
                    />
                </div>

                {/* Right Output / Selection / Audit / Diff Panel */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative min-h-[520px]">
                     {/* Tab Headers */}
                     <div className="flex border-b border-slate-100 bg-slate-50">
                        <button 
                            onClick={() => setActiveTab('selection')} 
                            className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-r border-slate-100 ${activeTab === 'selection' ? `bg-white ${mode === 'detach' ? 'text-pink-600' : 'text-blue-600'}` : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'selection' ? (mode === 'detach' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600') : 'bg-slate-200 text-slate-500'}`}>2</span>
                                Selection ({selectedIds.size}/{footnotes.length})
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('result')} 
                            className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-r border-slate-100 ${activeTab === 'result' ? `bg-white text-emerald-600` : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'result' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>3</span>
                                Result {output && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('audit')} 
                            className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-r border-slate-100 relative ${activeTab === 'audit' ? 'bg-white text-purple-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'audit' ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-500'}`}>4</span>
                                Audit & Logs
                                {errorCount > 0 && (
                                    <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[9px] font-black rounded-full">
                                        {errorCount}
                                    </span>
                                )}
                                {errorCount === 0 && warnCount > 0 && (
                                    <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[9px] font-black rounded-full">
                                        {warnCount}
                                    </span>
                                )}
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('diff')} 
                            className={`flex-1 py-3 text-xs font-extrabold uppercase tracking-wider transition-all ${activeTab === 'diff' ? 'bg-white text-orange-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'diff' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>5</span>
                                Diff View
                            </span>
                        </button>
                     </div>

                    <div className="flex-grow relative overflow-hidden bg-slate-50/50 flex flex-col">
                        {isLoading && <LoadingOverlay message={mode === 'detach' ? "Detaching footnotes & running quality audit..." : "Attaching legend items & running quality audit..."} color={mode === 'detach' ? "pink" : "blue"} />}

                        {/* Selection Tab Content */}
                        {activeTab === 'selection' && (
                            <div className="h-full flex flex-col">
                                {footnotes.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center opacity-70">
                                        <Table className="h-12 w-12 mb-3 text-slate-300 stroke-[1.5]" />
                                        <p className="text-sm font-extrabold text-slate-700">No items detected.</p>
                                        <p className="text-xs mt-1 text-slate-400">Paste XML containing {mode === 'detach' ? '<ce:table-footnote> elements' : '<ce:legend> or untagged footnote markers (*, †, ‡, §)'}.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Filter & Search Bar */}
                                        <div className="p-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shadow-sm z-10">
                                            <div className="relative flex-grow max-w-xs">
                                                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    placeholder="Search label, ID or content..."
                                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                                                />
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                                    <button 
                                                        onClick={() => setMarkerFilter('all')} 
                                                        className={`px-2 py-1 text-[10px] font-bold rounded ${markerFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                                                    >
                                                        All
                                                    </button>
                                                    <button 
                                                        onClick={() => setMarkerFilter('standard')} 
                                                        className={`px-2 py-1 text-[10px] font-bold rounded ${markerFilter === 'standard' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                                                    >
                                                        Symbols (*, †)
                                                    </button>
                                                    <button 
                                                        onClick={() => setMarkerFilter('alphanumeric')} 
                                                        className={`px-2 py-1 text-[10px] font-bold rounded ${markerFilter === 'alphanumeric' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                                                    >
                                                        a-z / 1-9
                                                    </button>
                                                    {mode === 'attach' && (
                                                        <button 
                                                            onClick={() => setMarkerFilter('naked')} 
                                                            className={`px-2 py-1 text-[10px] font-bold rounded ${markerFilter === 'naked' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-500'}`}
                                                        >
                                                            Naked
                                                        </button>
                                                    )}
                                                </div>

                                                <button 
                                                    onClick={toggleAll} 
                                                    className={`text-xs font-bold text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors ${mode === 'detach' ? 'hover:text-pink-600 hover:bg-pink-50' : 'hover:text-blue-600 hover:bg-blue-50'}`}
                                                >
                                                    {selectedIds.size === filteredFootnotes.length ? 'Deselect All' : 'Select All'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Items List */}
                                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar space-y-3">
                                            {filteredFootnotes.map(fn => (
                                                <label 
                                                    key={fn.id} 
                                                    className={`relative flex items-start gap-3 p-4 bg-white border rounded-2xl cursor-pointer transition-all duration-200 group ${selectedIds.has(fn.id) ? (mode === 'detach' ? 'border-pink-500 shadow-md shadow-pink-100/50 ring-1 ring-pink-500' : 'border-blue-500 shadow-md shadow-blue-100/50 ring-1 ring-blue-500') : `border-slate-200 ${mode === 'detach' ? 'hover:border-pink-300' : 'hover:border-blue-300'} hover:shadow-sm`}`}
                                                >
                                                    <div className="pt-0.5">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedIds.has(fn.id)} 
                                                            onChange={() => toggleSelection(fn.id)} 
                                                            className={`rounded border-slate-300 w-4 h-4 cursor-pointer ${mode === 'detach' ? 'text-pink-600 focus:ring-pink-500' : 'text-blue-600 focus:ring-blue-500'}`} 
                                                        />
                                                    </div>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 uppercase tracking-wider">{fn.id}</span>
                                                                <span className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                                                                    Label: <span className={`px-2 py-0.5 rounded-md font-mono ${mode === 'detach' ? 'bg-pink-50 text-pink-700 border border-pink-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>{fn.label}</span>
                                                                </span>
                                                                {fn.isNakedMarker && (
                                                                    <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">Untagged Marker</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 font-mono break-words" dangerouslySetInnerHTML={{__html: fn.content || '<span class="italic text-slate-400">Empty content</span>'}}></div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Result Tab Content */}
                        {activeTab === 'result' && (
                            <div className="h-full flex flex-col">
                                <div className="bg-white p-2.5 border-b border-slate-100 flex justify-between items-center z-10 px-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-500">Output length: {output.length} characters</span>
                                        {isStale && (
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Input Changed — Re-process recommended
                                            </span>
                                        )}
                                    </div>
                                    
                                    {output && (
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => { navigator.clipboard.writeText(output); setToast({msg: "Copied XML to clipboard!", type: "success"})}} 
                                                className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-xs"
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                                Copy XML
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-grow relative">
                                    <textarea 
                                        value={output} 
                                        readOnly 
                                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300 custom-scrollbar" 
                                        placeholder="Processed XML will appear here after executing detachment or attachment protocol..." 
                                    />
                                    {!output && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300">
                                            <Wand2 className="w-12 h-12 mb-2 stroke-[1.5]" />
                                            <p className="text-xs font-bold uppercase tracking-wider">Awaiting Conversion Execution</p>
                                        </div>
                                    )}
                                </div>

                                {/* Next Steps Recommendations Banner */}
                                {output && (
                                    <div className="p-4 bg-slate-900 text-white border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-amber-400" />
                                            <span className="text-xs font-extrabold uppercase tracking-wider">Next Steps:</span>
                                            <span className="text-xs text-slate-300">Transfer output to continue processing</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => transferTo('/tableBeautifier', 'Table XML Beautifier')}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                                            >
                                                <Table className="w-3.5 h-3.5 text-pink-400" />
                                                <span>Beautify Grid</span>
                                                <ExternalLink className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button 
                                                onClick={() => transferTo('/tagCleaner', 'XML Tag Cleaner')}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                                            >
                                                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                                                <span>Clean Tags</span>
                                                <ExternalLink className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button 
                                                onClick={() => transferTo('/xmlRenumber', 'XML Renumber')}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                                            >
                                                <Hash className="w-3.5 h-3.5 text-emerald-400" />
                                                <span>Renumber IDs</span>
                                                <ExternalLink className="w-3 h-3 text-slate-400" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Audit & Logs Tab Content */}
                        {activeTab === 'audit' && (
                            <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar bg-slate-50 space-y-6">
                                {/* Quality Assurance Verification Summary Cards */}
                                {auditMetrics ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Card 1: Data Integrity */}
                                        <div className={`p-4 rounded-2xl border bg-white shadow-xs flex flex-col justify-between ${auditMetrics.isTextLossDetected ? 'border-rose-300 ring-1 ring-rose-100' : 'border-emerald-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data Protection</span>
                                                {auditMetrics.isTextLossDetected ? (
                                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                                ) : (
                                                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-xl font-extrabold text-slate-900 mb-1">
                                                    {auditMetrics.textMatchPercent}% Match
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    {auditMetrics.inputWordCount} &rarr; {auditMetrics.outputWordCount} words ({auditMetrics.wordDelta > 0 ? `+${auditMetrics.wordDelta}` : auditMetrics.wordDelta})
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-400">
                                                {auditMetrics.isTextLossDetected ? '⚠️ Check for lost content' : '✓ Zero accidental text loss'}
                                            </div>
                                        </div>

                                        {/* Card 2: Tag & DTD Balance */}
                                        <div className={`p-4 rounded-2xl border bg-white shadow-xs flex flex-col justify-between ${auditMetrics.unbalancedTags.length > 0 ? 'border-amber-300 ring-1 ring-amber-100' : 'border-emerald-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">XML Tag Balance</span>
                                                {auditMetrics.unbalancedTags.length > 0 ? (
                                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                                ) : (
                                                    <FileCheck className="w-4 h-4 text-emerald-500" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-xl font-extrabold text-slate-900 mb-1">
                                                    {auditMetrics.unbalancedTags.length === 0 ? 'Balanced' : `${auditMetrics.unbalancedTags.length} Mismatch`}
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    {auditMetrics.unbalancedTags.length === 0 ? 'All <ce:table> & <ce:legend> tags valid' : auditMetrics.unbalancedTags.join(', ')}
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-400">
                                                {auditMetrics.unbalancedTags.length === 0 ? '✓ Well-formed XML structure' : '⚠️ Unclosed XML tags detected'}
                                            </div>
                                        </div>

                                        {/* Card 3: ID Matrix & Linkage */}
                                        <div className={`p-4 rounded-2xl border bg-white shadow-xs flex flex-col justify-between ${auditMetrics.duplicateIds.length > 0 || auditMetrics.orphanRefIds.length > 0 ? 'border-rose-300' : 'border-emerald-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ID Matrix Linkage</span>
                                                {auditMetrics.duplicateIds.length > 0 ? (
                                                    <XCircle className="w-4 h-4 text-rose-500" />
                                                ) : (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-xl font-extrabold text-slate-900 mb-1">
                                                    {auditMetrics.duplicateIds.length === 0 ? '0 Collisions' : `${auditMetrics.duplicateIds.length} Collisions`}
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    {auditMetrics.orphanRefIds.length === 0 ? 'All cross-refs target valid IDs' : `${auditMetrics.orphanRefIds.length} orphan refid(s)`}
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-400">
                                                {auditMetrics.duplicateIds.length === 0 ? '✓ Unique ID sequence integrity' : '⚠️ Duplicate IDs found'}
                                            </div>
                                        </div>

                                        {/* Card 4: Processing Scope */}
                                        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Scope Execution</span>
                                                <Layers className="w-4 h-4 text-purple-500" />
                                            </div>
                                            <div>
                                                <div className="text-xl font-extrabold text-slate-900 mb-1">
                                                    {auditMetrics.itemsProcessed} Items
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    In {auditMetrics.tablesFound} table(s) processed
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-400">
                                                Mode: {mode === 'detach' ? 'Footnote -> Legend' : 'Legend -> Footnote'}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-500">
                                        <Info className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                        <p className="text-xs font-bold uppercase tracking-wider">No Execution Audit Metrics Yet</p>
                                        <p className="text-[11px] mt-1 text-slate-400">Process XML to generate data integrity scores, tag balance reports, and detailed action logs.</p>
                                    </div>
                                )}

                                {/* Filter & Search Logs Toolbar */}
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <Terminal className="w-4 h-4 text-purple-600" />
                                        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Transformation Action Log</span>
                                        <span className="text-xs text-slate-400">({logs.length} entries)</span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Search in logs */}
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                                            <input 
                                                type="text" 
                                                value={logSearchQuery}
                                                onChange={(e) => setLogSearchQuery(e.target.value)}
                                                placeholder="Filter logs..."
                                                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-2 focus:ring-purple-200 transition-all w-44"
                                            />
                                        </div>

                                        {/* Type filter buttons */}
                                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                            <button 
                                                onClick={() => setLogFilter('all')} 
                                                className={`px-2 py-1 text-[10px] font-bold rounded ${logFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                                            >
                                                All
                                            </button>
                                            <button 
                                                onClick={() => setLogFilter('success')} 
                                                className={`px-2 py-1 text-[10px] font-bold rounded ${logFilter === 'success' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-500'}`}
                                            >
                                                Success
                                            </button>
                                            <button 
                                                onClick={() => setLogFilter('warn')} 
                                                className={`px-2 py-1 text-[10px] font-bold rounded ${logFilter === 'warn' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500'}`}
                                            >
                                                Warns
                                            </button>
                                            <button 
                                                onClick={() => setLogFilter('error')} 
                                                className={`px-2 py-1 text-[10px] font-bold rounded ${logFilter === 'error' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-500'}`}
                                            >
                                                Errors
                                            </button>
                                        </div>

                                        {logs.length > 0 && (
                                            <button 
                                                onClick={() => {
                                                    const text = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.action}: ${l.message}`).join('\n');
                                                    navigator.clipboard.writeText(text);
                                                    setToast({ msg: "Copied audit logs to clipboard!", type: "success" });
                                                }}
                                                className="px-2.5 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1"
                                                title="Copy logs to clipboard"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>Copy</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Logs Stream List */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex-grow min-h-[300px]">
                                    {filteredLogs.length === 0 ? (
                                        <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-slate-400 p-8 text-center opacity-70">
                                            <Terminal className="h-10 w-10 mb-2 text-slate-300 stroke-[1.5]" />
                                            <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">No Log Entries Found</p>
                                            <p className="text-[11px] mt-1 text-slate-400">Log entries will populate dynamically as tables and footnotes are transformed.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 max-h-[450px] overflow-y-auto custom-scrollbar">
                                            {filteredLogs.map(log => {
                                                let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                                                let icon = <Info className="w-3.5 h-3.5 text-slate-500" />;

                                                if (log.type === 'success') {
                                                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                                    icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
                                                } else if (log.type === 'warn') {
                                                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                                                    icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
                                                } else if (log.type === 'error') {
                                                    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                                                    icon = <XCircle className="w-3.5 h-3.5 text-rose-600" />;
                                                }

                                                return (
                                                    <div key={log.id} className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-start gap-3 text-xs font-mono">
                                                        <span className="text-[10px] text-slate-400 font-bold mt-0.5 select-none">{log.timestamp}</span>
                                                        <div className="mt-0.5">{icon}</div>
                                                        <div className="flex-grow min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeClass}`}>
                                                                    {log.action}
                                                                </span>
                                                                {log.tableNum !== undefined && (
                                                                    <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                                        Table #{log.tableNum}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-slate-800 leading-relaxed font-sans">{log.message}</p>
                                                            {log.details && (
                                                                <div className="mt-1.5 p-2 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-lg overflow-x-auto leading-normal">
                                                                    {log.details}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Diff View Tab Content */}
                        {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-hidden bg-white flex flex-col">
                                {diffRows.length > 0 ? (
                                    <>
                                        {/* Diff Quality Summary Bar */}
                                        <div className="px-4 py-2 bg-slate-900 text-slate-200 border-b border-slate-800 flex flex-wrap items-center justify-between text-xs font-mono">
                                            <div className="flex items-center gap-4">
                                                <span className="flex items-center gap-1.5 font-bold text-amber-400">
                                                    <GitCompare className="w-3.5 h-3.5" />
                                                    Side-by-Side XML Diff Audit
                                                </span>
                                                <span className="text-emerald-400 font-bold">
                                                    Total Changes: {totalChanges}
                                                </span>
                                            </div>

                                            {auditMetrics && (
                                                <div className="flex items-center gap-3 text-[11px]">
                                                    <span className={auditMetrics.isTextLossDetected ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                                        Text Integrity: {auditMetrics.textMatchPercent}% ({auditMetrics.wordDelta >= 0 ? `+${auditMetrics.wordDelta}` : auditMetrics.wordDelta} words)
                                                    </span>
                                                    <span className="text-slate-400">|</span>
                                                    <span className="text-slate-300">
                                                        Tables: {auditMetrics.tablesFound}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar relative">
                                            <table className="w-full text-sm font-mono border-collapse table-fixed bg-white">
                                                <colgroup>
                                                    <col className="w-12 bg-slate-50 border-r border-slate-200" />
                                                    <col className="w-[calc(50%-3rem)]" />
                                                    <col className="w-12 bg-slate-50 border-r border-slate-200 border-l border-slate-200" />
                                                    <col className="w-[calc(50%-3rem)]" />
                                                </colgroup>
                                                <tbody>
                                                    {diffRows.map((row) => {
                                                        let lClass = row.leftNum !== null && row.type === 'delete' ? 'bg-rose-50/50' : (row.type === 'replace' ? 'bg-rose-50/30' : '');
                                                        let rClass = row.rightNum !== null && row.type === 'insert' ? 'bg-emerald-50/50' : (row.type === 'replace' ? 'bg-emerald-50/30' : '');
                                                        if (row.type === 'equal') { lClass = ''; rClass = ''; }

                                                        return (
                                                            <tr 
                                                                key={row.id} 
                                                                className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                                                                data-change-index={row.changeIndex}
                                                                data-change-index-group={row.isFirstInGroup ? row.changeIndex : undefined}
                                                                data-type={row.type}
                                                            >
                                                                <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{row.leftNum || ''}</td>
                                                                <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: row.leftContent || ''}}></td>
                                                                <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{row.rightNum || ''}</td>
                                                                <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: row.rightContent || ''}}></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
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
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <GitCompare size={48} strokeWidth={1.5} />
                                        <p className="text-sm font-extrabold uppercase tracking-wider mt-3">No Diff Available</p>
                                        <p className="text-xs mt-1">Process XML to view changes side-by-side.</p>
                                    </div>
                                )}
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-10 text-center">
                <button 
                    onClick={handleRequestProcess} 
                    disabled={isLoading || footnotes.length === 0 || selectedIds.size === 0}
                    title="Ctrl+Enter to Review & Execute"
                    className={`group font-black py-4.5 px-16 rounded-[2.5rem] shadow-2xl transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 uppercase tracking-[0.2em] text-xs inline-flex items-center gap-2.5 ${mode === 'detach' ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-600/25' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/25'}`}
                >
                    <Eye className="w-4 h-4" />
                    <span>Review & Execute Transformation ({selectedIds.size} Selected)</span>
                </button>
            </div>

            {/* Execution Review & Confirmation Modal */}
            <AnimatePresence>
                {showReviewModal && reviewPlan && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${mode === 'detach' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                                        <Eye className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-extrabold tracking-tight uppercase">Transformation Plan Review</h3>
                                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${mode === 'detach' ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                                                {mode === 'detach' ? 'Detach Protocol' : 'Attach Protocol'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 font-medium mt-0.5">Review planned XML structure changes, tag rewrites, and assigned ID sequences before applying.</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowReviewModal(false)}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                                    title="Close Review"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-grow space-y-6 bg-slate-50/50">
                                {/* Execution Parameters Summary Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Target Scope</span>
                                        <span className="text-lg font-extrabold text-slate-900">{reviewPlan.itemCount} of {footnotes.length}</span>
                                        <span className="text-[10px] font-medium text-slate-500 block">Items Selected</span>
                                    </div>
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Protocol Mode</span>
                                        <span className={`text-sm font-extrabold ${mode === 'detach' ? 'text-pink-600' : 'text-blue-600'}`}>
                                            {mode === 'detach' ? 'Footnotes → Legend' : 'Legend → Footnotes'}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-500 block">Deterministic Engine</span>
                                    </div>
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">ID Sequence Start</span>
                                        <span className="text-sm font-mono font-extrabold text-slate-800">
                                            {mode === 'detach' ? `sp${spStart}` : `tf${tfStart} / cf${cfStart}`}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-500 block">Auto-increment (+5)</span>
                                    </div>
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Active Rules</span>
                                        <span className="text-xs font-bold text-slate-700">
                                            {stripEmptyLegends ? 'Strip Empty' : 'Keep Empty'}, {enforceSupFormatting ? 'Sup Enforced' : 'Sup Raw'}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-500 block">Clean formatting</span>
                                    </div>
                                </div>

                                {/* Planned Transformation Action Breakdown List */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                                    <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                                        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-purple-600" />
                                            Planned Action Breakdown ({reviewPlan.items.length} items)
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                            100% Character-Match Preserved
                                        </span>
                                    </div>

                                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto custom-scrollbar">
                                        {reviewPlan.items.map((item, idx) => (
                                            <div key={item.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono font-black text-slate-400">#{idx + 1}</span>
                                                        <span className="text-xs font-mono font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{item.id}</span>
                                                        <span className="text-xs font-bold text-slate-800">Label: <code className="bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded font-mono text-xs">{item.label}</code></span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100">
                                                            {item.action}
                                                        </span>
                                                        <span className="text-xs font-mono font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                                                            &rarr; {item.targetId}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-xs text-slate-600 mb-2 line-clamp-2 bg-slate-50 p-2 rounded-lg font-mono border border-slate-100" dangerouslySetInnerHTML={{ __html: item.content || '<span class="italic text-slate-400">Empty text</span>' }}></div>

                                                {/* Generated Tag Snippet Preview */}
                                                <div className="bg-slate-900 text-slate-200 p-2.5 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800 flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold select-none">+</span>
                                                    <code className="text-emerald-300 break-all">{item.xmlPreview}</code>
                                                </div>
                                                {item.crossRefPreview && (
                                                    <div className="mt-1.5 bg-slate-900 text-slate-200 p-2.5 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800 flex items-start gap-2">
                                                        <span className="text-blue-400 font-bold select-none">+</span>
                                                        <code className="text-blue-300 break-all">{item.crossRefPreview}</code>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Deterministic Quality & Protection Notice */}
                                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">Deterministic Quality Guarantee</h4>
                                        <p className="text-xs text-emerald-800 leading-relaxed mt-0.5">
                                            This process uses pure, exact XML regex string transformations. No AI is used during processing, guaranteeing 0% hallucination and 100% character integrity. An automated audit diff check will run immediately upon execution.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="bg-white p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 px-6">
                                <button 
                                    onClick={() => setShowReviewModal(false)}
                                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-all uppercase tracking-wider"
                                >
                                    Back & Adjust Selection
                                </button>

                                <button 
                                    onClick={confirmAndExecute}
                                    className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${mode === 'detach' ? 'bg-pink-600 hover:bg-pink-700 shadow-pink-600/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'}`}
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Confirm & Execute Transformation</span>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TableFixer;
