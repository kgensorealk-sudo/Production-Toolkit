import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface RefItem {
    id: string;
    label: string;
    fullTag: string;
    cleanTitle: string;
    displayContent: string;
}

interface DupeGroup {
    id: number;
    items: RefItem[];
    selectedId: string;
}

interface CitationChangeAudit {
    type: 'relinked' | 'split' | 'collapsed';
    original: string;
    result: string;
}

interface BibRemovalAudit {
    id: string;
    label: string;
    replacedBy: string;
}

interface DetailedMergeLog {
    bibRemovals: BibRemovalAudit[];
    citationAudits: CitationChangeAudit[];
}

const ReferenceDupeChecker: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [groups, setGroups] = useState<DupeGroup[]>([]);
    const [step, setStep] = useState<'input' | 'resolve' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [stats, setStats] = useState({ groups: 0, removed: 0, remapped: 0 });

    const [activeTab, setActiveTab] = useState<'xml' | 'report' | 'diff'>('xml');
    const [mergeLog, setMergeLog] = useState<DetailedMergeLog>({ bibRemovals: [], citationAudits: [] });
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const getSimilarity = (s1: string, s2: string): number => {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;

        const costs = new Array();
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longerLength - costs[shorter.length]) / longerLength;
    };

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g,
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600">$4</span>'
            );
            return `<span class="text-indigo-600 font-medium">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-medium">${suffix}</span>`;
        });
        html = html.replace(/(&lt;ce:label&gt;)(.*?)(&lt;\/ce:label&gt;)/g, '$1<span class="text-slate-900 font-bold bg-slate-100 rounded px-1 border border-slate-200">$2</span>$3');
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

    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let i = 0;
        while (i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';
            if (current.removed && diff[i + 1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i + 1].value; i += 2;
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
                leftLines = buildLines([{ removed: true, value: leftVal } as Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{ added: true, value: rightVal } as Change], false);
            } else {
                const lines = leftVal.split('\n');
                if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
                leftLines = lines.map(escapeHtml);
                rightLines = [...leftLines];
            }
            const maxRows = Math.max(leftLines.length, rightLines.length);
            for (let r = 0; r < maxRows; r++) {
                const lContent = leftLines[r]; const rContent = rightLines[r];
                const lNum = lContent !== undefined ? leftLineNum++ : '';
                const rNum = rContent !== undefined ? rightLineNum++ : '';
                let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/70' : (type === 'replace' ? 'bg-rose-50/30' : '');
                let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/70' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                rows.push(
                    <tr key={`${i}-${r}`} className="hover:bg-slate-50 transition-colors duration-75 group border-b border-slate-100/30 last:border-0">
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 select-none bg-slate-50/80 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{ __html: lContent || '' }}></td>
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 border-l select-none bg-slate-50/80 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{ __html: rContent || '' }}></td>
                    </tr>
                );
            }
        }
        setDiffElements(
            <div className="bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-14" /><col className="w-[calc(50%-3.5rem)]" /><col className="w-14 border-l border-slate-200" /><col className="w-[calc(50%-3.5rem)]" /></colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-400"></span>Original Source</span>
                            </th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">
                                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>Processed Output</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    };

    const analyzeReferences = () => {
        if (!input.trim()) { setToast({ msg: "Please paste XML content.", type: "warn" }); return; }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const regex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
                const refs: RefItem[] = [];
                let match;
                while ((match = regex.exec(input)) !== null) {
                    const fullTag = match[0]; const attrs = match[1]; const content = match[2];
                    const idMatch = attrs.match(/id="([^"]+)"/);
                    const id = idMatch ? idMatch[1] : `gen_${Math.random().toString(36).substring(2, 11)}`;
                    
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/);
                    const label = labelMatch ? labelMatch[1].trim() : '';

                    // Precision: Extract Author and Year to prevent false positives for identical titles
                    const surnameMatch = content.match(/<(?:ce|sb):surname>(.*?)<\/(?:ce|sb):surname>/);
                    const authorKey = surnameMatch ? surnameMatch[1].toLowerCase().replace(/[^a-z]/g, '') : '';
                    
                    const dateMatch = content.match(/<(?:ce|sb):year>(.*?)<\/(?:ce|sb):year>/) || 
                                     content.match(/<(?:ce|sb):date>(.*?)<\/(?:ce|sb):date>/);
                    const yearKey = dateMatch ? dateMatch[1].replace(/\D/g, '') : '';

                    let compareText = '';
                    const titleMatch = content.match(/<ce:title>(.*?)<\/ce:title>/) || content.match(/<sb:title>(.*?)<\/sb:title>/);
                    if (titleMatch) compareText = titleMatch[1];
                    else compareText = content.replace(/<ce:label>.*?<\/ce:label>/, '').replace(/<[^>]+>/g, ' ');
                    const cleanTitle = compareText.toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Combined Key: Author + Year + Title
                    const robustKey = `${authorKey}|${yearKey}|${cleanTitle}`;

                    if (cleanTitle.length > 3) {
                        refs.push({ 
                            id, 
                            label, 
                            fullTag, 
                            cleanTitle: robustKey, 
                            displayContent: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150) + '...' 
                        });
                    }
                }
                const visited = new Set<string>(); const newGroups: DupeGroup[] = []; let groupId = 1;
                for (let i = 0; i < refs.length; i++) {
                    const itemI = refs[i];
                    if (visited.has(itemI.id)) continue;
                    const currentGroup: RefItem[] = [itemI]; 
                    visited.add(itemI.id);
                    for (let j = i + 1; j < refs.length; j++) {
                        const itemJ = refs[j];
                        if (visited.has(itemJ.id)) continue;
                        
                        // Using robust similarity on Author|Year|Title
                        if (getSimilarity(itemI.cleanTitle, itemJ.cleanTitle) > 0.88) { 
                            currentGroup.push(itemJ); 
                            visited.add(itemJ.id); 
                        }
                    }
                    if (currentGroup.length > 1) newGroups.push({ id: groupId++, items: currentGroup, selectedId: currentGroup[0].id });
                }
                if (newGroups.length === 0) { setToast({ msg: "No duplicates found!", type: "success" }); setIsLoading(false); return; }
                setGroups(newGroups); setStep('resolve'); setIsLoading(false);
            } catch (error: any) { setIsLoading(false); }
        }, 600);
    };

    const handleSelection = (groupId: number, selectedRefId: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, selectedId: selectedRefId } : g));
    };

    const processMerge = () => {
        setIsLoading(true);
        setTimeout(() => {
            try {
                // 1. Global Mapping Setup
                const globalIdToLabel = new Map<string, string>();
                const allRefsRegex = /<ce:bib-reference\b([^>]*)>([\s\S]*?)<\/ce:bib-reference>/g;
                let refMatch;
                while ((refMatch = allRefsRegex.exec(input)) !== null) {
                    const idM = refMatch[1].match(/id="([^"]+)"/);
                    const labelM = refMatch[2].match(/<ce:label>(.*?)<\/ce:label>/);
                    if (idM && labelM) {
                        globalIdToLabel.set(idM[1], labelM[1].trim());
                    }
                }

                const cleanLabelForCitation = (label: string) => label.replace(/[\[\]]/g, '').trim();

                const remappedIds = new Map<string, string>();
                const bibRemovals: BibRemovalAudit[] = [];
                const citationAudits: CitationChangeAudit[] = [];

                groups.forEach(group => {
                    const keeper = group.items.find(i => i.id === group.selectedId);
                    if (!keeper) return;
                    group.items.forEach(item => {
                        if (item.id !== keeper.id) {
                            remappedIds.set(item.id, keeper.id);
                            bibRemovals.push({ id: item.id, label: item.label, replacedBy: `${keeper.label} (${keeper.id})` });
                        }
                    });
                });

                let cfCounter = 4500;
                const existingCfMatches = input.match(/id="cf(\d+)"/g);
                if (existingCfMatches) {
                    const maxId = existingCfMatches.reduce((max, curr) => {
                        const m = curr.match(/id="cf(\d+)"/);
                        return m ? Math.max(max, parseInt(m[1])) : max;
                    }, 0);
                    cfCounter = Math.ceil((maxId + 10) / 10) * 10;
                }

                let processedXml = input;

                // 2. Remap Singular Cross-Refs
                const singleRegex = /<ce:cross-ref\b([^>]*?)refid="([^"]+)"([^>]*?)>([\s\S]*?)<\/ce:cross-ref>/g;
                processedXml = processedXml.replace(singleRegex, (match, before, refid, after, content) => {
                    if (remappedIds.has(refid)) {
                        const newRefid = remappedIds.get(refid)!;
                        const rawLabel = globalIdToLabel.get(newRefid) || content;
                        const resultLabel = cleanLabelForCitation(rawLabel);
                        const result = `<ce:cross-ref${before}refid="${newRefid}"${after}>${resultLabel}</ce:cross-ref>`;
                        citationAudits.push({ type: 'relinked', original: match, result });
                        return result;
                    }
                    return match;
                });

                // 3. Process Plural Cross-Refs (Range Decomposition & Collapsing)
                const pluralRegex = /<ce:cross-refs\b([^>]*?)refid="([^"]+)"([^>]*?)>([\s\S]*?)<\/ce:cross-refs>/g;
                /* Add explicit type annotations to replace callback parameters to fix line 339 error */
                processedXml = processedXml.replace(pluralRegex, (match: string, before: string, refidAttr: string, after: string, content: string): string => {
                    const originalIds = refidAttr.split(/\s+/).filter(id => id.trim() !== '');
                    const hasRemapped = originalIds.some(id => remappedIds.has(id));
                    
                    if (!hasRemapped) return match;

                    const updatedIds = originalIds.map(id => remappedIds.get(id) || id);
                    const uniqueIds = [...new Set(updatedIds)];

                    const citationData = uniqueIds.map(id => {
                        const rawLabel = globalIdToLabel.get(id) || "??";
                        const cleanLabel = cleanLabelForCitation(rawLabel);
                        const numericValue = parseInt(cleanLabel.replace(/\D/g, ''), 10) || 0;
                        return { id, label: cleanLabel, num: numericValue };
                    });

                    citationData.sort((a, b) => a.num - b.num);

                    const chunks: (typeof citationData)[] = [];
                    if (citationData.length > 0) {
                        let currentChunk = [citationData[0]];
                        for (let i = 1; i < citationData.length; i++) {
                            if (citationData[i].num === citationData[i-1].num + 1) {
                                currentChunk.push(citationData[i]);
                            } else {
                                chunks.push(currentChunk);
                                currentChunk = [citationData[i]];
                            }
                        }
                        chunks.push(currentChunk);
                    }

                    const rebuiltFragments = chunks.map(chunk => {
                        const tagId = `cf${cfCounter}`;
                        cfCounter += 5;
                        if (chunk.length === 1) {
                            return `<ce:cross-ref id="${tagId}" refid="${chunk[0].id}">${chunk[0].label}</ce:cross-ref>`;
                        } else {
                            const chunkRefIds = chunk.map(item => item.id).join(' ');
                            const chunkLabel = `${chunk[0].label}–${chunk[chunk.length - 1].label}`;
                            return `<ce:cross-refs id="${tagId}" refid="${chunkRefIds}">${chunkLabel}</ce:cross-refs>`;
                        }
                    });

                    const finalResult = rebuiltFragments.join(', ');
                    citationAudits.push({ 
                        type: rebuiltFragments.length > 1 ? 'split' : 'collapsed', 
                        original: match, 
                        result: finalResult 
                    });
                    return finalResult;
                });

                // 4. Bibliography Stripping
                bibRemovals.forEach(removal => {
                    const escapedId = removal.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const refRemovalRegex = new RegExp(`<ce:bib-reference\\b[^>]*?\\bid="${escapedId}"[^>]*>[\\s\\S]*?<\\/ce:bib-reference>\\s*`, 'g');
                    processedXml = processedXml.replace(refRemovalRegex, '');
                });

                setOutput(processedXml);
                setStats({ groups: groups.length, removed: bibRemovals.length, remapped: citationAudits.length });
                setMergeLog({ bibRemovals, citationAudits });
                generateDiff(input, processedXml);
                setStep('result');
                setActiveTab('report');
                setToast({ msg: "Audit complete. XML updated.", type: "success" });
            } catch (error: any) {
                console.error(error);
                setToast({ msg: "Error during merge process.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    /* Fix potential unknown type issue in catch block */
    const handlePaste = async () => { try { setInput(await navigator.clipboard.readText()); setToast({ msg: "Pasted from clipboard", type: "info" }); } catch (err: any) { setToast({ msg: "Clipboard access denied", type: "error" }); } };
    const copyOutput = () => { navigator.clipboard.writeText(output); setToast({ msg: "Copied XML!", type: "success" }); };

    useKeyboardShortcuts({
        onClear: () => {
            setInput('');
            setGroups([]);
            setStep('input');
            setToast({ msg: "Cleared", type: "warn" });
        }
    }, [input]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase">Duplicate Reference Remover</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">Precision XML re-linking and sequence reconstruction with detailed audit trail.</p>
            </div>

            <div className="flex justify-center mb-10">
                <div className="flex items-center space-x-4 text-sm font-bold">
                    <div className={`flex items-center gap-3 ${step === 'input' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${step === 'input' ? 'border-indigo-600 bg-indigo-50 shadow-[0_0_15px_rgba(79,70,229,0.2)]' : 'border-slate-200'}`}>1</div>
                        <span className="hidden sm:inline">Input XML</span>
                    </div>
                    <div className="w-12 h-px bg-slate-200"></div>
                    <div className={`flex items-center gap-3 ${step === 'resolve' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${step === 'resolve' ? 'border-indigo-600 bg-indigo-50 shadow-[0_0_15px_rgba(79,70,229,0.2)]' : 'border-slate-200'}`}>2</div>
                        <span className="hidden sm:inline">Conflict Matrix</span>
                    </div>
                    <div className="w-12 h-px bg-slate-200"></div>
                    <div className={`flex items-center gap-3 ${step === 'result' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${step === 'result' ? 'border-emerald-600 bg-emerald-50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-slate-200'}`}>3</div>
                        <span className="hidden sm:inline">Audit Log</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-200 overflow-hidden h-[750px] flex flex-col relative transition-all duration-700">
                {isLoading && <LoadingOverlay message={step === 'input' ? "Scanning duplicates..." : "Relinking citations..."} color="indigo" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in flex-grow overflow-hidden">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-[0.25em]">Surgical Input Zone</label>
                            <div className="flex gap-3">
                                <button onClick={handlePaste} className="flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl shadow-sm transition-all active:scale-95">PASTE</button>
                                <button onClick={() => setInput('')} className="flex items-center gap-2 text-[10px] font-black text-rose-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl transition-all">CLEAR</button>
                            </div>
                        </div>
                        <div className="flex-grow flex flex-col relative overflow-hidden bg-slate-50/10">
                            {!input && <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none opacity-50"><p className="font-black text-[11px] uppercase tracking-[0.3em] mb-2 text-center">Awaiting System Data Feed<br/>Paste full article XML</p></div>}
                            <textarea value={input} onChange={(e) => setInput(e.target.value)} className="w-full h-full p-10 text-[13px] font-mono text-slate-800 border-0 focus:ring-0 outline-none resize-none bg-transparent leading-relaxed custom-scrollbar overflow-y-auto" spellCheck={false} />
                        </div>
                        <div className="p-8 border-t border-slate-100 bg-white/50 flex justify-center"><button onClick={analyzeReferences} disabled={!input.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-black py-5 px-16 rounded-[2rem] shadow-2xl shadow-indigo-500/40 transition-all active:scale-95 uppercase tracking-[0.2em] text-xs">Run Similarity Scan</button></div>
                    </div>
                )}

                {step === 'resolve' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center z-10 shadow-sm">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Resolution Matrix</h3>
                            <button onClick={processMerge} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">Execute Relink</button>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-10 custom-scrollbar">
                            {groups.map((group) => (
                                <div key={group.id} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                                    <div className="bg-slate-50/80 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Conflict Set #{group.id}</span>
                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100 uppercase">{group.items.length} Variations found</span>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {group.items.map(item => {
                                            const isSelected = item.id === group.selectedId;
                                            return (
                                                <div key={item.id} onClick={() => handleSelection(group.id, item.id)} className={`p-8 cursor-pointer transition-all flex gap-8 border-l-[8px] ${isSelected ? 'bg-indigo-50/40 border-indigo-600' : 'hover:bg-slate-50/50 border-transparent'}`}>
                                                    <div className={`w-8 h-8 rounded-2xl border-2 flex items-center justify-center transition-all ${isSelected ? 'border-indigo-600 bg-indigo-600 shadow-lg' : 'border-slate-200'}`}>{isSelected && <div className="w-3 h-3 bg-white rounded-md rotate-45"></div>}</div>
                                                    <div className="flex-grow min-w-0"><div className="flex items-center gap-4 mb-3"><span className="text-[10px] font-mono font-black bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 uppercase tracking-[0.1em]">ID: {item.id}</span>{isSelected && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.25em] ml-auto">KEEPER</span>}</div><p className="text-[15px] text-slate-600 leading-relaxed font-serif italic break-words">{item.displayContent}</p></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-6 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-5"><label className="font-black text-slate-900 text-xs uppercase tracking-[0.25em]">Audit Summary</label><div className="flex gap-3"><span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-5 py-2 rounded-2xl border border-emerald-200 uppercase tracking-widest">{stats.removed} BIB ITEMS REMOVED</span><span className="text-[10px] font-black bg-blue-100 text-blue-800 px-5 py-2 rounded-2xl border border-blue-200 uppercase tracking-widest">{stats.remapped} TAGS REMAPPED</span></div></div>
                            <button onClick={copyOutput} className="text-[11px] font-black text-emerald-600 bg-white hover:bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100 shadow-sm transition-all uppercase tracking-widest">EXPORT CLEANED XML</button>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-3">
                            {['report', 'xml', 'diff'].map(t => <button key={t} onClick={() => setActiveTab(t as any)} className={`px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x ${activeTab === t ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:text-slate-600'}`}>{t === 'report' ? 'Audit Log' : (t === 'xml' ? 'Resulting XML' : 'Side-by-Side Diff')}</button>)}
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                            {activeTab === 'xml' && <div className="h-full relative p-10 flex flex-col"><div className="flex-grow p-12 text-[13px] font-mono text-slate-800 bg-white rounded-[3rem] border border-slate-200 shadow-inner overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightXml(output) }} /></div>}
                            
                            {activeTab === 'report' && (
                                <div className="h-full bg-white overflow-auto p-12 space-y-12 max-w-5xl mx-auto custom-scrollbar">
                                    <section>
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3"><span className="w-8 h-px bg-slate-200"></span> Bibliography Removals <span className="w-8 h-px bg-slate-200"></span></h3>
                                        <div className="space-y-4">
                                            {mergeLog.bibRemovals.map((rem, idx) => (
                                                <div key={idx} className="flex items-center gap-6 p-6 rounded-3xl bg-slate-50 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                                    <div className="flex flex-col flex-grow">
                                                        <span className="text-rose-600 font-black text-[13px] line-through uppercase">{rem.label}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono italic">Original ID: {rem.id}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase mb-1">Absorbed By</span>
                                                        <span className="font-black text-indigo-600 bg-white px-5 py-2 rounded-2xl border border-indigo-100 text-xs shadow-sm">{rem.replacedBy}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {mergeLog.bibRemovals.length === 0 && <p className="text-center text-slate-300 text-sm italic py-10">No bibliography items were removed.</p>}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3"><span className="w-8 h-px bg-slate-200"></span> Citation Remapping Audit <span className="w-8 h-px bg-slate-200"></span></h3>
                                        <div className="space-y-6">
                                            {mergeLog.citationAudits.map((aud, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                                                    <div className="bg-slate-50 px-8 py-3 border-b border-slate-100 flex justify-between items-center">
                                                        <span className={`text-[10px] font-black px-4 py-1.5 rounded-full border uppercase ${
                                                            aud.type === 'split' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                                            aud.type === 'collapsed' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                                            'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                        }`}>Operation: Cit-{aud.type}</span>
                                                        <span className="text-[9px] text-slate-300 font-mono">SEQ_ID_{idx.toString().padStart(3, '0')}</span>
                                                    </div>
                                                    <div className="p-8 space-y-6">
                                                        <div className="space-y-2">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Original Fragment</span>
                                                            <div className="p-5 rounded-2xl bg-rose-50/30 border border-rose-100 text-[11px] font-mono text-rose-900/70 whitespace-pre-wrap break-all line-through decoration-rose-900/30 leading-relaxed shadow-inner">
                                                                {escapeHtml(aud.original)}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-center -my-2">
                                                            <div className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-md flex items-center justify-center text-slate-300 animate-bounce">
                                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Surgical Result</span>
                                                            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 text-[11px] font-mono text-emerald-900 whitespace-pre-wrap break-all leading-relaxed shadow-sm font-bold">
                                                                {escapeHtml(aud.result)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {mergeLog.citationAudits.length === 0 && <p className="text-center text-slate-300 text-sm italic py-10">No citations required remapping.</p>}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === 'diff' && <div className="absolute inset-0 overflow-auto custom-scrollbar bg-slate-100/30 p-10">{diffElements ? <div className="rounded-[3rem] border border-slate-200 overflow-hidden shadow-2xl">{diffElements}</div> : <div className="h-full flex flex-col items-center justify-center text-slate-400"><p className="text-sm font-black uppercase tracking-[0.25em]">Differential Stream Unavailable</p></div>}</div>}
                        </div>
                        <div className="p-8 bg-slate-50 border-t border-slate-200 text-center"><button onClick={() => { setStep('input'); setInput(''); setGroups([]); }} className="text-slate-400 hover:text-indigo-600 font-black text-[11px] uppercase tracking-[0.35em] flex items-center justify-center gap-4 mx-auto group">RESET SYSTEM WORKFLOW</button></div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceDupeChecker;