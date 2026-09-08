import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { diffLines, diffWordsWithSpace, Change } from 'diff';
import { 
    FileCode, 
    RotateCcw, 
    Copy, 
    Check, 
    AlertCircle, 
    Zap,
    History,
    FileText,
    ArrowRight,
    Hash,
    Search,
    Split,
    ChevronUp,
    ChevronDown,
    GitCompare,
    AlertTriangle,
    Lightbulb,
    Trash2,
    Link as LinkIcon,
    Download,
    Maximize2,
    Minimize2,
    Users,
    CheckCircle2,
    ShieldCheck
} from 'lucide-react';
import Toast from '../components/Toast';
import useLocalStorage from '../hooks/useLocalStorage';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { formatAffiliationId } from '../utils/affiliationSequencerLogic';

interface AffiliationIssue {
    index: number;
    originalId: string;
    expectedId: string;
    currentLabel: string;
    expectedLabel: string;
    isIdWrong: boolean;
    isLabelWrong: boolean;
    type?: 'affiliation' | 'cross-ref';
    context?: string;
}

interface AuditLine {
    text: string;
    isChanged: boolean;
    isHeader?: boolean;
    isDivider?: boolean;
}

interface AuthorRemapLink {
    crossRefId?: string;
    oldRefId: string;
    newRefId: string;
    label: string;
    isChanged: boolean;
}

interface AuthorRemapItem {
    authorIndex: number;
    authorName: string;
    authorId?: string;
    links: AuthorRemapLink[];
    isRemapped: boolean;
}

interface AffiliationRemapItem {
    index: number;
    originalId: string;
    newId: string;
    originalLabel: string;
    newLabel: string;
    affiliationId?: string;
    isChanged: boolean;
}

interface SyncLogSession {
    timestamp: string;
    totalAffiliations: number;
    changedAffiliationsCount: number;
    totalAuthors: number;
    remappedAuthorsCount: number;
    totalCrossRefsUpdated: number;
    authors: AuthorRemapItem[];
    affiliations: AffiliationRemapItem[];
    unlinkedAffiliations: string[];
    redundantAffiliationGroups: string[][];
    rawAuditLog: AuditLine[];
}

interface RollbackSnapshot {
    input: string;
    output: string;
    lastProcessedInput: string;
    report: AuditLine[];
    syncLog: SyncLogSession | null;
    timestamp: string;
}

interface SmartSuggestion {
    id: string;
    toolName: string;
    description: string;
    path: string;
    icon: React.ReactNode;
    condition: string;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const getLabel = (index: number) => {
    let label = "";
    let n = index;
    while (n >= 0) {
        label = ALPHABET[n % 26] + label;
        n = Math.floor(n / 26) - 1;
    }
    return label;
};

const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const buildDiffLines = (diffParts: Change[], isLeft: boolean) => {
    const lines: string[] = [];
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
        if (part.removed && isLeft) append(part.value, 'bg-rose-200 text-rose-900 line-through decoration-rose-900/50');
        else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-900 font-bold');
        else if (!part.added && !part.removed) append(part.value, null);
    });

    if (activeClass) currentLine += '</span>';
    lines.push(currentLine);
    return lines;
};

const AffiliationSequencer: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useLocalStorage<string>('affiliation_sequencer_input', '');
    const [output, setOutput] = useLocalStorage<string>('affiliation_sequencer_output', '');
    const [lastProcessedInput, setLastProcessedInput] = useLocalStorage<string>('affiliation_sequencer_last_input', '');
    const [isProcessing, setIsProcessing] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const [activeTab, setActiveTab] = useState<'xml' | 'diff' | 'report'>('xml');
    const [report, setReport] = useState<AuditLine[]>([]);
    const [issues, setIssues] = useState<AffiliationIssue[]>([]);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [syncLog, setSyncLog] = useState<SyncLogSession | null>(null);
    const [rollbackState, setRollbackState] = useState<RollbackSnapshot | null>(null);
    const [authorFilter, setAuthorFilter] = useState<'remapped' | 'all'>('remapped');

    const [searchQuery, setSearchQuery] = useState('');
    const [filterChangedOnly, setFilterChangedOnly] = useState(false);
    const [isDiffExpanded, setIsDiffExpanded] = useState(false);

    const [isDragging, setIsDragging] = useState(false);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Support data transfer from other tools
    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate, setInput]);

    const isStale = Boolean(output && input !== lastProcessedInput);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'text/xml' || file.name.endsWith('.xml') || file.type === 'application/xml')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                setInput(content);
                setIssues([]);
                setToast({ msg: 'XML file loaded successfully', type: 'success' });
            };
            reader.readAsText(file);
        } else {
            setToast({ msg: 'Please drop a valid .xml file', type: 'error' });
        }
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output);
        setToast({ msg: isStale ? 'Copied stale output XML!' : 'Copied output XML to clipboard!', type: 'success' });
    };

    const handleRollback = () => {
        if (!rollbackState) return;
        setInput(rollbackState.input);
        setOutput(rollbackState.output);
        setLastProcessedInput(rollbackState.lastProcessedInput);
        setReport(rollbackState.report);
        setSyncLog(rollbackState.syncLog);
        setRollbackState(null);
        setToast({ 
            msg: `Session rolled back to pre-sync state (${rollbackState.timestamp || 'previous'}).`, 
            type: 'success' 
        });
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setLastProcessedInput('');
        setReport([]);
        setSyncLog(null);
        setRollbackState(null);
        setIssues([]);
        setSuggestions([]);
        setTotalChanges(0);
        setCurrentChangeIndex(0);
        setToast({ msg: 'All cleared', type: 'warn' });
    };

    const handleSaveToFile = () => {
        if (!output) return;
        const blob = new Blob([output], { type: 'application/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sequenced_affiliations.xml');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ msg: 'Saved XML to file', type: 'success' });
    };

    const generateSuggestions = (xmlText: string) => {
        const newSuggestions: SmartSuggestion[] = [];
        if (xmlText.includes('<ce:bib-reference')) {
            newSuggestions.push({
                id: 'xml-renumber',
                toolName: 'XML Reference Normalizer',
                description: 'Bibliography detected. Use this to ensure all references are correctly numbered.',
                path: '/xmlRenumber',
                icon: <Hash className="w-4 h-4" />,
                condition: 'Bibliography detected'
            });
        }
        const otherRefCount = (xmlText.match(/<ce:other-ref/g) || []).length;
        if (otherRefCount > 0) {
            newSuggestions.push({
                id: 'other-ref',
                toolName: 'Other-Ref Scanner',
                description: `Found ${otherRefCount} other-ref(s). Scan and audit other-ref markup.`,
                path: '/otherRefScanner',
                icon: <LinkIcon className="w-4 h-4" />,
                condition: 'Other-refs detected'
            });
        }
        const tagMatches = xmlText.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>/gi) || [];
        if (tagMatches.length > 0) {
            newSuggestions.push({
                id: 'tag-cleaner',
                toolName: 'XML Tag Cleaner',
                description: `Found ${tagMatches.length} editorial tag(s). Accept or reject editorial markup in bulk.`,
                path: '/tagCleaner',
                icon: <Trash2 className="w-4 h-4" />,
                condition: 'Editorial tags detected'
            });
        }
        if (xmlText.includes('<ce:table') || xmlText.includes('<table')) {
            newSuggestions.push({
                id: 'table-fixer',
                toolName: 'XML Table Fixer',
                description: 'Table markup detected. Audit table entry counts and column alignments.',
                path: '/tableFixer',
                icon: <FileCode className="w-4 h-4" />,
                condition: 'Table detected'
            });
        }
        return newSuggestions;
    };

    const analyzeXml = () => {
        if (!input.trim()) {
            setToast({ msg: "Please enter or paste XML content first.", type: "warn" });
            return;
        }

        const foundIssues: AffiliationIssue[] = [];
        const affRegex = /<ce:affiliation\b([^>]*)>([\s\S]*?)<\/ce:affiliation>/gi;
        let match;
        let index = 0;
        const idMapping: Record<string, string> = {};

        while ((match = affRegex.exec(input)) !== null) {
            index++;
            const attrString = match[1];
            const content = match[2];
            const idMatch = attrString.match(/(^|\s)id=(["'])(.*?)\2/i);
            const originalId = idMatch ? idMatch[3] : '';
            const labelMatch = content.match(/<ce:label>([^<]*)<\/ce:label>/i);
            const currentLabel = labelMatch ? labelMatch[1].trim() : '';

            const expectedId = formatAffiliationId(index, 5);
            const expectedLabel = getLabel(index - 1);

            const isIdWrong = originalId !== expectedId;
            const isLabelWrong = currentLabel !== '' && currentLabel !== expectedLabel;

            if (originalId) {
                idMapping[originalId] = expectedId;
            }

            if (isIdWrong || isLabelWrong) {
                foundIssues.push({
                    index,
                    originalId: originalId || '(none)',
                    expectedId,
                    currentLabel: currentLabel || '(none)',
                    expectedLabel,
                    isIdWrong,
                    isLabelWrong,
                    type: 'affiliation'
                });
            }
        }

        // Also pre-scan cross-ref mismatches
        const crRegex = /<ce:cross-ref\b([^>]*)(?:\/>|>([\s\S]*?)<\/ce:cross-ref>)/gi;
        let crMatch;
        let crIndex = 0;
        while ((crMatch = crRegex.exec(input)) !== null) {
            const attrString = crMatch[1];
            const refidMatch = attrString.match(/(^|\s)refid=(["'])(.*?)\2/i);
            if (refidMatch) {
                const originalRefIdVal = refidMatch[3];
                const refTokens = originalRefIdVal.trim().split(/[\s,]+/).filter(Boolean);
                const isNonAff = refTokens.some(t => /^(bib|b\d|ref|tbl|tb\d|fig|gr\d|fn\d|cor\d)/i.test(t));
                if (isNonAff) continue;

                const hasMismatch = refTokens.some(t => idMapping[t] && idMapping[t] !== t);
                if (hasMismatch) {
                    crIndex++;
                    const expectedTokens = refTokens.map(t => idMapping[t] || t).join(' ');
                    foundIssues.push({
                        index: crIndex,
                        originalId: originalRefIdVal,
                        expectedId: expectedTokens,
                        currentLabel: '',
                        expectedLabel: '',
                        isIdWrong: true,
                        isLabelWrong: false,
                        type: 'cross-ref',
                        context: crMatch[0].length > 90 ? crMatch[0].slice(0, 90) + '...' : crMatch[0]
                    });
                }
            }
        }

        setIssues(foundIssues);
        if (foundIssues.length === 0 && index > 0) {
            setToast({ msg: `Pre-flight scan clean! All ${index} affiliation IDs, labels, and cross-references match sequence.`, type: "success" });
        } else if (index === 0) {
            setToast({ msg: "No <ce:affiliation> elements detected in XML buffer.", type: "warn" });
        } else {
            setToast({ msg: `Audit found ${foundIssues.length} item(s) to normalize.`, type: "warn" });
        }
    };

    const processXml = () => {
        if (!input.trim()) {
            setToast({ msg: "Please enter or paste XML content first.", type: "warn" });
            return;
        }

        setIsProcessing(true);

        // Snapshot current session state for immediate rollback if needed
        setRollbackState({
            input,
            output,
            lastProcessedInput,
            report,
            syncLog,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });

        const auditLog: AuditLine[] = [
            { text: "AFFILIATION SEQUENCER & AUTHOR RELINKER AUDIT", isChanged: false, isHeader: true },
            { text: "Rule: Sequential affiliation IDs in increments of 5 (af0005, af0010, af0015, af0020...)", isChanged: false },
            { text: "Rule: Sequential alphabetical labels (a, b, c, d...)", isChanged: false },
            { text: "Integrity Directive: Author cross-refs (refid & <ce:sup>) synchronized; affiliation-id, cross-ref id, and author names strictly preserved.", isChanged: false },
            { text: "=======", isChanged: false, isDivider: true }
        ];

        try {
            // 1. Find all <ce:affiliation> tags in the XML
            const affRegex = /<ce:affiliation\b([^>]*)>([\s\S]*?)<\/ce:affiliation>/gi;
            const affiliations: {
                originalId: string;
                fullTag: string;
                attrString: string;
                content: string;
                originalLabel: string;
                affiliationId?: string;
            }[] = [];

            let affMatch;
            while ((affMatch = affRegex.exec(input)) !== null) {
                const fullTag = affMatch[0];
                const attrString = affMatch[1];
                const content = affMatch[2];
                const idMatch = attrString.match(/(^|\s)id=(["'])(.*?)\2/i);
                const originalId = idMatch ? idMatch[3] : '';
                const affIdMatch = attrString.match(/(^|\s)affiliation-id=(["'])(.*?)\2/i);
                const affiliationId = affIdMatch ? affIdMatch[3] : undefined;
                const labelMatch = content.match(/<ce:label>([^<]*)<\/ce:label>/i);
                const originalLabel = labelMatch ? labelMatch[1].trim() : '';

                affiliations.push({
                    originalId,
                    fullTag,
                    attrString,
                    content,
                    originalLabel,
                    affiliationId
                });
            }

            if (affiliations.length === 0) {
                throw new Error("No <ce:affiliation> elements found in XML buffer.");
            }

            // 2. Map old IDs and labels to new sequential IDs and labels
            const idMap: Record<string, { newId: string; newLabel: string; oldLabel: string }> = {};
            const labelMap: Record<string, { newId: string; newLabel: string }> = {};
            const affiliationRecords: AffiliationRemapItem[] = [];
            let changedAffCount = 0;

            affiliations.forEach((aff, index) => {
                const newId = formatAffiliationId(index + 1, 5);
                const newLabel = getLabel(index);
                const isChanged = aff.originalId !== newId || (aff.originalLabel !== '' && aff.originalLabel !== newLabel);
                if (isChanged) changedAffCount++;

                affiliationRecords.push({
                    index: index + 1,
                    originalId: aff.originalId || '(none)',
                    newId,
                    originalLabel: aff.originalLabel || '(none)',
                    newLabel,
                    affiliationId: aff.affiliationId,
                    isChanged
                });

                if (aff.originalId) {
                    idMap[aff.originalId] = { newId, newLabel, oldLabel: aff.originalLabel };
                }
                if (aff.originalLabel) {
                    labelMap[aff.originalLabel.toLowerCase()] = { newId, newLabel };
                }
                labelMap[newLabel.toLowerCase()] = { newId, newLabel };
                labelMap[String(index + 1)] = { newId, newLabel };

                auditLog.push({
                    text: `Affiliation #${index + 1}: ${aff.originalId || '(none)'} -> ${newId} [Label: ${newLabel}]${aff.affiliationId ? ` (preserved affiliation-id="${aff.affiliationId}")` : ''}`,
                    isChanged
                });
            });

            // 3. Track author cross-reference links and author associations
            auditLog.push({ text: "=======", isChanged: false, isDivider: true });
            auditLog.push({ text: "AUTHOR & CROSS-REFERENCE CASCADE AUDIT", isChanged: false, isHeader: true });

            const referencedIds = new Set<string>();
            const authorRecords: AuthorRemapItem[] = [];
            let remappedAuthorsCount = 0;
            const authorRegex = /<ce:author\b([^>]*)>([\s\S]*?)<\/ce:author>/gi;
            let authorMatch;
            let authorIndex = 1;

            const getOrdinal = (n: number) => {
                const s = ["th", "st", "nd", "rd"], v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };

            while ((authorMatch = authorRegex.exec(input)) !== null) {
                const authorFullTag = authorMatch[0];
                const authorAttrs = authorMatch[1]; // Attributes of <ce:author>
                const authorInner = authorMatch[2]; // inner XML between <ce:author> and </ce:author>
                const givenName = authorInner.match(/<ce:given-name>([^<]*)<\/ce:given-name>/i)?.[1] || '';
                const surname = authorInner.match(/<ce:surname>([^<]*)<\/ce:surname>/i)?.[1] || '';
                const fullName = `${givenName} ${surname}`.trim();

                const authorIdAttr = authorAttrs.match(/(^|\s)id=(["'])(.*?)\2/i)?.[3] || 
                                     authorAttrs.match(/(^|\s)author-id=(["'])(.*?)\2/i)?.[3] || undefined;

                const crRegex = /<ce:cross-ref\b([^>]*)(?:\/>|>([\s\S]*?)<\/ce:cross-ref>)/gi;
                let crMatch;
                const authorMappings: AuditLine[] = [];
                const currentLabels: string[] = [];
                const seenRefIds = new Set<string>();
                const duplicateLinks: string[] = [];
                const authorLinks: AuthorRemapLink[] = [];

                while ((crMatch = crRegex.exec(authorFullTag)) !== null) {
                    const crAttrs = crMatch[1];
                    const refidMatch = crAttrs.match(/(^|\s)refid=(["'])(.*?)\2/i);
                    const cfIdMatch = crAttrs.match(/(^|\s)id=(["'])(.*?)\2/i);
                    const crossRefId = cfIdMatch ? cfIdMatch[3] : undefined;

                    if (refidMatch) {
                        const refidVal = refidMatch[3];
                        const refTokens = refidVal.trim().split(/[\s,]+/).filter(Boolean);

                        // Skip non-affiliation refs (e.g. bib, tbl, fig, fn, cor)
                        const isNonAff = refTokens.some(t => /^(bib|b\d|ref|tbl|tb\d|fig|gr\d|fn\d|cor\d)/i.test(t));
                        if (isNonAff) continue;

                        const supMatch = (crMatch[2] || '').match(/<ce:sup>([^<]*)<\/ce:sup>/i);
                        const currentSup = supMatch ? supMatch[1].trim() : '';
                        const supLabels = currentSup.split(/(?:,|\band\b|&|;|\s)+/i).map(s => s.trim()).filter(Boolean);

                        const isAffRef = refTokens.some(t => idMap[t] || /^aff?\d*$/i.test(t) || labelMap[t.toLowerCase()]) ||
                                         supLabels.some(l => labelMap[l.toLowerCase()]);

                        if (isAffRef) {
                            let matchedNewIds: string[] = [];
                            if (supLabels.length > 0 && supLabels.some(l => labelMap[l.toLowerCase()])) {
                                matchedNewIds = supLabels.map(l => labelMap[l.toLowerCase()]?.newId).filter(Boolean) as string[];
                                if (currentSup) currentLabels.push(currentSup);
                            } else {
                                matchedNewIds = refTokens.map(t => idMap[t]?.newId || labelMap[t.toLowerCase()]?.newId || t);
                                if (currentSup) currentLabels.push(currentSup);
                            }

                            refTokens.forEach(t => referencedIds.add(t));
                            matchedNewIds.forEach(nid => {
                                referencedIds.add(nid);
                                if (seenRefIds.has(nid)) {
                                    duplicateLinks.push(nid);
                                }
                                seenRefIds.add(nid);
                            });

                            const isChanged = refidVal !== matchedNewIds.join(' ');
                            authorMappings.push({
                                text: `Cross-ref: refid="${refidVal}" -> refid="${matchedNewIds.join(' ')}"${currentSup ? ` [Label: ${currentSup}]` : ''}`,
                                isChanged
                            });

                            authorLinks.push({
                                crossRefId,
                                oldRefId: refidVal,
                                newRefId: matchedNewIds.join(' '),
                                label: currentSup,
                                isChanged
                            });
                        }
                    }
                }

                if (fullName || authorMappings.length > 0) {
                    const isAuthorRemapped = authorLinks.some(link => link.isChanged);
                    if (isAuthorRemapped) remappedAuthorsCount++;

                    authorRecords.push({
                        authorIndex,
                        authorName: fullName || `Author #${authorIndex}`,
                        authorId: authorIdAttr,
                        links: authorLinks,
                        isRemapped: isAuthorRemapped
                    });

                    auditLog.push({ text: `${getOrdinal(authorIndex)} author: ${fullName || 'Unknown'}${authorIdAttr ? ` [ID: ${authorIdAttr}]` : ''}`, isChanged: false, isHeader: true });
                    if (currentLabels.length > 0) {
                        auditLog.push({ text: `Affiliated to: ${currentLabels.join(', ')}`, isChanged: false });
                    }
                    if (duplicateLinks.length > 0) {
                        auditLog.push({ text: `⚠️ Duplicate links found for: ${duplicateLinks.join(', ')}`, isChanged: true });
                    }
                    authorMappings.forEach(m => auditLog.push(m));
                    auditLog.push({ text: `-------`, isChanged: false });
                    authorIndex++;
                }
            }

            // 4. Update affiliations in XML
            let workingXml = input;
            const affPlaceholders: { placeholder: string; replacement: string }[] = [];

            affiliations.forEach((aff, i) => {
                const mapping = idMap[aff.originalId] || { newId: formatAffiliationId(i + 1, 5), newLabel: getLabel(i), oldLabel: '' };
                
                // Update id="..." on opening tag while preserving affiliation-id="..."
                let newOpeningTag = aff.attrString;
                const idRegex = /(^|\s)id=(["'])(.*?)\2/i;
                if (idRegex.test(newOpeningTag)) {
                    newOpeningTag = newOpeningTag.replace(idRegex, `$1id="${mapping.newId}"`);
                } else {
                    newOpeningTag = ` id="${mapping.newId}"` + newOpeningTag;
                }

                // Update or insert <ce:label>
                let newContent = aff.content;
                const labelRegex = /<ce:label>([^<]*)<\/ce:label>/i;
                if (labelRegex.test(newContent)) {
                    newContent = newContent.replace(labelRegex, `<ce:label>${mapping.newLabel}</ce:label>`);
                } else {
                    newContent = `<ce:label>${mapping.newLabel}</ce:label>` + newContent;
                }

                const replacement = `<ce:affiliation${newOpeningTag}>${newContent}</ce:affiliation>`;
                const placeholder = `__AFF_SEQ_REPLACE_${i}_${Date.now()}__`;
                affPlaceholders.push({ placeholder, replacement });
                workingXml = workingXml.replace(aff.fullTag, placeholder);
            });

            // 5. Synchronize all <ce:cross-ref> tags in the document
            let crossRefsUpdated = 0;
            const crChangesList: { oldRefId: string; newRefId: string; label: string }[] = [];
            const globalCrossrefRegex = /<ce:cross-ref\b([^>]*)(?:\/>|>([\s\S]*?)<\/ce:cross-ref>)/gi;

            workingXml = workingXml.replace(globalCrossrefRegex, (fullMatch, attrString, innerContent) => {
                const refidAttrRegex = /(^|\s)refid=(["'])(.*?)\2/i;
                const refidMatch = attrString.match(refidAttrRegex);
                if (!refidMatch) return fullMatch;

                const quote = refidMatch[2];
                const originalRefIdVal = refidMatch[3];
                const refTokens = originalRefIdVal.trim().split(/[\s,]+/).filter(Boolean);

                // Ignore non-affiliation cross-references (e.g. bib, tbl, fig, fn, cor)
                const isNonAff = refTokens.some((t: string) => /^(bib|b\d|ref|tbl|tb\d|fig|gr\d|fn\d|cor\d)/i.test(t));
                if (isNonAff) return fullMatch;

                const supRegex = /<ce:sup>([\s\S]*?)<\/ce:sup>/i;
                const supMatch = (innerContent || '').match(supRegex);
                const rawSup = supMatch ? supMatch[1].trim() : '';

                const supLabels = rawSup
                    .split(/(?:,|\band\b|&|;|\s)+/i)
                    .map((s: string) => s.trim())
                    .filter(Boolean);

                const isAffCrossRef = refTokens.some((t: string) => idMap[t] || /^aff?\d*$/i.test(t) || labelMap[t.toLowerCase()]) ||
                                      supLabels.some((l: string) => labelMap[l.toLowerCase()]);

                if (!isAffCrossRef) return fullMatch;

                let resolvedNewIds: string[] = [];
                let updatedSup = rawSup;

                // Priority A: Author visible superscript labels represent the true affiliation citation
                if (supLabels.length > 0 && supLabels.some((l: string) => labelMap[l.toLowerCase()])) {
                    const validMappings = supLabels
                        .map((l: string) => ({ oldLabel: l, mapping: labelMap[l.toLowerCase()] }))
                        .filter((m: { oldLabel: string; mapping: any }) => Boolean(m.mapping));

                    if (validMappings.length > 0) {
                        resolvedNewIds = validMappings.map((m: { oldLabel: string; mapping: any }) => m.mapping.newId);

                        // If label changed (e.g. re-indexed), update within rawSup while preserving formatting/delimiters
                        validMappings.forEach((m: { oldLabel: string; mapping: any }) => {
                            if (m.oldLabel !== m.mapping.newLabel) {
                                const wordRegex = new RegExp(`\\b${m.oldLabel}\\b`, 'g');
                                updatedSup = updatedSup.replace(wordRegex, m.mapping.newLabel);
                            }
                        });
                    }
                }

                // Priority B: If not resolved from supLabels, resolve from refTokens
                if (resolvedNewIds.length === 0) {
                    resolvedNewIds = refTokens.map((token: string) => {
                        if (idMap[token]) return idMap[token].newId;
                        if (labelMap[token.toLowerCase()]) return labelMap[token.toLowerCase()].newId;
                        return token;
                    });

                    // If single token mapped and sup is empty or was old label
                    if (refTokens.length === 1 && idMap[refTokens[0]]) {
                        const m = idMap[refTokens[0]];
                        if (!rawSup || (m.oldLabel && rawSup.toLowerCase() === m.oldLabel.toLowerCase())) {
                            updatedSup = m.newLabel;
                        }
                    }
                }

                const uniqueNewIds: string[] = [];
                resolvedNewIds.forEach(id => {
                    if (!uniqueNewIds.includes(id)) uniqueNewIds.push(id);
                });

                const newRefIdVal = uniqueNewIds.join(' ');
                const isRefIdChanged = originalRefIdVal !== newRefIdVal;
                const isSupChanged = rawSup !== updatedSup;

                if (isRefIdChanged || isSupChanged) {
                    crossRefsUpdated++;
                    crChangesList.push({
                        oldRefId: originalRefIdVal,
                        newRefId: newRefIdVal,
                        label: updatedSup || rawSup
                    });

                    const newAttrs = attrString.replace(refidAttrRegex, `$1refid=${quote}${newRefIdVal}${quote}`);
                    let newInner = innerContent || '';
                    if (isSupChanged && supMatch) {
                        newInner = newInner.replace(supRegex, `<ce:sup>${updatedSup}</ce:sup>`);
                    }

                    return innerContent !== undefined
                        ? `<ce:cross-ref${newAttrs}>${newInner}</ce:cross-ref>`
                        : `<ce:cross-ref${newAttrs}/>`;
                }

                return fullMatch;
            });

            // 6. Restore affiliation placeholders
            affPlaceholders.forEach(({ placeholder, replacement }) => {
                workingXml = workingXml.replace(placeholder, replacement);
            });

            // 7. Audit Log Summary
            if (crChangesList.length > 0) {
                auditLog.push({ text: `SYNCHRONIZED CROSS-REFERENCES (${crChangesList.length} UPDATED)`, isChanged: false, isHeader: true });
                crChangesList.forEach(cr => {
                    auditLog.push({
                        text: `Cross-Ref: refid="${cr.oldRefId}" -> refid="${cr.newRefId}" [Label: ${cr.label}]`,
                        isChanged: true
                    });
                });
                auditLog.push({ text: "=======", isChanged: false, isDivider: true });
            }

            // Unlinked & Redundant Checks
            const unlinkedAffs = affiliations.filter(aff => aff.originalId && !referencedIds.has(aff.originalId));
            const contentMap: Record<string, string[]> = {};
            affiliations.forEach(aff => {
                const normalized = aff.content.replace(/<ce:label>.*?<\/ce:label>/gi, '').replace(/\s+/g, '').toLowerCase();
                if (!contentMap[normalized]) contentMap[normalized] = [];
                contentMap[normalized].push(aff.originalId);
            });
            const redundantGroups = Object.values(contentMap).filter(ids => ids.length > 1);

            auditLog.push({ text: "INTEGRITY & DTD VALIDATION SUMMARY", isChanged: false, isHeader: true });
            if (unlinkedAffs.length === 0) {
                auditLog.push({ text: "✅ All affiliations are linked to at least one author.", isChanged: false });
            } else {
                auditLog.push({ text: `⚠️ Found ${unlinkedAffs.length} unlinked affiliation(s):`, isChanged: true });
                unlinkedAffs.forEach(aff => {
                    const m = idMap[aff.originalId];
                    auditLog.push({ text: `• Unlinked: ${aff.originalId} -> ${m?.newId || '?'} (Label: ${m?.newLabel || '?'})`, isChanged: true });
                });
            }

            if (redundantGroups.length === 0) {
                auditLog.push({ text: "✅ No redundant affiliations (duplicate text) detected.", isChanged: false });
            } else {
                auditLog.push({ text: `⚠️ Found ${redundantGroups.length} group(s) of redundant affiliations:`, isChanged: true });
                redundantGroups.forEach((ids, idx) => {
                    auditLog.push({ text: `• Group ${idx + 1}: IDs [${ids.join(', ')}] share identical affiliation text`, isChanged: true });
                });
            }

            auditLog.push({ text: `Total affiliations scanned: ${affiliations.length}`, isChanged: false });
            auditLog.push({ text: `Affiliation IDs corrected: ${changedAffCount}`, isChanged: changedAffCount > 0 });
            auditLog.push({ text: `Cross-references synchronized: ${crossRefsUpdated}`, isChanged: crossRefsUpdated > 0 });
            auditLog.push({ text: "✅ Zero <ce:author> names or author IDs modified", isChanged: false });
            auditLog.push({ text: "✅ Zero cross-ref own IDs (id=\"cf...\") modified", isChanged: false });
            auditLog.push({ text: "✅ Zero affiliation-id attributes modified (strictly preserved)", isChanged: false });

            const sessionLog: SyncLogSession = {
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                totalAffiliations: affiliations.length,
                changedAffiliationsCount: changedAffCount,
                totalAuthors: authorRecords.length,
                remappedAuthorsCount,
                totalCrossRefsUpdated: crossRefsUpdated,
                authors: authorRecords,
                affiliations: affiliationRecords,
                unlinkedAffiliations: unlinkedAffs.map(a => a.originalId),
                redundantAffiliationGroups: redundantGroups,
                rawAuditLog: auditLog
            };

            setOutput(workingXml);
            setLastProcessedInput(input);
            setReport(auditLog);
            setSyncLog(sessionLog);
            setIssues([]);
            setSuggestions(generateSuggestions(workingXml));
            setToast({
                msg: (changedAffCount > 0 || crossRefsUpdated > 0)
                    ? `Sequenced ${changedAffCount} affiliation(s) and synchronized ${crossRefsUpdated} cross-reference(s) (${remappedAuthorsCount} author IDs remapped).`
                    : "Affiliations and cross-reference links are already sequential.",
                type: "success"
            });
        } catch (error: any) {
            console.error(error);
            setToast({ msg: `Processing error: ${error.message}`, type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadCSV = () => {
        if (!syncLog && report.length === 0) return;
        
        const lines: string[][] = [
            ['AFFILIATION SEQUENCER SYNC & REMAP LOG'],
            [`Generated: ${syncLog?.timestamp || new Date().toLocaleString()}`],
            [''],
            ['--- SUMMARY METRICS ---'],
            ['Total Affiliations', String(syncLog?.totalAffiliations || 0)],
            ['Affiliation IDs Corrected', String(syncLog?.changedAffiliationsCount || 0)],
            ['Total Authors Scanned', String(syncLog?.totalAuthors || 0)],
            ['Author IDs Remapped', String(syncLog?.remappedAuthorsCount || 0)],
            ['Cross-References Synchronized', String(syncLog?.totalCrossRefsUpdated || 0)],
            [''],
            ['--- AUTHOR ID & CROSS-REFERENCE REMAPPINGS ---'],
            ['Author Index', 'Author ID', 'Author Name', 'Status', 'Old RefID', 'New RefID', 'Superscript Label', 'Cross-Ref ID']
        ];

        if (syncLog?.authors) {
            syncLog.authors.forEach(auth => {
                if (auth.links.length === 0) {
                    lines.push([
                        `#${auth.authorIndex}`,
                        auth.authorId || '(none)',
                        auth.authorName,
                        'No Affiliation Links',
                        '', '', '', ''
                    ]);
                } else {
                    auth.links.forEach(l => {
                        lines.push([
                            `#${auth.authorIndex}`,
                            auth.authorId || '(none)',
                            auth.authorName,
                            l.isChanged ? 'REMAPPED' : 'PRESERVED',
                            l.oldRefId,
                            l.newRefId,
                            l.label || '',
                            l.crossRefId || ''
                        ]);
                    });
                }
            });
        }

        lines.push(['']);
        lines.push(['--- AFFILIATION SEQUENCE CHANGES ---']);
        lines.push(['Index', 'Original ID', 'New ID', 'Original Label', 'New Label', 'Preserved affiliation-id', 'Status']);
        if (syncLog?.affiliations) {
            syncLog.affiliations.forEach(aff => {
                lines.push([
                    `#${aff.index}`,
                    aff.originalId,
                    aff.newId,
                    aff.originalLabel,
                    aff.newLabel,
                    aff.affiliationId || '(none)',
                    aff.isChanged ? 'MODIFIED' : 'PRESERVED'
                ]);
            });
        }

        lines.push(['']);
        lines.push(['--- DETAILED AUDIT TRAIL ---']);
        lines.push(['Entry #', 'Log Message', 'Status']);
        report.forEach((item, idx) => {
            lines.push([
                `#${idx + 1}`,
                item.text,
                item.isChanged ? 'Modified' : 'Preserved'
            ]);
        });

        const csvContent = lines.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `affiliation_sync_log_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useKeyboardShortcuts({
        onPrimary: processXml,
        onCopy: copyOutput,
        onClear: clearAll
    }, [input, output, isStale]);

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current || totalChanges === 0) return;

        let nextIndex = currentChangeIndex;
        if (direction === 'next') {
            nextIndex = currentChangeIndex >= totalChanges ? 1 : currentChangeIndex + 1;
        } else {
            nextIndex = currentChangeIndex <= 1 ? totalChanges : currentChangeIndex - 1;
        }

        const targetRow = diffContainerRef.current.querySelector(`tr[data-change-index-group="${nextIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        if (!diffContainerRef.current || currentChangeIndex === 0) return;

        const allRows = diffContainerRef.current.querySelectorAll('tr[data-change-index-group]');
        allRows.forEach(row => row.classList.remove('bg-emerald-100/60', 'ring-1', 'ring-emerald-300', 'ring-inset', 'z-10', 'relative'));

        const activeRows = diffContainerRef.current.querySelectorAll(`tr[data-change-index-group="${currentChangeIndex}"]`);
        activeRows.forEach(row => {
            row.classList.add('bg-emerald-100/60', 'ring-1', 'ring-emerald-300', 'ring-inset', 'z-10', 'relative');
        });
    }, [currentChangeIndex]);

    const diffRows = useMemo(() => {
        if (!input || !output) return [];
        const diff = diffLines(input, output);
        const rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let changeCount = 0;

        let i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';

            if (current.removed && diff[i+1]?.added) {
                type = 'replace';
                leftVal = current.value;
                rightVal = diff[i+1].value;
                i += 2;
                changeCount++;
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
                changeCount++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
                changeCount++;
            } else {
                leftVal = rightVal = current.value;
                i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

            if (type === 'replace') {
                const wordDiff = diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildDiffLines(wordDiff, true);
                rightLines = buildDiffLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildDiffLines([{removed: true, value: leftVal} as Change], true);
            } else if (type === 'insert') {
                rightLines = buildDiffLines([{added: true, value: rightVal} as Change], false);
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
                
                let lClass = '';
                let rClass = '';
                let lNumClass = 'bg-slate-50'; 
                let rNumClass = 'bg-slate-50';

                if (type === 'delete') {
                    lClass = 'bg-rose-50/70 text-slate-800';
                    lNumClass = 'bg-rose-100/70 text-rose-600 font-semibold';
                } else if (type === 'insert') {
                    rClass = 'bg-emerald-50/70 text-slate-800';
                    rNumClass = 'bg-emerald-100/70 text-emerald-600 font-semibold';
                } else if (type === 'replace') {
                    if (lContent !== undefined) {
                        lClass = 'bg-rose-50/70 text-slate-800';
                        lNumClass = 'bg-rose-100/70 text-rose-600 font-semibold';
                    }
                    if (rContent !== undefined) {
                        rClass = 'bg-emerald-50/70 text-slate-800';
                        rNumClass = 'bg-emerald-100/70 text-emerald-600 font-semibold';
                    }
                }

                rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                        data-change-row={type !== 'equal' ? "true" : undefined}
                        data-change-index={type !== 'equal' ? changeCount : undefined}
                        data-change-index-group={type !== 'equal' ? changeCount : undefined}
                    >
                        <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 select-none font-mono ${lNumClass}`}>{lNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-12 text-right text-[10px] text-slate-400 p-1 border-r border-slate-200 border-l select-none font-mono ${rNumClass}`}>{rNum}</td>
                        <td className={`p-1.5 font-mono text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setTotalChanges(changeCount);
        setCurrentChangeIndex(changeCount > 0 ? 1 : 0);
        return rows;
    }, [input, output]);

    const filteredReport = useMemo(() => {
        return report.filter(item => {
            if (filterChangedOnly && !item.isChanged) return false;
            if (!searchQuery.trim()) return true;
            return item.text.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [report, filterChangedOnly, searchQuery]);

    const reportStats = useMemo(() => {
        const total = report.filter(r => !r.isDivider && !r.isHeader).length;
        const changed = report.filter(r => r.isChanged).length;
        return { total, changed, preserved: Math.max(0, total - changed) };
    }, [report]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6 flex flex-col min-h-[calc(100vh-120px)]">
            {/* Standard Toolkit Top Header */}
            <div className="mb-10 text-center animate-fade-in relative">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">
                    Affiliation Sequencer
                </h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light">
                    Sequentially renumbers affiliation IDs in increments of 5 (<code className="text-emerald-600 font-mono text-sm font-semibold">af0005</code>, <code className="text-emerald-600 font-mono text-sm font-semibold">af0010</code>...) and synchronizes author cross-reference links.
                </p>
            </div>

            {/* Consistent Control & Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                        <Hash className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm">Sequence Scheme</span>
                        <span className="text-xs text-slate-500">Incremental +5 step</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-medium">Standard Sequence:</span>
                    <span className="bg-white px-2.5 py-1 rounded-lg text-emerald-700 font-mono font-bold text-xs border border-slate-200 shadow-2xs">
                        af0005, af0010, af0015, af0020...
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {rollbackState && (
                        <button
                            onClick={handleRollback}
                            title={`Restore XML buffer and state prior to last sync (${rollbackState.timestamp})`}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold py-3 px-4 sm:px-5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 text-sm animate-fade-in"
                        >
                            <RotateCcw className="w-4 h-4 text-amber-700" />
                            <span>Rollback</span>
                        </button>
                    )}
                    <button
                        onClick={analyzeXml}
                        disabled={isProcessing || !input.trim()}
                        title="Pre-flight audit without modifying XML"
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 px-5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        <Search className="w-4 h-4 text-slate-500" />
                        <span>Audit XML</span>
                    </button>
                    <button 
                        onClick={processXml} 
                        disabled={isProcessing || !input.trim()}
                        title="Ctrl+Enter"
                        className={`bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transform transition-all active:scale-95 flex items-center gap-2 text-sm ${isProcessing ? 'opacity-75 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Sequencing...</span>
                            </>
                        ) : (
                            <>
                                <span>Process XML</span>
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Smart Suggestions / Architectural Recommendations Banner */}
            {suggestions.length > 0 && output && (
                <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-4 bg-emerald-50/30 border-2 border-emerald-100 rounded-2xl border-dashed">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 text-emerald-600" />
                            </div>
                            <h4 className="text-[10px] font-black text-emerald-900 uppercase tracking-[0.2em]">Architectural Recommendations</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {suggestions.map(sug => (
                                <button 
                                    key={sug.id}
                                    onClick={() => {
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Affiliation Sequencer' } });
                                    }}
                                    className="flex items-center gap-4 p-3 bg-white border border-emerald-100 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all group text-left shadow-sm"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                                        {sug.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="text-[9px] font-black text-emerald-900 uppercase tracking-widest mb-0.5">{sug.toolName}</div>
                                        <div className="text-[8px] text-emerald-600 font-medium leading-tight">{sug.description}</div>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-emerald-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Dual-Column Editor Grid */}
            <div className={`grid gap-8 min-h-[calc(100vh-320px)] transition-all duration-300 ${isDiffExpanded && activeTab === 'diff' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Left Column: Input XML */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all duration-300 ${isDiffExpanded && activeTab === 'diff' ? 'hidden' : 'flex'} min-h-[550px]`}>
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">IN</span>
                            Input XML
                        </label>
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:inline text-xs text-slate-400 font-mono">
                                {input ? `${input.length.toLocaleString()} chars` : 'Empty'}
                            </span>
                            <button 
                                onClick={clearAll} 
                                title="Alt+Delete" 
                                className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                            >
                                Clear All
                            </button>
                        </div>
                    </div>

                    <div 
                        className={`flex-grow relative flex flex-col transition-all duration-300 ${isDragging ? 'bg-emerald-50/50' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <textarea 
                            value={input} 
                            onChange={(e) => {
                                setInput(e.target.value);
                                setIssues([]);
                            }} 
                            className="w-full flex-grow p-6 text-sm font-mono text-slate-800 bg-white border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-emerald-100 placeholder-slate-300" 
                            placeholder="Paste your XML content here (e.g., full article, <ce:author-group>, or affiliation list)..." 
                            spellCheck={false}
                        />

                        {isDragging && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-emerald-50/80 backdrop-blur-2xs animate-in fade-in zoom-in duration-200">
                                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                                    <FileCode className="text-white h-8 w-8" />
                                </div>
                                <p className="mt-4 text-emerald-800 font-bold text-sm">Drop XML File to Load</p>
                            </div>
                        )}

                        {issues.length > 0 && (
                            <div className="mx-6 mb-6 p-4 bg-amber-50/80 rounded-xl border border-amber-200 max-h-48 overflow-auto custom-scrollbar">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="text-amber-500 w-4 h-4" />
                                    <h4 className="text-xs font-bold text-amber-900">Pre-Flight Sequence Audit Findings ({issues.length})</h4>
                                </div>
                                <div className="space-y-2">
                                    {issues.map((issue, i) => (
                                        <div key={i} className={`text-xs font-mono p-2 rounded border ${issue.type === 'cross-ref' ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-white border-amber-200 text-slate-800'}`}>
                                            <div className="flex items-center gap-2 font-semibold">
                                                <span>{issue.type === 'cross-ref' ? `Cross-Ref #${issue.index}:` : `Affiliation #${issue.index}:`}</span>
                                                <span className="text-rose-600 line-through">{issue.originalId}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-emerald-700">{issue.expectedId}</span>
                                                {issue.expectedLabel && (
                                                    <span className="ml-auto text-[11px] text-slate-500 font-normal">
                                                        Label: <strong className="text-emerald-700">{issue.expectedLabel}</strong>
                                                    </span>
                                                )}
                                            </div>
                                            {issue.context && (
                                                <div className="text-[10px] text-slate-500 truncate mt-1">
                                                    {issue.context}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Right Column: Output / Diff / Report */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[550px]">
                    {/* Header Bar */}
                    <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-emerald-600 font-mono shadow-sm">OUT</span>
                            Results
                            {isStale && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-md border border-amber-200 animate-pulse flex items-center gap-1">
                                    <AlertTriangle size={10} />
                                    STALE
                                </span>
                            )}
                        </label>

                        <div className="flex items-center gap-2">
                            {isStale && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter hidden sm:block">Input modified</span>}
                            {output && (
                                <button 
                                    onClick={handleSaveToFile} 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors flex items-center gap-1 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
                                >
                                    <Download size={12} />
                                    Save File
                                </button>
                            )}
                            {output && (
                                <button 
                                    onClick={copyOutput} 
                                    title="Ctrl+Shift+C" 
                                    className={`text-xs font-bold px-3 py-1.5 rounded border transition-all flex items-center gap-1 active:scale-95 ${isStale ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'}`}
                                >
                                    <Copy size={12} />
                                    {isStale ? 'Copy Stale XML' : 'Copy Result'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Clean Tab Navigation Bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 pt-2 gap-2 shrink-0">
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setActiveTab('xml')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'xml' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <FileText size={13} />
                                Result XML
                            </button>
                            <button 
                                onClick={() => setActiveTab('diff')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'diff' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <Split size={13} />
                                Diff View
                                {totalChanges > 0 && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                        {totalChanges}
                                    </span>
                                )}
                            </button>
                            <button 
                                onClick={() => setActiveTab('report')}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t border-x ${activeTab === 'report' ? 'bg-white text-emerald-700 border-slate-200 shadow-2xs translate-y-[1px]' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
                            >
                                <History size={13} />
                                Audit Log
                                {syncLog && syncLog.remappedAuthorsCount > 0 ? (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full border border-amber-200">
                                        {syncLog.remappedAuthorsCount} remapped
                                    </span>
                                ) : report.length > 0 ? (
                                    <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-full">
                                        {reportStats.changed}
                                    </span>
                                ) : null}
                            </button>
                        </div>

                        {activeTab === 'diff' && output && (
                            <div className="flex items-center gap-2 pb-1.5">
                                {totalChanges > 0 && (
                                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
                                        <GitCompare className="w-3.5 h-3.5 text-emerald-600" />
                                        <span className="text-xs font-mono font-bold text-slate-700">
                                            {currentChangeIndex} / {totalChanges}
                                        </span>
                                        <div className="h-3 w-px bg-slate-200 mx-0.5"></div>
                                        <button 
                                            onClick={() => scrollToChange('prev')} 
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-emerald-700" 
                                            title="Previous change (Shift+Tab)"
                                        >
                                            <ChevronUp size={13} />
                                        </button>
                                        <button 
                                            onClick={() => scrollToChange('next')} 
                                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-emerald-700" 
                                            title="Next change (Tab)"
                                        >
                                            <ChevronDown size={13} />
                                        </button>
                                    </div>
                                )}
                                <button 
                                    onClick={() => setIsDiffExpanded(!isDiffExpanded)} 
                                    className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 text-slate-500 hover:text-slate-800 transition-all"
                                    title={isDiffExpanded ? "Restore side-by-side view" : "Expand diff to full width"}
                                >
                                    {isDiffExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                </button>
                            </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="pb-1.5 flex items-center gap-2">
                                {rollbackState && (
                                    <button 
                                        onClick={handleRollback} 
                                        title={`Revert XML to pre-sync state (${rollbackState.timestamp})`}
                                        className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-lg border border-amber-300 transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                                    >
                                        <RotateCcw size={12} className="text-amber-700" />
                                        Rollback Session
                                    </button>
                                )}
                                {report.length > 0 && (
                                    <button 
                                        onClick={downloadCSV} 
                                        className="text-xs font-bold text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 shadow-2xs"
                                    >
                                        <Download size={12} />
                                        Export CSV
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Tab Views Content */}
                    <div className="flex-grow flex flex-col min-h-0 bg-white relative">
                        {activeTab === 'xml' && (
                            <textarea 
                                readOnly 
                                value={output} 
                                className="w-full flex-grow p-6 text-sm font-mono text-slate-800 bg-slate-50/50 border-0 focus:ring-0 outline-none resize-none leading-relaxed selection:bg-emerald-100 placeholder-slate-300" 
                                placeholder="Normalized XML will appear here once processed..." 
                                spellCheck={false}
                            />
                        )}

                        {activeTab === 'diff' && (
                            <div ref={diffContainerRef} className="flex-grow flex flex-col min-h-0">
                                <div className="grid grid-cols-[3rem_1fr_3rem_1fr] bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                                    <div className="col-span-2 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                                        Original XML
                                    </div>
                                    <div className="col-span-2 px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        Sequenced Result
                                    </div>
                                </div>
                                <div className="flex-grow overflow-auto custom-scrollbar">
                                    {diffRows.length > 0 ? (
                                        <table className="w-full text-xs font-mono border-collapse table-fixed">
                                            <colgroup>
                                                <col className="w-12 border-r border-slate-200" />
                                                <col className="w-[calc(50%-3rem)]" />
                                                <col className="w-12 border-r border-slate-200 border-l border-slate-200" />
                                                <col className="w-[calc(50%-3rem)]" />
                                            </colgroup>
                                            <tbody>
                                                {diffRows}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-slate-400 text-sm italic py-16">
                                            Process XML to inspect side-by-side diff
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="flex-grow flex flex-col min-h-0 p-5 overflow-auto custom-scrollbar space-y-6">
                                {/* Top Session Header with Rollback */}
                                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                                            <FileText className="w-4 h-4 text-emerald-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-slate-800">
                                                    Read-Only Sync & Remap Log
                                                </h3>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-700">
                                                    Read-Only
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                {syncLog ? `Session executed at ${syncLog.timestamp}` : 'Auditing changes and author ID remappings in real-time'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {rollbackState && (
                                            <button
                                                onClick={handleRollback}
                                                title={`Undo changes and revert XML to pre-sync state (${rollbackState.timestamp})`}
                                                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                                            >
                                                <RotateCcw size={13} className="text-amber-700" />
                                                Rollback Session
                                            </button>
                                        )}
                                        {report.length > 0 && (
                                            <button
                                                onClick={downloadCSV}
                                                className="text-xs font-bold text-slate-700 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs"
                                            >
                                                <Download size={13} />
                                                Export CSV
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {syncLog && (
                                    <>
                                        {/* Summary Statistics Cards */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                                                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                    <span>Authors Remapped</span>
                                                    <Users className="w-4 h-4 text-amber-600" />
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-2xl font-black text-slate-800 font-mono">
                                                        {syncLog.remappedAuthorsCount}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        / {syncLog.totalAuthors} authors
                                                    </span>
                                                </div>
                                                <div className="mt-2">
                                                    {syncLog.remappedAuthorsCount > 0 ? (
                                                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-block">
                                                            {syncLog.remappedAuthorsCount} IDs updated
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-block">
                                                            All in sequence
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                                                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                    <span>Affiliations Sequenced</span>
                                                    <Hash className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-2xl font-black text-slate-800 font-mono">
                                                        {syncLog.changedAffiliationsCount}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        / {syncLog.totalAffiliations} total
                                                    </span>
                                                </div>
                                                <div className="mt-2">
                                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block">
                                                        Incremental +5
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                                                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                    <span>Cross-Refs Updated</span>
                                                    <LinkIcon className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-2xl font-black text-slate-800 font-mono">
                                                        {syncLog.totalCrossRefsUpdated}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        references
                                                    </span>
                                                </div>
                                                <div className="mt-2">
                                                    <span className="text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-block">
                                                        Synchronized
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
                                                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                    <span>Integrity Guarantee</span>
                                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-xl font-bold text-slate-800">
                                                        100% Intact
                                                    </span>
                                                </div>
                                                <div className="mt-2">
                                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block">
                                                        Names & DTD Preserved
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Highlight Section: Author ID Remappings */}
                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-amber-600" />
                                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                        Author ID & Cross-Reference Remappings
                                                    </h4>
                                                    <span className="text-[10px] font-mono bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-200">
                                                        {syncLog.remappedAuthorsCount} remapped
                                                    </span>
                                                </div>

                                                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                                                    <button
                                                        onClick={() => setAuthorFilter('remapped')}
                                                        className={`px-2.5 py-1 rounded font-medium transition-all ${
                                                            authorFilter === 'remapped'
                                                                ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                                                : 'text-slate-600 hover:text-slate-900'
                                                        }`}
                                                    >
                                                        Remapped Authors ({syncLog.remappedAuthorsCount})
                                                    </button>
                                                    <button
                                                        onClick={() => setAuthorFilter('all')}
                                                        className={`px-2.5 py-1 rounded font-medium transition-all ${
                                                            authorFilter === 'all'
                                                                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                                                                : 'text-slate-600 hover:text-slate-900'
                                                        }`}
                                                    >
                                                        All Authors ({syncLog.totalAuthors})
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-4 space-y-3">
                                                {syncLog.authors && syncLog.authors.length > 0 ? (
                                                    syncLog.authors
                                                        .filter(a => authorFilter === 'all' || a.isRemapped)
                                                        .map(author => (
                                                            <div 
                                                                key={author.authorIndex}
                                                                className={`p-3.5 rounded-xl border transition-all ${
                                                                    author.isRemapped 
                                                                        ? 'bg-amber-50/40 border-amber-200/90 shadow-2xs' 
                                                                        : 'bg-slate-50/50 border-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-mono text-slate-400 font-bold">
                                                                            #{author.authorIndex}
                                                                        </span>
                                                                        <span className="text-sm font-bold text-slate-800">
                                                                            {author.authorName}
                                                                        </span>
                                                                        {author.authorId ? (
                                                                            <code className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200 font-semibold" title="Author ID Attribute in ce:author">
                                                                                id="{author.authorId}"
                                                                            </code>
                                                                        ) : (
                                                                            <span className="text-[11px] text-slate-400 italic">
                                                                                (No author id attribute)
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {author.isRemapped ? (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                                                            <RotateCcw size={10} className="text-amber-700" />
                                                                            Remapped
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                                                            Preserved
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {author.links.length > 0 ? (
                                                                    <div className="space-y-1.5 pt-1">
                                                                        {author.links.map((link, lIdx) => (
                                                                            <div 
                                                                                key={lIdx}
                                                                                className={`flex flex-wrap items-center gap-2 text-xs font-mono p-2 rounded-lg ${
                                                                                    link.isChanged 
                                                                                        ? 'bg-white border border-amber-200 shadow-2xs' 
                                                                                        : 'bg-white/80 border border-slate-100 text-slate-600'
                                                                                }`}
                                                                            >
                                                                                <span className="text-slate-400 select-none text-[11px]">
                                                                                    Link #{lIdx + 1}:
                                                                                </span>

                                                                                {link.isChanged ? (
                                                                                    <>
                                                                                        <span className="line-through bg-rose-100 text-rose-800 font-mono px-2 py-0.5 rounded font-semibold text-xs border border-rose-200">
                                                                                            refid="{link.oldRefId}"
                                                                                        </span>
                                                                                        <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                                                                        <span className="bg-emerald-100 text-emerald-900 font-mono px-2 py-0.5 rounded font-bold text-xs border border-emerald-200 shadow-2xs">
                                                                                            refid="{link.newRefId}"
                                                                                        </span>
                                                                                    </>
                                                                                ) : (
                                                                                    <span className="bg-slate-50 text-slate-700 font-mono px-2 py-0.5 rounded text-xs border border-slate-200">
                                                                                        refid="{link.oldRefId}"
                                                                                    </span>
                                                                                )}

                                                                                {link.label && (
                                                                                    <span className="text-xs text-slate-500 font-sans ml-2">
                                                                                        Superscript: <strong className="text-slate-800 font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">{link.label}</strong>
                                                                                    </span>
                                                                                )}

                                                                                {link.crossRefId && (
                                                                                    <span className="text-[11px] text-slate-400 font-mono ml-auto">
                                                                                        tag id="{link.crossRefId}"
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-slate-400 italic py-1">
                                                                        No affiliation cross-reference links detected for this author.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                ) : (
                                                    <div className="text-center py-6 text-slate-400 text-xs italic">
                                                        No authors detected in the XML buffer.
                                                    </div>
                                                )}

                                                {authorFilter === 'remapped' && syncLog.remappedAuthorsCount === 0 && (
                                                    <div className="text-center py-8 text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200">
                                                        <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                                        <p className="font-bold text-slate-700">Zero Author IDs Needed Remapping</p>
                                                        <p className="text-slate-500 mt-1">All author cross-references were already synchronized with the affiliation sequence.</p>
                                                        <button 
                                                            onClick={() => setAuthorFilter('all')}
                                                            className="mt-3 text-xs font-bold text-emerald-700 underline hover:text-emerald-800"
                                                        >
                                                            Show all {syncLog.totalAuthors} authors
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Affiliation Sequence Mapping Table */}
                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Hash className="w-4 h-4 text-emerald-600" />
                                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                        Affiliation ID Sequence Mapping ({syncLog.affiliations.length})
                                                    </h4>
                                                </div>
                                                <span className="text-xs font-mono text-slate-500">
                                                    Step: +5 (af0005, af0010...)
                                                </span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs font-mono text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-100/75 text-slate-600 font-bold border-b border-slate-200">
                                                            <th className="py-2.5 px-3">#</th>
                                                            <th className="py-2.5 px-3">Original ID</th>
                                                            <th className="py-2.5 px-3">Sequenced ID</th>
                                                            <th className="py-2.5 px-3">Label</th>
                                                            <th className="py-2.5 px-3">affiliation-id attribute</th>
                                                            <th className="py-2.5 px-3 text-right">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {syncLog.affiliations.map(aff => (
                                                            <tr key={aff.index} className={aff.isChanged ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-slate-50'}>
                                                                <td className="py-2 px-3 text-slate-400 font-bold">{aff.index}</td>
                                                                <td className="py-2 px-3">
                                                                    <span className={aff.isChanged ? 'line-through text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100' : 'text-slate-700'}>
                                                                        {aff.originalId}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 px-3">
                                                                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                                        {aff.newId}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 px-3">
                                                                    <span className="text-slate-600">
                                                                        {aff.originalLabel !== aff.newLabel && aff.originalLabel ? (
                                                                            <span className="line-through text-rose-600 mr-1.5">{aff.originalLabel}</span>
                                                                        ) : null}
                                                                        <strong className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{aff.newLabel}</strong>
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 px-3 text-slate-500">
                                                                    {aff.affiliationId ? (
                                                                        <span className="bg-emerald-50/60 text-emerald-800 px-1.5 py-0.5 rounded text-[11px] border border-emerald-100">
                                                                            affiliation-id="{aff.affiliationId}" (preserved)
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-400 italic text-[11px]">(none)</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-2 px-3 text-right">
                                                                    {aff.isChanged ? (
                                                                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                                                            Modified
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                            Preserved
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Detailed Chronological Audit Trail */}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <div className="relative flex-grow max-w-sm">
                                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                            <input 
                                                type="text" 
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search chronological audit log..." 
                                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                            />
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filterChangedOnly} 
                                                    onChange={(e) => setFilterChangedOnly(e.target.checked)}
                                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                                                />
                                                Changed only
                                            </label>

                                            <div className="flex items-center gap-2 text-xs font-mono">
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                                    Total: {reportStats.total}
                                                </span>
                                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                                    Modified: {reportStats.changed}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 max-h-96 overflow-auto custom-scrollbar space-y-1.5 font-mono text-xs">
                                        {filteredReport.length > 0 ? (
                                            filteredReport.map((log, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`flex items-start gap-3 p-2 rounded transition-colors ${
                                                        log.isHeader ? 'bg-slate-100 font-bold text-slate-900 mt-3 first:mt-0 border border-slate-200' :
                                                        log.isDivider ? 'border-t border-slate-100 my-1 py-0' :
                                                        log.isChanged ? 'bg-amber-50/70 border border-amber-200 text-amber-900' :
                                                        'hover:bg-slate-50 text-slate-700'
                                                    }`}
                                                >
                                                    {!log.isDivider && (
                                                        <span className="text-slate-400 select-none shrink-0 w-8 text-right text-[11px]">
                                                            {i + 1}.
                                                        </span>
                                                    )}
                                                    <span className="flex-grow break-all">
                                                        {log.text}
                                                    </span>
                                                    {log.isChanged && (
                                                        <span className="shrink-0 text-[9px] bg-amber-200/60 text-amber-800 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider">
                                                            Modified
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-slate-400 text-xs italic">
                                                {report.length === 0 ? "Execute sequence to generate detailed audit trail." : "No entries matched your search query."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Standard Feature Info Reference Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Hash className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">Sequential IDs (+5 Step)</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Standardizes all <code className="text-slate-700 font-mono font-semibold">&lt;ce:affiliation&gt;</code> IDs to <code className="text-emerald-700 font-mono">af0005</code>, <code className="text-emerald-700 font-mono">af0010</code>, <code className="text-emerald-700 font-mono">af0015</code>... in occurrence order.
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">Cross-Ref Synchronization</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Automatically re-links author <code className="text-slate-700 font-mono font-semibold">refid</code> attributes and <code className="text-slate-700 font-mono font-semibold">&lt;ce:sup&gt;</code> labels to maintain accurate author-to-affiliation links.
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Check className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">DTD Integrity Preservation</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Preserves internal <code className="text-slate-700 font-mono font-semibold">affiliation-id</code>, author names, cross-ref own IDs (<code className="text-slate-700 font-mono font-semibold">id="cf..."</code>), and document markup strictly intact.
                        </p>
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AffiliationSequencer;
