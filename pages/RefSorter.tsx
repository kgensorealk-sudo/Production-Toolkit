import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, Change } from 'diff';
import { 
    ChevronUp, 
    ChevronDown, 
    GitCompare, 
    ArrowRight, 
    Hash, 
    Trash2, 
    RefreshCw, 
    SortAsc, 
    FileText, 
    Copy, 
    Check,
    AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';
import useSessionStorage from '../hooks/useSessionStorage';

interface SortedRef {
    id: string;
    originalIndex: number;
    sortKey: string;
    content: string;
    author: string;
    year: string;
    title: string;
    label: string;
}

type SortStyle = 'APA' | 'Harvard' | 'Chicago';

const RefSorter: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useSessionStorage<string>('ref_sorter_input', '');
    const [output, setOutput] = useSessionStorage<string>('ref_sorter_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useSessionStorage<string>('ref_sorter_last_processed_input', '');
    const [selectedStyle, setSelectedStyle] = useLocalStorage<SortStyle>('ref_sorter_style', 'APA');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useLocalStorage<'raw' | 'diff' | 'preview'>('ref_sorter_active_tab', 'raw');
    const [sortedRefs, setSortedRefs] = useState<SortedRef[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    const processedTransferRef = useRef<string | null>(null);

    useEffect(() => {
        const transferredXml = location.state?.transferredXml;
        if (transferredXml && processedTransferRef.current !== transferredXml) {
            processedTransferRef.current = transferredXml;
            setInput(transferredXml);
            setToast({ 
                msg: `Merged XML Stream successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput]);

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

    const generateDiff = React.useCallback((original: string, modified: string) => {
        if (!original || !modified) return;
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let changeCount = 0;

        let i = 0;
        while (i < diff.length) {
            const part = diff[i];
            const nextPart = diff[i + 1];

            if (part.removed && nextPart && nextPart.added) {
                const leftLines = buildLines([part], true);
                const rightLines = buildLines([nextPart], false);
                const max = Math.max(leftLines.length, rightLines.length);
                changeCount++;
                for (let r = 0; r < max; r++) {
                    rows.push(
                        <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75" data-change-row="true" data-change-index={changeCount}>
                            <td className="w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono">{leftLines[r] !== undefined ? leftLineNum++ : ''}</td>
                            <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${leftLines[r] !== undefined ? 'bg-rose-50/50' : ''}`} dangerouslySetInnerHTML={{__html: leftLines[r] || ''}}></td>
                            <td className="w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono">{rightLines[r] !== undefined ? rightLineNum++ : ''}</td>
                            <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${rightLines[r] !== undefined ? 'bg-emerald-50/50' : ''}`} dangerouslySetInnerHTML={{__html: rightLines[r] || ''}}></td>
                        </tr>
                    );
                }
                i += 2;
            } else {
                const lines = buildLines([part], !!part.removed);
                const isChange = !!(part.added || part.removed);
                if (isChange) changeCount++;
                lines.forEach((line, r) => {
                    const lNum = part.added ? '' : leftLineNum++;
                    const rNum = part.removed ? '' : rightLineNum++;
                    const lClass = part.removed ? 'bg-rose-50/50' : '';
                    const rClass = part.added ? 'bg-emerald-50/50' : '';
                    rows.push(
                        <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75" data-change-row={isChange ? "true" : undefined} data-change-index={isChange ? changeCount : undefined}>
                            <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                            <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lNum !== '' ? line : ''}}></td>
                            <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                            <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rNum !== '' ? line : ''}}></td>
                        </tr>
                    );
                });
                i++;
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
    }, []);

    useEffect(() => {
        if (activeTab === 'diff' && !diffElements && lastProcessedInput && output) {
            // Use a temporary state or check to prevent multiple calls before the first one finishes
            setDiffElements(<div className="h-full flex items-center justify-center text-slate-400 uppercase tracking-widest text-[10px] font-black">Generating Differential Audit...</div>);
            generateDiff(lastProcessedInput, output);
        }
    }, [activeTab, diffElements, lastProcessedInput, output, generateDiff]);

    const runSort = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                // Find the bibliography container or use full input
                const bibMatch = input.match(/<ce:bibliography\b[^>]*>([\s\S]*?)<\/ce:bibliography>/i);
                const searchScope = bibMatch ? bibMatch[1] : input;
                
                const refRegex = /<ce:bib-reference\b[^>]*>([\s\S]*?)<\/ce:bib-reference>/gi;
                const refs: SortedRef[] = [];
                let match;
                let index = 0;

                while ((match = refRegex.exec(searchScope)) !== null) {
                    const fullRef = match[0];
                    const innerContent = match[1];
                    const idMatch = fullRef.match(/\bid="([^"]+)"/i);
                    const id = idMatch ? idMatch[1] : `ref_${index}`;

                    // Extract author surname for sorting
                    const surnameMatch = innerContent.match(/<ce:surname\b[^>]*>(.*?)<\/ce:surname>/i);
                    const author = surnameMatch ? surnameMatch[1].trim() : "";

                    // Extract year for secondary sorting
                    const yearMatch = innerContent.match(/<ce:date\b[^>]*>(.*?)<\/ce:date>/i) || innerContent.match(/<ce:year\b[^>]*>(.*?)<\/ce:year>/i);
                    const year = yearMatch ? yearMatch[1].trim() : "";

                    // Fallback sort key: entire text content without tags
                    const textContent = innerContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    const sortKey = (author || textContent).toLowerCase();

                    // Extract title for tie-breaking
                    const titleMatch = innerContent.match(/<ce:title\b[^>]*>(.*?)<\/ce:title>/i) || innerContent.match(/<sb:title\b[^>]*>(.*?)<\/sb:title>/i);
                    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : textContent;

                    // Extract label for display
                    const labelMatch = innerContent.match(/<ce:label\b[^>]*>(.*?)<\/ce:label>/i);
                    const label = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').trim() : "";

                    refs.push({
                        id,
                        originalIndex: index++,
                        sortKey,
                        content: fullRef,
                        author,
                        year,
                        title,
                        label
                    });
                }

                if (refs.length === 0) {
                    setToast({ msg: "No <ce:bib-reference> elements detected.", type: "warn" });
                    setIsLoading(false);
                    return;
                }

                // Sort references based on selected style
                const sorted = [...refs].sort((a, b) => {
                    // 1. Primary Sort: Author Surname (Standard across all)
                    const authorCompare = a.sortKey.localeCompare(b.sortKey);
                    if (authorCompare !== 0) return authorCompare;

                    if (selectedStyle === 'Chicago') {
                        // Chicago Author-Date often prioritizes Title after Author 
                        // if the date is not the primary organizational factor
                        const titleA = a.title.toLowerCase();
                        const titleB = b.title.toLowerCase();
                        const titleCompare = titleA.localeCompare(titleB);
                        if (titleCompare !== 0) return titleCompare;
                        return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
                    } else {
                        // APA & Harvard: Author -> Year -> Title
                        const yearA = parseInt(a.year) || 0;
                        const yearB = parseInt(b.year) || 0;
                        if (yearA !== yearB) return yearA - yearB;

                        // Tie-breaker: Title
                        const titleA = a.title.toLowerCase();
                        const titleB = b.title.toLowerCase();
                        return titleA.localeCompare(titleB);
                    }
                });

                // Assign suffixes for APA/Harvard if multiple works by same author in same year
                if (selectedStyle === 'APA' || selectedStyle === 'Harvard') {
                    let i = 0;
                    while (i < sorted.length) {
                        const currentAuthor = sorted[i].author;
                        const currentYearNormalized = sorted[i].year.replace(/\D/g, '');
                        
                        if (!currentAuthor || !currentYearNormalized) {
                            i++;
                            continue;
                        }

                        let j = i + 1;
                        while (j < sorted.length && 
                               sorted[j].author === currentAuthor && 
                               sorted[j].year.replace(/\D/g, '') === currentYearNormalized) {
                            j++;
                        }
                        
                        if (j - i > 1) {
                            // Multiple works found
                            for (let k = i; k < j; k++) {
                                const suffix = String.fromCharCode(97 + (k - i)); // a, b, c...
                                const currentRef = sorted[k];
                                
                                // Update the year in the content with the suffix
                                // First, remove any existing alpha suffix from the year string
                                let updatedContent = currentRef.content;
                                if (updatedContent.includes('<ce:year')) {
                                    updatedContent = updatedContent.replace(/(<ce:year\b[^>]*>)(.*?)(\D*)(<\/ce:year>)/i, `$1$2${suffix}$4`);
                                } else if (updatedContent.includes('<ce:date')) {
                                    updatedContent = updatedContent.replace(/(<ce:date\b[^>]*>)(.*?)(\D*)(<\/ce:date>)/i, `$1$2${suffix}$4`);
                                }
                                sorted[k].content = updatedContent;
                            }
                        }
                        i = j;
                    }
                }

                setSortedRefs(sorted);

                // Reconstruct XML
                const sortedBibContent = sorted.map(r => r.content).join('\n');
                let newOutput = "";
                
                if (bibMatch) {
                    newOutput = input.replace(bibMatch[1], `\n${sortedBibContent}\n`);
                } else {
                    newOutput = sortedBibContent;
                }
                
                setOutput(newOutput);
                setLastProcessedInput(input);
                setDiffElements(null); // Force regeneration
                setToast({ msg: `Successfully sorted ${refs.length} references.`, type: "success" });
                setStep('result');
            } catch (e: any) {
                setToast({ msg: `Sort failed: ${e.message}`, type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    const [step, setStep] = useState<'input' | 'result'>('input');

    const handleCopy = () => {
        navigator.clipboard.writeText(output);
        setToast({ msg: "XML copied to clipboard.", type: "success" });
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setLastProcessedInput('');
        setSortedRefs([]);
        setDiffElements(null);
        setTotalChanges(0);
        setCurrentChangeIndex(0);
        setStep('input');
        setToast({ msg: 'All cleared', type: 'warn' });
    };

    const handleTransfer = (toolPath: string, toolId: ToolId) => {
        navigate(toolPath, { state: { transferredXml: output, sourceTool: 'Reference Sorter' } });
    };

    const isStale = output && input !== lastProcessedInput;

    useKeyboardShortcuts({
        onPrimary: () => step === 'input' && runSort(),
        onCopy: () => step === 'result' && handleCopy(),
        onClear: clearAll
    }, [step, input, output, lastProcessedInput]);

    return (
        <div className="max-w-[1600px] mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <AnimatePresence>
                {isLoading && <LoadingOverlay message="Sorting References..." color="indigo" />}
            </AnimatePresence>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
                            <SortAsc className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Reference Sorter</h1>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest border border-amber-200">Experimental</span>
                    </div>
                    <p className="text-slate-500 font-medium text-sm">Alphabetically sort bibliography references by author surname and year.</p>
                </div>

                {step === 'result' && (
                    <div className="flex items-center gap-3">
                        {isStale && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                <AlertCircle size={14} />
                                Input Changed
                            </div>
                        )}
                        <button 
                            onClick={clearAll}
                            className="px-4 py-2 text-rose-500 hover:text-rose-600 font-bold text-sm uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            Clear
                        </button>
                        <button 
                            onClick={() => setStep('input')}
                            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-sm uppercase tracking-widest transition-colors"
                        >
                            Reset
                        </button>
                        <button 
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                        >
                            <Copy size={14} />
                            Copy Result
                        </button>
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                {step === 'input' ? (
                    <motion.div 
                        key="input"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="glass-panel rounded-[2.5rem] p-8"
                    >
                        <div className="mb-6">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Source XML Content</label>
                            <textarea 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Paste XML containing <ce:bib-reference> elements..."
                                className="w-full h-[500px] bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 font-mono text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Sorting Style</label>
                                    <select 
                                        value={selectedStyle} 
                                        onChange={(e) => setSelectedStyle(e.target.value as SortStyle)}
                                        className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm cursor-pointer min-w-[200px]"
                                    >
                                        <option value="APA">APA 7th Edition</option>
                                        <option value="Harvard">Harvard Style</option>
                                        <option value="Chicago">Chicago (Author-Date)</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-[10px] font-bold uppercase tracking-wider mt-5">
                                    <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm">Ctrl</kbd>
                                    <span>+</span>
                                    <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm">Enter</kbd>
                                    <span className="ml-1">to Sort</span>
                                </div>
                                <button 
                                    onClick={clearAll}
                                    className="flex items-center gap-2 px-4 py-1.5 text-slate-400 hover:text-rose-500 font-bold uppercase tracking-widest text-[10px] transition-all"
                                >
                                    <Trash2 size={14} />
                                    Clear All
                                </button>
                            </div>

                            <button 
                                onClick={runSort}
                                disabled={!input.trim()}
                                className="flex items-center gap-3 px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                                <SortAsc size={18} />
                                Sort References
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="result"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6"
                    >
                        <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => setActiveTab('raw')}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'raw' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                                >
                                    Raw XML
                                </button>
                                <button 
                                    onClick={() => setActiveTab('diff')}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'diff' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                                >
                                    Diff View
                                </button>
                                <button 
                                    onClick={() => setActiveTab('preview')}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'preview' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                                >
                                    Sort Preview
                                </button>
                            </div>

                            {activeTab === 'diff' && totalChanges > 0 && (
                                <div className="flex items-center gap-4 px-4">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {currentChangeIndex} / {totalChanges} Changes
                                    </span>
                                    <div className="flex gap-1">
                                        <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronUp size={16} /></button>
                                        <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronDown size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="glass-panel rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-xl">
                            {activeTab === 'raw' && (
                                <textarea 
                                    readOnly
                                    value={output}
                                    className="w-full h-[600px] bg-white p-8 font-mono text-sm outline-none resize-none"
                                />
                            )}

                            {activeTab === 'diff' && (
                                <div className="h-[600px] overflow-auto bg-slate-50" ref={diffContainerRef}>
                                    {diffElements}
                                </div>
                            )}

                            {activeTab === 'preview' && (
                                <div className="h-[600px] overflow-auto bg-slate-50/30 p-8 custom-scrollbar">
                                    <div className="max-w-4xl mx-auto space-y-4">
                                        <div className="flex items-center justify-between mb-6 px-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sequence Audit</span>
                                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Re-ordered Reference Stream</h3>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                                    <Check size={12} strokeWidth={3} />
                                                    {sortedRefs.length} Validated
                                                </div>
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                                    {sortedRefs.filter(r => r.originalIndex !== sortedRefs.indexOf(r)).length} Moved
                                                </div>
                                            </div>
                                        </div>

                                        {sortedRefs.map((ref, i) => {
                                            const delta = ref.originalIndex - i;
                                            const hasMoved = delta !== 0;
                                            const moveType = delta > 0 ? 'up' : 'down';
                                            
                                            return (
                                                <div key={`${ref.id}-${ref.originalIndex}-${i}`} className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-300 overflow-hidden">
                                                    {/* Status Bar */}
                                                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${!hasMoved ? 'bg-slate-100' : (moveType === 'up' ? 'bg-emerald-500' : 'bg-amber-500')}`}></div>
                                                    
                                                    <div className="p-5 pl-8 flex items-start gap-6">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xs font-black text-slate-500 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                                                                {i + 1}
                                                            </div>
                                                            {hasMoved && (
                                                                <div className={`flex items-center gap-0.5 text-[9px] font-black uppercase tracking-tighter ${moveType === 'up' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                    {moveType === 'up' ? <ChevronUp size={10} strokeWidth={3} /> : <ChevronDown size={10} strokeWidth={3} />}
                                                                    {Math.abs(delta)}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex-grow min-w-0">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{ref.id}</span>
                                                                {ref.label ? (
                                                                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                                                                        {ref.label}
                                                                    </span>
                                                                ) : ref.author && (
                                                                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                                                                        {ref.author} <span className="text-slate-400 font-medium ml-1">({ref.year})</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="text-xs font-bold text-slate-900 mb-1 line-clamp-1">{ref.title}</h4>
                                                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed line-clamp-2 italic font-serif">
                                                                {ref.content.replace(/<[^>]+>/g, ' ').trim()}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                                            <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Original Pos: {ref.originalIndex + 1}</div>
                                                            {hasMoved ? (
                                                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${moveType === 'up' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                                    Moved {moveType}
                                                                </div>
                                                            ) : (
                                                                <div className="px-3 py-1 bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-100">
                                                                    Unchanged
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pipeline Transfer</h4>
                                <div className="space-y-2">
                                    <button 
                                        onClick={() => handleTransfer('/xmlRenumber', ToolId.XML_RENUMBER)}
                                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Hash size={16} />
                                            <span className="text-xs font-black uppercase tracking-widest">XML Normalizer</span>
                                        </div>
                                        <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                    </button>
                                    <button 
                                        onClick={() => handleTransfer('/idAuditor', ToolId.ID_AUDITOR)}
                                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <AlertCircle size={16} />
                                            <span className="text-xs font-black uppercase tracking-widest">ID Prefix Auditor</span>
                                        </div>
                                        <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                    </button>
                                </div>
                            </div>

                            <div className="md:col-span-2 bg-indigo-600 p-8 rounded-[2.5rem] text-white relative overflow-hidden group">
                                <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                    <SortAsc className="w-48 h-48" />
                                </div>
                                <div className="relative z-10">
                                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">Sorting Complete</h3>
                                    <p className="text-indigo-100 text-sm font-medium mb-6 max-w-md">
                                        References have been re-ordered alphabetically. It is recommended to run the XML Normalizer next to update citation numbering.
                                    </p>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={handleCopy}
                                            className="px-8 py-3 bg-white text-indigo-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95"
                                        >
                                            Copy XML
                                        </button>
                                        <button 
                                            onClick={() => handleTransfer('/xmlRenumber', ToolId.XML_RENUMBER)}
                                            className="px-8 py-3 bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all active:scale-95 border border-indigo-400"
                                        >
                                            Next: Renumber
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RefSorter;
