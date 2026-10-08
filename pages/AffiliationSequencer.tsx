import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { 
    FileCode, 
    RotateCcw, 
    Copy, 
    Check, 
    AlertCircle, 
    Zap,
    History,
    FileText,
    ArrowRight,
    Hash,
    Search,
    Split,
    ChevronUp,
    ChevronDown,
    GitCompare,
    AlertTriangle,
    Lightbulb,
    Trash2,
    Link as LinkIcon,
    Download,
    Maximize2,
    Minimize2,
    Users,
    CheckCircle2,
    ShieldCheck
} from 'lucide-react';
import Toast from '../components/Toast';
import AffiliationAuditViews from '../components/AffiliationAuditViews';
import useLocalStorage from '../hooks/useLocalStorage';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { sequenceAffiliations } from '../utils/affiliationSequencerEngine';

interface AffiliationIssue {
    index: number;
    originalId: string;
    expectedId: string;
    currentLabel: string;
    expectedLabel: string;
    isIdWrong: boolean;
    isLabelWrong: boolean;
    type?: 'affiliation' | 'cross-ref';
    context?: string;
}

interface AuditLine {
    text: string;
    isChanged: boolean;
    isHeader?: boolean;
    isDivider?: boolean;
}

interface AuthorRemapLink {
    originalLabel?: string;
    requiresReview?: boolean;
    crossRefId?: string;
    oldRefId: string;
    newRefId: string;
    label: string;
    isChanged: boolean;
}

interface AuthorRemapItem {
    authorIndex: number;
    authorName: string;
    authorId?: string;
    links: AuthorRemapLink[];
    isRemapped: boolean;
}

interface AffiliationRemapItem {
    text?: string;
    index: number;
    originalId: string;
    newId: string;
    originalLabel: string;
    newLabel: string;
    affiliationId?: string;
    isChanged: boolean;
}

interface SyncLogSession {
    timestamp: string;
    totalAffiliations: number;
    changedAffiliationsCount: number;
    totalAuthors: number;
    remappedAuthorsCount: number;
    totalCrossRefsUpdated: number;
    authors: AuthorRemapItem[];
    affiliations: AffiliationRemapItem[];
    unlinkedAffiliations: string[];
    redundantAffiliationGroups: string[][];
    rawAuditLog: AuditLine[];
}

interface RollbackSnapshot {
    input: string;
    output: string;
    lastProcessedInput: string;
    report: AuditLine[];
    syncLog: SyncLogSession | null;
    timestamp: string;
}

interface SmartSuggestion {
    id: string;
    toolName: string;
    description: string;
    path: string;
    icon: React.ReactNode;
    condition: string;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const getLabel = (index: number) => {
    let label = "";
    let n = index;
    while (n >= 0) {
        label = ALPHABET[n % 26] + label;
        n = Math.floor(n / 26) - 1;
    }
    return label;
};

const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const buildDiffLines = (diffParts: Change[], isLeft: boolean) => {
    const lines: string[] = [];
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

const AffiliationSequencer: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useLocalStorage<string>('affiliation_sequencer_input', '');
    const [output, setOutput] = useLocalStorage<string>('affiliation_sequencer_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('affiliation_sequencer_last_input', '');
    const [isProcessing, setIsProcessing] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const [activeTab, setActiveTab] = useState<'xml' | 'diff' | 'report'>('xml');
    const [report, setReport] = useState<AuditLine[]>([]);
    const [auditView, setAuditView] = useState<'table' | 'rendered'>('table');
    const [issues, setIssues] = useState<AffiliationIssue[]>([]);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [syncLog, setSyncLog] = useState<SyncLogSession | null>(null);
    const [rollbackState, setRollbackState] = useState<RollbackSnapshot | null>(null);
    const [authorFilter, setAuthorFilter] = useState<'remapped' | 'all'>('remapped');

    const [searchQuery, setSearchQuery] = useState('');
    const [filterChangedOnly, setFilterChangedOnly] = useState(false);
    const [isDiffExpanded, setIsDiffExpanded] = useState(false);

    const [isDragging, setIsDragging] = useState(false);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Support data transfer from other tools
    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput]);

    const isStale = Boolean(output && input !== lastProcessedInput);

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
            setToast({ msg: 'Please drop a valid .xml file', type: 'error' });
        }
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output);
        setToast({ msg: isStale ? 'Copied stale output XML!' : 'Copied output XML to clipboard!', type: 'success' });
    };

    const handleRollback = () => {
        if (!rollbackState) return;
        setInput(rollbackState.input);
        setOutput(rollbackState.output);
        setLastProcessedInput(rollbackState.lastProcessedInput);
        setReport(rollbackState.report);
        setSyncLog(rollbackState.syncLog);
        setRollbackState(null);
        setToast({ 
            msg: `Session rolled back to pre-sync state (${rollbackState.timestamp || 'previous'}).`, 
            type: 'success' 
        });
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setLastProcessedInput('');
        setReport([]);
        setSyncLog(null);
        setRollbackState(null);
        setIssues([]);
        setSuggestions([]);
        setTotalChanges(0);
        setCurrentChangeIndex(0);
        setToast({ msg: 'All cleared', type: 'warn' });
    };

    const handleSaveToFile = () => {
        if (!output) return;
        const blob = new Blob([output], { type: 'application/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sequenced_affiliations.xml');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ msg: 'Saved XML to file', type: 'success' });
    };

    const generateSuggestions = (xmlText: string) => {
        const newSuggestions: SmartSuggestion[] = [];
        if (xmlText.includes('<ce:bib-reference')) {
            newSuggestions.push({
                id: 'xml-renumber',
                toolName: 'XML Reference Normalizer',
                description: 'Bibliography detected. Use this to ensure all references are correctly numbered.',
                path: '/xmlRenumber',
                icon: <Hash className="w-4 h-4" />,
                condition: 'Bibliography detected'
            });
        }
        const otherRefCount = (xmlText.match(/<ce:other-ref/g) || []).length;
        if (otherRefCount > 0) {
            newSuggestions.push({
                id: 'other-ref',
                toolName: 'Other-Ref Scanner',
                description: `Found ${otherRefCount} other-ref(s). Scan and audit other-ref markup.`,
                path: '/otherRefScanner',
                icon: <LinkIcon className="w-4 h-4" />,
                condition: 'Other-refs detected'
            });
        }
        const tagMatches = xmlText.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>/gi) || [];
        if (tagMatches.length > 0) {
            newSuggestions.push({
                id: 'tag-cleaner',
                toolName: 'XML Tag Cleaner',
                description: `Found ${tagMatches.length} editorial tag(s). Accept or reject editorial markup in bulk.`,
                path: '/tagCleaner',
                icon: <Trash2 className="w-4 h-4" />,
                condition: 'Editorial tags detected'
            });
        }
        if (xmlText.includes('<ce:table') || xmlText.includes('<table')) {
            newSuggestions.push({
                id: 'table-fixer',
                toolName: 'XML Table Fixer',
                description: 'Table markup detected. Audit table entry counts and column alignments.',
                path: '/tableFixer',
                icon: <FileCode className="w-4 h-4" />,
                condition: 'Table detected'
            });
        }
        return newSuggestions;
    };

    const analyzeXml = () => {
 try {
  const result=sequenceAffiliations(input);
  setIssues(result.changes.filter(c=>c.isChanged).map(c=>({index:c.index,originalId:c.originalId,expectedId:c.newId,currentLabel:c.originalLabel,expectedLabel:c.newLabel,isIdWrong:c.originalId!==c.newId,isLabelWrong:c.originalLabel!==c.newLabel,type:'affiliation' as const})));
  setReport(result.notices.map(text=>({text,isChanged:false})));
  setToast({msg:'Structural audit complete. Review IDs, labels and target ownership before sequencing.',type:result.notices.length?'warn':'success'});
 } catch(error){setIssues([]);setOutput('');setLastProcessedInput('');setSyncLog(null);setReport([]);setToast({msg:error instanceof Error?error.message:'Unable to audit XML',type:'error'});}
};

    const processXml = () => {
 if(!input.trim()){setToast({msg:'Please enter XML first.',type:'warn'});return;}
 setIsProcessing(true);
 setRollbackState({input,output,lastProcessedInput,report,syncLog,timestamp:new Date().toLocaleTimeString()});
 try {
  const result=sequenceAffiliations(input);
  const auditLog:AuditLine[]=[{text:'STRUCTURAL AFFILIATION SEQUENCING — EXISTING TARGET OWNERSHIP PRESERVED',isChanged:false,isHeader:true},...result.changes.map(c=>({text:c.originalId+' → '+c.newId+'; label '+c.originalLabel+' → '+c.newLabel,isChanged:c.isChanged})),...result.linkChanges.filter(c=>c.isChanged).map(c=>({text:'Linked target '+c.oldRefId+' → '+c.newRefId,isChanged:true})),...result.notices.map(text=>({text:'REVIEW: '+text,isChanged:false})),{text:'Unlinked affiliations: '+(result.unlinkedAffiliations.join(', ')||'none'),isChanged:false},{text:'Structural checks passed. Validate the complete output with DTD and VTool.',isChanged:false}];
  const session:SyncLogSession={timestamp:new Date().toLocaleTimeString(),totalAffiliations:result.changes.length,changedAffiliationsCount:result.changes.filter(c=>c.isChanged).length,totalAuthors:result.authors.length,remappedAuthorsCount:result.authors.filter(a=>a.isRemapped).length,totalCrossRefsUpdated:result.linkChanges.filter(c=>c.isChanged).length,authors:result.authors,affiliations:result.changes,unlinkedAffiliations:result.unlinkedAffiliations,redundantAffiliationGroups:result.redundantAffiliationGroups,rawAuditLog:auditLog};
  setOutput(result.outputXml);setLastProcessedInput(input);setReport(auditLog);setSyncLog(session);setIssues([]);setSuggestions(generateSuggestions(result.outputXml));setActiveTab(result.notices.length?'report':'diff');
  setToast({msg:result.changes.length+' affiliations processed; '+result.notices.length+' review notices.',type:result.notices.length?'warn':'success'});
 } catch(error){setOutput('');setLastProcessedInput('');setReport([]);setSyncLog(null);setIssues([]);setSuggestions([]);setToast({msg:error instanceof Error?error.message:'Unable to sequence safely',type:'error'});}
 finally{setIsProcessing(false);}
};

    const downloadCSV = () => {
        if (!syncLog && report.length === 0) return;
        
        const lines: string[][] = [
            ['AFFILIATION SEQUENCER SYNC & REMAP LOG'],
            [`Generated: ${syncLog?.timestamp || new Date().toLocaleString()}`],
            [''],
            ['--- SUMMARY METRICS ---'],
            ['Total Affiliations', String(syncLog?.totalAffiliations || 0)],
            ['Affiliation IDs Corrected', String(syncLog?.changedAffiliationsCount || 0)],
            ['Total Authors Scanned', String(syncLog?.totalAuthors || 0)],
            ['Authors with updated links', String(syncLog?.remappedAuthorsCount || 0)],
            ['Cross-References Synchronized', String(syncLog?.totalCrossRefsUpdated || 0)],
            [''],
            ['--- AUTHOR CROSS-REFERENCE REMAPPINGS ---'],
            ['Author Index', 'Author ID', 'Author Name', 'Status', 'Old RefID', 'New RefID', 'Label Before', 'Label After', 'Cross-Ref ID']
        ];

        if (syncLog?.authors) {
            syncLog.authors.forEach(auth => {
                if (auth.links.length === 0) {
                    lines.push([
                        `#${auth.authorIndex}`,
                        auth.authorId || '(none)',
                        auth.authorName,
                        'No Affiliation Links',
                        '', '', '', '', ''
                    ]);
                } else {
                    auth.links.forEach(l => {
                        lines.push([
                            `#${auth.authorIndex}`,
                            auth.authorId || '(none)',
                            auth.authorName,
                            l.requiresReview ? 'REVIEW REQUIRED' : l.isChanged ? 'CHANGED' : 'UNCHANGED',
                            l.oldRefId,
                            l.newRefId,
                            l.originalLabel || '',
                            l.label || '',
                            l.crossRefId || ''
                        ]);
                    });
                }
            });
        }

        lines.push(['']);
        lines.push(['--- AFFILIATION SEQUENCE CHANGES ---']);
        lines.push(['Index', 'Original ID', 'New ID', 'Original Label', 'New Label', 'Preserved affiliation-id', 'Status']);
        if (syncLog?.affiliations) {
            syncLog.affiliations.forEach(aff => {
                lines.push([
                    `#${aff.index}`,
                    aff.originalId,
                    aff.newId,
                    aff.originalLabel,
                    aff.newLabel,
                    aff.affiliationId || '(none)',
                    aff.isChanged ? 'MODIFIED' : 'PRESERVED'
                ]);
            });
        }

        lines.push(['']);
        lines.push(['--- DETAILED AUDIT TRAIL ---']);
        lines.push(['Entry #', 'Log Message', 'Status']);
        report.forEach((item, idx) => {
            lines.push([
                `#${idx + 1}`,
                item.text,
                item.isChanged ? 'Modified' : 'Preserved'
            ]);
        });

        const csvContent = lines.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `affiliation_sync_log_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useKeyboardShortcuts({
        onPrimary: processXml,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, isStale]);

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || totalChanges === 0) return;

        let nextIndex = currentChangeIndex;
        if (direction === 'next') {
            nextIndex = currentChangeIndex >= totalChanges ? 1 : currentChangeIndex + 1;
        } else {
            nextIndex = currentChangeIndex <= 1 ? totalChanges : currentChangeIndex - 1;
        }

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current || currentChangeIndex === 0) return;

        const allRows = diffContainerRef.current.querySelectorAll('tr[data-change-index-group]');
        allRows.forEach(row => row.classList.remove('bg-emerald-100/60', 'ring-1', 'ring-emerald-300', 'ring-inset', 'z-10', 'relative'));

        const activeRows = diffContainerRef.current.querySelectorAll(`tr[data-change-index-group="${currentChangeIndex}"]`);
        activeRows.forEach(row => {
            row.classList.add('bg-emerald-100/60', 'ring-1', 'ring-emerald-300', 'ring-inset', 'z-10', 'relative');
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
                    lClass = 'bg-rose-50/70 text-slate-800';
                    lNumClass = 'bg-rose-100/70 text-rose-600 font-semibold';
                } else if (type === 'insert') {
                    rClass = 'bg-emerald-50/70 text-slate-800';
                    rNumClass = 'bg-emerald-100/70 text-emerald-600 font-semibold';
                } else if (type === 'replace') {
                    if (lContent !== undefined) {
                        lClass = 'bg-rose-50/70 text-slate-800';
                        lNumClass = 'bg-rose-100/70 text-rose-600 font-semibold';
                    }
                    if (rContent !== undefined) {
                        rClass = 'bg-emerald-50/70 text-slate-800';
                        rNumClass = 'bg-emerald-100/70 text-emerald-600 font-semibold';
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
                        <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none font-mono ${rNumClass}`}>{rNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setTotalChanges(changeCount);
        setCurrentChangeIndex(changeCount > 0 ? 1 : 0);
        return rows;
    }, [input, output]);

    const filteredReport = useMemo(() => {
        return report.filter(item => {
            if (filterChangedOnly && !item.isChanged) return false;
            if (!searchQuery.trim()) return true;
            return item.text.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [report, filterChangedOnly, searchQuery]);

    const reportStats = useMemo(() => {
        const total = report.filter(r => !r.isDivider && !r.isHeader).length;
        const changed = report.filter(r => r.isChanged).length;
        return { total, changed, preserved: Math.max(0, total - changed) };
    }, [report]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6 flex flex-col min-h-[calc(100vh-120px)]">
            {/* Standard Toolkit Top Header */}
            <div className="mb-10 text-center animate-fade-in relative">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">
                    Affiliation Sequencer
                </h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light">
                    Sequentially renumbers affiliation IDs in increments of 5 (<code className="text-emerald-600 font-mono text-sm font-semibold">af0005</code>, <code className="text-emerald-600 font-mono text-sm font-semibold">af0010</code>...) and synchronizes author cross-reference links.
                </p>
            </div>

            {/* Consistent Control & Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                        <Hash className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm">Sequence Scheme</span>
                        <span className="text-xs text-slate-500">Incremental +5 step</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-medium">Standard Sequence:</span>
                    <span className="bg-white px-2.5 py-1 rounded-lg text-emerald-700 font-mono font-bold text-xs border border-slate-200 shadow-2xs">
                        af0005, af0010, af0015, af0020...
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {rollbackState && (
                        <button
                            onClick={handleRollback}
                            title={`Restore XML buffer and state prior to last sync (${rollbackState.timestamp})`}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold py-3 px-4 sm:px-5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 text-sm animate-fade-in"
                        >
                            <RotateCcw className="w-4 h-4 text-amber-700" />
                            <span>Rollback</span>
                        </button>
                    )}
                    <button
                        onClick={analyzeXml}
                        disabled={isProcessing || !input.trim()}
                        title="Pre-flight audit without modifying XML"
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 px-5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        <Search className="w-4 h-4 text-slate-500" />
                        <span>Audit XML</span>
                    </button>
                    <button 
                        onClick={processXml} 
                        disabled={isProcessing || !input.trim()}
                        title="Ctrl+Enter"
                        className={`bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transform transition-all active:scale-95 flex items-center gap-2 text-sm ${isProcessing ? 'opacity-75 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Sequencing...</span>
                            </>
                        ) : (
                            <>
                                <span>Process XML</span>
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Smart Suggestions / Architectural Recommendations Banner */}
            {suggestions.length > 0 && output && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-4 bg-emerald-50/30 border-2 border-emerald-100 rounded-2xl border-dashed">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-emerald-600" />
                            </div>
                            <h4 className="text-[10px] font-black text-emerald-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Affiliation Sequencer' } });
                                    }}
                                    className="flex items-center gap-4 p-3 bg-white border border-emerald-100 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[9px] font-black text-emerald-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                        <div className="text-[8px] text-emerald-600 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-emerald-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Dual-Column Editor Grid */}
            <div className={`grid gap-8 min-h-[calc(100vh-320px)] transition-all duration-300 ${isDiffExpanded && activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Left Column: Input XML */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all duration-300 ${isDiffExpanded && activeTab === 'diff' ? 'hidden' : 'flex'} min-h-[550px]`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">IN</span>
                            Input XML
                        </label>
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:inline text-xs text-slate-400 font-mono">
                                {input ? `${input.length.toLocaleString()} chars` : 'Empty'}
                            </span>
                            <button 
                                onClick={clearAll} 
                                title="Alt+Delete" 
                                className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                            >
                                Clear All
                            </button>
                        </div>
                    </div>

                    <div 
                        className={`flex-grow relative flex flex-col transition-all duration-300 ${isDragging ? 'bg-emerald-50/50' : ''}`}
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
                            className="w-full flex-grow p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-emerald-100 placeholder-slate-300" 
                            placeholder="Paste your XML content here (e.g., full article, <ce:author-group>, or affiliation list)..." 
                            spellCheck={false}
                        />

                        {isDragging && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-emerald-50/80 backdrop-blur-2xs animate-in fade-in zoom-in duration-200">
                                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                                    <FileCode className="text-white h-8 w-8" />
                                </div>
                                <p className="mt-4 text-emerald-800 font-bold text-sm">Drop XML File to Load</p>
                            </div>
                        )}

                        {issues.length > 0 && (
                            <div className="mx-6 mb-6 p-4 bg-amber-50/80 rounded-xl border border-amber-200 max-h-48 overflow-auto custom-scrollbar">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="text-amber-500 w-4 h-4" />
                                    <h4 className="text-xs font-bold text-amber-900">Pre-Flight Sequence Audit Findings ({issues.length})</h4>
                                </div>
                                <div className="space-y-2">
                                    {issues.map((issue, i) => (
                                        <div key={i} className={`text-xs font-mono p-2 rounded border ${issue.type === 'cross-ref' ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-white border-amber-200 text-slate-800'}`}>
                                            <div className="flex items-center gap-2 font-semibold">
                                                <span>{issue.type === 'cross-ref' ? `Cross-Ref #${issue.index}:` : `Affiliation #${issue.index}:`}</span>
                                                <span className="text-rose-600 line-through">{issue.originalId}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-emerald-700">{issue.expectedId}</span>
                                                {issue.expectedLabel && (
                                                    <span className="ml-auto text-[11px] text-slate-500 font-normal">
                                                        Label: <strong className="text-emerald-700">{issue.expectedLabel}</strong>
                                                    </span>
                                                )}
                                            </div>
                                            {issue.context && (
                                                <div className="text-[10px] text-slate-500 truncate mt-1">
                                                    {issue.context}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Right Column: Output / Diff / Report */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[550px]">
                    {/* Header Bar */}
                    <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">OUT</span>
                            Results
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <AlertTriangle size={10} />
                                    STALE
                                </span>
                            )}
                        </label>

                        <div className="flex items-center gap-2">
                            {isStale && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter hidden sm:block">Input modified</span>}
                            {output && (
                                <button 
                                    onClick={handleSaveToFile} 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors flex items-center gap-1 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
                                >
                                    <Download size={12} />
                                    Save File
                                </button>
                            )}
                            {output && (
                                <button 
                                    onClick={copyOutput} 
                                    title="Ctrl+Shift+C" 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'}`}
                                >
                                    <Copy size={12} />
                                    {isStale ? 'Copy Stale XML' : 'Copy Result'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Clean Tab Navigation Bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 pt-2 gap-2 shrink-0">
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setActiveTab('xml')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'xml' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <FileText size={13} />
                                Result XML
                            </button>
                            <button 
                                onClick={() => setActiveTab('diff')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'diff' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <Split size={13} />
                                Diff View
                                {totalChanges > 0 && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                        {totalChanges}
                                    </span>
                                )}
                            </button>
                            <button 
                                onClick={() => setActiveTab('report')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'report' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <History size={13} />
                                Audit Log
                                {syncLog && syncLog.remappedAuthorsCount > 0 ? (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full border border-amber-200">
                                        {syncLog.remappedAuthorsCount} remapped
                                    </span>
                                ) : report.length > 0 ? (
                                    <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-full">
                                        {reportStats.changed}
                                    </span>
                                ) : null}
                            </button>
                        </div>

                        {activeTab === 'diff' && output && (
                            <div className="flex items-center gap-2 pb-1.5">
                                {totalChanges > 0 && (
                                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
                                        <GitCompare className="w-3.5 h-3.5 text-emerald-600" />
                                        <span className="text-xs font-mono font-bold text-slate-700">
                                            {currentChangeIndex} / {totalChanges}
                                        </span>
                                        <div className="h-3 w-px bg-slate-200 mx-0.5"></div>
                                        <button 
                                            onClick={() => scrollToChange('prev')} 
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-emerald-700" 
                                            title="Previous change (Shift+Tab)"
                                        >
                                            <ChevronUp size={13} />
                                        </button>
                                        <button 
                                            onClick={() => scrollToChange('next')} 
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-emerald-700" 
                                            title="Next change (Tab)"
                                        >
                                            <ChevronDown size={13} />
                                        </button>
                                    </div>
                                )}
                                <button 
                                    onClick={() => setIsDiffExpanded(!isDiffExpanded)} 
                                    className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 text-slate-500 hover:text-slate-800 transition-all"
                                    title={isDiffExpanded ? "Restore side-by-side view" : "Expand diff to full width"}
                                >
                                    {isDiffExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                </button>
                            </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="pb-1.5 flex items-center gap-2">
                                {rollbackState && (
                                    <button 
                                        onClick={handleRollback} 
                                        title={`Revert XML to pre-sync state (${rollbackState.timestamp})`}
                                        className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-lg border border-amber-300 transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                                    >
                                        <RotateCcw size={12} className="text-amber-700" />
                                        Rollback Session
                                    </button>
                                )}
                                {report.length > 0 && (
                                    <button 
                                        onClick={downloadCSV} 
                                        className="text-xs font-bold text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 shadow-2xs"
                                    >
                                        <Download size={12} />
                                        Export CSV
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Tab Views Content */}
                    <div className="flex-grow flex flex-col min-h-0 bg-white relative">
                        {activeTab === 'xml' && (
                            <textarea 
                                readOnly 
                                value={output} 
                                className="w-full flex-grow p-6 text-sm font-mono text-slate-800 bg-slate-50/50 border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-emerald-100 placeholder-slate-300" 
                                placeholder="Normalized XML will appear here once processed..." 
                                spellCheck={false}
                            />
                        )}

                        {activeTab === 'diff' && (
                            <div ref={diffContainerRef} className="flex-grow flex flex-col min-h-0">
                                <div className="grid grid-cols-[3rem_1fr_3rem_1fr] bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                                    <div className="col-span-2 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                                        Original XML
                                    </div>
                                    <div className="col-span-2 px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        Sequenced Result
                                    </div>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar">
                                    {diffRows.length > 0 ? (
                                        <table className="w-full text-xs font-mono border-collapse table-fixed">
                                            <colgroup>
                                                <col className="w-12 border-r border-slate-200" />
                                                <col className="w-[calc(50%-3rem)]" />
                                                <col className="w-12 border-r border-slate-200 border-l border-slate-200" />
                                                <col className="w-[calc(50%-3rem)]" />
                                            </colgroup>
                                            <tbody>
                                                {diffRows}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-slate-400 text-sm italic py-16">
                                            Process XML to inspect side-by-side diff
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="flex-grow flex flex-col min-h-0 p-5 overflow-auto custom-scrollbar space-y-6">
                                {/* Top Session Header with Rollback */}
                                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                                            <FileText className="w-4 h-4 text-emerald-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-slate-800">
                                                    Affiliation Audit Log
                                                </h3>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-700">
                                                    Read-Only
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                {syncLog ? `Session executed at ${syncLog.timestamp}` : 'Process XML to compare affiliation IDs and author citation changes'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {rollbackState && (
                                            <button
                                                onClick={handleRollback}
                                                title={`Undo changes and revert XML to pre-sync state (${rollbackState.timestamp})`}
                                                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                                            >
                                                <RotateCcw size={13} className="text-amber-700" />
                                                Rollback Session
                                            </button>
                                        )}
                                        {report.length > 0 && (
                                            <button
                                                onClick={downloadCSV}
                                                className="text-xs font-bold text-slate-700 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs"
                                            >
                                                <Download size={13} />
                                                Export CSV
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div role="tablist" aria-label="Audit Log presentation" className="flex gap-2">
                                    {(['table','rendered'] as const).map(view => <button key={view} type="button" role="tab" id={`affiliation-audit-${view}-tab`} aria-selected={auditView === view} aria-controls="affiliation-audit-presentation" onClick={() => setAuditView(view)} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${auditView === view ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>{view === 'table' ? 'Table view' : 'Rendered view'}</button>)}
                                </div>
                                {report.some(line => line.text.startsWith('REVIEW:')) && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900"><h4 className="font-semibold mb-2">Review required</h4><ul className="list-disc pl-5 space-y-1">{report.filter(line => line.text.startsWith('REVIEW:')).map((line,index) => <li key={index}>{line.text.replace(/^REVIEW: /,'')}</li>)}</ul></div>}
                                <div role="tabpanel" id="affiliation-audit-presentation" aria-labelledby={`affiliation-audit-${auditView}-tab`}>
                                    {syncLog ? <AffiliationAuditViews view={auditView} authors={syncLog.authors} affiliations={syncLog.affiliations} /> : <p className="p-5 text-sm text-slate-500">Process XML to generate the before-and-after presentation.</p>}
                                </div>
                                {/* Detailed Chronological Audit Trail */}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <div className="relative flex-grow max-w-sm">
                                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                            <input 
                                                type="text" 
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search chronological audit log..." 
                                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                            />
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filterChangedOnly} 
                                                    onChange={(e) => setFilterChangedOnly(e.target.checked)}
                                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                                />
                                                Changed only
                                            </label>

                                            <div className="flex items-center gap-2 text-xs font-mono">
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                                    Total: {reportStats.total}
                                                </span>
                                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                                    Modified: {reportStats.changed}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 max-h-96 overflow-auto custom-scrollbar space-y-1.5 font-mono text-xs">
                                        {filteredReport.length > 0 ? (
                                            filteredReport.map((log, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`flex items-start gap-3 p-2 rounded transition-colors ${
                                                        log.isHeader ? 'bg-slate-100 font-bold text-slate-900 mt-3 first:mt-0 border border-slate-200' :
                                                        log.isDivider ? 'border-t border-slate-100 my-1 py-0' :
                                                        log.isChanged ? 'bg-amber-50/70 border border-amber-200 text-amber-900' :
                                                        'hover:bg-slate-50 text-slate-700'
                                                    }`}
                                                >
                                                    {!log.isDivider && (
                                                        <span className="text-slate-400 select-none shrink-0 w-8 text-right text-[11px]">
                                                            {i + 1}.
                                                        </span>
                                                    )}
                                                    <span className="flex-grow break-all">
                                                        {log.text}
                                                    </span>
                                                    {log.isChanged && (
                                                        <span className="shrink-0 text-[9px] bg-amber-200/60 text-amber-800 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                                                            Modified
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-slate-400 text-xs italic">
                                                {report.length === 0 ? "Execute sequence to generate detailed audit trail." : "No entries matched your search query."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Standard Feature Info Reference Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Hash className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">Sequential IDs (+5 Step)</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Standardizes all <code className="text-slate-700 font-mono font-semibold">&lt;ce:affiliation&gt;</code> IDs to <code className="text-emerald-700 font-mono">af0005</code>, <code className="text-emerald-700 font-mono">af0010</code>, <code className="text-emerald-700 font-mono">af0015</code>... in occurrence order.
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">Cross-Ref Synchronization</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Automatically re-links author <code className="text-slate-700 font-mono font-semibold">refid</code> attributes and <code className="text-slate-700 font-mono font-semibold">&lt;ce:sup&gt;</code> labels to maintain accurate author-to-affiliation links.
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Check className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">DTD Integrity Preservation</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Preserves internal <code className="text-slate-700 font-mono font-semibold">affiliation-id</code>, author names, cross-ref own IDs (<code className="text-slate-700 font-mono font-semibold">id="cf..."</code>), and document markup strictly intact.
                        </p>
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AffiliationSequencer;
