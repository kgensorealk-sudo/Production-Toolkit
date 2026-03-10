import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

type AlignType = 'left' | 'center' | 'right' | 'char' | 'none' | 'strip';

const TableBeautifier: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'raw' | 'diff'>('raw');
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    // Alignment States
    const [alignType, setAlignType] = useState<AlignType>('none');
    const [charVal, setCharVal] = useState('.');
    const [scope, setScope] = useState<'all' | 'specific'>('all');
    const [targetColname, setTargetColname] = useState('');
    const [showFormattingDiff, setShowFormattingDiff] = useState(false);

    const availableColnames = React.useMemo(() => {
        const matches = Array.from(input.matchAll(/colname="([^"]+)"/gi));
        return Array.from(new Set(matches.map(m => m[1]))).sort();
    }, [input]);

    const toggleColname = (col: string) => {
        const current = targetColname.split(',').map(t => t.trim()).filter(t => t);
        if (current.includes(col)) {
            setTargetColname(current.filter(t => t !== col).join(', '));
        } else {
            setTargetColname([...current, col].join(', '));
        }
    };

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
        let leftLineNum = 1;
        let rightLineNum = 1;

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
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/70' : (type === 'replace' ? 'bg-rose-50/30' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/70' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

                 rows.push(
                    <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75">
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 select-none bg-slate-50/80 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 border-l select-none bg-slate-50/80 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                 );
            }
        }
        
        setDiffElements(
            <div className="bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup>
                        <col className="w-14" />
                        <col className="w-[calc(50%-3.5rem)]" />
                        <col className="w-14 border-l border-slate-200" />
                        <col className="w-[calc(50%-3.5rem)]" />
                    </colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400"></span>Baseline Structure</span>
                            </th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>Modified Protocol</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const beautifyStructure = (xml: string) => {
        let res = xml;
        res = res.replace(/(<row\b[^>]*>)/gi, '$1\n');
        res = res.replace(/(<\/entry>)/gi, '$1\n');
        res = res.replace(/([^\n])\s*(<\/row>)/gi, '$1\n$2');
        res = res.replace(/\n\s*\n/g, '\n').trim();
        return res;
    };

    const processBeautify = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML row content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                // 1. Generate structural baseline (Expanded but without alignment changes)
                const baseline = beautifyStructure(input);

                // 2. Surgical Alignment Logic on raw input
                let withAlignment = input;
                if (alignType !== 'none') {
                    const entryRegex = /<entry\b([^>]*)>([\s\S]*?)<\/entry>/gi;
                    
                    withAlignment = withAlignment.replace(entryRegex, (match, attrs, content) => {
                        const colnameMatch = attrs.match(/colname="([^"]+)"/i);
                        const colname = colnameMatch ? colnameMatch[1] : '';

                        let isTarget = scope === 'all';
                        if (!isTarget && targetColname) {
                            const targets = targetColname.split(',').map(t => t.trim()).filter(t => t);
                            isTarget = targets.includes(colname);
                        }

                        if (isTarget) {
                            let newAttrs = attrs;
                            newAttrs = newAttrs.replace(/\s?\balign="[^"]*"/gi, '');
                            newAttrs = newAttrs.replace(/\s?\bchar="[^"]*"/gi, '');

                            if (alignType === 'strip') {
                                // Already stripped above
                            } else if (alignType === 'char') {
                                newAttrs += ` align="char" char="${charVal}"`;
                            } else {
                                newAttrs += ` align="${alignType}"`;
                            }
                            
                            newAttrs = newAttrs.replace(/\s\s+/g, ' ').trim();
                            return `<entry ${newAttrs}>${content}</entry>`;
                        }
                        return match;
                    });
                }
                
                // 3. Generate final output (Structurally expanded + Alignment applied)
                const result = beautifyStructure(withAlignment);

                setOutput(result);
                // 4. Generate Diff: Baseline Structure vs Modified Protocol
                if (showFormattingDiff) {
                    generateDiff(input, result);
                } else {
                    generateDiff(baseline, result);
                }
                
                setToast({ msg: alignType === 'none' ? "Table structure expanded (Alignment preserved)." : "Table structure and alignment protocols applied.", type: "success" });
            } catch (err) {
                setToast({ msg: "Processing failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 400);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied XML!", type: "success" }));
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setDiffElements(null);
        setToast({ msg: "Cleared.", type: "warn" });
    };

    useKeyboardShortcuts({
        onPrimary: processBeautify,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, alignType, charVal, scope, targetColname]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Table XML Beautifier</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed italic">Expand table structures and enforce surgical alignment protocols.</p>
            </div>

            {/* Configuration Panel */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 mb-10 animate-slide-up relative overflow-hidden ring-1 ring-slate-900/5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-bl-[4rem] -mr-16 -mt-16 opacity-30"></div>
                <div className="flex flex-wrap items-center gap-10 justify-center relative z-10">
                    {/* Scope Selector */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">Target Scope</label>
                        <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner border border-slate-200">
                            <button 
                                onClick={() => setScope('all')}
                                className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${scope === 'all' ? 'bg-white text-pink-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                All Columns
                            </button>
                            <button 
                                onClick={() => setScope('specific')}
                                className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${scope === 'specific' ? 'bg-white text-pink-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Specific
                            </button>
                        </div>
                    </div>

                    {/* Specific Input (Conditional) */}
                    {scope === 'specific' && (
                        <div className="flex flex-col gap-3 animate-fade-in">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">Target Colnames</label>
                            <div className="flex flex-col gap-2">
                                <input 
                                    type="text"
                                    value={targetColname}
                                    onChange={(e) => setTargetColname(e.target.value)}
                                    placeholder="e.g. col1, col3"
                                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300 transition-all w-64 placeholder-slate-300 shadow-sm"
                                />
                                {availableColnames.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                                        {availableColnames.map(col => {
                                            const isActive = targetColname.split(',').map(t => t.trim()).includes(col);
                                            return (
                                                <button
                                                    key={col}
                                                    onClick={() => toggleColname(col)}
                                                    className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase transition-all border ${
                                                        isActive 
                                                            ? 'bg-pink-600 border-pink-600 text-white shadow-sm' 
                                                            : 'bg-white border-slate-200 text-slate-400 hover:border-pink-300 hover:text-pink-500'
                                                    }`}
                                                >
                                                    {col}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="h-12 w-px bg-slate-100 hidden md:block"></div>

                    {/* Alignment Group */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">Alignment Protocol</label>
                        <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner border border-slate-200">
                            {(['none', 'strip', 'left', 'center', 'right', 'char'] as AlignType[]).map((type) => (
                                <button 
                                    key={type}
                                    onClick={() => setAlignType(type)}
                                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${alignType === type ? 'bg-white text-pink-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-12 w-px bg-slate-100 hidden md:block"></div>

                    {/* Diff Mode */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">Diff Mode</label>
                        <button 
                            onClick={() => setShowFormattingDiff(!showFormattingDiff)}
                            className={`flex items-center gap-3 px-6 py-2 rounded-2xl border-2 transition-all ${showFormattingDiff ? 'bg-pink-50 border-pink-200 text-pink-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${showFormattingDiff ? 'bg-pink-600 border-pink-600' : 'border-slate-300'}`}>
                                {showFormattingDiff && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-widest">Show Formatting in Diff</span>
                        </button>
                    </div>

                    {/* Char Input (Conditional) */}
                    {alignType === 'char' && (
                        <div className="flex flex-col gap-3 animate-fade-in">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Char</label>
                            <input 
                                type="text"
                                value={charVal}
                                onChange={(e) => setCharVal(e.target.value)}
                                maxLength={1}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-center font-mono font-black text-pink-600 outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300 transition-all w-14 shadow-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 h-[580px]">
                {/* Input Column */}
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-pink-100 transition-all duration-300 relative">
                    <div className="bg-slate-50 px-8 py-5 border-b border-slate-100 flex justify-between items-center z-10">
                        <label className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-3">
                             <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-pink-600 text-white text-[10px] font-mono shadow-lg shadow-pink-500/30">1</span>
                            Condensed XML Row
                        </label>
                        <button onClick={() => { setInput(''); setDiffElements(null); setOutput(''); }} title="Alt+Delete" className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Clear</button>
                    </div>
                    
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-8 text-[13px] font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300 custom-scrollbar" 
                        placeholder="<row valign='middle'><entry>...</entry>...</row>"
                        spellCheck={false}
                    />
                </div>
                
                {/* Output Column */}
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-8 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-3 py-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500 text-white text-[10px] font-mono shadow-lg shadow-emerald-500/30">2</span>
                            Processed Grid
                        </label>
                        {output && activeTab === 'raw' && (
                            <button onClick={copyOutput} title="Ctrl+Shift+C" className="text-[10px] font-black text-emerald-600 bg-white hover:bg-emerald-50 px-5 py-2 rounded-xl border border-emerald-100 shadow-sm transition-all flex items-center gap-2 uppercase tracking-widest active:scale-95">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy XML
                            </button>
                        )}
                    </div>
                    
                    {/* Tabs */}
                    <div className="bg-white px-6 pt-4 border-b border-slate-100 flex space-x-3">
                         <button 
                            onClick={() => setActiveTab('raw')} 
                            className={`px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x ${activeTab === 'raw' 
                                ? 'bg-slate-50 text-pink-600 border-slate-200 translate-y-[1px] shadow-sm' 
                                : 'bg-white text-slate-400 border-transparent hover:bg-slate-50 hover:text-slate-600'}`}
                         >
                            Raw Stream
                         </button>
                         <button 
                            onClick={() => setActiveTab('diff')} 
                            className={`px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x ${activeTab === 'diff' 
                                ? 'bg-slate-50 text-pink-600 border-slate-200 translate-y-[1px] shadow-sm' 
                                : 'bg-white text-slate-400 border-transparent hover:bg-slate-50 hover:text-slate-600'}`}
                         >
                            Diff View
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                         {isLoading && <LoadingOverlay message="Executing protocols..." color="pink" />}
                         
                         {activeTab === 'raw' && (
                            <textarea 
                                value={output}
                                readOnly
                                className="w-full h-full p-8 text-[13px] font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed placeholder-slate-300 custom-scrollbar" 
                                placeholder="Normalized output will appear here..."
                            />
                         )}

                         {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-auto custom-scrollbar bg-white">
                                 {diffElements ? diffElements : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60 grayscale">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <p className="text-sm font-black uppercase tracking-[0.25em]">Awaiting System Process</p>
                                    </div>
                                 )}
                             </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="mt-12 text-center">
                <button 
                    onClick={processBeautify} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className="group bg-slate-900 hover:bg-slate-800 text-white font-black py-5 px-16 rounded-[2.5rem] shadow-2xl shadow-slate-900/20 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait hover:-translate-y-1 uppercase tracking-[0.25em] text-xs"
                >
                    Expand & Align Table
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TableBeautifier;