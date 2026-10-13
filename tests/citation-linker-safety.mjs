import assert from 'node:assert/strict';
import fs from 'node:fs';import ts from 'typescript';
import {api,xml,e} from './citation-linker-harness.mjs';
import {numericReviewCandidates,reviewCitationTarget} from '../utils/citationLinkerReview.ts';
const editApi={};new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/citationLinkerEdits.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(editApi,n=>n.includes('idAuditor')?e:xml);
let count=0;
async function check(input,expect,options={}){const state={};api(input,state,options).runAnalysis();await api(input,state,options).executeLink();expect(state);count++;return state;}
const ref=(id,label)=>`<ce:bib-reference id="${id}"><ce:label>${label}</ce:label></ce:bib-reference>`;
const one=ref('bb0005','[1]');
await check(one+ref('bb0010','[1]')+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
for(const text of ['[1,99]','[1–3]','[3–1]','[1–1000000]'])await check(one+ref('bb0010','[2]')+`<ce:cross-refs id="cf0005">${text}</ce:cross-refs>`,s=>{assert.equal(s.rows[0].status,'failed',text);assert.ok(!s.output.includes('refid='));});
await check(one+ref('bb0010','[2]')+'<ce:cross-refs id="cf0005">[1,2,1–2]</ce:cross-refs>',s=>assert.ok(s.output.includes('refid="bb0005 bb0010"')));
await check(ref('bb0005','Smith et al., 2020')+ref('bb0010','Smith et al., 2020')+'<ce:cross-ref id="cf0005">Smith et al., 2020</ce:cross-ref>',s=>assert.equal(s.rows[0].status,'failed'));
await check(ref('bb0005','Smith et al., 2020a')+ref('bb0010','Smith et al., 2020b')+'<ce:cross-ref id="cf0005">Smith et al., 2020a</ce:cross-ref>',s=>assert.ok(s.output.includes('refid="bb0005"')));
await check(ref('bb0005','Smith et al., 2020')+ref('bb0010','Jones et al., 2021')+'<ce:cross-ref id="cf0005">Smith, 2020; Jones, 2021</ce:cross-ref>',s=>assert.ok(xml.scanReferenceXml(s.output).nodes.some(n=>n.name==='ce:cross-refs'&&n.attributes.id==='cf0005'&&n.attributes.refid==='bb0005 bb0010')));
await check(one.replace('id="bb0005"',"id = 'bb0005'")+'<ce:cross-ref id="cf0005">&#91;1&#93;</ce:cross-ref>',s=>assert.ok(s.output.includes('refid="bb0005"')));
const commented='<!-- '+one+'<ce:cross-ref>[1]</ce:cross-ref> -->';await check(commented+ref('bb0010','[1]')+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>{assert.equal(s.rows.length,1);assert.ok(s.output.startsWith(commented));assert.ok(s.output.includes('refid="bb0010"'));});
await check('<article><body>'+one+'</body><ce:bibliography>'+ref('bb0010','[1]')+'</ce:bibliography><ce:cross-ref id="cf0005">[1]</ce:cross-ref></article>',s=>assert.ok(s.output.includes('refid="bb0010"')));
for(const [tag,label,text,id] of [['figure','Fig. 1','Figure 1','f0005'],['table','Table 1','Table 1','t0005'],['footnote','1','Note 1','fn0005'],['section','1 Introduction','Section 1','s0005']]){
 const title=tag==='section'?'section-title':'label';await check(`<ce:${tag} id="${id}"><ce:${title}>${label}</ce:${title}></ce:${tag}><ce:cross-ref id="cf0005" refid="gone">${text}</ce:cross-ref>`,s=>assert.ok(s.output.includes(`refid="${id}"`)),{});
}
await check('<ce:figure id="f0005"><ce:label>Fig. 1</ce:label></ce:figure><ce:figure id="f0010"><ce:label>Fig. 1</ce:label></ce:figure><ce:cross-ref id="cf0005">Fig. 1</ce:cross-ref>',s=>assert.equal(s.rows[0].status,'failed'));
await check('<ce:figure id="f0005"><ce:label>Fig. 1</ce:label></ce:figure><ce:inter-ref id="ir0005" xlink:href="#gone">Fig. 1</ce:inter-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(s.output.includes('xlink:href="#gone"'));assert.ok(s.rows[0].reason.includes('VTOOL'));});
const nested=one+'<ce:cross-ref id="cf0005" role="a  b"> [<ce:bold>1</ce:bold>] </ce:cross-ref>';await check(nested,s=>{assert.ok(s.output.includes('role="a  b"'));assert.ok(s.output.includes('> [<ce:bold>1</ce:bold>] </ce:cross-ref>'));});
await check('<ce:intra-ref id="ia0005" xlink:href="pii:S1385894725131082/s0005">Section</ce:intra-ref>',s=>{assert.equal(s.rows,undefined);assert.ok(!s.output.includes('refid='));});
let state={};const timers=[];api(one+'<ce:cross-ref/>',state,{setTimeout:f=>timers.push(f)}).runAnalysis();state.analysisKeyRef.current='changed';timers[0]();assert.equal(state.rows,undefined);count++;
const hosts='<sb:reference><sb:host><sb:issue/></sb:host><sb:host><sb:e-host><ce:inter-ref xlink:href="https://doi.org/10.1234/abc&amp;x">DOI</ce:inter-ref></sb:e-host></sb:host></sb:reference>';
const doiInput='<ce:bib-reference id="bb0005"><ce:label>[1]</ce:label>'+hosts+'</ce:bib-reference>';
assert.ok(editApi.cleanupCitationDois(doiInput).output.includes('<ce:doi>10.1234/abc&amp;x</ce:doi>'));count++;
for(const input of ['<!-- '+doiInput+' -->',doiInput.replace('<sb:issue/>','<ce:doi>10.1234/other</ce:doi>'),doiInput.replace('</sb:e-host>','<ce:textref>Keep</ce:textref></sb:e-host>'),doiInput.replace('<ce:inter-ref xlink:', '<ce:inter-ref id="ir0005" xlink:')+'<ce:cross-ref refid="ir0005"/>']){assert.equal(editApi.cleanupCitationDois(input).output,input);count++;}
await check('<ce:figure id="f3000"><ce:label>Fig. 1</ce:label></ce:figure><ce:float-anchor refid="old-figure"/>',s=>{assert.equal(s.rows[0].status,'resolved');assert.ok(s.output.includes('refid="f3000"'));},{repairHistory:[{before:'old-figure',after:'f3000',tag:'ce:figure'}]});
await check('<ce:figure id="f3000"><ce:label>Fig. 1</ce:label></ce:figure><ce:float-anchor refid="old-figure"/>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(s.output.includes('refid="old-figure"'));});
await check('<ce:figure id="f3000"/><ce:figure id="f3005"/><ce:float-anchor refid="old-figure"/>',s=>assert.equal(s.rows[0].status,'failed'),{repairHistory:[{before:'old-figure',after:'f3000',tag:'ce:figure'},{before:'old-figure',after:'f3005',tag:'ce:figure'}]});
// Unit B supersedes only the old cross-type collision expectation for bracketed bibliography citations.
await check(one+'<ce:footnote id="fn0005"><ce:label>1</ce:label></ce:footnote><ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'resolved');assert.ok(s.output.includes('refid="bb0005"'));assert.equal(s.rows[0].targetType,'bibliography');});
// Owner N1: unbracketed body numerics never prefer a footnote over an eligible bibliography entry.
await check(one+'<ce:footnote id="fn0005"><ce:label>1</ce:label></ce:footnote><ce:cross-ref id="cf0005">1</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
const exhausted=Array.from({length:1999},(_,i)=>'<ce:cross-ref id="cf'+String((i+1)*5).padStart(4,'0')+'"/>').join('')+'<ce:cross-ref/>';
await check(ref('bb0005','Smith and Jones, 2020')+'<ce:cross-ref id="cf0005">Smith and Brown, 2020</ce:cross-ref>',s=>assert.equal(s.rows[0].status,'failed'));
assert.equal(editApi.cleanupCitationDois(doiInput.replace('abc&amp;x','abc?download=1')).output,doiInput.replace('abc&amp;x','abc?download=1'));count++;
await check(ref('bb0005','<![CDATA[[1]]]>')+'<ce:cross-ref id="cf0005"><![CDATA[[1]]]></ce:cross-ref>',s=>assert.ok(s.output.includes('refid="bb0005"')));
await check(ref('bb0005','[1]<!-- ignored > 99 -->')+'<ce:cross-ref id="cf0005">[1]<!-- preserved > --> </ce:cross-ref>',s=>{assert.ok(s.output.includes('refid="bb0005"'));assert.ok(s.output.includes('<!-- preserved > -->'));});
await check(ref('bb0005','[2020]')+ref('bb0010','[2021]')+'<ce:cross-refs id="cf0005">[2020,2021]</ce:cross-refs>',s=>assert.ok(s.output.includes('refid="bb0005 bb0010"')));
await check('<ce:figure id="f3000"/><ce:float-anchor refid="(missing)"/>',s=>assert.equal(s.rows[0].status,'failed'),{repairHistory:[{before:'(missing)',after:'f3000',tag:'ce:figure'}]});
await check('<ce:bibliography>'+one+ref('bb0010','[2]')+'</ce:bibliography><ce:cross-ref id="cf0005">[99]</ce:cross-ref>',s=>assert.ok(!s.suggestions.some(item=>item.id==='uncited-cleaner')));
await check('<ce:bibliography>'+one+ref('bb0010','[2]')+'</ce:bibliography><ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>assert.ok(s.suggestions.some(item=>item.id==='uncited-cleaner')));
for (const options of [{targetMissingId:true}, {targetDuplicateId:true}]) await check('<ce:cross-ref/>',s=>{assert.equal(s.output,'');assert.ok(s.toasts.at(-1).msg.includes('ID Prefix Auditor'));},options);
const affiliation=(id,label='1')=>`<ce:affiliation id="${id}"><ce:label>${label}</ce:label><ce:textfn>Synthetic Institute</ce:textfn></ce:affiliation>`;
const marker='<ce:cross-ref id="cf0005">1</ce:cross-ref>';
const authorMarker=`<ce:author-group><ce:author>${marker}</ce:author></ce:author-group>`;
const footnote='<ce:footnote id="fn0005"><ce:label>1</ce:label></ce:footnote>';
await check(one+affiliation('af0005')+authorMarker,s=>{assert.equal(s.rows[0].status,'resolved');assert.equal(s.rows[0].targetType,'affiliation');assert.ok(s.output.includes('refid="af0005"'));assert.ok(!s.output.includes('refid="bb0005"'));});
await check(one+authorMarker,s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(one+affiliation('af0005')+affiliation('af0010')+authorMarker,s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(one+affiliation('af0005')+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>{assert.equal(s.rows[0].targetType,'bibliography');assert.ok(s.output.includes('refid="bb0005"'));});
await check(affiliation('af0005')+footnote+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(one+marker,s=>assert.ok(s.output.includes('refid="bb0005"')));
await check(footnote+marker,s=>{assert.equal(s.rows[0].targetType,'object');assert.ok(s.output.includes('refid="fn0005"'));});
await check(one+ref('bb0010','[2]')+'<ce:cross-ref id="cf0005">1–2</ce:cross-ref>',s=>assert.ok(s.output.includes('refid="bb0005 bb0010"')));
await check(one+ref('bb0010','[2]')+footnote+'<ce:cross-ref id="cf0005">[1–2]</ce:cross-ref>',s=>assert.ok(s.output.includes('refid="bb0005 bb0010"')));
await check(one+ref('bb0010','[2]')+footnote+'<ce:cross-ref id="cf0005">1–2</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(one+affiliation('af0005')+authorMarker.replace('>1<','>[1]<'),s=>assert.ok(s.output.includes('refid="af0005"')));
for(const wrapper of ['ce:author','ce:author-group','ce:affiliation-group','ce:correspondence'])await check(one+`<${wrapper}>${marker}</${wrapper}>`,s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(one+affiliation('af0005')+authorMarker.replace('>1<','>99<'),s=>assert.equal(s.rows[0].status,'failed'));
await check(one+ref('bb0010','[2]')+'<ce:cross-ref id="cf0005">[1–2</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check(ref('bb0005','Smith, 2020')+'<ce:author-group><ce:cross-ref id="cf0005">Smith, 2020</ce:cross-ref></ce:author-group>',s=>assert.equal(s.rows[0].status,'failed'));
const numericInput=one+footnote+marker;
const numericState={};api(numericInput,numericState).runAnalysis();
assert.deepEqual(numericReviewCandidates(numericInput,numericState.rows[0]).map(c=>c.id),['bb0005','fn0005']);count++;
for(const id of ['bb0005','fn0005']){numericState.rows[0]=reviewCitationTarget(numericInput,numericState.rows[0],id);await api(numericInput,numericState).executeLink();assert.ok(numericState.output.includes(`refid="${id}"`));count++;}
numericState.rows[0]={...numericState.rows[0],manualTarget:undefined,mappedIds:[],status:'failed'};await api(numericInput,numericState).executeLink();assert.equal(numericState.output,numericInput);count++;
const duplicateAff=one+affiliation('af0005')+affiliation('af0010')+authorMarker;
const affState={};api(duplicateAff,affState).runAnalysis();
assert.deepEqual(numericReviewCandidates(duplicateAff,affState.rows[0]).map(c=>c.id),['af0005','af0010']);
assert.throws(()=>reviewCitationTarget(duplicateAff,affState.rows[0],'bb0005'),/eligible/);
affState.rows[0]=reviewCitationTarget(duplicateAff,affState.rows[0],'af0010');await api(duplicateAff,affState).executeLink();assert.ok(affState.output.includes('refid="af0010"'));count++;
const groupedReview=one+ref('bb0010','[2]')+'<ce:cross-refs id="cf0005">[1,2]</ce:cross-refs>';const groupState={};api(groupedReview,groupState).runAnalysis();assert.deepEqual(numericReviewCandidates(groupedReview,groupState.rows[0]),[]);assert.throws(()=>reviewCitationTarget(groupedReview,groupState.rows[0],'bb0005'),/eligible/);count++;
const duplicateIdInput=one+affiliation('af0005')+affiliation('af0005')+authorMarker;const duplicateIdState={};api(duplicateIdInput,duplicateIdState).runAnalysis();assert.deepEqual(numericReviewCandidates(duplicateIdInput,duplicateIdState.rows[0]),[]);count++;
const opts={targetMissingId:false,targetDuplicateId:false,targetMissingRefid:true,cfStart:3000};
for(const [input,target,type]of [[one+affiliation('af0005')+authorMarker,'bb0005','bibliography'],[affiliation('af0005')+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>','af0005','affiliation'],[footnote+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>','fn0005','object']]){
 const s={};api(input,s).runAnalysis();for(const targetType of [undefined,type])assert.throws(()=>editApi.applyCitationLinks(input,[{...s.rows[0],status:'resolved',mappedIds:[target],targetType}],opts),/semantic|ineligible/);count++;
}
assert.throws(()=>editApi.applyCitationLinks(numericInput,[{...numericState.rows[0],status:'resolved',mappedIds:['bb0005'],manualTarget:undefined,targetType:undefined}],opts),/ambiguous/);count++;
assert.throws(()=>reviewCitationTarget(numericInput,{...numericState.rows[0],originalTag:'stale'},'bb0005'),/stale/);count++;
assert.throws(()=>editApi.applyCitationLinks(groupedReview,[{...groupState.rows[0],mappedIds:['bb0005']}],opts),/Incomplete/);count++;
const mixedGroup=one+'<ce:footnote id="fn0005"><ce:label>2</ce:label></ce:footnote><ce:cross-refs id="cf0005">1,2</ce:cross-refs>';
const mixedGroupState={};api(mixedGroup,mixedGroupState).runAnalysis();assert.equal(mixedGroupState.rows[0].status,'failed');assert.throws(()=>editApi.applyCitationLinks(mixedGroup,[{...mixedGroupState.rows[0],status:'resolved',mappedIds:['bb0005','fn0005'],targetType:undefined}],opts),/mixed-type/);count++;
await check('<ce:table id="t0005"><ce:label>Fig. 1</ce:label></ce:table><ce:cross-ref id="cf0005">Fig. 1</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(!s.output.includes('refid='));});
await check('<ce:table id="t0005"><ce:label>Table 1</ce:label></ce:table><ce:cross-ref id="cf0005">Table 1</ce:cross-ref>',s=>assert.ok(s.output.includes('refid="t0005"')));
const lexical=one+affiliation('af0005')+"<!-- keep > --><ce:author-group>\n <ce:author><ce:cross-ref id = 'cf0005'> <ce:sup>&#49;</ce:sup> </ce:cross-ref></ce:author>\n</ce:author-group>";
await check(lexical,s=>assert.equal(s.output,lexical.replace("<ce:cross-ref id = 'cf0005'>","<ce:cross-ref refid=\"af0005\" id = 'cf0005'>")));
const replayState={};api(lexical,replayState).runAnalysis();await api(lexical,replayState).executeLink();const replayed=replayState.output;await check(replayed,s=>assert.equal(s.output,replayed));
// A later invalid row must not return the earlier row's partial edits.
const atomicInput=one+'<ce:cross-ref id="cf0005">[1]</ce:cross-ref>'+affiliation('af0005')+authorMarker.replace('cf0005','cf0010');const atomicState={};api(atomicInput,atomicState).runAnalysis();assert.throws(()=>editApi.applyCitationLinks(atomicInput,[atomicState.rows[0],{...atomicState.rows[1],mappedIds:['bb0005'],targetType:undefined}],opts),/ineligible|semantic/);count++;
// Imported history cannot bypass current context eligibility; Unit A itself remains unchanged.
await check(one+authorMarker.replace('id="cf0005"','id="cf0005" refid="old"'),s=>{assert.equal(s.rows[0].status,'failed');assert.ok(s.output.includes('refid="old"'));},{repairHistory:[{before:'old',after:'bb0005',tag:'ce:bib-reference'}]});
await check(one+footnote+marker.replace('id="cf0005"','id="cf0005" refid="old"'),s=>{assert.equal(s.rows[0].status,'failed');assert.ok(s.output.includes('refid="old"'));},{repairHistory:[{before:'old',after:'bb0005',tag:'ce:bib-reference'}]});
await check(one+'<ce:cross-ref id="cf0005" refid="old">Note 1</ce:cross-ref>',s=>{assert.equal(s.rows[0].status,'failed');assert.ok(s.output.includes('refid="old"'));},{repairHistory:[{before:'old',after:'bb0005',tag:'ce:bib-reference'}]});
console.log(count+' additional Citation Linker safety cases passed.');
