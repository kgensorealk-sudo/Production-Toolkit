// Real handler/SDK serialization with isolated auth/provider transport mocks.
import assert from 'node:assert/strict';
import handler from '../utils/chatHandler.ts';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
const evidence=await buildKeeperEvidence([{id:'xml',name:'synthetic.xml',kind:'xml',content:'<article><opt_INS>Added</opt_INS><opt_COMMENT>Confirm?</opt_COMMENT></article>'}]);
const originalFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY,oldOpenai=process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY='synthetic-key';delete process.env.OPENAI_API_KEY;
let round=0,badCitation=false,observedRef=false;
globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input.url||String(input);
  if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
  if(url.includes('generativelanguage.googleapis.com')){
    const body=JSON.parse(init?.body||(input instanceof Request?await input.text():'{}'));
    if(JSON.stringify(body).includes('"evidenceRef":"E1"'))observedRef=true;
    return Response.json({candidates:[{content:{role:'model',parts:round++%2===0?[{functionCall:{name:'inspect_sandbox_evidence',args:{kind:'opt_ins'},id:'read'}}]:[{text:badCitation?'Unread comment [E2].':'Added text [E1].'}]},finishReason:'STOP'}]});
  }
  throw Error('Unexpected mock transport');
};
async function request(question){let result;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){result={status:this.statusCode,data};return this;},end(){}};await handler({method:'POST',headers:{authorization:'Bearer synthetic'},body:{messages:[{role:'user',content:question}],question,evidenceSnapshot:evidence}},res);return result;}
try{
  const counts=await request('How many insertions?');assert.equal(counts.status,200);assert.equal(counts.data.answerEvidence.answer.kind,'counts');assert.equal(counts.data.answerEvidence.retrieval.inventoryCountsRead,true);assert.equal(round,0);
  const answer=await request('Tell me about the insertion.');assert.equal(answer.status,200);assert.equal(observedRef,true);assert.match(answer.data.reply,/#keeper-evidence-E1/);assert.equal(answer.data.answerEvidence.answer.linkedRecords,1);assert.equal(answer.data.answerEvidence.retrieval.records,1);assert.equal(answer.data.answerEvidence.inspection.inventoryRecords,2);
  badCitation=true;round=0;const failed=await request('Tell me about the insertion.');assert.equal(failed.status,503);assert.equal(failed.data.answerEvidence.answer.kind,'unavailable');assert.equal(failed.data.answerEvidence.retrieval.records,1);assert.equal(failed.data.answerEvidence.answer.linkedRecords,0);assert.ok(!failed.data.reply);
  console.log('PASS direct count metadata, real SDK evidence-reference serialization, successful answer links, and failed-attempt coverage without false answer claims');
}finally{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;if(oldOpenai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldOpenai;}
