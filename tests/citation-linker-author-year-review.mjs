import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {api,xml} from './id-auditor-final-verification.mjs';
const review={};new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/citationLinkerReview.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(review,()=>xml);
const ref=(id,label,title)=>`<ce:bib-reference id="${id}"><ce:label>${label}</ce:label><ce:other-ref><ce:textref>${title}</ce:textref></ce:other-ref></ce:bib-reference>`;
const original=ref('bb0005','World Health Organization, 2020','Health report')+'<ce:cross-ref>WHO, 2020</ce:cross-ref>';
const state={};api(original,state).runAnalysis();assert.equal(state.rows[0].status,'failed');
assert.deepEqual(review.citationReviewCandidates(original,'WHO, 2020').map(c=>c.id),['bb0005']);
state.rows[0]={...state.rows[0],...review.reviewCitationTarget(original,state.rows[0],'bb0005')};
await api(original,state).executeLink();assert.equal(state.output,original.replace('<ce:cross-ref>','<ce:cross-ref refid="bb0005">'));
assert.deepEqual([...xml.scanReferenceXml(state.output).ids],[...xml.scanReferenceXml(original).ids]);
const smith=ref('bb0005','Smith et al., 2020','Alpha paper')+ref('bb0010','Smith et al., 2020','Beta paper')+'<ce:cross-ref id="cf0005">Smith et al., 2020</ce:cross-ref>';
assert.equal(review.citationReviewCandidates(smith,'Smith et al., 2020').length,2);
const dup={};api(smith,dup).runAnalysis();dup.rows[0]={...dup.rows[0],...review.reviewCitationTarget(smith,dup.rows[0],'bb0010')};await api(smith,dup).executeLink();assert.ok(dup.output.includes('refid="bb0010"'));
assert.throws(()=>review.reviewCitationTarget(smith,dup.rows[0],'nonexistent'),/eligible/);
assert.throws(()=>review.reviewCitationTarget(smith+' ',{...dup.rows[0],originalTag:'stale'},'bb0010'),/stale/);
assert.equal(review.citationReviewCandidates(original,'WHO, 2021').length,0);
assert.equal(review.citationReviewCandidates(original,'WHO, 2020; Smith, 2020').length,0);
assert.equal(review.citationReviewCandidates(original+ref('bb0005','World Health Organization, 2020','Duplicate ID'),'WHO, 2020').length,0);
const linked=original.replace('<ce:cross-ref>','<ce:cross-ref refid="bb0005">');const valid={};api(linked,valid).runAnalysis();await api(linked,valid).executeLink();assert.equal(valid.output,linked);
const source=fs.readFileSync('pages/CitationLinker.tsx','utf8');assert.ok(!source.includes('id="toggle-id"'));assert.ok(!source.includes('id="toggle-dup"'));assert.ok(source.includes('const targetMissingId = false'));
console.log('10 author-year review and refid-only checks passed.');

const competing=ref('bb0005','World Health Organization, 2020','First WHO report')+ref('bb3000','World Health Organization, 2020','Second WHO report')+'<ce:cross-ref id="cf0005">WHO, 2020</ce:cross-ref>';
const multiple={};api(competing,multiple).runAnalysis();assert.equal(multiple.rows[0].status,'failed');
assert.deepEqual(review.citationReviewCandidates(competing,'WHO, 2020').map(c=>c.id),['bb0005','bb3000']);
for (const target of ['bb0005','bb3000']) {
    multiple.rows[0]={...multiple.rows[0],...review.reviewCitationTarget(competing,multiple.rows[0],target)};
    await api(competing,multiple).executeLink();
    assert.equal(multiple.output,competing.replace('<ce:cross-ref id="cf0005">',`<ce:cross-ref refid="${target}" id="cf0005">`));
    assert.deepEqual([...xml.scanReferenceXml(multiple.output).ids],[...xml.scanReferenceXml(competing).ids]);
}
multiple.rows[0]={...multiple.rows[0],manualTarget:undefined,mappedIds:[],status:'failed'};
await api(competing,multiple).executeLink();assert.equal(multiple.output,competing);
const grouped=competing.replace('WHO, 2020</ce:cross-ref>','WHO, 2020; WHO, 2020</ce:cross-ref>');
const group={};api(grouped,group).runAnalysis();await api(grouped,group).executeLink();assert.equal(group.output,grouped);
assert.throws(()=>review.reviewCitationTarget(grouped,group.rows[0],'bb0005'),/eligible/);
// Delayed application must never republish output after XML or approval changes.
for (const invalidate of [s=>s.analysisKeyRef.current='edited XML',s=>s.operationRef.current++]) {
    const pending={};api(competing,pending).runAnalysis();pending.rows[0]={...pending.rows[0],...review.reviewCitationTarget(competing,pending.rows[0],'bb3000')};
    const callbacks=[];await api(competing,pending,{setTimeout:fn=>callbacks.push(fn)}).executeLink();invalidate(pending);callbacks[0]();assert.equal(pending.output,undefined);
}
console.log('8 additional target-review and delayed-application checks passed.');
