import assert from 'node:assert/strict';
import {engine,a,b,corrected} from './reference-updater-harness.mjs';
const article=`<article><body><ce:para><ce:cross-refs refid="bb5 bb10">[1,2]</ce:cross-refs></ce:para></body><ce:bibliography>${a}${b}</ce:bibliography></article>`;
const state={scanResults:[]};
engine(article,corrected,state).runAnalysis();
engine(article,corrected,state,{draggedItemIndex:0}).handleDrop(1);
await engine(article,corrected,state).initiateUpdate();
assert.ok(state.output,JSON.stringify(state.toasts));
assert.deepEqual(engine(state.output,'').parseReferences(state.output).map(r=>r.id),['bb10','bb5']);
assert.ok(state.output.includes('<ce:cross-refs refid="bb5 bb10">[1,2]</ce:cross-refs>'));
// Discard an incoming correction by splitting then deselecting the addition.
const discard={scanResults:[]};engine(article,corrected,discard).runAnalysis();
engine(article,corrected,discard).splitMatch(discard.scanResults.find(r=>r.originalIndex===0));
discard.scanResults=discard.scanResults.map(r=>r.originalIndex===null?{...r,selected:false}:r);
await engine(article,corrected,discard).initiateUpdate();
assert.equal(discard.output,article);
// Removing a cited reference after reordering must still identify its actual owner.
state.scanResults=state.scanResults.map(r=>r.originalIndex===0?{...r,selected:false}:r);
await engine(article,corrected,state).initiateUpdate();
assert.equal(state.output,'');
assert.ok(state.toasts.some(t=>t.msg.includes('Citation target bb5')));
console.log('3 full-article manual review regressions passed.');
