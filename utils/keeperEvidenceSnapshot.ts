import type {KeeperEvidence} from './keeperEvidenceCore.js';

// Browser-generated evidence is untrusted input, never a server-verified inspection.
// Copy allowlisted fields only; source ZIP/XML/PDF bytes are not accepted here.
export function validateKeeperEvidenceSnapshot(input:unknown):KeeperEvidence|null {
  if(input===undefined)return null;
  const fail=():never=>{throw new Error('Invalid local evidence snapshot.');};
  const object=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v)?v:fail();
  const str=(v:any,max=200000):string=>typeof v==='string'&&v.length<=max?v:fail();
  const list=(v:any,max:number):any[]=>Array.isArray(v)&&v.length<=max?v:fail();
  const strings=(v:any,max=1000)=>list(v,max).map(x=>str(x,10000));
  const optional=(v:any)=>v===undefined?undefined:str(v);
  const position=(v:any)=>v===undefined?undefined:Number.isSafeInteger(v)&&v>=0?v:fail();
  const root=object(input),ids=new Set<string>(),recordIds=new Set<string>();
  const files=list(root.files,4).map(value=>{
    const f=object(value),id=str(f.id,80);
    if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id)||!['xml','pdf'].includes(f.kind)||!['ready','failed'].includes(f.inspectionStatus))fail();
    ids.add(id);
    return {id,name:str(f.name,200),kind:f.kind,sha256:str(f.sha256,64),inspectionStatus:f.inspectionStatus,diagnostics:strings(f.diagnostics),articleDoi:f.articleDoi==null?null:str(f.articleDoi,1000),articleDois:f.articleDois===undefined?undefined:strings(f.articleDois,100)};
  });
  const records=list(root.records,20000).map(value=>{
    const r=object(value),id=str(r.id,200),artifactId=str(r.artifactId,80);
    if(!/^(?:query|pdf_query|opt_[a-z0-9_.:-]+)$/.test(r.kind)||recordIds.has(id)||!ids.has(artifactId))fail();recordIds.add(id);
    const diagnostics=list(r.diagnostics,1000).map(value=>{const d=object(value);if(!['error','warning'].includes(d.severity))fail();return {severity:d.severity as 'error'|'warning',message:str(d.message,10000)};});
    const binding=r.binding===undefined?undefined:(()=>{const b=object(r.binding);if(!['established','unresolved','ambiguous','conflicting'].includes(b.state))fail();return {state:b.state,reason:str(b.reason),response:optional(b.response),pdfRecordId:optional(b.pdfRecordId)};})();
    return {id,artifactId,kind:str(r.kind,100),source:str(r.source),text:str(r.text),diagnostics,offset:position(r.offset),line:position(r.line),page:position(r.page),queryId:optional(r.queryId),qid:optional(r.qid),context:optional(r.context),commented:r.commented===true,binding};
  });
  for(const r of records)if(r.binding?.pdfRecordId&&!recordIds.has(r.binding.pdfRecordId))fail();
  return {files,records};
}
