import rules from './idAuditorRules.json';
import {scanReferenceXml} from './referenceUpdaterXml';

export const ID_RULES = rules;
export interface IdAuditItem {
    id: string; originalId: string; tagName: string; expectedPrefix: string;
    status: 'valid' | 'invalid'; isLengthViolation: boolean; isDuplicate: boolean;
    prefixSource: string; needsReview: boolean; needsPrefix: boolean; reason: string; preview: string; fullTag: string;
}
export type PrefixOverrides = Record<string,string>;
const registry = new Map(rules.map(rule=>[rule.tag,rule]));
// Prefixes are naming conventions; the DTD separately controls missing-ID generation.
function resolvePrefix(name: string, attributes: Record<string, string>, overrides: PrefixOverrides): string {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
    const rule = registry.get(name);
    if (attributes.type === 'code' && rule?.codedPrefix) return rule.codedPrefix;
    return rule?.prefix || '';
}
function validId(id: string, prefix: string): boolean {
    if (!prefix || !id.startsWith(prefix)) return false;
    const suffix=id.slice(prefix.length);
    return /^\d{4}$/.test(suffix) && Number(suffix)>=5 && Number(suffix)<=9995 && Number(suffix)%5===0;
}
// Resolve only same-document fragments; external URL fragments do not target this XML.
function fragmentTarget(href: string): string | undefined {
    if (!href.startsWith('#') || href.length === 1) return undefined;
    try { return decodeURIComponent(href.slice(1)); } catch { return href.slice(1); }
}
function targetIds(nodes: ReturnType<typeof scanReferenceXml>['nodes']): Set<string> {
    const targets = new Set<string>();
    for (const node of nodes) {
        for (const id of (node.attributes.refid || '').split(/\s+/).filter(Boolean)) targets.add(id);
        const fragment = fragmentTarget(node.attributes['xlink:href'] || '');
        if (fragment) targets.add(fragment);
    }
    return targets;
}
export function analyzeIdLinks(xml: string) {
    const structure = scanReferenceXml(xml, {allowDuplicateIds:true});
    const counts = new Map<string, number>();
    for (const node of structure.nodes) if (node.attributes.id) counts.set(node.attributes.id, (counts.get(node.attributes.id) || 0) + 1);
    const targets = targetIds(structure.nodes);
    const ambiguousTargets = [...targets].filter(id => (counts.get(id) || 0) > 1);
    let unlinkedCitations = 0, brokenTargets = 0;
    for (const node of structure.nodes) {
        const ids = (node.attributes.refid || '').split(/\s+/).filter(Boolean);
        if ((node.name === 'ce:cross-ref' || node.name === 'ce:cross-refs') &&
            (!ids.length || ids.some(id => counts.get(id) !== 1))) unlinkedCitations++;
        brokenTargets += ids.filter(id => !counts.has(id)).length;
        const fragment = fragmentTarget(node.attributes['xlink:href'] || '');
        if (fragment && !counts.has(fragment)) brokenTargets++;
    }
    const uncitedCount = structure.references.filter(node => node.attributes.id && !targets.has(node.attributes.id)).length;
    return {unlinkedCitations, brokenTargets, ambiguousTargets, uncitedCount};
}
export function auditElementIds(xml: string, overrides: PrefixOverrides = {}): IdAuditItem[] {
    const structure=scanReferenceXml(xml,{allowDuplicateIds:true});
    const counts=new Map<string,number>();
    for(const node of structure.nodes) if(node.attributes.id) counts.set(node.attributes.id,(counts.get(node.attributes.id)||0)+1);
    const targets = targetIds(structure.nodes);
    return structure.nodes.flatMap(node=>{
        const rule=registry.get(node.name), originalId=node.attributes.id||'';
        const expectedPrefix=resolvePrefix(node.name, node.attributes, overrides);
        // Configured tags receive missing IDs, including DTD-optional IDs. Known unconfigured tags remain visible for QA.
        if (!node.attributeRanges.id && !rule && !expectedPrefix) return [];
        const needsPrefix=!/^[a-z]+$/.test(expectedPrefix);
        const isDuplicate=!!originalId && (counts.get(originalId)||0)>1;
        const needsReview = isDuplicate && targets.has(originalId);
        const isLengthViolation=!!originalId && !!expectedPrefix && originalId.startsWith(expectedPrefix) && !/^\d{4}$/.test(originalId.slice(expectedPrefix.length));
        const reason=needsReview?'Linked duplicate ID: review the target in the original XML before correction.':needsPrefix?'Skipped during generation: no configured prefix. Other elements can still be corrected; set a prefix to include this element.':!originalId?(node.attributeRanges.id?'ID is empty.':rule?.required?'Required ID is missing.':'Configured ID is missing.'):isDuplicate?'Duplicate ID in the document.':!validId(originalId,expectedPrefix)?`Expected ${expectedPrefix} + four digits, 0005–9995 in steps of five.`:'';
        return [{id:originalId||'[MISSING ID]',originalId,tagName:node.name,expectedPrefix,status:reason?'invalid' as const:'valid' as const,
            isLengthViolation,isDuplicate,prefixSource:Object.prototype.hasOwnProperty.call(overrides,node.name)?'custom':rule?.source||'unconfigured',needsReview,needsPrefix,reason,preview:structure.metadataXml.slice(node.openEnd,node.closeStart).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,100),fullTag:xml.slice(node.start,node.openEnd)}];
    });
}
export function repairElementIds(xml: string, overrides: PrefixOverrides = {}): {output:string;changed:number} {
    const structure=scanReferenceXml(xml,{allowDuplicateIds:true});
    const rows=auditElementIds(xml,overrides);
    const ambiguous = rows.find(row => row.needsReview);
    if (ambiguous) throw new Error(`Linked duplicate ID ${ambiguous.originalId} is ambiguous. Review its owners and citation targets in the original XML before fixing IDs. No output was generated.`);
    const occupied=new Set([...structure.ids, ...targetIds(structure.nodes)]), retained=new Set<string>(), counters=new Map<string,number>();
    for(const node of structure.nodes) if(node.attributes.id && !/^[a-z]+$/.test(resolvePrefix(node.name,node.attributes,overrides))) retained.add(node.attributes.id);
    const allocate=(prefix:string)=>{
        for(let attempt=0;attempt<1999;attempt++) {
            const next=counters.get(prefix)??3000;
            counters.set(prefix,next===9995?5:next+5);
            const id=prefix+String(next).padStart(4,'0');
            if(!occupied.has(id)){occupied.add(id);return id;}
        }
        throw new Error(`No available ${prefix} ID in 0005–9995. No output was generated.`);
    };
    const edits: Array<{start:number;end:number;text:string}>=[];
    for(const node of structure.nodes) {
        const oldId=node.attributes.id||'';
        const prefix=resolvePrefix(node.name, node.attributes, overrides);
        if(!/^[a-z]+$/.test(prefix))continue;
        if(validId(oldId,prefix)&&!retained.has(oldId)){retained.add(oldId);continue;}
        const id=allocate(prefix);retained.add(id);
        const range=node.attributeRanges.id;
        if(range)edits.push({start:range.valueStart,end:range.valueEnd,text:id});
        else {const at=node.start+1+node.name.length;edits.push({start:at,end:at,text:` id="${id}"`});}
    }
    let output=xml;
    for(const edit of edits.reverse())output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
    scanReferenceXml(output, {allowDuplicateIds:true}); // Preserve unresolved IDs on unconfigured elements; allocations remain unique.
    return {output,changed:edits.length};
}

export interface IdQaIssue {
    kind: 'missing-target' | 'ambiguous-target' | 'missing-refid';
    tag: string; elementId: string; line: number; target: string;
    text: string; before: string; after: string; reason: string; action: string;
    owners: string[];
}
export interface IdQaReport {
    stage: 'audit' | 'repair'; issues: IdQaIssue[];
    changes: Array<{tag:string;line:number;before:string;after:string;reason:string}>;
}
export function createIdQaReport(original: string, output?: string): IdQaReport {
    const before = scanReferenceXml(original, {allowDuplicateIds:true});
    const currentXml = output ?? original;
    const current = scanReferenceXml(currentXml, {allowDuplicateIds:true});
    const indexOwners = (nodes: typeof current.nodes) => {
        const index = new Map<string, typeof nodes>();
        for (const node of nodes) if (node.attributes.id) {
            const matches = index.get(node.attributes.id) || [];
            matches.push(node); index.set(node.attributes.id, matches);
        }
        return index;
    };
    const beforeOwners = indexOwners(before.nodes), currentOwners = indexOwners(current.nodes);
    const originalIndexes = new Map(before.nodes.map((node,index)=>[node,index]));
    const owners = (nodes: typeof current.nodes, id: string) => (nodes === before.nodes ? beforeOwners : currentOwners).get(id) || [];
    const preview = (node: typeof current.nodes[number], xml: string) => xml.slice(node.openEnd,node.closeStart).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
    const newlines = [...currentXml.matchAll(/\n/g)].map(match => match.index!);
    const line = (start:number) => {
        let low=0, high=newlines.length;
        while(low<high) { const mid=(low+high)>>>1; if(newlines[mid]<start) low=mid+1; else high=mid; }
        return low+1;
    };
    const changes: IdQaReport['changes'] = [];
    if (output !== undefined) current.nodes.forEach((node,index) => {
        const old = before.nodes[index];
        if (old && old.attributes.id !== node.attributes.id) changes.push({tag:node.name,line:line(node.start),before:old.attributes.id || '(missing)',after:node.attributes.id || '(missing)',reason:!old.attributeRanges.id?(registry.get(node.name)?.required?'Generated a required missing ID.':'Generated a missing ID for a configured prefix.'):!old.attributes.id?'Corrected an empty ID attribute.':owners(before.nodes,old.attributes.id).length>1?'Repaired an unreferenced duplicate ID.':'Corrected the ID prefix or numbering.'});
    });
    const issues: IdQaIssue[] = [];
    for (const node of current.nodes) {
        const isCitation = node.name === 'ce:cross-ref' || node.name === 'ce:cross-refs';
        const targets = (node.attributes.refid || '').split(/\s+/).filter(Boolean);
        const hasRefid = targets.length > 0;
        const fragment = fragmentTarget(node.attributes['xlink:href'] || '');
        if (fragment) targets.push(fragment);
        if (isCitation && !hasRefid) issues.push({kind:'missing-refid',tag:node.name,elementId:node.attributes.id || '(missing)',line:line(node.start),target:'(missing)',text:preview(node,current.metadataXml),before:'No citation target was supplied.',after:'No citation target is supplied.',reason:'This citation has no refid. ID correction cannot establish which reference it cites.',action:'Identify the intended reference, then review the match in Citation Linker Pro.',owners:[]});
        for (const target of new Set(targets)) {
            const now = owners(current.nodes,target), was = owners(before.nodes,target);
            if (now.length === 1) continue;
            const oldOwner = was.length === 1 ? was[0] : undefined;
            const newId = oldOwner ? current.nodes[originalIndexes.get(oldOwner)!]?.attributes.id : undefined;
            const changed = !!oldOwner && newId !== target;
            const reason = now.length > 1 ? `Target ${target} belongs to ${now.length} elements. The intended owner is ambiguous; automatic ID repair is blocked.` : changed ? `The target element's ID changed from ${target} to ${newId}. The citation/link attribute remains unchanged, so this target no longer resolves.` : `Target ${target} was already absent from the original XML and remains unresolved. It was reserved during ID generation so a different element cannot accidentally acquire this citation/link.`;
            issues.push({kind:now.length>1?'ambiguous-target':'missing-target',tag:node.name,elementId:node.attributes.id || '(missing)',line:line(node.start),target,text:preview(node,current.metadataXml),before:was.length===0?'No target element.':`${was.length} target element(s).`,after:now.length===0?'No target element.':`${now.length} target element(s).`,reason,action:now.length>1?'Review the listed owners in the original XML and resolve their IDs and citation intent before re-running this auditor.':'Verify the intended reference or object using the citation context. Review the affected links in Citation Linker Pro; no replacement target has been selected automatically.',owners:(now.length?now:was).map(owner=>`${owner.name} id="${owner.attributes.id}": ${preview(owner,now.length?current.metadataXml:before.metadataXml)}`)});
        }
    }
    return {stage:output===undefined?'audit':'repair',issues,changes};
}
