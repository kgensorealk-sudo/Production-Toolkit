import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ReferenceChange {
    id: string;
    oldLabel: string;
    newLabel: string;
    changed: boolean;
    isOtherRef: boolean;
}

const XmlRenumber: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [prefix, setPrefix] = useState('[');
    const [suffix, setSuffix] = useState(']');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // View State
    const [activeTab, setActiveTab] = useState<'raw' | 'diff' | 'report' | 'extraction'>('raw');
    const [reportData, setReportData] = useState<ReferenceChange[]>([]);
    const [extractedRefs, setExtractedRefs] = useState<string[]>([]);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    
    // Report Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterChangedOnly, setFilterChangedOnly] = useState(false);
    const [filterOtherRefOnly, setFilterOtherRefOnly] = useState(false);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Copy Helper for Rich Text
    const copyRichText = (htmlContent: string, isBatch: boolean = false) => {
        try {
            // Strip tags for plain text fallback
            let plainText = htmlContent.replace(/<[^>]+>/g, '');
            // Simple entity decode for plain text
            plainText = plainText
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ');

            // For batch copy, use paragraphs for HTML, double newline for plain
            const finalHtml = isBatch 
                ? htmlContent 
                : `<span>${htmlContent}</span>`;
            
            const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            
            // Use ClipboardItem if available
            if (typeof ClipboardItem !== 'undefined') {
                const data = [new ClipboardItem({ 
                    "text/html": htmlBlob, 
                    "text/plain": textBlob 
                })];
                navigator.clipboard.write(data).then(() => {
                    setToast({ msg: 'Copied with formatting!', type: 'success' });
                });
            } else {
                // Fallback for environments without ClipboardItem
                navigator.clipboard.writeText(plainText).then(() => {
                    setToast({ msg: 'Copied plain text (Browser limit)', type: 'warn' });
                });
            }
        } catch (err) {
            console.error('Copy failed', err);
            // Ultimate fallback
            navigator.clipboard.writeText(htmlContent);
            setToast({ msg: 'Copied raw HTML (Rich text failed)', type: 'warn' });
        }
    };

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

    const renumber = () => {
        if (!input.trim()) {
            setToast({ msg: 'Please paste input text first.', type: 'warn' });
            return;
        }

        setIsLoading(true);

        setTimeout(() => {
            try {
                // Pre-scan for other-refs to verify IDs
                const otherRefIds = new Set<string>();
                const fullRefRegexScan = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                let m;
                while ((m = fullRefRegexScan.exec(input)) !== null) {
                    if (m[2].indexOf('<ce:other-ref') !== -1) {
                        otherRefIds.add(m[1]);
                    }
                }

                const bibRefRegex = /(<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>[\s\S]*?)<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/g;
                
                // Refactored: Targets optional [ with its own internal space, but ignores external sentence spaces
                const singleCrossRefRegex = /(?:\[\s*)?(<ce:cross-ref\b[^>]*?\brefid="([^"]+)"[^>]*?>)[\s\S]*?<\/ce:cross-ref>(?:\s*\])?/g;
                const rangeCrossRefRegex = /(?:\[\s*)?(<ce:cross-refs\b[^>]*?\brefid="([^"]+)"[^>]*?>)[\s\S]*?<\/ce:cross-refs>(?:\s*\])?/g;

                let counter = 1;
                let bibMatchCount = 0;
                const referenceMap: Record<string, number> = {}; 
                const changes: ReferenceChange[] = [];

                let renumberedText = input.replace(bibRefRegex, (match, prefixGroup, uniqueId, originalLabelContent) => {
                    bibMatchCount++;
                    const newNumber = counter;
                    const newLabel = `${prefix}${newNumber}${suffix}`;
                    const cleanOld = originalLabelContent.trim();
                    const isOther = otherRefIds.has(uniqueId);
                    
                    changes.push({
                        id: uniqueId,
                        oldLabel: cleanOld,
                        newLabel: newLabel,
                        changed: cleanOld !== newLabel,
                        isOtherRef: isOther
                    });

                    referenceMap[uniqueId] = newNumber;
                    const newTag = `<ce:label>${newLabel}</ce:label>`;
                    counter++;
                    return `${prefixGroup}${newTag}`;
                });

                if (bibMatchCount === 0) {
                    setToast({ msg: 'No <ce:label> tags found.', type: 'error' });
                    setIsLoading(false);
                    return;
                }

                // Replacement: Strips the matched optional brackets without touching text that wasn't matched
                renumberedText = renumberedText.replace(singleCrossRefRegex, (match, openTag, refId) => {
                    const newNumber = referenceMap[refId];
                    if (newNumber === undefined) return match; 
                    return `${openTag}${prefix}${newNumber}${suffix}</ce:cross-ref>`;
                });

                const collapseRanges = (numbers: number[]) => {
                    if (numbers.length === 0) return '';
                    // Rule: Strictly unique sorted numbers
                    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
                    const ranges: string[] = [];
                    
                    let i = 0;
                    while (i < sorted.length) {
                        let start = sorted[i];
                        let end = start;
                        
                        // Find end of consecutive sequence
                        while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
                            end = sorted[i + 1];
                            i++;
                        }
                        
                        if (start === end) {
                            // Lone number
                            ranges.push(start.toString());
                        } else if (end - start === 1) {
                            // Rule: Exactly 2 consecutive numbers -> use comma
                            ranges.push(start.toString());
                            ranges.push(end.toString());
                        } else {
                            // Rule: 3 or more consecutive numbers -> use en-dash
                            ranges.push(`${start}–${end}`);
                        }
                        i++;
                    }
                    
                    // Rule: No space between commas
                    return ranges.join(',');
                };

                // Replacement: Strips the matched optional brackets
                renumberedText = renumberedText.replace(rangeCrossRefRegex, (match, openTag, refIdsString) => {
                    const refIds = refIdsString.split(/\s+/).filter((id: string) => id.trim() !== '');
                    const uniqueNumbers = [...new Set(refIds.map((id: string) => referenceMap[id]).filter((num: number) => num !== undefined))];
                    if (uniqueNumbers.length === 0) return match; 
                    return `${openTag}${prefix}${collapseRanges(uniqueNumbers as number[])}${suffix}</ce:cross-refs>`;
                });

                // Extraction of Other Refs from the FINAL renumbered text
                const extracted: string[] = [];
                const fullRefRegexExtract = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                let exMatch;
                while ((exMatch = fullRefRegexExtract.exec(renumberedText)) !== null) {
                    const fullContent = exMatch[0];
                    const innerContent = exMatch[2];
                    
                    if (innerContent.indexOf('<ce:other-ref') !== -1) {
                        // Extract Label
                        const labelMatch = /<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/.exec(fullContent);
                        const label = labelMatch ? labelMatch[1].trim() : '';
                        
                        // Remove label tag to avoid double text but keep the text content
                        let textOnly = fullContent.replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/, ' ');
                        
                        // Replace common formatting tags with HTML equivalents
                        textOnly = textOnly
                            .replace(/<ce:italic\b[^>]*>/gi, '<i>')
                            .replace(/<\/ce:italic>/gi, '</i>')
                            .replace(/<ce:bold\b[^>]*>/gi, '<b>')
                            .replace(/<\/ce:bold>/gi, '</b>')
                            .replace(/<ce:sup\b[^>]*>/gi, '<sup>')
                            .replace(/<\/ce:sup>/gi, '</sup>')
                            .replace(/<ce:inf\b[^>]*>/gi, '<sub>')
                            .replace(/<\/ce:inf>/gi, '</sub>');

                        // Strip all other tags, protecting our new HTML tags
                        let cleanText = textOnly.replace(/<(?!\/?(i|b|sup|sub)\b)[^>]+>/gi, '');
                        
                        // Normalize whitespace
                        cleanText = cleanText.replace(/\s+/g, ' ').trim();

                        if (label) {
                            extracted.push(`${label} ${cleanText}`);
                        } else {
                            extracted.push(cleanText);
                        }
                    }
                }
                setExtractedRefs(extracted);

                setOutput(renumberedText);
                setReportData(changes);
                generateDiff(input, renumberedText);
                
                setActiveTab('report');
                setToast({ msg: `Successfully processed ${bibMatchCount} references.`, type: 'success' });
            } catch (e) {
                setToast({ msg: 'An error occurred during processing.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        }, 600);
    };

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onPrimary: renumber,
        onCopy: () => {
            if (activeTab === 'raw' && output) {
                navigator.clipboard.writeText(output);
                setToast({msg: 'Copied output!', type:'success'});
            } else if (activeTab === 'extraction' && extractedRefs.length > 0) {
                copyRichText(extractedRefs.map(r => `<p>${r}</p>`).join('\n'), true);
            }
        },
        onClear: () => {
            setInput('');
            setToast({msg: 'Input cleared', type:'warn'});
        }
    }, [input, output, activeTab, extractedRefs]);

    // QC Report Logic
    const downloadCSV = () => {
        if (reportData.length === 0) return;
        const headers = ['ID', 'Old Label', 'New Label', 'Status', 'Type'];
        const rows = reportData.map(item => [
            item.id,
            item.oldLabel,
            item.newLabel,
            item.changed ? 'Changed' : 'Unchanged',
            item.isOtherRef ? 'Other-Ref' : 'Standard'
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'xml_renumber_report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredReportData = reportData.filter(item => {
        const matchesFilter = filterChangedOnly ? item.changed : true;
        const matchesOtherRef = filterOtherRefOnly ? item.isOtherRef : true;
        const query = searchQuery.toLowerCase();
        const matchesSearch = !query || 
            item.id.toLowerCase().includes(query) || 
            item.oldLabel.toLowerCase().includes(query) ||
            item.newLabel.toLowerCase().includes(query);
        return matchesFilter && matchesOtherRef && matchesSearch;
    });

    const stats = {
        total: reportData.length,
        changed: reportData.filter(i => i.changed).length,
        otherRefs: reportData.filter(i => i.isOtherRef).length
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">XML Reference Normalizer</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Standardize citations and automatically update cross-references.</p>
            </div>

            <div className="glass-panel bg-white/50 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                    </div>
                     <div className="flex flex-col">
                        <span className="font-bold text-slate-700">Configuration</span>
                        <span className="text-xs text-slate-500">Define label format</span>
                     </div>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center">
                        <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={5} className="w-12 text-center font-mono font-bold text-slate-700 outline-none border-b-2 border-transparent focus:border-indigo-500 transition-colors bg-transparent placeholder-slate-300" placeholder="[" />
                        <span className="text-slate-400 font-mono px-2 text-sm">#</span>
                        <input type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} maxLength={5} className="w-12 text-center font-mono font-bold text-slate-700 outline-none border-b-2 border-transparent focus:border-indigo-500 transition-colors bg-transparent placeholder-slate-300" placeholder="]" />
                    </div>
                    <div className="h-8 w-px bg-slate-200 mx-2"></div>
                    <div className="text-xs text-slate-500 font-medium pr-2">
                        Preview: <span className="bg-slate-100 px-2 py-1 rounded text-indigo-600 font-mono font-bold border border-slate-200">{prefix}1{suffix}</span>
                    </div>
                </div>
                <button 
                    onClick={renumber} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all active:scale-95 flex items-center gap-2 ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
                >
                    {isLoading ? (
                        <>
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            <span>Process XML</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </>
                    )}
                </button>
            </div>

             <div className={`grid gap-8 h-[calc(100vh-280px)] min-h-[600px] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Input Column - Hidden when Diff view is active */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-300 ${activeTab === 'diff' ? 'hidden' : 'flex'}`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                         <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">IN</span>
                            Input XML
                        </label>
                         <button onClick={() => setInput('')} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear Input</button>
                    </div>
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-indigo-100 placeholder-slate-300" 
                        placeholder="Paste your XML content here..." 
                        spellCheck={false}
                    />
                </div>
                
                {/* Output Column - Full width when Diff view is active */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                     <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                         <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">OUT</span>
                            Result
                        </label>
                         {activeTab === 'raw' && <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg: 'Copied to clipboard!', type:'success'}); }} title="Ctrl+Shift+C" className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-transparent hover:border-emerald-100 transition-colors">Copy XML</button>}
                    </div>
                    
                    {/* Modern Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         {['raw', 'diff', 'report', 'extraction'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === tab 
                                    ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'raw' && 'Raw XML'}
                                {tab === 'diff' && 'Diff View'}
                                {tab === 'report' && 'QC Report'}
                                {tab === 'extraction' && 'Other Refs'}
                             </button>
                         ))}
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                        {isLoading && <LoadingOverlay message="Normalizing References..." color="indigo" />}

                        <div className="absolute inset-0 overflow-auto custom-scrollbar">
                            {activeTab === 'raw' && (
                                <textarea readOnly value={output} className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-transparent border-0 focus:ring-0 outline-none resize-none leading-relaxed" placeholder="Processed output will appear here..." />
                            )}
                            
                            {activeTab === 'diff' && (
                                <div className="min-w-full min-h-full">
                                    {diffElements ? diffElements : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            <p className="text-sm">Run process to view diff</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'report' && (
                                <div className="bg-white h-full flex flex-col">
                                    <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                            <div className="flex gap-4 text-sm">
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Total: <b>{stats.total}</b></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Changed: <b>{stats.changed}</b></div>
                                                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Other Refs: <b>{stats.otherRefs}</b></div>
                                            </div>
                                            <button onClick={downloadCSV} className="text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded shadow-sm transition-colors flex items-center gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                Export CSV
                                            </button>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <div className="relative flex-grow">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                </div>
                                                <input 
                                                    type="text" 
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="pl-9 w-full rounded-lg border-slate-200 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                                                    placeholder="Search by ID or Label..."
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-2 py-1.5 rounded border border-slate-200 cursor-pointer select-none">
                                                    <input type="checkbox" checked={filterChangedOnly} onChange={(e) => setFilterChangedOnly(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                                    Changed Only
                                                </label>
                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-2 py-1.5 rounded border border-slate-200 cursor-pointer select-none">
                                                    <input type="checkbox" checked={filterOtherRefOnly} onChange={(e) => setFilterOtherRefOnly(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                                    Other Refs Only
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-grow overflow-auto custom-scrollbar">
                                        <table className="min-w-full divide-y divide-slate-200">
                                            <thead className="bg-slate-50 sticky top-0 z-10">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Old Label</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">New Label</th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-200">
                                                {filteredReportData.length > 0 ? filteredReportData.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-slate-500">{item.id}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-500">{item.oldLabel}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-slate-900">{item.newLabel}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap">
                                                            {item.changed ? (
                                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">Changed</span>
                                                            ) : (
                                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Unchanged</span>
                                                            )}
                                                            {item.isOtherRef && (
                                                                <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">Other-Ref</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr>
                                                        <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                                                            No references found matching filters.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'extraction' && (
                                <div className="bg-white h-full flex flex-col">
                                   <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                       <h3 className="font-bold text-slate-700 text-sm">Extracted Other References ({extractedRefs.length})</h3>
                                       <button 
                                            onClick={() => copyRichText(extractedRefs.map(r => `<p>${r}</p>`).join('\n'), true)}
                                            title="Ctrl+Shift+C"
                                            className="text-xs font-bold text-purple-600 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                                       >
                                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                           Copy All
                                       </button>
                                   </div>
                                   <div className="flex-grow overflow-auto p-6 custom-scrollbar bg-slate-50/50">
                                       {extractedRefs.length > 0 ? (
                                           <div className="space-y-4 font-mono text-sm text-slate-700">
                                               {extractedRefs.map((ref, idx) => (
                                                   <div key={idx} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm relative group hover:border-purple-200 transition-all">
                                                        <div className="pr-8 whitespace-pre-wrap break-all" dangerouslySetInnerHTML={{ __html: ref }}></div>
                                                        <button 
                                                            onClick={() => copyRichText(ref)}
                                                            className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                            title="Copy This Item"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        </button>
                                                   </div>
                                               ))}
                                           </div>
                                       ) : (
                                           <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                               <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                               <p>No Other-Refs found.</p>
                                           </div>
                                       )}
                                   </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
             {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default XmlRenumber;
