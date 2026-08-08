
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { 
    Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, 
    RefreshCw, Box, Search, Copy, Download, Check, FileText, Code, 
    Filter, ExternalLink, Sparkles, CheckSquare, Square, Layers, FileCode
} from 'lucide-react';
import { SmartSuggestion } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface OtherRefItem {
    index: number;
    id: string;
    label: string;
    originalLabel: string;
    labelType: 'numbered' | 'namedate' | 'unlabeled';
    rawText: string;
    formattedHtml: string;
    rawXml: string;
    doi?: string;
    url?: string;
}

const OtherRefScanner: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [results, setResults] = useState<OtherRefItem[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [step, setStep] = useState<'input' | 'report'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);

    // Search and Filtering
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'numbered' | 'namedate' | 'unlabeled' | 'doi'>('all');
    const [viewMode, setViewMode] = useState<'rich' | 'plain' | 'xml'>('rich');

    // Copy settings
    const [includeLabels, setIncludeLabels] = useState(true);
    const [hyperlinkDois, setHyperlinkDois] = useState(true);
    const [expandedXmlIndex, setExpandedXmlIndex] = useState<number | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    const extractOtherRefs = (xmlString: string): OtherRefItem[] => {
        const items: OtherRefItem[] = [];

        // DOM Parser Attempt
        let doc: Document | null = null;
        try {
            const parser = new DOMParser();
            const wrapped = `<root xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/struct-bib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink">${xmlString}</root>`;
            doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.getElementsByTagName('parsererror').length > 0) {
                doc = null;
            }
        } catch {
            doc = null;
        }

        const cleanTextStr = (str: string) => str.replace(/\s+/g, ' ').trim();

        if (doc) {
            let bibRefs = Array.from(doc.getElementsByTagName('ce:bib-reference'));
            if (bibRefs.length === 0) {
                const allElements = Array.from(doc.getElementsByTagName('*'));
                bibRefs = allElements.filter(el => el.localName === 'bib-reference');
            }

            if (bibRefs.length > 0) {
                bibRefs.forEach((bib, idx) => {
                    const otherRefNode = bib.getElementsByTagName('ce:other-ref')[0] || 
                                         Array.from(bib.getElementsByTagName('*')).find(el => el.localName === 'other-ref');
                    if (otherRefNode) {
                        const id = bib.getAttribute('id') || `bib${idx + 1}`;
                        const labelNode = bib.getElementsByTagName('ce:label')[0] || 
                                          Array.from(bib.getElementsByTagName('*')).find(el => el.localName === 'label');
                        const originalLabel = labelNode ? cleanTextStr(labelNode.textContent || '') : '';
                        
                        let labelType: 'numbered' | 'namedate' | 'unlabeled' = 'unlabeled';
                        let displayLabel = '';

                        if (originalLabel) {
                            if (!/[a-zA-Z]/.test(originalLabel)) {
                                labelType = 'numbered';
                                displayLabel = originalLabel;
                            } else {
                                labelType = 'namedate';
                                displayLabel = '';
                            }
                        }

                        let innerHtml = otherRefNode.innerHTML || '';
                        if (!innerHtml && otherRefNode.childNodes.length > 0) {
                            const serializer = new XMLSerializer();
                            innerHtml = Array.from(otherRefNode.childNodes).map(c => serializer.serializeToString(c)).join('');
                        }

                        const cleanText = cleanTextStr(otherRefNode.textContent || '');

                        let formattedHtml = innerHtml
                            .replace(/<ce:italic[^>]*>([\s\S]*?)<\/ce:italic>/gi, '<i>$1</i>')
                            .replace(/<ce:bold[^>]*>([\s\S]*?)<\/ce:bold>/gi, '<b>$1</b>')
                            .replace(/<ce:sup[^>]*>([\s\S]*?)<\/ce:sup>/gi, '<sup>$1</sup>')
                            .replace(/<ce:inf[^>]*>([\s\S]*?)<\/ce:inf>/gi, '<sub>$1</sub>')
                            .replace(/<ce:small-caps[^>]*>([\s\S]*?)<\/ce:small-caps>/gi, '<span style="font-variant: small-caps;">$1</span>')
                            .replace(/<ce:inter-ref[^>]*>([\s\S]*?)<\/ce:inter-ref>/gi, '$1')
                            .replace(/<ce:cross-ref[^>]*>([\s\S]*?)<\/ce:cross-ref>/gi, '$1')
                            .replace(/<(?!\/?(i|b|sup|sub|span|a)\b)[^>]+>/gi, '');

                        formattedHtml = cleanTextStr(formattedHtml);

                        const doiMatch = (cleanText + ' ' + formattedHtml).match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
                        const doi = doiMatch ? doiMatch[0].replace(/[.,;)]+$/, '') : undefined;

                        const urlMatch = (cleanText + ' ' + formattedHtml).match(/https?:\/\/[^\s<"']+/i);
                        const url = urlMatch ? urlMatch[0].replace(/[.,;)]+$/, '') : undefined;

                        const serializer = new XMLSerializer();
                        const rawXml = serializer.serializeToString(bib);

                        items.push({
                            index: idx,
                            id,
                            label: displayLabel,
                            originalLabel,
                            labelType,
                            rawText: cleanText,
                            formattedHtml: displayLabel ? `<b>${displayLabel}</b> ${formattedHtml}` : formattedHtml,
                            rawXml,
                            doi,
                            url
                        });
                    }
                });
            }
        }

        // Regex Fallback if DOM parser did not catch anything
        if (items.length === 0) {
            const bibRegex = /<ce:bib-reference\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ce:bib-reference>/gi;
            let match;
            let idx = 0;
            while ((match = bibRegex.exec(xmlString)) !== null) {
                const id = match[1];
                const content = match[2];
                if (/<ce:other-ref/i.test(content)) {
                    const labelMatch = content.match(/<ce:label>(.*?)<\/ce:label>/i);
                    const originalLabel = labelMatch ? cleanTextStr(labelMatch[1].replace(/<[^>]+>/g, '')) : '';
                    
                    let labelType: 'numbered' | 'namedate' | 'unlabeled' = 'unlabeled';
                    let displayLabel = '';

                    if (originalLabel) {
                        if (!/[a-zA-Z]/.test(originalLabel)) {
                            labelType = 'numbered';
                            displayLabel = originalLabel;
                        } else {
                            labelType = 'namedate';
                            displayLabel = '';
                        }
                    }

                    const otherRefMatch = content.match(/<ce:other-ref[^>]*>([\s\S]*?)<\/ce:other-ref>/i);
                    const rawInner = otherRefMatch ? otherRefMatch[1] : content;
                    const cleanText = cleanTextStr(rawInner.replace(/<[^>]+>/g, ' '));

                    let formattedHtml = rawInner
                        .replace(/<ce:italic[^>]*>/gi, '<i>')
                        .replace(/<\/ce:italic>/gi, '</i>')
                        .replace(/<ce:bold[^>]*>/gi, '<b>')
                        .replace(/<\/ce:bold>/gi, '</b>')
                        .replace(/<ce:sup[^>]*>/gi, '<sup>')
                        .replace(/<\/ce:sup>/gi, '</sup>')
                        .replace(/<ce:inf[^>]*>/gi, '<sub>')
                        .replace(/<\/ce:inf>/gi, '</sub>');
                    
                    formattedHtml = cleanTextStr(formattedHtml.replace(/<(?!\/?(i|b|sup|sub)\b)[^>]+>/gi, ''));

                    const doiMatch = (cleanText + ' ' + formattedHtml).match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
                    const doi = doiMatch ? doiMatch[0].replace(/[.,;)]+$/, '') : undefined;

                    const urlMatch = (cleanText + ' ' + formattedHtml).match(/https?:\/\/[^\s<"']+/i);
                    const url = urlMatch ? urlMatch[0].replace(/[.,;)]+$/, '') : undefined;

                    items.push({
                        index: idx++,
                        id,
                        label: displayLabel,
                        originalLabel,
                        labelType,
                        rawText: cleanText,
                        formattedHtml: displayLabel ? `<b>${displayLabel}</b> ${formattedHtml}` : formattedHtml,
                        rawXml: match[0],
                        doi,
                        url
                    });
                }
            }
        }

        // Direct standalone <ce:other-ref> fallback
        if (items.length === 0) {
            const otherRefRegex = /<ce:other-ref\b[^>]*>([\s\S]*?)<\/ce:other-ref>/gi;
            let match;
            let idx = 0;
            while ((match = otherRefRegex.exec(xmlString)) !== null) {
                const rawInner = match[1];
                const cleanText = cleanTextStr(rawInner.replace(/<[^>]+>/g, ' '));
                let formattedHtml = rawInner
                    .replace(/<ce:italic[^>]*>/gi, '<i>')
                    .replace(/<\/ce:italic>/gi, '</i>')
                    .replace(/<ce:bold[^>]*>/gi, '<b>')
                    .replace(/<\/ce:bold>/gi, '</b>')
                    .replace(/<ce:sup[^>]*>/gi, '<sup>')
                    .replace(/<\/ce:sup>/gi, '</sup>')
                    .replace(/<ce:inf[^>]*>/gi, '<sub>')
                    .replace(/<\/ce:inf>/gi, '</sub>');
                formattedHtml = cleanTextStr(formattedHtml.replace(/<(?!\/?(i|b|sup|sub)\b)[^>]+>/gi, ''));

                const doiMatch = cleanText.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
                const doi = doiMatch ? doiMatch[0].replace(/[.,;)]+$/, '') : undefined;

                items.push({
                    index: idx,
                    id: `or_${idx + 1}`,
                    label: '',
                    originalLabel: '',
                    labelType: 'unlabeled',
                    rawText: cleanText,
                    formattedHtml,
                    rawXml: match[0],
                    doi
                });
                idx++;
            }
        }

        return items;
    };

    const scanForOtherRefs = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const found = extractOtherRefs(input);

                if (found.length === 0) {
                    setToast({ msg: "No <ce:other-ref> items detected.", type: "info" });
                    setIsLoading(false);
                } else {
                    setResults(found);
                    setSelectedIndices(new Set(found.map((_, i) => i)));
                    setStep('report');
                    
                    // Background Scanner for Smart Suggestions
                    const newSuggestions: SmartSuggestion[] = [];
                    
                    if (input.includes('<ce:bib-reference')) {
                        newSuggestions.push({
                            id: 'xml-renumber',
                            toolName: 'XML Normalizer',
                            description: 'Bibliography detected. Ensure references are sequentially numbered and cross-references updated.',
                            path: '/xmlRenumber',
                            icon: <Hash className="w-4 h-4" />,
                            condition: 'Bibliography detected'
                        });
                    }

                    const tagMatches = input.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
                    if (tagMatches.length > 0) {
                        newSuggestions.push({
                            id: 'tag-cleaner',
                            toolName: 'XML Tag Cleaner',
                            description: `Detected ${tagMatches.length} editorial tag(s) (DEL/INS/Comment). Clean before finalizing.`,
                            path: '/tagCleaner',
                            icon: <Trash2 className="w-4 h-4" />,
                            condition: 'Editorial tags detected'
                        });
                    }

                    const unlinkedCitations = (input.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
                    if (unlinkedCitations > 0) {
                        newSuggestions.push({
                            id: 'citation-linker',
                            toolName: 'Citation Linker Pro',
                            description: `Detected ${unlinkedCitations} unlinked Cross-ref(s). Link citations automatically.`,
                            path: '/citationLinker',
                            icon: <LinkIcon className="w-4 h-4" />,
                            condition: 'Unlinked citations detected'
                        });
                    }

                    if (input.includes('<ce:bibliography')) {
                        newSuggestions.push({
                            id: 'uncited-cleaner',
                            toolName: 'Uncited Ref Cleaner',
                            description: 'Identify and remove uncited bibliography references automatically.',
                            path: '/uncitedCleaner',
                            icon: <Eraser className="w-4 h-4" />,
                            condition: 'Bibliography detected'
                        });
                    }

                    if (input.includes('<ce:source-text') || !input.includes('<sb:reference')) {
                        newSuggestions.push({
                            id: 'structural-architect',
                            toolName: 'Reference Structure Repair v3.2',
                            description: 'Convert unstructured or raw source text into structured bibliography nodes.',
                            path: '/structuralArchitect',
                            icon: <Box className="w-4 h-4" />,
                            condition: 'Structural overhaul recommended'
                        });
                    }

                    setSuggestions(newSuggestions);
                    setToast({ msg: `Successfully isolated ${found.length} other-ref item(s).`, type: "success" });
                    setIsLoading(false);
                }
            } catch {
                setToast({ msg: "Extraction failed. Check XML validity.", type: "error" });
                setIsLoading(false);
            }
        }, 500);
    };

    // Filtered Results
    const filteredResults = useMemo(() => {
        return results.filter(item => {
            // Category Filter
            if (activeFilter === 'numbered' && item.labelType !== 'numbered') return false;
            if (activeFilter === 'namedate' && item.labelType !== 'namedate') return false;
            if (activeFilter === 'unlabeled' && item.labelType !== 'unlabeled') return false;
            if (activeFilter === 'doi' && !item.doi) return false;

            // Search Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchId = item.id.toLowerCase().includes(q);
                const matchLabel = item.label.toLowerCase().includes(q) || item.originalLabel.toLowerCase().includes(q);
                const matchText = item.rawText.toLowerCase().includes(q);
                const matchDoi = item.doi ? item.doi.toLowerCase().includes(q) : false;
                return matchId || matchLabel || matchText || matchDoi;
            }

            return true;
        });
    }, [results, activeFilter, searchQuery]);

    // Metrics
    const metrics = useMemo(() => {
        const total = results.length;
        const numbered = results.filter(r => r.labelType === 'numbered').length;
        const namedate = results.filter(r => r.labelType === 'namedate').length;
        const unlabeled = results.filter(r => r.labelType === 'unlabeled').length;
        const withDoi = results.filter(r => !!r.doi).length;
        return { total, numbered, namedate, unlabeled, withDoi };
    }, [results]);

    const toggleIndex = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) {
            next.delete(index);
        } else {
            next.add(index);
        }
        setSelectedIndices(next);
    };

    const toggleAllFiltered = () => {
        const filteredIndices = filteredResults.map(r => r.index);
        const allFilteredSelected = filteredIndices.every(idx => selectedIndices.has(idx));

        const next = new Set(selectedIndices);
        if (allFilteredSelected) {
            filteredIndices.forEach(idx => next.delete(idx));
        } else {
            filteredIndices.forEach(idx => next.add(idx));
        }
        setSelectedIndices(next);
    };

    const selectByCategory = (cat: 'numbered' | 'namedate' | 'unlabeled' | 'doi') => {
        const targetIndices = results
            .filter(r => {
                if (cat === 'numbered') return r.labelType === 'numbered';
                if (cat === 'namedate') return r.labelType === 'namedate';
                if (cat === 'unlabeled') return r.labelType === 'unlabeled';
                if (cat === 'doi') return !!r.doi;
                return true;
            })
            .map(r => r.index);

        setSelectedIndices(new Set(targetIndices));
        setToast({ msg: `Selected ${targetIndices.length} item(s) matching criteria.`, type: "info" });
    };

    const formatItemHtml = (item: OtherRefItem): string => {
        let contentHtml = item.formattedHtml;

        if (!includeLabels && item.label) {
            // Strip leading label tag if user disabled labels
            contentHtml = contentHtml.replace(/^<b>.*?<\/b>\s*/i, '');
        }

        if (hyperlinkDois && item.doi) {
            const doiUrl = item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`;
            contentHtml = contentHtml.replace(
                new RegExp(item.doi.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g'),
                `<a href="${doiUrl}" style="color: #4f46e5; text-decoration: underline;" target="_blank">${item.doi}</a>`
            );
        }

        return contentHtml;
    };

    const formatItemPlainText = (item: OtherRefItem): string => {
        const labelPrefix = (includeLabels && item.label) ? `${item.label} ` : '';
        return `${labelPrefix}${item.rawText}`;
    };

    const copyItemsToClipboard = async (items: OtherRefItem[], format: 'html' | 'plain' | 'xml') => {
        if (items.length === 0) {
            setToast({ msg: "No items selected to copy.", type: "warn" });
            return;
        }

        try {
            if (format === 'html') {
                const htmlContent = items.map(item => `<p style="margin-bottom: 8px;">${formatItemHtml(item)}</p>`).join('\n');
                const plainText = items.map(item => formatItemPlainText(item)).join('\n');

                const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
                const textBlob = new Blob([plainText], { type: 'text/plain' });

                if (typeof ClipboardItem !== 'undefined') {
                    const data = [new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })];
                    await navigator.clipboard.write(data);
                    setToast({ msg: `Copied ${items.length} formatted item(s) to clipboard for Word.`, type: "success" });
                } else {
                    await navigator.clipboard.writeText(plainText);
                    setToast({ msg: `Copied ${items.length} item(s) as plain text.`, type: "warn" });
                }
            } else if (format === 'plain') {
                const textContent = items.map(item => formatItemPlainText(item)).join('\n');
                await navigator.clipboard.writeText(textContent);
                setToast({ msg: `Copied ${items.length} plain-text reference(s).`, type: "success" });
            } else if (format === 'xml') {
                const xmlContent = items.map(item => item.rawXml).join('\n\n');
                await navigator.clipboard.writeText(xmlContent);
                setToast({ msg: `Copied ${items.length} raw XML reference block(s).`, type: "success" });
            }
        } catch {
            setToast({ msg: "Failed to access clipboard.", type: "error" });
        }
    };

    const copySingleItem = async (item: OtherRefItem, format: 'html' | 'plain' | 'xml', e: React.MouseEvent) => {
        e.stopPropagation();
        await copyItemsToClipboard([item], format);
        setCopiedIndex(item.index);
        setTimeout(() => setCopiedIndex(null), 1800);
    };

    const downloadFile = (filename: string, content: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ msg: `Downloaded ${filename}`, type: "success" });
    };

    const exportSelected = (type: 'docx' | 'txt' | 'xml' | 'json') => {
        const selectedItems = results.filter(r => selectedIndices.has(r.index));
        if (selectedItems.length === 0) {
            setToast({ msg: "No items selected to export.", type: "warn" });
            return;
        }

        if (type === 'docx') {
            const htmlDoc = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Isolated Other-Ref Bibliography</title>
    <style>
        body { font-family: "Calibri", "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #111827; }
        p { margin-bottom: 8pt; text-indent: -0.25in; padding-left: 0.25in; }
        b { font-weight: bold; }
        i { font-style: italic; }
        a { color: #2563eb; text-decoration: underline; }
    </style>
</head>
<body>
    <h2>Isolated Unstructured Bibliography Items (${selectedItems.length})</h2>
    ${selectedItems.map(item => `<p>${formatItemHtml(item)}</p>`).join('\n')}
</body>
</html>`;
            downloadFile(`isolated_other_refs_${Date.now()}.doc`, htmlDoc, 'application/msword');
        } else if (type === 'txt') {
            const textContent = selectedItems.map(item => formatItemPlainText(item)).join('\n\n');
            downloadFile(`isolated_other_refs_${Date.now()}.txt`, textContent, 'text/plain');
        } else if (type === 'xml') {
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ce:bibliography xmlns:ce="http://www.elsevier.com/xml/common/dtd">\n` + 
                selectedItems.map(item => `  ${item.rawXml}`).join('\n') + `\n</ce:bibliography>`;
            downloadFile(`isolated_other_refs_${Date.now()}.xml`, xmlContent, 'application/xml');
        } else if (type === 'json') {
            const jsonContent = JSON.stringify(selectedItems.map(item => ({
                id: item.id,
                label: item.label,
                originalLabel: item.originalLabel,
                labelType: item.labelType,
                rawText: item.rawText,
                formattedHtml: formatItemHtml(item),
                doi: item.doi,
                url: item.url,
                rawXml: item.rawXml
            })), null, 2);
            downloadFile(`isolated_other_refs_${Date.now()}.json`, jsonContent, 'application/json');
        }
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? scanForOtherRefs : () => copyItemsToClipboard(results.filter(r => selectedIndices.has(r.index)), 'html'),
        onClear: () => { setInput(''); setResults([]); setStep('input'); setSelectedIndices(new Set()); setSearchQuery(''); }
    }, [input, results, step, selectedIndices]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-8 text-center animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold mb-3 border border-amber-200">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Elsevier XML Citation Processor
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-2">Other-Ref Scanner Pro</h1>
                <p className="text-base text-slate-500 max-w-2xl mx-auto font-light">
                    Isolate, audit, and export unstructured <code className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono text-sm">&lt;ce:other-ref&gt;</code> elements with automatic Name-date label suppression and rich format copying.
                </p>
            </div>

            {/* Smart Suggestions Section */}
            {suggestions.length > 0 && step === 'report' && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="p-5 bg-indigo-50/40 border border-indigo-100 rounded-[2rem]">
                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: input, sourceTool: 'Other-Ref Scanner' } });
                                    }}
                                    className="flex items-center gap-3 p-3.5 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="text-[11px] font-black text-indigo-900 uppercase tracking-wide truncate">{sug.toolName}</div>
                                        <div className="text-[10px] text-indigo-500 font-medium leading-tight line-clamp-1">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden min-h-[720px] flex flex-col relative">
                {isLoading && <LoadingOverlay message="Parsing & Isolating Other-Refs..." color="orange" />}

                {step === 'input' && (
                    <div className="flex flex-col h-full flex-grow animate-fade-in">
                        <div className="bg-slate-50 px-8 py-4 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <FileCode className="w-4 h-4 text-amber-600" />
                                <label className="font-bold text-slate-800 text-xs uppercase tracking-wider">Bibliography XML Source Input</label>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-slate-400 font-mono">{input ? `${input.length.toLocaleString()} chars` : 'Empty'}</span>
                                <button onClick={() => setInput('')} className="text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors">Clear</button>
                            </div>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-8 font-mono text-xs sm:text-sm border-0 focus:ring-0 resize-none bg-transparent min-h-[480px] leading-relaxed" 
                            placeholder="Paste your XML document or bibliography section here... The tool will isolate all <ce:other-ref> items, remove Name-date labels automatically, preserve formatting, and provide Word-ready exports."
                            spellCheck={false}
                        />
                        <div className="p-6 border-t border-slate-100 flex flex-wrap justify-between items-center gap-4 bg-slate-50/70">
                            <div className="text-xs text-slate-500 font-medium">
                                Shortcut: <kbd className="px-2 py-1 bg-white border border-slate-200 rounded font-mono text-[10px] shadow-xs">Ctrl + Enter</kbd> to run scan
                            </div>
                            <button 
                                onClick={scanForOtherRefs} 
                                className="bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 px-10 rounded-2xl shadow-xl shadow-amber-200 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center gap-2.5"
                            >
                                <Search className="w-4 h-4" />
                                Extract & Audit Other-Refs
                            </button>
                        </div>
                    </div>
                )}

                {step === 'report' && (
                    <div className="flex flex-col h-full flex-grow bg-slate-50/50 animate-fade-in overflow-hidden">
                        
                        {/* Top Summary Bar */}
                        <div className="px-8 py-5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4 shadow-xs z-10">
                            <div className="flex items-center gap-6">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Other-Ref Audit Results</h3>
                                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-black rounded-full">
                                            {metrics.total} Found
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-medium">
                                        <span>Selected: <strong className="text-slate-900 font-black">{selectedIndices.size}</strong> of {results.length}</span>
                                        <span>•</span>
                                        <span>Numbered: <strong className="text-emerald-600">{metrics.numbered}</strong></span>
                                        <span>•</span>
                                        <span>Name-Date: <strong className="text-indigo-600">{metrics.namedate}</strong></span>
                                        <span>•</span>
                                        <span>DOIs: <strong className="text-amber-600">{metrics.withDoi}</strong></span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => { setStep('input'); setSelectedIndices(new Set()); }} 
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all uppercase"
                                >
                                    New Input
                                </button>
                                
                                <div className="h-6 w-px bg-slate-200 my-auto"></div>

                                {/* Quick Export Buttons */}
                                <button 
                                    onClick={() => copyItemsToClipboard(results.filter(r => selectedIndices.has(r.index)), 'html')}
                                    disabled={selectedIndices.size === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-2.5 px-5 rounded-xl shadow-md active:scale-95 transition-all uppercase text-xs tracking-wider flex items-center gap-2"
                                    title="Copy rich text for Microsoft Word"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy for Word ({selectedIndices.size})
                                </button>

                                <div className="relative group">
                                    <button 
                                        disabled={selectedIndices.size === 0}
                                        className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all uppercase text-xs tracking-wider flex items-center gap-1.5"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Export
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 hidden group-hover:block z-50">
                                        <button onClick={() => exportSelected('docx')} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5" /> Word Document (.doc)
                                        </button>
                                        <button onClick={() => exportSelected('txt')} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2">
                                            <FileCode className="w-3.5 h-3.5" /> Plain Text (.txt)
                                        </button>
                                        <button onClick={() => exportSelected('xml')} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2">
                                            <Code className="w-3.5 h-3.5" /> Clean XML (.xml)
                                        </button>
                                        <button onClick={() => exportSelected('json')} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2">
                                            <Layers className="w-3.5 h-3.5" /> JSON Structure (.json)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Control Toolbar */}
                        <div className="px-8 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                            {/* Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                                    <Filter className="w-3 h-3" /> Filter:
                                </span>
                                {[
                                    { id: 'all', label: `All (${metrics.total})` },
                                    { id: 'numbered', label: `Numbered (${metrics.numbered})` },
                                    { id: 'namedate', label: `Name-Date (${metrics.namedate})` },
                                    { id: 'unlabeled', label: `Unlabeled (${metrics.unlabeled})` },
                                    { id: 'doi', label: `With DOI (${metrics.withDoi})` },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
                                        className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${activeFilter === tab.id ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Search Input */}
                            <div className="relative flex-grow max-w-xs">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search ID, text, DOI..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold">×</button>
                                )}
                            </div>

                            {/* View & Copy Options */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-bold text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={includeLabels} 
                                            onChange={e => setIncludeLabels(e.target.checked)} 
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Include Labels
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-bold text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={hyperlinkDois} 
                                            onChange={e => setHyperlinkDois(e.target.checked)} 
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Hyperlink DOIs
                                    </label>
                                </div>

                                <div className="flex bg-white rounded-lg p-0.5 border border-slate-200">
                                    <button 
                                        onClick={() => setViewMode('rich')} 
                                        className={`px-2.5 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'rich' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Rich View
                                    </button>
                                    <button 
                                        onClick={() => setViewMode('plain')} 
                                        className={`px-2.5 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'plain' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Plain Text
                                    </button>
                                    <button 
                                        onClick={() => setViewMode('xml')} 
                                        className={`px-2.5 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'xml' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Raw XML
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Bulk Selection Bar */}
                        <div className="px-8 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={toggleAllFiltered} 
                                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                >
                                    {filteredResults.every(r => selectedIndices.has(r.index)) ? (
                                        <> <CheckSquare className="w-4 h-4 text-indigo-600" /> Deselect Visible ({filteredResults.length}) </>
                                    ) : (
                                        <> <Square className="w-4 h-4 text-slate-400" /> Select Visible ({filteredResults.length}) </>
                                    )}
                                </button>
                                <span className="text-slate-300">|</span>
                                <button onClick={() => selectByCategory('numbered')} className="text-slate-500 hover:text-indigo-600 font-medium">Select Numbered</button>
                                <button onClick={() => selectByCategory('namedate')} className="text-slate-500 hover:text-indigo-600 font-medium">Select Name-Date</button>
                                <button onClick={() => selectByCategory('doi')} className="text-slate-500 hover:text-indigo-600 font-medium">Select With DOI</button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => copyItemsToClipboard(results.filter(r => selectedIndices.has(r.index)), 'plain')}
                                    disabled={selectedIndices.size === 0}
                                    className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 disabled:opacity-40"
                                >
                                    Copy Selected as Text
                                </button>
                                <span className="text-slate-300">•</span>
                                <button 
                                    onClick={() => copyItemsToClipboard(results.filter(r => selectedIndices.has(r.index)), 'xml')}
                                    disabled={selectedIndices.size === 0}
                                    className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 disabled:opacity-40"
                                >
                                    Copy Selected as XML
                                </button>
                            </div>
                        </div>

                        {/* Main Item List */}
                        <div className="flex-grow overflow-y-auto p-6 sm:p-8 space-y-4 custom-scrollbar">
                            {filteredResults.length === 0 ? (
                                <div className="py-16 text-center text-slate-400">
                                    <Search className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-1" />
                                    <p className="text-sm font-bold text-slate-600">No references match your search filter.</p>
                                    <p className="text-xs text-slate-400 mt-1">Try resetting the search query or category filter tabs.</p>
                                </div>
                            ) : (
                                filteredResults.map((item) => {
                                    const isSelected = selectedIndices.has(item.index);
                                    const isXmlExpanded = expandedXmlIndex === item.index;
                                    const isCopied = copiedIndex === item.index;

                                    return (
                                        <div 
                                            key={item.index} 
                                            onClick={() => toggleIndex(item.index)}
                                            className={`p-6 bg-white border-2 rounded-3xl shadow-2xs hover:shadow-md transition-all group flex flex-col gap-3 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200/80 hover:border-slate-300'}`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                                                    </div>
                                                    
                                                    <span className="text-[10px] font-mono font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md uppercase tracking-wider">
                                                        {item.id}
                                                    </span>

                                                    {item.labelType === 'numbered' ? (
                                                        <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                                            Label: {item.label}
                                                        </span>
                                                    ) : item.labelType === 'namedate' ? (
                                                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                                                            Suppressed Label: {item.originalLabel}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                                            Unlabeled
                                                        </span>
                                                    )}

                                                    {item.doi && (
                                                        <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                                                            <ExternalLink className="w-3 h-3 text-amber-600" />
                                                            DOI: {item.doi}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Single Item Quick Actions */}
                                                <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                                                    {isCopied && (
                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Copied!</span>
                                                    )}
                                                    <button 
                                                        onClick={(e) => copySingleItem(item, 'html', e)}
                                                        className="px-2.5 py-1 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors flex items-center gap-1"
                                                        title="Copy Word HTML"
                                                    >
                                                        <Copy className="w-3 h-3" /> Word
                                                    </button>
                                                    <button 
                                                        onClick={(e) => copySingleItem(item, 'plain', e)}
                                                        className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                                                        title="Copy Plain Text"
                                                    >
                                                        Text
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setExpandedXmlIndex(isXmlExpanded ? null : item.index); }}
                                                        className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors ${isXmlExpanded ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                    >
                                                        XML
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Item Content View */}
                                            {viewMode === 'rich' && (
                                                <div 
                                                    className="text-sm text-slate-800 leading-relaxed font-serif pl-8 pr-2 break-words"
                                                    dangerouslySetInnerHTML={{ __html: formatItemHtml(item) }}
                                                />
                                            )}

                                            {viewMode === 'plain' && (
                                                <div className="text-sm text-slate-800 leading-relaxed font-mono pl-8 pr-2 break-words select-all">
                                                    {formatItemPlainText(item)}
                                                </div>
                                            )}

                                            {viewMode === 'xml' && (
                                                <pre className="text-xs font-mono bg-slate-900 text-amber-300 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                                                    {item.rawXml}
                                                </pre>
                                            )}

                                            {/* Collapsible Individual Raw XML snippet */}
                                            {viewMode !== 'xml' && isXmlExpanded && (
                                                <div className="mt-2 pl-8 animate-fade-in" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Raw Reference XML Node</span>
                                                        <button 
                                                            onClick={(e) => copySingleItem(item, 'xml', e)}
                                                            className="text-[10px] font-bold text-amber-600 hover:underline flex items-center gap-1"
                                                        >
                                                            <Copy className="w-3 h-3" /> Copy XML Snippet
                                                        </button>
                                                    </div>
                                                    <pre className="text-xs font-mono bg-slate-900 text-slate-200 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed select-all border border-slate-800">
                                                        {item.rawXml}
                                                    </pre>
                                                </div>
                                            )}
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

export default OtherRefScanner;
