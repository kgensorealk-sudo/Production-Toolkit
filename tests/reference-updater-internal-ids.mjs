import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,a,corrected} from './reference-updater-harness.mjs';

const links=ids=>`<sb:comment>${ids.map((id,i)=>`<ce:inter-ref id="${id}" xlink:href="https://example.org/${i}">Link ${i}</ce:inter-ref>`).join(' ')}</sb:comment>`;
const withLinks=(xml,ids)=>xml.replace('</sb:reference>',links(ids)+'</sb:reference>');
const results=[];
async function check(name,oldIds,newIds,verify) {
    const original=withLinks(a,oldIds),updated=withLinks(corrected,newIds);
    const state={scanResults:[]};engine(original,updated,state).runAnalysis();
    await engine(original,updated,state).initiateUpdate();
    assert.ok(state.output);
    const ids=Array.from(state.output.matchAll(/\sid="([^"]+)"/g),m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,name);
    assert.ok(ids.includes('bb5'));assert.ok(ids.includes('rf5'));assert.ok(ids.includes('se5'));
    const mergedLinks=Array.from(state.output.matchAll(/<ce:inter-ref\b[^>]*\sid="([^"]+)"/g),m=>m[1]);
    verify(mergedLinks);
    results.push({name,original,updated,output:state.output});
}
await check('repeated-internal-ids',['ir5','ir10'],['ir900','ir905'],ids=>assert.deepEqual(ids,['ir5','ir10']));
await check('added-internal-element',['ir5','ir10'],['ir900','ir905','ir3000'],ids=>{
    assert.deepEqual(ids.slice(0,2),['ir5','ir10']);
    assert.equal(ids.length,3);assert.notEqual(ids[2],'ir3000');
});
await check('removed-internal-element',['ir5','ir10'],['ir900'],ids=>assert.deepEqual(ids,['ir5']));
await check('custom-original-ids',['first-link','second-link'],['ir900','ir905'],ids=>assert.deepEqual(ids,['first-link','second-link']));
await check('unchanged-internal-count',[],[],ids=>assert.deepEqual(ids,[]));
fs.mkdirSync('artifacts/reference-updater-internal-id-fix',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-internal-id-fix/results.json',JSON.stringify(results,null,2));
console.log('5 internal ID regression scenarios passed.');
