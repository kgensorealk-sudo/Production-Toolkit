import React, { useState, useRef, useEffect } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { SmartSuggestion, ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

import { ID_RULES, auditElementIds, repairElementIds, analyzeIdLinks, createIdQaReport, IdQaReport, IdAuditItem, PrefixOverrides } from '../utils/idAuditorEngine';
type AuditItem = IdAuditItem;
const ID_CONFIG = ID_RULES;

const IdAuditor: React.FC = () => {
    const [input, setInput] = useState('');
    const [prefixOverrides, setPrefixOverrides] = useState<PrefixOverrides>({});
    const [output, setOutput] = useState('');
    const [qaReport, setQaReport] = useState<IdQaReport | null>(null);
    const inputKey = JSON.stringify([input, prefixOverrides]);
    const inputKeyRef = useRef(inputKey);
    const operationRef = useRef(0);
    inputKeyRef.current = inputKey;
    const invalidateGeneratedResult = () => { operationRef.current++; setIsLoading(false); setOutput(''); setDiffElements(null); setSuggestions([]); setQaReport(null); };
    useEffect(() => { invalidateGeneratedResult(); }, [inputKey]);
    const [auditResults, setAuditResults] = useState<AuditItem[]>([]);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [step, setStep] = useState<'input' | 'audit' | 'result'>('input');
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'xml' | 'diff' | 'qa'>('xml');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Filter states for the audit view
    const [filterInvalidOnly, setFilterInvalidOnly] = useState(false);
    const [auditPage, setAuditPage] = useState(0);
    const [qaChangesPage, setQaChangesPage] = useState(0);
    const [qaIssuesPage, setQaIssuesPage] = useState(0);
    useEffect(() => setAuditPage(0), [auditResults, filterInvalidOnly]);
    useEffect(() => { setQaChangesPage(0); setQaIssuesPage(0); }, [qaReport]);

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
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let changeCount = 0;

        let i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';

            if (current.removed && diff[i+1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
                changeCount++;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
                changeCount++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
                changeCount++;
            } else {
                leftVal = rightVal = current.value; i++;
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
            for (let r = 0; r < maxRows; r++) {
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : '';
                 const rNum = rContent !== undefined ? rightLineNum++ : '';
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

                 rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                        data-change-row={type !== 'equal' ? "true" : undefined}
                        data-change-index={type !== 'equal' ? changeCount : undefined}
                        data-change-index-group={type !== 'equal' ? changeCount : undefined}
                    >
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                 );
            }
        }
        
        setTotalChanges(changeCount);
        setCurrentChangeIndex(changeCount > 0 ? 1 : 0);

        setDiffElements(
            <table className="w-full text-sm font-mono border-collapse table-fixed bg-white">
                <colgroup>
                    <col className="w-12 bg-slate-50 border-r border-slate-200" />
                    <col className="w-[calc(50%-3rem)]" />
                    <col className="w-12 bg-slate-50 border-r border-slate-200 border-l border-slate-200" />
                    <col className="w-[calc(50%-3rem)]" />
                </colgroup>
                <tbody>{rows}</tbody>
            </table>
        );
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

    const runAudit = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        const snapshot = inputKeyRef.current;
        const operation = ++operationRef.current;
        setIsLoading(true);
        setTimeout(() => {
            if (operation !== operationRef.current || snapshot !== inputKeyRef.current) return;
            try {
                const results = auditElementIds(input, prefixOverrides);
                setQaReport(createIdQaReport(input));
                // Smart Suggestions Logic (Background Scanner)
                const newSuggestions: SmartSuggestion[] = [];
                
                // 1. XML Normalizer (Renumber)
                const labelRegex = /<ce:label>\[?(\d+)\]?<\/ce:label>/gi;
                let lastLabel = 0;
                let outOfSequence = false;
                let labelMatch;
                while ((labelMatch = labelRegex.exec(input)) !== null) {
                    const currentLabel = parseInt(labelMatch[1]);
                    if (currentLabel !== lastLabel + 1 && lastLabel !== 0) {
                        outOfSequence = true;
                        break;
                    }
                    lastLabel = currentLabel;
                }
                if (outOfSequence) {
                    newSuggestions.push({
                        id: 'xml-renumber',
                        toolName: 'XML Normalizer',
                        description: 'It is found that the XML contains out-of-sequence numbered references. Please use the XML Normalizer to re-sequence the bibliography.',
                        path: '/xmlRenumber',
                        icon: <Hash className="w-4 h-4" />,
                        condition: 'Out-of-sequence references detected'
                    });
                }

                // 2. Other-Refs Scanner
                const otherRefCount = (input.match(/<ce:other-ref/g) || []).length;
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
                const tagMatches = input.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
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

                // Recommendations use decoded structural targets, including IDREFS lists.
                const links = analyzeIdLinks(input);
                if (links.unlinkedCitations || links.brokenTargets || links.ambiguousTargets.length) {
                    newSuggestions.push({
                        id: 'citation-linker', toolName: 'Citation Linker Pro',
                        description: 'Citation or local link targets are missing, unresolved, or ambiguous. Review targets with Citation Linker Pro.',
                        path: '/citationLinker', icon: <LinkIcon className="w-4 h-4" />,
                        condition: 'Link targets need review'
                    });
                }
                // Resolve link uncertainty before recommending reference cleanup.
                if (links.uncitedCount && !links.unlinkedCitations && !links.brokenTargets && !links.ambiguousTargets.length) {
                    newSuggestions.push({
                        id: 'uncited-cleaner', toolName: 'Uncited Ref Cleaner',
                        description: `The XML contains ${links.uncitedCount} reference(s) without a citation target. Review them with Uncited Ref Cleaner.`,
                        path: '/uncitedCleaner', icon: <Eraser className="w-4 h-4" />,
                        condition: 'Uncited references detected'
                    });
                }

                // 6. View Synchronizer
                const complexNodeCount = (input.match(/<(ce:table|ce:figure|ce:display-formula|ce:list)\b/g) || []).length;
                if (complexNodeCount > 0 && input.includes('<ce:para>')) {
                    newSuggestions.push({
                        id: 'view-sync',
                        toolName: 'View Synchronizer',
                        description: `It is found that the XML contains ${complexNodeCount} complex structural nodes. Please use the View Synchronizer to ensure visual consistency between XML source and rendered views.`,
                        path: '/viewSync',
                        icon: <RefreshCw className="w-4 h-4" />,
                        condition: 'Complex structural nodes detected'
                    });
                }

                // 7. Reference Structure Repair
                if (input.includes('<ce:source-text')) {
                    newSuggestions.push({
                        id: 'structural-architect',
                        toolName: 'Reference Structure Repair v3.2',
                        description: 'It is found that the XML contains unstructured source text. Please use Reference Structure Repair to transform raw source text into valid structural bibliography nodes.',
                        path: '/structuralArchitect',
                        icon: <Box className="w-4 h-4" />,
                        condition: 'Structural overhaul recommended'
                    });
                }

                setSuggestions(newSuggestions);

                if (results.length === 0) {
                    setAuditResults([]);
                    setToast({ msg: "No configured elements or existing IDs to audit.", type: "info" });
                    setIsLoading(false);
                } else {
                    results.sort((a, b) => {
                        if (a.status === 'invalid' && b.status === 'valid') return -1;
                        if (a.status === 'valid' && b.status === 'invalid') return 1;
                        return a.tagName.localeCompare(b.tagName);
                    });
                    
                    setAuditResults(results);
                    setActiveTab('xml');
                    setStep('audit');
                    const invalidCount = results.filter(r => !r.needsPrefix && r.status === 'invalid').length;
                    
                    if (invalidCount > 0) {
                        setToast({ msg: `Found ${invalidCount} ID violations.`, type: "warn" });
                    } else {
                        setToast({ msg: "ID checks passed.", type: "success" });
                    }
                    setIsLoading(false);
                }
            } catch (err) {
                setAuditResults([]);
                setQaReport(null);
                setToast({ msg: err instanceof Error ? err.message : "Audit system failure.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const executeFix = () => {
        const snapshot = inputKeyRef.current;
        const operation = ++operationRef.current;
        setIsLoading(true);
        setTimeout(() => {
            if (operation !== operationRef.current || snapshot !== inputKeyRef.current) return;
            try {
                const {output: processedXml} = repairElementIds(input, prefixOverrides);
                const links = analyzeIdLinks(processedXml);
                setQaReport(createIdQaReport(input, processedXml));
                // Refresh only link-related recommendations against the actual output.
                setSuggestions(previous => {
                    const updated = previous.filter(item => item.id !== 'citation-linker' && item.id !== 'uncited-cleaner');
                    if (links.unlinkedCitations || links.brokenTargets || links.ambiguousTargets.length) {
                        updated.push({id:'citation-linker', toolName:'Citation Linker Pro', description:'ID correction left citation or local link targets requiring review. Use Citation Linker Pro to resolve them.', path:'/citationLinker', icon:<LinkIcon className="w-4 h-4" />, condition:'Link targets need review'});
                    } else if (links.uncitedCount) {
                        updated.push({id:'uncited-cleaner', toolName:'Uncited Ref Cleaner', description:`The XML contains ${links.uncitedCount} reference(s) without a citation target. Review them with Uncited Ref Cleaner.`, path:'/uncitedCleaner', icon:<Eraser className="w-4 h-4" />, condition:'Uncited references detected'});
                    }
                    return updated;
                });
                setOutput(processedXml);
                generateDiff(input, processedXml);
                setActiveTab('xml');
                setStep('result');
                setToast(auditResults.some(row => row.needsPrefix) ? {msg:"Configured IDs corrected. Unconfigured elements were preserved; see the QA Report.", type:"warn"} : links.unlinkedCitations || links.brokenTargets ? {msg:"IDs corrected. Some citation or local link targets require review with Citation Linker Pro.", type:"warn"} : {msg:"IDs corrected.", type:"success"});
                setIsLoading(false);
            } catch (err) {
                setOutput('');
                setDiffElements(null);
                setToast({ msg: err instanceof Error ? err.message : "ID correction failed.", type: "error" });
                setIsLoading(false);
            }
        }, 800);
    };

    const filteredResults = auditResults.filter(item => {
        if (item.needsPrefix) return false;
        if (filterInvalidOnly && item.status === 'valid') return false;
        return true;
    });

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAudit : (step === 'audit' ? executeFix : undefined),
        onClear: () => { invalidateGeneratedResult(); setInput(''); setAuditResults([]); setStep('input'); }
    }, [input, auditResults, step]);

    const qaContent = qaReport && (
                <section id="id-qa-report" className="p-6 bg-white rounded-2xl">
                    <h3 className="font-bold text-lg text-slate-900">QA Report — {qaReport.changes.length} ID changes; {qaReport.issues.length} link issues</h3>
                    <div className="mt-4 space-y-4">
                        <p className="text-sm text-slate-600">Review what happened and the affected targets before using another tool. Citation and link attributes remain unchanged.</p>
                        {auditResults.some(row => row.needsPrefix) && <div className="bg-sky-50 border border-sky-200 p-4 rounded-lg text-sky-900 space-y-3">
                            <h3 className="font-semibold">Unconfigured prefixes — skipped elements</h3>
                            <p className="text-sm">These tags have no configured prefix. Existing IDs are preserved and missing IDs remain missing. IDs are generated for configured tags. Set a prefix and re-audit to include the skipped elements.</p>
                            <div className="overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Tag</th><th className="p-2">Prefix</th><th className="p-2">Elements</th><th className="p-2">IDs left unchanged</th></tr></thead><tbody>
                                {[...new Set(auditResults.filter(row => row.needsPrefix).map(row => row.tagName))].map(tag => {
                                    const skipped = auditResults.filter(row => row.needsPrefix && row.tagName === tag);
                                    return <tr key={tag} className="border-t border-sky-200"><td className="p-2 font-mono">{tag}</td><td className="p-2">Not configured</td><td className="p-2">{skipped.length}</td><td className="p-2 font-mono break-words">{[...new Set(skipped.map(row => row.originalId || '(missing)'))].join(', ')}</td></tr>;
                                })}
                            </tbody></table></div>
                        </div>}
                        {qaReport.changes.length > 0 && <div className="overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Element / line</th><th>Before ID</th><th>After ID</th><th>Why changed</th></tr></thead><tbody>{qaReport.changes.slice(qaChangesPage * 50, (qaChangesPage + 1) * 50).map((change,index) => <tr key={index} className="border-t"><td className="p-2">{change.tag} / {change.line}</td><td className="p-2 font-mono">{change.before}</td><td className="p-2 font-mono">{change.after}</td><td className="p-2">{change.reason}</td></tr>)}</tbody></table>
                            {qaReport.changes.length > 50 && <div className="flex gap-3 items-center p-2"><button disabled={qaChangesPage===0} onClick={()=>setQaChangesPage(page=>page-1)}>Previous ID changes</button><span>Page {qaChangesPage+1} of {Math.ceil(qaReport.changes.length/50)}</span><button disabled={(qaChangesPage+1)*50>=qaReport.changes.length} onClick={()=>setQaChangesPage(page=>page+1)}>Next ID changes</button></div>}
                        </div>}
                        {qaReport.issues.length === 0 ? <p className="text-sm text-emerald-700">No unresolved or ambiguous citation/local-link targets were found. Citation Linker Pro is not recommended by this check.</p> : <>
                            <h3 className="font-semibold">Why link review is recommended</h3>
                            {qaReport.issues.slice(qaIssuesPage * 50, (qaIssuesPage + 1) * 50).map((issue,index) => <article key={index} className="p-4 border border-amber-200 bg-amber-50 rounded-xl text-sm space-y-2">
                                <p className="font-semibold">{issue.tag} · ID {issue.elementId} · line {issue.line} · target {issue.target}</p>
                                <p>Context: {issue.text || '(empty element)'}</p>
                                <p>Before: {issue.before} After: {issue.after}</p>
                                <p>{issue.reason}</p>
                                {issue.owners.map((owner,ownerIndex) => <p key={ownerIndex} className="font-mono break-words">Target evidence: {owner}</p>)}
                                <p className="font-semibold">Recommended action: {issue.action}</p>
                            </article>)}
                            {qaReport.issues.length > 50 && <div className="flex gap-3 items-center"><button disabled={qaIssuesPage===0} onClick={()=>setQaIssuesPage(page=>page-1)}>Previous link issues</button><span>Page {qaIssuesPage+1} of {Math.ceil(qaReport.issues.length/50)}</span><button disabled={(qaIssuesPage+1)*50>=qaReport.issues.length} onClick={()=>setQaIssuesPage(page=>page+1)}>Next link issues</button></div>}
                            {!qaReport.issues.some(issue => issue.kind === 'ambiguous-target') && <button onClick={() => navigate('/citationLinker', {state:{transferredXml:step === 'result' ? output : input,sourceTool:'ID Prefix Auditor'}})} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Open Citation Linker Pro with this XML</button>}
                        </>}
                    </div>
                </section>
            );

    return (
        <div className={`max-w-full mx-auto px-2 sm:px-4 lg:px-6 ${step === 'result' ? 'py-3' : 'py-8'}`}>
            <div className={`text-center animate-fade-in ${step === 'result' ? 'mb-3' : 'mb-10'}`}>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-2 uppercase tracking-tighter">ID Prefix Auditor</h1>
                <p className="text-sm text-slate-500 max-w-2xl mx-auto font-light italic tracking-tight leading-relaxed">
                    Check and generate element IDs with the required prefixes and four-digit numbering. Review the QA Report for any citation targets affected by ID changes.
                </p>
            </div>

            {/* Architectural Recommendations Section matching Citation Linker Pro */}
            {suggestions.length > 0 && (step === 'audit' || step === 'result') && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-6 bg-indigo-50/30 border-2 border-indigo-100 rounded-[2rem] border-dashed">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        if (sug.id === 'citation-linker') {
                                            setActiveTab('qa');
                                            return;
                                        }
                                        navigate(sug.path, { state: { transferredXml: step === 'result' ? output : input, sourceTool: 'ID Prefix Auditor' } });
                                    }}
                                    className="flex items-center gap-4 p-4 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">{sug.id === 'citation-linker' ? 'Review QA Report for Citation Linker Pro' : sug.toolName}</div>
                                        <div className="text-[9px] text-indigo-500 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className={`bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 flex flex-col relative transition-all duration-500 overflow-hidden ${step === 'result' ? 'h-[calc(100vh-170px)] min-h-[650px]' : 'h-[calc(100vh-320px)] min-h-[750px]'}`}>
                {isLoading && <LoadingOverlay message="Executing Structural Protocol Check..." color="slate" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-4 sm:px-10 py-6 border-b border-slate-100 flex items-center gap-4">
                            <div className="flex items-center gap-6 flex-1 min-w-0">
                                <label className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em] shrink-0">Protocols</label>
                                <div className="flex gap-2 min-w-0 overflow-x-auto whitespace-nowrap">
                                    {ID_CONFIG.filter(c => c.prefix).reduce((acc, c) => {
                                        if (!acc.find(item => item.prefix === c.prefix)) {
                                            acc.push(c);
                                        }
                                        return acc;
                                    }, [] as typeof ID_CONFIG).map(c => (
                                        <span key={c.tag} className="px-2 py-1 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-50 shadow-sm uppercase">
                                            <span className="text-slate-500">{c.tag.split(':').pop()}:</span> <span className="text-indigo-600 font-black">{c.prefix}####{c.codedPrefix ? ` / ${c.codedPrefix}#### (code)` : ''}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => { invalidateGeneratedResult(); setInput(''); setAuditResults([]); }} className="shrink-0 whitespace-nowrap text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline transition-all">Reset Input</button>
                        </div>
                        <div className="flex-grow flex flex-col relative bg-slate-50/30">
                            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
                            <textarea 
                                value={input} 
                                onChange={e => setInput(e.target.value)} 
                                className="flex-grow p-12 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder:text-slate-400 z-10" 
                                placeholder="Paste XML to generate missing IDs for configured tags and audit existing IDs, duplicates, prefixes and four-digit numbering. Only ID attributes will be changed."
                                spellCheck={false}
                            />
                        </div>
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runAudit} className="bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-20 rounded-[2.5rem] shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.3em]">
                                Execute Global Audit
                            </button>
                        </div>
                    </div>
                )}

                {step === 'audit' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10 overflow-x-auto">
                            <div className="flex flex-col shrink-0">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Audit Matrix</h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${auditResults.some(r => !r.needsPrefix && r.status === 'invalid') ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                                        {auditResults.filter(r => !r.needsPrefix && r.status === 'invalid').length} Non-Compliant Nodes
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 ml-4">
                                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button 
                                        onClick={() => setFilterInvalidOnly(!filterInvalidOnly)} 
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterInvalidOnly ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Violations
                                    </button>
                                </div>
                                <button onClick={() => setStep('input')} className="px-6 py-2 rounded-xl text-xs font-black text-slate-400 hover:text-slate-600 uppercase transition-all tracking-widest">Return</button>
                                <button onClick={runAudit} className="text-xs font-bold text-indigo-600">Re-audit IDs</button>
                                <button onClick={() => setActiveTab(activeTab === 'qa' ? 'xml' : 'qa')} className="text-xs font-bold text-indigo-600">{activeTab === 'qa' ? 'Back to audit' : 'QA Report'}</button>
                                <button onClick={executeFix} disabled={!auditResults.some(r => r.status === 'invalid') || auditResults.some(r => r.needsReview)} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                    Fix All Violations
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {activeTab === 'qa' ? qaContent : <>
                            {auditResults.some(r => r.needsReview) && <p role="alert" className="p-4 rounded-xl bg-amber-50 text-amber-900 text-sm">Linked duplicate IDs require review in the original XML. Automatic correction is blocked. Resolve which elements and citations belong together, then re-audit.</p>}
                            {filteredResults.length > 50 && <div className="flex gap-4 items-center text-sm"><button disabled={auditPage===0} onClick={()=>setAuditPage(page=>page-1)}>Previous audit page</button><span>Page {auditPage+1} of {Math.ceil(filteredResults.length/50)} ({filteredResults.length} elements)</span><button disabled={(auditPage+1)*50>=filteredResults.length} onClick={()=>setAuditPage(page=>page+1)}>Next audit page</button></div>}
                            {filteredResults.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-300 italic uppercase tracking-widest text-sm text-center">No items matching current matrix filters</div>
                            ) : (
                                filteredResults.slice(auditPage * 50, (auditPage + 1) * 50).map((res, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`p-6 bg-white border-2 rounded-[2rem] flex items-center gap-8 transition-all hover:shadow-lg ${res.needsPrefix && !res.isDuplicate ? 'border-sky-200 bg-sky-50/30' : res.status === 'invalid' ? 'border-rose-200 bg-rose-50/20 shadow-sm' : 'border-slate-100'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full shrink-0 ${res.needsPrefix && !res.isDuplicate ? 'bg-sky-500' : res.status === 'invalid' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                        <div className="min-w-0 flex-grow">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className={`text-[10px] font-mono font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${res.status === 'invalid' && !res.id.toLowerCase().startsWith(res.expectedPrefix) ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                    {res.originalId}
                                                </span>
                                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${res.needsPrefix ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                                    Tag: {res.tagName} · {res.prefixSource === 'editor' ? 'Editor rule' : res.prefixSource === 'workflow' ? 'Workflow rule' : res.prefixSource === 'observed' ? 'Observed convention' : res.prefixSource === 'custom' ? 'Custom prefix' : 'Unconfigured'}
                                                </span>
                                                {res.isDuplicate && (
                                                    <span className="text-[9px] font-black uppercase bg-rose-600 text-white px-2 py-1 rounded border border-rose-700 shadow-sm">
                                                        Duplicate ID
                                                    </span>
                                                )}
                                                {res.isLengthViolation && (
                                                    <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-1 rounded border border-rose-600 shadow-sm">
                                                        ID Length Violation
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-500 italic truncate pr-8 leading-relaxed font-serif">{res.preview}</p>
                                            {res.reason && <p className={`text-xs mt-2 ${res.needsPrefix && !res.isDuplicate ? 'text-sky-700' : 'text-rose-600'}`}>{res.reason}</p>}
                                            {res.needsPrefix && <label className="block text-xs mt-2">Prefix for {res.tagName}: <input aria-label={`Prefix for ${res.tagName}`} className="border rounded px-2 py-1" value={prefixOverrides[res.tagName] || ''} onChange={e => setPrefixOverrides(previous => ({...previous, [res.tagName]: e.target.value}))} placeholder="Lowercase letters" /></label>}
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end">
                                            <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${res.needsPrefix && !res.isDuplicate ? 'text-sky-700' : res.status === 'invalid' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {res.needsPrefix && !res.isDuplicate ? 'Skipped — prefix not configured' : res.status === 'invalid' ? 'Correction Required' : 'Protocol Compliant'}
                                            </div>
                                            {res.status === 'invalid' && !res.needsPrefix && (
                                                <div className="text-[10px] font-bold text-slate-400 text-right">
                                                    Expected: <span className="text-indigo-600 font-black">{res.expectedPrefix}####</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            </>}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
                        <div className="bg-white border-b border-slate-200 shrink-0 z-20 rounded-t-[2.5rem] shadow-xs">
                            <div className="bg-slate-50 px-6 sm:px-10 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-[2.5rem]">
                                <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">Corrected Protocol Stream</h3>
                                <div className="flex gap-4">
                                    <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Corrected XML Copied!', type:'success'}); }} className="bg-emerald-600 text-white border border-emerald-700 px-6 py-2.5 rounded-xl text-[10px] font-black hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-widest">Export Result</button>
                                    <button onClick={() => { setStep('input'); setAuditResults([]); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Start New Session</button>
                                </div>
                            </div>
                            <div className="bg-white px-6 sm:px-10 pt-3 flex items-center justify-between">
                                <div className="flex space-x-4 overflow-x-auto">
                                    <button onClick={() => setActiveTab('xml')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'xml' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Normalized Source</button>
                                    <button onClick={() => setActiveTab('diff')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'diff' ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Correction Log (Diff)</button>
                                    <button onClick={() => setActiveTab('qa')} className={`shrink-0 px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'qa' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>QA Report</button>
                                </div>

                                {activeTab === 'diff' && totalChanges > 0 && (
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs mb-2">
                                        <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
                                            <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                                <GitCompare className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2.5} />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Changes:</span>
                                                <span className="text-xs font-black text-slate-900 font-mono tabular-nums">
                                                    {currentChangeIndex} <span className="text-slate-300">/</span> {totalChanges}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => scrollToChange('prev')}
                                                className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded-md transition-all text-slate-600 hover:text-indigo-600 group"
                                                title="Previous Change (Shift+Tab)"
                                            >
                                                <ChevronUp className="w-4 h-4 group-active:-translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                            </button>
                                            <button 
                                                onClick={() => scrollToChange('next')}
                                                className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded-md transition-all text-slate-600 hover:text-indigo-600 group"
                                                title="Next Change (Tab)"
                                            >
                                                <ChevronDown className="w-4 h-4 group-active:translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-grow relative bg-slate-50 min-h-0 overflow-hidden rounded-b-[2.5rem]">
                            {activeTab === 'qa' && <div className="absolute inset-0 overflow-auto custom-scrollbar p-6">{qaContent}</div>}
                            {activeTab === 'xml' && (
                                <div className="absolute inset-0 p-6 sm:p-8">
                                    <textarea 
                                        readOnly
                                        value={output}
                                        className="h-full w-full p-8 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner focus:ring-0 resize-none leading-relaxed outline-none custom-scrollbar"
                                    />
                                </div>
                            )}
                            {activeTab === 'diff' && (
                                <div 
                                    ref={diffContainerRef}
                                    className="absolute inset-0 overflow-auto custom-scrollbar p-6 rounded-b-[2.5rem]"
                                >
                                    {diffElements}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default IdAuditor;
