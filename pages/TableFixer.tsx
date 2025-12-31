
import React, { useState, useEffect } from 'react';
import { diffLines, diffArrays, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface Footnote {
    id: string;
    label: string;
    content: string;
    fullTag: string;
}

const TableFixer: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [footnotes, setFootnotes] = useState<Footnote[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'selection' | 'result' | 'diff'>('selection');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [mode, setMode] = useState<'detach' | 'attach'>('detach');

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
            else if (!part.added && !part.removed) {
                // Highlight content unwrapped from cross-ref tags on the right side
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

    // Custom diff function that splits by XML tags and whitespace
    const diffXmlAware = (left: string, right: string): Change[] => {
        const tokenize = (text: string) => text.split(/(<[^>]+>|\s+)/).filter(t => t !== '');
        const leftTokens = tokenize(left);
        const rightTokens = tokenize(right);
        
        // diffArrays compares tokens exactly
        const arrayChanges = diffArrays(leftTokens, rightTokens);
        
        // Convert back to string-based Change objects
        return arrayChanges.map(part => ({
            value: part.value.join(''),
            count: part.count,
            added: part.added,
            removed: part.removed
        }));
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
                // Use custom XML tokenizer instead of word diff to properly separate tags from content
                const fineDiff = diffXmlAware(leftVal, rightVal);
                
                // Heuristic: Identify content that was unwrapped from <ce:cross-ref>
                for (let k = 0; k < fineDiff.length; k++) {
                    const currentPart = fineDiff[k];
                    if (!currentPart.added && !currentPart.removed) {
                        const prev = k > 0 ? fineDiff[k-1] : null;
                        const next = k < fineDiff.length - 1 ? fineDiff[k+1] : null;
                        
                        // Check if sandwiched between removed cross-ref tags
                        // e.g. Removed(<cross-ref>) -> Equal(content) -> Removed(</cross-ref>)
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
            for (let r = 0; r < maxRows; r++) {
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : '';
                 const rNum = rContent !== undefined ? rightLineNum++ : '';
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-red-50' : (type === 'replace' ? 'bg-red-50' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50' : (type === 'replace' ? 'bg-emerald-50' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

                 rows.push(
                    <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75">
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                 );
            }
        }
        
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

    // Parse input based on mode
    useEffect(() => {
        if (!input) {
            setFootnotes([]);
            return;
        }

        const matches: Footnote[] = [];
        
        if (mode === 'detach') {
            const fnRegex = /<ce:table-footnote\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:table-footnote>/g;
            let match;
            
            while ((match = fnRegex.exec(input)) !== null) {
                const id = match[1];
                const inner = match[2];
                const fullTag = match[0];
                
                const labelMatch = /<ce:label[^>]*>([\s\S]*?)<\/ce:label>/.exec(inner);
                const label = labelMatch ? labelMatch[1].trim() : '???';
                const paraMatch = /<ce:note-para[^>]*>([\s\S]*?)<\/ce:note-para>/.exec(inner);
                const content = paraMatch ? paraMatch[1].trim() : '';

                matches.push({ id, label, content, fullTag });
            }
        } else {
            // Attach Mode: Look for legend items (simple-para with sup/label)
            const spRegex = /<ce:simple-para\b[^>]*>([\s\S]*?)<\/ce:simple-para>/g;
            let match;
            while ((match = spRegex.exec(input)) !== null) {
                const fullTag = match[0];
                const inner = match[1];
                
                let label = '';
                
                // Heuristic: Check for <ce:sup> or <ce:label> at start
                const supMatch = /^\s*<ce:sup>(.*?)<\/ce:sup>/.exec(inner);
                const labelMatch = /^\s*<ce:label>(.*?)<\/ce:label>/.exec(inner);
                
                if (supMatch) label = supMatch[1];
                else if (labelMatch) label = labelMatch[1];

                if (label) {
                    const idMatch = /id="([^"]+)"/.exec(fullTag);
                    const id = idMatch ? idMatch[1] : `sp_gen_${matches.length}`;
                    matches.push({ id, label, content: inner, fullTag });
                }
            }
        }

        setFootnotes(matches);
        setSelectedIds(new Set()); 
        
        if (matches.length > 0) {
            setActiveTab('selection');
        }
    }, [input, mode]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };
    
    const toggleAll = () => {
        if (selectedIds.size === footnotes.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(footnotes.map(f => f.id)));
        }
    };

    const processTable = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste XML content first.", type: "warn" });
            return;
        }
        if (selectedIds.size === 0) {
            setToast({ msg: "Select at least one item to process.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            let processed = input;
            
            if (mode === 'detach') {
                // DETACH: Footnote -> Legend
                let legendsToAdd: string[] = [];
                const sortedSelected = footnotes.filter(fn => selectedIds.has(fn.id));
                
                // Calc next SP ID
                const existingSpMatches = input.match(/id="sp(\d+)"/g);
                let startId = 4000;
                if (existingSpMatches) {
                    const maxId = existingSpMatches.reduce((max, curr) => {
                        const m = curr.match(/id="sp(\d+)"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    startId = Math.ceil((maxId + 1) / 5) * 5;
                    if (startId < 4000) startId = 4000;
                }
                let spIdCounter = startId;

                sortedSelected.forEach(fn => {
                    // Remove references
                    const refRegex = new RegExp(`<ce:cross-ref\\b[^>]*?refid="${fn.id}"[^>]*>([\\s\\S]*?)<\\/ce:cross-ref>`, 'g');
                    processed = processed.replace(refRegex, '$1');

                    // Remove definition
                    processed = processed.split(fn.fullTag).join('');

                    // Add to Legend
                    const spId = `sp${spIdCounter}`;
                    spIdCounter += 5;
                    legendsToAdd.push(`<ce:simple-para id="${spId}"><ce:sup>${fn.label}</ce:sup> ${fn.content}</ce:simple-para>`);
                });

                if (legendsToAdd.length > 0) {
                    const legendBlock = legendsToAdd.join('');
                    if (processed.includes('<ce:legend>')) {
                        processed = processed.replace('</ce:legend>', `${legendBlock}</ce:legend>`);
                    } else if (processed.includes('</tgroup>')) {
                        processed = processed.replace('</tgroup>', `</tgroup><ce:legend>${legendBlock}</ce:legend>`);
                    } else {
                        processed = processed.replace('</ce:table>', `<ce:legend>${legendBlock}</ce:legend></ce:table>`);
                    }
                }
                setToast({ msg: `Moved ${selectedIds.size} footnotes to legend.`, type: "success" });

            } else {
                // ATTACH: Legend -> Footnote + Cross-Ref
                let footnotesToAdd: string[] = [];
                const sortedSelected = footnotes.filter(fn => selectedIds.has(fn.id));

                // Calc next FN ID
                const existingFnMatches = input.match(/id="fn(\d+)"/g);
                let startId = 0;
                if (existingFnMatches) {
                     const maxId = existingFnMatches.reduce((max, curr) => {
                        const m = curr.match(/id="fn(\d+)"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    startId = maxId;
                }
                let fnIdCounter = startId + 1;

                sortedSelected.forEach(fn => {
                    const newFnId = `fn${String(fnIdCounter).padStart(3, '0')}`;
                    fnIdCounter++;
                    
                    // Remove Legend Item
                    processed = processed.split(fn.fullTag).join('');
                    
                    // Attach References: Wrap <ce:sup>label</ce:sup> in cross-ref
                    const escapedLabel = fn.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Regex lookbehind ensures we don't wrap if already wrapped
                    const targetRegex = new RegExp(`(?<!<ce:cross-ref[^>]*>)\\s*<ce:sup>${escapedLabel}<\\/ce:sup>`, 'g');
                    
                    processed = processed.replace(targetRegex, `<ce:cross-ref refid="${newFnId}"><ce:sup>${fn.label}</ce:sup></ce:cross-ref>`);
                    
                    // Create Footnote
                    // Strip label markers from content
                    let cleanContent = fn.content
                        .replace(new RegExp(`^\\s*<ce:sup>${escapedLabel}<\\/ce:sup>`), '')
                        .replace(new RegExp(`^\\s*<ce:label>${escapedLabel}<\\/ce:label>`), '')
                        .trim();
                    
                    footnotesToAdd.push(`<ce:table-footnote id="${newFnId}"><ce:label>${fn.label}</ce:label><ce:note-para>${cleanContent}</ce:note-para></ce:table-footnote>`);
                });

                if (footnotesToAdd.length > 0) {
                    const block = footnotesToAdd.join('');
                    if (processed.includes('</tgroup>')) {
                        processed = processed.replace('</tgroup>', `${block}</tgroup>`);
                    } else {
                        processed = processed.replace('</ce:table>', `${block}</ce:table>`);
                    }
                }
                
                // Cleanup empty legend
                processed = processed.replace(/<ce:legend>\s*<\/ce:legend>/g, '');
                
                setToast({ msg: `Attached ${selectedIds.size} legend items as footnotes.`, type: "success" });
            }

            setOutput(processed);
            generateDiff(input, processed);
            setActiveTab('result');
            setIsLoading(false);
        }, 600);
    };

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onPrimary: processTable,
        onCopy: () => {
            if (output && activeTab === 'result') {
                navigator.clipboard.writeText(output);
                setToast({msg: 'Copied output!', type:'success'});
            }
        },
        onClear: () => {
            setInput('');
            setFootnotes([]);
            setOutput('');
            setToast({msg: 'Input cleared', type:'warn'});
        }
    }, [input, output, footnotes, selectedIds, activeTab, mode]);

    const themeColor = mode === 'detach' ? 'pink' : 'blue';

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">XML Table Fixer</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Manage table footnotes by detaching them to legends or attaching legends back to cells.</p>
            </div>

            {/* Mode Switcher */}
            <div className="flex justify-center mb-8">
                <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner">
                    <button 
                        onClick={() => setMode('detach')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'detach' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Detach (Footnote &rarr; Legend)
                    </button>
                    <button 
                        onClick={() => setMode('attach')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'attach' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Attach (Legend &rarr; Footnote)
                    </button>
                </div>
            </div>

            <div className={`grid gap-8 h-[650px] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Left Column: Input */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 ${mode === 'detach' ? 'focus-within:ring-pink-100' : 'focus-within:ring-blue-100'} transition-all duration-300 ${activeTab === 'diff' ? 'hidden' : 'flex'}`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">1</span>
                            Input XML
                        </label>
                        <div className="flex gap-2">
                             {footnotes.length > 0 && (
                                <span className={`text-xs font-medium px-2 py-1 rounded-md border flex items-center gap-1 ${mode === 'detach' ? 'text-pink-600 bg-pink-50 border-pink-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                    {footnotes.length} Detected
                                </span>
                             )}
                             <button onClick={() => { setInput(''); setFootnotes([]); }} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                        </div>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder={mode === 'detach' ? "Paste <ce:table> containing footnotes..." : "Paste <ce:table> containing legend items..."}
                        spellCheck={false}
                    />
                </div>

                {/* Right Column: Interactive Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                     {/* Tab Header */}
                     <div className="flex border-b border-slate-100 bg-slate-50">
                        <button 
                            onClick={() => setActiveTab('selection')}
                            className={`flex-1 py-3 text-sm font-bold transition-all border-r border-slate-100 ${
                                activeTab === 'selection' 
                                ? `bg-white border-b-2 border-b-transparent ${mode === 'detach' ? 'text-pink-600' : 'text-blue-600'}`
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'selection' ? (mode === 'detach' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600') : 'bg-slate-200 text-slate-500'}`}>2</span>
                                Selection
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('result')}
                            className={`flex-1 py-3 text-sm font-bold transition-all border-r border-slate-100 ${
                                activeTab === 'result' 
                                ? 'bg-white text-emerald-600 border-b-2 border-b-transparent' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'result' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>3</span>
                                Result
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('diff')}
                            className={`flex-1 py-3 text-sm font-bold transition-all ${
                                activeTab === 'diff' 
                                ? 'bg-white text-orange-600 border-b-2 border-b-transparent' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'diff' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>4</span>
                                Diff View
                            </span>
                        </button>
                     </div>

                    <div className="flex-grow relative overflow-hidden bg-slate-50/50">
                        {isLoading && <LoadingOverlay message={mode === 'detach' ? "Detaching..." : "Attaching..."} color={themeColor} />}

                        {/* SELECTION TAB */}
                        {activeTab === 'selection' && (
                            <div className="h-full flex flex-col">
                                {footnotes.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center opacity-60">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <p className="text-sm font-medium">No items found.</p>
                                        <p className="text-xs mt-1">Paste XML containing {mode === 'detach' ? 'footnotes' : 'legend items'}.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
                                            <div className="text-xs text-slate-500 font-medium pl-1">
                                                Select items to process:
                                            </div>
                                            <button 
                                                onClick={toggleAll} 
                                                className={`text-xs font-semibold text-slate-600 px-2 py-1 rounded transition-colors ${mode === 'detach' ? 'hover:text-pink-600 hover:bg-pink-50' : 'hover:text-blue-600 hover:bg-blue-50'}`}
                                            >
                                                {selectedIds.size === footnotes.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar space-y-3">
                                            {footnotes.map(fn => (
                                                <label 
                                                    key={fn.id} 
                                                    className={`relative flex items-start gap-3 p-4 bg-white border rounded-xl cursor-pointer transition-all duration-200 group ${
                                                        selectedIds.has(fn.id) 
                                                        ? (mode === 'detach' ? 'border-pink-500 shadow-md shadow-pink-100 ring-1 ring-pink-500' : 'border-blue-500 shadow-md shadow-blue-100 ring-1 ring-blue-500')
                                                        : `border-slate-200 ${mode === 'detach' ? 'hover:border-pink-300' : 'hover:border-blue-300'} hover:shadow-sm`
                                                    }`}
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
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{fn.id}</span>
                                                                <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                                                    Label: <span className={`px-1.5 rounded ${mode === 'detach' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>{fn.label}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded border border-slate-100 font-mono break-words" dangerouslySetInnerHTML={{__html: fn.content || '<span class="italic text-slate-400">Empty content</span>'}}></div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="p-4 bg-white border-t border-slate-100">
                                            <button 
                                                onClick={processTable} 
                                                disabled={selectedIds.size === 0}
                                                title="Ctrl+Enter"
                                                className={`w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 ${
                                                    selectedIds.size === 0 ? 'bg-slate-300 cursor-not-allowed' :
                                                    mode === 'detach' 
                                                        ? 'bg-pink-600 hover:bg-pink-700 shadow-pink-500/20' 
                                                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                                                }`}
                                            >
                                                <span>{mode === 'detach' ? 'Convert to Legend' : 'Attach as Footnotes'} ({selectedIds.size})</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* RESULT TAB */}
                        {activeTab === 'result' && (
                            <div className="h-full flex flex-col">
                                <div className="bg-white p-2 border-b border-slate-100 flex justify-between items-center z-10">
                                     <div className="text-xs text-slate-500 pl-2">
                                        Output contains {output.length} chars
                                     </div>
                                     <button 
                                        onClick={() => { navigator.clipboard.writeText(output); setToast({msg: "Copied!", type: "success"})}} 
                                        title="Ctrl+Shift+C"
                                        className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-emerald-100 hover:border-emerald-200 transition-colors flex items-center gap-1"
                                     >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                        Copy to Clipboard
                                     </button>
                                </div>
                                <div className="flex-grow relative">
                                    <textarea 
                                        value={output}
                                        readOnly
                                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                                        placeholder="Processed XML will appear here after conversion..."
                                    />
                                    {!output && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <p className="text-slate-300 text-sm">Waiting for conversion...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* DIFF TAB */}
                        {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-auto custom-scrollbar bg-white">
                                 {diffElements ? diffElements : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <p className="text-sm font-medium">Run conversion to see differences.</p>
                                    </div>
                                 )}
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TableFixer;
