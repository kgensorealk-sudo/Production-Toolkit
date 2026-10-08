import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,b,corrected} from './reference-updater-harness.mjs';
for(const [original,updated,options] of [[b+a,corrected,{}],[a+b,corrected.replace('Corrected','Changed'),{}],[a+b,corrected,{addOrphans:false}]]) {
    const state={scanResults:[]};engine(a+b,corrected,state).runAnalysis();
    await engine(original,updated,state,options).initiateUpdate();
    assert.ok(!state.output);assert.deepEqual(state.scanResults,[]);
    assert.ok(state.toasts.some(t=>t.msg.includes('Analyze again')));
}
const state={scanResults:[]};engine(a,corrected,state).runAnalysis();
await engine(a,corrected,state).initiateUpdate();assert.ok(state.output.includes('Corrected Alpha evidence'));
const reordered={scanResults:[]};engine(b+a,corrected,reordered).runAnalysis();
await engine(b+a,corrected,reordered).initiateUpdate();
assert.ok(reordered.output.includes('Unrelated Beta study'));assert.ok(reordered.output.includes('Corrected Alpha evidence'));
const delayed={scanResults:[]};let callback;
engine(a,corrected,delayed,{setTimeout:fn=>callback=fn}).runAnalysis();
engine(b,corrected,delayed);callback();assert.equal(delayed.analysisSnapshotRef.current,null);assert.deepEqual(delayed.scanResults,[]);
const restored={scanResults:structuredClone(state.scanResults)};
await engine(a,corrected,restored).initiateUpdate();assert.ok(!restored.output);
const duringMerge={scanResults:[]};engine(a,corrected,duringMerge).runAnalysis();
await engine(a,corrected,duringMerge,{setTimeout:fn=>{duringMerge.analysisKeyRef.current='changed';fn();}}).initiateUpdate();
assert.ok(!duringMerge.output);
fs.mkdirSync('artifacts/reference-updater-stale-analysis-fix',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-stale-analysis-fix/results.json',JSON.stringify([{name:'fresh-analysis',original:a,updated:corrected,output:state.output}],null,2));
console.log('8 stale-analysis regression scenarios passed.');
