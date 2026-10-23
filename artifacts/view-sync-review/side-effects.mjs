import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {engine,scanner} from '../../tests/view-sync-safety.mjs';

const baseline={};
const source=execFileSync('git',['show','8d43bae:utils/viewSyncEngine.ts'],{encoding:'utf8'});
new Function('exports','require',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(baseline,
 name=>name.includes('idAuditor')?{ID_RULES:JSON.parse(fs.readFileSync('utils/idAuditorRules.json','utf8'))}:scanner);
const para=(id,view,body)=>`<ce:para id="${id}" view="${view}">${body}</ce:para>`;
const pair=(a,b)=>para('p0005','compact-standard',a)+para('p0010','extended',b);
let controls=0;
for(const direction of ['compact-to-extended','extended-to-compact']) {
 for(const tag of ['ce:inter-refs','ce:intra-refs']) {
  for(const withIds of [false,true]) {
   const attribute=tag==='ce:inter-refs'?'xlink:href="https://example.com"':'refid="p0100 p0105"';
   const link=id=>`<${tag}${withIds?` id="${id}"`:''} ${attribute}>Resources</${tag}>`;
   const xml=pair('New '+link('ir0005'),'Old '+link('ir0010'));
   const result=engine.synchronizeViews(xml,direction);
   assert.equal(result.output,baseline.synchronizeViews(xml,direction).output);
   assert.equal(result.notices.length,0);
   assert.equal(engine.synchronizeViews(result.output,direction).applied.length,0);
   controls++;
  }
 }
 for(const ending of ['/>',' />','\n/>']) {
  const citation='<ce:cross-ref refid="bb0005"'+ending;
  const xml=direction==='compact-to-extended'?pair(citation,'Old'):pair('Old',citation);
  const result=engine.synchronizeViews(xml,direction);
  assert.doesNotThrow(()=>scanner.scanReferenceXml(result.output));
  assert.equal(result.applied.length,1);
  assert.equal(result.notices.length,0);
  assert.equal(engine.synchronizeViews(result.output,direction).applied.length,0);
  controls++;
 }
 const xml=pair('New <ce:list><ce:list-item><ce:para id="p0020">List</ce:para></ce:list-item></ce:list>',
  'Old <ce:list><ce:list-item><ce:para id="p0025">List</ce:para></ce:list-item></ce:list>');
 assert.equal(engine.synchronizeViews(xml,direction).output,baseline.synchronizeViews(xml,direction).output);
 assert.equal(engine.synchronizeViews(xml,direction).notices.length,0);
 controls++;
}
console.log(`${controls} unaffected-behavior and self-closing ID controls passed.`);

// IDREFS whitespace is formatting, not a destination change.
for(const direction of ['compact-to-extended','extended-to-compact']) {
 const xml=pair('New <ce:intra-refs refid="p0100 p0105">sections</ce:intra-refs>',
  'Old <ce:intra-refs refid="p0100  p0105">sections</ce:intra-refs>');
 assert.equal(baseline.synchronizeViews(xml,direction).applied.length,1);
 const result=engine.synchronizeViews(xml,direction);
 assert.equal(result.applied.length,1);
 assert.equal(result.notices.length,0);
}
console.log('FIXED: equivalent grouped targets accepted despite whitespace differences.');

// No-change nested views need no overlap warning.
const inner=(a,b)=>'<ce:list><ce:list-item>'+para(a,'compact-standard','Same')+
 para(b,'extended','Same')+'</ce:list-item></ce:list>';
const nested=pair(inner('p0020','p0025'),inner('p0030','p0035'));
const audit=engine.inspectViews(nested);
assert.equal(audit.orphans.length,0);
assert.equal(audit.notices.length,0);
assert.equal(audit.countMismatch,undefined);
assert.equal(engine.viewDifferences(nested).mismatches.length,0);
assert.equal(baseline.synchronizeViews(nested,'compact-to-extended').notices.length,0);
assert.equal(engine.synchronizeViews(nested,'compact-to-extended').notices.length,0);
console.log('FIXED: fully synchronized nested views generate no false review warnings.');
