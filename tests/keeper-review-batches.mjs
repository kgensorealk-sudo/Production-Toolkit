import assert from 'node:assert/strict';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import {planKeeperReviewBatch,keeperBatchProgress} from '../utils/keeperReviewBatch.ts';
import {runKeeperToolLoop} from '../utils/keeperToolRunner.ts';
import handler from '../utils/chatHandler.ts';
const evidence=await buildKeeperEvidence([{id:'xml',name:'synthetic.xml',kind:'xml',content:'<article>'+Array.from({length:23},(_,i)=>`<query id="q${i+1}">Confirm item ${i+1}?</query>`).join('')+'<opt_INS>Added</opt_INS></article>'}]);
const question='Check author responses to each query.';
let cursor,seen=[];
for(let index=0;index<3;index++){
  const plan=planKeeperReviewBatch(evidence,question,cursor);
  assert.ok(plan);let round=0;
  const client={models:{generateContent:async()=>round++===0?{functionCalls:[{name:'review_query_responses',args:{}}],candidates:[{content:{role:'model',parts:[{functionCall:{name:'review_query_responses',args:{}}}]}}]}:{text:'All queries in this batch have unresolved author responses; no PDF was supplied.'}}};
  const result=await runKeeperToolLoop({provider:'gemini',client,model:'synthetic',messages:[{role:'user',parts:[{text:question}]}],systemInstruction:'Review this batch only.',evidence:plan.evidence,countEvidence:evidence,requiredRecordIds:plan.evidence.records.map(r=>r.id),question,deadline:Date.now()+1000});
  assert.equal(result.coverage.fullyRetrievedRecords,plan.evidence.records.length);
  seen.push(...plan.evidence.records.map(r=>r.id));
  const progress=keeperBatchProgress(plan,true);cursor=progress.next;
  assert.equal(progress.reviewed,Math.min((index+1)*10,23));
}
assert.equal(cursor,null);assert.equal(new Set(seen).size,23);
const first=planKeeperReviewBatch(evidence,question);
assert.equal(keeperBatchProgress(first,false).next.offset,0);
assert.equal(keeperBatchProgress(first,false).reviewed,0);
const next=keeperBatchProgress(first,true).next;
assert.throws(()=>planKeeperReviewBatch({...evidence,files:evidence.files.map(f=>({...f,sha256:'changed'}))},question,next),/changed/);
assert.throws(()=>planKeeperReviewBatch(evidence,question,{...next,offset:-1}),/changed/);
assert.throws(()=>planKeeperReviewBatch(evidence,'Review all comments.',next),/changed/);
assert.equal(planKeeperReviewBatch(evidence,'How many insertions?'),null);
let round=0;
const unrelated={models:{generateContent:async()=>round++===0?{functionCalls:[{name:'summarize_opt_changes',args:{}}],candidates:[{content:{role:'model',parts:[{functionCall:{name:'summarize_opt_changes',args:{}}}]}}]}:{text:'This batch is done.'}}};
await assert.rejects(runKeeperToolLoop({provider:'gemini',client:unrelated,model:'synthetic',messages:[{role:'user',parts:[{text:question}]}],systemInstruction:'Keeper',evidence:first.evidence,countEvidence:evidence,requiredRecordIds:first.evidence.records.map(r=>r.id),question,deadline:Date.now()+1000}),/Incomplete batch/);
const optEvidence=await buildKeeperEvidence([{id:'xml',name:'synthetic.xml',kind:'xml',content:'<article>'+Array.from({length:12},()=>'<opt_INS>Added</opt_INS>').join('')+'</article>'}]);
const opt=planKeeperReviewBatch(optEvidence,'Explain every insertion.');
assert.equal(opt.evidence.records.length,10);
console.log('PASS three resumable batches, exact coverage without skipped records, failed batch retry, source/task mismatch rejection, count-only bypass, unrelated read rejection and OPT batching');
const originalFetch=globalThis.fetch,originalKey=process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY='synthetic-key';
let apiRound=0;
globalThis.fetch=async(input)=>{
  const url=typeof input==='string'?input:input.url||String(input);
  if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
  if(url.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{content:{role:'model',parts:apiRound++%2===0?[{functionCall:{name:'review_query_responses',args:{},id:'review'}}]:[{text:'All queries in this batch have unresolved responses.'}]},finishReason:'STOP'}]});
  throw Error('Unexpected mock transport');
};
async function request(reviewCursor){
  let result;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){result={status:this.statusCode,data};return this;},end(){}};
  await handler({method:'POST',headers:{authorization:'Bearer synthetic'},body:{messages:[{role:'user',content:question}],question,evidenceSnapshot:evidence,...(reviewCursor?{reviewCursor}:{})}},res);return result;
}
try{
  const first=await request();assert.equal(first.status,200);assert.equal(first.data.reviewBatch.reviewed,10);assert.match(first.data.reply,/Batch 1–10/);
  const second=await request(first.data.reviewBatch.next);assert.equal(second.status,200);assert.equal(second.data.reviewBatch.reviewed,20);
  const third=await request(second.data.reviewBatch.next);assert.equal(third.data.reviewBatch.reviewed,23);assert.equal(third.data.reviewBatch.next,null);
  const stale=await request({...first.data.reviewBatch.next,key:'stale'});assert.equal(stale.status,400);
  console.log('PASS authenticated API batch/continue/final flow and stale cursor rejection with mocked provider transport');
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;}
