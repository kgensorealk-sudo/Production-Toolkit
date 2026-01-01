
import React, { useState, useEffect } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ParsedRef {
    authors: { surname: string; initials: string }[];
    year: string;
    title: string;
    editors: { surname: string; initials: string }[];
    source: string; // Journal or Book title (or Publisher string temp)
    series?: string; 
    volume: string;
    issue: string;
    fpage: string;
    lpage: string;
    totalPages?: string; // For books (e.g. 662)
    publisher?: string;
    location?: string;
    comment?: string;
    isChapter: boolean;
    isBook: boolean; // For Monographs
    originalText: string;
}

const ReferenceGenerator: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [parsedRefs, setParsedRefs] = useState<ParsedRef[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // View State
    const [activeTab, setActiveTab] = useState<'xml' | 'report'>('xml');
    
    // Options
    const [citationStyle, setCitationStyle] = useState<'numbered' | 'name-date'>('name-date');
    const [startId, setStartId] = useState<number>(3000);

    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const escapeXml = (unsafe: string) => {
        if (!unsafe) return '';
        return unsafe.replace(/&/g, '&amp;')
                     .replace(/</g, '&lt;')
                     .replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;')
                     .replace(/'/g, '&apos;');
    };

    const formatId = (prefix: string, num: number) => {
        return `${prefix}${String(num).padStart(4, '0')}`;
    };

    // --- Parsing Logic ---
    const parseAuthors = (authorString: string) => {
        const authors: { surname: string; initials: string }[] = [];
        
        // Pattern A: "Surname, I." (Standard Elsevier/Harvard)
        const surnameFirstPattern = /[^,]+,\s+[A-Z]\.(?:[A-Z]\.)?/g;
        const surnameFirstTokens = authorString.match(surnameFirstPattern);

        // Pattern B: "I. Surname" (IEEE/Vancouver)
        // Looks for: Initial(s) with dots, space, Name (e.g. "X. Shi" or "W. Dai")
        // Also handles "X.-Y. Shi" or similar
        const initialFirstPattern = /(?:[A-Z]\.-?)?(?:[A-Z]\.\s?)+[\w-]+/g;
        const initialFirstTokens = authorString.match(initialFirstPattern);

        // Decide which pattern to use based on which matches more of the string
        // Heuristic: If we find clear "Surname, I." matches, use that.
        // Otherwise, if we find "I. Surname" matches, use that.
        
        const useSurnameFirst = (surnameFirstTokens?.length || 0) >= (initialFirstTokens?.length || 0);
        
        if (useSurnameFirst && surnameFirstTokens && surnameFirstTokens.length > 0) {
            surnameFirstTokens.forEach(token => {
                const clean = token.trim();
                const commaIdx = clean.lastIndexOf(',');
                if (commaIdx > -1) {
                    const surname = clean.substring(0, commaIdx).trim();
                    let initials = clean.substring(commaIdx + 1).trim();
                    if (initials && !initials.endsWith('.')) initials += '.';
                    authors.push({ surname, initials });
                } else {
                    authors.push({ surname: clean, initials: '' });
                }
            });
        } else if (initialFirstTokens && initialFirstTokens.length > 0) {
            // Parse "X. Shi" or "W. Dai"
            initialFirstTokens.forEach(token => {
                let clean = token.trim();
                // Strip leading "and " if it got caught (though regex shouldn't)
                clean = clean.replace(/^and\s+/i, '');

                const lastSpace = clean.lastIndexOf(' ');
                if (lastSpace > -1) {
                    let initials = clean.substring(0, lastSpace).trim();
                    const surname = clean.substring(lastSpace + 1).trim();
                    if (initials && !initials.endsWith('.')) initials += '.';
                    authors.push({ surname, initials });
                } else {
                    authors.push({ surname: clean, initials: '' });
                }
            });
        } else {
            // Fallback: Organization or Collaboration
            // Split by semicolon if present, otherwise treat as one block
            const parts = authorString.includes(';') ? authorString.split(';') : [authorString];
            parts.forEach(p => {
                if (p.trim()) authors.push({ surname: p.trim(), initials: '' });
            });
        }
        return authors;
    };

    const parseSingleCitation = (text: string): ParsedRef => {
        let cleanText = text.trim();
        const res: ParsedRef = {
            authors: [], year: '', title: '', editors: [], source: '', 
            volume: '', issue: '', fpage: '', lpage: '', 
            isChapter: false, isBook: false,
            originalText: text.trim()
        };

        // 0. Extract Comment (at the end in parens, e.g. (in Chinese...))
        const commentMatch = cleanText.match(/\((in [^)]+)\)\.?$/i);
        if (commentMatch) {
            res.comment = commentMatch[0];
            cleanText = cleanText.replace(commentMatch[0], '').trim();
            // Remove trailing dot if left behind
            if (cleanText.endsWith('.')) cleanText = cleanText.slice(0, -1).trim();
        }

        // 1. Find Year
        const yearMatch = cleanText.match(/\(?(\d{4})\)?/);
        
        if (yearMatch) {
            res.year = yearMatch[1];
            const yearIndex = cleanText.indexOf(yearMatch[0]);
            
            // Heuristic: If year is late in the string (>50% length), assume Vancouver/IEEE style (Year at end)
            if (yearIndex > cleanText.length * 0.5) {
                // --- STRATEGY: VANCOUVER / IEEE (Year at end) ---
                // Format: [Authors], [Title]. [Journal] [Vol] ([Year]), [Pages].

                // 1. Post-Year: Pages/ID
                let postYear = cleanText.substring(yearIndex + yearMatch[0].length).trim();
                
                // Clean leading punctuation (e.g., if format is (2025), e11696)
                if (postYear.startsWith(',') || postYear.startsWith('.')) {
                    postYear = postYear.substring(1).trim();
                }

                // Check for Pages/Article ID in postYear (e.g. "e11696." or "45-50.")
                const pageMatch = postYear.match(/([e0-9]+(?:[–-][0-9]+)?)\.?$/);
                if (pageMatch) {
                    const pages = pageMatch[1];
                    if (pages.includes('–') || pages.includes('-')) {
                        const [f, l] = pages.split(/[–-]/);
                        res.fpage = f;
                        res.lpage = l;
                    } else {
                        res.fpage = pages; // Article ID often treated as first page
                    }
                }

                // 2. Pre-Year: [Authors], [Title]. [Journal] [Vol]
                let preYear = cleanText.substring(0, yearIndex).trim();
                
                // Extract Volume (number at end of preYear)
                const volMatch = preYear.match(/\s(\d+)\s*$/);
                if (volMatch) {
                    res.volume = volMatch[1];
                    preYear = preYear.substring(0, volMatch.index).trim();
                }

                // Extract Journal and Title
                // Strategy: 
                // 1. Isolate Authors from Rest (Comma separation logic)
                // 2. Isolate Title from Journal (Right-to-Left dot separation logic)

                const segments = preYear.split(',').map(s => s.trim());
                let titleStartIndex = -1;

                // Find where Authors end and Title begins
                for (let i = 0; i < segments.length; i++) {
                        let seg = segments[i];
                        seg = seg.replace(/^and\s+/i, '');
                        
                        // Check if this segment looks like a name part (X. Shi)
                        const hasInitial = /[A-Z]\./.test(seg);
                        const isShort = seg.length < 35;
                        
                        // If it's long, or lacks an initial (and isn't the first segment), it's likely title start
                        if (!isShort || (!hasInitial && i > 0)) {
                            titleStartIndex = i;
                            break;
                        }
                }
                
                if (titleStartIndex > -1) {
                    const authorString = segments.slice(0, titleStartIndex).join(', ');
                    const titleJournalString = segments.slice(titleStartIndex).join(', ');
                    
                    res.authors = parseAuthors(authorString);
                    
                    // Split Title vs Journal using Right-to-Left analysis
                    // "Title. Adv. Funct. Mater." -> We assume Journal is at the end.
                    const tjParts = titleJournalString.split('. ');
                    
                    if (tjParts.length > 1) {
                        let journalStartIdx = tjParts.length - 1;
                        
                        // Work backwards to find where Journal starts
                        // Stop if we hit a segment that looks like a Title (Long, or starts lowercase)
                        for (let k = tjParts.length - 1; k > 0; k--) {
                            const seg = tjParts[k];
                            // Heuristics:
                            // Journal parts usually short (< 45 chars) or Abbreviated/TitleCased.
                            // Title segments are usually longer sentences.
                            
                            const isLong = seg.length > 45; 
                            const startsLower = /^[a-z]/.test(seg); 
                            
                            if (isLong || startsLower) {
                                // This segment is part of Title. Next one is Journal start.
                                journalStartIdx = k + 1;
                                break;
                            }
                            
                            // Continue leftwards to capture multi-part journals
                            journalStartIdx = k;
                        }
                        
                        // Safety: Force at least index 1 if possible (assuming index 0 is always Title)
                        if (journalStartIdx === 0 && tjParts.length > 1) journalStartIdx = 1;

                        res.title = tjParts.slice(0, journalStartIdx).join('. ').replace(/\.$/, '');
                        res.source = tjParts.slice(journalStartIdx).join('. ');
                    } else {
                         // No dots? Assume whole thing is Title (fallback)
                         res.title = titleJournalString;
                    }
                } else {
                    // Fallback: If logic failed, try simple dot split
                    const firstDot = preYear.indexOf('. ');
                    if (firstDot > -1) {
                            res.authors = parseAuthors(preYear.substring(0, firstDot));
                            res.title = preYear.substring(firstDot + 1).replace(/\.$/, '');
                    } else {
                            res.authors = parseAuthors(preYear);
                    }
                }

            } else {
                // --- STRATEGY: HARVARD / STANDARD (Year near start) ---
                // Format: [Authors] ([Year]) [Title]. [Source]
                
                const authorPart = cleanText.substring(0, yearIndex).trim().replace(/,$/, '');
                res.authors = parseAuthors(authorPart);
                
                let rest = cleanText.substring(yearIndex + yearMatch[0].length).trim();
                // Clean leading punctuation like ")." or "."
                rest = rest.replace(/^[).,;:\s]+/, '');

                // Extract Pages (End)
                const pageMatch = rest.match(/(?:pp\.?|:)?\s*(\d+)[–-](\d+)\.?$/);
                if (pageMatch) {
                    res.fpage = pageMatch[1];
                    res.lpage = pageMatch[2];
                    rest = rest.substring(0, pageMatch.index).trim().replace(/,$/, '');
                } else {
                    // Check for single page/ID
                    const singlePage = rest.match(/,\s*([e0-9]+)\.?$/);
                    if (singlePage) {
                        res.fpage = singlePage[1];
                        rest = rest.substring(0, singlePage.index).trim();
                    }
                }

                // Extract Volume
                const volMatch = rest.match(/(?:vol\.?\s*|)(\d+)(?:\((\d+)\))?/i);
                if (volMatch && !res.isBook) {
                    if (rest.endsWith(volMatch[0])) {
                        res.volume = volMatch[1];
                        if (volMatch[2]) res.issue = volMatch[2];
                        rest = rest.substring(0, volMatch.index).trim().replace(/,$/, '');
                    }
                }

                // Split Title and Source
                // Standard: Title. Source.
                const splitDot = rest.indexOf('. ');
                if (splitDot > -1) {
                    res.title = rest.substring(0, splitDot).trim();
                    res.source = rest.substring(splitDot + 1).trim();
                } else {
                    res.source = rest; 
                }
            }
        } else {
            // No year found? Treat entire string as Source or Title
            res.title = cleanText;
        }

        // 2. Check for "In: ... (Eds)" -> Chapter (Common across styles)
        const inMatch = text.match(/In:\s*(.*?)\s*\((Eds?\.?)\),?/i);
        if (inMatch) {
            res.isChapter = true;
            // Often "In:" comes after Title in Harvard
            // Re-evaluate title/source split if we found "In:"
        }

        return res;
    };

    const generateLabel = (ref: ParsedRef, idx: number) => {
        if (citationStyle === 'numbered') {
            return `[${idx + 1}]`;
        }

        // Name-Date Style
        if (ref.authors.length === 0) {
            return ref.year ? `${ref.year}` : `[${idx + 1}]`;
        }

        const surnames = ref.authors.map(a => a.surname);
        let namePart = '';

        if (surnames.length === 1) {
            namePart = surnames[0];
        } else if (surnames.length === 2) {
            namePart = `${surnames[0]} and ${surnames[1]}`;
        } else {
            namePart = `${surnames[0]} et al.`;
        }

        return `${namePart}, ${ref.year}`;
    };

    const buildXml = (refs: ParsedRef[], startIdNum: number): string => {
        const refStrings = refs.map((ref, idx) => {
            const currentNum = startIdNum + (idx * 5); 
            
            const bibId = formatId('bb', currentNum);
            const refId = formatId('rf', currentNum);
            const srcId = formatId('se', currentNum);

            const originalTextXml = escapeXml(ref.originalText);
            const labelText = generateLabel(ref, idx);

            // Authors
            let authorsXml = '';
            ref.authors.forEach(a => {
                if (a.initials) {
                    authorsXml += `<sb:author><ce:given-name>${escapeXml(a.initials)}</ce:given-name><ce:surname>${escapeXml(a.surname)}</ce:surname></sb:author>`;
                } else {
                    // Organization / Collaboration (No initials)
                    authorsXml += `<sb:collaboration>${escapeXml(a.surname)}</sb:collaboration>`;
                }
            });

            // Editors
            let editorsXml = '';
            if (ref.editors.length > 0) {
                ref.editors.forEach(e => {
                    editorsXml += `<sb:editor><ce:given-name>${escapeXml(e.initials)}</ce:given-name><ce:surname>${escapeXml(e.surname)}</ce:surname></sb:editor>`;
                });
                editorsXml = `<sb:editors>${editorsXml}</sb:editors>`;
            }

            // Titles
            const contributionTitle = `<sb:title><sb:maintitle>${escapeXml(ref.title)}</sb:maintitle></sb:title>`;

            // Host Block
            let hostXml = '';
            const lastPageXml = ref.lpage ? `<sb:last-page>${escapeXml(ref.lpage)}</sb:last-page>` : '';
            
            if (ref.isChapter) {
                // Book Chapter
                const sourceTitle = `<sb:title><sb:maintitle>${escapeXml(ref.source)}</sb:maintitle></sb:title>`;
                const bookSeriesXml = (ref.series || ref.volume) 
                    ? `<sb:book-series><sb:series><sb:title><sb:maintitle>${escapeXml(ref.series || ref.source)}</sb:maintitle></sb:title>${ref.volume ? `<sb:volume-nr>${escapeXml(ref.volume)}</sb:volume-nr>` : ''}</sb:series></sb:book-series>`
                    : '';

                hostXml = `<sb:host><sb:edited-book>${editorsXml}${sourceTitle}${bookSeriesXml}<sb:date>${escapeXml(ref.year)}</sb:date></sb:edited-book><sb:pages><sb:first-page>${escapeXml(ref.fpage)}</sb:first-page>${lastPageXml}</sb:pages></sb:host>`;
            } else if (ref.isBook) {
                // Monograph / Whole Book
                hostXml = `<sb:host><sb:book><sb:date>${escapeXml(ref.year)}</sb:date><sb:publisher><sb:name>${escapeXml(ref.publisher || '')}</sb:name><sb:location>${escapeXml(ref.location || '')}</sb:location></sb:publisher></sb:book><sb:pages><sb:first-page>${escapeXml(ref.totalPages || '')}</sb:first-page></sb:pages></sb:host>`;
            } else {
                // Journal Article
                const sourceTitle = `<sb:title><sb:maintitle>${escapeXml(ref.source)}</sb:maintitle></sb:title>`;
                hostXml = `<sb:host><sb:issue><sb:series>${sourceTitle}<sb:volume-nr>${escapeXml(ref.volume)}</sb:volume-nr></sb:series>${ref.issue ? `<sb:issue-nr>${escapeXml(ref.issue)}</sb:issue-nr>` : ''}<sb:date>${escapeXml(ref.year)}</sb:date></sb:issue><sb:pages><sb:first-page>${escapeXml(ref.fpage)}</sb:first-page>${lastPageXml}</sb:pages></sb:host>`;
            }

            const commentXml = ref.comment ? `<sb:comment>${escapeXml(ref.comment)}</sb:comment>` : '';

            // Always Linearized
            return `<ce:bib-reference id="${bibId}"><ce:label>${labelText}</ce:label><sb:reference id="${refId}"><sb:contribution langtype="en"><sb:authors>${authorsXml}</sb:authors>${contributionTitle}</sb:contribution>${hostXml}${commentXml}</sb:reference><ce:source-text id="${srcId}">${originalTextXml}</ce:source-text></ce:bib-reference>`;
        });
        
        return refStrings.join('\n');
    };

    const processReferences = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste references first.", type: "warn" });
            return;
        }

        setIsLoading(true);

        setTimeout(() => {
            // Split input by newlines to handle multiple references
            const lines = input.split(/\n+/).filter(l => l.trim().length > 10);
            
            const parsed = lines.map(line => parseSingleCitation(line));
            const xmlOutput = buildXml(parsed, startId);

            setParsedRefs(parsed);
            setOutput(xmlOutput);
            setToast({ msg: `Generated ${lines.length} references.`, type: "success" });
            setIsLoading(false);
        }, 800);
    };

    const downloadCSV = () => {
        if (parsedRefs.length === 0) return;
        const headers = ['ID', 'Type', 'Authors', 'Year', 'Title', 'Source', 'Volume', 'Issue', 'Pages', 'Original Text'];
        const rows = parsedRefs.map((ref, idx) => [
            generateLabel(ref, idx),
            ref.isChapter ? 'Book Chapter' : (ref.isBook ? 'Monograph' : 'Journal Article'),
            ref.authors.map(a => `${a.surname}, ${a.initials}`).join('; '),
            ref.year,
            ref.title,
            ref.source || ref.publisher,
            ref.volume,
            ref.issue,
            ref.isBook ? ref.totalPages : `${ref.fpage}-${ref.lpage}`,
            ref.originalText.replace(/"/g, '""')
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'reference_report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- State Update Handlers (for Editing) ---

    const regenerateXmlFromState = () => {
        setIsLoading(true);
        setTimeout(() => {
            const xmlOutput = buildXml(parsedRefs, startId);
            setOutput(xmlOutput);
            setToast({ msg: "XML Regenerated from Report edits!", type: "success" });
            setActiveTab('xml');
            setIsLoading(false);
        }, 500);
    };

    const handleRefChange = (index: number, field: keyof ParsedRef, value: any) => {
        const newRefs = [...parsedRefs];
        newRefs[index] = { ...newRefs[index], [field]: value };
        setParsedRefs(newRefs);
    };

    const handleTypeChange = (index: number, type: 'journal' | 'chapter' | 'book') => {
        const newRefs = [...parsedRefs];
        const ref = newRefs[index];
        ref.isChapter = type === 'chapter';
        ref.isBook = type === 'book';
        setParsedRefs(newRefs);
    };

    // Special handler for authors: converts text "Smith, J.; Doe, A." -> Array
    const handleAuthorsChange = (index: number, value: string) => {
        const parts = value.split(';');
        const newAuthors = parts.map(p => {
            const clean = p.trim();
            const comma = clean.lastIndexOf(','); 
            if (comma > -1) {
                const surname = clean.substring(0, comma).trim();
                let initials = clean.substring(comma + 1).trim();
                if (initials && !initials.endsWith('.')) initials += '.';
                return { surname, initials };
            }
            return { surname: clean, initials: '' };
        }).filter(a => a.surname);
        
        const newRefs = [...parsedRefs];
        newRefs[index].authors = newAuthors;
        setParsedRefs(newRefs);
    };

    // Special handler for editors: converts text "Smith, J.; Doe, A." -> Array
    const handleEditorsChange = (index: number, value: string) => {
        const parts = value.split(';');
        const newEditors = parts.map(p => {
            const clean = p.trim();
            const comma = clean.lastIndexOf(','); 
            if (comma > -1) {
                const surname = clean.substring(0, comma).trim();
                let initials = clean.substring(comma + 1).trim();
                if (initials && !initials.endsWith('.')) initials += '.';
                return { surname, initials };
            }
            return { surname: clean, initials: '' };
        }).filter(a => a.surname);
        
        const newRefs = [...parsedRefs];
        newRefs[index].editors = newEditors;
        setParsedRefs(newRefs);
    };

    // Regenerate when toggling options if output already exists (and user hasn't edited manually yet? Actually just regen based on current state)
    useEffect(() => {
        if (parsedRefs.length > 0 && output) {
            const xmlOutput = buildXml(parsedRefs, startId);
            setOutput(xmlOutput);
        }
    }, [startId, citationStyle]);

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "XML Copied!", type: "success" }));
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setParsedRefs([]);
        setToast({ msg: "Cleared.", type: "warn" });
    };

    useKeyboardShortcuts({
        onPrimary: processReferences,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, startId, citationStyle]);

    const stats = {
        total: parsedRefs.length,
        journals: parsedRefs.filter(r => !r.isChapter && !r.isBook).length,
        chapters: parsedRefs.filter(r => r.isChapter).length,
        books: parsedRefs.filter(r => r.isBook).length,
        missingData: parsedRefs.filter(r => !r.title || !r.year || r.authors.length === 0).length
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Structured Reference Generator</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Convert plain text citations into structured NISO/Elsevier XML format.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                {/* Input */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-sky-100 transition-all duration-300">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-sky-600 font-mono shadow-sm">1</span>
                            Raw Citations
                        </label>
                        <button onClick={clearAll} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder={`Paste one citation per line.\nExample:\nBabedi, L., 2022. Trace elements in pyrite. In: Reich, M. (Eds.), Pyrite: A Special Issue. Geol. Soc. Lond. Spec. Publ. vol. 516, 47–78.`}
                        spellCheck={false}
                    />
                </div>

                {/* Output */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">2</span>
                            Result
                        </label>
                        
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 border border-slate-200">
                                <button
                                    onClick={() => setCitationStyle('name-date')}
                                    className={`px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors ${citationStyle === 'name-date' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Name-Date
                                </button>
                                <button
                                    onClick={() => setCitationStyle('numbered')}
                                    className={`px-2 py-1 text-[10px] font-bold uppercase rounded transition-colors ${citationStyle === 'numbered' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    [1]
                                </button>
                            </div>

                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1 border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400">ID:</span>
                                <input 
                                    type="number" 
                                    value={startId} 
                                    onChange={(e) => setStartId(parseInt(e.target.value) || 5)} 
                                    className="w-12 bg-transparent text-xs font-mono font-bold text-slate-700 outline-none text-right"
                                />
                            </div>
                            
                            {output && activeTab === 'xml' && (
                                <button onClick={copyOutput} className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded border border-transparent hover:border-emerald-100 transition-colors flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            )}
                            
                             {parsedRefs.length > 0 && activeTab === 'report' && (
                                <div className="flex gap-2">
                                    <button onClick={downloadCSV} className="text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded border border-slate-200 transition-colors flex items-center gap-1 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Export CSV
                                    </button>
                                    <button onClick={regenerateXmlFromState} className="text-xs font-bold text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded border border-sky-100 hover:border-sky-200 transition-colors flex items-center gap-1 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                                        Regenerate
                                    </button>
                                </div>
                             )}
                        </div>
                    </div>
                    
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
                            Edit / Report
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col">
                        {isLoading && <LoadingOverlay message="Processing..." color="blue" />}
                        
                        {activeTab === 'xml' && (
                            <textarea 
                                value={output}
                                readOnly
                                className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed" 
                                placeholder="Generated XML will appear here..."
                            />
                        )}

                        {activeTab === 'report' && (
                            <div className="h-full flex flex-col">
                                {parsedRefs.length > 0 && (
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Total: <b>{stats.total}</b></div>
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400"></span> Journals: <b>{stats.journals}</b></div>
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Chapters: <b>{stats.chapters}</b></div>
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400"></span> Books: <b>{stats.books}</b></div>
                                        {stats.missingData > 0 && (
                                            <div className="flex items-center gap-1.5 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Incomplete: <b>{stats.missingData}</b></div>
                                        )}
                                    </div>
                                )}
                                <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4">
                                    {parsedRefs.length > 0 ? (
                                        parsedRefs.map((ref, i) => (
                                            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group-focus-within:ring-2 ring-sky-100">
                                                {/* Header Strip */}
                                                <div className="bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-1 rounded border border-sky-100">
                                                            {generateLabel(ref, i)}
                                                        </span>
                                                        <select 
                                                            value={ref.isBook ? 'book' : (ref.isChapter ? 'chapter' : 'journal')} 
                                                            onChange={(e) => handleTypeChange(i, e.target.value as any)}
                                                            className="text-[10px] uppercase font-bold px-1 py-0.5 rounded border bg-white outline-none cursor-pointer hover:border-slate-300 focus:border-sky-300 text-slate-600"
                                                        >
                                                            <option value="journal">Journal Article</option>
                                                            <option value="chapter">Book Chapter</option>
                                                            <option value="book">Monograph (Book)</option>
                                                        </select>
                                                    </div>
                                                    {/* Parsing Quality Indicator */}
                                                    <div className="flex gap-2">
                                                        {!ref.title && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">No Title</span>}
                                                        {ref.authors.length === 0 && <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">No Authors</span>}
                                                        {!ref.year && <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px] font-bold">No Year</span>}
                                                        {ref.title && ref.authors.length > 0 && ref.year && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">Valid</span>}
                                                    </div>
                                                </div>
                                                
                                                <div className="p-4 space-y-3">
                                                    {/* Title Section */}
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Title</label>
                                                        <textarea 
                                                            value={ref.title}
                                                            onChange={(e) => handleRefChange(i, 'title', e.target.value)}
                                                            className="w-full text-sm font-semibold text-slate-800 leading-snug border-0 border-b border-dashed border-slate-300 focus:border-sky-500 focus:ring-0 px-0 py-1 bg-transparent resize-y min-h-[2.5rem]"
                                                            placeholder="Enter title..."
                                                        />
                                                    </div>

                                                    {/* Metadata Grid */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                                        
                                                        {/* Authors */}
                                                        <div className="sm:col-span-2">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Authors (Separated by semicolon)</label>
                                                            <textarea 
                                                                value={ref.authors.map(a => a.initials ? `${a.surname}, ${a.initials}` : a.surname).join('; ')}
                                                                onChange={(e) => handleAuthorsChange(i, e.target.value)}
                                                                className="w-full text-sm text-slate-600 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-sky-200 focus:border-sky-400 outline-none"
                                                                rows={2}
                                                                placeholder="Surname, I.; Surname, I. (or Organization Name)"
                                                            />
                                                        </div>

                                                        {/* Source Info - Dynamic based on type */}
                                                        {ref.isBook ? (
                                                            <>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Publisher</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={ref.publisher || ''} 
                                                                        onChange={(e) => handleRefChange(i, 'publisher', e.target.value)}
                                                                        className="w-full text-sm font-medium text-slate-700 border-0 border-b border-dashed border-slate-300 focus:border-sky-500 focus:ring-0 px-0 py-1 bg-transparent"
                                                                        placeholder="e.g. Elsevier"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Location</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={ref.location || ''} 
                                                                        onChange={(e) => handleRefChange(i, 'location', e.target.value)}
                                                                        className="w-full text-sm font-medium text-slate-700 border-0 border-b border-dashed border-slate-300 focus:border-sky-500 focus:ring-0 px-0 py-1 bg-transparent"
                                                                        placeholder="e.g. Amsterdam"
                                                                    />
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="sm:col-span-1">
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Source / Journal</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={ref.source} 
                                                                    onChange={(e) => handleRefChange(i, 'source', e.target.value)}
                                                                    className="w-full text-sm font-medium text-slate-700 border-0 border-b border-dashed border-slate-300 focus:border-sky-500 focus:ring-0 px-0 py-1 bg-transparent"
                                                                />
                                                            </div>
                                                        )}

                                                        {/* Year & Vol/Pages */}
                                                        <div className={ref.isBook ? "sm:col-span-2" : "sm:col-span-1"}>
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Details</label>
                                                            <div className="flex items-center gap-2">
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Year"
                                                                    value={ref.year}
                                                                    onChange={(e) => handleRefChange(i, 'year', e.target.value)}
                                                                    className="w-12 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                />
                                                                
                                                                {!ref.isBook && (
                                                                    <>
                                                                        <input 
                                                                            type="text" 
                                                                            placeholder="Vol"
                                                                            value={ref.volume}
                                                                            onChange={(e) => handleRefChange(i, 'volume', e.target.value)}
                                                                            className="w-12 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                        />
                                                                        <input 
                                                                            type="text" 
                                                                            placeholder="Iss"
                                                                            value={ref.issue}
                                                                            onChange={(e) => handleRefChange(i, 'issue', e.target.value)}
                                                                            className="w-10 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                        />
                                                                        <div className="flex items-center text-slate-400 text-xs">
                                                                            pp. 
                                                                            <input 
                                                                                type="text" 
                                                                                value={ref.fpage}
                                                                                onChange={(e) => handleRefChange(i, 'fpage', e.target.value)}
                                                                                className="w-10 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 ml-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                            />
                                                                            -
                                                                            <input 
                                                                                type="text" 
                                                                                value={ref.lpage}
                                                                                onChange={(e) => handleRefChange(i, 'lpage', e.target.value)}
                                                                                className="w-10 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 ml-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}

                                                                {ref.isBook && (
                                                                    <div className="flex items-center text-slate-400 text-xs">
                                                                        Total Pages:
                                                                        <input 
                                                                            type="text" 
                                                                            value={ref.totalPages || ''}
                                                                            onChange={(e) => handleRefChange(i, 'totalPages', e.target.value)}
                                                                            className="w-16 text-center text-sm bg-slate-50 border border-slate-200 rounded py-1 ml-1 focus:ring-1 focus:border-sky-400 outline-none"
                                                                            placeholder="e.g. 662"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Extra Chapter Info */}
                                                        {ref.isChapter && (
                                                            <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-purple-50/30 p-2 rounded border border-purple-50">
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">Editors (Surname, I.)</label>
                                                                    <textarea 
                                                                        value={ref.editors.map(e => `${e.surname}, ${e.initials}`).join('; ')}
                                                                        onChange={(e) => handleEditorsChange(i, e.target.value)}
                                                                        className="w-full text-xs text-slate-600 border border-purple-200 rounded p-1.5 focus:ring-1 focus:ring-purple-200 focus:border-purple-400 outline-none bg-white/50"
                                                                        rows={2}
                                                                        placeholder="Smith, J.; Doe, A."
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">Series</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={ref.series || ''} 
                                                                        onChange={(e) => handleRefChange(i, 'series', e.target.value)}
                                                                        className="w-full text-xs text-slate-700 border-0 border-b border-dashed border-purple-300 focus:border-purple-500 focus:ring-0 px-0 py-1 bg-transparent"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Comments Field */}
                                                        <div className="sm:col-span-2">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comment / Note</label>
                                                            <input 
                                                                type="text" 
                                                                value={ref.comment || ''} 
                                                                onChange={(e) => handleRefChange(i, 'comment', e.target.value)}
                                                                className="w-full text-xs text-slate-500 italic border-0 border-b border-dashed border-slate-300 focus:border-sky-500 focus:ring-0 px-0 py-1 bg-transparent"
                                                                placeholder="(in Chinese with English abstract)"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Comparison Toggle / View */}
                                                    <div className="pt-3 border-t border-slate-100">
                                                        <details className="group">
                                                            <summary className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-sky-600 transition-colors list-none">
                                                                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                                Original Text (Read-Only)
                                                            </summary>
                                                            <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono text-slate-500 leading-relaxed break-words">
                                                                {ref.originalText}
                                                            </div>
                                                        </details>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                            <p>Generate references to view capture report.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button 
                    onClick={processReferences} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className="group bg-sky-600 hover:bg-sky-700 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg shadow-sky-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait hover:-translate-y-0.5"
                >
                    Generate Reference XML
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceGenerator;
