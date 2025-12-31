
import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

const QuickDiff: React.FC = () => {
    const [origText, setOrigText] = useState('');
    const [changedText, setChangedText] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [diffStats, setDiffStats] = useState('');
    const [diffRows, setDiffRows] = useState<React.ReactNode[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
            if (part.removed && isLeft) append(part.value, 'bg-red-200 text-red-900 line-through decoration-red-900/50');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-900 font-bold');
            else if (!part.added && !part.removed) append(part.value, null);
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const runDiff = () => {
        if (!origText && !changedText) {
            setToast({ msg: 'Please enter text to compare', type: 'warn' });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const diff = diffLines(origText, changedText);
            let added = 0, deleted = 0;
            diff.forEach(part => {
                if (part.added) added += part.value.length;
                if (part.removed) deleted += part.value.length;
            });
            setDiffStats(`${added} added, ${deleted} removed`);

            // Build Rows
            let rows: React.ReactNode[] = [];
            let leftLineNum = 1;
            let rightLineNum = 1;

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
                     // Equal
                     const lines = leftVal.split('\n');
                     if (lines.length > 0 && lines[lines.length-1] === '') lines.pop(); 
                     // Simple text escape for equal parts
                     leftLines = lines.map(escapeHtml);
                     rightLines = [...leftLines];
                }

                const maxRows = Math.max(leftLines.length, rightLines.length);
                for (let r = 0; r < maxRows; r++) {
                     const lContent = leftLines[r];
                     const rContent = rightLines[r];
                     const lNum = lContent !== undefined ? leftLineNum++ : '';
                     const rNum = rContent !== undefined ? rightLineNum++ : '';
                     
                     // Determine Content Cell Backgrounds
                     let lClass = '';
                     let rClass = '';
                     
                     // Determine Line Number Cell Backgrounds (explicit to avoid conflicts)
                     let lNumClass = 'bg-slate-50'; 
                     let rNumClass = 'bg-slate-50';

                     if (type === 'delete') {
                         lClass = 'bg-red-50';
                         lNumClass = 'bg-red-100';
                     } else if (type === 'insert') {
                         rClass = 'bg-emerald-50';
                         rNumClass = 'bg-emerald-100';
                     } else if (type === 'replace') {
                         if (lContent !== undefined) {
                             lClass = 'bg-red-50';
                             lNumClass = 'bg-red-100';
                         }
                         if (rContent !== undefined) {
                             rClass = 'bg-emerald-50';
                             rNumClass = 'bg-emerald-100';
                         }
                     }

                     rows.push(
                        <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className={`w-12 text-right text-xs text-slate-500 p-1 border-r border-slate-200 select-none font-mono ${lNumClass}`}>{lNum}</td>
                            <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-words leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                            <td className={`w-12 text-right text-xs text-slate-500 p-1 border-r border-slate-200 border-l select-none font-mono ${rNumClass}`}>{rNum}</td>
                            <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-words leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                        </tr>
                     );
                }
            }
            setDiffRows(rows);
            setShowResults(true);
            setIsLoading(false);
        }, 800);
    };

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onPrimary: runDiff,
        onClear: () => {
            setOrigText('');
            setChangedText('');
            setShowResults(false);
            setToast({msg: 'Cleared all fields', type:'warn'});
        }
    }, [origText, changedText]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Quick Text Diff Checker</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Compare text side-by-side with precision highlights.</p>
            </div>

            {!showResults ? (
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 h-[500px] animate-scale-in">
                    {isLoading && <LoadingOverlay message="Analyzing Differences..." color="orange" />}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-orange-100 transition-all duration-300">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">A</span>
                                Original Text
                            </label>
                            {origText && <button onClick={() => setOrigText('')} title="Alt+Delete" className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
                        </div>
                        <textarea 
                            value={origText}
                            onChange={(e) => setOrigText(e.target.value)}
                            className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none transition-colors placeholder-slate-300" 
                            placeholder="Paste original text here..."
                            spellCheck={false}
                        />
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-emerald-100 transition-all duration-300">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">B</span>
                                Modified Text
                            </label>
                            {changedText && <button onClick={() => setChangedText('')} title="Alt+Delete" className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
                        </div>
                        <textarea 
                            value={changedText}
                            onChange={(e) => setChangedText(e.target.value)}
                            className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none transition-colors placeholder-slate-300" 
                            placeholder="Paste modified text here..."
                            spellCheck={false}
                        />
                    </div>
                </div>
            ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white animate-fade-in ring-1 ring-slate-900/5">
                     <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md bg-slate-50/90">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-700">Comparison Result</span>
                            <span className="text-xs font-mono font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm">{diffStats}</span>
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-auto custom-scrollbar">
                        <table className="w-full text-sm font-mono border-collapse table-fixed bg-white">
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
                    </div>
                </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-5">
                {!showResults ? (
                    <button 
                        onClick={runDiff} 
                        disabled={isLoading}
                        title="Ctrl+Enter"
                        className={`flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-orange-500/30 transform transition-all active:scale-95 ${isLoading ? 'opacity-80 cursor-wait' : 'hover:-translate-y-0.5'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                        Find Difference
                    </button>
                ) : (
                    <button onClick={() => { setShowResults(false); setOrigText(''); setChangedText(''); }} title="Alt+Delete" className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3.5 px-8 rounded-xl shadow-sm border border-slate-200 transition-colors hover:border-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        Clear & Start Over
                    </button>
                )}
            </div>
             {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default QuickDiff;
