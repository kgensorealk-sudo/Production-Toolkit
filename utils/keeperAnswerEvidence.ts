import type {KeeperEvidence} from './keeperEvidenceCore.js';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {gfm} from 'micromark-extension-gfm';

export interface KeeperFindingCoverage {
  contract:'keeper-finding-coverage-v1';
  units:{id:string;kind:'paragraph'|'table-row';text:string;references:string[];status:'citation-present'|'uncited'}[];
}
type MarkdownNode={type:string;value?:string;url?:string;children?:MarkdownNode[];position?:{start:{offset?:number};end:{offset?:number}}};
const parseAnswer=(text:string)=>fromMarkdown(text,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]});

export interface KeeperAnswerEvidence {
  contract:'keeper-answer-evidence-v1';
  sources:{id:string;sha256:string}[];
  inspection:{files:number;completeFiles:number;failedFiles:number;limitedFiles:number;inventoryRecords:number;complete:boolean};
  retrieval:{records:number;fullyRetrieved:number;scopeRecords:number;xmlExcerptReads:number;inventoryCountsRead:boolean};
  answer:{kind:'interpretation'|'counts'|'scope'|'unavailable';linkedRecords:number};
  references:{ref:string;recordId:string;artifactId:string;complete:boolean;cited:boolean}[];
  findingCoverage?:KeeperFindingCoverage;
}
export const keeperEvidenceRef=(evidence:KeeperEvidence,id:string)=>{
  const index=evidence.records.findIndex(r=>r.id===id);
  return index<0?null:`E${index+1}`;
};
export function linkKeeperEvidenceCitations(text:string,evidence:KeeperEvidence,retrieved:ReadonlySet<string>){
  const cited=new Set<string>();
  const edits:{start:number;end:number;replacement:string}[]=[];
  const cite=(ref:string,start:number,end:number)=>{
    const record=evidence.records[Number(ref.slice(1))-1];
    if(!record||keeperEvidenceRef(evidence,record.id)!==ref||!retrieved.has(record.id))throw Error('Answer cited evidence that was not retrieved.');
    cited.add(ref);edits.push({start,end,replacement:`[${ref}](#keeper-evidence-${ref})`});
  };
  const walk=(node:MarkdownNode)=>{
    const start=node.position?.start.offset,end=node.position?.end.offset;
    // These nodes render as code, images, or non-citation links in the sandbox.
    if(['code','inlineCode','image','imageReference','linkReference','definition'].includes(node.type))return;
    if(node.type==='link'){
      const label=node.children?.length===1&&node.children[0].type==='text'?node.children[0].value:undefined;
      if(label&&/^E\d+$/.test(label)){
        if(node.url!==`#keeper-evidence-${label}`)throw Error('Invalid evidence citation link.');
        if(start!==undefined&&end!==undefined)cite(label,start,end);
      }
      return;
    }
    if(node.type==='text'&&start!==undefined&&end!==undefined){
      const raw=text.slice(start,end);
      for(const match of raw.matchAll(/\[(E\d+)\]/g)){
        let escapes=0;for(let i=match.index!-1;i>=0&&raw[i]==='\\';i--)escapes++;
        if(escapes%2===0)cite(match[1],start+match.index!,start+match.index!+match[0].length);
      }
    }
    for(const child of node.children||[])walk(child);
  };
  walk(parseAnswer(text));
  let linked=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start))linked=linked.slice(0,edit.start)+edit.replacement+linked.slice(edit.end);
  return {text:linked,cited,findingCoverage:keeperFindingCoverage(linked,cited)};
}
// Citation presence is a syntactic check, never a semantic support verdict.
export function keeperFindingCoverage(text:string,validatedReferences:ReadonlySet<string>):KeeperFindingCoverage{
  const units:KeeperFindingCoverage['units']=[];
  const plain=(node:MarkdownNode):string=>node.value??(node.children||[]).map(plain).join(node.type==='tableRow'?' | ':'');
  const refs=(node:MarkdownNode,found:Set<string>)=>{
    if(node.type==='link'){
      const ref=node.url?.match(/^#keeper-evidence-(E[1-9]\d*)$/)?.[1];
      if(ref&&validatedReferences.has(ref)&&node.children?.length===1&&node.children[0].value===ref)found.add(ref);
      return;
    }
    if(['inlineCode','code','image','imageReference','html'].includes(node.type))return;
    for(const child of node.children||[])refs(child,found);
  };
  const visit=(node:MarkdownNode)=>{
    if(['code','heading','definition','html','footnoteDefinition'].includes(node.type))return;
    if(node.type==='table'){for(const row of (node.children||[]).slice(1))visit(row);return;}
    if(node.type==='paragraph'||node.type==='tableRow'){
      const value=plain(node).trim();if(!value)return;
      const found=new Set<string>();refs(node,found);
      units.push({id:`F${units.length+1}`,kind:node.type==='tableRow'?'table-row':'paragraph',text:value.slice(0,1200),references:[...found],status:found.size?'citation-present':'uncited'});
      return;
    }
    for(const child of node.children||[])visit(child);
  };
  visit(parseAnswer(text));return {contract:'keeper-finding-coverage-v1',units};
}
export function buildKeeperAnswerEvidence(evidence:KeeperEvidence,options:{retrieved?:ReadonlySet<string>;fullyRetrieved?:ReadonlySet<string>;cited?:ReadonlySet<string>;scopeRecords?:number;xmlExcerptReads?:number;inventoryCountsRead?:boolean;kind?:KeeperAnswerEvidence['answer']['kind']}={}):KeeperAnswerEvidence{
  const retrieved=options.retrieved||new Set<string>(),full=options.fullyRetrieved||new Set<string>();
  const failedFiles=evidence.files.filter(f=>f.inspectionStatus==='failed').length;
  const limitedFiles=evidence.files.filter(f=>f.inspectionStatus!=='failed'&&(f.inspectionStatus!=='ready'||f.diagnostics.length>0)).length;
  const completeFiles=evidence.files.length-failedFiles-limitedFiles;
  const references=evidence.records.flatMap((r,i)=>retrieved.has(r.id)?[{ref:`E${i+1}`,recordId:r.id,artifactId:r.artifactId,complete:full.has(r.id),cited:options.cited?.has(`E${i+1}`)||false}]:[]);
  return {contract:'keeper-answer-evidence-v1',sources:evidence.files.map(f=>({id:f.id,sha256:f.sha256})),inspection:{files:evidence.files.length,completeFiles,failedFiles,limitedFiles,inventoryRecords:evidence.records.length,complete:evidence.files.length>0&&!failedFiles&&!limitedFiles},retrieval:{records:references.length,fullyRetrieved:references.filter(r=>r.complete).length,scopeRecords:options.scopeRecords??evidence.records.length,xmlExcerptReads:options.xmlExcerptReads||0,inventoryCountsRead:!!options.inventoryCountsRead},answer:{kind:options.kind||'interpretation',linkedRecords:references.filter(r=>r.cited).length},references};
}
export function keeperAnswerSourcesMatch(answer:KeeperAnswerEvidence,evidence:KeeperEvidence|null){
  return !!evidence&&answer.contract==='keeper-answer-evidence-v1'&&answer.sources.length===evidence.files.length&&answer.sources.every(s=>!!s.sha256&&evidence.files.some(f=>f.id===s.id&&f.sha256===s.sha256));
}
export function resolveKeeperAnswerReference(answer:KeeperAnswerEvidence,evidence:KeeperEvidence|null,ref:string){
  if(!keeperAnswerSourcesMatch(answer,evidence))return null;
  const reference=answer.references.find(r=>r.ref===ref);
  if(!reference)return null;
  const record=evidence!.records.find(r=>r.id===reference.recordId&&r.artifactId===reference.artifactId);
  const file=evidence!.files.find(f=>f.id===reference.artifactId);
  return record&&file?{reference,record,file}:null;
}
export function keeperEvidenceTextSlice(value:string,offset:number){
  if(!Number.isSafeInteger(offset)||offset<0||offset>value.length)throw Error('Invalid evidence text offset.');
  return {text:value.slice(offset,offset+5000),next:offset+5000<value.length?offset+5000:null,total:value.length};
}
