import assert from 'node:assert/strict';
import {engine} from '../../tests/view-sync-safety.mjs';

const para=(id,view,body)=>`<ce:para id="${id}" view="${view}">${body}</ce:para>`;
const pair=(a,b)=>para('p0005','compact-standard',a)+para('p0010','extended',b);

// Regression checks for the three issues discovered during the review.
for (const tag of ['ce:intra-refs','ce:inter-refs']) {
 const link=tag==='ce:intra-refs'
  ? `<${tag} refid="p0020 p0025">sections</${tag}>`
  : `<${tag} xlink:href="https://example.com">resources</${tag}>`;
 const xml=pair('New plain text','Old '+link);
 const result=engine.synchronizeViews(xml,'compact-to-extended');
 assert.ok(result.notices.length);
 assert.equal(result.applied.length,0);
 assert.equal(result.output,xml);
 console.log('FIXED: protected '+tag);
}

const citationResult=engine.synchronizeViews(
 pair('<ce:cross-ref refid="bb0005"/>','Old text'),'compact-to-extended'
);
assert.equal(citationResult.applied.length,1);
assert.equal(citationResult.notices.length,0);
console.log('FIXED: self-closing citation accepts a generated ID');

// Parent and child orphans are repaired independently from the original tree.
const nested=para('p0005','extended','Text <ce:list><ce:list-item>'+
 para('p0010','extended','Nested text')+'</ce:list-item></ce:list>');
const repaired=engine.repairViewOrphans(nested);
assert.equal(repaired.created,0);
assert.equal(repaired.output,nested);
assert.equal(repaired.notices.length,2);
console.log('FIXED: nested orphan group preserved with explicit review notices');
