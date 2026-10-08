import assert from 'node:assert/strict';
import {engine,a,corrected} from './reference-updater-harness.mjs';
const links=ids=>`<sb:comment>${ids.map(id=>`<ce:inter-ref id="${id}" xlink:href="https://example.org">Link</ce:inter-ref>`).join(' ')}</sb:comment>`;
const withLinks=(xml,ids)=>xml.replace('</sb:reference>',links(ids)+'</sb:reference>');
async function merge(ids){
    const original=withLinks(a,ids),updated=withLinks(corrected,[...ids,'incoming-new-link']);
    const state={scanResults:[]};engine(original,updated,state).runAnalysis();
    await engine(original,updated,state).initiateUpdate();return state;
}
const first=await merge(['ir0005','ir0010']);
assert.ok(first.output.includes('id="ir0015"'));
const used=Array.from({length:1998},(_,i)=>`ir${String((i+1)*5).padStart(4,'0')}`);
const last=await merge(used);
assert.ok(last.output.includes('id="ir9995"'));
assert.ok(!last.output.includes('id="ir10000"'));
const exhausted=await merge([...used,'ir9995']);
assert.ok(!exhausted.output);
assert.ok(exhausted.toasts.some(t=>t.type==='error'&&t.msg.includes('0005–9995')));
console.log('3 ID range regression scenarios passed, including exhaustion.');
