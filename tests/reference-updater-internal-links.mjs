import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref} from './reference-updater-harness.mjs';
const original=ref('bb0005','Other reference','<ce:other-ref id="or0005"><ce:textref id="tr0005">Original text.</ce:textref></ce:other-ref>');
const updated=ref('bb0900','Other reference',`<ce:other-ref id="or0900"><ce:textref id="tr0900">Corrected text <ce:cross-ref id="cf0900" refid="tr0900">details</ce:cross-ref> <ce:inter-ref id="ir0900" xlink:href="#tr0900">local</ce:inter-ref>.</ce:textref></ce:other-ref>`);
async function merge(old,next,options={}) {
    const state={scanResults:[]};engine(old,next,state,options).runAnalysis();
    const item=state.scanResults.find(r=>r.status==='potential_duplicate');
    if(item) engine(old,next,state,options).mergeDuplicate(item.uid,item.originalIndex);
    await engine(old,next,state,options).initiateUpdate();assert.ok(state.output);return state.output;
}
const output=await merge(original,updated);
assert.ok(output.includes('refid="tr0005"'));assert.ok(output.includes('xlink:href="#tr0005"'));
assert.ok(!output.includes('refid="tr0900"'));
const lists=await merge('<article><body><ce:anchor id="outside"/></body><ce:bibliography>'+original+'</ce:bibliography></article>',updated.replace('refid="tr0900"',"refid='tr0900  or0900 bb0900 outside'").replace('xlink:href="#tr0900"','xlink:href="https://example.org/#tr0900"'));
assert.ok(lists.includes("refid='tr0005  or0005 bb0005 outside'"));
assert.ok(lists.includes('https://example.org/#tr0900'));
const untouched=await merge(original,updated,{renumberInternal:false});
assert.ok(untouched.includes('id="tr0900"'));assert.ok(untouched.includes('refid="tr0900"'));
// A newly allocated element also needs its incoming links remapped.
const added=await merge(original,updated.replace('</ce:textref>','<ce:inter-ref id="ir0905" xlink:href="#ir0900">another</ce:inter-ref></ce:textref>'));
const target=added.match(/<ce:inter-ref id="([^"]+)"/)[1];
assert.ok(added.includes(`xlink:href="#${target}"`));
fs.mkdirSync('artifacts/reference-updater-internal-link-fix',{recursive:true});
// VTool disallows fragment-only URIs on ce:inter-ref; the full article fixture
// uses an allowed external URI and validates the ce:cross-ref target remapping.
const validUpdated=updated.replace('xlink:href="#tr0900"','xlink:href="https://example.org/details"');
const validOutput=await merge(original,validUpdated);
fs.writeFileSync('artifacts/reference-updater-internal-link-fix/results.json',JSON.stringify([{name:'internal-link-remap',original,updated:validUpdated,output:validOutput}],null,2));
console.log('4 internal-link regression scenarios passed.');
