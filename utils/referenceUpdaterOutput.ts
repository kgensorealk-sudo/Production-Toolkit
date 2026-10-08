import { scanReferenceXml, ReferenceXmlNode } from './referenceUpdaterXml';

export function localReferenceTarget(href: string | undefined): string | null {
    if (!href?.startsWith('#')) return null;
    try { return decodeURIComponent(href.slice(1)); } catch { return href.slice(1); }
}

export function validateReferenceUpdaterOwnership(originalXml: string, outputXml: string, blocks: string[], originalIndexes: Array<number | null>): void {
    const original = scanReferenceXml(originalXml), final = scanReferenceXml(outputXml);
    const owners = new Map<string, number>();
    const linkTargets = (node: ReferenceXmlNode) => {
        const targets = ((node.attributes.refid || '').match(/\S+/g) || []).map(id => ({id, signature: `${node.name}|refid|${id}`}));
        const href = localReferenceTarget(node.attributes['xlink:href']);
        if (href) targets.push({id: href, signature: `${node.name}|xlink:href|${href}`});
        return targets;
    };
    const unresolved = original.references.map((reference, index) => {
        const counts = new Map<string, number>();
        for (const node of original.nodes.filter(node => node.start >= reference.start && node.end <= reference.end)) {
            if (node.attributes.id) owners.set(node.attributes.id, index);
            for (const target of linkTargets(node)) if (!original.ids.has(target.id)) counts.set(target.signature, (counts.get(target.signature) || 0) + 1);
        }
        return counts;
    });
    blocks.forEach((block, index) => {
        const owner = originalIndexes[index];
        const allowed = new Map(owner === null ? [] : unresolved[owner]);
        for (const node of scanReferenceXml(block).nodes) {
            const id = node.attributes.id;
            if (id && owners.has(id) && owners.get(id) !== owner) throw new Error(`ID ${id} belongs to another original reference. Enable internal ID renumbering or correct the imported IDs before merging.`);
            for (const target of linkTargets(node)) {
                if (final.ids.has(target.id)) continue;
                if (original.ids.has(target.id)) throw new Error(`Link target ${target.id} was removed or deselected. Resolve the link before merging.`);
                const remaining = allowed.get(target.signature) || 0;
                if (!remaining) throw new Error(`New unresolved link target ${target.id} in an imported reference. Resolve the link before merging.`);
                allowed.set(target.signature, remaining - 1);
            }
        }
    });
}

/** Replace reference slots while preserving every other byte of the original document. */
export function assembleReferenceUpdaterOutput(originalXml: string, blocks: string[], originalIndexes: Array<number | null>): string {
    if (blocks.length !== originalIndexes.length) throw new Error('Reference output ownership is incomplete.');
    const parsed = scanReferenceXml(originalXml), references = parsed.references;
    const parentOf = (node: ReferenceXmlNode) => parsed.nodes.filter(parent => parent.start < node.start && parent.openEnd <= node.start && parent.closeStart >= node.end)
        .sort((left, right) => right.start - left.start)[0];
    if (!references.length) throw new Error('No original bibliography reference slots found.');
    const parents = references.map(parentOf);
    const topLevel = parents.every(parent => !parent);
    if (topLevel) {
        let cursor = 0;
        const surrounding: string[] = [];
        for (const reference of references) { surrounding.push(originalXml.slice(cursor, reference.start)); cursor = reference.end; }
        surrounding.push(originalXml.slice(cursor));
        if (!surrounding.join('').trim()) return blocks.join('\n');
    }
    if (!topLevel && parents.some(parent => !parent || !['ce:bibliography', 'ce:bibliography-sec'].includes(parent.name))) {
        throw new Error('References must be direct children of bibliography containers to preserve the full XML safely.');
    }
    const groups = [...new Set(parents.map(parent => parent?.start ?? -1))];
    const groupedBlocks = new Map(groups.map(group => [group, [] as string[]]));
    let lastGroup = -1;
    blocks.forEach((block, index) => {
        const originalIndex = originalIndexes[index];
        if (originalIndex !== null && (!Number.isInteger(originalIndex) || !references[originalIndex])) throw new Error('Invalid original reference ownership.');
        // New references belong to the last original reference container.
        const group = originalIndex === null ? groups[groups.length - 1] : parents[originalIndex]?.start ?? -1;
        const groupIndex = groups.indexOf(group);
        if (groupIndex < lastGroup) throw new Error('The requested order crosses bibliography sections. Keep each section together before merging.');
        lastGroup = groupIndex;
        groupedBlocks.get(group)!.push(block);
    });
    const edits: Array<{start: number; end: number; value: string}> = [];
    for (const group of groups) {
        const slots = references.filter((_reference, index) => (parents[index]?.start ?? -1) === group);
        const values = groupedBlocks.get(group)!;
        slots.forEach((slot, index) => edits.push({start: slot.start, end: slot.end,
            value: index === slots.length - 1 ? values.slice(index).join('\n') : values[index] || ''}));
    }
    let output = originalXml;
    for (const edit of edits.sort((left, right) => right.start - left.start)) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
    scanReferenceXml(output); // Include article IDs in collision detection.
    return output;
}
