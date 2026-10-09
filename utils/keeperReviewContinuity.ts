import type {KeeperEvidence} from './keeperEvidenceCore';
import {planKeeperReviewBatch,type KeeperReviewBatch} from './keeperReviewBatch';
export interface KeeperReviewMessage {reviewBatch?:KeeperReviewBatch;reviewInstructions?:string;artifactScope?:string;role:string}
export function keeperReviewContinuity(messages:KeeperReviewMessage[],scope:string,evidence:KeeperEvidence|null,instructions:string){
  const message=messages.slice().reverse().find(item=>item.reviewBatch);
  if(!message)return null;
  const batch=message.reviewBatch!;
  const invalid=(reason:string)=>({status:'stale' as const,batch,reason});
  if(!batch||typeof batch.question!=='string'||typeof batch.key!=='string'||![batch.start,batch.end,batch.total,batch.reviewed].every(Number.isSafeInteger)||batch.start<0||batch.end<=batch.start||batch.end>batch.total||![batch.start,batch.end].includes(batch.reviewed)||batch.complete!==(batch.reviewed===batch.total))return invalid('Saved review progress is inconsistent. Start a fresh review.');
  if(message.artifactScope!==scope)return invalid('Source files changed. Saved progress applies to an earlier source version.');
  if(message.reviewInstructions===undefined||message.reviewInstructions!==instructions.trim())return invalid('Review instructions changed or were not recorded by an older version. Start a fresh review.');
  let covered=0;
  for(const item of messages){
    const step=item.reviewBatch;
    if(!step||step.key!==batch.key||item.artifactScope!==scope||item.reviewInstructions!==message.reviewInstructions)continue;
    if(item.role==='user'&&step.start===0)covered=0;
    if(item.role==='assistant'&&step.start===covered&&step.reviewed===step.end&&Number.isSafeInteger(step.end)&&step.end>covered){
      if(evidence){
        try{
          const prior=planKeeperReviewBatch(evidence,batch.question,{question:batch.question,key:batch.key,offset:step.start});
          if(!prior||prior.end!==step.end||prior.total!==step.total) return invalid('Saved review history has an invalid batch boundary. Start a fresh review.');
        }catch{return invalid('Source evidence or saved review history changed. Start a fresh review.');}
      }
      covered=step.end;
    }
  }
  if(batch.reviewed!==covered)return invalid('Saved review history has a gap or inconsistent completion. Start a fresh review.');
  if(!evidence)return {status:'waiting' as const,batch,reason:'Waiting for local source inspection before checking the saved review position.'};
  try{
    const plan=planKeeperReviewBatch(evidence,batch.question,{question:batch.question,key:batch.key,offset:batch.start});
    if(!plan||plan.end!==batch.end||plan.total!==batch.total)throw Error();
    if(batch.complete?batch.next!==null:!batch.next||batch.next.question!==batch.question||batch.next.key!==batch.key||batch.next.offset!==batch.reviewed)throw Error();
  }catch{return invalid('Source evidence or saved review progress changed. Start a fresh review.');}
  return {status:'ready' as const,batch,reason:''};
}
