import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book,sourceText} from './reference-updater-harness.mjs';
const mk=(id,label,author,year,title)=>ref('bb'+id,label,book('rf'+id,author,year,title)+sourceText('se'+String(8000+Number(id)),title));
// Candidate index 1 belongs to the incoming list, not original index 1.
const original=mk('0005','Smith, 2020','Smith','2020','Alpha')+mk('0010','Jones, 2021','Jones','2021','Gamma');
const updated=mk('0850','Mary, 2018','Mary','2018','Delta')+mk('0900','Smith et al., 2020','Smith','2020','Bzzzz');
const state={scanResults:[]};engine(original,updated,state,{addOrphans:false}).runAnalysis();
const item=state.scanResults.find(r=>r.status==='potential_duplicate');assert.ok(item);
assert.equal(item.candidateSource,'updated');assert.equal(item.originalIndex,0);
engine(original,updated,state).chooseReviewCandidate(item.potentialMatches[0],item);
const chosen=state.scanResults.find(r=>r.uid===item.uid);
assert.equal(chosen.originalIndex,0);assert.equal(chosen.updatedIndex,1);
engine(original,updated,state).mergeDuplicate(chosen.uid,chosen.originalIndex);
await engine(original,updated,state,{addOrphans:false}).initiateUpdate();
assert.ok(state.output.includes('Bzzzz'));assert.ok(state.output.includes('Gamma'));
const ids=Array.from(state.output.matchAll(/<ce:bib-reference\b[^>]*\bid="([^"]+)"/g),m=>m[1]);
assert.deepEqual(ids,['bb0005','bb0010']);
// Secondary duplicate rows must never impersonate the original owner.
const secondary={uid:'incoming',status:'potential_duplicate',candidateSource:'original',originalIndex:0,updatedIndex:1,selected:true};
const owner={uid:'owner',status:'unchanged',originalIndex:0,updatedIndex:null,selected:true};
const second={scanResults:[secondary,owner]};
engine(original,updated,second).mergeDuplicate('incoming',0);
assert.equal(second.scanResults.length,1);assert.equal(second.scanResults[0].uid,'owner');assert.equal(second.scanResults[0].updatedIndex,1);
const split={scanResults:[secondary,owner]};engine(original,updated,split).splitMatch(secondary);
assert.equal(split.scanResults.length,2);assert.equal(split.scanResults[0].originalIndex,null);assert.equal(split.scanResults[1].status,'unchanged');
fs.mkdirSync('artifacts/reference-updater-duplicate-fix',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-duplicate-fix/results.json',JSON.stringify([{name:'duplicate-review',original,updated,output:state.output}],null,2));
console.log('3 duplicate-review regression scenarios passed.');
