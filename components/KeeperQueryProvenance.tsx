import React,{useEffect,useMemo,useState} from 'react';
import type {KeeperEvidence} from '../utils/keeperEvidenceCore';
import {keeperQueryProvenance} from '../utils/keeperQueryProvenance';
import {keeperEvidenceTextSlice} from '../utils/keeperAnswerEvidence';

export default function KeeperQueryProvenance({evidence}:{evidence:KeeperEvidence}){
  const rows=useMemo(()=>keeperQueryProvenance(evidence),[evidence]);
  const [page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null),[offset,setOffset]=useState(0);
  const [field,setField]=useState<'query'|'pdf-query'|'response'>('query');
  useEffect(()=>{setPage(0);setSelected(null);setOffset(0);setField('query');},[evidence]);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/20)-1));
  const visible=rows.slice(currentPage*20,currentPage*20+20);
  const item=rows.find(row=>row.query.id===selected);
  const text=item?(field==='query'?item.query.text:field==='pdf-query'?item.pdfRecord?.text||'':item.response||''):'';
  const start=Math.min(offset,text.length),slice=keeperEvidenceTextSlice(text,start);
  if(!rows.length)return null;
  return <details className="rounded-xl border border-indigo-200 bg-white p-5" aria-label="Query response provenance">
    <summary className="cursor-pointer font-semibold text-sm">Query-response provenance · {rows.length} XML queries</summary>
    <p className="my-3 text-xs text-slate-600">Local inspection results, independent of Keeper’s AI reply. A matched author answer does not verify that the edit was made. Unmatched PDF answers are never assigned by proximity. Excerpts below show up to 500 characters; open a record for its full retained text.</p>
    {evidence.files.some(file=>file.inspectionStatus!=='ready'||file.diagnostics.length>0)&&<p className="text-xs text-amber-800 mb-3">Inspection has limitations. This list covers extracted queries only; it does not establish full-document coverage.</p>}
    <p className="text-xs mb-2">Showing {currentPage*20+1}–{Math.min(currentPage*20+20,rows.length)} of {rows.length} extracted XML queries.</p>
    <div className="overflow-x-auto"><table className="w-full text-xs text-left"><caption className="sr-only">XML query and matched PDF author response</caption><thead><tr><th scope="col" className="p-2">XML query</th><th scope="col" className="p-2">Matched PDF response</th><th scope="col" className="p-2">Association and editorial status</th></tr></thead><tbody>{visible.map(row=><tr key={row.query.id} className="border-t border-slate-100">
      <td className="p-2 align-top min-w-52"><strong>{row.query.queryId||'Query without ID'}{row.query.commented?' · commented XML query':''}</strong><p>{row.xml?.name||row.query.artifactId} · line {row.query.line??'unknown'}{row.query.offset!==undefined?` · character ${row.query.offset+1}`:''}</p><p className="my-2 whitespace-pre-wrap break-words">{row.query.text.slice(0,500)}{row.query.text.length>500?'…':''}</p><button className="text-indigo-700 underline" onClick={()=>{setSelected(row.query.id);setField('query');setOffset(0);}} aria-label={`Open query provenance ${row.query.id}`}>Open full record</button></td>
      <td className="p-2 align-top min-w-52">{row.authorAnswered?<><p>{row.pdf!.name} · page {row.pdfRecord!.page??'unknown'}</p><p className="my-2 whitespace-pre-wrap break-words">{row.response!.slice(0,500)}{row.response!.length>500?'…':''}</p></>:<p>No verified response assigned.</p>}</td>
      <td className="p-2 align-top min-w-52"><p>Match: {row.matchStatus}</p><p className="my-2">{row.reason}</p><p>Author answered: {row.authorAnswered?'Matched response available':'Not established'}</p><p>Edit verified: Not verified by this tool.</p></td>
    </tr>)}</tbody></table></div>
    <div className="flex items-center gap-4 mt-3 text-xs"><button className="underline disabled:opacity-40" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous queries</button><button className="underline disabled:opacity-40" disabled={(currentPage+1)*20>=rows.length} onClick={()=>setPage(currentPage+1)}>Next queries</button></div>
    {item&&<section aria-label="Query provenance record" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
      <h4 className="font-semibold">{item.query.queryId||item.query.id} · Full retained evidence</h4>
      <p className="break-all">XML: {item.xml?.name||item.query.artifactId} · SHA-256: {item.xml?.sha256||'unavailable'} · record {item.query.id}</p>
      {item.authorAnswered&&<p className="break-all">PDF: {item.pdf!.name} · page {item.pdfRecord!.page??'unknown'} · SHA-256: {item.pdf!.sha256} · record {item.pdfRecord!.id}</p>}
      <div className="flex flex-wrap gap-3">{(['query',...(item.authorAnswered?['pdf-query','response']:[])] as ('query'|'pdf-query'|'response')[]).map(tab=><button key={tab} className="border rounded px-2 py-1" aria-pressed={field===tab} onClick={()=>{setField(tab);setOffset(0);}}>{tab==='query'?'XML question':tab==='pdf-query'?'PDF question':'Author response'}</button>)}</div>
      <p>Characters {slice.total?start+1:0}–{Math.min(start+5000,slice.total)} of {slice.total}.</p><pre className="whitespace-pre-wrap break-words max-h-72 overflow-auto">{slice.text||'No retained text for this field.'}</pre>
      <div className="flex gap-3">{start>0&&<button className="underline" onClick={()=>setOffset(Math.max(0,start-5000))}>Previous evidence text</button>}{slice.next!==null&&<button className="underline" onClick={()=>setOffset(slice.next!)}>Next evidence text</button>}</div>
      <p>Viewing local evidence does not add to Keeper’s retrieval coverage. Author response matching does not verify an edit or perform DTD/VTOOL validation.</p>
    </section>}
  </details>;
}
