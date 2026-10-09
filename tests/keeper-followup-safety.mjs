import assert from 'node:assert/strict';
import {inspectKeeperXml,inspectKeeperPdf,bindKeeperQueries} from '../utils/keeperEvidence.ts';
import {runKeeperToolLoop} from '../utils/keeperToolRunner.ts';
import {encodeKeeperRequest} from '../utils/keeperPayload.ts';
const xml=(text)=>inspectKeeperXml({id:'xml',name:'synthetic.xml',kind:'xml',content:`<article><item-info><ce:doi>10.1234/test</ce:doi></item-info><query id="q1">${text}</query></article>`});
const pdf=(lines)=>inspectKeeperPdf('pdf',[{page:1,lines:['Supplementary data to this article can be found online at https://doi.org/10.1234/test',...lines]}]);
for(const [original,incoming] of [['Should value &lt; 10 be kept?','Should value > 10 be kept?'],['Is 1.0 correct?','Is 10 correct?'],['Is -10 correct?','Is 10 correct?'],['Is now here correct?','Is nowhere correct?']]) {
  const x=xml(original),p=pdf(['Q1','Query: '+incoming,'Answer: Yes']);bindKeeperQueries(x,p);assert.equal(x.records[0].binding.state,'unresolved');
}
const typography=xml('  Is “Sample”  correct? ');bindKeeperQueries(typography,pdf(['Q1','Query: Is "Sample" correct?','Answer: Yes']));assert.equal(typography.records[0].binding.state,'established');
for(const heading of ['Q2','First answer.Q2']) {
  const p=pdf(['Q1','Query: Confirm first?','Answer: First answer.',heading,'Question: Confirm second?','Answer: Second answer.']);
  const x=xml('Confirm first?');bindKeeperQueries(x,p);
  assert.equal(p.records.length,2);assert.ok(!p.records[0].binding.response.includes('Second answer'));
  assert.equal(x.records[0].binding.state,'unresolved');
}
const footer=pdf(['Q1','Query: Confirm?','Answer: Done.','Production report — Page 2 of 2']);
const y=xml('Confirm?');bindKeeperQueries(y,footer);assert.equal(y.records[0].binding.response,'Done.');assert.match(footer.records[0].source,/Page 2 of 2/);assert.equal(footer.records[0].diagnostics[0].severity,'warning');
const evidence={files:[{id:'xml',name:'synthetic.xml',diagnostics:[]}],records:Array.from({length:15},(_,i)=>({...y.records[0],id:`xml-r${i}`,queryId:`q${i+1}`}))};
const mock=(args,text)=>{let round=0;const call={name:'review_query_responses',args,id:'read'};return {models:{generateContent:async()=>round++===0?{functionCalls:[call],candidates:[{content:{role:'model',parts:[{functionCall:call}]}}]}:{text}}};};
const options={provider:'gemini',model:'synthetic',messages:[{role:'user',parts:[{text:'Please check authors response to each queries'}]}],systemInstruction:'Sandbox',evidence,deadline:Date.now()+5000};
await assert.rejects(runKeeperToolLoop({...options,client:mock({limit:1},'All 15 reviewed')}),/Incomplete query evidence/);
const complete=await runKeeperToolLoop({...options,client:mock({limit:30},'Responses retrieved; edit completion remains unknown.')});assert.equal(complete.coverage.recordsRetrieved,15);
const long={...evidence,records:[{...evidence.records[0],text:'x'.repeat(3000)}]};
await assert.rejects(runKeeperToolLoop({...options,evidence:long,client:mock({},'All reviewed')}),/Incomplete query evidence/);
let round=0;
const chunkClient={models:{generateContent:async()=>{
  if(round===2)return {text:'Both chunks retrieved; edit status unknown.'};
  const call={name:'inspect_sandbox_evidence',args:{recordId:'xml-r0',textOffset:round++*5000},id:`chunk-${round}`};
  return {functionCalls:[call],candidates:[{content:{role:'model',parts:[{functionCall:call}]}}]};
}}};
const fullLong={...evidence,records:[{...evidence.records[0],text:'x'.repeat(6000)}]};
await runKeeperToolLoop({...options,evidence:fullLong,client:chunkClient});
assert.throws(()=>encodeKeeperRequest({artifacts:[{kind:'pdf',content:Buffer.alloc(3100000).toString('base64')}]}),/combined XML, encoded PDF/);
assert.throws(()=>encodeKeeperRequest({artifacts:[{content:'a'.repeat(2000000)},{content:'a'.repeat(2000000)}]}),/server limit/);
assert.throws(()=>encodeKeeperRequest({content:'é'.repeat(2100000)}),/server limit/);
assert.equal(encodeKeeperRequest({action:'inspect',artifacts:[]}),'{"action":"inspect","artifacts":[]}');
console.log('PASS meaningful punctuation, typography, standalone/fused boundaries, footer provenance, whole-query coverage, long-record truncation, and encoded/combined/UTF-8 payload limits');
