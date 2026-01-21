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
    isNakedMarker?: boolean;
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

    const diffXmlAware = (left: string, right: string): Change[] => {
        const tokenize = (text: string) => text.split(/(<[^>]+>|\s+)/).filter(t => t !== '');
        const leftTokens = tokenize(left);
        const rightTokens = tokenize(right);
        const arrayChanges = diffArrays(leftTokens, rightTokens);
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
                const fineDiff = diffXmlAware(leftVal, rightVal);
                for (let k = 0; k < fineDiff.length; k++) {
                    const currentPart = fineDiff[k];
                    if (!currentPart.added && !currentPart.removed) {
                        const prev = k > 0 ? fineDiff[k-1] : null;
                        const next = k < fineDiff.length - 1 ? fineDiff[k+1] : null;
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
            const spRegex = /<ce:simple-para\b[^>]*>([\s\S]*?)<\/ce:simple-para>/g;
            let match;
            while ((match = spRegex.exec(input)) !== null) {
                const fullTag = match[0];
                const inner = match[1].trim();
                let label = '';
                const labelTagMatch = /^\s*<ce:label>(.*?)<\/ce:label>/.exec(inner);
                const supMatch = /^\s*<ce:sup>(.*?)<\/ce:sup>/.exec(inner);
                const boldMatch = /^\s*<ce:bold>(.*?)<\/ce:bold>/.exec(inner);
                const plainMatch = /^\s*([a-zA-Z0-9\*\†\‡\§\⁎]{1,3})[\.\)]\s+/.exec(inner);

                if (labelTagMatch) label = labelTagMatch[1];
                else if (supMatch) label = supMatch[1];
                else if (boldMatch) label = boldMatch[1];
                else if (plainMatch) label = plainMatch[1];

                if (label) {
                    const idMatch = /id="([^"]+)"/.exec(fullTag);
                    const id = idMatch ? idMatch[1] : `sp_gen_${matches.length}`;
                    matches.push({ id, label, content: inner, fullTag });
                }
            }

            const nakedMarkers = ['⁎', '†', '‡', '§', '*'];
            nakedMarkers.forEach(sym => {
                const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nakedRegex = new RegExp(`(?<!<ce:sup>)${escapedSym}(?!<\\/ce:sup>)`, 'g');
                if (nakedRegex.test(input) && !matches.some(m => m.label === sym)) {
                    matches.push({
                        id: `naked_sym_${sym.charCodeAt(0)}`,
                        label: sym,
                        content: `Untagged marker "${sym}" detected in document body.`,
                        fullTag: '',
                        isNakedMarker: true
                    });
                }
            });
        }

        setFootnotes(matches);
        setSelectedIds(new Set(matches.map(m => m.id))); 
        if (matches.length > 0) setActiveTab('selection');
    }, [input, mode]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };
    
    const toggleAll = () => {
        if (selectedIds.size === footnotes.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(footnotes.map(f => f.id)));
    };

    const processTable = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML content first.", type: "warn" }); return; }
        if (selectedIds.size === 0) { setToast({ msg: "Select at least one item to process.", type: "warn" }); return; }

        setIsLoading(true);
        setTimeout(() => {
            const tableRegex = /<ce:table\b[\s\S]*?<\/ce:table>/g;
            const tableBlocks = input.match(tableRegex) || [input];
            
            let totalProcessedCount = 0;

            if (mode === 'detach') {
                const existingSpMatches = input.match(/id="sp(\d+)"/g);
                let spIdCounter = 4000;
                if (existingSpMatches) {
                    const maxId = existingSpMatches.reduce((max, curr) => {
                        const m = curr.match(/id="sp(\d+)"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    spIdCounter = Math.ceil((maxId + 1) / 5) * 5;
                    if (spIdCounter < 4000) spIdCounter = 4000;
                }

                const processedBlocks = tableBlocks.map(tableMarkup => {
                    let currentTable = tableMarkup;
                    let legendsToAdd: string[] = [];
                    
                    const tableFootnotes = footnotes.filter(fn => selectedIds.has(fn.id) && tableMarkup.includes(fn.fullTag));
                    
                    tableFootnotes.forEach(fn => {
                        const refRegex = new RegExp(`<ce:cross-ref\\b[^>]*?refid="${fn.id}"[^>]*>([\\s\\S]*?)<\\/ce:cross-ref>`, 'g');
                        currentTable = currentTable.replace(refRegex, '$1');
                        currentTable = currentTable.split(fn.fullTag).join('');
                        const spId = `sp${spIdCounter}`;
                        spIdCounter += 5;
                        legendsToAdd.push(`<ce:simple-para id="${spId}"><ce:sup>${fn.label}</ce:sup> ${fn.content}</ce:simple-para>`);
                        totalProcessedCount++;
                    });

                    if (legendsToAdd.length > 0) {
                        const legendMarkup = legendsToAdd.join('');
                        
                        // Locate the Final Structural Element for insertion
                        const lastLegendIdx = currentTable.lastIndexOf('</ce:legend>');
                        const lastTgroupIdx = currentTable.lastIndexOf('</tgroup>');
                        
                        let insertionPoint = -1;
                        let anchorLength = 0;

                        if (lastLegendIdx > lastTgroupIdx && lastLegendIdx !== -1) {
                            insertionPoint = lastLegendIdx;
                            anchorLength = '</ce:legend>'.length;
                        } else if (lastTgroupIdx !== -1) {
                            insertionPoint = lastTgroupIdx;
                            anchorLength = '</tgroup>'.length;
                        }

                        if (insertionPoint !== -1) {
                            const splitAt = insertionPoint + anchorLength;
                            const before = currentTable.slice(0, splitAt);
                            const after = currentTable.slice(splitAt);
                            
                            // If we don't have a legend, wrap in ce:legend tags
                            const wrappedMarkup = lastLegendIdx === -1 ? `<ce:legend>${legendMarkup}</ce:legend>` : legendMarkup;
                            currentTable = `${before}${wrappedMarkup}${after}`;
                        } else {
                            // Fallback to before closing table tag
                            currentTable = currentTable.replace('</ce:table>', `<ce:legend>${legendMarkup}</ce:legend></ce:table>`);
                        }
                    }
                    return currentTable;
                });

                const finalOutput = processedBlocks.join('\n\n');
                setOutput(finalOutput);
                generateDiff(input, finalOutput);
                setToast({ msg: `Moved ${totalProcessedCount} footnotes to legends.`, type: "success" });

            } else {
                const existingTfMatches = input.match(/id="tf(\d+)"/g);
                let tfIdCounter = 4000;
                if (existingTfMatches) {
                     const maxId = existingTfMatches.reduce((max, curr) => {
                        const m = curr.match(/id="tf(\d+)"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    if (maxId >= 4000) tfIdCounter = Math.ceil((maxId + 1) / 5) * 5;
                }

                const sortedSelected = footnotes
                    .filter(fn => selectedIds.has(fn.id))
                    .sort((a, b) => b.label.length - a.label.length);

                const processedBlocks = tableBlocks.map(tableMarkup => {
                    let currentTable = tableMarkup;
                    let footnotesToAdd: string[] = [];
                    const replacementMap = new Map<string, string>();

                    sortedSelected.forEach((fn, index) => {
                        const labelStr = fn.label;
                        const escapedLabel = labelStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const firstChar = labelStr.charAt(0).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const lastChar = labelStr.charAt(labelStr.length - 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                        const existingPattern = `(?:<ce:cross-ref[^>]*>\\s*)?<ce:sup>${escapedLabel}<\\/ce:sup>`;
                        const nakedPattern = `(?<!${firstChar})${escapedLabel}(?!${lastChar})`;
                        const targetRegex = new RegExp(`(${existingPattern}|${nakedPattern})`, 'g');

                        const isPresentInTable = (fn.fullTag && currentTable.includes(fn.fullTag)) || (!fn.fullTag && targetRegex.test(currentTable));
                        
                        if (isPresentInTable) {
                            const numericPart = String(tfIdCounter).padStart(4, '0');
                            const newFnId = `tf${numericPart}`;
                            const newNpId = `np${numericPart}`;
                            tfIdCounter += 5;
                            
                            if (fn.fullTag) currentTable = currentTable.split(fn.fullTag).join('');
                            
                            const placeholder = `##TF_PH_${index}##`;
                            currentTable = currentTable.replace(targetRegex, (match) => {
                                if (match.includes('<ce:cross-ref')) {
                                    replacementMap.set(placeholder, match); 
                                    return placeholder;
                                }
                                let finalTag = match.includes('<ce:sup>') 
                                    ? `<ce:cross-ref refid="${newFnId}">${match.trim()}</ce:cross-ref>`
                                    : `<ce:cross-ref refid="${newFnId}"><ce:sup>${fn.label}</ce:sup></ce:cross-ref>`;
                                replacementMap.set(placeholder, finalTag);
                                return placeholder;
                            });

                            let cleanContent = fn.content;
                            if (fn.isNakedMarker) cleanContent = '??'; 
                            else {
                                cleanContent = cleanContent
                                    .replace(new RegExp(`^\\s*<ce:label>${escapedLabel}<\\/ce:label>\\s*`), '')
                                    .replace(new RegExp(`^\\s*<ce:sup>${escapedLabel}<\\/ce:sup>\\s*`), '')
                                    .replace(new RegExp(`^\\s*<ce:bold>${escapedLabel}<\\/ce:bold>\\s*`), '')
                                    .replace(new RegExp(`^\\s*${escapedLabel}[\\.\\)]\\s+`), '')
                                    .trim();
                            }
                            footnotesToAdd.push(`<ce:table-footnote id="${newFnId}"><ce:label>${fn.label}</ce:label><ce:note-para id="${newNpId}">${cleanContent}</ce:note-para></ce:table-footnote>`);
                            totalProcessedCount++;
                        }
                    });

                    replacementMap.forEach((xml, placeholder) => {
                        currentTable = currentTable.split(placeholder).join(xml);
                    });

                    // STRUCTURAL AWARENESS: Locate the Final Structural Element
                    if (footnotesToAdd.length > 0) {
                        const footnotesMarkup = footnotesToAdd.join('');
                        const lastLegendIdx = currentTable.lastIndexOf('</ce:legend>');
                        const lastTgroupIdx = currentTable.lastIndexOf('</tgroup>');
                        
                        let insertionPoint = -1;
                        let anchorLength = 0;

                        if (lastLegendIdx > lastTgroupIdx && lastLegendIdx !== -1) {
                            insertionPoint = lastLegendIdx;
                            anchorLength = '</ce:legend>'.length;
                        } else if (lastTgroupIdx !== -1) {
                            insertionPoint = lastTgroupIdx;
                            anchorLength = '</tgroup>'.length;
                        }

                        if (insertionPoint !== -1) {
                            const splitAt = insertionPoint + anchorLength;
                            const before = currentTable.slice(0, splitAt);
                            const after = currentTable.slice(splitAt);
                            currentTable = `${before}${footnotesMarkup}${after}`;
                        } else {
                            currentTable = currentTable.replace('</ce:table>', `${footnotesMarkup}</ce:table>`);
                        }
                    }
                    currentTable = currentTable.replace(/<ce:legend>\s*<\/ce:legend>/g, '');
                    return currentTable;
                });

                const finalOutput = processedBlocks.join('\n\n');
                setOutput(finalOutput);
                generateDiff(input, finalOutput);
                setToast({ msg: `Attached ${totalProcessedCount} items as footnotes across tables.`, type: "success" });
            }

            setActiveTab('result');
            setIsLoading(false);
        }, 600);
    };

    useKeyboardShortcuts({
        onPrimary: processTable,
        onCopy: () => { if (output && activeTab === 'result') { navigator.clipboard.writeText(output); setToast({msg: 'Copied output!', type:'success'}); } },
        onClear: () => { setInput(''); setFootnotes([]); setOutput(''); setToast({msg: 'Input cleared', type:'warn'}); }
    }, [input, output, footnotes, selectedIds, activeTab, mode]);

    const themeColor = mode === 'detach' ? 'pink' : 'blue';

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">XML Table Fixer</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Manage table footnotes by detaching them to legends or attaching legends back to cells.</p>
            </div>

            <div className="flex justify-center mb-8">
                <div className="bg-slate-100 p-1 rounded-xl flex shadow-inner">
                    <button onClick={() => setMode('detach')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'detach' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Detach (Footnote &rarr; Legend)</button>
                    <button onClick={() => setMode('attach')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'attach' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Attach (Legend &rarr; Footnote)</button>
                </div>
            </div>

            <div className={`grid gap-8 h-[650px] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 ${mode === 'detach' ? 'focus-within:ring-pink-100' : 'focus-within:ring-blue-100'} transition-all duration-300 ${activeTab === 'diff' ? 'hidden' : 'flex'}`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">1</span>Input XML</label>
                        <div className="flex gap-2">
                             {footnotes.length > 0 && <span className={`text-xs font-medium px-2 py-1 rounded-md border flex items-center gap-1 ${mode === 'detach' ? 'text-pink-600 bg-pink-50 border-pink-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>{footnotes.length} Detected</span>}
                             <button onClick={() => { setInput(''); setFootnotes([]); }} className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                        </div>
                    </div>
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" placeholder={mode === 'detach' ? "Paste <ce:table> containing footnotes..." : "Paste <ce:table> containing legend items..."} spellCheck={false} />
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                     <div className="flex border-b border-slate-100 bg-slate-50">
                        <button onClick={() => setActiveTab('selection')} className={`flex-1 py-3 text-sm font-bold transition-all border-r border-slate-100 ${activeTab === 'selection' ? `bg-white ${mode === 'detach' ? 'text-pink-600' : 'text-blue-600'}` : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}><span className="flex items-center justify-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'selection' ? (mode === 'detach' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600') : 'bg-slate-200 text-slate-500'}`}>2</span>Selection</span></button>
                        <button onClick={() => setActiveTab('result')} className={`flex-1 py-3 text-sm font-bold transition-all border-r border-slate-100 ${activeTab === 'result' ? 'bg-white text-emerald-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}><span className="flex items-center justify-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'result' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>3</span>Result</span></button>
                        <button onClick={() => setActiveTab('diff')} className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'diff' ? 'bg-white text-orange-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}><span className="flex items-center justify-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === 'diff' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>4</span>Diff View</span></button>
                     </div>

                    <div className="flex-grow relative overflow-hidden bg-slate-50/50">
                        {isLoading && <LoadingOverlay message={mode === 'detach' ? "Detaching..." : "Attaching..."} color={themeColor} />}

                        {activeTab === 'selection' && (
                            <div className="h-full flex flex-col">
                                {footnotes.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center opacity-60"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><p className="text-sm font-medium">No items found.</p><p className="text-xs mt-1">Paste XML containing {mode === 'detach' ? 'footnotes' : 'legend items'}.</p></div>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white border-b border-slate-100 flex justify-between items-center shadow-sm z-10"><div className="text-xs text-slate-500 font-medium pl-1">Select items to process:</div><button onClick={toggleAll} className={`text-xs font-semibold text-slate-600 px-2 py-1 rounded transition-colors ${mode === 'detach' ? 'hover:text-pink-600 hover:bg-pink-50' : 'hover:text-blue-600 hover:bg-blue-50'}`}>{selectedIds.size === footnotes.length ? 'Deselect All' : 'Select All'}</button></div>
                                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar space-y-3">
                                            {footnotes.map(fn => (
                                                <label key={fn.id} className={`relative flex items-start gap-3 p-4 bg-white border rounded-xl cursor-pointer transition-all duration-200 group ${selectedIds.has(fn.id) ? (mode === 'detach' ? 'border-pink-500 shadow-md shadow-pink-100 ring-1 ring-pink-500' : 'border-blue-500 shadow-md shadow-blue-100 ring-1 ring-blue-500') : `border-slate-200 ${mode === 'detach' ? 'hover:border-pink-300' : 'hover:border-blue-300'} hover:shadow-sm`}`}>
                                                    <div className="pt-0.5"><input type="checkbox" checked={selectedIds.has(fn.id)} onChange={() => toggleSelection(fn.id)} className={`rounded border-slate-300 w-4 h-4 cursor-pointer ${mode === 'detach' ? 'text-pink-600 focus:ring-pink-500' : 'text-blue-600 focus:ring-blue-500'}`} /></div>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{fn.id}</span>
                                                                <span className="text-sm font-bold text-slate-800 flex items-center gap-1">Label: <span className={`px-1.5 rounded ${mode === 'detach' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>{fn.label}</span></span>
                                                                {fn.isNakedMarker && <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded border border-rose-200">Naked Marker</span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded border border-slate-100 font-mono break-words" dangerouslySetInnerHTML={{__html: fn.content || '<span class="italic text-slate-400">Empty content</span>'}}></div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'result' && (
                            <div className="h-full flex flex-col">
                                <div className="bg-white p-2 border-b border-slate-100 flex justify-between items-center z-10"><div className="text-xs text-slate-500 pl-2">Output contains {output.length} chars</div><button onClick={() => { navigator.clipboard.writeText(output); setToast({msg: "Copied!", type: "success"})}} className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-emerald-100 hover:border-emerald-200 transition-colors flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>Copy to Clipboard</button></div>
                                <div className="flex-grow relative"><textarea value={output} readOnly className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" placeholder="Processed XML will appear here after conversion..." />{!output && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-slate-300 text-sm">Waiting for conversion...</p></div>}</div>
                            </div>
                        )}

                        {activeTab === 'diff' && (
                             <div className="absolute inset-0 overflow-auto custom-scrollbar bg-white">{diffElements ? diffElements : <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><p className="text-sm font-medium">Run conversion to see differences.</p></div>}</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button onClick={processTable} disabled={selectedIds.size === 0 || isLoading} className={`group font-bold py-3.5 px-10 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 ${mode === 'detach' ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-500/30' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'}`}>{mode === 'detach' ? 'Convert Selection to Legend' : 'Attach Selection as Footnotes'}</button>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TableFixer;