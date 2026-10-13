import {scanReferenceXml} from './referenceUpdaterXml';
export type CitationTargetType='bibliography'|'affiliation'|'object';
type CitationStructure=ReturnType<typeof scanReferenceXml>;
type CitationNode=CitationStructure['nodes'][number];
const objectNames=new Set(['ce:figure','ce:table','ce:display-formula','ce:textbox','ce:footnote','ce:section']);
const contextCache=new WeakMap<CitationNode,{affiliation:boolean;numeric:boolean;bracketed:boolean;objectName?:string;authorYear:boolean}>();
const numericIndexes=new WeakMap<CitationStructure,Map<string,Array<{id:string;type:CitationTargetType;node:CitationNode}>>>();
export function citationTargetContext(structure:CitationStructure,node:CitationNode){
    const cached=contextCache.get(node);if(cached)return cached;
    const affiliation=structure.nodes.some(parent=>parent.start<node.start&&parent.end>=node.end&&['ce:author-group','ce:author','ce:affiliation','ce:affiliation-group','ce:correspondence'].includes(parent.name));
    const text=structure.textContent(node).trim();
    const numeric=/^(?:\[\s*\d+(?:\s*(?:[,;–—-]|\band\b)\s*\d+)*\s*\]|\d+(?:\s*(?:[,;–—-]|\band\b)\s*\d+)*)$/.test(text);
    const objectName=([
        [/^fig(?:ure)?s?\.?\s+/i,'ce:figure'],[/^tables?\s+/i,'ce:table'],[/^(?:eq(?:uation)?s?\.?)\s+/i,'ce:display-formula'],
        [/^(?:notes?|footnotes?)\s+/i,'ce:footnote'],[/^(?:box|boxes)\s+/i,'ce:textbox'],[/^sections?\s+/i,'ce:section']
    ] as Array<[RegExp,string]>).find(([pattern])=>pattern.test(text))?.[1];
    const authorYear=!numeric&&!objectName&&/[\p{L}\p{M}]/u.test(text)&&/\b(?:18|19|20)\d{2}[a-z]?\b/i.test(text);
    const context={affiliation,numeric,bracketed:!affiliation&&numeric&&text.startsWith('['),objectName,authorYear};
    contextCache.set(node,context);return context;
}
export function citationNumericCandidates(structure:CitationStructure,node:CitationNode,number:string){
    const context=citationTargetContext(structure,node);
    let index=numericIndexes.get(structure);
    if(!index){index=new Map();for(const target of structure.nodes){
        const type:CitationTargetType|undefined=target.name==='ce:bib-reference'&&structure.references.includes(target)?'bibliography':target.name==='ce:affiliation'?'affiliation':objectNames.has(target.name)?'object':undefined;
        if(!type||!target.attributes.id)continue;
        const label=structure.nodes.find(child=>child.name==='ce:label'&&child.start>=target.openEnd&&child.end<=target.closeStart&&!structure.nodes.some(parent=>parent!==target&&parent.start>=target.openEnd&&parent.start<child.start&&parent.end>=child.end));
        const value=label?structure.textContent(label).replace(/[\[\]]/g,'').trim():'';
        if(!/^\d+$/.test(value))continue;
        const key=type+'|'+value;index.set(key,[...(index.get(key)||[]),{id:target.attributes.id,type,node:target}]);
    }numericIndexes.set(structure,index);}
    const types:CitationTargetType[]=context.affiliation?['affiliation']:context.bracketed?['bibliography']:['bibliography','object'];
    return types.flatMap(type=>index!.get(type+'|'+number)||[]);
}
export function citationTargetType(node:CitationNode|undefined):CitationTargetType|undefined{
    if(!node)return undefined;
    return node.name==='ce:bib-reference'?'bibliography':node.name==='ce:affiliation'?'affiliation':objectNames.has(node.name)?'object':undefined;
}
export interface LinkEdit {
    start:number; originalTag:string; existingId:string; existingRefid:string; existingHref?:string;
    linkAttribute?:'refid'|'xlink:href'; mappedIds:string[]; status:string; missingId:boolean;
    missingRefid:boolean; isDuplicate:boolean; originalIsPlural:boolean; tagType:string;
    targetType?:CitationTargetType; manualTarget?:string;
}
export function applyCitationLinks(input:string, rows:LinkEdit[], options:{targetMissingId:boolean;targetDuplicateId:boolean;targetMissingRefid:boolean;cfStart:number}) {
    const structure=scanReferenceXml(input,{allowDuplicateIds:true});
    const nodes=new Map(structure.nodes.map(node=>[node.start,node]));
    if (options.targetMissingId || options.targetDuplicateId) throw Error('Citation Linker only edits refid. Use ID Prefix Auditor for IDs.');
    const edits:Array<{start:number;end:number;text:string}>=[];
    const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    for(const row of rows){
        const node=nodes.get(row.start);
        if(!node||input.slice(node.start,node.end)!==row.originalTag)throw Error('Citation analysis is stale. Re-analyze the current XML.');
        const setAttribute=(name:string,value:string)=>{
            const range=node.attributeRanges[name];
            if(range)edits.push({start:range.valueStart,end:range.valueEnd,text:escape(value).replace(/'/g,range.quote==="'"?'&apos;':"'")});
            else edits.push({start:node.start+1+node.name.length,end:node.start+1+node.name.length,text:` ${name}="${escape(value)}"`});
        };
        if(options.targetMissingRefid&&row.missingRefid&&row.status==='resolved'){
            if(!row.mappedIds.length||row.mappedIds.some(id=>structure.nodes.filter(n=>n.attributes.id===id).length!==1))throw Error('A proposed target is missing or ambiguous. Re-analyze the XML.');
            const context=citationTargetContext(structure,node);
            // Validate a numeric group once, before planning any edits for this row.
            if(context.numeric){
                const numbers=structure.textContent(node).replace(/[\[\]]/g,'').trim().split(/[,;]|\band\b/).flatMap(part=>{
                    const range=part.trim().match(/^(\d+)[–—-](\d+)$/);
                    if(!range)return [part.trim()];
                    const a=Number(range[1]),b=Number(range[2]);
                    if(a>b||b-a>=10000)throw Error('Unsupported numeric range. Re-analyze the XML.');
                    return Array.from({length:b-a+1},(_,index)=>String(a+index));
                });
                const eligible=numbers.map(number=>citationNumericCandidates(structure,node,number));
                const manual=row.manualTarget===row.mappedIds[0]&&row.mappedIds.length===1&&numbers.length===1;
                if(row.mappedIds.some(id=>!eligible.some(list=>list.some(candidate=>candidate.id===id)))||eligible.some(list=>list.length!==1)&&!manual)throw Error('Numeric target is ineligible or ambiguous; manual review required.');
                if(!manual){
                    const candidates=eligible.flat(),expected=new Set(candidates.map(candidate=>candidate.id));
                    if(new Set(candidates.map(candidate=>candidate.type)).size!==1||expected.size!==new Set(row.mappedIds).size||row.mappedIds.some(mapped=>!expected.has(mapped)))throw Error('Incomplete or mixed-type numeric target group; manual XML review required.');
                }
            }
            for(const id of row.mappedIds){
                const target=structure.nodes.find(n=>n.attributes.id===id)!;
                const type=citationTargetType(target);
                if((row.targetType&&row.targetType!==type)||(context.affiliation&&type!=='affiliation')||(context.bracketed&&(type!=='bibliography'||!structure.references.includes(target)))||(!context.affiliation&&context.objectName&&target.name!==context.objectName)||(!context.affiliation&&context.authorYear&&(type!=='bibliography'||!structure.references.includes(target)))||(node.name==='ce:float-anchor'&&type!=='object'))throw Error('Proposed target has an incompatible citation semantic type. Re-analyze the XML.');
            }
            if(row.linkAttribute==='xlink:href')setAttribute('xlink:href','#'+row.mappedIds[0]);
            else {
                setAttribute('refid',row.mappedIds.join(' '));
                if(row.mappedIds.length>1&&!row.originalIsPlural&&/^ce:(cross|intra)-ref$/.test(node.name)){
                    const name=node.name+'s';
                    edits.push({start:node.start+1,end:node.start+1+node.name.length,text:name});
                    if(node.closeStart>node.openEnd||input.slice(node.closeStart,node.end).startsWith('</'))edits.push({start:node.closeStart+2,end:node.closeStart+2+node.name.length,text:name});
                }
            }
        }
    }
    let output=input;
    for(const edit of edits.sort((a,b)=>b.start-a.start||b.end-a.end))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
    scanReferenceXml(output,{allowDuplicateIds:true});return output;
}
export function cleanupCitationDois(input:string) {
    const structure=scanReferenceXml(input,{allowDuplicateIds:true});
    const children=new Map<number,typeof structure.nodes>(), stack:typeof structure.nodes=[];
    for(const node of structure.nodes){
        while(stack.length&&node.start>=stack[stack.length-1].closeStart)stack.pop();
        const parent=stack[stack.length-1];if(parent){const list=children.get(parent.start)||[];list.push(node);children.set(parent.start,list);}
        if(node.closeStart>=node.openEnd)stack.push(node);
    }
    const linkedIds=new Set<string>();
    for(const node of structure.nodes){for(const id of (node.attributes.refid||'').split(/\s+/))if(id)linkedIds.add(id);const href=node.attributes['xlink:href']||'';if(href.startsWith('#')){let id=href.slice(1);try{id=decodeURIComponent(id);}catch{}linkedIds.add(id);}}
    const edits:Array<{start:number;end:number;text:string}>=[],labels:string[]=[];
    for(const reference of structure.references){
        const refs=structure.nodes.filter(n=>n.name==='sb:reference'&&n.start>=reference.openEnd&&n.end<=reference.closeStart);
        for(const ref of refs){
            const hosts=(children.get(ref.start)||[]).filter(n=>n.name==='sb:host');
            for(let index=1;index<hosts.length;index++){
                const first=hosts[index-1],second=hosts[index];
                if(input.slice(first.end,second.start).trim())continue;
                if(Object.keys(second.attributes).length)continue;
                const secondChildren=children.get(second.start)||[];
                if(secondChildren.length!==1||secondChildren[0].name!=='sb:e-host'||Object.keys(secondChildren[0].attributes).length)continue;
                const electronic=secondChildren[0],electronicChildren=children.get(electronic.start)||[];
                if(electronicChildren.length!==1||electronicChildren[0].name!=='ce:inter-ref')continue;
                const link=electronicChildren[0],href=link.attributes['xlink:href']||'';
                let doi='';
                try{const url=new URL(href);if(!url.search&&!url.hash&&!url.username&&!url.password&&!url.port&&/^https?:$/.test(url.protocol)&&/^(?:dx\.)?doi\.org$/i.test(url.hostname))doi=decodeURIComponent(url.pathname).match(/^\/(10\.\d{4,9}\/\S+)$/)?.[1]||'';}catch{}
                if(!doi||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(doi)||Object.keys(link.attributes).some(name=>!['id','xlink:href','type'].includes(name)))continue;
                if(structure.nodes.some(n=>n.name==='ce:doi'&&n.start>=first.openEnd&&n.end<=first.closeStart))continue;
                if(structure.nodes.some(n=>n.start>=second.start&&n.end<=second.end&&n.attributes.id&&linkedIds.has(n.attributes.id)))continue;
                // Only containers holding this one DOI link may be removed; no other text or markup is discarded.
                if(input.slice(second.openEnd,electronic.start).trim()||input.slice(electronic.end,second.closeStart).trim()||input.slice(electronic.openEnd,link.start).trim()||input.slice(link.end,electronic.closeStart).trim())continue;
                const safe=doi.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                edits.push({start:first.closeStart,end:first.closeStart,text:`<ce:doi>${safe}</ce:doi>`},{start:second.start,end:second.end,text:''});
                const label=(children.get(reference.start)||[]).find(n=>n.name==='ce:label');labels.push(label?structure.textValue(input.slice(label.openEnd,label.closeStart).replace(/<[^>]+>/g,'')).trim():'Unknown reference');
                index++;
            }
        }
    }
    let output=input;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
    scanReferenceXml(output,{allowDuplicateIds:true});return {output,labels};
}
