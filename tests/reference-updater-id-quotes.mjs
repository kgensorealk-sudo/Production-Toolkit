import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,corrected,ref} from './reference-updater-harness.mjs';
const singles=xml=>xml.replace(/\bid="([^"]+)"/g,"id = '$1'");
const results=[];
for(const [name,original,updated] of [['single-original',singles(a),corrected],['single-updated',a,singles(corrected)],['both-single',singles(a),singles(corrected)]]) {
    const state={scanResults:[]};engine(original,updated,state).runAnalysis();
    assert.equal(state.scanResults[0].id,'bb5');
    await engine(original,updated,state).initiateUpdate();
    for(const id of ['bb5','rf5','se5']) assert.ok(state.output.includes(`id="${id}"`));
    assert.ok(!state.output.includes('bb_fallback'));
    results.push({name,original,updated,output:state.output});
}
const original=singles(a),unchanged={scanResults:[]};engine(original,corrected,unchanged).runAnalysis();
unchanged.scanResults[0]={...unchanged.scanResults[0],status:'unchanged',updatedIndex:null};
await engine(original,corrected,unchanged).initiateUpdate();assert.equal(unchanged.output,original);
const oldOther=ref('bb0005','Other reference',"<ce:other-ref id = 'or0005'><ce:textref id = 'tr0005'>Old text.</ce:textref></ce:other-ref>");
const newOther=ref('bb0900','Other reference',"<ce:other-ref id = 'or0900'><ce:textref id = 'tr0900'>New text <ce:cross-ref id='cf0900' refid='tr0900'>details</ce:cross-ref>.</ce:textref></ce:other-ref>");
const linked={scanResults:[]};engine(oldOther,newOther,linked).runAnalysis();
engine(oldOther,newOther,linked).mergeDuplicate(linked.scanResults[0].uid,0);
await engine(oldOther,newOther,linked).initiateUpdate();
assert.ok(linked.output.includes('id="tr0005"'));assert.ok(linked.output.includes("refid='tr0005'"));
fs.mkdirSync('artifacts/reference-updater-id-quotes-fix',{recursive:true});
// Full article body citations target bb0005; use that ID consistently in fixture copies.
fs.writeFileSync('artifacts/reference-updater-id-quotes-fix/results.json',JSON.stringify(results.map(r=>({...r,original:r.original.replaceAll('bb5','bb0005'),updated:r.updated,output:r.output.replaceAll('bb5','bb0005')})),null,2));
console.log('5 ID quote regression scenarios passed.');
