import fs from 'node:fs';
import assert from 'node:assert/strict';
import {engine} from '../../tests/view-sync-safety.mjs';

const path=process.argv[2] || 'D:/Freelance Zone/ES/Files/Kevin/10-23-2026/ACTPSY_108055/S200/ACTPSY_108055_out.xml';
const original=fs.readFileSync(path,'utf8');
// Match pages/TagCleaner.tsx's accept operation; do not modify the source file.
const accepted=original
 .replace(/<opt_comment(?:\s+[^>]*)?>([\s\S]*?)<\/opt_comment>/gi,'')
 .replace(/<opt_INS(?:\s+[^>]*)?>([\s\S]*?)<\/opt_INS>/gi,'$1')
 .replace(/<opt_DEL(?:\s+[^>]*)?>([\s\S]*?)<\/opt_DEL>/gi,'')
 .replace(/<\/?opt_(?:INS|DEL|comment)(?:\s+[^>]*)?>/gi,'');
const audit=engine.inspectViews(accepted);
const synchronized=engine.synchronizeViews(accepted,'extended-to-compact');
const repaired=engine.repairViewOrphans(accepted);
const after=engine.inspectViews(repaired.output);
assert.equal(audit.viewCounts.extended,17);
assert.equal(audit.viewCounts['compact-standard'],1);
assert.equal(audit.orphans.length,16);
assert.equal(audit.notices.length,0);
assert.equal(synchronized.applied.length,0);
assert.equal(repaired.created,16);
assert.equal(after.viewCounts.extended,17);
assert.equal(after.viewCounts['compact-standard'],17);
assert.equal(after.pairs.length,16);
assert.equal(after.orphans.length,0);
assert.equal(after.notices.length,0);
assert.equal(engine.repairViewOrphans(repaired.output).created,0);
const restored=['p0110','p0120','p0130'].map(id=>{
 const node=audit.nodes.find(n=>n.attributes.id===id);
 const parent=audit.parents.get(node);
 const heading=(audit.children.get(parent)||[]).find(n=>n.name==='ce:section-title');
 assert.equal(node.attributes.view,'extended');
 const pair=after.pairs.find(p=>p.extended.attributes.id===id);
 assert.ok(pair);
 assert.equal(after.textContent(pair.compact),after.textContent(pair.extended));
 return {id,compactId:pair.compact.attributes.id,parentId:parent.attributes.id,section:heading?audit.textContent(heading):''};
});
// Also validate the user's partially repaired 17:14 state: keep the other
// thirteen partners and regenerate only the three previously skipped ones.
let partial=repaired.output;
const missingCompacts=after.pairs.filter(pair=>restored.some(item=>item.id===pair.extended.attributes.id)).map(pair=>pair.compact);
for(const node of missingCompacts.sort((a,b)=>b.start-a.start))partial=partial.slice(0,node.start)+partial.slice(node.end);
assert.equal(engine.inspectViews(partial).viewCounts['compact-standard'],14);
assert.equal(engine.inspectViews(partial).orphans.length,3);
const remaining=engine.repairViewOrphans(partial),complete=engine.inspectViews(remaining.output);
assert.equal(remaining.created,3);
assert.equal(remaining.notices.length,0);
assert.equal(complete.pairs.length,16);
assert.equal(complete.countMismatch,undefined);
assert.equal(complete.notices.length,0);
assert.equal(fs.readFileSync(path,'utf8'),original);
console.log(JSON.stringify({source:path,afterAccepting:audit.viewCounts,recognizedOrphans:audit.orphans.length,
 normalSyncUpdated:synchronized.applied.length,orphanRepairCreated:repaired.created,
 afterRepair:after.viewCounts,restored,partiallyRepairedStateCreated:remaining.created,reason:after.notices},null,2));
