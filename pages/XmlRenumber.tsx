
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';
import useSessionStorage from '../hooks/useSessionStorage';

interface ReferenceChange {
    id: string;
    oldLabel: string;
    newLabel: string;
    changed: boolean;
    isOtherRef: boolean;
}

const XmlRenumber: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useSessionStorage<string>('xml_renumber_input', '');
    const [output, setOutput] = useSessionStorage<string>('xml_renumber_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useSessionStorage<string>('xml_renumber_last_processed_input', '');
    const [prefix, setPrefix] = useState('[');
    const [suffix, setSuffix] = useState(']');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    
    const [activeTab, setActiveTab] = useLocalStorage<'raw' | 'diff' | 'report' | 'extraction'>('xml_renumber_active_tab', 'raw');
    const [reportData, setReportData] = useSessionStorage<ReferenceChange[]>('xml_renumber_report_data', []);
    const [extractedRefs, setExtractedRefs] = useSessionStorage<string[]>('xml_renumber_extracted_refs', []);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [filterChangedOnly, setFilterChangedOnly] = useState(false);
    const [filterOtherRefOnly, setFilterOtherRefOnly] = useState(false);

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
        // Migration/Cleanup: Remove large items from localStorage to free up space
        // since we moved them to sessionStorage
        const keysToCleanup = [
            'xml_renumber_input',
            'xml_renumber_output',
            'xml_renumber_last_processed_input',
            'xml_renumber_report_data',
            'xml_renumber_extracted_refs'
        ];
        keysToCleanup.forEach(key => {
            try {
                if (localStorage.getItem(key)) {
                    localStorage.removeItem(key);
                }
            } catch (e) {
                // Ignore errors
            }
        });
    }, []);

    const isDesktop = (window as any).electron !== undefined;

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const handleSaveToFile = async () => {
        if (!output) return;
        try {
            const res = await (window as any).electron.saveFile(output, 'renumbered_bib.xml', 'xml');
            if (res.success) {
                setToast({ msg: "File written to disk.", type: "success" });
            }
        } catch (e) {
            setToast({ msg: "Export failed.", type: "error" });
        }
    };

    const copyRichText = (htmlContent: string, isBatch: boolean = false) => {
        try {
            let plainText = htmlContent.replace(/<[^>]+>/g, '');
            plainText = plainText
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ');

            const finalHtml = isBatch 
                ? htmlContent 
                : `<span>${htmlContent}</span>`;
            
            const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            
            if (typeof ClipboardItem !== 'undefined') {
                const data = [new ClipboardItem({ 
                    "text/html": htmlBlob, 
                    "text/plain": textBlob 
                })];
                navigator.clipboard.write(data).then(() => {
                    setToast({ msg: 'Copied with formatting!', type: 'success' });
                });
            } else {
                navigator.clipboard.writeText(plainText).then(() => {
                    setToast({ msg: 'Copied plain text (Browser limit)', type: 'warn' });
                });
            }
        } catch (err) {
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

    const generateDiff = React.useCallback((original: string, modified: string) => {
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
                type = 'replace';
                leftVal = current.value;
                rightVal = diff[i+1].value;
                i += 2;
                changeCount++;
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
                changeCount++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
                changeCount++;
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
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                        data-change-row={type !== 'equal' ? "true" : undefined}
                        data-change-index={type !== 'equal' ? changeCount : undefined}
                        data-change-index-group={type !== 'equal' ? changeCount : undefined}
                    >
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
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
    }, []);

    useEffect(() => {
        // Only generate diff if the user is actually looking at the diff tab
        // and we have content to diff. This prevents UI freezes on large files.
        if (activeTab === 'diff' && input && output && !diffElements) {
            generateDiff(input, output);
        }
    }, [input, output, diffElements, generateDiff, activeTab]);

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

    const renumber = () => {
        if (!input.trim()) {
            setToast({ msg: 'Please paste input text first.', type: 'warn' });
            return;
        }

        setIsLoading(true);

        setTimeout(() => {
            try {
                const otherRefIds = new Set<string>();
                const fullRefRegexScan = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                let m;
                while ((m = fullRefRegexScan.exec(input)) !== null) {
                    if (m[2].indexOf('<ce:other-ref') !== -1) {
                        otherRefIds.add(m[1]);
                    }
                }

                const bibRefRegex = /(<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>[\s\S]*?)<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/g;
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

                renumberedText = renumberedText.replace(singleCrossRefRegex, (match, openTag, refId) => {
                    const newNumber = referenceMap[refId];
                    if (newNumber === undefined) return match; 
                    return `${openTag}${prefix}${newNumber}${suffix}</ce:cross-ref>`;
                });

                const collapseRanges = (numbers: number[]) => {
                    if (numbers.length === 0) return '';
                    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
                    const ranges: string[] = [];
                    
                    let i = 0;
                    while (i < sorted.length) {
                        let start = sorted[i];
                        let end = start;
                        while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
                            end = sorted[i + 1];
                            i++;
                        }
                        if (start === end) {
                            ranges.push(start.toString());
                        } else if (end - start === 1) {
                            ranges.push(start.toString());
                            ranges.push(end.toString());
                        } else {
                            ranges.push(`${start}–${end}`);
                        }
                        i++;
                    }
                    return ranges.join(',');
                };

                renumberedText = renumberedText.replace(rangeCrossRefRegex, (match, openTag, refIdsString) => {
                    const refIds = refIdsString.split(/\s+/).filter((id: string) => id.trim() !== '');
                    const uniqueNumbers = [...new Set(refIds.map((id: string) => referenceMap[id]).filter((num: number) => num !== undefined))];
                    if (uniqueNumbers.length === 0) return match; 
                    return `${openTag}${prefix}${collapseRanges(uniqueNumbers as number[])}${suffix}</ce:cross-refs>`;
                });

                const extracted: string[] = [];
                const fullRefRegexExtract = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                let exMatch;
                while ((exMatch = fullRefRegexExtract.exec(renumberedText)) !== null) {
                    const fullContent = exMatch[0];
                    const innerContent = exMatch[2];
                    
                    if (innerContent.indexOf('<ce:other-ref') !== -1) {
                        const labelMatch = /<ce:label\b[^>]*>([\s\S]*?)<\/ce:label>/.exec(fullContent);
                        const label = labelMatch ? labelMatch[1].trim() : '';
                        let textOnly = fullContent.replace(/<ce:label\b[^>]*>[\s\S]*?<\/ce:label>/, ' ');
                        textOnly = textOnly
                            .replace(/<ce:italic\b[^>]*>/gi, '<i>')
                            .replace(/<\/ce:italic>/gi, '</i>')
                            .replace(/<ce:bold\b[^>]*>/gi, '<b>')
                            .replace(/<\/ce:bold>/gi, '</b>')
                            .replace(/<ce:sup\b[^>]*>/gi, '<sup>')
                            .replace(/<\/ce:sup>/gi, '</sup>')
                            .replace(/<ce:inf\b[^>]*>/gi, '<sub>')
                            .replace(/<\/ce:inf>/gi, '</sub>');

                        let cleanText = textOnly.replace(/<(?!\/?(i|b|sup|sub)\b)[^>]+>/gi, '');
                        cleanText = cleanText.replace(/\s+/g, ' ').trim();

                        if (label) extracted.push(`${label} ${cleanText}`);
                        else extracted.push(cleanText);
                    }
                }
                setExtractedRefs(extracted);
                setOutput(renumberedText);
                setLastProcessedInput(input);
                setReportData(changes);
                setDiffElements(null); // Force regeneration when user switches to diff tab
                
                // Background Scanner for Smart Suggestions
                const newSuggestions: SmartSuggestion[] = [];
                
                // 1. Other-Refs Scanner
                const otherRefCount = (renumberedText.match(/<ce:other-ref/g) || []).length;
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

                // 2. XML Tag Cleaner
                const tagMatches = renumberedText.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
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

                // 3. Citation Linker Pro
                const unlinkedCitations = (renumberedText.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
                if (unlinkedCitations > 0) {
                    newSuggestions.push({
                        id: 'citation-linker',
                        toolName: 'Citation Linker Pro',
                        description: `It is found that the XML result contains ${unlinkedCitations} unlinked Cross-ref(s). Please use the Citation Linker Pro.`,
                        path: '/citationLinker',
                        icon: <LinkIcon className="w-4 h-4" />,
                        condition: 'Unlinked citations detected'
                    });
                }

                // 4. Uncited Ref Cleaner
                const bibRefIds = Array.from(renumberedText.matchAll(/<ce:bib-reference\b[^>]*?\bid="([^"]+)"/g)).map(m => m[1]);
                if (bibRefIds.length > 0) {
                    const crossRefIds = new Set(Array.from(renumberedText.matchAll(/\brefid="([^"]+)"/g)).map(m => m[1]));
                    const uncited = bibRefIds.filter(id => !crossRefIds.has(id));
                    if (uncited.length > 0) {
                        newSuggestions.push({
                            id: 'uncited-cleaner',
                            toolName: 'Uncited Ref Cleaner',
                            description: `It is found that the XML contains ${uncited.length} reference(s) that are not cited in the text. Please use the Uncited Ref Cleaner to identify and remove them.`,
                            path: '/uncitedCleaner',
                            icon: <Eraser className="w-4 h-4" />,
                            condition: 'Uncited references detected'
                        });
                    }
                }

                // 5. View Synchronizer
                const complexNodeCount = (renumberedText.match(/<(ce:table|ce:figure|ce:display-formula|ce:list)\b/g) || []).length;
                if (complexNodeCount > 0 && renumberedText.includes('<ce:para>')) {
                    newSuggestions.push({
                        id: 'view-sync',
                        toolName: 'View Synchronizer',
                        description: `It is found that the XML contains ${complexNodeCount} complex structural nodes. Please use the View Synchronizer to ensure visual consistency between XML source and rendered views.`,
                        path: '/viewSync',
                        icon: <RefreshCw className="w-4 h-4" />,
                        condition: 'Complex structural nodes detected'
                    });
                }

                // 6. Reference Structure Repair
                if (renumberedText.includes('<ce:source-text')) {
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
                setActiveTab('report');
                setToast({ msg: `Successfully processed ${bibMatchCount} references.`, type: 'success' });
            } catch (e) {
                setToast({ msg: 'An error occurred during processing.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        }, 600);
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setLastProcessedInput('');
        setReportData([]);
        setExtractedRefs([]);
        setDiffElements(null);
        setTotalChanges(0);
        setCurrentChangeIndex(0);
        
        // Explicitly clear sessionStorage for these keys
        try {
            sessionStorage.removeItem('xml_renumber_input');
            sessionStorage.removeItem('xml_renumber_output');
            sessionStorage.removeItem('xml_renumber_last_processed_input');
            sessionStorage.removeItem('xml_renumber_report_data');
            sessionStorage.removeItem('xml_renumber_extracted_refs');
        } catch (e) {}

        setToast({ msg: 'All cleared', type: 'warn' });
    };

    const isStale = output && input !== lastProcessedInput;

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
        onClear: clearAll
    }, [input, output, activeTab, extractedRefs, lastProcessedInput]);

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
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
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
                        <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={10} className="w-32 text-center font-mono font-bold text-slate-700 outline-none border-b-2 border-transparent focus:border-indigo-500 transition-colors bg-transparent placeholder-slate-300" placeholder="[" />
                        <span className="text-slate-400 font-mono px-2 text-sm">#</span>
                        <input type="text" value={suffix} onChange={(e) => setSuffix(e.target.value)} maxLength={10} className="w-32 text-center font-mono font-bold text-slate-700 outline-none border-b-2 border-transparent focus:border-indigo-500 transition-colors bg-transparent placeholder-slate-300" placeholder="]" />
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
                    {isLoading ? <span>Processing...</span> : (
                        <>
                            <span>Process XML</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </>
                    )}
                </button>
            </div>

            {/* Smart Suggestions Section */}
            {suggestions.length > 0 && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-4 bg-indigo-50/30 border-2 border-indigo-100 rounded-2xl border-dashed">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-indigo-600" />
                            </div>
                            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'XML Normalizer' } });
                                    }}
                                    className="flex items-center gap-4 p-3 bg-white border border-indigo-100 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[9px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                        <div className="text-[8px] text-indigo-500 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

             <div className={`grid gap-8 min-h-[calc(100vh-280px)] transition-all duration-300 ${activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-300 ${activeTab === 'diff' ? 'hidden' : 'flex'} min-h-[500px]`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                         <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">IN</span>
                            Input XML
                        </label>
                         <button onClick={clearAll} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear All</button>
                    </div>
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        className="w-full flex-grow p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-indigo-100 placeholder-slate-300" 
                        placeholder="Paste your XML content here..." 
                        spellCheck={false}
                    />
                </div>
                
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                     <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center shrink-0">
                         <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">OUT</span>
                            Result
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    STALE
                                </span>
                            )}
                        </label>
                         <div className="flex items-center gap-2">
                            {isStale && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter hidden sm:block">Input changed - Re-process required</span>}
                            {output && isDesktop && (
                                <button onClick={handleSaveToFile} className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-indigo-600 hover:bg-indigo-50 border-indigo-100'}`}>Save As File</button>
                            )}
                            {activeTab === 'raw' && (
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(output); setToast({msg: 'Copied to clipboard!', type:'success'}); }} 
                                    title="Ctrl+Shift+C" 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 hover:bg-emerald-50 border-transparent hover:border-emerald-100'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    {isStale ? 'Copy Stale XML' : 'Copy XML'}
                                </button>
                            )}
                         </div>
                    </div>
                    
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1 shrink-0">
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
                                {tab === 'report' && 'QC Report'}
                             </button>
                         ))}
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                        {isLoading && <LoadingOverlay message="Normalizing References..." color="indigo" />}

                        <div className="flex-grow overflow-auto custom-scrollbar">
                            {activeTab === 'raw' && (
                                <textarea readOnly value={output} className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-transparent border-0 focus:ring-0 outline-none resize-none leading-relaxed" placeholder="Processed output will appear here..." />
                            )}
                            
                            {activeTab === 'diff' && (
                                <div className="flex-grow relative flex flex-col overflow-hidden h-full">
                                    <div 
                                        ref={diffContainerRef}
                                        className="absolute inset-0 overflow-auto custom-scrollbar"
                                    >
                                        {diffElements ? diffElements : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                <GitCompare size={48} strokeWidth={1} className="mb-3 text-slate-300" />
                                                <p className="text-sm font-medium uppercase tracking-widest">Run process to view diff</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Floating Diff Navigation */}
                                    <AnimatePresence>
                                        {totalChanges > 0 && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                                className="absolute bottom-8 right-8 flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
                                            >
                                                <div className="flex items-center gap-1 pr-2 border-r border-slate-100">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                        <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex flex-col px-2">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                        <span className="text-xs font-black text-slate-900 tabular-nums leading-none">
                                                            {currentChangeIndex} <span className="text-slate-300 mx-0.5">/</span> {totalChanges}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => scrollToChange('prev')}
                                                        className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                        title="Previous Change (Shift+Tab)"
                                                    >
                                                        <ChevronUp className="w-5 h-5 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                    </button>
                                                    <button 
                                                        onClick={() => scrollToChange('next')}
                                                        className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                        title="Next Change (Tab)"
                                                    >
                                                        <ChevronDown className="w-5 h-5 group-active:translate-y-0.5 transition-transform" strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
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
                                                    <tr key={item.id} className={`transition-colors ${item.changed ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500 hover:bg-emerald-50/70' : 'hover:bg-slate-50 opacity-80'}`}>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-slate-700 font-bold">{item.id}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono">
                                                            {item.changed ? (
                                                                <span className="line-through text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-semibold">{item.oldLabel}</span>
                                                            ) : (
                                                                <span className="text-slate-500">{item.oldLabel}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono">
                                                            {item.changed ? (
                                                                <span className="text-emerald-950 font-black bg-emerald-200 border border-emerald-400 px-2 py-0.5 rounded shadow-2xs">→ {item.newLabel}</span>
                                                            ) : (
                                                                <span className="text-slate-600 font-medium">{item.newLabel}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap flex items-center gap-2">
                                                            {item.changed ? (
                                                                <span className="px-3 py-0.5 inline-flex text-xs leading-5 font-black rounded-full bg-emerald-600 text-white shadow-2xs uppercase tracking-wide">Renumbered</span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-medium rounded-full bg-slate-100 text-slate-400">Unchanged</span>
                                                            )}
                                                            {item.isOtherRef && (
                                                                <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Other-Ref</span>
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
                        </div>
                    </div>
                </div>
            </div>
             {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default XmlRenumber;
