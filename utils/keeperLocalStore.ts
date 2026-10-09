// Local browser storage only. Never mirror these records to telemetry or cloud storage.
function openStore():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    let blocked=false;
    const request=indexedDB.open('keeper-local-v1',2);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('workspaces'))request.result.createObjectStore('workspaces');
      if(!request.result.objectStoreNames.contains('tasks'))request.result.createObjectStore('tasks',{keyPath:['owner','id']}).createIndex('owner','owner');
    };
    request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(new Error('Local Keeper storage is unavailable.'));
    request.onblocked=()=>{blocked=true;reject(new Error('Close other Keeper tabs to upgrade local storage.'));};
  });
}
export async function localTaskRecords(owner:string,value?:any):Promise<any[]>{
  const db=await openStore();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(value?['tasks','workspaces']:['tasks'],value?'readwrite':'readonly');
    const store=tx.objectStore('tasks');
    if(value){
      const guard=tx.objectStore('workspaces').get([owner,value.id]);
      guard.onsuccess=()=>{if(!guard.result?.deleted)store.put({...value,owner});request=store.index('owner').getAll(owner);};
    }
    let request:IDBRequest<any[]>=value?null!:store.index('owner').getAll(owner);
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=()=>reject(new Error('Local task save failed. Check browser storage space.'));
    tx.onerror=()=>reject(new Error('Local task storage is unavailable.'));
  });}finally{db.close();}
}
export async function readKeeperWorkspace(owner:string):Promise<any>{
  return readKeeperTaskWorkspace(owner,'scratch');
}
export async function readKeeperTaskWorkspace(owner:string,task:string):Promise<any>{
  const db=await openStore();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('workspaces','readonly');
    const store=tx.objectStore('workspaces');
    const request=store.get([owner,task]);
    const legacy=task==='scratch'?store.get(owner):null;
    tx.oncomplete=()=>resolve(request.result?.deleted ? undefined : request.result ? {...request.result.payload,_revision:request.result.revision} : legacy?.result ? {...legacy.result,_revision:0} : undefined);
    tx.onabort=()=>reject(new Error('Could not restore the local Keeper workspace.'));
    tx.onerror=()=>reject(new Error('Could not restore the local Keeper workspace.'));
  });}finally{db.close();}
}
export class KeeperWorkspaceConflict extends Error {
  constructor(){super('Another tab saved this task. Your unsaved draft is still here. Export it before reloading the saved version.');}
}
export class KeeperWorkspaceWriter {
  private tail:Promise<void>=Promise.resolve();
  private failure:Error|null=null;
  constructor(readonly owner:string,readonly task:string,private revision=0){}
  save(value:unknown):Promise<void>{
    const operation=this.tail.then(async()=>{
      if(this.failure)throw this.failure;
      try{this.revision=await writeKeeperWorkspace(this.owner,value,this.task,this.revision);}
      catch(error){this.failure=error instanceof Error?error:new Error('Local save failed.');throw this.failure;}
    });
    this.tail=operation.catch(()=>{});
    return operation;
  }
  async flush(){await this.tail;if(this.failure)throw this.failure;}
}
export async function writeKeeperWorkspace(owner:string,value:unknown,task='scratch',expectedRevision=0):Promise<number>{
  const db=await openStore();
  try{return await new Promise<number>((resolve,reject)=>{
    const tx=db.transaction('workspaces','readwrite');
    const store=tx.objectStore('workspaces');
    const read=store.get([owner,task]);
    let conflict=false;
    read.onsuccess=()=>{
      if(read.result?.deleted||(read.result?.revision||0)!==expectedRevision){conflict=true;tx.abort();return;}
      store.put({revision:expectedRevision+1,payload:value},[owner,task]);
    };
    tx.oncomplete=()=>resolve(expectedRevision+1);
    tx.onabort=()=>reject(conflict?new KeeperWorkspaceConflict():new Error('Local save failed. Browser storage may be full; keep a copy of your source files.'));
    tx.onerror=()=>reject(new Error('Local Keeper save failed.'));
  });}finally{db.close();}
}
export async function keeperSelectedTask(owner:string,task?:string):Promise<string>{
  const db=await openStore();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('workspaces',task===undefined?'readonly':'readwrite');
    const store=tx.objectStore('workspaces');
    if(task!==undefined)store.put(task,[owner,'selection']);
    const read=store.get([owner,'selection']);
    tx.oncomplete=()=>resolve(typeof read.result==='string'?read.result:'scratch');
    tx.onabort=()=>reject(new Error('Could not restore the selected task.'));
  });}finally{db.close();}
}

// Delete all task content atomically. A content-free tombstone rejects stale writers.
export async function removeKeeperLocalTask(owner:string,task:string):Promise<void>{
  if(!owner||!task||task==='scratch'||task==='selection')throw new Error('Invalid local task.');
  const db=await openStore();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['tasks','workspaces'],'readwrite');
    tx.objectStore('tasks').delete([owner,task]);
    const workspaces=tx.objectStore('workspaces');
    workspaces.put({deleted:true},[owner,task]);
    const selected=workspaces.get([owner,'selection']);
    selected.onsuccess=()=>{if(selected.result===task)workspaces.put('scratch',[owner,'selection']);};
    tx.oncomplete=()=>resolve();
    tx.onabort=tx.onerror=()=>reject(new Error('Could not remove the local task. Please retry.'));
  });}finally{db.close();}
}
