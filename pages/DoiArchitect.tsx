import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Diff from 'diff';
import { 
    Terminal, 
    Zap, 
    History, 
    Copy, 
    Download, 
    Cpu, 
    RotateCcw, 
    FileCode, 
    Check, 
    AlertCircle,
    Activity,
    ArrowRight,
    Search,
    Monitor,
    GitCompare,
    FileText,
    CheckCircle,
    Upload,
    Database,
    RefreshCw,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import Toast from '../components/Toast';

interface AuditItem {
    id: string;
    status: 'fixed' | 'warning' | 'skip';
    doi?: string;
    msg: string;
}

const DOIArchitect: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [viewMode, setViewMode] = useState<'output' | 'diff'>('output');
    const [auditData, setAuditData] = useState<AuditItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<'input' | 'analyzing' | 'completed'>('input');
    const [activeTab, setActiveTab] = useState<'input' | 'analysis' | 'result'>('input');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const analyzedDocRef = useRef<Document | null>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const wasWrappedRef = useRef<boolean>(false);

    const NS_DECLS = `xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/structbib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink"`;

    const analyzeXml = () => {
        if (!input.trim()) {
            setToast({ msg: 'Please enter XML source code', type: 'warn' });
            return;
        }

        setIsProcessing(true);
        const currentAudit: AuditItem[] = [];

        try {
            const parser = new DOMParser();
            const trimmedInput = input.trim();
            
            // Only skip wrapping if it's a formal XML document with a declaration.
            // Fragments (even with one tag) are safer to wrap to handle multiple top-level elements.
            const isFullXml = trimmedInput.startsWith('<?xml');
            wasWrappedRef.current = !isFullXml;
            
            const wrappedInput = isFullXml ? trimmedInput : `<root ${NS_DECLS}>${trimmedInput}</root>`;
            
            const xmlDoc = parser.parseFromString(wrappedInput, "text/xml");
            
            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                const errorMsg = xmlDoc.getElementsByTagName("parsererror")[0].textContent || "Malformed XML tags detected.";
                throw new Error(`Structural Error: ${errorMsg}`);
            }

            const references = Array.from(xmlDoc.getElementsByTagName("ce:bib-reference"));
            
            if (references.length === 0) {
                setToast({ msg: 'No <ce:bib-reference> tags found in source.', type: 'warn' });
                setIsProcessing(false);
                return;
            }

            references.forEach((ref, index) => {
                const refId = ref.getAttribute("id") || `REF_${index + 1}`;
                const sbRef = ref.getElementsByTagName("sb:reference")[0];
                if (!sbRef) {
                    currentAudit.push({ id: refId, status: 'skip', msg: 'MISSING: <sb:reference> not found.' });
                    return;
                }

                const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                let doi: string | null = null;
                let badHost: Element | null = null;
                let targetHost: Element | null = null;

                for (let host of hosts) {
                    const content = host.innerHTML;
                    const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                    
                    if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org'))) {
                        doi = doiMatch[0];
                        badHost = host;
                        break;
                    }
                }

                if (doi && badHost) {
                    targetHost = hosts.find(h => h !== badHost && (h.getElementsByTagName("sb:issue").length > 0 || h.getElementsByTagName("sb:pages").length > 0)) || null;
                    
                    if (targetHost) {
                        currentAudit.push({ id: refId, status: 'fixed', doi, msg: 'READY: DOI migration possible.' });
                    } else {
                        currentAudit.push({ id: refId, status: 'warning', doi, msg: 'WARNING: Target host missing for migration.' });
                    }
                } else {
                    currentAudit.push({ id: refId, status: 'skip', msg: 'VALID: No structural issues detected.' });
                }
            });

            analyzedDocRef.current = xmlDoc;
            setAuditData(currentAudit);
            setStep('analyzing');
            setActiveTab('analysis');
            setToast({ msg: `Analysis complete. Found ${references.length} references.`, type: 'success' });
        } catch (err: any) {
            setToast({ msg: err.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const executeRepair = () => {
        if (!analyzedDocRef.current) return;
        setIsProcessing(true);

        try {
            const xmlDoc = analyzedDocRef.current;
            const references = Array.from(xmlDoc.getElementsByTagName("ce:bib-reference"));
            const finalAudit: AuditItem[] = [];

            references.forEach((ref, index) => {
                const refId = ref.getAttribute("id") || `REF_${index + 1}`;
                const sbRef = ref.getElementsByTagName("sb:reference")[0];
                if (!sbRef) return;

                const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                let doi: string | null = null;
                let badHost: Element | null = null;
                let targetHost: Element | null = null;

                for (let host of hosts) {
                    const content = host.innerHTML;
                    const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                    if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org'))) {
                        doi = doiMatch[0];
                        badHost = host;
                        break;
                    }
                }

                if (doi && badHost) {
                    targetHost = hosts.find(h => h !== badHost && (h.getElementsByTagName("sb:issue").length > 0 || h.getElementsByTagName("sb:pages").length > 0)) || null;
                    
                    if (targetHost) {
                        badHost.parentNode?.removeChild(badHost);
                        const doiElem = xmlDoc.createElement("ce:doi");
                        doiElem.textContent = doi;
                        targetHost.appendChild(doiElem);
                        finalAudit.push({ id: refId, status: 'fixed', doi, msg: 'REPAIRED: DOI migrated successfully.' });
                    } else {
                        finalAudit.push({ id: refId, status: 'warning', doi, msg: 'SKIPPED: Target host missing.' });
                    }
                } else {
                    finalAudit.push({ id: refId, status: 'skip', msg: 'VALID: No changes required.' });
                }
            });

            const serializer = new XMLSerializer();
            let xmlOutput = serializer.serializeToString(xmlDoc);
            
            // If we wrapped it during analysis, unwrap it now
            if (wasWrappedRef.current) {
                xmlOutput = xmlOutput.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
            }
            
            setOutput(xmlOutput);
            setAuditData(finalAudit);
            setStep('completed');
            setActiveTab('result');
            setCurrentChangeIndex(-1);
            setToast({ msg: 'Repair protocol executed successfully', type: 'success' });
        } catch (err: any) {
            setToast({ msg: err.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setInput(e.target?.result as string);
            setToast({ msg: 'File imported successfully', type: 'success' });
        };
        reader.readAsText(file);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(output);
        setToast({ msg: 'Repaired XML copied to clipboard', type: 'success' });
    };

    const downloadResult = () => {
        const blob = new Blob([output], { type: 'text/xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `REPAIRED_SCHEMA_${Date.now()}.xml`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setAuditData([]);
        setStep('input');
        setActiveTab('input');
        analyzedDocRef.current = null;
        setToast({ msg: 'Buffer cleared', type: 'warn' });
    };

    const stats = {
        total: auditData.length,
        fixed: auditData.filter(a => a.status === 'fixed').length,
        warnings: auditData.filter(a => a.status === 'warning').length
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0 }
    };

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current) return;
        const changeRows = diffContainerRef.current.querySelectorAll('[data-change-row="true"][data-change-index]');
        if (changeRows.length === 0) return;

        let nextIndex = currentChangeIndex;

        if (direction === 'next') {
            if (currentChangeIndex === changeRows.length - 1) {
                setToast({ msg: 'End of changes reached. Nothing follows.', type: 'warn' });
                return;
            }
            nextIndex = currentChangeIndex + 1;
        } else {
            if (currentChangeIndex <= 0) {
                setToast({ msg: 'Start of changes reached. No previous changes.', type: 'warn' });
                return;
            }
            nextIndex = currentChangeIndex - 1;
        }

        const targetRow = changeRows[nextIndex] as HTMLElement;
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setCurrentChangeIndex(nextIndex);
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

        const delClass = 'bg-rose-100 text-rose-900 line-through decoration-rose-300';
        const insClass = 'bg-emerald-100 text-emerald-900 font-semibold';

        diffParts.forEach(part => {
            if (part.removed && isLeft) append(part.value, delClass);
            else if (part.added && !isLeft) append(part.value, insClass);
            else if (!part.added && !part.removed) append(part.value, null);
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const { rows: diffRows, count: calculatedChangeCount } = React.useMemo(() => {
        if (!output) return { rows: [], count: 0 };
        const diff = Diff.diffLines(input, output);
        let rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let localChangeCount = 0;

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
                const wordDiff = Diff.diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildLines(wordDiff, true);
                rightLines = buildLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildLines([{removed: true, value: leftVal} as Diff.Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{added: true, value: rightVal} as Diff.Change], false);
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
                let lNumClass = 'bg-slate-50 text-slate-400'; 
                let rNumClass = 'bg-slate-50 text-slate-400';

                if (type === 'delete') {
                    lClass = 'bg-rose-50/50';
                    lNumClass = 'bg-rose-50 text-rose-400';
                } else if (type === 'insert') {
                    rClass = 'bg-emerald-50/50';
                    rNumClass = 'bg-emerald-50 text-emerald-400';
                } else if (type === 'replace') {
                    if (lContent !== undefined) {
                        lClass = 'bg-rose-50/50';
                        lNumClass = 'bg-rose-50 text-rose-400';
                    }
                    if (rContent !== undefined) {
                        rClass = 'bg-emerald-50/50';
                        rNumClass = 'bg-emerald-50 text-emerald-400';
                    }
                }

                const isChange = type !== 'equal';
                if (isChange && r === 0) {
                    localChangeCount++;
                }
                const currentBlockIdx = isChange ? localChangeCount - 1 : -1;

                rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group"
                        data-change-row={isChange ? 'true' : undefined}
                        data-change-index={isChange && r === 0 ? currentBlockIdx : undefined}
                        data-change-index-group={isChange ? currentBlockIdx : undefined}
                    >
                        <td className={`w-12 text-right text-[10px] font-medium p-2 border-r border-slate-100 select-none font-mono transition-colors ${lNumClass}`}>
                            {lNum}
                        </td>
                        <td className={`p-2 font-mono text-[11px] text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} 
                            dangerouslySetInnerHTML={{__html: lContent || ''}}>
                        </td>
                        <td className={`w-12 text-right text-[10px] font-medium p-2 border-r border-slate-100 border-l border-slate-100 select-none font-mono transition-colors ${rNumClass}`}>
                            {rNum}
                        </td>
                        <td className={`p-2 font-mono text-[11px] text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} 
                            dangerouslySetInnerHTML={{__html: rContent || ''}}>
                        </td>
                    </tr>
                );
            }
        }
        return { rows, count: localChangeCount };
    }, [input, output]);

    React.useEffect(() => {
        if (!diffContainerRef.current) return;
        
        // Remove old highlights
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));

        if (currentChangeIndex === -1) return;

        // Add new highlights
        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));
    }, [currentChangeIndex, diffRows]);

    const renderDiff = () => {
        return (
            <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup>
                        <col className="w-12" />
                        <col className="w-[calc(50%-3rem)]" />
                        <col className="w-12" />
                        <col className="w-[calc(50%-3rem)]" />
                    </colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                        <tr>
                            <th className="py-2.5 px-2 border-r border-slate-200 text-center">LN</th>
                            <th className="py-2.5 px-6 text-left border-r border-slate-200">Source_Buffer</th>
                            <th className="py-2.5 px-2 border-r border-slate-200 text-center">LN</th>
                            <th className="py-2.5 px-6 text-left">Repaired_Node</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {diffRows}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
            <div className="max-w-[1600px] mx-auto p-4 lg:p-8 flex flex-col h-full gap-6">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                            <Cpu className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800">DOI Architect <span className="text-indigo-600">v2.5</span></h1>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Elsevier Citation Repair Protocol</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end px-4 border-r border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System_Status</span>
                            <span className={`text-xs font-bold flex items-center gap-1.5 ${step === 'completed' ? 'text-emerald-500' : step === 'analyzing' ? 'text-amber-500' : 'text-slate-400'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${step === 'completed' ? 'bg-emerald-500' : step === 'analyzing' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
                                {step === 'completed' ? 'VERIFIED' : step === 'analyzing' ? 'SCANNING' : 'IDLE'}
                            </span>
                        </div>
                        <button 
                            onClick={clearAll}
                            className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-200"
                            title="Reset Workspace"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Main Workspace */}
                <main className="flex-grow flex flex-col gap-6 overflow-hidden">
                    {/* Tab Navigation */}
                    <nav className="flex items-center gap-1 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200/60 w-fit">
                        <button
                            onClick={() => setActiveTab('input')}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'input' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <FileCode className="w-4 h-4" />
                            Input Buffer
                        </button>
                        <button
                            onClick={() => setActiveTab('analysis')}
                            disabled={step === 'input'}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'analysis' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <Activity className="w-4 h-4" />
                            Analysis Matrix
                            {auditData.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-md">
                                    {auditData.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('result')}
                            disabled={step !== 'completed'}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'result' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <CheckCircle className="w-4 h-4" />
                            Repaired Node
                        </button>
                    </nav>

                    <div className="flex-grow grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
                        {/* Left Sidebar: Stats & Actions */}
                        <aside className="xl:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col gap-6">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h3>
                                    <div className="flex flex-col gap-2">
                                        {step === 'input' ? (
                                            <button 
                                                onClick={analyzeXml}
                                                disabled={isProcessing || !input.trim()}
                                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                                Analyze XML
                                            </button>
                                        ) : step === 'analyzing' ? (
                                            <button 
                                                onClick={executeRepair}
                                                disabled={isProcessing}
                                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                Execute Repair
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={clearAll}
                                                className="w-full py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                New Session
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full py-3.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2"
                                        >
                                            <Upload className="w-4 h-4" />
                                            Upload File
                                        </button>
                                        <input type="file" ref={fileInputRef} className="hidden" accept=".xml,.txt" onChange={handleFileUpload} />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Session Metrics</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Refs</span>
                                            <span className="text-lg font-bold text-slate-700">{stats.total}</span>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Fixed</span>
                                            <span className="text-lg font-bold text-emerald-600">
                                                {stats.fixed}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-100 text-white relative overflow-hidden group">
                                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                                    <Cpu className="w-32 h-32" />
                                </div>
                                <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                                    <Terminal className="w-4 h-4" />
                                    Architect Mode
                                </h4>
                                <p className="text-xs text-indigo-100 leading-relaxed">
                                    The protocol is currently optimized for Elsevier XML standards. All repairs are validated against DTD schemas.
                                </p>
                            </div>
                        </aside>

                        {/* Right Content Area: Tab Panels */}
                        <section className="xl:col-span-9 flex flex-col overflow-hidden">
                            <AnimatePresence mode="wait">
                                {activeTab === 'input' && (
                                    <motion.div
                                        key="input-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-2">
                                                <FileCode className="w-4 h-4 text-indigo-500" />
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Source_XML_Buffer</span>
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-400">UTF-8 Encoding</span>
                                        </div>
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder="Paste XML fragment or full document here..."
                                            className="flex-grow p-6 font-mono text-sm text-slate-600 focus:outline-none resize-none custom-scrollbar placeholder:text-slate-300"
                                        />
                                    </motion.div>
                                )}

                                {activeTab === 'analysis' && (
                                    <motion.div
                                        key="analysis-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-amber-500" />
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Analysis_Matrix</span>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Repairable</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Warning</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-grow overflow-auto custom-scrollbar p-6">
                                            {auditData.filter(item => item.status !== 'skip').length > 0 ? (
                                                <div className="flex flex-col gap-3">
                                                    {auditData.filter(item => item.status !== 'skip').map((item, idx) => (
                                                        <motion.div 
                                                            key={idx}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: idx * 0.03 }}
                                                            className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all duration-200 group"
                                                        >
                                                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                                                item.status === 'fixed' ? 'bg-emerald-500' : 
                                                                item.status === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
                                                            }`} />
                                                            <div className="flex-grow">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.id}</span>
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                                        item.status === 'fixed' ? 'bg-emerald-100 text-emerald-700' : 
                                                                        item.status === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                                                    }`}>
                                                                        {item.status.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-700">{item.msg}</p>
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                                                    <Activity className="w-12 h-12 opacity-20" />
                                                    <p className="text-sm font-medium">
                                                        {auditData.length > 0 ? 'All references are structurally valid.' : 'Awaiting analysis signal...'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'result' && (
                                    <motion.div
                                        key="result-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Repaired_Node</span>
                                                </div>
                                                <div className="flex bg-slate-200/50 p-1 rounded-lg">
                                                    <button 
                                                        onClick={() => setViewMode('output')}
                                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'output' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    >
                                                        SOURCE
                                                    </button>
                                                    <button 
                                                        onClick={() => setViewMode('diff')}
                                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'diff' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    >
                                                        DIFF_VIEW
                                                    </button>
                                                </div>
                                                {viewMode === 'diff' && (
                                                    <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg ml-2">
                                                        <button 
                                                            onClick={() => scrollToChange('prev')}
                                                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                                            title="Previous Change"
                                                        >
                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <span className="text-[9px] font-bold text-slate-500 px-1 min-w-[3rem] text-center">
                                                            {calculatedChangeCount > 0 ? (currentChangeIndex === -1 ? 0 : currentChangeIndex + 1) : 0} / {calculatedChangeCount}
                                                        </span>
                                                        <button 
                                                            onClick={() => scrollToChange('next')}
                                                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                                            title="Next Change"
                                                        >
                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={downloadResult}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold transition-all shadow-sm"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    DOWNLOAD
                                                </button>
                                                <button 
                                                    onClick={copyToClipboard}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                    COPY_OUTPUT
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-grow flex flex-col overflow-hidden">
                                            {viewMode === 'output' ? (
                                                <textarea
                                                    readOnly
                                                    value={output}
                                                    className="flex-grow p-6 font-mono text-sm text-slate-600 focus:outline-none resize-none custom-scrollbar bg-slate-50/30"
                                                />
                                            ) : (
                                                renderDiff()
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>
                    </div>
                </main>

                {/* Footer */}
                <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200/60">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol_Active</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Database className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local_Cache_Sync</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>© 2026 Elsevier_Systems</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>DOI_Architect_v2.5.0</span>
                    </div>
                </footer>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #E2E8F0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #CBD5E1;
                }
            `}</style>
        </div>
    );
};

export default DOIArchitect;
