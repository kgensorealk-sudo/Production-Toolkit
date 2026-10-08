import assert from 'node:assert/strict';
import {engine,a,b,corrected} from './reference-updater-harness.mjs';
const state={scanResults:[]};engine(a+b,corrected,state).runAnalysis();
await engine(a+b,corrected,state).initiateUpdate();
assert.ok(engine(a+b,corrected,state).output);
for(const options of [{renumberInternal:false},{sortAlphabetically:true},{convertAndToAmp:true},{autoUpdateSmartMatch:true},{addOrphans:false}])
    assert.equal(engine(a+b,corrected,state,options).output,'');
const oldRows=structuredClone(state.scanResults);
for(const change of [rows=>{rows[0].selected=false;},rows=>{rows[0].reviewed=!rows[0].reviewed;},rows=>{rows[0].updatedIndex=null;},rows=>{rows.reverse();}]) {
    state.scanResults=structuredClone(oldRows);change(state.scanResults);
    assert.equal(engine(a+b,corrected,state).output,'');
}
state.scanResults=oldRows;state.manualSequence=true;assert.equal(engine(a+b,corrected,state).output,'');
state.manualSequence=false;assert.equal(engine(a,corrected,state).output,'');
assert.equal(engine(a+b,corrected,{scanResults:oldRows,output:state.output}).output,'');
engine(a+b,corrected,state).invalidateGeneratedResult();assert.equal(state.output,'');assert.equal(state.outputSnapshot,null);assert.equal(state.diffElements,null);
for(const change of [s=>{s.scanResults[0].selected=false;},s=>{s.scanResults.reverse();},s=>{s.generationKeyRef.current='settings changed';}]) {
    const pending={scanResults:[]};engine(a+b,corrected,pending).runAnalysis();
    await engine(a+b,corrected,pending,{setTimeout:fn=>{change(pending);if(pending.generationKeyRef.current!=='settings changed')engine(a+b,corrected,pending);fn();}}).initiateUpdate();
    assert.equal(pending.output,'');assert.ok(pending.toasts.some(t=>t.msg.includes('changed during merging')));
}
const diffPending={scanResults:[]};engine(a+b,corrected,diffPending).runAnalysis();
await engine(a+b,corrected,diffPending,{generateDiffAsync:async()=>{engine(a+b,corrected,diffPending,{renumberInternal:false});}}).initiateUpdate();
assert.equal(engine(a+b,corrected,diffPending,{renumberInternal:false}).output,'');
assert.ok(!diffPending.toasts.some(t=>t.msg.includes('Merge Protocol Executed')));
console.log('18 output validity scenarios passed.');
