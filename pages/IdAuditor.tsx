import React, { useState, useRef, useEffect } from 'react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { ChevronUp, ChevronDown, GitCompare, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { SmartSuggestion, ToolId } from '../types';
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
    isDuplicate: boolean;
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
    { tag: 'ce:cross-refs', prefix: 'cf' },
    { tag: 'ce:para', prefix: 'p' },
    { tag: 'ce:simple-para', prefix: 'sp' },
    { tag: 'ce:other-ref', prefix: 'or' },
    { tag: 'ce:textref', prefix: 'tr' }
];

const IdAuditor: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [auditResults, setAuditResults] = useState<AuditItem[]>([]);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [step, setStep] = useState<'input' | 'audit' | 'result'>('input');
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

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
        let changeCount = 0;

        let i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';

            if (current.removed && diff[i+1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
                changeCount++;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
                changeCount++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
                changeCount++;
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
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-75"
                        data-change-row={type !== 'equal' ? "true" : undefined}
                        data-change-index={type !== 'equal' ? changeCount : undefined}
                        data-change-index-group={type !== 'equal' ? changeCount : undefined}
                    >
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 select-none bg-slate-50 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-xs text-slate-400 p-1 border-r border-slate-200 border-l select-none bg-slate-50 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-tight ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                 );
            }
        }
        
        setTotalChanges(changeCount);
        setCurrentChangeIndex(changeCount > 0 ? 1 : 0);

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

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || totalChanges === 0) return;

        let nextIndex = direction === 'next' ? currentChangeIndex + 1 : currentChangeIndex - 1;
        if (nextIndex > totalChanges) nextIndex = 1;
        if (nextIndex < 1) nextIndex = totalChanges;

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current || currentChangeIndex === 0) return;

        const allRows = diffContainerRef.current.querySelectorAll('tr[data-change-index-group]');
        allRows.forEach(row => row.classList.remove('bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10', 'relative'));

        const activeRows = diffContainerRef.current.querySelectorAll(`tr[data-change-index-group="${currentChangeIndex}"]`);
        activeRows.forEach(row => {
            row.classList.add('bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10', 'relative');
        });
    }, [currentChangeIndex]);

    const runAudit = () => {
        if (!input.trim()) {
            setToast({ msg: "Please paste your XML content.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const results: AuditItem[] = [];
                const idMap = new Map<string, number>(); // Track ID occurrences
                
                ID_CONFIG.forEach(({ tag, prefix }) => {
                    const tagRegex = new RegExp(`<${tag}\\b([^>]*?)>`, 'g');
                    const strictIdRegex = new RegExp(`^${prefix}\\d{4}$`, 'i');
                    let match;
                    while ((match = tagRegex.exec(input)) !== null) {
                        const fullOpeningTag = match[0];
                        const attrs = match[1];
                        const idMatch = attrs.match(/\bid="([^"]+)"/);
                        const originalId = idMatch ? idMatch[1] : "";
                        
                        if (originalId) {
                            // Track duplicates
                            idMap.set(originalId, (idMap.get(originalId) || 0) + 1);
                        }

                        const elementEndIdx = input.indexOf(`</${tag}>`, match.index);
                        const elementContent = elementEndIdx !== -1 
                            ? input.substring(match.index, elementEndIdx + `</${tag}>`.length)
                            : fullOpeningTag;

                        const isValidId = originalId ? strictIdRegex.test(originalId) : false;
                        const isPrefixValid = originalId ? originalId.toLowerCase().startsWith(prefix) : false;
                        const isLengthViolation = isPrefixValid && !isValidId;

                        const isOtherRef = elementContent.includes('<ce:other-ref');
                        
                        // Name Spacing Logic: Detect spaces between initials in <ce:given-name> or <sb:given-name>
                        const nameSpacingRegex = /<(?:ce|sb):given-name\b[^>]*>(.*?)<\/(?:ce|sb):given-name>/gi;
                        let hasNameSpacingViolation = false;
                        let nameMatch;
                        while ((nameMatch = nameSpacingRegex.exec(elementContent)) !== null) {
                            const nameText = nameMatch[1];
                            if (/\b[A-Z](?!\s*[\-–—\u2010-\u2015])(?![\-–—\u2010-\u2015a-zA-Z\u00C0-\u024F\.'’ʻ])/.test(nameText) || /\. +(?=[A-Z]\.)/.test(nameText)) {
                                hasNameSpacingViolation = true;
                                break;
                            }
                        }

                        results.push({
                            id: originalId || '[MISSING ID]',
                            originalId: originalId,
                            tagName: tag,
                            expectedPrefix: prefix,
                            status: 'valid', // Will update below
                            isOtherRef,
                            hasNameSpacingViolation,
                            isLengthViolation,
                            isDuplicate: false, // Will update below
                            preview: elementContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) + '...',
                            fullTag: fullOpeningTag
                        });
                    }
                });

                // Post-process for duplicates and final status
                results.forEach(item => {
                    if (item.originalId) {
                        item.isDuplicate = (idMap.get(item.originalId) || 0) > 1;
                    }
                    const strictIdRegex = new RegExp(`^${item.expectedPrefix}\\d{4}$`, 'i');
                    const isValidId = item.originalId ? strictIdRegex.test(item.originalId) : false;
                    
                    if (!item.originalId || !isValidId || item.hasNameSpacingViolation || item.isDuplicate) {
                        item.status = 'invalid';
                    }
                });

                // Smart Suggestions Logic (Background Scanner)
                const newSuggestions: SmartSuggestion[] = [];
                
                // 1. XML Normalizer (Renumber)
                const labelRegex = /<ce:label>\[?(\d+)\]?<\/ce:label>/gi;
                let lastLabel = 0;
                let outOfSequence = false;
                let labelMatch;
                while ((labelMatch = labelRegex.exec(input)) !== null) {
                    const currentLabel = parseInt(labelMatch[1]);
                    if (currentLabel !== lastLabel + 1 && lastLabel !== 0) {
                        outOfSequence = true;
                        break;
                    }
                    lastLabel = currentLabel;
                }
                if (outOfSequence) {
                    newSuggestions.push({
                        id: 'xml-renumber',
                        toolName: 'XML Normalizer',
                        description: 'It is found that the XML contains out-of-sequence numbered references. Please use the XML Normalizer to re-sequence the bibliography.',
                        path: '/xmlRenumber',
                        icon: <Hash className="w-4 h-4" />,
                        condition: 'Out-of-sequence references detected'
                    });
                }

                // 2. Other-Refs Scanner
                const otherRefCount = (input.match(/<ce:other-ref/g) || []).length;
                if (otherRefCount > 0) {
                    newSuggestions.push({
                        id: 'other-ref',
                        toolName: 'Other-Ref Scanner',
                        description: `It is found that the XML contains ${otherRefCount} other-ref(s). Please use the Other-Refs Scanner.`,
                        path: '/otherRefScanner',
                        icon: <LinkIcon className="w-4 h-4" />,
                        condition: 'Other-refs detected'
                    });
                }

                // 3. XML Tag Cleaner
                const tagMatches = input.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
                if (tagMatches.length > 0) {
                    newSuggestions.push({
                        id: 'tag-cleaner',
                        toolName: 'XML Tag Cleaner',
                        description: `It is found that the XML contains ${tagMatches.length} editorial tag(s) (DEL/INS/Comment). Please use the XML Tag Cleaner.`,
                        path: '/tagCleaner',
                        icon: <Trash2 className="w-4 h-4" />,
                        condition: 'Editorial tags detected'
                    });
                }

                // 4. Citation Linker Pro
                const unlinkedCitations = (input.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
                if (unlinkedCitations > 0) {
                    newSuggestions.push({
                        id: 'citation-linker',
                        toolName: 'Citation Linker Pro',
                        description: `It is found that the XML result contains ${unlinkedCitations} unlinked Cross-ref(s). Please use the Citation Linker Pro.`,
                        path: '/citationLinker',
                        icon: <LinkIcon className="w-4 h-4" />,
                        condition: 'Unlinked citations detected'
                    });
                }

                // 5. Uncited Ref Cleaner
                const bibRefIds = Array.from(input.matchAll(/<ce:bib-reference\b[^>]*?\bid="([^"]+)"/g)).map(m => m[1]);
                if (bibRefIds.length > 0) {
                    const crossRefIds = new Set(Array.from(input.matchAll(/\brefid="([^"]+)"/g)).map(m => m[1]));
                    const uncited = bibRefIds.filter(id => !crossRefIds.has(id));
                    if (uncited.length > 0) {
                        newSuggestions.push({
                            id: 'uncited-cleaner',
                            toolName: 'Uncited Ref Cleaner',
                            description: `It is found that the XML contains ${uncited.length} reference(s) that are not cited in the text. Please use the Uncited Ref Cleaner to identify and remove them.`,
                            path: '/uncitedCleaner',
                            icon: <Eraser className="w-4 h-4" />,
                            condition: 'Uncited references detected'
                        });
                    }
                }

                // 6. View Synchronizer
                const complexNodeCount = (input.match(/<(ce:table|ce:figure|ce:display-formula|ce:list)\b/g) || []).length;
                if (complexNodeCount > 0 && input.includes('<ce:para>')) {
                    newSuggestions.push({
                        id: 'view-sync',
                        toolName: 'View Synchronizer',
                        description: `It is found that the XML contains ${complexNodeCount} complex structural nodes. Please use the View Synchronizer to ensure visual consistency between XML source and rendered views.`,
                        path: '/viewSync',
                        icon: <RefreshCw className="w-4 h-4" />,
                        condition: 'Complex structural nodes detected'
                    });
                }

                // 7. Structural Node Architect
                if (input.includes('<ce:source-text')) {
                    newSuggestions.push({
                        id: 'structural-architect',
                        toolName: 'Structural Node Architect v3.2',
                        description: 'It is found that the XML contains unstructured source text. Please use the Structural Node Architect to transform raw source text into valid structural bibliography nodes.',
                        path: '/structuralArchitect',
                        icon: <Box className="w-4 h-4" />,
                        condition: 'Structural overhaul recommended'
                    });
                }

                setSuggestions(newSuggestions);

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
                
                // 1. Surgical Given-Name Spacing Fix (Shield <ce:author-group> from changes)
                const authorGroupPlaceholders: string[] = [];
                processedXml = processedXml.replace(/<ce:author-group\b[^>]*>[\s\S]*?<\/ce:author-group>/gi, (match) => {
                    authorGroupPlaceholders.push(match);
                    return `___AUTHOR_GROUP_PLACEHOLDER_${authorGroupPlaceholders.length - 1}___`;
                });

                processedXml = processedXml.replace(/(<(?:ce|sb):given-name\b[^>]*>)(.*?)(<\/(?:ce|sb):given-name>)/gi, (match, open, content, close) => {
                    let fixed = content.replace(/\b([A-Z])(?!\s*[\-–—\u2010-\u2015])(?![\-–—\u2010-\u2015a-zA-Z\u00C0-\u024F\.'’ʻ])/g, '$1.');
                    let prev;
                    do {
                        prev = fixed;
                        fixed = fixed.replace(/([A-Z]\.)\s+([A-Z]\.)/g, '$1$2');
                    } while (fixed !== prev);
                    return `${open}${fixed}${close}`;
                });

                // Restore <ce:author-group> blocks unmodified
                processedXml = processedXml.replace(/___AUTHOR_GROUP_PLACEHOLDER_(\d+)___/g, (_, index) => {
                    return authorGroupPlaceholders[parseInt(index, 10)] || '';
                });

                // 2. ID Mapping & Replacement Logic
                const mapping = new Map<string, string>();
                const counters: Record<string, number> = { bb: 3000, rf: 3000, se: 3000, ir: 3000, ca: 3000, cf: 3000, or: 3000, tr: 3000, p: 3000, sp: 3000 };
                const seenIdsInOriginal = new Set<string>();
                
                // First pass: Find ALL existing IDs in the document to avoid collisions
                const allIdRegex = /\bid="([^"]+)"/g;
                let idMatch;
                while ((idMatch = allIdRegex.exec(input)) !== null) {
                    const existingId = idMatch[1];
                    seenIdsInOriginal.add(existingId);
                    
                    // Also update counters to be at least as high as existing valid sequences
                    // LOGIC FIX: Only use 4-digit IDs to set the floor. 
                    // Long IDs (like timestamps) should be ignored so they don't "poison" the counter.
                    const prefixMatch = existingId.match(/^([a-z]{2})(\d{4})$/i);
                    if (prefixMatch) {
                        const pre = prefixMatch[1].toLowerCase();
                        const num = parseInt(prefixMatch[2]);
                        if (counters[pre] !== undefined) {
                            // Align to the next multiple of 5 above the current numeric ID
                            const nextMultiple = Math.ceil((num + 1) / 5) * 5;
                            if (nextMultiple > counters[pre]) {
                                counters[pre] = nextMultiple;
                            }
                        }
                    }
                }

                // Ensure counters start at least at 3000 if they are low (protocol standard)
                Object.keys(counters).forEach(k => {
                    if (counters[k] < 3000) counters[k] = 3000;
                    // Double check alignment for the starting point
                    if (counters[k] % 5 !== 0) counters[k] = Math.ceil(counters[k] / 5) * 5;
                });

                const seenIdsInOutput = new Set<string>();

                // We iterate through each tag type and replace occurrences one by one
                ID_CONFIG.forEach(({ tag, prefix }) => {
                    const tagRegex = new RegExp(`<${tag}\\b([^>]*?)>`, 'g');
                    processedXml = processedXml.replace(tagRegex, (match, attrs) => {
                        const idMatch = attrs.match(/\bid="([^"]+)"/);
                        const id = idMatch ? idMatch[1] : "";
                        
                        const strictIdRegex = new RegExp(`^${prefix}\\d{4}$`, 'i');
                        const isInvalid = !id || !strictIdRegex.test(id);
                        const isDuplicate = id && seenIdsInOutput.has(id);

                        if (isInvalid || isDuplicate) {
                            // Find next available ID
                            let newId = '';
                            do {
                                const newIdNum = counters[prefix].toString().padStart(4, '0');
                                newId = `${prefix}${newIdNum}`;
                                counters[prefix] += 5;
                            } while (seenIdsInOriginal.has(newId) || seenIdsInOutput.has(newId));

                            if (id) mapping.set(id, newId);
                            seenIdsInOutput.add(newId);
                            
                            if (idMatch) {
                                // Replace existing ID
                                const idAttrRegex = new RegExp(`\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
                                return match.replace(idAttrRegex, `id="${newId}"`);
                            } else {
                                // Add missing ID after tag name
                                return `<${tag} id="${newId}"${attrs}>`;
                            }
                        } else {
                            seenIdsInOutput.add(id);
                            return match;
                        }
                    });
                });

                // 3. Remap cross-references (refid)
                const refRegex = /\brefid="([^"]+)"/g;
                processedXml = processedXml.replace(refRegex, (match, refidAttr) => {
                    const ids = refidAttr.split(/\s+/).filter((id: string) => id.trim() !== '');
                    const updatedIds = ids.map((id: string) => mapping.get(id) || id);
                    return `refid="${updatedIds.join(' ')}"`;
                });

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
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">ID Prefix Auditor</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic tracking-tight leading-relaxed">
                    Protocol validation for bb, rf, se, ir, ca, cf, or, tr, and plural cross-refs. Enforcing strict 4-digit numeric suffixes and collapsed initials.
                </p>
            </div>

            {/* Smart Suggestions Section outside the main results container */}
            {suggestions.length > 0 && step === 'result' && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-6 bg-indigo-50/30 border-2 border-indigo-100 rounded-[2rem] border-dashed">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                <Lightbulb className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'ID Prefix Auditor' } });
                                    }}
                                    className="flex items-center gap-4 p-4 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                        <div className="text-[9px] text-indigo-500 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[calc(100vh-320px)] min-h-[750px] flex flex-col relative transition-all duration-500">
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
                        <div className="flex-grow flex flex-col relative bg-slate-50/30">
                            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
                            <textarea 
                                value={input} 
                                onChange={e => setInput(e.target.value)} 
                                className="flex-grow p-12 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder:text-slate-400 z-10" 
                                placeholder="Paste the full XML article source here. Violations in ID prefixes, length, and spaced initials will be reported. Plural cross-refs are now audited..."
                                spellCheck={false}
                            />
                        </div>
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
                                                {res.isDuplicate && (
                                                    <span className="text-[9px] font-black uppercase bg-rose-600 text-white px-2 py-1 rounded border border-rose-700 shadow-sm">
                                                        Duplicate ID
                                                    </span>
                                                )}
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
                                <div className="flex-grow relative flex flex-col overflow-hidden">
                                    <div 
                                        ref={diffContainerRef}
                                        className="absolute inset-0 overflow-auto custom-scrollbar"
                                    >
                                        {diffElements}
                                    </div>

                                    <AnimatePresence>
                                        {totalChanges > 0 && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                                className="absolute bottom-8 right-8 flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
                                            >
                                                <div className="flex items-center gap-1 pr-2 border-r border-slate-100">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                        <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex flex-col px-2">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                        <span className="text-xs font-black text-slate-900 tabular-nums leading-none">
                                                            {currentChangeIndex} <span className="text-slate-300 mx-0.5">/</span> {totalChanges}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => scrollToChange('prev')}
                                                        className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                        title="Previous Change (Shift+Tab)"
                                                    >
                                                        <ChevronUp className="w-5 h-5 group-active:-translate-y-0.5 transition-transform" strokeWidth={3} />
                                                    </button>
                                                    <button 
                                                        onClick={() => scrollToChange('next')}
                                                        className="p-2.5 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-all text-slate-600 hover:text-indigo-600 group"
                                                        title="Next Change (Tab)"
                                                    >
                                                        <ChevronDown className="w-5 h-5 group-active:translate-y-0.5 transition-transform" strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
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
