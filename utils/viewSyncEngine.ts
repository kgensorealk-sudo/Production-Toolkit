import {scanReferenceXml, ReferenceXmlNode} from './referenceUpdaterXml';
import {ID_RULES} from './idAuditorEngine';

type Node = ReferenceXmlNode;
export interface ViewPair {compact: Node; extended: Node; index: number}
export interface ViewNotice {paraId: string; message: string}
const compact = new Set(['compact', 'compact-standard']);
const isView = (n: Node) => ['ce:para', 'ce:simple-para'].includes(n.name) && (compact.has(n.attributes.view) || n.attributes.view === 'extended');
const ruleMap = new Map(ID_RULES.map(r => [r.tag, r]));
const escapeAttribute = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
type Edit = {start: number; end: number; value: string};
function apply(xml: string, edits: Edit[]) {
    for (const e of [...edits].sort((a,b) => b.start - a.start)) xml = xml.slice(0,e.start) + e.value + xml.slice(e.end);
    return xml;
}
function structure(xml: string) {
    const parsed = scanReferenceXml(xml); // Duplicate owners are unsafe for copying or preserving targets.
    const parents = new Map<Node, Node | null>();
    const children = new Map<Node | null, Node[]>();
    const stack: Node[] = [];
    for (const n of parsed.nodes) {
        while (stack.length && stack[stack.length-1].end <= n.start) stack.pop();
        const parent = stack[stack.length-1] || null;
        parents.set(n,parent);
        if (!children.has(parent)) children.set(parent,[]);
        children.get(parent)!.push(n);
        if (n.end > n.openEnd) stack.push(n);
    }
    return {...parsed, parents, children};
}
export function inspectViews(xml: string) {
    const parsed = structure(xml);
    const protectedView = (node:Node) => {
        let ancestor=parsed.parents.get(node);
        let sectionView=false;
        while(ancestor){
            if(ancestor.name==='ce:section' && (compact.has(ancestor.attributes.view) || ancestor.attributes.view==='extended'))sectionView=true;
            if(ancestor.name==='ce:appendices' && sectionView)return true;
            ancestor=parsed.parents.get(ancestor);
        }
        return false;
    };
    const eligible=(node:Node)=>isView(node) && !protectedView(node);
    const pairs: ViewPair[] = [], orphans: Node[] = [], notices: ViewNotice[] = [];
    for (const siblings of parsed.children.values()) {
        for (let i=0;i<siblings.length;i++) {
            if (!eligible(siblings[i])) continue;
            const run: Node[] = [siblings[i]];
            while (i+1<siblings.length && eligible(siblings[i+1]) && !xml.slice(siblings[i].end,siblings[i+1].start).replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g,'').trim()) run.push(siblings[++i]);
            if (run.length === 2 && run[0].name === run[1].name && compact.has(run[0].attributes.view) !== compact.has(run[1].attributes.view)) {
                pairs.push({compact: compact.has(run[0].attributes.view) ? run[0] : run[1], extended: compact.has(run[0].attributes.view) ? run[1] : run[0], index: pairs.length});
            } else if (run.length === 1) orphans.push(run[0]);
            else notices.push({paraId: run.map(n=>n.attributes.id || '(missing ID)').join(', '),message:'Ambiguous consecutive views: select and arrange the actual counterpart paragraphs before synchronizing.'});
        }
    }
    return {...parsed, pairs, orphans, notices};
}
function descendants(parsed: ReturnType<typeof structure>, node: Node) {
    return parsed.nodes.filter(n => n.start >= node.openEnd && n.end <= node.closeStart);
}
function sensitive(parsed: ReturnType<typeof structure>, node: Node) {
    return descendants(parsed,node).some(n => ['ce:display','ce:e-component','e-component','ce:table','ce:figure'].includes(n.name));
}
function supplementary(n:Node) {
    const ids=(n.attributes.refid || '').split(/\s+/).filter(Boolean);
    return ['ce:cross-ref','ce:cross-refs'].includes(n.name) && ids.length>0 && ids.every(id=>/^ec\d+$/.test(id));
}
function unlinkedSupplementary(xml:string,parsed:ReturnType<typeof structure>,scope:Node) {
    const protectedNodes=descendants(parsed,scope).filter(supplementary);
    // Read visible text across inline nodes, retaining CDATA text. Established links
    // form boundaries so their labels cannot combine with surrounding plain text.
    let position=scope.openEnd, visible='';
    for(const node of protectedNodes){
        if(node.start<position)continue;
        visible+=canonicalText(parsed,position,node.start)+'\u0000';
        position=node.end;
    }
    visible+=canonicalText(parsed,position,scope.closeStart);
    return /\b(?:Fig(?:ure)?s?\.?|Tables?|Schemes?|Movies?|Videos?)\s+S\d+/i.test(visible);
}
const escapeText=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function projectedBody(xml:string,parsed:ReturnType<typeof structure>,source:Node,extended?:Node,plain=false) {
    const edits:Edit[]=[];
    for(const n of descendants(parsed,source))if(['ce:cross-ref','ce:cross-refs'].includes(n.name) && (n.attributes.refid||'').split(/\s+/).some(id=>/^ec\d+$/.test(id)) && !supplementary(n))throw new Error('Mixed supplementary and ordinary citation targets require review.');
    if(source.attributes.view==='extended' || plain) {
        for(const n of descendants(parsed,source).filter(supplementary)) edits.push({start:n.start,end:n.end,value:escapeText(parsed.textContent(n))});
    } else if(extended) {
        const prototypes=new Map<string,Node>();
        for(const n of descendants(parsed,extended).filter(supplementary)) {
            const label=parsed.textContent(n);
            if(!label.trim())throw new Error('Supplementary citation has no usable text. Review its link before synchronization.');
            const old=prototypes.get(label);
            if(old && old.attributes.refid!==n.attributes.refid)throw new Error(`Ambiguous supplementary target for ${label}. Review the extended links.`);
            prototypes.set(label,n);
        }
        const body=xml.slice(source.openEnd,source.closeStart);
        const protectedNodes=descendants(parsed,source).filter(n=>['ce:cross-ref','ce:cross-refs','ce:inter-ref','ce:intra-ref'].includes(n.name));
        const segments=[...body.matchAll(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|([^<]+)/g)].filter(m=>m[1]);
        for(const [label,n] of prototypes) {
            let restored=0;
            const pattern=new RegExp('(?<![\\p{L}\\p{N}])'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','gu');
            for(const segment of segments) {
                const absolute=source.openEnd+segment.index!;
                if(protectedNodes.some(p=>absolute>=p.openEnd && absolute<p.closeStart))continue;
                const raw=segment[1], offsets:Array<{start:number;end:number}>=[];
                let decoded='';
                for(const token of raw.matchAll(/&[^;]+;|[^&]/g)) {const value=parsed.textValue(token[0]);decoded+=value;for(let i=0;i<value.length;i++)offsets.push({start:token.index!,end:token.index!+token[0].length});}
                for(const match of decoded.matchAll(pattern)) {
                    const start=absolute+offsets[match.index!].start,end=absolute+offsets[match.index!+match[0].length-1].end;
                    const preceding=canonicalText(parsed,source.openEnd,start);
                    const following=canonicalText(parsed,end,source.closeStart);
                    if(/[\p{L}\p{N}]$/u.test(preceding) || /^[\p{L}\p{N}]/u.test(following))continue;
                    let opening=xml.slice(n.start,n.openEnd);
                    const id=n.attributeRanges.id;
                    if(id)opening=apply(opening,[{start:id.start-n.start,end:id.end-n.start,value:''}]);
                    edits.push({start,end,value:opening+xml.slice(start,end)+`</${n.name}>`});restored++;
                }
            }
            if(!restored && !descendants(parsed,source).some(s=>supplementary(s) && parsed.textContent(s)===label && s.attributes.refid===n.attributes.refid))
                throw new Error(`Supplementary citation ${label} cannot be located safely in the compact text. Preserved the extended paragraph for review.`);
        }
    }
    for(let i=0;i<edits.length;i++)for(let j=i+1;j<edits.length;j++)if(edits[i].start<edits[j].end && edits[j].start<edits[i].end)throw new Error('Overlapping supplementary citation labels require review.');
    return apply(xml.slice(source.openEnd,source.closeStart),edits.map(e=>({...e,start:e.start-source.openEnd,end:e.end-source.openEnd})));
}
// Preserve markup and decoded text while ignoring counterpart ID values and attribute ordering.
function localIds(parsed: ReturnType<typeof structure>, scope: Node) {
    const ids=new Map<string,string>();
    const visit=(n:Node,path:string)=>{if(n.attributes.id)ids.set(n.attributes.id,'@local:'+path);(parsed.children.get(n)||[]).forEach((child,i)=>visit(child,path+'/'+child.name+':'+i));};
    visit(scope,scope.name);
    return ids;
}
function canonical(parsed: ReturnType<typeof structure>, node: Node, ids=localIds(parsed,node),plainSupplementary=false): string {
    if(plainSupplementary && supplementary(node))return parsed.textContent(node);
    const own = Object.entries(node.attributes).filter(([k])=>k!=='id' && k!=='view').map(([k,v])=>[k,k==='refid'?v.split(/(\s+)/).map(id=>ids.get(id)||id).join(''):k==='xlink:href'&&ids.has(fragment(v))?'#'+ids.get(fragment(v)):v]).sort(([a],[b])=>a.localeCompare(b));
    const childNodes = parsed.children.get(node) || [];
    let pos = node.openEnd, body = '';
    for (const child of childNodes) {
        body += canonicalText(parsed, pos, child.start) + canonical(parsed,child,ids,plainSupplementary);
        pos = child.end;
    }
    body += canonicalText(parsed,pos,node.closeStart);
    return JSON.stringify([node.name,own,body]);
}
function canonicalText(parsed: ReturnType<typeof structure>, start: number, end: number) {
    // The scanner's textContent decodes entities without interpreting literal CDATA as markup.
    return parsed.textContent({start,openEnd:start,closeStart:end,end,name:'text',attributes:{},attributeRanges:{}});
}
export function viewDifferences(xml: string) {
    const audit = inspectViews(xml);
    return {audit, mismatches: audit.pairs.filter(p => canonical(audit,p.compact,undefined,true)!==canonical(audit,p.extended,undefined,true) || descendants(audit,p.compact).some(supplementary) || unlinkedSupplementary(xml,audit,p.extended)).map(p=>{
        const a=audit.textContent(p.compact),b=audit.textContent(p.extended);
        return {paraId:p.compact.attributes.id || '(missing ID)',compactText:a===b?xml.slice(p.compact.openEnd,p.compact.closeStart):a,extendedText:a===b?xml.slice(p.extended.openEnd,p.extended.closeStart):b,index:p.index};
    })};
}
function fragment(href: string) { if (!href.startsWith('#')) return ''; try {return decodeURIComponent(href.slice(1));} catch {return href.slice(1);} }
function targets(nodes: Node[]) {
    const result = new Set<string>();
    for (const n of nodes) {for(const id of (n.attributes.refid || '').split(/\s+/).filter(Boolean)) result.add(id); const id=fragment(n.attributes['xlink:href'] || '');if(id)result.add(id);}
    return result;
}
function allocator(parsed: ReturnType<typeof structure>, start: string) {
    if (start && (!/^\d{4}$/.test(start) || +start<5 || +start>9995 || +start%5!==0)) throw new Error('Starting IDs must be four digits, from 0005 to 9995, in steps of five.');
    const reserved = new Set([...parsed.ids,...targets(parsed.nodes)]);
    const seeds = new Map<string,number>();
    return (node: Node) => {
        const rule = ruleMap.get(node.name);
        const prefix = node.attributes.type === 'code' && rule && 'codedPrefix' in rule ? rule.codedPrefix : rule?.prefix;
        if (!prefix) throw new Error(`No configured ID prefix for ${node.name}. Use ID Prefix Auditor to review this element.`);
        let num=seeds.get(prefix) || +(start || '3000');
        for(let i=0;i<1999;i++) {
            const id=prefix+String(num).padStart(4,'0');num=num===9995?5:num+5;
            if (!reserved.has(id)) {reserved.add(id);seeds.set(prefix,num);return id;}
        }
        throw new Error(`No unused ${prefix} IDs remain in 0005-9995.`);
    };
}
function cloneBody(xml: string, parsed: ReturnType<typeof structure>, source: Node, target: Node | undefined, allocate: (n:Node)=>string, rootId?:string) {
    const sourceNodes=descendants(parsed,source), targetNodes=target?descendants(parsed,target):[];
    const linkKinds=['ce:cross-ref','ce:cross-refs','ce:inter-ref','ce:intra-ref','ce:float-anchor'];
    if(target){
        const available=new Map<string,number>();
        const identity=(n:Node)=>JSON.stringify([n.name,n.attributes['xlink:href'] || '',n.attributes.refid || '']);
        for(const n of sourceNodes.filter(n=>['ce:inter-ref','ce:intra-ref','ce:float-anchor'].includes(n.name))){const key=identity(n);available.set(key,(available.get(key)||0)+1);}
        for(const n of targetNodes.filter(n=>['ce:inter-ref','ce:intra-ref','ce:float-anchor'].includes(n.name))){
            const key=identity(n),count=available.get(key)||0;
            if(!count)throw new Error(`Target ${n.name} destination is absent from the source. Preserved the pair for link review.`);
            available.set(key,count-1);
        }
    }
    if(target && targetNodes.filter(n=>linkKinds.includes(n.name) && !(compact.has(target.attributes.view) && supplementary(n))).length>sourceNodes.filter(n=>linkKinds.includes(n.name)).length)
        throw new Error('Target contains links absent from the source. Preserved its content; review the intended citation/link changes in Citation Linker Pro.');
    for(const n of sourceNodes) {
        if (['ce:cross-ref','ce:cross-refs'].includes(n.name) && !n.attributes.refid?.trim()) throw new Error('Source contains a citation without refid. Review it in Citation Linker Pro before synchronizing.');
        if (ruleMap.get(n.name)?.required && !n.attributes.id) throw new Error(`Source ${n.name} has no required ID. Review it in ID Prefix Auditor first.`);
    }
    const edits:Edit[]=[], map=new Map<string,string>(), kept=new Set<string>();
    const sourceIds=localIds(parsed,source),targetIds=target?localIds(parsed,target):new Map<string,string>();
    if(source.attributes.id && (rootId || target?.attributes.id)) map.set(source.attributes.id,rootId || target!.attributes.id);
    for(const n of sourceNodes.filter(n=>n.attributes.id || ['ce:cross-ref','ce:cross-refs'].includes(n.name))) {
        const signature=canonical(parsed,n,sourceIds);
        const matchingSource=sourceNodes.filter(s=>canonical(parsed,s,sourceIds)===signature);
        const matchingTarget=targetNodes.filter(t=>t.attributes.id && canonical(parsed,t,targetIds)===signature);
        let id:string;
        if(matchingSource.length===1 && matchingTarget.length===1 && !kept.has(matchingTarget[0].attributes.id)) {id=matchingTarget[0].attributes.id;kept.add(id);} else id=allocate(n);
        if(n.attributes.id)map.set(n.attributes.id,id);
        const range=n.attributeRanges.id;
        if(range)edits.push({start:range.valueStart,end:range.valueEnd,value:escapeAttribute(id)});
        else edits.push({start:n.openEnd-1,end:n.openEnd-1,value:` id="${id}"`});
    }
    if(target) {
        const removed=new Set(targetNodes.filter(n=>n.attributes.id && !kept.has(n.attributes.id)).map(n=>n.attributes.id));
        const incoming=targets(parsed.nodes.filter(n=>n.start<target.openEnd || n.end>target.closeStart));
        for(const id of removed) if(incoming.has(id)) throw new Error(`Synchronization would remove linked target ${id}. Review its counterpart before proceeding.`);
    }
    for(const n of sourceNodes) {
        if(n.attributes.refid) {
            const old=n.attributes.refid, value=old.split(/(\s+)/).map(id=>map.get(id)||id).join('');
            if(value!==old) {const r=n.attributeRanges.refid;edits.push({start:r.valueStart,end:r.valueEnd,value:escapeAttribute(value)});}
        }
        const old=n.attributes['xlink:href'];if(old && map.has(fragment(old))) {const r=n.attributeRanges['xlink:href'];edits.push({start:r.valueStart,end:r.valueEnd,value:'#'+escapeAttribute(map.get(fragment(old))!)});}
    }
    // Only actual attribute ranges are edited. Comments, CDATA and look-alike text remain literal.
    return {body:apply(xml,edits).slice(source.openEnd, source.closeStart + edits.reduce((sum,e)=>sum+e.value.length-(e.end-e.start),0)),kept,map};
}
function validateResult(input: ReturnType<typeof structure>, output: string) {
    const after=structure(output), beforeTargets=targets(input.nodes), afterTargets=targets(after.nodes);
    for(const id of afterTargets) if(input.ids.has(id) && !after.ids.has(id)) throw new Error(`Output would leave ${id} unresolved. No changes applied.`);
    for(const id of beforeTargets) if(!input.ids.has(id) && after.ids.has(id)) throw new Error(`Generated ID would capture unresolved target ${id}. No changes applied.`);
    return after;
}
export function synchronizeViews(xml:string,direction:'compact-to-extended'|'extended-to-compact',start='',selection?:Set<number>) {
    const audit=inspectViews(xml), allocate=allocator(audit,start), edits:Edit[]=[], notices=[...audit.notices];
    const applied:Array<{paraId:string; before:string; after:string}>=[];
    for(const pair of audit.pairs) {
        if(selection && !selection.has(pair.index))continue;
        const source=direction==='compact-to-extended'?pair.compact:pair.extended, target=direction==='compact-to-extended'?pair.extended:pair.compact;
        const paraId=target.attributes.id || '(missing ID)';
        if(canonical(audit,source,undefined,true)===canonical(audit,target,undefined,true) && !descendants(audit,pair.compact).some(supplementary) && !unlinkedSupplementary(xml,audit,pair.extended))continue;
        if(source.openEnd===source.end || target.openEnd===target.end) {notices.push({paraId,message:'Empty self-closing view needs a content review before synchronization.'});continue;}
        if(sensitive(audit,source)||sensitive(audit,target)) {notices.push({paraId,message:'Supplementary/display content or file links differ between views. Preserved both paragraphs; review their intended content manually.'});continue;}
        try {
            const projected=projectedBody(xml,audit,source,target.attributes.view==='extended'?target:undefined);
            const temporary=xml.slice(0,source.openEnd)+projected+xml.slice(source.closeStart);
            const prepared=structure(temporary),delta=projected.length-(source.closeStart-source.openEnd);
            const preparedSource=prepared.nodes.find(n=>n.start===source.start)!;
            const preparedTarget=prepared.nodes.find(n=>n.start===target.start+(target.start>source.start?delta:0))!;
            if(target.attributes.view==='extended' && unlinkedSupplementary(temporary,prepared,preparedSource))throw new Error('Extended supplementary citation has no proven link target. Review it in Citation Linker Pro.');
            if(source.attributes.view==='extended' && unlinkedSupplementary(xml,audit,source))throw new Error('Source extended view contains an unlinked supplementary citation. Review its target before synchronization.');
            const {body}=cloneBody(temporary,prepared,preparedSource,preparedTarget,allocate);
            const before=xml.slice(target.openEnd,target.closeStart);
            if(body!==before) {edits.push({start:target.openEnd,end:target.closeStart,value:body});applied.push({paraId,before,after:body});}
            if(direction==='compact-to-extended' && descendants(audit,source).some(supplementary)) {
                const plain=projectedBody(xml,audit,source,undefined,true),before=xml.slice(source.openEnd,source.closeStart);
                edits.push({start:source.openEnd,end:source.closeStart,value:plain});applied.push({paraId:source.attributes.id || '(missing ID)',before,after:plain});
            }
        } catch(error) {notices.push({paraId,message:error instanceof Error?error.message:'Unable to synchronize safely.'});}
    }
    const output=apply(xml,edits);validateResult(audit,output);
    return {output,notices,applied,audit};
}
export function repairViewOrphans(xml:string,start='') {
    const audit=inspectViews(xml),allocate=allocator(audit,start),edits:Edit[]=[],notices=[...audit.notices];
    let created=0;
    for(const orphan of audit.orphans) {
        const paraId=orphan.attributes.id || '(missing ID)';
        if(sensitive(audit,orphan)) {notices.push({paraId,message:'Supplementary/display view has no verified counterpart. Preserved it for manual review.'});continue;}
        try {
            if(orphan.openEnd===orphan.end) throw new Error('Empty self-closing view needs a content review before creating a counterpart.');
            if(compact.has(orphan.attributes.view) && descendants(audit,orphan).some(supplementary))throw new Error('Compact orphan contains a supplementary link. Review its plain-text compact representation and extended counterpart before creating a partner.');
            if(unlinkedSupplementary(xml,audit,orphan))throw new Error(compact.has(orphan.attributes.view)?'Compact supplementary text has no extended link evidence. Review its target before creating an extended counterpart.':'Extended orphan contains an unlinked supplementary citation. Review its target before creating a compact counterpart.');
            const id=allocate(orphan);
            const projected=orphan.attributes.view==='extended'?projectedBody(xml,audit,orphan):xml.slice(orphan.openEnd,orphan.closeStart);
            const temporary=xml.slice(0,orphan.openEnd)+projected+xml.slice(orphan.closeStart),prepared=structure(temporary);
            const preparedSource=prepared.nodes.find(n=>n.start===orphan.start)!;
            const {body}=cloneBody(temporary,prepared,preparedSource,undefined,allocate,id);
            const view=compact.has(orphan.attributes.view)?'extended':'compact-standard';
            let opening=xml.slice(orphan.start,orphan.openEnd);
            const local:Edit[]=[], v=orphan.attributeRanges.view;
            local.push({start:v.valueStart-orphan.start,end:v.valueEnd-orphan.start,value:view});
            const r=orphan.attributeRanges.id;
            if(r)local.push({start:r.valueStart-orphan.start,end:r.valueEnd-orphan.start,value:id});
            else local.push({start:opening.length-1,end:opening.length-1,value:` id="${id}"`});
            opening=apply(opening,local);
            const block=opening+body+`</${orphan.name}>`;
            const position=view==='extended'?orphan.start:orphan.end;
            edits.push({start:position,end:position,value:view==='extended'?block+'\n':'\n'+block});created++;
        } catch(error) {notices.push({paraId,message:error instanceof Error?error.message:'Unable to create counterpart safely.'});}
    }
    const output=apply(xml,edits);validateResult(audit,output);
    return {output,notices,created,audit};
}
