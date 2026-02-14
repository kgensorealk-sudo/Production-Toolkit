import React, { useState } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface AuditItem {
    id: string;
    originalId: string;
    tagName: string;
    expectedPrefix: string;
    status: 'valid' | 'invalid';
    isOtherRef: boolean;
    hasNameSpacingViolation: boolean;
    isLengthViolation: boolean;
    preview: string;
    fullTag: string;
}

const ID_CONFIG = [
    { tag: 'ce:bib-reference', prefix: 'bb' },
    { tag: 'sb:reference', prefix: 'rf' },
    { tag: 'ce:source-text', prefix: 'se' },
    { tag: 'ce:inter-ref', prefix: 'ir' },
    { tag: 'ce:caption', prefix: 'ca' },
    { tag: 'ce:cross-ref', prefix: 'cf' },
    { tag: 'ce:cross-refs', prefix: 'cf' }
];

const IdAuditor: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [auditResults, setAuditResults] = useState<AuditItem[]>([]);
    const [step, setStep] = useState<'input' | 'audit' | 'result'>('input');
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);

    // Filter states for the audit view
    const [filterOtherOnly, setFilterOtherOnly] = useState(false);
    const [filterInvalidOnly, setFilterInvalidOnly] = useState(false);
    const [filterNameSpacingOnly, setFilterNameSpacingOnly] = useState(false);

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
                 
                 let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/50' : (type === 'replace' ? 'bg-rose-50/30' : '');
                 let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/50' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                 if (type === 'equal') { lClass = ''; rClass = ''; }

                 rows.push(
                    <tr key={`${i}-${r}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75">
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
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

    const runAudit = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const results: AuditItem[] = [];
                
                ID_CONFIG.forEach(({ tag, prefix }) => {
                    const tagRegex = new RegExp(`<${tag}\\b[^>]*?\\bid="([^"]+)"[^>]*>`, 'g');
                    const strictIdRegex = new RegExp(`^${prefix}\\d{4}$`, 'i');
                    let match;
                    while ((match = tagRegex.exec(input)) !== null) {
                        const originalId = match[1];
                        const fullOpeningTag = match[0];
                        
                        const elementEndIdx = input.indexOf(`</${tag}>`, match.index);
                        const elementContent = elementEndIdx !== -1 
                            ? input.substring(match.index, elementEndIdx + `</${tag}>`.length)
                            : fullOpeningTag;

                        const isValidId = strictIdRegex.test(originalId);
                        const isPrefixValid = originalId.toLowerCase().startsWith(prefix);
                        const isLengthViolation = isPrefixValid && !isValidId;
                        const isInvalidId = !isValidId;

                        const isOtherRef = elementContent.includes('<ce:other-ref');
                        
                        // Name Spacing Logic: Detect spaces between initials in <ce:given-name>
                        const nameSpacingRegex = /<ce:given-name\b[^>]*>(.*?)<\/ce:given-name>/gi;
                        let hasNameSpacingViolation = false;
                        let nameMatch;
                        while ((nameMatch = nameSpacingRegex.exec(elementContent)) !== null) {
                            if (/\. +(?=[A-Z]\.)/.test(nameMatch[1])) {
                                hasNameSpacingViolation = true;
                                break;
                            }
                        }

                        results.push({
                            id: originalId,
                            originalId: originalId,
                            tagName: tag,
                            expectedPrefix: prefix,
                            status: (isInvalidId || hasNameSpacingViolation) ? 'invalid' : 'valid',
                            isOtherRef,
                            hasNameSpacingViolation,
                            isLengthViolation,
                            preview: elementContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) + '...',
                            fullTag: fullOpeningTag
                        });
                    }
                });

                if (results.length === 0) {
                    setToast({ msg: "No structural nodes detected for audit.", type: "warn" });
                    setIsLoading(false);
                } else {
                    results.sort((a, b) => {
                        if (a.status === 'invalid' && b.status === 'valid') return -1;
                        if (a.status === 'valid' && b.status === 'invalid') return 1;
                        return a.tagName.localeCompare(b.tagName);
                    });
                    
                    setAuditResults(results);
                    setStep('audit');
                    const invalidCount = results.filter(r => r.status === 'invalid').length;
                    
                    if (invalidCount > 0) {
                        setToast({ msg: `Found ${invalidCount} structural violations.`, type: "warn" });
                    } else {
                        setToast({ msg: "System checks passed. All protocols compliant.", type: "success" });
                    }
                    setIsLoading(false);
                }
            } catch (err) {
                setToast({ msg: "Audit system failure.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    const executeFix = () => {
        setIsLoading(true);
        setTimeout(() => {
            try {
                let processedXml = input;
                
                // 1. Surgical Given-Name Spacing Fix
                processedXml = processedXml.replace(/(<ce:given-name\b[^>]*>)(.*?)(<\/ce:given-name>)/gi, (match, open, content, close) => {
                    const sanitizedContent = content.replace(/\. +(?=[A-Z]\.)/g, '.');
                    return `${open}${sanitizedContent}${close}`;
                });

                // 2. ID Mapping Logic
                const mapping = new Map<string, string>();
                const counters: Record<string, number> = { bb: 3000, rf: 3000, se: 3000, ir: 3000, ca: 3000, cf: 3000 };
                
                auditResults.forEach(item => {
                    const strictIdRegex = new RegExp(`^${item.expectedPrefix}\\d{4}$`, 'i');
                    if (!strictIdRegex.test(item.id)) {
                        const prefix = item.expectedPrefix;
                        const newIdNum = counters[prefix].toString().padStart(4, '0');
                        const newId = `${prefix}${newIdNum}`;
                        mapping.set(item.originalId, newId);
                        counters[prefix] += 5;
                    }
                });

                // 3. ID Attribute replacements with temporary placeholders
                mapping.forEach((newId, oldId) => {
                    const idPattern = new RegExp(`\\bid="${oldId}"`, 'g');
                    processedXml = processedXml.replace(idPattern, `id="##TEMP_ID_${newId}##"`);
                });

                // 4. Remap cross-references (refid)
                const refRegex = /\brefid="([^"]+)"/g;
                processedXml = processedXml.replace(refRegex, (match, refidAttr) => {
                    const ids = refidAttr.split(/\s+/).filter((id: string) => id.trim() !== '');
                    const updatedIds = ids.map((id: string) => mapping.get(id) || id);
                    return `refid="${updatedIds.join(' ')}"`;
                });

                // 5. Finalize placeholders
                processedXml = processedXml.replace(/id="##TEMP_ID_([^#]+)##"/g, 'id="$1"');

                setOutput(processedXml);
                generateDiff(input, processedXml);
                setStep('result');
                setToast({ msg: "Protocols applied. IDs normalized to 4-digit sequences.", type: "success" });
                setIsLoading(false);
            } catch (err) {
                setToast({ msg: "Remapping process failed.", type: "error" });
                setIsLoading(false);
            }
        }, 800);
    };

    const filteredResults = auditResults.filter(item => {
        if (filterOtherOnly && !item.isOtherRef) return false;
        if (filterInvalidOnly && item.status === 'valid') return false;
        if (filterNameSpacingOnly && !item.hasNameSpacingViolation) return false;
        return true;
    });

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAudit : (step === 'audit' ? executeFix : undefined),
        onClear: () => { setInput(''); setAuditResults([]); setStep('input'); }
    }, [input, auditResults, step]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">ID Prefix Auditor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic tracking-tight leading-relaxed">
                    Protocol validation for bb, rf, se, ir, ca, cf, and plural cross-refs. Enforcing strict 4-digit numeric suffixes and collapsed initials.
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[750px] flex flex-col relative transition-all duration-500">
                {isLoading && <LoadingOverlay message="Executing Structural Protocol Check..." color="slate" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-6 border-b border-slate-100 flex justify-between items-center overflow-x-auto whitespace-nowrap">
                            <div className="flex items-center gap-6">
                                <label className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Protocols</label>
                                <div className="flex gap-2">
                                    {ID_CONFIG.reduce((acc, c) => {
                                        if (!acc.find(item => item.prefix === c.prefix)) {
                                            acc.push(c);
                                        }
                                        return acc;
                                    }, [] as typeof ID_CONFIG).map(c => (
                                        <span key={c.prefix} className="px-2 py-1 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-50 shadow-sm uppercase">
                                            <span className="text-slate-500">{c.tag.split(':')[1]}:</span> <span className="text-indigo-600 font-black">{c.prefix}####</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setInput('')} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline transition-all ml-4">Reset Input</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300" 
                            placeholder="Paste the full XML article source here. Violations in ID prefixes, length, and spaced initials will be reported. Plural cross-refs are now audited..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runAudit} className="bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-20 rounded-[2.5rem] shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.3em]">
                                Execute Global Audit
                            </button>
                        </div>
                    </div>
                )}

                {step === 'audit' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10 overflow-x-auto">
                            <div className="flex flex-col shrink-0">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Audit Matrix</h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${auditResults.some(r => r.status === 'invalid') ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                                        {auditResults.filter(r => r.status === 'invalid').length} Non-Compliant Nodes
                                    </p>
                                    <div className="h-3 w-px bg-slate-200"></div>
                                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">
                                        {auditResults.filter(r => r.isOtherRef).length} Other-Refs
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 ml-4">
                                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button 
                                        onClick={() => setFilterInvalidOnly(!filterInvalidOnly)} 
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterInvalidOnly ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Violations
                                    </button>
                                    <button 
                                        onClick={() => setFilterNameSpacingOnly(!filterNameSpacingOnly)} 
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterNameSpacingOnly ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Names
                                    </button>
                                    <button 
                                        onClick={() => setFilterOtherOnly(!filterOtherOnly)} 
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterOtherOnly ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Other-Refs
                                    </button>
                                </div>
                                <button onClick={() => setStep('input')} className="px-6 py-2 rounded-xl text-xs font-black text-slate-400 hover:text-slate-600 uppercase transition-all tracking-widest">Return</button>
                                <button onClick={executeFix} disabled={!auditResults.some(r => r.status === 'invalid')} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                    Fix All Violations
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-4 custom-scrollbar">
                            {filteredResults.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-300 italic uppercase tracking-widest text-sm text-center">No items matching current matrix filters</div>
                            ) : (
                                filteredResults.map((res, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`p-6 bg-white border-2 rounded-[2rem] flex items-center gap-8 transition-all hover:shadow-lg ${res.status === 'invalid' ? 'border-rose-200 bg-rose-50/20 shadow-sm' : 'border-slate-100'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full shrink-0 ${res.status === 'invalid' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                        <div className="min-w-0 flex-grow">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className={`text-[10px] font-mono font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${res.status === 'invalid' && !res.id.toLowerCase().startsWith(res.expectedPrefix) ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                    {res.originalId}
                                                </span>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded border border-slate-100">
                                                    Tag: {res.tagName}
                                                </span>
                                                {res.isLengthViolation && (
                                                    <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-1 rounded border border-rose-600 shadow-sm">
                                                        ID Length Violation
                                                    </span>
                                                )}
                                                {res.isOtherRef && (
                                                    <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200 shadow-sm">
                                                        Other-Ref
                                                    </span>
                                                )}
                                                {res.hasNameSpacingViolation && (
                                                    <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200 shadow-sm">
                                                        Initials Violation
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-500 italic truncate pr-8 leading-relaxed font-serif">{res.preview}</p>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end">
                                            <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${res.status === 'invalid' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {res.status === 'invalid' ? 'Correction Required' : 'Protocol Compliant'}
                                            </div>
                                            {res.status === 'invalid' && (
                                                <div className="text-[10px] font-bold text-slate-400 text-right">
                                                    Expected: <span className="text-indigo-600 font-black">{res.expectedPrefix}####</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">Corrected Protocol Stream</h3>
                            <div className="flex gap-4">
                                <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Corrected XML Copied!', type:'success'}); }} className="bg-emerald-600 text-white border border-emerald-700 px-6 py-2.5 rounded-xl text-[10px] font-black hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-widest">Export Result</button>
                                <button onClick={() => { setStep('input'); setAuditResults([]); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Start New Session</button>
                            </div>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-4">
                            <button onClick={() => setActiveTab('xml')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'xml' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Normalized Source</button>
                            <button onClick={() => setActiveTab('diff')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'diff' ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Correction Log (Diff)</button>
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8">
                                    <textarea 
                                        readOnly
                                        value={output}
                                        className="h-full w-full p-10 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner focus:ring-0 resize-none leading-relaxed outline-none"
                                    />
                                </div>
                            )}
                            {activeTab === 'diff' && (
                                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                                    {diffElements}
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

export default IdAuditor;