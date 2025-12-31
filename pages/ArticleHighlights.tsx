
import React, { useState, useRef, useEffect } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface QcIssue {
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
}

const ArticleHighlights: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [output, setOutput] = useState('');
    const [highlightedOutput, setHighlightedOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasContent, setHasContent] = useState(false);
    const [activeTab, setActiveTab] = useState<'xml' | 'report'>('xml');
    const [qcReport, setQcReport] = useState<QcIssue[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    // Update content state for placeholder
    const checkContent = () => {
        if (editorRef.current) {
            setHasContent(!!editorRef.current.innerText.trim());
        }
    };

    // Syntax Highlighter for XML
    const highlightXml = (xml: string) => {
        if (!xml) return '';
        
        // 1. Escape HTML entities for the code block
        let html = xml
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Use softer shades for better aesthetics
        const contentPalette = [
            'text-blue-600', 'text-emerald-600', 'text-purple-600', 
            'text-amber-600', 'text-rose-600', 'text-cyan-600'
        ];
        let pIdx = 0;

        // 2. Wrap para content in color spans BEFORE styling tags
        html = html.replace(/(&lt;ce:para\b.*?&gt;)([\s\S]*?)(&lt;\/ce:para&gt;)/g, (m, open, content, close) => {
            const color = contentPalette[pIdx % contentPalette.length];
            pIdx++;
            // Reduced font weight to medium
            return `${open}<span class="${color} font-medium">${content}</span>${close}`;
        });
        
        // 3. Wrap label content
        html = html.replace(/(&lt;ce:label&gt;)(.*?)(&lt;\/ce:label&gt;)/g, '$1<span class="text-slate-700 font-bold bg-slate-200 rounded px-1.5 border border-slate-300 text-xs">$2</span>$3');

        // 4. Style XML tags - Use softer Indigo and normal weight
        // Regex ensures namespaced tags (ce:para) are captured fully
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g, 
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600">$4</span>'
            );
            return `<span class="text-indigo-600 font-normal">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-normal">${suffix}</span>`;
        });
        
        // 5. Comments
        html = html.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-emerald-600 italic">$1</span>');

        return html;
    };

    // Recursive function to traverse DOM and build XML
    const domToXml = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tagName = el.tagName.toLowerCase();
            const style = el.style;
            let content = '';
            
            // Recurse children
            el.childNodes.forEach((child: Node) => {
                content += domToXml(child);
            });

            // Handle Styles
            const isBold = tagName === 'b' || tagName === 'strong' || style.fontWeight === 'bold' || parseInt(style.fontWeight as string) >= 700;
            const isItalic = tagName === 'i' || tagName === 'em' || style.fontStyle === 'italic';
            const isSup = tagName === 'sup' || style.verticalAlign === 'super';
            const isSub = tagName === 'sub' || style.verticalAlign === 'sub';

            if (isBold) return `<ce:bold>${content}</ce:bold>`;
            if (isItalic) return `<ce:italic>${content}</ce:italic>`;
            if (isSup) return `<ce:sup>${content}</ce:sup>`;
            if (isSub) return `<ce:inf>${content}</ce:inf>`;
            
            // Return content if tag is just a container (span, etc)
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
            const issues: QcIssue[] = [];
            let strippedCount = 0;

            // Helper to clean numbering from DOM before processing
            const cleanNumbering = (node: Node): boolean => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent || '';
                    const match = text.match(/^\s*(?:(?:(?:\d+|[a-zA-Z])[\.\)])|•|–|-)\s+/);
                    
                    if (match) {
                        node.textContent = text.substring(match[0].length);
                        return true;
                    }
                    if (text.trim().length > 0) return true; // Just whitespace, treat as handled
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    if (el.childNodes.length > 0) {
                        return cleanNumbering(el.childNodes[0]);
                    }
                }
                return false;
            };

            const liElements = editorRef.current!.querySelectorAll('li');
            let finalGroups: Node[][] = [];
            let usedFallback = false;

            if (liElements.length > 0) {
                // If real <li> elements exist, use them
                liElements.forEach(li => finalGroups.push([li.cloneNode(true)]));
                issues.push({ type: 'success', message: `Detected ${liElements.length} rich text list items.` });
            } else {
                usedFallback = true;
                const children = Array.from(editorRef.current!.childNodes) as Node[];
                let currentGroup: Node[] = [];

                const flushGroup = () => {
                    // Check if group has actual content (not just empty text nodes)
                    const hasContent = currentGroup.some(n => n.textContent?.trim());
                    if (hasContent) {
                        finalGroups.push([...currentGroup]);
                    }
                    currentGroup = [];
                };

                children.forEach((child) => {
                    const tagName = (child.nodeType === Node.ELEMENT_NODE) ? (child as HTMLElement).tagName.toLowerCase() : '';
                    const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'article', 'section', 'blockquote'].includes(tagName);
                    const isBr = tagName === 'br';
                    
                    if (isBr) {
                        flushGroup();
                        return;
                    }

                    if (isBlock) {
                        flushGroup();
                        // For blocks, add the block itself as a group
                        finalGroups.push([child.cloneNode(true)]);
                        return;
                    }

                    // Handle Text Nodes with newlines (plain text paste)
                    if (child.nodeType === Node.TEXT_NODE) {
                         const text = child.textContent || '';
                         if (text.includes('\n')) {
                             const parts = text.split('\n');
                             parts.forEach((part, idx) => {
                                 if (idx > 0) flushGroup();
                                 if (part) currentGroup.push(document.createTextNode(part));
                             });
                             return;
                         }
                    }

                    currentGroup.push(child.cloneNode(true));
                });
                flushGroup();
            }

            // Build Item XML
            const listItems: string[] = [];
            let counter = 4005; // Starting ID per request
            let maxItemLength = 0;
            
            finalGroups.forEach((groupNodes) => {
                // Wrap group in a temp div to process structure
                const tempDiv = document.createElement('div');
                groupNodes.forEach(n => tempDiv.appendChild(n));

                const wasStripped = cleanNumbering(tempDiv);
                if (wasStripped) strippedCount++;
                
                // Get XML, trim whitespace, and replace any internal newlines/soft returns with a space
                const innerXML = domToXml(tempDiv).trim().replace(/[\r\n]+/g, ' ');
                
                // Skip empty items
                if (!innerXML || innerXML === '<ce:para></ce:para>') return;
                
                // Track stats
                if (innerXML.length > maxItemLength) maxItemLength = innerXML.length;

                const liId = `li${counter}`;
                const pId = `p${counter}`;
                
                listItems.push(
`<ce:list-item id="${liId}"><ce:label>•</ce:label><ce:para id="${pId}">${innerXML}</ce:para></ce:list-item>`
                );
                
                counter += 5;
            });

            // Post-processing QC Logic
            if (usedFallback) {
                if (strippedCount > 0) {
                    issues.push({ type: 'info', message: `Detected ${strippedCount} items using manual numbering/bullet patterns.` });
                } else if (listItems.length > 1) {
                    issues.push({ type: 'info', message: 'No bullets detected. Split by line breaks/paragraphs.' });
                } else if (listItems.length === 1) {
                    issues.push({ type: 'warning', message: 'Only one highlight generated. If you pasted multiple, try adding line breaks.' });
                }
            }

            if (listItems.length === 0) {
                 setToast({ msg: "No valid highlight text found.", type: "error" });
                 setQcReport([{ type: 'error', message: "No valid content found to generate highlights." }]);
                 setActiveTab('report');
                 setIsLoading(false);
                 return;
            }

            if (listItems.length > 5) {
                issues.push({ type: 'warning', message: `${listItems.length} highlights generated. Standard limit is usually 5.` });
            } else if (listItems.length < 3) {
                 issues.push({ type: 'info', message: `Only ${listItems.length} highlight(s) generated. Standard is usually 3-5.` });
            }

            // Check against standard limit (255)
            if (maxItemLength > 255) {
                issues.push({ type: 'warning', message: 'Some highlights are quite long (over 255 characters). Standard limit is 255.' });
            }

            // Build Final XML structure
            const finalXML = listItems.join('\n');

            setOutput(finalXML);
            setHighlightedOutput(highlightXml(finalXML));
            setQcReport(issues);
            
            const hasWarnings = issues.some(i => i.type === 'warning' || i.type === 'error');
            setToast({ 
                msg: hasWarnings ? "Generated with potential issues. Check QC Report." : `Generated ${listItems.length} highlights.`, 
                type: hasWarnings ? "warn" : "success" 
            });
            
            // Switch to XML tab by default unless it's a critical failure (handled above)
            setActiveTab('xml');
            setIsLoading(false);

        }, 600);
    };

    const clearAll = () => {
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
            setHasContent(false);
        }
        setOutput('');
        setHighlightedOutput('');
        setQcReport([]);
        setToast({ msg: "Cleared.", type: "warn" });
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied XML!", type: "success" }));
    };

    useKeyboardShortcuts({
        onPrimary: generateXML,
        onCopy: copyOutput,
        onClear: clearAll
    }, [output]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Article Highlights Generator</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Convert rich text content into structured <code className="text-sm bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded font-mono">author-highlights</code> XML.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                {/* Input Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-yellow-200 transition-all duration-300 relative">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center z-10">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-yellow-600 font-mono shadow-sm">1</span>
                            Paste Highlights (Rich Text)
                        </label>
                        <button onClick={clearAll} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    
                    {/* Visual Editor Area */}
                    <div className="relative w-full h-full bg-slate-50/20">
                        {!hasContent && (
                            <div className="absolute top-6 left-6 pointer-events-none opacity-40 z-0">
                                <ul className="list-disc pl-4 text-slate-400 space-y-2">
                                    <li>Paste your bullets here...</li>
                                    <li><span className="font-bold text-slate-500">Bold</span>, <span className="italic text-slate-500">Italics</span>, <sup>Sup</sup>, <sub>Sub</sub> preserved.</li>
                                    <li>Numbering (1., 2.) is auto-removed.</li>
                                </ul>
                            </div>
                        )}
                        <div 
                            ref={editorRef}
                            contentEditable={true}
                            onInput={checkContent}
                            className="absolute inset-0 w-full h-full p-6 text-sm text-slate-800 focus:outline-none overflow-y-auto custom-scrollbar prose prose-sm max-w-none z-10"
                            onPaste={() => setTimeout(checkContent, 0)}
                        />
                    </div>
                </div>
                
                {/* Output Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">2</span>
                            Results
                        </label>
                        {output && activeTab === 'xml' && (
                            <button onClick={copyOutput} title="Ctrl+Shift+C" className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-transparent hover:border-emerald-100 transition-colors flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy XML
                            </button>
                        )}
                    </div>
                    
                    {/* Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         <button 
                            onClick={() => setActiveTab('xml')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'xml' 
                                ? 'bg-slate-50 text-emerald-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            XML Output
                         </button>
                         <button 
                            onClick={() => setActiveTab('report')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'report' 
                                ? 'bg-slate-50 text-emerald-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            QC Report
                            {qcReport.some(i => i.type === 'warning' || i.type === 'error') && (
                                <span className="ml-2 w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                            )}
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                         {isLoading && <LoadingOverlay message="Structuring XML..." color="orange" />}
                         
                         {activeTab === 'xml' && (
                             highlightedOutput ? (
                                <div 
                                    className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-transparent overflow-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                                />
                             ) : (
                                <textarea 
                                    readOnly
                                    className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed placeholder-slate-300" 
                                    placeholder="Generated XML will appear here..."
                                />
                             )
                         )}

                         {activeTab === 'report' && (
                            <div className="h-full overflow-auto custom-scrollbar p-6 bg-white">
                                {qcReport.length > 0 ? (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Generation Analysis</h3>
                                        <div className="space-y-3">
                                            {qcReport.map((issue, idx) => (
                                                <div key={idx} className={`p-4 rounded-lg border text-sm flex gap-3 ${
                                                    issue.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                                                    issue.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                                                    issue.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-800' :
                                                    'bg-blue-50 border-blue-100 text-blue-800'
                                                }`}>
                                                    <div className="flex-shrink-0 mt-0.5">
                                                        {issue.type === 'success' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                                        {issue.type === 'warning' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                                                        {issue.type === 'error' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                                        {issue.type === 'info' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold block mb-1 capitalize">{issue.type}</span>
                                                        {issue.message}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <p>Run generation to view analysis.</p>
                                    </div>
                                )}
                            </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button 
                    onClick={generateXML} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className="group bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg shadow-yellow-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait hover:-translate-y-0.5"
                >
                    Generate Highlights XML
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ArticleHighlights;
