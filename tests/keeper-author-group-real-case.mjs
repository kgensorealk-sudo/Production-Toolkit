import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {processAuthorGroupRequest} from '../utils/keeperAuthorGroupEvaluation.worker.ts';

const source=process.env.KEEPER_AUTHOR_GROUP_FIXTURE;
if(!source||!fs.existsSync(source)){
 console.log('UNAVAILABLE CEJ_183175: set KEEPER_AUTHOR_GROUP_FIXTURE to the authorized local XML. 0 cases executed.');
 process.exitCode=2;
}else{
 const bytes=fs.readFileSync(source),hash=createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash,'37c11c828d66d30126638ee6be6b20039dde44441bd7afc5beebb03f7e3558e0','Real case hash mismatch; acceptance refused.');
 const response=await processAuthorGroupRequest({requestId:1,name:'CEJ_183175.xml',bytes:Uint8Array.from(bytes).buffer,instructions:''});const r=response.result;
 assert.equal(r.sourceSha256,hash);assert.equal(r.AUTHOR_GROUP_INTEGRITY,'PASS',JSON.stringify(r.findings));
 assert.deepEqual(r.authors.map(a=>a.name),['Yan Zhang','Ke Zuo','Changwei Hu','Dianyong Tang','Zhishan Su']);
 assert.equal(new Set(r.authors.flatMap(a=>a.affiliations)).size,2);assert.equal(r.authors.filter(a=>a.correspondence.length&&a.emails.length).length,2);
 assert.equal(r.checks.find(c=>c.name==='CRediT name references').status,'PASS');assert.equal(r.checks.find(c=>c.name==='Indexed names').status,'NOT_APPLICABLE');
 assert.equal(r.AUTHOR_NAME_CORRECTIONS_FOUND,0);assert.equal(r.AUTHOR_NAME_CHANGES_ALREADY_PRESENT,0);assert.equal(r.AUTHOR_NAME_CHANGES_APPLIED,0);assert.equal(r.AUTHOR_NAME_HISTORY,'NOT_DETERMINABLE');assert.deepEqual(r.AUTHOR_GROUP_HOLD,[]);assert.equal(r.MANUAL_AUTHOR_GROUP_REVIEW,'NOT_REQUIRED');
 assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'),hash);
 console.log(`PASS 1/1 hash-bound real no-action case (15 assertions); ${hash}. No manuscript writes, DTD/VTOOL checks or sign-off.`);
}
