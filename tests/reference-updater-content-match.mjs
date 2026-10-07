import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book,sourceText,a} from './reference-updater-harness.mjs';

const results=[];
async function check(name,original,updated,verify,options={}) {
    const state={scanResults:[]};
    engine(original,updated,state,options).runAnalysis();
    await engine(original,updated,state,options).initiateUpdate();
    verify(state);
    results.push({name,original,updated,output:state.output??null,analysis:state.scanResults});
}
const original=ref('bb5','[1]',book('rf5','张','2020','甲乙研究')+sourceText('se5','甲乙研究。'));
const unrelated=ref('bb900','[1]',book('rf900','李','2020','丙丁分析')+sourceText('se900','丙丁分析。'));
await check('unicode-collision',original,unrelated,state=>{
    assert.equal(state.scanResults[0].status,'unchanged');
    assert.ok(state.output.includes('甲乙研究'));
    assert.ok(!state.output.includes('丙丁分析'));
},{addOrphans:false,autoUpdateSmartMatch:true});
for(const label of ['[1]','Smith, 2020']) {
    const old=ref('bb5',label,book('rf5','Smith','2020','Alpha','10.1234/a-b'));
    const next=ref('bb900',label,book('rf900','Smith','2020','Alpha','10.1234/ab'));
    await check('doi-conflict-'+label,old,next,state=>{
        assert.equal(state.scanResults[0].status,'conflict');
        assert.notEqual(state.scanResults[0].matchType,'Content');
        assert.equal(state.output,undefined);
        assert.ok(state.toasts.some(t=>t.msg.includes('Review required')));
    },{autoUpdateSmartMatch:true});
}
await check('identical-unicode-content',original,original.replace(/5"/g,'900"'),state=>{
    assert.equal(state.scanResults[0].matchType,'Content');
    assert.ok(state.output.includes('甲乙研究'));
});
await check('identical-content',a,a.replace(/5"/g,'900"'),state=>{
    assert.equal(state.scanResults[0].matchType,'Content');
    assert.ok(state.output.includes('id="bb5"'));
});
const parsed=engine('','').parseReferences(original)[0];
assert.equal(parsed.author,'张');assert.equal(parsed.title,'甲乙研究');
const parser=engine('','').parseReferences;
assert.notEqual(parser(ref('bb5','[1]',book('rf5','Smith','2020','A-B')))[0].contentHash,
    parser(ref('bb900','[1]',book('rf900','Smith','2020','AB')))[0].contentHash);
// Explicit approval of a DOI correction must still permit the corrected DOI to be retained.
const doiOriginal=ref('bb5','[1]',book('rf5','Smith','2020','Alpha','10.1234/a-b'));
const doiUpdated=ref('bb900','[1]',book('rf900','Smith','2020','Alpha','10.1234/ab'));
const approved={scanResults:[]};
engine(doiOriginal,doiUpdated,approved).runAnalysis();
approved.scanResults[0]={...approved.scanResults[0],reviewed:true,status:'smart_match'};
await engine(doiOriginal,doiUpdated,approved).initiateUpdate();
assert.ok(approved.output.includes('10.1234/ab'));
assert.ok(approved.output.includes('id="bb5"'));
fs.mkdirSync('artifacts/reference-updater-content-fix',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-content-fix/results.json',JSON.stringify(results,null,2));
console.log('6 content-match regression scenarios and Unicode/punctuation assertions passed.');
