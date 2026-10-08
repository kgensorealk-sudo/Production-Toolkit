import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,ref,book,sourceText} from '../../tests/reference-updater-harness.mjs';
const original=ref('bb0005','[1]',book('rf0005','Smith','2020','Alpha evidence','10.1000/alpha')+sourceText('se0005','Alpha evidence.'));
const updated=ref('bb0900','[1]',book('rf0900','Smith','2020','Corrected Alpha evidence','10.1000/alpha')+sourceText('se0900','Corrected Alpha evidence.'));
const results=[];
// Original body citation targets are outside the generated bibliography.
let state={scanResults:[]};engine(original,updated,state,{preserveIds:false}).runAnalysis();
await engine(original,updated,state,{preserveIds:false}).initiateUpdate();
assert.ok(state.output.includes('id="bb0900"'));assert.ok(!state.output.includes('id="bb0005"'));
results.push({name:'preserve-off-breaks-body-target',original,updated,output:state.output});
// Deselecting the sole reference succeeds with an empty result.
state={scanResults:[]};engine(original,updated,state).runAnalysis();state.scanResults[0].selected=false;
await engine(original,updated,state).initiateUpdate();assert.equal(state.output,'');
results.push({name:'deselection-breaks-body-target',original,updated,output:state.output});
// Review changes do not clear the previously generated result on blocked merges.
state={scanResults:[]};engine(original,updated,state).runAnalysis();await engine(original,updated,state).initiateUpdate();
const prior=state.output;state.scanResults[0]={...state.scanResults[0],status:'conflict',reviewed:false};
await engine(original,updated,state).initiateUpdate();assert.equal(state.output,prior);
assert.ok(state.toasts.some(x=>x.msg.includes('Review required')));
results.push({name:'blocked-merge-retains-stale-output',original,updated,output:state.output});
const undeclared=updated.replace('Corrected Alpha evidence</sb:maintitle>','Corrected &undefinedEntity; evidence</sb:maintitle>');
state={scanResults:[]};engine(original,undeclared,state).runAnalysis();await engine(original,undeclared,state).initiateUpdate();
assert.ok(state.output.includes('&undefinedEntity;'));
results.push({name:'undeclared-entity-emitted',original,updated:undeclared,output:state.output});
// Namespace bindings declared on a supplied wrapper disappear from the result.
const wrapped=`<root xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/struct-bib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink">${original}</root>`;
state={scanResults:[]};engine(wrapped,updated,state).runAnalysis();await engine(wrapped,updated,state).initiateUpdate();
assert.ok(state.output.includes('<ce:bib-reference'));assert.ok(!state.output.includes('xmlns:ce'));
// Bibliography fragments normally inherit article bindings: record as a boundary, not a severe bug.
results.push({name:'namespace-wrapper-boundary',original:wrapped,updated,output:state.output,severe:false});
const baseline=fs.readFileSync('C:/Users/Kevin/AppData/Local/Temp/xml-renumber-author-date-h7oB4w/baseline.xml','utf8');
const article=baseline.replace(/<ce:bib-reference\b[^>]*>[\s\S]*?<\/ce:bib-reference>/,original.replace('se0005','se8005'));
assert.ok(/refid="[^"]*\bbb0005\b/.test(article));
const fullArticle={scanResults:[]};engine(article,updated,fullArticle,{preserveIds:false}).runAnalysis();
await engine(article,updated,fullArticle,{preserveIds:false}).initiateUpdate();
assert.ok(fullArticle.output);assert.ok(!fullArticle.output.includes('id="bb0005"'));
results[0].reproducedWithFullArticleInput=true;
fs.writeFileSync('artifacts/reference-updater-severe-audit/results.json',JSON.stringify(results,null,2));
console.log('Reproduced 4 severe cases; recorded namespace fragment boundary.');
