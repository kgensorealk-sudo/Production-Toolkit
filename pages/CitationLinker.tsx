import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { diffLines, Change, diffWordsWithSpace } from 'diff';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { scanReferenceXml } from '../utils/referenceUpdaterXml';
import { applyCitationLinks, cleanupCitationDois } from '../utils/citationLinkerEdits';
import { citationReviewCandidates, reviewCitationTarget } from '../utils/citationLinkerReview';
import { analyzeIdLinks } from '../utils/idAuditorEngine';
import { ChevronUp, ChevronDown, GitCompare, Lightbulb, ArrowRight, Link as LinkIcon, Eraser, Hash, Trash2, RefreshCw, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartSuggestion, ToolId } from '../types';

interface ResolutionItem {
    manualTarget?: string;
    start: number;
    existingHref: string;
    linkAttribute: 'refid' | 'xlink:href';
    reason: string;
    id: string;
    originalTag: string;
    originalAttrs: string;
    textContent: string;
    formattedText?: string;
    tagType: string;
    status: 'resolved' | 'failed' | 'ignored';
    existingId: string;
    existingRefid: string;
    mappedIds: string[];
    originalIsPlural: boolean;
    targetIsPlural: boolean;
    brokenRefid: boolean;
    missingRefid: boolean;
    missingId: boolean;
    isDuplicate: boolean;
}

interface BibIndex {
    id: string;
    normalized: string;
    firstName: string;
    year: string;
}

const CitationLinker: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [resolutions, setResolutions] = useState<ResolutionItem[]>([]);
    const [step, setStep] = useState<'input' | 'matrix' | 'result'>('input');
    const [isLoading, setIsLoading] = useState(false);
    const [processLabel, setProcessLabel] = useState('');
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
    const [activeTab, setActiveTab] = useState<'xml' | 'diff'>('xml');
    const [diffElements, setDiffElements] = useState<React.ReactNode>(null);
    const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
    const [totalChanges, setTotalChanges] = useState(0);
    const diffContainerRef = useRef<HTMLDivElement>(null);

    // Configuration States
    const [targetMissingRefid, setTargetMissingRefid] = useState(true);
    const targetMissingId = false;
    const targetDuplicateId = false;
    const [cleanDoi, setCleanDoi] = useState(true);
    const cfStart = 3000;
    const [doiCount, setDoiCount] = useState(0);
    const [affectedDoiLabels, setAffectedDoiLabels] = useState<string[]>([]);

    const [importedEvidence,setImportedEvidence]=useState<{xml:string;changes:Array<{before:string;after:string;tag:string}>}>({xml:'',changes:[]});
    const repairHistory=input===importedEvidence.xml?importedEvidence.changes:[];
    const analysisKey=JSON.stringify([input,targetMissingRefid,targetMissingId,targetDuplicateId,cleanDoi,cfStart]);
    const analysisKeyRef=useRef(analysisKey),operationRef=useRef(0);
    analysisKeyRef.current=analysisKey;
    const clearGenerated=()=>{operationRef.current++;setOutput('');setResolutions([]);setSuggestions([]);setDiffElements(null);setIsLoading(false);setDoiCount(0);setAffectedDoiLabels([]);setStep('input');};
    useLayoutEffect(()=>{clearGenerated();},[analysisKey]);

    useEffect(() => {
        if (location.state?.transferredXml) {
            setImportedEvidence({xml:location.state.transferredXml,changes:Array.isArray(location.state.idChanges)?location.state.idChanges.filter((change:any)=>change&&typeof change.before==='string'&&typeof change.after==='string'&&typeof change.tag==='string'):[]});
            setInput(location.state.transferredXml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            // Clear the state so it doesn't re-trigger on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const normalizeCitation = (text: string) => {
        return text
            .replace(/<[^>]+>/g, '') 
            .toLowerCase()
            .replace(/&amp;/g, 'and')
            .replace(/&/g, 'and')
            .replace(/'s\b/gi, '') 
            .replace(/et\s+al\.?/gi, '') 
            .replace(/\bfigures?\b/g, 'fig')
            .replace(/\bfigs?\b/g, 'fig')
            .replace(/\btables?\b/g, 'table')
            .replace(/\bschemes?\b/g, 'scheme')
            .replace(/\bboxes?\b/g, 'box')
            .replace(/[\(\)\[\];]/g, ' ') 
            .replace(/\.(?!\d)/g, ' ')
            .replace(/,(?![a-z]\b)/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const extractYear = (text: string) => {
        const match = text.match(/\b(18|19|20)\d{2}[a-z]?\b/i);
        return match ? match[0].toLowerCase() : '';
    };

    const extractYears = (text: string) => {
        const results: string[] = [];
        
        // 1. Handle ranges like 2020-2022
        const rangePattern = /\b((?:18|19|20)\d{2})[\-–—]((?:18|19|20)\d{2})\b/g;
        let rangeMatch;
        while ((rangeMatch = rangePattern.exec(text)) !== null) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            if (start <= end && end - start < 20) { // Safety check
                for (let y = start; y <= end; y++) {
                    results.push(y.toString());
                }
            }
        }

        // 2. Match 4-digit year + optional suffix, followed by optional comma/space separated suffixes
        const yearPattern = /\b((?:18|19|20)\d{2})([a-z]?)((?:[\s,;&/]+[a-z])*)\b/gi;
        let match;
        
        while ((match = yearPattern.exec(text)) !== null) {
            const yearBase = match[1];
            const firstSuffix = match[2];
            const extraSuffixes = match[3];

            const y1 = (yearBase + firstSuffix).toLowerCase();
            if (!results.includes(y1)) results.push(y1);

            if (extraSuffixes) {
                const suffixes = extraSuffixes.split(/[\s,;&/]+/).map(s => s.trim()).filter(Boolean);
                suffixes.forEach(s => {
                    const yN = (yearBase + s).toLowerCase();
                    if (!results.includes(yN)) results.push(yN);
                });
            }
        }
        return results;
    };

    const extractFirstName = (text: string) => {
        const clean = normalizeCitation(text);
        // Filter out common connectors, years, and short initials to get the actual first surname
        const parts = clean.split(/\s+/)
            .map(p => p.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, ''))
            .filter(p => 
                p && 
                !['and', 'et', 'al'].includes(p) && 
                !/^(18|19|20)\d{2}[a-z]?$/.test(p)
            );
        
        // Prefer parts longer than 1 char (skip initials like 'C')
        const longParts = parts.filter(p => p.length > 1);
        if (longParts.length > 0) return longParts[0];
        
        return parts[0] || '';
    };

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
            if (part.removed && isLeft) append(part.value, 'bg-rose-100 text-rose-900 line-through decoration-rose-900/30 font-medium');
            else if (part.added && !isLeft) append(part.value, 'bg-emerald-100 text-emerald-900 font-bold');
            else if (!part.added && !part.removed) append(part.value, null);
        });
        if (activeClass) currentLine += '</span>';
        lines.push(currentLine);
        return lines;
    };

    const generateDiff = (original: string, modified: string) => {
        const diff = diffLines(original, modified);
        let rows: React.ReactNode[] = [];
        let leftLineNum = 1, rightLineNum = 1, i = 0;
        let changeCount = 0;

        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal', leftVal = '', rightVal = '';
            if (current.removed && diff[i+1]?.added) {
                type = 'replace'; leftVal = current.value; rightVal = diff[i+1].value; i += 2;
            } else if (current.removed) {
                type = 'delete'; leftVal = current.value; i++;
            } else if (current.added) {
                type = 'insert'; rightVal = current.value; i++;
            } else {
                leftVal = rightVal = current.value; i++;
            }

            const isChange = type !== 'equal';
            if (isChange) changeCount++;
            const currentBlockIdx = isChange ? changeCount - 1 : -1;

            let leftLines: string[] = [], rightLines: string[] = [];
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
                const lContent = leftLines[r], rContent = rightLines[r];
                const lNum = lContent !== undefined ? leftLineNum++ : '';
                const rNum = rContent !== undefined ? rightLineNum++ : '';
                let lClass = lContent !== undefined && type === 'delete' ? 'bg-rose-50/70' : (type === 'replace' ? 'bg-rose-50/30' : '');
                let rClass = rContent !== undefined && type === 'insert' ? 'bg-emerald-50/70' : (type === 'replace' ? 'bg-emerald-50/30' : '');
                rows.push(
                    <tr 
                        key={`${i}-${r}`} 
                        className="hover:bg-slate-50 transition-colors duration-75 group border-b border-slate-100/30 last:border-0"
                        data-change-row={isChange ? 'true' : undefined}
                        data-change-index={isChange && r === 0 ? currentBlockIdx : undefined}
                        data-change-index-group={isChange ? currentBlockIdx : undefined}
                    >
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 select-none bg-slate-50/80 font-mono ${lClass}`}>{lNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${lClass}`} dangerouslySetInnerHTML={{__html: lContent || ''}}></td>
                        <td className={`w-14 text-right text-[10px] text-slate-400 p-1.5 pr-3 border-r border-slate-200 border-l select-none bg-slate-50/80 font-mono ${rClass}`}>{rNum}</td>
                        <td className={`p-1.5 pl-4 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all leading-relaxed ${rClass}`} dangerouslySetInnerHTML={{__html: rContent || ''}}></td>
                    </tr>
                );
            }
        }
        setTotalChanges(changeCount);
        setDiffElements(
            <div className="bg-white">
                <table className="w-full text-sm font-mono border-collapse table-fixed">
                    <colgroup><col className="w-14" /><col className="w-[calc(50%-3.5rem)]" /><col className="w-14 border-l border-slate-200" /><col className="w-[calc(50%-3.5rem)]" /></colgroup>
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur">Baseline XML</th>
                            <th colSpan={2} className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest bg-slate-100/95 backdrop-blur border-l border-slate-200">Linked XML</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                        <tr>
                            <td colSpan={4} className="h-32 bg-slate-50/30"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

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
            setCurrentChangeIndex(nextIndex);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (step === 'result' && activeTab === 'diff') {
                if (e.key === 'ArrowDown' || (e.altKey && e.key.toLowerCase() === 'n')) {
                    e.preventDefault();
                    scrollToChange('next');
                } else if (e.key === 'ArrowUp' || (e.altKey && e.key.toLowerCase() === 'p')) {
                    e.preventDefault();
                    scrollToChange('prev');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, activeTab, currentChangeIndex, totalChanges]);

    useEffect(() => {
        if (!diffContainerRef.current) return;
        
        // Remove old highlights
        const oldHighlights = diffContainerRef.current.querySelectorAll('.active-change-highlight');
        oldHighlights.forEach(el => el.classList.remove('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));

        if (currentChangeIndex === -1) return;

        // Add new highlights
        const newHighlights = diffContainerRef.current.querySelectorAll(`[data-change-index-group="${currentChangeIndex}"]`);
        newHighlights.forEach(el => el.classList.add('active-change-highlight', 'bg-indigo-50/50', 'ring-1', 'ring-indigo-200', 'ring-inset', 'z-10'));
    }, [currentChangeIndex, diffElements]);

    const runAnalysis = () => {
        const snapshot=analysisKeyRef.current,operation=++operationRef.current;
        if (!input.trim()) { setToast({ msg: "Please paste XML source.", type: "warn" }); return; }
        setIsLoading(true);
        setProcessLabel('Mapping Bibliography Nodes...');

        setTimeout(() => {
            if(operation!==operationRef.current||snapshot!==analysisKeyRef.current)return;
            try {
                const structure = scanReferenceXml(input, {allowDuplicateIds:true});
                const duplicateLabels = new Set<string>();
                const labelMap = new Map<string, string>();
                const bibliographyNumbers=new Map<string,string>(),duplicateBibliographyNumbers=new Set<string>();
                const nameDateIndex: BibIndex[] = []; 

                const addLabel = (label:string,id:string) => {
                    const key=normalizeCitation(label);
                    if(labelMap.has(key)&&labelMap.get(key)!==id)duplicateLabels.add(key);
                    labelMap.set(key,id);
                };
                const childLabel = (node:typeof structure.nodes[number],name='ce:label') => {
                    const child=structure.nodes.find(child=>child.name===name&&child.start>=node.openEnd&&child.end<=node.closeStart&&!structure.nodes.some(parent=>parent!==node&&parent.start>=node.openEnd&&parent.start<child.start&&parent.end>=child.end));
                    return child?structure.textContent(child).trim():'';
                };
                for(const node of structure.references){
                    const id=node.attributes.id;if(!id)continue;
                    const labelText=childLabel(node).replace(/[\[\]]/g,'').trim();
                    if(/^\d+$/.test(labelText)){if(bibliographyNumbers.has(labelText)&&bibliographyNumbers.get(labelText)!==id)duplicateBibliographyNumbers.add(labelText);bibliographyNumbers.set(labelText,id);addLabel(labelText,id);}
                    else for(const year of extractYears(labelText))nameDateIndex.push({id,normalized:normalizeCitation(labelText),firstName:extractFirstName(labelText),year});
                }
                // Object labels share the same collision checks as bibliography labels.
                for(const node of structure.nodes.filter(node=>['ce:figure','ce:table','ce:display-formula','ce:textbox','ce:footnote','ce:section'].includes(node.name))){
                    const id=node.attributes.id;if(!id)continue;
                    const label=childLabel(node)||(node.name==='ce:section'?childLabel(node,'ce:section-title'):'');
                    if(!label)continue;addLabel(label,id);
                    const kind=({'ce:figure':'figure','ce:table':'table','ce:display-formula':'equation','ce:textbox':'box','ce:footnote':'note','ce:section':'section'} as Record<string,string>)[node.name];
                    const number=label.match(/(?:^|\s)(\d+(?:\.\d+)*)(?:$|[.\s])/);
                    if(number){addLabel(kind+' '+number[1],id);if(kind==='figure')addLabel('Fig. '+number[1],id);if(kind==='equation')addLabel('Eq. '+number[1],id);}
                }

                const orphans: ResolutionItem[] = [];
                
                // Pre-scan for all IDs to detect duplicates
                const idCounts = new Map<string, number>();
                for (const node of structure.nodes) {
                    const id = node.attributes.id;
                    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
                }

                const foundDoiLabels=cleanDoi?cleanupCitationDois(input).labels:[];
                setDoiCount(foundDoiLabels.length);
                setAffectedDoiLabels(foundDoiLabels);

                for(const parsedNode of structure.nodes.filter(node=>/^ce:(cross-refs?|intra-refs?|inter-refs?|float-anchor)$/.test(node.name))){
                    const fullTag=input.slice(parsedNode.start,parsedNode.end);
                    const baseTag=parsedNode.name.slice(3);
                    const attrs=input.slice(parsedNode.start+1+parsedNode.name.length,parsedNode.openEnd-1).replace(/\/$/,'');
                    const text=input.slice(parsedNode.openEnd,parsedNode.closeStart).trim();
                    const originalIsPlural=baseTag.endsWith('s');
                    const existingId = parsedNode?.attributes.id || '';
                    const existingRefid = parsedNode?.attributes.refid || '';
                    const existingHref=parsedNode.attributes['xlink:href']||'';
                    const isInterRef=baseTag.includes('inter-ref')||baseTag.includes('intra-ref');
                    const localHref=isInterRef&&existingHref.startsWith('#');
                    let hrefTarget=existingHref.slice(1);try{hrefTarget=decodeURIComponent(hrefTarget);}catch{}
                    const hrefBroken=localHref&&idCounts.get(hrefTarget)!==1;
                    const missingId = !existingId && baseTag!=='float-anchor';
                    const brokenRefid = hrefBroken || !!existingRefid && existingRefid.split(/\s+/).filter(Boolean).some(id => idCounts.get(id) !== 1);
                    const ambiguousRefid = (localHref&&(idCounts.get(hrefTarget)||0)>1) || !!existingRefid && existingRefid.split(/\s+/).filter(Boolean).some(id => (idCounts.get(id) || 0) > 1);
                    const missingRefid = isInterRef ? localHref : !existingRefid || (targetMissingRefid && brokenRefid);
                    const isDuplicate = !!existingId && (idCounts.get(existingId) || 0) > 1;

                    const isDoiLink = isInterRef && text.includes('doi.org/');

                    const shouldProcess = ((targetMissingRefid && missingRefid && (!isInterRef || localHref)) || (targetMissingId && missingId) || (targetDuplicateId && isDuplicate)) && !isDoiLink;
                    if (!shouldProcess) continue;

                    let mappedIds: string[] = existingRefid ? existingRefid.split(/\s+/).filter(Boolean) : [];
                    let status: 'resolved' | 'failed' | 'ignored' = 'failed';

                    let incomplete=false, ambiguous=ambiguousRefid;
                    if (missingRefid && (!isInterRef || localHref)) {
                        const detectedIds = new Set<string>();
                        const readableText=structure.textContent(parsedNode);
                        const normWhole = normalizeCitation(readableText);
                        const wholeMatches = nameDateIndex.filter(b => b.normalized === normWhole);
                        
                        if (wholeMatches.length > 0) {
                            if(new Set(wholeMatches.map(m=>m.id)).size!==1)ambiguous=true;
                            wholeMatches.forEach(m => detectedIds.add(m.id));
                        } else {
                            const isNumeric = /^\s*\[?\s*\d+(?:\s*(?:[,;–—-]|\band\b)\s*\d+)*\s*\]?\s*$/.test(readableText);
                            const bibliographyContext=existingRefid.split(/\s+/).some(id=>/^bb\d{4}$/.test(id));
                            const numericLabels=bibliographyContext?bibliographyNumbers:labelMap;
                            const numericDuplicates=bibliographyContext?duplicateBibliographyNumbers:duplicateLabels;
                            const parts = isNumeric ? readableText.split(/[,;]|\band\b/i) : readableText.split(/;/);

                            parts.forEach(part => {
                                // Resolve entities like &amp; before processing
                                const resolvedPart = part.replace(/&amp;/g, 'and').replace(/&/g, 'and');
                                const trimmed = resolvedPart.replace(/[\[\]]/g, '').trim();
                                let partMatched=false;
                                if (!trimmed) return;

                                if (/[\-–—]/.test(trimmed) && /^\d+[\-–—]\d+$/.test(trimmed)) {
                                    const rangeParts = trimmed.split(/[\-–—]/);
                                    const start = parseInt(rangeParts[0].replace(/\D/g, ''));
                                    const end = parseInt(rangeParts[1].replace(/\D/g, ''));
                                    if (!isNaN(start) && !isNaN(end) && start<=end && end-start<10000) {
                                        for (let n = start; n <= end; n++) {
                                            const id = numericLabels.get(n.toString());
                                            if (id&&!numericDuplicates.has(normalizeCitation(n.toString()))){detectedIds.add(id);partMatched=true;}else incomplete=true;
                                        }
                                    } else incomplete=true;
                                } 
                                else if (/^\d+$/.test(trimmed)) {
                                    const id = numericLabels.get(normalizeCitation(trimmed));
                                    if (id&&!numericDuplicates.has(normalizeCitation(trimmed))){detectedIds.add(id);partMatched=true;}else incomplete=true;
                                }
                                else {
                                    const normOrphan = normalizeCitation(trimmed);
                                    
                                    // Check labelMap for direct matches (floats or specific labels)
                                    const directMatchId = labelMap.get(normOrphan);
                                    if (directMatchId) {
                                        partMatched=true;
                                        if(duplicateLabels.has(normOrphan))ambiguous=true;
                                        detectedIds.add(directMatchId);
                                    } else {
                                        const orphanFirstName = extractFirstName(trimmed);
                                        const orphanYears = extractYears(trimmed);
                                        const authorWords=(value:string)=>normalizeCitation(value).replace(/\b(?:18|19|20)\d{2}[a-z]?\b/gi,'').match(/[\p{L}\p{M}]+/gu)?.filter(word=>word.length>1&&word!=='and')||[];
                                        const citedAuthors=authorWords(trimmed);

                                        const bibMatchesWhole = nameDateIndex.filter(b => b.normalized === normOrphan);
                                        if (bibMatchesWhole.length > 0) {
                                            partMatched=true;
                                            if(new Set(bibMatchesWhole.map(m=>m.id)).size!==1)ambiguous=true;
                                            bibMatchesWhole.forEach(m => detectedIds.add(m.id));
                                        } else if (orphanFirstName && orphanYears.length > 0) {
                                            orphanYears.forEach(year => {
                                                const matches = nameDateIndex.filter(b => 
                                                    b.firstName === orphanFirstName && 
                                                    b.year === year && citedAuthors.every(word=>authorWords(b.normalized).includes(word))
                                                );
                                                if(matches.length!==1)ambiguous=true;else partMatched=true;
                                                matches.forEach(m => detectedIds.add(m.id));
                                            });
                                        }
                                    }
                                }
                                if(!partMatched)incomplete=true;
                            });
                        }
                        mappedIds = Array.from(detectedIds);
                    }

                    if(targetMissingRefid&&missingRefid&&(incomplete||ambiguous||mappedIds.some(id=>idCounts.get(id)!==1)||(localHref&&mappedIds.length!==1)))mappedIds=[];
                    if(targetMissingRefid&&missingRefid&&!ambiguousRefid&&existingRefid){
                        const replacements=existingRefid.split(/\s+/).filter(Boolean).map(oldId=>{
                            if(idCounts.get(oldId)===1)return oldId;
                            const changes=repairHistory.filter(change=>change.before===oldId&&change.before!=='(missing)'&&change.after&&change.after!=='(missing)');
                            if(changes.length!==1)return '';
                            const change=changes[0];
                            return idCounts.get(change.after)===1&&structure.nodes.some(node=>node.name===change.tag&&node.attributes.id===change.after)?change.after:'';
                        });
                        if(replacements.length&&replacements.every(Boolean)){mappedIds=[...new Set(replacements)];incomplete=false;ambiguous=false;}
                    }
                    if(localHref)mappedIds=[]; // Installed VTOOL rejects bare fragments on URI link elements; do not emit an invalid repair.
                    const targetIsPlural = mappedIds.length > 1;

                    if (((!isInterRef || localHref) && missingRefid && mappedIds.length > 0) || !missingRefid || (isInterRef && !localHref)) {
                        status = 'resolved';
                    }

                    orphans.push({
                        start:parsedNode.start,existingHref,linkAttribute:localHref?'xlink:href':'refid',
                        reason:localHref?'Bare fragment URI requires link-type review. Installed VTOOL rejects it on this element; use a same-document ce:cross-ref with refid after verifying the intended target.':baseTag==='float-anchor'&&mappedIds.length?'Replacement supported by the ID Prefix Auditor change history; review before applying.':ambiguous?'Multiple possible targets; review required.':incomplete?'At least one citation part has no unique target; the whole link is preserved.':mappedIds.length?'Matching unique target(s) found.':'No unique matching target found.',
                        id: `orphan_${orphans.length}`,
                        originalTag: fullTag,
                        originalAttrs: attrs,
                        textContent: text,
                        tagType: baseTag,
                        status,
                        existingId,
                        existingRefid,
                        mappedIds,
                        originalIsPlural,
                        targetIsPlural,
                        missingId,
                        brokenRefid,
                        missingRefid,
                        isDuplicate
                    });
                }

                if (orphans.length === 0 && foundDoiLabels.length === 0) {
                    setToast({ msg: "No items matching the selected protocol toggles.", type: "info" });
                    setIsLoading(false);
                    return;
                }

                setResolutions(orphans);
                setStep('matrix');
                setToast({ msg: `Detected ${orphans.length} candidates and ${foundDoiLabels.length} DOI cleanups.`, type: "info" });
            } catch (e) {
                setToast({ msg: e instanceof Error ? e.message : "Analysis failure.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    const executeLink = async () => {
        const snapshot=analysisKeyRef.current,operation=++operationRef.current;
        setIsLoading(true);
        setProcessLabel('Surgically Injecting Attributes...');

        setTimeout(() => {
            if(operation!==operationRef.current||snapshot!==analysisKeyRef.current)return;
            try {
                let result=applyCitationLinks(input,resolutions,{targetMissingId,targetDuplicateId,targetMissingRefid,cfStart});

                if(cleanDoi)result=cleanupCitationDois(result).output;

                setOutput(result);
                generateDiff(input, result);
                
                // Background Scanner for Smart Suggestions
                const newSuggestions: SmartSuggestion[] = [];
                
                // 1. XML Normalizer (Renumber)
                if (result.includes('<ce:bib-reference')) {
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
                const otherRefCount = (result.match(/<ce:other-ref/g) || []).length;
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
                const tagMatches = result.match(/<(opt_DEL|opt_INS|opt_Comment)\b[^>]*>([\s\S]*?)<\/\1>/g) || [];
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

                // Withhold cleanup until citation targets have been reviewed.
                const remainingLinks=analyzeIdLinks(result);
                if (remainingLinks.uncitedCount && !remainingLinks.unlinkedCitations && !remainingLinks.brokenTargets && !remainingLinks.ambiguousTargets.length && !resolutions.some(row=>row.missingRefid&&row.status!=='resolved')) {
                    newSuggestions.push({
                        id: 'uncited-cleaner',
                        toolName: 'Uncited Ref Cleaner',
                        description: 'Bibliography detected. Use this tool to identify and remove references that are not cited in the text.',
                        path: '/uncitedCleaner',
                        icon: <Eraser className="w-4 h-4" />,
                        condition: 'Bibliography detected'
                    });
                }

                // 5. View Synchronizer
                if (result.includes('<ce:para>') && (result.includes('<ce:cross-ref') || result.includes('<ce:float-anchor'))) {
                    newSuggestions.push({
                        id: 'view-sync',
                        toolName: 'View Synchronizer',
                        description: 'Complex structural nodes detected. Use this to ensure visual consistency between XML source and rendered views.',
                        path: '/viewSync',
                        icon: <RefreshCw className="w-4 h-4" />,
                        condition: 'Complex structural nodes detected'
                    });
                }

                // 6. Reference Structure Repair
                if (result.includes('<ce:other-ref') || (result.includes('<ce:bib-reference') && !result.includes('<sb:reference'))) {
                    newSuggestions.push({
                        id: 'structural-architect',
                        toolName: 'Reference Structure Repair v3.2',
                        description: 'Structural overhaul recommended. Use this to transform raw source text into valid structural bibliography nodes.',
                        path: '/structuralArchitect',
                        icon: <Box className="w-4 h-4" />,
                        condition: 'Structural overhaul recommended'
                    });
                }

                setSuggestions(newSuggestions);
                setStep('result');
                setToast({ msg: "Protocol successfully applied.", type: "success" });
            } catch (e) {
                setOutput(''); setDiffElements(null);
                setToast({ msg: e instanceof Error ? e.message : "Injection failed.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 800);
    };

    useKeyboardShortcuts({
        onPrimary: step === 'input' ? runAnalysis : (step === 'matrix' ? executeLink : undefined),
        onClear: () => { clearGenerated(); setInput(''); }
    }, [input, step, resolutions, targetMissingId, targetMissingRefid, cfStart]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            <div className="mb-10 text-center animate-fade-in relative">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Citation Linker Pro</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic leading-relaxed">
                    Reviewed citation linking for <code>ce:cross-ref</code> and supported object links.
                </p>
            </div>

            <div className="flex justify-center mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-wrap items-center justify-center gap-12">
                    <Switch id="toggle-refid" label="Resolve Links" subLabel="Missing or unresolved refid" checked={targetMissingRefid} onChange={setTargetMissingRefid} color="indigo" tooltip="Scans citations with missing or unresolved refid targets and presents matching candidates for review." />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <Switch id="toggle-doi" label="Clean DOIs" subLabel="Convert inter-ref to ce:doi" checked={cleanDoi} onChange={setCleanDoi} color="emerald" tooltip="Converts inter-ref links or raw DOI strings in bibliography entries into standardized <ce:doi> XML tags." />
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    
                    <p className="text-xs text-slate-500">ID creation and duplicate-ID repair belong to ID Prefix Auditor.</p>
                    <div className="flex gap-3">
                         <button onClick={() => { setInput(''); setResolutions([]); setStep('input'); }} className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest px-4">Clear All</button>
                    </div>
                </div>
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
                                        navigate(sug.path, { state: { transferredXml: output, sourceTool: 'Citation Linker Pro' } });
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

            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden h-[700px] flex flex-col relative transition-all duration-500">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md flex items-center justify-center rounded-2xl animate-fade-in flex-col">
                        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-2">{processLabel}</span>
                    </div>
                )}

                {step === 'input' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 px-10 py-5 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-xs uppercase tracking-widest">Article Source Stream</label>
                            <button onClick={() => setInput('')} className="text-xs font-bold text-rose-500 uppercase tracking-widest hover:underline">Clear Protocol</button>
                        </div>
                        <textarea 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            className="flex-grow p-10 font-mono text-[13px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed placeholder-slate-300" 
                            placeholder="Paste the full article XML. The system will scan for citation tags based on your configuration toggles above..."
                            spellCheck={false}
                        />
                        <div className="p-8 border-t border-slate-100 flex justify-center bg-slate-50/50">
                            <button onClick={runAnalysis} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-16 rounded-[2rem] shadow-2xl shadow-indigo-500/20 transition-all active:scale-95 uppercase text-xs tracking-widest">
                                Scan Source for Protocols
                            </button>
                        </div>
                    </div>
                )}

                {step === 'matrix' && (
                    <div className="flex flex-col h-full bg-slate-50 animate-fade-in overflow-hidden">
                        {resolutions.some(item => item.brokenRefid) && <p className="px-10 py-3 text-sm bg-amber-50 text-amber-900">Existing unresolved citation targets were detected. Review each proposed replacement before applying links; unmatched or ambiguous targets remain unchanged.</p>}
                        <div className="px-10 py-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Resolution Matrix</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{resolutions.length} candidates · {resolutions.filter(row=>row.status==='resolved').length} ready · {doiCount} DOI cleanups</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setStep('input')} className="px-6 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 uppercase transition-all tracking-widest">Abort</button>
                                <button onClick={executeLink} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-12 rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">
                                    Apply Protocols
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-10 space-y-6 custom-scrollbar">
                            {doiCount > 0 && cleanDoi && (
                                <div className="p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[2rem] flex items-center gap-8 shadow-sm animate-pulse-subtle">
                                    <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-200">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-1">Global Protocol: DOI Cleanup</h4>
                                        <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                                            The system detected <span className="font-black underline">{doiCount}</span> bibliography entries with external DOI links. 
                                            These will be converted to native <code className="bg-emerald-100 px-1 rounded text-emerald-800 font-bold">ce:doi</code> tags and merged into their parent host nodes.
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-2 custom-scrollbar-sm">
                                            {affectedDoiLabels.map((label, i) => (
                                                <span key={i} className="text-[9px] font-black bg-white/50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 uppercase">{label}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <span className="text-[10px] font-black bg-emerald-600 text-white px-3 py-1 rounded-full uppercase tracking-tighter shadow-md">Active</span>
                                    </div>
                                </div>
                            )}

                            {resolutions.filter(r => r.status === 'resolved').length > 0 && (
                                <div className="p-6 bg-indigo-50 border-2 border-indigo-100 rounded-[2rem] flex items-center gap-8 shadow-sm">
                                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-200">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-1">Citation Protocol: Reviewed Linking</h4>
                                        <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                                            The system will process <span className="font-black underline">{resolutions.filter(r => r.status === 'resolved').length}</span> citation nodes. 
                                            This includes <span className="font-black">resolving missing refids</span> to match bibliography entries and <span className="font-black">preserving existing IDs</span> where required.
                                        </p>
                                    </div>
                                    <div className="shrink-0">
                                        <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full uppercase tracking-tighter shadow-md">Active</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4">
                                {resolutions.map((res, idx) => (
                                <div 
                                    key={idx} 
                                    className={`p-6 bg-white border-2 rounded-[2rem] flex items-center gap-8 transition-all hover:shadow-lg ${res.status === 'resolved' ? 'border-emerald-100' : 'border-rose-100 opacity-60'}`}
                                >
                                    <div className={`w-3 h-3 rounded-full shrink-0 ${res.status === 'resolved' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                                    <div className="min-w-0 flex-grow">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="flex gap-1">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${res.tagType.includes('inter-ref') ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                                    {res.tagType}
                                                </span>
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${res.originalIsPlural ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                    {res.originalIsPlural ? 'Plural' : 'Singular'}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                {targetMissingRefid && res.missingRefid && res.status === 'resolved' && (!res.tagType.includes('inter-ref') || res.linkAttribute === 'xlink:href') && <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">Will Resolve Link</span>}
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400 font-bold ml-auto">TXT: "{res.textContent}"</span>
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-500 truncate bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            {res.originalTag}
                                        </div>
                                        <p className="text-xs mt-2 text-slate-600">{res.reason}</p>
                                        {res.missingRefid && res.linkAttribute === 'refid' && ['cross-ref', 'cross-refs'].includes(res.tagType) && (res.status !== 'resolved' || res.manualTarget) && (() => {
                                            const candidates = citationReviewCandidates(input, res.textContent);
                                            return candidates.length > 0 ? <label className="block mt-3 text-xs text-slate-700">
                                                Choose a verified bibliography target (no automatic abbreviation linking)
                                                <select aria-label={`Review target for ${res.textContent}`} className="block mt-1 w-full border rounded p-2" value={res.manualTarget || ''} onChange={event => {
                                                    try {
                                                        const target = event.target.value;
                                                        setOutput(''); setSuggestions([]); setDiffElements(null); operationRef.current++;
                                                        setResolutions(prev => prev.map(row => row.id !== res.id ? row : target ? {...row, ...reviewCitationTarget(input, row, target)} : {...row, manualTarget: undefined, mappedIds: [], status: 'failed', reason: 'Target selection cleared; review required.'}));
                                                    } catch (error) { setToast({msg: error instanceof Error ? error.message : 'Review failed.', type: 'error'}); }
                                                }}>
                                                    <option value="">Leave unresolved</option>
                                                    {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id} — {candidate.preview}</option>)}
                                                </select>
                                                <span className="block mt-1">Compare the title and author list before selecting. Grouped citations require manual XML review.</span>
                                            </label> : null;
                                        })()}

                                    </div>
                                    <div className="shrink-0 flex flex-col items-end">
                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${res.status === 'resolved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {res.status === 'resolved' ? 'Protocol Ready' : 'Review required'}
                                        </div>
                                        {res.status === 'resolved' && res.mappedIds.length > 0 && (
                                            <div className="flex gap-1">
                                                {res.mappedIds.slice(0, 2).map((id, idIdx) => (
                                                    <span key={`${id}-${idIdx}`} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">{id}</span>
                                                ))}
                                                {res.mappedIds.length > 2 && <span className="text-[10px] text-slate-400 font-black">+{res.mappedIds.length - 2}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            </div>
                        </div>
                    </div>
                )}

                {step === 'result' && (
                    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
                        <div className="bg-slate-50/95 backdrop-blur-md px-10 py-5 border-b border-slate-200 flex justify-between items-center shrink-0 sticky top-0 z-30 shadow-xs">
                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest flex items-center gap-2">
                                Corrected Protocol Stream
                            </h3>
                            <div className="flex items-center gap-6">
                                {totalChanges > 0 && (
                                    <div className="flex items-center gap-3 bg-white px-4 py-1.5 rounded-xl border border-slate-200/80 shadow-xs">
                                        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
                                            <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                                                Changes: <span className="text-indigo-600">{currentChangeIndex >= 0 ? currentChangeIndex + 1 : 0}</span> / {totalChanges}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => {
                                                    if (activeTab !== 'diff') {
                                                        setActiveTab('diff');
                                                        setTimeout(() => scrollToChange('prev'), 50);
                                                    } else {
                                                        scrollToChange('prev');
                                                    }
                                                }}
                                                className="p-1 hover:bg-slate-100 rounded-md text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 text-[10px] font-extrabold uppercase"
                                                title="Previous Change (Up Arrow / Alt+P)"
                                            >
                                                <ChevronUp className="w-4 h-4" />
                                                <span className="hidden sm:inline">Prev</span>
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (activeTab !== 'diff') {
                                                        setActiveTab('diff');
                                                        setTimeout(() => scrollToChange('next'), 50);
                                                    } else {
                                                        scrollToChange('next');
                                                    }
                                                }}
                                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs"
                                                title="Next Change (Down Arrow / Alt+N)"
                                            >
                                                <span>Next</span>
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-4">
                                    <button onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} className="bg-emerald-600 text-white border border-emerald-700 px-6 py-2.5 rounded-xl text-[10px] font-black hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-widest">Export Result</button>
                                    <button onClick={() => { setStep('input'); setResolutions([]); setCurrentChangeIndex(-1); setTotalChanges(0); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Start New Session</button>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white px-10 pt-4 border-b border-slate-100 flex space-x-4 shrink-0 sticky top-[65px] z-20">
                            <button onClick={() => setActiveTab('xml')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'xml' ? 'bg-slate-50 text-indigo-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Corrected XML</button>
                            <button onClick={() => setActiveTab('diff')} className={`px-8 py-4 text-[11px] font-black uppercase tracking-widest rounded-t-2xl transition-all border-t border-x ${activeTab === 'diff' ? 'bg-slate-50 text-rose-600 border-slate-200 translate-y-[1px]' : 'bg-white text-slate-400 border-transparent'}`}>Audit Log (Diff)</button>
                        </div>
                        <div className="flex-grow relative bg-slate-50 overflow-hidden flex flex-col min-h-0">
                            {activeTab === 'xml' && (
                                <div className="h-full relative p-8 pb-32 overflow-auto">
                                    <textarea 
                                        readOnly
                                        value={output}
                                        className="h-full w-full p-10 pb-32 font-mono text-[11px] bg-white rounded-[2rem] border border-slate-200 shadow-inner focus:ring-0 resize-none leading-relaxed outline-none"
                                    />
                                </div>
                            )}
                            {activeTab === 'diff' && (
                                <div className="absolute inset-0 flex flex-col">
                                    <div ref={diffContainerRef} className="flex-grow overflow-auto custom-scrollbar pb-32">
                                        {diffElements}
                                    </div>
                                    <AnimatePresence>
                                        {totalChanges > 0 && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                                className="absolute bottom-8 right-10 flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-30 ring-1 ring-slate-900/5"
                                            >
                                                <div className="flex items-center gap-1 pr-2 border-r border-slate-100">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                        <GitCompare className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex flex-col px-2">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Changes</span>
                                                        <span className="text-xs font-black text-slate-900 tabular-nums leading-none">
                                                            {currentChangeIndex + 1} <span className="text-slate-300 mx-0.5">/</span> {totalChanges}
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

export default CitationLinker;
