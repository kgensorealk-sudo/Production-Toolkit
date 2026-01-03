
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ParsedRef {
    authors: { surname: string; initials: string; givenName?: string; isEllipsis?: boolean }[];
    year: string;
    title: string;
    editors: { surname: string; initials: string; givenName?: string }[];
    source: string;
    series?: string; 
    volume: string;
    issue: string;
    fpage: string;
    lpage: string;
    articleNumber?: string;
    doi?: string;
    totalPages?: string;
    publisher?: string;
    location?: string;
    comment?: string;
    isChapter: boolean;
    isBook: boolean;
    hasEtAl: boolean;
    originalText: string;
    genre?: string; 
    patentNumber?: string;
    assignee?: string;
    applicationNumber?: string;
    institution?: string;
    reportNumber?: string;
    degree?: string;
}

interface QcIssue {
    refIndex: number;
    type: 'error' | 'warning';
    field: string;
    message: string;
}

// --- Helpers ---
const JOURNAL_ABBREVIATIONS: Record<string, string> = {
    'Journal': 'J.', 'American': 'Am.', 'International': 'Int.', 'Review': 'Rev.',
    'Research': 'Res.', 'Science': 'Sci.', 'Physics': 'Phys.', 'Chemistry': 'Chem.',
    'Biology': 'Biol.', 'Medicine': 'Med.', 'Engineering': 'Eng.', 'Transactions': 'Trans.',
    'Proceedings': 'Proc.', 'Conference': 'Conf.', 'Letters': 'Lett.', 'Applications': 'Appl.',
    'Systems': 'Syst.', 'Society': 'Soc.', 'Association': 'Assoc.', 'European': 'Eur.',
    'Clinical': 'Clin.', 'Experimental': 'Exp.', 'Molecular': 'Mol.', 'Cellular': 'Cell.',
    'Genetics': 'Genet.', 'Biochemistry': 'Biochem.', 'Microbiology': 'Microbiol.',
    'Nature': 'Nat.', 'Plos': 'PLoS', 'Academy': 'Acad.', 'National': 'Natl.',
    'Psychology': 'Psychol.', 'Psychological': 'Psychol.', 'Education': 'Educ.',
    'Educational': 'Educ.', 'Learning': 'Learn.', 'Instruction': 'Instr.',
    'Developmental': 'Dev.', 'Quarterly': 'Q.', 'Applied': 'Appl.', 'Bulletin': 'Bull.',
    'Archives': 'Arch.', 'Annals': 'Ann.', 'Annual': 'Annu.', 'British': 'Br.',
    'Canadian': 'Can.', 'Chinese': 'Chin.', 'Japanese': 'Jpn.', 'Indian': 'Ind.',
    'Medical': 'Med.', 'Environmental': 'Environ.', 'Technology': 'Technol.'
};

const REVERSE_ABBREVIATIONS = Object.entries(JOURNAL_ABBREVIATIONS).reduce((acc, [key, val]) => {
    acc[val] = key;
    return acc;
}, {} as Record<string, string>);

const formatJournal = (name: string, mode: 'full' | 'abbrev'): string => {
    if (!name) return '';
    const words = name.split(' ');
    
    if (mode === 'abbrev') {
        return words.map(w => {
            const cleanW = w.replace(/[.,:;]$/, '');
            const punct = w.slice(cleanW.length);
            const replacement = JOURNAL_ABBREVIATIONS[cleanW];
            return replacement ? replacement + punct : w; 
        }).join(' ');
    } else {
        return words.map(w => {
            const cleanW = w.replace(/[.,:;]$/, '');
            const replacement = REVERSE_ABBREVIATIONS[w] || REVERSE_ABBREVIATIONS[w + '.'] || REVERSE_ABBREVIATIONS[cleanW + '.'];
            return replacement || w;
        }).join(' ');
    }
};

const expandPageRange = (start: string, end: string): string => {
    if (/^\d+$/.test(start) && /^\d+$/.test(end)) {
        const sVal = parseInt(start, 10);
        const eVal = parseInt(end, 10);
        if (eVal < sVal && end.length < start.length) {
            const prefix = start.substring(0, start.length - end.length);
            return prefix + end;
        }
    }
    return end;
};

const toTitleCase = (str: string) => {
    if (!str) return '';
    let workingStr = str;
    const isAllCaps = str === str.toUpperCase() && str.length > 4 && /[A-Z]/.test(str);
    if (isAllCaps) workingStr = str.toLowerCase();

    const smallWords = /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|vs?\.?|via)$/i;
    
    return workingStr.split(' ').map((word, index, parts) => {
        if (index > 0 && index < parts.length - 1 && smallWords.test(word) && word.charAt(0) !== word.charAt(0).toUpperCase()) {
            return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
};

const toSentenceCase = (str: string) => {
    if (!str) return '';
    let workingStr = str;
    if (workingStr === workingStr.toUpperCase() && /[A-Z]/.test(workingStr)) workingStr = workingStr.toLowerCase();

    const words = workingStr.split(' ');
    return words.map((w, i) => {
        const cleanW = w.replace(/^['"(]+/, '').replace(/['"),.:;?!]+$/, '');
        const isAcronym = /[A-Z].*[A-Z]/.test(cleanW) || (/^[A-Z0-9]+$/.test(cleanW) && cleanW.length > 1);
        if (isAcronym) return w;
        if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        const prev = words[i-1];
        if (prev && /[.?!:]$/.test(prev)) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        return w.toLowerCase();
    }).join(' ');
};

const cleanVal = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.toLowerCase() === 'null') return '';
    return str;
};

// --- Format Generators ---

const escapeBib = (str: string) => (str || '').replace(/([{}])/g, '\\$1');

const toBibTeX = (refs: ParsedRef[]): string => {
    if (refs.length === 0) return 'No references to export.';
    return refs.map((ref, idx) => {
        // Generate a citation key: Surname + Year + FirstWordOfTitle
        const firstAuthor = ref.authors.find(a => !a.isEllipsis);
        const surname = firstAuthor?.surname?.replace(/[^a-zA-Z]/g, '') || 'Unknown';
        const titleWord = ref.title.split(' ')[0]?.replace(/[^a-zA-Z]/g, '') || `Ref${idx+1}`;
        const id = `${surname}${ref.year}${titleWord}`;
        
        let type = 'article';
        if (ref.isBook) type = 'book';
        else if (ref.isChapter) type = 'incollection';
        else if (ref.genre?.toLowerCase().includes('thesis')) type = 'phdthesis';
        else if (ref.genre?.toLowerCase().includes('conference') || ref.source.toLowerCase().includes('proceeding')) type = 'inproceedings';
        else if (ref.genre?.toLowerCase().includes('report')) type = 'techreport';
        else if (ref.genre?.toLowerCase().includes('patent')) type = 'misc'; 

        let entry = `@${type}{${id},\n`;
        const authorStr = ref.authors.map(a => {
            if (a.isEllipsis) return 'others';
            if (a.givenName) return `${a.surname}, ${a.givenName}`;
            return `${a.surname}, ${a.initials}`;
        }).join(' and ');
        
        entry += `  author = {${authorStr}},\n`;
        entry += `  year = {${ref.year}},\n`;
        entry += `  title = {${escapeBib(ref.title)}},\n`;
        
        if (ref.source) entry += `  ${type === 'article' ? 'journal' : 'booktitle'} = {${escapeBib(ref.source)}},\n`;
        if (ref.volume) entry += `  volume = {${ref.volume}},\n`;
        if (ref.issue) entry += `  number = {${ref.issue}},\n`;
        if (ref.fpage) entry += `  pages = {${ref.fpage}${ref.lpage ? '--' + ref.lpage : ''}},\n`;
        if (ref.publisher) entry += `  publisher = {${escapeBib(ref.publisher)}},\n`;
        if (ref.location) entry += `  address = {${escapeBib(ref.location)}},\n`;
        if (ref.doi) entry += `  doi = {${ref.doi}},\n`;
        if (ref.patentNumber) entry += `  note = {Patent: ${ref.patentNumber}},\n`;
        if (ref.reportNumber) entry += `  number = {${ref.reportNumber}},\n`;
        if (ref.institution) entry += `  institution = {${escapeBib(ref.institution)}},\n`;
        if (ref.assignee) entry += `  note = {Assignee: ${escapeBib(ref.assignee)}},\n`;
        
        entry += `}`;
        return entry;
    }).join('\n\n');
};

const toRIS = (refs: ParsedRef[]): string => {
    if (refs.length === 0) return 'No references to export.';
    return refs.map(ref => {
        let type = 'JOUR';
        if (ref.isBook) type = 'BOOK';
        else if (ref.isChapter) type = 'CHAP';
        else if (ref.genre?.toLowerCase().includes('thesis')) type = 'THES';
        else if (ref.genre?.toLowerCase().includes('conference')) type = 'CONF';
        else if (ref.genre?.toLowerCase().includes('patent')) type = 'PAT';
        else if (ref.genre?.toLowerCase().includes('report')) type = 'RPRT';
        
        let entry = `TY  - ${type}\n`;
        ref.authors.forEach(a => {
            if (a.isEllipsis) entry += `AU  - ...\n`;
            else if (a.givenName) entry += `AU  - ${a.surname}, ${a.givenName}\n`;
            else entry += `AU  - ${a.surname}, ${a.initials}\n`;
        });
        entry += `PY  - ${ref.year}\n`;
        entry += `TI  - ${ref.title}\n`;
        if (ref.source) entry += `${type === 'JOUR' ? 'JO' : 'T2'}  - ${ref.source}\n`;
        if (ref.volume) entry += `VL  - ${ref.volume}\n`;
        if (ref.issue) entry += `IS  - ${ref.issue}\n`;
        if (ref.fpage) entry += `SP  - ${ref.fpage}\n`;
        if (ref.lpage) entry += `EP  - ${ref.lpage}\n`;
        if (ref.publisher) entry += `PB  - ${ref.publisher}\n`;
        if (ref.location) entry += `CY  - ${ref.location}\n`;
        if (ref.doi) entry += `DO  - ${ref.doi}\n`;
        if (ref.patentNumber) entry += `M1  - ${ref.patentNumber}\n`;
        if (ref.assignee) entry += `A2  - ${ref.assignee}\n`;
        if (ref.reportNumber) entry += `SN  - ${ref.reportNumber}\n`;
        if (ref.institution) entry += `PB  - ${ref.institution}\n`;
        
        entry += `ER  - `;
        return entry;
    }).join('\n\n');
};

// --- Components ---

const RibbonButton: React.FC<{ 
    onClick: () => void; 
    icon: React.ReactNode; 
    label: string; 
    disabled?: boolean;
    active?: boolean;
}> = ({ onClick, icon, label, disabled, active }) => (
    <button 
        onClick={onClick} 
        disabled={disabled}
        className={`flex flex-col items-center justify-center p-2 min-w-[70px] rounded-lg transition-all text-xs font-medium gap-1.5
            ${active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
        `}
    >
        <div className={`p-2 rounded-md ${active ? 'bg-indigo-200' : 'bg-slate-200'} ${disabled ? 'grayscale' : ''}`}>
            {icon}
        </div>
        <span>{label}</span>
    </button>
);

const ReferenceGenerator: React.FC = () => {
    const [input, setInput] = useState('');
    const [parsedRefs, setParsedRefs] = useState<ParsedRef[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // AI Settings
    const [aiModel, setAiModel] = useState<'gemini-3-flash-preview' | 'gemini-3-pro-preview'>('gemini-3-flash-preview');
    // Load persisted rules or default to empty
    const [customInstructions, setCustomInstructions] = useState(() => localStorage.getItem('ref_gen_rules') || '');
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    // View State
    const [showInput, setShowInput] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'xml' | 'bibtex' | 'ris' | 'report' | 'text'>('grid');
    
    // Options
    const [citationStyle, setCitationStyle] = useState<'numbered' | 'name-date'>('name-date');
    const [startId, setStartId] = useState<number>(3000);
    const [journalFormat, setJournalFormat] = useState<'full' | 'abbrev'>('full');
    const [titleCasing, setTitleCasing] = useState<'original' | 'title' | 'sentence'>('original');

    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    // Save rules whenever they change
    useEffect(() => {
        localStorage.setItem('ref_gen_rules', customInstructions);
    }, [customInstructions]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setShowSettings(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const applyFormatting = (ref: ParsedRef): ParsedRef => {
        const newRef = { ...ref };
        if (!newRef.isBook && !newRef.isChapter) {
            newRef.source = formatJournal(newRef.source, journalFormat);
        }
        if (titleCasing !== 'original') {
            if (titleCasing === 'title') newRef.title = toTitleCase(newRef.title);
            else if (titleCasing === 'sentence') newRef.title = toSentenceCase(newRef.title);
        }
        return newRef;
    };

    // --- Parsing Logic (Gemini) ---
    const parseWithGemini = async () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste references first.", type: "warn" });
            return;
        }
        
        if (!process.env.API_KEY || process.env.API_KEY === 'undefined' || process.env.API_KEY === '') {
            setToast({ msg: "Missing API Key. Check Environment Variables.", type: "error" });
            return;
        }

        setIsLoading(true);
        setShowSettings(false);
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Define schema with Root Object containing 'references' Array
            const schema = {
                type: Type.OBJECT,
                properties: {
                    references: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                originalText: { type: Type.STRING, description: "The exact raw text segment used to generate this item." },
                                authors: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            surname: { type: Type.STRING },
                                            initials: { type: Type.STRING, description: "Initials (e.g. 'A.B.')" },
                                            givenName: { type: Type.STRING, description: "Full first/given name if available (e.g. 'Albert')" }
                                        }
                                    }
                                },
                                etAl: { type: Type.BOOLEAN, description: "Set to true if 'et al' appears at the END of the author list." },
                                year: { type: Type.STRING, description: "4-digit year only (e.g., 2024)." },
                                title: { type: Type.STRING, description: "Title of the work. Remove surrounding quotes if present." },
                                source: { type: Type.STRING, description: "Journal name, Book title, or Conference name. Expand abbreviations if clear." },
                                volume: { type: Type.STRING },
                                issue: { type: Type.STRING },
                                pages: { type: Type.STRING, description: "Full page range e.g. 100-110, or article number" },
                                doi: { type: Type.STRING },
                                publisher: { type: Type.STRING },
                                location: { type: Type.STRING },
                                patentNumber: { type: Type.STRING },
                                assignee: { type: Type.STRING },
                                applicationNumber: { type: Type.STRING },
                                institution: { type: Type.STRING },
                                reportNumber: { type: Type.STRING },
                                degree: { type: Type.STRING },
                                type: { type: Type.STRING, enum: ["journal", "book", "chapter", "report", "conference", "patent", "thesis", "website", "other"] },
                                genre: { type: Type.STRING },
                                editors: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            surname: { type: Type.STRING },
                                            initials: { type: Type.STRING },
                                            givenName: { type: Type.STRING }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // Estimate count for large batch warning
            const lineCount = input.split(/\n+/).length;
            if (lineCount > 50 && aiModel.includes('flash')) {
                setToast({ msg: "Large batch detected. Switching to Pro recommended for better accuracy.", type: "warn" });
            }

            const prompt = `Parse the following bibliographic references into structured JSON.
            
            STRICT RULES:
            1. Return ONLY valid, minified JSON.
            2. Do not include any explanation or markdown formatting (no \`\`\`).
            3. **Authors**: Handle formats like "Surname, Firstname" (e.g., "Hoet, Perrine, Jacquerye, Chantal"). If full names are present, extract them into 'givenName'.
            4. **Titles**: If the title is enclosed in quotes, remove the quotes in the output.
            5. **Journals**: If the journal has an abbreviation in parentheses (e.g., "Clinical Chemistry (CCLM)"), extract the full name as the source.
            6. **Missing Fields**: Leave missing fields null.
            7. **Year**: Extract only the 4-digit year.
            
            ${customInstructions ? `USER CUSTOM RULES: \n${customInstructions}\n` : ''}

            TRAINING EXAMPLE (ONE-SHOT):
            Input: "Hoet, Perrine, Jacquerye, Chantal. "Reference values for trace elements". Clinical Chemistry (CCLM), vol. 51, 2013."
            Output: {"references":[{"originalText": "Hoet, Perrine, Jacquerye, Chantal. \"Reference values for trace elements\". Clinical Chemistry (CCLM), vol. 51, 2013.", "authors":[{"surname":"Hoet","givenName":"Perrine"},{"surname":"Jacquerye","givenName":"Chantal"}],"year":"2013","title":"Reference values for trace elements","source":"Clinical Chemistry","volume":"51","type":"journal"}]}
            
            Input Data to Parse:
            ${input}
            `;

            const systemInstruction = `You are a highly accurate bibliographic parsing engine. 
            
            KEY HANDLING RULES:
            - **Authors**: Handle tricky delimiters. "Surname, Firstname, Surname, Firstname" means separate authors. Populate 'givenName' if available.
            - **Title**: Clean surrounding quotation marks.
            - **Original Text**: Map generated items back to their source text in 'originalText'.
            - **Structure**: Return strictly valid, minified JSON.`;

            const response = await ai.models.generateContent({
                model: aiModel,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    systemInstruction: systemInstruction,
                    temperature: 0.0, 
                    maxOutputTokens: 8192,
                }
            });

            const jsonText = response.text || '{}';
            // Robust JSON cleanup
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            let cleanJson = jsonText;
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanJson = jsonText.substring(firstBrace, lastBrace + 1);
            }
            
            let parsedRoot;
            try {
                parsedRoot = JSON.parse(cleanJson);
            } catch (jsonErr) {
                console.error("JSON Parse Error. Raw output:", jsonText);
                throw new Error("AI returned malformed JSON. The response might have been cut off or contained repetition errors. Try reducing the number of references.");
            }

            let parsedItems: any[] = [];
            
            if (parsedRoot.references && Array.isArray(parsedRoot.references)) {
                parsedItems = parsedRoot.references;
            } else if (Array.isArray(parsedRoot)) {
                parsedItems = parsedRoot;
            } else if (parsedRoot && typeof parsedRoot === 'object') {
                if (parsedRoot.items && Array.isArray(parsedRoot.items)) parsedItems = parsedRoot.items;
                else parsedItems = [parsedRoot]; 
            }

            // Simple line-based fallback if model fails to return originalText
            const fallbackLines = input.split(/\n+/).filter(l => l.trim().length > 5);

            if (parsedItems.length === 0 && fallbackLines.length > 0) {
                throw new Error("Parsed data is empty. Check API response.");
            }

            const mappedRefs: ParsedRef[] = parsedItems.map((item: any, idx: number) => {
                let fpage = '';
                let lpage = '';
                let articleNumber = cleanVal(item.articleNumber);

                const pagesRaw = cleanVal(item.pages);
                if (pagesRaw) {
                    const cleanPages = pagesRaw.replace(/\s+/g, '');
                    if (cleanPages.match(/[–-—]/)) {
                        const parts = cleanPages.split(/[–-—]/);
                        fpage = parts[0];
                        lpage = expandPageRange(parts[0], parts[1]);
                    } else if (cleanPages.toLowerCase().startsWith('e') || cleanPages.length > 4) {
                        if (!articleNumber) articleNumber = cleanPages;
                    } else {
                        fpage = cleanPages;
                    }
                }

                const rawType = cleanVal(item.type).toLowerCase();
                const isConference = rawType === 'conference';
                
                const hasPubLoc = (cleanVal(item.publisher) && cleanVal(item.publisher).toLowerCase() !== 'null') || (cleanVal(item.location) && cleanVal(item.location).toLowerCase() !== 'null');
                const hasEditors = item.editors && item.editors.length > 0;

                const isChapter = rawType === 'chapter' || (isConference && (hasEditors || hasPubLoc));
                const isBook = rawType === 'book' || rawType === 'report' || rawType === 'thesis'; 
                
                const rawAuthors = Array.isArray(item.authors) ? item.authors : [];
                const cleanAuthors = rawAuthors.map((a: any) => {
                    let surname = cleanVal(a?.surname);
                    let givenName = cleanVal(a?.givenName);
                    let initials = cleanVal(a?.initials);
                    let isEllipsis = false;

                    if (surname === '…' || surname === '...' || surname.includes('…') || surname.includes('...')) {
                        isEllipsis = true;
                        surname = '...'; 
                    }

                    // Auto-generate initials if missing but givenName exists
                    if (!initials && givenName) {
                        initials = givenName.split(/[\s-]+/).map((n: string) => n.charAt(0) + '.').join('');
                    }

                    return {
                        surname: surname,
                        initials: initials,
                        givenName: givenName,
                        isEllipsis: isEllipsis
                    };
                }).filter((a: any) => {
                    if (a.isEllipsis) return true;
                    const s = a.surname.toLowerCase();
                    return s && s !== 'et al' && s !== 'et al.';
                });
                
                let hasEtAl = item.etAl === true;
                if (!hasEtAl && rawAuthors.some((a: any) => {
                    const s = cleanVal(a?.surname).toLowerCase();
                    return s === 'et al' || s === 'et al.';
                })) {
                    hasEtAl = true;
                }
                
                const rawEditors = Array.isArray(item.editors) ? item.editors : [];
                const cleanEditors = rawEditors.map((e: any) => {
                    let givenName = cleanVal(e?.givenName);
                    let initials = cleanVal(e?.initials);
                    if (!initials && givenName) {
                        initials = givenName.split(/[\s-]+/).map((n: string) => n.charAt(0) + '.').join('');
                    }
                    return {
                        surname: cleanVal(e?.surname),
                        initials: initials,
                        givenName: givenName
                    };
                });

                // Strict Year Cleaning
                let cleanYear = cleanVal(item.year);
                const yearMatch = cleanYear.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    cleanYear = yearMatch[0];
                } else if (cleanYear.length > 4) {
                    cleanYear = cleanYear.substring(0, 4);
                }

                const sourceText = cleanVal(item.originalText) || fallbackLines[idx] || '';

                return {
                    authors: cleanAuthors,
                    year: cleanYear,
                    title: cleanVal(item.title),
                    editors: cleanEditors,
                    source: cleanVal(item.source),
                    volume: cleanVal(item.volume),
                    issue: cleanVal(item.issue),
                    fpage: fpage,
                    lpage: lpage,
                    articleNumber: articleNumber,
                    doi: cleanVal(item.doi),
                    publisher: cleanVal(item.publisher),
                    location: cleanVal(item.location),
                    patentNumber: cleanVal(item.patentNumber),
                    assignee: cleanVal(item.assignee),
                    applicationNumber: cleanVal(item.applicationNumber),
                    institution: cleanVal(item.institution),
                    reportNumber: cleanVal(item.reportNumber),
                    degree: cleanVal(item.degree),
                    isChapter: isChapter,
                    isBook: isBook,
                    hasEtAl: hasEtAl, 
                    originalText: sourceText,
                    genre: cleanVal(item.genre) || (rawType !== 'journal' ? toTitleCase(rawType) : 'Journal Article')
                };
            });

            setParsedRefs(mappedRefs);
            setToast({ msg: `Successfully parsed ${mappedRefs.length} references using ${aiModel.includes('pro') ? 'Pro' : 'Flash'} model.`, type: "success" });
            setViewMode('grid');

        } catch (e: any) {
            console.error(e);
            let errMsg = "AI Parsing failed. Please try again.";
            if (e.message && e.message.includes("API Key")) errMsg = "API Key Invalid or Missing.";
            else if (e.message && e.message.includes("parsed data is empty")) errMsg = "AI returned empty data.";
            else if (e.message && (e.message.includes("JSON Parse") || e.message.includes("malformed JSON"))) {
                errMsg = "Parsing Error: The model output was corrupted. Please try processing fewer references at once.";
            }
            setToast({ msg: errMsg, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const generateLabel = (ref: ParsedRef, idx: number) => {
        if (citationStyle === 'numbered') return `[${idx + 1}]`;
        if (ref.authors.length === 0) return ref.year ? `${ref.year}` : `[${idx + 1}]`;
        const surnames = ref.authors.filter(a => !a.isEllipsis).map(a => a.surname);
        let namePart = '';
        if (surnames.length === 1) namePart = surnames[0];
        else if (surnames.length === 2) namePart = `${surnames[0]} and ${surnames[1]}`;
        else if (surnames.length > 0) namePart = `${surnames[0]} et al.`;
        if (ref.hasEtAl && surnames.length > 0 && !namePart.includes('et al')) namePart += ' et al.';
        return `${namePart}, ${ref.year}`;
    };

    const buildXml = (): string => {
        const refStrings = parsedRefs.map((rawRef, idx) => {
            const ref = applyFormatting(rawRef);
            
            const currentNum = startId + (idx * 5); 
            const bibId = formatId('bb', currentNum);
            const refId = formatId('rf', currentNum);
            const srcId = formatId('se', currentNum);

            const originalTextXml = escapeXml(ref.originalText);
            const labelText = generateLabel(ref, idx);

            let authorsXml = '';
            ref.authors.forEach(a => {
                if (a.isEllipsis) {
                    authorsXml += `<sb:ellipsis/>`;
                } else {
                    authorsXml += `<sb:author>`;
                    if (a.givenName) {
                        authorsXml += `<ce:given-name>${escapeXml(a.givenName)}</ce:given-name>`;
                    } else if (a.initials) {
                        authorsXml += `<ce:given-name>${escapeXml(a.initials)}</ce:given-name>`;
                    }
                    authorsXml += `<ce:surname>${escapeXml(a.surname)}</ce:surname></sb:author>`;
                }
            });
            if (ref.hasEtAl) authorsXml += `<sb:et-al/>`;

            let editorsXml = '';
            if (ref.editors.length > 0) {
                ref.editors.forEach(e => {
                    editorsXml += `<sb:editor>`;
                    if (e.givenName) {
                        editorsXml += `<ce:given-name>${escapeXml(e.givenName)}</ce:given-name>`;
                    } else {
                        editorsXml += `<ce:given-name>${escapeXml(e.initials)}</ce:given-name>`;
                    }
                    editorsXml += `<ce:surname>${escapeXml(e.surname)}</ce:surname></sb:editor>`;
                });
                editorsXml = `<sb:editors>${editorsXml}</sb:editors>`;
            }

            const contributionTitle = `<sb:title><sb:maintitle>${escapeXml(ref.title)}</sb:maintitle></sb:title>`;
            const doiXml = ref.doi ? `<ce:doi>${escapeXml(ref.doi)}</ce:doi>` : '';

            let hostXml = '';
            const lastPageXml = ref.lpage ? `<sb:last-page>${escapeXml(ref.lpage)}</sb:last-page>` : '';
            
            // Map institution to publisher if publisher is missing (common for reports/theses in basic XML schema)
            const displayPublisher = ref.publisher || ref.institution || ref.assignee;
            
            const hasPub = displayPublisher && displayPublisher.toLowerCase() !== 'null';
            const hasLoc = ref.location && ref.location.toLowerCase() !== 'null';
            
            let publisherXml = '';
            if (hasPub || hasLoc) {
                const pName = hasPub ? `<sb:name>${escapeXml(displayPublisher || '')}</sb:name>` : '';
                const pLoc = hasLoc ? `<sb:location>${escapeXml(ref.location || '')}</sb:location>` : '';
                publisherXml = `<sb:publisher>${pName}${pLoc}</sb:publisher>`;
            }

            if (ref.isChapter) {
                const sourceTitle = `<sb:title><sb:maintitle>${escapeXml(ref.source)}</sb:maintitle></sb:title>`;
                const bookSeriesXml = (ref.series || (ref.volume && ref.volume.trim())) 
                    ? `<sb:book-series><sb:series><sb:title><sb:maintitle>${escapeXml(ref.series || ref.source)}</sb:maintitle></sb:title>${(ref.volume && ref.volume.trim()) ? `<sb:volume-nr>${escapeXml(ref.volume)}</sb:volume-nr>` : ''}</sb:series></sb:book-series>`
                    : '';
                const pagesXml = (ref.fpage && ref.fpage.trim()) ? `<sb:pages><sb:first-page>${escapeXml(ref.fpage)}</sb:first-page>${lastPageXml}</sb:pages>` : '';
                
                hostXml = `<sb:host><sb:edited-book>${editorsXml}${sourceTitle}${bookSeriesXml}<sb:date>${escapeXml(ref.year)}</sb:date>${publisherXml}</sb:edited-book>${pagesXml}${doiXml}</sb:host>`;
            } else if (ref.isBook || ref.genre?.toLowerCase().includes('report') || ref.genre?.toLowerCase().includes('thesis')) {
                // Generalized book/report handling
                const pagesXml = (ref.totalPages && ref.totalPages.trim()) ? `<sb:pages><sb:first-page>${escapeXml(ref.totalPages)}</sb:first-page></sb:pages>` : '';
                
                let extraInfo = '';
                if (ref.degree) extraInfo += `<sb:comment>${escapeXml(ref.degree)}</sb:comment>`;
                if (ref.patentNumber) extraInfo += `<sb:comment>Patent: ${escapeXml(ref.patentNumber)}</sb:comment>`;
                if (ref.reportNumber) extraInfo += `<sb:comment>Report: ${escapeXml(ref.reportNumber)}</sb:comment>`;

                // Use sb:book structure for most standalone works
                hostXml = `<sb:host><sb:book><sb:date>${escapeXml(ref.year)}</sb:date>${publisherXml}</sb:book>${pagesXml}${doiXml}${extraInfo}</sb:host>`;
            } else {
                const sourceTitle = `<sb:title><sb:maintitle>${escapeXml(ref.source)}</sb:maintitle></sb:title>`;
                const volumeXml = (ref.volume && ref.volume.trim() && ref.volume !== 'null') ? `<sb:volume-nr>${escapeXml(ref.volume)}</sb:volume-nr>` : '';
                const issueXml = (ref.issue && ref.issue.trim() && ref.issue !== 'null') ? `<sb:issue-nr>${escapeXml(ref.issue)}</sb:issue-nr>` : '';
                
                let locationXml = '';
                if (ref.articleNumber && ref.articleNumber !== 'null') {
                    locationXml = `<sb:article-number>${escapeXml(ref.articleNumber)}</sb:article-number>`;
                } else if (ref.fpage && ref.fpage.trim() && ref.fpage !== 'null') {
                    locationXml = `<sb:pages><sb:first-page>${escapeXml(ref.fpage)}</sb:first-page>${lastPageXml}</sb:pages>`;
                }

                hostXml = `<sb:host><sb:issue><sb:series>${sourceTitle}${volumeXml}</sb:series>${issueXml}<sb:date>${escapeXml(ref.year)}</sb:date></sb:issue>${locationXml}${doiXml}</sb:host>`;
            }

            const commentXml = ref.comment ? `<sb:comment>${escapeXml(ref.comment)}</sb:comment>` : '';
            return `<ce:bib-reference id="${bibId}"><ce:label>${labelText}</ce:label><sb:reference id="${refId}"><sb:contribution langtype="en"><sb:authors>${authorsXml}</sb:authors>${contributionTitle}</sb:contribution>${hostXml}${commentXml}</sb:reference><ce:source-text id="${srcId}">${originalTextXml}</ce:source-text></ce:bib-reference>`;
        });
        
        return refStrings.join('\n');
    };

    const generateTextReport = (): string => {
        if (parsedRefs.length === 0) return 'No references parsed yet.';

        return parsedRefs.map((ref, idx) => {
            const authorsStr = ref.authors.length > 0 
                ? ref.authors.map(a => a.isEllipsis ? '...' : `${a.surname}, ${a.givenName || a.initials}`).join('; ')
                : 'Not detected';
            
            const editorsStr = ref.editors.length > 0
                ? ref.editors.map(e => `${e.surname}, ${e.givenName || e.initials}`).join('; ')
                : '';

            let pubInfo = ref.source || '';
            if (ref.publisher) pubInfo += pubInfo ? ` (${ref.publisher})` : ref.publisher;
            if (ref.institution) pubInfo += pubInfo ? ` (${ref.institution})` : ref.institution;
            if (ref.assignee) pubInfo += pubInfo ? ` (Assignee: ${ref.assignee})` : `Assignee: ${ref.assignee}`;
            if (ref.location) pubInfo += pubInfo ? ` [${ref.location}]` : ref.location;

            return `REFERENCE SCAN #${idx + 1}
==================================================
${ref.originalText}

Authors:
${authorsStr}

Year:
${ref.year || 'Not provided'}

Title:
${ref.title || 'Not provided'}

Journal / Publisher / Institution / Assignee:
${pubInfo || 'Not provided'}

Volume:
${ref.volume || 'Not applicable'}

Issue / Report Number:
${ref.issue || ref.reportNumber || 'Not applicable'}

Pages / Article number:
${ref.articleNumber ? `Art. ${ref.articleNumber}` : (ref.fpage ? `${ref.fpage}${ref.lpage ? '-' + ref.lpage : ''}` : 'Not provided')}

DOI:
${ref.doi || 'Not provided'}

Source type:
${ref.genre || 'Journal Article'}
${ref.patentNumber ? `Patent Number: ${ref.patentNumber}` : ''}
${ref.degree ? `Degree: ${ref.degree}` : ''}
${editorsStr ? `\nEditors:\n${editorsStr}` : ''}`;
        }).join('\n\n\n');
    };

    const generateQCReport = (): QcIssue[] => {
        const issues: QcIssue[] = [];
        
        parsedRefs.forEach((ref, idx) => {
            // General Checks
            if (!ref.year) {
                issues.push({ refIndex: idx, type: 'error', field: 'Year', message: 'Missing publication year' });
            } else if (!/^\d{4}[a-z]?$/.test(ref.year)) {
                issues.push({ refIndex: idx, type: 'warning', field: 'Year', message: 'Invalid year format' });
            }

            if (!ref.title) {
                issues.push({ refIndex: idx, type: 'error', field: 'Title', message: 'Missing title' });
            }

            if (ref.authors.length === 0 && !ref.editors.length && !ref.assignee) {
                issues.push({ refIndex: idx, type: 'error', field: 'Authors', message: 'No authors, editors or assignee detected' });
            }

            // Check for explicit "null" strings that might have slipped through
            if (ref.publisher && ref.publisher.toLowerCase() === 'null') {
                issues.push({ refIndex: idx, type: 'error', field: 'Publisher', message: "Value is literal 'null'" });
            }
            if (ref.location && ref.location.toLowerCase() === 'null') {
                issues.push({ refIndex: idx, type: 'error', field: 'Location', message: "Value is literal 'null'" });
            }

            const lowerGenre = (ref.genre || '').toLowerCase();
            const isThesis = lowerGenre.includes('thesis') || lowerGenre.includes('dissertation');
            const isPatent = lowerGenre.includes('patent');
            const isReport = lowerGenre.includes('report') || lowerGenre.includes('standard');

            // Type Specific Checks
            if (isThesis) {
                if (!ref.institution && !ref.publisher) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Institution', message: 'Missing University/Institution for Thesis' });
                }
                if (!ref.degree && !lowerGenre.includes('phd') && !lowerGenre.includes('master')) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Degree', message: 'Degree type not specified (e.g., PhD)' });
                }
            } else if (isPatent) {
                if (!ref.patentNumber) {
                    issues.push({ refIndex: idx, type: 'error', field: 'Patent #', message: 'Missing Patent Number' });
                }
                if (!ref.assignee && !ref.authors.length) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Assignee', message: 'Missing Patent Assignee or Inventor' });
                }
            } else if (isReport) {
                if (!ref.reportNumber && !ref.doi && !ref.source) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Rep. Num', message: 'Missing Report Number or Series' });
                }
            } else if (ref.isBook || ref.isChapter) {
                if (!ref.publisher && !ref.institution) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Publisher', message: 'Missing Publisher name' });
                }
                if (!ref.location) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Location', message: 'Missing Publisher location' });
                }
                if (ref.isChapter && !ref.source) {
                    issues.push({ refIndex: idx, type: 'error', field: 'Source', message: 'Missing Book Title for chapter' });
                }
            } else {
                // Journal Checks
                if (!ref.source) {
                    issues.push({ refIndex: idx, type: 'error', field: 'Journal', message: 'Missing Journal name' });
                }
                if (!ref.volume && !ref.doi && !ref.articleNumber) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Volume', message: 'Missing Volume' });
                }
                if (!ref.fpage && !ref.articleNumber && !ref.doi) {
                    issues.push({ refIndex: idx, type: 'warning', field: 'Pages', message: 'Missing page numbers or article number' });
                }
            }
        });

        return issues;
    };

    const copyToClipboard = (text: string, typeName: string) => {
        navigator.clipboard.writeText(text).then(() => setToast({ msg: `${typeName} Copied!`, type: "success" }));
    };

    // --- Grid Editing ---
    const handleRefChange = (index: number, field: keyof ParsedRef, value: any) => {
        const newRefs = [...parsedRefs];
        newRefs[index] = { ...newRefs[index], [field]: value };
        setParsedRefs(newRefs);
    };

    const handleAuthorsChange = (index: number, value: string) => {
        const parts = value.split(';');
        const newAuthors = parts.map(p => {
            const clean = p.trim();
            
            // Manual entry of ellipsis
            if (clean === '...' || clean === '…') {
                return { surname: '...', initials: '', isEllipsis: true };
            }

            const comma = clean.lastIndexOf(','); 
            if (comma > -1) {
                const surname = clean.substring(0, comma).trim();
                let initials = clean.substring(comma + 1).trim();
                if (initials && !initials.endsWith('.')) initials += '.';
                initials = initials.replace(/\s+/g, '');
                return { surname, initials, isEllipsis: false };
            }
            return { surname: clean, initials: '', isEllipsis: false };
        }).filter(a => a.surname);
        
        const newRefs = [...parsedRefs];
        newRefs[index].authors = newAuthors;
        setParsedRefs(newRefs);
    };

    const handleDeleteRow = (index: number) => {
        const newRefs = [...parsedRefs];
        newRefs.splice(index, 1);
        setParsedRefs(newRefs);
    };

    const handleTeachAi = (index: number) => {
        const ref = parsedRefs[index];
        const cleanRef = {
            authors: ref.authors.map(a => ({ surname: a.surname, initials: a.initials })),
            year: ref.year,
            title: ref.title,
            source: ref.source,
            volume: ref.volume,
            issue: ref.issue,
            pages: ref.articleNumber || (ref.fpage ? `${ref.fpage}${ref.lpage ? '-' + ref.lpage : ''}` : ''),
            doi: ref.doi,
            patentNumber: ref.patentNumber,
            assignee: ref.assignee,
            type: ref.isBook ? 'book' : (ref.isChapter ? 'chapter' : 'journal')
        };
        
        const exampleStr = `\nExample Input: "${ref.originalText}"\nExample Output: ${JSON.stringify({ references: [cleanRef] })}`;
        
        setCustomInstructions(prev => (prev + exampleStr).trim());
        setShowSettings(true);
        setToast({ msg: "Added correction to Custom Rules. Re-run parse to apply.", type: "success" });
    };

    const handleAddRow = () => {
        const newRef: ParsedRef = {
            authors: [], year: '', title: '', editors: [], source: '', 
            volume: '', issue: '', fpage: '', lpage: '', 
            isChapter: false, isBook: false, hasEtAl: false, 
            originalText: '', genre: 'Journal Article'
        };
        setParsedRefs([...parsedRefs, newRef]);
    };

    const qcIssues = viewMode === 'report' ? generateQCReport() : [];

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col bg-slate-50 overflow-hidden">
            {isLoading && <LoadingOverlay message="Processing..." color="indigo" />}
            
            {/* Top Ribbon / Toolbar */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 shadow-sm z-20">
                <div className="flex gap-2 pr-4 border-r border-slate-100 relative">
                    <RibbonButton 
                        onClick={parseWithGemini} 
                        icon={<svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
                        label="Smart Parse (AI)"
                        disabled={!input}
                    />
                    
                    {/* Settings Trigger */}
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`absolute top-0 right-0 p-1.5 rounded-full hover:bg-slate-100 transition-colors ${showSettings ? 'bg-slate-200 text-indigo-600' : 'text-slate-400'}`}
                        title="Parsing Configuration"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>

                    {/* Settings Panel */}
                    {showSettings && (
                        <div ref={settingsRef} className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-4 animate-scale-in">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 border-b border-slate-100 pb-2">Parsing Configuration</h4>
                            
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">AI Model</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setAiModel('gemini-3-flash-preview')}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${aiModel === 'gemini-3-flash-preview' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Flash (Fast)
                                    </button>
                                    <button 
                                        onClick={() => setAiModel('gemini-3-pro-preview')}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${aiModel === 'gemini-3-pro-preview' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Pro (Smart)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Custom Parsing Rules</label>
                                <textarea 
                                    value={customInstructions}
                                    onChange={(e) => setCustomInstructions(e.target.value)}
                                    placeholder={`Example Rule: \nExample Input: "Author, 2024"\nExample Output: {"references": [{"authors": [{"surname": "Author"}], "year": "2024"}]}`}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-20 bg-slate-50"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Tip: Correct a row in the grid and click the <span className="inline-flex items-center justify-center w-3 h-3 bg-amber-100 rounded-full align-middle mx-0.5 text-amber-600"><svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></span> icon to auto-add rule.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 pr-4 border-r border-slate-100">
                    <RibbonButton 
                        onClick={() => setViewMode('grid')} 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>}
                        label="Grid View"
                        active={viewMode === 'grid'}
                    />
                    <RibbonButton 
                        onClick={() => setViewMode('xml')} 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
                        label="XML View"
                        active={viewMode === 'xml'}
                    />
                    <RibbonButton 
                        onClick={() => setViewMode('bibtex')} 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                        label="BibTeX"
                        active={viewMode === 'bibtex'}
                    />
                    <RibbonButton 
                        onClick={() => setViewMode('ris')} 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>}
                        label="RIS (EndNote)"
                        active={viewMode === 'ris'}
                    />
                    <RibbonButton 
                        onClick={() => setViewMode('report')} 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        label="QC Report"
                        active={viewMode === 'report'}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col text-xs gap-1.5">
                        <label className="flex items-center gap-2">
                            <span className="text-slate-500 w-12 font-medium">Style:</span>
                            <select value={citationStyle} onChange={(e) => setCitationStyle(e.target.value as any)} className="bg-slate-100 border-none rounded px-2 py-1 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-200 transition-colors">
                                <option value="name-date">Name-Date (A-Z)</option>
                                <option value="numbered">Numbered [1]</option>
                            </select>
                        </label>
                        <label className="flex items-center gap-2">
                            <span className="text-slate-500 w-12 font-medium">Start ID:</span>
                            <input type="number" value={startId} onChange={(e) => setStartId(parseInt(e.target.value) || 5)} className="w-16 bg-slate-100 border-none rounded px-2 py-1 text-xs font-mono font-bold text-slate-700 outline-none hover:bg-slate-200 transition-colors" />
                        </label>
                    </div>
                    <RibbonButton 
                        onClick={() => copyToClipboard(buildXml(), 'XML')} 
                        icon={<svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
                        label="Copy XML"
                        disabled={parsedRefs.length === 0}
                    />
                </div>
                
                <div className="flex-grow"></div>
                <button onClick={() => { setInput(''); setParsedRefs([]); setViewMode('grid'); }} className="text-xs text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg font-bold transition-colors">Reset All</button>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col overflow-hidden relative">
                
                {/* 1. Data Grid (Top Pane) */}
                <div className={`flex-grow overflow-auto custom-scrollbar bg-slate-50 relative transition-all duration-300 ${showInput ? 'h-[60%]' : 'h-full'} ${viewMode === 'grid' ? 'block' : 'hidden'}`}>
                    {parsedRefs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 pointer-events-none">
                            <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            <p className="font-medium text-lg">No Data to Display</p>
                            <p className="text-sm">Paste text, BibTeX, or RIS below and click "Parse" to populate the grid.</p>
                        </div>
                    ) : (
                        <div className="p-4 flex flex-col min-h-full">
                            <div className="flex-grow">
                                <table className="w-full border-separate border-spacing-y-2 text-xs text-slate-700 table-fixed">
                                    <thead className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                        <tr>
                                            <th className="px-1 pb-2 text-left w-8">#</th>
                                            <th className="px-1 pb-2 text-left w-20">Type</th>
                                            <th className="px-1 pb-2 text-left w-48">Authors</th>
                                            <th className="px-1 pb-2 text-center w-12">Year</th>
                                            <th className="px-1 pb-2 text-left w-48">Title</th>
                                            <th className="px-1 pb-2 text-left w-32">Source / Pub</th>
                                            <th className="px-1 pb-2 text-left w-24">Loc</th>
                                            <th className="px-1 pb-2 text-center w-10">Vol</th>
                                            <th className="px-1 pb-2 text-center w-10">Iss</th>
                                            <th className="px-1 pb-2 text-center w-16">Art #</th>
                                            <th className="px-1 pb-2 text-center w-20">Pages</th>
                                            <th className="px-1 pb-2 text-center w-24">DOI/Pat</th>
                                            <th className="px-1 pb-2 text-center w-14">Act</th>
                                        </tr>
                                    </thead>
                                    <tbody className="space-y-2">
                                        {parsedRefs.map((ref, idx) => (
                                            <tr key={idx} className="bg-white hover:bg-indigo-50/20 transition-colors shadow-sm rounded-lg group">
                                                <td className="p-1 first:rounded-l-lg border-y border-l border-slate-100 group-hover:border-indigo-100">
                                                    <div className="flex items-center justify-center font-mono text-slate-400 font-bold h-full">{idx + 1}</div>
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <select 
                                                        value={ref.isBook ? 'book' : (ref.isChapter ? 'chapter' : 'journal')} 
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const newRefs = [...parsedRefs];
                                                            newRefs[idx].isChapter = val === 'chapter';
                                                            newRefs[idx].isBook = val === 'book';
                                                            setParsedRefs(newRefs);
                                                        }}
                                                        className={`w-full bg-transparent p-1 outline-none rounded focus:bg-indigo-50 cursor-pointer font-bold text-[10px] uppercase
                                                            ${ref.isBook ? 'text-amber-600' : ref.isChapter ? 'text-purple-600' : 'text-sky-600'}`}
                                                    >
                                                        <option value="journal">Journal</option>
                                                        <option value="chapter">Chapter</option>
                                                        <option value="book">Book/Rep</option>
                                                    </select>
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100 relative">
                                                    <input 
                                                        type="text" 
                                                        value={ref.authors.map(a => {
                                                            if (a.isEllipsis) return '...';
                                                            if (a.givenName) return `${a.surname}, ${a.givenName}`;
                                                            return `${a.surname}, ${a.initials}`;
                                                        }).join('; ')} 
                                                        onChange={(e) => handleAuthorsChange(idx, e.target.value)}
                                                        className={`w-full p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all ${ref.authors.length === 0 ? 'bg-red-50' : ''}`}
                                                    />
                                                    {ref.hasEtAl && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] bg-slate-100 px-1 rounded text-slate-500 font-bold pointer-events-none">et al</span>}
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.year} 
                                                        onChange={(e) => handleRefChange(idx, 'year', e.target.value)}
                                                        className={`w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all ${!ref.year ? 'bg-amber-50' : ''}`}
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.title} 
                                                        onChange={(e) => handleRefChange(idx, 'title', e.target.value)}
                                                        className={`w-full p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all font-medium ${!ref.title ? 'bg-red-50' : ''}`}
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.isBook ? (ref.publisher || ref.institution || '') : (ref.genre?.toLowerCase().includes('patent') ? ref.assignee : ref.source)} 
                                                        onChange={(e) => handleRefChange(idx, ref.isBook ? 'publisher' : 'source', e.target.value)}
                                                        className="w-full p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all italic text-slate-600"
                                                        placeholder={ref.isBook ? "Publisher/Inst." : "Journal"}
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.location || ''} 
                                                        onChange={(e) => handleRefChange(idx, 'location', e.target.value)}
                                                        className="w-full p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-slate-500"
                                                        placeholder="City, Country"
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.volume} 
                                                        onChange={(e) => handleRefChange(idx, 'volume', e.target.value)}
                                                        className="w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.issue || ref.reportNumber || ''} 
                                                        onChange={(e) => handleRefChange(idx, 'issue', e.target.value)}
                                                        className="w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.articleNumber || ''} 
                                                        onChange={(e) => handleRefChange(idx, 'articleNumber', e.target.value)}
                                                        className="w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-xs"
                                                        placeholder="e12345"
                                                    />
                                                </td>
                                                <td className="p-1 border-y border-slate-100 group-hover:border-indigo-100">
                                                    <div className="flex items-center gap-0.5">
                                                        <input 
                                                            type="text" 
                                                            value={ref.fpage} 
                                                            onChange={(e) => handleRefChange(idx, 'fpage', e.target.value)}
                                                            className="w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                                            placeholder="start"
                                                        />
                                                        <span className="text-slate-300">-</span>
                                                        <input 
                                                            type="text" 
                                                            value={ref.lpage} 
                                                            onChange={(e) => handleRefChange(idx, 'lpage', e.target.value)}
                                                            className="w-full text-center p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                                            placeholder="end"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-1 border-y border-r border-slate-100 group-hover:border-indigo-100">
                                                    <input 
                                                        type="text" 
                                                        value={ref.patentNumber || ref.doi || ''} 
                                                        onChange={(e) => handleRefChange(idx, ref.patentNumber ? 'patentNumber' : 'doi', e.target.value)}
                                                        className="w-full p-1 outline-none rounded bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-indigo-600 font-mono text-[9px]"
                                                        placeholder="DOI/Pat"
                                                    />
                                                </td>
                                                <td className="p-1 last:rounded-r-lg border-y border-r border-slate-100 group-hover:border-indigo-100">
                                                    <div className="flex items-center gap-1 justify-center">
                                                        <button 
                                                            onClick={() => handleTeachAi(idx)} 
                                                            className="p-1.5 hover:bg-amber-50 text-amber-300 hover:text-amber-500 rounded transition-colors" 
                                                            title="Teach AI: Convert this row's correction into a rule"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                                        </button>
                                                        <button onClick={() => handleDeleteRow(idx)} className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded transition-colors" title="Delete Row">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="pt-4 border-t border-slate-100 mt-2 flex justify-center">
                                <button onClick={handleAddRow} className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 rounded-lg transition-colors border border-dashed border-slate-300 hover:border-indigo-300">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    Add Citation Row
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. XML View */}
                <div className={`flex-grow bg-slate-900 text-slate-300 p-6 font-mono text-sm overflow-auto custom-scrollbar ${viewMode === 'xml' ? 'block' : 'hidden'}`}>
                    <textarea 
                        readOnly 
                        value={buildXml()} 
                        className="w-full h-full bg-transparent border-none outline-none resize-none" 
                    />
                </div>

                {/* 3. BibTeX View */}
                <div className={`flex-grow bg-slate-900 text-amber-200 p-6 font-mono text-sm overflow-auto custom-scrollbar ${viewMode === 'bibtex' ? 'block' : 'hidden'}`}>
                    <textarea 
                        readOnly 
                        value={toBibTeX(parsedRefs)} 
                        className="w-full h-full bg-transparent border-none outline-none resize-none" 
                    />
                </div>

                {/* 4. RIS View */}
                <div className={`flex-grow bg-slate-900 text-emerald-200 p-6 font-mono text-sm overflow-auto custom-scrollbar ${viewMode === 'ris' ? 'block' : 'hidden'}`}>
                    <textarea 
                        readOnly 
                        value={toRIS(parsedRefs)} 
                        className="w-full h-full bg-transparent border-none outline-none resize-none" 
                    />
                </div>

                {/* 5. Text Report View */}
                <div className={`flex-grow bg-white text-slate-800 p-6 font-mono text-sm overflow-auto custom-scrollbar ${viewMode === 'text' ? 'block' : 'hidden'}`}>
                    {parsedRefs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <p className="font-medium text-lg">No Data</p>
                            <p>Parse references to generate a text report.</p>
                        </div>
                    ) : (
                        <textarea 
                            readOnly 
                            value={generateTextReport()} 
                            className="w-full h-full bg-transparent border-none outline-none resize-none whitespace-pre-wrap leading-relaxed" 
                        />
                    )}
                </div>

                {/* 6. QC Report View */}
                <div className={`flex-grow bg-slate-50 overflow-auto custom-scrollbar p-6 ${viewMode === 'report' ? 'block' : 'hidden'}`}>
                    {parsedRefs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <p className="font-medium text-lg">No Data</p>
                            <p>Parse references to generate a QC report.</p>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="font-bold text-slate-700">Quality Control Report</h3>
                                <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold">{qcIssues.length} Issues Found</span>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-3 w-16">Ref #</th>
                                        <th className="px-6 py-3 w-24">Severity</th>
                                        <th className="px-6 py-3 w-32">Field</th>
                                        <th className="px-6 py-3">Issue Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {qcIssues.map((issue, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-slate-500">{issue.refIndex + 1}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${issue.type === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {issue.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-700">{issue.field}</td>
                                            <td className="px-6 py-4 text-slate-600">{issue.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* 7. Input Panel (Bottom Pane) */}
                <div className={`border-t border-slate-200 bg-white shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] z-20 flex flex-col transition-all duration-300 ${showInput ? 'h-[35%] min-h-[180px]' : 'h-10 overflow-hidden'}`}>
                    <div className="bg-white px-4 py-2 border-b border-slate-100 flex justify-between items-center cursor-pointer select-none hover:bg-slate-50 transition-colors" onClick={() => setShowInput(!showInput)}>
                        <div className="flex items-center gap-2">
                            <span className={`transition-transform duration-200 text-slate-400 ${showInput ? 'rotate-180' : ''}`}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </span>
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Raw Input Source</span>
                        </div>
                        {showInput && (
                            <button onClick={(e) => { e.stopPropagation(); setInput(''); }} className="text-[10px] font-bold text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">Clear Input</button>
                        )}
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-grow w-full p-4 text-sm font-mono text-slate-700 bg-white border-0 focus:ring-0 outline-none resize-none leading-relaxed placeholder-slate-300" 
                        placeholder={`Paste citations here (one per line)...\nExample:\nBabedi, L., 2022. Trace elements in pyrite. In: Reich, M. (Eds.), Pyrite: A Special Issue. Geol. Soc. Lond. Spec. Publ. vol. 516, 47–78.`}
                        spellCheck={false}
                    />
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceGenerator;
