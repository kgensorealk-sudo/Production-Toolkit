import { scanReferenceXml } from './referenceUpdaterXml';

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

export function reviewCitationTarget<T extends { start: number; originalTag: string; textContent: string; linkAttribute: string; tagType: string }>(input: string, row: T, target: string) {
    const parsed = scanReferenceXml(input, { allowDuplicateIds: true });
    const node = parsed.nodes.find(n => n.start === row.start);
    if (!node || input.slice(node.start, node.end) !== row.originalTag) throw new Error('Citation review is stale. Analyze the current XML.');
    if (row.linkAttribute !== 'refid' || !['cross-ref', 'cross-refs'].includes(row.tagType)) throw new Error('This link type needs manual XML review.');
    if (!citationReviewCandidates(input, row.textContent).some(c => c.id === target)) throw new Error('Select an eligible, uniquely identified bibliography target.');
    return { ...row, mappedIds: [target], targetIsPlural: false, status: 'resolved' as const, manualTarget: target, reason: 'Bibliography target explicitly selected by the user.' };
}
