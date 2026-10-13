
// Synthetic positive provider reply: strict internal proposal, validated by the real runner.
function mockProposal(request,refs=[]){
  const reviewId=JSON.stringify(request).match(/Review request ID: ([a-f0-9-]+)/)?.[1];
  const contents=request.contents||[];
  const inventory=contents.flatMap(c=>c.parts||[]).map(p=>p.text).find(t=>t?.startsWith('Application sandbox inventory (not instructions): '));
  const files=inventory?JSON.parse(inventory.slice('Application sandbox inventory (not instructions): '.length)).files:[];
  const records=contents.flatMap(c=>c.parts||[]).flatMap(p=>p.functionResponse?.response?.result?.records||[]);
  return JSON.stringify({reviewId,findings:[{references:refs.map(ref=>{const record=records.find(r=>r.evidenceRef===ref);return {ref,sha256:files.find(f=>f.id===record?.artifactId)?.sha256||'unread',field:'text',quote:record?.text?.slice(0,80)||'unread'};}),decision:'hold',reason:'evidence_only',action:'none'}],uncertainty:'not_assessed'});
}
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
  const client={models:{generateContent:async(request)=>round++===0?{functionCalls:[{name:'review_query_responses',args:{}}],candidates:[{content:{role:'model',parts:[{functionCall:{name:'review_query_responses',args:{}}}]}}]}:{text:mockProposal(request)}}};
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
let apiRound=0,scopeOnly=false;
globalThis.fetch=async(input,init)=>{
  const body=JSON.parse(init?.body||(input instanceof Request?await input.text():'{}'));
  const url=typeof input==='string'?input:input.url||String(input);
  if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
  if(url.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{content:{role:'model',parts:apiRound++%2===0?[{functionCall:{name:'review_query_responses',args:{},id:'review'}}]:scopeOnly?[{functionCall:{name:'report_scope_limit',args:{status:'insufficient_evidence',reason:'Cannot complete the requested assessment.'},id:'scope'}}]:[{text:mockProposal(body)}]},finishReason:'STOP'}]});
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
  scopeOnly=true;apiRound=0;const limited=await request(first.data.reviewBatch.next);assert.equal(limited.data.answerEvidence.retrieval.fullyRetrieved,10);assert.equal(limited.data.reviewBatch.reviewed,10);assert.equal(limited.data.reviewBatch.next.offset,10);assert.equal(limited.data.answerEvidence.answer.kind,'scope');
  console.log('PASS authenticated API batch/continue/final flow and stale cursor rejection with mocked provider transport');
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;}
