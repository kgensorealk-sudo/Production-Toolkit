import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book,sourceText,a,corrected} from './reference-updater-harness.mjs';

const results=[];
async function merge(original,updated,options={}) {
    const state={scanResults:[]};
    engine(original,updated,state,options).runAnalysis();
    await engine(original,updated,state,options).initiateUpdate();
    return state;
}

for (const label of ['[1]','1','1.','(1)','[ 1 ]']) {
    const original=a.replace('[1]',label);
    const unrelated=ref('bb900',label,book('rf900','Jones','2022','Completely different paper','10.9999/different')+sourceText('se900','Different paper.'));
    const state=await merge(original,unrelated,{addOrphans:false});
    assert.equal(state.scanResults[0].status,'unchanged',label);
    assert.equal(state.scanResults[0].updatedIndex,null,label);
    assert.ok(state.output.includes('Alpha evidence'),label);
    assert.ok(!state.output.includes('Completely different paper'),label);
    results.push({name:label==='[1]'?'numeric-label-wrong-paper':`numeric-label-${results.length}`,original,updated:unrelated,output:state.output});
}

// Enabling additions must keep the original rather than overwrite its citation target.
const unrelated=results[0].updated;
const added=await merge(a,unrelated);
assert.equal(added.scanResults[0].status,'unchanged');
assert.equal(added.scanResults[1].status,'add');
assert.match(added.output,/<ce:bib-reference id="bb5"[^>]*>[\s\S]*?Alpha evidence/);
assert.ok(added.output.includes('Completely different paper'));

// A genuine DOI-linked correction continues to update and preserve the body target ID.
const genuine=await merge(a,corrected);
assert.equal(genuine.scanResults[0].matchType,'DOI');
assert.equal(genuine.scanResults[0].status,'update');
assert.ok(genuine.output.includes('Corrected Alpha evidence'));
assert.ok(genuine.output.includes('id="bb5"'));
results.push({name:'genuine-doi-correction',original:a,updated:corrected,output:genuine.output});

// Descriptive label matching remains available for nonnumeric labels.
const descriptive=await merge(a.replace('[1]','Smith, 2020'),corrected.replace('[1]','Smith, 2020').replace('10.1234/alpha','10.1234/corrected'));
assert.equal(descriptive.scanResults[0].matchType,'Label');

fs.mkdirSync('artifacts/reference-updater-numeric-label-fix',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-numeric-label-fix/results.json',JSON.stringify(results,null,2));
console.log('8 numeric-label regression scenarios passed.');
