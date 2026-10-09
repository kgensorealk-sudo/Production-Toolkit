import {scanReferenceXml} from './referenceUpdaterXml';
export interface LinkEdit {
    start:number; originalTag:string; existingId:string; existingRefid:string; existingHref?:string;
    linkAttribute?:'refid'|'xlink:href'; mappedIds:string[]; status:string; missingId:boolean;
    missingRefid:boolean; isDuplicate:boolean; originalIsPlural:boolean; tagType:string;
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
