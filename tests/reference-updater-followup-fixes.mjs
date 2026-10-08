import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,b,corrected,ref,book,sourceText} from './reference-updater-harness.mjs';
const old=JSON.parse(fs.readFileSync('artifacts/reference-updater-followup-audit/results.json','utf8'));
const results=[];
async function merge(name,options={}) {
    const fixture=old.find(x=>x.name===name),state={scanResults:[]};
    engine(fixture.original,fixture.updated,state,options).runAnalysis();
    await engine(fixture.original,fixture.updated,state,options).initiateUpdate();
    assert.ok(state.output,name);results.push({...fixture,output:state.output});return state;
}
let state=await merge('preserve-off-matched-id-collision',{preserveIds:false});
assert.ok(state.output.includes('id="bb0005"'));assert.equal((state.output.match(/id="bb0010"/g)||[]).length,1);
state=await merge('cross-entry-links-not-remapped');
assert.ok(state.output.includes('refid="bb0005"'));assert.ok(!state.output.includes('refid="bb0900"'));
state=await merge('unmanaged-cross-ref-id-collision');
assert.equal((state.output.match(/\sid="cf0900"/g)||[]).length,1);assert.ok(state.output.includes('id="cf0905"'));
state=await merge('commented-reference-emitted');assert.equal(state.scanResults.length,1);assert.ok(!state.output.includes('Unrelated Beta study'));
// Switch candidates: retain the displaced incoming row, absorb the new candidate's pseudo-row.
const fixture=old.find(x=>x.name==='candidate-switch-loses-displaced-update');
state={scanResults:[]};engine(fixture.original,fixture.updated,state).runAnalysis();
let primary=state.scanResults.find(x=>x.candidateSource==='updated');
engine(fixture.original,fixture.updated,state).chooseReviewCandidate((primary.candidates||primary.potentialMatches).find(x=>x.index===1),primary);
assert.equal(state.scanResults.filter(x=>x.updatedIndex===0).length,1);assert.equal(state.scanResults.filter(x=>x.updatedIndex===1).length,1);
primary=state.scanResults.find(x=>x.uid===primary.uid);engine(fixture.original,fixture.updated,state).mergeDuplicate(primary.uid,0);
await engine(fixture.original,fixture.updated,state).initiateUpdate();assert.ok(!state.output);
state.scanResults=state.scanResults.map(x=>x.originalIndex===null?{...x,reviewed:true,status:'smart_match'}:x);
await engine(fixture.original,fixture.updated,state).initiateUpdate();
assert.equal((state.output.match(/<sb:maintitle>Other<\/sb:maintitle>/g)||[]).length,1);assert.ok(state.output.includes('Alpha revised'));
results.push({...fixture,output:state.output});
const back={scanResults:[]};engine(fixture.original,fixture.updated,back).runAnalysis();
for (const index of [1,0]) {
    const current = back.scanResults.find(x=>x.candidateSource==='updated');
    engine(fixture.original,fixture.updated,back).chooseReviewCandidate((current.candidates||current.potentialMatches).find(x=>x.index===index),current);
    assert.equal(back.scanResults.filter(x=>x.updatedIndex===0).length,1);
    assert.equal(back.scanResults.filter(x=>x.updatedIndex===1).length,1);
}
const splitFixture=old.find(x=>x.name==='split-with-deselected-shared-match');
state={scanResults:[]};engine(splitFixture.original,splitFixture.updated,state).runAnalysis();state.scanResults[1].selected=false;
engine(splitFixture.original,splitFixture.updated,state).splitMatch(state.scanResults[0]);
await engine(splitFixture.original,splitFixture.updated,state).initiateUpdate();assert.ok(state.output.includes('Other'));assert.ok(state.output.includes('id="bb3000"'));
results.push({...splitFixture,output:state.output});
const malformed=old.find(x=>x.name==='malformed-xml-still-emitted');
state={scanResults:[]};engine(malformed.original,malformed.updated,state).runAnalysis();
assert.deepEqual(state.scanResults,[]);assert.ok(!state.output);assert.ok(state.toasts.some(x=>x.type==='error'&&x.msg.includes('Invalid XML')));
const dragged={scanResults:[]};engine(a+b,corrected,dragged).runAnalysis();
engine(a+b,corrected,dragged,{draggedItemIndex:0}).handleDrop(1);
assert.deepEqual(engine(a+b,corrected,dragged).projectedSequence.map(x=>x.id),['bb10','bb5']);
await engine(a+b,corrected,dragged).initiateUpdate();assert.ok(dragged.output.indexOf('Unrelated Beta study')<dragged.output.indexOf('Corrected Alpha evidence'));
results.push({name:'drag-order-preserved',original:(a+b).replaceAll('bb5','bb0005').replaceAll('bb10','bb0010'),updated:corrected,
    output:dragged.output.replaceAll('bb5','bb0005').replaceAll('bb10','bb0010')});
// Fake reference markup in CDATA is text, not an added reference.
const cdata=a.replace('Alpha evidence.</ce:source-text>',`<![CDATA[${b}]]></ce:source-text>`);
assert.equal(engine('','').parseReferences(cdata).length,1);
for(const xml of [a.replace('id="bb5"','id="bb5" id="another"'),a.replace('Alpha evidence.','Bad & text'),a.replace('</sb:reference>','</sb:book>')])
    assert.throws(()=>engine('','').parseReferences(xml),/Invalid XML/);
// Duplicate unmanaged IDs are blocked when standardization is deliberately disabled.
const collision=old.find(x=>x.name==='unmanaged-cross-ref-id-collision');
state={scanResults:[]};engine(collision.original,collision.updated,state,{renumberInternal:false}).runAnalysis();
await engine(collision.original,collision.updated,state,{renumberInternal:false}).initiateUpdate();
assert.ok(!state.output);assert.ok(state.toasts.some(x=>x.type==='error'&&x.msg.includes('Duplicate ID')));
const oldLink=ref('bb0005','Other reference',"<ce:other-ref id='or0005'><ce:textref id='tr0005'>Old text.</ce:textref></ce:other-ref>")+b.replaceAll('bb10','bb0010').replaceAll('rf10','rf0010').replaceAll('se10','se0010');
const newLink=ref('bb0900','Other reference',"<ce:other-ref id='or0900'><ce:textref id='tr0&#57;00'>New text <ce:cross-ref id='cf0900' refid='tr0&#57;00'>details</ce:cross-ref> <ce:cross-refs id='cf0910' refid='bb0&#57;00&#x20;bb0010'>related references</ce:cross-refs> <ce:inter-ref id='ir0900' xlink:href='https://example.org/?a=1&amp;b=2'>web</ce:inter-ref>.</ce:textref></ce:other-ref>");
state={scanResults:[]};engine(oldLink,newLink,state).runAnalysis();engine(oldLink,newLink,state).mergeDuplicate(state.scanResults[0].uid,0);
await engine(oldLink,newLink,state).initiateUpdate();
assert.ok(state.output.includes("refid='tr0005'"));assert.ok(state.output.includes("refid='bb0005 bb0010'"));assert.ok(state.output.includes('a=1&amp;b=2'));
results.push({name:'encoded-link-targets',original:oldLink,updated:newLink,output:state.output});
assert.throws(()=>engine('','').parseReferences(a.replace('Alpha evidence.','&#0;')),/Invalid XML character/);
assert.throws(()=>engine('','').parseReferences(a+a.replace('bb5','bb&#53;').replaceAll('rf5','rf905').replaceAll('se5','se905')),/Duplicate ID bb5/);
assert.throws(()=>engine('','').parseReferences(a+'unwrapped text'),/Text outside XML elements/);
assert.throws(()=>engine('','').parseReferences(a.replace('<sb:host>','<sb:host><!DOCTYPE article>')),/DOCTYPE/);
const secondaryMerge={scanResults:[]};engine(fixture.original,fixture.updated,secondaryMerge).runAnalysis();
const secondary=secondaryMerge.scanResults.find(x=>x.candidateSource==='original');
assert.ok(secondary);engine(fixture.original,fixture.updated,secondaryMerge).mergeDuplicate(secondary.uid,secondary.originalIndex);
assert.equal(secondaryMerge.scanResults.filter(x=>x.updatedIndex===0).length,1);
assert.equal(secondaryMerge.scanResults.filter(x=>x.updatedIndex===1).length,1);
await engine(fixture.original,fixture.updated,secondaryMerge).initiateUpdate();assert.ok(!secondaryMerge.output);
secondaryMerge.scanResults=secondaryMerge.scanResults.map(x=>x.originalIndex===null?{...x,reviewed:true,status:'add'}:x);
await engine(fixture.original,fixture.updated,secondaryMerge).initiateUpdate();
assert.ok(secondaryMerge.output.includes('Alpha revised'));assert.equal((secondaryMerge.output.match(/<sb:maintitle>Other<\/sb:maintitle>/g)||[]).length,1);
const repeatedSplit={scanResults:[]};engine(a,corrected,repeatedSplit).runAnalysis();
const requested=repeatedSplit.scanResults[0];engine(a,corrected,repeatedSplit).splitMatch(requested);
engine(a,corrected,repeatedSplit).splitMatch(requested);
assert.equal(repeatedSplit.scanResults.length,2);assert.equal(repeatedSplit.scanResults.filter(x=>x.originalIndex===null).length,1);
await engine(a,corrected,repeatedSplit).initiateUpdate();assert.ok(repeatedSplit.output.includes('bb3000'));
fs.mkdirSync('artifacts/reference-updater-followup-fixes',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-followup-fixes/results.json',JSON.stringify(results,null,2));
console.log('21 follow-up regression scenarios passed.');
