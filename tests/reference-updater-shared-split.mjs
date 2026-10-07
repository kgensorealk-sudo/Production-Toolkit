import assert from 'node:assert/strict';
import {engine,ref,book,sourceText} from './reference-updater-harness.mjs';
const mk=(id,title)=>ref('bb'+id,'Smith et al., 2020',book('rf'+id,'Smith','2020',title)+sourceText('se'+id,title));
const originals=mk('0005','Original first paper')+mk('0010','Original second paper');
const incoming=mk('0900','Incoming third paper');
for(const [order,original,expected] of [[[0,1],originals,'bb3000'],[[1,0],originals,'bb3000'],[[0,1],originals.replace('id="bb0010"','id="bb3000"'),'bb3005']]) {
    const state={scanResults:[]};engine(original,incoming,state).runAnalysis();
    const matches=state.scanResults.filter(r=>r.originalIndex!==null&&r.updatedIndex===0);
    assert.equal(matches.length,2);assert.ok(matches.every(r=>r.status==='conflict'));
    for(const index of order) {
        const current=state.scanResults.find(r=>r.uid===matches[index].uid);
        engine(original,incoming,state).splitMatch(current);
    }
    assert.equal(state.scanResults.filter(r=>r.status==='unchanged').length,2);
    assert.equal(state.scanResults.filter(r=>r.status==='add').length,1);
    await engine(original,incoming,state).initiateUpdate();assert.ok(state.output);
    const ids=Array.from(state.output.matchAll(/<ce:bib-reference\b[^>]*\bid="([^"]+)"/g),m=>m[1]);
    assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert.ok(ids.includes(expected));
    assert.ok(state.output.includes('Original first paper'));assert.ok(state.output.includes('Original second paper'));
    assert.equal((state.output.match(/<sb:maintitle>Incoming third paper<\/sb:maintitle>/g)||[]).length,1);
    console.log(`Split order ${order.join(',')}: two originals retained, one incoming addition with ${expected}.`);
}
