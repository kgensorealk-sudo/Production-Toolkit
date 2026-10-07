import assert from 'node:assert/strict';
import {engine,a,ref,book,sourceText} from './reference-updater-harness.mjs';

const incoming=(id,title)=>ref(id,'New item',book('rf950','Adams','2019',title,'10.1234/'+title)+sourceText('se950',title));
async function merge(original,updated,options={}) {
    const state={scanResults:[]};engine(original,updated,state,options).runAnalysis();
    await engine(original,updated,state,options).initiateUpdate();
    assert.ok(state.output);
    const ids=Array.from(state.output.matchAll(/<ce:bib-reference\b[^>]*\bid="([^"]+)"/g),m=>m[1]);
    assert.equal(new Set(ids).size,ids.length);
    return ids;
}
assert.deepEqual(await merge(a,incoming('bb900','Novel')),['bb5','bb3000']);
assert.deepEqual(await merge(a.replace('id="bb5"','id="bb3000"'),incoming('bb900','Novel')),['bb3000','bb3005']);
assert.deepEqual(await merge(a,incoming('bb3000','Novel')),['bb5','bb3005']);
assert.deepEqual(await merge(a,incoming('bb900','Novel'),{preserveIds:false}),['bb5','bb3000']);
assert.deepEqual(await merge(a,incoming('bb3000','Novel').replace('id="bb3000"',"id='bb3000'")),['bb5','bb3005']);
assert.deepEqual(await merge(a,incoming('bb900','Novel')+incoming('bb905','Other novel').replace(/rf950/g,'rf955').replace(/se950/g,'se955')),['bb5','bb3000','bb3005']);
console.log('6 added-reference ID regression scenarios passed.');
