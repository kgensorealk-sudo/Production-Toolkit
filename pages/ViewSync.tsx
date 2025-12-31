
import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, diffChars, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface DetectedRef {
    refid: string;
    text: string;
    isRestored?: boolean;
}

interface SyncLog {
    id: number;
    paraId: string;
    status: 'success' | 'warning' | 'error';
    message?: string;
    stats?: {
        remapped: number;
        restored: number;
        total: number;
    };
    diffStats?: {
        added: number;
        removed: number;
    };
    detectedRefs: DetectedRef[];
}

const ViewSync: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [syncDirection, setSyncDirection] = useState<'compact-to-extended' | 'extended-to-compact'>('compact-to-extended');
    const [customStartId, setCustomStartId] = useState<string>('');
    
    // View State
    const [activeTab, setActiveTab] = useState<'raw' | 'diff' | 'report'>('raw');
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

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
            for (let r = 0; r < maxRows; r++) {
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : '';
                 const rNum = rContent !== undefined ? rightLineNum++ : '';
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

                 rows.push(
                    <tr key={`${i}-${r}`} className="hover:bg-slate-50 transition-colors duration-75 group">
                        <td className={`w-10 text-right text-[10px] text-slate-300 p-1 border-r border-slate-100 select-none bg-slate-50/50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-10 text-right text-[10px] text-slate-300 p-1 border-r border-slate-100 border-l select-none bg-slate-50/50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                 );
            }
        }
        
        setDiffElements(
            <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm font-mono border-collapse table-fixed bg-white">
                    <colgroup>
                        <col className="w-10 bg-slate-50" />
                        <col className="w-[calc(50%-2.5rem)]" />
                        <col className="w-10 bg-slate-50 border-l border-slate-200" />
                        <col className="w-[calc(50%-2.5rem)]" />
                    </colgroup>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const processSync = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const newLogs: SyncLog[] = [];
            let logCounter = 1;
            let nextIdNum = 4000;

            if (customStartId && !isNaN(parseInt(customStartId))) {
                nextIdNum = parseInt(customStartId);
            } else {
                // 1. Determine Global Max ID to ensure uniqueness
                // Scans for any pattern like id="abc1234" to find the highest number used.
                const allIdRegex = /\bid="([a-zA-Z]+)(\d+)"/g;
                let maxIdNum = 0;
                let m;
                while ((m = allIdRegex.exec(input)) !== null) {
                    const num = parseInt(m[2], 10);
                    if (!isNaN(num) && num > maxIdNum) {
                        maxIdNum = num;
                    }
                }
                // Start new IDs safely above the max found (or at 4000), ensuring it's a multiple of 5
                nextIdNum = Math.max(4000, Math.ceil((maxIdNum + 10) / 5) * 5);
            }

            // 2. Extract Paragraphs based on direction
            const compactRegex = /<ce:para\b([^>]*?)view="(compact|compact-standard)"([^>]*?)>([\s\S]*?)<\/ce:para>/g;
            const extendedRegex = /<ce:para\b([^>]*?)view="extended"([^>]*?)>([\s\S]*?)<\/ce:para>/g;

            const compactMatches = [...input.matchAll(compactRegex)];
            const extendedMatches = [...input.matchAll(extendedRegex)];

            if (compactMatches.length === 0) {
                 setToast({ msg: "No 'compact' paragraphs found.", type: "error" });
                 setIsLoading(false);
                 return;
            }
            if (extendedMatches.length === 0) {
                 setToast({ msg: "No 'extended' paragraphs found.", type: "error" });
                 setIsLoading(false);
                 return;
            }

            // Validation: Mismatched counts
            if (compactMatches.length !== extendedMatches.length) {
                newLogs.push({
                    id: logCounter++,
                    paraId: 'GLOBAL',
                    status: 'warning',
                    message: `Mismatch: ${compactMatches.length} Compact vs ${extendedMatches.length} Extended. Syncing sequential pairs.`,
                    detectedRefs: []
                });
            }

            const count = Math.min(compactMatches.length, extendedMatches.length);
            
            // 3. Build Replacements
            const replacements: {start: number, end: number, replacement: string}[] = [];

            for (let i = 0; i < count; i++) {
                const compactMatch = compactMatches[i];
                const extendedMatch = extendedMatches[i];
                
                let sourceContent = '';
                let targetContent = '';
                let targetFullMatch = '';
                let targetIndex = 0;

                if (syncDirection === 'compact-to-extended') {
                    sourceContent = compactMatch[4]; 
                    targetContent = extendedMatch[3]; 
                    targetFullMatch = extendedMatch[0];
                    targetIndex = extendedMatch.index || 0;
                } else {
                    sourceContent = extendedMatch[3]; 
                    targetContent = compactMatch[4];
                    targetFullMatch = compactMatch[0];
                    targetIndex = compactMatch.index || 0;
                }
                
                const targetOpenTagMatch = targetFullMatch.match(/^<ce:para\b[^>]*>/);
                
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

                const targetOpenTag = targetOpenTagMatch[0];
                const targetIdMatch = targetOpenTag.match(/\bid="([^"]+)"/);
                const targetParaId = targetIdMatch ? targetIdMatch[1] : `Index ${i}`;

                // 4A. Scan TARGET for existing Cross-Refs
                const targetRefRegex = /<ce:cross-ref\b([^>]*)>([\s\S]*?)<\/ce:cross-ref>/g;
                const targetRefs: {refid: string, text: string, originalId?: string}[] = [];
                let tm;
                while ((tm = targetRefRegex.exec(targetContent)) !== null) {
                    const attrs = tm[1];
                    const content = tm[2];
                    const refIdMatch = attrs.match(/refid="([^"]+)"/);
                    const idMatch = attrs.match(/\bid="([^"]+)"/);
                    
                    if (refIdMatch) {
                        targetRefs.push({ 
                            refid: refIdMatch[1], 
                            text: content,
                            originalId: idMatch ? idMatch[1] : undefined
                        });
                    }
                }

                // 4B. Content Renumbering (Source)
                let remappedCount = 0;
                let newContent = sourceContent.replace(/\bid="([a-zA-Z]+)(\d+)"/g, (match, prefix, oldNum) => {
                     remappedCount++;
                     const currentVal = nextIdNum;
                     nextIdNum += 5;
                     const newId = `${prefix}${currentVal.toString().padStart(4, '0')}`;
                     return `id="${newId}"`;
                });

                // 4C. Restore References
                let restoredCount = 0;
                const restoredRefIds = new Set<string>();
                const refsByText = new Map<string, typeof targetRefs>();
                targetRefs.forEach(ref => {
                    const t = ref.text;
                    if (!refsByText.has(t)) refsByText.set(t, []);
                    refsByText.get(t)!.push(ref);
                });

                refsByText.forEach((refs, textKey) => {
                    const escapedText = textKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const tokenRegex = new RegExp(`(<[^>]+>)|(${escapedText})`, 'g');
                    let insideCrossRef = false;

                    newContent = newContent.replace(tokenRegex, (match, tagGroup, textGroup) => {
                        if (tagGroup) {
                            if (tagGroup.startsWith('<ce:cross-ref')) {
                                if (!/\/>$/.test(tagGroup)) insideCrossRef = true;
                            } else if (tagGroup.startsWith('</ce:cross-ref>')) {
                                insideCrossRef = false;
                            }
                            return tagGroup;
                        }
                        
                        if (textGroup) {
                            if (insideCrossRef) {
                                refs.shift();
                                return textGroup;
                            }
                            const nextRef = refs.shift(); 
                            if (nextRef) {
                                restoredRefIds.add(nextRef.refid);
                                restoredCount++;
                                let newTagIdAttr = '';
                                const currentVal = nextIdNum;
                                nextIdNum += 5;

                                if (nextRef.originalId) {
                                    const prefixMatch = nextRef.originalId.match(/^([a-zA-Z]+)/);
                                    const prefix = prefixMatch ? prefixMatch[1] : 'cf'; 
                                    const newId = `${prefix}${currentVal.toString().padStart(4, '0')}`;
                                    newTagIdAttr = ` id="${newId}"`;
                                } else {
                                    const newId = `cf${currentVal.toString().padStart(4, '0')}`;
                                    newTagIdAttr = ` id="${newId}"`;
                                }
                                return `<ce:cross-ref${newTagIdAttr} refid="${nextRef.refid}">${textGroup}</ce:cross-ref>`;
                            }
                        }
                        return textGroup || match;
                    });
                });

                // 5. Scan for FINAL Cross-Refs
                const detectedRefs: DetectedRef[] = [];
                const crossRefRegex = /<ce:cross-ref\b([^>]*)>([\s\S]*?)<\/ce:cross-ref>/g;
                let crMatch;
                while ((crMatch = crossRefRegex.exec(newContent)) !== null) {
                    const attrs = crMatch[1];
                    const text = crMatch[2];
                    const refIdMatch = attrs.match(/refid="([^"]+)"/);
                    if (refIdMatch) {
                        detectedRefs.push({
                            refid: refIdMatch[1],
                            text: text,
                            isRestored: restoredRefIds.has(refIdMatch[1])
                        });
                    }
                }

                const newBlock = `${targetOpenTag}${newContent}</ce:para>`;
                
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
            setLogs(newLogs);
            generateDiff(input, finalOutput);
            setActiveTab('report');
            setToast({ msg: `Successfully synced ${count} paragraph pairs.`, type: "success" });
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
        setLogs([]);
        setToast({ msg: "All fields cleared.", type: "warn" });
    };

    useKeyboardShortcuts({
        onPrimary: processSync,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, syncDirection, customStartId]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
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

                <button 
                    onClick={processSync} 
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

            {/* Main Content Grid */}
            <div className={`grid gap-6 h-[calc(100vh-320px)] min-h-[600px] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                
                {/* Input Section - Hidden in Diff Mode */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-indigo-100 transition-all ${activeTab === 'diff' ? 'hidden' : 'flex'}`}>
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
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">2</span>
                            Results
                        </label>
                        {output && activeTab === 'raw' && (
                            <button onClick={copyOutput} className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-transparent hover:border-emerald-100 transition-colors flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy XML
                            </button>
                        )}
                    </div>

                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         {['raw', 'diff', 'report'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === tab 
                                    ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'raw' && 'Raw XML'}
                                {tab === 'diff' && 'Diff View'}
                                {tab === 'report' && `Log (${logs.length})`}
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
                             <div className="absolute inset-0 overflow-auto custom-scrollbar bg-white p-2">
                                 {diffElements ? diffElements : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <p className="text-sm">Run sync to view differences</p>
                                    </div>
                                 )}
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
                                                                        <span className="font-mono opacity-60">{ref.refid}</span>
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
