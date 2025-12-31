
import React, { useState, useRef, useMemo } from 'react';
import { CREDIT_DB } from '../constants';
import { findCreditRole, getSuggestions } from '../utils/creditLogic';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface Issue {
    id: string;
    original: string;
    suggestion?: string;
    type: 'typo' | 'unknown' | 'duplicate';
    authorIndex: number;
}

interface ParsedAuthor {
    name: string;
    roles: Array<{
        normalized: string;
        original: string;
        isCorrection: boolean;
        isDuplicate: boolean;
    }>;
    originalSegment: string;
}

// Aesthetic Color Palette for CRediT Roles
const getRoleColor = (roleName: string) => {
    const n = roleName.toLowerCase();
    
    // Core Writing - Pink/Rose
    if (n.includes('draft') || n.includes('writing')) {
         return { text: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' };
    }
    if (n.includes('review') || n.includes('editing')) {
         return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
    }

    // Scientific Process - Emerald/Green/Teal
    if (n.includes('methodology')) {
        return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    }
    if (n.includes('investigation')) {
        return { text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
    }
    if (n.includes('validation')) {
        return { text: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' };
    }

    // Data & Analysis - Amber/Orange/Yellow
    if (n.includes('analysis')) {
        return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    }
    if (n.includes('data')) {
        return { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' };
    }
    if (n.includes('software')) {
        return { text: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' };
    }

    // Management & Resources - Indigo/Violet/Blue
    if (n.includes('supervision')) {
        return { text: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
    }
    if (n.includes('project')) {
        return { text: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' };
    }
    if (n.includes('funding')) {
        return { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    }
    if (n.includes('resources')) {
        return { text: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' };
    }

    // Creative - Purple/Fuchsia
    if (n.includes('visualization')) {
        return { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' };
    }
    if (n.includes('conceptualization')) {
        return { text: 'text-fuchsia-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200' };
    }
    
    // Fallback
    return { text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
};

const CreditGenerator: React.FC = () => {
    const [input, setInput] = useState('');
    
    // Output States
    const [boldOutput, setBoldOutput] = useState('');
    const [rolesOutput, setRolesOutput] = useState('');
    const [parsedAuthors, setParsedAuthors] = useState<ParsedAuthor[]>([]);
    
    // Report States
    const [reportIssues, setReportIssues] = useState<Issue[]>([]);
    const [scanStats, setScanStats] = useState({ errors: 0, authors: 0 });
    
    const [activeTab, setActiveTab] = useState<'preview' | 'bold' | 'roles' | 'report'>('preview');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const backdropRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleScroll = () => {
        if (backdropRef.current && textareaRef.current) {
            backdropRef.current.scrollTop = textareaRef.current.scrollTop;
            backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
    };

    // --- Rich Text Copy ---
    const copyRichText = (xmlContent: string) => {
        try {
            const htmlContent = xmlContent
                .replace(/<ce:bold>/g, '<b>').replace(/<\/ce:bold>/g, '</b>')
                .replace(/<ce:italic>/g, '<i>').replace(/<\/ce:italic>/g, '</i>')
                .replace(/<ce:sup>/g, '<sup>').replace(/<\/ce:sup>/g, '</sup>')
                .replace(/<ce:inf>/g, '<sub>').replace(/<\/ce:inf>/g, '</sub>')
                .replace(/<ce:para>/g, '<p>').replace(/<\/ce:para>/g, '</p>')
                .replace(/\n/g, '<br>');

            // Keep XML tags in plain text fallback so it matches the displayed code in the tab
            const plainText = xmlContent;
            
            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            
            if (typeof ClipboardItem !== 'undefined') {
                const data = [new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })];
                navigator.clipboard.write(data).then(() => setToast({ msg: 'Copied! Paste in Word for formatting.', type: 'success' }));
            } else {
                navigator.clipboard.writeText(plainText);
                setToast({ msg: 'Copied text only', type: 'warn' });
            }
        } catch (e) {
             setToast({ msg: 'Copy failed', type: 'error' });
        }
    };

    // --- Highlighting Logic for Output ---
    const getHighlightedBoldOutput = (text: string) => {
        if (!text) return '';
        // Escape HTML first
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Highlight Tags (Removed select-none to allow full text selection)
        html = html.replace(/(&lt;\/?ce:[^&]+&gt;)/g, '<span class="text-purple-300">$1</span>');
        
        // Highlight Author Names
        html = html.replace(/(^|&gt;)([^<]+?)(:)/g, '$1<span class="text-blue-600 font-bold">$2</span>$3');
        
        // Highlight Roles (Comma separated)
        CREDIT_DB.forEach(role => {
            const roleRegex = new RegExp(`\\b${role.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            const color = getRoleColor(role.name);
            html = html.replace(roleRegex, `<span class="${color.text} font-medium">$&</span>`);
        });

        return html;
    };

    const getHighlightedXmlOutput = (text: string) => {
        if (!text) return '';
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // 1. Content inside contributor-role tags
        html = html.replace(/(&gt;)(.*?)(&lt;\/ce:contributor-role)/g, (match, p1, content, p3) => {
             const cleanContent = content.trim();
             const matchRole = findCreditRole(cleanContent);
             const color = matchRole ? getRoleColor(matchRole.name) : { text: 'text-slate-700', bg: 'bg-transparent', border: '' };
             
             return `${p1}<span class="font-medium ${color.text} ${color.bg} px-1 rounded-sm">${content}</span>${p3}`;
        });

        // 2. Highlight Comments
        html = html.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-emerald-500 italic">$1</span>');
        
        // 3. Highlight Author Headers (Name:)
        html = html.replace(/(^|\n)([^&<\n]+:)(\n)/g, '$1<span class="text-blue-600 font-bold bg-blue-50 px-1 rounded-sm">$2</span>$3');
        
        // 4. Highlight XML Tags and Attributes
        html = html.replace(/(&lt;\/?)(ce:[\w-]+)/g, '$1<span class="text-indigo-500">$2</span>');
        
        // Improve Attribute Highlighting
        html = html.replace(/(\s)(role)(=)(&quot;.*?&quot;)/g, '$1<span class="text-sky-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-amber-600">$4</span>');

        return html;
    };

    // --- Live Highlighting for Input ---
    const { highlightedHtml, inputStats } = useMemo(() => {
        let authorCount = 0;
        let validRolesCount = 0;
        let invalidRolesCount = 0;
        let text = input;
        
        let escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Smart Detection: Do we use periods to separate authors?
        const hasPeriods = text.includes('.');
        
        let regex: RegExp;
        if (hasPeriods) {
            regex = /(^|[\n.]\s*)([^:\n.]+?)(:)([^.\n]+)/g;
        } else {
            regex = /(^|[\n;]\s*)([^:\n;]+?)(:)([^;\n]+)/g;
        }
        
        const processedText = escaped.replace(regex, (match, prefix, name, colon, roles) => {
             if (name.length > 80) return match; 

             authorCount++;
             const localSeen = new Set<string>(); 

             const processedRoles = roles.split(/([,;])/).map((token: string) => {
                 if (token === ',' || token === ';' || !token.trim()) return token;

                 const rawRole = token;
                 const cleanRole = rawRole.trim();
                 const matchRole = findCreditRole(cleanRole);
                 
                 if (matchRole) {
                     if (localSeen.has(matchRole.name)) {
                         invalidRolesCount++;
                         return `<span class="text-slate-400 bg-slate-100 font-bold line-through decoration-rose-500 decoration-2 opacity-70 rounded-sm py-1 box-decoration-clone" title="Duplicate: ${matchRole.name}">${rawRole}</span>`;
                     }
                     
                     localSeen.add(matchRole.name);
                     validRolesCount++;
                     const colors = getRoleColor(matchRole.name);
                     
                     if (cleanRole !== matchRole.name && cleanRole.toLowerCase() !== matchRole.name.toLowerCase()) {
                          return `<span class="${colors.text} ${colors.bg} bg-opacity-50 font-medium underline decoration-wavy decoration-amber-300 rounded-sm py-1 box-decoration-clone" title="Will correct to: ${matchRole.name}">${rawRole}</span>`;
                     }
                     return `<span class="${colors.text} ${colors.bg} font-medium rounded-sm py-1 box-decoration-clone" title="Valid Role">${rawRole}</span>`;
                 } else {
                     invalidRolesCount++;
                     return `<span class="text-rose-600 bg-rose-50 font-bold underline decoration-dotted decoration-rose-300 rounded-sm py-1 box-decoration-clone" title="Unknown role">${rawRole}</span>`;
                 }
             }).join('');
             
             return `${prefix}<span class="font-bold text-blue-600 bg-blue-50 rounded-sm py-1 box-decoration-clone">${name}</span>${colon}${processedRoles}`;
        });

        return {
            highlightedHtml: processedText + (text.endsWith('\n') ? '\n\u200B' : ''),
            inputStats: { authors: authorCount, valid: validRolesCount, invalid: invalidRolesCount }
        };
    }, [input]);

    // --- Parsing Logic ---
    const generate = () => {
        if (!input.trim()) {
            setToast({ msg: "Please enter text to parse", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            let processingText = input;
            
            // Cleanup input
            const paraMatch = input.match(/<ce:para[^>]*>([\s\S]*?)<\/ce:para>/);
            if (paraMatch) processingText = paraMatch[1];
            processingText = processingText.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
            
            // Smart Split Strategy
            const semicolonCount = (processingText.match(/;/g) || []).length;
            const periodCount = (processingText.match(/\./g) || []).length;
            let segments: string[] = [];
            
            if (periodCount > 0) {
                 const tempPlaceholder = "___SPLIT___";
                 const smartSplit = processingText.replace(/([a-z]{2,})\.\s+(?=[A-Z])/g, `$1.${tempPlaceholder}`);
                 segments = smartSplit.split(tempPlaceholder);
            } else if (semicolonCount > 0) {
                 segments = processingText.split(';');
            } else {
                 segments = [processingText];
            }
            
            // Handle "and" separators
            let refinedSegments: string[] = [];
            segments.forEach(seg => {
                const internalSplit = seg.split(/\s+and\s+(?=[A-Z][a-z]+:)/);
                refinedSegments.push(...internalSplit);
            });

            // Analysis Vars
            let boldSegments: string[] = [];
            let rolesSegments: string[] = [];
            let newReportIssues: Issue[] = [];
            let parsedAuthorsList: ParsedAuthor[] = [];
            let errorCounter = 0;

            refinedSegments.forEach((part, idx) => {
                part = part.trim();
                if (!part) return;
                
                if (idx === refinedSegments.length - 1 && part.endsWith('.')) {
                    part = part.slice(0, -1);
                }

                const colonIndex = part.indexOf(':');
                if (colonIndex === -1) {
                    boldSegments.push(part.replace(/&/g, '&amp;') + ".");
                    return; 
                }

                const name = part.substring(0, colonIndex).trim();
                const rawRolesString = part.substring(colonIndex + 1).trim();
                const rawRolesList = rawRolesString.split(/[,;]/).map(r => r.trim()).filter(r => r !== "");
                
                let displayRoles: string[] = [];
                let xmlRoles: {name: string, url: string}[] = [];
                let currentAuthorParsed: ParsedAuthor = {
                    name,
                    originalSegment: part,
                    roles: []
                };

                const seenRoles = new Set<string>();

                rawRolesList.forEach(rawRole => {
                    const match = findCreditRole(rawRole);
                    if (match) {
                        if (seenRoles.has(match.name)) {
                            errorCounter++;
                            newReportIssues.push({
                                id: `${name}-${rawRole}-${Math.random()}`,
                                original: rawRole,
                                suggestion: "Removed duplicate",
                                type: 'duplicate',
                                authorIndex: idx
                            });
                            
                            currentAuthorParsed.roles.push({
                                normalized: match.name,
                                original: rawRole,
                                isCorrection: false,
                                isDuplicate: true
                            });
                        } else {
                            seenRoles.add(match.name);
                            displayRoles.push(match.name);
                            xmlRoles.push({ name: match.name, url: match.url });
                            
                            const isCorrection = rawRole !== match.name && rawRole.toLowerCase() !== match.name.toLowerCase();
                            if (isCorrection) {
                                errorCounter++;
                                newReportIssues.push({
                                    id: `${name}-${rawRole}-${Math.random()}`,
                                    original: rawRole,
                                    suggestion: match.name,
                                    type: 'typo',
                                    authorIndex: idx
                                });
                            }

                            currentAuthorParsed.roles.push({
                                normalized: match.name,
                                original: rawRole,
                                isCorrection,
                                isDuplicate: false
                            });
                        }
                    } else {
                        errorCounter++;
                        displayRoles.push(rawRole);
                        const suggestions = getSuggestions(rawRole);
                        newReportIssues.push({
                            id: `${name}-${rawRole}-${Math.random()}`,
                            original: rawRole,
                            suggestion: suggestions[0]?.name,
                            type: 'unknown',
                            authorIndex: idx
                        });

                        currentAuthorParsed.roles.push({
                            normalized: rawRole,
                            original: rawRole,
                            isCorrection: false,
                            isDuplicate: false
                        });
                    }
                });

                parsedAuthorsList.push(currentAuthorParsed);

                const escapedName = name.replace(/&/g, '&amp;');
                const finalDisplayRoles = displayRoles.map(r => r.replace(/&/g, '&amp;'));
                boldSegments.push(`<ce:bold>${escapedName}:</ce:bold> ${finalDisplayRoles.join(', ')}.`);

                if (xmlRoles.length > 0) {
                    let roleBlock = `${name}:\n`;
                    xmlRoles.forEach(r => roleBlock += `<ce:contributor-role role="${r.url}">${r.name.replace(/&/g, '&amp;')}</ce:contributor-role>\n`);
                    rolesSegments.push(roleBlock);
                } else {
                    rolesSegments.push(`${name}:\n<!-- No valid CRediT roles found -->\n`);
                }
            });

            let finalBold = boldSegments.join(' ');
            if (input.includes('<ce:para')) {
                 finalBold = `<ce:para>${finalBold}</ce:para>`;
            }

            setBoldOutput(finalBold);
            setRolesOutput(rolesSegments.join('\n\n'));
            setReportIssues(newReportIssues);
            setParsedAuthors(parsedAuthorsList);
            setScanStats({ errors: errorCounter, authors: parsedAuthorsList.length }); 

            setActiveTab('preview');
            
            if (errorCounter > 0) {
                setToast({ msg: `Generated with ${errorCounter} warnings`, type: 'warn' });
            } else {
                setToast({ msg: "Generated successfully!", type: 'success' });
            }
            setIsLoading(false);
        }, 800);
    };

    const autoFixAll = () => {
        let text = input;
        let count = 0;
        
        reportIssues.forEach(issue => {
            if (issue.suggestion && issue.type !== 'duplicate') {
                const escapedOrig = issue.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedOrig, 'g');
                if (text.match(regex)) {
                    text = text.replace(regex, issue.suggestion);
                    count++;
                }
            }
        });

        if (count > 0) {
            setInput(text);
            setToast({ msg: `Applied ${count} fixes.`, type: 'success' });
             setTimeout(() => {
                const btn = document.getElementById('generate-btn');
                if (btn) btn.click();
            }, 100);
        } else {
            setToast({ msg: "No confident fixes found.", type: 'warn' });
        }
    };

    const insertRole = (roleName: string) => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        let insertText = roleName;
        const charBefore = input.charAt(start - 1);
        if (charBefore && !charBefore.match(/[\s:,]/)) { insertText = ", " + roleName; }
        
        const newVal = input.substring(0, start) + insertText + input.substring(end);
        setInput(newVal);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertText.length;
            }
        }, 0);
    };

    useKeyboardShortcuts({
        onPrimary: generate,
        onCopy: () => {
            if (activeTab === 'bold') copyRichText(boldOutput);
            else if (activeTab === 'roles' || activeTab === 'preview') {
                navigator.clipboard.writeText(rolesOutput);
                setToast({ msg: 'Copied XML!', type: 'success' });
            }
        },
        onClear: () => {
            setInput('');
            setToast({msg: 'Input cleared', type:'warn'});
        }
    }, [input, boldOutput, rolesOutput, activeTab]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">CRediT Authorship Generator</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Smart-parse author roles, correct typos, and generate standardized XML.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[700px]">
                {/* Input Area */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative group focus-within:ring-2 focus-within:ring-purple-100 transition-all duration-300">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center z-20 relative">
                        <label className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-purple-600 font-mono shadow-sm">IN</span>
                            Input Text
                        </label>
                        <div className="flex gap-2">
                             <button onClick={() => setInput('')} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded transition-colors">Clear</button>
                        </div>
                    </div>
                    
                    <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto whitespace-nowrap custom-scrollbar z-20 relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Insert:</span>
                        <div className="flex gap-1.5">
                            {CREDIT_DB.map(r => {
                                const colors = getRoleColor(r.name);
                                return (
                                    <button 
                                        key={r.name} 
                                        onClick={() => insertRole(r.name)} 
                                        className={`px-2 py-1 bg-white border border-slate-200 text-[10px] rounded transition-colors hover:border-current ${colors.text} hover:opacity-80 font-medium`}
                                    >
                                        {r.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="relative w-full flex-grow bg-slate-50/30">
                        <div 
                            ref={backdropRef}
                            className="absolute inset-0 p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words pointer-events-none overflow-auto custom-scrollbar text-slate-800 z-0"
                            dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
                        />
                        <textarea 
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onScroll={handleScroll}
                            className="absolute inset-0 w-full h-full p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words bg-transparent border-none text-transparent caret-slate-800 focus:ring-0 outline-none resize-none z-10 placeholder-slate-400 selection:bg-purple-500 selection:text-white"
                            placeholder="Paste statement (e.g., 'J. Doe: Conceptualization, Data Curation. A. Smith: Writing.')..."
                            spellCheck={false}
                        />
                    </div>

                    <div className="px-4 py-2 bg-white border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-medium z-20 relative">
                         <div className="flex gap-4">
                             <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400"></span> {inputStats.authors} Authors</span>
                             <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> {inputStats.valid} Valid</span>
                             <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400"></span> {inputStats.invalid} Issues</span>
                         </div>
                    </div>
                </div>

                {/* Output Area */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-indigo-600 font-mono shadow-sm">OUT</span>
                            Results
                        </label>
                        <div className="flex items-center gap-2">
                            {activeTab !== 'report' && activeTab !== 'preview' && (
                                <button 
                                    onClick={() => {
                                        if (activeTab === 'bold') copyRichText(boldOutput);
                                        else {
                                            navigator.clipboard.writeText(rolesOutput);
                                            setToast({ msg: 'Copied XML!', type: 'success' });
                                        }
                                    }} 
                                    title="Ctrl+Shift+C"
                                    className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded border border-transparent hover:border-indigo-100 transition-colors flex items-center gap-1"
                                >
                                    Copy
                                </button>
                            )}
                            {scanStats.errors > 0 && (
                                <button 
                                    onClick={autoFixAll}
                                    className="text-xs font-bold text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                                >
                                    Auto-Fix All
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                        {['preview', 'bold', 'roles', 'report'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === tab 
                                    ? 'bg-slate-50 text-purple-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'preview' && 'Visual Preview'}
                                {tab === 'bold' && 'Formatted Text'}
                                {tab === 'roles' && 'XML Roles'}
                                {tab === 'report' && `Audit Log ${scanStats.errors > 0 ? `(${scanStats.errors})` : ''}`}
                             </button>
                        ))}
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-auto custom-scrollbar">
                        {isLoading && <LoadingOverlay message="Scanning Authors..." color="purple" />}
                        
                        {activeTab === 'preview' && (
                            <div className="p-6 space-y-4">
                                {parsedAuthors.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 pt-20">
                                        <p>Generate to see preview</p>
                                    </div>
                                ) : (
                                    parsedAuthors.map((author, idx) => (
                                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="font-bold text-blue-600 flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center font-mono text-xs shadow-inner">
                                                        {author.name.charAt(0)}
                                                    </div>
                                                    {author.name}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {author.roles.map((role, rIdx) => {
                                                    const isUnknown = findCreditRole(role.normalized) === null;
                                                    const colors = !isUnknown ? getRoleColor(role.normalized) : { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
                                                    
                                                    if (role.isDuplicate) {
                                                        return (
                                                            <span 
                                                                key={rIdx} 
                                                                title="Duplicate Removed"
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-slate-50 text-slate-400 line-through decoration-rose-400"
                                                            >
                                                                {role.original}
                                                            </span>
                                                        );
                                                    }

                                                    return (
                                                        <span 
                                                            key={rIdx} 
                                                            title={role.isCorrection ? `Corrected from: "${role.original}"` : role.original}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 cursor-help
                                                                ${colors.bg} ${colors.text} ${colors.border}`}
                                                        >
                                                            {role.normalized}
                                                            {role.isCorrection && (
                                                                <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                            )}
                                                            {isUnknown && (
                                                                <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'bold' && (
                            <div 
                                className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-transparent border-0 focus:ring-0 resize-none leading-relaxed outline-none whitespace-pre-wrap break-words"
                                dangerouslySetInnerHTML={{ __html: getHighlightedBoldOutput(boldOutput) || '<span class="text-slate-400">Formatted output will appear here...</span>' }}
                            />
                        )}
                        
                        {activeTab === 'roles' && (
                             <div 
                                className="w-full h-full p-6 text-sm font-mono text-slate-800 bg-transparent border-0 focus:ring-0 resize-none leading-relaxed outline-none whitespace-pre-wrap break-words"
                                dangerouslySetInnerHTML={{ __html: getHighlightedXmlOutput(rolesOutput) || '<span class="text-slate-400">XML roles will appear here...</span>' }}
                            />
                        )}
                        
                        {activeTab === 'report' && (
                            <div className="h-full flex flex-col">
                                {reportIssues.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                         {scanStats.authors > 0 ? (
                                             <div className="text-center">
                                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <p className="font-bold text-slate-700">Perfect!</p>
                                                <p className="text-sm">No issues found.</p>
                                             </div>
                                         ) : (
                                            <p className="text-sm">Run generation to see report</p>
                                         )}
                                    </div>
                                ) : (
                                    <div className="overflow-auto custom-scrollbar">
                                        <table className="min-w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                                                <tr>
                                                    <th className="px-6 py-3 font-semibold text-slate-600">Original Text</th>
                                                    <th className="px-6 py-3 font-semibold text-slate-600">Issue Type</th>
                                                    <th className="px-6 py-3 font-semibold text-slate-600">Suggestion</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {reportIssues.map((issue) => (
                                                    <tr key={issue.id} className="hover:bg-slate-50/50">
                                                        <td className="px-6 py-3 font-mono text-slate-500">
                                                            {issue.original}
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                                                                ${issue.type === 'typo' ? 'bg-amber-50 text-amber-700' : 
                                                                  issue.type === 'duplicate' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                                                                  'bg-rose-50 text-rose-700'}`}>
                                                                {issue.type === 'typo' ? 'Typo / Alias' : 
                                                                 issue.type === 'duplicate' ? 'Duplicate Role' :
                                                                 'Unknown Role'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {issue.suggestion ? (
                                                                <span className="font-bold text-indigo-600">{issue.suggestion}</span>
                                                            ) : (
                                                                <span className="text-slate-400 italic">No suggestion</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button 
                    id="generate-btn"
                    onClick={generate} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className={`bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg shadow-purple-500/30 transform transition-all active:scale-95 ${isLoading ? 'opacity-80 cursor-wait' : 'hover:-translate-y-0.5'}`}
                >
                    {isLoading ? 'Processing...' : 'Analyze & Generate'}
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default CreditGenerator;
