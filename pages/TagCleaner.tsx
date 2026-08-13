
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare } from 'lucide-react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';

interface ReportItem {
    id: number;
    type: 'Insertion' | 'Deletion' | 'Comment';
    content: string;
    action: 'Kept' | 'Removed' | 'Restored';
}

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
        if (part.removed && isLeft) append(part.value, 'bg-rose-200 text-rose-950 font-semibold line-through decoration-rose-800/60 px-0.5 rounded');
        else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-950 font-bold px-0.5 rounded');
        else if (!part.added && !part.removed) append(part.value, null);
    });

    if (activeClass) currentLine += '</span>';
    lines.push(currentLine);
    return lines;
};

const TagCleaner: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useLocalStorage<string>('tag_cleaner_input', '');
    const [output, setOutput] = useLocalStorage<string>('tag_cleaner_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('tag_cleaner_last_input', '');
    const [reportData, setReportData] = useState<ReportItem[]>([]);
    const [activeTab, setActiveTab] = useState<'output' | 'report' | 'diff'>('output');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Diff State
    const [rowsData, setRowsData] = useState<any[]>([]);
    const [changeCount, setChangeCount] = useState(0);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    const generateDiff = useCallback((original: string, modified: string) => {
        if (!original && !modified) {
            setRowsData([]);
            setChangeCount(0);
            setCurrentChangeIndex(0);
            return;
        }

        const diff = diffLines(original, modified);
        let localChangeCount = 0;
        let rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;

        let i = 0;
        while (i < diff.length) {
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
                leftLines = buildLines([{ removed: true, value: leftVal } as Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{ added: true, value: rightVal } as Change], false);
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
                
                const isChange = type !== 'equal';
                const isFirstInBlock = isChange && r === 0;
                if (isFirstInBlock) localChangeCount++;

                rows.push({
                    id: `${i}-${r}`,
                    type,
                    lContent,
                    rContent,
                    lNum,
                    rNum,
                    isFirstInBlock,
                    changeIndex: isFirstInBlock ? localChangeCount : undefined,
                    changeGroup: isChange ? localChangeCount : undefined
                });
            }
        }
        setRowsData(rows);
        setChangeCount(localChangeCount);
        setCurrentChangeIndex(localChangeCount > 0 ? 1 : 0);
    }, []);

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || changeCount === 0) return;

        let nextIndex = direction === 'next' ? currentChangeIndex + 1 : currentChangeIndex - 1;
        if (nextIndex > changeCount) nextIndex = 1;
        if (nextIndex < 1) nextIndex = changeCount;

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`) as HTMLElement | null;
        if (targetRow && diffContainerRef.current) {
            const container = diffContainerRef.current;
            const targetTop = targetRow.offsetTop;
            const containerHeight = container.clientHeight;
            const rowHeight = targetRow.clientHeight;
            
            container.scrollTo({
                top: Math.max(0, targetTop - (containerHeight / 2) + (rowHeight / 2)),
                behavior: 'smooth'
            });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current) return;
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-amber-100/60', 'ring-1', 'ring-amber-300', 'ring-inset', 'z-10', 'relative'));

        if (currentChangeIndex === 0) return;

        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-amber-100/60', 'ring-1', 'ring-amber-300', 'ring-inset', 'z-10', 'relative'));
    }, [currentChangeIndex, rowsData]);

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

    useEffect(() => {
        if (activeTab === 'diff' && input && output) {
            generateDiff(input, output);
        }
    }, [activeTab, input, output, generateDiff]);

    const processTags = (action: 'accept' | 'reject') => {
        if (!input.trim()) {
            setToast({ msg: "Please enter XML text to clean.", type: "warn" });
            return;
        }
        setIsLoading(true);
        setTimeout(() => {
            let current = input;
            const newReport: ReportItem[] = [];
            let idCounter = 1;

            const processPattern = (text: string, regex: RegExp, type: 'Insertion' | 'Deletion' | 'Comment', mode: 'accept' | 'reject') => {
                return text.replace(regex, (match, content) => {
                    let itemAction: 'Kept' | 'Removed' | 'Restored' = 'Kept';
                    let replacement = match;

                    if (type === 'Comment') {
                        itemAction = 'Removed';
                        replacement = '';
                    } else if (type === 'Insertion') {
                        if (mode === 'accept') { 
                            itemAction = 'Kept'; 
                            replacement = content; 
                        } else { 
                            itemAction = 'Removed'; 
                            replacement = ''; 
                        }
                    } else if (type === 'Deletion') {
                        if (mode === 'accept') { 
                            itemAction = 'Removed'; 
                            replacement = ''; 
                        } else { 
                            itemAction = 'Restored'; 
                            replacement = content; 
                        }
                    }

                    newReport.push({
                        id: idCounter++,
                        type,
                        content: content.trim(), 
                        action: itemAction
                    });
                    return replacement;
                });
            };

            // 1. Process Comments (Always remove)
            current = processPattern(current, /<opt_comment(?:\s+[^>]*)?>([\s\S]*?)<\/opt_comment>/gi, 'Comment', action);
            
            // 2. Process Insertions
            current = processPattern(current, /<opt_INS(?:\s+[^>]*)?>([\s\S]*?)<\/opt_INS>/gi, 'Insertion', action);

            // 3. Process Deletions
            current = processPattern(current, /<opt_DEL(?:\s+[^>]*)?>([\s\S]*?)<\/opt_DEL>/gi, 'Deletion', action);

            // 4. Final cleanup of any orphaned/malformed tags that weren't caught in pairs
            current = current.replace(/<\/?opt_(?:INS|DEL|comment)(?:\s+[^>]*)?>/gi, '');

            setOutput(current);
            setLastProcessedInput(input);
            setReportData(newReport);
            generateDiff(input, current);
            
            // If we have changes, show the report stats in toast, otherwise just success
            if (newReport.length > 0) {
                setToast({ 
                    msg: `Processed ${newReport.length} tags (${action === 'accept' ? 'Accepted' : 'Rejected'} All)`, 
                    type: "success" 
                });
                setActiveTab('report');
            } else {
                setToast({ msg: "No tags found to clean.", type: "warn" });
                setActiveTab('output');
            }
            
            setIsLoading(false);
        }, 600);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied!", type: "success" }));
    };

    const downloadCSV = () => {
        if (reportData.length === 0) return;
        const headers = ['ID', 'Type', 'Action', 'Content Snippet'];
        const rows = reportData.map(item => [
            item.id,
            item.type,
            item.action,
            item.content.replace(/"/g, '""').substring(0, 200) // limit snippet length in CSV
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'tag_cleaning_report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const stats = {
        total: reportData.length,
        insertions: reportData.filter(i => i.type === 'Insertion').length,
        deletions: reportData.filter(i => i.type === 'Deletion').length,
        comments: reportData.filter(i => i.type === 'Comment').length
    };

    const isStale = output && input !== lastProcessedInput;

    const diffRows = React.useMemo(() => {
        return rowsData.map(row => {
            const { id, type, lContent, rContent, lNum, rNum, changeIndex, changeGroup } = row;
            let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/70' : (type === 'replace' ? 'bg-rose-50/40' : '');
            let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/70' : (type === 'replace' ? 'bg-emerald-50/40' : '');
            
            return (
                <tr 
                    key={id} 
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                    data-change-row={changeGroup ? 'true' : undefined}
                    data-change-index={changeIndex}
                    data-change-index-group={changeGroup}
                >
                    <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                    <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                    <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                    <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                </tr>
            );
        });
    }, [rowsData]);

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onPrimary: () => processTags('accept'),
        onSecondary: () => processTags('reject'),
        onCopy: () => {
            if ((activeTab === 'output' || activeTab === 'diff') && output) copyOutput();
        },
        onClear: () => {
            setInput('');
            setOutput('');
            setLastProcessedInput('');
            setRowsData([]);
            setChangeCount(0);
            setCurrentChangeIndex(0);
            setToast({msg: 'All data cleared', type:'warn'});
        }
    }, [input, output, activeTab, lastProcessedInput]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (activeTab !== 'diff' || changeCount === 0) return;
            const active = document.activeElement;
            if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;

            if (e.key === 'ArrowDown' || (e.altKey && e.key.toLowerCase() === 'n')) {
                e.preventDefault();
                scrollToChange('next');
            } else if (e.key === 'ArrowUp' || (e.altKey && e.key.toLowerCase() === 'p')) {
                e.preventDefault();
                scrollToChange('prev');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, changeCount, currentChangeIndex]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6 flex flex-col min-h-[calc(100vh-120px)]">
            <div className="mb-10 text-center animate-fade-in shrink-0">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">XML Tag Cleaner</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Manage editorial markup by accepting or rejecting changes in bulk.</p>
            </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-grow min-h-[600px]">
                {/* Input Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-teal-100 transition-all duration-300">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">1</span>
                            Input XML
                        </label>
                        <button onClick={() => {
                            setInput('');
                            setOutput('');
                            setLastProcessedInput('');
                            setRowsData([]);
                            setChangeCount(0);
                            setCurrentChangeIndex(0);
                            setToast({msg: 'All data cleared', type:'warn'});
                        }} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full flex-grow p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder="Paste XML with <opt_DEL>, <opt_INS> or <opt_comment> tags..."
                        spellCheck={false}
                    />
                </div>
                
                {/* Output/Report Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-teal-600 font-mono shadow-sm">2</span>
                            Results
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    STALE
                                </span>
                            )}
                        </label>
                        {activeTab === 'output' && (
                            <button 
                                onClick={copyOutput} 
                                title="Ctrl+Shift+C" 
                                className={`text-xs font-bold px-3 py-1.5 rounded border transition-all active:scale-95 ${
                                    isStale 
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                                    : 'text-teal-600 hover:bg-teal-50 border-transparent hover:border-teal-100'
                                }`}
                            >
                                {isStale ? 'Copy Stale XML' : 'Copy Result'}
                            </button>
                        )}
                        {activeTab === 'report' && reportData.length > 0 && (
                            <button onClick={downloadCSV} className="text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded border border-slate-200 transition-colors flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Export CSV
                            </button>
                        )}
                        {activeTab === 'diff' && (
                            <div className="flex items-center gap-2">
                                {changeCount > 0 && (
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                                        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                                            <GitCompare className="w-3.5 h-3.5 text-teal-600" strokeWidth={2.5} />
                                            <span className="text-xs font-bold text-slate-700 font-mono tabular-nums">
                                                {currentChangeIndex} <span className="text-slate-300">/</span> {changeCount}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            <button 
                                                onClick={() => scrollToChange('prev')}
                                                className="p-0.5 hover:bg-slate-100 active:bg-slate-200 rounded transition-all text-slate-600 hover:text-teal-600"
                                                title="Previous Change"
                                            >
                                                <ChevronUp className="w-4 h-4" strokeWidth={2.5} />
                                            </button>
                                            <button 
                                                onClick={() => scrollToChange('next')}
                                                className="p-0.5 hover:bg-slate-100 active:bg-slate-200 rounded transition-all text-slate-600 hover:text-teal-600"
                                                title="Next Change"
                                            >
                                                <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {output && (
                                    <button 
                                        onClick={copyOutput} 
                                        title="Copy Cleaned XML" 
                                        className="text-xs font-bold text-teal-600 hover:bg-teal-50 px-3 py-1.5 rounded border border-teal-100 transition-all active:scale-95"
                                    >
                                        Copy Result
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1 shrink-0">
                         <button 
                            onClick={() => setActiveTab('output')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'output' 
                                ? 'bg-slate-50 text-teal-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Cleaned XML
                         </button>
                         <button 
                            onClick={() => setActiveTab('report')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'report' 
                                ? 'bg-slate-50 text-teal-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Change Report {reportData.length > 0 && <span className="ml-1 bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">{reportData.length}</span>}
                         </button>
                         <button 
                            onClick={() => {
                                setActiveTab('diff');
                                if (input && output) generateDiff(input, output);
                            }} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'diff' 
                                ? 'bg-slate-50 text-teal-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Side-by-Side Diff {changeCount > 0 && <span className="ml-1 bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{changeCount}</span>}
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                         {isLoading && <LoadingOverlay message="Cleaning Tags..." color="teal" />}
                         
                         {activeTab === 'output' && (
                             <textarea 
                                value={output}
                                readOnly
                                className="w-full flex-grow p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed" 
                                placeholder="Processed text will appear here..."
                            />
                         )}

                         {activeTab === 'report' && (
                             <div className="flex-grow flex flex-col bg-white overflow-hidden">
                                 {/* Stats Bar */}
                                 <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex gap-4 text-xs font-medium text-slate-600 shrink-0">
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Total: <b>{stats.total}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Insertions: <b>{stats.insertions}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400"></span> Deletions: <b>{stats.deletions}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Comments: <b>{stats.comments}</b></div>
                                 </div>
                                 
                                 {/* Table */}
                                 <div className="flex-grow overflow-auto custom-scrollbar">
                                    {reportData.length > 0 ? (
                                        <table className="min-w-full divide-y divide-slate-200">
                                            <thead className="bg-slate-50 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">ID</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">Type</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">Action</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Content Preview</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-200">
                                                {reportData.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-2 text-xs font-mono text-slate-400">{item.id}</td>
                                                        <td className="px-4 py-2">
                                                            <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                                                                item.type === 'Insertion' ? 'bg-emerald-100 text-emerald-800' : 
                                                                item.type === 'Deletion' ? 'bg-rose-100 text-rose-800' : 
                                                                'bg-amber-100 text-amber-800'
                                                            }`}>
                                                                {item.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-medium text-slate-600">
                                                            <span className={`px-2 py-0.5 rounded border ${
                                                                item.action === 'Kept' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                item.action === 'Restored' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                'bg-slate-50 text-slate-500 border-slate-200'
                                                            }`}>
                                                                {item.action}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-mono text-slate-700 truncate max-w-[200px]" title={item.content}>
                                                            {item.content || <span className="text-slate-300 italic">Empty</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                            <p className="text-sm">No changes recorded yet.</p>
                                        </div>
                                    )}
                                 </div>
                             </div>
                         )}

                         {activeTab === 'diff' && (
                             <div className="flex-grow flex flex-col bg-white overflow-hidden relative">
                                 {/* Sticky Diff Sub-Header Toolbar */}
                                 <div className="bg-slate-100/90 backdrop-blur-xs px-4 py-2 border-b border-slate-200 flex justify-between items-center shrink-0 sticky top-0 z-20 shadow-2xs">
                                     <div className="flex items-center gap-2">
                                         <GitCompare className="w-3.5 h-3.5 text-teal-600" strokeWidth={2.5} />
                                         <span className="text-xs font-bold text-slate-700">
                                             Side-by-Side Comparison
                                         </span>
                                         {changeCount > 0 && (
                                             <span className="text-[10px] font-extrabold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                                                 {changeCount} {changeCount === 1 ? 'change' : 'changes'}
                                             </span>
                                         )}
                                     </div>

                                     {changeCount > 0 && (
                                         <div className="flex items-center gap-2">
                                             <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                                                 <span className="text-[11px] font-bold text-slate-700 font-mono tabular-nums">
                                                     Change {currentChangeIndex} of {changeCount}
                                                 </span>
                                                 <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1.5">
                                                     <button 
                                                         onClick={() => scrollToChange('prev')}
                                                         className="p-1 hover:bg-slate-100 active:bg-slate-200 rounded transition-all text-slate-700 hover:text-teal-600"
                                                         title="Previous Change"
                                                     >
                                                         <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                     </button>
                                                     <button 
                                                         onClick={() => scrollToChange('next')}
                                                         className="p-1 hover:bg-slate-100 active:bg-slate-200 rounded transition-all text-slate-700 hover:text-teal-600"
                                                         title="Next Change"
                                                     >
                                                         <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                     </button>
                                                 </div>
                                             </div>
                                         </div>
                                     )}
                                 </div>

                                 <div ref={diffContainerRef} className="flex-grow max-h-[600px] overflow-auto custom-scrollbar">
                                     {rowsData.length > 0 ? (
                                         <table className="w-full text-xs font-mono border-collapse table-fixed bg-white">
                                             <colgroup>
                                                 <col className="w-10 border-r border-slate-200" />
                                                 <col className="w-[calc(50%-2.5rem)]" />
                                                 <col className="w-10 border-r border-slate-200 border-l border-slate-200" />
                                                 <col className="w-[calc(50%-2.5rem)]" />
                                             </colgroup>
                                             <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 font-bold text-slate-500 text-[10px] uppercase tracking-wider select-none shadow-2xs">
                                                 <tr>
                                                     <th className="p-1.5 text-center border-r border-slate-200 bg-slate-100">#</th>
                                                     <th className="p-1.5 text-left bg-slate-50">Original XML (Input)</th>
                                                     <th className="p-1.5 text-center border-r border-slate-200 border-l border-slate-200 bg-slate-100">#</th>
                                                     <th className="p-1.5 text-left bg-slate-50">Cleaned XML (Result)</th>
                                                 </tr>
                                             </thead>
                                             <tbody>
                                                 {diffRows}
                                             </tbody>
                                         </table>
                                     ) : (
                                         <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-16">
                                             <p className="text-sm">No differences to show. Process XML first.</p>
                                         </div>
                                     )}
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-6">
                <button 
                    onClick={() => processTags('accept')} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className="group flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-emerald-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1 w-full sm:w-auto min-w-[200px]"
                >
                    <div className="p-1 bg-emerald-500 rounded group-hover:bg-emerald-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Workflow</span>
                        <span className="leading-none text-lg">Accept All</span>
                    </div>
                </button>

                <button 
                    onClick={() => processTags('reject')} 
                    disabled={isLoading}
                    title="Ctrl+Shift+Enter"
                    className="group flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-rose-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1 w-full sm:w-auto min-w-[200px]"
                >
                    <div className="p-1 bg-rose-500 rounded group-hover:bg-rose-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <div className="flex flex-col items-start text-left">
                         <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Workflow</span>
                        <span className="leading-none text-lg">Reject All</span>
                    </div>
                </button>
            </div>
            
            <div className="mt-6 text-center">
                 <p className="text-xs text-slate-400">
                    <span className="font-semibold">Accept All:</span> Keeps insertions, removes deletions. <span className="mx-2">•</span> 
                    <span className="font-semibold">Reject All:</span> Removes insertions, restores deletions.
                </p>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TagCleaner;
