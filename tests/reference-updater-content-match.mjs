import {testOutputPath} from './test-output.mjs';
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
    assert.equal(state.scanResults[0].status,'potential_duplicate');
    assert.notEqual(state.scanResults[0].matchType,'Content');
    assert.ok(!state.output);
    assert.ok(state.toasts.some(t=>t.msg.includes('Review required')));
},{addOrphans:false,autoUpdateSmartMatch:true});
for(const label of ['[1]','Smith, 2020']) {
    const old=ref('bb5',label,book('rf5','Smith','2020','Alpha','10.1234/a-b'));
    const next=ref('bb900',label,book('rf900','Smith','2020','Alpha','10.1234/ab'));
    await check('doi-conflict-'+label,old,next,state=>{
        assert.equal(state.scanResults[0].status,'conflict');
        assert.notEqual(state.scanResults[0].matchType,'Content');
        assert.ok(!state.output);
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
fs.mkdirSync(testOutputPath('artifacts/reference-updater-content-fix'),{recursive:true});
fs.writeFileSync(testOutputPath('artifacts/reference-updater-content-fix/results.json'),JSON.stringify(results,null,2));
console.log('6 content-match regression scenarios and Unicode/punctuation assertions passed.');

// Compare actual text, while keeping missing evidence and contradictions reviewable.
const scoreMeta=(title,authors=['Smith'],year='2020',doi='')=>`<sb:reference><sb:contribution><sb:authors>${authors.map(name=>`<sb:author><ce:surname>${name}</ce:surname></sb:author>`).join('')}</sb:authors><sb:title><sb:maintitle>${title}</sb:maintitle></sb:title></sb:contribution><sb:host><sb:journal><sb:title><sb:maintitle>Journal of Coastal Studies</sb:maintitle></sb:title><sb:date>${year}</sb:date></sb:journal>${doi?`<ce:doi>${doi}</ce:doi>`:''}</sb:host></sb:reference>`;
const scorePlain=text=>`<ce:other-ref>${text}</ce:other-ref>`;
const scoreTitle='Effects of temperature and pressure on the stability of coastal ecosystems';
let scoringCases=0;
async function scoringCase(name,left,right,verify,options={}){
 const original=ref('bb0005','Smith, 2020',left),updated=ref('bb0900','Smith, 2020',right),state={scanResults:[]};
 const e=engine(original,updated,state,options);e.runAnalysis();
 await engine(original,updated,state,options).initiateUpdate();
 verify(state,e.parseReferences(original)[0],e.parseReferences(updated)[0]);scoringCases++;
}
for(const [name,left,right] of [
 ['ampersand',scoreMeta('A &amp; B'),scoreMeta('A &#38; B')],
 ['accent',scoreMeta('Café study'),scoreMeta('Caf&#233; study')],
 ['CDATA',scorePlain('Smith (2020). A &amp; B.'),scorePlain('Smith (2020). <![CDATA[A & B.]]>')],
 ['inline-word',scorePlain('Smith (2020). Ecosystems.'),scorePlain('Smith (2020). Eco<ce:italic>sys</ce:italic>tems.')],
 ['comment',scorePlain('Smith (2020). Ecosystems.'),scorePlain('Smith (2020). Eco<!-- ignored -->systems.')]
])await scoringCase(name,left,right,(s,a,b)=>{
 assert.equal(a.contentHash,b.contentHash,name);assert.equal(s.scanResults[0].matchType,'Content',name);assert.equal(s.scanResults[0].matchScore,100,name);assert.ok(s.output,name);
});
await scoringCase('different word boundaries',scorePlain('Smith (2020). A<ce:italic>B</ce:italic>C.'),scorePlain('Smith (2020). A B C.'),(s,a,b)=>{
 assert.notEqual(a.contentHash,b.contentHash);assert.notEqual(s.scanResults[0].matchType,'Content');assert.ok(!s.output);assert.match(s.scanResults[0].ownershipWarning,/Word boundaries/);
},{autoUpdateSmartMatch:true});
for(const [name,left,right] of [
 ['third author',scoreMeta(scoreTitle,['Smith','Jones','Lee']),scoreMeta(scoreTitle,['Smith','Jones','Brown'])],
 ['year',scoreMeta(scoreTitle,['Smith'],'2020'),scoreMeta(scoreTitle,['Smith'],'2021')],
 ['DOI',scoreMeta(scoreTitle,['Smith'],'2020','10.1234/abc'),scoreMeta(scoreTitle,['Smith'],'2020','10.1234/xyz')]
])await scoringCase(name,left,right,s=>{assert.equal(s.scanResults[0].status,'conflict',name);assert.ok(!s.output,name);},{autoUpdateSmartMatch:true});
await scoringCase('DOI prefix whitespace',scoreMeta('Short title',['Smith'],'2020','10.1234/abc'),scoreMeta('Corrected title',['Smith'],'2020','doi: 10.1234/abc'),(s,a,b)=>{
 assert.equal(a.doi,b.doi);assert.equal(s.scanResults[0].matchType,'DOI');assert.ok(s.output);
});
const scoreContribution='<sb:contribution><sb:title><sb:maintitle>Coastal ecosystems</sb:maintitle></sb:title></sb:contribution>';
const scoreHost='<sb:host><sb:journal><sb:title><sb:maintitle>Journal of Biology</sb:maintitle></sb:title></sb:journal></sb:host>';
await scoringCase('contribution title scope',`<sb:reference>${scoreHost}${scoreContribution}</sb:reference>`,`<sb:reference>${scoreContribution}${scoreHost}</sb:reference>`,(s,a,b)=>{
 assert.equal(a.title,'coastal ecosystems');assert.equal(a.title,b.title);assert.ok(a.titleIsStructured);
});
await scoringCase('inferred title provenance',scoreMeta(scoreTitle),scorePlain(`Smith 2020 ${scoreTitle}`),(s,a,b)=>{
 assert.equal(a.title,b.title);assert.equal(a.titleIsStructured,true);assert.equal(b.titleIsStructured,false);assert.deepEqual(b.rawAuthors,[]);assert.ok(!s.output);
});
await scoringCase('source-text disagreement retained',scoreMeta(scoreTitle)+sourceText('se0005','Different supplied wording.'),scoreMeta(scoreTitle),(s,a,b)=>{
 assert.notEqual(a.contentHash,b.contentHash);assert.equal(s.scanResults[0].matchType,'Label');assert.ok(!s.output);
});
{
 const original=ref('bb0005','Smith, 2020',scoreMeta(scoreTitle));
 const weak=ref('bb0900','Smith, 2020',scoreMeta('Unrelated ocean circulation study'));
 const strong=ref('bb0905','Smith et al., 2020',scoreMeta(scoreTitle).replace('Journal of Coastal Studies','Coastal Studies'));
 const s={scanResults:[]};engine(original,weak+strong,s).runAnalysis();
 const primary=s.scanResults.find(r=>r.originalIndex===0 && r.candidateSource==='updated');
 assert.equal(primary.updatedIndex,1);assert.ok(primary.candidates.some(c=>c.index===0));assert.ok(primary.candidates.some(c=>c.index===1));
 assert.equal(s.scanResults.find(r=>r.updatedIndex===0).status,'conflict');
 await engine(original,weak+strong,s,{autoUpdateSmartMatch:true}).initiateUpdate();assert.ok(!s.output);
 scoringCases++;
 engine(original,weak+strong,s,{autoUpdateSmartMatch:true}).chooseReviewCandidate(primary.candidates.find(c=>c.index===0),primary);
 await engine(original,weak+strong,s,{autoUpdateSmartMatch:true}).initiateUpdate();
 assert.ok(!s.output);assert.equal(s.scanResults.find(r=>r.uid===primary.uid).status,'conflict');
 scoringCases++;
}
{
 const original=ref('bb0005','Smith, 2020',scoreMeta(scoreTitle,['Smith','Jones','Lee']));
 const updated=ref('bb0900','Smith, 2020',scoreMeta(scoreTitle,['Smith','Jones','Brown']));
 const s={scanResults:[]};engine(original,updated,s).runAnalysis();
 assert.equal(s.scanResults[0].status,'conflict');
 engine(original,updated,s).mergeDuplicate(s.scanResults[0].uid,0);
 await engine(original,updated,s).initiateUpdate();
 assert.ok(s.output.includes('<ce:surname>Brown</ce:surname>'));assert.ok(s.output.includes('id="bb0005"'));
 scoringCases++;
}
console.log(`${scoringCases} scoring normalization, candidate ranking and review-gate regressions passed.`);
