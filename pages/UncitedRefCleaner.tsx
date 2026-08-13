
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { ChevronUp, ChevronDown, GitCompare, Trash2, ArrowRight, Check, Shield, Lightbulb, Link as LinkIcon, Eraser, Hash, RefreshCw, Box, SortAsc, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';

interface RefItem {
    id: string;
    label: string;
    fullTag: string;
    content: string;
    action: 'retain' | 'purge' | 'move';
}

const UncitedRefCleaner: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [uncitedRefs, setUncitedRefs] = useState<RefItem[]>([]);
    const [step, setStep] = useState<'input' | 'review' | 'result'>('input');
    const [activeTab, setActiveTab] = useState<'xml' | 'report' | 'diff' | 'queries'>('xml');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' } | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [rowsData, setRowsData] = useState<any[]>([]);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

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
    }, [location, navigate]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g,
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600">$4</span>'
            );
            return `<span class="text-indigo-600 font-medium">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-normal opacity-70">${suffix}</span>`;
        });
        return html;
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
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/30');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-100 text-emerald-900 font-medium');
            else if (!part.added && !part.removed) append(part.value, null);
        });
        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || totalChanges === 0) return;

        let nextIndex = direction === 'next' ? currentChangeIndex + 1 : currentChangeIndex - 1;
        if (nextIndex > totalChanges) nextIndex = 1;
        if (nextIndex < 1) nextIndex = totalChanges;

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`) as HTMLElement;
        if (targetRow && diffContainerRef.current) {
            const container = diffContainerRef.current;
            const containerRect = container.getBoundingClientRect();
            const targetRect = targetRow.getBoundingClientRect();
            const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
            const targetScrollTop = relativeTop - (containerRect.height / 2) + (targetRect.height / 2);
            
            container.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
            });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (step === 'result' && activeTab === 'diff') {
                if (e.key === 'ArrowDown' || (e.altKey && e.key.toLowerCase() === 'n')) {
                    e.preventDefault();
                    scrollToChange('next');
                } else if (e.key === 'ArrowUp' || (e.altKey && e.key.toLowerCase() === 'p')) {
                    e.preventDefault();
                    scrollToChange('prev');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, activeTab, currentChangeIndex, totalChanges]);

    useEffect(() => {
        if (!diffContainerRef.current) return;
        
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-orange-100/50', 'ring-1', 'ring-orange-300', 'ring-inset', 'z-10', 'relative'));

        if (currentChangeIndex === 0) return;

        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-orange-100/50', 'ring-1', 'ring-orange-300', 'ring-inset', 'z-10', 'relative'));
    }, [currentChangeIndex, rowsData, activeTab]);

    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        let rows: any[] = [];
        let leftLineNum = 1, rightLineNum = 1, i = 0;
        let localChangeCount = 0;

        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal', leftVal = '', rightVal = '';
            if (current.removed && diff[i+1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
            } else {
                leftVal = rightVal = current.value; i++;
            }
            let leftLines: string[] = [], rightLines: string[] = [];
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
                const lContent = leftLines[r], rContent = rightLines[r];
                const lNum = lContent !== undefined ? leftLineNum++ : '', rNum = rContent !== undefined ? rightLineNum++ : '';
                
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
        setTotalChanges(localChangeCount);
        setCurrentChangeIndex(localChangeCount > 0 ? 1 : 0);
    };

    const diffRows = React.useMemo(() => {
        return rowsData.map(row => {
            const { id, type, lContent, rContent, lNum, rNum, isFirstInBlock, changeIndex, changeGroup } = row;
            let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
            let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
            
            return (
                <tr 
                    key={id} 
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                    data-change-row={changeGroup ? 'true' : undefined}
                    data-change-index={changeIndex}
                    data-change-index-group={changeGroup}
                >
                    <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                    <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                    <td className={`w-10 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                    <td className={`p-1.5 font-mono text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                </tr>
            );
        });
    }, [rowsData]);

    const scanUncited = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML first.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                const bibRefs: RefItem[] = [];
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const content = match[2];
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                    bibRefs.push({
                        id: match[1],
                        fullTag: match[0],
                        label: labelMatch ? labelMatch[1].trim() : '',
                        content: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) + '...',
                        action: 'purge'
                    });
                }

                const citedIds = new Set<string>();
                const citeRegex = /\brefid="([^"]+)"/g;
                let cMatch;
                while ((cMatch = citeRegex.exec(input)) !== null) {
                    const ids = cMatch[1].split(/\s+/);
                    ids.forEach(id => citedIds.add(id));
                }

                const found = bibRefs.filter(b => !citedIds.has(b.id));

                if (found.length === 0) {
                    setToast({ msg: "No uncited references found!", type: "success" });
                    setIsLoading(false);
                } else {
                    setUncitedRefs(found);
                    setStep('review');
                    setIsLoading(false);
                }
            } catch (e) {
                setToast({ msg: "Scan failed.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const setItemAction = (id: string, action: 'retain' | 'purge' | 'move') => {
        setUncitedRefs(prev => prev.map(r => r.id === id ? { ...r, action } : r));
    };

    const setAllActions = (action: 'retain' | 'purge' | 'move') => {
        setUncitedRefs(prev => prev.map(r => ({ ...r, action })));
    };

    const processCleanup = () => {
        setIsLoading(true);
        setTimeout(() => {
            let result = input;
            const toPurge = uncitedRefs.filter(r => r.action === 'purge');
            const toMove = uncitedRefs.filter(r => r.action === 'move');
            const toRetain = uncitedRefs.filter(r => r.action === 'retain');
            
            const itemsToRemoveFromOriginal = [...toPurge, ...toMove];
            
            // 1. Remove purged items and those identified for moving from original bib
            itemsToRemoveFromOriginal.forEach(r => {
                const escaped = r.fullTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped + '\\s*', 'g');
                result = result.replace(regex, '');
            });

            // 2. Handle Moving to Further-reading
            if (toMove.length > 0) {
                const movedRefsMarkup = toMove.map(m => m.fullTag).join('\n');
                
                // Check if further-reading section already exists
                const existingFrMatch = result.match(/<ce:further-reading-sec\b[^>]*>([\s\S]*?)<\/ce:further-reading-sec>/);
                
                if (existingFrMatch) {
                    // Append to existing section
                    result = result.replace('</ce:further-reading-sec>', `\n${movedRefsMarkup}\n</ce:further-reading-sec>`);
                } else {
                    // Create new section
                    const frBlock = `\n<ce:further-reading id="fr0005">\n<ce:section-title id="st3000">Further reading</ce:section-title>\n<ce:further-reading-sec id="fs0005">\n${movedRefsMarkup}\n</ce:further-reading-sec>\n</ce:further-reading>`;
                    
                    const bibEndIndex = result.lastIndexOf('</ce:bibliography>');
                    if (bibEndIndex !== -1) {
                        const insertionPoint = bibEndIndex + '</ce:bibliography>'.length;
                        result = result.slice(0, insertionPoint) + frBlock + result.slice(insertionPoint);
                    } else {
                        // Fallback: before </ce:tail>
                        const tailEndIndex = result.lastIndexOf('</ce:tail>');
                        if (tailEndIndex !== -1) {
                            result = result.slice(0, tailEndIndex) + frBlock + result.slice(tailEndIndex);
                        } else {
                            result += frBlock;
                        }
                    }
                }
            }

            // Final formatting cleanup
            result = result.replace(/\n\s*\n/g, '\n').trim();

            setOutput(result);
            generateDiff(input, result);
            
            // Background Scanner for Smart Suggestions
            const newSuggestions: SmartSuggestion[] = [];
            
            // 1. XML Normalizer (Renumber)
            if (result.includes('<ce:bib-reference')) {
                newSuggestions.push({
                    id: 'xml-renumber',
                    toolName: 'XML Normalizer',
                    description: 'Bibliography detected. Use this to ensure all references are correctly numbered and cross-references are updated.',
                    path: '/xmlRenumber',
                    icon: <Hash className="w-4 h-4" />,
                    condition: 'Bibliography detected'
                });
            }

            // 2. Other-Refs Scanner
            const otherRefCount = (result.match(/<ce:other-ref/g) || []).length;
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

            // 3. XML Tag Cleaner
            const tagMatches = result.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
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

            // 4. Citation Linker Pro
            const unlinkedCitations = (result.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
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

            // 5. View Synchronizer
            if (result.includes('<ce:para>') && (result.includes('<ce:cross-ref') || result.includes('<ce:float-anchor'))) {
                newSuggestions.push({
                    id: 'view-sync',
                    toolName: 'View Synchronizer',
                    description: 'Complex structural nodes detected. Use this to ensure visual consistency between XML source and rendered views.',
                    path: '/viewSync',
                    icon: <RefreshCw className="w-4 h-4" />,
                    condition: 'Complex structural nodes detected'
                });
            }

            // 6. Reference Structure Repair
            if (result.includes('<ce:source-text') || !result.includes('<sb:reference')) {
                newSuggestions.push({
                    id: 'structural-architect',
                    toolName: 'Reference Structure Repair v3.2',
                    description: 'Structural overhaul recommended. Use this to transform raw source text into valid structural bibliography nodes.',
                    path: '/structuralArchitect',
                    icon: <Box className="w-4 h-4" />,
                    condition: 'Structural overhaul recommended'
                });
            }

            // 7. Reference Sorter
            newSuggestions.push({
                id: 'ref-sorter',
                toolName: 'Reference Sorter',
                description: 'Bibliography out of sequence? Align them alphabetically using the Reference Sorter.',
                path: '/refSorter',
                icon: <SortAsc className="w-4 h-4" />,
                condition: 'Bibliography detected'
            });

            setSuggestions(newSuggestions);
            setStep('result');
            setActiveTab('xml');
            setToast({ msg: `System Processed: ${toPurge.length} purged, ${toMove.length} moved, ${toRetain.length} retained.`, type: "success" });
            setIsLoading(false);
        }, 800);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? scanUncited : (step === 'review' ? processCleanup : undefined),
        onClear: () => { setInput(''); setUncitedRefs([]); setStep('input'); }
    }, [input, step, uncitedRefs]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Uncited Reference Cleaner</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Sanitize lists by purging orphans or relocating them to a Further-reading section.</p>
            </div>

            {/* Smart Suggestions Section outside the main results container */}
            {suggestions.length > 0 && step === 'result' && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-6 bg-indigo-50/30 border-2 border-indigo-100 rounded-[2rem] border-dashed">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Uncited Ref Cleaner' } });
                                    }}
                                    className="flex items-center gap-4 p-4 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                        <div className="text-[9px] text-indigo-500 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative">
                {isLoading && <LoadingOverlay message="Analyzing Data Matrix..." color="rose" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-bold text-slate-800 text-xs uppercase tracking-widest">Bibliography Source Feed</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-rose-500">Clear</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent" 
                            placeholder="Paste your XML document here..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center">
                            <button onClick={scanUncited} className="bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-rose-200 transition-all active:scale-95 uppercase text-xs tracking-widest">
                                Scan for Uncited Items
                            </button>
                        </div>
                    </div>
                )}

                {step === 'review' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex items-center gap-8">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase">Review Audit List</h3>
                                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{uncitedRefs.length} Uncited Items Detected</p>
                                </div>
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button onClick={() => setAllActions('purge')} className="px-3 py-1.5 text-[9px] font-black uppercase text-rose-600 hover:bg-white rounded-lg transition-all">Purge All</button>
                                    <button onClick={() => setAllActions('move')} className="px-3 py-1.5 text-[9px] font-black uppercase text-indigo-600 hover:bg-white rounded-lg transition-all">Move All</button>
                                    <button onClick={() => setAllActions('retain')} className="px-3 py-1.5 text-[9px] font-black uppercase text-emerald-600 hover:bg-white rounded-lg transition-all">Retain All</button>
                                </div>
                            </div>
                            <button onClick={processCleanup} className="bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                Execute Selection
                            </button>
                        </div>

                        {/* 1-Click ID Copy Section */}
                        <div className="mx-10 mt-6 p-4 bg-slate-100 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Uncited Reference ID Pool</div>
                                <div className="font-mono text-xs text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-thin select-all">
                                    {uncitedRefs.map(r => r.id).join(', ')}
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const idListStr = uncitedRefs.map(r => r.id).join(', ');
                                    navigator.clipboard.writeText(idListStr);
                                    setToast({ msg: `${uncitedRefs.length} reference IDs copied!`, type: 'success' });
                                }}
                                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-6 rounded-xl shadow-md transition-all active:scale-95 text-[10px] uppercase tracking-wider whitespace-nowrap group"
                            >
                                <Copy size={13} className="group-hover:scale-110 transition-transform" />
                                Copy All IDs
                            </button>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {uncitedRefs.map(ref => (
                                <div 
                                    key={ref.id} 
                                    className={`p-6 bg-white border rounded-3xl transition-all flex items-center gap-6 group ${
                                        ref.action === 'purge' ? 'border-rose-300 shadow-md ring-1 ring-rose-100' : 
                                        ref.action === 'move' ? 'border-indigo-300 shadow-md ring-1 ring-indigo-100' : 
                                        'border-emerald-300 shadow-md ring-1 ring-emerald-100'
                                    }`}
                                >
                                    <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all ${
                                        ref.action === 'purge' ? 'bg-rose-50 text-rose-600' : 
                                        ref.action === 'move' ? 'bg-indigo-50 text-indigo-600' : 
                                        'bg-emerald-50 text-emerald-600'
                                    }`}>
                                        {ref.action === 'purge' ? <Trash2 size={18} /> : 
                                         ref.action === 'move' ? <ArrowRight size={18} /> : 
                                         <Check size={18} />}
                                    </div>
                                    
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-[10px] font-mono font-black bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">ID: {ref.id}</span>
                                            {ref.label && <span className="text-xs font-bold text-slate-900">{ref.label}</span>}
                                        </div>
                                        <p className="text-sm text-slate-500 italic truncate pr-4">{ref.content}</p>
                                    </div>

                                    <div className="flex-shrink-0 flex items-center bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                                        <button 
                                            onClick={() => setItemAction(ref.id, 'retain')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${ref.action === 'retain' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Retain
                                        </button>
                                        <button 
                                            onClick={() => setItemAction(ref.id, 'purge')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${ref.action === 'purge' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Purge
                                        </button>
                                        <button 
                                            onClick={() => setItemAction(ref.id, 'move')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${ref.action === 'move' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Move
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50/95 backdrop-blur-md px-10 py-5 border-b border-slate-200 flex justify-between items-center shrink-0 sticky top-0 z-30 shadow-xs">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest flex items-center gap-2">
                                Post-Processing Audit
                            </h3>
                            <div className="flex items-center gap-6">
                                {totalChanges > 0 && (
                                    <div className="flex items-center gap-3 bg-white px-4 py-1.5 rounded-xl border border-slate-200/80 shadow-xs">
                                        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
                                            <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                                                Changes: <span className="text-indigo-600">{currentChangeIndex > 0 ? currentChangeIndex : 1}</span> / {totalChanges}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => {
                                                    if (activeTab !== 'diff') {
                                                        setActiveTab('diff');
                                                        setTimeout(() => scrollToChange('prev'), 50);
                                                    } else {
                                                        scrollToChange('prev');
                                                    }
                                                }}
                                                className="p-1 hover:bg-slate-100 rounded-md text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 text-[10px] font-extrabold uppercase"
                                                title="Previous Change"
                                            >
                                                <ChevronUp className="w-4 h-4" />
                                                <span className="hidden sm:inline">Prev</span>
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (activeTab !== 'diff') {
                                                        setActiveTab('diff');
                                                        setTimeout(() => scrollToChange('next'), 50);
                                                    } else {
                                                        scrollToChange('next');
                                                    }
                                                }}
                                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs"
                                                title="Next Change"
                                            >
                                                <span>Next</span>
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <button onClick={() => { setStep('input'); setUncitedRefs([]); }} className="text-xs font-bold text-indigo-600 hover:underline uppercase tracking-widest">New Session</button>
                            </div>
                        </div>
                        <div className="bg-white/95 backdrop-blur-md px-10 pt-4 border-b border-slate-100 flex space-x-4 shrink-0 sticky top-[65px] z-20">
                            {['xml', 'report', 'diff', 'queries'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => setActiveTab(t as any)} 
                                    className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === t ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}
                                >
                                    {t === 'xml' ? 'Final XML Result' : (t === 'report' ? 'Action Summary' : (t === 'diff' ? 'Side-by-Side Diff' : 'JM Queries'))}
                                </button>
                            ))}
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8">
                                    <div className="absolute top-12 right-12 z-10">
                                        <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} className="bg-white border-2 border-emerald-100 px-6 py-2.5 rounded-xl text-[10px] font-black text-emerald-600 hover:bg-emerald-50 shadow-lg shadow-emerald-500/10 transition-all uppercase tracking-widest">Copy Clean XML</button>
                                    </div>
                                    <div 
                                        className="h-full p-10 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: highlightXml(output) }}
                                    />
                                </div>
                            )}

                            {activeTab === 'report' && (
                                <div className="h-full overflow-auto p-12 custom-scrollbar space-y-8">
                                    {uncitedRefs.some(r => r.action === 'purge') && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4 border-b border-rose-100 pb-2">Permanently Purged</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {uncitedRefs.filter(r => r.action === 'purge').map(r => (
                                                    <div key={r.id} className="p-5 bg-white border border-rose-100 rounded-3xl shadow-sm border-l-4 border-l-rose-500">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[9px] font-mono font-bold text-slate-400">ID: {r.id}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">{r.label || 'No Label'}</p>
                                                        <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-1">{r.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {uncitedRefs.some(r => r.action === 'move') && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4 border-b border-indigo-100 pb-2">Migrated to Further-reading</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {uncitedRefs.filter(r => r.action === 'move').map(r => (
                                                    <div key={r.id} className="p-5 bg-white border border-indigo-100 rounded-3xl shadow-sm border-l-4 border-l-indigo-500">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[9px] font-mono font-bold text-slate-400">ID: {r.id}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">{r.label || 'No Label'}</p>
                                                        <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-1">{r.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {uncitedRefs.some(r => r.action === 'retain') && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 border-b border-emerald-100 pb-2">Retained in Bibliography</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {uncitedRefs.filter(r => r.action === 'retain').map(r => (
                                                    <div key={r.id} className="p-5 bg-white border border-emerald-100 rounded-3xl shadow-sm border-l-4 border-l-emerald-500">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[9px] font-mono font-bold text-slate-400">ID: {r.id}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-700">{r.label || 'No Label'}</p>
                                                        <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-1">{r.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'diff' && (
                                <div className="absolute inset-0 flex flex-col overflow-hidden">
                                    <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar pb-16">
                                        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-inner m-4">
                                            <table className="w-full text-sm font-mono border-collapse table-fixed">
                                                <colgroup><col className="w-10 bg-slate-50" /><col className="w-[calc(50%-2.5rem)]" /><col className="w-10 bg-slate-50 border-l" /><col className="w-[calc(50%-2.5rem)]" /></colgroup>
                                                <tbody>{diffRows}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'queries' && (
                                <div className="h-full overflow-auto p-12 custom-scrollbar">
                                    <div className="max-w-4xl mx-auto space-y-8">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                                                <Box className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black text-slate-900 uppercase">JM Query Suggestions</h4>
                                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Templated communication for uncited references</p>
                                            </div>
                                        </div>

                                        {uncitedRefs.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-6">
                                                {[
                                                    {
                                                        title: "1. Request for Citation Insertion",
                                                        description: "Use when the reference seems valid but is missing a match in the text.",
                                                        generate: (refs: RefItem[]) => {
                                                            const refText = refs.length === 1 ? `Reference [${refs[0].label || refs[0].id}] remains` : `The following references remain`;
                                                            const list = refs.length > 1 ? ` [${refs.map(r => r.label || r.id).join(', ')}]` : ` [${refs[0].label || refs[0].id}]`;
                                                            return `TO THE JM:\n${refText} uncited in the text body${refs.length > 1 ? list : list.trim()}.\nKindly ask the author to provide an appropriate citation for this reference in the text.\n\nFile is on pending status until matter is resolved. Thank you.`;
                                                        }
                                                    },
                                                    {
                                                        title: "2. Multiple Uncited References",
                                                        description: "Standard verification for multiple orphans.",
                                                        generate: (refs: RefItem[]) => {
                                                            const list = refs.map(r => r.label || r.id).join(', ');
                                                            return `TO THE JM:\nThe following references remain uncited in the text body: [${list}].\nKindly confirm if these may be deleted or advise if citations should be inserted in the text.\n\nFile is on pending status until matter is resolved. Thank you.`;
                                                        }
                                                    },
                                                    {
                                                        title: "3. Citation Discrepancy / Missing Match",
                                                        description: "Use if the citation might have been accidentally removed during revisions.",
                                                        generate: (refs: RefItem[]) => {
                                                            const refText = refs.length === 1 ? `Reference [${refs[0].label || refs[0].id}] remains` : `The following references remain`;
                                                            const list = refs.length > 1 ? ` [${refs.map(r => r.label || r.id).join(', ')}]` : ` [${refs[0].label || refs[0].id}]`;
                                                            return `TO THE JM:\n${refText} uncited in the text body${refs.length > 1 ? list : list.trim()}, possibly due to changes in the citation.\nKindly confirm whether the citation should be reinstated or the reference removed.\n\nFile is on pending status until matter is resolved. Thank you.`;
                                                        }
                                                    },
                                                    {
                                                        title: "4. Relevance Verification",
                                                        description: "Use when unsure if the reference is still meant to be part of the article.",
                                                        generate: (refs: RefItem[]) => {
                                                            const refText = refs.length === 1 ? `Reference [${refs[0].label || refs[0].id}] remains` : `The following references remain`;
                                                            const list = refs.length > 1 ? ` [${refs.map(r => r.label || r.id).join(', ')}]` : ` [${refs[0].label || refs[0].id}]`;
                                                            return `TO THE JM:\n${refText} uncited in the text body${refs.length > 1 ? list : list.trim()}.\nKindly confirm if this reference is still relevant to the article. If not, please advise if it may be deleted.\n\nFile is on pending status until matter is resolved. Thank you.`;
                                                        }
                                                    }
                                                ].map((query, idx) => (
                                                    <div key={idx} className="bg-white border border-slate-200 rounded-3xl p-8 hover:border-indigo-300 transition-all group">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div>
                                                                <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight">{query.title}</h5>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{query.description}</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(query.generate(uncitedRefs));
                                                                    setToast({ msg: 'Query copied to clipboard!', type: 'success' });
                                                                }}
                                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-100 transition-all uppercase tracking-widest border border-indigo-100/50"
                                                            >
                                                                Copy Query
                                                            </button>
                                                        </div>
                                                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 font-mono text-xs text-slate-600 whitespace-pre-wrap leading-relaxed relative">
                                                            <div className="absolute top-2 right-4 text-[10px] font-black text-slate-300 uppercase opacity-40">Preview</div>
                                                            {query.generate(uncitedRefs)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                                                <p className="text-sm font-bold uppercase tracking-widest">No uncited references detected to generate queries.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default UncitedRefCleaner;
