import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    FileText, Copy, Download, CheckCircle2, Sparkles, RefreshCw, 
    Code, Eye, Zap, ArrowRight, Settings, Info, Layers, Check, 
    BookOpen, Tag, HelpCircle, ArrowLeft, Send, ExternalLink, AlertTriangle,
    Book, Newspaper, GraduationCap, Globe, Landmark, Bookmark, Hash,
    ShieldCheck, Flag, Edit3, X, Filter, AlertCircle, FileCheck,
    Maximize2, Minimize2, ChevronsUpDown, ChevronDown, ChevronUp
} from 'lucide-react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

export type RefType = 'journal' | 'book' | 'chapter' | 'conference' | 'thesis' | 'web';
export type ValidationStatus = 'pending' | 'validated' | 'flagged';

interface ParsedAuthor {
    surname: string;
    givenName: string;
}

interface ParsedPublisher {
    name: string;
    location: string;
}

interface ParsedRefData {
    index: number;
    bibId: string;
    refId: string;
    sourceTextId: string;
    label: string;
    rawText: string;
    refType: RefType;
    typeConfidence: 'high' | 'medium' | 'low';
    authors: ParsedAuthor[];
    hasEtAl: boolean;
    year: string;
    title: string;
    containerTitle: string; // Journal name, Book title, Conference name, University
    volume: string;
    issue: string;
    publisher?: ParsedPublisher;
    pages: { first: string; last: string } | null;
    doi: string;
    url: string;
    generatedXml: string;
    alerts?: string[];
    validationStatus?: ValidationStatus;
    validationNotes?: string;
}

const REF_TYPE_META: Record<RefType, { label: string; icon: any; bg: string; text: string; border: string }> = {
    journal: { label: 'Journal Article', icon: Newspaper, bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    book: { label: 'Book', icon: Book, bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    chapter: { label: 'Book Chapter', icon: Bookmark, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    conference: { label: 'Conference Proceeding', icon: Landmark, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    thesis: { label: 'Thesis / Dissertation', icon: GraduationCap, bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    web: { label: 'Web / Online Resource', icon: Globe, bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' }
};

const TAG_COLOR_MAP: Record<string, { label: string; tag: string; bg: string; text: string; border: string; badgeBg: string; badgeText: string; badgeBorder: string }> = {
    authors: {
        label: 'Authors',
        tag: '<sb:authors>',
        bg: 'bg-indigo-50/80',
        text: 'text-indigo-900',
        border: 'border-indigo-200',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800',
        badgeBorder: 'border-indigo-300'
    },
    date: {
        label: 'Year / Date',
        tag: '<sb:date>',
        bg: 'bg-amber-50/80',
        text: 'text-amber-900',
        border: 'border-amber-200',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-800',
        badgeBorder: 'border-amber-300'
    },
    title: {
        label: 'Article / Main Title',
        tag: '<sb:maintitle>',
        bg: 'bg-blue-50/80',
        text: 'text-blue-900',
        border: 'border-blue-200',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-800',
        badgeBorder: 'border-blue-300'
    },
    container: {
        label: 'Journal / Container',
        tag: '<sb:title>',
        bg: 'bg-emerald-50/80',
        text: 'text-emerald-900',
        border: 'border-emerald-200',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-300'
    },
    volume: {
        label: 'Volume & Issue',
        tag: '<sb:volume-nr>',
        bg: 'bg-rose-50/80',
        text: 'text-rose-900',
        border: 'border-rose-200',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800',
        badgeBorder: 'border-rose-300'
    },
    pages: {
        label: 'Page Range',
        tag: '<sb:pages>',
        bg: 'bg-cyan-50/80',
        text: 'text-cyan-900',
        border: 'border-cyan-200',
        badgeBg: 'bg-cyan-100',
        badgeText: 'text-cyan-800',
        badgeBorder: 'border-cyan-300'
    },
    doi: {
        label: 'DOI / URL',
        tag: '<ce:doi>',
        bg: 'bg-violet-50/80',
        text: 'text-violet-900',
        border: 'border-violet-200',
        badgeBg: 'bg-violet-100',
        badgeText: 'text-violet-800',
        badgeBorder: 'border-violet-300'
    },
    publisher: {
        label: 'Publisher',
        tag: '<sb:publisher>',
        bg: 'bg-teal-50/80',
        text: 'text-teal-900',
        border: 'border-teal-200',
        badgeBg: 'bg-teal-100',
        badgeText: 'text-teal-800',
        badgeBorder: 'border-teal-300'
    }
};

const SAMPLE_REFERENCES = `1. Oldeland, J., Wesuls, D., Rocchini, D., Schmidt, M., & Jürgens, N. (2010). Does using species abundance data improve estimates of species diversity from remotely sensed spectral heterogeneity? Ecol. Indic., 10(2), 390-396. https://doi.org/10.1016/j.ecolind.2009.07.012

2. Smith, J. A., & Johnson, B. C. (2021). Principles of Structural Bioinformatics and XML Tagging (2nd ed.). Academic Press, New York. ISBN: 978-0-12-345678-9.

3. Garcia, M., & Martinez, K. (2019). Machine learning models for citation linking in digital libraries. In A. Davis & E. Wilson (Eds.), Advances in Digital Publishing (pp. 145-162). Springer, Berlin.

4. Lee, H., Park, S., & Kim, Y. (2018). Automated renumbering and ID audit algorithms in scientific documents. Proceedings of the 15th International IEEE Conference on Publishing Systems, 543-550. https://doi.org/10.1109/ACCESS.2018.2871234

5. Williams, R. T. (2022). Automated Metadata Structuring and Reference Parsing in Scholarly Documents (Doctoral dissertation). Stanford University, Palo Alto, CA.`;

const ReferenceTaggerExperimental: React.FC = () => {
    const navigate = useNavigate();
    const [inputText, setInputText] = useState('');
    const [outputXml, setOutputXml] = useState('');
    const [parsedRefs, setParsedRefs] = useState<ParsedRefData[]>([]);
    const [activeTab, setActiveTab] = useState<'xml' | 'cards' | 'validation'>('validation');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [copied, setCopied] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Dedicated QC & Tagging Validation State
    const [qcViewMode, setQcViewMode] = useState<'spans' | 'matrix' | 'syntax-xml'>('spans');
    const [qcDiagnosticFilter, setQcDiagnosticFilter] = useState<'all' | 'pending' | 'validated' | 'flagged' | 'missing-doi' | 'missing-container' | 'missing-vol-pages'>('all');
    const [showLegend, setShowLegend] = useState(true);
    const [isExpandedView, setIsExpandedView] = useState(false);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

    // Configuration Options
    const [labelStyle, setLabelStyle] = useState<'namedate' | 'numbered'>('namedate');
    const [numberPrefix, setNumberPrefix] = useState('[');
    const [numberSuffix, setNumberSuffix] = useState(']');
    const [bibPrefix, setBibPrefix] = useState('bb');
    const [refPrefix, setRefPrefix] = useState('rf');
    const [stPrefix, setStPrefix] = useState('se');
    const [startIdNumber, setStartIdNumber] = useState(3000);
    const [wrapInBibliography, setWrapInBibliography] = useState(true);
    const [includeSourceText, setIncludeSourceText] = useState(true);
    const [prettyFormat, setPrettyFormat] = useState(false);
    const [autoGenerateLabels, setAutoGenerateLabels] = useState(true);

    // Validation & Editing State
    const [validationFilter, setValidationFilter] = useState<'all' | 'pending' | 'validated' | 'flagged'>('all');
    const [editingBibId, setEditingBibId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{
        title: string;
        containerTitle: string;
        refType: RefType;
        year: string;
        authorsStr: string;
        volume: string;
        issue: string;
        firstPage: string;
        lastPage: string;
        doi: string;
        url: string;
        publisherName: string;
        publisherLoc: string;
        validationNotes: string;
    }>({
        title: '',
        containerTitle: '',
        refType: 'journal',
        year: '',
        authorsStr: '',
        volume: '',
        issue: '',
        firstPage: '',
        lastPage: '',
        doi: '',
        url: '',
        publisherName: '',
        publisherLoc: '',
        validationNotes: ''
    });

    useKeyboardShortcuts({
        onPrimary: () => handleProcessTagger(),
        onCopy: () => handleCopyXml(),
        onClear: () => handleReset()
    });

    const escapeXml = (str: string) => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    // Auto-detect Reference Type
    const detectRefType = (params: {
        rawText: string;
        publisher?: ParsedPublisher;
        volume: string;
        issue: string;
        pages: { first: string; last: string } | null;
        url: string;
        hasInChapterPrefix: boolean;
        hasEditor: boolean;
        isThesis: boolean;
        isConference: boolean;
        isEdition: boolean;
        isIsbn: boolean;
        containerTitle: string;
    }): { type: RefType; confidence: 'high' | 'medium' | 'low' } => {
        const { rawText, publisher, volume, issue, pages, url, hasInChapterPrefix, hasEditor, isThesis, isConference, isEdition, isIsbn, containerTitle } = params;

        // 1. Thesis / Dissertation
        if (isThesis || /\b(?:doctoral dissertation|master'?s thesis|phd thesis|ph\.d\. dissertation|thesis)\b/i.test(rawText)) {
            return { type: 'thesis', confidence: 'high' };
        }

        // 2. Book Chapter
        // MUST have genuine chapter indicators:
        // - "In:" or "In " followed by Editor(s) or Book Title
        // - OR (hasEditor OR hasInChapterPrefix) AND (has publisher OR page range like pp. 12-34)
        if (hasInChapterPrefix || (hasEditor && (Boolean(publisher) || Boolean(pages)))) {
            return { type: 'chapter', confidence: 'high' };
        }

        // 3. Conference Proceedings
        if (isConference || /\b(?:proceedings of|proc\.\s+of|conference on|symposium on|workshop on|ieee|acm)\b/i.test(rawText)) {
            return { type: 'conference', confidence: 'high' };
        }

        // 4. Book
        // A Book typically has:
        // - A Publisher (e.g. Academic Press, Springer, Cambridge Univ Press, etc.)
        // - OR an edition statement (e.g. 2nd ed., 3rd edition)
        // - OR an ISBN
        // AND NO journal volume/issue pattern or journal container title
        const hasPublisher = Boolean(publisher) || /\b(?:academic press|springer|wiley|elsevier|routledge|cambridge|oxford|macmillan|mit press|pearson|addison-wesley|mcgraw-hill|prentice hall|de gruyter|kluwer|isbn|edition|ed\.)\b/i.test(rawText);
        const hasVolIssue = Boolean((volume && issue) || (volume && pages) || /\d+\s*\(\d+\)/.test(rawText) || /\bvol\.\s*\d+/i.test(rawText));

        if ((hasPublisher || isEdition || isIsbn) && !hasVolIssue) {
            return { type: 'book', confidence: 'high' };
        }

        // 5. Web resource
        if (url && !volume && !issue && !hasPublisher && !containerTitle) {
            return { type: 'web', confidence: 'medium' };
        }

        // 6. Journal Article
        if (hasVolIssue || /\b(?:journal|j\.|rev\.|trans\.|bull\.|indic\.|lett\.|ann\.|int\.)\b/i.test(rawText) || containerTitle) {
            return { type: 'journal', confidence: 'high' };
        }

        if (hasPublisher) {
            return { type: 'book', confidence: 'medium' };
        }

        return { type: 'journal', confidence: 'low' };
    };

    // Extract Publisher Name & Location (e.g. "Academic Press, New York", "Springer, Berlin", "Springer Netherlands")
    const extractPublisher = (text: string): { name: string; location: string; fullMatchedString?: string } | undefined => {
        // 1. Location : Publisher Name format (e.g. "New York: Academic Press", "Berlin: Springer", "Palo Alto, CA: Stanford University Press")
        const locPubMatch = text.match(/\b([A-Z][a-zA-Z\s\,\.]+)\s*\:\s*([A-Z][a-zA-A0-9\s\&]+(?:Press|Publishing|Publisher|Publishers|Springer|Wiley|Elsevier|Routledge|Kluwer|De Gruyter|SAGE|Pearson|McGraw-Hill|Academic Press|University Press|House|Group|Inc\.|Ltd\.|GmbH|Co\.))\b/i);
        if (locPubMatch) {
            return {
                location: locPubMatch[1].trim(),
                name: locPubMatch[2].replace(/[\.\,]+$/, '').trim(),
                fullMatchedString: locPubMatch[0]
            };
        }

        // 2. Publisher Name, Location format (e.g. "Academic Press, New York", "Springer, Berlin", "Elsevier, Amsterdam")
        const pubLocMatch = text.match(/\b((?:Academic Press|Springer(?:-Verlag)?|Elsevier|John Wiley \& Sons|Wiley|Routledge|Kluwer|De Gruyter|SAGE|Pearson|McGraw-Hill|Addison-Wesley|Cambridge University Press|Oxford University Press|MIT Press|[A-Z][a-zA-A0-9\s\&]+Press|[A-Z][a-zA-A0-9\s\&]+Publishing|[A-Z][a-zA-A0-9\s\&]+Publishers))\s*[\,\.]\s*([A-Z][a-zA-A\s]+)\b/i);
        if (pubLocMatch) {
            return {
                name: pubLocMatch[1].trim(),
                location: pubLocMatch[2].replace(/[\.\,]+$/, '').trim(),
                fullMatchedString: pubLocMatch[0]
            };
        }

        // 3. Known Publisher + Country/City without comma (e.g. "Springer Netherlands", "Springer Dordrecht", "Kluwer Netherlands")
        const knownPubLocMatch = text.match(/\b(Springer|Elsevier|Routledge|Kluwer|Academic Press|Wiley|De Gruyter|SAGE)\s+(Netherlands|Berlin|Heidelberg|Dordrecht|New York|London|Singapore|Japan|Boston|Amsterdam|Philadelphia|Chicago)\b/i);
        if (knownPubLocMatch) {
            return {
                name: knownPubLocMatch[1].trim(),
                location: knownPubLocMatch[2].trim(),
                fullMatchedString: knownPubLocMatch[0]
            };
        }

        // 4. Known Publisher alone (e.g. "Springer-Verlag", "Springer Nature", "Academic Press", "Elsevier", "Routledge", "MIT Press", "Cambridge University Press")
        const knownPubMatch = text.match(/\b(Springer-Verlag|Springer Nature|Springer|Academic Press|Elsevier|Routledge|Kluwer Academic Publishers|Kluwer|John Wiley \& Sons|Wiley-Blackwell|Wiley|Cambridge University Press|Oxford University Press|MIT Press|SAGE Publications|SAGE|De Gruyter|Walter de Gruyter|Taylor \& Francis|CRC Press|Pearson|Addison-Wesley|McGraw-Hill|Prentice Hall|Palgrave Macmillan|Bloomsbury|Harvard University Press|Princeton University Press|Yale University Press|University Press)\b/i);
        if (knownPubMatch) {
            return {
                name: knownPubMatch[1].trim(),
                location: '',
                fullMatchedString: knownPubMatch[0]
            };
        }

        return undefined;
    };

    // Helper to split article title and container/journal title cleanly, preserving question marks & multi-sentence titles
    const splitTitleAndContainerTitle = (textBeforeVol: string): { title: string; containerTitle: string; alerts: string[] } => {
        const alerts: string[] = [];
        let cleanStr = textBeforeVol.replace(/[\,\s]+$/, '').trim();

        if (!cleanStr) {
            return { title: '', containerTitle: '', alerts: [] };
        }

        const isLikelyJournal = (str: string): boolean => {
            if (!str || str.length < 2) return false;
            // Recognized journal/container terms or capitalized multi-word name
            if (/\b(?:Journal|J\.|Review|Rev\.|Transactions|Trans\.|Proceedings|Proc\.|Bulletin|Bull\.|Letters|Lett\.|Annals|Ann\.|International|Int\.|Quarterly|Studies|Research|Magazine|Archives|Arch\.|Communications|Comm\.|Society|Press|Science|Nature|Lancet|Plos|Frontiers|BMJ|JAMA|IEEE|ACM)\b/i.test(str)) {
                return true;
            }
            const words = str.split(/\s+/);
            const capWords = words.filter(w => /^[A-Z]/.test(w));
            return capWords.length >= 1 && !/^(A|An|The|Case|Study|Role|Evidence|Impact|Effect|Analysis|Investigation|Evaluation|Assessment)\b/i.test(str);
        };

        // 1. Check for sentence boundaries (. ? ! ” ") followed by space and uppercase letter
        // e.g. "Article title. Scottish Journal of Arts, Social Sciences and Scientific Studies"
        const sentenceEndRegex = /([\.\?\!]|”|")\s+(?=[A-Z])/g;
        let match: RegExpExecArray | null;
        const sentenceMatches: { index: number; length: number; char: string }[] = [];

        while ((match = sentenceEndRegex.exec(cleanStr)) !== null) {
            sentenceMatches.push({ index: match.index, length: match[0].length, char: match[1] });
        }

        // Try sentence boundaries first (from right to left)
        for (let i = sentenceMatches.length - 1; i >= 0; i--) {
            const m = sentenceMatches[i];
            const candidateTitle = cleanStr.substring(0, m.index + (m.char !== '"' && m.char !== '”' ? 1 : 0)).trim();
            const candidateContainer = cleanStr.substring(m.index + m.length).trim();

            if (candidateContainer.length > 1) {
                if (isLikelyJournal(candidateContainer) || i === sentenceMatches.length - 1) {
                    if (candidateTitle.includes('?') || candidateTitle.includes('!')) {
                        alerts.push(`Extracted article title containing question/exclamation mark and tagged journal ("${candidateContainer}").`);
                    }
                    return {
                        title: candidateTitle.replace(/[\,]+$/, '').trim(),
                        containerTitle: candidateContainer.replace(/[\,]+$/, '').trim(),
                        alerts
                    };
                }
            }
        }

        // 2. Fallback to comma boundaries ONLY if no sentence boundary was found
        const commaRegex = /,\s+(?=[A-Z])/g;
        const commaMatches: { index: number; length: number }[] = [];

        while ((match = commaRegex.exec(cleanStr)) !== null) {
            commaMatches.push({ index: match.index, length: match[0].length });
        }

        for (let i = commaMatches.length - 1; i >= 0; i--) {
            const m = commaMatches[i];
            const candidateTitle = cleanStr.substring(0, m.index).trim();
            const candidateContainer = cleanStr.substring(m.index + m.length).trim();

            if (candidateContainer.length > 1 && isLikelyJournal(candidateContainer)) {
                return {
                    title: candidateTitle.replace(/[\,]+$/, '').trim(),
                    containerTitle: candidateContainer.replace(/[\,]+$/, '').trim(),
                    alerts
                };
            }
        }

        return { title: cleanStr, containerTitle: '', alerts };
    };

    // Parse authors with support for particles like "van Eemeren"
    const parseAuthors = (authorSection: string): { authors: ParsedAuthor[]; hasEtAl: boolean } => {
        let hasEtAl = false;
        if (/\bet\s+al\.?/i.test(authorSection) || /\band\s+others\b/i.test(authorSection)) {
            hasEtAl = true;
        }

        const cleanSection = authorSection
            .replace(/\bet\s+al\.?/gi, '')
            .replace(/\band\s+others\b/gi, '')
            .replace(/\&\s*/g, ', ')
            .replace(/\band\b/gi, ', ')
            .replace(/[\(\)]+/g, '')
            .trim();

        const tokens = cleanSection.split(/,\s*/).map(t => t.trim()).filter(Boolean);
        const authors: ParsedAuthor[] = [];

        let currentSurname = '';

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const isInitials = /^[A-Z]\.(?:\s*[A-Z]\.)*$/i.test(token) || /^[A-Z]{1,3}$/.test(token);

            if (isInitials) {
                if (currentSurname) {
                    authors.push({ surname: currentSurname, givenName: token });
                    currentSurname = '';
                }
            } else if (token.includes(' ') && /^[A-Z]\.\s*/.test(token)) {
                const spaceIdx = token.lastIndexOf(' ');
                const given = token.substring(0, spaceIdx).trim();
                const surname = token.substring(spaceIdx + 1).trim();
                authors.push({ surname, givenName: given });
            } else {
                if (currentSurname) {
                    authors.push({ surname: currentSurname, givenName: '' });
                }
                currentSurname = token;
            }
        }

        if (currentSurname) {
            authors.push({ surname: currentSurname, givenName: '' });
        }

        return { authors, hasEtAl };
    };

    // Build Single Reference XML
    const buildXmlForRef = (data: Omit<ParsedRefData, 'generatedXml'>): string => {
        const xmlLines: string[] = [];
        const indent = prettyFormat ? '  ' : '';

        const append = (str: string, level = 0) => {
            xmlLines.push(prettyFormat ? `${indent.repeat(level)}${str}` : str);
        };

        append(`<ce:bib-reference id="${data.bibId}">`, 0);
        if (data.label) {
            append(`<ce:label>${escapeXml(data.label)}</ce:label>`, 1);
        }
        append(`<sb:reference id="${data.refId}">`, 1);
        append(`<sb:contribution>`, 2);

        // Authors tag
        if (data.authors.length > 0 || data.hasEtAl) {
            append(`<sb:authors>`, 3);
            data.authors.forEach(auth => {
                append(`<sb:author>`, 4);
                if (auth.givenName) append(`<ce:given-name>${escapeXml(auth.givenName)}</ce:given-name>`, 5);
                if (auth.surname) append(`<ce:surname>${escapeXml(auth.surname)}</ce:surname>`, 5);
                append(`</sb:author>`, 4);
            });
            if (data.hasEtAl) {
                append(`<sb:et-al />`, 4);
            }
            append(`</sb:authors>`, 3);
        }

        // Title tag
        if (data.title) {
            append(`<sb:title>`, 3);
            append(`<sb:maintitle>${escapeXml(data.title)}</sb:maintitle>`, 4);
            append(`</sb:title>`, 3);
        }
        append(`</sb:contribution>`, 2);

        // Host section generated based on RefType
        append(`<sb:host>`, 2);

        if (data.refType === 'book') {
            append(`<sb:book>`, 3);
            if (data.publisher) {
                if (data.containerTitle) {
                    append(`<sb:title>`, 4);
                    append(`<sb:maintitle>${escapeXml(data.containerTitle)}</sb:maintitle>`, 5);
                    append(`</sb:title>`, 4);
                }
                if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
                append(`<sb:publisher>`, 4);
                if (data.publisher.name) append(`<ce:name>${escapeXml(data.publisher.name)}</ce:name>`, 5);
                if (data.publisher.location) append(`<ce:location>${escapeXml(data.publisher.location)}</ce:location>`, 5);
                append(`</sb:publisher>`, 4);
            } else {
                if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            }
            append(`</sb:book>`, 3);
        } else if (data.refType === 'chapter') {
            append(`<sb:book>`, 3);
            if (data.containerTitle) {
                append(`<sb:title>`, 4);
                append(`<sb:maintitle>${escapeXml(data.containerTitle)}</sb:maintitle>`, 5);
                append(`</sb:title>`, 4);
            }
            if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            if (data.publisher) {
                append(`<sb:publisher>`, 4);
                if (data.publisher.name) append(`<ce:name>${escapeXml(data.publisher.name)}</ce:name>`, 5);
                if (data.publisher.location) append(`<ce:location>${escapeXml(data.publisher.location)}</ce:location>`, 5);
                append(`</sb:publisher>`, 4);
            }
            if (data.pages) {
                append(`<sb:pages>`, 4);
                append(`<sb:first-page>${escapeXml(data.pages.first)}</sb:first-page>`, 5);
                append(`<sb:last-page>${escapeXml(data.pages.last)}</sb:last-page>`, 5);
                append(`</sb:pages>`, 4);
            }
            append(`</sb:book>`, 3);
        } else if (data.refType === 'conference') {
            append(`<sb:issue>`, 3);
            if (data.containerTitle) {
                append(`<sb:series>`, 4);
                append(`<sb:title>`, 5);
                append(`<sb:maintitle>${escapeXml(data.containerTitle)}</sb:maintitle>`, 6);
                append(`</sb:title>`, 5);
                append(`</sb:series>`, 4);
            }
            if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            append(`</sb:issue>`, 3);
            if (data.pages) {
                append(`<sb:pages>`, 3);
                append(`<sb:first-page>${escapeXml(data.pages.first)}</sb:first-page>`, 4);
                append(`<sb:last-page>${escapeXml(data.pages.last)}</sb:last-page>`, 4);
                append(`</sb:pages>`, 3);
            }
        } else if (data.refType === 'thesis') {
            append(`<sb:book>`, 3);
            if (data.containerTitle) {
                append(`<sb:title>`, 4);
                append(`<sb:maintitle>${escapeXml(data.containerTitle)}</sb:maintitle>`, 5);
                append(`</sb:title>`, 4);
            }
            if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            if (data.publisher) {
                append(`<sb:publisher>`, 4);
                if (data.publisher.name) append(`<ce:name>${escapeXml(data.publisher.name)}</ce:name>`, 5);
                if (data.publisher.location) append(`<ce:location>${escapeXml(data.publisher.location)}</ce:location>`, 5);
                append(`</sb:publisher>`, 4);
            }
            append(`</sb:book>`, 3);
        } else if (data.refType === 'web') {
            append(`<sb:e-host>`, 3);
            if (data.url) append(`<ce:e-address>${escapeXml(data.url)}</ce:e-address>`, 4);
            if (data.year) append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            append(`</sb:e-host>`, 3);
        } else {
            // Default Journal Article
            append(`<sb:issue>`, 3);
            if (data.containerTitle) {
                append(`<sb:series>`, 4);
                append(`<sb:title>`, 5);
                append(`<sb:maintitle>${escapeXml(data.containerTitle)}</sb:maintitle>`, 6);
                append(`</sb:title>`, 5);
                if (data.volume) append(`<sb:volume-nr>${escapeXml(data.volume)}</sb:volume-nr>`, 5);
                append(`</sb:series>`, 4);
            } else if (data.volume) {
                append(`<sb:series>`, 4);
                append(`<sb:volume-nr>${escapeXml(data.volume)}</sb:volume-nr>`, 5);
                append(`</sb:series>`, 4);
            }

            if (data.issue) {
                append(`<sb:issue-nr>${escapeXml(data.issue)}</sb:issue-nr>`, 4);
            }

            if (data.year) {
                append(`<sb:date>${escapeXml(data.year)}</sb:date>`, 4);
            }
            append(`</sb:issue>`, 3);

            if (data.pages) {
                append(`<sb:pages>`, 3);
                append(`<sb:first-page>${escapeXml(data.pages.first)}</sb:first-page>`, 4);
                append(`<sb:last-page>${escapeXml(data.pages.last)}</sb:last-page>`, 4);
                append(`</sb:pages>`, 3);
            }
        }

        if (data.doi) {
            append(`<ce:doi>${escapeXml(data.doi)}</ce:doi>`, 3);
        }

        append(`</sb:host>`, 2);
        append(`</sb:reference>`, 1);

        if (includeSourceText) {
            append(`<ce:source-text id="${data.sourceTextId}">${escapeXml(data.rawText)}</ce:source-text>`, 1);
        }

        append(`</ce:bib-reference>`, 0);

        return xmlLines.join(prettyFormat ? '\n' : '');
    };

    // Core Reference Parser & Tagging Engine
    const parseSingleReference = (rawLine: string, idx: number, baseId: number): ParsedRefData => {
        const cleanRaw = rawLine.trim();
        const currentNum = baseId + idx;
        const bibId = `${bibPrefix}${currentNum}`;
        const refId = `${refPrefix}${currentNum}`;
        const sourceTextId = `${stPrefix}${currentNum + 1000}`;

        // 1. Extract and clean existing label/number prefix from raw text
        let existingLabelInRaw = '';
        let workText = cleanRaw;

        const labelMatch = workText.match(/^([\[\(]?\d+[\]\)]?|[A-Z][a-z]+(?:\s+et\s+al\.)?,\s*\d{4}[a-z]?)\.?\s*/i);
        if (labelMatch) {
            existingLabelInRaw = labelMatch[1].replace(/[\.\s]+$/, '');
            workText = workText.substring(labelMatch[0].length).trim();
        }

        // 2. Extract DOI & URL
        let doi = '';
        let url = '';
        const doiMatch = workText.match(/\b(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
        if (doiMatch) {
            doi = doiMatch[1].replace(/[\.\s]+$/, '');
        }

        const urlMatch = workText.match(/\b(https?:\/\/[^\s,]+)/i);
        if (urlMatch && !urlMatch[1].includes('doi.org')) {
            url = urlMatch[1].replace(/[\.\s]+$/, '');
        }

        // Clean DOI/URL from text for remaining parsing
        let textWithoutLinks = workText
            .replace(/\b(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/gi, '')
            .replace(/\bhttps?:\/\/[^\s,]+/gi, '')
            .trim();

        // 3. Extract Year
        let year = '';
        const yearMatch = textWithoutLinks.match(/[\(\[]?((?:18|19|20)\d{2}[a-z]?)[\)\]]?/);
        if (yearMatch) {
            year = yearMatch[1];
        }

        // 4. Authors Extraction
        const authors: ParsedAuthor[] = [];
        let hasEtAl = false;

        // Split text around Year to isolate Author section
        let authorSection = '';
        let restSection = textWithoutLinks;

        if (yearMatch) {
            const yearIndex = textWithoutLinks.indexOf(yearMatch[0]);
            authorSection = textWithoutLinks.substring(0, yearIndex).trim();
            restSection = textWithoutLinks.substring(yearIndex + yearMatch[0].length).trim();
        } else {
            const parts = textWithoutLinks.split(/\.\s+/);
            authorSection = parts[0] || '';
            restSection = parts.slice(1).join('. ');
        }

        authorSection = authorSection.replace(/[\.\,\(\)]+$/, '').trim();

        if (authorSection) {
            const { authors: parsedAuthList, hasEtAl: etAlFound } = parseAuthors(authorSection);
            authors.push(...parsedAuthList);
            if (etAlFound) hasEtAl = true;
        }

        // 5. Title & Container / Journal / Book Parsing
        let title = '';
        let containerTitle = '';
        let volume = '';
        let issue = '';
        let pages: { first: string; last: string } | null = null;

        restSection = restSection.replace(/^[\.\,\:\s]+/, '');

        // Match volume, issue, and pages patterns
        const volIssuePagesMatch = restSection.match(/(\d+)\s*(?:\((\d+)\))?\s*[\,\:]\s*(\d+)(?:\s*[\-–—]\s*(\d+))?/);
        if (volIssuePagesMatch) {
            volume = volIssuePagesMatch[1] || '';
            issue = volIssuePagesMatch[2] || '';
            pages = {
                first: volIssuePagesMatch[3] || '',
                last: volIssuePagesMatch[4] || volIssuePagesMatch[3] || ''
            };
        } else {
            const ppMatch = restSection.match(/\b(?:pp?\.|pages)\s*(\d+)(?:\s*[\-–—]\s*(\d+))?/i);
            if (ppMatch) {
                pages = {
                    first: ppMatch[1] || '',
                    last: ppMatch[2] || ppMatch[1] || ''
                };
            }
        }

        // Detect Publisher
        const publisher = extractPublisher(cleanRaw);

        // Additional signal detectors
        const hasInChapterPrefix = /\bIn\s*:\s*/i.test(cleanRaw) || /\bIn\s+[^\.\,\?]+\s*\((?:eds?|editors?)\.?\)/i.test(cleanRaw) || /\bIn\s+[^\.\,\?]+\s*\(pp\.\s*\d+/i.test(cleanRaw);
        const hasEditor = /\((?:eds?|editors?)\.?\)/i.test(cleanRaw) || /\bedited by\b/i.test(cleanRaw) || /\bed\.\s+by\b/i.test(cleanRaw);
        const isThesis = /\b(?:doctoral dissertation|master'?s thesis|phd thesis|ph\.d\. dissertation|thesis)\b/i.test(cleanRaw);
        const isConference = /\b(?:proceedings of|proc\.\s+of|conference on|symposium on|workshop on|ieee|acm)\b/i.test(cleanRaw);
        const isEdition = /\b\d+(?:st|nd|rd|th)?\s+(?:ed\.|edition)\b/i.test(cleanRaw);
        const isIsbn = /\bISBN(?:-13|-10)?:?\s*[0-9\-X]+\b/i.test(cleanRaw);

        // Preliminary split for containerTitle signal
        let tempContainerTitle = '';
        const restParts = restSection.split(/[\.\?]+(?=\s+[A-Z])/);
        if (restParts.length >= 2) {
            tempContainerTitle = restParts[1].replace(/[\d\(\)\,\:\s\-–—]+$/, '').trim();
        }

        // Detect Ref Type with full parameter context
        const { type: refType, confidence: typeConfidence } = detectRefType({
            rawText: cleanRaw,
            publisher,
            volume,
            issue,
            pages,
            url,
            hasInChapterPrefix,
            hasEditor,
            isThesis,
            isConference,
            isEdition,
            isIsbn,
            containerTitle: tempContainerTitle
        });

        // Clean restSection by removing publisher match if present
        let cleanRestSection = restSection;
        if (publisher?.fullMatchedString) {
            cleanRestSection = cleanRestSection.replace(publisher.fullMatchedString, '').replace(/[\.\,\s]+$/, '').trim();
        }

        let alerts: string[] = [];

        if (refType === 'book') {
            title = cleanRestSection
                .replace(/\bISBN(?:-13|-10)?:?\s*[0-9\-X]+\b/gi, '')
                .replace(/\b\d+(?:st|nd|rd|th)?\s+(?:ed\.|edition)\b/gi, '')
                .replace(/[\.\,\s]+$/, '')
                .trim();
            containerTitle = '';
        } else if (refType === 'chapter') {
            const inMatch = cleanRestSection.match(/\bIn\s*:\s*|\bIn\s+/i);
            if (inMatch && inMatch.index !== undefined && inMatch.index > 0) {
                title = cleanRestSection.substring(0, inMatch.index).replace(/[\.\,\s]+$/, '').trim();
                let inPart = cleanRestSection.substring(inMatch.index + inMatch[0].length);
                inPart = inPart.replace(/\([^\)]*(?:eds?|editors?)[^\)]*\)/gi, '');
                inPart = inPart.replace(/\(pp\.\s*[\d\-–—\s]+\)/gi, '');
                containerTitle = inPart.replace(/[\.\,\s]+$/, '').trim();
            } else {
                const { title: t, containerTitle: ct, alerts: a } = splitTitleAndContainerTitle(cleanRestSection);
                title = t;
                containerTitle = ct;
                alerts.push(...a);
            }
        } else {
            // For Journal Articles, Conference Proceedings, Thesis, Web Resources
            let textBeforeVol = cleanRestSection;

            // Strip DOI and URL from textBeforeVol so they don't interfere
            textBeforeVol = textBeforeVol.replace(/\b(?:doi|https?:\/\/)[^\s]+/gi, '').trim();

            if (volIssuePagesMatch && volIssuePagesMatch.index !== undefined) {
                textBeforeVol = cleanRestSection.substring(0, volIssuePagesMatch.index).trim();
            }

            const { title: parsedTitle, containerTitle: parsedContainer, alerts: splitAlerts } = splitTitleAndContainerTitle(textBeforeVol);
            title = parsedTitle;
            containerTitle = parsedContainer;
            alerts.push(...splitAlerts);
        }

        // Construct Label according to selected labelStyle
        let label = '';
        if (labelStyle === 'numbered') {
            const numVal = idx + 1;
            label = `${numberPrefix}${numVal}${numberSuffix}`;
        } else {
            // Name-Date style (default)
            const getSurname = (a?: ParsedAuthor) => (a ? (a.surname || a.givenName || '').trim() : '');
            const a1 = getSurname(authors[0]);
            const a2 = getSurname(authors[1]);

            if (a1 && year) {
                if (authors.length === 1 || !a2) {
                    label = `${a1}, ${year}`;
                } else if (authors.length === 2) {
                    label = `${a1} & ${a2}, ${year}`;
                } else {
                    label = `${a1} et al., ${year}`;
                }
            } else if (a1) {
                if (authors.length === 1 || !a2) {
                    label = a1;
                } else if (authors.length === 2) {
                    label = `${a1} & ${a2}`;
                } else {
                    label = `${a1} et al.`;
                }
            } else if (year) {
                if (title) {
                    const firstWord = title.split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '');
                    label = firstWord ? `${firstWord}, ${year}` : `${year}`;
                } else {
                    label = `${year}`;
                }
            } else if (existingLabelInRaw && /[a-zA-Z]/.test(existingLabelInRaw)) {
                label = existingLabelInRaw;
            } else {
                label = `${idx + 1}`;
            }
        }

        const partialData = {
            index: idx + 1,
            bibId,
            refId,
            sourceTextId,
            label,
            rawText: cleanRaw,
            refType,
            typeConfidence,
            authors,
            hasEtAl,
            year,
            title,
            containerTitle,
            volume,
            issue,
            publisher,
            pages,
            doi,
            url,
            alerts
        };

        const generatedXml = buildXmlForRef(partialData);

        return {
            ...partialData,
            generatedXml
        };
    };

    const regenerateFullXml = (updatedRefs: ParsedRefData[]) => {
        const fullXmlPieces: string[] = [];
        if (wrapInBibliography) {
            fullXmlPieces.push('<ce:bibliography>');
        }
        updatedRefs.forEach(r => fullXmlPieces.push(r.generatedXml));
        if (wrapInBibliography) {
            fullXmlPieces.push('</ce:bibliography>');
        }
        setOutputXml(fullXmlPieces.join('\n'));
    };

    const handleTypeChange = (bibId: string, newType: RefType) => {
        setParsedRefs(prev => {
            const updated = prev.map(item => {
                if (item.bibId === bibId) {
                    const newItem = { ...item, refType: newType, typeConfidence: 'high' as const };
                    newItem.generatedXml = buildXmlForRef(newItem);
                    return newItem;
                }
                return item;
            });
            regenerateFullXml(updated);
            return updated;
        });
        setToast({ msg: `Updated reference type to ${REF_TYPE_META[newType].label}`, type: 'success' });
    };

    // Toggle validation status for a single reference
    const handleToggleValidation = (bibId: string, status?: ValidationStatus) => {
        setParsedRefs(prev => {
            const updated = prev.map(item => {
                if (item.bibId === bibId) {
                    const nextStatus: ValidationStatus = status ?? (item.validationStatus === 'validated' ? 'pending' : 'validated');
                    return { ...item, validationStatus: nextStatus };
                }
                return item;
            });
            return updated;
        });
    };

    // Batch validate references
    const handleBatchValidate = (mode: 'all' | 'high-confidence') => {
        setParsedRefs(prev => {
            const updated = prev.map(item => {
                if (mode === 'all' || (mode === 'high-confidence' && item.typeConfidence === 'high')) {
                    return { ...item, validationStatus: 'validated' as const };
                }
                return item;
            });
            return updated;
        });
        setToast({
            msg: mode === 'all' ? 'All references marked as validated!' : 'Validated all high-confidence references!',
            type: 'success'
        });
    };

    // Expand / Collapse card details in QC & Validation view
    const toggleCardExpand = (bibId: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(bibId)) {
                next.delete(bibId);
            } else {
                next.add(bibId);
            }
            return next;
        });
    };

    const handleToggleAllCardsExpand = () => {
        if (expandedCards.size > 0) {
            setExpandedCards(new Set());
        } else {
            setExpandedCards(new Set(parsedRefs.map(r => r.bibId)));
        }
    };

    // Start editing a reference
    const handleStartEdit = (ref: ParsedRefData) => {
        setEditingBibId(ref.bibId);
        const authorsFormatted = ref.authors.map(a => `${a.surname}${a.givenName ? ', ' + a.givenName : ''}`).join('; ') + (ref.hasEtAl ? ' et al.' : '');
        setEditForm({
            title: ref.title || '',
            containerTitle: ref.containerTitle || '',
            refType: ref.refType,
            year: ref.year || '',
            authorsStr: authorsFormatted,
            volume: ref.volume || '',
            issue: ref.issue || '',
            firstPage: ref.pages?.first || '',
            lastPage: ref.pages?.last || '',
            doi: ref.doi || '',
            url: ref.url || '',
            publisherName: ref.publisher?.name || '',
            publisherLoc: ref.publisher?.location || '',
            validationNotes: ref.validationNotes || ''
        });
    };

    // Save edited reference
    const handleSaveEdit = (bibId: string) => {
        const hasEtAl = /\bet\s+al\.?/i.test(editForm.authorsStr);
        const cleanAuthorsStr = editForm.authorsStr.replace(/\bet\s+al\.?/gi, '').trim();
        
        let parsedAuthors: ParsedAuthor[] = [];
        if (cleanAuthorsStr) {
            const parts = cleanAuthorsStr.split(/;\s*/).filter(Boolean);
            parsedAuthors = parts.map(part => {
                if (part.includes(',')) {
                    const [s, g] = part.split(',').map(x => x.trim());
                    return { surname: s, givenName: g || '' };
                } else {
                    const words = part.trim().split(/\s+/);
                    if (words.length > 1) {
                        return { surname: words[words.length - 1], givenName: words.slice(0, words.length - 1).join(' ') };
                    }
                    return { surname: part.trim(), givenName: '' };
                }
            });
        }

        const pagesObj = (editForm.firstPage || editForm.lastPage) 
            ? { first: editForm.firstPage, last: editForm.lastPage }
            : null;

        const publisherObj = (editForm.publisherName || editForm.publisherLoc)
            ? { name: editForm.publisherName, location: editForm.publisherLoc }
            : undefined;

        setParsedRefs(prev => {
            const updated = prev.map(item => {
                if (item.bibId === bibId) {
                    const newItem: ParsedRefData = {
                        ...item,
                        title: editForm.title,
                        containerTitle: editForm.containerTitle,
                        refType: editForm.refType,
                        year: editForm.year,
                        authors: parsedAuthors,
                        hasEtAl,
                        volume: editForm.volume,
                        issue: editForm.issue,
                        pages: pagesObj,
                        doi: editForm.doi,
                        url: editForm.url,
                        publisher: publisherObj,
                        validationStatus: 'validated' as const,
                        validationNotes: editForm.validationNotes
                    };
                    newItem.generatedXml = buildXmlForRef(newItem);
                    return newItem;
                }
                return item;
            });
            regenerateFullXml(updated);
            return updated;
        });

        setEditingBibId(null);
        setToast({ msg: 'Saved & Validated reference tagging updates!', type: 'success' });
    };

    const handleProcessTagger = () => {
        if (!inputText.trim()) {
            setToast({ msg: 'Please provide raw reference text first.', type: 'warn' });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const rawBlocks = inputText
                    .split(/\n\s*\n|\n(?=\d+[\.\)]|\b\[\d+\])/)
                    .map(b => b.trim())
                    .filter(Boolean);

                const results: ParsedRefData[] = rawBlocks.map((block, idx) => 
                    parseSingleReference(block, idx, startIdNumber)
                );

                setParsedRefs(results);
                regenerateFullXml(results);
                setActiveTab('validation');
                setToast({ msg: `Tagged ${results.length} references! Switched to Tagging QC & Validation view.`, type: 'success' });
            } catch (e) {
                setToast({ msg: 'Failed to process reference tagging.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        }, 300);
    };

    const handleLoadSample = () => {
        setInputText(SAMPLE_REFERENCES);
        setToast({ msg: 'Loaded multi-type sample references (Journal, Book, Chapter, Conference, Thesis).', type: 'info' });
    };

    const handleCopyXml = () => {
        if (!outputXml) return;
        navigator.clipboard.writeText(outputXml);
        setCopied(true);
        setToast({ msg: 'XML copied to clipboard!', type: 'success' });
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadXml = () => {
        if (!outputXml) return;
        const blob = new Blob([outputXml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tagged_references.xml';
        a.click();
        URL.revokeObjectURL(url);
        setToast({ msg: 'Exported tagged_references.xml', type: 'success' });
    };

    const handleReset = () => {
        setInputText('');
        setOutputXml('');
        setParsedRefs([]);
        setToast({ msg: 'Workspace cleared.', type: 'info' });
    };

    // Auto-update parsed references when configuration settings change
    useEffect(() => {
        if (parsedRefs.length > 0 && inputText.trim()) {
            try {
                const rawBlocks = inputText
                    .split(/\n\s*\n|\n(?=\d+[\.\)]|\b\[\d+\])/)
                    .map(b => b.trim())
                    .filter(Boolean);

                const results: ParsedRefData[] = rawBlocks.map((block, idx) => 
                    parseSingleReference(block, idx, startIdNumber)
                );

                setParsedRefs(results);

                const fullXmlPieces: string[] = [];
                if (wrapInBibliography) {
                    fullXmlPieces.push('<ce:bibliography>');
                }
                results.forEach(r => fullXmlPieces.push(r.generatedXml));
                if (wrapInBibliography) {
                    fullXmlPieces.push('</ce:bibliography>');
                }
                setOutputXml(fullXmlPieces.join(prettyFormat ? '\n' : ''));
            } catch (e) {
                // Ignore transient errors
            }
        }
    }, [labelStyle, numberPrefix, numberSuffix, bibPrefix, refPrefix, stPrefix, startIdNumber, wrapInBibliography, includeSourceText, prettyFormat]);

    // Validation Statistics
    const validationCounts = useMemo(() => {
        let validated = 0;
        let flagged = 0;
        let pending = 0;

        parsedRefs.forEach(r => {
            if (r.validationStatus === 'validated') validated++;
            else if (r.validationStatus === 'flagged') flagged++;
            else pending++;
        });

        return {
            total: parsedRefs.length,
            validated,
            flagged,
            pending,
            pct: parsedRefs.length > 0 ? Math.round((validated / parsedRefs.length) * 100) : 0
        };
    }, [parsedRefs]);

    // Filtered Refs
    const filteredParsedRefs = useMemo(() => {
        let items = parsedRefs;
        if (selectedTypeFilter !== 'all') {
            items = items.filter(r => r.refType === selectedTypeFilter);
        }
        if (validationFilter === 'validated') {
            items = items.filter(r => r.validationStatus === 'validated');
        } else if (validationFilter === 'flagged') {
            items = items.filter(r => r.validationStatus === 'flagged');
        } else if (validationFilter === 'pending') {
            items = items.filter(r => !r.validationStatus || r.validationStatus === 'pending');
        }
        if (searchFilter.trim()) {
            const query = searchFilter.toLowerCase();
            items = items.filter(r => 
                r.rawText.toLowerCase().includes(query) ||
                r.bibId.toLowerCase().includes(query) ||
                r.title.toLowerCase().includes(query) ||
                r.containerTitle.toLowerCase().includes(query)
            );
        }
        return items;
    }, [parsedRefs, selectedTypeFilter, validationFilter, searchFilter]);

    // Dedicated QC Filtered Refs
    const qcFilteredRefs = useMemo(() => {
        let items = parsedRefs;
        if (qcDiagnosticFilter === 'validated') {
            items = items.filter(r => r.validationStatus === 'validated');
        } else if (qcDiagnosticFilter === 'flagged') {
            items = items.filter(r => r.validationStatus === 'flagged');
        } else if (qcDiagnosticFilter === 'pending') {
            items = items.filter(r => !r.validationStatus || r.validationStatus === 'pending');
        } else if (qcDiagnosticFilter === 'missing-doi') {
            items = items.filter(r => !r.doi);
        } else if (qcDiagnosticFilter === 'missing-container') {
            items = items.filter(r => !r.containerTitle && !r.publisher);
        } else if (qcDiagnosticFilter === 'missing-vol-pages') {
            items = items.filter(r => !r.volume && !r.pages);
        }

        if (searchFilter.trim()) {
            const query = searchFilter.toLowerCase();
            items = items.filter(r => 
                r.rawText.toLowerCase().includes(query) ||
                r.title.toLowerCase().includes(query) ||
                r.containerTitle.toLowerCase().includes(query) ||
                r.authors.some(a => a.surname.toLowerCase().includes(query) || a.givenName.toLowerCase().includes(query)) ||
                (r.doi && r.doi.toLowerCase().includes(query))
            );
        }
        return items;
    }, [parsedRefs, qcDiagnosticFilter, searchFilter]);

    // Type Breakdown Counts
    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = { all: parsedRefs.length };
        parsedRefs.forEach(r => {
            counts[r.refType] = (counts[r.refType] || 0) + 1;
        });
        return counts;
    }, [parsedRefs]);

    return (
        <div className="max-w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {isLoading && <LoadingOverlay message="Generating XML Reference Tagging..." color="indigo" />}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header Title Section */}
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => navigate('/experimental')}
                            className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                            title="Back to Experimental Protocols"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/20">
                            <Tag size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Reference XML Tagger Pro</h1>
                                <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-widest">
                                    Experimental Protocol
                                </span>
                            </div>
                            <p className="text-slate-500 text-xs font-medium mt-0.5">
                                Automated Book vs Journal classification & XML bibliography node generation.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleLoadSample}
                        className="px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100/80 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Sparkles size={14} />
                        Load Sample
                    </button>
                    <button
                        onClick={handleReset}
                        className="px-4 py-2.5 bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Clear
                    </button>
                    <button
                        onClick={handleProcessTagger}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Zap size={14} />
                        Generate XML Tags
                    </button>
                </div>
            </div>

            {/* Config & Settings Drawer */}
            <div className="mb-6 p-4 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-4">
                {/* Labeling Style Selector Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Reference Labeling Format</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        {/* Segmented Button for Label Style */}
                        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
                            <button
                                type="button"
                                onClick={() => setLabelStyle('namedate')}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                                    labelStyle === 'namedate' 
                                        ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100' 
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Name-Date (Default)
                            </button>
                            <button
                                type="button"
                                onClick={() => setLabelStyle('numbered')}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                                    labelStyle === 'numbered' 
                                        ? 'bg-white text-indigo-700 shadow-xs border border-indigo-100' 
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Hash size={13} />
                                Numbered
                            </button>
                        </div>

                        {/* If Numbered is selected: Prefix & Suffix Customization */}
                        {labelStyle === 'numbered' && (
                            <div className="flex items-center gap-2 bg-indigo-50/70 p-1.5 rounded-2xl border border-indigo-100">
                                <div className="flex items-center gap-1">
                                    <label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider pl-1">Prefix:</label>
                                    <input
                                        type="text"
                                        value={numberPrefix}
                                        onChange={(e) => setNumberPrefix(e.target.value)}
                                        placeholder="e.g. ["
                                        className="w-12 px-2 py-1 bg-white border border-indigo-200 rounded-xl text-center font-mono text-xs font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <span className="font-mono text-xs font-black text-indigo-400">N</span>
                                <div className="flex items-center gap-1">
                                    <label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider pl-1">Suffix:</label>
                                    <input
                                        type="text"
                                        value={numberSuffix}
                                        onChange={(e) => setNumberSuffix(e.target.value)}
                                        placeholder="e.g. ]"
                                        className="w-12 px-2 py-1 bg-white border border-indigo-200 rounded-xl text-center font-mono text-xs font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <span className="text-[10px] font-black px-2.5 py-1 bg-indigo-100 text-indigo-900 rounded-xl font-mono shadow-2xs">
                                    Preview: {numberPrefix}1{numberSuffix}
                                </span>
                            </div>
                        )}
                        {labelStyle === 'namedate' && (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-50 text-slate-500 rounded-xl border border-slate-200/60">
                                Format: Author(s), Year (e.g., "Li et al., 2015", "Smith & Johnson, 2021")
                            </span>
                        )}
                    </div>
                </div>

                {/* Schema & XML Structure Fields */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-4 text-xs font-medium pt-1">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Bib ID Prefix</label>
                        <input 
                            type="text" 
                            value={bibPrefix} 
                            onChange={(e) => setBibPrefix(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Ref ID Prefix</label>
                        <input 
                            type="text" 
                            value={refPrefix} 
                            onChange={(e) => setRefPrefix(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Source Text Prefix</label>
                        <input 
                            type="text" 
                            value={stPrefix} 
                            onChange={(e) => setStPrefix(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Start ID Number</label>
                        <input 
                            type="number" 
                            value={startIdNumber} 
                            onChange={(e) => setStartIdNumber(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500" 
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                        <input 
                            type="checkbox" 
                            id="wrapBib"
                            checked={wrapInBibliography} 
                            onChange={(e) => setWrapInBibliography(e.target.checked)} 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <label htmlFor="wrapBib" className="text-[11px] font-bold text-slate-700 cursor-pointer">Wrap Bibliography</label>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                        <input 
                            type="checkbox" 
                            id="incSt"
                            checked={includeSourceText} 
                            onChange={(e) => setIncludeSourceText(e.target.checked)} 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <label htmlFor="incSt" className="text-[11px] font-bold text-slate-700 cursor-pointer">Source-Text Node</label>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                        <input 
                            type="checkbox" 
                            id="prettyFmt"
                            checked={prettyFormat} 
                            onChange={(e) => setPrettyFormat(e.target.checked)} 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <label htmlFor="prettyFmt" className="text-[11px] font-bold text-slate-700 cursor-pointer">Multi-line Format</label>
                    </div>
                </div>
            </div>

            {/* Split Main Interface Panels */}
            <div className={`grid gap-6 h-[calc(100vh-280px)] min-h-[550px] transition-all duration-300 ${isExpandedView ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Left Panel: Raw References Input */}
                <div className={`flex flex-col bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all ${isExpandedView ? 'hidden' : 'flex'}`}>
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600" />
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Raw Reference Input</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {inputText ? `${inputText.split(/\n+/).filter(Boolean).length} Lines` : 'Empty'}
                        </span>
                    </div>
                    <div className="flex-grow p-4 relative">
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Paste your formatted references here (one per line or numbered list)...&#10;&#10;Examples:&#10;1. Oldeland, J. et al. (2010). Title. Ecol. Indic., 10(2), 390-396.&#10;2. Smith, J. (2021). Title of Book. Academic Press, New York."
                            className="w-full h-full p-4 font-mono text-xs text-slate-800 bg-slate-50/50 rounded-2xl border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none leading-relaxed custom-scrollbar placeholder:text-slate-300"
                        />
                    </div>
                </div>

                {/* Right Panel: Output & Visualization */}
                <div className="flex flex-col bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                    {/* Panel Header & Tabs */}
                    <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-2xl">
                            <button
                                onClick={() => setActiveTab('validation')}
                                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                    activeTab === 'validation' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <ShieldCheck size={13} className="text-emerald-600" />
                                Tagging QC & Validation
                                {parsedRefs.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                        {validationCounts.pct}%
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('cards')}
                                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                    activeTab === 'cards' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <Eye size={13} />
                                Structured Cards ({parsedRefs.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('xml')}
                                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                    activeTab === 'xml' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                <Code size={13} />
                                XML Code
                            </button>
                        </div>

                        {outputXml && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyXml}
                                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-2xs"
                                >
                                    {copied ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                    onClick={handleDownloadXml}
                                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-2xs"
                                >
                                    <Download size={12} />
                                    Export
                                </button>
                                <button
                                    onClick={() => navigate('/structuralArchitect', { state: { transferredXml: outputXml, sourceTool: 'Reference XML Tagger Pro' } })}
                                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                                    title="Transfer to Reference Structure Repair"
                                >
                                    <Send size={12} />
                                    Transfer
                                </button>
                                <button
                                    onClick={() => setIsExpandedView(!isExpandedView)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border cursor-pointer ${
                                        isExpandedView 
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs' 
                                            : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-2xs'
                                    }`}
                                    title={isExpandedView ? 'Collapse to Split View' : 'Expand Tagging QC to Full Width'}
                                >
                                    {isExpandedView ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                                    <span className="hidden sm:inline">{isExpandedView ? 'Split View' : 'Expand View'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Output Content */}
                    <div className="flex-grow p-4 overflow-auto custom-scrollbar bg-slate-50/30">
                        {!outputXml && (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                                <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4">
                                    <Tag size={32} />
                                </div>
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight mb-1">No Tagged Output Yet</h3>
                                <p className="text-xs max-w-sm text-slate-400">
                                    Paste raw references on the left panel or click <b>Load Sample</b> then hit <b>Generate XML Tags</b>.
                                </p>
                            </div>
                        )}

                        {outputXml && activeTab === 'validation' && (
                            <div className="space-y-4">
                                {/* QC Dashboard Banner & Controls */}
                                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck size={18} className="text-emerald-600" />
                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Tagging QC & Visual Validation</h4>
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                                                    {validationCounts.pct}% Validated ({validationCounts.validated}/{parsedRefs.length})
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                Color-coded inspection tool to verify XML tag mapping, field completeness, and structural health.
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => setIsExpandedView(!isExpandedView)}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                                    isExpandedView 
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                                                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                                                }`}
                                                title={isExpandedView ? 'Collapse to Split View' : 'Expand Tagging QC to Full Width'}
                                            >
                                                {isExpandedView ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                                                <span>{isExpandedView ? 'Split View' : 'Expand View'}</span>
                                            </button>
                                            <button
                                                onClick={handleToggleAllCardsExpand}
                                                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="Expand or collapse detailed field inspection across all cards"
                                            >
                                                <ChevronsUpDown size={12} />
                                                {expandedCards.size > 0 ? 'Collapse All' : 'Expand All'}
                                            </button>
                                            <button
                                                onClick={() => setShowLegend(!showLegend)}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                                    showLegend ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                                                }`}
                                            >
                                                <Tag size={12} />
                                                {showLegend ? 'Hide Legend' : 'Show Legend'}
                                            </button>
                                            <button
                                                onClick={() => handleBatchValidate('high-confidence')}
                                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="Validate all high-confidence classifications"
                                            >
                                                <FileCheck size={12} />
                                                Validate High Confidence
                                            </button>
                                            <button
                                                onClick={() => handleBatchValidate('all')}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                                            >
                                                <CheckCircle2 size={12} />
                                                Validate All
                                            </button>
                                        </div>
                                    </div>

                                    {/* Validation Progress Bar */}
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                        <div style={{ width: `${(validationCounts.validated / (parsedRefs.length || 1)) * 100}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
                                        <div style={{ width: `${(validationCounts.flagged / (parsedRefs.length || 1)) * 100}%` }} className="h-full bg-amber-500 transition-all duration-300" />
                                        <div style={{ width: `${(validationCounts.pending / (parsedRefs.length || 1)) * 100}%` }} className="h-full bg-slate-200 transition-all duration-300" />
                                    </div>

                                    {/* Expandable Color Coding Tag Legend */}
                                    {showLegend && (
                                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Color-Coded XML Tag Mapping Legend</span>
                                                <span className="text-[10px] text-slate-400">Click edit button on any reference card to update values</span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                                {Object.entries(TAG_COLOR_MAP).map(([key, cfg]) => (
                                                    <div key={key} className={`p-2 rounded-xl border ${cfg.bg} ${cfg.border} flex items-center justify-between`}>
                                                        <div>
                                                            <span className={`block font-bold text-[11px] ${cfg.text}`}>{cfg.label}</span>
                                                            <span className="font-mono text-[9px] text-slate-500">{cfg.tag}</span>
                                                        </div>
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder} border`}>
                                                            Tag
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* QC View Mode & Diagnostic Filter Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
                                        {/* View Mode Switcher */}
                                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                            <button
                                                onClick={() => setQcViewMode('spans')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                                    qcViewMode === 'spans' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                                                }`}
                                            >
                                                <Tag size={12} />
                                                Visual Tag Spans
                                            </button>
                                            <button
                                                onClick={() => setQcViewMode('matrix')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                                    qcViewMode === 'matrix' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                                                }`}
                                            >
                                                <Layers size={12} />
                                                Tag Matrix
                                            </button>
                                            <button
                                                onClick={() => setQcViewMode('syntax-xml')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                                    qcViewMode === 'syntax-xml' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                                                }`}
                                            >
                                                <Code size={12} />
                                                Syntax XML
                                            </button>
                                        </div>

                                        {/* Diagnostic Filters */}
                                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
                                            <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
                                                <Filter size={10} /> Filter:
                                            </span>
                                            {[
                                                { id: 'all', label: 'All', count: parsedRefs.length },
                                                { id: 'pending', label: 'Pending', count: validationCounts.pending },
                                                { id: 'validated', label: 'Validated', count: validationCounts.validated },
                                                { id: 'flagged', label: 'Flagged', count: validationCounts.flagged },
                                                { id: 'missing-doi', label: 'Missing DOI', count: parsedRefs.filter(r => !r.doi).length },
                                                { id: 'missing-container', label: 'Missing Journal', count: parsedRefs.filter(r => !r.containerTitle && !r.publisher).length },
                                                { id: 'missing-vol-pages', label: 'Missing Vol/Pages', count: parsedRefs.filter(r => !r.volume && !r.pages).length }
                                            ].map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => setQcDiagnosticFilter(f.id as any)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border cursor-pointer ${
                                                        qcDiagnosticFilter === f.id
                                                            ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                                    }`}
                                                >
                                                    {f.label} ({f.count})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Reference QC Cards List */}
                                <div className="space-y-4">
                                    {qcFilteredRefs.length === 0 ? (
                                        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
                                            <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                                            <p className="text-xs font-bold text-slate-600">No references match current QC filter</p>
                                            <button
                                                onClick={() => setQcDiagnosticFilter('all')}
                                                className="mt-2 text-[11px] text-indigo-600 font-bold hover:underline cursor-pointer"
                                            >
                                                Reset Filter
                                            </button>
                                        </div>
                                    ) : (
                                        qcFilteredRefs.map((ref) => {
                                            const isEditing = editingBibId === ref.bibId;
                                            const typeMeta = REF_TYPE_META[ref.refType] || REF_TYPE_META.journal;
                                            const TypeIcon = typeMeta.icon;

                                            return (
                                                <div 
                                                    key={ref.bibId} 
                                                    className={`p-4 bg-white rounded-2xl border transition-all ${
                                                        ref.validationStatus === 'validated'
                                                            ? 'border-emerald-300 shadow-2xs'
                                                            : ref.validationStatus === 'flagged'
                                                            ? 'border-amber-300 shadow-2xs'
                                                            : 'border-slate-200 shadow-2xs hover:border-indigo-200'
                                                    }`}
                                                >
                                                    {/* Card Header */}
                                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-mono text-[11px] font-black">
                                                                #{ref.index + 1} ({ref.bibId})
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border ${typeMeta.bg} ${typeMeta.text} ${typeMeta.border}`}>
                                                                <TypeIcon size={12} />
                                                                {typeMeta.label}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                                ref.typeConfidence === 'high' ? 'bg-emerald-50 text-emerald-700' :
                                                                ref.typeConfidence === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                                                            }`}>
                                                                {ref.typeConfidence.toUpperCase()} confidence
                                                            </span>
                                                        </div>

                                                        {/* Validation Quick Actions */}
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => handleToggleValidation(ref.bibId, ref.validationStatus === 'validated' ? 'pending' : 'validated')}
                                                                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                                                                    ref.validationStatus === 'validated'
                                                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-600'
                                                                }`}
                                                            >
                                                                <CheckCircle2 size={12} />
                                                                {ref.validationStatus === 'validated' ? 'Validated' : 'Validate'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleValidation(ref.bibId, ref.validationStatus === 'flagged' ? 'pending' : 'flagged')}
                                                                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                                                                    ref.validationStatus === 'flagged'
                                                                        ? 'bg-amber-500 border-amber-500 text-white'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-600'
                                                                }`}
                                                            >
                                                                <Flag size={12} />
                                                                {ref.validationStatus === 'flagged' ? 'Flagged' : 'Flag'}
                                                            </button>
                                                            <button
                                                                onClick={() => isEditing ? setEditingBibId(null) : handleStartEdit(ref)}
                                                                className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-all cursor-pointer"
                                                                title="Edit metadata tagging"
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => toggleCardExpand(ref.bibId)}
                                                                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                                                    expandedCards.has(ref.bibId)
                                                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300'
                                                                }`}
                                                                title={expandedCards.has(ref.bibId) ? 'Collapse card details' : 'Expand card details'}
                                                            >
                                                                {expandedCards.has(ref.bibId) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    {isEditing ? (
                                                        /* Inline Editor */
                                                        <div className="p-3 bg-indigo-50/40 rounded-2xl border border-indigo-200 space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900">Edit Reference Tags</span>
                                                                <button onClick={() => setEditingBibId(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Title &lt;sb:maintitle&gt;</label>
                                                                    <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Container / Journal &lt;sb:title&gt;</label>
                                                                    <input type="text" value={editForm.containerTitle} onChange={e => setEditForm({ ...editForm, containerTitle: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Authors &lt;sb:authors&gt;</label>
                                                                    <input type="text" value={editForm.authorsStr} onChange={e => setEditForm({ ...editForm, authorsStr: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" placeholder="Surname, Given; Surname, Given" />
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-1">
                                                                    <div>
                                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Year &lt;sb:date&gt;</label>
                                                                        <input type="text" value={editForm.year} onChange={e => setEditForm({ ...editForm, year: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vol &lt;sb:volume-nr&gt;</label>
                                                                        <input type="text" value={editForm.volume} onChange={e => setEditForm({ ...editForm, volume: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Issue &lt;sb:issue-nr&gt;</label>
                                                                        <input type="text" value={editForm.issue} onChange={e => setEditForm({ ...editForm, issue: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">DOI &lt;ce:doi&gt;</label>
                                                                    <input type="text" value={editForm.doi} onChange={e => setEditForm({ ...editForm, doi: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Notes</label>
                                                                    <input type="text" value={editForm.validationNotes} onChange={e => setEditForm({ ...editForm, validationNotes: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-medium" placeholder="Validation notes..." />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-end gap-2 pt-1">
                                                                <button onClick={() => setEditingBibId(null)} className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600">Cancel</button>
                                                                <button onClick={() => handleSaveEdit(ref.bibId)} className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-xs font-bold">Save & Validate</button>
                                                            </div>
                                                        </div>
                                                    ) : qcViewMode === 'spans' ? (
                                                        /* View Mode 1: Color-Coded Visual Tag Spans */
                                                        <div className="space-y-3">
                                                            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900 rounded-2xl text-xs font-mono leading-relaxed border border-slate-800 shadow-inner">
                                                                {/* Authors */}
                                                                {ref.authors.length > 0 && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/90 text-indigo-200 border border-indigo-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-900/80 px-1.5 py-0.5 rounded">&lt;sb:authors&gt;</span>
                                                                        <span className="font-sans font-bold text-white">
                                                                            {ref.authors.map(a => `${a.surname}, ${a.givenName}`).join('; ')}
                                                                            {ref.hasEtAl ? ' et al.' : ''}
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Year */}
                                                                {ref.year && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-950/90 text-amber-200 border border-amber-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-900/80 px-1.5 py-0.5 rounded">&lt;sb:date&gt;</span>
                                                                        <span className="font-mono font-bold text-white">({ref.year})</span>
                                                                    </div>
                                                                )}

                                                                {/* Title */}
                                                                {ref.title && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-950/90 text-blue-200 border border-blue-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-blue-400 bg-blue-900/80 px-1.5 py-0.5 rounded">&lt;sb:maintitle&gt;</span>
                                                                        <span className="font-sans font-semibold text-white">"{ref.title}"</span>
                                                                    </div>
                                                                )}

                                                                {/* Container Title */}
                                                                {ref.containerTitle && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/90 text-emerald-200 border border-emerald-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-900/80 px-1.5 py-0.5 rounded">&lt;sb:title&gt;</span>
                                                                        <span className="font-sans italic font-bold text-white">{ref.containerTitle}</span>
                                                                    </div>
                                                                )}

                                                                {/* Publisher */}
                                                                {ref.publisher && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-teal-950/90 text-teal-200 border border-teal-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-teal-400 bg-teal-900/80 px-1.5 py-0.5 rounded">&lt;sb:publisher&gt;</span>
                                                                        <span className="font-sans font-semibold text-white">{ref.publisher.name} ({ref.publisher.location})</span>
                                                                    </div>
                                                                )}

                                                                {/* Volume */}
                                                                {ref.volume && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-950/90 text-rose-200 border border-rose-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-rose-400 bg-rose-900/80 px-1.5 py-0.5 rounded">&lt;sb:volume-nr&gt;</span>
                                                                        <span className="font-mono font-bold text-white">{ref.volume}</span>
                                                                    </div>
                                                                )}

                                                                {/* Issue */}
                                                                {ref.issue && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-950/90 text-rose-200 border border-rose-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-rose-400 bg-rose-900/80 px-1.5 py-0.5 rounded">&lt;sb:issue-nr&gt;</span>
                                                                        <span className="font-mono font-bold text-white">({ref.issue})</span>
                                                                    </div>
                                                                )}

                                                                {/* Pages */}
                                                                {ref.pages && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-950/90 text-cyan-200 border border-cyan-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-cyan-400 bg-cyan-900/80 px-1.5 py-0.5 rounded">&lt;sb:pages&gt;</span>
                                                                        <span className="font-mono font-bold text-white">pp. {ref.pages.first}-{ref.pages.last}</span>
                                                                    </div>
                                                                )}

                                                                {/* DOI */}
                                                                {ref.doi && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-violet-950/90 text-violet-200 border border-violet-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-violet-400 bg-violet-900/80 px-1.5 py-0.5 rounded">&lt;ce:doi&gt;</span>
                                                                        <span className="font-mono font-bold text-violet-300">{ref.doi}</span>
                                                                    </div>
                                                                )}

                                                                {/* URL */}
                                                                {ref.url && (
                                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-950/90 text-sky-200 border border-sky-700/60 shadow-2xs">
                                                                        <span className="text-[9px] font-black uppercase text-sky-400 bg-sky-900/80 px-1.5 py-0.5 rounded">&lt;ce:e-address&gt;</span>
                                                                        <span className="font-mono font-bold text-sky-300 truncate max-w-xs">{ref.url}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : qcViewMode === 'matrix' ? (
                                                        /* View Mode 2: Tag Matrix Table */
                                                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                                                            <table className="w-full text-left border-collapse">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                                        <th className="p-2.5">XML Tag</th>
                                                                        <th className="p-2.5">Category</th>
                                                                        <th className="p-2.5">Captured Content</th>
                                                                        <th className="p-2.5 text-right">Tag Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 font-medium">
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-indigo-700 font-bold">&lt;sb:authors&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Authors</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">
                                                                            {ref.authors.length > 0 ? ref.authors.map(a => `${a.surname}, ${a.givenName}`).join('; ') : <span className="text-rose-500 italic">None</span>}
                                                                        </td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.authors.length > 0 ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">⚠️ Missing</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-blue-700 font-bold">&lt;sb:maintitle&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Main Title</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.title || <span className="text-rose-500 italic">None</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.title ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">⚠️ Missing</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-emerald-700 font-bold">&lt;sb:title&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Container / Journal</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.containerTitle || ref.publisher?.name || <span className="text-slate-400 italic">N/A</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.containerTitle || ref.publisher ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">ℹ️ Optional</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-amber-700 font-bold">&lt;sb:date&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Year</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.year || <span className="text-slate-400 italic">None</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.year ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">⚠️ Missing</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-rose-700 font-bold">&lt;sb:volume-nr&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Volume / Issue</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.volume ? `Vol. ${ref.volume}` : ''} {ref.issue ? `(${ref.issue})` : ''} {!ref.volume && !ref.issue && <span className="text-slate-400 italic">None</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.volume ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">N/A</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-cyan-700 font-bold">&lt;sb:first-page&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">Pages</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.pages ? `${ref.pages.first}-${ref.pages.last}` : <span className="text-slate-400 italic">None</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.pages ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">N/A</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td className="p-2.5 font-mono text-violet-700 font-bold">&lt;ce:doi&gt;</td>
                                                                        <td className="p-2.5 text-slate-500">DOI</td>
                                                                        <td className="p-2.5 font-semibold text-slate-800">{ref.doi || <span className="text-slate-400 italic">None</span>}</td>
                                                                        <td className="p-2.5 text-right">
                                                                            {ref.doi ? (
                                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">✅ Tagged</span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">ℹ️ Optional</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        /* View Mode 3: Color Syntax XML Block */
                                                        <div className="p-3 bg-slate-950 rounded-2xl font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto border border-slate-800">
                                                            <pre className="whitespace-pre-wrap">{ref.generatedXml}</pre>
                                                        </div>
                                                    )}

                                                    {/* Raw Original Text Footer */}
                                                    <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-500 leading-snug">
                                                        <span className="font-bold text-slate-400 block mb-0.5 uppercase text-[8px]">Original Raw Source Line</span>
                                                        {ref.rawText}
                                                    </div>

                                                    {/* Expanded Details Breakdown Panel */}
                                                    {expandedCards.has(ref.bibId) && (
                                                        <div className="mt-3 p-3.5 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 space-y-2.5 text-xs font-mono">
                                                            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px]">
                                                                <span className="font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                    <Layers size={11} /> Detailed XML Field Inspection ({ref.bibId})
                                                                </span>
                                                                <span className="text-slate-400">Type: {ref.refType} ({ref.typeConfidence} confidence)</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                                                <div><span className="text-slate-400 font-sans">Title:</span> <span className="text-slate-100">{ref.title || '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Container:</span> <span className="text-slate-100">{ref.containerTitle || ref.publisher?.name || '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Authors:</span> <span className="text-slate-100">{ref.authors.map(a => `${a.surname}, ${a.givenName}`).join('; ') || '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Year / Date:</span> <span className="text-slate-100">{ref.year || '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Volume / Issue:</span> <span className="text-slate-100">{ref.volume ? `Vol. ${ref.volume}` : ''} {ref.issue ? `No. ${ref.issue}` : ''} {!ref.volume && !ref.issue ? '—' : ''}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Pages:</span> <span className="text-slate-100">{ref.pages ? `${ref.pages.first}-${ref.pages.last}` : '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">DOI:</span> <span className="text-indigo-300 break-all">{ref.doi || '—'}</span></div>
                                                                <div><span className="text-slate-400 font-sans">Status / Notes:</span> <span className="text-emerald-400">{ref.validationStatus} {ref.validationNotes ? `(${ref.validationNotes})` : ''}</span></div>
                                                            </div>
                                                            <div className="pt-2 border-t border-slate-800">
                                                                <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Generated Tagged XML</span>
                                                                <pre className="p-2 bg-black/50 rounded-lg text-[10px] text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">{ref.generatedXml}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {outputXml && activeTab === 'xml' && (
                            <div className="h-full relative">
                                <textarea
                                    readOnly
                                    value={outputXml}
                                    className="w-full h-full p-4 font-mono text-xs text-slate-800 bg-white rounded-2xl border border-slate-200 focus:outline-none resize-none leading-relaxed custom-scrollbar shadow-inner"
                                />
                            </div>
                        )}

                        {outputXml && activeTab === 'cards' && (
                            <div className="space-y-4">
                                {/* Validation Summary & Control Dashboard */}
                                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck size={18} className="text-emerald-600" />
                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Validation Dashboard</h4>
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                                                    {validationCounts.pct}% Validated
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                Review, verify, and edit parsed reference tags before finalizing XML output.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleBatchValidate('high-confidence')}
                                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="Validate all high-confidence classifications"
                                            >
                                                <FileCheck size={13} />
                                                Validate High Confidence
                                            </button>
                                            <button
                                                onClick={() => handleBatchValidate('all')}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                                            >
                                                <CheckCircle2 size={13} />
                                                Validate All ({parsedRefs.length})
                                            </button>
                                        </div>
                                    </div>

                                    {/* Progress Meter */}
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                        <div 
                                            className="h-full bg-emerald-500 transition-all duration-300" 
                                            style={{ width: `${(validationCounts.validated / (validationCounts.total || 1)) * 100}%` }} 
                                            title={`Validated: ${validationCounts.validated}`}
                                        />
                                        <div 
                                            className="h-full bg-amber-400 transition-all duration-300" 
                                            style={{ width: `${(validationCounts.flagged / (validationCounts.total || 1)) * 100}%` }} 
                                            title={`Flagged: ${validationCounts.flagged}`}
                                        />
                                    </div>

                                    {/* Filters & Search Row */}
                                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter Status:</span>
                                            <button
                                                onClick={() => setValidationFilter('all')}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                                    validationFilter === 'all'
                                                        ? 'bg-slate-800 text-white shadow-xs'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                All ({validationCounts.total})
                                            </button>
                                            <button
                                                onClick={() => setValidationFilter('pending')}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                    validationFilter === 'pending'
                                                        ? 'bg-slate-700 text-white shadow-xs'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                <AlertCircle size={11} className="text-slate-400" />
                                                Pending ({validationCounts.pending})
                                            </button>
                                            <button
                                                onClick={() => setValidationFilter('validated')}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                    validationFilter === 'validated'
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                }`}
                                            >
                                                <CheckCircle2 size={11} className="text-emerald-500" />
                                                Validated ({validationCounts.validated})
                                            </button>
                                            <button
                                                onClick={() => setValidationFilter('flagged')}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                    validationFilter === 'flagged'
                                                        ? 'bg-amber-600 text-white shadow-xs'
                                                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                }`}
                                            >
                                                <Flag size={11} className="text-amber-500" />
                                                Flagged ({validationCounts.flagged})
                                            </button>
                                        </div>

                                        <input 
                                            type="text" 
                                            value={searchFilter}
                                            onChange={(e) => setSearchFilter(e.target.value)}
                                            placeholder="Search title, author, journal..."
                                            className="w-48 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Reference Cards */}
                                {filteredParsedRefs.length === 0 ? (
                                    <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-400">
                                        <Filter size={24} className="mx-auto mb-2 text-slate-300" />
                                        <p className="text-xs font-semibold">No references match the selected filter.</p>
                                    </div>
                                ) : (
                                    filteredParsedRefs.map((ref) => {
                                        const meta = REF_TYPE_META[ref.refType];
                                        const TypeIcon = meta.icon;
                                        const isEditing = editingBibId === ref.bibId;

                                        return (
                                            <div 
                                                key={ref.bibId} 
                                                className={`p-4 bg-white border rounded-2xl transition-all shadow-2xs ${
                                                    ref.validationStatus === 'validated'
                                                        ? 'border-emerald-200/80 bg-emerald-50/10'
                                                        : ref.validationStatus === 'flagged'
                                                        ? 'border-amber-200/80 bg-amber-50/10'
                                                        : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                {/* Top Metadata Header & Validation Badges */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono border border-slate-200">
                                                            {ref.bibId}
                                                        </span>
                                                        {ref.label && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                                                                Label: {ref.label}
                                                            </span>
                                                        )}

                                                        {/* Reference Type Badge & Selector */}
                                                        <div className="relative flex items-center">
                                                            <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase flex items-center gap-1 ${meta.bg} ${meta.text} ${meta.border}`}>
                                                                <TypeIcon size={12} />
                                                                {meta.label}
                                                            </div>

                                                            <select
                                                                value={ref.refType}
                                                                onChange={(e) => handleTypeChange(ref.bibId, e.target.value as RefType)}
                                                                className="ml-2 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-slate-200 focus:outline-none cursor-pointer"
                                                                title="Change reference type"
                                                            >
                                                                <option value="journal">📰 Journal</option>
                                                                <option value="book">📘 Book</option>
                                                                <option value="chapter">📖 Book Chapter</option>
                                                                <option value="conference">🏛️ Conference</option>
                                                                <option value="thesis">🎓 Thesis</option>
                                                                <option value="web">🌐 Web</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Validation Status Indicator & Quick Actions */}
                                                    <div className="flex items-center gap-2">
                                                        {/* Status Badge */}
                                                        {ref.validationStatus === 'validated' ? (
                                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                                                <CheckCircle2 size={12} className="text-emerald-600" />
                                                                Validated
                                                            </span>
                                                        ) : ref.validationStatus === 'flagged' ? (
                                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                                                <Flag size={12} className="text-amber-600" />
                                                                Flagged
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                                                                <AlertCircle size={12} className="text-slate-400" />
                                                                Pending Review
                                                            </span>
                                                        )}

                                                        {/* Quick Action Toggle Buttons */}
                                                        <button
                                                            onClick={() => handleToggleValidation(ref.bibId)}
                                                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                                                ref.validationStatus === 'validated'
                                                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                                            }`}
                                                            title={ref.validationStatus === 'validated' ? 'Mark as pending' : 'Approve & Validate'}
                                                        >
                                                            <Check size={11} />
                                                            {ref.validationStatus === 'validated' ? 'Validated' : 'Validate'}
                                                        </button>

                                                        <button
                                                            onClick={() => handleToggleValidation(ref.bibId, ref.validationStatus === 'flagged' ? 'pending' : 'flagged')}
                                                            className={`p-1 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                                                ref.validationStatus === 'flagged'
                                                                    ? 'bg-amber-500 text-white border-amber-500'
                                                                    : 'bg-white hover:bg-amber-50 text-slate-400 hover:text-amber-600 border-slate-200'
                                                            }`}
                                                            title={ref.validationStatus === 'flagged' ? 'Unflag reference' : 'Flag for review'}
                                                        >
                                                            <Flag size={12} />
                                                        </button>

                                                        <button
                                                            onClick={() => isEditing ? setEditingBibId(null) : handleStartEdit(ref)}
                                                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                                                isEditing
                                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            <Edit3 size={11} />
                                                            {isEditing ? 'Cancel' : 'Edit Tags'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Parsing Alert / Notice Banner */}
                                                {ref.alerts && ref.alerts.length > 0 && (
                                                    <div className="mb-2.5 p-2 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 shadow-2xs">
                                                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                                        <div className="space-y-0.5">
                                                            {ref.alerts.map((alertMsg, aIdx) => (
                                                                <p key={aIdx} className="font-semibold leading-tight">{alertMsg}</p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Card Content or Inline Edit Form */}
                                                {isEditing ? (
                                                    <div className="p-3.5 bg-indigo-50/30 border border-indigo-100 rounded-xl space-y-3">
                                                        <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                                                            <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                                                                Edit Reference Metadata Tags
                                                            </span>
                                                            <button 
                                                                onClick={() => setEditingBibId(null)}
                                                                className="text-slate-400 hover:text-slate-600"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>

                                                        {/* Edit Title */}
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Article / Chapter / Book Title</label>
                                                            <textarea 
                                                                value={editForm.title}
                                                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                                rows={2}
                                                                className="w-full p-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                            />
                                                        </div>

                                                        {/* Edit Container & Authors */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Journal / Container Title</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.containerTitle}
                                                                    onChange={(e) => setEditForm({ ...editForm, containerTitle: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>

                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Authors (e.g. Abdullah, L.; Hashim, C.N.)</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.authorsStr}
                                                                    onChange={(e) => setEditForm({ ...editForm, authorsStr: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Edit Year, Volume, Issue, Pages */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Year</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.year}
                                                                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Volume</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.volume}
                                                                    onChange={(e) => setEditForm({ ...editForm, volume: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Issue</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.issue}
                                                                    onChange={(e) => setEditForm({ ...editForm, issue: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Page Range (First - Last)</label>
                                                                <div className="flex items-center gap-1">
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="First"
                                                                        value={editForm.firstPage}
                                                                        onChange={(e) => setEditForm({ ...editForm, firstPage: e.target.value })}
                                                                        className="w-1/2 p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                    />
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="Last"
                                                                        value={editForm.lastPage}
                                                                        onChange={(e) => setEditForm({ ...editForm, lastPage: e.target.value })}
                                                                        className="w-1/2 p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* DOI & URL */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">DOI</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.doi}
                                                                    onChange={(e) => setEditForm({ ...editForm, doi: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">URL</label>
                                                                <input 
                                                                    type="text"
                                                                    value={editForm.url}
                                                                    onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                                                                    className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Validation Notes */}
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Reviewer Validation Notes</label>
                                                            <input 
                                                                type="text"
                                                                value={editForm.validationNotes}
                                                                onChange={(e) => setEditForm({ ...editForm, validationNotes: e.target.value })}
                                                                placeholder="Add optional notes regarding manual verification or fixes..."
                                                                className="w-full p-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                            />
                                                        </div>

                                                        <div className="flex items-center justify-end gap-2 pt-1">
                                                            <button
                                                                onClick={() => setEditingBibId(null)}
                                                                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => handleSaveEdit(ref.bibId)}
                                                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                                            >
                                                                <CheckCircle2 size={13} />
                                                                Save & Mark Validated
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Reference Title Display */}
                                                        <p className="text-xs font-bold text-slate-800 mb-2.5 leading-relaxed">
                                                            {ref.title || 'Untitled Reference'}
                                                        </p>

                                                        {/* Field Details Grid */}
                                                        <div className="grid grid-cols-2 gap-3 text-[11px] font-medium text-slate-600 mb-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                                                            <div>
                                                                <span className="text-slate-400 font-black uppercase text-[8px] tracking-wider block mb-0.5">Authors</span>
                                                                {ref.authors.length > 0 ? (
                                                                    <span className="text-slate-800 font-semibold">{ref.authors.map(a => `${a.surname} ${a.givenName}`).join(', ')} {ref.hasEtAl ? 'et al.' : ''}</span>
                                                                ) : (
                                                                    <span className="italic text-slate-400">Not detected</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400 font-black uppercase text-[8px] tracking-wider block mb-0.5">
                                                                    {ref.refType === 'book' || ref.refType === 'chapter' ? 'Publisher / Location' : 'Journal / Container'}
                                                                </span>
                                                                {ref.publisher ? (
                                                                    <span className="text-slate-800 font-semibold">{ref.publisher.name} ({ref.publisher.location})</span>
                                                                ) : ref.containerTitle ? (
                                                                    <span className="text-slate-800 font-semibold">{ref.containerTitle}</span>
                                                                ) : (
                                                                    <span className="italic text-slate-400">N/A</span>
                                                                )}
                                                            </div>
                                                            {ref.year && (
                                                                <div>
                                                                    <span className="text-slate-400 font-black uppercase text-[8px] tracking-wider block mb-0.5">Publication Year</span>
                                                                    <span className="text-slate-800 font-semibold">{ref.year}</span>
                                                                </div>
                                                            )}
                                                            {(ref.volume || ref.issue || ref.pages) && (
                                                                <div>
                                                                    <span className="text-slate-400 font-black uppercase text-[8px] tracking-wider block mb-0.5">Vol / Issue / Pages</span>
                                                                    <span className="text-slate-800 font-semibold">
                                                                        {ref.volume ? `Vol. ${ref.volume}` : ''} {ref.issue ? `(${ref.issue})` : ''} {ref.pages ? `pp. ${ref.pages.first}-${ref.pages.last}` : ''}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Validation Notes Badge */}
                                                        {ref.validationNotes && (
                                                            <div className="mb-2.5 p-2 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 flex items-center gap-1.5">
                                                                <Info size={13} className="text-indigo-600 shrink-0" />
                                                                <span className="font-semibold">{ref.validationNotes}</span>
                                                            </div>
                                                        )}

                                                        {/* Original Source Text */}
                                                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-500 leading-snug">
                                                            <span className="font-bold text-slate-400 block mb-0.5 uppercase text-[8px]">Original Raw Reference</span>
                                                            {ref.rawText}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReferenceTaggerExperimental;
