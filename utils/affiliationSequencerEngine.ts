import {scanReferenceXml,ReferenceXmlNode} from './referenceUpdaterXml';
const formatAffiliationId=(index:number)=>'af'+String(index*5).padStart(4,'0');
const getAlphabetLabel=(index:number)=>{let label='';while(index>=0){label='abcdefghijklmnopqrstuvwxyz'[index%26]+label;index=Math.floor(index/26)-1;}return label;};
type Edit={start:number;end:number;value:string};
const escape=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const fragment=(v:string)=>{if(!v.startsWith('#'))return '';try{return decodeURIComponent(v.slice(1));}catch{return v.slice(1);}};
export function sequenceAffiliations(xml:string){
    const parsed=scanReferenceXml(xml),edits:Edit[]=[],notices:string[]=[];
    const within=(parent:ReferenceXmlNode)=>parsed.nodes.filter(n=>n.start>=parent.openEnd && n.end<=parent.closeStart);
    const affiliations=parsed.nodes.filter(n=>n.name==='ce:affiliation');
    if(!affiliations.length)throw new Error('No affiliation elements found. No output generated.');
    if(affiliations.length>1999)throw new Error('Affiliation IDs would exceed the four-digit 9995 limit.');
    const affIds=new Set(affiliations.map(n=>n.attributes.id).filter(Boolean));
    const unresolved=new Set<string>();
    for(const n of parsed.nodes){for(const id of (n.attributes.refid||'').split(/\s+/).filter(Boolean))if(!parsed.ids.has(id))unresolved.add(id);const id=fragment(n.attributes['xlink:href']||'');if(id && !parsed.ids.has(id))unresolved.add(id);}
    const changes=affiliations.map((n,i)=>{
        const labels=within(n).filter(child=>child.name==='ce:label');
        if(labels.length>1)throw new Error('An affiliation contains multiple labels. Review it before sequencing.');
        const label=labels[0],newId=formatAffiliationId(i+1),newLabel=getAlphabetLabel(i);
        if(parsed.ids.has(newId) && !affIds.has(newId))throw new Error(`ID ${newId} belongs to another element. No changes applied.`);
        if(unresolved.has(newId))throw new Error(`ID ${newId} would capture an existing unresolved target. Resolve it first.`);
        if(n.openEnd===n.end)throw new Error('Empty self-closing affiliation requires review.');
        const originalLabel=label?parsed.textContent(label):'';
        if(label && within(label).length)throw new Error('Formatted affiliation label requires review before sequencing.');
        const r=n.attributeRanges.id;
        if(r)edits.push({start:r.valueStart,end:r.valueEnd,value:newId});else edits.push({start:n.openEnd-1,end:n.openEnd-1,value:` id="${newId}"`});
        if(label){
            if(label.openEnd===label.end)edits.push({start:label.start,end:label.end,value:xml.slice(label.start,label.openEnd).replace(/\/\s*>$/, '>')+newLabel+'</ce:label>'});
            else if(/<!--|<\?/.test(xml.slice(label.openEnd,label.closeStart)))throw new Error('Affiliation label contains comments or instructions; review before sequencing.');
            else edits.push({start:label.openEnd,end:label.closeStart,value:newLabel});
        }else edits.push({start:n.openEnd,end:n.openEnd,value:`<ce:label>${newLabel}</ce:label>`});
        return {node:n,index:i+1,originalId:n.attributes.id||'(none)',newId,originalLabel,newLabel,affiliationId:n.attributes['affiliation-id'],text:within(n).filter(child=>child.name==='ce:textfn').map(child=>parsed.textContent(child)).join(' '),isChanged:n.attributes.id!==newId || originalLabel!==newLabel};
    });
    const map=new Map(changes.filter(c=>c.originalId!=='(none)').map(c=>[c.originalId,c]));
    const linkChanges:Array<{node:ReferenceXmlNode;oldRefId:string;newRefId:string;label:string;originalLabel:string;requiresReview:boolean;isChanged:boolean;crossRefId?:string}>=[];
    const referenced=new Set<string>();
    for(const n of parsed.nodes){
        const old=n.attributes.refid;
        if(old){
            const tokens=old.split(/\s+/).filter(Boolean);
            if(tokens.some(t=>t.includes(',') && [...map.keys()].some(id=>t.split(',').includes(id))))throw new Error('Comma-separated refid targets require review; XML target lists must use whitespace.');
            const author=parsed.nodes.find(a=>a.name==='ce:author' && n.start>=a.openEnd && n.end<=a.closeStart);
            if(n.name==='ce:cross-ref' && tokens.length>1)throw new Error('ce:cross-ref requires a single refid target. Use separate author citation elements.');
            if(author && n.name==='ce:cross-refs')throw new Error('ce:cross-refs is not permitted inside ce:author. Use separate ce:cross-ref elements.');
            const owned=tokens.map(id=>map.get(id)).filter((c):c is typeof changes[number]=>!!c);
            const value=old.split(/(\s+)/).map(id=>map.get(id)?.newId||id).join('');
            if(value!==old){const r=n.attributeRanges.refid;edits.push({start:r.valueStart,end:r.valueEnd,value:escape(value)});}
            if(owned.length){

                if(author)owned.forEach(c=>referenced.add(c.originalId));
                const reviewCount=notices.length;
                const children=within(n);
                const originalLabel=parsed.textContent(n);
                let label=originalLabel,labelChanged=false;
                const labels=new Map<string,string>();
                for(const c of owned){if(c.originalLabel){if(labels.has(c.originalLabel) && labels.get(c.originalLabel)!==c.newLabel)throw new Error('Duplicate affiliation labels make the linked label ambiguous.');labels.set(c.originalLabel,c.newLabel);}}
                const raw=xml.slice(n.openEnd,n.closeStart);
                const textSegments=(content:string)=>[...content.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|([^<]+)/g)].flatMap(match=>match[1]!==undefined?[match[1]]:match[2]!==undefined?[parsed.textValue(match[2])]:[]);
                const labelTokens=textSegments(raw).flatMap(text=>text.match(/[A-Za-z]+|\d+/g)||[]).filter(token=>token!=='and');
                const simple=children.every(child=>child.name==='ce:sup' && !within(child).length);
                const proven=labelTokens.length>0 && labelTokens.every(token=>labels.has(token)) && owned.every(c=>!!c.originalLabel && labelTokens.includes(c.originalLabel)) && owned.length===tokens.length;
                if(!simple){
                    notices.push(`Formatted citation label for ${old} preserved for review.`);
                }else if(!proven){
                    notices.push(`Citation label "${label}" disagrees with the existing target ${old}; preserved visible text and retained target ownership. Review unmatched or missing labels.`);
                }else{

                    const rewrite=(text:string)=>text.replace(/[A-Za-z]+|\d+/g,token=>labels.get(token)||token);
                    const updated=raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|([^<]+)/g,(all,cdata:string|undefined,plain:string|undefined)=>{
                        if(cdata!==undefined)return '<![CDATA['+rewrite(cdata)+']]>';
                        if(plain===undefined)return all;
                        const decoded=parsed.textValue(plain),value=rewrite(decoded);
                        const encodedLabel=/&/.test(plain) && (decoded.match(/[A-Za-z]+|\d+/g)||[]).some(token=>labels.has(token));
                        return value===decoded && !encodedLabel?plain:escape(value);
                    });
                    if(updated!==raw)edits.push({start:n.openEnd,end:n.closeStart,value:updated});
                    labelChanged=updated!==raw;
                    label=textSegments(updated).join('');
                }
                linkChanges.push({node:n,oldRefId:old,newRefId:value,label,originalLabel,requiresReview:notices.length>reviewCount,isChanged:old!==value || labelChanged,crossRefId:n.attributes.id});
            }
        }
        const href=n.attributes['xlink:href'],mapped=href?map.get(fragment(href)):undefined;
        if(mapped){const r=n.attributeRanges['xlink:href'];edits.push({start:r.valueStart,end:r.valueEnd,value:'#'+mapped.newId});}
    }
    let outputXml=xml;for(const e of edits.sort((a,b)=>b.start-a.start))outputXml=outputXml.slice(0,e.start)+e.value+outputXml.slice(e.end);
    const after=scanReferenceXml(outputXml);
    for(const n of after.nodes){for(const id of (n.attributes.refid||'').split(/\s+/).filter(Boolean))if(parsed.ids.has(id) && !after.ids.has(id))throw new Error(`Output would break target ${id}.`);const id=fragment(n.attributes['xlink:href']||'');if(parsed.ids.has(id)&&!after.ids.has(id))throw new Error(`Output would break local URI target ${id}.`);}
    const authors=parsed.nodes.filter(n=>n.name==='ce:author').map((n,i)=>{
        const children=within(n),given=children.find(c=>c.name==='ce:given-name'),surname=children.find(c=>c.name==='ce:surname');
        const links=linkChanges.filter(c=>c.node.start>=n.openEnd && c.node.end<=n.closeStart).map(({node,...c})=>c);
        return {authorIndex:i+1,authorName:[given?parsed.textContent(given):'',surname?parsed.textContent(surname):''].filter(Boolean).join(' ')||'(unnamed author)',authorId:n.attributes.id,links,isRemapped:links.some(c=>c.isChanged)};
    });
    const unlinkedAffiliations=changes.filter(c=>!referenced.has(c.originalId)).map(c=>c.newId);
    const groups=new Map<string,string[]>();for(const c of changes){const text=within(c.node).filter(n=>n.name==='ce:textfn').map(n=>parsed.textContent(n)).join(' ').trim().replace(/\s+/g,' ').toLowerCase();if(text){const group=groups.get(text)||[];group.push(c.newId);groups.set(text,group);}}
    return {outputXml,changes:changes.map(({node,...c})=>c),authors,linkChanges:linkChanges.map(({node,...c})=>c),notices,unlinkedAffiliations,redundantAffiliationGroups:[...groups.values()].filter(g=>g.length>1)};
}
