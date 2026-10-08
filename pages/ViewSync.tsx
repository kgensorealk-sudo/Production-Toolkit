
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffWordsWithSpace, diffChars, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Search, AlertCircle, AlertTriangle, CheckCircle, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box, Maximize2, Minimize2, Sparkles, Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';
import {inspectViews, viewDifferences, synchronizeViews, repairViewOrphans} from '../utils/viewSyncEngine';
import {scanReferenceXml} from '../utils/referenceUpdaterXml';

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
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [syncDirection, setSyncDirection] = useState<'compact-to-extended' | 'extended-to-compact'>('compact-to-extended');
    const [customStartId, setCustomStartId] = useState<string>('');
    const [orphans, setOrphans] = useState<{type: 'compact' | 'extended', id: string, text: string}[]>([]);
    
    // View State
    const [activeTab, setActiveTab] = useState<'raw' | 'diff' | 'report' | 'mismatches' | 'orphans'>('raw');
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

    const operationRef = useRef(0);
    const scanSnapshotRef = useRef('');
    const resetResults = () => {
        setOutput(''); setLastProcessedInput(''); setLogs([]);
        setSuggestions([]); setOrphans([]); setMismatches([]); setSelectedMismatches(new Set());
        setDiffRows([]); setTotalChanges(0); setCurrentChangeIndex(0); setIsLoading(false);
        scanSnapshotRef.current = '';
    };
    useLayoutEffect(() => {
        operationRef.current++;
        resetResults();
        return () => { operationRef.current++; };
    }, [input, syncDirection, customStartId]);

    const renderMismatchDiff = (text1: string, text2: string, side: 'compact' | 'extended') =>
        diffWordsWithSpace(text1,text2).map((part,i) => {
            if ((side === 'compact' && part.added) || (side === 'extended' && part.removed)) return null;
            return <span key={i} className={part.added ? 'bg-emerald-100 text-emerald-900' : part.removed ? 'bg-rose-100 text-rose-900' : ''}>{part.value}</span>;
        });

    const reportError = (error: unknown) => {
        resetResults();
        setToast({msg: error instanceof Error ? error.message : 'Unable to process XML safely.',type:'error'});
    };
    const scanForMismatches = () => {
        const operation=++operationRef.current;
        setIsLoading(true);
        setTimeout(() => {
            if(operation!==operationRef.current)return;
            try {
                const result=viewDifferences(input);
                scanSnapshotRef.current=input;
                setMismatches(result.mismatches);
                setSelectedMismatches(new Set(result.mismatches.map(m=>m.index)));
                setOrphans(result.audit.orphans.map(n=>({type:n.attributes.view==='extended'?'extended':'compact',id:n.attributes.id || '(missing ID)',text:result.audit.textContent(n)})));
                setLogs(result.audit.notices.map((n,i)=>({id:i+1,paraId:n.paraId,status:'warning',message:n.message,detectedRefs:[]})));
                setActiveTab(result.audit.notices.length?'report':result.audit.orphans.length?'orphans':'mismatches');
                setToast({msg:`${result.mismatches.length} content or link differences; ${result.audit.orphans.length} unpaired views; ${result.audit.notices.length} ambiguous groups.`,type:result.mismatches.length||result.audit.orphans.length||result.audit.notices.length?'warn':'success'});
            } catch(error){reportError(error);} finally{setIsLoading(false);}
        },500);
    };
    const toggleMismatchSelection = (index: number) => {
        const next=new Set(selectedMismatches);
        if(next.has(index))next.delete(index);else next.add(index);
        setSelectedMismatches(next);
    };
    const processSync = (specificIndices?:Set<number>) => {
        if(specificIndices && scanSnapshotRef.current!==input){reportError(new Error('Input changed since the scan. Scan again before synchronizing selected pairs.'));return;}
        const operation=++operationRef.current;
        setIsLoading(true);
        setTimeout(() => {
            if(operation!==operationRef.current)return;
            try {
                const result=synchronizeViews(input,syncDirection,customStartId,specificIndices);
                const newLogs:SyncLog[]=result.notices.map((n,i)=>({id:i+1,paraId:n.paraId,status:'warning',message:n.message,detectedRefs:[]}));
                const modifications:RefModification[]=[];
                for(const change of result.applied){
                    const before=scanReferenceXml('<ce:para>'+change.before+'</ce:para>');
                    const after=scanReferenceXml('<ce:para>'+change.after+'</ce:para>');
                    const refs=(parsed:typeof before)=>parsed.nodes.filter(n=>['ce:cross-ref','ce:cross-refs','ce:inter-ref','ce:intra-ref','ce:float-anchor'].includes(n.name)).map(n=>({tagName:n.name,refid:n.attributes.refid || n.attributes['xlink:href'],text:parsed.textContent(n)}));
                    const oldRefs=refs(before),newRefs=refs(after);
                    newLogs.push({id:newLogs.length+1,paraId:change.paraId,status:'success',message:'Synchronized content with proven target ownership. Review the diff for removed or changed content.',detectedRefs:newRefs});
                    const remainingNew=[...newRefs];
                    const remainingOld=oldRefs.filter(old=>{
                        const index=remainingNew.findIndex(next=>old.tagName===next.tagName && old.text===next.text && old.refid===next.refid);
                        if(index<0)return true;
                        remainingNew.splice(index,1);return false;
                    });
                    const changes:{old?:typeof oldRefs[number];next?:typeof newRefs[number]}[]=[];
                    for(const old of remainingOld){
                        const matches=remainingNew.filter(next=>next.tagName===old.tagName && next.text===old.text);
                        const uniqueOld=remainingOld.filter(other=>other.tagName===old.tagName && other.text===old.text).length===1;
                        const next=uniqueOld && matches.length===1?matches[0]:undefined;
                        if(next)remainingNew.splice(remainingNew.indexOf(next),1);
                        changes.push({old,next});
                    }
                    changes.push(...remainingNew.map(next=>({next})));
                    for(const {old,next} of changes){
                        const supplementary=(id?:string)=>!!id && id.trim().split(/\s+/).every(token=>/^ec\d+$/.test(token));
                        const intentional=(!next && supplementary(old?.refid)) || (!old && supplementary(next?.refid));
                        const message=intentional?next?`Restored supplementary citation "${next.text}" with proven target ${next.refid}.`:`Converted supplementary citation "${old?.text}" to compact plain text.`:old && next?`Citation target changed: ${old.refid || '(none)'} -> ${next.refid || '(none)'}.`:next?`Added citation link: ${next.refid || '(none)'}.`:`Removed citation link: ${old?.refid || '(none)'}.`;
                        modifications.push({id:'mod-'+modifications.length,paraId:change.paraId,type:'citation_changed',originalRefText:old?.text,newRefText:next?.text || '(removed)',originalRefId:old?.refid,newRefId:next?.refid,resultSnippet:next?`<${next.tagName} refid="${next.refid}">${next.text}</${next.tagName}>`:'(removed)',message,severity:intentional?'info':'warning'});
                    }
                }
                for(const modification of modifications)newLogs.push({id:newLogs.length+1,paraId:modification.paraId,status:modification.severity==='info'?'success':'warning',message:modification.message,detectedRefs:[]});
                for(const n of result.audit.orphans)newLogs.push({id:newLogs.length+1,paraId:n.attributes.id || '(missing ID)',status:'warning',message:'Unpaired view preserved. Use orphan review before creating a counterpart.',detectedRefs:[]});
                if(!newLogs.length)newLogs.push({id:1,paraId:'QA',status:result.audit.pairs.length?'success':'warning',message:result.audit.pairs.length?'No changes needed in verified pairs.':'No verified adjacent view pairs found. Review the source and scan again.',detectedRefs:[]});
                setOutput(result.output);setLastProcessedInput(input);setLogs(newLogs);generateDiff(input,result.output);
                const audit=inspectViews(result.output);
                setOrphans(audit.orphans.map(n=>({type:n.attributes.view==='extended'?'extended':'compact',id:n.attributes.id || '(missing ID)',text:audit.textContent(n)})));
                setSuggestions([]);setActiveTab(result.notices.length?'report':modifications.length?'report':'diff');
                setToast({msg:`Updated ${result.applied.length} paragraphs; ${result.notices.length} groups preserved for review.`,type:result.notices.length?'warn':'success'});
            }catch(error){reportError(error);}finally{setIsLoading(false);}
        },800);
    };
    const fixOrphans = () => {
        const operation=++operationRef.current;
        setIsLoading(true);
        setTimeout(() => {
            if(operation!==operationRef.current)return;
            try{
                const result=repairViewOrphans(input,customStartId);
                setOutput(result.output);setLastProcessedInput(input);generateDiff(input,result.output);
                setLogs([{id:1,paraId:'ORPHAN REVIEW',status:result.notices.length?'warning':'success',message:`Created ${result.created} verified counterparts.`,detectedRefs:[]},...result.notices.map((n,i)=>({id:i+2,paraId:n.paraId,status:'warning' as const,message:n.message,detectedRefs:[]}))]);
                setSuggestions([]);
                const audit=inspectViews(result.output);
                setOrphans(audit.orphans.map(n=>({type:n.attributes.view==='extended'?'extended':'compact',id:n.attributes.id || '(missing ID)',text:audit.textContent(n)})));
                setActiveTab(result.notices.length?'report':'diff');
                setToast({msg:`Created ${result.created} counterparts; ${result.notices.length} groups need review.`,type:result.notices.length?'warn':'success'});
            }catch(error){reportError(error);}finally{setIsLoading(false);}
        },800);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Result copied!", type: "success" }));
    };

    const clearAll = () => {
        operationRef.current++;
        resetResults();
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
                                    type="text" inputMode="numeric" maxLength={4} aria-label="Starting ID number"
                                    value={customStartId}
                                    onChange={(e) => setCustomStartId(e.target.value)}
                                    placeholder="Auto (3000)"
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
                         {['raw', 'diff', 'report', 'mismatches', 'orphans'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`py-2 px-3 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab 
                                    ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'raw' && 'Raw XML'}
                                {tab === 'diff' && 'Diff View'}
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
                                                type="checkbox" aria-label="Select all mismatched pairs"
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
                                                        These pairs differ in text, formatting, or citation targets. XML is shown when the visible text matches. Extended views retain supplementary links; compact views show plain text. Ordinary links remain in both. File display blocks and ambiguous targets require review.
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
                                                                    aria-label={`Select pair ${m.paraId}`}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    onChange={() => toggleMismatchSelection(m.index)}
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
                                            <p className="text-xs mt-2">Scan the current source to compare verified adjacent pairs. Unpaired or ambiguous views require review.</p>
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
                                            Generate Safe Missing Partners
                                        </button>
                                    )}
                                    {orphans.length > 0 && (
                                        <span className="text-[10px] font-black text-rose-600 px-2 py-0.5 bg-rose-50 rounded-full border border-rose-100">
                                            {orphans.length} Need Review
                                        </span>
                                    )}
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar p-4">
                                    {orphans.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                                                <p className="text-xs text-rose-700">
                                                    These paragraphs have no verified adjacent counterpart. Review their location before generating partners. Supplementary/display content is preserved for manual review.
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
