import assert from 'node:assert/strict';
import {engine,a,corrected,ref,book} from './reference-updater-harness.mjs';
for(const incoming of [a.replace(/5"/g,'900"').replace('[1]','[99]'),corrected.replace('[1]','[99]')]) {
    const state={scanResults:[]};engine(a,incoming,state).runAnalysis();
    const warning=state.scanResults[1];assert.equal(warning.originalIndex,null);assert.equal(warning.status,'conflict');
    assert.ok(warning.numberingWarning.includes('Incoming [99]'));assert.ok(warning.numberingWarning.includes('existing [1]'));
    assert.equal(warning.candidates,undefined);assert.equal(warning.potentialMatches,undefined);
    await engine(a,incoming,state,{autoUpdateSmartMatch:true}).initiateUpdate();assert.ok(!state.output);
    warning.selected=false;await engine(a,incoming,state).initiateUpdate();assert.equal(state.output,a);
}
const old=ref('bb5','[1]',book('rf5','Smith','2020','Exact title'));
const incoming=old.replace(/5"/g,'900"').replace('[1]','[99]');
const contentOnly={scanResults:[]};engine(old,incoming,contentOnly).runAnalysis();assert.ok(contentOnly.scanResults[1].numberingWarning);
const unrelated={scanResults:[]};engine(old,ref('bb900','[99]',book('rf900','Jones','2024','Different title')),unrelated).runAnalysis();
assert.equal(unrelated.scanResults[1].numberingWarning,undefined);assert.equal(unrelated.scanResults[1].status,'add');
const sameNumber={scanResults:[]};engine(a,corrected,sameNumber).runAnalysis();assert.equal(sameNumber.scanResults[0].numberingWarning,undefined);
console.log('5 numbering warning scenarios passed.');
