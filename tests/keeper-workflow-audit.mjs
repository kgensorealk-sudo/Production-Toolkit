import assert from 'node:assert/strict';
import {keeperArtifactScope,keeperScopedMessages} from '../utils/keeperConversationScope.ts';
import {inspectKeeperXml,inspectKeeperPdf,bindKeeperQueries,buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import {keeperFallbackReport} from '../utils/keeperQueryReport.ts';
import {runKeeperToolLoop} from '../utils/keeperToolRunner.ts';
import {getKeeperEvidence} from '../utils/keeperEvidenceCache.ts';

const a=keeperArtifactScope([{id:'xml-a'},{id:'pdf-a'}]),b=keeperArtifactScope([{id:'xml-b'},{id:'pdf-a'}]);
const history=[{artifactScope:a,role:'assistant',content:'Old file answer'},{artifactScope:b,role:'user',content:'New question'},{role:'assistant',content:'Legacy unscoped answer'}];
assert.deepEqual(keeperScopedMessages(history,b),[history[1]]);assert.equal(keeperScopedMessages(history,'[]').length,0);
assert.equal(keeperArtifactScope([{id:'pdf-a'},{id:'xml-a'}]),a);
const article='<article><item-info><ce:doi>10.1234/test</ce:doi></item-info><query id="q1" qid="STR001">Confirm first?</query><query id="q3">Confirm third?</query><opt_INS>Added</opt_INS></article>';
const artifact={id:'xml',name:'synthetic.xml',kind:'xml',content:article};
const xml=()=>inspectKeeperXml(artifact);
const marker='Supplementary data to this article can be found online at https://doi.org/10.1234/test';
const pdf=inspectKeeperPdf('pdf',[
  {page:1,lines:['Author Query Report',marker,'Q1','Query: Confirm first?','Answer: First line.','Page 1 of 2']},
  {page:2,lines:['Author Query Report','Second line.','Q3','Query: Confirm third?','Answer: Third answer.','Page 2 of 2']}
]);
const x=xml();bindKeeperQueries(x,pdf);
assert.equal(x.records[0].binding.state,'established');assert.equal(x.records[0].binding.response,'First line. Second line.');
assert.equal(x.records[1].binding.response,'Third answer.');assert.match(pdf.records[0].source,/Author Query Report/);
const split=inspectKeeperPdf('pdf',[{page:1,lines:['Author Query Report',marker,'Q1']},{page:2,lines:['Author Query Report','Query: Confirm first?','Answer: Yes']}]);
const splitXml=xml();bindKeeperQueries(splitXml,split);assert.equal(splitXml.records[0].binding.state,'established');
const blank=inspectKeeperPdf('pdf',[{page:1,lines:[marker,'Q1','Query: Confirm first?','Answer:','Q3','Query: Confirm third?','Answer: Yes']}]);
const blankXml=xml();bindKeeperQueries(blankXml,blank);assert.equal(blankXml.records[0].binding.state,'unresolved');assert.equal(blankXml.records[1].binding.state,'established');
const duplicate=inspectKeeperPdf('pdf',[{page:1,lines:[marker,'Q1','Query: Confirm first?','Answer: First','Q1','Query: Confirm first?','Answer: Second']}]);
const dupXml=xml();bindKeeperQueries(dupXml,duplicate);assert.equal(dupXml.records[0].binding.state,'ambiguous');
const wrong=inspectKeeperPdf('pdf',[{page:1,lines:[marker.replace('10.1234/test','10.1234/wrong'),'Q1','Query: Confirm first?','Answer: Yes']}]);
const wrongXml=xml();bindKeeperQueries(wrongXml,wrong);assert.equal(wrongXml.records[0].binding.state,'conflicting');
const qid=inspectKeeperPdf('pdf',[{page:1,lines:[marker,'Q1','Query: Confirm first?','QID: STR999','Answer: Yes']}]);
const qidXml=xml();bindKeeperQueries(qidXml,qid);assert.equal(qidXml.records[0].binding.state,'conflicting');
const uncertain=inspectKeeperPdf('pdf',[{page:1,lines:['Unrecognized repeated article heading',marker,'Q1','Query: Confirm first?','Answer: First line.']},{page:2,lines:['Unrecognized repeated article heading','Second line.']}]);
const uncertainXml=xml();bindKeeperQueries(uncertainXml,uncertain);assert.equal(uncertainXml.records[0].binding.state,'unresolved');

const ev=await buildKeeperEvidence([artifact]);
const task='Count insertions and review every query.';
const fallback=keeperFallbackReport(ev,task);assert.match(fallback,/Inserted: \*\*1\*\*/);assert.match(fallback,/### q1/);assert.match(fallback,/### q3/);assert.match(fallback,/AI interpretation was unavailable/);
let round=0;
const client={models:{generateContent:async()=>{
  if(round++)return {text:'Both queries reviewed; responses remain unresolved.'};
  const call={name:'review_query_responses',args:{},id:'queries'};
  return {functionCalls:[call],candidates:[{content:{role:'model',parts:[{functionCall:call}]}}]};
}}};
await assert.rejects(runKeeperToolLoop({provider:'gemini',client,model:'synthetic',messages:[{role:'user',parts:[{text:task}]}],systemInstruction:'Sandbox',evidence:ev,deadline:Date.now()+5000}),/counts were not retrieved/);
const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
try {
  const first=await getKeeperEvidence('expiry-test',[artifact],now+25000);
  assert.strictEqual(await getKeeperEvidence('expiry-test',[artifact],now+25000),first);
  now+=15*60*1000+1;
  const renewed=await getKeeperEvidence('expiry-test',[artifact],now+25000);
  assert.notStrictEqual(renewed,first);assert.deepEqual(renewed,first);
}finally{Date.now=originalNow;}
console.log('PASS file-scoped history, page continuations/headers, split headings, blank answers, skipped IDs, duplicate/QID/DOI ambiguity, compound fallback/coverage, and cache expiry recovery');
