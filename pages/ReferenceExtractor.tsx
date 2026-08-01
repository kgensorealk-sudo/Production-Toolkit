import React, { useState, useMemo } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { 
    FileText, Copy, Download, CheckCircle2, Filter, Layers, 
    ShieldCheck, Eye, Code, Sparkles, RefreshCw, CheckSquare, 
    Square, Search, FileCheck, Info, X, Zap, ArrowRight, ArrowLeft
} from 'lucide-react';

interface ExtractedRef {
    id: string;
    label: string;
    rawText: string;
    formattedHtml: string;
    sourceType: 'source-text' | 'other-ref' | 'structured' | 'fallback';
    hasSuperscript: boolean;
    hasSubscript: boolean;
    hasItalic: boolean;
    hasBold: boolean;
    hasSmallCaps: boolean;
    hasUnderline: boolean;
}

/**
 * CONVERTS XML FORMATTING TAGS TO STANDARD HTML TAGS
 */
const convertXmlTagsToHtml = (xml: string): string => {
    if (!xml) return '';
    return xml
        // Italic tags
        .replace(/<ce:italic\b[^>]*>/gi, '<i>')
        .replace(/<\/ce:italic>/gi, '</i>')
        .replace(/<ce:emphasis\b[^>]*>/gi, '<i>')
        .replace(/<\/ce:emphasis>/gi, '</i>')
        .replace(/<italic\b[^>]*>/gi, '<i>')
        .replace(/<\/italic>/gi, '</i>')
        .replace(/<em\b[^>]*>/gi, '<i>')
        .replace(/<\/em>/gi, '</i>')
        
        // Bold tags
        .replace(/<ce:bold\b[^>]*>/gi, '<b>')
        .replace(/<\/ce:bold>/gi, '</b>')
        .replace(/<bold\b[^>]*>/gi, '<b>')
        .replace(/<\/bold>/gi, '</b>')
        .replace(/<strong\b[^>]*>/gi, '<b>')
        .replace(/<\/strong>/gi, '</b>')

        // Superscript tags
        .replace(/<ce:sup\b[^>]*>/gi, '<sup>')
        .replace(/<\/ce:sup>/gi, '</sup>')
        .replace(/<superscript\b[^>]*>/gi, '<sup>')
        .replace(/<\/superscript>/gi, '</sup>')

        // Subscript tags
        .replace(/<ce:inf\b[^>]*>/gi, '<sub>')
        .replace(/<\/ce:inf>/gi, '</sub>')
        .replace(/<ce:sub\b[^>]*>/gi, '<sub>')
        .replace(/<\/ce:sub>/gi, '</sub>')
        .replace(/<subscript\b[^>]*>/gi, '<sub>')
        .replace(/<\/subscript>/gi, '</sub>')

        // Small caps tags
        .replace(/<ce:small-caps\b[^>]*>/gi, '<span class="small-caps" style="font-variant: small-caps;">')
        .replace(/<\/ce:small-caps>/gi, '</span>')
        .replace(/<small-caps\b[^>]*>/gi, '<span class="small-caps" style="font-variant: small-caps;">')
        .replace(/<\/small-caps>/gi, '</span>')

        // Underline tags
        .replace(/<ce:underline\b[^>]*>/gi, '<u>')
        .replace(/<\/ce:underline>/gi, '</u>')
        .replace(/<underline\b[^>]*>/gi, '<u>')
        .replace(/<\/underline>/gi, '</u>');
};

/**
 * SANITIZES FORMATTED HTML FOR WORD & DISPLAY
 * Converts XML formatting tags to clean HTML (i, b, sup, sub, u, span),
 * strips non-formatting XML tags without adding extra word spaces,
 * and cleans up punctuation spacing relative to formatting tags.
 */
const sanitizeFormattedHtml = (rawXml: string): string => {
    if (!rawXml) return '';

    // Step 1: Normalize unicode whitespace & remove control chars
    let step = rawXml
        .normalize('NFKC')
        .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '');

    // Step 2: Convert formatting XML tags to standard HTML
    step = convertXmlTagsToHtml(step);

    // Step 3: Strip non-formatting XML/HTML tags
    step = step.replace(/<(?!\/?(?:i|b|sup|sub|u|span)\b)[^>]+>/gi, '');

    // Step 4: Remove whitespace inside open/close formatting tags
    step = step
        .replace(/<(i|b|sup|sub|u)\b[^>]*>\s+/gi, '<$1>')
        .replace(/\s+<\/(i|b|sup|sub|u)>/gi, '</$1>')
        .replace(/<span\b[^>]*>\s+/gi, '<span style="font-variant: small-caps;">')
        .replace(/\s+<\/span>/gi, '</span>');

    // Step 5: Collapse multiple spaces
    step = step.replace(/\s+/g, ' ');

    // Step 6: Fix spaces before punctuation (including when preceded by closing tags)
    step = step
        .replace(/\s+([,.:;)])/g, '$1')
        .replace(/(<\/(?:i|b|sup|sub|u|span)>)\s+([,.:;)])/gi, '$1$2')
        .replace(/\s+(<\/(?:i|b|sup|sub|u|span)>)/gi, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/,\s*,/g, ', ')
        .replace(/,\s*\./g, '.')
        .replace(/\.\s*,/g, '.');

    // Step 6.5: Enforce Volume and Issue before Date, with NO space between Volume and Issue number
    step = enforceVolumeIssueBeforeDate(step);

    step = step.trim();

    // Step 7: Final Rule - Enforce trailing period if missing
    if (step && !step.endsWith('.')) {
        step += '.';
    }

    return step;
};

/**
 * ENFORCES:
 * 1. Volume and Issue numbers placed BEFORE the date.
 * 2. NO space between volume number and issue number (e.g., 24(3) or <b>24</b>(3)).
 */
const enforceVolumeIssueBeforeDate = (html: string): string => {
    if (!html) return '';

    let step = html;

    // 1. Remove space between Volume (number or <b>volume</b> tag) and Issue in parentheses
    // Examples: "<b>295</b> (12)" -> "<b>295</b>(12)", "295 (12)" -> "295(12)", "<b>295</b> , (12)" -> "<b>295</b>(12)"
    step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)\s*,\s*(\([\w\d\s-]+\))/gi, '$1$2');
    step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)\s+(\([\w\d\s-]+\))/gi, '$1$2');

    // 2. Reorder if Date appears BEFORE Volume and Issue
    // Case A: "(2020) <b>295</b>(12)" or "(2020) 295(12)" or "(2020), <b>295</b>(12)"
    step = step.replace(
        /\(((?:19|20)\d{2}[a-z]?)\)\s*[,;]?\s*(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)(\([\w\d\s-]+\))?/gi,
        (match, year, vol, issue) => {
            const issueStr = issue || '';
            return `${vol}${issueStr} (${year})`;
        }
    );

    // Case B: "2020; <b>295</b>(12)" or "2020; 295(12)" or "2020, <b>295</b>(12)"
    step = step.replace(
        /\b((?:19|20)\d{2}[a-z]?)\s*[,;]\s*(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)(\([\w\d\s-]+\))?/gi,
        (match, year, vol, issue) => {
            const issueStr = issue || '';
            return `${vol}${issueStr} (${year})`;
        }
    );

    // 3. Final sanity pass to remove any remaining space between volume and issue number
    step = step.replace(/(<b\b[^>]*>[\w\d-]+<\/b>|\b\d+)\s+(\([\w\d\s-]+\))/gi, '$1$2');

    return step;
};

/**
 * RECONSTRUCTS STRUCTURED REFERENCES IF SOURCE-TEXT IS ABSENT
 */
const reconstructStructuredReference = (content: string): string => {
    // Authors
    const authorMatches: string[] = [];
    const authorRegex = /<s[be]:author\b[^>]*>([\s\S]*?)<\/s[be]:author>/gi;
    let aMatch;
    while ((aMatch = authorRegex.exec(content)) !== null) {
        const authorXml = aMatch[1];
        const surnameMatch = authorXml.match(/<c[be]:surname\b[^>]*>([\s\S]*?)<\/c[be]:surname>/i);
        const givenMatch = authorXml.match(/<c[be]:given-name\b[^>]*>([\s\S]*?)<\/c[be]:given-name>/i);
        const surname = surnameMatch ? surnameMatch[1].trim() : '';
        const given = givenMatch ? givenMatch[1].trim() : '';
        
        if (surname && given) {
            authorMatches.push(`${surname}, ${given}`);
        } else if (surname) {
            authorMatches.push(surname);
        } else if (given) {
            authorMatches.push(given);
        }
    }

    let authorsStr = authorMatches.join(', ');

    // Main Title
    const titleMatch = content.match(/<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i);
    let titleStr = titleMatch ? titleMatch[1].trim() : '';

    // Host / Journal Title
    const journalMatch = content.match(/<s[be]:host\b[^>]*>[\s\S]*?<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i) ||
                         content.match(/<s[be]:series\b[^>]*>[\s\S]*?<s[be]:maintitle\b[^>]*>([\s\S]*?)<\/s[be]:maintitle>/i);
    let journalStr = journalMatch ? journalMatch[1].trim() : '';

    // Volume, Issue, Date, Pages, DOI
    const volMatch = content.match(/<s[be]:volume-nr\b[^>]*>([\s\S]*?)<\/s[be]:volume-nr>/i);
    const issueMatch = content.match(/<s[be]:issue-nr\b[^>]*>([\s\S]*?)<\/s[be]:issue-nr>/i);
    const dateMatch = content.match(/<s[be]:date\b[^>]*>([\s\S]*?)<\/s[be]:date>/i);
    const pagesMatch = content.match(/<s[be]:first-page\b[^>]*>([\s\S]*?)<\/s[be]:first-page>/i) ||
                       content.match(/<s[be]:pages\b[^>]*>([\s\S]*?)<\/s[be]:pages>/i);
    const lastPageMatch = content.match(/<s[be]:last-page\b[^>]*>([\s\S]*?)<\/s[be]:last-page>/i);
    const doiMatch = content.match(/<ce:doi\b[^>]*>([\s\S]*?)<\/ce:doi>/i);

    const vol = volMatch ? volMatch[1].trim() : '';
    const issue = issueMatch ? issueMatch[1].trim() : '';
    const date = dateMatch ? dateMatch[1].trim() : '';
    let pages = pagesMatch ? pagesMatch[1].trim() : '';
    if (pages && lastPageMatch && !pages.includes('–') && !pages.includes('-')) {
        pages += `–${lastPageMatch[1].trim()}`;
    }
    const doi = doiMatch ? doiMatch[1].trim() : '';

    // Combine Parts
    let parts: string[] = [];
    if (authorsStr) parts.push(authorsStr);
    if (titleStr) parts.push(titleStr);
    
    let hostStr = '';
    if (journalStr) {
        if (!journalStr.includes('<ce:italic>') && !journalStr.includes('<i>') && !journalStr.includes('<italic>')) {
            hostStr += `<ce:italic>${journalStr}</ce:italic>`;
        } else {
            hostStr += journalStr;
        }
    }

    // Volume & Issue BEFORE Date, with NO space between volume and issue number
    if (vol) {
        hostStr += ` <ce:bold>${vol}</ce:bold>`;
        if (issue) {
            hostStr += `(${issue})`;
        }
    } else if (issue) {
        hostStr += ` (${issue})`;
    }

    if (date) {
        hostStr += ` (${date})`;
    }

    if (pages) {
        hostStr += ` ${pages}`;
    }

    if (hostStr.trim()) parts.push(hostStr.trim());
    if (doi) parts.push(`DOI: ${doi}`);

    return parts.join(', ');
};

const ReferenceExtractor: React.FC = () => {
    const [input, setInput] = useState('');
    const [results, setResults] = useState<ExtractedRef[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    // Filter and view controls
    const [searchQuery, setSearchQuery] = useState('');
    const [filterFormat, setFilterFormat] = useState<'all' | 'sup' | 'sub' | 'italic' | 'bold'>('all');
    const [viewMode, setViewMode] = useState<'rich' | 'code'>('rich');

    const runExtraction = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content first.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found: ExtractedRef[] = [];
                const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
                
                let match;
                while ((match = bibRegex.exec(input)) !== null) {
                    const id = match[1];
                    const content = match[2];
                    
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/i);
                    const rawLabel = labelMatch ? labelMatch[1].trim() : '';
                    
                    // Format label safely with superscript preservation if present
                    const formattedLabel = convertXmlTagsToHtml(rawLabel)
                        .replace(/<(?!\/?(?:i|b|sup|sub|u|span)\b)[^>]+>/gi, '')
                        .trim();

                    // Only show label if non-empty
                    const isNumericLabel = formattedLabel.length > 0 && !/[a-zA-Z]{3,}/.test(formattedLabel);
                    const displayLabel = isNumericLabel ? formattedLabel : '';

                    let bestSourceXml = '';
                    let sourceType: 'source-text' | 'other-ref' | 'structured' | 'fallback' = 'fallback';

                    // 1. Priority: ce:source-text (Contains pre-formatted string)
                    const sourceTextMatch = content.match(/<ce:source-text\b[^>]*>([\s\S]*?)<\/ce:source-text>/i);
                    const otherRefMatch = content.match(/<ce:other-ref[^>]*>([\s\S]*?)<\/ce:other-ref>/i);
                    const structuredMatch = content.match(/<(?:sb|ce):reference[^>]*>([\s\S]*?)<\/(?:sb|ce):reference>/i);

                    if (sourceTextMatch) {
                        bestSourceXml = sourceTextMatch[1];
                        sourceType = 'source-text';
                    } else if (otherRefMatch) {
                        bestSourceXml = otherRefMatch[1];
                        sourceType = 'other-ref';
                    } else if (structuredMatch) {
                        bestSourceXml = reconstructStructuredReference(structuredMatch[1]);
                        sourceType = 'structured';
                    } else {
                        bestSourceXml = content.replace(/<ce:label>.*?<\/ce:label>/gi, '');
                        sourceType = 'fallback';
                    }

                    // Run Sanitizer to produce clean HTML formatted text
                    const formattedHtml = sanitizeFormattedHtml(bestSourceXml);

                    // Create Plain Text raw version
                    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
                    let cleanRaw = '';
                    if (tempDiv) {
                        tempDiv.innerHTML = formattedHtml;
                        cleanRaw = tempDiv.textContent || tempDiv.innerText || '';
                    } else {
                        cleanRaw = formattedHtml.replace(/<[^>]+>/g, '');
                    }

                    // Detect formatting presence flags
                    const hasSuperscript = /<sup>/i.test(formattedHtml);
                    const hasSubscript = /<sub>/i.test(formattedHtml);
                    const hasItalic = /<i>/i.test(formattedHtml);
                    const hasBold = /<b>/i.test(formattedHtml);
                    const hasSmallCaps = /small-caps/i.test(formattedHtml);
                    const hasUnderline = /<u>/i.test(formattedHtml);

                    found.push({
                        id,
                        label: displayLabel,
                        rawText: cleanRaw,
                        formattedHtml,
                        sourceType,
                        hasSuperscript,
                        hasSubscript,
                        hasItalic,
                        hasBold,
                        hasSmallCaps,
                        hasUnderline
                    });
                }

                if (found.length === 0) {
                    setToast({ msg: "No <ce:bib-reference> items detected in input XML.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setSelectedIndices(new Set(found.map((_, i) => i)));
                    setStep('report');
                    setToast({ msg: `Extracted ${found.length} bibliography item(s) with full format protection!`, type: "success" });
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Extraction error:", err);
                setToast({ msg: "Extraction error encountered. Please check XML syntax.", type: "error" });
                setIsLoading(false);
            }
        }, 300);
    };

    const toggleIndex = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    const toggleAll = () => {
        if (selectedIndices.size === results.length) setSelectedIndices(new Set());
        else setSelectedIndices(new Set(results.map((_, i) => i)));
    };

    const copyToClipboard = async (items: ExtractedRef[]) => {
        if (items.length === 0) {
            setToast({ msg: "No items selected to copy.", type: "warn" });
            return;
        }
        try {
            const htmlItems = items.map(item => {
                const labelPrefix = item.label ? `<b style="font-weight: bold;">${item.label}</b> ` : '';
                return `<p style="margin-bottom: 8pt; font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15;">${labelPrefix}${item.formattedHtml}</p>`;
            }).join('');

            const fullHtmlDocument = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15; }
        p { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; margin-bottom: 8pt; line-height: 1.15; }
        b, strong { font-weight: bold; }
        i, em { font-style: italic; }
        sup { vertical-align: super; font-size: 0.83em; line-height: 0; }
        sub { vertical-align: sub; font-size: 0.83em; line-height: 0; }
        u { text-decoration: underline; }
        .small-caps { font-variant: small-caps; }
    </style>
</head>
<body>
    ${htmlItems}
</body>
</html>`.trim();

            const plainText = items.map(item => `${item.label ? item.label + ' ' : ''}${item.rawText}`).join('\n');

            const htmlBlob = new Blob([fullHtmlDocument], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });

            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': htmlBlob,
                        'text/plain': textBlob
                    })
                ]);
                setToast({ msg: `Copied ${items.length} item(s) to Clipboard! Ready to paste into Word (.docx) with exact formatting.`, type: "success" });
            } else {
                await navigator.clipboard.writeText(plainText);
                setToast({ msg: "Copied plain text (Browser clipboard fallback).", type: "warn" });
            }
        } catch (e) {
            console.error("Clipboard copy error:", e);
            setToast({ msg: "Clipboard copy failed.", type: "error" });
        }
    };

    const downloadWordDocument = (items: ExtractedRef[]) => {
        if (items.length === 0) {
            setToast({ msg: "No items selected to export.", type: "warn" });
            return;
        }
        const htmlItems = items.map(item => {
            const labelPrefix = item.label ? `<b style="font-weight: bold;">${item.label}</b> ` : '';
            return `<p style="margin-bottom: 8pt; font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15;">${labelPrefix}${item.formattedHtml}</p>`;
        }).join('');

        const fullHtmlDocument = `
<html xmlns:o='urn:schemas-microsoft-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="utf-8">
    <title>Bibliography Export</title>
    <!--[if gte mso 9]>
    <xml>
    <w:WordDocument>
        <w:View>Normal</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        body { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.15; }
        p { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; margin-bottom: 8pt; line-height: 1.15; }
        b, strong { font-weight: bold; }
        i, em { font-style: italic; }
        sup { vertical-align: super; font-size: 0.83em; }
        sub { vertical-align: sub; font-size: 0.83em; }
        u { text-decoration: underline; }
        .small-caps { font-variant: small-caps; }
    </style>
</head>
<body>
    ${htmlItems}
</body>
</html>`.trim();

        const blob = new Blob(['\ufeff' + fullHtmlDocument], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bibliography_Extracted_${new Date().toISOString().slice(0, 10)}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setToast({ msg: `Downloaded ${items.length} reference(s) as MS Word document (.doc)!`, type: "success" });
    };

    const handleCopySelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        copyToClipboard(selectedItems);
    };

    const handleDownloadSelected = () => {
        const selectedItems = results.filter((_, i) => selectedIndices.has(i));
        downloadWordDocument(selectedItems);
    };

    const filteredResults = useMemo(() => {
        return results.map((item, originalIndex) => ({ item, originalIndex })).filter(({ item }) => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matches = item.rawText.toLowerCase().includes(q) || 
                                item.formattedHtml.toLowerCase().includes(q) || 
                                item.id.toLowerCase().includes(q) || 
                                item.label.toLowerCase().includes(q);
                if (!matches) return false;
            }

            if (filterFormat === 'sup') return item.hasSuperscript;
            if (filterFormat === 'sub') return item.hasSubscript;
            if (filterFormat === 'italic') return item.hasItalic;
            if (filterFormat === 'bold') return item.hasBold;

            return true;
        });
    }, [results, searchQuery, filterFormat]);

    const formatCounts = useMemo(() => {
        return {
            all: results.length,
            sup: results.filter(r => r.hasSuperscript).length,
            sub: results.filter(r => r.hasSubscript).length,
            italic: results.filter(r => r.hasItalic).length,
            bold: results.filter(r => r.hasBold).length,
        };
    }, [results]);

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runExtraction : handleCopySelected,
        onClear: () => { setInput(''); setResults([]); setStep('input'); setSelectedIndices(new Set()); setSearchQuery(''); }
    }, [input, results, step, selectedIndices]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {/* Header Badge & Title */}
            <div className="mb-8 text-center animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>100% Exact Text Formatting • Superscript, Subscript, Italics & Bold Protected for .docx</span>
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Bibliography Extractor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">
                    Extract bibliography references with total typography preservation. All superscripts, subscripts, italics, bold, and small-caps transfer natively into Microsoft Word (.docx).
                </p>
            </div>

            {/* Main Container Card */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative transition-all duration-500 min-h-[720px]">
                {isLoading && <LoadingOverlay message="Extracting bibliography & preserving typography tags..." color="indigo" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in flex-grow">
                        <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                            <label className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Master XML Bibliography Source Feed
                            </label>
                            <button 
                                onClick={() => setInput('')} 
                                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-colors"
                            >
                                Clear Input
                            </button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-8 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed text-slate-800 min-h-[480px] custom-scrollbar" 
                            placeholder="Paste your XML document or <ce:bib-reference> entries here..."
                            spellCheck={false}
                        />
                        <div className="p-6 border-t border-slate-200 flex flex-wrap justify-between items-center bg-slate-50/80 gap-4">
                            <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                                Preserves <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:sup&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:inf&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:italic&gt;</code>, <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">&lt;ce:bold&gt;</code> tags.
                            </div>
                            <button 
                                onClick={runExtraction} 
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-3 cursor-pointer"
                            >
                                <Zap className="h-5 w-5 fill-white" />
                                Run Precision Extraction
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in flex-grow overflow-hidden">
                        {/* Control Toolbar */}
                        <div className="px-8 py-5 border-b border-slate-200 bg-white shadow-xs z-10 space-y-4">
                            <div className="flex flex-wrap justify-between items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => { setStep('input'); }}
                                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                        title="Back to Input"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                            Extracted Bibliography Report
                                            <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                                                {selectedIndices.size} of {results.length} Selected
                                            </span>
                                        </h3>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <button onClick={toggleAll} className="text-xs text-indigo-600 font-extrabold uppercase tracking-wider hover:underline">
                                                {selectedIndices.size === results.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Export Action Buttons */}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <button 
                                        onClick={handleDownloadSelected}
                                        disabled={selectedIndices.size === 0}
                                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black py-3 px-6 rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-2"
                                        title="Download .doc file that opens in MS Word with 100% formatted text"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span>Download .doc File</span>
                                    </button>

                                    <button 
                                        onClick={handleCopySelected} 
                                        disabled={selectedIndices.size === 0}
                                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-3 px-8 rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-2"
                                        title="Copy formatted HTML to Clipboard for instant pasting into MS Word"
                                    >
                                        <Copy className="h-4 w-4" />
                                        <span>Copy for Word (.docx)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Search & Filter Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                                {/* Format Filter Tabs */}
                                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button 
                                        onClick={() => setFilterFormat('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterFormat === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        All ({formatCounts.all})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('sup')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'sup' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Superscript <sup>x</sup> ({formatCounts.sup})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('sub')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'sub' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Subscript <sub>x</sub> ({formatCounts.sub})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('italic')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'italic' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Italics ({formatCounts.italic})
                                    </button>
                                    <button 
                                        onClick={() => setFilterFormat('bold')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterFormat === 'bold' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Bold ({formatCounts.bold})
                                    </button>
                                </div>

                                {/* View Mode Toggle & Search Box */}
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                        <input 
                                            type="text" 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search references or IDs..."
                                            className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
                                        />
                                    </div>

                                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                                        <button 
                                            onClick={() => setViewMode('rich')}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'rich' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                                            title="Word Rendered Preview"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>Word View</span>
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('code')}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'code' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                                            title="Raw HTML Tags Inspection"
                                        >
                                            <Code className="w-3.5 h-3.5" />
                                            <span>HTML Tags</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Reference Item List */}
                        <div className="flex-grow overflow-y-auto p-6 space-y-3 custom-scrollbar max-h-[580px]">
                            {filteredResults.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">
                                    <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm font-bold">No reference items match your filter criteria.</p>
                                </div>
                            ) : (
                                filteredResults.map(({ item, originalIndex }) => {
                                    const isSelected = selectedIndices.has(originalIndex);
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => toggleIndex(originalIndex)}
                                            className={`p-5 bg-white border-2 rounded-2xl shadow-2xs hover:shadow-md transition-all group flex items-start gap-4 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {/* Checkbox */}
                                            <div className="shrink-0 pt-0.5">
                                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                </div>
                                            </div>

                                            {/* Reference Content */}
                                            <div className="flex-grow min-w-0">
                                                {/* Header Badges */}
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className="text-[11px] font-mono font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                                                        ID: {item.id}
                                                    </span>
                                                    {item.label && (
                                                        <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                                                            Label: {item.label}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                                        {item.sourceType.replace('-', ' ')}
                                                    </span>

                                                    {/* Format Presence Badges */}
                                                    <div className="ml-auto flex items-center gap-1">
                                                        {item.hasSuperscript && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-purple-100 text-purple-700 border border-purple-200">
                                                                SUP <sup>x</sup>
                                                            </span>
                                                        )}
                                                        {item.hasSubscript && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-blue-100 text-blue-700 border border-blue-200">
                                                                SUB <sub>x</sub>
                                                            </span>
                                                        )}
                                                        {item.hasItalic && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-amber-100 text-amber-700 border border-amber-200 italic">
                                                                ITALIC
                                                            </span>
                                                        )}
                                                        {item.hasBold && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">
                                                                BOLD
                                                            </span>
                                                        )}
                                                        {item.hasSmallCaps && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase">
                                                                SMALL-CAPS
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Text Display */}
                                                {viewMode === 'rich' ? (
                                                    <div 
                                                        className="text-[14px] text-slate-800 leading-relaxed font-serif break-words p-3 bg-slate-50/60 rounded-xl border border-slate-100"
                                                        dangerouslySetInnerHTML={{ 
                                                            __html: `${item.label ? `<b class="font-bold text-slate-900">${item.label}</b> ` : ''}${item.formattedHtml}` 
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="bg-slate-900 text-emerald-300 p-3 rounded-xl font-mono text-[12px] leading-relaxed break-all border border-slate-800">
                                                        {item.label && <span className="text-amber-400 font-bold">&lt;b&gt;{item.label}&lt;/b&gt; </span>}
                                                        {item.formattedHtml}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Single Copy Action Button */}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard([item]); }}
                                                className="shrink-0 p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-xs"
                                                title="Copy single reference formatted for MS Word"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ReferenceExtractor;
