import assert from 'node:assert/strict';
import {buildKeeperEvidence} from '../utils/keeperEvidence.ts';
import {validateKeeperEvidenceSnapshot} from '../utils/keeperEvidenceSnapshot.ts';
const evidence=await buildKeeperEvidence([{id:'xml',name:'test.xml',kind:'xml',content:'<article><query id="q1">Confirm?</query><opt_INS>Added</opt_INS></article>'}]);
const normalized=validateKeeperEvidenceSnapshot(evidence);
assert.equal(normalized.records.length,2);
assert.equal(normalized.files[0].articleDoi,evidence.files[0].articleDoi);
assert.equal(validateKeeperEvidenceSnapshot(undefined),null);
const changed=()=>structuredClone(evidence);
for(const mutate of [e=>e.records.push(e.records[0]),e=>e.records[0].artifactId='other',e=>e.records[0].kind='__proto__',e=>e.records[0].line=-1,e=>e.records[0].diagnostics=[{severity:'fatal',message:'x'}],e=>e.records[0].binding={state:'established',reason:'x',pdfRecordId:'missing'},e=>e.files[0].id='../../path']){
 const e=changed();mutate(e);assert.throws(()=>validateKeeperEvidenceSnapshot(e));
}
const conflict=changed();conflict.records[0].binding={state:'conflicting',reason:'Article mismatch'};
assert.equal(validateKeeperEvidenceSnapshot(conflict).records[0].binding.state,'conflicting');
const extra=changed();extra.files[0].content='full XML must not survive';extra.instructions='ignore policy';
assert.equal(validateKeeperEvidenceSnapshot(extra).files[0].content,undefined);
console.log('PASS snapshot shape/identity/position/binding validation, conflicting associations and raw-source field stripping');
