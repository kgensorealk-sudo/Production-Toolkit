import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import * as Diff from 'diff';
import { 
    Terminal, 
    Zap, 
    History, 
    Copy, 
    Download, 
    Cpu, 
    RotateCcw, 
    FileCode, 
    Check, 
    AlertCircle,
    Activity,
    ArrowRight,
    Search,
    Monitor,
    GitCompare,
    FileText,
    CheckCircle,
    CheckCircle2,
    Upload,
    Database,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Lightbulb,
    Link as LinkIcon,
    Eraser,
    Hash,
    Trash2,
    Box,
    SortAsc,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Sparkles,
    Filter,
    Clock,
    Layers,
    CheckSquare
} from 'lucide-react';
import Toast from '../components/Toast';
import Switch from '../components/Switch';
import { SmartSuggestion, ToolId } from '../types';

interface AuditItem {
    id: string;
    label?: string;
    title?: string;
    status: 'fixed' | 'warning' | 'skip';
    doi?: string;
    msg: string;
    type?: 'doi' | 'name' | 'id-fix' | 'source-text' | 'ir-fix' | 'contribution-langtype' | 'publisher' | 'empty-element' | 'retain';
    requiresConfirmation?: boolean;
}

const StructuralNodeArchitect: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [startId, setStartId] = useState(4000);
    const [fixContributionLangtype, setFixContributionLangtype] = useState<boolean>(true);
    const [autoAcceptRepairs, setAutoAcceptRepairs] = useState<boolean>(false);
    const [refDecisions, setRefDecisions] = useState<Record<string, 'accept' | 'retain'>>({});
    const [matrixFilter, setMatrixFilter] = useState<'all' | 'action-required' | 'needs-confirmation' | 'automatic' | 'accepted' | 'retained' | 'valid'>('action-required');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [viewMode, setViewMode] = useState<'output' | 'diff'>('output');
    const [auditData, setAuditData] = useState<AuditItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<'input' | 'analyzing' | 'completed'>('input');
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [activeTab, setActiveTab] = useState<'input' | 'analysis' | 'result'>('input');
    const [resultMode, setResultMode] = useState<'full' | 'refs'>('full');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
    const [showModificationDetails, setShowModificationDetails] = useState<boolean>(false);

    useEffect(() => {
        if (location.state?.transferredXml) {
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            // Clear the state so it doesn't re-trigger on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const wasWrappedRef = useRef<boolean>(false);

    const NS_DECLS = `xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/structbib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink"`;

    const generateSourceText = (sbRef: Element): string => {
        if (sbRef.tagName.includes('other-ref')) {
            let text = sbRef.textContent?.trim() || "";
            if (text && !text.endsWith(".")) text += ".";
            return text;
        }

        const authors: string[] = [];
        
        // 1. Authors
        const authorNodes = Array.from(sbRef.getElementsByTagName("sb:author")).concat(Array.from(sbRef.getElementsByTagName("ce:author")));
        authorNodes.forEach(author => {
            const given = author.getElementsByTagName("ce:given-name")[0]?.textContent || author.getElementsByTagName("sb:given-name")[0]?.textContent || "";
            const surname = author.getElementsByTagName("ce:surname")[0]?.textContent || author.getElementsByTagName("sb:surname")[0]?.textContent || "";
            if (given || surname) {
                authors.push(`${given} ${surname}`.trim());
            } else {
                const indexed = author.getElementsByTagName("ce:indexed-name")[0]?.textContent || author.getElementsByTagName("sb:indexed-name")[0]?.textContent;
                if (indexed) authors.push(indexed.trim());
            }
        });

        // Check for et-al tag inside authors or reference
        const hasEtAl = sbRef.getElementsByTagName("sb:et-al").length > 0 || sbRef.getElementsByTagName("ce:et-al").length > 0;

        // 2. Collaboration
        const collaborations = Array.from(sbRef.getElementsByTagName("ce:collaboration")).concat(Array.from(sbRef.getElementsByTagName("sb:collaboration")));
        collaborations.forEach(collab => {
            const text = collab.textContent?.trim();
            if (text) authors.push(text);
        });

        // 3. Title (check contribution first)
        let title = "";
        const contribution = sbRef.getElementsByTagName("sb:contribution")[0] || sbRef.getElementsByTagName("ce:contribution")[0];
        if (contribution) {
            title = contribution.getElementsByTagName("sb:maintitle")[0]?.textContent || contribution.getElementsByTagName("ce:maintitle")[0]?.textContent || "";
        }
        if (!title) {
            title = sbRef.getElementsByTagName("sb:maintitle")[0]?.textContent || sbRef.getElementsByTagName("ce:maintitle")[0]?.textContent || "";
        }
        
        // 4. Host (Journal/Book info) - check all sb:host elements
        const hostNodes = Array.from(sbRef.getElementsByTagName("sb:host")).concat(Array.from(sbRef.getElementsByTagName("ce:host")));
        let journal = "";
        let year = "";
        let volume = "";
        let issue = "";
        let pages = "";
        let articleNum = "";
        let editors: string[] = [];

        hostNodes.forEach(host => {
            // Journal Title
            if (!journal) {
                const mainTitles = Array.from(host.getElementsByTagName("sb:maintitle")).concat(Array.from(host.getElementsByTagName("ce:maintitle")));
                if (mainTitles.length > 0) {
                    journal = mainTitles[0].textContent || "";
                } else {
                    const seriesTitle = host.getElementsByTagName("sb:title")[0]?.textContent || host.getElementsByTagName("ce:title")[0]?.textContent;
                    if (seriesTitle) journal = seriesTitle;
                }
            }
            
            // Date / Year
            if (!year) {
                const dateNode = host.getElementsByTagName("sb:date")[0] || host.getElementsByTagName("ce:date")[0];
                if (dateNode) year = dateNode.textContent || "";
            }
            
            // Volume
            if (!volume) {
                const volNode = host.getElementsByTagName("sb:volume-nr")[0] || host.getElementsByTagName("ce:volume-nr")[0];
                if (volNode) volume = volNode.textContent || "";
            }
            
            // Issue
            if (!issue) {
                const issueNode = host.getElementsByTagName("sb:issue-nr")[0] || host.getElementsByTagName("ce:issue-nr")[0];
                if (issueNode) issue = issueNode.textContent || "";
            }

            // Pages
            if (!pages) {
                const pagesNode = host.getElementsByTagName("sb:pages")[0] || host.getElementsByTagName("ce:pages")[0];
                if (pagesNode) {
                    pages = pagesNode.textContent?.trim() || "";
                } else {
                    const firstPage = host.getElementsByTagName("sb:first-page")[0]?.textContent?.trim() || host.getElementsByTagName("ce:first-page")[0]?.textContent?.trim() || "";
                    const lastPage = host.getElementsByTagName("sb:last-page")[0]?.textContent?.trim() || host.getElementsByTagName("ce:last-page")[0]?.textContent?.trim() || "";
                    if (firstPage && lastPage) {
                        pages = `${firstPage}–${lastPage}`;
                    } else if (firstPage) {
                        pages = firstPage;
                    }
                }
            }

            // Article Number
            if (!articleNum) {
                const artNode = host.getElementsByTagName("sb:article-number")[0] || host.getElementsByTagName("ce:article-number")[0];
                if (artNode) articleNum = artNode.textContent || "";
            }

            // Editors
            const editorNodes = Array.from(host.getElementsByTagName("sb:editor")).concat(Array.from(host.getElementsByTagName("ce:editor")));
            editorNodes.forEach(ed => {
                const given = ed.getElementsByTagName("ce:given-name")[0]?.textContent || ed.getElementsByTagName("sb:given-name")[0]?.textContent || "";
                const surname = ed.getElementsByTagName("ce:surname")[0]?.textContent || ed.getElementsByTagName("sb:surname")[0]?.textContent || "";
                if (given || surname) editors.push(`${given} ${surname}`.trim());
            });
        });

        // Fallback for date directly under sbRef
        if (!year) {
            const dateNode = sbRef.getElementsByTagName("sb:date")[0] || sbRef.getElementsByTagName("ce:date")[0];
            if (dateNode) year = dateNode.textContent || "";
        }

        let sourceText = "";

        // 1. Authors & Year / Title & Year
        let authorsStr = authors.join(", ");
        if (hasEtAl) {
            authorsStr = authorsStr ? `${authorsStr}, et al.` : "et al.";
        }
        if (authorsStr) {
            if (year) {
                sourceText += `${authorsStr}, (${year}).`;
            } else {
                sourceText += `${authorsStr}.`;
            }
            if (title) {
                let cleanTitle = title.trim().replace(/[\s,.]*$/, '');
                sourceText += (sourceText ? " " : "") + `${cleanTitle}.`;
            }
        } else if (title) {
            // When NO authors, start with Title followed by period
            let cleanTitle = title.trim().replace(/[\s,.]*$/, '');
            sourceText += `${cleanTitle}.`;
        } else if (year) {
            sourceText += `(${year}).`;
        }
        
        // 2. Editors
        if (editors.length > 0) {
            const edLabel = editors.length > 1 ? "Eds." : "Ed.";
            sourceText += (sourceText ? " " : "") + `In: ${editors.join(", ")} (${edLabel}),`;
        }

        // 3. Host (Journal/Book)
        let volIssuePagesPart = "";
        if (journal) {
            volIssuePagesPart += journal.trim();
        }

        if (volume) {
            if (volIssuePagesPart) volIssuePagesPart += `, ${volume}`;
            else volIssuePagesPart += `${volume}`;
        }

        if (issue) {
            volIssuePagesPart += `(${issue})`;
        }

        if (!authorsStr && year) {
            // In numbered / STM style, authorless references place (Year) with the volume/issue:
            // e.g. "Accounts of Materials Research, 6(8), (2025) 1020–1032"
            if (volIssuePagesPart) {
                volIssuePagesPart += `, (${year})`;
            } else {
                volIssuePagesPart += `(${year})`;
            }
        }

        const pageOrArt = pages || articleNum;
        if (pageOrArt) {
            if (volIssuePagesPart) {
                volIssuePagesPart += ` ${pageOrArt}`;
            } else {
                volIssuePagesPart += `${pageOrArt}`;
            }
        }

        if (volIssuePagesPart) {
            sourceText += (sourceText ? " " : "") + volIssuePagesPart;
        }

        // 4. DOI
        const doiNode = sbRef.getElementsByTagName("ce:doi")[0] || sbRef.getElementsByTagName("sb:doi")[0];
        const doi = doiNode?.textContent?.trim();
        if (doi) {
            const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '');
            if (sourceText && !sourceText.endsWith(",") && !sourceText.endsWith(".")) {
                sourceText += ",";
            }
            sourceText += (sourceText ? " " : "") + `https://doi.org/${cleanDoi}`;
        }

        // 5. Comments (e.g. <sb:comment>Available at</sb:comment>, <sb:comment>in press</sb:comment>)
        const commentNodes = Array.from(sbRef.getElementsByTagName("sb:comment")).concat(Array.from(sbRef.getElementsByTagName("ce:comment")));
        const comments: string[] = [];
        commentNodes.forEach(c => {
            const txt = c.textContent?.trim();
            if (txt && !comments.includes(txt)) {
                comments.push(txt);
            }
        });

        if (comments.length > 0) {
            comments.forEach(cm => {
                if (sourceText && !sourceText.endsWith(".") && !sourceText.endsWith(",") && !sourceText.endsWith(":")) {
                    sourceText += ".";
                }
                sourceText += (sourceText ? " " : "") + cm;
            });
        }

        // 6. Inter-refs (URLs) and Date Accessed
        const dateAccessedNode = sbRef.getElementsByTagName("sb:date-accessed")[0];
        let dateAccessedStr = "";
        if (dateAccessedNode) {
            const day = dateAccessedNode.getAttribute("day");
            const month = dateAccessedNode.getAttribute("month");
            const yearVal = dateAccessedNode.getAttribute("year");
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let monthStr = month || "";
            if (month && !isNaN(parseInt(month))) {
                const mIdx = parseInt(month) - 1;
                if (mIdx >= 0 && mIdx < 12) monthStr = monthNames[mIdx];
            }
            const fullDate = [day, monthStr, yearVal].filter(Boolean).join(" ");
            if (fullDate) dateAccessedStr = `(Accessed: ${fullDate})`;
        }

        const interRefs = Array.from(sbRef.getElementsByTagName("ce:inter-ref")).concat(Array.from(sbRef.getElementsByTagName("sb:inter-ref")));
        interRefs.forEach(ir => {
            const urlText = ir.textContent?.trim();
            if (urlText && (urlText.startsWith("http") || urlText.includes("www."))) {
                let urlPart = urlText;
                if (dateAccessedStr) {
                    urlPart += ` ${dateAccessedStr}`;
                    dateAccessedStr = ""; // Only append to the first URL found
                }
                if (sourceText && !sourceText.endsWith(",") && !sourceText.endsWith(".") && !sourceText.endsWith(":")) {
                    const endsWithIntroducer = /\b(available\s*(at|from|online(\s*at)?)?|url|retrieved\s*(from)?|link|see|online|accessed(\s*at)?)$/i.test(sourceText.trim());
                    if (!endsWithIntroducer) {
                        sourceText += ",";
                    }
                }
                sourceText += (sourceText ? " " : "") + urlPart;
            }
        });

        if (dateAccessedStr) {
            sourceText += (sourceText ? " " : "") + dateAccessedStr;
        }
        
        let result = sourceText.trim().replace(/,\s*,/g, ',').replace(/\s+/g, ' ');
        if (result && !result.endsWith(".")) result += ".";
        return result;
    };

    const fixGivenName = (name: string): string => {
        if (!name) return name;
        // 1. Add periods to capital letters if missing (handles "A B" -> "A. B." and "JD" -> "J.D.")
        // Matches a capital letter NOT followed by lowercase letters (including accented/Unicode letters), a period, or an apostrophe
        let fixed = name.replace(/\b([A-Z\u00C0-\u00DE])(?!\s*[\-–—\u2010-\u2015])(?![\-–—\u2010-\u2015a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\.'’ʻ])/g, '$1.');
        // 2. Remove extra spaces after periods in initials: "A. B." -> "A.B."
        fixed = fixed.replace(/\. +(?=[A-Z\u00C0-\u00DE]\.)/g, '.');
        return fixed;
    };

    const getLangAttr = (el: Element): { rawName: string, value: string } | null => {
        if (!el) return null;
        if (el.hasAttribute('xml:lang')) return { rawName: 'xml:lang', value: el.getAttribute('xml:lang') || '' };
        if (el.hasAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')) {
            return { rawName: 'xml:lang', value: el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') || '' };
        }
        if (el.hasAttribute('lang')) return { rawName: 'lang', value: el.getAttribute('lang') || '' };
        if (el.attributes) {
            for (let i = 0; i < el.attributes.length; i++) {
                const attr = el.attributes[i];
                const aName = attr.name.toLowerCase();
                if (aName === 'xml:lang' || aName.endsWith(':lang') || aName === 'lang') {
                    return { rawName: attr.name, value: attr.value };
                }
            }
        }
        return null;
    };

    const pruneEmptyElements = (element: Element) => {
        const children = Array.from(element.children);
        children.forEach(child => pruneEmptyElements(child));

        const tagName = element.tagName.toLowerCase();
        if (
            tagName === 'sb:et-al' || 
            tagName === 'ce:et-al' || 
            tagName === 'sb:ellipsis' || 
            tagName === 'ce:ellipsis' || 
            tagName === 'sb:date-accessed' || 
            tagName === 'ce:date-accessed' || 
            tagName === 'sb:date' || 
            tagName === 'ce:date'
        ) return;
        if (element.hasAttribute('refid') || element.hasAttribute('xlink:href')) return;
        if (element.attributes && element.attributes.length > 0) return;

        const textContent = element.textContent?.trim() || '';
        const remainingChildren = element.children.length;

        if (remainingChildren === 0 && textContent === '' && (!element.attributes || element.attributes.length === 0)) {
            element.parentNode?.removeChild(element);
        }
    };

    const sanitizeXmlTags = (xmlStr: string): string => {
        let result = xmlStr;
        let prev;
        
        do {
            prev = result;
            result = result.replace(/<([a-z0-9_:-]+)(?:\s+[^>]*)?>\s*<\/\1>/gi, (match, tag) => {
                const ltag = tag.toLowerCase();
                if (
                    ltag === 'sb:et-al' || 
                    ltag === 'ce:et-al' || 
                    ltag === 'sb:ellipsis' || 
                    ltag === 'ce:ellipsis' || 
                    ltag === 'sb:date-accessed' || 
                    ltag === 'ce:date-accessed' || 
                    ltag === 'sb:date' || 
                    ltag === 'ce:date'
                ) return match;
                if (/\s[a-z0-9_:-]+=/i.test(match)) return match;
                return '';
            });
            result = result.replace(/<([a-z0-9_:-]+)(?:\s+[^>]*)?\/>/gi, (match, tag) => {
                const ltag = tag.toLowerCase();
                if (
                    ltag === 'sb:et-al' || 
                    ltag === 'ce:et-al' || 
                    ltag === 'sb:ellipsis' || 
                    ltag === 'ce:ellipsis' || 
                    ltag === 'ce:cross-ref' || 
                    ltag === 'ce:inter-ref' || 
                    ltag === 'sb:inter-ref' || 
                    ltag === 'sb:date-accessed' || 
                    ltag === 'ce:date-accessed' || 
                    ltag === 'sb:date' || 
                    ltag === 'ce:date'
                ) return match;
                if (match.includes('refid=') || match.includes('xlink:href=')) return match;
                if (/\s[a-z0-9_:-]+=/i.test(match)) return match;
                return '';
            });
        } while (prev !== result);

        result = result.replace(/<\/([a-z0-9_:-]+)>/gi, (match, tag, offset, fullStr) => {
            const substringBefore = fullStr.substring(0, offset);
            const openMatches = (substringBefore.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
            const closeMatches = (substringBefore.match(new RegExp(`<\/${tag}>`, 'gi')) || []).length;
            if (closeMatches >= openMatches) {
                return '';
            }
            return match;
        });

        return result;
    };

    const analyzeXml = () => {
        if (!input.trim()) {
            setToast({ msg: 'Please enter XML source code', type: 'warn' });
            return;
        }

        setIsProcessing(true);
        const currentAudit: AuditItem[] = [];

        try {
            const parser = new DOMParser();
            const trimmedInput = input.trim();
            
            // ID Awareness: Pre-scan for all existing IDs to detect duplicates
            const allUsedIds = new Set<string>();
            const duplicates = new Set<string>();
            const idRegex = /\bid=["']([^"']+)["']/g;
            let m;
            while ((m = idRegex.exec(trimmedInput)) !== null) {
                const idValue = m[1];
                if (allUsedIds.has(idValue)) {
                    duplicates.add(idValue);
                }
                allUsedIds.add(idValue);
            }

            // Scanner Protocol: Extract bib-reference blocks via Regex to avoid parsing unrelated XML parts
            const bibRegex = /<ce:bib-reference\b[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
            const matches = Array.from(trimmedInput.matchAll(bibRegex));
            
            if (matches.length === 0) {
                setToast({ msg: 'No <ce:bib-reference> tags detected by scanner.', type: 'warn' });
                setIsProcessing(false);
                return;
            }

            let idCounter = startId;
            
            // Helper to get next unique ID
            const getNextId = (prefix: string) => {
                // Ensure idCounter is a multiple of 5 as per user requirement (ir4006 was incorrect, ir4005/4010 expected)
                if (idCounter % 5 !== 0) {
                    idCounter += (5 - (idCounter % 5));
                }
                
                let candidate = `${prefix}${idCounter}`;
                while (allUsedIds.has(candidate)) {
                    idCounter += 5;
                    candidate = `${prefix}${idCounter}`;
                }
                allUsedIds.add(candidate);
                const result = candidate;
                idCounter += 5;
                return result;
            };

            matches.forEach((match, index) => {
                const fullBlock = match[0];
                const wrappedBlock = `<root ${NS_DECLS} xmlns:mml="http://www.w3.org/1998/Math/MathML" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:sa="http://www.elsevier.com/xml/common/struct-aff/dtd">${fullBlock}</root>`;
                
                const fragmentDoc = parser.parseFromString(wrappedBlock, "text/xml");
                if (fragmentDoc.getElementsByTagName("parsererror").length > 0) {
                    throw new Error(`Scanner Error in Reference ${index + 1}: Malformed block detected.`);
                }

                const ref = fragmentDoc.getElementsByTagName("ce:bib-reference")[0];
                const refId = ref.getAttribute("id") || `REF_${index + 1}`;
                
                const labelNode = ref.getElementsByTagName("ce:label")[0];
                const refLabel = labelNode?.textContent?.trim() || '';
                const titleNode = ref.getElementsByTagName("sb:maintitle")[0] || ref.getElementsByTagName("ce:maintitle")[0] || ref.getElementsByTagName("sb:title")[0];
                const refTitle = titleNode?.textContent?.trim() || '';

                const labels = Array.from(ref.getElementsByTagName("ce:label"));
                if (labels.length > 1) {
                    currentAudit.push({ 
                        id: refId, 
                        label: refLabel,
                        title: refTitle,
                        status: 'fixed', 
                        msg: `STRUCTURE: Detected ${labels.length} <ce:label> tags. Duplicate labels will be cleaned.`,
                        type: 'empty-element'
                    });
                }

                // Duplicate ID Warning
                if (duplicates.has(refId)) {
                    currentAudit.push({ 
                        id: refId, 
                        label: refLabel,
                        title: refTitle,
                        status: 'warning', 
                        msg: `DUPLICATE ID: This ID is used multiple times in the document.`,
                        type: 'id-fix'
                    });
                }

                const sbRef = ref.getElementsByTagName("sb:reference")[0] || ref.getElementsByTagName("ce:reference")[0] || ref.getElementsByTagName("ce:other-ref")[0];
                
                if (!sbRef) {
                    currentAudit.push({ id: refId, label: refLabel, title: refTitle, status: 'skip', msg: 'MISSING: <sb:reference> or <ce:other-ref> not found.' });
                    return;
                }

                // ID and Source Text Audit
                const sbId = sbRef.getAttribute("id") || "";
                
                if (duplicates.has(sbId) && sbId) {
                    currentAudit.push({ 
                        id: refId, 
                        label: refLabel,
                        title: refTitle,
                        status: 'fixed', 
                        msg: `DUPLICATE ID: Sub-element ID collision (${sbId}). Regeneration required.`,
                        type: 'id-fix'
                    });
                }

                if (sbRef.tagName.includes('other-ref')) {
                    if (!sbId || !sbId.startsWith("or")) {
                        currentAudit.push({ 
                            id: refId, 
                            label: refLabel,
                            title: refTitle,
                            status: 'fixed', 
                            msg: `ID: Incorrect prefix for other-ref (${sbId || 'missing'} -> unique OR ID)`, 
                            type: 'id-fix' 
                        });
                    }
                } else if (sbId.startsWith("or")) {
                    currentAudit.push({ 
                        id: refId, 
                        label: refLabel,
                        title: refTitle,
                        status: 'fixed', 
                        msg: `ID: Incorrect prefix detected (${sbId} -> unique RF ID)`, 
                        type: 'id-fix' 
                    });
                }

                // Inter-ref ID Audit
                const interRefs = Array.from(ref.getElementsByTagName("ce:inter-ref")).concat(Array.from(ref.getElementsByTagName("sb:inter-ref")));
                const urls = interRefs.map(ir => ir.textContent?.trim()).filter(u => u && (u.startsWith("http") || u.includes("www.")));

                // Inter-ref ID Audit
                interRefs.forEach(ir => {
                    const irId = ir.getAttribute("id") || "";
                    if (duplicates.has(irId) && irId) {
                        currentAudit.push({ 
                            id: refId, 
                            label: refLabel,
                            title: refTitle,
                            status: 'fixed', 
                            msg: `DUPLICATE ID: Inter-ref collision (${irId}).`,
                            type: 'ir-fix' 
                        });
                    }
                    if (!irId || irId.startsWith("or")) {
                        currentAudit.push({ 
                            id: refId, 
                            label: refLabel,
                            title: refTitle,
                            status: 'fixed', 
                            msg: `INTER-REF: Incorrect ID detected (${irId || 'missing'} -> unique IR ID)`, 
                            type: 'ir-fix' 
                        });
                    }
                });

                const sourceText = ref.getElementsByTagName("ce:source-text")[0];
                if (!sourceText && !sbRef.tagName.includes('other-ref')) {
                    currentAudit.push({ 
                        id: refId, 
                        label: refLabel,
                        title: refTitle,
                        status: 'fixed', 
                        msg: `SOURCE: Missing <ce:source-text> element. (unique SE ID)`, 
                        type: 'source-text' 
                    });
                }

                const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                let doi: string | null = null;
                let badHost: Element | null = null;
                let targetHost: Element | null = null;

                for (let host of hosts) {
                    const content = host.innerHTML;
                    const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                    
                    if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org') || host.getElementsByTagName("ce:inter-ref").length > 0)) {
                        doi = doiMatch[0];
                        badHost = host;
                        break;
                    }
                }

                if (doi && badHost) {
                    targetHost = hosts.find(h => h !== badHost && (
                        h.getElementsByTagName("sb:issue").length > 0 || 
                        h.getElementsByTagName("sb:pages").length > 0 ||
                        h.getElementsByTagName("sb:article-number").length > 0 ||
                        h.getElementsByTagName("sb:series").length > 0 ||
                        h.getElementsByTagName("sb:title").length > 0
                    )) || null;

                    const comments = Array.from(sbRef.getElementsByTagName("sb:comment"));
                    const hasInterveningComment = comments.length > 0;
                    
                    if (targetHost) {
                        if (hasInterveningComment) {
                            currentAudit.push({ 
                                id: refId, 
                                label: refLabel,
                                title: refTitle,
                                status: 'fixed', 
                                doi, 
                                msg: `CONFIRMATION REQUIRED: Intervening <sb:comment> detected before DOI host. Review to confirm migration to <ce:doi>${doi}</ce:doi> while retaining comment in position, or retain original structure.`, 
                                type: 'doi',
                                requiresConfirmation: true
                            });
                        } else {
                            currentAudit.push({ 
                                id: refId, 
                                label: refLabel,
                                title: refTitle,
                                status: 'fixed', 
                                doi, 
                                msg: `DIRECT DOI CAPTURE: Directly migrated <ce:inter-ref> to <ce:doi>${doi}</ce:doi> in primary host.`, 
                                type: 'doi',
                                requiresConfirmation: false
                            });
                        }
                    } else {
                        currentAudit.push({ 
                            id: refId, 
                            label: refLabel,
                            title: refTitle,
                            status: 'warning', 
                            doi, 
                            msg: 'WARNING: Target host missing for DOI migration.', 
                            type: 'doi',
                            requiresConfirmation: false
                        });
                    }
                }

                // Name Spacing and Initials Audit
                const givenNames = Array.from(ref.getElementsByTagName("ce:given-name"));
                givenNames.forEach(gn => {
                    const original = gn.textContent || '';
                    const fixed = fixGivenName(original);
                    if (original !== fixed) {
                        currentAudit.push({ 
                            id: refId, 
                            label: refLabel,
                            title: refTitle,
                            status: 'fixed', 
                            msg: `NAME: Initials standardization required (${original} -> ${fixed})`,
                            type: 'name'
                        });
                    }
                });

                // Contribution langtype Audit
                let hasContributionIssue = false;
                if (fixContributionLangtype) {
                    const contributions = Array.from(ref.getElementsByTagName("*")).filter(el => 
                        el.localName.toLowerCase().endsWith("contribution") || el.tagName.toLowerCase().endsWith("contribution")
                    );
                    contributions.forEach(contrib => {
                        const langInfo = getLangAttr(contrib);
                        if (langInfo) {
                            const langtype = contrib.getAttribute("langtype");
                            if (langtype !== "iso") {
                                hasContributionIssue = true;
                                currentAudit.push({
                                    id: refId,
                                    label: refLabel,
                                    title: refTitle,
                                    status: 'fixed',
                                    msg: `CONTRIBUTION: Missing langtype="iso" on <${contrib.tagName} xml:lang="${langInfo.value}">.`,
                                    type: 'contribution-langtype'
                                });
                            }
                        }
                    });
                }

                // Empty / Orphaned Publisher Tag Audit (Direct Auto-Clean)
                const publishers = Array.from(ref.getElementsByTagName("sb:publisher"));
                let hasEmptyPublisher = false;
                publishers.forEach(pub => {
                    const pubText = pub.textContent?.trim() || '';
                    if (!pubText) {
                        hasEmptyPublisher = true;
                    }
                });
                if (!hasEmptyPublisher && (/<sb:publisher\b[^>]*\/>/i.test(fullBlock) || /<sb:publisher\b[^>]*>(?:\s*<[a-z0-9_:-]+>\s*<\/[a-z0-9_:-]+>)*\s*<\/sb:publisher>/i.test(fullBlock))) {
                    hasEmptyPublisher = true;
                }

                if (hasEmptyPublisher) {
                    currentAudit.push({
                        id: refId,
                        label: refLabel,
                        title: refTitle,
                        status: 'fixed',
                        msg: 'DIRECT CLEANUP: Empty <sb:publisher></sb:publisher> element removed directly.',
                        type: 'publisher'
                    });
                }

                // Generic Empty Tags Audit (excluding tags that are valid empty)
                const emptyOtherMatches = fullBlock.match(/<(sb:location|sb:comment|sb:translated-title|sb:conference|sb:edition)\b[^>]*>\s*<\/\1>/gi);
                if (emptyOtherMatches && emptyOtherMatches.length > 0) {
                    emptyOtherMatches.forEach(tagMatch => {
                        const tagNameMatch = tagMatch.match(/<([a-z0-9_:-]+)/i);
                        const tagName = tagNameMatch ? tagNameMatch[1] : 'tag';
                        currentAudit.push({
                            id: refId,
                            label: refLabel,
                            title: refTitle,
                            status: 'fixed',
                            msg: `DIRECT CLEANUP: Empty <${tagName}></${tagName}> element removed directly.`,
                            type: 'empty-element'
                        });
                    });
                }

                // If no issues were detected for this reference, mark as valid
                const issuesForRef = currentAudit.filter(a => a.id === refId && a.status !== 'skip');
                if (issuesForRef.length === 0) {
                    currentAudit.push({ id: refId, label: refLabel, title: refTitle, status: 'skip', msg: 'VALID: No structural issues detected.' });
                }
            });

            // Initialize decisions specifically for items with DOI conversions needing checking (intervening sb:comment)
            const initialDecisions: Record<string, 'accept' | 'retain'> = {};
            let hasPendingConfirmations = false;
            currentAudit.forEach(item => {
                if (item.requiresConfirmation && item.status !== 'skip') {
                    if (autoAcceptRepairs) {
                        initialDecisions[item.id] = 'accept';
                    } else if (refDecisions[item.id]) {
                        initialDecisions[item.id] = refDecisions[item.id];
                    } else {
                        hasPendingConfirmations = true;
                    }
                }
            });
            setRefDecisions(initialDecisions);
            if (hasPendingConfirmations && !autoAcceptRepairs) {
                setMatrixFilter('action-required');
            }

            setAuditData(currentAudit);
            setStep('analyzing');
            setActiveTab('analysis');
            setToast({ 
                msg: hasPendingConfirmations && !autoAcceptRepairs
                    ? `Scanner complete. Action required: Please review and accept or retain references with intervening comments before repairing.`
                    : `Scanner complete. Identified ${matches.length} bibliography blocks.`, 
                type: hasPendingConfirmations && !autoAcceptRepairs ? 'warn' : 'success' 
            });
        } catch (err: any) {
            setToast({ msg: err.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const executeRepair = () => {
        // Enforce: cannot execute repair unless all items requiring confirmation are accepted or retained
        if (!autoAcceptRepairs && stats.pending > 0) {
            setToast({ 
                msg: `Cannot execute repair: ${stats.pending} reference(s) require action. Please select 'Accept Change' or 'Retain without change' (or 'Accept All') before executing.`, 
                type: 'warn' 
            });
            setMatrixFilter('action-required');
            setActiveTab('analysis');
            return;
        }

        setIsProcessing(true);

        try {
            const parser = new DOMParser();
            const serializer = new XMLSerializer();
            const finalAudit: AuditItem[] = [];
            const trimmedInput = input.trim();

            // ID Awareness: Pre-scan for all used IDs to maintain uniqueness
            const allUsedIds = new Set<string>();
            const duplicatesFoundInInput = new Set<string>();
            const idRegex = /\bid=["']([^"']+)["']/g;
            let m;
            while ((m = idRegex.exec(trimmedInput)) !== null) {
                const idValue = m[1];
                if (allUsedIds.has(idValue)) {
                    duplicatesFoundInInput.add(idValue);
                }
                allUsedIds.add(idValue);
            }

            let idCounter = startId;
            let refIndex = 0;

            // Helper to get next unique ID
            const getNextId = (prefix: string) => {
                // Ensure idCounter is a multiple of 5 as per user requirement
                if (idCounter % 5 !== 0) {
                    idCounter += (5 - (idCounter % 5));
                }

                let candidate = `${prefix}${idCounter}`;
                while (allUsedIds.has(candidate)) {
                    idCounter += 5;
                    candidate = `${prefix}${idCounter}`;
                }
                allUsedIds.add(candidate);
                const result = candidate;
                idCounter += 5;
                return result;
            };

            const bibRegex = /<ce:bib-reference\b[^>]*>([\s\S]*?)<\/ce:bib-reference>/g;
            
            const repairedXml = input.replace(bibRegex, (fullBlock) => {
                const idMatch = fullBlock.match(/<ce:bib-reference\b[^>]*\bid=["']([^"']+)["']/i);
                const refId = idMatch ? idMatch[1] : `REF_${refIndex + 1}`;
                
                const labelMatch = fullBlock.match(/<ce:label>(.*?)<\/ce:label>/i);
                const refLabel = labelMatch ? labelMatch[1].trim() : '';

                // Decision Check for DOI Conversion: If autoAcceptRepairs is disabled and the user chose to retain without change
                const decision = refDecisions[refId];
                const skipDoiConversion = !autoAcceptRepairs && decision === 'retain';

                const preCleanedBlock = sanitizeXmlTags(fullBlock);
                const wrappedBlock = `<root ${NS_DECLS} xmlns:mml="http://www.w3.org/1998/Math/MathML" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:sa="http://www.elsevier.com/xml/common/struct-aff/dtd">${preCleanedBlock}</root>`;
                const fragmentDoc = parser.parseFromString(wrappedBlock, "text/xml");
                const ref = fragmentDoc.getElementsByTagName("ce:bib-reference")[0];
                
                // Clean duplicate labels
                const labels = Array.from(ref.getElementsByTagName("ce:label"));
                if (labels.length > 1) {
                    for (let i = 1; i < labels.length; i++) {
                        labels[i].remove();
                    }
                    finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: 'REPAIRED: Removed duplicate <ce:label> tag.', type: 'empty-element' });
                }

                const sbRef = ref.getElementsByTagName("sb:reference")[0] || ref.getElementsByTagName("ce:reference")[0] || ref.getElementsByTagName("ce:other-ref")[0];
                
                if (sbRef) {
                    let currentSbId = sbRef.getAttribute("id") || "";
                    let needsIdFix = false;

                    // Check for duplicate or malformed prefix
                    if (duplicatesFoundInInput.has(currentSbId)) {
                        needsIdFix = true;
                    }

                    if (sbRef.tagName.includes('other-ref')) {
                        if (!currentSbId || !currentSbId.startsWith("or")) {
                            needsIdFix = true;
                        }
                        if (needsIdFix) {
                            const newId = getNextId('or');
                            sbRef.setAttribute("id", newId);
                            finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: `REPAIRED: other-ref ID corrected/duplicated and fixed to ${newId}.`, type: 'id-fix' });
                        }
                    } else {
                        if (currentSbId.startsWith("or") || !currentSbId || needsIdFix) {
                            const newId = getNextId('rf');
                            sbRef.setAttribute("id", newId);
                            finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: `REPAIRED: ID prefix/duplicate corrected to ${newId}.`, type: 'id-fix' });
                        }
                    }

                    // Inter-ref ID Repair
                    const interRefs = Array.from(ref.getElementsByTagName("ce:inter-ref")).concat(Array.from(ref.getElementsByTagName("sb:inter-ref")));
                    
                    interRefs.forEach(ir => {
                        const irId = ir.getAttribute("id") || "";
                        if (!irId || irId.startsWith("or") || duplicatesFoundInInput.has(irId)) {
                            const newIrId = getNextId('ir');
                            ir.setAttribute("id", newIrId);
                            finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: `REPAIRED: Inter-ref ID corrected/duplicated to ${newIrId}.`, type: 'ir-fix' });
                        }
                    });

                    let sourceText = ref.getElementsByTagName("ce:source-text")[0];
                    if (!sourceText && !sbRef.tagName.includes('other-ref')) {
                        sourceText = fragmentDoc.createElement("ce:source-text");
                        const stPrefix = trimmedInput.match(/\bid=["']srct\d+["']/i) ? 'srct' : 'se';
                        const newSeId = getNextId(stPrefix);
                        sourceText.setAttribute("id", newSeId);
                        sourceText.textContent = generateSourceText(sbRef);
                        ref.appendChild(sourceText);
                        finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: `REPAIRED: Generated missing <ce:source-text> (${newSeId}).`, type: 'source-text' });
                    } else if (sourceText) {
                        // Keep source-text content strictly as is; only assign an ID if completely missing
                        if (!sourceText.getAttribute("id")) {
                            const stPrefix = trimmedInput.match(/\bid=["']srct\d+["']/i) ? 'srct' : 'se';
                            const newSeId = getNextId(stPrefix);
                            sourceText.setAttribute("id", newSeId);
                            finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: `REPAIRED: Assigned ID to <ce:source-text> (${newSeId}).`, type: 'source-text' });
                        }
                    }

                    // Name Repair
                    const givenNames = Array.from(ref.getElementsByTagName("ce:given-name"));
                    let nameRepaired = false;
                    givenNames.forEach(gn => {
                        const original = gn.textContent || '';
                        const fixed = fixGivenName(original);
                        if (original !== fixed) {
                            gn.textContent = fixed;
                            nameRepaired = true;
                        }
                    });
                    if (nameRepaired) {
                        finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: 'REPAIRED: Initials standardized.', type: 'name' });
                    }

                    // DOI Migration
                    const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                    let doi: string | null = null;
                    let badHost: Element | null = null;
                    let targetHost: Element | null = null;

                    for (let host of hosts) {
                        const content = host.innerHTML;
                        const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                        if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org') || host.getElementsByTagName("ce:inter-ref").length > 0)) {
                            doi = doiMatch[0];
                            badHost = host;
                            break;
                        }
                    }

                    if (doi && badHost) {
                        const comments = Array.from(sbRef.getElementsByTagName("sb:comment"));
                        const hasInterveningComment = comments.length > 0;
                        const shouldSkip = hasInterveningComment && skipDoiConversion;

                        if (!shouldSkip) {
                            targetHost = hosts.find(h => h !== badHost && (
                                h.getElementsByTagName("sb:issue").length > 0 || 
                                h.getElementsByTagName("sb:pages").length > 0 ||
                                h.getElementsByTagName("sb:article-number").length > 0 ||
                                h.getElementsByTagName("sb:series").length > 0 ||
                                h.getElementsByTagName("sb:title").length > 0
                            )) || null;
                            
                            if (targetHost) {
                                badHost.parentNode?.removeChild(badHost);
                                const doiElem = fragmentDoc.createElement("ce:doi");
                                doiElem.textContent = doi;
                                targetHost.appendChild(doiElem);

                                // Commented text is retained in its current position per user specification

                                finalAudit.push({ 
                                    id: refId, 
                                    label: refLabel, 
                                    status: 'fixed', 
                                    doi, 
                                    msg: hasInterveningComment 
                                        ? `REPAIRED: DOI migrated to <ce:doi>${doi}</ce:doi> while retaining comment in position.` 
                                        : `DIRECT CAPTURE: DOI migrated to <ce:doi>${doi}</ce:doi>.`, 
                                    type: 'doi',
                                    requiresConfirmation: hasInterveningComment
                                });
                            }
                        } else {
                            finalAudit.push({ 
                                id: refId, 
                                label: refLabel, 
                                status: 'skip', 
                                doi, 
                                msg: 'RETAINED: Preserved DOI inter-ref and comment in original structure per user decision.', 
                                type: 'doi',
                                requiresConfirmation: true
                            });
                        }
                    }

                    // sb:contribution langtype="iso" Repair
                    if (fixContributionLangtype) {
                        const contributions = Array.from(ref.getElementsByTagName("*")).filter(el => 
                            el.localName.toLowerCase().endsWith("contribution") || el.tagName.toLowerCase().endsWith("contribution")
                        );
                        let contribFixed = false;
                        contributions.forEach(contrib => {
                            const langInfo = getLangAttr(contrib);
                            if (langInfo) {
                                const langtype = contrib.getAttribute("langtype");
                                if (langtype !== "iso") {
                                    if (contrib.hasAttribute("lang")) {
                                        contrib.removeAttribute("lang");
                                    }
                                    contrib.setAttribute("xml:lang", langInfo.value);
                                    contrib.setAttribute("langtype", "iso");
                                    contribFixed = true;
                                }
                            }
                        });
                        if (contribFixed) {
                            finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: 'REPAIRED: Inserted langtype="iso" attribute to <sb:contribution>.', type: 'contribution-langtype' });
                        }
                    }
                }

                // Prune empty DOM elements from ref
                pruneEmptyElements(ref);

                refIndex++;
                let serialized = serializer.serializeToString(ref);
                // Strip redundant namespace declarations injected by the serializer
                serialized = serialized.replace(/\sxmlns(?::[a-z0-9]+)?=['"][^'"]*['"]/gi, '');
                serialized = sanitizeXmlTags(serialized);

                // Audit report for empty/orphaned tag deletion
                if (fullBlock !== serialized) {
                    if (/<sb:publisher\b/i.test(fullBlock) && !/<sb:publisher\b/i.test(serialized)) {
                        finalAudit.push({ id: refId, label: refLabel, status: 'fixed', msg: 'REPAIRED: Deleted empty/orphaned <sb:publisher></sb:publisher> tag.', type: 'publisher' });
                    }
                }

                return serialized;
            });

            let xmlOutput = "";
            if (resultMode === 'full') {
                xmlOutput = repairedXml;
            } else {
                const repairedMatches = repairedXml.match(bibRegex);
                xmlOutput = repairedMatches ? repairedMatches.join('\n\n') : "";
            }

            // Restore original form of <sb:et-al /> and <sb:ellipsis /> tags
            const originalEtAls = input.match(/<sb:et-al[^>]*?\/?>/gi) || [];
            let etAlIndex = 0;
            xmlOutput = xmlOutput.replace(/<sb:et-al(?:\s*><\/sb:et-al>|[^>]*?\/?>)/gi, (match) => {
                return originalEtAls[etAlIndex++] || '<sb:et-al/>';
            });

            const originalEllipses = input.match(/<sb:ellipsis[^>]*?\/?>/gi) || [];
            let ellipsisIndex = 0;
            xmlOutput = xmlOutput.replace(/<sb:ellipsis(?:\s*><\/sb:ellipsis>|[^>]*?\/?>)/gi, (match) => {
                return originalEllipses[ellipsisIndex++] || '<sb:ellipsis/>';
            });

            const originalCeEllipses = input.match(/<ce:ellipsis[^>]*?\/?>/gi) || [];
            let ceEllipsisIndex = 0;
            xmlOutput = xmlOutput.replace(/<ce:ellipsis(?:\s*><\/ce:ellipsis>|[^>]*?\/?>)/gi, (match) => {
                return originalCeEllipses[ceEllipsisIndex++] || '<ce:ellipsis/>';
            });

            setOutput(xmlOutput);
            setAuditData(finalAudit);
            setStep('completed');
            setActiveTab('result');
            
            // Background Scanner for Smart Suggestions
            const newSuggestions: SmartSuggestion[] = [];
            
            // 1. XML Normalizer (Renumber)
            if (xmlOutput.includes('<ce:bib-reference')) {
                newSuggestions.push({
                    id: 'xml-renumber',
                    toolName: 'XML Normalizer',
                    description: 'Bibliography detected. Use this to ensure all references are correctly numbered and cross-references are updated.',
                    path: '/xmlRenumber',
                    icon: <Hash className="w-4 h-4" />,
                    condition: 'Bibliography detected'
                });
            }

            // 2. Other-Refs Scanner
            const otherRefCount = (xmlOutput.match(/<ce:other-ref/g) || []).length;
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
            const tagMatches = xmlOutput.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
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
            const unlinkedCitations = (xmlOutput.match(/<ce:cross-ref(?![^>]*\brefid=)[^>]*>/g) || []).length;
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
            if (xmlOutput.includes('<ce:bibliography')) {
                newSuggestions.push({
                    id: 'uncited-cleaner',
                    toolName: 'Uncited Ref Cleaner',
                    description: 'Bibliography detected. Use this tool to identify and remove references that are not cited in the text.',
                    path: '/uncitedCleaner',
                    icon: <Eraser className="w-4 h-4" />,
                    condition: 'Bibliography detected'
                });
            }

            // 6. View Synchronizer
            if (xmlOutput.includes('<ce:para>') && (xmlOutput.includes('<ce:cross-ref') || xmlOutput.includes('<ce:float-anchor'))) {
                newSuggestions.push({
                    id: 'view-sync',
                    toolName: 'View Synchronizer',
                    description: 'Complex structural nodes detected. Use this to ensure visual consistency between XML source and rendered views.',
                    path: '/viewSync',
                    icon: <RefreshCw className="w-4 h-4" />,
                    condition: 'Complex structural nodes detected'
                });
            }

            // 2. Reference Sorter
            newSuggestions.push({
                id: 'ref-sorter',
                toolName: 'Reference Sorter',
                description: 'Bibliography out of sequence? Align them alphabetically using the Reference Sorter.',
                path: '/refSorter',
                icon: <SortAsc className="w-4 h-4" />,
                condition: 'Bibliography detected'
            });

            setSuggestions(newSuggestions);

            const fixedItems = finalAudit.filter(a => a.status === 'fixed');
            const isModified = fixedItems.length > 0 || (input.trim() !== xmlOutput.trim());
            if (isModified) {
                const count = fixedItems.length > 0 ? fixedItems.length : 1;
                setToast({ 
                    msg: `Modification Detected: ${count} automatic structural correction${count > 1 ? 's' : ''} applied across XML tags, links, and schemas.`, 
                    type: 'success' 
                });
            } else {
                setToast({ 
                    msg: 'XML schema verified: All references conform to Elsevier DTD with no modifications needed.', 
                    type: 'info' 
                });
            }
        } catch (err: any) {
            setToast({ msg: err.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setInput(e.target?.result as string);
            setToast({ msg: 'File imported successfully', type: 'success' });
        };
        reader.readAsText(file);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(output);
        setToast({ msg: 'Repaired XML copied to clipboard', type: 'success' });
    };

    const downloadResult = () => {
        const blob = new Blob([output], { type: 'text/xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `REPAIRED_SCHEMA_${Date.now()}.xml`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const clearAll = () => {
        setInput('');
        setOutput('');
        setAuditData([]);
        setStep('input');
        setActiveTab('input');
        setToast({ msg: 'Buffer cleared', type: 'warn' });
    };

    // Group audit items by refId for structured analysis matrix display
    const groupedRefs = React.useMemo(() => {
        const map = new Map<string, {
            id: string;
            label?: string;
            title?: string;
            items: AuditItem[];
            hasIssues: boolean;
            needsChecking: boolean;
            isAutomaticOnly: boolean;
        }>();

        auditData.forEach(item => {
            if (!map.has(item.id)) {
                map.set(item.id, {
                    id: item.id,
                    label: item.label,
                    title: item.title,
                    items: [],
                    hasIssues: false,
                    needsChecking: false,
                    isAutomaticOnly: false
                });
            }
            const refObj = map.get(item.id)!;
            if (item.label && !refObj.label) refObj.label = item.label;
            if (item.title && !refObj.title) refObj.title = item.title;
            refObj.items.push(item);
            if (item.status !== 'skip') {
                refObj.hasIssues = true;
                if (item.requiresConfirmation) {
                    refObj.needsChecking = true;
                }
            }
        });

        map.forEach(refObj => {
            refObj.isAutomaticOnly = refObj.hasIssues && !refObj.needsChecking;
        });

        return Array.from(map.values());
    }, [auditData]);

    const filteredRefs = React.useMemo(() => {
        return groupedRefs.filter(refObj => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesId = refObj.id.toLowerCase().includes(q);
                const matchesLabel = (refObj.label || '').toLowerCase().includes(q);
                const matchesTitle = (refObj.title || '').toLowerCase().includes(q);
                const matchesMsg = refObj.items.some(i => i.msg.toLowerCase().includes(q));
                if (!matchesId && !matchesLabel && !matchesTitle && !matchesMsg) return false;
            }

            const decision = refDecisions[refObj.id];
            if (matrixFilter === 'action-required') {
                return refObj.hasIssues;
            }
            if (matrixFilter === 'needs-confirmation') {
                return refObj.needsChecking;
            }
            if (matrixFilter === 'automatic') {
                return refObj.isAutomaticOnly;
            }
            if (matrixFilter === 'accepted') {
                return refObj.needsChecking && (autoAcceptRepairs || decision === 'accept');
            }
            if (matrixFilter === 'retained') {
                return refObj.needsChecking && !autoAcceptRepairs && decision === 'retain';
            }
            if (matrixFilter === 'valid') {
                return !refObj.hasIssues;
            }
            return true;
        });
    }, [groupedRefs, searchQuery, matrixFilter, refDecisions, autoAcceptRepairs]);

    const stats = {
        total: groupedRefs.length,
        fixed: auditData.filter(a => a.status === 'fixed').length,
        warnings: auditData.filter(a => a.status === 'warning').length,
        withIssues: groupedRefs.filter(r => r.hasIssues).length,
        needsCheckingTotal: groupedRefs.filter(r => r.needsChecking).length,
        automaticTotal: groupedRefs.filter(r => r.isAutomaticOnly).length,
        accepted: groupedRefs.filter(r => r.needsChecking && (autoAcceptRepairs || refDecisions[r.id] === 'accept')).length,
        retained: groupedRefs.filter(r => r.needsChecking && !autoAcceptRepairs && refDecisions[r.id] === 'retain').length,
        pending: groupedRefs.filter(r => r.needsChecking && !autoAcceptRepairs && !refDecisions[r.id]).length,
        valid: groupedRefs.filter(r => !r.hasIssues).length
    };

    const modificationStats = React.useMemo(() => {
        const fixedItems = auditData.filter(a => a.status === 'fixed');
        const sourceTextCount = fixedItems.filter(a => a.type === 'source-text').length;
        const doiCount = fixedItems.filter(a => a.type === 'doi' || a.type === 'ir-fix').length;
        const nameCount = fixedItems.filter(a => a.type === 'name').length;
        const langtypeCount = fixedItems.filter(a => a.type === 'contribution-langtype').length;
        const emptyElementCount = fixedItems.filter(a => a.type === 'empty-element' || a.type === 'publisher').length;
        const idCount = fixedItems.filter(a => a.type === 'id-fix').length;
        const modifiedRefIds = Array.from(new Set(fixedItems.map(a => a.id)));

        return {
            totalFixed: fixedItems.length,
            modifiedRefCount: modifiedRefIds.length,
            sourceTextCount,
            doiCount,
            nameCount,
            langtypeCount,
            emptyElementCount,
            idCount,
            fixedItems
        };
    }, [auditData]);

    const handleAcceptAll = () => {
        const updated: Record<string, 'accept' | 'retain'> = {};
        groupedRefs.forEach(r => {
            if (r.needsChecking) {
                updated[r.id] = 'accept';
            }
        });
        setRefDecisions(prev => ({ ...prev, ...updated }));
        setToast({ msg: "All confirmation-required DOI conversions accepted for repair.", type: 'success' });
    };

    const handleRetainAll = () => {
        const updated: Record<string, 'accept' | 'retain'> = {};
        groupedRefs.forEach(r => {
            if (r.needsChecking) {
                updated[r.id] = 'retain';
            }
        });
        setRefDecisions(prev => ({ ...prev, ...updated }));
        setToast({ msg: "All confirmation-required items set to retain original structure.", type: 'warn' });
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0 }
    };

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const scrollToChange = (direction: 'next' | 'prev') => {
        if (!diffContainerRef.current) return;
        const changeRows = diffContainerRef.current.querySelectorAll('[data-change-row="true"][data-change-index]');
        if (changeRows.length === 0) return;

        let nextIndex = currentChangeIndex;

        if (direction === 'next') {
            if (currentChangeIndex < 0 || currentChangeIndex >= changeRows.length - 1) {
                nextIndex = 0;
            } else {
                nextIndex = currentChangeIndex + 1;
            }
        } else {
            if (currentChangeIndex <= 0) {
                nextIndex = changeRows.length - 1;
            } else {
                nextIndex = currentChangeIndex - 1;
            }
        }

        const targetRow = changeRows[nextIndex] as HTMLElement;
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setCurrentChangeIndex(nextIndex);
    };

    const buildLines = (diffParts: Diff.Change[], isLeft: boolean) => {
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

        const delClass = 'bg-rose-100 text-rose-900 line-through decoration-rose-300';
        const insClass = 'bg-emerald-100 text-emerald-900 font-semibold';

        diffParts.forEach(part => {
            if (part.removed && isLeft) append(part.value, delClass);
            else if (part.added && !isLeft) append(part.value, insClass);
            else if (!part.added && !part.removed) append(part.value, null);
        });

        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const { rows: diffRows, count: calculatedChangeCount } = React.useMemo(() => {
        if (!output) return { rows: [], count: 0 };
        const diff = Diff.diffLines(input, output);
        let rows: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;
        let localChangeCount = 0;

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
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
            } else {
                leftVal = rightVal = current.value;
                i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

            if (type === 'replace') {
                const wordDiff = Diff.diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildLines(wordDiff, true);
                rightLines = buildLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildLines([{removed: true, value: leftVal} as Diff.Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{added: true, value: rightVal} as Diff.Change], false);
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
                let lNumClass = 'bg-slate-50 text-slate-400'; 
                let rNumClass = 'bg-slate-50 text-slate-400';

                if (type === 'delete') {
                    lClass = 'bg-rose-50/50';
                    lNumClass = 'bg-rose-50 text-rose-400';
                } else if (type === 'insert') {
                    rClass = 'bg-emerald-50/50';
                    rNumClass = 'bg-emerald-50 text-emerald-400';
                } else if (type === 'replace') {
                    if (lContent !== undefined) {
                        lClass = 'bg-rose-50/50';
                        lNumClass = 'bg-rose-50 text-rose-400';
                    }
                    if (rContent !== undefined) {
                        rClass = 'bg-emerald-50/50';
                        rNumClass = 'bg-emerald-50 text-emerald-400';
                    }
                }

                const isChange = type !== 'equal';
                if (isChange && r === 0) {
                    localChangeCount++;
                }
                const currentBlockIdx = isChange ? localChangeCount - 1 : -1;

                rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group"
                        data-change-row={isChange ? 'true' : undefined}
                        data-change-index={isChange && r === 0 ? currentBlockIdx : undefined}
                        data-change-index-group={isChange ? currentBlockIdx : undefined}
                    >
                        <td className={`w-12 text-right text-[10px] font-medium p-2 border-r border-slate-100 select-none font-mono transition-colors ${lNumClass}`}>
                            {lNum}
                        </td>
                        <td className={`p-2 font-mono text-[11px] text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} 
                            dangerouslySetInnerHTML={{__html: lContent || ''}}>
                        </td>
                        <td className={`w-12 text-right text-[10px] font-medium p-2 border-r border-slate-100 border-l border-slate-100 select-none font-mono transition-colors ${rNumClass}`}>
                            {rNum}
                        </td>
                        <td className={`p-2 font-mono text-[11px] text-slate-600 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} 
                            dangerouslySetInnerHTML={{__html: rContent || ''}}>
                        </td>
                    </tr>
                );
            }
        }
        return { rows, count: localChangeCount };
    }, [input, output]);

    React.useEffect(() => {
        if (!diffContainerRef.current) return;
        
        // Remove old highlights
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));

        if (currentChangeIndex === -1) return;

        // Add new highlights
        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));
    }, [currentChangeIndex, diffRows]);

    const renderDiff = () => {
        return (
            <div className="flex-grow relative flex flex-col overflow-hidden">
                <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar bg-white">
                    <table className="w-full text-sm font-mono border-collapse table-fixed">
                        <colgroup>
                            <col className="w-12" />
                            <col className="w-[calc(50%-3rem)]" />
                            <col className="w-12" />
                            <col className="w-[calc(50%-3rem)]" />
                        </colgroup>
                        <thead className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                            <tr>
                                <th className="py-2.5 px-2 border-r border-slate-200 text-center">LN</th>
                                <th className="py-2.5 px-6 text-left border-r border-slate-200">Source_Buffer</th>
                                <th className="py-2.5 px-2 border-r border-slate-200 text-center">LN</th>
                                <th className="py-2.5 px-6 text-left">Repaired_Node</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {diffRows}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
            <div className="max-w-full mx-auto p-2 lg:p-4 flex flex-col h-full gap-6">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                            <Cpu className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800">Reference Structure Repair <span className="text-indigo-600">v3.2</span></h1>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Elsevier Reference Repair Protocol</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end px-4 border-r border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System_Status</span>
                            <span className={`text-xs font-bold flex items-center gap-1.5 ${step === 'completed' ? 'text-emerald-500' : step === 'analyzing' ? 'text-amber-500' : 'text-slate-400'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${step === 'completed' ? 'bg-emerald-500' : step === 'analyzing' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
                                {step === 'completed' ? 'VERIFIED' : step === 'analyzing' ? 'SCANNING' : 'IDLE'}
                            </span>
                        </div>
                        <button 
                            onClick={clearAll}
                            className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all duration-200"
                            title="Reset Workspace"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Main Workspace */}
                <main className="flex-grow flex flex-col gap-6 overflow-hidden">
                    {/* Tab Navigation */}
                    <nav className="flex items-center gap-1 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200/60 w-fit">
                        <button
                            onClick={() => setActiveTab('input')}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'input' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <FileCode className="w-4 h-4" />
                            Input Buffer
                        </button>
                        <button
                            onClick={() => setActiveTab('analysis')}
                            disabled={step === 'input'}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'analysis' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <Activity className="w-4 h-4" />
                            Analysis Matrix
                            {auditData.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-md">
                                    {auditData.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('result')}
                            disabled={step !== 'completed'}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'result' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <CheckCircle className="w-4 h-4" />
                            Repaired Node
                            {step === 'completed' && (
                                modificationStats.totalFixed > 0 ? (
                                    <span className="ml-1.5 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-md flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        {modificationStats.totalFixed} Modified
                                    </span>
                                ) : (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                                        Clean
                                    </span>
                                )
                            )}
                        </button>
                    </nav>

                    <div className="flex-grow grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
                        {/* Left Sidebar: Stats & Actions */}
                        <aside className="xl:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col gap-6">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h3>
                                    <div className="flex flex-col gap-2">
                                        {step === 'input' ? (
                                            <button 
                                                onClick={analyzeXml}
                                                disabled={isProcessing || !input.trim()}
                                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                                Analyze XML
                                            </button>
                                        ) : step === 'analyzing' ? (
                                            <button 
                                                onClick={executeRepair}
                                                disabled={isProcessing || (!autoAcceptRepairs && stats.pending > 0)}
                                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all duration-200 flex items-center justify-center gap-2"
                                                title={!autoAcceptRepairs && stats.pending > 0 ? `Cannot execute repair: ${stats.pending} reference(s) in Action Required require decision` : "Execute Repair"}
                                            >
                                                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                Execute Repair
                                                {!autoAcceptRepairs && stats.pending > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-mono">
                                                        {stats.pending}
                                                    </span>
                                                )}
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={clearAll}
                                                className="w-full py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                New Session
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full py-3.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2"
                                        >
                                            <Upload className="w-4 h-4" />
                                            Upload File
                                        </button>
                                        <input type="file" ref={fileInputRef} className="hidden" accept=".xml,.txt" onChange={handleFileUpload} />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Output Protocol</h3>
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            onClick={() => setResultMode('full')}
                                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-3 ${resultMode === 'full' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            <Monitor className="w-4 h-4" />
                                            Full Document
                                        </button>
                                        <button 
                                            onClick={() => setResultMode('refs')}
                                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-3 ${resultMode === 'refs' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            <FileText className="w-4 h-4" />
                                            References Only
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">ID Configuration</h3>
                                    <div className="flex flex-col gap-3">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Starting ID Number</label>
                                            <div className="flex items-center gap-2">
                                                <Database className="w-4 h-4 text-indigo-500" />
                                                <input 
                                                    type="number" 
                                                    value={startId}
                                                    onChange={(e) => setStartId(parseInt(e.target.value) || 0)}
                                                    className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 w-full"
                                                    placeholder="4000"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Repair Protocols</h3>
                                    <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <Switch 
                                            id="auto-accept-repairs"
                                            checked={autoAcceptRepairs}
                                            onChange={(val) => {
                                                setAutoAcceptRepairs(val);
                                                setToast({ 
                                                    msg: val 
                                                        ? "Auto-Repair enabled: All detected changes will be automatically accepted." 
                                                        : "Auto-Repair disabled: Manual approval required (Accept Change or Retain without change).", 
                                                    type: 'warn' 
                                                });
                                            }}
                                            label="Auto-Accept Changes"
                                            subLabel={autoAcceptRepairs ? "AUTO-ACCEPT" : "MANUAL APPROVAL"}
                                            color="emerald"
                                            tooltip="When toggled OFF (default), you must select 'Accept Change' or 'Retain without change' in the Analysis Matrix for each reference. When ON, all proposed repairs are automatically applied."
                                        />
                                        <div className="h-px bg-slate-200/60 my-1" />
                                        <Switch 
                                            id="fix-contrib-langtype"
                                            checked={fixContributionLangtype}
                                            onChange={setFixContributionLangtype}
                                            label="Fix sb:contribution langtype"
                                            subLabel={fixContributionLangtype ? "ENABLED" : "DISABLED"}
                                            color="indigo"
                                            tooltip="Detects <sb:contribution> with a 'lang' attribute and inserts langtype='iso' if missing."
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Session Metrics</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Refs</span>
                                            <span className="text-lg font-bold text-slate-700">{stats.total}</span>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Fixed</span>
                                            <span className="text-lg font-bold text-emerald-600">
                                                {stats.fixed}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-100 text-white relative overflow-hidden group">
                                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                                    <Cpu className="w-32 h-32" />
                                </div>
                                <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                                    <Terminal className="w-4 h-4" />
                                    Architect Mode
                                </h4>
                                <p className="text-xs text-indigo-100 leading-relaxed">
                                    The protocol is currently optimized for Elsevier XML standards. All repairs are validated against DTD schemas.
                                </p>
                            </div>

                            {/* Architectural Recommendations moved to sidebar to save vertical space */}
                            {suggestions.length > 0 && activeTab === 'result' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <div className="p-5 bg-indigo-50/30 border border-indigo-100 rounded-2xl">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Lightbulb className="w-4 h-4 text-indigo-600" />
                                            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Recommendations</h4>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            {suggestions.map(sug => (
                                                <button 
                                                    key={sug.id}
                                                    onClick={() => {
                                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Reference Structure Repair v3.2' } });
                                                    }}
                                                    className="flex items-center gap-3 p-3 bg-white border border-indigo-50 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all group text-left"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                        {sug.icon}
                                                    </div>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="text-[9px] font-black text-indigo-900 uppercase tracking-tight truncate">{sug.toolName}</div>
                                                        <div className="text-[8px] text-indigo-500 font-medium leading-tight line-clamp-2">{sug.description}</div>
                                                    </div>
                                                    <ArrowRight className="w-3 h-3 text-indigo-300 group-hover:text-indigo-600 shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </aside>

                        {/* Right Content Area: Tab Panels */}
                        <section className="xl:col-span-9 flex flex-col overflow-hidden">
                            <AnimatePresence mode="wait">
                                {activeTab === 'input' && (
                                    <motion.div
                                        key="input-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-2">
                                                <FileCode className="w-4 h-4 text-indigo-500" />
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Source_XML_Buffer</span>
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-400">UTF-8 Encoding</span>
                                        </div>
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder="Paste XML fragment or full document here..."
                                            className="flex-grow p-6 font-mono text-sm text-slate-600 focus:outline-none resize-none custom-scrollbar placeholder:text-slate-300"
                                        />
                                    </motion.div>
                                )}

                                {activeTab === 'analysis' && (
                                    <motion.div
                                        key="analysis-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        {/* Matrix Header & Protocol Status */}
                                        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                                                    <Activity className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Analysis_Matrix</span>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-mono">
                                                            {groupedRefs.length} REFS
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 font-medium">
                                                        {autoAcceptRepairs 
                                                            ? "Auto-Repair active: All proposed structural modifications will be applied." 
                                                            : "Interactive Approval: Review proposed fixes and select Accept Change or Retain without change."}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Batch Actions & Protocol Badge */}
                                            <div className="flex items-center flex-wrap gap-2">
                                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                                                    autoAcceptRepairs 
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                        : stats.pending > 0 
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                }`}>
                                                    {autoAcceptRepairs ? (
                                                        <>
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                            <span>Auto-Accept Active</span>
                                                        </>
                                                    ) : stats.pending > 0 ? (
                                                        <>
                                                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                            <span>{stats.pending} Action Required</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                                                            <span>All Decisions Set</span>
                                                        </>
                                                    )}
                                                </div>

                                                {groupedRefs.some(r => r.needsChecking) && (
                                                    <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                                                        <button
                                                            onClick={handleAcceptAll}
                                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                                            title="Accept all proposed repairs"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Accept All
                                                        </button>
                                                        <button
                                                            onClick={handleRetainAll}
                                                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                                                            title="Retain all references in original state"
                                                        >
                                                            <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                            Retain All
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Filter & Search Bar */}
                                        <div className="px-4 py-3 border-b border-slate-100 bg-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                                            {/* Filter Chips */}
                                            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
                                                    <Filter className="w-3 h-3" /> Filter:
                                                </span>
                                                <button
                                                    onClick={() => setMatrixFilter('action-required')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                        matrixFilter === 'action-required' 
                                                            ? 'bg-amber-600 text-white shadow-xs' 
                                                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
                                                    }`}
                                                >
                                                    <Layers className="w-3 h-3" />
                                                    Pending Queue ({stats.withIssues})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('needs-confirmation')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                        matrixFilter === 'needs-confirmation' 
                                                            ? 'bg-amber-700 text-white shadow-xs' 
                                                            : 'bg-amber-100/60 text-amber-900 hover:bg-amber-200/60 border border-amber-300/60'
                                                    }`}
                                                >
                                                    <ShieldAlert className="w-3 h-3" />
                                                    Needs Confirmation ({stats.needsCheckingTotal})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('automatic')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                        matrixFilter === 'automatic' 
                                                            ? 'bg-teal-600 text-white shadow-xs' 
                                                            : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200/60'
                                                    }`}
                                                >
                                                    <Zap className="w-3 h-3" />
                                                    Automatic ({stats.automaticTotal})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('accepted')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                        matrixFilter === 'accepted' 
                                                            ? 'bg-emerald-600 text-white shadow-xs' 
                                                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
                                                    }`}
                                                >
                                                    Accepted ({stats.accepted})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('retained')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                        matrixFilter === 'retained' 
                                                            ? 'bg-slate-700 text-white shadow-xs' 
                                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                                                    }`}
                                                >
                                                    Retained ({stats.retained})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('valid')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                        matrixFilter === 'valid' 
                                                            ? 'bg-indigo-600 text-white shadow-xs' 
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    Valid ({stats.valid})
                                                </button>
                                                <button
                                                    onClick={() => setMatrixFilter('all')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                        matrixFilter === 'all' 
                                                            ? 'bg-indigo-600 text-white shadow-xs' 
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    All ({stats.total})
                                                </button>
                                            </div>

                                            {/* Search Box */}
                                            <div className="relative min-w-[220px]">
                                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    placeholder="Search ID, label, title, tag..."
                                                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                                                />
                                                {searchQuery && (
                                                    <button
                                                        onClick={() => setSearchQuery('')}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Matrix Items List / Queues */}
                                        <div className="flex-grow overflow-auto custom-scrollbar p-6">
                                            {matrixFilter === 'action-required' ? (
                                                <div className="flex flex-col gap-8">
                                                    {/* Queue Overview Summary */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* Queue 1 Card: User Confirmation Required */}
                                                        <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200 flex flex-col justify-between gap-3 shadow-2xs">
                                                            <div>
                                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                                                                            <ShieldAlert className="w-4 h-4" />
                                                                        </div>
                                                                        <span className="text-xs font-black text-amber-900 uppercase tracking-tight">
                                                                            1. Needs User Confirmation
                                                                        </span>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                                                        stats.pending > 0 
                                                                            ? 'bg-amber-200/80 text-amber-900 animate-pulse' 
                                                                            : 'bg-emerald-100 text-emerald-800'
                                                                    }`}>
                                                                        {stats.pending > 0 ? `${stats.pending} Awaiting Decision` : 'All Resolved'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                                                                    Ambiguous structures (e.g. inter-ref to DOI conversion with intervening <code className="bg-amber-100/80 px-1 py-0.2 rounded font-mono text-[10px]">&lt;sb:comment&gt;</code>). Execution is locked until confirmed or retained.
                                                                </p>
                                                            </div>
                                                            {groupedRefs.some(r => r.needsChecking) && (
                                                                <div className="flex items-center gap-2 pt-2 border-t border-amber-200/60">
                                                                    <button
                                                                        onClick={handleAcceptAll}
                                                                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                                                                    >
                                                                        <Check className="w-3.5 h-3.5" />
                                                                        Accept All ({stats.needsCheckingTotal})
                                                                    </button>
                                                                    <button
                                                                        onClick={handleRetainAll}
                                                                        className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                                                                    >
                                                                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                                        Retain All
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Queue 2 Card: Automatic Schema Repairs */}
                                                        <div className="p-4 rounded-2xl bg-teal-50/50 border border-teal-200 flex flex-col justify-between gap-3 shadow-2xs">
                                                            <div>
                                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700">
                                                                            <Zap className="w-4 h-4" />
                                                                        </div>
                                                                        <span className="text-xs font-black text-teal-900 uppercase tracking-tight">
                                                                            2. Handled Automatically
                                                                        </span>
                                                                    </div>
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-teal-100 text-teal-800">
                                                                        {stats.automaticTotal} Ready to Apply
                                                                    </span>
                                                                </div>
                                                                <p className="text-[11px] text-teal-800 leading-relaxed font-medium">
                                                                    Standard deterministic Elsevier DTD repairs (direct DOI capture, empty tag pruning, contributor <code className="bg-teal-100/80 px-1 py-0.2 rounded font-mono text-[10px]">langtype='iso'</code>, author initials). Applied automatically during execution.
                                                                </p>
                                                            </div>
                                                            <div className="pt-2 border-t border-teal-200/60 flex items-center gap-1.5 text-[11px] text-teal-700 font-bold">
                                                                <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
                                                                <span>No confirmation needed — fully compliant with Elsevier DTD</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Section 1: User Confirmation Queue */}
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                                                    Queue 1: Requires User Confirmation ({filteredRefs.filter(r => r.needsChecking).length})
                                                                </h4>
                                                            </div>
                                                            <span className="text-[11px] font-medium text-slate-500">
                                                                Manual decision required per item
                                                            </span>
                                                        </div>

                                                        {filteredRefs.filter(r => r.needsChecking).length > 0 ? (
                                                            <div className="flex flex-col gap-4">
                                                                {filteredRefs.filter(r => r.needsChecking).map((refObj, idx) => {
                                                                    const currentDecision = refDecisions[refObj.id];
                                                                    const isAutoAccepted = autoAcceptRepairs && refObj.needsChecking;
                                                                    const isAccepted = isAutoAccepted || currentDecision === 'accept';
                                                                    const isRetained = !autoAcceptRepairs && currentDecision === 'retain';
                                                                    const isPending = refObj.needsChecking && !autoAcceptRepairs && !currentDecision;

                                                                    return (
                                                                        <motion.div 
                                                                            key={refObj.id}
                                                                            initial={{ opacity: 0, y: 6 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                                                            className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                                                                                isPending 
                                                                                    ? 'bg-amber-50/25 border-amber-300/90 shadow-2xs' 
                                                                                    : isRetained 
                                                                                        ? 'bg-slate-50/60 border-slate-200' 
                                                                                        : 'bg-emerald-50/20 border-emerald-200'
                                                                            }`}
                                                                        >
                                                                            {/* Card Header */}
                                                                            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-white/80">
                                                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                                                    {refObj.label && (
                                                                                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-lg font-mono">
                                                                                            {refObj.label}
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="text-xs font-black text-slate-800 font-mono tracking-tight">
                                                                                        {refObj.id}
                                                                                    </span>
                                                                                    {refObj.title && (
                                                                                        <span className="text-xs text-slate-600 font-medium truncate max-w-[360px] italic" title={refObj.title}>
                                                                                            "{refObj.title}"
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                {/* Status Badge */}
                                                                                <div className="flex items-center gap-2 shrink-0">
                                                                                    {isAutoAccepted ? (
                                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                                            Auto-Accepted
                                                                                        </span>
                                                                                    ) : isAccepted ? (
                                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                                            Accepted for Repair
                                                                                        </span>
                                                                                    ) : isRetained ? (
                                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                                                            <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                                                            Retained Unchanged
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                                                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                                                            Action Required
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* Issues List */}
                                                                            <div className="p-4 flex flex-col gap-2.5">
                                                                                {refObj.items.filter(i => i.status !== 'skip').map((item, iIdx) => (
                                                                                    <div key={iIdx} className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                                                                                        item.requiresConfirmation 
                                                                                            ? 'bg-amber-50/60 border-amber-200 text-amber-950' 
                                                                                            : 'bg-slate-50 border-slate-200/70 text-slate-700'
                                                                                    }`}>
                                                                                        <div className="mt-0.5 shrink-0">
                                                                                            {item.requiresConfirmation ? (
                                                                                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                                                                            ) : (
                                                                                                <Zap className="w-4 h-4 text-teal-600" />
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex-grow min-w-0">
                                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                                                                    item.requiresConfirmation ? 'bg-amber-200 text-amber-900' : 'bg-indigo-100 text-indigo-700'
                                                                                                }`}>
                                                                                                    {item.requiresConfirmation ? 'Confirmation Required' : item.type || 'Fix'}
                                                                                                </span>
                                                                                                <span className="text-[10px] font-mono text-amber-700 font-bold">
                                                                                                    [Inter-ref with comment]
                                                                                                </span>
                                                                                            </div>
                                                                                            <p className="font-medium leading-relaxed">{item.msg}</p>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>

                                                                            {/* Footer Decision Buttons */}
                                                                            <div className="px-4 py-3 bg-slate-50/90 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                                <div className="text-[11px] text-slate-600 font-medium">
                                                                                    {isRetained 
                                                                                        ? "Original XML structure will be preserved without change." 
                                                                                        : isAccepted 
                                                                                            ? "DOI conversion will be executed and comment will be retained in position." 
                                                                                            : "Please confirm whether to migrate to <ce:doi> or retain original tag:"}
                                                                                </div>

                                                                                <div className="flex items-center gap-2 shrink-0">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setRefDecisions(prev => ({ ...prev, [refObj.id]: 'accept' }));
                                                                                        }}
                                                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                                                            isAccepted
                                                                                                ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-600/20'
                                                                                                : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                                                        }`}
                                                                                    >
                                                                                        <Check className="w-3.5 h-3.5" />
                                                                                        Accept Change
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setRefDecisions(prev => ({ ...prev, [refObj.id]: 'retain' }));
                                                                                        }}
                                                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                                                            isRetained
                                                                                                ? 'bg-slate-700 text-white shadow-xs ring-2 ring-slate-700/20'
                                                                                                : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                                                                                        }`}
                                                                                    >
                                                                                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                                                        Retain without change
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400 font-medium">
                                                                No references requiring manual confirmation.
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Section 2: Automatic Repairs Queue */}
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex items-center justify-between border-b border-teal-200 pb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-teal-500" />
                                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                                                    Queue 2: Handled Automatically ({filteredRefs.filter(r => r.isAutomaticOnly).length})
                                                                </h4>
                                                            </div>
                                                            <span className="text-[11px] font-medium text-teal-700 font-bold">
                                                                Applied automatically on Execute Repair
                                                            </span>
                                                        </div>

                                                        {filteredRefs.filter(r => r.isAutomaticOnly).length > 0 ? (
                                                            <div className="flex flex-col gap-4">
                                                                {filteredRefs.filter(r => r.isAutomaticOnly).map((refObj, idx) => (
                                                                    <motion.div 
                                                                        key={refObj.id}
                                                                        initial={{ opacity: 0, y: 6 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                                                        className="rounded-2xl border border-teal-200/80 bg-teal-50/15 overflow-hidden shadow-2xs"
                                                                    >
                                                                        {/* Card Header */}
                                                                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-white/80">
                                                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                                                {refObj.label && (
                                                                                    <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-lg font-mono">
                                                                                        {refObj.label}
                                                                                    </span>
                                                                                )}
                                                                                <span className="text-xs font-black text-slate-800 font-mono tracking-tight">
                                                                                    {refObj.id}
                                                                                </span>
                                                                                {refObj.title && (
                                                                                    <span className="text-xs text-slate-600 font-medium truncate max-w-[360px] italic" title={refObj.title}>
                                                                                        "{refObj.title}"
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                                                                <Zap className="w-3.5 h-3.5 text-teal-600" />
                                                                                Direct Auto-Clean
                                                                            </span>
                                                                        </div>

                                                                        {/* Issues List */}
                                                                        <div className="p-4 flex flex-col gap-2.5">
                                                                            {refObj.items.filter(i => i.status !== 'skip').map((item, iIdx) => (
                                                                                <div key={iIdx} className="p-3 rounded-xl border bg-white border-teal-100 text-slate-700 flex items-start gap-3 text-xs">
                                                                                    <div className="mt-0.5 shrink-0">
                                                                                        <CheckCircle className="w-4 h-4 text-teal-600" />
                                                                                    </div>
                                                                                    <div className="flex-grow min-w-0">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-teal-100 text-teal-800 font-mono">
                                                                                                {item.type || 'Auto-Fix'}
                                                                                            </span>
                                                                                            <span className="text-[10px] text-slate-400 font-mono">
                                                                                                [Standard Protocol]
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className="font-medium text-slate-800 leading-relaxed">{item.msg}</p>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </motion.div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400 font-medium">
                                                                No automatic schema repairs detected in this dataset.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : filteredRefs.length > 0 ? (
                                                <div className="flex flex-col gap-4">
                                                    {filteredRefs.map((refObj, idx) => {
                                                        const currentDecision = refDecisions[refObj.id];
                                                        const isAutoAccepted = autoAcceptRepairs && refObj.needsChecking;
                                                        const isAccepted = isAutoAccepted || currentDecision === 'accept';
                                                        const isRetained = !autoAcceptRepairs && currentDecision === 'retain';
                                                        const isPending = refObj.needsChecking && !autoAcceptRepairs && !currentDecision;

                                                        return (
                                                            <motion.div 
                                                                key={refObj.id}
                                                                initial={{ opacity: 0, y: 6 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                                                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                                                                    isPending 
                                                                        ? 'bg-amber-50/20 border-amber-300/80 shadow-xs' 
                                                                        : isRetained 
                                                                            ? 'bg-slate-50/60 border-slate-200' 
                                                                            : isAccepted 
                                                                                ? 'bg-emerald-50/20 border-emerald-200' 
                                                                                : 'bg-white border-slate-200/80'
                                                                }`}
                                                            >
                                                                {/* Reference Card Header */}
                                                                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-white/70">
                                                                    <div className="flex items-center gap-2.5 flex-wrap">
                                                                        {refObj.label && (
                                                                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-lg font-mono">
                                                                                {refObj.label}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-xs font-black text-slate-800 font-mono tracking-tight">
                                                                            {refObj.id}
                                                                        </span>
                                                                        {refObj.title && (
                                                                            <span className="text-xs text-slate-600 font-medium truncate max-w-[360px] italic" title={refObj.title}>
                                                                                "{refObj.title}"
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Decision Status Badge */}
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        {refObj.needsChecking ? (
                                                                            isAutoAccepted ? (
                                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                                    Auto-Accepted
                                                                                </span>
                                                                            ) : isAccepted ? (
                                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                                    Accepted for Repair
                                                                                </span>
                                                                            ) : isRetained ? (
                                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                                                    <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                                                    Retained Unchanged
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                                                    Action Required
                                                                                </span>
                                                                            )
                                                                        ) : refObj.hasIssues ? (
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                                                                <Zap className="w-3.5 h-3.5 text-teal-600" />
                                                                                Direct Auto-Clean
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-500">
                                                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                                                Valid Schema
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Reference Card Issues List */}
                                                                <div className="p-4 flex flex-col gap-2.5">
                                                                    {refObj.hasIssues ? (
                                                                        refObj.items.filter(i => i.status !== 'skip').map((item, iIdx) => (
                                                                            <div key={iIdx} className="flex items-start gap-3 text-xs">
                                                                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                                                                    item.status === 'fixed' ? 'bg-emerald-500' : 
                                                                                    item.status === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
                                                                                }`} />
                                                                                <div className="flex-grow">
                                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                                        {item.type && (
                                                                                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                                                                                item.type === 'doi' ? 'bg-indigo-100 text-indigo-700' : 
                                                                                                item.type === 'name' ? 'bg-fuchsia-100 text-fuchsia-700' :
                                                                                                item.type === 'id-fix' ? 'bg-amber-100 text-amber-700' :
                                                                                                item.type === 'publisher' || item.type === 'empty-element' ? 'bg-rose-100 text-rose-700' :
                                                                                                item.type === 'contribution-langtype' ? 'bg-cyan-100 text-cyan-700' :
                                                                                                'bg-emerald-100 text-emerald-700'
                                                                                            }`}>
                                                                                                {item.type}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <p className="text-slate-700 font-medium">{item.msg}</p>
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-xs text-slate-400 font-medium">All structural nodes conform to Elsevier DTD standards.</p>
                                                                    )}
                                                                </div>

                                                                {/* Reference Decision Action Footer (for items needing checking) */}
                                                                {refObj.needsChecking && (
                                                                    <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                        <div className="text-[11px] text-slate-500 font-medium">
                                                                            {isRetained 
                                                                                ? "Original XML structure will be preserved." 
                                                                                : isAccepted 
                                                                                    ? "Targeted schema repairs will be applied upon execution." 
                                                                                    : "Please choose an action for this reference:"}
                                                                        </div>

                                                                        <div className="flex items-center gap-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    setRefDecisions(prev => ({ ...prev, [refObj.id]: 'accept' }));
                                                                                }}
                                                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                                                    isAccepted
                                                                                        ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20'
                                                                                        : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                                                }`}
                                                                            >
                                                                                <Check className="w-3.5 h-3.5" />
                                                                                Accept Change
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setRefDecisions(prev => ({ ...prev, [refObj.id]: 'retain' }));
                                                                                }}
                                                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                                                    isRetained
                                                                                        ? 'bg-slate-700 text-white shadow-sm ring-2 ring-slate-700/20'
                                                                                        : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                                                                                }`}
                                                                            >
                                                                                <Shield className="w-3.5 h-3.5 text-slate-500" />
                                                                                Retain without change
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-slate-300 gap-4">
                                                    <Activity className="w-12 h-12 opacity-20" />
                                                    <p className="text-sm font-medium text-slate-400">
                                                        {auditData.length > 0 
                                                            ? (searchQuery ? 'No references matching search criteria.' : 'No references match current filter.')
                                                            : 'Awaiting XML analysis signal...'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'result' && (
                                    <motion.div
                                        key="result-tab"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex-grow flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Repaired_Node</span>
                                                </div>
                                                <div className="flex bg-slate-200/50 p-1 rounded-lg">
                                                    <button 
                                                        onClick={() => setViewMode('output')}
                                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'output' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    >
                                                        SOURCE
                                                    </button>
                                                    <button 
                                                        onClick={() => setViewMode('diff')}
                                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'diff' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    >
                                                        DIFF_VIEW
                                                    </button>
                                                </div>
                                                {viewMode === 'diff' && calculatedChangeCount > 0 && (
                                                    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/80 rounded-xl px-2.5 py-1 shadow-2xs ml-2">
                                                        <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
                                                            <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
                                                                <GitCompare className="w-3 h-3 text-indigo-600" strokeWidth={2.5} />
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Changes:</span>
                                                                <span className="text-xs font-black text-slate-900 font-mono tabular-nums">
                                                                    {currentChangeIndex >= 0 ? currentChangeIndex + 1 : 1} <span className="text-slate-300">/</span> {calculatedChangeCount}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-0.5">
                                                            <button 
                                                                onClick={() => scrollToChange('prev')}
                                                                className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded transition-all text-slate-600 hover:text-indigo-600 group"
                                                                title="Previous Change"
                                                            >
                                                                <ChevronUp className="w-4 h-4 group-active:-translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                                            </button>
                                                            <button 
                                                                onClick={() => scrollToChange('next')}
                                                                className="p-1 hover:bg-slate-200 active:bg-slate-300 rounded transition-all text-slate-600 hover:text-indigo-600 group"
                                                                title="Next Change"
                                                            >
                                                                <ChevronDown className="w-4 h-4 group-active:translate-y-0.5 transition-transform" strokeWidth={2.5} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={downloadResult}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold transition-all shadow-sm"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    DOWNLOAD
                                                </button>
                                                <button 
                                                    onClick={copyToClipboard}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                    COPY_OUTPUT
                                                </button>
                                            </div>
                                        </div>

                                        {/* Visual 'Modification Detected' Indicator Banner */}
                                        {modificationStats.totalFixed > 0 ? (
                                            <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-emerald-50/50 to-indigo-50/40 p-4 transition-all shrink-0">
                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                    <div className="flex items-start md:items-center gap-3">
                                                        <div className="relative w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs">
                                                            <Sparkles className="w-5 h-5 text-amber-600 animate-pulse" />
                                                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                                                                    Modification Detected
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded-md bg-amber-200/90 text-amber-900 text-[10px] font-black font-mono">
                                                                    {modificationStats.totalFixed} CORRECTION{modificationStats.totalFixed !== 1 ? 'S' : ''} APPLIED
                                                                </span>
                                                                <span className="text-[11px] text-amber-800/80 font-medium">
                                                                    across {modificationStats.modifiedRefCount} reference node{modificationStats.modifiedRefCount !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                                                                Automated repair protocol corrected tags, links, and schemas to conform with Elsevier DTD standards.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Quick Category Summary Badges & Action Buttons */}
                                                    <div className="flex items-center flex-wrap gap-2 shrink-0">
                                                        {viewMode === 'output' ? (
                                                            <button
                                                                onClick={() => setViewMode('diff')}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300/80 text-slate-700 hover:bg-amber-50 text-xs font-bold shadow-2xs transition-all"
                                                            >
                                                                <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
                                                                <span>Inspect in Diff</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setViewMode('output')}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300/80 text-slate-700 hover:bg-amber-50 text-xs font-bold shadow-2xs transition-all"
                                                            >
                                                                <FileCode className="w-3.5 h-3.5 text-slate-600" />
                                                                <span>View Source</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => setShowModificationDetails(!showModificationDetails)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all"
                                                        >
                                                            <Activity className="w-3.5 h-3.5" />
                                                            <span>{showModificationDetails ? 'Hide Audit Log' : 'View Audit Log'}</span>
                                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showModificationDetails ? 'rotate-180' : ''}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Category Pill Badges */}
                                                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-amber-200/50 flex-wrap">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Applied Fixes:</span>
                                                    {modificationStats.sourceTextCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold shadow-2xs">
                                                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                                                            {modificationStats.sourceTextCount} ce:source-text Generated
                                                        </span>
                                                    )}
                                                    {modificationStats.doiCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 text-[10px] font-bold shadow-2xs">
                                                            <LinkIcon className="w-3 h-3 text-indigo-600" />
                                                            {modificationStats.doiCount} Link / DOI Migrations
                                                        </span>
                                                    )}
                                                    {modificationStats.nameCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-fuchsia-200 text-fuchsia-800 text-[10px] font-bold shadow-2xs">
                                                            <Zap className="w-3 h-3 text-fuchsia-600" />
                                                            {modificationStats.nameCount} Author Names Structured
                                                        </span>
                                                    )}
                                                    {modificationStats.langtypeCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-cyan-200 text-cyan-800 text-[10px] font-bold shadow-2xs">
                                                            <ShieldCheck className="w-3 h-3 text-cyan-600" />
                                                            {modificationStats.langtypeCount} langtype="iso" Injected
                                                        </span>
                                                    )}
                                                    {modificationStats.emptyElementCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-800 text-[10px] font-bold shadow-2xs">
                                                            <Trash2 className="w-3 h-3 text-rose-600" />
                                                            {modificationStats.emptyElementCount} Empty Elements Pruned
                                                        </span>
                                                    )}
                                                    {modificationStats.idCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-800 text-[10px] font-bold shadow-2xs">
                                                            <Hash className="w-3 h-3 text-amber-600" />
                                                            {modificationStats.idCount} ID Conflicts Resolved
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Expandable Modification Audit Trail */}
                                                {showModificationDetails && (
                                                    <div className="mt-3 pt-3 border-t border-amber-200/50 flex flex-col gap-2 max-h-56 overflow-y-auto custom-scrollbar bg-white/80 p-3 rounded-xl border border-amber-200">
                                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                                            Detailed Applied Modifications ({modificationStats.fixedItems.length})
                                                        </div>
                                                        {modificationStats.fixedItems.map((item, idx) => (
                                                            <div key={`${item.id}-${idx}`} className="flex items-start gap-2.5 text-xs bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                                                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px] font-bold shrink-0">
                                                                    {item.id}
                                                                </span>
                                                                {item.label && (
                                                                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-bold shrink-0">
                                                                        {item.label}
                                                                    </span>
                                                                )}
                                                                <span className="text-slate-700 font-medium leading-relaxed">
                                                                    {item.msg}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="border-b border-emerald-200/60 bg-emerald-50/50 p-3 flex items-center justify-between shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                    <span className="text-xs font-bold text-emerald-900">No XML Modifications Required</span>
                                                    <span className="text-[11px] text-emerald-700/80 font-medium">— All input references already conform to Elsevier DTD standards.</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-grow flex flex-col overflow-hidden">
                                            {viewMode === 'output' ? (
                                                <textarea
                                                    readOnly
                                                    value={output}
                                                    className="flex-grow p-6 font-mono text-sm text-slate-600 focus:outline-none resize-none custom-scrollbar bg-slate-50/30"
                                                />
                                            ) : (
                                                renderDiff()
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>
                    </div>
                </main>

                {/* Footer */}
                <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200/60">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol_Active</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Database className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local_Cache_Sync</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>© 2026 Editorial Systems Pro. All rights reserved.</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>Reference_Structure_Repair_v3.2.0</span>
                    </div>
                </footer>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #E2E8F0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #CBD5E1;
                }
            `}</style>
        </div>
    );
};

export default StructuralNodeArchitect;
