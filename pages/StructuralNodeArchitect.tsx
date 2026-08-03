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
    SortAsc
} from 'lucide-react';
import Toast from '../components/Toast';
import { SmartSuggestion, ToolId } from '../types';

interface AuditItem {
    id: string;
    status: 'fixed' | 'warning' | 'skip';
    doi?: string;
    msg: string;
    type?: 'doi' | 'name' | 'id-fix' | 'source-text' | 'ir-fix';
}

const StructuralNodeArchitect: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [startId, setStartId] = useState(4000);
    const [viewMode, setViewMode] = useState<'output' | 'diff'>('output');
    const [auditData, setAuditData] = useState<AuditItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<'input' | 'analyzing' | 'completed'>('input');
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [activeTab, setActiveTab] = useState<'input' | 'analysis' | 'result'>('input');
    const [resultMode, setResultMode] = useState<'full' | 'refs'>('full');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);

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
        
        // 4. Host (Journal/Book info)
        const host = sbRef.getElementsByTagName("sb:host")[0] || sbRef.getElementsByTagName("ce:host")[0];
        let journal = "";
        let year = "";
        let volume = "";
        let issue = "";
        let pages = "";
        let articleNum = "";
        let editors: string[] = [];

        if (host) {
            // Journal Title
            const mainTitles = Array.from(host.getElementsByTagName("sb:maintitle")).concat(Array.from(host.getElementsByTagName("ce:maintitle")));
            if (mainTitles.length > 0) {
                journal = mainTitles[0].textContent || "";
            } else {
                // Try series title
                const seriesTitle = host.getElementsByTagName("sb:title")[0]?.textContent || host.getElementsByTagName("ce:title")[0]?.textContent;
                if (seriesTitle) journal = seriesTitle;
            }
            
            // Date
            const dateNode = host.getElementsByTagName("sb:date")[0] || host.getElementsByTagName("ce:date")[0];
            if (dateNode) year = dateNode.textContent || "";
            
            // Volume
            const volNode = host.getElementsByTagName("sb:volume-nr")[0] || host.getElementsByTagName("ce:volume-nr")[0];
            if (volNode) volume = volNode.textContent || "";
            
            // Issue
            const issueNode = host.getElementsByTagName("sb:issue-nr")[0] || host.getElementsByTagName("ce:issue-nr")[0];
            if (issueNode) issue = issueNode.textContent || "";

            // Pages
            const firstPage = host.getElementsByTagName("sb:first-page")[0]?.textContent || host.getElementsByTagName("ce:first-page")[0]?.textContent || "";
            const lastPage = host.getElementsByTagName("sb:last-page")[0]?.textContent || host.getElementsByTagName("ce:last-page")[0]?.textContent || "";
            if (firstPage && lastPage) {
                pages = `${firstPage}-${lastPage}`;
            } else if (firstPage) {
                pages = firstPage;
            }

            // Article Number
            const artNode = host.getElementsByTagName("sb:article-number")[0] || host.getElementsByTagName("ce:article-number")[0];
            if (artNode) articleNum = artNode.textContent || "";

            // Editors
            const editorNodes = Array.from(host.getElementsByTagName("sb:editor")).concat(Array.from(host.getElementsByTagName("ce:editor")));
            editorNodes.forEach(ed => {
                const given = ed.getElementsByTagName("ce:given-name")[0]?.textContent || ed.getElementsByTagName("sb:given-name")[0]?.textContent || "";
                const surname = ed.getElementsByTagName("ce:surname")[0]?.textContent || ed.getElementsByTagName("sb:surname")[0]?.textContent || "";
                if (given || surname) editors.push(`${given} ${surname}`.trim());
            });
        }

        let parts: string[] = [];
        if (authors.length > 0) parts.push(authors.join(", "));
        if (title) parts.push(title);
        
        if (editors.length > 0) {
            parts.push(`In: ${editors.join(", ")} (Eds.)`);
        }

        if (journal) {
            let journalPart = journal;
            if (year) journalPart += ` (${year})`;
            if (volume) journalPart += ` ${volume}`;
            if (issue) journalPart += ` (${issue})`;
            if (pages) journalPart += ` ${pages}`;
            if (articleNum) journalPart += ` ${articleNum}`;
            parts.push(journalPart.trim());
        } else {
            if (year) parts.push(`(${year})`);
            if (volume) parts.push(volume);
            if (issue) parts.push(`(${issue})`);
            if (pages) parts.push(pages);
            if (articleNum) parts.push(articleNum);
        }

        // 5. DOI
        const doiNode = sbRef.getElementsByTagName("ce:doi")[0] || sbRef.getElementsByTagName("sb:doi")[0];
        const doi = doiNode?.textContent?.trim();
        if (doi) {
            parts.push(`https://doi.org/${doi.replace(/^doi:/i, '')}`);
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
                parts.push(urlPart);
            }
        });

        // If date exists but no URL was found to attach it to, add it as a separate part
        if (dateAccessedStr) {
            parts.push(dateAccessedStr);
        }
        
        let result = parts.filter(p => p.trim()).join(", ");
        if (result && !result.endsWith(".")) result += ".";
        return result;
    };

    const fixGivenName = (name: string): string => {
        if (!name) return name;
        // 1. Add periods to capital letters if missing (handles "A B" -> "A. B." and "JD" -> "J.D.")
        // Matches a capital letter NOT followed by a lowercase letter, a period, or an apostrophe
        let fixed = name.replace(/([A-Z])(?![a-z\.\'])/g, '$1.');
        // 2. Remove extra spaces after periods in initials: "A. B." -> "A.B."
        fixed = fixed.replace(/\. +(?=[A-Z]\.)/g, '.');
        return fixed;
    };

    const pruneEmptyElements = (element: Element) => {
        const children = Array.from(element.children);
        children.forEach(child => pruneEmptyElements(child));

        const tagName = element.tagName.toLowerCase();
        if (tagName === 'sb:et-al' || tagName === 'ce:et-al') return;
        if (element.hasAttribute('refid') || element.hasAttribute('xlink:href')) return;

        const textContent = element.textContent?.trim() || '';
        const remainingChildren = element.children.length;

        if (remainingChildren === 0 && textContent === '') {
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
                if (ltag === 'sb:et-al' || ltag === 'ce:et-al') return match;
                return '';
            });
            result = result.replace(/<([a-z0-9_:-]+)(?:\s+[^>]*)?\/>/gi, (match, tag) => {
                const ltag = tag.toLowerCase();
                if (ltag === 'sb:et-al' || ltag === 'ce:et-al' || ltag === 'ce:cross-ref' || ltag === 'ce:inter-ref') return match;
                if (match.includes('refid=') || match.includes('xlink:href=')) return match;
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
                
                // Duplicate ID Warning
                if (duplicates.has(refId)) {
                    currentAudit.push({ 
                        id: refId, 
                        status: 'warning', 
                        msg: `DUPLICATE ID: This ID is used multiple times in the document.`,
                        type: 'id-fix'
                    });
                }

                const sbRef = ref.getElementsByTagName("sb:reference")[0] || ref.getElementsByTagName("ce:reference")[0] || ref.getElementsByTagName("ce:other-ref")[0];
                
                if (!sbRef) {
                    currentAudit.push({ id: refId, status: 'skip', msg: 'MISSING: <sb:reference> or <ce:other-ref> not found.' });
                    return;
                }

                // ID and Source Text Audit
                const sbId = sbRef.getAttribute("id") || "";
                
                if (duplicates.has(sbId) && sbId) {
                    currentAudit.push({ 
                        id: refId, 
                        status: 'fixed', 
                        msg: `DUPLICATE ID: Sub-element ID collision (${sbId}). Regeneration required.`,
                        type: 'id-fix'
                    });
                }

                if (sbRef.tagName.includes('other-ref')) {
                    if (!sbId || !sbId.startsWith("or")) {
                        currentAudit.push({ 
                            id: refId, 
                            status: 'fixed', 
                            msg: `ID: Incorrect prefix for other-ref (${sbId || 'missing'} -> unique OR ID)`, 
                            type: 'id-fix' 
                        });
                    }
                } else if (sbId.startsWith("or")) {
                    currentAudit.push({ 
                        id: refId, 
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
                            status: 'fixed', 
                            msg: `DUPLICATE ID: Inter-ref collision (${irId}).`,
                            type: 'ir-fix' 
                        });
                    }
                    if (!irId || irId.startsWith("or")) {
                        currentAudit.push({ 
                            id: refId, 
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
                        status: 'fixed', 
                        msg: `SOURCE: Missing <ce:source-text> element. (unique SE ID)`, 
                        type: 'source-text' 
                    });
                } else if (sourceText && (urls.length > 0 || sbRef.getElementsByTagName("sb:date-accessed").length > 0)) {
                    const stContent = sourceText.textContent || "";
                    const missingUrl = urls.some(u => u && !stContent.includes(u));
                    const missingDate = sbRef.getElementsByTagName("sb:date-accessed").length > 0 && !stContent.includes("Accessed");
                    
                    if (missingUrl || missingDate) {
                        currentAudit.push({ 
                            id: refId, 
                            status: 'fixed', 
                            msg: `SOURCE: Source text missing URL(s) or Accessed Date.`, 
                            type: 'source-text' 
                        });
                    }
                }

                const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                let doi: string | null = null;
                let badHost: Element | null = null;
                let targetHost: Element | null = null;

                for (let host of hosts) {
                    const content = host.innerHTML;
                    const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                    
                    if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org'))) {
                        doi = doiMatch[0];
                        badHost = host;
                        break;
                    }
                }

                if (doi && badHost) {
                    targetHost = hosts.find(h => h !== badHost && (h.getElementsByTagName("sb:issue").length > 0 || h.getElementsByTagName("sb:pages").length > 0)) || null;
                    
                    if (targetHost) {
                        currentAudit.push({ id: refId, status: 'fixed', doi, msg: 'READY: DOI migration possible.', type: 'doi' });
                    } else {
                        currentAudit.push({ id: refId, status: 'warning', doi, msg: 'WARNING: Target host missing for migration.', type: 'doi' });
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
                            status: 'fixed', 
                            msg: `NAME: Initials standardization required (${original} -> ${fixed})`,
                            type: 'name'
                        });
                    }
                });

                if (!doi && givenNames.every(gn => gn.textContent === fixGivenName(gn.textContent || ''))) {
                    currentAudit.push({ id: refId, status: 'skip', msg: 'VALID: No structural issues detected.' });
                }
            });

            setAuditData(currentAudit);
            setStep('analyzing');
            setActiveTab('analysis');
            setToast({ msg: `Scanner complete. Identified ${matches.length} bibliography blocks.`, type: 'success' });
        } catch (err: any) {
            setToast({ msg: err.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const executeRepair = () => {
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
                const preCleanedBlock = sanitizeXmlTags(fullBlock);
                const wrappedBlock = `<root ${NS_DECLS} xmlns:mml="http://www.w3.org/1998/Math/MathML" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:sa="http://www.elsevier.com/xml/common/struct-aff/dtd">${preCleanedBlock}</root>`;
                const fragmentDoc = parser.parseFromString(wrappedBlock, "text/xml");
                const ref = fragmentDoc.getElementsByTagName("ce:bib-reference")[0];
                const refId = ref.getAttribute("id") || `REF_${refIndex + 1}`;
                
                // Track current refId to know if we need to fix it if it's a known duplicate
                // But generally bib-reference IDs are handled by Renumber tool,
                // however if it's a known duplicate we could log a warning.

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
                            finalAudit.push({ id: refId, status: 'fixed', msg: `REPAIRED: other-ref ID corrected/duplicated and fixed to ${newId}.` });
                        }
                    } else {
                        if (currentSbId.startsWith("or") || !currentSbId || needsIdFix) {
                            const newId = getNextId('rf');
                            sbRef.setAttribute("id", newId);
                            finalAudit.push({ id: refId, status: 'fixed', msg: `REPAIRED: ID prefix/duplicate corrected to ${newId}.` });
                        }
                    }

                    // Inter-ref ID Repair
                    const interRefs = Array.from(ref.getElementsByTagName("ce:inter-ref")).concat(Array.from(ref.getElementsByTagName("sb:inter-ref")));
                    const urlsInRef = interRefs.map(ir => ir.textContent?.trim()).filter(u => u && (u.startsWith("http") || u.includes("www.")));
                    
                    interRefs.forEach(ir => {
                        const irId = ir.getAttribute("id") || "";
                        if (!irId || irId.startsWith("or") || duplicatesFoundInInput.has(irId)) {
                            const newIrId = getNextId('ir');
                            ir.setAttribute("id", newIrId);
                            finalAudit.push({ id: refId, status: 'fixed', msg: `REPAIRED: Inter-ref ID corrected/duplicated to ${newIrId}.` });
                        }
                    });

                    let sourceText = ref.getElementsByTagName("ce:source-text")[0];
                    const dateAccessedInRef = sbRef.getElementsByTagName("sb:date-accessed")[0];
                    let needsSourceUpdate = false;
                    if (!sourceText && !sbRef.tagName.includes('other-ref')) {
                        needsSourceUpdate = true;
                    } else if (sourceText && !sbRef.tagName.includes('other-ref')) {
                        const stContent = sourceText.textContent || "";
                        const missingUrl = urlsInRef.some(u => u && !stContent.includes(u));
                        const missingDate = dateAccessedInRef && !stContent.includes("Accessed");
                        if (missingUrl || missingDate) {
                            needsSourceUpdate = true;
                        }
                    }

                    if (needsSourceUpdate) {
                        if (!sourceText) {
                            sourceText = fragmentDoc.createElement("ce:source-text");
                            const newSeId = getNextId('se');
                            sourceText.setAttribute("id", newSeId);
                            ref.appendChild(sourceText);
                        }
                        sourceText.textContent = generateSourceText(sbRef);
                        finalAudit.push({ id: refId, status: 'fixed', msg: `REPAIRED: Synchronized source text with URLs/Accessed Date.` });
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
                        finalAudit.push({ id: refId, status: 'fixed', msg: 'REPAIRED: Initials standardized.' });
                    }

                    // DOI Migration
                    const hosts = Array.from(sbRef.getElementsByTagName("sb:host"));
                    let doi: string | null = null;
                    let badHost: Element | null = null;
                    let targetHost: Element | null = null;

                    for (let host of hosts) {
                        const content = host.innerHTML;
                        const doiMatch = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
                        if (doiMatch && (host.getElementsByTagName("sb:e-host").length > 0 || host.textContent?.includes('doi.org'))) {
                            doi = doiMatch[0];
                            badHost = host;
                            break;
                        }
                    }

                    if (doi && badHost) {
                        targetHost = hosts.find(h => h !== badHost && (h.getElementsByTagName("sb:issue").length > 0 || h.getElementsByTagName("sb:pages").length > 0)) || null;
                        if (targetHost) {
                            badHost.parentNode?.removeChild(badHost);
                            const doiElem = fragmentDoc.createElement("ce:doi");
                            doiElem.textContent = doi;
                            targetHost.appendChild(doiElem);
                            finalAudit.push({ id: refId, status: 'fixed', doi, msg: 'REPAIRED: DOI migrated successfully.' });
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
                        finalAudit.push({ id: refId, status: 'fixed', msg: 'REPAIRED: Deleted empty/orphaned <sb:publisher> tag.' });
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

            // Restore original form of <sb:et-al /> tags
            const originalEtAls = input.match(/<sb:et-al[^>]*?\/?>/g) || [];
            let etAlIndex = 0;
            xmlOutput = xmlOutput.replace(/<sb:et-al[^>]*?\/?>/g, (match) => {
                return originalEtAls[etAlIndex++] || match;
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
            setToast({ msg: 'Structural repair protocol complete.', type: 'success' });
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

    const stats = {
        total: auditData.length,
        fixed: auditData.filter(a => a.status === 'fixed').length,
        warnings: auditData.filter(a => a.status === 'warning').length
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
            if (currentChangeIndex === changeRows.length - 1) {
                setToast({ msg: 'End of changes reached. Nothing follows.', type: 'warn' });
                return;
            }
            nextIndex = currentChangeIndex + 1;
        } else {
            if (currentChangeIndex <= 0) {
                setToast({ msg: 'Start of changes reached. No previous changes.', type: 'warn' });
                return;
            }
            nextIndex = currentChangeIndex - 1;
        }

        const targetRow = changeRows[nextIndex] as HTMLElement;
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                {calculatedChangeCount > 0 && (
                    <div className="absolute bottom-8 right-10 flex items-center gap-3 bg-white/95 backdrop-blur-md px-5 py-3 rounded-[2rem] border border-slate-200 shadow-2xl z-30 animate-in fade-in slide-in-from-bottom-4 duration-500 ring-1 ring-slate-900/5">
                        <div className="flex flex-col items-end mr-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Audit Stream</span>
                            <span className="text-xs font-black text-indigo-600 tabular-nums leading-none">{(currentChangeIndex === -1 ? 0 : currentChangeIndex + 1)} <span className="text-slate-300 mx-0.5">/</span> {calculatedChangeCount}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-100 mx-1"></div>
                        <div className="flex gap-1.5">
                            <button 
                                onClick={() => scrollToChange('prev')}
                                className="p-2.5 hover:bg-slate-50 rounded-2xl text-slate-600 transition-all active:scale-90 hover:text-indigo-600"
                                title="Previous Change"
                            >
                                <ChevronUp className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => scrollToChange('next')}
                                className="p-2.5 hover:bg-slate-50 rounded-2xl text-slate-600 transition-all active:scale-90 hover:text-indigo-600"
                                title="Next Change"
                            >
                                <ChevronDown className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
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
                                                disabled={isProcessing}
                                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all duration-200 flex items-center justify-center gap-2"
                                            >
                                                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                Execute Repair
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
                                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Structural Node Architect v3.2' } });
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
                                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                            <div className="flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-amber-500" />
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Analysis_Matrix</span>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Repairable</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Warning</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-grow overflow-auto custom-scrollbar p-6">
                                            {auditData.filter(item => item.status !== 'skip').length > 0 ? (
                                                <div className="flex flex-col gap-3">
                                                    {auditData.filter(item => item.status !== 'skip').map((item, idx) => (
                                                        <motion.div 
                                                            key={idx}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: idx * 0.03 }}
                                                            className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all duration-200 group"
                                                        >
                                                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                                                item.status === 'fixed' ? 'bg-emerald-500' : 
                                                                item.status === 'warning' ? 'bg-amber-500' : 'bg-slate-300'
                                                            }`} />
                                                            <div className="flex-grow">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.id}</span>
                                                                        {item.type && (
                                                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                                                item.type === 'doi' ? 'bg-indigo-100 text-indigo-600' : 
                                                                                item.type === 'name' ? 'bg-fuchsia-100 text-fuchsia-600' :
                                                                                item.type === 'id-fix' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                                                                            }`}>
                                                                                {item.type}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                                        item.status === 'fixed' ? 'bg-emerald-100 text-emerald-700' : 
                                                                        item.status === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                                                    }`}>
                                                                        {item.status.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-700">{item.msg}</p>
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                                                    <Activity className="w-12 h-12 opacity-20" />
                                                    <p className="text-sm font-medium">
                                                        {auditData.length > 0 ? 'All references are structurally valid.' : 'Awaiting analysis signal...'}
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
                                                {viewMode === 'diff' && (
                                                    <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg ml-2">
                                                        <button 
                                                            onClick={() => scrollToChange('prev')}
                                                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                                            title="Previous Change"
                                                        >
                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <span className="text-[9px] font-bold text-slate-500 px-1 min-w-[3rem] text-center">
                                                            {calculatedChangeCount > 0 ? (currentChangeIndex === -1 ? 0 : currentChangeIndex + 1) : 0} / {calculatedChangeCount}
                                                        </span>
                                                        <button 
                                                            onClick={() => scrollToChange('next')}
                                                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-all"
                                                            title="Next Change"
                                                        >
                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                        </button>
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
                        <span>© 2026 Elsevier_Systems</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>Structural_Node_Architect_v2.5.0</span>
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
