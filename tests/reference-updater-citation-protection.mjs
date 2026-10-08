import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine} from './reference-updater-harness.mjs';
const fixtures=JSON.parse(fs.readFileSync('artifacts/reference-updater-severe-audit/results.json','utf8'));
const {original,updated}=fixtures[0];
let state={scanResults:[]};engine(original,updated,state,{preserveIds:false}).runAnalysis();
await engine(original,updated,state,{preserveIds:false}).initiateUpdate();
assert.ok(state.output.includes('id="bb0005"'));assert.ok(!state.output.includes('id="bb0900"'));
const output=state.output;
for (const link of ['<ce:cross-ref refid="bb0005">[1]</ce:cross-ref>',
    '<ce:cross-refs refid="external bb0005">[1]</ce:cross-refs>',
    '<ce:inter-ref xlink:href="#bb0005">[1]</ce:inter-ref>']) {
    const article=`<article><body>${link}</body><ce:bibliography>${original}</ce:bibliography></article>`;
    state={scanResults:[]};engine(article,updated,state).runAnalysis();state.scanResults[0].selected=false;state.output='old output';
    await engine(article,updated,state).initiateUpdate();assert.equal(state.output,'');
    assert.ok(state.toasts.some(t=>t.type==='error'&&t.msg.includes('Citation target bb0005')));
}
const internalArticle=`<article><body><ce:cross-ref refid="rf0005">details</ce:cross-ref></body><ce:bibliography>${original}</ce:bibliography></article>`;
state={scanResults:[]};engine(internalArticle,updated,state).runAnalysis();state.scanResults[0].selected=false;
await engine(internalArticle,updated,state).initiateUpdate();assert.ok(!state.output);
assert.ok(state.toasts.some(t=>t.msg.includes('Citation target rf0005')));
const uncitedArticle=`<article><body>Unlinked text</body><ce:bibliography>${original}</ce:bibliography></article>`;
state={scanResults:[]};engine(uncitedArticle,updated,state).runAnalysis();state.scanResults[0].selected=false;
await engine(uncitedArticle,updated,state).initiateUpdate();assert.equal(state.output,'');
assert.ok(state.toasts.some(t=>t.type==='success'));
state={scanResults:[]};engine(original,updated,state).runAnalysis();state.output=output;
state.scanResults[0]={...state.scanResults[0],status:'conflict',reviewed:false};
await engine(original,updated,state).initiateUpdate();assert.equal(state.output,'');
assert.ok(state.toasts.some(t=>t.msg.includes('Review required')));
state={scanResults:[]};engine(original,updated,state).runAnalysis();state.scanResults[0].selected=false;
await engine(original,updated,state).initiateUpdate();assert.equal(state.output,'');
assert.ok(state.toasts.some(t=>t.type==='warn'&&t.msg.includes('Body citations were not supplied')));
const baseline=fs.readFileSync('C:/Users/Kevin/AppData/Local/Temp/xml-renumber-author-date-h7oB4w/baseline.xml','utf8');
const article=baseline.replace(/<ce:bib-reference\b[^>]*>[\s\S]*?<\/ce:bib-reference>/,original.replace('se0005','se8005'));
state={scanResults:[]};engine(article,updated,state,{preserveIds:false}).runAnalysis();
await engine(article,updated,state,{preserveIds:false}).initiateUpdate();assert.ok(state.output.includes('id="bb0005"'));
fs.mkdirSync('artifacts/reference-updater-citation-protection',{recursive:true});
fs.writeFileSync('artifacts/reference-updater-citation-protection/results.json',JSON.stringify([{name:'matched-id-protected',original,updated,output}],null,2));
console.log('9 citation protection scenarios passed.');
