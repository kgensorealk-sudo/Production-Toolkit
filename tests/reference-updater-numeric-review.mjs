import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book} from './reference-updater-harness.mjs';
// Metadata moved from contribution title into the incoming author list.
const original=ref('bb0060','[12]',book('or0030','Novartis','2023','Fabhalta (iptacopan). Prescribing information'));
const incoming=ref('bb0030','[12]',book('rf0025','Fabhalta (iptacopan)','2023','Prescribing Information'));
for(const options of [{},{autoUpdateSmartMatch:true},{addOrphans:false}]) {
    const state={scanResults:[]};engine(original,incoming,state,options).runAnalysis();
    assert.equal(state.scanResults.length,1);assert.equal(state.scanResults[0].status,'potential_duplicate');
    assert.equal(state.scanResults[0].matchType,'Label');
    await engine(original,incoming,state,options).initiateUpdate();assert.ok(!state.output);
    engine(original,incoming,state,options).mergeDuplicate(state.scanResults[0].uid,0);
    await engine(original,incoming,state,options).initiateUpdate();assert.ok(state.output.includes('id="bb0060"'));
    assert.equal((state.output.match(/<ce:label>\[12\]<\/ce:label>/g)||[]).length,1);
}
const second=incoming.replaceAll('bb0030','bb0035').replaceAll('rf0025','rf0030').replace('Prescribing Information','Different title');
const duplicate={scanResults:[]};engine(original,incoming+second,duplicate).runAnalysis();
assert.equal(duplicate.scanResults[0].candidates.length,2);
await engine(original,incoming+second,duplicate,{autoUpdateSmartMatch:true}).initiateUpdate();assert.ok(!duplicate.output);
engine(original,incoming+second,duplicate).mergeDuplicate(duplicate.scanResults[0].uid,0);
await engine(original,incoming+second,duplicate).initiateUpdate();assert.ok(!duplicate.output);
assert.ok(duplicate.scanResults.some(r=>r.originalIndex===null&&r.status==='conflict'&&!r.reviewed));
duplicate.scanResults.find(r=>r.originalIndex===null).selected=false;
await engine(original,incoming+second,duplicate).initiateUpdate();assert.ok(duplicate.output);
assert.equal((duplicate.output.match(/<ce:label>\[12\]<\/ce:label>/g)||[]).length,1);
const otherNumber={scanResults:[]};engine(original,incoming.replace('[12]','[99]'),otherNumber).runAnalysis();
assert.equal(otherNumber.scanResults[0].status,'unchanged');assert.equal(otherNumber.scanResults[1].status,'add');
const repeatedOriginal=original.replace('bb0060','bb0065').replace('or0030','or0035');
const shared={scanResults:[]};engine(original+repeatedOriginal,incoming,shared).runAnalysis();
assert.ok(shared.scanResults.every(r=>r.status==='conflict'&&!r.reviewed));
await engine(original+repeatedOriginal,incoming,shared).initiateUpdate();assert.ok(!shared.output);
console.log('7 numeric review scenarios passed.');
