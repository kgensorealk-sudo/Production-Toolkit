import React,{useEffect,useRef,useState} from 'react';
import {localTaskRecords,removeKeeperLocalTask} from '../utils/keeperLocalStore';
import {inspectKeeperLocally} from '../utils/keeperLocalInspection';
import type {KeeperArtifact} from '../utils/keeperEvidenceCore';
import {resumeKeeperTaskQueue} from '../utils/keeperLocalRecovery';
import {keeperRetainSourceIds} from '../utils/keeperConversationScope';
type LocalTask={id:string;name:string;zip:Blob;hash:string;status:string;issues:string[];artifacts:KeeperArtifact[];evidence?:unknown};
export default function KeeperLocalTasks({owner,onSelect,onBeforeRemove,disabled=false}:{owner?:string;onSelect:(task:string,artifacts:KeeperArtifact[])=>void;onBeforeRemove:(task:string)=>Promise<boolean>;disabled?:boolean}){
  const [tasks,setTasks]=useState<LocalTask[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [removing,setRemoving]=useState<string|null>(null);
  const generation=useRef(0),workers=useRef<Set<Worker>>(new Set());
  useEffect(()=>{
    const version=++generation.current;setTasks([]);setNotice('');setBusy(false);
    if(owner)void localTaskRecords(owner).then(async rows=>{
      if(version!==generation.current)return;setTasks(rows);
      const pending=rows.filter(task=>task.status==='Preparation pending');
      if(pending.length)setBusy(true);
      try{await resumeKeeperTaskQueue(pending,task=>prepare(task,version,owner),async(task,error)=>{
        const rows=await localTaskRecords(owner,{...task,status:'Needs attention',issues:[error instanceof Error?error.message:'Local preparation failed.']});
        if(version===generation.current)setTasks(rows);
      },()=>version!==generation.current);}
      catch{if(version===generation.current)setNotice('Interrupted preparation could not resume. Retry the task below.');}
      finally{if(version===generation.current)setBusy(false);}
    }).catch(()=>{if(version===generation.current)setNotice('Local tasks could not be restored.');});
    return()=>{generation.current++;for(const worker of workers.current)worker.terminate();workers.current.clear();};
  },[owner]);
  async function prepare(task:LocalTask,version:number,account:string){
    const result:any=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('../utils/keeperZip.worker.ts',import.meta.url),{type:'module'});workers.current.add(worker);
      const timeout=setTimeout(()=>{stop();reject(new Error('Local ZIP preparation timed out.'));},60000);
      const stop=()=>{clearTimeout(timeout);worker.terminate();workers.current.delete(worker);};
      worker.onmessage=e=>{stop();e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);};
      worker.onerror=()=>{stop();reject(new Error('Local ZIP worker failed.'));};worker.postMessage(task.zip);
    });
    if(version!==generation.current)return;
    const artifacts=keeperRetainSourceIds(task.artifacts,result.artifacts as KeeperArtifact[]);
    const evidence=artifacts.length?await inspectKeeperLocally(artifacts):null;
    if(version!==generation.current)return;
    const issues=[...result.issues];
    if(evidence?.files.some(file=>file.inspectionStatus==='failed'))issues.push('Source inspection failed or is incomplete. Open the task for diagnostics.');
    const updated={...task,artifacts,issues,status:issues.length?'Needs attention':'Ready',evidence};
    const rows=await localTaskRecords(account,updated);if(version===generation.current)setTasks(rows);
  }
  async function remove(task:LocalTask){
    if(!owner||busy||disabled)return;
    const version=generation.current,account=owner;setBusy(true);setNotice('');
    try{
      if(!await onBeforeRemove(task.id)||version!==generation.current)return;
      await removeKeeperLocalTask(account,task.id);
      const rows=await localTaskRecords(account);
      if(version===generation.current){setTasks(rows);setRemoving(null);setNotice('Task removed from this browser. Your original ZIP is unchanged.');}
    }catch(error){if(version===generation.current)setNotice(error instanceof Error?error.message:'Task removal failed.');}
    finally{if(version===generation.current)setBusy(false);}
  }
  async function upload(files:File[]){
    if(!owner||busy)return;const version=generation.current,account=owner;setBusy(true);setNotice('');
    try{
      for(const file of files){
        if(version!==generation.current)return;
        if(!/\.zip$/i.test(file.name)||file.size>25*1024*1024)throw Error('Choose ZIP files up to 25 MiB each.');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const existing=await localTaskRecords(account);if(version!==generation.current)return;
        if(existing.some(t=>t.hash===hash)){setNotice('An identical ZIP is already in your local task list.');continue;}
        const task:LocalTask={id:crypto.randomUUID(),name:file.name,zip:file,hash,status:'Preparation pending',issues:[],artifacts:[]};
        const rows=await localTaskRecords(account,task);if(version!==generation.current)return;setTasks(rows);
        try{await prepare(task,version,account);}catch(error){
          if(version!==generation.current)return;
          const rows=await localTaskRecords(account,{...task,status:'Needs attention',issues:[error instanceof Error?error.message:'Local preparation failed.']});
          if(version===generation.current)setTasks(rows);
        }
      }
    }catch(error){if(version===generation.current)setNotice(error instanceof Error?error.message:'Local import failed.');}
    finally{if(version===generation.current)setBusy(false);}
  }
  return <section aria-label="Local ZIP tasks" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Local ZIP tasks</h2><label className="text-sm text-indigo-700 cursor-pointer">{busy?'Preparing locally…':'Add ZIP tasks'}<input aria-label="Add local ZIP tasks" className="sr-only" type="file" accept=".zip" multiple disabled={!owner||busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void upload(files);}}/></label></div>
    <p className="text-xs text-slate-500">ZIP files and task storage stay on this device. When you ask Keeper, extracted evidence is sent to the application server and AI provider for interpretation. No Supabase or Google Drive upload. Keep original ZIP backups; clearing browser data removes these tasks.</p>
    {notice&&<p role="status" className="text-sm text-amber-800">{notice}</p>}
    {tasks.map(task=><div key={task.id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><span>{task.name} · {task.status}</span><button disabled={busy||disabled||!task.artifacts.length} className="text-indigo-700 disabled:opacity-40" onClick={()=>onSelect(task.id,task.artifacts)}>Open task</button></div>{task.issues.map((issue,i)=><p key={i} className="text-xs text-amber-800 mt-1">{issue}</p>)}<button className="text-xs underline mt-2" disabled={busy||disabled} onClick={()=>{if(!owner)return;const version=generation.current;setBusy(true);void prepare(task,version,owner).catch(()=>{if(version===generation.current)setNotice('Preparation failed. The original ZIP remains saved locally.');}).finally(()=>{if(version===generation.current)setBusy(false);});}}>Retry preparation</button><button className="text-xs underline ml-4" disabled={busy||disabled} aria-label={`Remove ${task.name}`} onClick={()=>setRemoving(task.id)}>Remove task</button>{removing===task.id&&<div className="mt-2 rounded border border-amber-200 p-3"><p>Remove {task.name} and its saved files, findings, and conversation from this browser?</p><button className="mt-2 text-red-700 underline" disabled={busy||disabled} onClick={()=>void remove(task)}>Remove permanently</button><button className="ml-4 underline" disabled={busy} onClick={()=>setRemoving(null)}>Cancel</button></div>}</div>)}
  </section>;
}
