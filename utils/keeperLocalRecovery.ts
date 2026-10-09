export async function resumeKeeperTaskQueue<T>(tasks:T[],prepare:(task:T)=>Promise<void>,recordFailure:(task:T,error:unknown)=>Promise<void>,cancelled:()=>boolean){
  for(const task of tasks){
    if(cancelled())return;
    try{await prepare(task);}
    catch(error){if(cancelled())return;await recordFailure(task,error);}
  }
}
