
import React, { useState, useRef, useMemo, useCallback } from 'react';
import { CREDIT_DB } from '../constants';
import { findCreditRole, getSuggestions } from '../utils/creditLogic';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useLocalStorage from '../hooks/useLocalStorage';
import { Download, Table as TableIcon, FileUp, Clipboard, Check, Info, Sparkles, Wand2, Search, Grid, ChevronDown, ChevronUp, RotateCcw, FileText, Plus, HelpCircle } from 'lucide-react';

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
        isUnknown?: boolean;
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
    const [input, setInput] = useLocalStorage<string>('credit_generator_input', '');
    const [boldOutput, setBoldOutput] = useLocalStorage<string>('credit_generator_bold_output', '');
    const [rolesOutput, setRolesOutput] = useLocalStorage<string>('credit_generator_roles_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('credit_generator_last_input', '');
    const [parsedAuthors, setParsedAuthors] = useLocalStorage<ParsedAuthor[]>('credit_generator_parsed_authors', []);
    
    // Report States
    const [reportIssues, setReportIssues] = useLocalStorage<Issue[]>('credit_generator_report_issues', []);
    const [scanStats, setScanStats] = useLocalStorage<{ errors: number; authors: number }>('credit_generator_scan_stats', { errors: 0, authors: 0 });
    const [copiedState, setCopiedState] = useState<{ id: string; type: 'roles' | 'xml' } | null>(null);
    
    // Input panel enhanced states
    const [roleSearchQuery, setRoleSearchQuery] = useState('');
    const [isRolesExpanded, setIsRolesExpanded] = useState(false);
    const [hoveredRole, setHoveredRole] = useState<{ name: string; definition: string } | null>(null);

    const [activeTab, setActiveTab] = useState<'preview' | 'matrix' | 'bold' | 'roles' | 'report'>('preview');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    
    const backdropRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleInsertSample = () => {
        const sample = `J. Doe: Conceptualization, Data Curation, Formal Analysis. A. Smith: Methodology, Writing – original draft, Writing – review & editing. C. Johnson: Supervision, Funding acquisition.`;
        setInput(sample);
        setToast({ msg: 'Sample statement loaded', type: 'success' });
    };

    const handleFormatText = () => {
        if (!input.trim()) return;
        const formatted = input
            .replace(/\s*:\s*/g, ': ')
            .replace(/\s*,\s*/g, ', ')
            .replace(/\s*;\s*/g, '; ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\s+\./g, '.');
        setInput(formatted);
        setToast({ msg: 'Cleaned spacing & punctuation', type: 'success' });
    };

    const filteredRoles = useMemo(() => {
        if (!roleSearchQuery.trim()) return CREDIT_DB;
        const q = roleSearchQuery.toLowerCase();
        return CREDIT_DB.filter(r => 
            r.name.toLowerCase().includes(q) || 
            (r.definition && r.definition.toLowerCase().includes(q)) ||
            (r.aliases && r.aliases.some(a => a.toLowerCase().includes(q)))
        );
    }, [roleSearchQuery]);

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

    const copyAuthorRoles = (author: ParsedAuthor) => {
        if (!author.roles || author.roles.length === 0) return;
        const validRoles = author.roles.filter(r => !r.isDuplicate && !r.isUnknown && CREDIT_DB.some(dbR => dbR.name === r.normalized));
        if (validRoles.length === 0) {
            setToast({ msg: `No valid CRediT roles for ${author.name}`, type: 'warn' });
            return;
        }
        const roles = validRoles.map(r => r.normalized).join(', ');
        navigator.clipboard.writeText(roles).then(() => {
            setCopiedState({ id: author.name, type: 'roles' });
            setTimeout(() => setCopiedState(null), 1500);
            setToast({ msg: `Copied CRediT roles for ${author.name}`, type: 'success' });
        });
    };

    const copyAuthorXml = (author: ParsedAuthor) => {
        const validRoles = author.roles.filter(r => !r.isDuplicate && !r.isUnknown && CREDIT_DB.some(dbR => dbR.name === r.normalized));
        let xml = '';
        if (validRoles.length > 0) {
            validRoles.forEach(r => {
                const dbRole = CREDIT_DB.find(dbR => dbR.name === r.normalized);
                if (dbRole) {
                    xml += `<ce:contributor-role role="${dbRole.url}">${r.normalized}</ce:contributor-role>\n`;
                }
            });
        } else {
            xml += `<!-- No valid CRediT roles found -->\n`;
        }
        navigator.clipboard.writeText(xml).then(() => {
            setCopiedState({ id: author.name, type: 'xml' });
            setTimeout(() => setCopiedState(null), 1500);
            setToast({ msg: `Copied XML for ${author.name}`, type: 'success' });
        });
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

    // --- File Handling ---
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                const content = evt.target?.result as string;
                setInput(content);
                setToast({ msg: `Imported ${file.name}`, type: 'success' });
            };
            reader.readAsText(file);
        }
    }, [setInput]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                const content = evt.target?.result as string;
                setInput(content);
                setToast({ msg: `Imported ${file.name}`, type: 'success' });
            };
            reader.readAsText(file);
        }
    };

    // --- JSON Export ---
    const exportAsJson = () => {
        if (parsedAuthors.length === 0) return;
        const data = parsedAuthors.map(a => ({
            name: a.name,
            roles: a.roles.filter(r => !r.isDuplicate && !r.isUnknown && CREDIT_DB.some(dbR => dbR.name === r.normalized)).map(r => r.normalized)
        }));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `credit_statement_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        setToast({ msg: "JSON exported!", type: "success" });
    };

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
                                isDuplicate: true,
                                isUnknown: false
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
                                isDuplicate: false,
                                isUnknown: false
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
                            isDuplicate: false,
                            isUnknown: true
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
            setLastProcessedInput(input);
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

    const isStale = (boldOutput || rolesOutput) && input !== lastProcessedInput;

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
            setBoldOutput('');
            setRolesOutput('');
            setLastProcessedInput('');
            setParsedAuthors([]);
            setReportIssues([]);
            setScanStats({ errors: 0, authors: 0 });
            setToast({msg: 'All data cleared', type:'warn'});
        }
    }, [input, boldOutput, rolesOutput, activeTab, lastProcessedInput]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">CRediT Authorship Generator</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Smart-parse author roles, correct typos, and generate standardized XML.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[700px]">
                {/* Input Area */}
                <div 
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden flex flex-col relative group transition-all duration-300 min-h-[500px] ${dragActive ? 'border-purple-500 bg-purple-50/50' : 'border-slate-200'}`}
                >
                    {dragActive && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-purple-500/10 backdrop-blur-sm pointer-events-none">
                            <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border-2 border-purple-500 animate-bounce">
                                <FileUp size={48} className="text-purple-600" />
                                <span className="text-xl font-black text-purple-700 uppercase">Drop to Import Statement</span>
                            </div>
                        </div>
                    )}
                    
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 z-20 relative">
                        <label className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 border border-purple-200 text-purple-700 shadow-sm">
                                <FileText size={15} />
                            </div>
                            <span>Input Text</span>
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                onClick={handleInsertSample}
                                className="text-xs font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                                title="Insert sample statement for testing"
                            >
                                <Sparkles size={13} className="text-purple-600" />
                                <span>Insert Sample</span>
                            </button>
                            <button
                                onClick={handleFormatText}
                                className="text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                                title="Format spacing and punctuation"
                            >
                                <Wand2 size={13} className="text-indigo-500" />
                                <span>Format</span>
                            </button>
                            <input 
                                type="file" 
                                id="file-upload" 
                                className="hidden" 
                                accept=".txt,.xml" 
                                onChange={handleFileUpload} 
                            />
                            <button 
                                onClick={() => document.getElementById('file-upload')?.click()}
                                className="text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                                title="Import .txt or .xml file"
                            >
                                <FileUp size={13} />
                                <span>Import</span>
                            </button>
                            <button 
                                onClick={() => {
                                    setInput('');
                                    setBoldOutput('');
                                    setRolesOutput('');
                                    setLastProcessedInput('');
                                    setParsedAuthors([]);
                                    setReportIssues([]);
                                    setScanStats({ errors: 0, authors: 0 });
                                    setToast({msg: 'All data cleared', type:'warn'});
                                }} 
                                title="Clear input text (Alt+Delete)" 
                                className="text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                            >
                                <RotateCcw size={13} />
                                <span>Clear</span>
                            </button>
                        </div>
                    </div>
                    
                    {/* Insert CRediT Roles Bar */}
                    <div className="bg-slate-100/70 border-b border-slate-200 p-2.5 z-20 relative space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                                    <Plus size={12} className="text-purple-600" /> Quick Insert Roles
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">({filteredRoles.length}/14)</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center">
                                    <Search size={12} className="absolute left-2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={roleSearchQuery}
                                        onChange={(e) => setRoleSearchQuery(e.target.value)}
                                        placeholder="Filter roles..."
                                        className="w-32 sm:w-40 pl-6 pr-2 py-0.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-slate-700 placeholder-slate-400"
                                    />
                                    {roleSearchQuery && (
                                        <button 
                                            onClick={() => setRoleSearchQuery('')}
                                            className="absolute right-1 text-[10px] text-slate-400 hover:text-slate-600 px-1"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={() => setIsRolesExpanded(!isRolesExpanded)}
                                    className="p-1 text-slate-500 hover:text-purple-600 hover:bg-white rounded border border-slate-200 transition-colors"
                                    title={isRolesExpanded ? "Collapse roles list" : "Expand all roles grid"}
                                >
                                    {isRolesExpanded ? <ChevronUp size={14} /> : <Grid size={14} />}
                                </button>
                            </div>
                        </div>

                        <div className={`transition-all duration-200 ${
                            isRolesExpanded 
                                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-48 overflow-auto custom-scrollbar p-1' 
                                : 'flex gap-1.5 overflow-x-auto whitespace-nowrap custom-scrollbar py-0.5'
                        }`}>
                            {filteredRoles.map(r => {
                                const colors = getRoleColor(r.name);
                                return (
                                    <button 
                                        key={r.name} 
                                        onClick={() => insertRole(r.name)} 
                                        onMouseEnter={() => setHoveredRole({ name: r.name, definition: r.definition || '' })}
                                        onMouseLeave={() => setHoveredRole(null)}
                                        className={`group relative flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 hover:border-purple-300 text-[11px] rounded-lg transition-all hover:shadow-xs ${colors.text} active:scale-95 font-medium shrink-0`}
                                    >
                                        <Plus size={10} className="opacity-60 group-hover:opacity-100" />
                                        <span>{r.name}</span>
                                    </button>
                                );
                            })}
                            {filteredRoles.length === 0 && (
                                <span className="text-xs text-slate-400 py-1 px-2 italic">No roles matching "{roleSearchQuery}"</span>
                            )}
                        </div>

                        {hoveredRole && (
                            <div className="mt-1 px-2.5 py-1 bg-purple-900 text-purple-100 rounded-md text-[11px] font-sans flex items-start gap-1.5 animate-fade-in shadow-sm">
                                <Info size={13} className="text-purple-300 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-white">{hoveredRole.name}:</span>{' '}
                                    <span className="text-purple-200">{hoveredRole.definition}</span>
                                </div>
                            </div>
                        )}
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
                            placeholder="Paste or type author statements here (e.g., 'J. Doe: Conceptualization, Data Curation. A. Smith: Writing – original draft.')..."
                            spellCheck={false}
                        />
                    </div>

                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center text-xs text-slate-500 font-medium z-20 relative gap-2">
                         <div className="flex items-center gap-3">
                             <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                 <span className="w-2 h-2 rounded-full bg-blue-500"></span> 
                                 {inputStats.authors} {inputStats.authors === 1 ? 'Author' : 'Authors'}
                             </span>
                             <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                 <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 
                                 {inputStats.valid} Valid
                             </span>
                             <span className="flex items-center gap-1.5 font-semibold text-rose-600">
                                 <span className="w-2 h-2 rounded-full bg-rose-500"></span> 
                                 {inputStats.invalid} Issues
                             </span>
                         </div>

                         <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
                             <span>{input.length} chars</span>
                             <span>•</span>
                             <span>{input ? input.split('\n').length : 0} lines</span>
                         </div>
                    </div>
                </div>

                {/* Output Area */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-indigo-600 font-mono shadow-sm">OUT</span>
                            Results
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    STALE
                                </span>
                            )}
                        </label>
                        <div className="flex items-center gap-2">
                            {activeTab !== 'report' && activeTab !== 'preview' && activeTab !== 'matrix' && (
                                <button 
                                    onClick={() => {
                                        if (activeTab === 'bold') copyRichText(boldOutput);
                                        else {
                                            navigator.clipboard.writeText(rolesOutput);
                                            setToast({ msg: 'Copied XML!', type: 'success' });
                                        }
                                    }} 
                                    title="Ctrl+Shift+C"
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${
                                        isStale 
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                                        : 'text-indigo-600 hover:bg-indigo-50 border-transparent hover:border-indigo-100'
                                    }`}
                                >
                                    {isStale ? <><Clipboard size={14} /> Copy Stale XML</> : <><Clipboard size={14} /> Copy</>}
                                </button>
                            )}
                            <button 
                                onClick={exportAsJson}
                                className="text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                            >
                                <Download size={14} /> Export JSON
                            </button>
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
                        {['preview', 'matrix', 'bold', 'roles', 'report'].map((tab) => (
                             <button 
                                key={tab}
                                onClick={() => setActiveTab(tab as any)} 
                                className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x flex items-center justify-center gap-1.5 ${activeTab === tab 
                                    ? 'bg-slate-50 text-purple-600 border-slate-200 translate-y-[1px]' 
                                    : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                             >
                                {tab === 'preview' && 'Visual Preview'}
                                {tab === 'matrix' && <><TableIcon size={14} /> Role Matrix</>}
                                {tab === 'bold' && 'Formatted Text'}
                                {tab === 'roles' && 'XML Roles'}
                                {tab === 'report' && `Audit Log ${scanStats.errors > 0 ? `(${scanStats.errors})` : ''}`}
                             </button>
                        ))}
                    </div>

                    <div className="flex-grow relative bg-slate-50 min-h-[400px]">
                        {isLoading && <LoadingOverlay message="Scanning Authors..." color="purple" />}
                        
                        {activeTab === 'preview' && (
                            <div className="absolute inset-0 p-6 space-y-4 overflow-auto custom-scrollbar">
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
                                                <button 
                                                    onClick={() => copyAuthorRoles(author)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border group/copy active:scale-95 ${
                                                        copiedState?.id === author.name && copiedState?.type === 'roles'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                            : 'bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200'
                                                    }`}
                                                    title={`Copy roles for ${author.name}`}
                                                >
                                                    {copiedState?.id === author.name && copiedState?.type === 'roles' ? (
                                                        <>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Copied Roles!</span>
                                                            <Check size={12} className="text-emerald-600" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-[10px] font-black uppercase tracking-widest hidden group-hover/copy:inline transition-all duration-300">Copy Roles</span>
                                                            <Clipboard size={12} />
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {author.roles.map((role, rIdx) => {
                                                    const roleDetails = CREDIT_DB.find(dbR => dbR.name === role.normalized);
                                                    const isUnknown = !roleDetails;
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
                                                        <div key={rIdx} className="group/role relative">
                                                            <span 
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
                                                            {!isUnknown && roleDetails.definition && (
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-900 text-white p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover/role:opacity-100 group-hover/role:visible transition-all z-50 pointer-events-none normal-case">
                                                                    <div className="font-black text-indigo-400 text-[10px] mb-1 uppercase tracking-widest">{roleDetails.name}</div>
                                                                    <div className="text-[10px] leading-relaxed text-slate-300 font-medium">
                                                                        {roleDetails.definition}
                                                                    </div>
                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'matrix' && (
                            <div className="w-full h-full p-0 flex flex-col relative overflow-hidden">
                                {parsedAuthors.length === 0 ? (
                                    <div className="h-40 flex items-center justify-center text-slate-400">Generate to see matrix</div>
                                ) : (
                                    <div className="w-full flex-grow overflow-auto custom-scrollbar bg-white rounded-b-2xl border-t border-slate-200">
                                        <table className="min-w-[1400px] w-full text-[10px] text-left border-separate border-spacing-0 table-fixed">
                                            <thead className="sticky top-0 z-30 shadow-sm">
                                                <tr className="bg-slate-50/95 backdrop-blur-sm">
                                                    <th className="p-4 font-black text-slate-900 border-r border-b border-slate-200 sticky left-0 bg-slate-50 z-40 w-48 shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase text-slate-900 leading-none mb-1">Author Repository</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{parsedAuthors.length} Identity Nodes</span>
                                                        </div>
                                                    </th>
                                                    {CREDIT_DB.map(role => (
                                                        <th key={role.name} title={role.name} className="p-0 border-r border-b border-slate-200 last:border-r-0 hover:bg-white transition-colors group relative align-bottom overflow-visible h-32 w-12">
                                                            <div className="flex items-center justify-center h-full w-full py-4">
                                                                <div className="rotate-[-60deg] origin-center whitespace-nowrap -translate-x-1 translate-y-2">
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 group-hover:text-indigo-600 transition-colors">
                                                                        {role.shortName || role.name}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-900 text-white p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none normal-case">
                                                                <div className="font-black text-indigo-400 text-[10px] mb-1 uppercase tracking-widest">{role.name}</div>
                                                                {role.definition && (
                                                                    <div className="text-[10px] leading-relaxed text-slate-300 font-medium">
                                                                        {role.definition}
                                                                    </div>
                                                                )}
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 relative">
                                                {parsedAuthors.map((author, aIdx) => (
                                                    <tr key={aIdx} className="hover:bg-indigo-50/30 transition-colors group">
                                                        <td className="p-4 font-bold text-blue-600 sticky left-0 bg-white group-hover:bg-indigo-50/50 z-20 border-r border-slate-200 shadow-[2px_0_10px_rgba(0,0,0,0.03)] transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-black shadow-inner shrink-0">
                                                                    {author.name.charAt(0)}
                                                                </div>
                                                                <span className="truncate max-w-[150px]">{author.name}</span>
                                                            </div>
                                                        </td>
                                                        {CREDIT_DB.map(role => {
                                                            const hasRole = author.roles.some(r => r.normalized === role.name && !r.isDuplicate);
                                                            const colors = getRoleColor(role.name);
                                                            return (
                                                                <td key={role.name} className="p-0 text-center border-r border-slate-100 last:border-r-0 h-10 w-12 group-hover:bg-white/40 transition-colors">
                                                                    {hasRole ? (
                                                                        <div className="flex items-center justify-center w-full h-full">
                                                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${colors.bg} ${colors.text} shadow-sm border ${colors.border} transform group-hover:scale-110 transition-transform`}>
                                                                                <Check size={14} strokeWidth={4} />
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="w-1 h-1 bg-slate-200 rounded-full mx-auto opacity-30"></div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'bold' && (
                            <div 
                                className="absolute inset-0 p-6 text-sm font-mono text-slate-800 bg-transparent border-0 focus:ring-0 resize-none leading-relaxed outline-none whitespace-pre-wrap break-words overflow-auto custom-scrollbar"
                                dangerouslySetInnerHTML={{ __html: getHighlightedBoldOutput(boldOutput) || '<span class="text-slate-400">Formatted output will appear here...</span>' }}
                            />
                        )}
                        
                        {activeTab === 'roles' && (
                            <div className="absolute inset-0 p-4 sm:p-6 overflow-auto custom-scrollbar space-y-4">
                                {parsedAuthors.length > 0 ? (
                                    parsedAuthors.map((author, idx) => {
                                        const validRoles = author.roles.filter(r => !r.isDuplicate && !r.isUnknown && CREDIT_DB.some(dbR => dbR.name === r.normalized));
                                        let xmlBlock = '';
                                        if (validRoles.length > 0) {
                                            validRoles.forEach(r => {
                                                const dbRole = CREDIT_DB.find(dbR => dbR.name === r.normalized);
                                                if (dbRole) {
                                                    xmlBlock += `<ce:contributor-role role="${dbRole.url}">${r.normalized}</ce:contributor-role>\n`;
                                                }
                                            });
                                        } else {
                                            xmlBlock += `<!-- No valid CRediT roles found -->\n`;
                                        }

                                        return (
                                            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700 flex items-center justify-center font-mono text-xs font-bold shadow-inner">
                                                            {author.name.charAt(0)}
                                                        </div>
                                                        <span className="font-bold text-slate-800 text-sm">{author.name}</span>
                                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                            {validRoles.length} CRediT {validRoles.length === 1 ? 'role' : 'roles'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => copyAuthorRoles(author)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                                                                copiedState?.id === author.name && copiedState?.type === 'roles'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                                            }`}
                                                            title={`Copy roles for ${author.name}`}
                                                        >
                                                            {copiedState?.id === author.name && copiedState?.type === 'roles' ? (
                                                                <>
                                                                    <Check size={13} className="text-emerald-600" />
                                                                    <span>Copied Roles!</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Clipboard size={13} />
                                                                    <span>Copy Roles</span>
                                                                </>
                                                            )}
                                                        </button>
                                                        <button 
                                                            onClick={() => copyAuthorXml(author)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                                                                copiedState?.id === author.name && copiedState?.type === 'xml'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                                                            }`}
                                                            title={`Copy XML tags for ${author.name}`}
                                                        >
                                                            {copiedState?.id === author.name && copiedState?.type === 'xml' ? (
                                                                <>
                                                                    <Check size={13} className="text-emerald-600" />
                                                                    <span>Copied XML!</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Clipboard size={13} />
                                                                    <span>Copy Author XML</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div 
                                                    className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap break-words overflow-x-auto selection:bg-purple-500 selection:text-white"
                                                    dangerouslySetInnerHTML={{ __html: getHighlightedXmlOutput(xmlBlock) }}
                                                />
                                            </div>
                                        );
                                    })
                                ) : rolesOutput ? (
                                    <div 
                                        className="p-6 text-sm font-mono text-slate-800 leading-relaxed whitespace-pre-wrap break-words bg-white border border-slate-200 rounded-xl shadow-sm"
                                        dangerouslySetInnerHTML={{ __html: getHighlightedXmlOutput(rolesOutput) }}
                                    />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 pt-20">
                                        <p>XML roles will appear here...</p>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {activeTab === 'report' && (
                            <div className="absolute inset-0 flex flex-col overflow-hidden">
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
                                    <div className="overflow-auto custom-scrollbar h-full">
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

            <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
                <button 
                    id="generate-btn"
                    onClick={generate} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all active:scale-95 flex items-center gap-2 ${isLoading ? 'opacity-80 cursor-wait' : 'hover:-translate-y-0.5'}`}
                >
                    {isLoading ? 'Processing...' : 'Analyze & Generate'}
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default CreditGenerator;
