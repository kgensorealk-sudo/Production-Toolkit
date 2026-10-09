import React from 'react';
import type {KeeperActivity} from '../utils/keeperActivity';
const seconds=(ms:number|undefined)=>ms===undefined?'—':`${(ms/1000).toFixed(2)} s`;
export default function KeeperActivityReport({activity}:{activity:KeeperActivity}){
 const tools=activity.events?.filter(e=>e.kind==='tool')||[];
 return <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Keeper activity · {seconds(activity.clientElapsedMs??activity.serverElapsedMs)} · {tools.length} tool calls</summary>
 <p className="mt-3 text-xs text-slate-600">Local evidence preparation: {seconds(activity.localInspectionMs)} · API request: {seconds(activity.requestMs)} · Server processing: {seconds(activity.serverElapsedMs)}. API time includes network and server time; these figures overlap.</p>
 <div className="overflow-x-auto mt-3"><table className="w-full text-left text-xs"><caption className="text-left font-semibold mb-2">Model attempts</caption><thead><tr><th scope="col">Model</th><th scope="col">Outcome</th><th scope="col">Reason</th><th scope="col">Elapsed</th></tr></thead><tbody>{activity.attempts?.map((a,i)=><tr key={i}><td className="py-1">{a.provider} / {a.model}</td><td>{a.outcome}</td><td>{a.failure?.replaceAll('_',' ')||'—'}</td><td>{seconds(a.elapsedMs)}</td></tr>)}</tbody></table></div>
 {tools.length?<div className="overflow-x-auto mt-3"><table className="w-full text-left text-xs"><caption className="text-left font-semibold mb-2">Requested tools</caption><thead><tr><th scope="col">Tool</th><th scope="col">Outcome</th><th scope="col">Returned records</th><th scope="col">Elapsed</th></tr></thead><tbody>{tools.map((t,i)=><tr key={i}><td className="py-1">{t.name}</td><td>{t.outcome}</td><td>{t.records??'—'}</td><td>{seconds(t.elapsedMs)}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-slate-500">Returned records may include repeated reads. A count or scope tool may return no records; that does not indicate a failed call.</p></div>:<p className="mt-3 text-xs text-slate-500">No tool calls were recorded for this reply.</p>}
 <p className="mt-2 text-xs text-slate-500">Model rounds: {activity.events?.filter(e=>e.kind==='model_round').length||0}. Answers appear immediately after receipt.</p>
 </details>;
}
