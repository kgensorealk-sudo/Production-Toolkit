import type {KeeperArtifact,KeeperEvidence} from './keeperEvidenceCore';
import {validateKeeperLocalSources} from './keeperLocalLimits';
export function inspectKeeperLocally(artifacts:KeeperArtifact[],signal?:AbortSignal):Promise<KeeperEvidence>{
  return new Promise((resolve,reject)=>{
    validateKeeperLocalSources(artifacts);
    const worker=new Worker(new URL('./keeperLocal.worker.ts',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>{stop();reject(new Error('Local inspection timed out. No files were transmitted.'));},135000);
    const stop=()=>{clearTimeout(timeout);worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{stop();reject(new DOMException('Cancelled','AbortError'));};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{if(event.data?.kind!=='keeper-result')return;stop();event.data.error?reject(new Error(event.data.error)):resolve(event.data.evidence);};
    worker.onerror=()=>{stop();reject(new Error('Local inspection worker failed. No files were transmitted.'));};
    worker.postMessage({kind:'keeper-inspect',artifacts});
  });
}
