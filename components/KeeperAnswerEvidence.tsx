import React,{useEffect,useRef,useState} from 'react';
import type {KeeperEvidence} from '../utils/keeperEvidenceCore';
import {keeperAnswerSourcesMatch,resolveKeeperAnswerReference,keeperEvidenceTextSlice,type KeeperAnswerEvidence} from '../utils/keeperAnswerEvidence';

export default function KeeperAnswerEvidencePanel({answer,evidence,selectedRef,onSelect}:{answer:KeeperAnswerEvidence;evidence:KeeperEvidence|null;selectedRef:string|null;onSelect:(ref:string)=>void}){
  const [offset,setOffset]=useState(0);
  const [field,setField]=useState<'text'|'source'|'context'|'response'>('text');
  const viewer=useRef<HTMLDivElement>(null);
  useEffect(()=>{setOffset(0);setField('text');if(selectedRef)viewer.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[selectedRef,answer]);
  const current=keeperAnswerSourcesMatch(answer,evidence);
  const resolved=selectedRef?resolveKeeperAnswerReference(answer,evidence,selectedRef):null;
  const value=resolved?(field==='response'?(resolved.record.binding?.state==='established'?resolved.record.binding.response||'':''):field==='source'?resolved.record.source:field==='context'?resolved.record.context||'':resolved.record.text):'';
  const slice=keeperEvidenceTextSlice(value,Math.min(offset,value.length));
  const responseRecord=resolved?.record.binding?.pdfRecordId?evidence?.records.find(r=>r.id===resolved.record.binding!.pdfRecordId):undefined;
  const responseFile=responseRecord?evidence?.files.find(f=>f.id===responseRecord.artifactId):undefined;
  return <section aria-label="Answer evidence and coverage" className="rounded-xl border border-indigo-200 bg-white p-5 space-y-3">
    <h3 className="font-semibold text-slate-800">Answer evidence and coverage</h3>
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="font-semibold">Tool inspection</dt><dd>{answer.inspection.inventoryRecords} inventory records · {answer.inspection.completeFiles}/{answer.inspection.files} files inspected without limitations</dd><dd>{answer.inspection.failedFiles} failed · {answer.inspection.limitedFiles} limited</dd></div>
      <div><dt className="font-semibold">Retrieved for this answer</dt><dd>{answer.retrieval.records}/{answer.retrieval.scopeRecords} records touched · {answer.retrieval.fullyRetrieved} fully retrieved</dd><dd>{answer.retrieval.inventoryCountsRead?'Full inventory count tool used.':'Count tool not used.'} {answer.retrieval.xmlExcerptReads} XML excerpt reads.</dd></div>
      <div><dt className="font-semibold">Evidence links in answer</dt><dd>{answer.answer.linkedRecords} distinct records linked</dd><dd>Links identify retrieved evidence; they do not verify every claim or confirm an edit.</dd></div>
    </dl>
    {!answer.inspection.complete&&<p className="text-sm text-amber-800">Inspection is incomplete or unavailable. Coverage applies only to extracted records; zero findings do not establish absence.</p>}
    {!current&&<p role="status" className="text-sm text-amber-800">Supporting sources are unavailable, changed, or still being inspected. Saved references cannot open until the original source hashes match.</p>}
    {answer.answer.kind==='unavailable'&&<p className="text-sm text-amber-800">No AI interpretation was produced. Retrieval coverage describes the last model attempt only; retrieved records are not a completed answer.</p>}
    {answer.answer.kind==='counts'?<p className="text-xs text-slate-600">This is a deterministic inventory count, not an AI interpretation or a record-by-record review.</p>:answer.answer.kind==='interpretation'&&answer.answer.linkedRecords===0?<p className="text-xs text-amber-800">Keeper supplied no inline evidence links. The records below show retrieval only; they are not verified claim-to-evidence mappings.</p>:null}
    {answer.answer.kind==='interpretation'&&(answer.findingCoverage?<details open className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Finding evidence coverage · {answer.findingCoverage.units.filter(unit=>unit.status==='uncited').length} uncited of {answer.findingCoverage.units.length} answer blocks</summary>
      <p className="my-2 text-xs text-slate-600">Each paragraph, list paragraph, or table row is checked separately. Citation present means a retrieved record is linked within that block; it does not prove every statement. Introductions, limitations, and suggestions can also appear as uncited. Headings and code blocks are excluded. Excerpts show up to 1,200 characters; the check uses the full block.</p>
      <div className="max-h-80 overflow-auto"><table className="w-full text-xs text-left"><caption className="sr-only">Citation presence per answer block</caption><thead><tr><th scope="col" className="p-2">Finding</th><th scope="col" className="p-2">Answer excerpt</th><th scope="col" className="p-2">Evidence status</th></tr></thead><tbody>{answer.findingCoverage.units.map(unit=><tr key={unit.id} className="border-t border-slate-100"><th scope="row" className="p-2 align-top">{unit.id}</th><td className="p-2 align-top whitespace-pre-wrap break-words">{unit.text}</td><td className="p-2 align-top">{unit.status==='uncited'?<span className="text-amber-800">Uncited · supporting evidence not linked</span>:<><span>Citation present · </span>{unit.references.map(ref=><button key={ref} className="text-indigo-700 underline mr-2" disabled={!current} onClick={()=>onSelect(ref)} aria-label={`Open ${unit.id} evidence ${ref}`}>{ref}</button>)}</>}</td></tr>)}</tbody></table></div>
    </details>:<p className="text-xs text-slate-600">Finding-level citation coverage was not recorded for this saved answer.</p>)}
    <details><summary className="cursor-pointer text-sm font-medium">Retrieved evidence · {answer.references.length} records</summary>
      <ul className="mt-2 space-y-2 text-xs">{answer.references.map(reference=>{
        const item=current?resolveKeeperAnswerReference(answer,evidence,reference.ref):null;
        return <li key={reference.ref}><button disabled={!item} onClick={()=>onSelect(reference.ref)} className="text-indigo-700 underline disabled:text-slate-400">{reference.ref} · {item?.file.name||reference.artifactId} · {item?.record.queryId||item?.record.kind||reference.recordId}{item?.record.page!==undefined?` · page ${item.record.page}`:item?.record.line!==undefined?` · line ${item.record.line}`:''}</button> · {reference.complete?'fully retrieved':'partial retrieval'} · {reference.cited?'linked in answer':'retrieved only'}</li>;
      })}</ul>
    </details>
    {selectedRef&&<div ref={viewer} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2" aria-label="Evidence record viewer">
      {resolved?<>
        <h4 className="font-semibold text-sm">{selectedRef} · {resolved.file.name} · {resolved.record.queryId||resolved.record.kind}</h4>
        <p className="text-xs">{resolved.record.page!==undefined?`Page ${resolved.record.page}`:resolved.record.line!==undefined?`Line ${resolved.record.line}`:'Location unavailable'}{resolved.record.offset!==undefined?` · character ${resolved.record.offset+1}`:''} · {resolved.reference.complete?'Fully retrieved for the answer':'Only partly retrieved for the answer'}</p>
        <p className="text-xs break-all">Source SHA-256: {resolved.file.sha256}</p>
        <p className="text-xs break-all">Record: {resolved.record.id}</p>
        {resolved.record.binding&&<p className="text-xs">Author response association: {resolved.record.binding.state}. {resolved.record.binding.reason}{responseFile?` Source: ${responseFile.name}${responseRecord?.page!==undefined?`, page ${responseRecord.page}`:''}.`:''} Association does not confirm implementation.</p>}
        <div className="flex flex-wrap gap-2">{(['text','source','context','response'] as const).filter(tab=>(tab!=='response'||resolved.record.binding?.state==='established')&&(tab!=='context'||!!resolved.record.context)).map(tab=><button key={tab} aria-pressed={field===tab} className="rounded border px-2 py-1 text-xs" onClick={()=>{setField(tab);setOffset(0);}}>{tab==='text'?'Extracted text':tab==='source'?(resolved.file.kind==='xml'?'Exact XML source':'Retained PDF text'):tab==='context'?'Local context':'Associated author response'}</button>)}</div>
        {field==='context'&&<p className="text-xs text-slate-600">Surrounding text retained locally. Keeper’s tool context excerpt is limited to 1,500 characters; this viewer may show more.</p>}
        <p className="text-xs">Characters {slice.total?Math.min(offset,slice.total)+1:0}–{Math.min(offset+5000,slice.total)} of {slice.total}. This viewer does not add to Keeper’s retrieval coverage.</p>
        <pre className="whitespace-pre-wrap break-words text-xs max-h-80 overflow-auto">{slice.text||'No text available for this field.'}</pre>
        <div className="flex gap-3 text-xs">{offset>0&&<button className="underline" onClick={()=>setOffset(Math.max(0,offset-5000))}>Previous text</button>}{slice.next!==null&&<button className="underline" onClick={()=>setOffset(slice.next!)}>Next text</button>}</div>
        <p className="text-xs text-slate-500">Source evidence only. Keeper’s interpretation and suggested response remain in the answer above. No XML changes or DTD/VTOOL validation have been performed.</p>
      </>:<p role="status" className="text-sm text-amber-800">This evidence reference cannot be resolved against the current sources.</p>}
    </div>}
  </section>;
}
