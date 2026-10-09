import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildKeeperEvidence,dispatchKeeperTool} from '../utils/keeperEvidence.ts';
import {planKeeperReviewBatch,keeperBatchProgress} from '../utils/keeperReviewBatch.ts';
import {prepareKeeperRequestEvidence,keeperTaskQuestion} from '../utils/keeperRequestEvidence.ts';
import {validateKeeperEvidenceSnapshot} from '../utils/keeperEvidenceSnapshot.ts';
import {summarizeOptChanges} from '../utils/keeperOptSummary.ts';
import {keeperEvidenceRef} from '../utils/keeperAnswerEvidence.ts';
import handler from '../utils/chatHandler.ts';
const rules='Review every query.',question=keeperTaskQuestion(rules,'Proceed');
assert.match(question,/Review every query/);assert.match(question,/Proceed/);
assert.equal(keeperTaskQuestion(rules,question),question);
assert.equal(keeperTaskQuestion('New instructions.',question),'Task instructions:\nNew instructions.\n\nRequest:\nProceed');
assert.equal(keeperTaskQuestion('',question),'Proceed');
assert.equal(keeperTaskQuestion(rules,'', {question,key:'key',offset:10}),question);
assert.equal(keeperTaskQuestion('', 'How many insertions?'),'How many insertions?');
const evidence=await buildKeeperEvidence([{id:'xml',name:'synthetic.xml',kind:'xml',content:'<article>'+Array.from({length:23},(_,i)=>`<query id="q${i+1}">Confirm ${i+1}?</query>`).join('')+'<opt_INS> </opt_INS><opt_DEL>old</opt_DEL></article>'}]);
const large={...evidence,records:evidence.records.map(r=>({...r,source:'x'.repeat(190000)}))};
assert.ok(Buffer.byteLength(JSON.stringify(large))>4000000);
let cursor,seen=[];
for(let index=0;index<23;index++){
 const original=planKeeperReviewBatch(large,question,cursor);
 const projected=validateKeeperEvidenceSnapshot(prepareKeeperRequestEvidence(large,question,cursor));
 assert.ok(Buffer.byteLength(JSON.stringify(projected))<2800000);
 const batch=planKeeperReviewBatch(projected,question,cursor);
 assert.equal(batch.key,original.key);assert.equal(batch.start,original.start);assert.equal(batch.end,original.end);
 assert.deepEqual(summarizeOptChanges(projected),summarizeOptChanges(large));
 const record=batch.evidence.records[0];assert.equal(record.contentOmitted,undefined);assert.equal(record.source,large.records[index].source);
 assert.equal(keeperEvidenceRef(projected,record.id),`E${index+1}`);
 const omitted=projected.records.find(r=>r.contentOmitted);
 assert.match(dispatchKeeperTool(projected,'inspect_sandbox_evidence',{recordId:omitted.id}).error,/outside this request/);
 assert.match(dispatchKeeperTool(projected,'inspect_sandbox_evidence',{search:'not found'}).error,/no full-inventory search/);
 seen.push(record.id);cursor=keeperBatchProgress(batch,true).next;
}
assert.equal(cursor,null);assert.equal(new Set(seen).size,23);
const counts=validateKeeperEvidenceSnapshot(prepareKeeperRequestEvidence(large,'How many insertions?'));
assert.ok(counts.records.every(r=>r.contentOmitted));assert.deepEqual(summarizeOptChanges(counts),summarizeOptChanges(large));
assert.throws(()=>prepareKeeperRequestEvidence(large,'Summarize this'),/specific query IDs/);
const focused=prepareKeeperRequestEvidence(large,'Check q13.');assert.equal(focused.records.filter(r=>!r.contentOmitted).length,1);assert.equal(focused.records[12].contentOmitted,undefined);
const corrupt=structuredClone(counts);corrupt.records[0].text='untrusted';assert.throws(()=>validateKeeperEvidenceSnapshot(corrupt));
const heavy={...evidence,records:[{...evidence.records[0],source:'"'.repeat(6000),text:'"'.repeat(6000),context:'"'.repeat(1500),binding:{state:'established',reason:'Synthetic bounded response',response:'"'.repeat(6000)}}]};
let offset=0,source='',text='',response='';
do{
 const page=dispatchKeeperTool(heavy,'inspect_sandbox_evidence',{recordId:heavy.records[0].id,textOffset:offset});assert.equal(page.records.length,1);
 const row=page.records[0];assert.ok(JSON.stringify(row).length<=24000);source+=row.source;text+=row.text;response+=row.binding.response;
 assert.ok(row.nextTextOffset===null||row.nextTextOffset>offset);offset=row.nextTextOffset;
}while(offset!==null);
assert.equal(source,heavy.records[0].source);assert.equal(text,heavy.records[0].text);assert.equal(response,heavy.records[0].binding.response);
const impossible=structuredClone(heavy);impossible.records[0].binding.reason='x'.repeat(30000);
assert.match(dispatchKeeperTool(impossible,'inspect_sandbox_evidence',{}).error,/metadata exceeds/);
impossible.records[0].binding.reason='x'.repeat(50000);
assert.match(dispatchKeeperTool(impossible,'review_query_responses',{}).error,/metadata exceeds/);
const unicode=structuredClone(heavy);unicode.records[0].source=unicode.records[0].text=unicode.records[0].binding.response='漢'.repeat(6000);
const unicodePage=dispatchKeeperTool(unicode,'inspect_sandbox_evidence',{});
assert.ok(Buffer.byteLength(JSON.stringify(unicodePage.records[0]))<=24000);
assert.ok(unicodePage.records[0].nextTextOffset>0);
const ui=fs.readFileSync('components/KeeperSandbox.tsx','utf8');assert.ok(ui.includes('question:requestQuestion'));assert.ok(ui.includes('evidenceSnapshot:requestEvidence'));assert.ok(ui.includes('planKeeperReviewBatch(evidenceSnapshot,requestQuestion,reviewCursor)'));
console.log('PASS canonical task instructions, 23 bounded batches, stable cursors/global refs, full counts, omitted/search refusal, focused queries, snapshot validation and lossless advancing serialized-size slices');
const oldFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='synthetic-key';let round=0;
globalThis.fetch=async input=>{
 const url=typeof input==='string'?input:input.url||String(input);
 if(url.includes('/auth/v1/user'))return Response.json({id:'synthetic',app_metadata:{role:'admin'}});
 if(url.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{content:{role:'model',parts:round++%2===0?[{functionCall:{name:'review_query_responses',args:{},id:'review'}}]:[{text:`The selected query remains unresolved [E${Math.floor(round/2)}].`}]},finishReason:'STOP'}]});
 throw Error('Unexpected transport');
};
try{
 let continuation;
 for(let index=0;index<2;index++){
  const body={messages:[{role:'user',content:question}],question,evidenceSnapshot:prepareKeeperRequestEvidence(large,question,continuation),...(continuation?{reviewCursor:continuation}:{})};
  assert.ok(Buffer.byteLength(JSON.stringify(body))<4000000);
  let output;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){output={status:this.statusCode,data};return this;},end(){}};
  await handler({method:'POST',headers:{authorization:'Bearer synthetic'},body},res);
  assert.equal(output.status,200,JSON.stringify(output));assert.equal(output.data.reviewBatch.reviewed,index+1);assert.equal(output.data.answerEvidence.references[0].ref,`E${index+1}`);assert.equal(output.data.answerEvidence.inspection.inventoryRecords,25);
  continuation=output.data.reviewBatch.next;
 }
 console.log('PASS authenticated API large-inventory first/second batch with stable E1/E2 references and mocked Gemini SDK transport');
}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
