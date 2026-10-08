import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,b,corrected,ref,book,sourceText} from '../../tests/reference-updater-harness.mjs';
const results=[];
async function exercise(name,original,updated,options={},mutate) {
    const state={scanResults:[]};engine(original,updated,state,options).runAnalysis();
    const analysis=structuredClone(state.scanResults);
    if(mutate) mutate(state);
    await engine(original,updated,state,options).initiateUpdate();
    const row={name,original,updated,analysis,finalAnalysis:state.scanResults,output:state.output??null,toasts:state.toasts};results.push(row);return row;
}
const orig=a.replaceAll('bb5','bb0005'),other=b.replaceAll('bb10','bb0010');
// Preserving incoming outer IDs can collide with unchanged original entries.
let r=await exercise('preserve-off-matched-id-collision',orig+other,corrected.replaceAll('bb900','bb0010'),{preserveIds:false});
assert.equal((r.output.match(/<ce:bib-reference id="bb0010"/g)||[]).length,2);
// A link from another bibliography entry never sees the first entry's renaming map.
const updatedOther=other.replaceAll('bb0010','bb0905').replaceAll('rf10','rf905').replaceAll('se10','se905').replace('</sb:reference>','<sb:comment><ce:cross-ref id="cf0905" refid="bb0900">First paper</ce:cross-ref></sb:comment></sb:reference>');
r=await exercise('cross-entry-links-not-remapped',orig+other,corrected.replaceAll('bb900','bb0900')+updatedOther);
assert.ok(r.output.includes('refid="bb0900"'));assert.ok(!/\sid="bb0900"/.test(r.output));
// Cross-ref IDs are not standardized/reserved at output, despite valid separate inputs.
const originalCross=other.replace('</sb:reference>','<sb:comment><ce:cross-ref id="cf0900" refid="bb0010">Details</ce:cross-ref></sb:comment></sb:reference>');
const incomingCross=corrected.replace('</sb:reference>','<sb:comment><ce:cross-ref id="cf0900" refid="bb0900">Details</ce:cross-ref></sb:comment></sb:reference>').replaceAll('bb900','bb0900');
r=await exercise('unmanaged-cross-ref-id-collision',orig+originalCross,incomingCross);
assert.equal((r.output.match(/\sid="cf0900"/g)||[]).length,2);
// Commented-out bibliography entries are parsed as real references.
r=await exercise('commented-reference-emitted',orig,corrected+'<!--'+other+'-->');
assert.equal(r.analysis.length,2);assert.ok(r.output.includes('Unrelated Beta study'));assert.ok(!r.output.includes('<!--'));
// Choosing a different incoming candidate leaves the displaced incoming row unrepresented.
const mk=(id,title)=>ref('bb'+id,'Smith, 2020',book('rf'+id,'Smith','2020',title)+sourceText('se'+id,title));
const nameOriginal=mk('0005','Alpha');
const candidates=mk('0900','Alpha revised')+mk('0905','Other');
const candidateState={scanResults:[]};engine(nameOriginal,candidates,candidateState).runAnalysis();
const primary=candidateState.scanResults.find(x=>x.candidateSource==='updated');assert.ok(primary);assert.equal(primary.updatedIndex,0);
const alternate=(primary.candidates||primary.potentialMatches).find(x=>x.index===1);assert.ok(alternate);
engine(nameOriginal,candidates,candidateState).chooseReviewCandidate(alternate,primary);
assert.equal(candidateState.scanResults.filter(x=>x.updatedIndex===0).length,0);
assert.equal(candidateState.scanResults.filter(x=>x.updatedIndex===1).length,2);
engine(nameOriginal,candidates,candidateState).mergeDuplicate(primary.uid,0);
const secondary=candidateState.scanResults.find(x=>x.candidateSource==='original');assert.ok(secondary);
engine(nameOriginal,candidates,candidateState).splitMatch(secondary);
await engine(nameOriginal,candidates,candidateState).initiateUpdate();
assert.ok(!candidateState.output.includes('Alpha revised'));
assert.equal((candidateState.output.match(/<sb:maintitle>Other<\/sb:maintitle>/g)||[]).length,2);
results.push({name:'candidate-switch-loses-displaced-update',original:nameOriginal,updated:candidates,finalAnalysis:candidateState.scanResults,output:candidateState.output});
// Splitting a selected shared match should not let an unselected row swallow the incoming entry.
const sharedOriginal=nameOriginal+nameOriginal.replaceAll('0005','0010');
const sharedUpdated=mk('0900','Other');
r=await exercise('split-with-deselected-shared-match',sharedOriginal,sharedUpdated,{},state=>{
    assert.equal(state.scanResults.length,2);state.scanResults[1].selected=false;
    engine(sharedOriginal,sharedUpdated,state).splitMatch(state.scanResults[0]);
});
assert.ok(!r.output.includes('Other'));assert.equal(r.finalAnalysis.filter(x=>x.status==='add').length,0);
// Existing known defects remain reproducible.
r=await exercise('malformed-xml-still-emitted',orig,corrected.replace('</sb:maintitle>',''));
assert.ok(r.output);assert.ok(r.toasts.some(t=>t.type==='success'));
const dragged={scanResults:[]};engine(orig+other,corrected,dragged).runAnalysis();
const before=engine(orig+other,corrected,dragged).projectedSequence.map(x=>x.id);
engine(orig+other,corrected,dragged,{draggedItemIndex:0}).handleDrop(1);
assert.deepEqual(engine(orig+other,corrected,dragged).projectedSequence.map(x=>x.id),before);
results.push({name:'drag-order-still-reset',before,after:before});
fs.writeFileSync('artifacts/reference-updater-followup-audit/results.json',JSON.stringify(results,null,2));
console.log(results.map(x=>x.name).join('\n'));
