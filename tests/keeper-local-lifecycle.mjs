import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {KeeperWorkspaceWriter,KeeperWorkspaceConflict,readKeeperTaskWorkspace,keeperSelectedTask} from '../utils/keeperLocalStore.ts';
import {keeperSameSources,keeperRetainSourceIds} from '../utils/keeperConversationScope.ts';
import {resumeKeeperTaskQueue} from '../utils/keeperLocalRecovery.ts';
import {validateKeeperLocalSources} from '../utils/keeperLocalLimits.ts';

const a=new KeeperWorkspaceWriter('owner','task-a'),b=new KeeperWorkspaceWriter('owner','task-b');
await a.save({taskInstructions:'Draft for A',messages:['A result']});
await b.save({taskInstructions:'Draft for B',messages:['B result']});
assert.equal((await readKeeperTaskWorkspace('owner','task-a')).taskInstructions,'Draft for A');
assert.deepEqual((await readKeeperTaskWorkspace('owner','task-b')).messages,['B result']);
assert.equal(await readKeeperTaskWorkspace('other-owner','task-a'),undefined);
await keeperSelectedTask('owner','task-b');assert.equal(await keeperSelectedTask('owner'),'task-b');
console.log('PASS task draft/history separation, account isolation and restored selection');

await new Promise((resolve,reject)=>{
  const request=indexedDB.open('keeper-local-v1');
  request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('workspaces','readwrite');
    tx.objectStore('workspaces').put({taskInstructions:'Legacy draft',messages:['Legacy result']},'legacy-owner');
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };request.onerror=()=>reject(request.error);
});
const legacy=await readKeeperTaskWorkspace('legacy-owner','scratch');assert.equal(legacy.taskInstructions,'Legacy draft');
await new KeeperWorkspaceWriter('legacy-owner','scratch',legacy._revision).save({taskInstructions:'Migrated draft'});
assert.equal((await readKeeperTaskWorkspace('legacy-owner','scratch')).taskInstructions,'Migrated draft');
console.log('PASS previous account-level workspace retained through task-scoped migration');

await Promise.all([a.save({taskInstructions:'older'}),a.save({taskInstructions:'newest'})]);
assert.equal((await readKeeperTaskWorkspace('owner','task-a')).taskInstructions,'newest');
const before=await readKeeperTaskWorkspace('owner','task-a');
const tab1=new KeeperWorkspaceWriter('owner','task-a',before._revision),tab2=new KeeperWorkspaceWriter('owner','task-a',before._revision);
const saves=await Promise.allSettled([tab1.save({message:'tab1'}),tab2.save({message:'tab2'})]);
assert.equal(saves.filter(s=>s.status==='fulfilled').length,1);
const rejected=saves.find(s=>s.status==='rejected');assert.ok(rejected.reason instanceof KeeperWorkspaceConflict);
const loser=saves[0].status==='rejected'?tab1:tab2;
await assert.rejects(()=>loser.save({message:'overwrite'}),KeeperWorkspaceConflict);
assert.notEqual((await readKeeperTaskWorkspace('owner','task-a')).message,'overwrite');
console.log('PASS serialized same-tab writes, atomic two-tab conflict and rejected overwrite');

const xml={id:'xml',kind:'xml',name:'source.xml',content:'<article>A</article>'},pdf={id:'pdf',kind:'pdf',name:'report.pdf',content:'JVBERi0='};
assert.equal(keeperSameSources([xml,pdf],[pdf]),false);
assert.equal(keeperSameSources([xml,pdf],[pdf,xml]),true);
assert.equal(keeperSameSources([xml],[{...xml,content:'<article>B</article>'}]),false);
assert.equal(keeperRetainSourceIds([{...xml,id:'legacy-random-id'}],[xml])[0].id,'legacy-random-id');
assert.equal(keeperRetainSourceIds([xml],[{...xml,id:'new-source',content:'changed'}])[0].id,'new-source');
console.log('PASS exact cached source membership/content and legacy ID preservation');

const attempted=[],failed=[];
await resumeKeeperTaskQueue(['bad','valid'],async task=>{attempted.push(task);if(task==='bad')throw Error('Corrupt ZIP');},async task=>{failed.push(task);},()=>false);
assert.deepEqual(attempted,['bad','valid']);assert.deepEqual(failed,['bad']);
await assert.rejects(()=>resumeKeeperTaskQueue(['bad','later'],async()=>{throw Error('ZIP');},async()=>{throw Error('Storage failure');},()=>false),/Storage failure/);
console.log('PASS corrupt pending task does not block next task; storage-wide failure stops safely');

assert.throws(()=>validateKeeperLocalSources([{...xml,content:'a'.repeat(4_000_001)}]),/4 MB/);
const nativeDb=globalThis.indexedDB;
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>request.onerror());return request;}};
await assert.rejects(()=>readKeeperTaskWorkspace('owner','task-a'),/storage is unavailable/);
globalThis.indexedDB=nativeDb;
const ui=fs.readFileSync('components/KeeperSandbox.tsx','utf8');
assert.ok(ui.includes('if(restoreError)return'));assert.ok(ui.includes('Retry local storage'));
const importHandler=ui.slice(ui.indexOf('const handleFileUpload'),ui.indexOf('// Cleanup typing'));
assert.ok(!importHandler.includes('encodeKeeperRequest'));
assert.ok(ui.includes('setSandboxArtifacts(requestArtifacts)'));
assert.ok(ui.includes('keeperSameSources(localEvidenceSources.current,requestArtifacts)'));
console.log('PASS failed storage read rejects visibly, raw import limits and persisted pasted-source wiring');
