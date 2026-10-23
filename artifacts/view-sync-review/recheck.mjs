import assert from 'node:assert/strict';
import {engine,scanner} from '../../tests/view-sync-safety.mjs';
import './side-effects.mjs';

const para=(id,view,body)=>`<ce:para id="${id}" view="${view}">${body}</ce:para>`;
const pair=(a,b)=>para('p0005','compact-standard',a)+para('p0010','extended',b);
let checks=0;
function check(xml,direction,{applied=1,notices=0,unchanged=false}={}) {
 const result=engine.synchronizeViews(xml,direction);
 assert.equal(result.applied.length,applied);
 assert.equal(result.notices.length,notices);
 assert.doesNotThrow(()=>scanner.scanReferenceXml(result.output));
 if(unchanged)assert.equal(result.output,xml);
 else {
  assert.equal(engine.viewDifferences(result.output).mismatches.length,0);
  assert.equal(engine.synchronizeViews(result.output,direction).applied.length,0);
 }
 checks++;return result;
}
for(const direction of ['compact-to-extended','extended-to-compact']) {
 for(const tag of ['ce:intra-ref','ce:intra-refs']) {
  // Local references, mixed local/external targets, whitespace and paragraph self-links.
  for(const spacing of [' ','  ','&#9;','&#10;']) {
   const body=(anchor,root,id,sep)=>`<ce:anchor id="${anchor}"/>`+
    `<${tag} id="${id}" refid="${anchor}${sep}${root}${sep}p0100">Resources</${tag}>`;
   check(pair('New '+body('an0005','p0005','ia0005',' '),
    'Old '+body('an0010','p0010','ia0010',spacing)),direction);
  }
  // Existing incoming references must retain target ownership.
  const body=(anchor,id)=>`<ce:anchor id="${anchor}"/><${tag} id="${id}" refid="${anchor} p0100">Resources</${tag}>`;
  const xml=pair('New '+body('an0005','ia0005'),'Old '+body('an0010','ia0010'))+
   '<ce:intra-ref refid="ia0005 ia0010 an0005 an0010">External caller</ce:intra-ref>';
  const result=check(xml,direction),parsed=scanner.scanReferenceXml(result.output);
  for(const id of ['ia0005','ia0010','an0005','an0010'])assert.ok(parsed.ids.has(id));
  // A target set change or duplicate-count change must still be blocked.
  for(const target of ['p0100 p0110','p0100','p0100 p0105 p0105']) {
   check(pair(`<${tag} refid="p0100 p0105">A</${tag}>`,
    `<${tag} refid="${target}">B</${tag}>`),direction,{applied:0,notices:1,unchanged:true});
  }
 }
 for(const tag of ['ce:inter-ref','ce:inter-refs']) {
  // URI fragments still remap to counterpart-local owners after the whitespace fix.
  const body=(anchor,id,href)=>`<ce:anchor id="${anchor}"/><${tag} id="${id}" xlink:href="${href}">Here</${tag}>`;
  check(pair('New '+body('an0005','ir0005','#an%30005'),
   'Old '+body('an0010','ir0010','#an%30010')),direction);
  // Mixed ordinary grouped links and established supplementary citations.
  const compact=`New Fig. S1; <${tag} id="ir0005" xlink:href="https://example.com">Website</${tag}>`;
  const extended=`Old <ce:cross-ref id="cf0010" refid="ec0005">Fig. S1</ce:cross-ref>; <${tag} id="ir0010" xlink:href="https://example.com">Website</${tag}>`;
  check(pair(compact,extended),direction);
 }
 // No-op nested views remain intact when an unrelated pair alone is selected.
 const inner=(a,b)=>'<ce:list><ce:list-item>'+para(a,'compact-standard','Same')+para(b,'extended','Same')+'</ce:list-item></ce:list>';
 const nested=pair(inner('p0020','p0025'),inner('p0030','p0035'));
 const separate='<ce:section>'+para('p0040','compact-standard','New')+para('p0045','extended','Old')+'</ce:section>';
 const xml=nested+separate,audit=engine.inspectViews(xml);
 const selected=audit.pairs.find(p=>p.compact.attributes.id==='p0040').index;
 const r=engine.synchronizeViews(xml,direction,'',new Set([selected]));
 assert.equal(r.applied.length,1);assert.equal(r.notices.length,0);assert.ok(r.output.startsWith(nested));checks++;
 const empty=engine.synchronizeViews(xml,direction,'',new Set());
 assert.equal(empty.output,xml);assert.equal(empty.notices.length,0);checks++;
}
console.log(`${checks} additional local-target, destination-protection, supplementary, and selection controls passed.`);
console.log('FIXED: numeric-whitespace/local-target cases synchronize once and retain stable IDs.');
