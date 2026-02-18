import React, { useState, useRef, useEffect, useMemo } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface QcIssue {
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
}

interface HighlightItem {
    id: string;
    paraId: string;
    rawContent: string;
    xmlContent: string;
    charCount: number;
    status: 'pass' | 'warn' | 'fail';
    issues: string[];
}

const ArticleHighlights: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [output, setOutput] = useState('');
    const [highlightedOutput, setHighlightedOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasContent, setHasContent] = useState(false);
    const [activeTab, setActiveTab] = useState<'xml' | 'report'>('xml');
    const [qcReport, setQcReport] = useState<QcIssue[]>([]);
    const [processedItems, setProcessedItems] = useState<HighlightItem[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const CHAR_LIMIT = 125;

    const checkContent = () => {
        if (editorRef.current) {
            setHasContent(!!editorRef.current.innerText.trim());
        }
    };

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const contentPalette = ['text-blue-600', 'text-emerald-600', 'text-purple-600', 'text-amber-600', 'text-rose-600', 'text-cyan-600'];
        let pIdx = 0;
        html = html.replace(/(&lt;ce:para\b.*?&gt;)([\s\S]*?)(&lt;\/ce:para&gt;)/g, (m, open, content, close) => {
            const color = contentPalette[pIdx % contentPalette.length];
            pIdx++;
            return `${open}<span class="${color} font-medium">${content}</span>${close}`;
        });
        html = html.replace(/(&lt;ce:label&gt;)(.*?)(&lt;\/ce:label&gt;)/g, '$1<span class="text-slate-700 font-bold bg-slate-200 rounded px-1.5 border border-slate-300 text-xs">$2</span>$3');
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g, 
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600">$4</span>'
            );
            return `<span class="text-indigo-600 font-normal">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-normal">${suffix}</span>`;
        });
        html = html.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-emerald-600 italic">$1</span>');
        return html;
    };

    const domToXml = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tagName = el.tagName.toLowerCase();
            const style = el.style;
            let content = '';
            el.childNodes.forEach((child: Node) => { content += domToXml(child); });
            const isBold = tagName === 'b' || tagName === 'strong' || style.fontWeight === 'bold' || parseInt(style.fontWeight as string) >= 700;
            const isItalic = tagName === 'i' || tagName === 'em' || style.fontStyle === 'italic';
            const isSup = tagName === 'sup' || style.verticalAlign === 'super';
            const isSub = tagName === 'sub' || style.verticalAlign === 'sub';
            if (isBold) return `<ce:bold>${content}</ce:bold>`;
            if (isItalic) return `<ce:italic>${content}</ce:italic>`;
            if (isSup) return `<ce:sup>${content}</ce:sup>`;
            if (isSub) return `<ce:inf>${content}</ce:inf>`;
            return content;
        }
        return '';
    };

    const generateXML = () => {
        if (!editorRef.current) return;
        const rawText = editorRef.current.innerText.trim();
        if (!rawText) {
            setToast({ msg: "Please paste text first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            const globalIssues: QcIssue[] = [];
            const items: HighlightItem[] = [];
            const seenContent = new Set<string>();

            const cleanNumbering = (node: Node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent || '';
                    const match = text.match(/^\s*(?:(?:(?:\d+|[a-zA-Z])[\.\)])|•|–|-)\s+/);
                    if (match) { node.textContent = text.substring(match[0].length); return true; }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    if (el.childNodes.length > 0) return cleanNumbering(el.childNodes[0]);
                }
                return false;
            };

            const liElements = editorRef.current!.querySelectorAll('li');
            let groups: Node[][] = [];
            if (liElements.length > 0) {
                liElements.forEach(li => groups.push([li.cloneNode(true)]));
            } else {
                const children = Array.from(editorRef.current!.childNodes) as Node[];
                let currentGroup: Node[] = [];
                children.forEach((child) => {
                    const tagName = (child.nodeType === Node.ELEMENT_NODE) ? (child as HTMLElement).tagName.toLowerCase() : '';
                    if (tagName === 'br' || ['div', 'p', 'h1', 'h2', 'h3'].includes(tagName)) {
                        if (currentGroup.some(n => n.textContent?.trim())) groups.push([...currentGroup]);
                        currentGroup = (tagName !== 'br') ? [child.cloneNode(true)] : [];
                    } else {
                        currentGroup.push(child.cloneNode(true));
                    }
                });
                if (currentGroup.some(n => n.textContent?.trim())) groups.push(currentGroup);
            }

            let counter = 4005;
            groups.forEach((nodes) => {
                const tempDiv = document.createElement('div');
                nodes.forEach(n => tempDiv.appendChild(n));
                const originalText = tempDiv.innerText.trim();
                cleanNumbering(tempDiv);
                const innerXML = domToXml(tempDiv).trim().replace(/[\r\n]+/g, ' ');
                if (!innerXML) return;

                const itemIssues: string[] = [];
                const charCount = innerXML.replace(/<[^>]+>/g, '').length;
                if (charCount > CHAR_LIMIT) itemIssues.push(`Length exceeds standard ${CHAR_LIMIT} character limit.`);
                if (charCount < 10) itemIssues.push("Content appears too short to be a valid highlight.");
                
                const normalized = innerXML.toLowerCase().replace(/\s+/g, '');
                if (seenContent.has(normalized)) itemIssues.push("Potential duplicate content detected.");
                seenContent.add(normalized);

                items.push({
                    id: `li${counter}`,
                    paraId: `p${counter}`,
                    rawContent: originalText,
                    xmlContent: innerXML,
                    charCount,
                    status: charCount > CHAR_LIMIT ? 'fail' : (itemIssues.length > 0 ? 'warn' : 'pass'),
                    issues: itemIssues
                });
                counter += 5;
            });

            if (items.length === 0) {
                setQcReport([{ type: 'error', message: "No valid content found to generate highlights." }]);
                setActiveTab('report');
                setIsLoading(false);
                return;
            }

            if (items.length > 5) globalIssues.push({ type: 'warning', message: `${items.length} highlights generated. Standard limit is 5.` });
            if (items.length < 3) globalIssues.push({ type: 'info', message: `Only ${items.length} highlights generated. Standard is 3-5.` });

            const finalXML = items.map(i => `<ce:list-item id="${i.id}"><ce:label>•</ce:label><ce:para id="${i.paraId}">${i.xmlContent}</ce:para></ce:list-item>`).join('\n');
            setOutput(finalXML);
            setHighlightedOutput(highlightXml(finalXML));
            setProcessedItems(items);
            setQcReport(globalIssues);
            setToast({ msg: "Highlights Protocol Executed.", type: "success" });
            setActiveTab('xml');
            setIsLoading(false);
        }, 600);
    };

    const clearAll = () => {
        if (editorRef.current) editorRef.current.innerHTML = '';
        setHasContent(false); setOutput(''); setHighlightedOutput(''); setQcReport([]); setProcessedItems([]);
        setToast({ msg: "Cleared.", type: "warn" });
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied XML!", type: "success" }));
    };

    useKeyboardShortcuts({ onPrimary: generateXML, onCopy: copyOutput, onClear: clearAll }, [output]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Article Highlights Generator</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic leading-relaxed">Precision extraction of author highlights with enforced 125 character limits and XML normalization.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[650px]">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-300 relative">
                    <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex justify-between items-center z-10">
                        <label className="font-black text-slate-700 text-[10px] uppercase tracking-widest flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[8px]">1</span>Paste Highlights Source</label>
                        <button onClick={clearAll} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline">Clear</button>
                    </div>
                    <div className="relative w-full h-full bg-slate-50/20">
                        {!hasContent && <div className="absolute top-8 left-8 pointer-events-none opacity-40 z-0"><ul className="list-disc pl-4 text-slate-400 space-y-2 text-sm"><li>Paste your bullet points here...</li><li>Styles (Bold, Italic, Sup/Sub) are preserved.</li><li>Automatic list detection and cleanup.</li></ul></div>}
                        <div ref={editorRef} contentEditable={true} onInput={checkContent} onPaste={() => setTimeout(checkContent, 0)} className="absolute inset-0 w-full h-full p-8 text-[15px] text-slate-800 focus:outline-none overflow-y-auto custom-scrollbar prose prose-slate max-w-none z-10 font-medium leading-relaxed" />
                    </div>
                </div>
                
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-8 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-black text-slate-700 text-[10px] uppercase tracking-widest flex items-center gap-2 py-4"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[8px]">2</span>Protocol Result</label>
                        {output && activeTab === 'xml' && <button onClick={copyOutput} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 transition-all active:scale-95 uppercase tracking-widest">Copy Stream</button>}
                    </div>
                    <div className="bg-white px-6 pt-4 border-b border-slate-100 flex space-x-3">
                         <button onClick={() => setActiveTab('xml')} className={`px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x ${activeTab === 'xml' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:bg-slate-50'}`}>XML Output</button>
                         <button onClick={() => setActiveTab('report')} className={`px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] rounded-t-2xl transition-all border-t border-x ${activeTab === 'report' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent hover:bg-slate-50'}`}>QC Audit {processedItems.length > 0 && <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] ${processedItems.some(i => i.status !== 'pass') ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-200 text-slate-500'}`}>{processedItems.length}</span>}</button>
                    </div>
                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                         {isLoading && <LoadingOverlay message="Generating Protocols..." color="indigo" />}
                         {activeTab === 'xml' && (highlightedOutput ? <div className="w-full h-full p-8 text-[13px] font-mono text-slate-800 bg-white overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-loose shadow-inner" dangerouslySetInnerHTML={{ __html: highlightedOutput }} /> : <div className="h-full flex items-center justify-center opacity-30 grayscale"><p className="text-xs font-black uppercase tracking-[0.3em]">Awaiting Generation</p></div>)}
                         {activeTab === 'report' && (
                            <div className="h-full overflow-y-auto custom-scrollbar p-8 bg-white space-y-10">
                                {processedItems.length > 0 ? (
                                    <>
                                        <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-[2rem] bg-slate-50 border border-slate-200 shadow-inner">
                                            <div className="w-20 h-20 rounded-full border-4 border-white shadow-md flex items-center justify-center relative">
                                                <svg className={`w-10 h-10 ${processedItems.every(i => i.status === 'pass') ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                            </div>
                                            <div className="text-center sm:text-left flex-grow">
                                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none mb-2">Production Readiness</h3>
                                                <p className="text-xs text-slate-500 font-medium">{processedItems.every(i => i.status === 'pass') ? 'All highlights compliant with DTD constraints.' : 'Resolution required for non-compliant highlights.'}</p>
                                                <div className="flex gap-4 mt-4">
                                                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Length</span><span className="text-sm font-bold text-slate-900">{processedItems.reduce((acc, i) => acc + i.charCount, 0)} Chars</span></div>
                                                    <div className="w-px h-8 bg-slate-200"></div>
                                                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Density</span><span className="text-sm font-bold text-slate-900">{Math.round(processedItems.reduce((acc, i) => acc + i.charCount, 0) / processedItems.length)} Chars/Item</span></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 pb-2">Individual Integrity Audit</h4>
                                            <div className="space-y-4">
                                                {processedItems.map((item, idx) => (
                                                    <div key={idx} className={`p-6 border-2 rounded-[2rem] transition-all bg-white shadow-sm ${item.status === 'fail' ? 'border-rose-100 bg-rose-50/10' : item.status === 'warn' ? 'border-amber-100 bg-amber-50/10' : 'border-slate-50'}`}>
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs border shadow-inner ${item.status === 'fail' ? 'bg-rose-100 text-rose-600 border-rose-200' : item.status === 'warn' ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{idx + 1}</span>
                                                                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">ID: {item.id}</span>
                                                            </div>
                                                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${item.status === 'fail' ? 'bg-rose-50 text-rose-600 border-rose-200' : item.status === 'warn' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>{item.status === 'pass' ? 'Compliant' : 'Violation'}</span>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div className="relative">
                                                                <div className="flex justify-between items-center mb-1.5"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Character Density</span><span className={`text-[10px] font-mono font-black ${item.charCount > CHAR_LIMIT ? 'text-rose-600' : 'text-slate-700'}`}>{item.charCount} / {CHAR_LIMIT}</span></div>
                                                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className={`h-full transition-all duration-700 ease-out rounded-full ${item.charCount > CHAR_LIMIT ? 'bg-rose-500' : item.charCount > (CHAR_LIMIT * 0.8) ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (item.charCount / CHAR_LIMIT) * 100)}%` }} /></div>
                                                            </div>
                                                            {item.issues.length > 0 && <ul className="space-y-1.5">{item.issues.map((issue, iIdx) => (<li key={iIdx} className="text-[11px] font-bold text-rose-600 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-rose-400"></div>{issue}</li>))}</ul>}
                                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-mono text-slate-400 line-clamp-1 italic">{item.xmlContent}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30 grayscale"><p className="text-xs font-black uppercase tracking-[0.3em]">No Audit Data Available</p></div>
                                )}
                            </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="mt-10 text-center">
                <button onClick={generateXML} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-5 px-20 rounded-[2.5rem] shadow-2xl shadow-slate-900/10 transition-all active:scale-95 uppercase tracking-[0.3em] text-xs">Analyze & Generate Highlights</button>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ArticleHighlights;