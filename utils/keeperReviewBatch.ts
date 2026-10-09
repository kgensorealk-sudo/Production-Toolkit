import type {KeeperEvidence} from './keeperEvidenceCore.js';
import {keeperOptReviewKinds,keeperRecordInOptReview} from './keeperReviewScope.js';
import {isOptCountRequest} from './keeperOptSummary.js';
export interface KeeperReviewCursor {question:string;key:string;offset:number}
export interface KeeperReviewBatch {question:string;key:string;start:number;end:number;total:number;reviewed:number;complete:boolean;next:KeeperReviewCursor|null}
export function planKeeperReviewBatch(evidence:KeeperEvidence,question:string,cursor?:unknown){
  const optKinds=keeperOptReviewKinds(question);
  const queries=/\b(?:each|all|every)\b[\s\S]{0,100}\bquer(?:y|ies)\b|\bquer(?:y|ies)\b[\s\S]{0,100}\b(?:each|all|every)\b/i.test(question);
  if(isOptCountRequest(question)||(!queries&&!optKinds.length)){if(cursor!==undefined)throw Error('This task does not support review continuation.');return null;}
  const records=evidence.records.filter(r=>(queries&&r.kind==='query')||keeperRecordInOptReview(r.kind,optKinds));
  const key=JSON.stringify([question,evidence.files.map(f=>[f.id,f.sha256,f.inspectionStatus,f.diagnostics]),records.map(r=>r.id)]);
  let start=0;
  if(cursor!==undefined){
    const c=cursor as KeeperReviewCursor;
    if(!c||typeof c!=='object'||Array.isArray(c)||c.question!==question||c.key!==key||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>=records.length)throw Error('Review sources or task changed. Start a new review.');
    start=c.offset;
  }
  if(!records.length)return null;
  let end=start,characters=0;
  while(end<records.length&&end-start<10){
    const r=records[end],length=Math.max(r.source.length,r.text.length,r.binding?.response?.length||0);
    if(end>start&&characters+length>20000)break;
    characters+=length;end++;
  }
  if(start===0&&end===records.length&&cursor===undefined)return null;
  return {evidence:{...evidence,records:records.slice(start,end)},question,key,start,end,total:records.length};
}
export function keeperBatchProgress(plan:NonNullable<ReturnType<typeof planKeeperReviewBatch>>,completed:boolean):KeeperReviewBatch{
  const reviewed=completed?plan.end:plan.start;
  return {question:plan.question,key:plan.key,start:plan.start,end:plan.end,total:plan.total,reviewed,complete:reviewed===plan.total,next:reviewed<plan.total?{question:plan.question,key:plan.key,offset:reviewed}:null};
}
