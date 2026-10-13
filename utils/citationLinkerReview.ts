import { scanReferenceXml } from './referenceUpdaterXml';
import {citationNumericCandidates,citationTargetType,type CitationTargetType} from './citationLinkerEdits';

export function citationReviewCandidates(input: string, citation: string) {
    // A single selection cannot safely resolve a grouped citation.
    const years = [...citation.matchAll(/\b(?:18|19|20)\d{2}[a-z]?\b/gi)];
    if (years.length !== 1 || /[;]/.test(citation)) return [];
    const year = years[0][0].toLowerCase();
    const cited = citation.slice(0, years[0].index).replace(/et\s+al\.?/gi, '').replace(/[^\p{L}\p{M}\s]/gu, '').trim().toLowerCase();
    if (!cited) return [];
    const parsed = scanReferenceXml(input, { allowDuplicateIds: true });
    return parsed.references.flatMap(ref => {
        const id = ref.attributes.id;
        if (!id || parsed.nodes.filter(n => n.attributes.id === id).length !== 1) return [];
        const labelNode = parsed.nodes.find(n => n.name === 'ce:label' && n.start > ref.start && n.end <= ref.end);
        if (!labelNode) return [];
        const label = parsed.textContent(labelNode).trim();
        const labelYear = label.match(/\b(?:18|19|20)\d{2}[a-z]?\b/i);
        if (labelYear?.[0].toLowerCase() !== year) return [];
        const author = label.slice(0, labelYear.index).replace(/et\s+al\.?/gi, '').replace(/[^\p{L}\p{M}\s]/gu, '').trim().toLowerCase();
        const acronym = author.split(/\s+/).map(word => word[0]).join('');
        if (author !== cited && !(author.includes(' ') && acronym === cited)) return [];
        return [{ id, label, preview: parsed.textContent(ref).replace(/\s+/g, ' ').trim().slice(0, 400), abbreviation: author !== cited }];
    });
}

export function numericReviewCandidates(input:string,row:{start:number;originalTag:string}){
    const parsed=scanReferenceXml(input,{allowDuplicateIds:true});
    const node=parsed.nodes.find(node=>node.start===row.start);
    if(!node||input.slice(node.start,node.end)!==row.originalTag)return [];
    // A single-choice review must never truncate a group or range.
    const number=parsed.textContent(node).trim().match(/^(?:\[\s*(\d+)\s*\]|(\d+))$/);
    if(!number)return [];
    return citationNumericCandidates(parsed,node,number[1]||number[2]).flatMap(candidate=>{
        if(parsed.nodes.filter(target=>target.attributes.id===candidate.id).length!==1)return [];
        return [{id:candidate.id,label:number[1]||number[2],preview:`${candidate.node.name} — ${parsed.textContent(candidate.node).replace(/\s+/g,' ').trim().slice(0,400)}`}];
    });
}

export function reviewCitationTarget<T extends { start: number; originalTag: string; textContent: string; linkAttribute: string; tagType: string;targetType?:CitationTargetType }>(input: string, row: T, target: string) {
    const parsed = scanReferenceXml(input, { allowDuplicateIds: true });
    const node = parsed.nodes.find(n => n.start === row.start);
    if (!node || input.slice(node.start, node.end) !== row.originalTag) throw new Error('Citation review is stale. Analyze the current XML.');
    if (row.linkAttribute !== 'refid' || !['cross-ref', 'cross-refs'].includes(row.tagType)) throw new Error('This link type needs manual XML review.');
    const numeric=/^(?:\[\s*\d+\s*\]|\d+)$/.test(parsed.textContent(node).trim());
    if(numeric){
        if(!numericReviewCandidates(input,row).some(candidate=>candidate.id===target))throw Error('Select an eligible, uniquely identified numeric target.');
        return {...row,targetType:citationTargetType(parsed.nodes.find(node=>node.attributes.id===target)),mappedIds:[target],targetIsPlural:false,status:'resolved' as const,manualTarget:target,reason:'Numeric target explicitly selected by the user.'};
    }
    const authorContext=parsed.nodes.some(parent=>parent.start<node.start&&parent.end>=node.end&&['ce:author-group','ce:author','ce:affiliation','ce:affiliation-group','ce:correspondence'].includes(parent.name));
    if (authorContext||!citationReviewCandidates(input, parsed.textContent(node)).some(c => c.id === target)) throw new Error('Select an eligible, uniquely identified bibliography target.');
    return { ...row, targetType:'bibliography' as const, mappedIds: [target], targetIsPlural: false, status: 'resolved' as const, manualTarget: target, reason: 'Bibliography target explicitly selected by the user.' };
}
