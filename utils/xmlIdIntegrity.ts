import {scanReferenceXml} from './referenceUpdaterXml';

// Verified against local common160/common170 declarations. URI fragments are
// existing same-document links, not a claim that their link type passes VTOOL.
const singleRefid=new Set(['ce:cross-ref','ce:float-anchor','ce:see','ce:see-also','ce:grant-number']);
const fragmentTags=new Set(['ce:intra-ref','ce:inter-ref','ce:intra-ref-end','ce:inter-ref-end']);
type Structure=ReturnType<typeof scanReferenceXml>;
export interface XmlIdChange {nodeIndex:number;tag:string;before:string;after:string;reason:string}
export interface XmlReferenceChange {nodeIndex:number;tag:string;attribute:string;tokenIndex:number;before:string;after:string;targetNodeIndex:number}
export interface XmlReferenceOutcome {nodeIndex:number;tag:string;attribute:string;target:string;after:string;status:'updated'|'unchanged'|'ambiguous'|'unresolved'|'unsupported';targetNodeIndex?:number}
export interface XmlReferenceQa {updated:number;unchanged:number;ambiguous:number;unresolved:number;unsupported:number;outcomes:XmlReferenceOutcome[]}
export interface XmlIdRepairEvidence {version:1;originalXml:string;outputXml:string;idChanges:XmlIdChange[];referenceChanges:XmlReferenceChange[];originId?:string}
declare const originBrand:unique symbol;
export type XmlIdRepairOrigin={readonly id:string;readonly [originBrand]:true};
// Only application-held object identity grants access to this snapshot. Neither
// serialized envelope fields nor a copied handle can populate this WeakMap.
const trustedOrigins=new WeakMap<XmlIdRepairOrigin,{id:string;originalXml:string}>();
export function captureXmlIdRepairOrigin(originalXml:string):XmlIdRepairOrigin{
    if(typeof originalXml!=='string')throw Error('An original XML snapshot is required.');
    const origin=Object.freeze({id:globalThis.crypto.randomUUID()}) as XmlIdRepairOrigin;
    trustedOrigins.set(origin,{id:origin.id,originalXml});
    return origin;
}
type Reference={nodeIndex:number;attribute:string;fragment:boolean;supported:boolean;single:boolean;tokens:Array<{value:string;start:number;end:number}>};
type Edit={start:number;end:number;text:string};
const owners=(s:Structure)=>{const result=new Map<string,number[]>();s.nodes.forEach((n,i)=>{if(n.attributes.id)result.set(n.attributes.id,[...(result.get(n.attributes.id)||[]),i]);});return result;};
function references(xml:string,s:Structure):Reference[]{
    const result:Reference[]=[];
    s.nodes.forEach((node,nodeIndex)=>{
        for(const attribute of ['refid','biographyid','xlink:href']){
            const range=node.attributeRanges[attribute];if(!range)continue;
            const value=node.attributes[attribute];const fragment=attribute==='xlink:href';
            if(fragment&&(!value.startsWith('#')||value.length===1))continue;
            const supported=attribute==='refid'?(singleRefid.has(node.name)||node.name==='ce:cross-refs'):attribute==='biographyid'?node.name==='ce:author':fragmentTags.has(node.name);
            const tokens:Reference['tokens']=[];
            if(fragment){let id=value.slice(1);try{id=decodeURIComponent(id);}catch{}
                tokens.push({value:id,start:1,end:value.length});
            }else for(const m of value.matchAll(/[^ \t\r\n]+/g))tokens.push({value:m[0],start:m.index!,end:m.index!+m[0].length});
            result.push({nodeIndex,attribute,fragment,supported,single:node.name!=='ce:cross-refs',tokens});
        }
    });return result;
}
// Conservative reservations include unsupported references; they must never
// acquire a newly generated, unrelated target.
export function xmlReferenceTargets(xml:string,s:Structure):Set<string>{return new Set(references(xml,s).flatMap(r=>r.tokens.map(t=>t.value)));}
function rawSpan(xml:string,s:Structure,r:Reference,start:number,end:number){
    const range=s.nodes[r.nodeIndex].attributeRanges[r.attribute];const raw=xml.slice(range.valueStart,range.valueEnd);
    const units:Array<{start:number;end:number}>=[];
    for(const m of raw.matchAll(/&(?:#x[\da-fA-F]+|#\d+|[A-Za-z_:][\w.:-]*);|[^&]/g)){
        const decoded=s.textValue(m[0]);for(let i=0;i<decoded.length;i++)units.push({start:m.index!,end:m.index!+m[0].length});
    }
    if(!units[start]||!units[end-1]||(start>0&&units[start-1].end>units[start].start)||(end<units.length&&units[end-1].end>units[end].start))throw Error('Unsupported entity boundary in reference token. No output was generated.');
    return {start:range.valueStart+units[start].start,end:range.valueStart+units[end-1].end};
}
function apply(xml:string,edits:Edit[]){
    let boundary=xml.length,output=xml;
    for(const edit of [...edits].sort((a,b)=>b.start-a.start||b.end-a.end)){
        if(edit.start<0||edit.end<edit.start||edit.end>boundary)throw Error('Overlapping ID/reference edits. No output was generated.');
        output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);boundary=edit.start;
    }return output;
}
export function synchronizeXmlIds(originalXml:string,idChanges:XmlIdChange[]){
    const original=scanReferenceXml(originalXml,{allowDuplicateIds:true}),oldOwners=owners(original),refs=references(originalXml,original);
    const byNode=new Map<number,XmlIdChange>(),edits:Edit[]=[],destinations=new Set<string>(),reserved=xmlReferenceTargets(originalXml,original);
    for(const c of idChanges){
        const node=original.nodes[c.nodeIndex];
        if(!node||node.name!==c.tag||(node.attributes.id||'')!==c.before||byNode.has(c.nodeIndex)||!/^\p{L}[\p{L}\p{N}_.:-]*$/u.test(c.after)||c.before===c.after)throw Error('Invalid original ID ownership evidence. No output was generated.');
        if(destinations.has(c.after)||oldOwners.has(c.after)||reserved.has(c.after))throw Error('Destination ID collision or unresolved-target capture. No output was generated.');
        destinations.add(c.after);byNode.set(c.nodeIndex,c);
        const range=node.attributeRanges.id;
        if(range)edits.push({start:range.valueStart,end:range.valueEnd,text:c.after});
        else {const at=node.start+1+node.name.length;edits.push({start:at,end:at,text:` id="${c.after}"`});}
    }
    const referenceChanges:XmlReferenceChange[]=[],referenceQa:XmlReferenceQa={updated:0,unchanged:0,ambiguous:0,unresolved:0,unsupported:0,outcomes:[]};
    for(const r of refs){
        const node=original.nodes[r.nodeIndex];
        const touched=r.tokens.some(t=>(oldOwners.get(t.value)||[]).some(i=>byNode.has(i)));
        if(touched&&(!r.supported||(!r.fragment&&r.single&&r.tokens.length!==1)))throw Error('Unsupported reference semantics or malformed single IDREF. No output was generated.');
        if(!r.tokens.length){referenceQa.unresolved++;referenceQa.outcomes.push({nodeIndex:r.nodeIndex,tag:node.name,attribute:r.attribute,target:'',after:'',status:'unresolved'});}
        r.tokens.forEach((token,tokenIndex)=>{
            const matches=oldOwners.get(token.value)||[],targetNodeIndex=matches.length===1?matches[0]:undefined;
            if(matches.length>1&&matches.some(i=>byNode.has(i)))throw Error('Ambiguous original reference ownership. No output was generated.');
            const changed=targetNodeIndex===undefined?undefined:byNode.get(targetNodeIndex);
            const status=!r.supported||(!r.fragment&&r.single&&r.tokens.length!==1)?'unsupported':matches.length>1?'ambiguous':matches.length===0?'unresolved':changed?'updated':'unchanged';
            referenceQa[status]++;referenceQa.outcomes.push({nodeIndex:r.nodeIndex,tag:node.name,attribute:r.attribute,target:token.value,after:changed?.after||token.value,status,targetNodeIndex});
            if(changed){const span=rawSpan(originalXml,original,r,token.start,token.end);edits.push({...span,text:changed.after});referenceChanges.push({nodeIndex:r.nodeIndex,tag:node.name,attribute:r.attribute,tokenIndex,before:token.value,after:changed.after,targetNodeIndex:targetNodeIndex!});}
        });
    }
    const output=apply(originalXml,edits),after=scanReferenceXml(output,{allowDuplicateIds:true}),newOwners=owners(after),afterRefs=references(output,after);
    if(after.nodes.length!==original.nodes.length||after.nodes.some((n,i)=>n.name!==original.nodes[i].name)||afterRefs.length!==refs.length)throw Error('XML identity changed during ID repair. No output was generated.');
    original.nodes.forEach((node,i)=>{const expected=byNode.get(i)?.after||node.attributes.id||'';if((after.nodes[i].attributes.id||'')!==expected)throw Error('ID ownership postcondition failed. No output was generated.');});
    refs.forEach((r,index)=>{
        const current=afterRefs[index];if(current.nodeIndex!==r.nodeIndex||current.attribute!==r.attribute||current.tokens.length!==r.tokens.length)throw Error('Reference identity postcondition failed. No output was generated.');
        r.tokens.forEach((token,i)=>{
            const prior=oldOwners.get(token.value)||[],now=newOwners.get(current.tokens[i].value)||[];
            const expected=prior.length===1?(byNode.get(prior[0])?.after||token.value):token.value;
            if(current.tokens[i].value!==expected||(prior.length===1&&(now.length!==1||now[0]!==prior[0]))||(prior.length===0&&now.length!==0))throw Error('Reference target ownership postcondition failed. No output was generated.');
        });
    });
    return {output,idChanges,referenceChanges,referenceQa};
}
// The caller must retain the handle captured from actual input BEFORE repair,
// independently of evidence. Reconstructing a handle from imported data is not
// verification. Missing/expired/cross-operation origins fail closed.
export function validateXmlIdRepairEvidence(evidence:XmlIdRepairEvidence,currentXml:string,trustedOrigin:XmlIdRepairOrigin){
    const trusted=trustedOrigins.get(trustedOrigin);
    if(!trusted)throw Error('An independently captured trusted original is required for ownership verification.');
    if(!evidence||evidence.version!==1||typeof evidence.originalXml!=='string'||evidence.outputXml!==currentXml||!Array.isArray(evidence.idChanges)||!Array.isArray(evidence.referenceChanges))throw Error('Missing or stale ID repair evidence.');
    if(evidence.originId!==trusted.id||evidence.originalXml!==trusted.originalXml)throw Error('ID repair evidence does not match the independently captured original or repair operation.');
    const replay=synchronizeXmlIds(trusted.originalXml,evidence.idChanges);
    if(replay.output!==currentXml||JSON.stringify(replay.referenceChanges)!==JSON.stringify(evidence.referenceChanges))throw Error('ID repair evidence does not reproduce current XML ownership.');
    return {...replay,originVerified:true as const,originId:trusted.id};
}
