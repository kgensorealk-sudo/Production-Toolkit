import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,corrected} from './reference-updater-harness.mjs';
const results=[];
for(const [name,incoming,options] of [['same-doi',corrected.replace('[1]','[99]'),{}],['same-content',a.replace(/5"/g,'900"').replace('[1]','[99]'),{}],['auto-add-disabled',corrected.replace('[1]','[99]'),{addOrphans:false}]]) {
    const state={scanResults:[]};engine(a,incoming,state,options).runAnalysis();
    assert.equal(state.scanResults[0].status,'unchanged');assert.equal(state.scanResults[0].updatedIndex,null);
    assert.equal(state.scanResults[1].originalIndex,null);
    await engine(a,incoming,state,options).initiateUpdate();
    assert.ok(state.scanResults[1].numberingWarning.includes('[1]'));
    if(options.addOrphans!==false) {
        assert.ok(!state.output);
        state.scanResults[1]={...state.scanResults[1],reviewed:true,status:'smart_match'};
        await engine(a,incoming,state,options).initiateUpdate();
    }
    assert.ok(state.output.startsWith(a));
    if(options.addOrphans===false)assert.equal(state.output,a);
    else {assert.ok(state.output.includes('id="bb3000"'));assert.ok(state.output.includes('[99]'));}
    results.push({name,original:a.replaceAll('bb5','bb0005'),updated:incoming,output:state.output.replaceAll('bb5','bb0005')});
}
const sameNumber={scanResults:[]};engine(a,corrected.replace('[1]','(1)'),sameNumber).runAnalysis();
assert.equal(sameNumber.scanResults[0].matchType,'DOI');
const forced={scanResults:[]};engine(a,corrected.replace('[1]','[99]'),forced).runAnalysis();
forced.scanResults=[{...forced.scanResults[0],status:'update',updatedIndex:0,reviewed:true}];
await engine(a,corrected.replace('[1]','[99]'),forced).initiateUpdate();assert.ok(!forced.output);
fs.mkdirSync('artifacts/reference-updater-numeric-identity',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-numeric-identity/results.json',JSON.stringify(results,null,2));
console.log('5 numeric identity regression scenarios passed.');
